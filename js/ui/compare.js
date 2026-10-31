import { REFERENCES } from '../data/references.js';
import { keyDimension, named } from '../core/references.js';
import { describe } from '../core/comparisons.js';
import { landmarkShape } from '../core/landmarks.js';
import { LENGTH_UNITS } from '../core/units.js';
import { formatLengths, escapeHTML, parseNumber } from '../core/format.js';
import { kindColor } from '../views/palette.js';
import { bindPopover } from './popover.js';
import { t, unitSymbol } from '../i18n/index.js';
import { translatePage } from '../i18n/dom.js';

const MAX_OBJECTS = 8; // more crowds the view (links from before may still carry up to 12)
const DRAW_ICON = '<svg class="draw-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="2"/></svg>';
const size = (ref, system, both) => {
  const key = keyDimension(ref);
  return `${key.symbol} ${formatLengths(key.value, system, both)}`;
};
const RESET_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8a4.5 4.5 0 101.3-3.2"/><path d="M3.5 2.5v2.8h2.8"/></svg>';
const dot = kind => `<span class="dot" style="--c:${kindColor(kind)}" aria-hidden="true"></span>`;
const catalog = [...REFERENCES].sort((a, b) => Math.max(a.w, a.d, a.h) - Math.max(b.w, b.d, b.h));

// The "For scale" card: the objects shown next to the area (remove any, add from the catalog
// or your own), and the landmark comparisons (tap one to draw it to scale).
export function initCompare(el, store) {
  el.innerHTML = `
    <h2 class="card-title" data-i18n="compare.title"></h2>
    <div class="subhead">
      <span class="label" data-i18n="compare.objects"></span>
      <span class="objects-mode"></span>
    </div>
    <ul class="object-chips"></ul>
    <div class="add-object">
      <button type="button" class="add-button" aria-expanded="false" aria-controls="add-panel">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg><span data-i18n="compare.add"></span>
      </button>
      <div id="add-panel" class="popover add-panel" role="dialog" data-i18n-attr="aria-label:compare.addTitle" hidden>
        <ul class="catalog"></ul>
        <form class="custom-object" autocomplete="off">
          <span class="label" data-i18n="compare.own"></span>
          <input name="name" data-i18n-attr="placeholder:compare.name" maxlength="40" required>
          <div class="custom-dims">
            <input name="w" inputmode="decimal" data-i18n-attr="placeholder:sides.width;aria-label:sides.width" required>
            <input name="d" inputmode="decimal" data-i18n-attr="placeholder:compare.depth;aria-label:compare.depth" required>
            <input name="h" inputmode="decimal" data-i18n-attr="placeholder:height.label;aria-label:height.label" required>
            <span class="custom-unit"></span>
          </div>
          <button type="submit" class="primary" data-i18n="compare.submit"></button>
        </form>
      </div>
    </div>
    <details class="fold">
      <summary class="label" data-i18n="compare.about"></summary>
      <div class="fold-body">
        <ul class="compare"></ul>
        <p class="hint"></p>
      </div>
    </details>`;

  translatePage(el);
  const $ = sel => el.querySelector(sel);
  const chips = $('.object-chips');
  const panel = $('#add-panel');
  const form = $('.custom-object');
  const popover = bindPopover($('.add-button'), panel, { onOpen: () => panel.querySelector('button')?.focus() });
  let ctx = null; // latest render context

  const tokens = () => ctx.references.map(r => r.token);
  const setObjects = list => store.set({ objects: list.slice(0, MAX_OBJECTS) });

  el.addEventListener('click', e => {
    const remove = e.target.closest('[data-remove]');
    const add = e.target.closest('[data-add]');
    const landmark = e.target.closest('[data-landmark]');
    if (remove) setObjects(tokens().filter((_, i) => i !== Number(remove.dataset.remove)));
    else if (add) {
      if (!tokens().includes(add.dataset.add)) setObjects([...tokens(), add.dataset.add]);
      popover.close();
    } else if (e.target.closest('[data-auto]')) store.set({ objects: null });
    else if (landmark) {
      store.set({ compare: landmark.getAttribute('aria-pressed') === 'true' ? 'none' : landmark.dataset.landmark });
    }
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const toM = LENGTH_UNITS[store.get().lengthUnit].toM;
    const [w, d, h] = ['w', 'd', 'h'].map(name => parseNumber(form.elements[name].value) * toM);
    const name = form.elements.name.value.trim();
    const bad = [w, d, h].map(v => !(v > 0 && v <= 1e7));
    ['w', 'd', 'h'].forEach((n, i) => form.elements[n].setAttribute('aria-invalid', String(bad[i])));
    if (!name || bad.some(Boolean)) return;
    setObjects([...tokens(), { name, w, d, h }]);
    form.reset();
    popover.close();
  });

  return {
    update(next) {
      ctx = next;
      const { state, references, comparisons, drawn, system, both } = next;
      const auto = state.objects === null;

      $('.objects-mode').innerHTML = auto
        ? `<span class="muted">${t('compare.auto')}</span>`
        : `<button type="button" class="reset-button" data-auto title="${t('compare.resetTitle')}">${RESET_ICON}<span>${t('compare.reset')}</span></button>`;
      chips.innerHTML = references.length
        ? references.map((r, i) => `
          <li class="object-chip">${dot(r.kind)}<span>${escapeHTML(r.name)}</span><small>${size(r, system, both)}</small>
            <button type="button" data-remove="${i}" aria-label="${escapeHTML(t('compare.removeName', { name: r.name }))}" title="${t('compare.remove')}">×</button></li>`).join('')
        : `<li class="muted">${t('compare.none')}</li>`;

      const shown = new Set(tokens());
      $('.catalog').innerHTML = catalog.map(named).map(r => `
        <li><button type="button" data-add="${r.id}" ${shown.has(r.id) ? 'aria-pressed="true" disabled' : ''}>
          ${dot(r.kind)}<span class="name">${r.name}</span><small>${size(r, system, both)}</small></button></li>`).join('');
      $('.custom-unit').textContent = unitSymbol(state.lengthUnit);
      $('.add-button').disabled = references.length >= MAX_OBJECTS;

      $('.compare').innerHTML = comparisons.map(c => {
        if (!landmarkShape(c)) return `<li class="compare-text" title="${t('compare.cantDraw')}">${describe(c)}</li>`;
        const pressed = c.id === drawn?.id;
        return `<li><button type="button" class="compare-item" data-landmark="${c.id}" aria-pressed="${pressed}"
          title="${t(pressed ? 'compare.hide' : 'compare.draw')}"><span>${describe(c)}</span>${DRAW_ICON}</button></li>`;
      }).join('') || `<li class="muted">${t('compare.nothing')}</li>`;
      $('.hint').textContent = t(drawn ? 'compare.hintDrawn' : 'compare.hintPick');
    },
  };
}
