const test = require('node:test');
const assert = require('node:assert/strict');
const { rgbaToRgb, rgbToRgba } = require('../ga.js');

test('rgbaToRgb strips alpha for fully opaque pixels', () => {
  const rgba = Uint8ClampedArray.from([10, 20, 30, 255, 40, 50, 60, 255]);
  const rgb = rgbaToRgb(rgba);
  assert.deepEqual(Array.from(rgb), [10, 20, 30, 40, 50, 60]);
});

test('rgbaToRgb composites fully transparent pixels over white', () => {
  const rgba = Uint8ClampedArray.from([0, 0, 0, 0]);
  const rgb = rgbaToRgb(rgba);
  assert.deepEqual(Array.from(rgb), [255, 255, 255]);
});

test('rgbaToRgb blends half-transparent pixels toward white', () => {
  const rgba = Uint8ClampedArray.from([0, 0, 0, 128]);
  const rgb = rgbaToRgb(rgba);
  // alpha 128/255 ~ 0.502 -> ~127 for a black pixel blended with white
  assert.deepEqual(Array.from(rgb), [127, 127, 127]);
});

test('rgbToRgba appends full alpha', () => {
  const rgb = Uint8ClampedArray.from([1, 2, 3, 4, 5, 6]);
  const rgba = rgbToRgba(rgb);
  assert.deepEqual(Array.from(rgba), [1, 2, 3, 255, 4, 5, 6, 255]);
});

test('rgbaToRgb and rgbToRgba round-trip for opaque images', () => {
  const rgba = Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 255]);
  const roundTripped = rgbToRgba(rgbaToRgb(rgba));
  assert.deepEqual(Array.from(roundTripped), Array.from(rgba));
});
