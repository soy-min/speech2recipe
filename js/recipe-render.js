export function renderRecipeCard(recipe) {
  const el = document.createElement('div');
  el.className = 'recipe-card';
  el.innerHTML = `
    <h2>${escHtml(recipe.title)}</h2>
    <div class="recipe-meta">
      ${recipe.servings ? `<span>🍽️ ${escHtml(recipe.servings)}</span>` : ''}
      ${recipe.prepTime ? `<span>⏱️ Prep: ${escHtml(recipe.prepTime)}</span>` : ''}
      ${recipe.cookTime ? `<span>🔥 Cook: ${escHtml(recipe.cookTime)}</span>` : ''}
      ${recipe.difficulty ? `<span>📊 ${escHtml(recipe.difficulty)}</span>` : ''}
    </div>
    ${recipe.description ? `<p>${escHtml(recipe.description)}</p>` : ''}
    ${renderIngredients(recipe.ingredients)}
    ${renderSteps(recipe.steps)}
    ${recipe.tips?.length ? renderSection('💡 Tips', recipe.tips.map(t => `<li>${escHtml(t)}</li>`).join(''), 'ul') : ''}
  `;
  return el;
}

function renderIngredients(ingredients) {
  if (!ingredients?.length) return '';
  const items = ingredients.map(ing => {
    const parts = [ing.amount, ing.unit, ing.item].filter(Boolean).map(escHtml).join(' ');
    return `<li>${parts}${ing.note ? ` <em>(${escHtml(ing.note)})</em>` : ''}</li>`;
  }).join('');
  return renderSection('🧂 Ingredients', items, 'ul');
}

function renderSteps(steps) {
  if (!steps?.length) return '';
  const items = steps.map(s => `<li>${escHtml(s)}</li>`).join('');
  return renderSection('👨‍🍳 Instructions', items, 'ol');
}

function renderSection(title, content, listTag) {
  return `
    <div class="recipe-section">
      <h3>${title}</h3>
      <${listTag}>${content}</${listTag}>
    </div>
  `;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
