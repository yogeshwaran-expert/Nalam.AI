"""
Test harness for the Nalam AI safety flagging module.

Tests the guideline cross-reference engine against planted anomalies
to prove the flagging logic catches real issues without over-flagging
normal values.

Usage:
    python -m pytest tests/test_flagger.py -v
    python -m tests.test_flagger
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root is on sys.path when run as a module
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from guideline_check.flagger import (
    _convert_to_reference_unit,
    _doses_per_day,
    _parse_dosage_mg,
    _parse_numeric_value,
    check_lab_report,
    check_prescription,
    check_safety,
)
from guideline_check.matcher import match_drug, match_lab_test


# ─── Helper to build test data ──────────────────────────────────────────────


def _make_prescription(*medicines: dict) -> dict:
    """Build a minimal prescription payload matching Teammate 1's schema."""
    return {
        "document_type": "prescription",
        "patient_name": "Test Patient",
        "doctor_name": "Dr. Test",
        "date": "2026-07-28",
        "medicines": list(medicines),
        "raw_notes": None,
        "extraction_warnings": [],
    }


def _make_medicine(
    name: str = "Metformin",
    dosage: str = "500mg",
    frequency: str = "twice daily",
    duration: str = "30 days",
    instructions: str = "after food",
    confidence: float = 0.95,
) -> dict:
    """Build a single medicine entry."""
    return {
        "name": name,
        "dosage": dosage,
        "frequency": frequency,
        "duration": duration,
        "instructions": instructions,
        "confidence": confidence,
    }


def _make_lab_report(*tests: dict) -> dict:
    """Build a minimal lab report payload matching Teammate 1's schema."""
    return {
        "document_type": "lab_report",
        "patient_name": "Test Patient",
        "date": "2026-07-28",
        "tests": list(tests),
        "extraction_warnings": [],
    }


def _make_test(
    test_name: str = "Hemoglobin",
    value: str = "14.5",
    unit: str = "g/dL",
    reference_range: str | None = "13.0-17.0",
    confidence: float = 0.95,
) -> dict:
    """Build a single lab test result."""
    return {
        "test_name": test_name,
        "value": value,
        "unit": unit,
        "reference_range": reference_range,
        "confidence": confidence,
    }


def _get_flags(result: dict) -> list[dict]:
    """Extract the flags array from a check result."""
    return result.get("flags", [])


def _has_flag_with(
    flags: list[dict], severity: str | None = None, related_to: str | None = None
) -> bool:
    """Check if any flag matches the given criteria."""
    for f in flags:
        if severity and f.get("severity") != severity:
            continue
        if related_to and related_to.lower() not in f.get("related_to", "").lower():
            continue
        return True
    return False


# ═══════════════════════════════════════════════════════════════════════════
#  DOSAGE PARSER TESTS
# ═══════════════════════════════════════════════════════════════════════════


def test_parse_dosage_standard():
    """'500mg' → 500.0"""
    assert _parse_dosage_mg("500mg") == 500.0


def test_parse_dosage_with_space():
    """'500 mg' → 500.0"""
    assert _parse_dosage_mg("500 mg") == 500.0


def test_parse_dosage_grams():
    """'0.5 g' → 500.0"""
    assert _parse_dosage_mg("0.5 g") == 500.0


def test_parse_dosage_micrograms():
    """'250 mcg' → 0.25"""
    assert _parse_dosage_mg("250 mcg") == 0.25


def test_parse_dosage_unparseable():
    """'two tablets' → None"""
    assert _parse_dosage_mg("two tablets") is None


def test_parse_dosage_empty():
    """Empty string → None"""
    assert _parse_dosage_mg("") is None


def test_daily_dose_multiplier_for_common_frequency():
    assert _doses_per_day("BD") == 2.0
    assert _doses_per_day("every 8 hours") == 3.0
    assert _doses_per_day("as needed") is None


def test_supported_lab_unit_conversion():
    assert _convert_to_reference_unit(145, "g/L", "g/dL") == 14.5
    assert _convert_to_reference_unit(14.5, "mmol/L", "g/dL") is None


# ═══════════════════════════════════════════════════════════════════════════
#  VALUE PARSER TESTS
# ═══════════════════════════════════════════════════════════════════════════


def test_parse_numeric_simple():
    """'14.5' → 14.5"""
    assert _parse_numeric_value("14.5") == 14.5


def test_parse_numeric_with_unit():
    """'14.5 g/dL' → 14.5"""
    assert _parse_numeric_value("14.5 g/dL") == 14.5


