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

const tap = A.tapGrades();
const tapIds = ['abrsm-g1', 'abrsm-g2', 'abrsm-g3', 'abrsm-g4', 'abrsm-g5'];
assert.deepEqual(Object.keys(tap), tapIds);
const tokenNames = (id) => host(tap[id].tokens.map((token) => token.n));
assert.deepEqual(tokenNames('abrsm-g1'), ['ta', 'ta-a', 'ta-a-a-a', 'ti', 'ti-ti', '休', '休二', '休全', '休八']);
assert.equal(tokenNames('abrsm-g1').some((name) => name === 'ri' || name === '3ti' || name === 'ta-i' || name === 'ta~ta'), false);
assert.ok(tokenNames('abrsm-g2').includes('ri'));
assert.ok(tokenNames('abrsm-g2').includes('3ti'));
assert.ok(tokenNames('abrsm-g2').includes('ta~ta'));
assert.ok(tokenNames('abrsm-g2').includes('ta-i'));
assert.equal(tokenNames('abrsm-g2').includes('si4'), false);
assert.ok(tokenNames('abrsm-g3').includes('si4'));
assert.equal(tokenNames('abrsm-g3').includes('2ta'), false);
assert.ok(tokenNames('abrsm-g4').includes('2ta'));
assert.ok(tokenNames('abrsm-g4').includes('雙附點'));
assert.equal(tap['abrsm-g1'].syncopation, false);
assert.equal(tap['abrsm-g5'].syncopation, true);
assert.equal(tap['1'], undefined);
assert.equal(tap['中一'], undefined);
assert.deepEqual(host(tap['abrsm-g1'].meters), ['2/4', '3/4', '4/4']);
assert.ok(host(tap['abrsm-g2'].meters).includes('3/8'));
assert.ok(host(tap['abrsm-g2'].meters).includes('2/2'));
assert.equal(host(tap['abrsm-g2'].meters).includes('6/8'), false);
assert.ok(host(tap['abrsm-g3'].meters).includes('6/8'));
assert.ok(host(tap['abrsm-g3'].meters).includes('3/2'));
assert.equal(host(tap['abrsm-g3'].meters).includes('2/8'), false);
assert.ok(host(tap['abrsm-g4'].meters).includes('2/8'));
assert.ok(host(tap['abrsm-g4'].meters).includes('12/4'));
assert.equal(host(tap['abrsm-g4'].meters).length, 18);
assert.equal(host(tap['abrsm-g4'].meters).includes('5/4'), false);
assert.ok(host(tap['abrsm-g5'].meters).includes('5/4'));
assert.ok(host(tap['abrsm-g5'].meters).includes('7/4'));
assert.ok(host(tap['abrsm-g5'].meters).includes('5/8'));
assert.ok(host(tap['abrsm-g5'].meters).includes('7/8'));
const bpm = { 'abrsm-g1': 72, 'abrsm-g2': 76, 'abrsm-g3': 80, 'abrsm-g4': 84, 'abrsm-g5': 88 };
const win = { 'abrsm-g1': 1.45, 'abrsm-g2': 1.3, 'abrsm-g3': 1.15, 'abrsm-g4': 1.05, 'abrsm-g5': 0.95 };
for (const id of tapIds) {
  assert.equal(tap[id].bpm, bpm[id]);
  assert.equal(tap[id].winScale, win[id]);
  assert.equal(tap[id].rankKey, 'abrsm-theory-v1:rhythm-tap:' + id);
  assert.equal(tap[id].rankKey.includes(':rhythm:abrsm'), false);
  for (const meter of tap[id].meters) {
    const spec = A.tapMeter(meter);
    assert.ok(spec, meter);
    assert.equal(spec.beats >= 2 && spec.beats <= 7, true);
    assert.ok(spec.quarters > 0);
  }
}

