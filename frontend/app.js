// ArogyaSight AI — interaction layer
// Handles: scroll-linked 3D hero card, language flip cards, and the
// extraction panel wired to the real backend (or mock data).

import { extractDocument, setApiConfig, getApiConfig, ApiError } from "./api/client.js";
import { generateVoiceExplanation, playBrowserSpeech, stopBrowserSpeech } from "./voice/ttsService.js";

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

/* =========================================================
   1. Hero 3D scroll card
   As the hero section scrolls through the viewport, the card
   rotates from a tilted, illegible "scrawl" face to a flat,
   legible "clear" face — mirroring the product's actual job.
   ========================================================= */
function initHeroScroll() {
  const stage = document.getElementById("heroStage");
  const card = document.getElementById("heroCard");
  if (!stage || !card) return;

  const scrawlFace = card.querySelector(".rx-face--scrawl");
  const clearFace = card.querySelector(".rx-face--clear");

  if (prefersReducedMotion) {
    card.style.transform = "rotateX(0deg) scale(1)";
    clearFace.style.opacity = "1";
    scrawlFace.style.opacity = "0";
    return;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function update() {
    const rect = stage.getBoundingClientRect();
    const vh = window.innerHeight;

    // progress: 0 when stage top is at bottom of viewport,
    // 1 when stage top has scrolled to the top of viewport.
    const raw = (vh - rect.top) / (vh + rect.height);
    const progress = clamp(raw, 0, 1);

    const rotate = 24 - progress * 24; // 24deg -> 0deg
    const scale = 0.92 + progress * 0.08; // 0.92 -> 1
    const translate = progress * -40; // slight lift

    card.style.transform = `translateY(${translate}px) rotateX(${rotate}deg) scale(${scale})`;

    // crossfade starts once the card is mostly flat
    const fade = clamp((progress - 0.35) / 0.5, 0, 1);
    clearFace.style.opacity = String(fade);
    scrawlFace.style.opacity = String(1 - fade * 0.9);

    ticking = false;
  }

  let ticking = false;
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
}

/* =========================================================
   2. Language flip cards (touch-friendly: tap toggles flip
      in addition to the CSS :hover flip on desktop)
   ========================================================= */
function initLangCards() {
  const cards = document.querySelectorAll(".lang-card");
  cards.forEach((cardBtn) => {
    cardBtn.addEventListener("click", () => {
      cardBtn.classList.toggle("is-flipped");
    });
  });
}

/* =========================================================
   3. Mode toggle (mock ↔ live)
   ========================================================= */
function initModeToggle() {
  const modeSwitch = document.getElementById("modeSwitch");
  const mockLabel = document.getElementById("mockLabel");
  const liveLabel = document.getElementById("liveLabel");
  if (!modeSwitch) return;

  function setMode(isLive) {
    if (isLive) {
      modeSwitch.classList.add("is-live");
      modeSwitch.setAttribute("aria-checked", "true");
      mockLabel.classList.remove("is-active");
      liveLabel.classList.add("is-active");
      setApiConfig("live");
    } else {
      modeSwitch.classList.remove("is-live");
      modeSwitch.setAttribute("aria-checked", "false");
      mockLabel.classList.add("is-active");
      liveLabel.classList.remove("is-active");
      setApiConfig("mock");
    }
  }

  modeSwitch.addEventListener("click", () => {
    const isCurrentlyLive = modeSwitch.classList.contains("is-live");
    setMode(!isCurrentlyLive);
  });

  modeSwitch.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const isCurrentlyLive = modeSwitch.classList.contains("is-live");
      setMode(!isCurrentlyLive);
    }
  });
}

/* =========================================================
   4. Language code mapping
   ========================================================= */
const LANG_MAP = {
  hindi: "hi",
  tamil: "ta",
  tanglish: "ta-en",
};

const LANG_DISPLAY = {
  hindi: "Hindi",
  tamil: "Tamil",
  tanglish: "Tanglish",
};

