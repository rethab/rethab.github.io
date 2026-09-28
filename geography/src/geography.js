import { geoPath } from 'd3-geo';
import world from 'world-atlas/countries-50m.json';
import { CITIES } from './cities.js';
import { COUNTRIES } from './countries.js';
import {
  compare,
  countryFeature,
  countryFeatures,
  countryRegion,
  countryShape,
  guessResult,
  projectionFor,
} from './geo.js';

// Logical drawing size; the canvas is scaled with CSS, so strokes survive window resizes.
const WIDTH = 800;
const HEIGHT = 600;
const MIN_POINTS = 10;
const MAP_PADDING = 36;
// Some coastal cities sit just off the simplified coastline, so guesses may land slightly outside it.
const BORDER_TOLERANCE = 8;
const TITLES = { draw: 'Country Draw', find: 'City Finder' };

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const select = $('country');
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const dpr = window.devicePixelRatio || 1;
const hit = document.createElement('canvas').getContext('2d');
hit.lineWidth = 2 * BORDER_TOLERANCE;

let mode = location.hash === '#find' ? 'find' : 'draw';
let finished = false;

// Draw mode
let strokes = [];

// Find mode
const maps = new Map();
const cityQueues = new Map();
let city = null;
let pin = null;

function setupCanvas() {
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function currentCountry() {
  return COUNTRIES.find((c) => c.name === select.value);
}

function setMode(next) {
  mode = next;
  history.replaceState(null, '', mode === 'find' ? '#find' : location.pathname);
  $('title').textContent = TITLES[mode];
  document.title = `${TITLES[mode]} · Geography`;
  for (const tab of document.querySelectorAll('[data-mode]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
  }
  $('undo').hidden = $('clear').hidden = mode !== 'draw';
  $('again').textContent = mode === 'draw' ? 'Try again' : 'Next city';
  $('legend-mine').textContent = mode === 'draw' ? 'Your drawing' : 'Your guess';
  $('legend-real').textContent = mode === 'draw' ? 'Actual shape' : 'Actual location';
  startRound();
}

function startRound() {
  finished = false;
  strokes = [];
  pin = null;
  canvas.classList.remove('done', 'outside');
  $('status').classList.remove('finished');
  $('again').hidden = true;
  // Find mode commits the guess on release, so it has no Done button.
  $('done').hidden = mode === 'find';

  if (mode === 'draw') {
    const { label, hint } = currentCountry();
    setPrompt('Draw ', label, '');
    $('hint').textContent = `${hint ? `${capitalize(hint)}. ` : ''}Size and position don't matter.`;
  } else {
    city = nextCity(select.value);
    setPrompt('Where is ', city.name, '?');
    $('hint').textContent = `Tap where you think it is in ${currentCountry().label}. Hold and drag to fine-tune before letting go.`;
  }
  render();
}

function setPrompt(before, emphasis, after) {
  const strong = document.createElement('strong');
  strong.textContent = emphasis;
  $('prompt').replaceChildren(before, strong, after);
}

function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1);
}

// Cycles through all cities of a country in random order before repeating one.
function nextCity(country) {
  let queue = cityQueues.get(country);
  if (!queue?.length) {
    queue = shuffle(CITIES[country].slice());
    if (queue[0] === city) queue.push(queue.shift());
    cityQueues.set(country, queue);
  }
  return queue.shift();
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function updateButtons() {
  $('undo').disabled = finished || !strokes.length;
  $('clear').disabled = finished || !strokes.length;
  $('done').disabled = mode === 'draw' ? strokes.flat().length < MIN_POINTS : !pin;
}

function toCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return [((e.clientX - rect.left) * WIDTH) / rect.width, ((e.clientY - rect.top) * HEIGHT) / rect.height];
}

// Only one pointer is tracked at a time, so a resting palm or second finger on a tablet is ignored.
let activePointer = null;

function onCountry(p) {
  const { shape } = mapFor(select.value);
  return hit.isPointInPath(shape, ...p, 'evenodd') || hit.isPointInStroke(shape, ...p);
}

canvas.addEventListener('pointerdown', (e) => {
  if (finished || activePointer !== null) return;
  e.preventDefault();
  const p = toCanvas(e);
  if (mode === 'find' && !onCountry(p)) return;
  canvas.setPointerCapture(e.pointerId);
  activePointer = e.pointerId;
  if (mode === 'draw') strokes.push([p]);
  else pin = p;
  render();
});

