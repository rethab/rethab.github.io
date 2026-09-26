import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launchChrome, writePng } from './chrome.mjs';

const POPULATION = 50;
const GRID = 100;
const WARMUP_MS = 2000;
const MEASURE_MS = 8000;

const indexUrl = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
const workDir = mkdtempSync(join(tmpdir(), 'mosaic-bench-'));
const imagePath = join(workDir, 'target.png');
writePng(imagePath, GRID, GRID, (x, y) => [
  128 + 100 * Math.sin(x / 7),
  y * 2.5,
  (x - 50) ** 2 + (y - 40) ** 2 < 600 ? 230 : 50,
]);

const chrome = await launchChrome();
try {
  await chrome.open(indexUrl);
  await chrome.setFile('#imageInput', imagePath);
  const result = await chrome.evaluate(`(async () => {
    const $ = (id) => document.getElementById(id);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const generation = () => Number($('statusGeneration').textContent.split('/')[0].replace(/\\D/g, ''));
    $('populationSize').value = ${POPULATION};
    $('gridSize').value = ${GRID};
    $('maxGenerations').value = 1000000;
    while ($('runBtn').disabled) await sleep(20);
    $('runBtn').click();
    await sleep(${WARMUP_MS});
    let frames = 0;
    let counting = true;
    const countFrame = () => { frames++; if (counting) requestAnimationFrame(countFrame); };
    requestAnimationFrame(countFrame);
    const g0 = generation(), t0 = performance.now();
    await sleep(${MEASURE_MS});
    const g1 = generation(), t1 = performance.now();
    counting = false;
    $('stopBtn').click();
    const seconds = (t1 - t0) / 1000;
    return { genPerSec: (g1 - g0) / seconds, fps: frames / seconds, generation: g1, fitness: $('statusFitness').textContent };
  })()`);
  console.log(
    `browser (headless Chrome), population ${POPULATION}, grid ${GRID}x${GRID}: ` +
      `${result.genPerSec.toFixed(1)} gen/s at ${result.fps.toFixed(0)} fps (reached generation ${result.generation}, fitness ${result.fitness})`
  );
} finally {
  await chrome.close();
  rmSync(workDir, { recursive: true, force: true });
}
