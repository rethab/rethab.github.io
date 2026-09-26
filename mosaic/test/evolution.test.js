const test = require('node:test');
const assert = require('node:assert/strict');
const { createRng, createEvolution, fitness } = require('../ga.js');

function makeGradientTarget(width, height) {
  const target = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      const value = Math.floor((x / (width - 1)) * 255);
      target[offset] = value;
      target[offset + 1] = value;
      target[offset + 2] = value;
    }
  }
  return target;
}

test('evolution improves fitness over generations and is monotonic non-decreasing', () => {
  const target = makeGradientTarget(8, 8);
  const rng = createRng(2024);
  const evolution = createEvolution({
    target,
    populationSize: 30,
    rng,
  });

  const initialFitness = evolution.bestFitness;
  assert.equal(evolution.generation, 0);

  const fitnessHistory = [initialFitness];
  const generations = 100;
  for (let i = 0; i < generations; i++) {
    evolution.step();
    fitnessHistory.push(evolution.bestFitness);
  }

  assert.ok(
    evolution.bestFitness > initialFitness,
    `expected fitness to improve: ${initialFitness} -> ${evolution.bestFitness}`
  );
  assert.equal(evolution.generation, generations);

  for (let i = 1; i < fitnessHistory.length; i++) {
    assert.ok(
      fitnessHistory[i] >= fitnessHistory[i - 1],
      `fitness regressed at generation ${i}: ${fitnessHistory[i - 1]} -> ${fitnessHistory[i]}`
    );
  }
});

test('evolution best genome length matches target length', () => {
  const target = makeGradientTarget(4, 4);
  const rng = createRng(1);
  const evolution = createEvolution({ target, populationSize: 10, rng });
  assert.equal(evolution.best.length, target.length);
  evolution.step();
  assert.equal(evolution.best.length, target.length);
});

test('evolution shrinks mutation strength as it converges', () => {
  const target = makeGradientTarget(8, 8);
  const evolution = createEvolution({ target, populationSize: 20, rng: createRng(7) });
  const initialStrength = evolution.mutationStrength;
  for (let i = 0; i < 1000; i++) {
    evolution.step();
  }
  assert.ok(evolution.bestFitness > 0.999);
  assert.ok(
    evolution.mutationStrength < initialStrength,
    `expected strength to shrink: ${initialStrength} -> ${evolution.mutationStrength}`
  );
});

test('evolution reports the true fitness of its best genome after many generations', () => {
  const target = makeGradientTarget(9, 7);
  const evolution = createEvolution({ target, populationSize: 12, rng: createRng(3) });
  for (let i = 0; i < 500; i++) {
    evolution.step();
  }
  assert.equal(evolution.bestFitness, fitness(evolution.best, target));
});
