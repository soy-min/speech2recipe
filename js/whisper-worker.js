import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2';

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
      const result = await transcriber(data.audioUrl, {
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
