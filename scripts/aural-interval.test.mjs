import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
for (const file of ['profile-store.js', 'rank-sync.js', 'aural-score.js', 'aural-audio.js', 'aural-interval.js']) {
  vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
}
const Score = context.AuralScore;
const Audio = context.AuralAudio;
const Interval = context.AuralInterval;

assert.equal(Interval.INTERVALS.map((item) => item.semitones).join(','), '1,2,3,4,5,7,8,9,10,11,12');
assert.equal(Interval.INTERVALS.some((item) => item.semitones === 6), false);
assert.equal(Interval.poolForLevel(1).every((item) => item.quality !== 'minor'), true);
assert.equal(Interval.poolForLevel(1).map((item) => item.size).join(','), '2,3,4,5,6,7,8');
assert.equal(Interval.poolForLevel(2).some((item) => item.size === 6), false);
assert.equal(Interval.poolForLevel(3).length, 11);

function zero() { return 0; }
const easy = Interval.buildQuestion(1, zero, false);
assert.equal(easy.correct.indexOf('size:'), 0);
assert.equal(easy.choices.some((choice) => /[大小純]/.test(choice.label)), false);
assert.equal(easy.choices.filter((choice) => choice.id === easy.correct).length, 1);
assert.equal(new Set(easy.choices.map((choice) => choice.id)).size, easy.choices.length);
assert.equal(easy.midis[1] - easy.midis[0], easy.semitones);
assert.ok(easy.low >= 60 && easy.high <= 79);

const full = Interval.buildQuestion(3, zero, true);
assert.equal(full.harmonic, true);
assert.match(full.choices.find((choice) => choice.id === full.correct).label, /大|小|純/);
for (let i = 0; i < 40; i++) {
  const question = Interval.buildQuestion(2 + (i % 2), Math.random, i % 2 === 0);
  assert.equal(question.choices.some((choice) => choice.id === question.correct), true);
  assert.equal(question.choices.length, 4);
  assert.equal(question.midis[1] - question.midis[0] === 6, false);
}

const practice = Interval.createRun('practice');
assert.equal(Interval.scoreAnswer(practice, true), 0);
assert.equal(Interval.scoreAnswer(practice, false), 0);
assert.equal(practice.score, 0);
assert.equal(Interval.resultDetail(practice), null);

const challenge = Interval.createRun('challenge');
assert.equal(Interval.scoreAnswer(challenge, true), 11);
assert.equal(Interval.scoreAnswer(challenge, true), 12);
assert.equal(challenge.score, 23);
assert.equal(Interval.scoreAnswer(challenge, false), 0);
assert.equal(challenge.combo, 0);
assert.equal(challenge.score, 23);
const detail = Interval.resultDetail(challenge);
assert.equal(detail.mode, 'challenge');
assert.equal(detail.gameKey, 'aural-interval');
assert.equal(detail.score, 23);
assert.equal(Interval.resultDetail(Interval.createRun('challenge')), null);

const melodic = Audio.schedulePlan([60, 64], false, 1);
const harmonic = Audio.schedulePlan([60, 64], true, 1);
assert.equal(melodic[0].at, 1);
assert.ok(melodic[1].at > melodic[0].at);
assert.equal(harmonic[0].at, harmonic[1].at);
assert.equal(harmonic[0].midi, 60);
assert.equal(harmonic[1].midi, 64);

const memory = {
  data: {},
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null; },
  setItem(key, value) { this.data[key] = String(value); }
};
const row = { name: '陳小樂', class: 'A', id: '3', grade: '1', score: 40, accuracy: 80, max_combo: 2 };
assert.equal(Score.canSavePlayer({ name: '訪客', grade: 1, class: 'A' }), false);
assert.equal(Score.canSavePlayer(row), true);
Score.commitBoard(memory, 'aural-interval', row);
Score.commitBoard(memory, 'aural-interval', Object.assign({}, row, { score: 15 }));
let board = Score.readBoard(memory, 'aural-interval');
assert.equal(board.length, 1);
assert.equal(board[0].score, 40);
Score.commitBoard(memory, 'aural-interval', Object.assign({}, row, { score: 70, accuracy: 100 }));
board = Score.readBoard(memory, 'aural-interval');
assert.equal(board.length, 1);
assert.equal(board[0].score, 70);
assert.equal(board[0].accuracy, 100);

const lowered = Score.applyListeningBests({ listening: 80, 'aural-interval': 80 }, 'aural-interval', 10);
assert.equal(lowered['aural-interval'], 80);
assert.equal(lowered.listening, 80);
const raised = Score.applyListeningBests(lowered, 'aural-interval', 90);
assert.equal(raised['aural-interval'], 90);
assert.equal(raised.listening, 90);
const other = Score.applyListeningBests(raised, 'aural-rhythm', 30);
assert.equal(other['aural-rhythm'], 30);
assert.equal(other.listening, 90);
assert.equal(other['aural-interval'], 90);

for (const file of ['index.html', 'www/index.html', 'script.js', 'www/script.js']) {
  const src = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(src, /aural-interval/);
  assert.match(src, /listening/);
}
const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(page, /id="screen-aural"/);
assert.match(page, /id="auralIntervalReplay"/);
assert.match(page, /data-game-key="listening"/);
assert.match(page, /練習模式/);
assert.match(page, /1 分鐘挑戰/);
const logic = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
assert.match(logic, /detail\.mode !== 'challenge'/);
assert.match(logic, /applyListeningBests/);
assert.match(logic, /keepHigherScore|AuralScore/);
assert.equal(fs.readFileSync(new URL('../aural-interval.js', import.meta.url), 'utf8'), fs.readFileSync(new URL('../www/aural-interval.js', import.meta.url), 'utf8'));

console.log('aural-interval tests passed');
