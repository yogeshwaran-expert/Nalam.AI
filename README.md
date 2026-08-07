# ArogyaSight AI — Layout-Aware Medical Document Extraction

A multimodal extraction pipeline that reads handwritten Indian medical documents (prescriptions, lab reports) and produces structured JSON + doctor-facing clinical summaries.

## Quick Start

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Set your Anthropic API key
```bash
cp .env.example .env
# Edit .env and paste your API key
```

### 3. Run the server
```bash
uvicorn api.main:app --reload
```

### 4. Call the endpoint
```bash
curl -X POST http://localhost:8000/extract \
  -F "file=@path/to/prescription.jpg"
```

### Response format
```json
{
  "structured_data": { "document_type": "prescription", "medicines": [...], ... },
  "doctor_note": "══ CLINICAL SUMMARY ══ ...",
  "extraction_warnings": []
}
```

## Project Structure
```
extraction/          # Core extraction pipeline
  schemas.py         # Pydantic models (locked JSON schema)
  prompts.py         # VLM prompt templates
  vlm_extractor.py   # Claude Vision extraction logic
doctor_note/         # Doctor-facing output
  note_formatter.py  # Structured JSON → clinical summary
api/                 # FastAPI server
  main.py            # POST /extract endpoint
tests/               # Test harness
  test_extraction.py # Batch test against sample images
data/
  sample_documents/  # Drop sample images here
```

## API Endpoint

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/extract` | `file` (multipart image: JPEG/PNG/WEBP) | `{ structured_data, doctor_note, extraction_warnings }` |
| `GET` | `/health` | — | `{ "status": "healthy" }` |

## For Teammates
- Import `extraction.schemas` to validate responses against the locked Pydantic models
- The JSON schema is frozen — any changes will be communicated before merging
