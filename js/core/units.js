// Area units. `toM2` is how many square meters one unit equals; `start` is the number shown
// when a visitor first lands on that unit.
export const UNITS = {
  m2:  { label: 'm²',  name: 'square meters',     toM2: 1,              system: 'metric',   start: 1 },
  ha:  { label: 'ha',  name: 'hectares',          toM2: 10000,          system: 'metric',   start: 1 },
  km2: { label: 'km²', name: 'square kilometers', toM2: 1e6,            system: 'metric',   start: 1 },
  ft2: { label: 'ft²', name: 'square feet',       toM2: 0.09290304,     system: 'imperial', start: 100 },
  yd2: { label: 'yd²', name: 'square yards',      toM2: 0.83612736,     system: 'imperial', start: 1 },
  ac:  { label: 'ac',  name: 'acres',             toM2: 4046.8564224,   system: 'imperial', start: 1 },
  mi2: { label: 'mi²', name: 'square miles',      toM2: 2589988.110336, system: 'imperial', start: 1 },
};

// Length units for the sides. `start` is the width × length a visitor first lands on.
export const LENGTH_UNITS = {
  m:  { label: 'm',  name: 'meters',      toM: 1,        system: 'metric',   start: [1, 1] },
  cm: { label: 'cm', name: 'centimeters', toM: 0.01,     system: 'metric',   start: [100, 100] },
  km: { label: 'km', name: 'kilometers',  toM: 1000,     system: 'metric',   start: [1, 1] },
  ft: { label: 'ft', name: 'feet',        toM: 0.3048,   system: 'imperial', start: [10, 10] },
  in: { label: 'in', name: 'inches',      toM: 0.0254,   system: 'imperial', start: [12, 12] },
  yd: { label: 'yd', name: 'yards',       toM: 0.9144,   system: 'imperial', start: [1, 1] },
  mi: { label: 'mi', name: 'miles',       toM: 1609.344, system: 'imperial', start: [1, 1] },
};

// Volume units, for an area given a height. Shown as results only, never typed.
export const VOLUME_UNITS = {
  cm3: { label: 'cm³',    name: 'cubic centimeters', toM3: 1e-6,           system: 'metric' },
  l:   { label: 'L',      name: 'liters',            toM3: 0.001,          system: 'metric' },
  m3:  { label: 'm³',     name: 'cubic meters',      toM3: 1,              system: 'metric' },
  in3: { label: 'in³',    name: 'cubic inches',      toM3: 0.000016387064, system: 'imperial' },
  gal: { label: 'US gal', name: 'US gallons',        toM3: 0.003785411784, system: 'imperial' },
  ft3: { label: 'ft³',    name: 'cubic feet',        toM3: 0.028316846592, system: 'imperial' },
  yd3: { label: 'yd³',    name: 'cubic yards',       toM3: 0.764554857984, system: 'imperial' },
};

// How much water a volume holds is told in this unit.
export const FLUID_UNIT = { metric: 'l', imperial: 'gal' };

// The closest unit in the other measuring system, for switching between them.
export const COUNTERPART = {
  m2: 'ft2', ha: 'ac', km2: 'mi2', ft2: 'm2', yd2: 'm2', ac: 'ha', mi2: 'km2',
  m: 'ft', cm: 'in', km: 'mi', ft: 'm', in: 'cm', yd: 'm', mi: 'km',
};

export const SYSTEM_UNITS = {
  metric:   { unit: 'm2',  lengthUnit: 'm',  heightUnit: 'm' },
  imperial: { unit: 'ft2', lengthUnit: 'ft', heightUnit: 'ft' },
};

export const isUnit = id => Object.hasOwn(UNITS, id);
export const isLengthUnit = id => Object.hasOwn(LENGTH_UNITS, id);

export const toM2 = (value, unit) => value * UNITS[unit].toM2;

export const fromM2 = (m2, unit) => m2 / UNITS[unit].toM2;

export const fromM3 = (m3, unit) => m3 / VOLUME_UNITS[unit].toM3;

// The unit people would naturally use for a volume of this size: small boxes in cm³ or in³.
export function naturalVolumeUnit(m3, system) {
  if (system === 'imperial') return m3 < VOLUME_UNITS.ft3.toM3 ? 'in3' : 'ft3';
  return m3 < VOLUME_UNITS.l.toM3 ? 'cm3' : 'm3';
}

// The unit people would naturally use for an area of this size in a given system.
export function naturalAreaUnit(m2, system) {
  if (system === 'imperial') {
    if (m2 < UNITS.ac.toM2 / 4) return 'ft2';
    return m2 < UNITS.mi2.toM2 ? 'ac' : 'mi2';
  }
  if (m2 < UNITS.ha.toM2) return 'm2';
  return m2 < UNITS.km2.toM2 ? 'ha' : 'km2';
}
