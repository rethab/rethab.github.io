// Writes test/fixtures/golden.json from the current engine. Only run this when
// the algorithm's behaviour is changed on purpose; the point of the fixture is
// that refactors and engine swaps must reproduce it exactly.
const fs = require('node:fs');
const path = require('node:path');
const GA = require('../ga.js');
const { CASES, makeTarget, trajectoryOf, summarize } = require('../test/helpers/golden.js');

const fixture = {};
for (const testCase of CASES) {
  const run = trajectoryOf(GA, testCase, makeTarget(GA, testCase));
  if (!run.bestFitnessMatches) {
    throw new Error(`${testCase.name}: reported best fitness does not match fitness(best)`);
  }
  fixture[testCase.name] = summarize(run);
}
const out = path.join(__dirname, '../test/fixtures/golden.json');
fs.writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');
console.log(`wrote ${Object.keys(fixture).length} cases to ${path.relative(process.cwd(), out)}`);
