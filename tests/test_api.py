"""Contract tests for the FastAPI upload and safety endpoints."""

from fastapi.testclient import TestClient

from api.main import app


def _valid_prescription() -> dict:
    return {
        "document_type": "prescription",
        "patient_name": "Test Patient",
        "doctor_name": "Dr. Test",
        "date": "2026-08-16",
        "medicines": [{
            "name": "Paracetamol",
            "dosage": "500mg",
            "frequency": "twice daily",
            "duration": "3 days",
            "instructions": "after food",
            "confidence": 0.95,
        }],
        "raw_notes": None,
        "extraction_warnings": [],
    }


def test_extract_rejects_mismatched_file_signature():
    with TestClient(app) as client:
        response = client.post(
            "/extract",
            files={"file": ("not-an-image.png", b"not a PNG", "image/png")},
        )
    assert response.status_code == 400
    assert "do not match" in response.json()["detail"]


def test_extract_rejects_oversized_upload(monkeypatch):
    monkeypatch.setattr("api.main._MAX_UPLOAD_BYTES", 4)
    with TestClient(app) as client:
        response = client.post(
            "/extract",
            files={"file": ("image.png", b"\x89PNG\r\n\x1a\nmore", "image/png")},
        )
    assert response.status_code == 413


def test_extract_returns_validated_response(monkeypatch):
    monkeypatch.setattr("api.main.extract_document_from_bytes", lambda *_: _valid_prescription())
    with TestClient(app) as client:
        response = client.post(
            "/extract",
            files={"file": ("image.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        )
    assert response.status_code == 200
    assert response.json()["structured_data"]["document_type"] == "prescription"


def test_check_safety_rejects_invalid_payload():
    with TestClient(app) as client:
        response = client.post("/check-safety", json={"document_type": "x_ray"})
    assert response.status_code == 422
