const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistory, niceStep, yDomain, scaleX, scaleY, linePath, nearestPoint } = require('../chart.js');

test('createHistory keeps every sample while under the limit', () => {
  const history = createHistory(10);
  for (let g = 0; g < 5; g++) {
    history.add(g, 80 + g);
  }
  assert.deepEqual(history.points().map((p) => p.generation), [0, 1, 2, 3, 4]);
});

test('createHistory thins to at most maxPoints (+ latest) over a long run', () => {
  const history = createHistory(100);
  for (let g = 0; g <= 100000; g++) {
    history.add(g, g / 1000);
  }
  const points = history.points();
  assert.ok(points.length <= 101, `kept ${points.length} points`);
  assert.equal(points[0].generation, 0);
  assert.equal(points[points.length - 1].generation, 100000);
  for (let i = 1; i < points.length; i++) {
    assert.ok(points[i].generation > points[i - 1].generation);
  }
});

test('createHistory always reports the latest sample', () => {
  const history = createHistory(4);
  for (let g = 0; g <= 13; g++) {
    history.add(g, g);
  }
  const points = history.points();
  assert.equal(points[points.length - 1].generation, 13);
});

test('niceStep rounds up to 1, 2 or 5 times a power of ten', () => {
  assert.equal(niceStep(3), 5);
  assert.equal(niceStep(0.13), 0.2);
  assert.equal(niceStep(1), 1);
  assert.equal(niceStep(0.0004), 0.0005);
});

test('yDomain pins the top at 100% and rounds the bottom down to a tick', () => {
  const domain = yDomain([85.3, 92, 97.1]);
  assert.equal(domain.max, 100);
  assert.equal(domain.min, 85);
  assert.deepEqual(domain.ticks, [85, 90, 95, 100]);
  assert.equal(domain.decimals, 0);
});

test('yDomain zooms in when the curve is already close to 100%', () => {
  const domain = yDomain([99.9912, 99.998]);
  assert.equal(domain.max, 100);
  assert.equal(domain.min, 99.99);
  assert.deepEqual(domain.ticks, [99.99, 99.992, 99.994, 99.996, 99.998, 100]);
  assert.equal(domain.ticks[domain.ticks.length - 1], 100);
  assert.ok(domain.decimals >= 3);
});

test('yDomain handles a perfect match without dividing by zero', () => {
  const domain = yDomain([100]);
  assert.ok(domain.min < 100);
  assert.ok(Number.isFinite(scaleY(100, domain, 200)));
  assert.equal(domain.ticks[domain.ticks.length - 1], 100);
});

test('scaleX maps generations onto a fixed 0-100% axis and clamps past the end', () => {
  assert.equal(scaleX(0, 1000, 500), 0);
  assert.equal(scaleX(250, 1000, 500), 125);
  assert.equal(scaleX(2000, 1000, 500), 500);
});

test('scaleY puts the domain minimum at the bottom and 100% at the top', () => {
  const domain = { min: 80, max: 100 };
  assert.equal(scaleY(80, domain, 200), 200);
  assert.equal(scaleY(100, domain, 200), 0);
  assert.equal(scaleY(90, domain, 200), 100);
});

test('linePath builds an SVG path through the scaled points', () => {
  const points = [{ generation: 0, value: 80 }, { generation: 500, value: 90 }];
  assert.equal(linePath(points, 1000, { min: 80, max: 100 }, 400, 200), 'M0.0,200.0L200.0,100.0');
});

test('nearestPoint snaps to the closest generation', () => {
  const points = [0, 10, 20, 40].map((generation) => ({ generation, value: 0 }));
  assert.equal(nearestPoint(points, 14).generation, 10);
  assert.equal(nearestPoint(points, 16).generation, 20);
  assert.equal(nearestPoint(points, 100).generation, 40);
  assert.equal(nearestPoint(points, -5).generation, 0);
});
