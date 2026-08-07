/**
 * Script Builder — converts structured medical JSON into natural,
 * plain-language spoken scripts for patients.
 *
 * NEVER reads raw JSON field names to the patient.
 * Always phrases things as a caring, calm human explanation.
 *
 * Supported languages: "hi" (Hindi), "ta" (Tamil), "ta-en" (Tanglish)
 */

// ─── Language Templates ─────────────────────────────────────────────────────

const TEMPLATES = {
  // ── Hindi ───────────────────────────────────────────────────────────────
  hi: {
    greeting: (name) =>
      name
        ? `${name} जी, आपके डॉक्टर ने ये दवाइयाँ लिखी हैं।`
        : `आपके डॉक्टर ने ये दवाइयाँ लिखी हैं।`,
    medicine: (med) =>
      `${med.name} — ${med.dosage} की एक गोली, दिन में ${_freqHi(med.frequency)}, ${_durationHi(med.duration)}${med.instructions ? `, ${_instructionsHi(med.instructions)}` : ""}।`,
    flagInfo: (flag) => `${flag.related_to} के बारे में: ${flag.message}`,
    flagCaution: (flag) =>
      `ध्यान दें — ${flag.related_to}: ${flag.message} कृपया अपने डॉक्टर से बात करें।`,
    flagWarning: (flag) =>
      `ज़रूरी सूचना — ${flag.related_to}: ${flag.message} कृपया जल्द अपने डॉक्टर से मिलें।`,
    closing: "अगर कोई सवाल हो तो अपने डॉक्टर से ज़रूर पूछें। अपना ख़्याल रखिए।",
    // Lab report
    labGreeting: (name) =>
      name
        ? `${name} जी, आपकी जाँच रिपोर्ट के नतीजे ये हैं।`
        : `आपकी जाँच रिपोर्ट के नतीजे ये हैं।`,
    labTest: (test) =>
      `${test.test_name}: आपका रिज़ल्ट ${test.value} ${test.unit} है${test.reference_range ? ` (सामान्य सीमा: ${test.reference_range})` : ""}।`,
  },

  // ── Tamil ───────────────────────────────────────────────────────────────
  ta: {
    greeting: (name) =>
      name
        ? `${name}, உங்கள் மருத்துவர் இந்த மருந்துகளை எழுதியுள்ளார்.`
        : `உங்கள் மருத்துவர் இந்த மருந்துகளை எழுதியுள்ளார்.`,
    medicine: (med) =>
      `${med.name} — ${med.dosage}, ${_freqTa(med.frequency)}, ${_durationTa(med.duration)}${med.instructions ? `, ${_instructionsTa(med.instructions)}` : ""}.`,
    flagInfo: (flag) => `${flag.related_to} பற்றி: ${flag.message}`,
    flagCaution: (flag) =>
      `கவனிக்கவும் — ${flag.related_to}: ${flag.message} தயவுசெய்து மருத்துவரிடம் பேசுங்கள்.`,
    flagWarning: (flag) =>
      `முக்கிய அறிவிப்பு — ${flag.related_to}: ${flag.message} உடனடியாக மருத்துவரை அணுகவும்.`,
    closing:
      "சந்தேகம் இருந்தால் உங்கள் மருத்துவரிடம் கேளுங்கள். நன்றாக இருங்கள்.",
    labGreeting: (name) =>
      name
        ? `${name}, உங்கள் பரிசோதனை முடிவுகள் இவை.`
        : `உங்கள் பரிசோதனை முடிவுகள் இவை.`,
    labTest: (test) =>
      `${test.test_name}: உங்கள் முடிவு ${test.value} ${test.unit}${test.reference_range ? ` (சாதாரண வரம்பு: ${test.reference_range})` : ""}.`,
  },

  // ── Tanglish (Tamil-English code-mixed) ─────────────────────────────────
  "ta-en": {
    greeting: (name) =>
      name
        ? `${name}, ungal doctor indha medicines ezhuthiyirukkaaru.`
        : `Ungal doctor indha medicines ezhuthiyirukkaaru.`,
    medicine: (med) =>
      `${med.name} — ${med.dosage}, ${_freqTaEn(med.frequency)}, ${_durationTaEn(med.duration)}${med.instructions ? `, ${_instructionsTaEn(med.instructions)}` : ""}.`,
    flagInfo: (flag) => `${flag.related_to} pathi: ${flag.message}`,
    flagCaution: (flag) =>
      `Please note — ${flag.related_to}: ${flag.message} Doctor kitta check pannunga.`,
    flagWarning: (flag) =>
      `Important — ${flag.related_to}: ${flag.message} Udane doctor-a parunga.`,
    closing: "Doubt irundhaal doctor kitta kelunga. Take care!",
    labGreeting: (name) =>
      name
        ? `${name}, ungal lab report results indha maari irukku.`
        : `Ungal lab report results indha maari irukku.`,
    labTest: (test) =>
      `${test.test_name}: ungal result ${test.value} ${test.unit}${test.reference_range ? ` (normal range: ${test.reference_range})` : ""}.`,
  },
};

// ─── Helper: Frequency Translation ──────────────────────────────────────────

function _freqHi(freq) {
  const map = {
    "once daily": "एक बार",
    "twice daily": "दो बार",
    "thrice daily": "तीन बार",
    "three times daily": "तीन बार",
    "four times daily": "चार बार",
  };
  return map[freq?.toLowerCase()] || freq;
}

