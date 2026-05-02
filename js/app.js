import { VoiceRecorder } from './voice.js';
import { structureRecipe } from './llm.js';
import { getApiKey, saveApiKey, saveRecipe } from './storage.js';
import { renderRecipeCard } from './recipe-render.js';

const $ = id => document.getElementById(id);

const apiKeyInput = $('api-key');
const saveKeyBtn = $('save-key');
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
const tryAgainBtn = $('try-again-btn');

let currentRecipe = null;

function init() {
  const key = getApiKey();
  if (key) {
    apiKeyInput.value = key;
    enableRecording();
  }
}

function enableRecording() {
  recordBtn.disabled = false;
  recordStatus.textContent = 'Press to start recording';
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return alert('Please enter a valid API key.');
  saveApiKey(key);
  enableRecording();
  document.querySelector('details').removeAttribute('open');
});

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
