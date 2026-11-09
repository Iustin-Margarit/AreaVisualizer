// Lays out object labels (screen pixels). Each label sits just beside its anchor — below it when
// `direction` is 1, above it when -1 — and moves away one line at a time until it no longer
// overlaps a label placed before it. Labels are placed by `rank` (lowest first), then left to
// right; one that would have to move more than `maxShift` lines is left out (`hidden`), so a crowd
// of objects shows its most telling names instead of a tower of them. An item's optional `box`
// ({ left, right, top, bottom }: its picture) keeps other labels off it: they slide sideways.
// `avoid`: text already written there ([{ left, right, y }]), which the labels keep off too.
// `within`: the left and right limits labels have to stay inside.
// items: [{ anchorX, anchorY, width, rank?, box?, ... }] → same items plus { x, y, shift, hidden }.
export function layoutLabels(items, { gap = 8, lineHeight = 16, offset = 16, direction = 1, maxShift = Infinity, avoid = [], within = [-Infinity, Infinity] } = {}) {
  const placed = [...avoid];
  const boxes = items.map(item => item.box).filter(Boolean);
  return [...items]
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.anchorX - b.anchorX)
    .map(item => {
      const half = item.width / 2;
      const yAt = shift => item.anchorY + direction * (offset + shift * lineHeight);
      const xAt = y => Math.max(within[0] + half, Math.min(within[1] - half, boxes.reduce((x, b) => {
        const covers = b !== item.box && x - half < b.right && x + half > b.left && y + lineHeight / 4 > b.top && y - lineHeight * 3 / 4 < b.bottom;
        if (!covers) return x;
        return b.left + b.right > 2 * item.anchorX ? b.left - half - gap : b.right + half + gap;
      }, item.anchorX)));
      const hits = (x, y) => placed.some(p => x - half < p.right + gap && x + half + gap > p.left && Math.abs(y - p.y) < lineHeight);
      let shift = 0;
      while (hits(xAt(yAt(shift)), yAt(shift))) shift++;
      const y = yAt(shift);
      const x = xAt(y);
      const out = { ...item, x, y, shift, hidden: shift > maxShift };
      if (!out.hidden) placed.push({ left: x - half, right: x + half, y });
      return out;
    });
}

// Who gets a label first when objects crowd: the pinned person, then the biggest objects.
export const labelRank = ref => (ref.pinned ? -Infinity : -Math.max(ref.w, ref.d, ref.h));
