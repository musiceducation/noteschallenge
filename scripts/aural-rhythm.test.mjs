import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
for (const file of ['profile-store.js', 'rank-sync.js', 'aural-score.js', 'aural-audio.js', 'aural-rhythm.js']) {
  vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
}
const Rhythm = context.AuralRhythm;
const Score = context.AuralScore;

Rhythm.BARS.forEach((item) => {
  assert.ok(Math.abs(item.bar.beats - 4) < 0.001, item.id);
});
assert.equal(Rhythm.poolForLevel(1).every((item) => item.bar.cells.every((cell) => !cell.rest && cell.beats <= 1)), true);
assert.equal(Rhythm.poolForLevel(2).some((item) => item.bar.cells.some((cell) => cell.rest)), true);
assert.equal(Rhythm.poolForLevel(3).some((item) => item.id === 'dqeqq'), true);
assert.equal(Rhythm.syllable(Rhythm.BARS[0].bar.cells), 'ta ta ta ta');
assert.equal(Rhythm.syllable(Rhythm.BARS[1].bar.cells), 'ta ta ti-ti ta');

const plan = Rhythm.rhythmPlan(Rhythm.BARS[0].bar, Rhythm.BEAT);
assert.equal(plan.filter((event) => event.countIn).length, 4);
assert.equal(plan[0].strong, true);
assert.equal(plan[0].at, 0);
assert.equal(plan[3].at, 1.5);
assert.ok(plan[4].at > plan[3].at);
assert.equal(plan.filter((event) => event.rhythm).length, 4);

const rest = Rhythm.rhythmPlan(Rhythm.BARS.find((item) => item.id === 'rqqq').bar, 0.5);
assert.equal(rest.filter((event) => event.rhythm).length, 3);
assert.ok(rest.find((event) => event.rhythm).at > 2.2);

function zero() { return 0; }
const question = Rhythm.buildQuestion(1, zero);
assert.equal(question.choices.filter((choice) => choice.id === question.id).length, 1);
assert.equal(question.choices.length, 4);
assert.match(Rhythm.notationSvg(question.cells), /<svg/);
assert.equal(question.choices.some((choice) => choice.cells.some((cell) => cell.rest)), false);

const practice = Rhythm.createRun('practice');
Rhythm.scoreAnswer(practice, true);
assert.equal(practice.score, 0);
assert.equal(Rhythm.resultDetail(practice), null);
const challenge = Rhythm.createRun('challenge');
assert.equal(Rhythm.scoreAnswer(challenge, true), 11);
assert.equal(Rhythm.resultDetail(challenge).gameKey, 'aural-rhythm');

const memory = {
  data: {},
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null; },
  setItem(key, value) { this.data[key] = String(value); }
};
const row = { name: '陳小樂', class: 'A', id: '3', score: 30 };
Score.commitBoard(memory, 'aural-rhythm', row);
Score.commitBoard(memory, 'aural-rhythm', Object.assign({}, row, { score: 10 }));
assert.equal(Score.readBoard(memory, 'aural-rhythm')[0].score, 30);
const bests = Score.applyListeningBests({ listening: 40, 'aural-interval': 40 }, 'aural-rhythm', 55);
assert.equal(bests['aural-interval'], 40);
assert.equal(bests['aural-rhythm'], 55);
assert.equal(bests.listening, 55);
const kept = Score.applyListeningBests(bests, 'aural-rhythm', 12);
assert.equal(kept.listening, 55);
assert.equal(kept['aural-rhythm'], 55);

for (const file of ['index.html', 'www/index.html']) {
  const page = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(page, /id="auralOpenRhythm"/);
  assert.match(page, /id="auralRhythmReplay"/);
  assert.match(page, /節奏聽寫/);
}
assert.equal(
  fs.readFileSync(new URL('../aural-rhythm.js', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../www/aural-rhythm.js', import.meta.url), 'utf8')
);

console.log('aural-rhythm tests passed');
