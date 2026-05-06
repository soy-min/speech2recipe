const LOG = (...a) => console.log('[Speech2Recipe]', ...a);
const WARN = (...a) => console.warn('[Speech2Recipe]', ...a);
const ERR = (...a) => console.error('[Speech2Recipe]', ...a);

export class VoiceRecorder {
  constructor({ onTranscript, onStatusChange, lang }) {
    this.onTranscript = onTranscript;
    this.onStatusChange = onStatusChange;
    this.lang = lang || navigator.language || 'en-US';
    this.recognition = null;
    this.isRecording = false;
    this.transcript = '';
    this._retryCount = 0;
    this._maxRetries = 3;
    this._retryTimer = null;
    this._networkError = false;
    this._sessionStart = null;
    this._mediaRecorder = null;
    // Set externally: recorder.onAudioReady = (blob) => { ... }
    this.onAudioReady = null;
  }

  get isSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  async _diagnose() {
    LOG('=== Diagnostic run ===');
    LOG('Page', {
      url: window.location.href,
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      online: navigator.onLine,
    });

    let isBrave = false;
    try { isBrave = !!(await navigator.brave?.isBrave()); } catch (_) { /* not Brave */ }

    LOG('Browser', {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      isBrave,
      vendor: navigator.vendor,
    });

    if (isBrave) {
      WARN(
        'BRAVE BROWSER DETECTED — Brave blocks Google speech servers by default via Shields.',
        'Switching to local MediaRecorder mode. Audio will be transcribed via your API when you click "Structure Recipe".'
      );
    }

    LOG('Speech API', {
      nativeSpeechRecognition: 'SpeechRecognition' in window,
      webkitSpeechRecognition: 'webkitSpeechRecognition' in window,
      selectedLang: this.lang,
    });

    if (navigator.permissions) {
      try {
        const mic = await navigator.permissions.query({ name: 'microphone' });
        LOG('Microphone permission:', mic.state);
      } catch (e) {
        WARN('Could not query microphone permission:', e.message);
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      LOG('getUserMedia OK — audio tracks:', stream.getAudioTracks().map(t => ({
        label: t.label, enabled: t.enabled, readyState: t.readyState,
      })));
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      ERR('getUserMedia FAILED:', e.name, e.message);
    }

    try {
      const t0 = Date.now();
      await fetch('https://www.google.com/generate_204', { mode: 'no-cors', cache: 'no-store' });
      LOG(`Google HTTPS reachable (${Date.now() - t0} ms)`);
    } catch (e) {
      ERR('Google HTTPS NOT reachable:', e.message);
    }

    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (cspMeta) WARN('CSP meta tag found:', cspMeta.content);
    else LOG('No CSP meta tag in document');

    LOG('=== End diagnostic ===');
    return { isBrave };
  }

  async _startMediaRecorderMode() {
    LOG('Starting MediaRecorder mode (Brave-compatible local recording)');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      ERR('getUserMedia failed in MediaRecorder mode:', err.name, err.message);
      this.isRecording = false;
      this.onStatusChange('error', 'Microphone access denied. Allow microphone in your browser settings and try again.');
      return;
    }

    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    this._mediaRecorder = mr;
    const chunks = [];

    mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      LOG('MediaRecorder stopped', { size: blob.size, type: blob.type });
      if (this.onAudioReady) this.onAudioReady(blob);
      this.onStatusChange('audio-ready', 'Recording captured — click "Structure Recipe" to transcribe and structure.');
    };

