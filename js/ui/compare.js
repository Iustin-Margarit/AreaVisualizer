import { REFERENCES } from '../data/references.js';
import { LANDMARKS } from '../data/landmarks.js';
import { keyDimension, named } from '../core/references.js';
import { describe } from '../core/comparisons.js';
import { canDraw } from '../core/landmarks.js';
import { LENGTH_UNITS, fromM2, naturalAreaUnit } from '../core/units.js';
import { formatLengths, withUnit, escapeHTML, parseNumber, searchKey } from '../core/format.js';
import { kindColor } from '../views/palette.js';
import { coarsePointer } from '../views/stage-ui.js';
import { bindPopover } from './popover.js';
import { MAX_OBJECTS } from './arrange.js';
import { t, unitSymbol, landmarkName } from '../i18n/index.js';
import { translatePage } from '../i18n/dom.js';

const DRAW_ICON = '<svg class="draw-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="2"/></svg>';
const size = (ref, system, both) => {
  const key = keyDimension(ref);
  return `${key.symbol} ${formatLengths(key.value, system, both)}`;
};
const RESET_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8a4.5 4.5 0 101.3-3.2"/><path d="M3.5 2.5v2.8h2.8"/></svg>';
const dot = kind => `<span class="dot" style="--c:${kindColor(kind)}" aria-hidden="true"></span>`;
const catalog = [...REFERENCES].sort((a, b) => Math.max(a.w, a.d, a.h) - Math.max(b.w, b.d, b.h));
const places = LANDMARKS.filter(canDraw).sort((a, b) => a.area - b.area);
const capitalize = s => s[0].toLocaleUpperCase() + s.slice(1);

