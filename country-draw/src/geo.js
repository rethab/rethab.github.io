import { geoArea, geoCentroid, geoDistance, geoMercator } from 'd3-geo';
import { feature } from 'topojson-client';

const GRID = 300;
// Outline distances are in units of sqrt(area). Below the tolerance a drawing counts as perfect.
// Beyond it the score stays high for recognizable drawings, then drops steeply towards what a
// same-area circle would get, without ever hitting a hard 0.
const TOLERANCE = 0.012;
const ABS_HALF = 0.055;
const REL_HALF = 0.55;
const STEEPNESS = 2.5;
const UNIT_CIRCLE = Array.from({ length: 200 }, (_, i) => {
  const r = 1 / Math.sqrt(Math.PI);
  return [r * Math.cos((i / 200) * 2 * Math.PI), r * Math.sin((i / 200) * 2 * Math.PI)];
});

const EARTH_RADIUS_KM = 6371;
// A guess this far off (as a fraction of the country's size) scores 50; within the tolerance it scores 100.
const GUESS_TOLERANCE = 0.02;
const GUESS_HALF = 0.15;
// Land within this gap of the mainland (or of land already included) belongs on its map
// (Sicily, Zealand, North Island); anything further is an overseas territory (French Guiana, Alaska).
const NEARBY_FRACTION = 0.4;
const NEARBY_MAX_KM = 300;
const KM_PER_DEGREE = 111.2;

const featureCache = new WeakMap();

export function countryFeatures(topology) {
  if (!featureCache.has(topology)) {
    featureCache.set(topology, feature(topology, topology.objects.countries).features);
  }
  return featureCache.get(topology);
}

export function countryFeature(topology, name) {
  const country = countryFeatures(topology).find((f) => f.properties.name === name);
  if (!country) throw new Error(`Unknown country: ${name}`);
  return country;
}

// Outer rings only, largest first. Holes (e.g. Lesotho inside South Africa) are dropped.
function outerRings(topology, name) {
  const { geometry } = countryFeature(topology, name);
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons
    .map((p) => ({ ring: p[0], area: geoArea(polygon(p[0])) }))
    .sort((a, b) => b.area - a.area)
    .map((r) => r.ring);
}

function polygon(ring) {
  return { type: 'Polygon', coordinates: [ring] };
}

// Centering the projection on the country keeps those crossing the antimeridian (Russia) in one piece.
export function projectionFor(region) {
  return geoMercator().rotate([-geoCentroid(region)[0], 0]);
}

export function countryShape(topology, name) {
  const rings = outerRings(topology, name);
  const projection = projectionFor(polygon(rings[0]));
  const [mainland, ...others] = rings.map((ring) => ring.map((p) => projection(p)));
  return { mainland, others };
}

// The part of a country shown as its map: the mainland plus nearby islands.
export function countryRegion(topology, name) {
  const [mainland, ...others] = outerRings(topology, name);
  // Guesses are judged relative to the country's size, so 30 km off matters more in the Netherlands than in Russia.
  const sizeKm = Math.sqrt(geoArea(polygon(mainland))) * EARTH_RADIUS_KM;
  const maxGapKm = Math.min(NEARBY_FRACTION * sizeKm, NEARBY_MAX_KM);

  const included = [mainland];
  let remaining = others;
  let grew = true;
  while (grew) {
    grew = false;
    remaining = remaining.filter((ring) => {
      if (!included.some((inc) => within(inc, ring, maxGapKm))) return true;
      included.push(ring);
      grew = true;
      return false;
    });
  }
  return {
    type: 'Feature',
    geometry: { type: 'MultiPolygon', coordinates: included.map((ring) => [ring]) },
    sizeKm,
  };
}

// Equirectangular approximation: plenty accurate for a few hundred km and much cheaper than great circles.
function within(a, b, km) {
  const latGap = Math.max(0, bounds(b).minLat - bounds(a).maxLat, bounds(a).minLat - bounds(b).maxLat);
  if (latGap * KM_PER_DEGREE > km) return false;
  const limit = (km / KM_PER_DEGREE) ** 2;
  for (const [lon1, lat1] of a) {
    const cos = Math.cos((lat1 * Math.PI) / 180);
    for (const [lon2, lat2] of b) {
      const dLon = Math.abs(lon1 - lon2);
      const dx = Math.min(dLon, 360 - dLon) * cos;
      if (dx * dx + (lat1 - lat2) ** 2 < limit) return true;
    }
  }
  return false;
}

const boundsCache = new WeakMap();
function bounds(ring) {
  if (!boundsCache.has(ring)) {
    const lats = ring.map((p) => p[1]);
    boundsCache.set(ring, { minLat: Math.min(...lats), maxLat: Math.max(...lats) });
  }
  return boundsCache.get(ring);
}

export function guessResult(guess, actual, sizeKm) {
  const km = geoDistance(guess, actual) * EARTH_RADIUS_KM;
  const x = Math.max(0, km / sizeKm - GUESS_TOLERANCE);
  return { km, score: Math.round(100 / (1 + (x / GUESS_HALF) ** 2)) };
}

