import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(new URL('../exercise-customizer.js', import.meta.url), 'utf8'),
  context
);
const EC = context.ExerciseCustomizer;

// Roundtrip encode/decode across all 6 exercise targets
const samples = {
  notes: { clef: 'bass', ledgers: 2, positions: 'lines', accidentals: false, helpers: true, questionLimit: 20 },
  keysig: { direction: 'flats', maxAcc: 3, includeC: false },
  chord: { roots: 'white', types: ['', 'm', '7'], count: 15 },
  'aural-interval': { intervals: ['M3', 'P5', 'P8'], qualityMode: false, harmonic: true },
  'aural-rhythm': { bpm: 90, includeHalf: true, includeRest: false, includeSync: true },
  'aural-quality': { qualities: ['major', 'minor', 'dim'], cadences: false, phrase: true }
};

for (const [target, cfg] of Object.entries(samples)) {
  const token = EC.encode(target, cfg);
  assert.ok(token.length > 8, `${target} token generated`);
  const decoded = EC.decode(token);
  assert.equal(decoded.target, target);
  assert.deepEqual(JSON.parse(JSON.stringify(decoded.config)), cfg);
}

// Guardrails: minimum selections enforced
assert.ok(EC.normalize('chord', { types: [] }).types.length >= 1);
assert.ok(EC.normalize('aural-interval', { intervals: ['P5'] }).intervals.length >= 2);
assert.ok(EC.normalize('aural-quality', { qualities: ['major'] }).qualities.length >= 2);

// Parity & HTML wiring check
for (const file of ['index.html', 'www/index.html']) {
  const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(html, /exercise-customizer\.js\?v=1/);
  assert.match(html, /id="enterNoteConstruct"/);
  assert.match(html, /id="enterStaffInterval"/);
}
assert.equal(
  fs.readFileSync(new URL('../exercise-customizer.js', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../www/exercise-customizer.js', import.meta.url), 'utf8')
);

console.log('exercise-customizer tests passed');
