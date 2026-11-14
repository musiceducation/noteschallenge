import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../practice-customize.js', import.meta.url), 'utf8'), context);
const PC = context.PracticeCustomize;
const host = (value) => JSON.parse(JSON.stringify(value));

assert.deepEqual(host(PC.controls().map((item) => item.id)), [
  'clefs', 'ranges', 'positions', 'keySignatures', 'noteValues', 'noteNames', 'helpers', 'accidentals', 'noteFilter', 'next'
]);
assert.deepEqual(host(PC.clefs.map((clef) => clef.id)), ['grand', 'treble', 'bass', 'alto', 'tenor', 'soprano', 'mezzo', 'baritone']);
assert.equal(PC.clefs.find((clef) => clef.id === 'mezzo').vex, 'mezzo-soprano');
assert.equal(PC.clefs.find((clef) => clef.id === 'baritone').vex, 'baritone-f');
assert.equal(PC.noteNames.length, 15);

const fresh = PC.defaultSettings();
assert.deepEqual(host(fresh.clefs), ['treble']);
assert.deepEqual(host(fresh.ranges.treble), { low: -8, high: 8 });
assert.deepEqual(host(fresh.ranges.grand), { low: -12, high: 12 });
assert.equal(fresh.positions, 0);
assert.deepEqual(host(fresh.keySignatures), [0]);
assert.deepEqual(host(fresh.noteValues), [0]);
assert.equal(fresh.noteNames, 0);
assert.equal(fresh.helpers, false);
assert.equal(fresh.accidentals, true);
assert.equal(fresh.noteFilter, false);
assert.equal(fresh.next, 2);

function at(clef, position) {
  const code = PC.clefs.find((item) => item.id === clef).code;
  const pitch = PC.pitchAt(code, position);
  return PC.clefs[0] && ['C', 'D', 'E', 'F', 'G', 'A', 'B'][pitch.letter] + pitch.octave;
}
assert.equal(at('treble', 0), 'B4');
assert.equal(at('treble', -4), 'E4');
assert.equal(at('treble', 4), 'F5');
assert.equal(at('alto', 0), 'C4');
assert.equal(at('bass', 0), 'D3');
assert.equal(at('soprano', -4), 'C4');
assert.equal(at('mezzo', -2), 'C4');
assert.equal(at('tenor', 2), 'C4');
assert.equal(at('baritone', 0), 'F3');
assert.equal(at('grand', 0), 'C4');
assert.equal(at('grand', -6), 'D3');

const grand = PC.rangeModel('grand', 0, 0).positions.find((item) => item.position === 0);
assert.equal(grand.staff, 'treble');
assert.equal(grand.drawPosition, -6);
const grandBass = PC.rangeModel('grand', -6, -6).positions.find((item) => item.position === -6);
assert.equal(grandBass.staff, 'bass');
assert.equal(grandBass.drawPosition, 0);

assert.equal(PC.keyAccidental(3, 1), 1);
assert.equal(PC.keyAccidental(0, 1), 0);
assert.equal(PC.keyAccidental(0, 2), 1);
assert.equal(PC.keyAccidental(3, 2), 1);
assert.equal(PC.keyAccidental(4, 2), 0);
assert.equal(PC.keyAccidental(6, -1), -1);
assert.equal(PC.keyAccidental(0, -1), 0);
assert.equal(PC.keyAccidental(3, -6), 0);
assert.equal(PC.keyAccidental(0, -6), -1);
assert.equal([0, 1, 2, 3, 4, 5, 6].every((letter) => PC.keyAccidental(letter, 7) === 1), true);

assert.deepEqual(host(PC.clickRange(0, 4, -2, 8)), { low: -2, high: 4 });
assert.deepEqual(host(PC.clickRange(0, 4, 8, 8)), { low: 0, high: 8 });
assert.deepEqual(host(PC.clickRange(2, 2, 2, 8)), { low: 2, high: 2 });
const inverted = PC.normalize({ clefs: ['bass'], ranges: { bass: { low: 5, high: -3 } } });
assert.deepEqual(host(inverted.ranges.bass), { low: -3, high: 5 });
assert.deepEqual(host(PC.normalize({ clefs: [] }).clefs), ['treble']);
assert.deepEqual(host(PC.normalize({ keySignatures: [] }).keySignatures), [0]);
assert.equal(PC.normalize({ noteNames: 7, helpers: true, noteFilter: true }).helpers, false);
assert.equal(PC.normalize({ noteNames: 5, noteFilter: true }).noteFilter, false);
assert.equal(PC.normalize({ noteNames: 9, noteFilter: true }).noteFilter, false);

function one(settings) {
  const rows = PC.questions(Object.assign({
    clefs: ['treble'],
    positions: 0,
    keySignatures: [0],
    noteValues: [0],
    noteNames: 0,
    accidentals: true,
    noteFilter: false,
    next: 2
  }, settings));
  assert.ok(rows.length > 0, JSON.stringify(settings));
  return rows;
}

const c4 = one({ ranges: { treble: { low: -6, high: -6 } }, accidentals: false });
assert.equal(c4.length, 1);
assert.equal(c4[0].letter, 'C');
assert.equal(c4[0].octave, 4);
assert.equal(c4[0].correctName, 'C');
assert.equal(c4[0].vexKey, 'c/4');
assert.equal(c4[0].vexDuration, 'w');
assert.equal(c4[0].keySpec, null);
assert.equal(c4[0].freqKey, 'C4');

