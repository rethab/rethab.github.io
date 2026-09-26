const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { compile, render, OUTPUT } = require('../scripts/build-wasm.js');

test('breed-wasm.js is up to date with wasm/breed.wat (run npm run build:wasm)', async () => {
  const expected = render(await compile());
  assert.equal(fs.readFileSync(OUTPUT, 'utf8'), expected);
});
