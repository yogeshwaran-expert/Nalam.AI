/**
 * API Client — handles communication with the Nalam AI backend.
 *
 * Three modes controlled by config:
 *   "mock"  → returns mock data instantly (no network)
 *   "live"  → hits the real FastAPI backend
 *   "demo"  → loads pre-recorded fallback files (demo-day safety net)
 */

import { MOCK_PRESCRIPTION, MOCK_LAB_REPORT } from "./mockData.js";

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  // Match the active Demo Mode control in index.html on initial load.
  // Users can still switch to the live backend at any time.
  mode: "mock", // "mock" | "live" | "demo"
  backendUrl: "http://localhost:8000",
  // Pre-recorded fallback for demo day (relative paths from frontend/)
  demoFallbackFile: "./fallback/demo_result.json",
};

/**
 * Update the API mode at runtime.
 * @param {"mock" | "live" | "demo"} mode
 * @param {string} [backendUrl]
 */
export function setApiConfig(mode, backendUrl) {
  CONFIG.mode = mode;
  if (backendUrl) CONFIG.backendUrl = backendUrl;
}

export function getApiConfig() {
  return { ...CONFIG };
}

// ─── Main API Functions ─────────────────────────────────────────────────────

/**
 * Upload an image and get structured extraction + safety flags.
 *
 * In "mock" mode: returns mock data after a simulated delay.
 * In "live" mode: POSTs to /extract which handles both extraction and safety check.
 * In "demo" mode: loads pre-recorded JSON from disk.
 *
 * @param {File} imageFile — the uploaded image
 * @returns {Promise<Object>} ExtractionResponse shaped data
 */
export async function extractDocument(imageFile) {
  switch (CONFIG.mode) {
    case "mock":
      return _mockExtract(imageFile);
    case "live":
      return _liveExtract(imageFile);
    case "demo":
      return _demoExtract();
    default:
      throw new Error(`Unknown API mode: ${CONFIG.mode}`);
  }
}

/**
 * Standalone safety check — re-runs safety flags on existing extraction data.
 * Useful if you want to re-check after modifying data.
 *
 * @param {Object} structuredData — extraction result to check
 * @returns {Promise<Object>} data + flags
 */
export async function checkSafety(structuredData) {
  if (CONFIG.mode === "mock") {
    // In mock mode, just return the data with its existing flags
    return {
      data: structuredData,
      flags: MOCK_PRESCRIPTION.flags,
    };
  }

  const response = await fetch(`${CONFIG.backendUrl}/check-safety`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(structuredData),
  });

  if (!response.ok) {
    const detail = await _extractErrorDetail(response);
    throw new ApiError(
      `Safety check failed: ${detail}`,
      response.status,
      detail
    );
  }

  return response.json();
}

/**
 * Health check — verify the backend is reachable.
 * @returns {Promise<boolean>}
 */
export async function healthCheck() {
  if (CONFIG.mode === "mock") return true;

  try {
    const response = await fetch(`${CONFIG.backendUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Custom Error Class ─────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(message, statusCode, detail) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.detail = detail;
  }

  /**
   * Returns a user-friendly error message (no HTTP codes or stack traces).
   */
  get userMessage() {
    if (this.statusCode === 400) {
      return "The uploaded file doesn't look like a supported image. Please try a JPEG, PNG, or WebP photo of your prescription or lab report.";
    }
    if (this.statusCode === 413) {
      return "The image file is too large. Please try a smaller photo.";
    }
    if (this.statusCode >= 500) {
      return "Our document reader is temporarily unavailable. Please try again in a moment.";
    }
    if (!this.statusCode) {
      return "Couldn't connect to the server. Please check your internet connection and try again.";
    }
    return "Something went wrong while reading your document. Please try again.";
  }
}

// ─── Internal Implementations ───────────────────────────────────────────────

async function _mockExtract(imageFile) {
  // Simulate network delay
  await _delay(1500 + Math.random() * 1000);

  // Return prescription mock by default; could randomize for testing
  return structuredClone(MOCK_PRESCRIPTION);
}

async function _liveExtract(imageFile) {
  const formData = new FormData();
  formData.append("file", imageFile);

  let response;
  try {
    response = await fetch(`${CONFIG.backendUrl}/extract`, {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    throw new ApiError(
      `Network error: ${err.message}`,
      null,
      "Connection failed"
    );
  }

  if (!response.ok) {
    const detail = await _extractErrorDetail(response);
    throw new ApiError(
      `Extraction failed: ${detail}`,
      response.status,
      detail
    );
  }

  return response.json();
}

async function _demoExtract() {
  try {
    const response = await fetch(CONFIG.demoFallbackFile);
    if (!response.ok) throw new Error("Fallback file not found");
    return response.json();
  } catch {
    // If demo file is missing, fall back to mock data
    console.warn("Demo fallback file not found, using mock data");
    return structuredClone(MOCK_PRESCRIPTION);
  }
}

async function _extractErrorDetail(response) {
  try {
    const body = await response.json();
    return body.detail || JSON.stringify(body);
  } catch {
    return `HTTP ${response.status}`;
  }
}

function _delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
