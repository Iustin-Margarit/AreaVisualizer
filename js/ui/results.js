import { UNITS, VOLUME_UNITS, fromM2, fromM3, naturalAreaUnit, naturalVolumeUnit } from '../core/units.js';
import { formatNumber, withUnit, formatLength, formatVolume, OTHER_SYSTEM } from '../core/format.js';
import { t, unitSymbol } from '../i18n/index.js';
import { foldOpen, prepareFolds } from './folds.js';

const area = (m2, unit) => withUnit(fromM2(m2, unit), unit);

function sides(shape, system) {
  const len = m => formatLength(m, system);
  if (shape.type === 'circle') return t('dims.across', { d: len(shape.width) });
  return shape.type === 'square' ? t('dims.perSide', { d: len(shape.width) }) : `${len(shape.depth)} × ${len(shape.width)}`;
}

const list = (table, toUnit, skip, value) => Object.keys(table)
  .filter(id => id !== skip)
  .map(id => `<li><strong>${formatNumber(toUnit(value, id))}</strong> ${unitSymbol(id)}</li>`)
  .join('');

// The size in the other measuring system, then in every area unit (and volume unit, with a height).
// On phones the lists of units are folded (see folds.js), and stay as the visitor left them.
export function renderResults(el, state, input) {
  const { areaM2, dims, system, height, volumeM3 } = input;
  const other = OTHER_SYSTEM[system];
  const open = el.querySelector('details.fold')?.open ?? foldOpen();
  const units = items => `
    <details class="fold bare">
      <summary>${t('results.more')}</summary>
      <ul class="units">${items}</ul>
    </details>`;
  const volume = height ? `
    <div class="subhead"><span class="label">${t('volume')}</span></div>
    <p class="headline">${formatVolume(volumeM3, other)}</p>
    ${units(list(VOLUME_UNITS, fromM3, naturalVolumeUnit(volumeM3, system), volumeM3))}` : '';

  el.innerHTML = `
    <h2 class="card-title">${t('results.title')}</h2>
    <p class="headline">${area(areaM2, naturalAreaUnit(areaM2, other))}</p>
    <p class="alt">${sides(dims, other)}${height ? ` · ${t('dims.high', { d: formatLength(height, other) })}` : ''}</p>
    ${units(list(UNITS, fromM2, state.unit, areaM2))}${volume}`;
  prepareFolds(el, open);
}
