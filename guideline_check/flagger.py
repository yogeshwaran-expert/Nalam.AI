"""
Core safety flagging logic.

Cross-references extracted prescriptions and lab reports against the curated
knowledge base and produces a ``flags`` array with human-readable warnings.

Key principles:
  - This module NEVER diagnoses or prescribes. All flags say "please verify
    with your doctor/pharmacist."
  - The SOURCE OF TRUTH is always ``knowledge_base.json``. No medical facts
    are invented by the model.
  - If a drug/test can't be matched, that is explicitly flagged as
    "unverified" — never silently skipped.
"""

from __future__ import annotations

import copy
import logging
import re
from typing import Any

from guideline_check.matcher import match_drug, match_lab_test
from guideline_check.schemas import SafetyFlag

logger = logging.getLogger(__name__)


# ─── Dosage parsing ──────────────────────────────────────────────────────────

# Regex to extract a numeric value and unit from dosage strings like
# "500mg", "500 mg", "0.5 g", "250 mcg", "1.5g"
_DOSAGE_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*(mg|g|mcg|ug|microgram|milligram|gram)s?\b",
    re.IGNORECASE,
)

# Conversion factors to milligrams
_UNIT_TO_MG: dict[str, float] = {
    "mg": 1.0,
    "milligram": 1.0,
    "g": 1000.0,
    "gram": 1000.0,
    "mcg": 0.001,
    "ug": 0.001,
    "microgram": 0.001,
}


def _parse_dosage_mg(dosage_str: str) -> float | None:
    """Parse a dosage string and normalise to milligrams.

    Handles formats like ``"500mg"``, ``"500 mg"``, ``"0.5 g"``,
    ``"250 mcg"``, ``"0.5g"``.

    Returns:
        The dosage in milligrams, or ``None`` if the string can't be parsed.
    """
    if not dosage_str:
        return None

    match = _DOSAGE_PATTERN.search(dosage_str)
    if not match:
        return None

    value = float(match.group(1))
    unit = match.group(2).lower()
    multiplier = _UNIT_TO_MG.get(unit)
    if multiplier is None:
        return None

    return value * multiplier


# ─── Frequency matching ─────────────────────────────────────────────────────


def _normalize_frequency(freq: str) -> str:
    """Normalize a frequency string for comparison.

    Strips whitespace, lowercases, and normalises common variants.
    """
    f = freq.strip().lower()
    # Normalise some common OCR/handwriting variants
    f = f.replace("od", "once daily").replace("bd", "twice daily")
    f = f.replace("tid", "thrice daily").replace("tds", "thrice daily")
    f = f.replace("qid", "four times daily").replace("qds", "four times daily")
    return f


def _frequency_matches(extracted_freq: str, common_freqs: list[str]) -> bool:
    """Check if an extracted frequency roughly matches any common frequency."""
    normalised = _normalize_frequency(extracted_freq)
    for common in common_freqs:
        common_norm = common.strip().lower()
        # Substring match in either direction handles most variants
        if common_norm in normalised or normalised in common_norm:
            return True
    return False


# ─── Interaction checking ────────────────────────────────────────────────────


