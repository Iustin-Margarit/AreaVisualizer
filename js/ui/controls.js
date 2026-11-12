import { UNITS, LENGTH_UNITS, SYSTEM_UNITS, VOLUME_UNITS, FLUID_UNIT, fromM2, toM2, fromM3, naturalAreaUnit } from '../core/units.js';
import { parseNumber, editableNumber, formatNumber, withUnit, formatLength, formatVolumes, OTHER_SYSTEM } from '../core/format.js';
import { systemOf, resolveInput, sidesOf, startHeight, secondSize } from '../core/input.js';
import { compareVolume, describeVolume } from '../core/comparisons.js';
import { shapeTemplate } from '../core/shapes.js';
import { tidy } from '../core/arrange.js';
import { VALIDATORS } from '../state.js';
import { PRESETS } from '../data/presets.js';
import { t, unitName, unitSymbol } from '../i18n/index.js';

// Unit menus list only the chosen measuring system's units, or both groups when comparing.
// Browsers with styleable menus show the symbol and name as two columns (css: base-select); the
// others drop the spans and read "m² — square meters".
function unitOptions(table, units) {
  const group = system => Object.entries(table)
    .filter(([, u]) => u.system === system)
    .map(([id]) => `<option value="${id}"><span class="opt-symbol">${unitSymbol(id)}</span><span class="opt-sep"> — </span><span class="opt-name">${unitName(id)}</span></option>`)
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
export function initControls(form, store, arrange) {
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

  // A custom shape is stretched to the sides typed, or scaled to the area typed.
  const stretched = (s, sx, sz) => store.set({ points: resolveInput(s).dims.points.map(([x, z]) => [tidy(x * sx), tidy(z * sz)]) });

  // Typing one side keeps the other side as currently shown.
  const sideInput = (input, field, other, otherField) => input.addEventListener('input', () => {
    const n = read(input, field);
    if (n === null) return;
    const now = store.get();
    if (now.shape === 'custom') {
      const { dims } = resolveInput(now);
      const toM = LENGTH_UNITS[now.lengthUnit].toM;
      return field === 'width' ? stretched(now, (n * toM) / dims.width, 1) : stretched(now, 1, (n * toM) / dims.depth);
    }
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
    if (s.shape === 'custom') {
      const scale = Math.sqrt(toM2(n, s.unit) / resolveInput(s).areaM2);
      return stretched(s, scale, scale);
    }
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
    const { areaM2, dims } = resolveInput(s);
    if (shape === 'custom') return startFrom('l');
    if (s.shape === 'custom') return store.set({ shape, mode: 'area', value: round(fromM2(areaM2, s.unit), 6), ratio: clampRatio(dims.depth / dims.width) });
    if (s.mode === 'area') return store.set({ shape });
    // Typed sides: switch to the area they make, so the new shape has the same area.
    const ratio = s.shape === 'rectangle' ? clampRatio(s.length / s.width) : s.ratio;
    store.set({ shape, mode: 'area', value: round(fromM2(areaM2, s.unit), 6), ratio });
  });

  // Custom shapes: a ready-made one of the same area, edited in 2D, or one drawn by hand there.
  const customTools = $('custom-tools');
  const startFrom = template => {
    const s = store.get();
    const { areaM2, dims } = resolveInput(s);
    arrange.cancelDrawing();
    store.set({ shape: 'custom', mode: 'dims', points: shapeTemplate(template, dims.width, dims.depth, areaM2), view: '2d' });
  };
  customTools.addEventListener('click', e => {
    const template = e.target.closest('[data-template]')?.dataset.template;
    if (template) startFrom(template);
  });
  $('custom-draw').addEventListener('click', () => arrange.startDrawing());

  // The second area: its own sides or diameter, or an area, which makes it a square or a circle.
  const second = {
    add: $('add-second'), head: $('second-head'), group: $('second-group'), areaGroup: $('second-area-group'), width: $('second-width'), length: $('second-length'),
    times: $('second-times'), unit: $('second-unit'), area: $('second-area'), result: $('second-result'), shape: $('second-shape'), remove: $('remove-second'),
    areaUnit: form.querySelector('.second-area-unit'),
  };
  const updateSecond = change => store.set({ second: { ...store.get().second, ...change } });
  second.add.addEventListener('click', () => {
    const s = store.get();
    const { dims } = resolveInput(s);
    const toM = LENGTH_UNITS[s.lengthUnit].toM;
    const side = v => Number(((v / toM) * 0.7).toPrecision(2));
    store.set({ second: { shape: 'rectangle', width: side(dims.width), length: side(dims.depth), unit: s.lengthUnit } });
    second.width.focus();
    second.width.select();
  });
  second.remove.addEventListener('click', () => store.set({ second: null }));
  second.shape.addEventListener('click', e => {
    const shape = e.target.closest('[data-second-shape]')?.dataset.secondShape;
    if (shape) updateSecond({ shape });
  });
  second.unit.addEventListener('change', () => updateSecond({ unit: second.unit.value }));
  for (const [input, field] of [[second.width, 'width'], [second.length, 'length']]) {
    input.addEventListener('input', () => {
      const n = read(input, field);
      if (n !== null) updateSecond({ [field]: n });
    });
  }
  second.area.addEventListener('input', () => {
    const n = read(second.area, 'value');
    if (n === null) return;
    const s = store.get();
    const m2 = toM2(n, s.unit);
    const side = (s.second.shape === 'circle' ? 2 * Math.sqrt(m2 / Math.PI) : Math.sqrt(m2)) / LENGTH_UNITS[s.second.unit].toM;
    updateSecond({ width: Number(side.toPrecision(6)), length: Number(side.toPrecision(6)) });
  });

  function syncSecond(s, areaM2, relabel) {
    const b = s.second;
    second.add.hidden = !!b;
    for (const part of [second.head, second.group, second.areaGroup, second.result]) part.hidden = !b;
    if (!b) return;
    const { areaM2: otherM2 } = secondSize(b);
    const circle = b.shape === 'circle';
    second.length.hidden = second.times.hidden = circle;
    second.width.setAttribute('aria-label', t(circle ? 'sides.diameter' : 'sides.width'));
    second.shape.querySelectorAll('[data-second-shape]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.secondShape === b.shape)));
    const show = (input, n) => {
      if (relabel || document.activeElement !== input) input.value = editableNumber(n, 5);
    };
    show(second.width, b.width);
    show(second.length, b.length);
    show(second.area, fromM2(otherM2, s.unit));
    second.unit.value = b.unit;
    second.unit.nextElementSibling.textContent = unitSymbol(b.unit);
    second.areaUnit.textContent = unitSymbol(s.unit);
    const percent = Math.abs(otherM2 / areaM2 - 1) * 100;
    const difference = withUnit(fromM2(Math.abs(otherM2 - areaM2), s.unit), s.unit);
    second.result.textContent = percent < 0.5 ? t('second.same') : t(otherM2 > areaM2 ? 'second.bigger' : 'second.smaller', { pct: formatNumber(percent, 3), d: difference });
  }

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
      lengthUnit.innerHTML = heightUnit.innerHTML = second.unit.innerHTML = unitOptions(LENGTH_UNITS, s.units);
    }
    if (relabel || rendered.system !== system) {
      presets.innerHTML = PRESETS[system].map((p, i) => `<button type="button" data-preset="${i}">${presetLabel(p)}</button>`).join('');
    }
    rendered = { units: s.units, system, lang: s.lang };

    const { areaM2, dims, height: heightM, volumeM3 } = resolveInput(s);
    const circle = s.shape === 'circle';
    const custom = s.shape === 'custom';
    let sidesM; // the two sides as shown, in meters
    if (custom) {
      const toM = LENGTH_UNITS[s.lengthUnit].toM;
      showDerived(value, fromM2(areaM2, s.unit));
      showDerived(width, dims.width / toM);
      showDerived(length, dims.depth / toM);
      sidesM = [dims.width, dims.depth];
    } else if (s.mode === 'area') {
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
    customTools.hidden = !custom;
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
      const about = compareVolume(volumeM3).map(describeVolume).join(' · ');
      volume.innerHTML = `${t('volume')} <strong>${formatVolumes(volumeM3, system, both)}</strong>${water}${about ? `<br><span class="volume-about">${about}</span>` : ''}`;
    }
    syncSecond(s, areaM2, relabel);
    // Phones show just the unit's symbol on each menu (styles.css, .unit-box); the list keeps names.
    for (const select of [unit, lengthUnit, heightUnit]) select.nextElementSibling.textContent = unitSymbol(select.value);
    numbers.forEach(fit); // last, once hidden fields have been shown
  }

  store.subscribe(sync);
  sync(store.get());
}
