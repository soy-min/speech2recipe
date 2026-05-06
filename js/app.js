import { VoiceRecorder } from './voice.js';
import { structureRecipe, transcribeAudio } from './llm.js';
import { getApiKey, saveApiKey, getLang, saveLang, saveRecipe, getProvider, saveProvider, getModel, saveModel, detectProvider } from './storage.js';
import { renderRecipeCard, shareRecipe } from './recipe-render.js';
import { isAuthenticated, authenticate } from './auth.js';

const $ = id => document.getElementById(id);

const apiKeyInput = $('api-key');
const providerSelect = $('provider-select');
const modelGroup = $('model-group');
const modelInput = $('model-input');
const saveKeyBtn = $('save-key');
const langSelect = $('lang-select');
const recordBtn = $('record-btn');
const recordStatus = $('record-status');
const transcriptPanel = $('transcript-panel');
const transcriptText = $('transcript-text');
const clearBtn = $('clear-btn');
const structureBtn = $('structure-btn');
const resultPanel = $('result-panel');
const loading = $('loading');
const recipeOutput = $('recipe-output');
const resultActions = $('result-actions');
const saveRecipeBtn = $('save-recipe-btn');
const shareRecipeBtn = $('share-recipe-btn');
const tryAgainBtn = $('try-again-btn');
const fallbackPanel = $('fallback-panel');
const fallbackInput = $('fallback-input');

const authOverlay = $('auth-overlay');
const authForm = $('auth-form');
const authCodeInput = $('auth-code');
const authError = $('auth-error');

let currentRecipe = null;
let pendingAudio = null; // audio blob from MediaRecorder mode (Brave)

function showAuthOverlay() {
  authOverlay.hidden = false;
  authCodeInput.focus();
}

function hideAuthOverlay() {
  authOverlay.hidden = true;
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const ok = await authenticate(authCodeInput.value);
  if (ok) {
    authCodeInput.value = '';
    authError.hidden = true;
    hideAuthOverlay();
    initApp();
  } else {
    authError.hidden = false;
    authCodeInput.select();
  }
});

function init() {
  if (!isAuthenticated()) {
    showAuthOverlay();
    return;
  }
  initApp();
}

function updateModelVisibility() {
  modelGroup.hidden = providerSelect.value !== 'openrouter';
}

apiKeyInput.addEventListener('input', () => {
  const detected = detectProvider(apiKeyInput.value.trim());
  if (detected) {
    providerSelect.value = detected;
    updateModelVisibility();
  }
});

providerSelect.addEventListener('change', updateModelVisibility);

function initApp() {
  const key = getApiKey();
  if (key) {
    apiKeyInput.value = key;
    providerSelect.value = getProvider();
    modelInput.value = getModel();
    updateModelVisibility();
    enableRecording();
  } else {
    document.querySelector('#settings-panel details').open = true;
  }
  const lang = getLang();
  if (lang) langSelect.value = lang;
}

function enableRecording() {
  recordBtn.disabled = false;
  recordStatus.textContent = 'Press to start recording';
}

function resolvedLang() {
  const val = langSelect.value;
  return val === 'auto' ? (navigator.language || 'en-US') : val;
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return alert('Please enter a valid API key.');
  saveApiKey(key);
  saveProvider(providerSelect.value);
  saveModel(modelInput.value.trim());
  saveLang(langSelect.value);
  enableRecording();
  document.querySelector('details').removeAttribute('open');
});

langSelect.addEventListener('change', () => saveLang(langSelect.value));

const recorder = new VoiceRecorder({
  onTranscript: (text, isInterim) => {
    transcriptText.textContent = text;
    transcriptPanel.hidden = !text;
  },
  onStatusChange: (state, message) => {
    recordStatus.textContent = message;
    recordBtn.classList.toggle('recording', state === 'recording' || state === 'retrying');
    if (state === 'fallback' || state === 'retrying') {
      transcriptPanel.hidden = false;
      fallbackPanel.hidden = false;
      if (state === 'fallback') fallbackInput.focus();
    }
    if (state === 'audio-ready') {
      transcriptPanel.hidden = false; // expose Structure Recipe button
    }
  },
});

recorder.onAudioReady = (blob) => {
  pendingAudio = blob;
};

recordBtn.addEventListener('click', () => {
  if (recorder.isRecording) {
    recorder.stop();
  } else {
    recorder.lang = resolvedLang();
    recorder.start();
  }
});

clearBtn.addEventListener('click', () => {
  recorder.reset();
  transcriptText.textContent = '';
  fallbackInput.value = '';
  fallbackPanel.hidden = true;
  transcriptPanel.hidden = true;
  resultPanel.hidden = true;
  currentRecipe = null;
  pendingAudio = null;
});

structureBtn.addEventListener('click', async () => {
  const voiceText = transcriptText.textContent.trim();
  const typedText = fallbackInput.value.trim();
  let transcript = voiceText || typedText;

  // If we have a locally recorded audio blob but no text yet, transcribe first
  const audio = pendingAudio;
  if (!transcript && !audio) return;

  const apiKey = getApiKey();
  if (!apiKey) return alert('Please set your API key first.');

  recorder.stop();
  resultPanel.hidden = false;
  loading.hidden = false;
  recipeOutput.innerHTML = '';
  resultActions.hidden = true;

  try {
    const provider = getProvider();
    const model = getModel() || null;
    const loadingMsg = loading.querySelector('p');

    if (!transcript && audio) {
      loadingMsg.textContent = 'Transcribing your recording…';
      try {
        const text = await transcribeAudio(audio, apiKey, provider);
        if (text) {
          transcript = text;
          transcriptText.textContent = text;
          pendingAudio = null;
        } else {
          // Provider doesn't support audio transcription — show text fallback
          loading.hidden = true;
          resultPanel.hidden = true;
          fallbackPanel.hidden = false;
          fallbackInput.placeholder = 'Transkription nicht verfügbar (Anthropic unterstützt kein Audio). Beschreibe dein Rezept:';
          fallbackInput.focus();
          return;
        }
      } catch (err) {
        loading.hidden = true;
        resultPanel.hidden = true;
        recipeOutput.innerHTML = `<div style="padding:1.5rem;color:var(--color-danger)">Transcription failed: ${err.message}</div>`;
        resultPanel.hidden = false;
        return;
      }
    }

    if (!transcript) { loading.hidden = true; resultPanel.hidden = true; return; }

    loadingMsg.textContent = 'Structuring your recipe…';
    currentRecipe = await structureRecipe(transcript, apiKey, provider, model);
    const card = renderRecipeCard(currentRecipe);
    recipeOutput.appendChild(card);
    resultActions.hidden = false;
  } catch (err) {
    recipeOutput.innerHTML = `<div style="padding:1.5rem;color:var(--color-danger)">Error: ${err.message}</div>`;
  } finally {
    loading.hidden = true;
  }
});

shareRecipeBtn.addEventListener('click', () => {
  if (currentRecipe) shareRecipe(currentRecipe);
});

saveRecipeBtn.addEventListener('click', () => {
  if (!currentRecipe) return;
  saveRecipe(currentRecipe);
  saveRecipeBtn.textContent = '✓ Saved!';
  saveRecipeBtn.disabled = true;
  setTimeout(() => {
    saveRecipeBtn.textContent = 'Save to Recipe Book';
    saveRecipeBtn.disabled = false;
  }, 2000);
});

tryAgainBtn.addEventListener('click', () => {
  resultPanel.hidden = true;
  currentRecipe = null;
});

init();

// Scroll-reveal for marketing sections
const revealObserver = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.15 }
);
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
