import assert from 'node:assert/strict';
import fs from 'node:fs';

const mapSrc = fs.readFileSync(new URL('../baa-music-map.js', import.meta.url), 'utf8');
const radarSrc = fs.readFileSync(new URL('../ability-radar.js', import.meta.url), 'utf8');
const src = fs.readFileSync(new URL('../classroom.js', import.meta.url), 'utf8');
const api = new Function(mapSrc + '\n' + radarSrc + '\n' + src + '\nreturn { Classroom: globalThis.Classroom, BaaMusicMap: globalThis.BaaMusicMap, AbilityRadar: globalThis.AbilityRadar };')();
const Classroom = api.Classroom;
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const hub = html.slice(html.indexOf('id="screen-hub"'), html.indexOf('id="screen-profile"'));

api.BaaMusicMap.hub.forEach((row) => {
  const tags = api.BaaMusicMap.hubTags(row.id);
  assert.ok(tags.length > 0, row.id);
  const start = hub.indexOf('id="' + row.id + '"');
  const slice = hub.slice(start, start + 700);
  tags.forEach((tag) => assert.ok(slice.includes('>' + tag + '<'), row.id + ' ' + tag));
  assert.equal(tags.includes('C-5'), false);
});
assert.deepEqual(api.BaaMusicMap.hubTags('enterGame4'), ['C-3']);
assert.deepEqual(api.BaaMusicMap.hubTags('enterAppreciate'), ['B-1', 'B-2', 'B-3', 'B-4']);
assert.equal(api.AbilityRadar.axes.find((axis) => axis.id === 'listening').games.includes('appreciate-form'), false);

const windowed = {
  activity: 'game1',
  difficulty: 'classic60',
  startsAt: '2026-11-01T08:00:00+08:00',
  endsAt: '2026-11-30T18:00:00+08:00'
};
const student = {
  name: '陳同學',
  grade: '1',
  class: 'A',
  seat: '12',
  history: [
    { game: 'game1', score: 80, challenge: true, practice: false, difficulty: 'classic60', at: '2026-11-18T02:00:00.000Z' },
    { game: 'game1', score: 10, challenge: false, practice: true, difficulty: 'practice', at: '2026-11-18T02:05:00.000Z' },
    { game: 'game1', score: 70, challenge: true, practice: false, difficulty: 'classic60', at: '2026-10-01T02:00:00.000Z' },
    { game: 'studio', score: 99, challenge: true, practice: false, at: '2026-11-18T03:00:00.000Z' },
    { game: 'appreciate-form', score: 21, challenge: true, practice: false, at: '2026-11-18T04:00:00.000Z' }
  ]
};
assert.equal(Classroom.assignmentCompleted(windowed, student), true);
assert.equal(Classroom.assignmentCompleted(Object.assign({}, windowed, { difficulty: 'noMiss' }), student), false);
assert.equal(Classroom.assignmentCompleted(windowed, {
  name: '陳同學',
  history: [{ game: 'game1', score: 10, challenge: false, practice: true, difficulty: 'practice', at: '2026-11-18T02:00:00.000Z' }]
}), false);
assert.equal(Classroom.assignmentCompleted(Object.assign({}, windowed, { activity: 'appreciate', difficulty: '' }), student), true);
assert.equal(Classroom.assignmentCompleted(windowed, { name: '訪客', history: student.history }), false);
assert.equal(Classroom.assignmentCompleted(windowed, { name: '測試人員', history: student.history }), false);
assert.equal(Classroom.macauLocalToIso('2026-11-18T09:30'), '2026-11-18T09:30:00+08:00');

const rows = Classroom.reportRows({
  students: [student, { name: '訪客', history: [{ game: 'game1', score: 5, challenge: true, at: '2026-11-18T02:00:00.000Z' }] }],
  records: [
    { studentName: '陳同學', seat: '12', item: 'A-1', channel: '實作', note: '演唱觀察' },
    { studentName: '陳同學', seat: '12', item: 'B-5', channel: '口語', note: '同儕互評' },
    { studentName: '陳同學', seat: '12', item: 'B-5', channel: '檔案', note: '互評單' }
  ],
  papers: [{ studentName: '陳同學', seat: '12', note: '紙筆由老師記入' }],
  evaluate: api.AbilityRadar.evaluate
});
assert.equal(rows.length, 1);
assert.equal(rows[0].實作, 'A-1 演唱觀察');
assert.equal(rows[0].口語, 'B-5 同儕互評');
assert.equal(rows[0].檔案, 'B-5 互評單');
assert.equal(rows[0].紙筆測試, '紙筆由老師記入');
assert.match(rows[0].數碼測試, /鑑賞 曲式 21/);
assert.equal(rows[0].數碼測試.includes('99'), false);
assert.equal(rows[0].數碼測試.includes('練習'), false);
assert.match(Classroom.toCsv(rows), /口語,實作,檔案,紙筆測試,數碼測試/);
assert.match(Classroom.toCsv(rows), /不是澳門教育及青年發展局的基本學力達標評級/);
const printable = Classroom.printableHtml(rows);
assert.match(printable, /紙筆測試/);
assert.match(printable, /不是澳門教育及青年發展局的基本學力達標評級/);
assert.equal(printable.includes('studio'), false);

const card = Classroom.publicCard(Object.assign({ avatar: '🎵', signature: '嗨', email: 'a@cskphc.edu.mo' }, student));
assert.equal(card.email, undefined);
assert.equal(JSON.stringify(card).includes('@'), false);
assert.equal(Classroom.publicCard({ name: '測試人員', grade: '1', class: 'A' }), null);
assert.equal(Classroom.ACTIVITIES.some((item) => item.id === 'studio' || item.id === 'practice'), false);

assert.match(html, /privacy\.html/);
assert.match(html, /id="screen-classroom"/);
assert.match(html, /id="webCodeJoinForm"/);
assert.match(fs.readFileSync(new URL('../privacy.html', import.meta.url), 'utf8'), /沒有聲稱資料只留在澳門/);
assert.match(fs.readFileSync(new URL('../PRIVACY.md', import.meta.url), 'utf8'), /可能在澳門以外/);
assert.doesNotMatch(fs.readFileSync(new URL('../PRIVACY.md', import.meta.url), 'utf8'), /資料不出境/);
assert.match(fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8'), /skipRemote: true/);
assert.match(fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8'), /binding\.role === 'code'/);

console.log('classroom tests passed');
