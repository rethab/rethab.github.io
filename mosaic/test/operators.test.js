const test = require('node:test');
const assert = require('node:assert/strict');
const {
  tournamentSelect,
  createArena,
  sumSquaredError,
  createRng,
  successRate,
  adaptMutation,
  ADAPTATION,
} = require('../ga.js');

function sequenceRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

function randomGenome(length, rng) {
  return Uint8ClampedArray.from({ length }, () => Math.floor(rng() * 256));
}

// Runs the WebAssembly crossover on standalone genomes.
function crossover(a, b, rng, target = new Uint8ClampedArray(a.length)) {
  const arena = createArena(target, 3);
  arena.genomes[0].set(a);
  arena.genomes[1].set(b);
  const sse = arena.crossover(0, 1, 2, rng);
  return { child: arena.genomes[2].slice(), sse };
}

// Runs the WebAssembly mutation on a copy of a standalone genome.
function mutate(genome, rate, strength, rng, target = new Uint8ClampedArray(genome.length)) {
  const arena = createArena(target, 1);
  arena.genomes[0].set(genome);
  const delta = arena.mutate(0, rate, strength, rng);
  return { genome: arena.genomes[0].slice(), delta };
}

// The straightforward per-pixel crossover; the WebAssembly kernel must match it.
function referenceCrossover(a, b, rng) {
  const child = new Uint8ClampedArray(a.length);
  let bits = 0;
  let bit = 32;
  for (let p = 0; p < a.length; p += 3) {
    if (bit === 32) {
      bits = Math.floor(rng() * 4294967296);
      bit = 0;
    }
    const source = (bits >>> bit) & 1 ? b : a;
    bit++;
    child.set(source.subarray(p, p + 3), p);
  }
  return child;
}

// The JavaScript mutation the WebAssembly kernel replaced: each gene mutates
// with probability `rate` (geometric gaps between mutated genes) by a delta in
// [-strength, strength], rounded and clamped by Uint8ClampedArray.
function referenceMutate(genome, rate, strength, rng) {
  const result = new Uint8ClampedArray(genome);
  if (rate <= 0) {
    return result;
  }
  const logSkip = rate >= 1 ? -Infinity : Math.log(1 - rate);
  const gap = () => (rate >= 1 ? 0 : Math.floor(Math.log(1 - rng()) / logSkip));
  for (let i = gap(); i < result.length; i += 1 + gap()) {
    result[i] += (rng() * 2 - 1) * strength;
  }
  return result;
}

const PIXEL_COUNTS = [...Array.from({ length: 50 }, (_, i) => i + 1), 63, 64, 65, 100, 7501];

test('tournamentSelect returns the fittest contender it saw', () => {
  const scored = [
    { genome: Uint8ClampedArray.from([1]), fitness: 0.9 },
    { genome: Uint8ClampedArray.from([2]), fitness: 0.3 },
    { genome: Uint8ClampedArray.from([3]), fitness: 0.6 },
  ];
  // k = scored.length, and the rng visits every index once, so the
  // global best (index 0) must win regardless of visit order.
  const rng = sequenceRng([0 / 3, 1 / 3, 2 / 3]);
  const winner = tournamentSelect(scored, 3, rng);
  assert.equal(winner, scored[0]);
});

test('crossover takes every pixel whole from one parent and uses both', () => {
  for (const pixels of [3, 16, 40]) {
    const a = Uint8ClampedArray.from({ length: pixels * 3 }, (_, i) => i % 250);
    const b = Uint8ClampedArray.from(a, (v) => v + 1);
    const { child } = crossover(a, b, createRng(pixels));
    const fromB = [];
    for (let p = 0; p < pixels * 3; p += 3) {
      const pixel = Array.from(child.subarray(p, p + 3));
      const isA = pixel.join() === Array.from(a.subarray(p, p + 3)).join();
      const isB = pixel.join() === Array.from(b.subarray(p, p + 3)).join();
      assert.ok(isA || isB, `pixel ${p / 3} of ${pixels} is mixed: ${pixel}`);
      fromB.push(isB);
    }
    assert.ok(fromB.includes(true) && fromB.includes(false), `${pixels} pixels: one parent only`);
  }
});

