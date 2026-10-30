import { UNITS, LENGTH_UNITS, SYSTEM_UNITS, VOLUME_UNITS, FLUID_UNIT, fromM2, fromM3, naturalAreaUnit } from '../core/units.js';
import { parseNumber, editableNumber, withUnit, formatLength, formatVolumes, OTHER_SYSTEM } from '../core/format.js';
import { systemOf, resolveInput, sidesOf, startHeight } from '../core/input.js';
import { VALIDATORS } from '../state.js';
import { PRESETS } from '../data/presets.js';
import { t, unitName, unitSymbol } from '../i18n/index.js';

// Unit menus list only the chosen measuring system's units, or both groups when comparing.
function unitOptions(table, units) {
  const group = system => Object.entries(table)
    .filter(([, u]) => u.system === system)
    .map(([id]) => `<option value="${id}">${unitSymbol(id)} — ${unitName(id)}</option>`)
    .join('');
  if (units !== 'both') return group(units);
  return ['metric', 'imperial'].map(system => `<optgroup label="${t(`system.${system}`)}">${group(system)}</optgroup>`).join('');
}

const presetLabel = p => (p.key ? t(p.key) : withUnit(p.value, p.unit));
const round = (n, sig) => Number(n.toPrecision(sig));
const clampRatio = r => Math.min(100, Math.max(0.01, r));
const HEIGHT_UNIT = { km: 'm', mi: 'ft' }; // sides in these: measure the height in something smaller
const fluid = (m3, system) => withUnit(fromM3(m3, FLUID_UNIT[system]), FLUID_UNIT[system]);

