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
assert.equal(practiceAlto.some((n) => n.yFactor === -2 && G.ledgerDepth(n.yFactor) === 2), true);
assert.equal(practiceAlto.some((n) => n.yFactor === 6 && G.ledgerDepth(n.yFactor) === 2), true);
assert.equal(practiceAlto.some((n) => n.yFactor < -2 || n.yFactor > 6 || n.yFactor === -2.5 || n.yFactor === 6.5), false);
assert.equal(practiceAlto.some((n) => n.accidental === '#'), true);
assert.equal(practiceAlto.some((n) => n.accidental === 'b'), true);
assert.equal(practiceAlto.some((n) => n.accidental === '##' || n.accidental === 'bb'), false);
const practiceTenor = host(G.practicePool(['tenor']));
assert.ok(practiceTenor.some((n) => n.letter === 'C' && n.octave === 4 && n.yFactor === 1 && !n.accidental));
assert.deepEqual(clefs(host(G.practicePool(['treble', 'bass', 'alto', 'tenor']))), ['alto', 'bass', 'tenor', 'treble']);
for (const clef of ['treble', 'bass', 'alto', 'tenor']) {
  const notes = host(G.practicePool([clef]));
  const ys = [...new Set(notes.map((n) => n.yFactor))].sort((a, b) => a - b);
  assert.equal(ys[0], -2, clef);
  assert.equal(ys[ys.length - 1], 6, clef);
  assert.equal(ys.includes(-2.5), false, clef);
  assert.equal(ys.includes(6.5), false, clef);
  const above = G.positionAt(clef, -2);
  const below = G.positionAt(clef, 6);
  assert.ok(notes.some((n) => !n.accidental && n.yFactor === -2 && n.letter === above.letter && n.octave === above.octave), clef);
  assert.ok(notes.some((n) => !n.accidental && n.yFactor === 6 && n.letter === below.letter && n.octave === below.octave), clef);
  assert.equal(notes.every((n) => n.yFactor >= -2 && n.yFactor <= 6), true, clef);
}
const mixedPractice = host(G.practicePool(['treble', 'bass', 'alto', 'tenor']));
assert.equal(mixedPractice.every((n) => n.yFactor >= -2 && n.yFactor <= 6), true);
assert.deepEqual(clefs(mixedPractice), ['alto', 'bass', 'tenor', 'treble']);

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
  const rankSelect = page.slice(page.indexOf('id="rankModeFilter"'), page.indexOf('id="rankNoteClefWrap"'));
  assert.match(rankSelect, /value="notes-clef" selected>音名譜號/);
  assert.doesNotMatch(rankSelect, /abrsm-notes|abrsm-keys|英皇音名|英皇調號/);
  assert.match(rankSelect, /value="noMiss">零失誤挑戰/);
  assert.match(rankSelect, /value="keysig60">調號挑戰/);
  assert.match(rankSelect, /value="solfege60">唱名挑戰/);
  // Clef challenges fold into 音名譜號. They are not separate dropdown modes.
  assert.doesNotMatch(rankSelect, /value="classic60"|value="bass60"|value="mixed60"/);
}

const gameSrc = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const submitAt = gameSrc.indexOf('async function submitScore()');
const legacyAt = gameSrc.indexOf("saveLocalRank('game1'", submitAt);
assert.ok(submitAt > 0 && legacyAt > submitAt);
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
const playRender = gameSrc.slice(gameSrc.indexOf('function renderAbrsmNote'), gameSrc.indexOf('function renderAbrsmKey'));
assert.match(playRender, /duration: 'w'/);
assert.match(playRender, /alignCenter: true/);
assert.match(playRender, /setCenterAlignment/);
assert.match(playRender, /numBeats: 4/);
assert.doesNotMatch(playRender, /duration: 'q'/);
assert.match(playRender, /const above = 108/);
assert.match(playRender, /const below = 120/);
const wwwPlay = wwwGame.slice(wwwGame.indexOf('function renderAbrsmNote'), wwwGame.indexOf('function renderAbrsmKey'));
assert.match(wwwPlay, /duration: 'w'/);
assert.doesNotMatch(wwwPlay, /duration: 'q'/);
assert.match(fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8'), /#screen-game \.message-box \{[\s\S]*height: 5\.5rem/);
assert.match(fs.readFileSync(new URL('../note-name-teach.js', import.meta.url), 'utf8'), /duration: 'w'/);
assert.doesNotMatch(wwwGame, /notePoolForClefs\(state\.abrsmGrade/);
const submitBody = gameSrc.slice(submitAt, legacyAt);
assert.match(submitBody, /state\.currentMode === 'noMiss'[\s\S]{0,80}saveNoMissRank\(\)/);
assert.match(submitBody, /state\.currentMode === 'classic60'[\s\S]{0,80}saveNoteClefRank\(\)/);
assert.doesNotMatch(submitBody, /saveAbrsmRank\(/);
assert.doesNotMatch(submitBody, /abrsm-theory-v1:notes:abrsm-g/);
assert.match(gameSrc, /function publishSharedRank/);
assert.match(gameSrc, /function mergeSharedRankRows/);
assert.match(gameSrc, /RankSync\.publishBody/);
assert.match(gameSrc, /RankSync\.commitLocalRank/);
assert.match(gameSrc, /loadRanks\(2, \{ force: true \}\)/);
assert.doesNotMatch(gameSrc, /game: 'abrsm-theory-v1'/);
assert.match(gameSrc, /if \(usesLocalRankBoard\(\)\)/);
assert.match(gameSrc, /共用排行榜暫時連不上/);
assert.match(gameSrc, /function paintStudentRankHint/);
assert.match(gameSrc, /function openGame1RankBoard/);
assert.match(gameSrc, /openGame1RankBoard\('noMiss', 'treble'\)/);
assert.match(gameSrc, /currentMode === 'classic60' \|\| state\.currentMode === 'noMiss'/);
assert.match(gameSrc, /showNoMissBoard/);
assert.doesNotMatch(gameSrc.slice(gameSrc.indexOf('function renderNoteClefRanks'), gameSrc.indexOf('function renderAbrsmRanks')), /目前排第/);
assert.match(wwwGame, /function publishSharedRank/);
assert.match(wwwGame, /function openGame1RankBoard/);
assert.match(wwwGame, /openGame1RankBoard\('noMiss', 'treble'\)/);
assert.match(wwwGame, /showNoMissBoard/);

console.log('abrsm-note-grade: ok', g5.length, 'g5 notes', k5.length, 'g5 key cards');
