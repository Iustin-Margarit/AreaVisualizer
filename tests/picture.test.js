import test from 'node:test';
import assert from 'node:assert/strict';
import { pictureScale, pictureFileName } from '../js/views/picture.js';

test('pictures are sharp on a phone without being huge on a big screen', () => {
  assert.equal(pictureScale(411, 520), 3);
  assert.equal(pictureScale(1000, 600), 2);
  assert.equal(pictureScale(2560, 1300), 1);
});

test('picture files are named after the size, in any alphabet', () => {
  assert.equal(pictureFileName('100 m²'), 'areavisualizer-100-m2.png');
  assert.equal(pictureFileName('100 м² · 1,076 ft²'), 'areavisualizer-100-м2.png');
  assert.equal(pictureFileName('1.5 acres'), 'areavisualizer-1.5-acres.png');
});

test('a custom outline made for a round area says that area', async () => {
  const { neatArea } = await import('../js/core/input.js');
  assert.equal(neatArea(99.9992, 'm2'), 100);
  assert.equal(neatArea(57.5, 'm2'), 57.5);
  assert.ok(Math.abs(neatArea(57.1234, 'm2') - 57.1234) < 0.01);
});
