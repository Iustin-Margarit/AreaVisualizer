// Well-known volumes in m³, for "≈ 250 bathtubs" when an area has a height. Names and phrases are
// in js/i18n/ (`volumes`, or `landmarks` for the two that share a name with a landmark).
export const VOLUMES = [
  { id: 'bottle',    m3: 0.0015 },
  { id: 'bucket',    m3: 0.01 },
  { id: 'bathtub',   m3: 0.2 },
  { id: 'container', m3: 67.7 },  // 40 ft
  { id: 'pool',      m3: 2500 },  // 50 × 25 × 2 m
  { id: 'pyramid',   m3: 2.5e6, proper: true }, // the Great Pyramid of Giza
];
