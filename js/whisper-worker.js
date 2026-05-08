import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2';

// The HuggingFace XET-bridge CDN omits Content-Length from Access-Control-Expose-Headers,
// so the browser's CORS policy hides it from fetch(). transformers.js warns when it can't
// read content-length, but falls back to dynamic buffer expansion — download is correct.
// Suppress to avoid misleading noise in the browser console.
const _origWarn = self.console.warn.bind(self.console);
self.console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('content-length')) return;
  _origWarn(...args);
};

// Use IndexedDB cache — avoids re-downloading model on subsequent visits
env.allowLocalModels = false;
env.useBrowserCache = true;
// Single-threaded WASM: works without cross-origin isolation headers (needed for GitHub Pages)
env.backends.onnx.wasm.numThreads = 1;

let transcriber = null;

self.onmessage = async ({ data }) => {
  if (data.type === 'load') {
    try {
      transcriber = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-small',
        { progress_callback: p => self.postMessage({ type: 'progress', progress: p }) }
      );
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }

  if (data.type === 'transcribe') {
    try {
      const langCode = data.language ? data.language.split('-')[0] : undefined;
      const result = await transcriber(data.audioData, {
        task: 'transcribe',
        language: langCode,
        return_timestamps: false,
      });
      self.postMessage({ type: 'result', text: result.text.trim() });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};
