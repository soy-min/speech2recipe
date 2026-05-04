const RECIPES_KEY = 'speech2recipe:recipes';
const API_KEY_KEY = 'speech2recipe:apiKey';
const LANG_KEY = 'speech2recipe:lang';
const PROVIDER_KEY = 'speech2recipe:provider';
const MODEL_KEY = 'speech2recipe:model';

export function getApiKey() {
  return localStorage.getItem(API_KEY_KEY) ?? '';
}

export function saveApiKey(key) {
  localStorage.setItem(API_KEY_KEY, key);
}

export function detectProvider(apiKey) {
  if (apiKey.startsWith('sk-ant-')) return 'anthropic';
  if (apiKey.startsWith('sk-or-')) return 'openrouter';
  return null;
}

export function getProvider() {
  return localStorage.getItem(PROVIDER_KEY) ?? 'anthropic';
}

export function saveProvider(provider) {
  localStorage.setItem(PROVIDER_KEY, provider);
}

export function getModel() {
  return localStorage.getItem(MODEL_KEY) ?? '';
}

export function saveModel(model) {
  localStorage.setItem(MODEL_KEY, model);
}

export function getLang() {
  return localStorage.getItem(LANG_KEY) ?? '';
}

export function saveLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}

export function getRecipes() {
  try {
    return JSON.parse(localStorage.getItem(RECIPES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveRecipe(recipe) {
  const recipes = getRecipes();
  const existing = recipes.findIndex(r => r.id === recipe.id);
  const entry = { ...recipe, id: recipe.id ?? crypto.randomUUID(), savedAt: new Date().toISOString() };
  if (existing >= 0) recipes[existing] = entry;
  else recipes.unshift(entry);
  localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
  return entry;
}

export function deleteRecipe(id) {
  const recipes = getRecipes().filter(r => r.id !== id);
  localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
}
