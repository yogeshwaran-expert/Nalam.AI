/**
 * Nalam AI (நலம்) — 3D Interactive & Accessible Voice Engine
 */

import { extractDocument, setApiConfig, getApiConfig, ApiError } from './api/client.js';
import { buildSpokenScript } from './voice/scriptBuilder.js';

// ─── Module-level state for voice playback ──────────────────────────────────
let lastExtractionResult = null;
let currentVoiceLang = 'ta';

document.addEventListener('DOMContentLoaded', () => {
  // Check if reduced motion is requested
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  initHamburgerAndTheme();
  initWholeBodyLanguageTranslation();
  initActionRail();
  initHeroScroll3D(prefersReducedMotion);
  initSpeechSynthesis();
  initLanguageFlipCards();
  initSafetySealTilt(prefersReducedMotion);
  initFileUploadDemo();
  initApiModeToggle();
});

/* ==========================================================
   HAMBURGER SANDWICH MENU & THEME SWITCHER
   ========================================================== */
function initHamburgerAndTheme() {
  const hamburgerBtn = document.getElementById('hamburger-menu-btn');
  const menuPanel = document.getElementById('header-menu-panel');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeToggleLabel = document.getElementById('theme-toggle-label');

  // Hamburger Toggle
  if (hamburgerBtn && menuPanel) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menuPanel.classList.toggle('open');
      hamburgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!menuPanel.contains(e.target) && !hamburgerBtn.contains(e.target)) {
        menuPanel.classList.remove('open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Theme Switcher Toggle
  if (themeToggleBtn && themeToggleLabel) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.body.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', newTheme);
      themeToggleLabel.textContent = newTheme === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode';
    });
  }
}

/* ==========================================================
   WHOLE BODY LANGUAGE TRANSLATION DICTIONARY & ENGINE
   ========================================================== */
