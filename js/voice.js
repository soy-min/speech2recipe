const LOG = (...a) => console.log('[Speech2Recipe]', ...a);
const ERR = (...a) => console.error('[Speech2Recipe]', ...a);

export class VoiceRecorder {
  constructor({ onTranscript, onStatusChange, lang }) {
    this.onTranscript = onTranscript;
    this.onStatusChange = onStatusChange;
    this.lang = lang || navigator.language || 'en-US';
    this.isRecording = false;
    this.transcript = '';
    this._mediaRecorder = null;
    // Worker state: undefined = not yet created, null = creation failed, Worker = active
    this._worker = undefined;
    this._workerReady = false;
    this._workerLoading = false;
    this._pendingBlob = null;
    this._activeBlobUrl = null;
    this.onAudioReady = null; // kept for API compatibility
  }

  get isSupported() {
    return !!(navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
  }

  _initWorker() {
    if (this._worker !== undefined) return;
    try {
      this._worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
      this._worker.onmessage = ({ data }) => this._onWorkerMessage(data);
      this._worker.onerror = err => {
        ERR('Worker error:', err);
        this._worker = null;
        this._workerLoading = false;
        this.onStatusChange('error', 'AI transcription unavailable. Type your recipe instead.');
      };
    } catch (err) {
      ERR('Worker creation failed:', err);
      this._worker = null;
      this.onStatusChange('error', 'Local AI transcription not supported in this browser. Type your recipe instead.');
    }
  }

  _onWorkerMessage(data) {
    switch (data.type) {
      case 'progress': {
        const p = data.progress;
        if (p.status === 'progress' && p.total) {
          const pct = Math.round((p.loaded / p.total) * 100);
          const file = p.file ? p.file.split('/').pop() : '';
          this.onStatusChange('loading-model', `Downloading AI model (first time only)… ${file ? file + ' ' : ''}${pct}%`);
        } else if (p.status === 'initiate' || p.status === 'download') {
          this.onStatusChange('loading-model', 'Downloading AI model (first time ~250 MB)…');
        } else if (p.status === 'loading') {
          this.onStatusChange('loading-model', 'Loading AI model…');
        }
        break;
      }
      case 'ready':
        this._workerReady = true;
        this._workerLoading = false;
        LOG('Whisper model ready');
        if (this._pendingBlob) {
          const blob = this._pendingBlob;
          this._pendingBlob = null;
          this._runTranscription(blob);
        } else {
          this.onStatusChange('idle', 'AI model ready — press to start recording');
        }
        break;
      case 'result':
        this._revokeBlobUrl();
        LOG('Transcription:', data.text);
        this.transcript = data.text;
        this.onTranscript(data.text, false);
        this.onStatusChange('idle', 'Transcription complete');
        break;
      case 'error':
        this._revokeBlobUrl();
        ERR('Transcription failed:', data.message);
        this.onStatusChange('error', 'Transcription failed. Type your recipe instead.');
        break;
    }
  }

  _revokeBlobUrl() {
    if (this._activeBlobUrl) {
      URL.revokeObjectURL(this._activeBlobUrl);
      this._activeBlobUrl = null;
    }
  }

  loadModel() {
    if (this._workerReady || this._workerLoading || this._worker === null) return;
    this._initWorker();
    if (!this._worker) return;
    this._workerLoading = true;
    this._worker.postMessage({ type: 'load' });
  }

  _runTranscription(blob) {
    const url = URL.createObjectURL(blob);
    this._activeBlobUrl = url;
    const langCode = this.lang !== 'auto' ? this.lang : null;
    LOG('Starting transcription', { bytes: blob.size, lang: langCode });
    this.onStatusChange('transcribing', 'Transcribing your recording…');
    this._worker.postMessage({ type: 'transcribe', audioUrl: url, language: langCode });
  }

  async start() {
    if (this.isRecording) return;
    if (!this.isSupported) {
      this.onStatusChange('error', 'Audio recording is not supported in this browser.');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const msg = (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
        ? 'Microphone access denied. Allow microphone in your browser settings.'
        : `Microphone error: ${err.message}`;
      this.onStatusChange('error', msg);
      return;
    }

    // Start loading model in background while user records
    this.loadModel();

    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    this._mediaRecorder = mr;
    const chunks = [];

    mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      this.isRecording = false;
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      LOG('Recording stopped', { bytes: blob.size, type: blob.type });

      if (this._workerReady) {
        this._runTranscription(blob);
      } else {
        // Model still loading — queue blob, transcription starts when model is ready
        this._pendingBlob = blob;
        if (!this._workerLoading) {
          this.loadModel();
        }
      }
    };

    mr.start(1000);
    this.isRecording = true;
    LOG('Recording started', { mimeType: mr.mimeType });
    this.onStatusChange('recording', 'Recording… click the mic again to stop');
  }

  stop() {
    const mr = this._mediaRecorder;
    this._mediaRecorder = null;
    if (mr && mr.state !== 'inactive') {
      mr.stop(); // mr.onstop fires async and sets isRecording = false
      return;
    }
    if (this.isRecording) {
      this.isRecording = false;
      this.onStatusChange('idle', 'Recording stopped');
    }
  }

  reset() {
    const mr = this._mediaRecorder;
    this._mediaRecorder = null;
    if (mr && mr.state !== 'inactive') mr.stop();
    this.isRecording = false;
    this.transcript = '';
    this._pendingBlob = null;
    this._revokeBlobUrl();
  }
}
