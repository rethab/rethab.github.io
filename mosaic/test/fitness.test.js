const test = require('node:test');
const assert = require('node:assert/strict');
const { fitness } = require('../ga.js');

test('fitness is 1 for identical arrays', () => {
  const a = Uint8ClampedArray.from([10, 20, 30, 40, 50, 60]);
  const b = Uint8ClampedArray.from([10, 20, 30, 40, 50, 60]);
  assert.equal(fitness(a, b), 1);
});

test('fitness is 0 for all-black vs all-white', () => {
  const black = new Uint8ClampedArray(12);
  const white = new Uint8ClampedArray(12).fill(255);
  assert.equal(fitness(black, white), 0);
});

test('fitness is symmetric', () => {
  const a = Uint8ClampedArray.from([1, 2, 3, 200, 150, 90]);
  const b = Uint8ClampedArray.from([50, 60, 70, 10, 20, 30]);
  assert.equal(fitness(a, b), fitness(b, a));
});

test('fitness matches a hand-computed example', () => {
  const candidate = Uint8ClampedArray.from([0, 0, 0]);
  const target = Uint8ClampedArray.from([10, 10, 10]);
  // mse = ((10^2) * 3) / 3 = 100; score = 1 - 100 / 65025
  const expected = 1 - 100 / (255 * 255);
  assert.equal(fitness(candidate, target), expected);
});

test('fitness throws on length mismatch', () => {
  const a = Uint8ClampedArray.from([1, 2, 3]);
  const b = Uint8ClampedArray.from([1, 2, 3, 4]);
  assert.throws(() => fitness(a, b));
});

test('fitness stays exact for genomes spanning several accumulation chunks', () => {
  const black = new Uint8ClampedArray(100000);
  const white = new Uint8ClampedArray(100000).fill(255);
  assert.equal(fitness(black, white), 0);

  const halfWrong = new Uint8ClampedArray(100000);
  halfWrong.fill(255, 0, 50000);
  assert.equal(fitness(halfWrong, white), 0.5);
});
