import { describe } from '../core/comparisons.js';
import { canDraw } from '../core/landmarks.js';
import { t } from '../i18n/index.js';

// The plain answer under the page title: the size and the two things closest to it ("84 m²
// ≈ 7 parking spaces · ≈ 32% of a tennis court"). Tapping one draws it next to the area.
export function initAnswer(el, store) {
  el.addEventListener('click', e => {
    const item = e.target.closest('[data-landmark]');
    if (item) store.set({ compare: item.getAttribute('aria-pressed') === 'true' ? 'none' : item.dataset.landmark });
  });

  return {
    update({ areaLabel, comparisons, drawn }) {
      const items = comparisons.slice(0, 2).map(c => {
        if (!canDraw(c)) return `<span>${describe(c)}</span>`;
        const pressed = c.id === drawn?.id;
        return `<button type="button" class="answer-item" data-landmark="${c.id}" aria-pressed="${pressed}" title="${t(pressed ? 'compare.hide' : 'compare.draw')}">${describe(c)}</button>`;
      });
      el.innerHTML = `<strong>${areaLabel}</strong> ${items.join(' · ')}`;
    },
  };
}