function _freqTa(freq) {
  const map = {
    "once daily": "தினமும் ஒரு முறை",
    "twice daily": "தினமும் இரண்டு முறை",
    "thrice daily": "தினமும் மூன்று முறை",
    "three times daily": "தினமும் மூன்று முறை",
  };
  return map[freq?.toLowerCase()] || freq;
}

function _freqTaEn(freq) {
  const map = {
    "once daily": "daily once",
    "twice daily": "daily rendu thadavai",
    "thrice daily": "daily moonu thadavai",
    "three times daily": "daily moonu thadavai",
  };
  return map[freq?.toLowerCase()] || freq;
}

// ─── Helper: Duration Translation ───────────────────────────────────────────

function _durationHi(dur) {
  const match = dur?.match(/(\d+)\s*days?/i);
  if (match) return `${match[1]} दिनों तक`;
  const matchWeeks = dur?.match(/(\d+)\s*weeks?/i);
  if (matchWeeks) return `${matchWeeks[1]} हफ़्तों तक`;
  return dur;
}

function _durationTa(dur) {
  const match = dur?.match(/(\d+)\s*days?/i);
  if (match) return `${match[1]} நாட்கள்`;
  return dur;
}

function _durationTaEn(dur) {
  const match = dur?.match(/(\d+)\s*days?/i);
  if (match) return `${match[1]} days`;
  return dur;
}

// ─── Helper: Instructions Translation ───────────────────────────────────────

function _instructionsHi(instr) {
  const map = {
    "after food": "खाना खाने के बाद",
    "before food": "खाना खाने से पहले",
    "with food": "खाने के साथ",
    "empty stomach": "खाली पेट",
    "after dinner": "रात के खाने के बाद",
    "after breakfast": "नाश्ते के बाद",
    "morning, before food": "सुबह, खाना खाने से पहले",
  };
  return map[instr?.toLowerCase()] || instr;
}

function _instructionsTa(instr) {
  const map = {
    "after food": "சாப்பிட்ட பிறகு",
    "before food": "சாப்பிடுவதற்கு முன்",
    "with food": "சாப்பாட்டுடன்",
    "empty stomach": "வெறும் வயிற்றில்",
    "after dinner": "இரவு சாப்பாட்டுக்கு பிறகு",
    "morning, before food": "காலையில், சாப்பிடுவதற்கு முன்",
  };
  return map[instr?.toLowerCase()] || instr;
}

function _instructionsTaEn(instr) {
  const map = {
    "after food": "saaptu mudichathum",
    "before food": "saapidrathu ku munnaadi",
    "empty stomach": "empty stomach-la",
    "after dinner": "dinner ku appuram",
    "morning, before food": "morning-la, saapidrathu ku munnaadi",
  };
  return map[instr?.toLowerCase()] || instr;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Build a natural-language spoken script from structured medical data.
 *
 * @param {Object} extractionResult — full ExtractionResponse from API
 * @param {string} language — "hi" | "ta" | "ta-en"
 * @returns {string} Plain-language script ready for TTS
 */
export function buildSpokenScript(extractionResult, language = "hi") {
  const t = TEMPLATES[language] || TEMPLATES["hi"];
  const data = extractionResult.structured_data;
  const flags = extractionResult.flags || [];
  const lines = [];

  if (data.document_type === "prescription") {
    // Greeting
    lines.push(t.greeting(data.patient_name));
    lines.push(""); // pause

    // Each medicine
    for (const med of data.medicines || []) {
      lines.push(t.medicine(med));
    }

    lines.push(""); // pause

    // Flags (only caution and warning for patients; info is optional)
    const importantFlags = flags.filter(
      (f) => f.severity === "caution" || f.severity === "warning"
    );
    for (const flag of importantFlags) {
      if (flag.severity === "warning") {
        lines.push(t.flagWarning(flag));
      } else {
        lines.push(t.flagCaution(flag));
      }
    }
  } else if (data.document_type === "lab_report") {
    // Lab report greeting
    lines.push(t.labGreeting(data.patient_name));
    lines.push("");

    // Each test
    for (const test of data.tests || []) {
      lines.push(t.labTest(test));
    }

    lines.push("");

    // Flags
    const importantFlags = flags.filter(
      (f) => f.severity === "caution" || f.severity === "warning"
    );
    for (const flag of importantFlags) {
      if (flag.severity === "warning") {
        lines.push(t.flagWarning(flag));
      } else {
        lines.push(t.flagCaution(flag));
      }
    }
  }

  // Closing
  lines.push("");
  lines.push(t.closing);

  return lines.filter((l) => l !== undefined).join("\n");
}

/**
 * Get the display name for a language code.
 */
export function getLanguageLabel(langCode) {
  const labels = {
    hi: "हिन्दी (Hindi)",
    ta: "தமிழ் (Tamil)",
    "ta-en": "Tanglish",
  };
  return labels[langCode] || langCode;
}

export const SUPPORTED_LANGUAGES = [
  { code: "hi", label: "हिन्दी", labelEn: "Hindi" },
  { code: "ta", label: "தமிழ்", labelEn: "Tamil" },
  { code: "ta-en", label: "Tanglish", labelEn: "Tanglish" },
];
