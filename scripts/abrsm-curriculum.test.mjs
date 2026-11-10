import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const source = fs.readFileSync(new URL('../abrsm-curriculum.js', import.meta.url), 'utf8');
const www = fs.readFileSync(new URL('../www/abrsm-curriculum.js', import.meta.url), 'utf8');
assert.equal(www, source);

const context = {};
vm.createContext(context);
vm.runInContext(source, context);
const C = context.AbrsmCurriculum;

assert.equal(C.uiConnected, false);
assert.equal(C.grades.map((g) => g.id).join(' '), 'abrsm-g1 abrsm-g2 abrsm-g3 abrsm-g4 abrsm-g5');
assert.ok(C.sources.some((s) => s.url.includes('music-theory-syllabus-outline-grades-1-5-from-2020.pdf')));
assert.ok(C.sources.some((s) => s.version === '1.2' && s.dated === 'April 2023'));

for (const year of C.schoolYears) {
  assert.equal(C.isSchoolYear(year.id), true);
  assert.equal(C.isSchoolYear(year.label), true);
  assert.equal(C.isAbrsmGrade(year.id), false);
  assert.equal(C.isAbrsmGrade(year.label), false);
}
assert.throws(() => C.gradeNumber('s1'));
assert.throws(() => C.gradeNumber('中三'));

function host(value) {
  return JSON.parse(JSON.stringify(value));
}

function ids(items) {
  return host(items).map((item) => item.id).sort();
}

assert.deepEqual(ids(C.keysFor('abrsm-g1')), ['C', 'D', 'F', 'G']);
assert.equal(C.keysFor('abrsm-g1').every((k) => k.mode === 'major'), true);

const g2 = C.keysFor('abrsm-g2');
assert.equal(g2.length, 10);
for (const id of ['C', 'D', 'F', 'G', 'A', 'Bb', 'Eb', 'Am', 'Em', 'Dm']) {
  assert.ok(g2.some((k) => k.id === id), id);
}
assert.equal(g2.some((k) => k.id === 'Em' && k.mode === 'major'), false);

assert.equal(C.keysFor('abrsm-g3').length, 18);
assert.equal(C.keysFor('abrsm-g4').length, 22);
assert.equal(C.keysFor('abrsm-g5').length, 26);
assert.ok(C.keysFor('abrsm-g5').some((k) => k.id === 'F#'));
assert.ok(C.keysFor('abrsm-g5').some((k) => k.id === 'Gb'));
assert.equal(C.keysFor('abrsm-g4').some((k) => k.id === 'F#'), false);
assert.equal(C.keysFor('abrsm-g3').some((k) => k.id === 'B'), false);

const expectSig = {
  C: [],
  G: ['F#'],
  D: ['F#', 'C#'],
  A: ['F#', 'C#', 'G#'],
  E: ['F#', 'C#', 'G#', 'D#'],
  B: ['F#', 'C#', 'G#', 'D#', 'A#'],
  'F#': ['F#', 'C#', 'G#', 'D#', 'A#', 'E#'],
  F: ['Bb'],
  Bb: ['Bb', 'Eb'],
  Eb: ['Bb', 'Eb', 'Ab'],
  Ab: ['Bb', 'Eb', 'Ab', 'Db'],
  Db: ['Bb', 'Eb', 'Ab', 'Db', 'Gb'],
  Gb: ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']
};
for (const [id, sig] of Object.entries(expectSig)) {
  const key = C.keyById(id);
  assert.deepEqual(host(key.signature), sig, id);
  assert.equal(key.accidentalCount, sig.length, id);
  assert.deepEqual(key.majorScale[0], id.split('').length ? key.tonic : key.tonic);
}