const translations = {
  ta: {
    brand_subtitle: "நலம் — அனைவருக்கும் நலம்",
    listen_btn: "கேட்க / Listen",
    icon_badge: "குரல் வழி AI சுகாதார உதவி",
    hero_headline: "மருத்துவரின் கையெழுத்தைப் படிக்க முடியவில்லையா? <span>கேளுங்கள்.</span>",
    hero_subhead: "உங்கள் மருந்துச் சீட்டைப் படம் பிடியுங்கள். நலம் AI அதைத் தமிழ், ஹிந்தி அல்லது தங்க்லீஷில் படித்துக் காட்டும்.",
    doctor_caption: "உங்கள் நம்பிக்கையான டிஜிட்டல் சுகாதாரத் தோழன்",
    scrawl_badge: "⚠️ படிக்கக் கடினமான கையெழுத்து",
    scrawl_note: "❓ குழப்பமான மருத்துவக் குறியீடுகள்",
    verified_tag: "✅ நலம் AI சரிபார்க்கப்பட்டது",
    scroll_prompt: "👇 கையெழுத்தை மாற்ற கீழே உருட்டவும்",
    how_tag: "மிகவும் எளிமையானது • வாசிக்கத் தேவையில்லை",
    how_title: "நலம் AI செயல்படும் 3 படிகள்",
    step1_title: "படம் பிடியுங்கள்",
    step1_desc: "உங்கள் தொலைபேசி கேமராவை மருந்துச் சீட்டை நோக்கிப் பிடியுங்கள்.",
    step2_title: "AI படித்துச் சரிபார்க்கும்",
    step2_desc: "எங்கள் AI மருத்துவர் கையெழுத்தைப் படித்துச் சரியான அளவைச் சரிபார்க்கும்.",
    step3_title: "உங்கள் மொழியில் கேளுங்கள்",
    step3_desc: "துல்லியமான நேரம் மற்றும் வழிமுறைகளை உரக்கக் கேட்டுத் தெரிந்துகொள்ளுங்கள்.",
    lang_tag: "Languages • மொழிகள் • भाषाएं",
    lang_title: "குரல் மாதிரி கேட்க தட்டவும்",
    safety_seal_text: "சரிபார்க்கப்பட்ட வாசிப்பு",
    safety_doses_title: "தானியங்கி அளவு சரிபார்ப்பு",
    safety_doses_desc: "மருந்து அளவு அதிகமாக இருந்தால் எச்சரிக்கும்.",
    safety_alert_title: "மருந்து வினைகள் எச்சரிக்கை",
    safety_alert_desc: "ஒன்றுக்கும் மேற்பட்ட மருந்துகள் இருக்கும்போது ஆபத்துக்களைச் சுட்டிக்காட்டும்.",
    safety_confidence_title: "98.4% கையெழுத்துத் துல்லியம்",
    safety_confidence_desc: "தெளிவில்லாத எழுத்துக்களை அடையாளம் காட்டும்.",
    upload_title: "உங்கள் மருந்துச் சீட்டை பதிவேற்றிப் பாருங்கள்",
    upload_subtitle: "படம் அல்லது PDF-ஐ இழுத்து வந்து போடுங்கள்",
    demo_badge: "சாதனத்தின் உள்ளேயே இயங்கும் செயல்முறை • அதிகபட்சம் 10MB",
    drop_prompt: "இங்கே கோப்பை போடுங்கள்",
    drop_hint: "JPG, PNG, WEBP, PDF ஆதரவு (10MB வரை)",
    browse_btn: "கோப்பைத் தேர்ந்தெடுங்கள்",
    disclaimer_text: "<strong>மருத்துவப் பொறுப்புத் துறப்பு:</strong> நலம் AI ஒரு வாசிப்பு உதவி மட்டுமே, மருத்துவக் கண்டறிதல் அல்ல. மருந்துகள் மற்றும் அளவுகளை உங்கள் மருத்துவரிடம் சரிபார்க்கவும்."
  },
  en: {
    brand_subtitle: "Nalam — Wellness for All",
    listen_btn: "Listen / கேட்க",
    icon_badge: "Voice-First AI Healthcare Aid",
    hero_headline: "Can't read doctor's writing? <span>Listen to it.</span>",
    hero_subhead: "Snap a photo of your prescription or medicine strip. Nalam AI speaks it back clearly in Tamil, Hindi, or Tanglish.",
    doctor_caption: "Your trusted digital health reading companion",
    scrawl_badge: "⚠️ Hard to Read Scrawl",
    scrawl_note: "❓ Confusing medical symbols & scrawl",
    verified_tag: "✅ Nalam AI Verified",
    scroll_prompt: "👇 Scroll down to translate scrawl",
    how_tag: "Super Simple • No Reading Required",
    how_title: "How Nalam AI Works in 3 Steps",
    step1_title: "Take a Photo",
    step1_desc: "Point your phone camera at your handwritten paper or medicine strip.",
    step2_title: "AI Reads & Checks",
    step2_desc: "Our intelligent vision engine deciphers doctor scrawl & verifies safe dosage.",
    step3_title: "Listen in Your Language",
    step3_desc: "Hear exact timing & instructions read out loud in Tamil, Hindi, or Tanglish.",
    lang_tag: "Languages • மொழிகள் • भाषाएं",
    lang_title: "Tap to Hear Spoken Preview",
    safety_seal_text: "VERIFIED READ",
    safety_doses_title: "Automatic Dosage Cross-Check",
    safety_doses_desc: "Warns if a dosage appears unusually high or conflicts with standard limits.",
    safety_alert_title: "Drug Interaction Alert",
    safety_alert_desc: "Highlights potential risks when multiple medicines are prescribed together.",
    safety_confidence_title: "98.4% Handwriting Confidence",
    safety_confidence_desc: "Flags blurry or ambiguous scrawl so you can double-check with your chemist.",
    upload_title: "Try Uploading Your Prescription",
    upload_subtitle: "Drag and drop an image or PDF to test the reader",
    demo_badge: "Client-side Interactive Demo • Max 10MB",
    drop_prompt: "Drop your prescription file here",
    drop_hint: "Supports JPG, PNG, WEBP, PDF (Max 10MB)",
    browse_btn: "Choose File",
    disclaimer_text: "<strong>Medical Disclaimer:</strong> Nalam AI is an assistive reading aid and accessibility tool, not a professional medical diagnosis. Always confirm medicines, dosages, and administration instructions directly with your doctor or qualified pharmacist."
  },
  hi: {
    brand_subtitle: "नलम — सभी के लिए कल्याण",
    listen_btn: "सुनें / Listen",
    icon_badge: "आवाज-प्रथम एआई स्वास्थ्य सहायता",
    hero_headline: "डॉक्टर की लिखावट नहीं पढ़ सकते? <span>इसे सुनें।</span>",
    hero_subhead: "अपने नुस्खे या दवा की पट्टी की फोटो लें। नलम AI इसे हिंदी, तमिल या तंग्लिश में स्पष्ट रूप से सुनाता है।",
    doctor_caption: "आपका भरोसेमंद डिजिटल स्वास्थ्य साथी",
    scrawl_badge: "⚠️ पढ़ने में कठिन लिखावट",
    scrawl_note: "❓ उलझन भरे मेडिकल प्रतीक",
    verified_tag: "✅ नलम AI सत्यापित",
    scroll_prompt: "👇 लिखावट अनुवाद करने के लिए नीचे स्क्रॉल करें",
    how_tag: "अत्यंत सरल • पढ़ने की आवश्यकता नहीं",
    how_title: "नलम AI 3 चरणों में कैसे काम करता है",
    step1_title: "फोटो लें",
    step1_desc: "अपने फोन के कैमरे को अपने लिखे हुए कागज या दवा की पट्टी पर रखें।",
    step2_title: "एआई पढ़ता और जांचता है",
    step2_desc: "हमारा इंटेलिजेंट विजन इंजन लिखावट को पढ़ता है और सुरक्षित खुराक की जांच करता है।",
    step3_title: "अपनी भाषा में सुनें",
    step3_desc: "तमिल, हिंदी या तंग्लिश में सही समय और निर्देश जोर से सुनें।",
    lang_tag: "Languages • மொழிகள் • भाषाएं",
    lang_title: "बोलने का पूर्वावलोकन सुनने के लिए टैप करें",
    safety_seal_text: "सत्यापित पठन",
    safety_doses_title: "स्वचालित खुराक जांच",
    safety_doses_desc: "यदि खुराक असामान्य रूप से अधिक लगती है तो चेतावनी देता है।",
    safety_alert_title: "दवा पारस्परिक क्रिया चेतावनी",
    safety_alert_desc: "एक साथ कई दवाएं लिखे जाने पर संभावित जोखिमों को उजागर करता है।",
    safety_confidence_title: "98.4% लिखावट सटीकता",
    safety_confidence_desc: "धुंधली लिखावट को फ्लैग करता है ताकि आप फार्मासिस्ट से दोबारा जांच सकें।",
    upload_title: "अपना नुस्खा अपलोड करके देखें",
    upload_subtitle: "रीडर का परीक्षण करने के लिए एक छवि या पीडीएफ खींचें और छोड़ें",
    demo_badge: "क्लाइंट-साइड इंटरैक्टिव डेमो • अधिकतम 10MB",
    drop_prompt: "अपनी नुस्खा फ़ाइल यहाँ छोड़ें",
    drop_hint: "JPG, PNG, WEBP, PDF का समर्थन करता है (अधिकतम 10MB)",
    browse_btn: "फ़ाइल चुनें",
    disclaimer_text: "<strong>चिकित्सा अस्वीकरण:</strong> नलम AI एक सहायक पठन सहायता है, पेशेवर चिकित्सा निदान नहीं। हमेशा अपने डॉक्टर या योग्य फार्मासिस्ट से दवाओं और खुराक की पुष्टि करें।"
  }
};

