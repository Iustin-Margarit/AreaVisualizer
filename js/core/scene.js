import { pickReferences, resolveObjects, named } from './references.js';

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
export function buildScene({ areaM2, dims, height = 0, layout = 'front', landmark = null, objects = null }) {
  const span = Math.max(dims.width, dims.depth);
  const gap = span * 0.05;
  const picked = objects ? resolveObjects(objects) : pickReferences(Math.max(span, height)).map(r => ({ ...named(r), token: r.id }));

  let cursor = layout === 'side' ? dims.width / 2 + gap : -dims.width / 2;
  const references = picked.map(ref => {
    const z = layout === 'side' ? dims.depth / 2 - ref.d / 2 : dims.depth / 2 + gap + ref.d / 2;
    const placed = { ...ref, x: cursor + ref.w / 2, z };
    cursor += ref.w + gap;
    return placed;
  });

  let placedLandmark = null;
  if (landmark) {
    const { width, depth } = landmark.shape;
    const lmGap = Math.max(span, width, depth) * 0.18; // leaves room for the area's left dimension
    placedLandmark = { ...landmark, x: -dims.width / 2 - lmGap - width / 2, z: 0 };
  }
  const boxes = [...references, ...(placedLandmark ? [{ ...placedLandmark, w: landmark.shape.width, d: landmark.shape.depth }] : [])];

  const xs = [-dims.width / 2, dims.width / 2, ...boxes.flatMap(r => [r.x - r.w / 2, r.x + r.w / 2])];
  const zs = [-dims.depth / 2, dims.depth / 2, ...boxes.flatMap(r => [r.z - r.d / 2, r.z + r.d / 2])];
  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    maxY: Math.max(height, ...references.map(r => r.h)),
  };

  return { areaM2, span, height, shape: dims, references, landmark: placedLandmark, bounds };
}