canvas.addEventListener('pointermove', (e) => {
  if (mode === 'find' && !finished && activePointer === null && e.pointerType === 'mouse') {
    canvas.classList.toggle('outside', !onCountry(toCanvas(e)));
  }
  if (e.pointerId !== activePointer) return;
  if (mode === 'find') {
    // Dragging past the border leaves the pin at the last spot inside the country.
    const p = toCanvas(e);
    if (onCountry(p)) pin = p;
  } else {
    const stroke = strokes[strokes.length - 1];
    // Coalesced events keep fast finger strokes smooth instead of turning them into polygons.
    const coalesced = e.getCoalescedEvents?.() ?? [];
    for (const ev of coalesced.length ? coalesced : [e]) {
      const p = toCanvas(ev);
      const last = stroke[stroke.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 2) stroke.push(p);
    }
  }
  render();
});

const endPointer = (e) => {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  if (mode === 'find') {
    if (e.type === 'pointerup') return finish();
    pin = null;
  } else if (strokes[strokes.length - 1].length < 3) {
    // A stray tap would otherwise pull a spike out of the joined outline.
    strokes.pop();
  }
  render();
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  if (mode === 'draw') renderDrawing();
  else renderMap();
  updateButtons();
}

function renderDrawing() {
  const ring = strokes.flat();
  if (!ring.length) return;
  // Separate strokes are joined into one outline, so the pen can be lifted mid-border.
  path(ring, false);
  ctx.strokeStyle = color('--ink');
  ctx.lineWidth = 3;
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.stroke();

  if (ring.length > 1) {
    ctx.beginPath();
    ctx.moveTo(...ring[ring.length - 1]);
    ctx.lineTo(...ring[0]);
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = color('--muted');
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function path(points, close = true) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
  if (close) ctx.closePath();
}

function finish() {
  if (mode === 'draw') finishDrawing();
  else finishGuess();
  finished = true;
  canvas.classList.add('done');
  $('status').classList.add('finished');
  $('done').hidden = true;
  $('again').hidden = false;
  updateButtons();
  // On a phone the page may be scrolled down to the canvas, which would hide the score.
  if ($('status').getBoundingClientRect().top < 0) $('status').scrollIntoView({ behavior: 'smooth' });
}

function showScore(score, text) {
  $('score').replaceChildren(String(score), Object.assign(document.createElement('small'), { textContent: '/100' }));
  $('verdict').textContent = text;
}

function finishDrawing() {
  const drawn = strokes.flat();
  const { mainland, others } = countryShape(world, select.value);
  const result = compare(drawn, mainland);
  const reference = mainland.map(result.toDrawnSpace);
  const islands = others.map((ring) => ring.map(result.toDrawnSpace));

  showComparison(drawn, reference, islands);
  showScore(result.score, `${drawVerdict(result.score)} Area overlap: ${Math.round(result.iou * 100)}%.`);
}

// Both shapes are already aligned; this just zooms so the pair fits the canvas.
function showComparison(drawn, reference, islands) {
  const all = drawn.concat(reference);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1;
  const h = Math.max(...ys) - minY || 1;
  const k = Math.min((WIDTH * 0.85) / w, (HEIGHT * 0.85) / h);
  const ox = (WIDTH - w * k) / 2 - minX * k;
  const oy = (HEIGHT - h * k) / 2 - minY * k;
  const view = (ring) => ring.map(([x, y]) => [x * k + ox, y * k + oy]);

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.lineJoin = ctx.lineCap = 'round';

  ctx.fillStyle = color('--line');
  for (const island of islands) {
    path(view(island));
    ctx.fill();
  }

  path(view(reference));
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = color('--reference');
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color('--reference');
  ctx.lineWidth = 2;
  ctx.stroke();

  path(view(drawn));
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = color('--accent');
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color('--accent');
  ctx.lineWidth = 3;
  ctx.stroke();
}

// The base map is rendered once per country; dragging the pin only composites on top of it.
function mapFor(name) {
  if (maps.has(name)) return maps.get(name);

  const region = countryRegion(world, name);
  const projection = projectionFor(region).fitExtent(
    [
      [MAP_PADDING, MAP_PADDING],
      [WIDTH - MAP_PADDING, HEIGHT - MAP_PADDING],
    ],
    region,
  );
  const image = document.createElement('canvas');
  image.width = canvas.width;
  image.height = canvas.height;
  const g = image.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.lineJoin = 'round';
  const draw = geoPath(projection, g);

  g.fillStyle = color('--sea');
  g.fillRect(0, 0, WIDTH, HEIGHT);

  g.beginPath();
  for (const f of countryFeatures(world)) if (f.properties.name !== name) draw(f);
  g.fillStyle = color('--land');
  g.fill();
  g.strokeStyle = color('--land-border');
  g.lineWidth = 1;
  g.stroke();

  const shape = new Path2D();
  geoPath(projection, shape)(countryFeature(world, name));
  g.fillStyle = color('--target');
  g.fill(shape, 'evenodd');
  g.strokeStyle = color('--target-border');
  g.lineWidth = 1.5;
  g.stroke(shape);

  const map = { region, projection, image, shape };
  maps.set(name, map);
  return map;
}

function renderMap() {
  const { projection, image } = mapFor(select.value);
  ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);

  if (finished) {
    const actual = projection([city.lon, city.lat]);
    ctx.beginPath();
    ctx.moveTo(...pin);
    ctx.lineTo(...actual);
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = color('--ink');
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    if (Math.hypot(actual[0] - pin[0], actual[1] - pin[1]) > 80) {
      drawLabel(`${Math.round(guessKm)} km`, (pin[0] + actual[0]) / 2, (pin[1] + actual[1]) / 2, 'center', '500 14px');
    }
    drawCity(actual, city.name);
  }
  if (pin) drawPin(pin);
}

