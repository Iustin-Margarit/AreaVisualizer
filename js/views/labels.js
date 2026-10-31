// Lays out object labels (screen pixels). Each label sits just beside its anchor — below it when
// `direction` is 1, above it when -1 — and moves away one line at a time until it no longer
// overlaps a label placed before it. Labels are placed by `rank` (lowest first), then left to
// right; one that would have to move more than `maxShift` lines is left out (`hidden`), so a crowd
// of objects shows its most telling names instead of a tower of them.
// items: [{ anchorX, anchorY, width, rank?, ... }] → same items plus { x, y, shift, hidden }.
export function layoutLabels(items, { gap = 8, lineHeight = 16, offset = 16, direction = 1, maxShift = Infinity } = {}) {
  const placed = [];
  return [...items]
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.anchorX - b.anchorX)
    .map(item => {
      const left = item.anchorX - item.width / 2;
      const right = left + item.width;
      const yAt = shift => item.anchorY + direction * (offset + shift * lineHeight);
      const hits = y => placed.some(p => left < p.right + gap && right + gap > p.left && Math.abs(y - p.y) < lineHeight);
      let shift = 0;
      while (hits(yAt(shift))) shift++;
      const out = { ...item, x: item.anchorX, y: yAt(shift), shift, hidden: shift > maxShift };
      if (!out.hidden) placed.push({ left, right, y: out.y });
      return out;
    });
}

// Who gets a label first when objects crowd: the pinned person, then the biggest objects.
export const labelRank = ref => (ref.pinned ? -Infinity : -Math.max(ref.w, ref.d, ref.h));
