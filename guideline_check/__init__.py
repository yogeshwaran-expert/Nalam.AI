"""
ArogyaSight AI — Guideline Cross-Reference & Safety Flagging Module.

This module cross-references extracted medical data (medicines, lab tests)
against a curated, verified knowledge base and flags anomalies before
they reach patients or doctors.

Key principle: this module NEVER diagnoses or overrides a doctor. It only
flags "this looks unusual, please verify" — grounded entirely in the
curated knowledge base, never the LLM's general knowledge.
"""
