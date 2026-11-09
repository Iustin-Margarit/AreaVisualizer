import { secondSize } from './input.js';
import { t } from '../i18n/index.js';

export const circleRing = radius => Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  return [radius * Math.cos(a), radius * Math.sin(a)];
});

// The second area in the shape views draw (like a landmark's), labelled with its size.
// `describeArea` turns m² into text.
export function secondArea(second, describeArea) {
  if (!second) return null;
  const { width, depth, radius, areaM2 } = secondSize(second);
  const [hw, hd] = [width / 2, depth / 2];
  const rings = [radius ? circleRing(radius) : [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]];
  return {
    id: 'second', name: `${t('second.name')} · ${describeArea(areaM2)}`, areaM2,
    shape: { width, depth, rings, marks: [] }, x: second.x, z: second.z, r: second.r,
  };
}