def _check_interactions(
    matched_drugs: list[tuple[str, dict[str, Any]]],
) -> list[SafetyFlag]:
    """Cross-check all matched drugs against each other's interaction lists.

    Args:
        matched_drugs: List of (extracted_name, kb_entry) tuples.

    Returns:
        List of warning flags for detected interactions.
    """
    flags: list[SafetyFlag] = []
    seen_pairs: set[tuple[str, str]] = set()

    for i, (name_a, entry_a) in enumerate(matched_drugs):
        interactions_a = [x.lower() for x in entry_a.get("interactions", [])]

        for j, (name_b, entry_b) in enumerate(matched_drugs):
            if i >= j:
                continue

            kb_name_a = entry_a["name"]
            kb_name_b = entry_b["name"]

            # Avoid duplicate pair flags
            pair_key = tuple(sorted((kb_name_a, kb_name_b)))
            if pair_key in seen_pairs:
                continue

            interactions_b = [x.lower() for x in entry_b.get("interactions", [])]

            # Check if A is in B's interactions or B is in A's interactions
            a_in_b = kb_name_a.lower() in interactions_b
            b_in_a = kb_name_b.lower() in interactions_a

            if a_in_b or b_in_a:
                seen_pairs.add(pair_key)
                flags.append(
                    SafetyFlag(
                        severity="warning",
                        related_to=f"{kb_name_a} + {kb_name_b}",
                        message=(
                            f"{kb_name_a} and {kb_name_b} are listed as a known "
                            f"drug interaction in our reference database — please "
                            f"confirm this combination with your doctor or pharmacist."
                        ),
                        source="knowledge_base",
                    )
                )

    return flags


# ─── Prescription checker ───────────────────────────────────────────────────


def check_prescription(extracted_data: dict[str, Any]) -> dict[str, Any]:
    """Cross-reference a prescription against the knowledge base.

    For each medicine:
      1. Fuzzy-match against the KB.
      2. If no match → caution flag (unverified).
      3. Parse dosage → compare against safe range.
      4. Check frequency against common frequencies.
      5. Cross-check all medicines for interactions.

    Args:
        extracted_data: Dict matching Teammate 1's PrescriptionResult schema.

    Returns:
        A copy of the original data with an added ``flags`` list.
    """
    result = copy.deepcopy(extracted_data)
    flags: list[SafetyFlag] = []
    matched_drugs: list[tuple[str, dict[str, Any]]] = []

    medicines = result.get("medicines", [])

    for med in medicines:
        name = med.get("name", "")
        dosage_str = med.get("dosage", "")
        frequency = med.get("frequency", "")

        # 1. Try to match against KB
        kb_entry = match_drug(name)

        if kb_entry is None:
            flags.append(
                SafetyFlag(
                    severity="caution",
                    related_to=name,
                    message=(
                        f"Could not verify '{name}' against our reference "
                        f"database — please confirm with your doctor or pharmacist."
                    ),
                    source="unverified",
                )
            )
            continue

        matched_drugs.append((name, kb_entry))
        kb_name = kb_entry["name"]

        # 2. Parse and check dosage
        dosage_mg = _parse_dosage_mg(dosage_str)

        if dosage_mg is None:
            flags.append(
                SafetyFlag(
                    severity="caution",
                    related_to=kb_name,
                    message=(
                        f"Could not parse dosage '{dosage_str}' for {kb_name} — "
                        f"unable to verify against reference range. Please confirm "
                        f"with your doctor or pharmacist."
                    ),
                    source="knowledge_base",
                )
            )
        else:
            dose_range = kb_entry.get("common_dosage_range_mg", [])
            max_daily = kb_entry.get("max_daily_dose_mg")

            if len(dose_range) == 2:
                low, high = dose_range

                if dosage_mg < low:
                    flags.append(
                        SafetyFlag(
                            severity="caution",
                            related_to=kb_name,
                            message=(
                                f"Dosage of {dosage_str} ({dosage_mg:.0f}mg) "
                                f"is below the typical range of {low:.0f}–"
                                f"{high:.0f}mg for {kb_name} — please confirm "
                                f"with your doctor."
                            ),
                            source="knowledge_base",
                        )
                    )
                elif max_daily is not None and dosage_mg > max_daily:
                    flags.append(
                        SafetyFlag(
                            severity="warning",
                            related_to=kb_name,
                            message=(
                                f"Dosage of {dosage_str} ({dosage_mg:.0f}mg) "
                                f"exceeds the typical maximum daily dose of "
                                f"{max_daily:.0f}mg for {kb_name} — please "
                                f"confirm with your doctor."
                            ),
                            source="knowledge_base",
                        )
                    )
                elif dosage_mg > high:
                    flags.append(
                        SafetyFlag(
                            severity="caution",
                            related_to=kb_name,
                            message=(
                                f"Dosage of {dosage_str} ({dosage_mg:.0f}mg) "
                                f"is above the typical range of {low:.0f}–"
                                f"{high:.0f}mg for {kb_name} — please confirm "
                                f"with your doctor."
                            ),
                            source="knowledge_base",
                        )
                    )

        # 3. Check frequency
        common_freqs = kb_entry.get("common_frequencies", [])
        if frequency and common_freqs and not _frequency_matches(frequency, common_freqs):
            expected_str = ", ".join(common_freqs)
            flags.append(
                SafetyFlag(
                    severity="caution",
                    related_to=kb_name,
                    message=(
                        f"Frequency '{frequency}' for {kb_name} is unusual — "
                        f"typically prescribed as {expected_str}. Please confirm "
                        f"with your doctor."
                    ),
                    source="knowledge_base",
                )
            )

    # 4. Cross-check interactions between ALL matched drugs
    interaction_flags = _check_interactions(matched_drugs)
    flags.extend(interaction_flags)

    result["flags"] = [f.model_dump() for f in flags]
    return result


