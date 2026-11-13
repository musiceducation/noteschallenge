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

const altoG1 = host(G.notePoolForClefs('abrsm-g1', ['alto']));
assert.equal(altoG1.every((n) => n.clef === 'alto'), true);
assert.equal(altoG1.every((n) => G.ledgerDepth(n.yFactor) <= 1), true);
assert.ok(altoG1.some((n) => n.letter === 'C' && n.octave === 4 && n.yFactor === 2 && !n.accidental));
const tenorG1 = host(G.notePoolForClefs('abrsm-g1', ['tenor']));
assert.ok(tenorG1.some((n) => n.letter === 'C' && n.octave === 4 && n.yFactor === 1 && !n.accidental));
assert.equal(tenorG1.some((n) => n.accidental === '##'), false);
const mixedG1 = host(G.notePoolForClefs('abrsm-g1', ['treble', 'bass', 'alto', 'tenor']));
assert.deepEqual(clefs(mixedG1), ['alto', 'bass', 'tenor', 'treble']);
assert.equal(clefs(pool('abrsm-g1')).includes('alto'), false);
const practiceAlto = host(G.practicePool(['alto']));
assert.equal(practiceAlto.every((n) => n.clef === 'alto' && n.gradeId === null), true);
assert.ok(practiceAlto.some((n) => n.letter === 'C' && n.octave === 4 && n.yFactor === 2 && !n.accidental));
assert.equal(practiceAlto.some((n) => G.ledgerDepth(n.yFactor) === 4), true);
assert.equal(practiceAlto.some((n) => n.accidental === '#'), true);
assert.equal(practiceAlto.some((n) => n.accidental === 'b'), true);
assert.equal(practiceAlto.some((n) => n.accidental === '##' || n.accidental === 'bb'), false);
const practiceTenor = host(G.practicePool(['tenor']));
assert.ok(practiceTenor.some((n) => n.letter === 'C' && n.octave === 4 && n.yFactor === 1 && !n.accidental));
assert.deepEqual(clefs(host(G.practicePool(['treble', 'bass', 'alto', 'tenor']))), ['alto', 'bass', 'tenor', 'treble']);

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
  assert.doesNotMatch(controls, /id="practiceDiffRow"|id="keysigGradeRow"|id="solfegeGradeRow"/);
  assert.match(controls, /id="clefSelectorRow"/);
  assert.match(controls, /data-clef="treble"/);
  assert.match(controls, /data-clef="bass"/);
  assert.match(controls, /data-clef="alto"/);
  assert.match(controls, /data-clef="tenor"/);
  assert.match(controls, /data-clef="mixed"/);
  assert.match(controls, /高音譜號/);
  assert.match(controls, /低音譜號/);
  assert.match(controls, /中音譜號/);
  assert.match(controls, /次中音譜號/);
  assert.match(controls, /混合會輪流用高音、低音、中音和次中音譜號/);
  assert.doesNotMatch(controls, /音高範圍仍跟所選英皇級別|自選譜號練習/);
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
const clefRow = context.AbrsmCurriculum.rankRecord({ gameKey: 'notes-clef-alto', syllabusId: 'abrsm-g1', score: 12, schoolYear: '中一' });
assert.equal(clefRow.storageKey, 'abrsm-theory-v1:notes-clef-alto:abrsm-g1');
assert.notEqual(clefRow.storageKey, abrsmRow.storageKey);
assert.match(gameSrc, /AbrsmNoteGrade\.practicePool\(clefPracticeIds\(\)\)/);
assert.match(gameSrc, /abrsm-theory-v1:notes-clef-/);
assert.match(gameSrc, /saveNoteClefRank\(\)/);
assert.match(gameSrc, /row\.style\.display = keysig \? '' : 'none'/);
assert.doesNotMatch(gameSrc, /1分鐘挑戰完成 · \$\{noteClefLabel\(\)\} · G/);
assert.doesNotMatch(gameSrc, /saveAbrsmRank\(timedNoteRankKey\(\)\)/);
assert.doesNotMatch(gameSrc, /notePoolForClefs\(state\.abrsmGrade/);
const wwwGame = fs.readFileSync(new URL('../www/script.js', import.meta.url), 'utf8');
assert.match(wwwGame, /AbrsmNoteGrade\.practicePool\(clefPracticeIds\(\)\)/);
assert.match(wwwGame, /saveNoteClefRank\(\)/);
assert.doesNotMatch(wwwGame, /notePoolForClefs\(state\.abrsmGrade/);
const submitBody = gameSrc.slice(submitAt, legacyAt);
assert.match(submitBody, /state\.currentMode === 'classic60'[\s\S]{0,80}saveNoteClefRank\(\)/);
assert.doesNotMatch(submitBody, /saveAbrsmRank\('notes'\)/);
assert.doesNotMatch(submitBody, /abrsm-theory-v1:notes:abrsm-g/);

console.log('abrsm-note-grade: ok', g5.length, 'g5 notes', k5.length, 'g5 key cards');