// Scale- and position-independent comparison: both shapes start out at a common centroid
// and unit area, then the drawing's offset and scale are fine-tuned to fit best.
// Rotation is deliberately not normalized (north is up).
export function compare(drawn, reference) {
  const a = normalizer(drawn);
  const b = normalizer(reference);
  const nb = reference.map(b.apply);
  const fit = bestFit(drawn.map(a.apply), nb);
  const na = drawn.map((p) => fit.apply(a.apply(p)));

  const maxAbs = Math.max(...na.concat(nb).flat().map(Math.abs));
  const s = (GRID / 2 - 2) / maxAbs;
  const toGrid = ([x, y]) => [x * s + GRID / 2, y * s + GRID / 2];
  const ra = rasterize(na.map(toGrid), GRID);
  const rb = rasterize(nb.map(toGrid), GRID);

  let inter = 0;
  let union = 0;
  for (let i = 0; i < ra.length; i++) {
    inter += ra[i] & rb[i];
    union += ra[i] | rb[i];
  }
  const iou = union ? inter / union : 0;
  const distance = contourDistance(na, nb);
  // How far a same-area circle is off: the "no idea what it looks like" baseline, which keeps
  // compact countries (Germany) from being trivially easy compared to elongated ones (Chile).
  const blob = contourDistance(UNIT_CIRCLE.map(bestFit(UNIT_CIRCLE, nb).apply), nb);

  return {
    iou,
    score: toScore(distance, blob),
    // Maps a reference point into the drawn shape's coordinate space, for the overlay.
    toDrawnSpace: (p) => a.invert(fit.invert(b.apply(p))),
  };
}

// Centroid alignment is thrown off by a single oversized feature (a too-long peninsula shifts
// the whole drawing), so a pattern search refines offset and scale to minimize outline distance.
function bestFit(ring, target) {
  const from = resample(ring, 150);
  const to = resample(target, 150);
  const transform = ([tx, ty, logS]) => {
    const s = Math.exp(logS);
    return {
      apply: ([x, y]) => [x * s + tx, y * s + ty],
      invert: ([x, y]) => [(x - tx) / s, (y - ty) / s],
    };
  };
  const cost = (params) => symmetricDistance(from.map(transform(params).apply), to);

  let best = [0, 0, 0];
  let bestCost = cost(best);
  let step = 0.08;
  while (step > 0.002) {
    let improved = false;
    for (let i = 0; i < best.length; i++) {
      for (const dir of [-1, 1]) {
        const candidate = best.slice();
        candidate[i] += dir * step;
        const c = cost(candidate);
        if (c < bestCost) {
          best = candidate;
          bestCost = c;
          improved = true;
        }
      }
    }
    if (!improved) step /= 2;
  }
  return transform(best);
}

// Each term is 1 at a perfect match and 0.5 at its half-way distance.
function toScore(distance, blob) {
  const x = Math.max(0, distance - TOLERANCE);
  const absolute = 1 / (1 + (x / ABS_HALF) ** STEEPNESS);
  const relative = 1 / (1 + (x / (REL_HALF * blob)) ** STEEPNESS);
  return Math.round((100 * (absolute + relative)) / 2);
}

function normalizer(ring) {
  const { area, cx, cy } = moments(ring);
  const k = Math.sqrt(area);
  return {
    apply: ([x, y]) => [(x - cx) / k, (y - cy) / k],
    invert: ([x, y]) => [x * k + cx, y * k + cy],
  };
}

// Area and centroid via rasterization, so self-intersecting drawings are handled like the canvas fills them.
function moments(ring) {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  const s = (GRID - 4) / size;
  const grid = rasterize(ring.map(([x, y]) => [(x - minX) * s + 2, (y - minY) * s + 2]), GRID);

  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (grid[y * GRID + x]) {
        n++;
        sx += x + 0.5;
        sy += y + 0.5;
      }
    }
  }
  if (!n) return { area: 1, cx: minX, cy: minY };
  return { area: n / (s * s), cx: (sx / n - 2) / s + minX, cy: (sy / n - 2) / s + minY };
}

// Scanline fill with the nonzero winding rule (same as the canvas default).
function rasterize(ring, size) {
  const grid = new Uint8Array(size * size);
  const crossings = [];
  for (let y = 0; y < size; y++) {
    const sy = y + 0.5;
    crossings.length = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) {
        crossings.push({ x: x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0), dir: y1 > y0 ? 1 : -1 });
      }
    }
    crossings.sort((a, b) => a.x - b.x);
    let winding = 0;
    for (let i = 0; i < crossings.length - 1; i++) {
      winding += crossings[i].dir;
      if (winding === 0) continue;
      const from = Math.max(0, Math.ceil(crossings[i].x - 0.5));
      const to = Math.min(size - 1, Math.floor(crossings[i + 1].x - 0.5));
      grid.fill(1, y * size + from, y * size + to + 1);
    }
  }
  return grid;
}

// Mean symmetric distance between the two outlines, in units of sqrt(area).
function contourDistance(a, b) {
  return symmetricDistance(resample(a, 400), resample(b, 400));
}

function symmetricDistance(pa, pb) {
  return (meanNearest(pa, pb) + meanNearest(pb, pa)) / 2;
}

function meanNearest(from, to) {
  let total = 0;
  for (const [x, y] of from) {
    let best = Infinity;
    for (const [u, v] of to) best = Math.min(best, (x - u) ** 2 + (y - v) ** 2);
    total += Math.sqrt(best);
  }
  return total / from.length;
}

function resample(ring, count) {
  const closed = ring.concat([ring[0]]);
  const lengths = [0];
  for (let i = 1; i < closed.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1]));
  }
  const total = lengths[lengths.length - 1];
  const out = [];
  let j = 1;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (j < closed.length - 1 && lengths[j] < target) j++;
    const seg = lengths[j] - lengths[j - 1] || 1;
    const t = (target - lengths[j - 1]) / seg;
    out.push([
      closed[j - 1][0] + t * (closed[j][0] - closed[j - 1][0]),
      closed[j - 1][1] + t * (closed[j][1] - closed[j - 1][1]),
    ]);
  }
  return out;
}
