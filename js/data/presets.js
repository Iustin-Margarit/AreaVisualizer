// One-tap examples anyone recognises, in round numbers of each measuring system. Each `patch`
// sets the size; courts and pools use their official dimensions in that system. Buttons show the
// area ("100 m²") or, with a `key`, a translated name ("Tennis court").
const area = (value, unit, key) => ({ key, value, unit, patch: { mode: 'area', shape: 'rectangle', ratio: 1, value, unit } });
const sides = (key, width, length, lengthUnit) => ({ key, patch: { mode: 'dims', shape: 'rectangle', width, length, lengthUnit } });

export const PRESETS = {
  metric: [
    area(1, 'm2'),
    area(10, 'm2'),
    area(100, 'm2'),
    sides('preset.tennis', 10.97, 23.77, 'm'),
    sides('preset.pool', 25, 50, 'm'),
    area(1, 'ha', 'preset.hectare'),
    area(1, 'km2'),
  ],
  imperial: [
    area(1, 'ft2'),
    area(100, 'ft2'),
    area(1000, 'ft2'),
    sides('preset.tennis', 36, 78, 'ft'),
    sides('preset.pool', 82, 164, 'ft'),
    area(1, 'ac', 'preset.acre'),
    area(1, 'mi2'),
  ],
};
