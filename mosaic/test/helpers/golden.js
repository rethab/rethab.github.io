// Golden-master cases: the exact per-generation behaviour of createEvolution for
// fixed seeds, recorded once in test/fixtures/golden.json. Any engine change
// (e.g. moving crossover to WebAssembly) must reproduce it bit for bit.
//
// makeTarget and trajectoryOf take GA as a parameter and use nothing else from
// their scope, so the browser test can inject their source into the page and
// check the browser build against the same fixture.
const crypto = require('node:crypto');

// Pixel counts straddle the 16- and 32-pixel boundaries that vectorised or
// word-wise crossover works in; the last case forces rate >= 1, no elitism and
// several mutations per pixel.
const CASES = [
  { name: '1 pixel', width: 1, height: 1, populationSize: 4, generations: 200, seed: 1 },
  { name: '15 pixels', width: 5, height: 3, populationSize: 6, generations: 300, seed: 2 },
  { name: '16 pixels', width: 4, height: 4, populationSize: 6, generations: 300, seed: 3 },
  { name: '17 pixels', width: 17, height: 1, populationSize: 6, generations: 300, seed: 4 },
  { name: '33 pixels', width: 11, height: 3, populationSize: 8, generations: 300, seed: 5 },
  { name: '37x23', width: 37, height: 23, populationSize: 20, generations: 300, seed: 6 },
  { name: '100x100', width: 100, height: 100, populationSize: 50, generations: 100, seed: 7 },
  {
    name: 'no elitism, every gene mutated first',
    width: 9,
    height: 5,
    populationSize: 8,
    generations: 300,
    seed: 8,
    options: { elitism: 0, tournamentK: 1, mutationRate: 1, mutationStrength: 128 },
  },
];

function makeTarget(GA, testCase) {
  const { width, height, seed } = testCase;
  const rng = GA.createRng(seed * 7919);
  const target = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      target[o] = (x * 255) / Math.max(1, width - 1);
      target[o + 1] = (y * 255) / Math.max(1, height - 1);
      target[o + 2] = rng() * 256;
    }
  }
  return target;
}

function trajectoryOf(GA, testCase, target) {
  const evolution = GA.createEvolution({
    target,
    populationSize: testCase.populationSize,
    rng: GA.createRng(testCase.seed),
    ...(testCase.options || {}),
  });
  const trajectory = [[evolution.bestFitness, evolution.mutationRate, evolution.mutationStrength]];
  for (let g = 0; g < testCase.generations; g++) {
    evolution.step();
    trajectory.push([evolution.bestFitness, evolution.mutationRate, evolution.mutationStrength]);
  }
  return {
    trajectory,
    best: Array.from(evolution.best),
    bestFitnessMatches: GA.fitness(evolution.best, target) === evolution.bestFitness,
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Full trajectory goes into a hash; every 25th fitness is kept verbatim so a
// mismatch can be located.
function summarize(run) {
  return {
    trajectoryHash: sha256(JSON.stringify(run.trajectory)),
    bestHash: sha256(Buffer.from(run.best)),
    samples: run.trajectory.filter((_, g) => g % 25 === 0).map(([fitness]) => fitness),
    finalFitness: run.trajectory[run.trajectory.length - 1][0],
  };
}

module.exports = { CASES, makeTarget, trajectoryOf, summarize };
