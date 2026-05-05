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
  }

  get isSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  // Run before the first start() to surface environment details in the console.
  async _diagnose() {
    LOG('=== Diagnostic run ===');
    LOG('Page', {
      url: window.location.href,
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      online: navigator.onLine,
    });
    LOG('Browser', {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
    });
    LOG('Speech API', {
      nativeSpeechRecognition: 'SpeechRecognition' in window,
      webkitSpeechRecognition: 'webkitSpeechRecognition' in window,
      selectedLang: this.lang,
    });

    // Microphone permission state
    if (navigator.permissions) {
      try {
        const mic = await navigator.permissions.query({ name: 'microphone' });
        LOG('Microphone permission:', mic.state);
        mic.onchange = () => LOG('Microphone permission changed to:', mic.state);
      } catch (e) {
        WARN('Could not query microphone permission:', e.message);
      }
    }

    // Test whether the mic hardware is reachable at all
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = stream.getAudioTracks();
      LOG('getUserMedia OK — audio tracks:', tracks.map(t => ({
        label: t.label,
        enabled: t.enabled,
        readyState: t.readyState,
      })));
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      ERR('getUserMedia FAILED:', e.name, e.message);
    }

    // Test whether Google HTTPS is reachable at all
    try {
      const t0 = Date.now();
      await fetch('https://www.google.com/generate_204', { mode: 'no-cors', cache: 'no-store' });
      LOG(`Google HTTPS reachable (${Date.now() - t0} ms)`);
    } catch (e) {
      ERR('Google HTTPS NOT reachable:', e.message);
    }

    // Dump any CSP meta tags present in the document
    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (cspMeta) {
      WARN('CSP meta tag found (may block speech API):', cspMeta.content);
    } else {
      LOG('No CSP meta tag in document');
    }

    LOG('=== End diagnostic ===');
  }

  _buildRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const apiType = 'SpeechRecognition' in window ? 'native' : 'webkit';
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;

    LOG('Building recognition session', { apiType, lang: rec.lang, continuous: rec.continuous });

    rec.onstart = () => {
      this._sessionStart = Date.now();
      LOG('onstart — session began', { lang: rec.lang, retryCount: this._retryCount });
      this.onStatusChange('recording', 'Recording… speak your recipe');
    };

    rec.onresult = (event) => {
      this._retryCount = 0;
      LOG('onresult — speech received', {
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
      ERR('onerror — recognition error', {
        error: event.error,
        message: event.message || '(no message property)',
        online: navigator.onLine,
        elapsed: this._sessionStart ? `${Date.now() - this._sessionStart}ms` : '?',
        retryCount: this._retryCount,
        lang: rec.lang,
        protocol: window.location.protocol,
        hostname: window.location.hostname,
      });

      if (event.error === 'no-speech') {
        LOG('Ignoring no-speech (silence detected, session continues)');
        return;
      }
      if (event.error === 'network') {
        WARN('Network error — Google speech servers unreachable. Possible causes:', [
          '1. Network blocks wss://www.google.com (VPN, firewall, ISP)',
          '2. Chrome speech API disabled via browser flags (chrome://flags)',
          '3. Chrome enterprise policy blocking speech',
          '4. Audio device conflict on macOS causing immediate session failure',
          '5. Permissions-Policy header from server (check: curl -sI ' + window.location.origin + ')',
        ]);
        this._networkError = true;
        return;
      }
      ERR('Fatal recognition error — stopping', event.error);
      this.isRecording = false;
      this.onStatusChange('error', this._friendlyError(event.error));
    };

    rec.onend = () => {
      const elapsed = this._sessionStart ? Date.now() - this._sessionStart : null;
      LOG('onend — session ended', {
        isRecording: this.isRecording,
        networkError: this._networkError,
        retryCount: this._retryCount,
        elapsedMs: elapsed,
        suspiciouslyFast: elapsed !== null && elapsed < 500,
      });

      if (elapsed !== null && elapsed < 300 && this._networkError) {
        WARN('Session ended in under 300ms with network error — this usually means:', [
          'The browser could not establish the WebSocket to Google speech servers.',
          'This is NOT a page/server issue (GitHub Pages headers are permissive).',
          'Likely cause: local network/browser blocks wss://www.google.com traffic.',
        ]);
      }

      if (!this.isRecording) return;

      if (this._networkError) {
        this._networkError = false;
        if (this._retryCount < this._maxRetries) {
          this._retryCount++;
          const delay = this._retryCount * 1500;
          LOG(`Scheduling retry ${this._retryCount}/${this._maxRetries} in ${delay}ms`);
          this.onStatusChange('retrying',
            `Connection issue, retrying in ${delay / 1000}s… (${this._retryCount}/${this._maxRetries})`
          );
          this._retryTimer = setTimeout(() => {
            if (!this.isRecording) return;
            this.recognition = this._buildRecognition();
            this.recognition.start();
          }, delay);
        } else {
          ERR(`All ${this._maxRetries} retries exhausted — showing text fallback`);
          this.isRecording = false;
          this.onStatusChange('fallback',
            'Voice recognition unavailable on this network. Type your recipe below, or try a different network / browser.'
          );
        }
        return;
      }

      // Normal session end: restart for continuous recording
      LOG('Normal session end — restarting for continuous mode');
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
      this.onStatusChange('error', 'No internet connection. Speech recognition requires access to Google\'s servers — connect and try again.');
      return;
    }

    // Run full diagnostic on first start (retries skip this)
    if (this._retryCount === 0) {
      await this._diagnose();
    }

    LOG('start() called', { retryCount: this._retryCount, lang: this.lang });
    this.isRecording = true;
    this._retryCount = 0;
    this._networkError = false;
    this.recognition = this._buildRecognition();
    this.recognition.start();
  }

  stop() {
    LOG('stop() called', { wasRecording: this.isRecording });
    this.isRecording = false;
    clearTimeout(this._retryTimer);
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
