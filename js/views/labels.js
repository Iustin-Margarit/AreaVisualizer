// Lays out object labels (screen pixels). Each label sits just beside its anchor — below it when
// `direction` is 1, above it when -1 — and moves away one line at a time until it no longer
// overlaps a label placed before it.
// items: [{ anchorX, anchorY, width, ... }] → same items plus { x, y, shift (lines moved) }.
export function layoutLabels(items, { gap = 8, lineHeight = 16, offset = 16, direction = 1 } = {}) {
  const placed = [];
  return [...items]
    .sort((a, b) => a.anchorX - b.anchorX)
    .map(item => {
      const left = item.anchorX - item.width / 2;
      const right = left + item.width;
      const yAt = shift => item.anchorY + direction * (offset + shift * lineHeight);
      const hits = y => placed.some(p => left < p.right + gap && right + gap > p.left && Math.abs(y - p.y) < lineHeight);
      let shift = 0;
      while (hits(yAt(shift))) shift++;
      const out = { ...item, x: item.anchorX, y: yAt(shift), shift };
      placed.push({ left, right, y: out.y });
      return out;
    });
}