const script = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const wwwScript = fs.readFileSync(new URL('../www/script.js', import.meta.url), 'utf8');
for (const src of [script, wwwScript]) {
  assert.match(src, /g2SelectedMode === 'tap'/);
  assert.match(src, /g2SelectedMode === 'compose'/);
  assert.match(src, /openRhythmComposer\(\)/);
  assert.match(src, /window\.location\.href = 'rhythm\/'/);
  assert.match(src, /params\.get\('g2'\) !== 'setup'/);
  assert.doesNotMatch(src, /enterRhythmComposer/);
  assert.match(src, /startRhythmChallenge\(user\)/);
  assert.match(src, /saveSyllabusRank\('rhythm-tap'/);
  assert.doesNotMatch(src, /節奏挑戰·Lv\./);
  assert.doesNotMatch(src, /GRADE_CHALLENGE_CONFIG/);
  assert.doesNotMatch(src, /RCHAL_LEVELS/);
  assert.doesNotMatch(src, /saveLocalRank\('rchal'/);
  const startAt = src.indexOf("getElementById('g2StartBtn')");
  const start = src.slice(startAt, startAt + 700);
  assert.doesNotMatch(start, /_omLaunch|_durLaunch/);
  assert.match(src, /function _omLaunch/);
  assert.match(src, /function _durLaunch/);
}
const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const wwwPage = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
for (const html of [page, wwwPage]) {
  assert.match(html, /id="g2ModeTap"/);
  assert.match(html, /id="g2ModeCompose"/);
  assert.match(html, /節奏創作/);
  assert.match(html, /排 1–8 小節 · 試聽 · 打拍/);
  assert.doesNotMatch(html, /id="enterRhythmComposer"|data-launch="enterRhythmComposer"/);
  assert.match(html, /根據譜上音符時值打節奏/);
  assert.match(html, /id="rankRhythmKind"/);
  assert.match(html, /value="rhythm-tap"/);
  assert.match(html, /abrsm-rhythm-terms\.js\?v=3/);
  assert.match(html, /課堂柯達伊/);
  assert.match(html, /拍號練習/);
  assert.match(html, /拍號計時/);
  assert.match(html, /時值辨別/);
}

function grab(src, startMark, endMark) {
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, startMark);
  return src.slice(start, end);
}
const engine = new Function(
  grab(script, 'const _BEAM_TOKENS', 'function _generateChallengeRhythm') +
  grab(script, 'function _generateChallengeRhythm', 'const RC_CHALLENGE_COUNT') +
  grab(script, 'function getRhythmTokenDuration', 'function formatBeatValue') +
  '\nreturn { generate: _generateChallengeRhythm, duration: getRhythmTokenDuration };'
)();
let g1Bars = 0;
let g1WithNotes = 0;
for (const id of tapIds) {
  const names = new Set(tokenNames(id));
  for (const meterId of tap[id].meters) {
    const quarters = A.tapMeter(meterId).quarters;
    for (let n = 0; n < 12; n++) {
      const label = engine.generate(tap[id].tokens, quarters, tap[id].syncopation);
      if (id === 'abrsm-g1') {
        g1Bars++;
        if (label.split(' ').some((token) => token && token.indexOf('休') !== 0)) g1WithNotes++;
      }
      let pos = 0;
      for (const token of label.split(' ').filter(Boolean)) {
        assert.equal(names.has(token), true, id + ' ' + meterId + ' ' + token);
        const onCrotchet = Math.abs(pos - Math.round(pos)) < 0.01;
        if (!tap[id].syncopation && !onCrotchet) {
          assert.ok(token === 'ti' || token === '休八' || token === 'ri', token + ' @ ' + pos);
        }
        pos = Math.round((pos + engine.duration(token)) * 1000) / 1000;
      }
      assert.ok(Math.abs(pos - quarters) < 0.02, id + ' ' + meterId + ' filled ' + pos + ' / ' + quarters + ' [' + label + ']');
    }
  }
}
assert.ok(g1WithNotes > g1Bars * 0.7, g1WithNotes + '/' + g1Bars);

const legacy = { difficulty: 'Easy', mode: '節奏挑戰', score: 10 };
assert.equal(context.AbrsmCurriculum.legacyBoardVisible(legacy), true);
const row = context.AbrsmCurriculum.rankRecord({ gameKey: 'rhythm', syllabusId: 'abrsm-g3', score: 4, schoolYear: '中三' });
assert.equal(context.AbrsmCurriculum.legacyBoardVisible(row), false);
assert.equal(row.storageKey, 'abrsm-theory-v1:rhythm:abrsm-g3');
const tapRow = context.AbrsmCurriculum.rankRecord({ gameKey: 'rhythm-tap', syllabusId: 'abrsm-g1', score: 8, schoolYear: '中一' });
assert.equal(tapRow.storageKey, 'abrsm-theory-v1:rhythm-tap:abrsm-g1');
assert.equal(context.AbrsmCurriculum.legacyBoardVisible(tapRow), false);

console.log('abrsm-rhythm-terms: ok', A.meterQuestions('abrsm-g5').length, 'g5 meter questions');
