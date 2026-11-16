import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
for (const file of ['profile-store.js', 'rank-sync.js', 'aural-score.js', 'aural-quality.js']) {
  vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
}
const Q = context.AuralQuality;
const Score = context.AuralScore;

function zero() { return 0; }
assert.equal(Q.triad(60, 'major').join(','), '60,64,67');
assert.equal(Q.triad(60, 'minor').join(','), '60,63,67');
assert.equal(Q.triad(60, 'aug').join(','), '60,64,68');
assert.equal(Q.triad(60, 'dim').join(','), '60,63,66');

const easy = Q.buildQuestion(1, false, zero);
assert.equal(easy.kind, 'block');
assert.equal(easy.choices.map((item) => item.label).sort().join(','), '大調,小調');
assert.equal(Q.eventsFor(easy).every((event) => event.at === 0), true);

const phrase = Q.buildQuestion(1, true, zero);
assert.equal(phrase.kind, 'arpeggio');
assert.equal(phrase.midis.length, 4);
const times = Q.eventsFor(phrase).map((event) => event.at);
assert.ok(times[1] > times[0]);

const color = Q.buildQuestion(2, false, zero);
assert.equal(color.choices.length, 4);
assert.equal(color.choices.some((item) => item.id === 'aug'), true);
assert.equal(color.choices.some((item) => item.id === 'dim'), true);

const cadence = Q.buildQuestion(3, true, zero);
assert.equal(cadence.kind, 'cadence');
assert.equal(cadence.choices.length, 3);
assert.equal(cadence.chords.length, 3);
assert.equal(Q.eventsFor(cadence).some((event) => event.at > 0), true);
const half = Q.cadenceChords(60, 'half');
assert.equal(half.length, 2);

const practice = Q.createRun('practice');
Q.scoreAnswer(practice, true);
assert.equal(Q.resultDetail(practice), null);
const challenge = Q.createRun('challenge');
assert.equal(Q.scoreAnswer(challenge, true), 11);
assert.equal(Q.resultDetail(challenge).gameKey, 'aural-quality');

const raised = Score.applyListeningBests({ listening: 20, 'aural-interval': 20, 'aural-rhythm': 10 }, 'aural-quality', 48);
assert.equal(raised['aural-quality'], 48);
assert.equal(raised.listening, 48);
assert.equal(raised['aural-interval'], 20);
const kept = Score.applyListeningBests(raised, 'aural-quality', 5);
assert.equal(kept.listening, 48);
assert.equal(kept['aural-quality'], 48);

for (const file of ['index.html', 'www/index.html']) {
  const page = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(page, /id="auralOpenQuality"/);
  assert.match(page, /id="auralQualityReplay"/);
  assert.match(page, /和弦色彩/);
  assert.match(page, /正格終止|終止式/);
}
assert.equal(
  fs.readFileSync(new URL('../aural-quality.js', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../www/aural-quality.js', import.meta.url), 'utf8')
);
console.log('aural-quality tests passed');
