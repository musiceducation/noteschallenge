import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(new URL('../theory-drill.js', import.meta.url), 'utf8'),
  context
);
const TD = context.TheoryDrill;

// Config encode / decode roundtrip for shareable teacher URLs
const cfg = TD.normalizeConfig({
  mode: 'note-construct',
  clef: 'bass',
  ledgers: 2,
  positions: 'lines',
  accidentals: false,
  helpers: true,
  questionLimit: 25
});
const token = TD.encodeConfig(cfg);
const decoded = TD.decodeConfig(token);
assert.deepEqual(decoded, cfg);

// Tamper-resistant Progress Report Verification Code
const code = TD.signReport({ name: '中一A-12', mode: 'note-id', clef: 'treble', correct: 23, total: 25, accuracy: 92, ts: 1700000000000 });
assert.match(code, /^NT-[A-Z0-9]{6}-/);
const ok = TD.verifyReport(code);
assert.equal(ok.valid, true);
assert.equal(ok.report.name, '中一A-12');
assert.equal(ok.report.accuracy, 92);
assert.equal(TD.verifyReport(code + 'X').valid, false);

// Note question generation respects lines-only & no-accidentals
for (let i = 0; i < 20; i++) {
  const q = TD.buildNoteQuestion({ mode: 'note-id', clef: 'treble', ledgers: 0, positions: 'lines', accidentals: false }, '', Math.random);
  assert.equal(q.acc, '');
  assert.equal(q.pos % 2, 0);
  assert.ok(q.pos >= 0 && q.pos <= 8);
}

// Staff interval question generation
const ivq = TD.buildIntervalQuestion({ mode: 'staff-interval', clef: 'treble', intervalQuality: true }, '', () => 0.3);
assert.equal(ivq.choices.length, 4);
assert.equal(ivq.choices.filter((c) => c.id === ivq.answerId).length, 1);
assert.ok(ivq.high.midi > ivq.low.midi);

// SVG staff rendering
const svg = TD.renderStaffSvg('treble', [{ pos: -2, acc: '#' }]);
assert.match(svg, /<svg/);
assert.match(svg, /♯/);

for (const file of ['index.html', 'www/index.html']) {
  const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(html, /id="enterTheoryDrill"/);
  assert.match(html, /id="screen-theory-drill"/);
  assert.match(html, /theory-drill\.js\?v=1/);
}
assert.equal(
  fs.readFileSync(new URL('../theory-drill.js', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../www/theory-drill.js', import.meta.url), 'utf8')
);

console.log('theory-drill tests passed');
