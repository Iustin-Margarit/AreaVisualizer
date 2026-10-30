import { AREA_COLORS } from '../state.js';
import { availableViews, getView } from '../views/registry.js';
import { bindPopover } from './popover.js';
import { t } from '../i18n/index.js';

const VIEW_ICONS = {
  '2d': '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 10h14M10 3v14"/></svg>',
  '3d': '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5l6.5 3.7v7.6L10 17.5l-6.5-3.7V6.2z"/><path d="M3.5 6.2L10 10l6.5-3.8M10 10v7.5"/></svg>',
};

// Controls that live on the stage itself (so they still work in full screen): the 2D/3D switch,
// display settings and the full-screen button.
export function initStageChrome(stage, store) {
  const toggle = stage.querySelector('#view-toggle');
  const settingsButton = stage.querySelector('#settings-button');
  const panel = stage.querySelector('#settings-panel');
  const fullscreenButton = stage.querySelector('#fullscreen-button');

  toggle.innerHTML = availableViews()
    .map(v => `<button type="button" data-view="${v.id}">${VIEW_ICONS[v.id] ?? ''}<span>${v.label}</span></button>`)
    .join('');
  toggle.addEventListener('click', e => {
    const id = e.target.closest('[data-view]')?.dataset.view;
    if (id) store.set({ view: id });
  });
  // Start fetching a view's code as soon as someone shows interest in it.
  toggle.addEventListener('pointerover', e => {
    const id = e.target.closest('[data-view]')?.dataset.view;
    if (id) getView(id).load().catch(() => {});
  });

  // --- display settings ---
  panel.querySelector('[data-setting="color"]').innerHTML = AREA_COLORS
    .map(c => `<button type="button" class="swatch" data-value="${c}" style="--swatch: var(--area-${c})" data-i18n-attr="aria-label:color.${c};title:color.${c}"></button>`)
    .join('');
  bindPopover(settingsButton, panel);
  panel.addEventListener('click', e => {
    const button = e.target.closest('[data-value]');
    const setting = button?.closest('[data-setting]')?.dataset.setting;
    if (setting) store.set({ [setting]: button.dataset.value });
  });
  panel.addEventListener('change', e => {
    const setting = e.target.dataset.setting;
    if (setting) store.set({ [setting]: e.target.checked });
  });

  // --- full screen: the real thing where supported, a full-window stage elsewhere (iPhone) ---
  const isFull = () => document.fullscreenElement === stage || stage.classList.contains('is-expanded');
  const setExpanded = on => {
    stage.classList.toggle('is-expanded', on);
    document.documentElement.classList.toggle('no-scroll', on);
    syncFullscreen();
  };
  const syncFullscreen = () => {
    const full = isFull();
    stage.classList.toggle('is-full', full);
    fullscreenButton.setAttribute('aria-label', t(full ? 'fullscreen.exit' : 'fullscreen.enter'));
    fullscreenButton.title = t(full ? 'fullscreen.exitTitle' : 'fullscreen.enter');
  };
  fullscreenButton.addEventListener('click', () => {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (stage.classList.contains('is-expanded')) return setExpanded(false);
    if (document.fullscreenEnabled && stage.requestFullscreen) stage.requestFullscreen().catch(() => setExpanded(true));
    else setExpanded(true);
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && stage.classList.contains('is-expanded') && panel.hidden) setExpanded(false);
  });

  function sync(s) {
    syncFullscreen(); // its labels follow the language
    toggle.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === s.view)));
    panel.querySelectorAll('[data-setting]').forEach(control => {
      const setting = control.dataset.setting;
      if (control.type === 'checkbox') control.checked = s[setting];
      else control.querySelectorAll('[data-value]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === s[setting])));
    });
  }
  store.subscribe(sync);
  sync(store.get());
}