def test_parse_numeric_with_flag():
    """'200H' → 200.0"""
    assert _parse_numeric_value("200H") == 200.0


def test_parse_numeric_with_comma():
    """'5,200' → 5200.0"""
    assert _parse_numeric_value("5,200") == 5200.0


def test_parse_numeric_empty():
    """Empty → None"""
    assert _parse_numeric_value("") is None


# ═══════════════════════════════════════════════════════════════════════════
#  MATCHER TESTS
# ═══════════════════════════════════════════════════════════════════════════


def test_match_drug_exact():
    """Exact name 'Metformin' matches."""
    entry = match_drug("Metformin")
    assert entry is not None
    assert entry["name"] == "Metformin"


def test_match_drug_alias():
    """Alias 'Crocin' matches Paracetamol."""
    entry = match_drug("Crocin")
    assert entry is not None
    assert entry["name"] == "Paracetamol"


def test_match_drug_ocr_typo():
    """OCR typo 'Metfromin' still matches Metformin."""
    entry = match_drug("Metfromin")
    assert entry is not None
    assert entry["name"] == "Metformin"


def test_match_drug_case_insensitive():
    """Case-insensitive: 'PARACETAMOL' matches."""
    entry = match_drug("PARACETAMOL")
    assert entry is not None
    assert entry["name"] == "Paracetamol"


def test_match_drug_no_match():
    """Unknown drug returns None."""
    assert match_drug("Xyzolam") is None


def test_match_lab_test_exact():
    """Exact name 'Hemoglobin' matches."""
    entry = match_lab_test("Hemoglobin")
    assert entry is not None
    assert entry["test_name"] == "Hemoglobin"


def test_match_lab_test_alias():
    """Alias 'FBS' matches Blood Glucose (Fasting)."""
    entry = match_lab_test("FBS")
    assert entry is not None
    assert entry["test_name"] == "Blood Glucose (Fasting)"


def test_match_lab_test_no_match():
    """Unknown test returns None."""
    assert match_lab_test("Zeta Globulin") is None


# ═══════════════════════════════════════════════════════════════════════════
#  PRESCRIPTION FLAGGING TESTS
# ═══════════════════════════════════════════════════════════════════════════


def test_normal_prescription():
    """Normal Metformin 500mg twice daily → zero flags."""
    data = _make_prescription(
        _make_medicine("Metformin", "500mg", "twice daily")
    )
    result = check_prescription(data)
    flags = _get_flags(result)
    assert len(flags) == 0, f"Expected 0 flags, got {len(flags)}: {flags}"


def test_high_dosage_warning():
    """Metformin 3000mg → warning flag about exceeding max daily dose."""
    data = _make_prescription(
        _make_medicine("Metformin", "3000mg", "once daily")
    )
    result = check_prescription(data)
    flags = _get_flags(result)
    assert _has_flag_with(flags, severity="warning", related_to="Metformin"), \
        f"Expected warning for Metformin overdose, got: {flags}"


def test_low_dosage_caution():
    """Paracetamol 50mg → caution flag about below typical range."""
    data = _make_prescription(
        _make_medicine("Paracetamol", "50mg", "thrice daily")
    )
    result = check_prescription(data)
    flags = _get_flags(result)
    assert _has_flag_with(flags, severity="caution", related_to="Paracetamol"), \
        f"Expected caution for low Paracetamol dose, got: {flags}"


def test_drug_interaction_warning():
    """Aspirin + Clopidogrel → warning flag for known interaction."""
    data = _make_prescription(
        _make_medicine("Aspirin", "75mg", "once daily"),
        _make_medicine("Clopidogrel", "75mg", "once daily"),
    )
    result = check_prescription(data)
    flags = _get_flags(result)
    interaction_flags = [
        f for f in flags
        if f.get("severity") == "warning"
        and "Aspirin" in f.get("related_to", "")
        and "Clopidogrel" in f.get("related_to", "")
    ]
    assert len(interaction_flags) >= 1, \
        f"Expected interaction warning for Aspirin+Clopidogrel, got: {flags}"


def test_unknown_drug_caution():
    """Unknown 'Xyzolam 10mg' → caution flag about unverified drug."""
    data = _make_prescription(
        _make_medicine("Xyzolam", "10mg", "once daily")
    )
    result = check_prescription(data)
    flags = _get_flags(result)
    assert _has_flag_with(flags, severity="caution", related_to="Xyzolam"), \
        f"Expected caution for unknown drug, got: {flags}"
    # Check the message mentions the KB limitation
    unverified = [f for f in flags if f.get("source") == "unverified"]
    assert len(unverified) >= 1


