Nalam AI

Layout-Aware Document Intelligence + Vernacular Voice Explainer for India's Healthcare System

🩺 The Problem

Millions of Indians receive handwritten prescriptions, lab reports, and government forms filled with multi-column layouts, tables, and illegible handwriting. Standard AI tools like ChatGPT and Google Lens misread these documents — jumbling column order, corrupting tables, and misreading handwriting. In a medical setting, this creates real danger: a misread dosage or diagnosis can reach a patient who has no way to verify it, especially non-English-speaking rural and semi-urban populations with low health literacy.

Over 65% of medical consultations in India experience critical triage delays due to overcrowding, and millions of patients struggle to understand dense lab reports or dosage instructions on their own.

💡 The Solution

Nalam AI reads medical documents the way a human eye does — understanding visual layout, tables, and columns before extracting content — and converts messy documents into two outputs:

For doctors/hospitals: Clean, structured JSON data ready for EHR integration
For patients: A simple, spoken voice explanation in their local language (Hindi, Tamil, Tanglish) describing what the document actually means — e.g., "Take 1 Metformin pill after dinner for 30 days."

Every extracted value is cross-checked against a verified medical guideline knowledge base, flagging anomalies (unusual dosages, out-of-range lab values) before they reach the patient — the project's core "zero-hallucination" safety layer.

✨ Features
Layout-aware extraction — correctly reads multi-column lab reports and tables instead of jumbling text left-to-right
Handwriting interpretation — understands common Indian prescription shorthand (OD, BD, TDS, 1-0-1 dosing patterns)
Guideline-grounded safety flagging — every flag is sourced from a verified knowledge base, never invented by the model
Dual output — one pipeline, two audiences: structured JSON for doctors, spoken explanation for patients
Vernacular voice output — including code-mixed Tanglish, matching how patients actually speak
Confidence scoring — the system flags what it's unsure about rather than guessing

🆚 How This Differs From Others
	Existing tools (Sarvam Vision, Lekhak, Lifemaan)	Nalam AI
Primary audience	Institutions / hospitals / EHR systems	Patients directly
Output format	Structured data only	Structured data + spoken vernacular explanation
Safety checks	Clinician-facing flags	Patient-facing safety warnings, phrased for a non-expert
Language handling	Monolingual regional languages	Code-mixed Tanglish/Hinglish, matching real speech

Existing tools solve the institution's problem — getting messy documents into clean data. We solve the patient's problem — turning that data into something they can actually understand and act on safely.

🛠️ Tech Stack
Layer	Technology
Document extraction	Claude (Anthropic API, vision) — VLM-based layout-aware parsing
Safety/guideline check	Curated JSON knowledge base + fuzzy matching (rapidfuzz)
Voice output	Web Speech API (browser-native TTS with Indic language support)
Backend	Python, FastAPI, Pydantic
Frontend	Vanilla HTML, CSS, JavaScript (ES modules, Web Speech API, i18n engine)
Hosting (demo)	Vercel/Netlify (frontend), Render/Railway (backend)
Version control	GitHub

🎯 Expected Outcomes
Reduced medication errors from misread or misunderstood prescriptions
Faster, cleaner documentation for doctors and hospital systems
Improved health literacy and autonomy for patients who currently rely on guesswork or informal interpretation of their own medical records

⚠️ Disclaimer

Nalam AI is a decision-support and health-literacy tool. It does not diagnose, prescribe, or replace professional medical advice. All safety flags are advisory — patients and doctors should always verify with a qualified healthcare professional.

## Run locally

1. Install Python 3.11+ and create a virtual environment.
2. Install dependencies: `python -m pip install -r requirements.txt`
3. Copy `.env.example` to `.env`, then set a valid `ANTHROPIC_API_KEY`.
4. Start the API: `python -m uvicorn api.main:app --reload`
5. Serve the `frontend/` directory from `http://localhost:5500` (or add its exact origin to `ALLOWED_ORIGINS`).
6. Run verification: `python -m pytest -q`

## Safety and deployment defaults

- Uploads are limited to 10 MB by default (`MAX_UPLOAD_BYTES`) and are verified against their declared file signature.
- PDFs are limited to 10 pages and 16 million rendered pixels before they are sent to the extraction model.
- The API accepts only explicitly configured frontend origins. Set `ALLOWED_ORIGINS` to the HTTPS domains you control before deployment.
- Do not log, retain, or expose uploaded medical documents. Production deployments still require an authentication, consent, audit, and data-retention design appropriate to the organisation and jurisdiction.