function initWholeBodyLanguageTranslation() {
  const langBtns = document.querySelectorAll('.lang-option-btn');

  langBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const langCode = btn.getAttribute('data-lang-code');
      if (!langCode || !translations[langCode]) return;

      // Update active state in UI
      langBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Perform Whole-Body DOM Translation
      translateWholePage(langCode);
    });
  });
}

function translateWholePage(langCode) {
  const langDict = translations[langCode];
  if (!langDict) return;

  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (langDict[key]) {
      el.innerHTML = langDict[key];
    }
  });
}

/* ==========================================================
   1. LEFT ACTION RAIL & POP-UP MODALS INTEGRATION
   ========================================================== */
function initActionRail() {
  const hospitalBtn = document.getElementById('rail-btn-hospital');
  const pharmacyBtn = document.getElementById('rail-btn-pharmacy');
  const hospitalModal = document.getElementById('hospital-modal');
  const pharmacyModal = document.getElementById('pharmacy-modal');
  const launchHospitalBtn = document.getElementById('launch-hospital-map-btn');
  const launchPharmacyBtn = document.getElementById('launch-pharmacy-map-btn');
  const closeBtns = document.querySelectorAll('[data-close-modal]');

  // Open Modals on Button Click
  if (hospitalBtn && hospitalModal) {
    hospitalBtn.addEventListener('click', () => {
      openModal(hospitalModal);
    });
  }

  if (pharmacyBtn && pharmacyModal) {
    pharmacyBtn.addEventListener('click', () => {
      openModal(pharmacyModal);
    });
  }

  // Launch Maps from inside Modals
  if (launchHospitalBtn) {
    launchHospitalBtn.addEventListener('click', () => {
      openMapsQuery('hospitals near me');
      closeAllModals();
    });
  }

  if (launchPharmacyBtn) {
    launchPharmacyBtn.addEventListener('click', () => {
      openMapsQuery('pharmacies near me');
      closeAllModals();
    });
  }

  // Close Modals on X Click
  closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      closeAllModals();
    });
  });

  // Close Modals on Backdrop Click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeAllModals();
      }
    });
  });

  // Close Modals on Escape Key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden'; // Lock scroll while modal is open
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.classList.remove('active');
  });
  document.body.style.overflow = '';
}

