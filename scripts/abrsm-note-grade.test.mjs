import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load(file, context) {
  vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
}

const context = {};
vm.createContext(context);
load('abrsm-curriculum.js', context);
load('abrsm-note-grade.js', context);
const G = context.AbrsmNoteGrade;
const host = (value) => JSON.parse(JSON.stringify(value));

assert.equal(G.coverage().transposition, false);
assert.equal(G.coverage().examReady, false);
assert.equal(G.coverage().solfege, false);
assert.equal(G.coverage().noteNaming, true);
assert.equal(G.coverage().keySignatures, true);

assert.deepEqual(host(G.positionAt('treble', 0)), { letter: 'F', octave: 5, yFactor: 0 });
assert.deepEqual(host(G.positionAt('treble', 5)), { letter: 'C', octave: 4, yFactor: 5 });
assert.deepEqual(host(G.positionAt('bass', -1)), { letter: 'C', octave: 4, yFactor: -1 });
assert.deepEqual(host(G.positionAt('alto', 2)), { letter: 'C', octave: 4, yFactor: 2 });
assert.deepEqual(host(G.positionAt('tenor', 1)), { letter: 'C', octave: 4, yFactor: 1 });
assert.deepEqual(host(G.positionAt('alto', 4)), { letter: 'F', octave: 3, yFactor: 4 });
assert.deepEqual(host(G.positionAt('tenor', 0)), { letter: 'E', octave: 4, yFactor: 0 });

function pool(id) { return host(G.notePool(id)); }
function clefs(notes) { return [...new Set(notes.map((n) => n.clef))].sort(); }

const g1 = pool('abrsm-g1');
assert.deepEqual(clefs(g1), ['bass', 'treble']);
assert.equal(g1.every((n) => G.ledgerDepth(n.yFactor) <= 1), true);
assert.equal(g1.some((n) => n.accidental === '##' || n.accidental === 'bb'), false);
assert.equal(g1.some((n) => n.clef === 'alto' || n.clef === 'tenor'), false);

const g2 = pool('abrsm-g2');
assert.equal(g2.some((n) => G.ledgerDepth(n.yFactor) === 2), true);
assert.equal(g2.every((n) => G.ledgerDepth(n.yFactor) <= 2), true);

const g3 = pool('abrsm-g3');
assert.equal(g3.some((n) => G.ledgerDepth(n.yFactor) === 3), true);
assert.equal(g3.some((n) => n.accidental === '##'), false);

const g4 = pool('abrsm-g4');
assert.deepEqual(clefs(g4), ['alto', 'bass', 'treble']);
assert.equal(g4.some((n) => n.accidental === '##'), true);
assert.equal(g4.some((n) => n.clef === 'tenor'), false);

const g5 = pool('abrsm-g5');
assert.ok(clefs(g5).includes('tenor'));
assert.equal(g5.some((n) => n.clef === 'tenor' && n.letter === 'C' && n.octave === 4 && !n.accidental), true);
const tenorOnly = g5.filter((n) => n.clef === 'tenor').map((n) => n.vexKey + '|' + n.spelling);
assert.equal(g1.some((n) => tenorOnly.includes(n.vexKey + '|' + n.spelling) && n.clef === 'tenor'), false);

function keys(id) { return host(G.keyItems(id)); }
const k1 = keys('abrsm-g1');
assert.equal(k1.every((item) => item.mode === 'major' && item.form === 'major'), true);
assert.deepEqual([...new Set(k1.map((item) => item.keyId))].sort(), ['C', 'D', 'F', 'G']);
assert.equal(k1.some((item) => item.clef === 'alto'), false);

const k2 = keys('abrsm-g2');
const am = k2.filter((item) => item.keyId === 'Am');
assert.deepEqual([...new Set(am.map((item) => item.form))], ['harmonic']);
assert.equal(k2.some((item) => item.form === 'melodic'), false);
assert.equal(k2.some((item) => item.keyId === 'F#'), false);

const k3 = keys('abrsm-g3');
assert.ok(k3.some((item) => item.keyId === 'Am' && item.form === 'melodic'));
assert.equal(k3.some((item) => item.clef === 'tenor'), false);

const k4 = keys('abrsm-g4');
assert.ok(k4.some((item) => item.clef === 'alto'));
assert.equal(k4.some((item) => item.clef === 'tenor'), false);

const k5 = keys('abrsm-g5');
const fsharp = k5.find((item) => item.keyId === 'F#' && item.form === 'major');
assert.deepEqual(fsharp.signature, ['F#', 'C#', 'G#', 'D#', 'A#', 'E#']);
const dsharp = k5.find((item) => item.keyId === 'D#m' && item.form === 'harmonic' && item.clef === 'tenor');
assert.ok(dsharp);
assert.ok(dsharp.cueNotes.includes('C##'));
assert.equal(k1.some((item) => item.keyId === 'F#' || item.keyId === 'D#m'), false);

const rootGrade = fs.readFileSync(new URL('../abrsm-note-grade.js', import.meta.url), 'utf8');
const wwwGrade = fs.readFileSync(new URL('../www/abrsm-note-grade.js', import.meta.url), 'utf8');
assert.equal(rootGrade, wwwGrade);

for (const file of ['index.html', 'www/index.html']) {
  const page = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const controls = page.slice(page.indexOf('id="modeCards"'), page.indexOf('id="openNoteTeachBtn"'));
  assert.match(controls, /data-abrsm="abrsm-g1"/);
  assert.match(controls, /data-abrsm="abrsm-g5"/);
  assert.doesNotMatch(controls, /data-abrsm=""/);
  assert.doesNotMatch(controls, /初學|初級|中級|進階|最高/);
  assert.doesNotMatch(controls, /中一|中二|中三|中四|中五|中六/);
  assert.doesNotMatch(controls, /id="practiceDiffRow"|id="clefSelectorRow"|id="keysigGradeRow"|id="solfegeGradeRow"/);
  assert.match(page, /id="userGrade"[\s\S]*中一/);
  const rankSelect = page.slice(page.indexOf('id="rankModeFilter"'), page.indexOf('id="rankAbrsmFilterWrap"'));
  assert.match(rankSelect, /abrsm-notes/);
  assert.match(rankSelect, /abrsm-keys/);
  assert.doesNotMatch(rankSelect, /classic60|bass60|mixed60|keysig60|solfege60|noMiss/);
}

const gameSrc = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const submitAt = gameSrc.indexOf('async function submitScore()');
const legacyAt = gameSrc.indexOf("saveLocalRank('game1'", submitAt);
const abrsmAt = gameSrc.indexOf('saveAbrsmRank(', submitAt);
assert.ok(submitAt > 0 && abrsmAt > submitAt && abrsmAt < legacyAt);
assert.equal(context.AbrsmCurriculum.legacyBoardVisible({ difficulty: 'classic60', mode: 'classic60', score: 10 }), true);
const abrsmRow = context.AbrsmCurriculum.rankRecord({ gameKey: 'notes', syllabusId: 'abrsm-g1', score: 20, schoolYear: '中一' });
assert.equal(context.AbrsmCurriculum.legacyBoardVisible(abrsmRow), false);
assert.equal(abrsmRow.storageKey, 'abrsm-theory-v1:notes:abrsm-g1');
assert.notEqual(abrsmRow.storageKey, 'musicGameRanks_game1');

console.log('abrsm-note-grade: ok', g5.length, 'g5 notes', k5.length, 'g5 key cards');