// The "For scale" card: the objects shown next to the area (remove any, add from the catalog
// or your own), and the landmark comparisons (tap one to draw it to scale).
export function initCompare(el, store, { select }) {
  el.innerHTML = `
    <h2 class="card-title" data-i18n="compare.title"></h2>
    <div class="subhead">
      <span class="label" data-i18n="compare.objects"></span>
      <span class="objects-mode"></span>
    </div>
    <ul class="object-chips"></ul>
    <p class="hint" data-i18n="${coarsePointer() ? 'arrange.hintTouch' : 'arrange.hint'}"></p>
    <div class="add-object">
      <button type="button" class="add-button" aria-expanded="false" aria-controls="add-panel">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg><span data-i18n="compare.add"></span>
      </button>
      <div id="add-panel" class="popover add-panel" role="dialog" data-i18n-attr="aria-label:compare.addTitle" hidden>
        <input class="places-search catalog-search" type="search" spellcheck="false" data-i18n-attr="placeholder:places.search;aria-label:places.search">
        <ul class="catalog objects-list"></ul>
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
        <div class="add-object">
          <button type="button" class="add-button places-button" aria-expanded="false" aria-controls="places-panel">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4"/><path d="M10 10l3.5 3.5"/></svg><span data-i18n="places.open"></span>
          </button>
          <div id="places-panel" class="popover add-panel" role="dialog" data-i18n-attr="aria-label:places.open" hidden>
            <input class="places-search" type="search" spellcheck="false" data-i18n-attr="placeholder:places.search;aria-label:places.search">
            <ul class="catalog places-list"></ul>
          </div>
        </div>
      </div>
    </details>`;

  translatePage(el);
  const $ = sel => el.querySelector(sel);
  const chips = $('.object-chips');
  const panel = $('#add-panel');
  const form = $('.custom-object');
  let ctx = null; // latest render context

  // Phones keep the keyboard closed until the search box is tapped: most people just pick from the list.
  const focusSearch = input => { if (!matchMedia('(pointer: coarse)').matches) input.focus(); };

  const catalogSearch = $('.catalog-search');
  const objectsList = $('.objects-list');
  const listCatalog = () => {
    const query = searchKey(catalogSearch.value.trim());
    objectsList.innerHTML = catalog.map(named).filter(r => searchKey(r.name).includes(query)).map(r => `
      <li><button type="button" data-add="${r.id}">
        ${dot(r.kind)}<span class="name">${r.name}</span><small>${size(r, ctx.system, ctx.both)}</small></button></li>`).join('')
      || `<li class="muted">${t('places.none')}</li>`;
  };
  const popover = bindPopover($('.add-button'), panel, {
    onOpen: () => {
      catalogSearch.value = '';
      listCatalog();
      focusSearch(catalogSearch);
    },
  });
  catalogSearch.addEventListener('input', listCatalog);
  catalogSearch.addEventListener('keydown', e => {
    if (e.key === 'Enter') objectsList.querySelector('button')?.click();
  });

  // "Compare with…": every place that can be drawn, whatever the size, with a search box.
  const search = $('.places-search');
  const placesList = $('.places-list');
  const listPlaces = () => {
    const query = searchKey(search.value.trim());
    placesList.innerHTML = places.filter(l => searchKey(landmarkName(l.id)).includes(query)).map(l => {
      const unit = naturalAreaUnit(l.area, ctx.system);
      return `<li><button type="button" data-landmark="${l.id}" aria-pressed="${l.id === ctx.drawn?.id}">
        <span class="name">${capitalize(landmarkName(l.id))}</span><small>${withUnit(fromM2(l.area, unit), unit)}</small></button></li>`;
    }).join('') || `<li class="muted">${t('places.none')}</li>`;
  };
  const placesPopover = bindPopover($('.places-button'), $('#places-panel'), {
    onOpen: () => {
      search.value = '';
      listPlaces();
      focusSearch(search);
    },
  });
  search.addEventListener('input', listPlaces);
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') placesList.querySelector('button')?.click();
  });

  const tokens = () => ctx.references.map(r => r.token);
  const setObjects = list => store.set({ objects: list.slice(0, MAX_OBJECTS) });

  el.addEventListener('click', e => {
    const remove = e.target.closest('[data-remove]');
    const add = e.target.closest('[data-add]');
    const landmark = e.target.closest('[data-landmark]');
    const chip = e.target.closest('[data-select]');
    if (remove) setObjects(tokens().filter((_, i) => i !== Number(remove.dataset.remove)));
    else if (add) {
      setObjects([...tokens(), add.dataset.add]);
      popover.close();
    } else if (chip) {
      select(Number(chip.dataset.select));
      document.getElementById('stage').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (e.target.closest('[data-auto]')) store.set({ objects: null });
    else if (landmark) {
      store.set({ compare: landmark.getAttribute('aria-pressed') === 'true' ? 'none' : landmark.dataset.landmark });
      placesPopover.close();
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
          <li class="object-chip" data-select="${i}">${dot(r.kind)}<span>${escapeHTML(r.name)}</span><small>${size(r, system, both)}</small>
            <button type="button" data-remove="${i}" aria-label="${escapeHTML(t('compare.removeName', { name: r.name }))}" title="${t('compare.remove')}">×</button></li>`).join('')
        : `<li class="muted">${t('compare.none')}</li>`;

      $('.custom-unit').textContent = unitSymbol(state.lengthUnit);
      $('.add-button').disabled = references.length >= MAX_OBJECTS;

      // One picked from "Compare with…" comes first, next to the button that added it.
      $('.compare').innerHTML = [...comparisons].sort((a, b) => Boolean(b.extra) - Boolean(a.extra)).map(c => {
        if (!canDraw(c)) return `<li class="compare-text" title="${t('compare.cantDraw')}">${describe(c)}</li>`;
        const pressed = c.id === drawn?.id;
        return `<li><button type="button" class="compare-item" data-landmark="${c.id}" aria-pressed="${pressed}"
          title="${t(pressed ? 'compare.hide' : 'compare.draw')}"><span>${describe(c)}</span>${DRAW_ICON}</button></li>`;
      }).join('') || `<li class="muted">${t('compare.nothing')}</li>`;
      $('.fold-body .hint').textContent = t(drawn ? 'compare.hintDrawn' : 'compare.hintPick');
    },
  };
}
