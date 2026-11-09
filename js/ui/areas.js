import { readUrl, toQuery } from '../url.js';
import { normalize } from '../state.js';
import { loadSaved, storeSaved, sameArea, MAX_SAVED } from '../saved.js';
import { outlinePath } from '../core/shapes.js';
import { escapeHTML } from '../core/format.js';
import { t, locale } from '../i18n/index.js';
import { bindPopover } from './popover.js';
import { toast } from './toast.js';

const PENCIL = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13.5 3.5l3 3L7 16l-3.6.6L4 13z"/></svg>';
const CROSS = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>';
const CONFIRM_MS = 3000;

// What a link leaves out when it's empty: opening an area clears these unless it has its own.
const BLANK = { height: null, compare: 'none', comparePlace: null, objects: null, points: null, second: null };

// The bookmark on the stage and its list: save what's on screen, reopen, rename or delete it.
export function initAreas(button, panel, store, arrange) {
  const actions = panel.querySelector('.areas-actions');
  const list = panel.querySelector('.areas-list');
  let saved = loadSaved();
  let ctx = null;       // { state, dims, label }
  let opened = null;    // the id of the saved area being looked at or changed
  let renaming = null;
  let confirming = null;
  let confirmTimer = 0;

  const query = () => toQuery(ctx.state);
  const current = () => saved.find(a => sameArea(a.query, query()));
  const day = at => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(at);
  const details = () => ({ query: query(), thumb: outlinePath(ctx.dims), size: ctx.label.split(' · ')[0], at: Date.now() });

  function actionsHTML() {
    const here = current();
    const base = saved.find(a => a.id === opened);
    const action = (name, label, primary) => `<button type="button" class="picture-action${primary ? ' primary' : ''}" data-areas="${name}"><span>${label}</span></button>`;
    if (here) return `<button type="button" class="picture-action" disabled><span>${t('areas.saved')}</span></button>`;
    if (base) return action('update', t('areas.update'), true) + action('save', t('areas.saveNew'));
    return action('save', t('areas.save', { size: ctx.label.split(' · ')[0] }), true);
  }

  function rowHTML(area, here) {
    const name = escapeHTML(area.name || area.size);
    const line = area.name ? `${escapeHTML(area.size)} · ${day(area.at)}` : day(area.at);
    const thumb = `<svg class="area-thumb" viewBox="0 0 40 40" aria-hidden="true"><path d="${area.thumb}"/></svg>`;
    if (area.id === renaming) {
      return `<li class="area-row" data-id="${area.id}">${thumb}<input class="area-rename" value="${escapeHTML(area.name)}" placeholder="${escapeHTML(area.size)}" maxlength="40" enterkeyhint="done" autocomplete="off" aria-label="${t('areas.rename')}"></li>`;
    }
    const tools = area.id === confirming
      ? `<button type="button" class="area-confirm" data-areas="confirm">${t('areas.confirm')}</button>`
      : `<button type="button" class="area-tool" data-areas="rename" aria-label="${t('areas.rename')}" title="${t('areas.rename')}">${PENCIL}</button>
         <button type="button" class="area-tool" data-areas="delete" aria-label="${t('areas.delete')}" title="${t('areas.delete')}">${CROSS}</button>`;
    return `<li class="area-row${area.id === here?.id ? ' current' : ''}" data-id="${area.id}">
      <button type="button" class="area-open" data-areas="open">${thumb}<span class="area-text"><strong>${name}</strong><small>${line}</small></span></button>
      ${tools}</li>`;
  }

  function show() {
    if (!ctx) return;
    const here = current();
    button.classList.toggle('is-saved', Boolean(here));
    if (panel.hidden) return;
    actions.innerHTML = actionsHTML();
    list.innerHTML = saved.map(area => rowHTML(area, here)).join('');
  }

  const popover = bindPopover(button, panel, { onOpen: show });

  function write(next) {
    if (!storeSaved(next)) {
      toast(t('areas.failed'));
      return false;
    }
    saved = next;
    show();
    return true;
  }

  function saveNew() {
    if (saved.length >= MAX_SAVED) return toast(t('areas.full'));
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    opened = id;
    write([{ id, name: '', ...details() }, ...saved]);
  }

  function open(area) {
    arrange.cancelDrawing();
    arrange.select(null);
    opened = area.id;
    store.set(normalize({ ...store.get(), ...BLANK, ...readUrl(area.query) }));
    popover.close();
  }

  function finishRename(name) {
    if (renaming === null) return;
    const id = renaming;
    renaming = null;
    if (name === undefined || !write(saved.map(a => (a.id === id ? { ...a, name } : a)))) show();
  }

  panel.addEventListener('click', e => {
    const action = e.target.closest('[data-areas]')?.dataset.areas;
    if (!action) return;
    const id = e.target.closest('[data-id]')?.dataset.id;
    const area = saved.find(a => a.id === id);
    clearTimeout(confirmTimer);
    confirming = null;
    if (action === 'save') saveNew();
    else if (action === 'update') write(saved.map(a => (a.id === opened ? { ...a, ...details() } : a)));
    else if (action === 'open') open(area);
    else if (action === 'rename') {
      renaming = id;
      show();
      const input = list.querySelector('.area-rename');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length); // the cursor at the end, nothing selected
    } else if (action === 'delete') {
      confirming = id;
      show();
      confirmTimer = setTimeout(() => {
        confirming = null;
        show();
      }, CONFIRM_MS);
    } else if (action === 'confirm') {
      if (opened === id) opened = null;
      write(saved.filter(a => a.id !== id));
    }
  });

  panel.addEventListener('keydown', e => {
    if (!e.target.matches('.area-rename')) return;
    if (e.key === 'Enter') e.target.blur();
    else if (e.key === 'Escape') {
      e.stopPropagation(); // leaves the name as it was, and the list open
      finishRename();
    }
  });
  panel.addEventListener('focusout', e => {
    if (e.target.matches('.area-rename')) finishRename(e.target.value.trim());
  });

  return {
    update(next) {
      ctx = next;
      if (renaming === null) show();
    },
  };
}
