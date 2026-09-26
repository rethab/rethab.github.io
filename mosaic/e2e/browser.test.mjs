// Runs against the real index.html in headless Chrome over file://, the way the
// app is used. Needs Google Chrome (override the path with CHROME=...).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome, writePng } from '../bench/chrome.mjs';

const require = createRequire(import.meta.url);
const { CASES, makeTarget, trajectoryOf, summarize } = require('../test/helpers/golden.js');
const golden = require('../test/fixtures/golden.json');

const indexUrl = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
const workDir = mkdtempSync(join(tmpdir(), 'mosaic-e2e-'));
const imagePath = join(workDir, 'target.png');
let chrome;

before(async () => {
  writePng(imagePath, 120, 90, (x, y) => [x * 2, y * 2.5, (x - 60) ** 2 + (y - 45) ** 2 < 900 ? 220 : 40]);
  chrome = await launchChrome();
  await chrome.open(indexUrl);
});

after(async () => {
  await chrome.close();
  rmSync(workDir, { recursive: true, force: true });
});

for (const testCase of CASES) {
  test(`browser build reproduces golden run: ${testCase.name}`, async () => {
    const run = await chrome.evaluate(`(() => {
      const makeTarget = ${makeTarget};
      const trajectoryOf = ${trajectoryOf};
      const testCase = ${JSON.stringify(testCase)};
      return trajectoryOf(GA, testCase, makeTarget(GA, testCase));
    })()`);
    const actual = summarize(run);
    const expected = golden[testCase.name];
    assert.ok(run.bestFitnessMatches, 'reported best fitness differs from fitness(best)');
    assert.deepEqual(actual.samples, expected.samples, 'best fitness diverged (sampled every 25 generations)');
    assert.equal(actual.trajectoryHash, expected.trajectoryHash);
    assert.equal(actual.bestHash, expected.bestHash);
  });
}

test('Step, Run and Stop drive a run from the page', async () => {
  await chrome.setFile('#imageInput', imagePath);
  const result = await chrome.evaluate(`(async () => {
    const $ = (id) => document.getElementById(id);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const generation = () => Number($('statusGeneration').textContent.split('/')[0].replace(/\\D/g, ''));
    while ($('runBtn').disabled) await sleep(20);
    $('gridSize').value = 40;
    $('gridSize').dispatchEvent(new Event('input'));
    // High enough that the run is still going when the lock is checked.
    $('maxGenerations').value = 100000000;
    $('stepBtn').click();
    const afterStep = { generation: generation(), placeholderHidden: $('resultBox').classList.contains('empty') === false };
    $('runBtn').click();
    await sleep(300);
    const lockedWhileRunning = $('gridSize').disabled && $('populationSize').disabled;
    $('stopBtn').click();
    await sleep(50);
    const afterRun = { generation: generation(), progress: parseFloat($('progressFill').style.width) };
    if (!$('statsToggle').getAttribute('aria-expanded').includes('true')) $('statsToggle').click();
    // Stats are refreshed on the next status update, which a Step triggers.
    $('stepBtn').click();
    return {
      afterStep,
      afterRun,
      lockedWhileRunning,
      canvas: $('resultCanvas').width + 'x' + $('resultCanvas').height,
      error: $('errorMsg').textContent,
      saveEnabled: !$('saveBtn').disabled,
      chartDrawn: document.querySelector('.chart-line').getAttribute('d').length > 0,
      mutation: $('statMutation').textContent + ' ' + $('statMutationShare').textContent,
      imageName: $('imageName').textContent,
    };
  })()`);
  assert.equal(result.error, '');
  assert.equal(result.afterStep.generation, 1);
  assert.ok(result.afterRun.generation > 1, `run did not advance: ${JSON.stringify(result)}`);
  assert.ok(result.afterStep.placeholderHidden, 'result placeholder still shown after a step');
  assert.ok(result.afterRun.progress > 0);
  assert.match(result.mutation, /^±\d+(\.\d)? on [\d.]+% of colour values$/);
  assert.equal(result.imageName, 'target.png · 120 × 90');
  assert.ok(result.lockedWhileRunning, JSON.stringify(result));
  assert.equal(result.canvas, '40x30');
  assert.ok(result.saveEnabled);
  assert.ok(result.chartDrawn);
});