# ─── Lab report checker ─────────────────────────────────────────────────────


def check_lab_report(extracted_data: dict[str, Any]) -> dict[str, Any]:
    """Cross-reference a lab report against the knowledge base.

    For each test:
      1. Fuzzy-match against the KB.
      2. If no match → caution flag (unverified).
      3. Parse value → compare against normal range.
      4. Classify severity based on distance from critical thresholds.

    Uses the *widest range* across male/female (union of both) since
    Teammate 1's schema does not include patient gender.

    Args:
        extracted_data: Dict matching Teammate 1's LabReportResult schema.

    Returns:
        A copy of the original data with an added ``flags`` list.
    """
    result = copy.deepcopy(extracted_data)
    flags: list[SafetyFlag] = []

    tests = result.get("tests", [])

    for test in tests:
        test_name = test.get("test_name", "")
        value_str = test.get("value", "")

        # 1. Match against KB
        kb_entry = match_lab_test(test_name)

        if kb_entry is None:
            flags.append(
                SafetyFlag(
                    severity="caution",
                    related_to=test_name,
                    message=(
                        f"Could not verify '{test_name}' against our reference "
                        f"database — please confirm this result with your doctor."
                    ),
                    source="unverified",
                )
            )
            continue

        kb_name = kb_entry["test_name"]

        # 2. Parse numeric value
        numeric_value = _parse_numeric_value(value_str)
        if numeric_value is None:
            flags.append(
                SafetyFlag(
                    severity="caution",
                    related_to=kb_name,
                    message=(
                        f"Could not parse value '{value_str}' for {kb_name} — "
                        f"unable to compare against reference range. Please "
                        f"confirm with your doctor."
                    ),
                    source="knowledge_base",
                )
            )
            continue

        # 3. Determine the widest normal range (union of male/female)
        range_male = kb_entry.get("normal_range_male", [])
        range_female = kb_entry.get("normal_range_female", [])

        if len(range_male) == 2 and len(range_female) == 2:
            normal_low = min(range_male[0], range_female[0])
            normal_high = max(range_male[1], range_female[1])
        elif len(range_male) == 2:
            normal_low, normal_high = range_male
        elif len(range_female) == 2:
            normal_low, normal_high = range_female
        else:
            continue  # No range data available

        critical_low = kb_entry.get("critical_low")
        critical_high = kb_entry.get("critical_high")
        unit = kb_entry.get("unit", "")

        # 4. Compare and flag
        if normal_low <= numeric_value <= normal_high:
            # Within normal range — no flag needed (skip "info" for brevity)
            pass
        elif critical_low is not None and numeric_value < critical_low:
            flags.append(
                SafetyFlag(
                    severity="warning",
                    related_to=kb_name,
                    message=(
                        f"{kb_name} value of {value_str} ({numeric_value} {unit}) "
                        f"is significantly below the normal range of "
                        f"{normal_low}–{normal_high} {unit} and below the critical "
                        f"threshold of {critical_low} {unit} — please consult your "
                        f"doctor promptly."
                    ),
                    source="knowledge_base",
                )
            )
        elif critical_high is not None and numeric_value > critical_high:
            flags.append(
                SafetyFlag(
                    severity="warning",
                    related_to=kb_name,
                    message=(
                        f"{kb_name} value of {value_str} ({numeric_value} {unit}) "
                        f"is significantly above the normal range of "
                        f"{normal_low}–{normal_high} {unit} and above the critical "
                        f"threshold of {critical_high} {unit} — please consult "
                        f"your doctor promptly."
                    ),
                    source="knowledge_base",
                )
            )
        elif numeric_value < normal_low:
            flags.append(
                SafetyFlag(
                    severity="caution",
                    related_to=kb_name,
                    message=(
                        f"{kb_name} value of {value_str} ({numeric_value} {unit}) "
                        f"is mildly below the normal range of "
                        f"{normal_low}–{normal_high} {unit} — please verify "
                        f"with your doctor."
                    ),
                    source="knowledge_base",
                )
            )
        elif numeric_value > normal_high:
            flags.append(
                SafetyFlag(
                    severity="caution",
                    related_to=kb_name,
                    message=(
                        f"{kb_name} value of {value_str} ({numeric_value} {unit}) "
                        f"is mildly above the normal range of "
                        f"{normal_low}–{normal_high} {unit} — please verify "
                        f"with your doctor."
                    ),
                    source="knowledge_base",
                )
            )

    result["flags"] = [f.model_dump() for f in flags]
    return result


