import { LANDMARKS } from '../data/landmarks.js';
import { OUTLINES } from '../data/outlines.js';

// Landmark shapes for drawing, in meters, centered on (0, 0); x along the length, z across:
// { width, depth, rings: [[[x, z], …]], marks: [[[x, z], …]] } — rings are closed outlines,
// marks are open polylines (court lines, pillows…).

const arc = (cx, cz, r, from, to, steps = 24) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
  });
const circle = (cx, cz, r) => arc(cx, cz, r, 0, Math.PI * 2, 36);
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];
const across = (x, d) => [[x, -d / 2], [x, d / 2]];
const ends = fn => [-1, 1].flatMap(fn); // something drawn at both ends (s = -1, 1)

// Real markings, from each sport's official dimensions.
const MARKS = {
  tennis: (l, d) => {
    const singles = 8.23 / 2, service = 6.4;
    return [
      [[-l / 2, -singles], [l / 2, -singles]], [[-l / 2, singles], [l / 2, singles]],
      across(0, d), across(-service, singles * 2), across(service, singles * 2),
      [[-service, 0], [service, 0]],
    ];
  },
  basketball: (l, d) => [
    across(0, d),
    circle(0, 0, 1.83),
    ...ends(s => {
      const end = (s * l) / 2, line = s * (l / 2 - 5.79), hoop = s * (l / 2 - 1.6);
      const corner = Math.asin(6.71 / 7.24);
      return [
        [[end, -2.44], [line, -2.44], [line, 2.44], [end, 2.44]],
        circle(line, 0, 1.83),
        [[end, -6.71], [hoop - s * 7.24 * Math.cos(corner), -6.71]],
        [[end, 6.71], [hoop - s * 7.24 * Math.cos(corner), 6.71]],
        arc(hoop, 0, 7.24, s > 0 ? Math.PI - corner : -corner, s > 0 ? Math.PI + corner : corner),
      ];
    }),
  ],
  soccer: (l, d) => [
    across(0, d),
    circle(0, 0, 9.15),
    ...ends(s => {
      const end = (s * l) / 2, box = s * (l / 2 - 16.5), spot = s * (l / 2 - 11);
      const outside = Math.acos(5.5 / 9.15); // the part of the penalty arc outside the box
      return [
        [[end, -20.16], [box, -20.16], [box, 20.16], [end, 20.16]],
        [[end, -9.16], [s * (l / 2 - 5.5), -9.16], [s * (l / 2 - 5.5), 9.16], [end, 9.16]],
        arc(spot, 0, 9.15, s > 0 ? Math.PI - outside : -outside, s > 0 ? Math.PI + outside : outside, 12),
      ];
    }),
  ],
  // Goal lines and every 5 yards between them.
  football: (l, d) => Array.from({ length: 21 }, (_, i) => across((i - 10) * 4.572, d)),
  // Ten 2.5 m lanes.
  pool: (l, d) => Array.from({ length: 9 }, (_, i) => [[-l / 2, -d / 2 + 2.5 * (i + 1)], [l / 2, -d / 2 + 2.5 * (i + 1)]]),
  singlebed: (l, d) => [rect(-l / 2 + 0.06, -0.33, -l / 2 + 0.5, 0.33), across(-l / 2 + 0.75, d)],
  kingbed: (l, d) => [
    rect(-l / 2 + 0.06, -0.9, -l / 2 + 0.56, -0.06), rect(-l / 2 + 0.06, 0.06, -l / 2 + 0.56, 0.9),
    across(-l / 2 + 0.8, d),
  ],
  card: l => [rect(-l / 2 + 0.008, -0.012, -l / 2 + 0.019, -0.003)], // the chip
  centralpark: () => [arc(780, -40, 470, 0, Math.PI * 2, 36).map(([x, z]) => [x, z * 0.62])], // the Reservoir
};

const cache = new Map();

// Drawable shape for a landmark, or null (e.g. Earth's land area).
export function landmarkShape(landmark) {
  if (!cache.has(landmark.id)) cache.set(landmark.id, buildShape(landmark));
  return cache.get(landmark.id);
}

function buildShape({ id, size }) {
  let rings;
  if (size) {
    const [l, d] = size;
    rings = [rect(-l / 2, -d / 2, l / 2, d / 2).slice(0, -1)];
  } else if (OUTLINES[id]) {
    rings = OUTLINES[id].map(flat => Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]]));
  } else {
    return null;
  }
  const xs = rings.flat().map(p => p[0]), zs = rings.flat().map(p => p[1]);
  const width = Math.max(...xs) - Math.min(...xs), depth = Math.max(...zs) - Math.min(...zs);
  return { width, depth, rings, marks: MARKS[id]?.(width, depth) ?? [] };
}

// The landmark to draw: only one the visitor picked (and that can be drawn).
export function chooseLandmark(choice) {
  const landmark = LANDMARKS.find(l => l.id === choice);
  return landmark && landmarkShape(landmark) ? landmark : null;
}

export const isLandmarkChoice = v => v === 'none' || LANDMARKS.some(l => l.id === v);
