const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-5';

const SYSTEM_PROMPT = `You are a recipe extraction assistant. The user will give you a voice transcript of someone describing a recipe.
Your job is to extract and structure ONLY what is explicitly stated in the transcript into a clean JSON object.

STRICT RULES — you must follow these without exception:
1. INGREDIENTS: Only include ingredients that are explicitly named in the transcript. Do NOT add, infer, or supplement ingredients from your own knowledge.
2. SPICES/SEASONINGS: If a spice or seasoning was NOT mentioned in the transcript, you MAY suggest it as optional by setting its "note" field to "optional suggestion". Never add unmentioned spices as required ingredients.
3. STEPS: Only include steps explicitly described in the transcript. Do not add implied or standard steps from your culinary knowledge.
4. QUANTITIES/AMOUNTS: Only include amounts explicitly stated. If an amount was not mentioned, use an empty string — do not guess.
5. OTHER FIELDS (title, servings, times, difficulty, tags, tips): Derive these only from what is said. If a field truly cannot be determined, omit it or use an empty string. Do NOT invent values.

Return ONLY valid JSON matching this schema:
{
  "title": "string",
  "description": "string (1-2 sentences, based only on what was said)",
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

function parseJson(raw) {
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(text);
}
