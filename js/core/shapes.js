// Squares are rectangles with equal sides; older links and settings may still say 'square'.
export const SHAPES = {
  rectangle: { label: 'Rectangle' },
  circle:    { label: 'Circle' },
};

export const isShape = id => id === 'square' || Object.hasOwn(SHAPES, id);

// Turns an area into concrete dimensions (meters). `width` is along x, `depth` along z, and the
// longer side always runs across. For rectangles, `ratio` is the second side ÷ the first.
export function shapeDimensions(areaM2, shape = 'rectangle', ratio = 1) {
  if (shape === 'circle') {
    const radius = Math.sqrt(areaM2 / Math.PI);
    return { type: 'circle', radius, width: 2 * radius, depth: 2 * radius };
  }
  const r = shape === 'rectangle' ? Math.max(ratio, 1 / ratio) : 1;
  const depth = Math.sqrt(areaM2 / r);
  return { type: r === 1 ? 'square' : 'rectangle', width: depth * r, depth };
}