# ─── Value parser ────────────────────────────────────────────────────────────


def _parse_numeric_value(value_str: str) -> float | None:
    """Extract a numeric value from a lab result string.

    Handles formats like ``"14.5"``, ``"14.5 g/dL"``, ``"5,200"``,
    ``"200H"`` (high flag), ``">100"``, ``"<0.1"``.

    Returns:
        The numeric value as a float, or ``None`` if unparseable.
    """
    if not value_str:
        return None

    # Strip common suffixes like H, L, *, and units at the end
    cleaned = value_str.strip()
    # Remove leading < or >
    cleaned = cleaned.lstrip("<>")
    # Remove trailing non-numeric characters (H, L, *, etc.) but keep decimal points
    cleaned = re.sub(r"[a-zA-Zμ/*%]+$", "", cleaned).strip()
    # Remove commas (e.g. "5,200" → "5200")
    cleaned = cleaned.replace(",", "")

    try:
        return float(cleaned)
    except ValueError:
        return None


# ─── Public router ───────────────────────────────────────────────────────────


def check_safety(extracted_data: dict[str, Any]) -> dict[str, Any]:
    """Route extracted data to the appropriate checker.

    Dispatches based on ``document_type``:
      - ``"prescription"`` → :func:`check_prescription`
      - ``"lab_report"`` → :func:`check_lab_report`

    Args:
        extracted_data: Dict matching Teammate 1's extraction output.

    Returns:
        A copy of the data with an added ``flags`` list.
    """
    doc_type = extracted_data.get("document_type", "")

    if doc_type == "prescription":
        return check_prescription(extracted_data)
    elif doc_type == "lab_report":
        return check_lab_report(extracted_data)
    else:
        # Unknown document type — return as-is with a single flag
        result = copy.deepcopy(extracted_data)
        result["flags"] = [
            SafetyFlag(
                severity="caution",
                related_to="document",
                message=(
                    f"Unrecognised document type '{doc_type}' — safety checks "
                    f"could not be performed. Please verify all values manually."
                ),
                source="unverified",
            ).model_dump()
        ]
        return result
