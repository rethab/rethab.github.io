const test = require('node:test');
const assert = require('node:assert/strict');
const { createRng } = require('../ga.js');

test('createRng is deterministic for a given seed', () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test('createRng produces different sequences for different seeds', () => {
  const a = createRng(1);
  const b = createRng(2);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.notDeepEqual(seqA, seqB);
});

test('createRng returns values in [0, 1)', () => {
  const rng = createRng(123);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('createRng exposes its state so another rng can continue the same stream', () => {
  const original = createRng(99);
  original();
  original();
  const resumed = createRng(0);
  resumed.state = original.state;
  const expected = Array.from({ length: 10 }, () => original());
  assert.deepEqual(Array.from({ length: 10 }, () => resumed()), expected);
});

test('createRng state is a 32-bit integer', () => {
  const rng = createRng(4294967295);
  for (let i = 0; i < 100; i++) {
    rng();
    assert.ok(Number.isInteger(rng.state) && rng.state >= -(2 ** 31) && rng.state < 2 ** 31);
  }
});