assert.deepEqual(host(C.keyById('F#').majorScale), ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
assert.deepEqual(host(C.keyById('Gb').majorScale), ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']);
assert.deepEqual(host(C.keyById('Am').signature), []);
assert.equal(C.keyById('Am').relativeMajor, 'C');
assert.deepEqual(host(C.keyById('C#m').signature), ['F#', 'C#', 'G#', 'D#']);
assert.deepEqual(host(C.keyById('C#m').harmonicMinor), ['C#', 'D#', 'E', 'F#', 'G#', 'A', 'B#']);
assert.deepEqual(host(C.keyById('D#m').harmonicMinor), ['D#', 'E#', 'F#', 'G#', 'A#', 'B', 'C##']);
assert.deepEqual(host(C.keyById('Ebm').harmonicMinor), ['Eb', 'F', 'Gb', 'Ab', 'Bb', 'Cb', 'D']);
assert.deepEqual(host(C.keyById('D#m').signature), host(C.keyById('F#').signature));
assert.deepEqual(host(C.scaleSpelling('A', 'melodic-minor-ascending')), ['A', 'B', 'C', 'D', 'E', 'F#', 'G#']);
assert.deepEqual(host(C.scaleSpelling('A', 'natural-minor')), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);

for (let n = 1; n < 5; n++) {
  const low = C.keysFor('abrsm-g' + n).map((k) => k.id);
  const high = C.keysFor('abrsm-g' + (n + 1)).map((k) => k.id);
  for (const id of low) assert.ok(high.includes(id), id + ' missing at g' + (n + 1));
  assert.ok(high.length > low.length);
}

assert.deepEqual(ids(C.clefsFor('abrsm-g3')), ['bass', 'treble']);
assert.deepEqual(ids(C.clefsFor('abrsm-g4')), ['alto', 'bass', 'treble']);
assert.deepEqual(ids(C.clefsFor('abrsm-g5')), ['alto', 'bass', 'tenor', 'treble']);

assert.deepEqual(
  host(C.metersFor('abrsm-g1').map((m) => m.id)),
  ['2/4', '3/4', '4/4', 'common-time']
);
assert.equal(C.metersFor('abrsm-g2').some((m) => m.id === '6/8'), false);
assert.equal(C.metersFor('abrsm-g3').some((m) => m.id === '6/8'), true);
assert.equal(C.metersFor('abrsm-g4').some((m) => m.id === '5/8'), false);
assert.equal(C.metersFor('abrsm-g5').some((m) => m.id === '7/8'), true);
assert.equal(C.meters.find((m) => m.id === '5/8').groupingFixed, false);
assert.equal(C.noteValues.find((n) => n.id === 'demisemiquaver').introduced, 3);
assert.equal(C.noteValues.find((n) => n.id === 'quintuplet').introduced, 5);
assert.equal(C.intervals.find((n) => n.id === 'chromatic-and-compound').introduced, 5);

const g3terms = C.termsFor('abrsm-g3');
assert.equal(g3terms.some((t) => t.language === 'fr'), false);
assert.equal(g3terms.some((t) => t.language === 'de'), false);
assert.equal(C.termsFor('abrsm-g4').some((t) => t.name === 'animé'), true);
assert.equal(C.termsFor('abrsm-g4').some((t) => t.language === 'de'), false);
assert.equal(C.termsFor('abrsm-g5').some((t) => t.name === 'langsam'), true);
assert.equal(C.terms.find((t) => t.id === 'ritardando').introduced, 1);
assert.equal(C.terms.find((t) => t.id === 'ritenuto').introduced, 2);
assert.equal(C.ungradedSigns.every((s) => s.gradeVerified === false && s.introduced === null), true);

assert.equal(C.triads.find((t) => t.id === 'primary-root-position').inversion, 'root');
assert.equal(C.chordFutureMode.implemented, false);
assert.equal(C.chordFutureMode.slashChords, false);
assert.equal(C.chordFutureMode.conflictsWith, 'chord-phase1-root-position');
assert.ok(C.chordFutureMode.inversions.includes('first'));

for (const item of C.supplemental) {
  assert.equal(item.abrsm, false);
  assert.equal(item.badge, null);
  assert.equal(item.introduced, undefined);
}
assert.equal(C.instruments.some((i) => i.id === 'erhu'), false);
assert.equal(C.instruments.find((i) => i.id === 'violin').introduced, 4);
assert.equal(C.instruments.find((i) => i.id === 'piano').introduced, 5);
assert.equal(C.voices.every((v) => v.introduced === 5), true);

for (const legacy of C.legacyRankDifficulties) {
  assert.equal(C.isAbrsmGrade(legacy), false);
}
const stored = C.rankRecord({ gameKey: 'game1', syllabusId: 'abrsm-g5', score: 80, schoolYear: 's3' });
assert.equal(stored.storageKey, 'abrsm-theory-v1:game1:abrsm-g5');
assert.equal(stored.storageKey.startsWith(C.legacyRankKeyPrefix), false);
assert.equal(stored.legacyBoard, false);
assert.equal(stored.schoolYear, 's3');
assert.equal(C.legacyBoardVisible(stored), false);
assert.equal(C.legacyBoardVisible({
  difficulty: 'Hard',
  grade: 2,
  storageKey: 'musicGameRanks_game1',
  score: 100
}), true);
assert.equal(C.legacyBoardVisible({ difficulty: 'abrsm-g1', score: 10 }), false);
assert.throws(() => C.rankRecord({ gameKey: 'game1', syllabusId: 's1', score: 1 }));
assert.throws(() => C.rankStorageKey('game2', 'easy'));

console.log('abrsm-curriculum: ok', C.keys.length, 'keys', C.terms.length, 'terms');
