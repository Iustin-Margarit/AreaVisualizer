import { LANGUAGES, t } from '../i18n/index.js';
import { bindPopover } from './popover.js';
import { flagHTML } from './flags.js';

const CHECK = '<svg class="check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';

// The header's language menu: a flag and "EN" that opens a list of the languages, each with its
// flag and its own name. Arrow keys move through the list; Escape or a click outside closes it.
export function initLanguagePicker(el, store) {
  const button = el.querySelector('.lang-button');
  const panel = el.querySelector('.lang-panel');
  const list = panel.querySelector('.lang-list');
  list.innerHTML = Object.entries(LANGUAGES).map(([id, lang]) => `
    <li><button type="button" data-lang="${id}" lang="${id}">${flagHTML(id)}<span>${lang.name}</span>${CHECK}</button></li>`).join('');
  const items = [...list.querySelectorAll('[data-lang]')];

  const popover = bindPopover(button, panel, {
    onOpen: () => items.find(b => b.dataset.lang === store.get().lang)?.focus(),
  });
  list.addEventListener('click', e => {
    const lang = e.target.closest('[data-lang]')?.dataset.lang;
    if (!lang) return;
    store.set({ lang });
    popover.close();
    button.focus();
  });
  list.addEventListener('keydown', e => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    const index = items.indexOf(document.activeElement);
    let next = null;
    if (step) next = items[(index + step + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items.at(-1);
    if (!next) return;
    e.preventDefault();
    next.focus();
  });

  const sync = s => {
    button.querySelector('.lang-flag').innerHTML = flagHTML(s.lang);
    button.querySelector('.lang-code').textContent = s.lang.toUpperCase();
    const label = `${t('language')}: ${LANGUAGES[s.lang].name}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    items.forEach(b => b.setAttribute('aria-current', String(b.dataset.lang === s.lang)));
  };
  store.subscribe(sync);
  sync(store.get());
}
