"""
Doctor-facing clinical summary formatter.

Takes the structured JSON extracted from a medical document and produces
a concise, scannable plain-text note that a doctor can read in 5 seconds.
"""

from __future__ import annotations

import re
from typing import Any


# ─── Constants ───────────────────────────────────────────────────────────────

_DIVIDER = "══════════════════════════════════════════════════════"
_THIN_DIVIDER = "──────────────────────────────────────────────────────"
_LOW_CONFIDENCE_THRESHOLD = 0.5


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _safe(value: Any, fallback: str = "N/A") -> str:
    """Return the value as a string, or fallback if None/empty."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return fallback
    return str(value).strip()


def _is_out_of_range(value_str: str, ref_range_str: str | None) -> bool | None:
    """Try to determine if a lab value is outside its reference range.

    Returns True/False if parseable, None if we can't determine.
    """
    if not ref_range_str:
        return None

    try:
        # Clean the value — strip non-numeric suffixes like 'L', 'H'
        clean_val = re.sub(r"[^\d.]", "", value_str)
        if not clean_val:
            return None
        val = float(clean_val)

        # Try to parse range like "12.0-16.0" or "4,000-11,000"
        range_match = re.match(
            r"(\d[\d,.]*)\s*[-–—to]\s*(\d[\d,.]*)", ref_range_str
        )
        if not range_match:
            return None

        low = float(range_match.group(1).replace(",", ""))
        high = float(range_match.group(2).replace(",", ""))
        return val < low or val > high

    except (ValueError, AttributeError):
        return None


# ─── Prescription formatter ─────────────────────────────────────────────────


def _format_prescription(data: dict[str, Any]) -> str:
    """Format a prescription extraction result as a clinical summary."""
    lines: list[str] = []

    lines.append(_DIVIDER)
    lines.append("  CLINICAL SUMMARY — PRESCRIPTION")
    lines.append(_DIVIDER)
    lines.append(f"Patient : {_safe(data.get('patient_name'))}")
    lines.append(f"Doctor  : {_safe(data.get('doctor_name'))}")
    lines.append(f"Date    : {_safe(data.get('date'))}")
    lines.append("")

    medicines = data.get("medicines", [])
    if medicines:
        lines.append("MEDICATIONS:")
        for i, med in enumerate(medicines, 1):
            name = _safe(med.get("name"), "Unknown")
            dosage = _safe(med.get("dosage"), "?")
            frequency = _safe(med.get("frequency"), "?")
            duration = _safe(med.get("duration"), "?")
            instructions = _safe(med.get("instructions"), "")
            confidence = med.get("confidence", 1.0)

            # Build the one-liner
            parts = [f"{name} {dosage}", frequency, duration]
            if instructions and instructions != "N/A":
                parts.append(instructions)
            med_line = " — ".join(parts)

            # Flag low confidence
            flag = "  ⚠ LOW CONFIDENCE" if confidence < _LOW_CONFIDENCE_THRESHOLD else ""
            lines.append(f"  {i}. {med_line}{flag}")
    else:
        lines.append("MEDICATIONS: None extracted")

    # Raw notes
    raw_notes = data.get("raw_notes")
    if raw_notes:
        lines.append("")
        lines.append(f"NOTES: {raw_notes}")

    # Warnings
    lines.append("")
    warnings = data.get("extraction_warnings", [])
    if warnings:
        lines.append("FLAGS:")
        for w in warnings:
            lines.append(f"  • {w}")
    else:
        lines.append("FLAGS: None")

    lines.append(_DIVIDER)
    return "\n".join(lines)


# ─── Lab report formatter ───────────────────────────────────────────────────


def _format_lab_report(data: dict[str, Any]) -> str:
    """Format a lab report extraction result as a clinical summary."""
    lines: list[str] = []

    lines.append(_DIVIDER)
    lines.append("  CLINICAL SUMMARY — LAB REPORT")
    lines.append(_DIVIDER)
    lines.append(f"Patient : {_safe(data.get('patient_name'))}")
    lines.append(f"Date    : {_safe(data.get('date'))}")
    lines.append("")

    tests = data.get("tests", [])
    if tests:
        lines.append("TEST RESULTS:")

        # Calculate column widths for alignment
        headers = ("Test", "Value", "Unit", "Reference")
        col_widths = [len(h) for h in headers]
        rows: list[tuple[str, str, str, str, str]] = []

        for t in tests:
            test_name = _safe(t.get("test_name"), "Unknown")
            value = _safe(t.get("value"), "?")
            unit = _safe(t.get("unit"), "")
            ref_range = _safe(t.get("reference_range"), "—")
            confidence = t.get("confidence", 1.0)

            # Build flags
            flags: list[str] = []
            out_of_range = _is_out_of_range(value, t.get("reference_range"))
            if out_of_range:
                flags.append("OUT OF RANGE")
            if confidence < _LOW_CONFIDENCE_THRESHOLD:
                flags.append("LOW CONFIDENCE")
            flag_str = "  ⚠ " + ", ".join(flags) if flags else ""

            rows.append((test_name, value, unit, ref_range, flag_str))

            # Update column widths
            col_widths[0] = max(col_widths[0], len(test_name))
            col_widths[1] = max(col_widths[1], len(value))
            col_widths[2] = max(col_widths[2], len(unit))
            col_widths[3] = max(col_widths[3], len(ref_range))

        # Print header
        header_line = (
            f"  {headers[0]:<{col_widths[0]}}  "
            f"{headers[1]:<{col_widths[1]}}  "
            f"{headers[2]:<{col_widths[2]}}  "
            f"{headers[3]:<{col_widths[3]}}"
        )
        lines.append(header_line)
        total_width = sum(col_widths) + 8  # spacing
        lines.append("  " + "─" * total_width)

        # Print rows
        for test_name, value, unit, ref_range, flag_str in rows:
            row_line = (
                f"  {test_name:<{col_widths[0]}}  "
                f"{value:<{col_widths[1]}}  "
                f"{unit:<{col_widths[2]}}  "
                f"{ref_range:<{col_widths[3]}}"
                f"{flag_str}"
            )
            lines.append(row_line)
    else:
        lines.append("TEST RESULTS: None extracted")

    # Warnings
    lines.append("")
    warnings = data.get("extraction_warnings", [])
    if warnings:
        lines.append("FLAGS:")
        for w in warnings:
            lines.append(f"  • {w}")
    else:
        lines.append("FLAGS: None")

    lines.append(_DIVIDER)
    return "\n".join(lines)


# ─── Public API ──────────────────────────────────────────────────────────────


def generate_doctor_note(extracted_data: dict[str, Any]) -> str:
    """Generate a concise, scannable clinical summary from extracted data.

    Args:
        extracted_data: A dict matching PrescriptionResult or LabReportResult schema.

    Returns:
        A formatted plain-text clinical summary string.
    """
    doc_type = extracted_data.get("document_type", "unknown")

    if doc_type == "prescription":
        return _format_prescription(extracted_data)
    elif doc_type == "lab_report":
        return _format_lab_report(extracted_data)
    else:
        return (
            f"{_DIVIDER}\n"
            f"  CLINICAL SUMMARY — UNKNOWN DOCUMENT TYPE\n"
            f"{_DIVIDER}\n"
            f"Document type '{doc_type}' not recognised.\n"
            f"Raw data: {extracted_data}\n"
            f"{_DIVIDER}"
        )
