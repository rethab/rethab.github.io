const GA = require('../ga.js');

const SIZE = 100;
const POPULATION = 50;
const WARMUP_GENERATIONS = 30;
const MEASURE_MS = 5000;
const RUNS = 3;

function makeTarget() {
  const target = new Uint8ClampedArray(SIZE * SIZE * 3);
  const rng = GA.createRng(3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = (y * SIZE + x) * 3;
      target[o] = 128 + 100 * Math.sin(x / 7) + rng() * 20;
      target[o + 1] = y * 2.5;
      target[o + 2] = (x - 50) ** 2 + (y - 40) ** 2 < 600 ? 230 : 30 + rng() * 40;
    }
  }
  return target;
}

function measure(target) {
  const evolution = GA.createEvolution({ target, populationSize: POPULATION, rng: GA.createRng(1) });
  for (let i = 0; i < WARMUP_GENERATIONS; i++) {
    evolution.step();
  }
  const start = performance.now();
  const startGeneration = evolution.generation;
  while (performance.now() - start < MEASURE_MS) {
    evolution.step();
  }
  return (evolution.generation - startGeneration) / ((performance.now() - start) / 1000);
}

const target = makeTarget();
const results = [];
for (let i = 0; i < RUNS; i++) {
  results.push(measure(target));
}
results.sort((a, b) => a - b);
console.log(
  `ga.js, population ${POPULATION}, grid ${SIZE}x${SIZE}: ` +
    `median ${results[Math.floor(RUNS / 2)].toFixed(1)} gen/s ` +
    `(runs: ${results.map((r) => r.toFixed(1)).join(', ')})`
);