    mr.start(1000);
    LOG('MediaRecorder started', { mimeType: mr.mimeType });
    this.onStatusChange('recording', 'Recording… click the mic again to stop');
  }

  _buildRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const apiType = 'SpeechRecognition' in window ? 'native' : 'webkit';
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;

    LOG('Building recognition session', { apiType, lang: rec.lang });

    rec.onstart = () => {
      this._sessionStart = Date.now();
      LOG('onstart — session began', { lang: rec.lang, retryCount: this._retryCount });
      this.onStatusChange('recording', 'Recording… speak your recipe');
    };

    rec.onresult = (event) => {
      this._retryCount = 0;
      LOG('onresult', {
        resultIndex: event.resultIndex,
        totalResults: event.results.length,
        elapsed: this._sessionStart ? `${Date.now() - this._sessionStart}ms` : '?',
      });
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += text + ' ';
        else interim += text;
      }
      this.transcript += final;
      this.onTranscript(this.transcript + interim, !!interim);
    };

    rec.onerror = (event) => {
      ERR('onerror', {
        error: event.error,
        message: event.message || '(none)',
        online: navigator.onLine,
        elapsed: this._sessionStart ? `${Date.now() - this._sessionStart}ms` : '?',
        retryCount: this._retryCount,
        lang: rec.lang,
        hostname: window.location.hostname,
      });
      if (event.error === 'no-speech') return;
      if (event.error === 'network') {
        WARN('Network error — Google speech servers unreachable. Possible causes: VPN, firewall, browser policy, audio conflict.');
        this._networkError = true;
        return;
      }
      ERR('Fatal error — stopping', event.error);
      this.isRecording = false;
      this.onStatusChange('error', this._friendlyError(event.error));
    };

    rec.onend = () => {
      const elapsed = this._sessionStart ? Date.now() - this._sessionStart : null;
      LOG('onend', {
        isRecording: this.isRecording,
        networkError: this._networkError,
        retryCount: this._retryCount,
        elapsedMs: elapsed,
      });
      if (elapsed !== null && elapsed < 300 && this._networkError) {
        WARN('Session ended in <300ms with network error — WebSocket to Google was never established.');
      }
      if (!this.isRecording) return;

      if (this._networkError) {
        this._networkError = false;
        if (this._retryCount < this._maxRetries) {
          this._retryCount++;
          const delay = this._retryCount * 1500;
          LOG(`Retry ${this._retryCount}/${this._maxRetries} in ${delay}ms`);
          this.onStatusChange('retrying',
            `Connection issue, retrying in ${delay / 1000}s… (${this._retryCount}/${this._maxRetries})`
          );
          this._retryTimer = setTimeout(() => {
            if (!this.isRecording) return;
            this.recognition = this._buildRecognition();
            this.recognition.start();
          }, delay);
        } else {
          ERR('All retries exhausted — showing text fallback');
          this.isRecording = false;
          this.onStatusChange('fallback',
            'Voice recognition unavailable on this network. Type your recipe below, or try a different network / browser.'
          );
        }
        return;
      }

      LOG('Normal session end — restarting');
      this.recognition = this._buildRecognition();
      this.recognition.start();
    };

    return rec;
  }

  _friendlyError(code) {
    const messages = {
      'not-allowed': 'Microphone access denied. Allow microphone in your browser settings and try again.',
      'aborted': 'Recording was aborted.',
      'audio-capture': 'No microphone found. Connect a microphone and try again.',
      'service-not-allowed': 'Speech service blocked. Make sure the page is loaded over HTTPS.',
    };
    return messages[code] || `Recognition error: ${code}`;
  }

  async start() {
    if (!this.isSupported) {
      this.onStatusChange('error', 'Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (!navigator.onLine) {
      this.onStatusChange('error', 'No internet connection. Speech recognition requires access to Google\'s servers.');
      return;
    }

    if (this._retryCount === 0) {
      const { isBrave } = await this._diagnose();
      if (isBrave) {
        // Brave blocks Google speech WebSocket — use local MediaRecorder instead
        this.isRecording = true;
        await this._startMediaRecorderMode();
        return;
      }
    }

    LOG('start() — Web Speech API', { retryCount: this._retryCount, lang: this.lang });
    this.isRecording = true;
    this._retryCount = 0;
    this._networkError = false;
    this.recognition = this._buildRecognition();
    this.recognition.start();
  }

  stop() {
    LOG('stop()', { wasRecording: this.isRecording });
    this.isRecording = false;
    clearTimeout(this._retryTimer);

    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      this._mediaRecorder.stop(); // onstop fires async → onAudioReady + status update
      this._mediaRecorder = null;
      return;
    }
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
    this.onStatusChange('idle', 'Recording stopped');
  }

  reset() {
    this.stop();
    this.transcript = '';
  }
}
