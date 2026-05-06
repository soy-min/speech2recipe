const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-5';

const SYSTEM_PROMPT = `You are a recipe extraction assistant. The user will give you a voice transcript of someone describing a recipe.
Your job is to extract and structure the recipe into a clean JSON object.

Return ONLY valid JSON matching this schema:
{
  "title": "string",
  "description": "string (1-2 sentences)",
  "servings": "string (e.g. '4 servings')",
  "prepTime": "string (e.g. '15 min')",
  "cookTime": "string (e.g. '30 min')",
  "difficulty": "Easy | Medium | Hard",
  "tags": ["string"],
  "ingredients": [
    { "amount": "string", "unit": "string", "item": "string", "note": "string?" }
  ],
  "steps": ["string"],
  "tips": ["string"]
}

If a field cannot be determined from the transcript, use a sensible default or omit optional fields.
Always return only the JSON, no extra text.`;

export async function structureRecipe(transcript, apiKey, provider = 'anthropic', model = null) {
  if (provider === 'openrouter') {
    return callOpenRouter(transcript, apiKey, model || DEFAULT_OPENROUTER_MODEL);
  }
  return callAnthropic(transcript, apiKey, model || DEFAULT_ANTHROPIC_MODEL);
}

async function callAnthropic(transcript, apiKey, model) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Please structure this recipe transcript:\n\n${transcript}` }
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const raw = data.content?.[0]?.text ?? '';
  return parseJson(raw);
}

async function callOpenRouter(transcript, apiKey, model) {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Please structure this recipe transcript:\n\n${transcript}` }
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  return parseJson(raw);
}

// Transcribe a locally-recorded audio blob via OpenRouter's Whisper endpoint.
// Returns the transcript string, or null if transcription is unsupported/failed.
export async function transcribeAudio(audioBlob, apiKey, provider) {
  if (provider !== 'openrouter') return null; // Anthropic has no audio transcription API

  const ext = audioBlob.type.includes('mp4') ? 'mp4'
            : audioBlob.type.includes('ogg') ? 'ogg'
            : 'webm';
  const file = new File([audioBlob], `recording.${ext}`, { type: audioBlob.type });

  const fd = new FormData();
  fd.append('file', file);
  fd.append('model', 'openai/whisper-1');

  const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: fd,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Transcription error: ${response.status}`);
  }

  const data = await response.json();
  return data.text ?? null;
}

function parseJson(raw) {
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(text);
}
