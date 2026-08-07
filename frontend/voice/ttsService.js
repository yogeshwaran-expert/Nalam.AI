/**
 * TTS Service — generates spoken audio from structured medical data.
 *
 * Pipeline:
 *   structuredData → buildSpokenScript() → TTS API → { audioUrl, transcript }
 *
 * TTS backends (in fallback order):
 *   1. Sarvam AI API (best Indic voices)
 *   2. Google Cloud TTS (backup)
 *   3. Browser SpeechSynthesis (zero-cost placeholder)
 *   4. Text-only fallback (no audio)
 *
 * Current implementation uses browser SpeechSynthesis as the default.
 * Swap in Sarvam/Google by setting TTS_BACKEND config.
 */

import { buildSpokenScript } from "./scriptBuilder.js";

// ─── Configuration ──────────────────────────────────────────────────────────

const TTS_CONFIG = {
  backend: "browser", // "sarvam" | "google" | "browser"
  sarvamApiKey: "", // Set via setTtsConfig()
  sarvamApiUrl: "https://api.sarvam.ai/text-to-speech",
  googleApiKey: "",
  // Voice mappings
  sarvamVoices: {
    hi: "meera", // Hindi female voice
    ta: "arvind", // Tamil male voice
    "ta-en": "arvind", // Tanglish uses Tamil voice
  },
  googleVoices: {
    hi: "hi-IN-Wavenet-A",
    ta: "ta-IN-Wavenet-A",
    "ta-en": "ta-IN-Wavenet-A",
  },
  browserVoiceLangs: {
    hi: "hi-IN",
    ta: "ta-IN",
    "ta-en": "en-IN", // Tanglish uses English-India voice in browser
  },
};

/**
 * Update TTS configuration.
 * @param {Object} config
 */
export function setTtsConfig(config) {
  Object.assign(TTS_CONFIG, config);
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Generate a voice explanation from structured medical data.
 *
 * @param {Object} extractionResult — full ExtractionResponse from API
 * @param {string} language — "hi" | "ta" | "ta-en"
 * @returns {Promise<{ audioUrl: string|null, transcript: string, error: string|null }>}
 */
export async function generateVoiceExplanation(extractionResult, language = "hi") {
  // Step 1: Build the spoken script (language-specific plain text)
  const transcript = buildSpokenScript(extractionResult, language);

  // Step 2: Generate audio from the script
  let audioUrl = null;
  let error = null;

  try {
    switch (TTS_CONFIG.backend) {
      case "sarvam":
        audioUrl = await _sarvamTTS(transcript, language);
        break;
      case "google":
        audioUrl = await _googleTTS(transcript, language);
        break;
      case "browser":
        audioUrl = await _browserTTS(transcript, language);
        break;
      default:
        throw new Error(`Unknown TTS backend: ${TTS_CONFIG.backend}`);
    }
  } catch (err) {
    console.error("TTS generation failed:", err);
    error = err.message;
    // Fallback: no audio, transcript still available
  }

  return { audioUrl, transcript, error };
}

// ─── Sarvam AI TTS ──────────────────────────────────────────────────────────

async function _sarvamTTS(text, language) {
  if (!TTS_CONFIG.sarvamApiKey) {
    throw new Error("Sarvam AI API key not configured");
  }

  const voiceId = TTS_CONFIG.sarvamVoices[language] || "meera";
  // Map our language codes to Sarvam's expected codes
  const sarvamLangMap = { hi: "hi-IN", ta: "ta-IN", "ta-en": "ta-IN" };
  const targetLang = sarvamLangMap[language] || "hi-IN";

  const response = await fetch(TTS_CONFIG.sarvamApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": TTS_CONFIG.sarvamApiKey,
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: targetLang,
      speaker: voiceId,
      model: "bulbul:v1",
      enable_preprocessing: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Sarvam API error: ${response.status}`);
  }

  const data = await response.json();
  // Sarvam returns base64-encoded audio
  if (data.audios && data.audios[0]) {
    const audioBlob = _base64ToBlob(data.audios[0], "audio/wav");
    return URL.createObjectURL(audioBlob);
  }

  throw new Error("Sarvam API returned no audio data");
}

// ─── Google Cloud TTS ───────────────────────────────────────────────────────

async function _googleTTS(text, language) {
  if (!TTS_CONFIG.googleApiKey) {
    throw new Error("Google Cloud TTS API key not configured");
  }

  const voiceName = TTS_CONFIG.googleVoices[language] || "hi-IN-Wavenet-A";
  const langCode = language === "ta-en" ? "ta-IN" : language === "ta" ? "ta-IN" : "hi-IN";

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_CONFIG.googleApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: langCode, name: voiceName },
        audioConfig: { audioEncoding: "MP3", speakingRate: 0.9 },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google TTS API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.audioContent) {
    const audioBlob = _base64ToBlob(data.audioContent, "audio/mp3");
    return URL.createObjectURL(audioBlob);
  }

  throw new Error("Google TTS returned no audio content");
}

// ─── Browser SpeechSynthesis (Placeholder) ──────────────────────────────────

/**
 * Uses the Web Speech API as a zero-cost placeholder.
 * Returns a blob URL from recording the synthesis, or falls back to
 * direct utterance playback.
 */
async function _browserTTS(text, language) {
  if (!("speechSynthesis" in window)) {
    throw new Error("Browser does not support speech synthesis");
  }

  // We can't easily get a blob URL from SpeechSynthesis,
  // so we return a special marker that the audio player will handle
  return `speech:${language}:${encodeURIComponent(text)}`;
}

/**
 * Play speech using the browser's built-in SpeechSynthesis API.
 * Called by the audio player when it detects a speech: URL.
 *
 * @param {string} text — the text to speak
 * @param {string} language — "hi" | "ta" | "ta-en"
 * @returns {Promise<SpeechSynthesisUtterance>}
 */
export function playBrowserSpeech(text, language) {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(new Error("Speech synthesis not supported"));
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const langCode = TTS_CONFIG.browserVoiceLangs[language] || "hi-IN";
    utterance.lang = langCode;
    utterance.rate = 0.85; // Slightly slower for clarity
    utterance.pitch = 1.0;

    // Try to find a matching voice
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find((v) => v.lang.startsWith(langCode.split("-")[0]));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.onend = () => resolve(utterance);
    utterance.onerror = (e) => reject(new Error(`Speech synthesis error: ${e.error}`));

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Stop any ongoing browser speech synthesis.
 */
export function stopBrowserSpeech() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function _base64ToBlob(base64, contentType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}
