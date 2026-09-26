(function () {
  'use strict';

  // mulberry32: small, fast, decent-quality seeded PRNG. `state` is exposed so
  // the WebAssembly operators can continue the very same stream.
  function createRng(seed) {
    let state = seed | 0;
    function rng() {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    Object.defineProperty(rng, 'state', {
      get: () => state,
      set: (value) => {
        state = value | 0;
      },
    });
    return rng;
  }

  // Composite over white so transparent PNGs render sane instead of muddy.
  function rgbaToRgb(rgba) {
    const pixelCount = rgba.length / 4;
    const rgb = new Uint8ClampedArray(pixelCount * 3);
    for (let i = 0; i < pixelCount; i++) {
      const srcOffset = i * 4;
      const dstOffset = i * 3;
      const alpha = rgba[srcOffset + 3] / 255;
      rgb[dstOffset] = rgba[srcOffset] * alpha + 255 * (1 - alpha);
      rgb[dstOffset + 1] = rgba[srcOffset + 1] * alpha + 255 * (1 - alpha);
      rgb[dstOffset + 2] = rgba[srcOffset + 2] * alpha + 255 * (1 - alpha);
    }
    return rgb;
  }

  function rgbToRgba(rgb) {
    const pixelCount = rgb.length / 3;
    const rgba = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const srcOffset = i * 3;
      const dstOffset = i * 4;
      rgba[dstOffset] = rgb[srcOffset];
      rgba[dstOffset + 1] = rgb[srcOffset + 1];
      rgba[dstOffset + 2] = rgb[srcOffset + 2];
      rgba[dstOffset + 3] = 255;
    }
    return rgba;
  }

  function gridDimensions(imageWidth, imageHeight, longestSide) {
    const scale = longestSide / Math.max(imageWidth, imageHeight);
    return {
      width: Math.max(1, Math.round(imageWidth * scale)),
      height: Math.max(1, Math.round(imageHeight * scale)),
    };
  }

  // Saved images are enlarged by a whole factor so pixels stay crisp blocks
  // instead of a thumbnail-sized PNG.
  function exportScale(width, height, minLongestSide) {
    return Math.max(1, Math.ceil(minLongestSide / Math.max(width, height)));
  }

  function snapshotFileName(generation, fitnessScore) {
    const gen = String(generation).padStart(6, '0');
    return `mosaic-gen-${gen}-${(fitnessScore * 100).toFixed(2)}.png`;
  }

  // locale is passed through to Intl; undefined means the browser's locale.
  function formatProgress(generation, maxGenerations, locale) {
    const count = new Intl.NumberFormat(locale);
    const text = `${count.format(generation)} / ${count.format(maxGenerations)}`;
    if (maxGenerations <= 0) {
      return text;
    }
    const percent = new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `${text} (${percent.format(generation / maxGenerations)})`;
  }

  // Never rounds up to 100.00000% unless the match is exact, since the run only
  // stops on an exact match and would otherwise look stuck at 100%.
  function formatFitness(fitnessScore) {
    const text = (fitnessScore * 100).toFixed(5);
    return `${fitnessScore < 1 && text === '100.00000' ? '99.99999' : text}%`;
  }

  function formatSpeed(generationsPerSecond, locale) {
    if (generationsPerSecond === undefined) {
      return '—';
    }
    const decimals = generationsPerSecond >= 100 ? 0 : 1;
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(generationsPerSecond);
  }

  // Significant digits rather than fixed decimals: the rate can drop to one
  // value in millions, which a fixed 0.00% would hide.
  function formatMutation(rate, strength, genomeLength, locale) {
    const count = new Intl.NumberFormat(locale);
    const oneDecimal = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const percent = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumSignificantDigits: 2,
    });
    const changed = Math.max(1, Math.round(rate * genomeLength));
    return {
      strength: `±${oneDecimal.format(strength)}`,
      share: `${percent.format(rate)} of colour values`,
      count: `about ${count.format(changed)} of ${count.format(genomeLength)} per new candidate`,
    };
  }

  function fitness(candidate, target) {
    if (candidate.length !== target.length) {
      throw new Error(
        `fitness: length mismatch (${candidate.length} vs ${target.length})`
      );
    }
    return fitnessFromSse(sumSquaredError(candidate, target), candidate.length);
  }

  function sumSquaredError(candidate, target) {
    // Integer partial sums are much faster than float accumulation; a chunk of
    // 32768 genes stays below 2^31 even when every diff is 255.
    let sumSquaredError = 0;
    for (let start = 0; start < candidate.length; start += 32768) {
      const end = Math.min(start + 32768, candidate.length);
      let chunk = 0;
      for (let i = start; i < end; i++) {
        const diff = candidate[i] - target[i];
        chunk = (chunk + diff * diff) | 0;
      }
      sumSquaredError += chunk;
    }
    return sumSquaredError;
  }

  function fitnessFromSse(sse, length) {
    const mse = sse / length;
    return 1 - mse / (255 * 255);
  }

  function randomIndividual(length, rng) {
    const genome = new Uint8ClampedArray(length);
    for (let i = 0; i < length; i++) {
      genome[i] = Math.floor(rng() * 256);
    }
    return genome;
  }

  function createPopulation(size, length, rng) {
    const population = new Array(size);
    for (let i = 0; i < size; i++) {
      population[i] = randomIndividual(length, rng);
    }
    return population;
  }

  function byFitnessDescending(a, b) {
    return b.fitness - a.fitness;
  }

  function evaluate(population, target) {
    return population
      .map((genome) => {
        const sse = sumSquaredError(genome, target);
        return { genome, sse, fitness: fitnessFromSse(sse, genome.length) };
      })
      .sort(byFitnessDescending);
  }

  function tournamentSelect(scored, k, rng) {
    let best = scored[Math.floor(rng() * scored.length)];
    for (let i = 1; i < k; i++) {
      const contender = scored[Math.floor(rng() * scored.length)];
      if (contender.fitness > best.fitness) {
        best = contender;
      }
    }
    return best;
  }

  function decodeBase64(base64) {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  let breedModule = null;

  function loadBreedModule() {
    if (!breedModule) {
      const base64 =
        typeof module !== 'undefined' && module.exports
          ? require('./breed-wasm.js')
          : globalThis.BREED_WASM;
      const bytes = decodeBase64(base64);
      if (!WebAssembly.validate(bytes)) {
        throw new Error(
          'This browser does not support WebAssembly SIMD (needs Chrome 91+, Firefox 89+ or Safari 16.4+).'
        );
      }
      // Synchronous compile is fine for a module this small and keeps
      // createEvolution synchronous.
      breedModule = new WebAssembly.Module(bytes);
    }
    return breedModule;
  }

  // WebAssembly memory holding the target and `slotCount` genomes, so children
  // are bred in place instead of allocated. Regions are 64-byte aligned.
  function createArena(target, slotCount) {
    const length = target.length;
    const pixels = length / 3;
    const words = Math.ceil(pixels / 32);
    const align = (bytes) => (bytes + 63) & ~63;
    const targetOffset = 64;
    const bitsOffset = targetOffset + align(length);
    const slotOffsets = [];
    let end = bitsOffset + align(words * 4);
    for (let s = 0; s < slotCount; s++) {
      slotOffsets.push(end);
      end += align(length);
    }

    const { exports } = new WebAssembly.Instance(loadBreedModule(), { Math: { log: Math.log } });
    const pagesNeeded = Math.ceil(end / 65536) - exports.memory.buffer.byteLength / 65536;
    if (pagesNeeded > 0) {
      try {
        exports.memory.grow(pagesNeeded);
      } catch (error) {
        throw new Error(
          `Not enough memory for this population and grid (${Math.ceil(end / 1e6)} MB).`
        );
      }
    }
    const buffer = exports.memory.buffer;
    new Uint8Array(buffer, targetOffset, length).set(target);
    const genomes = slotOffsets.map((offset) => new Uint8ClampedArray(buffer, offset, length));

    return {
      genomes,
      // Draws one rng() word per 32 pixels (bit k picks parent B for pixel k),
      // writes the child into slot `child` and returns its squared error.
      crossover(a, b, child, rng) {
        exports.rng.value = requireState(rng);
        exports.fillBits(bitsOffset, words);
        rng.state = exports.rng.value;
        return exports.crossover(
          slotOffsets[a],
          slotOffsets[b],
          targetOffset,
          slotOffsets[child],
          bitsOffset,
          pixels
        );
      },
      // Mutates each gene of slot `slot` with probability `rate` by a random
      // delta in [-strength, strength] and returns the change in squared error.
      mutate(slot, rate, strength, rng) {
        requireState(rng);
        if (rate <= 0) {
          return 0;
        }
        exports.rng.value = rng.state;
        const everyGene = rate >= 1;
        const delta = exports.mutate(
          slotOffsets[slot],
          targetOffset,
          length,
          everyGene ? 0 : Math.log(1 - rate),
          everyGene ? 1 : 0,
          strength
        );
        rng.state = exports.rng.value;
        return delta;
      },
    };
  }

  function requireState(rng) {
    if (typeof rng.state !== 'number') {
      throw new TypeError('rng must come from createRng so its state can be handed over');
    }
    return rng.state;
  }

  // Fraction of bred children that beat their better parent; elites (null) are ignored.
  function successRate(childFitness, parentFitness) {
    let bred = 0;
    let successes = 0;
    for (let i = 0; i < childFitness.length; i++) {
      if (parentFitness[i] === null) {
        continue;
      }
      bred++;
      if (childFitness[i] > parentFitness[i]) {
        successes++;
      }
    }
    return bred === 0 ? 0 : successes / bred;
  }

  // Rechenberg's 1/5 success rule: large mutations make fast progress early but
  // almost always overshoot once most pixels are close to the target, which stalls
  // the run. Shrinking them when few children improve keeps progress going.
  const ADAPTATION = {
    targetSuccess: 0.2,
    factor: 0.9,
    minStrength: 1,
    maxStrength: 128,
    maxRate: 0.05,
  };

  function adaptMutation(mutation, success, genomeLength) {
    const scale = success > ADAPTATION.targetSuccess ? 1 / ADAPTATION.factor : ADAPTATION.factor;
    return {
      rate: clamp(mutation.rate * scale, 1 / genomeLength, ADAPTATION.maxRate),
      strength: clamp(
        mutation.strength * scale,
        ADAPTATION.minStrength,
        ADAPTATION.maxStrength
      ),
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // Mutation values are only the starting point; adaptMutation takes over from there.
  const DEFAULTS = {
    elitism: 2,
    tournamentK: 3,
    mutationRate: 0.005,
    mutationStrength: 40,
  };

  function createEvolution(config) {
    const {
      target,
      populationSize,
      rng,
      elitism = DEFAULTS.elitism,
      tournamentK = DEFAULTS.tournamentK,
      mutationRate = DEFAULTS.mutationRate,
      mutationStrength = DEFAULTS.mutationStrength,
    } = config;

    const length = target.length;
    // A generation's survivors and its new children never need more than twice
    // the population in slots; freed slots are reused by the next generation.
    const arena = createArena(target, populationSize * 2);
    const freeSlots = [];
    for (let s = populationSize * 2 - 1; s >= populationSize; s--) {
      freeSlots.push(s);
    }
    let scored = evaluate(createPopulation(populationSize, length, rng), target).map(
      ({ genome, sse, fitness: score }, slot) => {
        arena.genomes[slot].set(genome);
        return { slot, sse, fitness: score };
      }
    );
    let mutation = { rate: mutationRate, strength: mutationStrength };
    let generation = 0;

    function step() {
      const children = new Array(populationSize);
      const parentFitness = new Array(populationSize).fill(null);
      let i = 0;
      for (; i < elitism && i < scored.length; i++) {
        children[i] = scored[i];
      }
      for (; i < populationSize; i++) {
        const parentA = tournamentSelect(scored, tournamentK, rng);
        const parentB = tournamentSelect(scored, tournamentK, rng);
        const slot = freeSlots.pop();
        let sse = arena.crossover(parentA.slot, parentB.slot, slot, rng);
        sse += arena.mutate(slot, mutation.rate, mutation.strength, rng);
        children[i] = { slot, sse, fitness: fitnessFromSse(sse, length) };
        parentFitness[i] = Math.max(parentA.fitness, parentB.fitness);
      }
      for (let j = Math.min(elitism, scored.length); j < scored.length; j++) {
        freeSlots.push(scored[j].slot);
      }
      const childFitness = children.map((child) => child.fitness);
      mutation = adaptMutation(mutation, successRate(childFitness, parentFitness), length);
      scored = children.sort(byFitnessDescending);
      generation++;
      return scored[0];
    }

    return {
      step,
      // A copy: the slot is overwritten once this individual stops surviving.
      get best() {
        return arena.genomes[scored[0].slot].slice();
      },
      get bestFitness() {
        return scored[0].fitness;
      },
      get generation() {
        return generation;
      },
      get mutationRate() {
        return mutation.rate;
      },
      get mutationStrength() {
        return mutation.strength;
      },
    };
  }

  const GA = {
    createRng,
    rgbaToRgb,
    rgbToRgba,
    gridDimensions,
    exportScale,
    snapshotFileName,
    formatProgress,
    formatFitness,
    formatSpeed,
    formatMutation,
    fitness,
    sumSquaredError,
    randomIndividual,
    createPopulation,
    evaluate,
    tournamentSelect,
    createArena,
    successRate,
    adaptMutation,
    ADAPTATION,
    createEvolution,
    DEFAULTS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GA;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.GA = GA;
  }
})();