/* =========================================================
   5. Result rendering helpers
   ========================================================= */

function _confidenceBar(confidence) {
  const pct = Math.round(confidence * 100);
  let level = "high";
  if (pct < 50) level = "low";
  else if (pct < 80) level = "mid";

  return `
    <span class="confidence-bar">
      <span class="confidence-bar__track">
        <span class="confidence-bar__fill confidence-bar__fill--${level}" style="width: ${pct}%"></span>
      </span>
      <span class="confidence-bar__label">${pct}%</span>
    </span>`;
}

function _escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function _renderPrescriptionTable(medicines) {
  if (!medicines || medicines.length === 0) {
    return `<p class="try-panel__placeholder">No medicines extracted from this document.</p>`;
  }

  const rows = medicines.map((med) => `
    <tr>
      <td><strong>${_escapeHtml(med.name)}</strong></td>
      <td>${_escapeHtml(med.dosage)}</td>
      <td class="muted">${_escapeHtml(med.frequency)}</td>
      <td class="muted">${_escapeHtml(med.duration)}</td>
      <td class="muted">${_escapeHtml(med.instructions)}</td>
      <td>${_confidenceBar(med.confidence)}</td>
    </tr>
  `).join("");

  return `
    <table class="result-table">
      <thead>
        <tr>
          <th>Medicine</th>
          <th>Dosage</th>
          <th>Frequency</th>
          <th>Duration</th>
          <th>Instructions</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _renderLabTable(tests) {
  if (!tests || tests.length === 0) {
    return `<p class="try-panel__placeholder">No test results extracted from this document.</p>`;
  }

  const rows = tests.map((t) => `
    <tr>
      <td><strong>${_escapeHtml(t.test_name)}</strong></td>
      <td>${_escapeHtml(t.value)}</td>
      <td class="muted">${_escapeHtml(t.unit)}</td>
      <td class="muted">${_escapeHtml(t.reference_range || "\u2014")}</td>
      <td>${_confidenceBar(t.confidence)}</td>
    </tr>
  `).join("");

  return `
    <table class="result-table">
      <thead>
        <tr>
          <th>Test</th>
          <th>Value</th>
          <th>Unit</th>
          <th>Reference</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _renderFlags(flags) {
  if (!flags || flags.length === 0) return "";

  const items = flags.map((f) => `
    <div class="flag-item flag-item--${f.severity}">
      <span class="flag-badge flag-badge--${f.severity}">${f.severity}</span>
      <div>
        <span class="flag-related">${_escapeHtml(f.related_to)}</span>
        <span class="flag-message"> \u2014 ${_escapeHtml(f.message)}</span>
      </div>
    </div>
  `).join("");

  return `
    <div class="flag-section">
      <p class="flag-section__title">Safety Checks</p>
      <div class="flag-list">${items}</div>
    </div>`;
}

function _renderWarnings(warnings) {
  if (!warnings || warnings.length === 0) return "";
  const items = warnings.map((w) => `<li>${_escapeHtml(w)}</li>`).join("");
  return `<ul class="warnings-list">${items}</ul>`;
}

function _renderDoctorNote(noteText) {
  if (!noteText) return "";
  return `
    <div class="doctor-note" id="doctorNote">
      <button class="doctor-note__toggle" id="doctorNoteToggle" type="button">Clinical Summary</button>
      <div class="doctor-note__body">${_escapeHtml(noteText)}</div>
    </div>`;
}

function _renderVoiceControls(langDisplay) {
  return `
    <div class="voice-controls">
      <button class="voice-btn" id="voicePlayBtn" type="button">
        \uD83D\uDD0A Listen in ${langDisplay}
      </button>
      <button class="voice-btn" id="voiceStopBtn" type="button" hidden>
        \u23F9 Stop
      </button>
      <span class="voice-lang-label" id="voiceLangLabel"></span>
    </div>`;
}

function renderResult(data, langKey) {
  const sd = data.structured_data;
  const langDisplay = LANG_DISPLAY[langKey] || langKey;
  const isPrescription = sd.document_type === "prescription";

  // Header
  const headerItems = [];
  headerItems.push(`<span class="result-header__doctype">${isPrescription ? "Prescription" : "Lab Report"}</span>`);
  if (sd.patient_name) headerItems.push(`<span class="result-header__item"><strong>Patient:</strong> ${_escapeHtml(sd.patient_name)}</span>`);
  if (sd.doctor_name) headerItems.push(`<span class="result-header__item"><strong>Doctor:</strong> ${_escapeHtml(sd.doctor_name)}</span>`);
  if (sd.date) headerItems.push(`<span class="result-header__item"><strong>Date:</strong> ${_escapeHtml(sd.date)}</span>`);

  // Data table
  const tableHtml = isPrescription
    ? _renderPrescriptionTable(sd.medicines)
    : _renderLabTable(sd.tests);

  // Raw notes (prescriptions only)
  const notesHtml = sd.raw_notes
    ? `<p style="font-size:0.85rem;color:var(--ink-soft);margin:0.6rem 0 0;"><strong style="color:var(--paper);">Notes:</strong> ${_escapeHtml(sd.raw_notes)}</p>`
    : "";

  return `
    <div class="result-card">
      <div class="result-header">${headerItems.join("")}</div>
      ${tableHtml}
      ${notesHtml}
      ${_renderWarnings(data.extraction_warnings)}
      ${_renderFlags(data.flags)}
      ${_renderDoctorNote(data.doctor_note)}
      ${_renderVoiceControls(langDisplay)}
    </div>`;
}

/* =========================================================
   6. Extraction panel — wired to real API
   ========================================================= */
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

function initDemoPanel() {
  const langBtns = document.querySelectorAll(".try-panel__lang-btn");
  const demoBtn = document.getElementById("demoBtn");
  const demoBtnLabel = document.getElementById("demoBtnLabel");
  const resultBox = document.getElementById("demoResult");

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const emptyState = document.getElementById("dropzoneEmpty");
  const previewState = document.getElementById("dropzonePreview");
  const previewImg = document.getElementById("previewImg");
  const previewChip = document.getElementById("previewFileChip");
  const previewFileName = document.getElementById("previewFileName");
  const clearBtn = document.getElementById("clearUpload");

  if (!demoBtn || !dropzone) return;

  let activeLang = "hindi";
  let uploadedFile = null;
  let lastResult = null; // store for voice replay
  let isPlaying = false;

  // Language selector
  langBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      langBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      activeLang = btn.dataset.demoLang;
    });
  });

  function resetResult() {
    resultBox.innerHTML =
      '<p class="try-panel__placeholder">Your explanation will appear here.</p>';
    lastResult = null;
  }

  function showLoading() {
    resultBox.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p class="loading-label">Analyzing your document\u2026<br>This may take a few seconds.</p>
      </div>`;
  }

  function showError(message, detail) {
    resultBox.innerHTML = `
      <div class="error-state">
        <div class="error-state__icon">\u26A0\uFE0F</div>
        <p class="error-state__message">${_escapeHtml(message)}</p>
        ${detail ? `<p class="error-state__detail">${_escapeHtml(detail)}</p>` : ""}
      </div>`;
  }

  function showFile(file) {
    uploadedFile = file;
    emptyState.hidden = true;
    previewState.hidden = false;
    previewFileName.textContent = file.name;

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewImg.hidden = false;
        previewChip.hidden = true;
      };
      reader.readAsDataURL(file);
    } else {
      previewImg.hidden = true;
      previewChip.hidden = false;
    }

    demoBtn.disabled = false;
    demoBtnLabel.textContent = "Read this prescription";
    resetResult();
  }

  function clearFile() {
    uploadedFile = null;
    fileInput.value = "";
    previewImg.src = "";
    previewImg.hidden = true;
    previewChip.hidden = true;
    previewState.hidden = true;
    emptyState.hidden = false;
    demoBtn.disabled = true;
    demoBtnLabel.textContent = "Upload a file to continue";
    resetResult();
    stopBrowserSpeech();
  }

  function handleFiles(fileList) {
    const file = fileList && fileList[0];
    if (!file) return;

    const isAccepted = file.type.startsWith("image/");
    if (!isAccepted) {
      resultBox.innerHTML =
        '<p class="try-panel__placeholder">Please upload a JPG, PNG, or WebP image.</p>';
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      resultBox.innerHTML =
        '<p class="try-panel__placeholder">That file is over 10MB \u2014 try a smaller photo.</p>';
      return;
    }
    showFile(file);
  }

  // click / keyboard to open file picker
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  // drag and drop
  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    handleFiles(e.dataTransfer.files);
  });

  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearFile();
  });

  // ─── Main extraction button ───────────────────────────────────────────
  demoBtn.addEventListener("click", async () => {
    if (!uploadedFile) return;

    demoBtn.disabled = true;
    demoBtnLabel.textContent = "Reading prescription\u2026";
    showLoading();
    stopBrowserSpeech();

    try {
      const data = await extractDocument(uploadedFile);
      lastResult = data;

      // Render the structured result
      resultBox.innerHTML = renderResult(data, activeLang);

      // Wire up doctor note toggle
      const noteToggle = document.getElementById("doctorNoteToggle");
      const noteContainer = document.getElementById("doctorNote");
      if (noteToggle && noteContainer) {
        noteToggle.addEventListener("click", () => {
          noteContainer.classList.toggle("is-open");
        });
      }

      // Wire up voice controls
      _wireVoiceControls(data, activeLang);

      demoBtn.disabled = false;
      demoBtnLabel.textContent = "Read this prescription again";
    } catch (err) {
      console.error("Extraction failed:", err);
      if (err instanceof ApiError) {
        showError(err.userMessage, `HTTP ${err.statusCode || "\u2014"}`);
      } else {
        showError(
          "Something went wrong while reading your document.",
          err.message
        );
      }
      demoBtn.disabled = false;
      demoBtnLabel.textContent = "Try again";
    }
  });

  // ─── Voice playback ──────────────────────────────────────────────────
  function _wireVoiceControls(data, langKey) {
    const playBtn = document.getElementById("voicePlayBtn");
    const stopBtn = document.getElementById("voiceStopBtn");
    const langLabel = document.getElementById("voiceLangLabel");
    if (!playBtn) return;

    const voiceLangCode = LANG_MAP[langKey] || "hi";

    playBtn.addEventListener("click", async () => {
      if (isPlaying) return;
      isPlaying = true;
      playBtn.classList.add("is-playing");
      playBtn.disabled = true;
      stopBtn.hidden = false;
      langLabel.textContent = "Speaking\u2026";

      try {
        const { transcript, error } = await generateVoiceExplanation(data, voiceLangCode);

        if (error && !transcript) {
          langLabel.textContent = `Voice unavailable: ${error}`;
          return;
        }

        // For browser TTS, we play directly
        await playBrowserSpeech(transcript, voiceLangCode);
        langLabel.textContent = "Done";
      } catch (err) {
        console.error("Voice playback error:", err);
        langLabel.textContent = "Voice playback failed";
      } finally {
        isPlaying = false;
        playBtn.classList.remove("is-playing");
        playBtn.disabled = false;
        stopBtn.hidden = true;
      }
    });

    stopBtn.addEventListener("click", () => {
      stopBrowserSpeech();
      isPlaying = false;
      playBtn.classList.remove("is-playing");
      playBtn.disabled = false;
      stopBtn.hidden = true;
      langLabel.textContent = "Stopped";
    });
  }
}

/* =========================================================
   Init
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  initHeroScroll();
  initLangCards();
  initModeToggle();
  initDemoPanel();
});
