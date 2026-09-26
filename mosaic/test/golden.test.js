const test = require('node:test');
const assert = require('node:assert/strict');
const GA = require('../ga.js');
const golden = require('./fixtures/golden.json');
const { CASES, makeTarget, trajectoryOf, summarize } = require('./helpers/golden.js');

for (const testCase of CASES) {
  test(`golden run reproduces exactly: ${testCase.name}`, () => {
    const run = trajectoryOf(GA, testCase, makeTarget(GA, testCase));
    const actual = summarize(run);
    const expected = golden[testCase.name];
    assert.ok(expected, `no fixture for ${testCase.name}; run scripts/generate-golden.js`);
    assert.ok(run.bestFitnessMatches, 'reported best fitness differs from fitness(best)');
    assert.deepEqual(actual.samples, expected.samples, 'best fitness diverged (sampled every 25 generations)');
    assert.equal(actual.trajectoryHash, expected.trajectoryHash, 'fitness or mutation trajectory diverged');
    assert.equal(actual.bestHash, expected.bestHash, 'final best genome differs');
  });
}

test('golden fixture covers exactly the defined cases', () => {
  assert.deepEqual(Object.keys(golden).sort(), CASES.map((c) => c.name).sort());
});