def test_ocr_typo_no_false_flag():
    """OCR typo 'Metfromin 500mg' → matched correctly, no 'unverified' flag."""
    data = _make_prescription(
        _make_medicine("Metfromin", "500mg", "twice daily")
    )
    result = check_prescription(data)
    flags = _get_flags(result)
    unverified = [f for f in flags if f.get("source") == "unverified"]
    assert len(unverified) == 0, \
        f"OCR typo 'Metfromin' should have matched, but got unverified flag: {flags}"


def test_unusual_frequency_caution():
    """Amoxicillin 'four times daily' → caution about unusual frequency."""
    data = _make_prescription(
        _make_medicine("Amoxicillin", "500mg", "four times daily")
    )
    result = check_prescription(data)
    flags = _get_flags(result)
    freq_flags = [
        f for f in flags
        if "frequency" in f.get("message", "").lower()
    ]
    assert len(freq_flags) >= 1, \
        f"Expected frequency caution for Amoxicillin, got: {flags}"


def test_unparseable_dosage_caution():
    """'two tablets' → caution about unable to verify dosage."""
    data = _make_prescription(
        _make_medicine("Metformin", "two tablets", "twice daily")
    )
    result = check_prescription(data)
    flags = _get_flags(result)
    parse_flags = [
        f for f in flags
        if "parse" in f.get("message", "").lower()
        or "could not parse" in f.get("message", "").lower()
    ]
    assert len(parse_flags) >= 1, \
        f"Expected dosage parsing caution, got: {flags}"


def test_multiple_interactions():
    """Three-drug combo with two interaction pairs → two separate flags."""
    # Aspirin ↔ Clopidogrel is a known interaction
    # Clopidogrel ↔ Omeprazole is a known interaction
    data = _make_prescription(
        _make_medicine("Aspirin", "75mg", "once daily"),
        _make_medicine("Clopidogrel", "75mg", "once daily"),
        _make_medicine("Omeprazole", "20mg", "once daily"),
    )
    result = check_prescription(data)
    flags = _get_flags(result)
    interaction_warnings = [
        f for f in flags if f.get("severity") == "warning"
        and "interaction" in f.get("message", "").lower()
    ]
    assert len(interaction_warnings) >= 2, \
        f"Expected at least 2 interaction warnings, got {len(interaction_warnings)}: {flags}"


def test_original_data_preserved():
    """Original extraction data is preserved — flags are additive."""
    med = _make_medicine("Metformin", "500mg", "twice daily")
    data = _make_prescription(med)
    result = check_prescription(data)
    assert result["document_type"] == "prescription"
    assert result["patient_name"] == "Test Patient"
    assert len(result["medicines"]) == 1
    assert result["medicines"][0]["name"] == "Metformin"


# ═══════════════════════════════════════════════════════════════════════════
#  LAB REPORT FLAGGING TESTS
# ═══════════════════════════════════════════════════════════════════════════


def test_normal_lab_report():
    """Hemoglobin 14.5 g/dL → zero flags (within normal range)."""
    data = _make_lab_report(
        _make_test("Hemoglobin", "14.5", "g/dL")
    )
    result = check_lab_report(data)
    flags = _get_flags(result)
    assert len(flags) == 0, f"Expected 0 flags for normal Hb, got: {flags}"


def test_mildly_abnormal_lab_caution():
    """Hemoglobin 11.0 g/dL → caution flag (below normal but above critical)."""
    data = _make_lab_report(
        _make_test("Hemoglobin", "11.0", "g/dL")
    )
    result = check_lab_report(data)
    flags = _get_flags(result)
    assert _has_flag_with(flags, severity="caution", related_to="Hemoglobin"), \
        f"Expected caution for mildly low Hb, got: {flags}"


def test_critically_abnormal_lab_warning():
    """Hemoglobin 5.0 g/dL → warning flag (below critical threshold)."""
    data = _make_lab_report(
        _make_test("Hemoglobin", "5.0", "g/dL")
    )
    result = check_lab_report(data)
    flags = _get_flags(result)
    assert _has_flag_with(flags, severity="warning", related_to="Hemoglobin"), \
        f"Expected warning for critically low Hb, got: {flags}"


def test_high_lab_value_caution():
    """Blood Glucose Fasting 130 mg/dL → caution (above normal, below critical)."""
    data = _make_lab_report(
        _make_test("Blood Glucose (Fasting)", "130", "mg/dL")
    )
    result = check_lab_report(data)
    flags = _get_flags(result)
    assert _has_flag_with(flags, severity="caution"), \
        f"Expected caution for elevated fasting glucose, got: {flags}"


