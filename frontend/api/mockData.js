/**
 * Mock data matching the backend ExtractionResponse schema.
 * Used during development and as a demo-day fallback.
 */

export const MOCK_PRESCRIPTION = {
  structured_data: {
    document_type: "prescription",
    patient_name: "Ramesh Kumar",
    doctor_name: "Dr. Anitha Rao",
    date: "2026-07-28",
    medicines: [
      {
        name: "Metformin",
        dosage: "500mg",
        frequency: "twice daily",
        duration: "30 days",
        instructions: "after food",
        confidence: 0.95,
      },
      {
        name: "Amlodipine",
        dosage: "5mg",
        frequency: "once daily",
        duration: "30 days",
        instructions: "morning, before food",
        confidence: 0.82,
      },
      {
        name: "Ecosprin",
        dosage: "75mg",
        frequency: "once daily",
        duration: "30 days",
        instructions: "after dinner",
        confidence: 0.91,
      },
    ],
    raw_notes: "Review after 1 month. Check BP weekly.",
    extraction_warnings: ["Partially illegible handwriting in line 3"],
  },
  doctor_note:
    "══ CLINICAL SUMMARY ══\nPatient: Ramesh Kumar | Date: 2026-07-28\nDoctor: Dr. Anitha Rao\n──────────────────────\nRx 1: Metformin 500mg — twice daily after food, 30 days\nRx 2: Amlodipine 5mg — once daily morning before food, 30 days\nRx 3: Ecosprin 75mg — once daily after dinner, 30 days\n──────────────────────\nNotes: Review after 1 month. Check BP weekly.\nFlags: 1 info, 1 caution",
  extraction_warnings: ["Partially illegible handwriting in line 3"],
  flags: [
    {
      severity: "info",
      related_to: "Metformin",
      message: "Dosage within normal range for Type 2 Diabetes management.",
      source: "knowledge_base",
    },
    {
      severity: "caution",
      related_to: "Amlodipine",
      message:
        "Extraction confidence is 82% — please verify the dosage with the original document.",
      source: "unverified",
    },
    {
      severity: "info",
      related_to: "Ecosprin",
      message: "Standard antiplatelet dose. No known interactions with other prescribed medications.",
      source: "knowledge_base",
    },
  ],
};

export const MOCK_LAB_REPORT = {
  structured_data: {
    document_type: "lab_report",
    patient_name: "Priya Shanmugam",
    date: "2026-07-30",
    tests: [
      {
        test_name: "Hemoglobin",
        value: "11.2",
        unit: "g/dL",
        reference_range: "12.0–15.5",
        confidence: 0.97,
      },
      {
        test_name: "Fasting Blood Sugar",
        value: "142",
        unit: "mg/dL",
        reference_range: "70–100",
        confidence: 0.93,
      },
      {
        test_name: "TSH",
        value: "3.8",
        unit: "mIU/L",
        reference_range: "0.4–4.0",
        confidence: 0.89,
      },
    ],
    extraction_warnings: [],
  },
  doctor_note:
    "══ CLINICAL SUMMARY ══\nPatient: Priya Shanmugam | Date: 2026-07-30\n──────────────────────\nHemoglobin: 11.2 g/dL (Ref: 12.0–15.5) ⚠ Below range\nFasting Blood Sugar: 142 mg/dL (Ref: 70–100) ⚠ Above range\nTSH: 3.8 mIU/L (Ref: 0.4–4.0) ✓ Normal\n──────────────────────\nFlags: 1 warning, 1 caution",
  extraction_warnings: [],
  flags: [
    {
      severity: "warning",
      related_to: "Fasting Blood Sugar",
      message:
        "Value 142 mg/dL is above the normal range (70–100 mg/dL). This may indicate pre-diabetes or diabetes. Please consult your doctor.",
      source: "knowledge_base",
    },
    {
      severity: "caution",
      related_to: "Hemoglobin",
      message:
        "Value 11.2 g/dL is slightly below the normal range (12.0–15.5 g/dL). This may indicate mild anemia.",
      source: "knowledge_base",
    },
    {
      severity: "info",
      related_to: "TSH",
      message: "Value within normal range.",
      source: "knowledge_base",
    },
  ],
};
