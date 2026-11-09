import test from 'node:test';
import assert from 'node:assert/strict';
import { crosses, innerPoint, lShape, polygonArea } from '../js/core/shapes.js';
import { VALIDATORS } from '../js/state.js';

const bowTie = [[0, 0], [10, 10], [10, 0], [0, 10]];
const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

test('an outline whose sides cross is recognised', () => {
  assert.equal(crosses(bowTie), true);
  assert.equal(crosses(square), false);
  assert.equal(crosses(lShape(10, 8)), false);
});

test('while drawing, the outline is not joined up yet', () => {
  assert.equal(crosses([[0, 0], [10, 10], [10, 0], [0, 10]], false), true);
  assert.equal(crosses([[0, 0], [10, 0], [10, 10]], false), false);
  assert.equal(crosses([[0, 0], [10, 10], [0, 10], [5, -2]], false), true, 'the third side crosses the first');
});

test('a side doubling back, or a corner on top of another, counts as crossing', () => {
  assert.equal(crosses([[0, 0], [10, 0], [4, 0]], false), true);
  assert.equal(crosses([[0, 0], [10, 0], [10, 0]], false), true);
  assert.equal(crosses([[0, 0], [5, 0], [10, 0], [10, 10]]), false, 'a corner in the middle of a straight side is fine');
});

test('links cannot bring in an outline with crossing sides', () => {
  assert.equal(VALIDATORS.points(bowTie), false);
  assert.equal(VALIDATORS.points(square), true);
});

test('the label spot is inside the shape, even with a deep notch', () => {
  const notched = [[-10, -10], [10, -10], [10, 10], [1, 10], [0, -6], [-1, 10], [-10, 10]];
  assert.ok(polygonArea(notched) > 0);
  const [x, z] = innerPoint(notched);
  assert.ok(Math.abs(x) > 3 || z < -7, `the middle of the notch is outside the shape, got ${x}, ${z}`);
  const [cx, cz] = innerPoint(square.map(([a, b]) => [a - 5, b - 5]));
  assert.ok(Math.hypot(cx, cz) < 0.5, 'a plain square keeps its label in the middle');
});

test('a dragged corner gets as far as it can without crossing, however it was going', async () => {
  const { cornerFits, reachableCorner } = await import('../js/core/shapes.js');
  const square10 = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(cornerFits(square10, 2, [12, 12]), true);
  assert.equal(cornerFits(square10, 2, [-5, 5]), false, 'through the opposite side');
  const stopped = reachableCorner(square10, 2, [-5, 5]);
  assert.equal(crosses(Object.assign([...square10], { 2: stopped })), false);
  assert.ok(stopped[0] < 5, `it should get well across, reached ${stopped}`);
  // Every corner agrees with the full check, on a shape with more going on.
  const zigzag = [[0, 0], [10, 0], [10, 8], [6, 3], [4, 9], [2, 3], [0, 8]];
  for (let index = 0; index < zigzag.length; index++) {
    for (const to of [[5, 5], [5, -3], [12, 12], [3, 1], [8, 6]]) {
      const moved = Object.assign([...zigzag], { [index]: to });
      assert.equal(cornerFits(zigzag, index, to), !crosses(moved), `corner ${index} to ${to}`);
    }
  }
});