test('crossover matches the per-pixel reference across group and tail sizes', () => {
  const init = createRng(11);
  for (const pixels of PIXEL_COUNTS) {
    const a = randomGenome(pixels * 3, init);
    const b = randomGenome(pixels * 3, init);
    const expected = referenceCrossover(a, b, createRng(pixels));
    const { child } = crossover(a, b, createRng(pixels));
    assert.deepEqual(child, expected, `mismatch for ${pixels} pixels`);
  }
});

test('crossover leaves the rng exactly where the reference leaves it', () => {
  for (const pixels of [1, 31, 32, 33, 7501]) {
    const a = new Uint8ClampedArray(pixels * 3);
    const reference = createRng(pixels);
    referenceCrossover(a, a, reference);
    const rng = createRng(pixels);
    crossover(a, a, rng);
    assert.equal(rng(), reference(), `${pixels} pixels`);
  }
});

test('crossover returns the child squared error against the target', () => {
  const init = createRng(12);
  for (const pixels of PIXEL_COUNTS) {
    const target = randomGenome(pixels * 3, init);
    const a = randomGenome(pixels * 3, init);
    const b = randomGenome(pixels * 3, init);
    const { child, sse } = crossover(a, b, createRng(pixels), target);
    assert.equal(sse, sumSquaredError(child, target), `wrong score for ${pixels} pixels`);
  }
});

test('crossover scores extreme differences without overflow', () => {
  const pixels = 7501;
  const black = new Uint8ClampedArray(pixels * 3);
  const white = new Uint8ClampedArray(pixels * 3).fill(255);
  const { sse } = crossover(black, black, createRng(1), white);
  assert.equal(sse, pixels * 3 * 255 * 255);
});

test('arena operators need an rng whose state can be handed over', () => {
  const arena = createArena(new Uint8ClampedArray(3), 3);
  assert.throws(() => arena.crossover(0, 1, 2, () => 0.5), TypeError);
  assert.throws(() => arena.mutate(0, 0.5, 10, () => 0.5), TypeError);
});

test('arena slots reused as children do not disturb other slots', () => {
  const rng = createRng(13);
  const target = randomGenome(40 * 3, rng);
  const arena = createArena(target, 4);
  const parents = [randomGenome(120, rng), randomGenome(120, rng)];
  arena.genomes[0].set(parents[0]);
  arena.genomes[1].set(parents[1]);
  arena.genomes[3].fill(7);
  arena.crossover(0, 1, 2, rng);
  arena.crossover(1, 0, 2, rng);
  arena.mutate(2, 1, 128, rng);
  assert.deepEqual(arena.genomes[0], parents[0]);
  assert.deepEqual(arena.genomes[1], parents[1]);
  assert.ok(arena.genomes[3].every((v) => v === 7));
});

test('mutate with rate 0 changes nothing and draws no random numbers', () => {
  const rng = createRng(1);
  const { genome, delta } = mutate(Uint8ClampedArray.from([10, 20, 30]), 0, 40, rng);
  assert.deepEqual(Array.from(genome), [10, 20, 30]);
  assert.equal(delta, 0);
  assert.equal(rng(), createRng(1)());
});

test('mutate with rate 1 changes every gene by at most strength', () => {
  const before = new Uint8ClampedArray(3000).fill(128);
  const { genome } = mutate(before, 1, 40, createRng(2));
  assert.ok(genome.every((v) => Math.abs(v - 128) <= 40));
  assert.ok(genome.filter((v) => v !== 128).length > 2900);
});

