"""
Pydantic models matching the locked JSON output schema.

These models are the contract between the extraction pipeline and downstream
consumers (safety-check layer, voice layer, frontend). DO NOT change field
names or types without coordinating with teammates.
"""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from guideline_check.schemas import SafetyFlag


# ─── Prescription sub-models ────────────────────────────────────────────────

class Medicine(BaseModel):
    """A single prescribed medication."""

    name: str
    dosage: str = Field(description="e.g. '500mg'")
    frequency: str = Field(description="e.g. 'twice daily'")
    duration: str = Field(description="e.g. '7 days'")
    instructions: str = Field(description="e.g. 'after food'")
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="Model confidence in the extraction (0 = guess, 1 = certain)",
    )


class PrescriptionResult(BaseModel):
    """Structured extraction result for a handwritten prescription."""

    document_type: Literal["prescription"] = "prescription"
    patient_name: str | None = None
    doctor_name: str | None = None
    date: str | None = None
    medicines: list[Medicine] = Field(default_factory=list)
    raw_notes: str | None = Field(
        default=None,
        description="Handwritten notes that don't fit structured fields",
    )
    extraction_warnings: list[str] = Field(default_factory=list)


# ─── Lab Report sub-models ──────────────────────────────────────────────────

class TestResult(BaseModel):
    """A single lab test result row."""

    test_name: str
    value: str
    unit: str
    reference_range: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)


class LabReportResult(BaseModel):
    """Structured extraction result for a lab report."""

    document_type: Literal["lab_report"] = "lab_report"
    patient_name: str | None = None
    date: str | None = None
    tests: list[TestResult] = Field(default_factory=list)
    extraction_warnings: list[str] = Field(default_factory=list)


# ─── Discriminated Union ────────────────────────────────────────────────────

ExtractionResult = Annotated[
    Union[PrescriptionResult, LabReportResult],
    Field(discriminator="document_type"),
]
"""Top-level type that validates either a prescription or lab report result."""


# ─── API Response Model ─────────────────────────────────────────────────────

class ExtractionResponse(BaseModel):
    """The shape returned by POST /extract — used by teammates."""

    structured_data: PrescriptionResult | LabReportResult
    doctor_note: str
    extraction_warnings: list[str] = Field(default_factory=list)
    flags: list[SafetyFlag] = Field(
        default_factory=list,
        description="Safety flags from guideline cross-reference engine",
    )
