import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../abrsm-curriculum.js', import.meta.url), 'utf8'), context);
vm.runInContext(fs.readFileSync(new URL('../abrsm-rhythm-terms.js', import.meta.url), 'utf8'), context);
const A = context.AbrsmRhythmTerms;
const host = (value) => JSON.parse(JSON.stringify(value));

assert.equal(fs.readFileSync(new URL('../abrsm-rhythm-terms.js', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../www/abrsm-rhythm-terms.js', import.meta.url), 'utf8'));

function meterIds(id) { return host(A.meters(id).map((meter) => meter.id)).sort(); }
assert.deepEqual(meterIds('abrsm-g1'), ['2/4', '3/4', '4/4', 'common-time']);
assert.ok(meterIds('abrsm-g2').includes('3/8'));
assert.ok(meterIds('abrsm-g2').includes('2/2'));
assert.equal(meterIds('abrsm-g2').includes('6/8'), false);
assert.ok(meterIds('abrsm-g3').includes('6/8'));
assert.ok(meterIds('abrsm-g3').includes('12/8'));
assert.equal(meterIds('abrsm-g3').includes('2/8'), false);
assert.ok(meterIds('abrsm-g4').includes('2/8'));
assert.ok(meterIds('abrsm-g4').includes('12/4'));
assert.equal(meterIds('abrsm-g4').includes('5/4'), false);
assert.equal(meterIds('abrsm-g4').includes('7/8'), false);
assert.ok(meterIds('abrsm-g5').includes('5/4'));
assert.ok(meterIds('abrsm-g5').includes('7/8'));

const g5group = A.meterQuestions('abrsm-g5').find((item) => item.id === '5/4-group');
assert.equal(g5group.answer.startsWith('不是'), true);
const g1beat = A.meterQuestions('abrsm-g1').find((item) => item.id === '6/8-beat');
assert.equal(g1beat, undefined);
const common = A.meterQuestions('abrsm-g1').find((item) => item.id === 'common-time-same');
assert.equal(common.answer, '4/4');

const g1rests = A.values('abrsm-g1').filter((item) => item.kind === 'rest').map((item) => item.id).sort();
assert.deepEqual(host(g1rests), ['crotchet-rest', 'minim-rest', 'quaver-rest', 'semibreve-rest']);
assert.equal(A.values('abrsm-g1').some((item) => item.id === 'triplet'), false);
assert.ok(A.values('abrsm-g2').some((item) => item.id === 'triplet'));
assert.ok(A.values('abrsm-g2').some((item) => item.id === 'crotchet-rest'));
assert.equal(A.values('abrsm-g2').some((item) => item.id === 'demisemiquaver'), false);
assert.ok(A.values('abrsm-g3').some((item) => item.id === 'demisemiquaver'));
assert.ok(A.values('abrsm-g4').some((item) => item.id === 'duplet'));
assert.equal(A.values('abrsm-g4').some((item) => item.id === 'quintuplet'), false);
assert.ok(A.values('abrsm-g5').some((item) => item.id === 'quintuplet'));

const g1terms = A.glossedTerms('abrsm-g1');
assert.equal(g1terms.some((term) => term.language !== 'it'), false);
assert.equal(g1terms.some((term) => term.name === 'allegro' && term.meaning === '快板'), true);
assert.equal(A.glossedTerms('abrsm-g3').some((term) => term.language === 'fr'), false);
assert.ok(A.glossedTerms('abrsm-g4').some((term) => term.name === 'animé'));
assert.equal(A.glossedTerms('abrsm-g4').some((term) => term.language === 'de'), false);
assert.ok(A.glossedTerms('abrsm-g5').some((term) => term.name === 'langsam'));
assert.equal(A.termQuestions('abrsm-g3').some((item) => item.language === 'ornament'), false);
assert.ok(A.termQuestions('abrsm-g4').some((item) => item.id === 'ornament-trill'));
assert.equal(A.termQuestions('abrsm-g4').some((item) => item.id === 'ornament-written-out'), false);
assert.ok(A.termQuestions('abrsm-g5').some((item) => item.id === 'ornament-written-out' && item.ans === '不用'));

const expected = ['單二拍', '單三拍', '單四拍', '複二拍'];
const firstSlots = [];
for (let trial = 0; trial < 24; trial++) {
  const opts = host(A.pick(expected, '單四拍', 4));
  assert.deepEqual(opts.slice().sort(), expected.slice().sort());
  assert.equal(new Set(opts).size, opts.length);
  firstSlots.push(opts[0]);
}
assert.equal(firstSlots.every((slot) => slot === '單四拍'), false);

const questionFirst = [];
for (let trial = 0; trial < 24; trial++) {
  const question = A.meterQuestions('abrsm-g1').find((item) => item.id === '2/4-family');
  const options = host(question.options);
  assert.ok(options.includes(question.answer));
  assert.equal(new Set(options).size, options.length);
  questionFirst.push(options[0]);
}
assert.equal(questionFirst.every((slot) => slot === '單二拍'), false);

assert.equal(A.coverage().restsFrom, 'abrsm-g1');
assert.equal(A.coverage().rhythmComposerThroughG5, false);
assert.deepEqual(host(A.coverage().rhythmComposerMeters), ['2/4', '3/4', '4/4']);
assert.equal(A.coverage().examReady, false);
assert.equal(A.coverage().transposition, false);
assert.match(A.coverageText('abrsm-g5'), /5\/4/);
assert.match(A.coverageText('abrsm-g1'), /柯達伊/);

const legacy = { difficulty: 'Easy', mode: '節奏挑戰', score: 10 };
assert.equal(context.AbrsmCurriculum.legacyBoardVisible(legacy), true);
const row = context.AbrsmCurriculum.rankRecord({ gameKey: 'rhythm', syllabusId: 'abrsm-g3', score: 4, schoolYear: '中三' });
assert.equal(context.AbrsmCurriculum.legacyBoardVisible(row), false);
assert.equal(row.storageKey, 'abrsm-theory-v1:rhythm:abrsm-g3');

console.log('abrsm-rhythm-terms: ok', A.meterQuestions('abrsm-g5').length, 'g5 meter questions');
