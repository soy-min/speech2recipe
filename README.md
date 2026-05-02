# Speech to Recipe

A web app that converts voice-recorded recipe descriptions into structured, beautifully formatted recipes — hosted on GitHub Pages.

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Vanilla HTML5/CSS3/ES Modules | No build step; works natively on GitHub Pages |
| Voice-to-Text | Web Speech API (`SpeechRecognition`) | Browser-native, no API key, works offline |
| LLM | Anthropic Claude (`claude-sonnet-4-6`) | Best-in-class recipe extraction quality |
| Storage | `localStorage` | Zero backend; personal recipe book |
| Hosting | GitHub Pages | Static, free, no server needed |

## Project Structure

```
speech2recipe/
├── index.html          # Record & transcribe page
├── book.html           # Recipe book (grid view)
├── css/
│   ├── styles.css      # Shared styles
│   └── book.css        # Recipe book specific styles
├── js/
│   ├── app.js          # Record page controller
│   ├── book.js         # Book page controller
│   ├── voice.js        # Web Speech API wrapper
│   ├── llm.js          # Claude API integration
│   ├── storage.js      # localStorage helpers
│   └── recipe-render.js  # Recipe HTML renderer (shared)
└── README.md
```

## Setup

1. Clone the repo and open `index.html` in Chrome or Edge (required for Web Speech API).
2. Enter your [Anthropic API key](https://console.anthropic.com/) in the Settings panel.
3. Press the microphone button and describe your recipe naturally.
4. Click **Structure Recipe** to have Claude extract a clean recipe.
5. Save to your recipe book and export to HTML anytime.

## GitHub Pages Deployment

Push to `main` and enable GitHub Pages in repository Settings → Pages → Source: `main / (root)`.

The entire app is static — no build step required.

## Architecture Notes

- **API key security**: The Anthropic API key is stored in `localStorage` and sent directly from the browser to the Anthropic API. This is acceptable for a personal tool but the key should be treated as a secret and not shared.
- **Offline-first voice**: The Web Speech API uses device-local or platform speech recognition. Chrome on desktop uses Google's servers; privacy-sensitive users can use the API only when needed.
- **Data portability**: All recipes live in `localStorage`. The Export HTML button generates a self-contained printable file.
