import { createStore, initialState } from './state.js';
import { readUrl, writeUrl } from './url.js';
import { loadPrefs, savePrefs, prefersImperial } from './prefs.js';
import { fromM2, naturalAreaUnit } from './core/units.js';
import { resolveInput } from './core/input.js';
import { buildScene } from './core/scene.js';
import { compare } from './core/comparisons.js';
import { chooseLandmark, landmarkShape } from './core/landmarks.js';
import { withUnit, formatVolumes, OTHER_SYSTEM } from './core/format.js';
import { t, setLanguage, detectLanguage, landmarkName } from './i18n/index.js';
import { translatePage } from './i18n/dom.js';
import { initControls } from './ui/controls.js';
import { initCompare } from './ui/compare.js';
import { renderResults } from './ui/results.js';
import { initStageChrome } from './ui/stage-chrome.js';
import { initUnitsToggle } from './ui/units-toggle.js';
import { initShare } from './ui/share.js';
import { initLanguagePicker } from './ui/language-picker.js';
import { renderCredits } from './ui/credits.js';
import { initFolds } from './ui/folds.js';
import { toast } from './ui/toast.js';
import { getView, availableViews } from './views/registry.js';

const store = createStore(initialState({ imperial: prefersImperial(), lang: detectLanguage(), prefs: loadPrefs(), url: readUrl() }));
if (!availableViews().some(v => v.id === store.get().view)) store.set({ view: availableViews()[0].id });

const stage = document.getElementById('stage');
const results = document.getElementById('results');
const themeToggle = document.getElementById('theme-toggle');
const systemDark = matchMedia('(prefers-color-scheme: dark)');

let active = null;    // { id, view }
let loading = 0;      // guards against a slow lazy-load finishing after the user switched again
let lastSceneKey = '';

// Swaps the visible view. The old one stays up while the new one downloads; if the new one
// can't load or start (offline, no WebGL), we stay on — or fall back to — the 2D view.
async function showView(id) {
  if (active?.id === id) return true;
  const token = ++loading;
  const spinner = setTimeout(() => stage.classList.add('is-loading'), 150);
  let view = null;
  try {
    const { createView } = await getView(id).load();
    if (token !== loading) return false;
    view = createView();
    view.mount(stage);
  } catch (err) {
    console.error(err);
    view?.unmount();
    if (token === loading) {
      toast(t(navigator.onLine ? 'view.failed' : 'view.offline', { view: getView(id).label }));
      store.set({ view: active?.id ?? '2d' });
    }
    return false;
  } finally {
    clearTimeout(spinner);
    if (token === loading) stage.classList.remove('is-loading');
  }
  active?.view.unmount();
  active = { id, view };
  lastSceneKey = '';
  return true;
}

// Theme and area colour live on <html> as data attributes the stylesheet keys off.
function applyDisplay(state) {
  const dark = state.theme === 'dark' || (state.theme === 'auto' && systemDark.matches);
  const root = document.documentElement;
  root.dataset.mode = dark ? 'dark' : 'light';
  root.dataset.area = state.color;
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0e1116' : '#e9eef4';
  themeToggle.setAttribute('aria-label', t(dark ? 'theme.toLight' : 'theme.toDark'));
  themeToggle.title = t(dark ? 'theme.toLight' : 'theme.toDark');
  return dark;
}

const areaText = (m2, unit) => withUnit(fromM2(m2, unit), unit);

// Numbers rounded so that converting between systems (float noise) doesn't count as a change.
const sceneKey = scene => JSON.stringify(
  [scene.shape, scene.height, scene.references.map(r => [r.token, r.w, r.d, r.h, r.x, r.z]), scene.landmark?.id],
  (_, v) => (typeof v === 'number' ? Number(v.toPrecision(9)) : v),
);

async function render(state) {
  const night = applyDisplay(state);
  const input = resolveInput(state);
  const both = state.units === 'both';
  const areaLabel = areaText(input.areaM2, input.areaUnit) +
    (both ? ` · ${areaText(input.areaM2, naturalAreaUnit(input.areaM2, OTHER_SYSTEM[input.system]))}` : '');
  const volumeLabel = input.height ? formatVolumes(input.volumeM3, input.system, both) : '';
  const drawn = chooseLandmark(state.compare);
  const comparisons = compare(input.areaM2, { keep: drawn?.id });
  const landmark = drawn && { id: drawn.id, name: landmarkName(drawn.id), shape: landmarkShape(drawn) };
  const scene = buildScene({
    areaM2: input.areaM2, dims: input.dims, height: input.height, layout: getView(state.view).layout, landmark, objects: state.objects,
  });

  renderResults(results, state, input);
  compareCard.update({ state, references: scene.references, comparisons, drawn, system: input.system, both });
  writeUrl(state);
  savePrefs(state);
  document.title = `${areaText(input.areaM2, input.areaUnit)} · AreaVisualizer`;

  if (await showView(state.view) && store.get() === state) {
    // Re-frame the camera only when what's drawn changed — not for a setting or theme switch.
    const key = sceneKey(scene);
    const settings = { grid: state.grid, labels: state.labels, measures: state.measures, shadows: state.shadows };
    active.view.update(scene, { system: input.system, both, areaLabel, volumeLabel, night, settings, reframe: key !== lastSceneKey });
    lastSceneKey = key;
  }
}

// The language switches first, so every part of the page redraws in the new one.
let shownLanguage = null;
function applyLanguage(state) {
  setLanguage(state.lang);
  if (state.lang === shownLanguage) return;
  shownLanguage = state.lang;
  document.documentElement.lang = state.lang;
  translatePage();
  renderCredits(document.querySelector('#credits .credits-body'));
}
setLanguage(store.get().lang);
store.subscribe(applyLanguage);

initControls(document.getElementById('controls'), store);
const compareCard = initCompare(document.getElementById('compare'), store);
initStageChrome(stage, store);
initUnitsToggle(document.getElementById('units-toggle'), store);
initShare(document.getElementById('share'));
initLanguagePicker(document.querySelector('.lang-menu'), store);
initFolds();
applyLanguage(store.get());
themeToggle.addEventListener('click', () => store.set({ theme: document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark' }));
systemDark.addEventListener('change', () => render(store.get()));
store.subscribe(render);
render(store.get());