// The size card. Sides and area are linked: whichever the visitor typed last holds their number
// (state.mode), the other shows the result. Changing the shape keeps the area. A height is
// optional and makes the area a box, with its volume worked out underneath.
export function initControls(form, store) {
  const $ = id => form.querySelector(`#${id}`);
  const value = $('area-value');
  const unit = $('area-unit');
  const width = $('dim-width');
  const length = $('dim-length');
  const lengthUnit = $('length-unit');
  const times = form.querySelector('.sides .times');
  const sidesLabel = $('sides-label');
  const sidesAlt = $('sides-alt');
  const areaAlt = $('area-alt');
  const shapePicker = $('shape-picker');
  const addHeight = $('add-height');
  const height = $('dim-height');
  const heightUnit = $('height-unit');
  const heightAlt = $('height-alt');
  const volume = $('volume');
  const presets = $('presets');
  let rendered = {}; // what the unit menus and presets were last built for

  form.addEventListener('submit', e => {
    e.preventDefault();
    document.activeElement?.blur(); // closes the mobile keyboard
  });

  // A number too long for its box gets a smaller font rather than being cut off (100000 would
  // otherwise read as "1000").
  const numbers = [value, width, length, height];
  const fit = input => {
    input.style.fontSize = '';
    if (input.scrollWidth <= input.clientWidth) return;
    // Text width grows with the font size, so scale it by how much room there is (to a minimum).
    const css = getComputedStyle(input);
    const padding = parseFloat(css.paddingLeft) + parseFloat(css.paddingRight);
    const room = (input.clientWidth - padding) / (input.scrollWidth - padding);
    input.style.fontSize = `${Math.max(9, parseFloat(css.fontSize) * room * 0.96)}px`;
  };
  form.addEventListener('input', e => { if (numbers.includes(e.target)) fit(e.target); });
  addEventListener('resize', () => numbers.forEach(fit));

  // Reads a number field; flags it when invalid. Returns the number or null.
  const read = (input, field) => {
    const n = parseNumber(input.value);
    const ok = VALIDATORS[field](n);
    input.setAttribute('aria-invalid', String(!ok));
    return ok ? n : null;
  };

  // Typing one side keeps the other side as currently shown.
  const sideInput = (input, field, other, otherField) => input.addEventListener('input', () => {
    const n = read(input, field);
    if (n === null) return;
    const patch = { mode: 'dims', [field]: n };
    if (store.get().mode === 'area') {
      const shown = parseNumber(other.value);
      if (VALIDATORS[otherField](shown)) patch[otherField] = shown;
    }
    store.set(patch);
  });
  sideInput(width, 'width', length, 'length');
  sideInput(length, 'length', width, 'width');

  value.addEventListener('input', () => {
    const n = read(value, 'value');
    if (n === null) return;
    const s = store.get();
    const patch = { mode: 'area', value: n };
    // Keep a typed rectangle's proportions when its area is retyped.
    if (s.mode === 'dims' && s.shape === 'rectangle') patch.ratio = clampRatio(s.length / s.width);
    store.set(patch);
  });

  width.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !length.hidden) { e.preventDefault(); length.focus(); }
  });

  unit.addEventListener('change', () => store.set({ unit: unit.value }));
  lengthUnit.addEventListener('change', () => store.set({ lengthUnit: lengthUnit.value }));

  addHeight.addEventListener('click', () => {
    const s = store.get();
    const unitId = HEIGHT_UNIT[s.lengthUnit] ?? s.lengthUnit;
    store.set({ height: startHeight(resolveInput(s).areaM2, unitId), heightUnit: unitId });
    height.focus();
    height.select();
  });
  // Back to the starting size (1 × 1 m or 10 × 10 ft, flat), ready to type a new one over it.
  $('reset-size').addEventListener('click', () => {
    const { unit: unitId, lengthUnit: lengthId } = SYSTEM_UNITS[systemOf(store.get())];
    const [w, l] = LENGTH_UNITS[lengthId].start;
    store.set({ mode: 'dims', shape: 'rectangle', ratio: 1, width: w, length: l, unit: unitId, lengthUnit: lengthId, height: null });
    width.focus();
    width.select();
  });
  $('remove-height').addEventListener('click', () => {
    store.set({ height: null });
    addHeight.focus();
  });
  height.addEventListener('input', () => {
    const n = read(height, 'height');
    if (n !== null) store.set({ height: n });
  });
  heightUnit.addEventListener('change', () => store.set({ heightUnit: heightUnit.value }));

  shapePicker.addEventListener('click', e => {
    const shape = e.target.closest('[data-shape]')?.dataset.shape;
    const s = store.get();
    if (!shape || shape === s.shape) return;
    if (s.mode === 'area') return store.set({ shape });
    // Typed sides: switch to the area they make, so the new shape has the same area.
    const { areaM2 } = resolveInput(s);
    const ratio = s.shape === 'rectangle' ? clampRatio(s.length / s.width) : s.ratio;
    store.set({ shape, mode: 'area', value: round(fromM2(areaM2, s.unit), 6), ratio });
  });

  presets.addEventListener('click', e => {
    const preset = PRESETS[systemOf(store.get())][e.target.closest('[data-preset]')?.dataset.preset];
    if (preset) store.set(preset.patch);
  });

  // Typed fields are only rewritten if they don't already say the same thing (so "1." or "1,0"
  // survive); calculated fields always follow, unless the visitor is in them.
  const showTyped = (input, n) => {
    input.removeAttribute('data-derived');
    if (parseNumber(input.value) !== n) {
      input.value = editableNumber(n);
      input.removeAttribute('aria-invalid');
    }
  };
  const showDerived = (input, n) => {
    input.setAttribute('data-derived', '');
    if (document.activeElement !== input) {
      input.value = editableNumber(n, 4);
      input.removeAttribute('aria-invalid');
    }
  };

  function sync(s) {
    const system = systemOf(s);
    const relabel = rendered.lang !== s.lang;
    if (relabel) {
      // Numbers are rewritten with the new language's decimal mark ("2.5" becomes "2,5").
      for (const input of [value, width, length, height]) input.value = '';
    }
    if (relabel || rendered.units !== s.units) {
      unit.innerHTML = unitOptions(UNITS, s.units);
      lengthUnit.innerHTML = heightUnit.innerHTML = unitOptions(LENGTH_UNITS, s.units);
    }
    if (relabel || rendered.system !== system) {
      presets.innerHTML = PRESETS[system].map((p, i) => `<button type="button" data-preset="${i}">${presetLabel(p)}</button>`).join('');
    }
    rendered = { units: s.units, system, lang: s.lang };

    const { areaM2, dims, height: heightM, volumeM3 } = resolveInput(s);
    const circle = s.shape === 'circle';
    let sidesM; // the two sides as shown, in meters
    if (s.mode === 'area') {
      showTyped(value, s.value);
      const [a, b] = sidesOf(dims, s.lengthUnit, circle ? 1 : s.ratio);
      showDerived(width, a);
      showDerived(length, b);
      sidesM = sidesOf(dims, 'm', circle ? 1 : s.ratio);
    } else {
      showDerived(value, fromM2(areaM2, s.unit));
      showTyped(width, s.width);
      showTyped(length, s.length);
      const toM = LENGTH_UNITS[s.lengthUnit].toM;
      sidesM = [s.width * toM, s.length * toM];
    }
    unit.value = s.unit;
    lengthUnit.value = s.lengthUnit;

    length.hidden = times.hidden = circle;
    sidesLabel.textContent = t(circle ? 'sides.diameter' : 'sides.label');
    width.setAttribute('aria-label', t(circle ? 'sides.diameter' : 'sides.width'));
    shapePicker.querySelectorAll('[data-shape]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.shape === s.shape)));

    // Comparing systems: the same size in the other one, under each field.
    const other = OTHER_SYSTEM[system];
    sidesAlt.hidden = areaAlt.hidden = s.units !== 'both';
    if (s.units === 'both') {
      sidesAlt.textContent = circle
        ? `= ${t('dims.across', { d: formatLength(sidesM[0], other) })}`
        : `= ${formatLength(sidesM[0], other)} × ${formatLength(sidesM[1], other)}`;
      const otherUnit = naturalAreaUnit(areaM2, other);
      areaAlt.textContent = `= ${withUnit(fromM2(areaM2, otherUnit), otherUnit)}`;
    }

    const raised = s.height !== null;
    addHeight.hidden = raised;
    for (const id of ['height-head', 'height-group', 'volume']) $(id).hidden = !raised;
    heightAlt.hidden = !raised || s.units !== 'both';
    if (raised) {
      showTyped(height, s.height);
      heightUnit.value = s.heightUnit;
      heightAlt.textContent = `= ${formatLength(heightM, other)}`;
      // The volume, and how much water that is (unless it's thimble-sized).
      const both = s.units === 'both';
      const water = volumeM3 >= VOLUME_UNITS.l.toM3
        ? ` <span>· ${both ? `${fluid(volumeM3, system)} · ${fluid(volumeM3, other)}` : fluid(volumeM3, system)}</span>`
        : '';
      volume.innerHTML = `${t('volume')} <strong>${formatVolumes(volumeM3, system, both)}</strong>${water}`;
    }
    numbers.forEach(fit); // last, once hidden fields have been shown
  }

  store.subscribe(sync);
  sync(store.get());
}
