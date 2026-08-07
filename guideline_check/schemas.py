"""
Pydantic models for the safety flagging layer.

These models define the shape of safety flags added to Teammate 1's
extraction output. They are additive — the original extraction schema
is never modified, only augmented with a ``flags`` array.
"""


from typing import Literal

from pydantic import BaseModel, Field


class SafetyFlag(BaseModel):
    """A single safety flag raised by the guideline cross-reference engine.

    Severity guidelines:
        - "info":    Value confirmed within normal/expected range (optional).
        - "caution": Mildly outside expected range, or couldn't be verified
                     against the knowledge base.
        - "warning": Significantly outside safe range, or a known dangerous
                     drug interaction was detected.
    """

    severity: Literal["info", "caution", "warning"]
    related_to: str = Field(
        description="The medicine name or lab test this flag refers to, "
        "e.g. 'Metformin' or 'Hemoglobin'",
    )
    message: str = Field(
        description="Human-readable explanation — always phrased as "
        "'please verify with your doctor', never diagnostic",
    )
    source: str = Field(
        description="Where the flag originated, e.g. 'knowledge_base' "
        "or 'unverified'",
    )


class SafetyCheckResult(BaseModel):
    """Wraps the original extracted data with an added ``flags`` array.

    The ``data`` field contains the *unmodified* extraction output from
    Teammate 1.  The ``flags`` field contains any anomalies detected by
    the guideline cross-reference engine.
    """

    data: dict = Field(description="Original extracted data, untouched")
    flags: list[SafetyFlag] = Field(default_factory=list)
