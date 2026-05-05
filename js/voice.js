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
  }

  get isSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  _buildRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;

    rec.onstart = () => {
      // Do NOT reset _retryCount here — onstart fires on every session including retries,
      // which would make the max-retry limit unreachable (infinite loop).
      // _retryCount resets in start() for fresh recordings and in onresult when the
      // connection is confirmed working.
      this.onStatusChange('recording', 'Recording… speak your recipe');
    };

    rec.onresult = (event) => {
      this._retryCount = 0; // Connection is confirmed working; grant fresh retries
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
      if (event.error === 'no-speech') return;
      if (event.error === 'network') {
        this._networkError = true;
        return;
      }
      this.isRecording = false;
      this.onStatusChange('error', this._friendlyError(event.error));
    };

    rec.onend = () => {
      if (!this.isRecording) return;

      if (this._networkError) {
        this._networkError = false;
        if (this._retryCount < this._maxRetries) {
          this._retryCount++;
          const delay = this._retryCount * 1500;
          this.onStatusChange('recording',
            `Connection issue, retrying in ${delay / 1000}s… (${this._retryCount}/${this._maxRetries})`
          );
          this._retryTimer = setTimeout(() => {
            if (!this.isRecording) return;
            this.recognition = this._buildRecognition();
            this.recognition.start();
          }, delay);
        } else {
          this.isRecording = false;
          this.onStatusChange('error',
            'Speech recognition failed after 3 attempts. This feature needs access to Google\'s servers — try a different network, disable VPN, or switch to Chrome/Safari. Click the mic to retry.'
          );
        }
        return;
      }

      // Normal session end: restart for continuous recording
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

  start() {
    if (!this.isSupported) {
      this.onStatusChange('error', 'Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (!navigator.onLine) {
      this.onStatusChange('error', 'No internet connection. Speech recognition requires access to Google\'s servers — connect and try again.');
      return;
    }
    this.isRecording = true;
    this._retryCount = 0;
    this._networkError = false;
    this.recognition = this._buildRecognition();
    this.recognition.start();
  }

  stop() {
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
