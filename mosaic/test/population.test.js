const test = require('node:test');
const assert = require('node:assert/strict');
const { createRng, randomIndividual, createPopulation, evaluate } = require('../ga.js');

test('randomIndividual has the requested length and byte-range values', () => {
  const rng = createRng(1);
  const genome = randomIndividual(30, rng);
  assert.equal(genome.length, 30);
  assert.ok(genome instanceof Uint8ClampedArray);
  for (const value of genome) {
    assert.ok(value >= 0 && value <= 255);
  }
});

test('randomIndividual is deterministic for a given rng seed', () => {
  const genomeA = randomIndividual(12, createRng(7));
  const genomeB = randomIndividual(12, createRng(7));
  assert.deepEqual(Array.from(genomeA), Array.from(genomeB));
});

test('createPopulation builds the requested number of individuals of the right length', () => {
  const rng = createRng(5);
  const population = createPopulation(8, 15, rng);
  assert.equal(population.length, 8);
  for (const genome of population) {
    assert.equal(genome.length, 15);
  }
});

test('evaluate sorts individuals best fitness first', () => {
  const target = Uint8ClampedArray.from([100, 100, 100]);
  const population = [
    Uint8ClampedArray.from([0, 0, 0]), // worst
    Uint8ClampedArray.from([100, 100, 100]), // perfect
    Uint8ClampedArray.from([90, 90, 90]), // middling
  ];
  const scored = evaluate(population, target);
  assert.equal(scored[0].fitness, 1);
  assert.deepEqual(Array.from(scored[0].genome), [100, 100, 100]);
  assert.ok(scored[0].fitness >= scored[1].fitness);
  assert.ok(scored[1].fitness >= scored[2].fitness);
  assert.deepEqual(Array.from(scored[2].genome), [0, 0, 0]);
});
