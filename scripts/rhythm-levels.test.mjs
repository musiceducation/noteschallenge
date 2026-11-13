import assert from 'node:assert/strict';
import fs from 'node:fs';

const RhythmLevels = new Function(fs.readFileSync(new URL('../rhythm-levels.js', import.meta.url), 'utf8') + '\nreturn RhythmLevels;')();
const RankSync = new Function(fs.readFileSync(new URL('../rank-sync.js', import.meta.url), 'utf8') + '\nreturn RankSync;')();

function rng(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const forbidden = {
  easy: ['ti-ti', 'ti', 'ri', 'ti-ri-ti-ri', 'ti-ti-ri', 'ti-ri-ti', 'ri-ti-ri'],
  medium: ['ri', 'ti-ri-ti-ri', 'ti-ti-ri', 'ti-ri-ti', 'ri-ti-ri']
};

for (const level of RhythmLevels.LEVELS) {
  for (const meter of ['2/4', '3/4', '4/4']) {
    const random = rng(level.length * 100 + meter.charCodeAt(0));
    let sawEighth = false;
    let sawSixteenth = false;
    for (let n = 0; n < 40; n++) {
      const bar = RhythmLevels.buildBar(level, meter, random);
      assert.equal(RhythmLevels.sumQuarters(bar), RhythmLevels.METERS[meter], level + ' ' + meter);
      assert.equal(RhythmLevels.groupStaysInBeat(bar), true, bar);
      const tokens = RhythmLevels.tokensIn(bar);
      if (forbidden[level]) forbidden[level].forEach((token) => assert.equal(tokens.includes(token), false, token));
      if (tokens.includes('ti-ti')) sawEighth = true;
      if (tokens.some((token) => token.indexOf('ri') >= 0)) sawSixteenth = true;
      RhythmLevels.expandBar(bar).forEach((event) => {
        if (event.quarters <= 1) {
          const beat = Math.floor(event.start + 0.001);
          assert.ok(event.start + event.quarters <= beat + 1 + 0.001, bar);
        } else {
          assert.ok(Math.abs(event.start - Math.round(event.start)) < 0.001, bar);
        }
      });
    }
    if (level !== 'easy') assert.equal(sawEighth, true, level + ' ' + meter);
    if (level === 'hard') assert.equal(sawSixteenth, true, level + ' ' + meter);
  }
}

for (const level of RhythmLevels.LEVELS) {
  const random = rng(80 + level.length);
  for (let n = 0; n < 30; n++) {
    const question = RhythmLevels.completionQuestion(level, random);
    assert.equal(question.meter, '4/4');
    assert.equal(question.unique, true);
    assert.equal(RhythmLevels.sumQuarters(question.shown) + question.blankQuarters, 4);
    assert.ok(question.blankQuarters < 4);
    assert.ok(RhythmLevels.sumQuarters(question.shown) <= 4);
    const matches = question.choices.filter((choice) => choice.quarters === question.blankQuarters);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, question.answerId);
    assert.equal(RhythmLevels.groupStaysInBeat(question.shown), true, question.shown);
  }
}

const easyChoices = RhythmLevels.choiceList('easy').map((choice) => choice.id);
assert.deepEqual(easyChoices, ['whole', 'half', 'quarter']);
assert.equal(RhythmLevels.choiceList('medium').some((choice) => choice.id === 'eighth'), true);
assert.equal(RhythmLevels.choiceList('medium').some((choice) => choice.id === 'sixteenth'), false);
assert.equal(RhythmLevels.choiceList('hard').some((choice) => choice.id === 'sixteenth'), true);

const crossed = RhythmLevels.beamGroups('ti ta ti');
assert.equal(crossed.length, 0);
const paired = RhythmLevels.beamGroups('ti-ti');
assert.equal(paired.length, 1);
assert.equal(paired[0].length, 2);

const oldKey = 'abrsm-theory-v1:rhythm-tap:abrsm-g3';
const oldRow = { name: '甲', class: 'A', id: '1', syllabusId: 'abrsm-g3', score: 30, storageKey: oldKey, rankNamespace: 'abrsm-theory-v1' };
const memory = new Map();
const storage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); }
};
storage.setItem(oldKey, JSON.stringify([oldRow]));
RhythmLevels.saveBest(storage, { mode: 'tap', level: 'easy', name: '甲', class: 'A', id: '1', grade: '2', score: 12, accuracy: 80, maxCombo: 3 });
RhythmLevels.saveBest(storage, { mode: 'complete', level: 'hard', name: '乙', class: 'B', id: '4', grade: '5', score: 40, accuracy: 100, maxCombo: 8 });
assert.deepEqual(JSON.parse(storage.getItem(oldKey)), [oldRow]);
assert.equal(RankSync.parseSharedRankKey(RhythmLevels.storageKey('tap', 'easy')), null);
assert.equal(RankSync.parseSharedRankKey(RhythmLevels.storageKey('complete', 'hard')), null);
assert.equal(RankSync.parseSharedRankKey(oldKey).syllabusId, 'abrsm-g3');
const easyRows = JSON.parse(storage.getItem(RhythmLevels.storageKey('tap', 'easy')));
assert.equal(easyRows.length, 1);
assert.equal(easyRows[0].score, 12);
assert.equal(easyRows[0].syllabusId, undefined);
assert.equal(easyRows[0].rankNamespace, 'rhythm-level-v1');
RhythmLevels.saveBest(storage, { mode: 'tap', level: 'easy', name: '甲', class: 'A', id: '1', grade: '2', score: 8, accuracy: 10, maxCombo: 1 });
assert.equal(JSON.parse(storage.getItem(RhythmLevels.storageKey('tap', 'easy')))[0].score, 12);
assert.deepEqual(JSON.parse(storage.getItem(oldKey)), [oldRow]);

const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(page, /id="g2ModeComplete"/);
assert.match(page, /data-level="easy"/);
assert.match(page, /data-level="medium"/);
assert.match(page, /data-level="hard"/);
assert.match(page, /value="rhythm-tap-legacy"/);
assert.match(fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8'), /id="g2ModeComplete"/);
assert.equal(fs.readFileSync(new URL('../rhythm-levels.js', import.meta.url), 'utf8'), fs.readFileSync(new URL('../www/rhythm-levels.js', import.meta.url), 'utf8'));
const game = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const www = fs.readFileSync(new URL('../www/script.js', import.meta.url), 'utf8');
assert.match(game, /RhythmLevels\.buildBar/);
assert.match(game, /RhythmLevels\.saveBest/);
assert.match(game, /launchCompleteMeasure/);
assert.match(www, /RhythmLevels\.buildBar/);
assert.match(www, /launchCompleteMeasure/);
assert.match(game, /g2SelectedMode === 'tap' \|\| g2SelectedMode === 'complete'/);

console.log('rhythm-levels: ok');
