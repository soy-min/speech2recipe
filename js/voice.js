export class VoiceRecorder {
  constructor({ onTranscript, onStatusChange }) {
    this.onTranscript = onTranscript;
    this.onStatusChange = onStatusChange;
    this.recognition = null;
    this.isRecording = false;
    this.transcript = '';
  }

  get isSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  start() {
    if (!this.isSupported) {
      this.onStatusChange('error', 'Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isRecording = true;
      this.onStatusChange('recording', 'Recording… speak your recipe');
    };

    this.recognition.onresult = (event) => {
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

    this.recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      this.onStatusChange('error', `Recognition error: ${event.error}`);
      this.isRecording = false;
    };

    this.recognition.onend = () => {
      if (this.isRecording) {
        this.recognition.start();
      }
    };

    this.recognition.start();
  }

  stop() {
    this.isRecording = false;
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
