import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../staff-interval.js', import.meta.url), 'utf8');
assert.equal(src, fs.readFileSync(new URL('../www/staff-interval.js', import.meta.url), 'utf8'));
const StaffInterval = new Function(src + '\nreturn globalThis.StaffInterval;')();

assert.equal(StaffInterval.META.gameKey, 'staff-interval');
assert.equal(StaffInterval.META.countsTowardRadar, false);
assert.deepEqual(StaffInterval.META.tags, ['C-1']);
assert.equal(StaffInterval.META.axis, 'reading');
assert.equal(StaffInterval.META.uploadsScore, true);
assert.doesNotMatch(src, /增|減|英皇|musictheory|Tenuto|tenuto/);

for (const clef of ['treble', 'bass']) {
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const q = StaffInterval.buildQuestion(1, clef, Math.random, '');
    assert.equal(q.level, 1);
    assert.equal(q.clef, clef);
    assert.equal(q.correct, 'size:' + q.size);
    assert.ok(q.size >= 2 && q.size <= 8);
    const info = StaffInterval.classify(q.low, q.high);
    assert.ok(info.quality === 'major' || info.quality === 'minor' || info.quality === 'perfect');
    assert.ok(StaffInterval.staffStep(clef, q.low) >= -6);
    assert.ok(StaffInterval.staffStep(clef, q.high) <= 6);
    assert.equal(q.choices.length, 7);
    assert.doesNotMatch(StaffInterval.staffMarkup(q), /𝄞|𝄢|&#/);
    seen.add(q.size);
  }
  assert.equal(seen.size, 7, clef + ' level 1');

  const qualities = new Set();
  for (let i = 0; i < 40; i++) {
    const q = StaffInterval.buildQuestion(2, clef, Math.random, '');
    assert.equal(q.correct, q.quality + ':' + q.size);
    assert.match(q.label, /^[大小純]/);
    assert.equal(q.choices.map((choice) => choice.label).join(','), '小二度,大二度,小三度,大三度,純四度,純五度,純八度');
    qualities.add(q.correct);
  }
  assert.equal(qualities.size, 7, clef + ' level 2');
  assert.equal(StaffInterval.spellings(clef, { size: 4, quality: 'augmented' }).length, 0);
  assert.equal(StaffInterval.spellings(clef, { size: 5, quality: 'diminished' }).length, 0);
}

const run = StaffInterval.createRun('practice');
assert.equal(StaffInterval.scoreAnswer(run, true), 0);
assert.equal(run.correct, 1);
const timed = StaffInterval.createRun('challenge');
assert.equal(StaffInterval.scoreAnswer(timed, true), 11);
assert.equal(StaffInterval.scoreAnswer(timed, false), 0);
assert.equal(timed.combo, 0);

for (const file of ['index.html', 'www/index.html']) {
  const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(html, /id="enterStaffInterval"/);
  assert.match(html, /id="screen-staff-interval"/);
  assert.match(html, /看譜辨音程/);
  assert.match(html, /staff-interval\.js\?v=1/);
  assert.match(html, /style\.css\?v=25/);
  const screen = html.slice(html.indexOf('id="screen-staff-interval"'), html.indexOf('id="screen-aural"'));
  assert.match(screen, /高音譜號/);
  assert.match(screen, /低音譜號/);
  assert.doesNotMatch(screen, /中音|次中音|英皇/);
  assert.match(screen, /id="staffIntervalNext"/);
}

const script = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
assert.match(script, /staff-interval-result/);
assert.match(script, /detail\.uploadsScore/);
assert.doesNotMatch(fs.readFileSync(new URL('../ability-radar.js', import.meta.url), 'utf8'), /staff-interval/);

console.log('staff-interval tests passed');