function openMapsQuery(query) {
  if ('geolocation' in navigator) {
    // Request location access
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},14z`;
        window.open(mapsUrl, '_blank', 'noopener,noreferrer');
      },
      (error) => {
        // Fallback without coordinates if permission denied or error
        console.warn('Geolocation fallback:', error.message);
        const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
        window.open(mapsUrl, '_blank', 'noopener,noreferrer');
      },
      { timeout: 8000 }
    );
  } else {
    // Fallback if geolocation unavailable
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  }
}

/* ==========================================================
   2. HERO 3D SCROLL-LINKED PRESCRIPTION TRANSFORMATION
   ========================================================== */
function initHeroScroll3D(reducedMotion) {
  if (reducedMotion) return;

  const cardTransform = document.getElementById('card-3d-transform');
  const cardScrawl = document.getElementById('card-scrawl-view');
  const cardTranslated = document.getElementById('card-translated-view');
  const scrollTrigger = document.getElementById('scroll-3d-trigger');

  if (!cardTransform || !cardScrawl || !cardTranslated || !scrollTrigger) return;

  let ticking = false;

  function update3DCardOnScroll() {
    const triggerRect = scrollTrigger.getBoundingClientRect();
    const windowHeight = window.innerHeight;

    // Calculate scroll progress relative to viewport (0 = top, 1 = scrolled past)
    const startPoint = windowHeight * 0.8;
    const endPoint = windowHeight * 0.2;
    
    let progress = (startPoint - triggerRect.top) / (startPoint - endPoint);
    progress = Math.max(0, Math.min(1, progress)); // Clamp between 0.0 and 1.0

    // Interpolate 3D Transformations
    const rotateX = (1 - progress) * 25; // 25deg -> 0deg
    const rotateY = (1 - progress) * -15; // -15deg -> 0deg
    const scale = 0.92 + (progress * 0.08); // 0.92 -> 1.0

    // Apply 3D transform matrix
    cardTransform.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`;

    // Crossfade Card Opacities
    cardScrawl.style.opacity = (1 - progress).toFixed(2);
    cardTranslated.style.opacity = progress.toFixed(2);

    if (progress > 0.5) {
      cardScrawl.setAttribute('aria-hidden', 'true');
      cardTranslated.setAttribute('aria-hidden', 'false');
    } else {
      cardScrawl.setAttribute('aria-hidden', 'false');
      cardTranslated.setAttribute('aria-hidden', 'true');
    }

    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(update3DCardOnScroll);
      ticking = true;
    }
  }, { passive: true });

  // Initial call
  update3DCardOnScroll();
}

