import { pickReferences, resolveObjects, named } from './references.js';
import { footprint } from './arrange.js';
import { locale } from '../i18n/index.js';

// Everything about what's drawn except where things stand. While this stays the same, a view only
// has to move what moved instead of building the whole scene again.
export const contentKey = (scene, { reframe, ...opts }) => JSON.stringify([
  locale(), scene.shape, scene.height, scene.references.map(r => [r.id, r.name, r.w, r.d, r.h]), scene.landmark?.name,
  scene.second && [scene.second.name, scene.second.shape.width, scene.second.shape.depth], opts,
]);

// Builds the renderer-agnostic scene every view draws. All values are meters.
// Origin is the center of the area; x → right, z → toward the viewer, y → up.
// `layout` places the reference objects: 'front' lines them up just in front of the area's front
// edge (best seen from above), 'side' stands them in a row to its right, fronts aligned with the
// area's front edge (nothing blocks the area when seen at an angle).
// `objects` is the visitor's own list of object tokens (see core/references.js), or null to pick
// objects that suit the area's size. An optional `landmark` ({ id, name, shape } from
// core/landmarks.js) is drawn to scale on the area's left — the side both layouts keep free —
// centered on it front to back. A `height` (0 for a flat area) raises the area into a box; a tall
// one gets objects that suit its height.
export function buildScene({ areaM2, dims, height = 0, layout = 'front', landmark = null, objects = null, second = null }) {
  const span = Math.max(dims.width, dims.depth);
  const gap = span * 0.05;
  const picked = objects ? resolveObjects(objects) : pickReferences(Math.max(span, height)).map(r => ({ ...named(r), token: r.id }));

  // Objects the visitor has moved stay put; the rest line up beyond them.
  const rightmost = Math.max(dims.width / 2, ...picked.filter(r => r.placed).map(r => r.x + footprint(r).hx));
  let cursor = layout === 'side' ? rightmost + gap : -dims.width / 2;
  const references = picked.map(ref => {
    if (ref.placed) return ref;
    const z = layout === 'side' ? dims.depth / 2 - ref.d / 2 : dims.depth / 2 + gap + ref.d / 2;
    const placed = { ...ref, x: cursor + ref.w / 2, z };
    cursor += ref.w + gap;
    return placed;
  });

  let placedLandmark = null;
  if (landmark) {
    const { width, depth } = landmark.shape;
    const lmGap = Math.max(span, width, depth) * 0.18; // leaves room for the area's left dimension
    const { place, ...rest } = landmark;
    placedLandmark = { ...rest, x: place?.x ?? -dims.width / 2 - lmGap - width / 2, z: place?.z ?? 0, r: place?.r ?? 0 };
  }
  // A second area starts behind the first: objects stand to the right and a landmark to the left.
  let placedSecond = null;
  if (second) {
    const { width, depth } = second.shape;
    const backGap = Math.max(span, width, depth) * 0.18;
    placedSecond = { ...second, x: second.x ?? 0, z: second.z ?? -dims.depth / 2 - backGap - depth / 2, r: second.r ?? 0 };
  }
  const flat = area => (area ? [{ ...area, w: area.shape.width, d: area.shape.depth }] : []);
  const boxes = [...references, ...flat(placedLandmark), ...flat(placedSecond)]
    .map(box => ({ x: box.x, z: box.z, ...footprint(box) }));

  const xs = [-dims.width / 2, dims.width / 2, ...boxes.flatMap(b => [b.x - b.hx, b.x + b.hx])];
  const zs = [-dims.depth / 2, dims.depth / 2, ...boxes.flatMap(b => [b.z - b.hz, b.z + b.hz])];
  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    maxY: Math.max(height, ...references.map(r => r.h)),
  };

  return { areaM2, span, height, shape: dims, references, landmark: placedLandmark, second: placedSecond, bounds };
}
