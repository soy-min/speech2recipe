const RECIPES_KEY = 'speech2recipe:recipes';
const API_KEY_KEY = 'speech2recipe:apiKey';
const LANG_KEY = 'speech2recipe:lang';

export function getApiKey() {
  return localStorage.getItem(API_KEY_KEY) ?? '';
}

export function saveApiKey(key) {
  localStorage.setItem(API_KEY_KEY, key);
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