/* ==========================================================
   3. WEB SPEECH SYNTHESIS VOICE ENGINE
   ========================================================== */
function initSpeechSynthesis() {
  const introBtn = document.getElementById('main-voice-intro-btn');
  const speakItemBtns = document.querySelectorAll('.speak-item-btn');
  const playLangSpeechBtns = document.querySelectorAll('.play-lang-speech-btn');

  const introSpeechText = "வணக்கம்! Nalam AI-க்கு வரவேற்கிறோம். உங்கள் மருந்துச் சீட்டைப் படம் பிடியுங்கள். நாங்கள் தமிழ், ஹிந்தி அல்லது தங்க்லீஷில் படித்துக் காட்டுகிறோம்.";

  if (introBtn) {
    introBtn.addEventListener('click', () => {
      speakText(introSpeechText, 'ta-IN');
    });
  }

  speakItemBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.getAttribute('data-text');
      if (text) {
        speakText(text, 'ta-IN');
      }
    });
  });

  playLangSpeechBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const lang = btn.getAttribute('data-lang') || 'ta-IN';
      const text = btn.getAttribute('data-speech');
      if (text) {
        speakText(text, lang);
      }
    });
  });
}

function speakText(text, lang = 'ta-IN') {
  if (!('speechSynthesis' in window)) {
    alert(`Voice playback: ${text}`);
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9; // Slightly slower pace for low-literacy clarity
  utterance.pitch = 1.0;

  // Find suitable voice if available
  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = voices.find(v => v.lang.startsWith(lang.split('-')[0]));
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  window.speechSynthesis.speak(utterance);
}

/* ==========================================================
   4. LANGUAGE 3D FLIP CARD ACCESSIBILITY
   ========================================================== */
function initLanguageFlipCards() {
  const flipCards = document.querySelectorAll('.flip-card');

  flipCards.forEach(card => {
    // Click toggle for touch mobile
    card.addEventListener('click', () => {
      card.classList.toggle('flipped');
    });

    // Keyboard Accessibility (Enter or Space)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.classList.toggle('flipped');
      }
    });
  });
}

/* ==========================================================
   5. SAFETY SEAL 3D MOUSE GYRO EFFECT
   ========================================================== */
