import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadPool(file) {
  const src = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const start = src.indexOf('const KEY_SIGNATURES');
  const end = src.indexOf('const SOLFEGE_NAMES');
  assert.ok(start > 0 && end > start, file);
  const context = { state: { keysigAccMax: 1 } };
  vm.createContext(context);
  vm.runInContext(
    src.slice(start, end) + '\nthis.pool = getKeysigPool;\nthis.ids = (n) => getKeysigPool(n).map((k) => k.id);',
    context
  );
  return context;
}

function expectIds(api, max, ids) {
  assert.deepEqual(Array.from(api.ids(max)), ids, 'cap ' + max);
}

for (const file of ['script.js', 'www/script.js']) {
  const api = loadPool(file);
  expectIds(api, 1, ['C', 'G', 'F']);
  expectIds(api, 2, ['C', 'G', 'F', 'D', 'Bb']);
  expectIds(api, 3, ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb']);
  expectIds(api, 4, ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab']);
  expectIds(api, 5, ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db']);
  expectIds(api, 0, ['C', 'G', 'F']);
  expectIds(api, 9, ['C', 'G', 'F']);
  assert.equal(api.pool(1).some((k) => k.id === 'B' || k.id === 'Db'), false);
  assert.equal(api.pool(1).length < api.pool(5).length, true);
}

const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const keysigCard = page.slice(page.indexOf('data-mode="keysig_practice"'), page.indexOf('data-mode="solfege_practice"'));
assert.doesNotMatch(keysigCard, /英皇/);
const acc = page.slice(page.indexOf('id="keysigAccRow"'), page.indexOf('id="solfegeSubRow"'));
assert.doesNotMatch(acc, /英皇/);
assert.match(page, /id="abrsmGradeRow"/);

console.log('keysig-pool tests passed');
