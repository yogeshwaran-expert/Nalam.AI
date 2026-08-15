"""
Fuzzy matching of extracted drug names and lab test names against the
curated knowledge base.

Uses ``rapidfuzz`` for OCR-tolerant matching — e.g. "Metfromin" → "Metformin".
Falls back to ``difflib`` if rapidfuzz is unavailable (should not happen in
production, but avoids hard crashes during development).
"""

from __future__ import annotations

import functools
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ─── Configuration ───────────────────────────────────────────────────────────

_MATCH_THRESHOLD = 80  # Minimum fuzzy-match score (0-100) for a confident match

_KB_PATH = Path(__file__).resolve().parent / "knowledge_base.json"


# ─── Knowledge base loader ──────────────────────────────────────────────────


@functools.lru_cache(maxsize=1)
def load_knowledge_base() -> dict[str, Any]:
    """Load and cache the curated medical knowledge base.

    Returns:
        A dict with ``drugs`` and ``lab_tests`` keys.

    Raises:
        FileNotFoundError: If ``knowledge_base.json`` is missing.
        json.JSONDecodeError: If the file contains invalid JSON.
    """
    logger.info("Loading knowledge base from %s", _KB_PATH)
    with open(_KB_PATH, encoding="utf-8") as f:
        kb = json.load(f)
    logger.info(
        "Knowledge base loaded: %d drugs, %d lab tests",
        len(kb.get("drugs", [])),
        len(kb.get("lab_tests", [])),
    )
    return kb


# ─── Internal: build name→entry lookup ───────────────────────────────────────


@functools.lru_cache(maxsize=1)
def _build_drug_lookup() -> tuple[tuple[str, ...], tuple]:
    """Build a flat mapping of every drug name/alias → KB entry.

    Keys are lowercased for case-insensitive matching.
    Returns a cached result (wrapped for hashability; unwrap via _get_drug_lookup).
    """
    kb = load_knowledge_base()
    lookup: dict[str, dict[str, Any]] = {}
    for entry in kb.get("drugs", []):
        # Primary name
        lookup[entry["name"].lower()] = entry
        # Aliases
        for alias in entry.get("aliases", []):
            lookup[alias.lower()] = entry
    return lookup


@functools.lru_cache(maxsize=1)
def _build_lab_test_lookup() -> dict[str, dict[str, Any]]:
    """Build a flat mapping of every lab test name/alias → KB entry.

    Keys are lowercased for case-insensitive matching.
    """
    kb = load_knowledge_base()
    lookup: dict[str, dict[str, Any]] = {}
    for entry in kb.get("lab_tests", []):
        lookup[entry["test_name"].lower()] = entry
        for alias in entry.get("aliases", []):
            lookup[alias.lower()] = entry
    return lookup


# ─── Public API ──────────────────────────────────────────────────────────────


def match_drug(extracted_name: str) -> dict[str, Any] | None:
    """Fuzzy-match an extracted medicine name against the knowledge base.

    Handles OCR typos and slight spelling variations (e.g. "Metfromin"
    matches "Metformin").

    Args:
        extracted_name: The drug name as extracted from the document.

    Returns:
        The matched knowledge base entry dict, or ``None`` if no confident
        match was found (score below threshold).
    """
    if not extracted_name or not extracted_name.strip():
        return None

    lookup = _build_drug_lookup()
    query = extracted_name.strip().lower()

    # Exact match first (fast path)
    if query in lookup:
        return lookup[query]

    # Fuzzy match
    try:
        from rapidfuzz import process as rf_process

        candidates = list(lookup.keys())
        result = rf_process.extractOne(query, candidates)
        if result is not None:
            matched_name, score, _ = result
            if score >= _MATCH_THRESHOLD:
                logger.debug(
                    "Fuzzy matched drug '%s' → '%s' (score=%.1f)",
                    extracted_name,
                    matched_name,
                    score,
                )
                return lookup[matched_name]
            else:
                logger.debug(
                    "No confident drug match for '%s' (best: '%s', score=%.1f)",
                    extracted_name,
                    matched_name,
                    score,
                )
    except ImportError:
        # Fallback to difflib if rapidfuzz is not installed
        import difflib

        candidates = list(lookup.keys())
        matches = difflib.get_close_matches(query, candidates, n=1, cutoff=0.6)
        if matches:
            logger.debug(
                "difflib matched drug '%s' → '%s'",
                extracted_name,
                matches[0],
            )
            return lookup[matches[0]]

    return None


def match_lab_test(extracted_test_name: str) -> dict[str, Any] | None:
    """Fuzzy-match an extracted lab test name against the knowledge base.

    Handles OCR typos and common abbreviation variations.

    Args:
        extracted_test_name: The test name as extracted from the document.

    Returns:
        The matched knowledge base entry dict, or ``None`` if no confident
        match was found.
    """
    if not extracted_test_name or not extracted_test_name.strip():
        return None

    lookup = _build_lab_test_lookup()
    query = extracted_test_name.strip().lower()

    # Exact match first
    if query in lookup:
        return lookup[query]

    # Fuzzy match
    try:
        from rapidfuzz import process as rf_process

        candidates = list(lookup.keys())
        result = rf_process.extractOne(query, candidates)
        if result is not None:
            matched_name, score, _ = result
            if score >= _MATCH_THRESHOLD:
                logger.debug(
                    "Fuzzy matched lab test '%s' → '%s' (score=%.1f)",
                    extracted_test_name,
                    matched_name,
                    score,
                )
                return lookup[matched_name]
            else:
                logger.debug(
                    "No confident lab test match for '%s' (best: '%s', score=%.1f)",
                    extracted_test_name,
                    matched_name,
                    score,
                )
    except ImportError:
        import difflib

        candidates = list(lookup.keys())
        matches = difflib.get_close_matches(query, candidates, n=1, cutoff=0.6)
        if matches:
            logger.debug(
                "difflib matched lab test '%s' → '%s'",
                extracted_test_name,
                matches[0],
            )
            return lookup[matches[0]]

    return None