function initSafetySealTilt(reducedMotion) {
  if (reducedMotion) return;

  const seal = document.getElementById('interactive-safety-seal');
  if (!seal) return;

  seal.addEventListener('mousemove', (e) => {
    const rect = seal.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;

    const rotateX = (-mouseY / rect.height) * 30; // Tilt range -15 to +15 deg
    const rotateY = (mouseX / rect.width) * 30;

    seal.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.08)`;
  });

  seal.addEventListener('mouseleave', () => {
    seal.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)';
  });
}

/* ==========================================================
   6. DRAG-AND-DROP FILE UPLOAD + REAL API INTEGRATION
   ========================================================== */
function initFileUploadDemo() {
  const dropZone = document.getElementById('prescription-drop-zone');
  const fileInput = document.getElementById('prescription-file-input');
  const browseBtn = dropZone ? dropZone.querySelector('.btn-browse') : null;
  const previewContainer = document.getElementById('upload-preview-container');
  const loadingState = document.getElementById('results-loading');
  const errorState = document.getElementById('results-error');
  const resultsPanel = document.getElementById('results-panel');
  const previewImg = document.getElementById('preview-image-element');
  const tryAgainBtn = document.getElementById('btn-try-again');

  if (!dropZone || !fileInput) return;

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  // Browse button opens native file picker
  if (browseBtn) {
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  dropZone.addEventListener('click', () => fileInput.click());

  // Drag over / leave styles
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) handleUploadedFile(files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleUploadedFile(fileInput.files[0]);
    }
  });

  // Try Again button resets back to drop zone
  if (tryAgainBtn) {
    tryAgainBtn.addEventListener('click', () => {
      showState('idle');
      fileInput.value = '';
    });
  }

  // Initialize voice controls in the results panel
  initVoiceControls();

  // ── State management ────────────────────────────────────────────────────
  function showState(state) {
    if (previewContainer) previewContainer.style.display = state === 'idle' ? 'none' : 'block';
    if (loadingState) loadingState.style.display = state === 'loading' ? 'flex' : 'none';
    if (errorState) errorState.style.display = state === 'error' ? 'flex' : 'none';
    if (resultsPanel) resultsPanel.style.display = state === 'results' ? 'block' : 'none';
  }

  // ── Main upload handler ─────────────────────────────────────────────────
  async function handleUploadedFile(file) {
    // File size validation
    if (file.size > MAX_FILE_SIZE) {
      alert(`File size exceeds 10MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please upload a smaller file.`);
      fileInput.value = '';
      return;
    }

    // Show image preview
    if (file.type.startsWith('image/') && previewImg) {
      const reader = new FileReader();
      reader.onload = (e) => { previewImg.src = e.target.result; };
      reader.readAsDataURL(file);
    } else if (previewImg) {
      previewImg.src = 'hero_doctor_patient.png';
    }

    // Show loading state and scroll into view
    showState('loading');
    if (previewContainer) {
      previewContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Call the API (mock or live depending on current mode)
    try {
      const response = await extractDocument(file);
      lastExtractionResult = response;
      renderResults(response);
      showState('results');
    } catch (err) {
      console.error('Extraction failed:', err);
      const errorMsg = document.getElementById('error-message-text');
      if (errorMsg) {
        errorMsg.textContent = (err && err.userMessage)
          ? err.userMessage
          : 'Something went wrong while reading your document. Please try again.';
      }
      showState('error');
    }
  }
}

/* ==========================================================
   7. API MODE TOGGLE (MOCK / LIVE)
   ========================================================== */
function initApiModeToggle() {
  const mockBtn = document.getElementById('api-mode-mock');
  const liveBtn = document.getElementById('api-mode-live');

  if (!mockBtn || !liveBtn) return;

  mockBtn.addEventListener('click', () => {
    setApiConfig('mock');
    mockBtn.classList.add('active');
    liveBtn.classList.remove('active');
  });

  liveBtn.addEventListener('click', () => {
    setApiConfig('live');
    liveBtn.classList.add('active');
    mockBtn.classList.remove('active');
  });
}

/* ==========================================================
   8. RESULTS RENDERING ENGINE
   ========================================================== */
function renderResults(response) {
  const data = response.structured_data;
  const flags = response.flags || [];
  const doctorNote = response.doctor_note || '';

  // Document type badge
  const badge = document.getElementById('doc-type-badge');
  if (badge) {
    badge.textContent = data.document_type === 'prescription' ? '📋 Prescription' : '🧪 Lab Report';
  }

  // Patient info bar
  const patientInfo = document.getElementById('patient-info');
  if (patientInfo) {
    const parts = [];
    if (data.patient_name) parts.push(`👤 ${data.patient_name}`);
    if (data.doctor_name) parts.push(`👨‍⚕️ ${data.doctor_name}`);
    if (data.date) parts.push(`📅 ${data.date}`);
    patientInfo.textContent = parts.length > 0
      ? parts.join(' • ')
      : '👤 Patient info not available in document';
  }

  // Render extracted items (medicines or lab tests)
  const itemsList = document.getElementById('extracted-items-list');
  if (itemsList) {
    if (data.document_type === 'prescription') {
      itemsList.innerHTML = renderMedicines(data.medicines || []);
    } else {
      itemsList.innerHTML = renderLabTests(data.tests || []);
    }
  }

  // Extraction warnings
  const warningsEl = document.getElementById('extraction-warnings');
  if (warningsEl) {
    const warnings = response.extraction_warnings || [];
    if (warnings.length > 0) {
      warningsEl.style.display = 'block';
      warningsEl.innerHTML = warnings.map(w =>
        `<div class="extraction-warning-item">⚠️ ${escapeHtml(w)}</div>`
      ).join('');
    } else {
      warningsEl.style.display = 'none';
    }
  }

  // Safety flags
  renderSafetyFlags(flags);

  // Doctor note
  const noteContent = document.getElementById('doctor-note-content');
  if (noteContent) noteContent.textContent = doctorNote;
}

function renderMedicines(medicines) {
  if (medicines.length === 0) {
    return '<div class="no-data-msg">No medicines found in this document.</div>';
  }

  return medicines.map((med, i) => `
    <div class="extracted-item-row">
      <div class="item-row-header">
        <span class="item-number">${i + 1}</span>
        <span class="item-name">💊 ${escapeHtml(med.name)}</span>
        <span class="item-dosage">${escapeHtml(med.dosage)}</span>
      </div>
      <div class="item-details">
        <span class="item-detail-chip">🕐 ${escapeHtml(med.frequency)}</span>
        <span class="item-detail-chip">📅 ${escapeHtml(med.duration)}</span>
        ${med.instructions ? `<span class="item-detail-chip">📝 ${escapeHtml(med.instructions)}</span>` : ''}
      </div>
      <div class="confidence-row">
        <span class="confidence-label">Confidence</span>
        <div class="confidence-bar-track">
          <div class="confidence-bar-fill" style="width: ${(med.confidence * 100).toFixed(0)}%; background-color: ${getConfidenceColor(med.confidence)};"></div>
        </div>
        <span class="confidence-value">${(med.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  `).join('');
}

function renderLabTests(tests) {
  if (tests.length === 0) {
    return '<div class="no-data-msg">No test results found in this document.</div>';
  }

  return tests.map((test, i) => `
    <div class="extracted-item-row">
      <div class="item-row-header">
        <span class="item-number">${i + 1}</span>
        <span class="item-name">🧪 ${escapeHtml(test.test_name)}</span>
        <span class="item-dosage">${escapeHtml(test.value)} ${escapeHtml(test.unit)}</span>
      </div>
      <div class="item-details">
        ${test.reference_range ? `<span class="item-detail-chip">📊 Ref: ${escapeHtml(test.reference_range)}</span>` : ''}
      </div>
      <div class="confidence-row">
        <span class="confidence-label">Confidence</span>
        <div class="confidence-bar-track">
          <div class="confidence-bar-fill" style="width: ${(test.confidence * 100).toFixed(0)}%; background-color: ${getConfidenceColor(test.confidence)};"></div>
        </div>
        <span class="confidence-value">${(test.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  `).join('');
}

function renderSafetyFlags(flags) {
  const list = document.getElementById('safety-flags-list');
  const countBadge = document.getElementById('flags-count-badge');

  if (!list) return;

  // Update count badge
  if (countBadge) {
    const warnings = flags.filter(f => f.severity === 'warning').length;
    const cautions = flags.filter(f => f.severity === 'caution').length;
    const infos = flags.filter(f => f.severity === 'info').length;
    const parts = [];
    if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
    if (cautions > 0) parts.push(`${cautions} caution${cautions > 1 ? 's' : ''}`);
    if (infos > 0) parts.push(`${infos} info`);
    countBadge.textContent = parts.join(', ') || 'All clear ✅';
  }

  if (flags.length === 0) {
    list.innerHTML = '<div class="no-flags-msg">✅ No safety concerns found — all values within expected ranges.</div>';
    return;
  }

  const severityConfig = {
    warning: { icon: '🔴', label: 'WARNING', cssClass: 'flag-warning' },
    caution: { icon: '🟡', label: 'CAUTION', cssClass: 'flag-caution' },
    info:    { icon: '🟢', label: 'INFO',    cssClass: 'flag-info' },
  };

  list.innerHTML = flags.map(flag => {
    const config = severityConfig[flag.severity] || severityConfig.info;
    return `
      <div class="safety-flag-card ${config.cssClass}">
        <div class="flag-header">
          <span class="flag-severity-icon">${config.icon}</span>
          <span class="flag-severity-label">${config.label}</span>
          <span class="flag-related-to">${escapeHtml(flag.related_to)}</span>
        </div>
        <div class="flag-message">${escapeHtml(flag.message)}</div>
        <div class="flag-source">Source: ${escapeHtml(flag.source)}</div>
      </div>
    `;
  }).join('');
}

function getConfidenceColor(confidence) {
  if (confidence >= 0.8) return 'var(--color-olive)';
  if (confidence >= 0.5) return 'var(--color-mustard)';
  return 'var(--color-terracotta)';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/* ==========================================================
   9. VOICE CONTROLS FOR RESULTS
   ========================================================== */
function initVoiceControls() {
  const langPills = document.querySelectorAll('.voice-lang-pill');
  const playBtn = document.getElementById('voice-play-btn');
  const stopBtn = document.getElementById('voice-stop-btn');
  const transcriptBox = document.getElementById('voice-transcript-box');
  const transcriptText = document.getElementById('voice-transcript-text');

  // Language selection
  langPills.forEach(pill => {
    pill.addEventListener('click', () => {
      langPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentVoiceLang = pill.getAttribute('data-voice-lang');
    });
  });

  // Play button — builds a spoken script and reads it aloud
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (!lastExtractionResult) return;

      // Build the spoken script in the selected language
      const script = buildSpokenScript(lastExtractionResult, currentVoiceLang);

      // Show transcript panel
      if (transcriptBox) transcriptBox.style.display = 'block';
      if (transcriptText) transcriptText.textContent = script;

      // Map our language codes to Web Speech API lang codes
      const langMap = { ta: 'ta-IN', hi: 'hi-IN', 'ta-en': 'en-IN' };
      const speechLang = langMap[currentVoiceLang] || 'ta-IN';

      // Speak using the existing speakText function
      speakText(script, speechLang);

      // Toggle play/stop button visibility
      playBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'inline-flex';

      // Monitor when speech finishes to reset buttons
      const checkSpeechDone = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          clearInterval(checkSpeechDone);
          playBtn.style.display = 'inline-flex';
          if (stopBtn) stopBtn.style.display = 'none';
        }
      }, 500);
    });
  }

  // Stop button — cancels speech immediately
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      stopBtn.style.display = 'none';
      if (playBtn) playBtn.style.display = 'inline-flex';
    });
  }
}
