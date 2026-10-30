import { formatLength } from '../../core/format.js';

const IN = 0.0254;
const FT = 0.3048;
const MI = 1609.344;

const decades = (lo, hi) => {
  const out = [];
  for (let e = lo; e <= hi; e++) for (const m of [1, 2, 5]) out.push(m * 10 ** e);
  return out;
};

// Candidate grid spacings in meters, so labels are always round numbers in the chosen system.
const STEPS = {
  metric: decades(-3, 7),
  imperial: [
    ...[1, 2, 3, 6].map(n => n * IN),
    ...decades(0, 3).filter(n => n <= 2000).map(n => n * FT),
    ...decades(0, 4).map(n => n * MI),
  ],
};

// Smallest round spacing that is at least `minMeters`.
export function gridStep(minMeters, system = 'metric') {
  const steps = STEPS[system] ?? STEPS.metric;
  const step = steps.find(s => s >= minMeters) ?? steps.at(-1);
  return { step, label: formatLength(step, system) };
}
