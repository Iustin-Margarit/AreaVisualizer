import { inSystem } from '../core/input.js';

// The site-wide Metric / Imperial / Both switch. Picking a system converts the size into it (same
// physical size, new units); "Both" keeps the units and adds the other system next to every number.
export function initUnitsToggle(el, store) {
  el.addEventListener('click', e => {
    const units = e.target.closest('[data-units]')?.dataset.units;
    const s = store.get();
    if (!units || units === s.units) return;
    store.set({ units, ...(units === 'both' ? {} : inSystem(s, units)) });
  });

  const sync = s => el.querySelectorAll('[data-units]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.units === s.units)));
  store.subscribe(sync);
  sync(store.get());
}