const fSharp = one({ ranges: { treble: { low: 4, high: 4 } }, keySignatures: [1], accidentals: false });
assert.equal(fSharp[0].letter, 'F');
assert.equal(fSharp[0].octave, 5);
assert.equal(fSharp[0].correctName, 'F#');
assert.equal(fSharp[0].keySpec, 'G');
assert.equal(fSharp[0].vexAccidental, null);
assert.equal(fSharp[0].freqKey, 'F#5');

const natural = one({ ranges: { treble: { low: 4, high: 4 } }, keySignatures: [1], accidentals: true })
  .find((item) => item.quality === 0);
assert.equal(natural.vexAccidental, 'n');
assert.equal(natural.correctName, 'F');

const lines = one({ ranges: { treble: { low: -1, high: 1 } }, positions: 1, accidentals: false });
assert.equal(lines.every((item) => item.position % 2 === 0), true);
const spaces = one({ ranges: { treble: { low: -1, high: 1 } }, positions: 2, accidentals: false });
assert.equal(spaces.every((item) => Math.abs(item.position % 2) === 1), true);

const chromatic = one({ ranges: { treble: { low: -6, high: 4 } }, noteNames: 13, accidentals: true });
assert.equal(chromatic.some((item) => item.correctName === 'Di'), true);
assert.equal(chromatic.some((item) => item.letter === 'E' && item.quality === 1), false);
assert.equal(chromatic.some((item) => item.letter === 'B' && item.quality === 1), false);
assert.equal(chromatic.some((item) => item.letter === 'C' && item.quality === -1), false);
assert.equal(chromatic.some((item) => item.letter === 'F' && item.quality === 1), true);

const doubles = one({ ranges: { treble: { low: 0, high: 0 } }, noteNames: 7, accidentals: true });
assert.equal(doubles.some((item) => item.quality === 2), true);
assert.equal(doubles.some((item) => item.quality === -2), true);
assert.equal(doubles.every((item) => item.answerId.indexOf('pc') === 0), true);

const filtered = one({
  ranges: { treble: { low: -8, high: 8 } },
  noteFilter: true,
  notes: [6],
  accidentals: true
});
assert.equal(filtered.every((item) => item.letter === 'C' && item.quality === 1), true);

const degree = one({ ranges: { treble: { low: -6, high: -6 } }, noteNames: 9, accidentals: false });
assert.equal(degree[0].correctName, '1');
assert.equal(degree[0].answerId, 'sd15');
const second = one({ ranges: { treble: { low: -5, high: -5 } }, noteNames: 5, accidentals: false });
assert.equal(second[0].letter, 'D');
assert.equal(second[0].correctName, 'Re');
const minorDo = one({ ranges: { treble: { low: -1, high: -1 } }, noteNames: 6, keySignatures: [0], accidentals: false });
assert.equal(minorDo[0].letter, 'A');
assert.equal(minorDo[0].correctName, 'Do');
const minorLa = one({ ranges: { treble: { low: -1, high: -1 } }, noteNames: 12, accidentals: false });
assert.equal(minorLa[0].correctName, 'La');

const buttons = PC.answerButtons({ noteNames: 0, noteFilter: false, accidentals: true });
assert.equal(buttons.length, 3);
assert.equal(buttons[1][0].label, 'C');
assert.equal(buttons[0][0].label, 'C#');
assert.equal(buttons[2][0].label, 'C♭');
const alpha = PC.answerButtons({ noteNames: 11, noteFilter: false });
assert.equal(alpha[1][0].label, 'A');
const german = PC.answerButtons({ noteNames: 14, noteFilter: false });
assert.equal(german[1][6].label, 'H');
assert.equal(german[2][6].label, 'B');
assert.equal(german[0][3].label, 'Fis');
const te = PC.answerButtons({ noteNames: 8 });
assert.equal(te[2][2].label, 't');
assert.equal(te[2][3].label, 'e');

const model = PC.rangeModel('treble', -2, 2);
assert.equal(model.positions.filter((item) => item.included).length, 5);
assert.equal(model.positions.find((item) => item.position === 3).included, false);
assert.equal(model.positions.find((item) => item.position === -2).endpoint, true);
assert.equal(model.low <= model.high, true);

const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const wwwPage = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
for (const html of [page, wwwPage]) {
  assert.match(html, /id="practiceCustomize"/);
  assert.match(html, /data-practice-source="abrsm"/);
  assert.match(html, /data-practice-source="custom"/);
  assert.match(html, /practice-customize\.js/);
}
const game = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const wwwGame = fs.readFileSync(new URL('../www/script.js', import.meta.url), 'utf8');
for (const src of [game, wwwGame]) {
  assert.match(src, /PracticeCustomize\.questions/);
  assert.match(src, /practiceSource === 'custom'/);
  assert.match(src, /AbrsmNoteGrade\.practicePool\(clefPracticeIds\(\)\)/);
  assert.match(src, /row\.style\.display = keysig \? '' : 'none'/);
  assert.match(src, /state\.currentMode === 'classic60'[\s\S]{0,80}saveNoteClefRank\(\)/);
  assert.equal(src.includes("practice: { name:'練習模式'"), true);
}
assert.match(game, /scoreMulti:0/);
assert.equal(fs.readFileSync(new URL('../practice-customize.js', import.meta.url), 'utf8'), fs.readFileSync(new URL('../www/practice-customize.js', import.meta.url), 'utf8'));

console.log('practice-customize: ok', one({}).length, 'default treble notes');
