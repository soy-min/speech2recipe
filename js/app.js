import { VoiceRecorder } from './voice.js';
import { structureRecipe } from './llm.js';
import { getApiKey, saveApiKey, getLang, saveLang, saveRecipe } from './storage.js';
import { renderRecipeCard, shareRecipe } from './recipe-render.js';
import { isAuthenticated, authenticate } from './auth.js';

const $ = id => document.getElementById(id);

const apiKeyInput = $('api-key');
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

const authOverlay = $('auth-overlay');
const authForm = $('auth-form');
const authCodeInput = $('auth-code');
const authError = $('auth-error');

let currentRecipe = null;

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

function initApp() {
  const key = getApiKey();
  if (key) {
    apiKeyInput.value = key;
    enableRecording();
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
    recordBtn.classList.toggle('recording', state === 'recording');
  },
});

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
  transcriptPanel.hidden = true;
  resultPanel.hidden = true;
  currentRecipe = null;
});

structureBtn.addEventListener('click', async () => {
  const transcript = transcriptText.textContent.trim();
  if (!transcript) return;

  const apiKey = getApiKey();
  if (!apiKey) return alert('Please set your API key first.');

  recorder.stop();
  resultPanel.hidden = false;
  loading.hidden = false;
  recipeOutput.innerHTML = '';
  resultActions.hidden = true;

  try {
    currentRecipe = await structureRecipe(transcript, apiKey);
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
