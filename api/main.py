"""
Nalam AI — FastAPI server.

Exposes a single POST /extract endpoint that teammates (safety-check layer,
voice layer, frontend) call with a medical document image.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from doctor_note.note_formatter import generate_doctor_note
from extraction.schemas import ExtractionResponse
from extraction.vlm_extractor import ExtractionError, extract_document_from_bytes
from guideline_check.flagger import check_safety
from guideline_check.schemas import SafetyFlag

# ─── Setup ───────────────────────────────────────────────────────────────────

# Load .env before anything reads env vars
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# Allowed upload content types
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
}


# ─── App lifecycle ───────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown events."""
    logger.info("🚀 Nalam AI extraction server starting")
    yield
    logger.info("Nalam AI extraction server shutting down")


# ─── FastAPI app ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Nalam AI — Document Extraction",
    description=(
        "Upload a medical document image (prescription or lab report) "
        "and receive structured JSON + a doctor-facing clinical summary."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow teammates' frontends to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Endpoints ───────────────────────────────────────────────────────────────


@app.get("/health")
async def health_check():
    """Basic health check for monitoring and teammate integration tests."""
    return {"status": "healthy"}


@app.post("/extract", response_model=ExtractionResponse)
async def extract_endpoint(file: UploadFile = File(...)):
    """Extract structured data from a medical document image.

    Accepts: JPEG, PNG, WEBP, or GIF image.

    Returns:
        - structured_data: The locked JSON schema (prescription or lab report)
        - doctor_note: A plain-text clinical summary
        - extraction_warnings: Top-level warnings from the extraction
    """
    # Validate content type
    content_type = file.content_type or ""
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type: '{content_type}'. "
                f"Accepted types: {', '.join(sorted(_ALLOWED_CONTENT_TYPES))}"
            ),
        )

    # Read the uploaded image
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    filename = file.filename or "upload.jpg"

    # Run extraction
    logger.info("Processing uploaded file: %s (%d bytes)", filename, len(image_bytes))

    try:
        structured_data = await asyncio.to_thread(
            extract_document_from_bytes, image_bytes, filename
        )
    except ExtractionError as exc:
        logger.error("Extraction failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    # Generate doctor note
    doctor_note = generate_doctor_note(structured_data)

    # Run safety checks against curated knowledge base
    flagged_data = check_safety(structured_data)
    flags = flagged_data.get("flags", [])
    safety_flags = [SafetyFlag(**f) if isinstance(f, dict) else f for f in flags]

    # Build response
    return ExtractionResponse(
        structured_data=structured_data,
        doctor_note=doctor_note,
        extraction_warnings=structured_data.get("extraction_warnings", []),
        flags=safety_flags,
    )


@app.post("/check-safety")
async def check_safety_endpoint(payload: dict):
    """Cross-reference extracted medical data against the curated knowledge base.

    Accepts Teammate 1's extraction JSON (prescription or lab report) and
    returns the same data with a ``flags`` array added, containing any
    dosage anomalies, drug interactions, or out-of-range lab values found.

    This endpoint uses ONLY the curated knowledge base as its source of
    truth — no LLM-generated medical facts.
    """
    logger.info(
        "Running safety check on document_type=%s",
        payload.get("document_type", "unknown"),
    )
    result = check_safety(payload)
    return result