test('mutate changes roughly rate * length genes', () => {
  const { genome } = mutate(new Uint8ClampedArray(100000).fill(128), 0.01, 50, createRng(5));
  const changed = genome.filter((v) => v !== 128).length;
  assert.ok(changed > 850 && changed < 1100, `changed ${changed} genes, expected ~1000`);
});

test('mutate matches the JavaScript reference gene for gene and leaves the rng where it does', () => {
  const init = createRng(10);
  for (const length of [3, 48, 3000, 30003]) {
    for (const rate of [1 / length, 0.001, 0.05, 0.3, 0.999, 1]) {
      for (const strength of [1, 2.3, 60, 128]) {
        const genome = randomGenome(length, init);
        const reference = createRng(42);
        const expected = referenceMutate(genome, rate, strength, reference);
        const rng = createRng(42);
        const actual = mutate(genome, rate, strength, rng).genome;
        const label = `length ${length}, rate ${rate}, strength ${strength}`;
        assert.deepEqual(actual, expected, label);
        assert.equal(rng(), reference(), `rng out of step: ${label}`);
      }
    }
  }
});

test('mutate rounds halfway values to even, like Uint8ClampedArray', () => {
  // Pick a strength that makes the first gene's change exactly +0.5 or -0.5.
  let seed = 0;
  let strength;
  do {
    seed++;
    const d = createRng(seed)() * 2 - 1;
    strength = Math.abs(0.5 / d);
  } while (Math.abs((createRng(seed)() * 2 - 1) * strength) !== 0.5 || strength > 128);
  const sign = Math.sign(createRng(seed)() * 2 - 1);
  for (const start of [100, 101]) {
    const genome = Uint8ClampedArray.from([start, 0, 0]);
    const expected = referenceMutate(genome, 1, strength, createRng(seed));
    const actual = mutate(genome, 1, strength, createRng(seed)).genome;
    const halfway = start + sign * 0.5;
    assert.equal(expected[0], 2 * Math.round(halfway / 2), 'reference is not ties-to-even');
    assert.deepEqual(actual, expected);
  }
});

test('mutate returns the exact change in squared error', () => {
  const rng = createRng(9);
  for (const rate of [0.01, 0.3, 1]) {
    const target = randomGenome(300, rng);
    const genome = randomGenome(300, rng);
    const result = mutate(genome, rate, 80, rng, target);
    assert.equal(
      sumSquaredError(genome, target) + result.delta,
      sumSquaredError(result.genome, target),
      `rate ${rate}`
    );
  }
});

test('successRate counts children that beat their better parent, ignoring elites', () => {
  const childFitness = [0.9, 0.6, 0.4, 0.5, 0.7];
  const parentFitness = [null, 0.5, 0.5, 0.5, 0.8];
  assert.equal(successRate(childFitness, parentFitness), 0.25);
});

test('successRate is 0 when nothing was bred', () => {
  assert.equal(successRate([0.9], [null]), 0);
});

test('adaptMutation grows mutations when more than the target share of children succeed', () => {
  const next = adaptMutation({ rate: 0.01, strength: 10 }, 0.5, 1000);
  assert.ok(next.rate > 0.01);
  assert.ok(next.strength > 10);
});

test('adaptMutation shrinks mutations when too few children succeed', () => {
  const next = adaptMutation({ rate: 0.01, strength: 10 }, 0.1, 1000);
  assert.ok(next.rate < 0.01);
  assert.ok(next.strength < 10);
});

test('adaptMutation keeps at least one expected mutation per genome and strength within bounds', () => {
  const shrunk = adaptMutation({ rate: 0.001, strength: 1 }, 0, 1000);
  assert.equal(shrunk.rate, 1 / 1000);
  assert.equal(shrunk.strength, ADAPTATION.minStrength);

  const grown = adaptMutation({ rate: ADAPTATION.maxRate, strength: ADAPTATION.maxStrength }, 1, 1000);
  assert.equal(grown.rate, ADAPTATION.maxRate);
  assert.equal(grown.strength, ADAPTATION.maxStrength);
});
