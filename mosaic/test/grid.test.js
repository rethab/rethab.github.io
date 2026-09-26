const test = require('node:test');
const assert = require('node:assert/strict');
const { gridDimensions } = require('../ga.js');

test('gridDimensions keeps a square image square', () => {
  assert.deepEqual(gridDimensions(800, 800, 100), { width: 100, height: 100 });
});

test('gridDimensions puts the longest side of a landscape image on the width', () => {
  assert.deepEqual(gridDimensions(1200, 800, 100), { width: 100, height: 67 });
});

test('gridDimensions puts the longest side of a portrait image on the height', () => {
  assert.deepEqual(gridDimensions(600, 1000, 50), { width: 30, height: 50 });
});

test('gridDimensions upscales images smaller than the grid', () => {
  assert.deepEqual(gridDimensions(20, 10, 100), { width: 100, height: 50 });
});

test('gridDimensions never produces a zero-sized side for extreme aspect ratios', () => {
  assert.deepEqual(gridDimensions(10000, 10, 100), { width: 100, height: 1 });
});
