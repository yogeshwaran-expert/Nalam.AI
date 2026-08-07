"""
Core extraction logic: sends a medical document image to Claude Vision
and returns validated structured data.
"""

from __future__ import annotations

import base64
import json
import logging
import re
from pathlib import Path
from typing import Any

import anthropic
from pydantic import TypeAdapter, ValidationError

from extraction.prompts import RETRY_PROMPT, SYSTEM_PROMPT, USER_INSTRUCTION
from extraction.schemas import ExtractionResult, LabReportResult, PrescriptionResult        

logger = logging.getLogger(__name__)

# Discriminated-union validator
_result_adapter = TypeAdapter(ExtractionResult)

# Supported image MIME types
_MEDIA_TYPES: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


class ExtractionError(Exception):
    """Raised when the extraction pipeline encounters an unrecoverable error."""


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _encode_image(image_path: str) -> tuple[str, str]:
    """Read an image file and return (base64_data, media_type).

    Raises:
        ExtractionError: If the file doesn't exist or has an unsupported extension.
    """
    path = Path(image_path)

    if not path.exists():
        raise ExtractionError(f"Image file not found: {image_path}")

    suffix = path.suffix.lower()
    media_type = _MEDIA_TYPES.get(suffix)
    if not media_type:
        raise ExtractionError(
            f"Unsupported image format '{suffix}'. "
            f"Supported: {', '.join(_MEDIA_TYPES.keys())}"
        )

    image_data = path.read_bytes()
    return base64.standard_b64encode(image_data).decode("utf-8"), media_type


def _strip_markdown_fences(text: str) -> str:
    """Remove ```json ... ``` wrappers if the model added them despite instructions."""
    # Match ```json\n...\n``` or ```\n...\n```
    pattern = r"^```(?:json)?\s*\n(.*?)\n```\s*$"
    match = re.match(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()


def _parse_and_validate(raw_text: str) -> dict[str, Any]:
    """Parse JSON text and validate against the Pydantic schema.

    Returns:
        The validated data as a plain dict.

    Raises:
        json.JSONDecodeError: If the text isn't valid JSON.
        ValidationError: If the JSON doesn't match the schema.
    """
    cleaned = _strip_markdown_fences(raw_text)
    data = json.loads(cleaned)
    validated = _result_adapter.validate_python(data)
    return validated.model_dump()


# ─── Main extraction function ───────────────────────────────────────────────


def extract_document(image_path: str) -> dict[str, Any]:
    """Extract structured data from a medical document image.

    Sends the image to Claude Vision (claude-sonnet-4-6) with a carefully
    engineered prompt, validates the response against the locked schema,
    and retries once on validation failure.

    Args:
        image_path: Path to a JPEG, PNG, WEBP, or GIF image file.

    Returns:
        A dict matching either PrescriptionResult or LabReportResult schema.

    Raises:
        ExtractionError: On file I/O errors, API failures, or unrecoverable
                         validation errors after retry.
    """
    # 1. Encode the image
    image_b64, media_type = _encode_image(image_path)

    # 2. Build the API client
    try:
        client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
    except anthropic.AuthenticationError as exc:
        raise ExtractionError(
            "Anthropic API key not set or invalid. "
            "Set the ANTHROPIC_API_KEY environment variable."
        ) from exc

    # 3. First extraction attempt
    logger.info("Sending image to Claude Vision for extraction: %s", image_path)

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": USER_INSTRUCTION,
                        },
                    ],
                }
            ],
        )
    except anthropic.APIError as exc:
        raise ExtractionError(f"Anthropic API error: {exc}") from exc

    raw_text = response.content[0].text
    logger.debug("Raw extraction response (first attempt):\n%s", raw_text)

    # 4. Parse and validate — first attempt
    try:
        return _parse_and_validate(raw_text)
    except (json.JSONDecodeError, ValidationError) as first_error:
        logger.warning(
            "First extraction attempt failed validation: %s — retrying with stricter prompt",
            first_error,
        )

    # 5. Retry with stricter prompt including the error details
    retry_message = RETRY_PROMPT.format(
        validation_error=str(first_error),
        previous_output=_strip_markdown_fences(raw_text),
    )

    try:
        retry_response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": retry_message,
                        },
                    ],
                }
            ],
        )
    except anthropic.APIError as exc:
        raise ExtractionError(f"Anthropic API error on retry: {exc}") from exc

    retry_text = retry_response.content[0].text
    logger.debug("Raw extraction response (retry):\n%s", retry_text)

    # 6. Parse and validate — retry attempt
    try:
        return _parse_and_validate(retry_text)
    except (json.JSONDecodeError, ValidationError) as retry_error:
        logger.error("Retry also failed validation: %s", retry_error)

        # Best-effort: return whatever we can parse, with warnings
        try:
            cleaned = _strip_markdown_fences(retry_text)
            best_effort = json.loads(cleaned)
            if isinstance(best_effort, dict):
                best_effort.setdefault("extraction_warnings", [])
                best_effort["extraction_warnings"].append(
                    f"Schema validation failed after retry: {retry_error}"
                )
                return best_effort
        except json.JSONDecodeError:
            pass

        raise ExtractionError(
            f"Extraction failed after retry. "
            f"First error: {first_error} | Retry error: {retry_error}"
        )


# ─── Convenience: extract from raw bytes (used by API endpoint) ─────────────


def extract_document_from_bytes(
    image_bytes: bytes, filename: str = "upload.jpg"
) -> dict[str, Any]:
    """Extract from in-memory image bytes by writing to a temp file.

    This avoids the API endpoint needing to manage temp files directly.
    """
    import tempfile

    suffix = Path(filename).suffix or ".jpg"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        return extract_document(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)
