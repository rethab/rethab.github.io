const test = require('node:test');
const assert = require('node:assert/strict');
const {
  exportScale,
  snapshotFileName,
  formatProgress,
  formatFitness,
  formatSpeed,
  formatMutation,
} = require('../ga.js');

test('exportScale enlarges small grids until the longest side reaches the minimum', () => {
  assert.equal(exportScale(250, 188, 1000), 4);
  assert.equal(exportScale(100, 75, 1000), 10);
  assert.equal(exportScale(75, 100, 1000), 10);
});

test('exportScale rounds up so the saved image is never below the minimum', () => {
  assert.equal(exportScale(300, 200, 1000), 4);
});

test('exportScale never shrinks a grid that is already large enough', () => {
  assert.equal(exportScale(2000, 1500, 1000), 1);
});

test('snapshotFileName includes zero-padded generation and fitness percentage', () => {
  assert.equal(snapshotFileName(4200, 0.97578), 'mosaic-gen-004200-97.58.png');
  assert.equal(snapshotFileName(0, 0.5), 'mosaic-gen-000000-50.00.png');
});

test('formatProgress groups thousands and appends the percentage done', () => {
  assert.equal(formatProgress(13930, 100000, 'en-US'), '13,930 / 100,000 (13.9%)');
  assert.equal(formatProgress(100000, 100000, 'en-US'), '100,000 / 100,000 (100.0%)');
});

test('formatProgress follows the given locale', () => {
  assert.equal(formatProgress(13930, 100000, 'de-DE'), '13.930 / 100.000 (13,9\u00a0%)');
});

test('formatProgress omits the percentage before a run is configured', () => {
  assert.equal(formatProgress(0, 0, 'en-US'), '0 / 0');
});

test('formatFitness shows five decimals', () => {
  assert.equal(formatFitness(0.9757812), '97.57812%');
});

test('formatFitness only shows 100.00000% for an exact match', () => {
  assert.equal(formatFitness(1), '100.00000%');
  assert.equal(formatFitness(0.999999999), '99.99999%');
});

test('formatSpeed drops decimals once they stop mattering', () => {
  assert.equal(formatSpeed(1279.34, 'en-US'), '1,279');
  assert.equal(formatSpeed(42.25, 'en-US'), '42.3');
  assert.equal(formatSpeed(undefined, 'en-US'), '—');
});

test('formatMutation describes strength, share and count of changed values', () => {
  assert.deepEqual(formatMutation(0.0003, 2.34, 141000, 'en-US'), {
    strength: '±2.3',
    share: '0.03% of colour values',
    count: 'about 42 of 141,000 per new candidate',
  });
});

test('formatMutation keeps tiny rates readable and never claims zero changes', () => {
  const { share, count } = formatMutation(1 / 3000000, 1, 3000000, 'en-US');
  assert.equal(share, '0.000033% of colour values');
  assert.equal(count, 'about 1 of 3,000,000 per new candidate');
});

test('formatMutation follows the given locale', () => {
  assert.deepEqual(formatMutation(0.0125, 12.5, 30000, 'de-DE'), {
    strength: '±12,5',
    share: '1,3 % of colour values',
    count: 'about 375 of 30.000 per new candidate',
  });
});