// Teardrop with its tip on the guessed spot, so the head stays visible above a finger.
function drawPin([x, y]) {
  const r = 11;
  const h = 30;
  const a = Math.acos(r / h);
  ctx.beginPath();
  ctx.ellipse(x, y, 6, 2.5, 0, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y - h, r, Math.PI / 2 + a, Math.PI / 2 - a);
  ctx.closePath();
  ctx.fillStyle = color('--accent');
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y - h, 4, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

function drawCity([x, y], name) {
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, 2 * Math.PI);
  ctx.fillStyle = color('--reference');
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.font = '600 16px system-ui, -apple-system, "Segoe UI", sans-serif';
  const right = x + 12 + ctx.measureText(name).width < WIDTH - 8;
  drawLabel(name, right ? x + 12 : x - 12, y, right ? 'left' : 'right', '600 16px');
}

// A halo in the background colour keeps text readable over land, sea and borders alike.
function drawLabel(text, x, y, align, font) {
  ctx.font = `${font} system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = color('--halo');
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color('--ink');
  ctx.fillText(text, x, y);
}

let guessKm = 0;

function finishGuess() {
  const { region, projection } = mapFor(select.value);
  const { km, score } = guessResult(projection.invert(pin), [city.lon, city.lat], region.sizeKm);
  guessKm = km;
  finished = true;
  render();
  showScore(score, `${findVerdict(score)} ${city.name} is ${Math.round(km)} km from your guess.`);
}

function drawVerdict(score) {
  if (score >= 90) return 'Cartographer level!';
  if (score >= 75) return 'Very good.';
  if (score >= 55) return 'Recognizable.';
  if (score >= 30) return 'Somewhat close.';
  return 'Keep practising.';
}

function findVerdict(score) {
  if (score >= 90) return 'Spot on!';
  if (score >= 75) return 'Very close.';
  if (score >= 55) return 'Not bad.';
  if (score >= 30) return 'Right region, roughly.';
  return 'Way off.';
}

for (const { label, name } of COUNTRIES) select.add(new Option(label, name));
select.value = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)].name;
select.addEventListener('change', startRound);
$('random').addEventListener('click', () => {
  const options = COUNTRIES.filter((c) => c.name !== select.value);
  select.value = options[Math.floor(Math.random() * options.length)].name;
  startRound();
});
$('undo').addEventListener('click', () => {
  strokes.pop();
  render();
});
$('clear').addEventListener('click', startRound);
$('done').addEventListener('click', finish);
$('again').addEventListener('click', startRound);
for (const tab of document.querySelectorAll('[data-mode]')) {
  tab.addEventListener('click', () => tab.dataset.mode !== mode && setMode(tab.dataset.mode));
}

setupCanvas();
setMode(mode);
