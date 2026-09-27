import assert from 'node:assert/strict';
import { test } from 'node:test';
import world from 'world-atlas/countries-50m.json' with { type: 'json' };
import { CITIES } from '../src/cities.js';
import { COUNTRIES } from '../src/countries.js';
import { compare, countryRegion, countryShape, guessResult } from '../src/geo.js';

const circle = (r, n = 100) => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * 2 * Math.PI), r * Math.sin((i / n) * 2 * Math.PI)]);

function latitudes(region) {
  const lats = region.geometry.coordinates.flat(2).map((p) => p[1]);
  return [Math.min(...lats), Math.max(...lats)];
}

test('an exact copy scores 100 regardless of scale and position', () => {
  const { mainland } = countryShape(world, 'Italy');
  const copy = mainland.map(([x, y]) => [x * 7 + 120, y * 7 - 40]);
  assert.equal(compare(copy, mainland).score, 100);
});

test('a circle scores low for a distinctive shape', () => {
  const { mainland } = countryShape(world, 'Italy');
  assert.ok(compare(circle(50), mainland).score < 20);
});

test('rotation matters: a sideways Chile scores low', () => {
  const { mainland } = countryShape(world, 'Chile');
  const sideways = mainland.map(([x, y]) => [y, -x]);
  assert.ok(compare(sideways, mainland).score < 20);
});

test('a guess on the city scores 100, one across the country scores low', () => {
  const { sizeKm } = countryRegion(world, 'Netherlands');
  const amsterdam = [4.9, 52.37];
  assert.equal(guessResult(amsterdam, amsterdam, sizeKm).score, 100);
  assert.ok(guessResult([5.68, 50.85], amsterdam, sizeKm).score < 15);
});

test('guesses are judged relative to country size', () => {
  const nl = countryRegion(world, 'Netherlands').sizeKm;
  const ru = countryRegion(world, 'Russia').sizeKm;
  const moscow = [37.62, 55.75];
  const offBy50Km = [38.4, 55.75];
  assert.ok(guessResult(offBy50Km, moscow, ru).score > guessResult(offBy50Km, moscow, nl).score);
});

test('maps include nearby islands but not overseas territories', () => {
  const [, usMaxLat] = latitudes(countryRegion(world, 'United States of America'));
  assert.ok(usMaxLat < 50, 'Alaska is not on the US map');
  const [nzMinLat, nzMaxLat] = latitudes(countryRegion(world, 'New Zealand'));
  assert.ok(nzMaxLat > -35 && nzMinLat < -46, 'both main islands are on the New Zealand map');
});

test('every country has a shape, a map and cities', () => {
  for (const { name } of COUNTRIES) {
    assert.ok(countryShape(world, name).mainland.length > 50, name);
    assert.ok(countryRegion(world, name).sizeKm > 0, name);
    assert.ok(CITIES[name]?.length >= 3, name);
  }
});