def test_critically_high_lab_warning():
    """Blood Glucose Fasting 450 mg/dL → warning (above critical)."""
    data = _make_lab_report(
        _make_test("Blood Glucose (Fasting)", "450", "mg/dL")
    )
    result = check_lab_report(data)
    flags = _get_flags(result)
    assert _has_flag_with(flags, severity="warning"), \
        f"Expected warning for critically high glucose, got: {flags}"


def test_lab_unit_mismatch_is_not_compared_as_normal():
    data = _make_lab_report(_make_test("Hemoglobin", "14.5", "mmol/L"))
    result = check_lab_report(data)
    flags = _get_flags(result)
    assert _has_flag_with(flags, severity="caution", related_to="Hemoglobin")


def test_lab_unit_conversion_is_compared_in_reference_unit():
    data = _make_lab_report(_make_test("Hemoglobin", "145", "g/L"))
    result = check_lab_report(data)
    assert _get_flags(result) == []


def test_unknown_lab_test_caution():
    """'Zeta Globulin' → caution flag: not in reference DB."""
    data = _make_lab_report(
        _make_test("Zeta Globulin", "3.5", "g/dL")
    )
    result = check_lab_report(data)
    flags = _get_flags(result)
    assert _has_flag_with(flags, severity="caution", related_to="Zeta Globulin"), \
        f"Expected caution for unknown test, got: {flags}"


def test_lab_alias_matching():
    """'FBS' alias matches 'Blood Glucose (Fasting)' — value 95 → no flag."""
    data = _make_lab_report(
        _make_test("FBS", "95", "mg/dL")
    )
    result = check_lab_report(data)
    flags = _get_flags(result)
    assert len(flags) == 0, f"Expected 0 flags for normal FBS, got: {flags}"


# ═══════════════════════════════════════════════════════════════════════════
#  ROUTER TESTS
# ═══════════════════════════════════════════════════════════════════════════


def test_check_safety_routes_prescription():
    """check_safety routes prescriptions correctly."""
    data = _make_prescription(_make_medicine("Metformin", "500mg", "twice daily"))
    result = check_safety(data)
    assert "flags" in result


def test_daily_dose_above_maximum_is_a_warning():
    data = _make_prescription(
        _make_medicine("Paracetamol", "1000mg", "every 4 hours")
    )
    result = check_prescription(data)
    assert _has_flag_with(result["flags"], severity="warning", related_to="Paracetamol")


def test_check_safety_routes_lab_report():
    """check_safety routes lab reports correctly."""
    data = _make_lab_report(_make_test("Hemoglobin", "14.5", "g/dL"))
    result = check_safety(data)
    assert "flags" in result


def test_check_safety_unknown_document_type():
    """Unknown document type → caution flag."""
    data = {"document_type": "x_ray", "findings": "normal"}
    result = check_safety(data)
    flags = _get_flags(result)
    assert len(flags) == 1
    assert flags[0]["severity"] == "caution"


# ═══════════════════════════════════════════════════════════════════════════
#  CLI RUNNER
# ═══════════════════════════════════════════════════════════════════════════


def _run_all_tests():
    """Run all tests and print results — standalone mode."""
    import inspect

    test_functions = [
        (name, obj)
        for name, obj in inspect.getmembers(sys.modules[__name__])
        if name.startswith("test_") and callable(obj)
    ]

    print(f"\n{'=' * 70}")
    print(f"  Nalam AI — Safety Flagging Test Harness")
    print(f"  {len(test_functions)} test(s) found")
    print(f"{'=' * 70}\n")

    passed = 0
    failed = 0
    errors: list[tuple[str, str]] = []

    for name, func in sorted(test_functions):
        try:
            func()
            print(f"  PASS {name}")
            passed += 1
        except AssertionError as exc:
            print(f"  FAIL {name}: {exc}")
            failed += 1
            errors.append((name, str(exc)))
        except Exception as exc:
            print(f"  ERROR {name}: {type(exc).__name__}: {exc}")
            failed += 1
            errors.append((name, f"{type(exc).__name__}: {exc}"))

    print(f"\n{'=' * 70}")
    print(f"  Results: {passed} passed, {failed} failed, {passed + failed} total")
    print(f"{'=' * 70}")

    if errors:
        print(f"\n  FAILURES:")
        for name, msg in errors:
            print(f"    • {name}: {msg}")
        print()

    return failed == 0


if __name__ == "__main__":
    success = _run_all_tests()
    sys.exit(0 if success else 1)
