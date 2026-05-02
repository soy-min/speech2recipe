function encodeRecipeForUrl(recipe) {
  const json = JSON.stringify(recipe);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function createShareUrl(recipe) {
  const encoded = encodeRecipeForUrl(recipe);
  const url = new URL('book.html', window.location.href);
  url.hash = 'recipe=' + encoded;
  return url.toString();
}

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
    ${recipe.description ? `<p style="margin-bottom:1.25rem;color:var(--color-text-muted);font-size:0.9375rem">${escHtml(recipe.description)}</p>` : ''}
    ${renderIngredients(recipe.ingredients)}
    ${renderSteps(recipe.steps)}
    ${recipe.tips?.length ? renderSection('💡 Tips', recipe.tips.map(t => `<li>${escHtml(t)}</li>`).join(''), 'ul') : ''}
  `;

  el.querySelectorAll('.ingredient-item input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.ingredient-item').classList.toggle('checked', cb.checked);
    });
  });

  return el;
}

function renderIngredients(ingredients) {
  if (!ingredients?.length) return '';
  const items = ingredients.map(ing => {
    const parts = [ing.amount, ing.unit, ing.item].filter(Boolean).map(escHtml).join(' ');
    return `<li class="ingredient-item">
      <label class="ingredient-label">
        <input type="checkbox" />
        <span>${parts}${ing.note ? ` <em>(${escHtml(ing.note)})</em>` : ''}</span>
      </label>
    </li>`;
  }).join('');
  return renderSection('🧂 Ingredients', items, 'ul', 'ingredient-list');
}

function renderSteps(steps) {
  if (!steps?.length) return '';
  const items = steps.map((s, i) =>
    `<li class="step-item">
      <span class="step-num">${i + 1}</span>
      <span class="step-text">${escHtml(s)}</span>
    </li>`
  ).join('');
  return renderSection('👨‍🍳 Instructions', items, 'ol', 'steps-list');
}

function renderSection(title, content, listTag, listClass) {
  const cls = listClass ? ` class="${listClass}"` : '';
  return `
    <div class="recipe-section">
      <h3>${title}</h3>
      <${listTag}${cls}>${content}</${listTag}>
    </div>
  `;
}

export function formatRecipeText(recipe) {
  const lines = [`🍳 ${recipe.title}`];

  const meta = [];
  if (recipe.prepTime) meta.push(`⏱️ Prep: ${recipe.prepTime}`);
  if (recipe.cookTime) meta.push(`🔥 Cook: ${recipe.cookTime}`);
  if (recipe.servings) meta.push(`🍽️ ${recipe.servings}`);
  if (meta.length) lines.push(meta.join('  ·  '));

  if (recipe.description) lines.push('', recipe.description);

  if (recipe.ingredients?.length) {
    lines.push('', '🧂 Ingredients:');
    recipe.ingredients.forEach(ing => {
      const parts = [ing.amount, ing.unit, ing.item].filter(Boolean).join(' ');
      lines.push(`• ${parts}${ing.note ? ` (${ing.note})` : ''}`);
    });
  }

  if (recipe.steps?.length) {
    lines.push('', '👨‍🍳 Instructions:');
    recipe.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }

  if (recipe.tips?.length) {
    lines.push('', '💡 Tips:');
    recipe.tips.forEach(tip => lines.push(`• ${tip}`));
  }

  lines.push('', '— Made with Speech to Recipe 🎙️');
  return lines.join('\n');
}

export async function shareRecipe(recipe) {
  const url = createShareUrl(recipe);
  const text = formatRecipeText(recipe);
  if (navigator.share) {
    try {
      await navigator.share({ title: recipe.title, text, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard!');
  } catch {
    showToast('Could not copy — try selecting and copying manually.');
  }
}

export function showToast(message) {
  const existing = document.querySelector('.share-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'share-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
