const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

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

export async function structureRecipe(transcript, apiKey) {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
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
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(text);
}
