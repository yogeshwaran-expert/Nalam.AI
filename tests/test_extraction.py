"""
Test harness for the ArogyaSight AI extraction pipeline.

Scans data/sample_documents/ for image files, runs extraction on each,
and prints a summary table of results for quick quality eyeballing.

Usage:
    python -m tests.test_extraction
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

# Ensure project root is on sys.path when run as a module
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from dotenv import load_dotenv

load_dotenv(_PROJECT_ROOT / ".env")

from extraction.vlm_extractor import ExtractionError, extract_document
from doctor_note.note_formatter import generate_doctor_note


# ─── Config ──────────────────────────────────────────────────────────────────

SAMPLE_DIR = _PROJECT_ROOT / "data" / "sample_documents"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _find_sample_images() -> list[Path]:
    """Find all image files in the sample documents directory."""
    if not SAMPLE_DIR.exists():
        print(f"⚠  Sample directory not found: {SAMPLE_DIR}")
        print("   Create it and add sample images to test extraction quality.")
        return []

    images = sorted(
        p
        for p in SAMPLE_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )

    if not images:
        print(f"⚠  No image files found in: {SAMPLE_DIR}")
        print(f"   Supported formats: {', '.join(sorted(IMAGE_EXTENSIONS))}")

    return images


def _compute_avg_confidence(data: dict) -> float:
    """Compute average confidence across medicines or tests."""
    doc_type = data.get("document_type", "")

    if doc_type == "prescription":
        items = data.get("medicines", [])
    elif doc_type == "lab_report":
        items = data.get("tests", [])
    else:
        return 0.0

    if not items:
        return 0.0

    confidences = [item.get("confidence", 0.0) for item in items]
    return sum(confidences) / len(confidences)


def _count_items(data: dict) -> int:
    """Count the number of medicines or tests extracted."""
    doc_type = data.get("document_type", "")

    if doc_type == "prescription":
        return len(data.get("medicines", []))
    elif doc_type == "lab_report":
        return len(data.get("tests", []))
    return 0


# ─── Main test runner ────────────────────────────────────────────────────────


def run_tests():
    """Run extraction on all sample images and print results."""
    images = _find_sample_images()

    if not images:
        print("\nNo images to test. Exiting.")
        return

    print(f"\n{'=' * 70}")
    print(f"  ArogyaSight AI — Extraction Test Harness")
    print(f"  Found {len(images)} sample image(s) in: {SAMPLE_DIR}")
    print(f"{'=' * 70}\n")

    results: list[dict] = []

    for i, image_path in enumerate(images, 1):
        print(f"─── [{i}/{len(images)}] {image_path.name} ───")

        start_time = time.time()

        try:
            data = extract_document(str(image_path))
            elapsed = time.time() - start_time

            doc_type = data.get("document_type", "unknown")
            num_items = _count_items(data)
            avg_conf = _compute_avg_confidence(data)
            warnings = data.get("extraction_warnings", [])

            # Print extraction result
            print(f"  Document type : {doc_type}")
            print(f"  Items found   : {num_items}")
            print(f"  Avg confidence: {avg_conf:.2f}")
            print(f"  Warnings      : {len(warnings)}")
            if warnings:
                for w in warnings:
                    print(f"    • {w}")
            print(f"  Time          : {elapsed:.1f}s")

            # Print doctor note
            doctor_note = generate_doctor_note(data)
            print(f"\n{doctor_note}\n")

            # Print raw JSON (indented)
            print("  Raw JSON:")
            print("  " + json.dumps(data, indent=2).replace("\n", "\n  "))

            results.append(
                {
                    "filename": image_path.name,
                    "doc_type": doc_type,
                    "items": num_items,
                    "avg_confidence": avg_conf,
                    "warnings": len(warnings),
                    "time_s": elapsed,
                    "status": "OK",
                }
            )

        except ExtractionError as exc:
            elapsed = time.time() - start_time
            print(f"  ❌ EXTRACTION FAILED: {exc}")
            print(f"  Time: {elapsed:.1f}s")
            results.append(
                {
                    "filename": image_path.name,
                    "doc_type": "ERROR",
                    "items": 0,
                    "avg_confidence": 0.0,
                    "warnings": 0,
                    "time_s": elapsed,
                    "status": f"FAILED: {exc}",
                }
            )

        except Exception as exc:
            elapsed = time.time() - start_time
            print(f"  ❌ UNEXPECTED ERROR: {type(exc).__name__}: {exc}")
            results.append(
                {
                    "filename": image_path.name,
                    "doc_type": "ERROR",
                    "items": 0,
                    "avg_confidence": 0.0,
                    "warnings": 0,
                    "time_s": elapsed,
                    "status": f"ERROR: {exc}",
                }
            )

        print()

    # ─── Summary table ───────────────────────────────────────────────────

    print(f"\n{'=' * 90}")
    print("  SUMMARY")
    print(f"{'=' * 90}")

    # Header
    print(
        f"  {'Filename':<30} {'Type':<14} {'Items':>5} {'Avg Conf':>9} "
        f"{'Warnings':>8} {'Time':>6}  Status"
    )
    print("  " + "─" * 86)

    for r in results:
        print(
            f"  {r['filename']:<30} {r['doc_type']:<14} {r['items']:>5} "
            f"{r['avg_confidence']:>8.2f} {r['warnings']:>8} "
            f"{r['time_s']:>5.1f}s  {r['status']}"
        )

    print(f"\n  Total: {len(results)} images processed")

    # Quick stats
    ok_results = [r for r in results if r["status"] == "OK"]
    if ok_results:
        avg_time = sum(r["time_s"] for r in ok_results) / len(ok_results)
        avg_conf = sum(r["avg_confidence"] for r in ok_results) / len(ok_results)
        print(f"  Successful: {len(ok_results)}/{len(results)}")
        print(f"  Avg extraction time: {avg_time:.1f}s")
        print(f"  Avg confidence: {avg_conf:.2f}")

    failed = [r for r in results if r["status"] != "OK"]
    if failed:
        print(f"  Failed: {len(failed)}/{len(results)}")

    print()


if __name__ == "__main__":
    run_tests()
