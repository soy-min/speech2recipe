import { getRecipes, deleteRecipe } from './storage.js';
import { renderRecipeCard, shareRecipe } from './recipe-render.js';

function decodeRecipeFromHash(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

const $ = id => document.getElementById(id);

const recipeGrid = $('recipe-grid');
const emptyState = $('empty-state');
const searchInput = $('search');
const exportBtn = $('export-btn');
const modal = $('recipe-modal');
const modalBody = $('modal-body');
const modalClose = $('modal-close');

let allRecipes = [];

function renderGrid(recipes) {
  const thumbs = recipeGrid.querySelectorAll('.recipe-thumb');
  thumbs.forEach(el => el.remove());
  emptyState.hidden = recipes.length > 0;

  recipes.forEach(recipe => {
    const el = document.createElement('div');
    el.className = 'recipe-thumb';
    el.innerHTML = `
      <div class="recipe-thumb-header">
        <h3>${escHtml(recipe.title)}</h3>
      </div>
      <div class="thumb-meta">
        ${recipe.servings ? `<span>🍽️ ${escHtml(recipe.servings)}</span>` : ''}
        ${recipe.cookTime ? `<span>🔥 ${escHtml(recipe.cookTime)}</span>` : ''}
        ${recipe.difficulty ? `<span>📊 ${escHtml(recipe.difficulty)}</span>` : ''}
      </div>
      ${recipe.tags?.length ? `<div class="thumb-tags">${recipe.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="thumb-actions">
        <button class="delete-btn">Delete</button>
        <button class="view-btn primary">View</button>
      </div>
    `;

    el.querySelector('.view-btn').addEventListener('click', () => openModal(recipe));
    el.querySelector('.delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Delete "${recipe.title}"?`)) {
        deleteRecipe(recipe.id);
        allRecipes = allRecipes.filter(r => r.id !== recipe.id);
        renderGrid(filterRecipes(searchInput.value));
      }
    });

    recipeGrid.appendChild(el);
  });
}

function filterRecipes(query) {
  if (!query.trim()) return allRecipes;
  const q = query.toLowerCase();
  return allRecipes.filter(r =>
    r.title?.toLowerCase().includes(q) ||
    r.tags?.some(t => t.toLowerCase().includes(q)) ||
    r.description?.toLowerCase().includes(q)
  );
}

function openModal(recipe) {
  modalBody.innerHTML = '';
  const card = renderRecipeCard(recipe);
  modalBody.appendChild(card);

  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  footer.innerHTML = `<button class="share-btn primary">Share ↗</button>`;
  footer.querySelector('.share-btn').addEventListener('click', () => shareRecipe(recipe));
  modalBody.appendChild(footer);

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

searchInput.addEventListener('input', () => renderGrid(filterRecipes(searchInput.value)));

exportBtn.addEventListener('click', () => {
  const recipes = filterRecipes(searchInput.value);
  if (!recipes.length) return alert('No recipes to export.');
  const html = generateExportHTML(recipes);
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my-recipe-book.html';
  a.click();
});

function generateExportHTML(recipes) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>My Recipe Book</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; background: #fafaf8; color: #1a1a1a; }
    h1 { margin-bottom: 2rem; }
    .recipe { background: white; border: 1px solid #e5e5e0; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; }
    h2 { margin-bottom: 0.5rem; }
    .meta { color: #666; font-size: 0.875rem; margin-bottom: 1rem; display: flex; gap: 1rem; flex-wrap: wrap; }
    h3 { color: #666; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; margin: 1rem 0 0.5rem; }
    ul, ol { padding-left: 1.25rem; } li { margin-bottom: 0.25rem; }
    @media print { .recipe { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>📖 My Recipe Book</h1>
  ${recipes.map(r => `
  <div class="recipe">
    <h2>${escHtml(r.title)}</h2>
    <div class="meta">
      ${r.servings ? `<span>🍽️ ${escHtml(r.servings)}</span>` : ''}
      ${r.prepTime ? `<span>⏱️ Prep: ${escHtml(r.prepTime)}</span>` : ''}
      ${r.cookTime ? `<span>🔥 Cook: ${escHtml(r.cookTime)}</span>` : ''}
    </div>
    ${r.description ? `<p>${escHtml(r.description)}</p>` : ''}
    ${r.ingredients?.length ? `<h3>Ingredients</h3><ul>${r.ingredients.map(i => `<li>${[i.amount,i.unit,i.item].filter(Boolean).map(escHtml).join(' ')}</li>`).join('')}</ul>` : ''}
    ${r.steps?.length ? `<h3>Instructions</h3><ol>${r.steps.map(s => `<li>${escHtml(s)}</li>`).join('')}</ol>` : ''}
    ${r.tips?.length ? `<h3>Tips</h3><ul>${r.tips.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul>` : ''}
  </div>`).join('')}
</body>
</html>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

allRecipes = getRecipes();
renderGrid(allRecipes);

function loadRecipeFromHash() {
  const hash = window.location.hash;
  if (!hash.startsWith('#recipe=')) return;
  try {
    const recipe = decodeRecipeFromHash(hash.slice('#recipe='.length));
    openModal(recipe);
  } catch {
    // malformed hash — ignore
  }
}

loadRecipeFromHash();
window.addEventListener('hashchange', loadRecipeFromHash);
