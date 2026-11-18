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
for (const file of ['../index.html', '../www/index.html']) {
  const page = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = page.indexOf('id="webGoogleAuthOverlay"');
  const overlay = page.slice(start, page.indexOf('firebase-app-compat', start));
  assert.match(overlay, /學校 Google 或者班級短碼/);
  assert.match(overlay, /有學校 Google 帳號嘅學生，請用 Google 登入。登入之後，你嘅姓名同班別會自動顯示，唔使自己揀。/);
  assert.match(overlay, /未用學校 Google 嘅學生，可以喺同一頁輸入老師發嘅 6–8 位短碼，再填姓名、班別同座號入場。/);
  assert.match(overlay, /老師登入之後，喺主頁「任務」產生短碼。/);
  assert.match(overlay, /測試人員唔使電郵。呢個身分唔會入正式排行榜，亦唔會改到學生分數。/);
  assert.match(overlay, /短碼身份只限該班，看不到同學電郵。/);
  assert.match(overlay, /id="webGoogleBtn"/);
  assert.match(overlay, /id="webCodeJoinForm"/);
  assert.match(overlay, /href="privacy\.html"/);
  assert.equal(overlay.includes('請用你自己嘅 Google 帳號登入'), false);
  assert.equal(overlay.includes('不必用學校 Google'), false);
}
assert.match(fs.readFileSync(new URL('../privacy.html', import.meta.url), 'utf8'), /沒有聲稱資料只留在澳門/);
assert.match(fs.readFileSync(new URL('../PRIVACY.md', import.meta.url), 'utf8'), /可能在澳門以外/);
assert.doesNotMatch(fs.readFileSync(new URL('../PRIVACY.md', import.meta.url), 'utf8'), /資料不出境/);
assert.match(fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8'), /skipRemote: true/);
assert.match(fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8'), /binding\.role === 'code'/);
assert.match(html, /classroom\.js\?v=2/);

function jsonResponse(status, data) {
  return {
    status,
    json() { return Promise.resolve(data); }
  };
}

function callsOf(handler) {
  const calls = [];
  const fetchImpl = (url, opts) => {
    calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : null });
    return Promise.resolve(handler(url, opts));
  };
  return { calls, fetchImpl };
}

const teacherAuth = { signedIn: true, tester: false, token: 'teacher-token', binding: { role: 'teacher', name: '陳老師', grade: '', class: '' } };
const studentAuth = { signedIn: true, tester: false, token: 'student-token', binding: { name: '陳同學', grade: '1', class: 'A', seat: '12' } };
const codeAuth = { signedIn: true, tester: false, token: 'code-token', binding: { role: 'code', name: '短碼生', grade: '1', class: 'B', seat: '8' } };
const base = 'https://auth.example';

assert.deepEqual(Classroom.loadPaths(teacherAuth).map((item) => item.method + ' ' + item.path), [
  'GET /class/assignments',
  'GET /class/records',
  'GET /class/report',
  'GET /class/codes'
]);
assert.deepEqual(Classroom.loadPaths(studentAuth), [{ method: 'GET', path: '/class/assignments' }]);
assert.deepEqual(Classroom.loadPaths(codeAuth), [{ method: 'GET', path: '/class/assignments' }]);
assert.deepEqual(Classroom.loadPaths({ signedIn: true, tester: true, token: 't', binding: { role: 'tester', name: '測試人員' } }), []);
assert.equal(Classroom.saveRequest('assignment', { grade: '1', className: 'A', activity: 'game1', difficulty: 'classic60', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-02T00:00:00.000Z' }).path, '/class/assignments');
assert.equal(Classroom.saveRequest('record', { grade: '1', className: 'A', studentName: '陳同學', seat: '12', item: 'A-1', channel: '實作', note: '觀察' }).path, '/class/records');
assert.equal(Classroom.saveRequest('paper', { grade: '1', className: 'A', studentName: '陳同學', seat: '12', note: '紙筆' }).path, '/class/paper');
assert.equal(Classroom.saveRequest('code', { grade: '1', className: 'A', hours: 24 }).path, '/class/codes');
assert.deepEqual(Classroom.saveRequest('revoke', { code: 'k7m4qp2' }).body, { revoke: true, code: 'K7M4QP2' });

const loaded = callsOf((url) => {
  if (url.endsWith('/class/assignments')) {
    return jsonResponse(200, { ok: true, assignments: [
      { id: 'a', grade: '1', class: 'A', activity: 'game1', difficulty: '', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' },
      { id: 'b', grade: '1', class: 'B', activity: 'game3', difficulty: '', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' }
    ] });
  }
  if (url.endsWith('/class/records')) return jsonResponse(200, { ok: true, records: [{ student_name: '陳同學', note: 'from-records', item: 'A-1', channel: '實作', grade: '1', class: 'A', seat: '12' }] });
  if (url.endsWith('/class/report')) {
    return jsonResponse(200, { ok: true, students: [{ name: '報告學生', grade: '1', class: 'A', seat: '12', history: [] }], records: [{ studentName: '報告學生', note: 'from-report', item: 'A-1', channel: '實作', grade: '1', class: 'A', seat: '12' }], papers: [{ studentName: '報告學生', note: '紙筆由老師記入', grade: '1', class: 'A', seat: '12' }] });
  }
  if (url.endsWith('/class/codes')) return jsonResponse(200, { ok: true, codes: [] });
  throw new Error('unexpected ' + url);
});
const teacherData = await Classroom.loadClassroom(teacherAuth, base, loaded.fetchImpl);
assert.deepEqual(loaded.calls.map((call) => call.method + ' ' + call.url), [
  'GET https://auth.example/class/assignments',
  'GET https://auth.example/class/records',
  'GET https://auth.example/class/report',
  'GET https://auth.example/class/codes'
]);
assert.equal(loaded.calls.every((call) => call.headers.Authorization === 'Bearer teacher-token'), true);
assert.equal(teacherData.records[0].note, 'from-report');
assert.equal(teacherData.students[0].name, '報告學生');
assert.equal(teacherData.papers[0].note, '紙筆由老師記入');
assert.equal(teacherData.assignments.length, 2);

const studentLoad = callsOf(() => jsonResponse(200, { ok: true, assignments: [
  { id: 'a', grade: '1', class: 'A', activity: 'game1', difficulty: '', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' },
  { id: 'b', grade: '1', class: 'B', activity: 'game3', difficulty: '', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' }
] }));
const studentData = await Classroom.loadClassroom(studentAuth, base, studentLoad.fetchImpl);
assert.deepEqual(studentLoad.calls.map((call) => call.url), ['https://auth.example/class/assignments']);
assert.deepEqual(studentData.assignments.map((row) => row.activity), ['game1']);
const codeData = await Classroom.loadClassroom(codeAuth, base, callsOf(() => jsonResponse(200, { ok: true, assignments: [
  { id: 'a', grade: '1', class: 'A', activity: 'game1', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' },
  { id: 'b', grade: '1', class: 'B', activity: 'game3', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' }
] })).fetchImpl);
assert.deepEqual(codeData.assignments.map((row) => row.activity), ['game3']);

const saved = callsOf(() => jsonResponse(200, { ok: true, assignment: { id: 'new' } }));
const saveResult = await Classroom.saveClassroom(teacherAuth, base, saved.fetchImpl, 'assignment', {
  grade: '1', className: 'A', activity: 'game1', difficulty: 'classic60', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-02T00:00:00.000Z'
});
assert.equal(saveResult.ok, true);
assert.equal(saved.calls[0].method, 'POST');
assert.equal(saved.calls[0].url, 'https://auth.example/class/assignments');
assert.equal(saved.calls[0].headers.Authorization, 'Bearer teacher-token');
assert.equal(saved.calls[0].body.class, 'A');
assert.equal(await Classroom.saveClassroom(studentAuth, base, saved.fetchImpl, 'record', { studentName: '陳同學' }).then((row) => row.error), 'forbidden');

const blocked = callsOf(() => jsonResponse(503, { ok: false, error: 'migration_required' }));
const blockedData = await Classroom.loadClassroom(teacherAuth, base, blocked.fetchImpl);
assert.equal(blockedData.notice, Classroom.MIGRATION_NOTICE);
assert.equal(blockedData.assignments.length, 0);

function screen() {
  const rootEl = {
    innerHTML: '',
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  return {
    documentElement: { classList: { remove() {} } },
    getElementById(id) { return id === 'classroomRoot' ? rootEl : null; },
    querySelectorAll() { return []; },
    rootEl
  };
}

const previousLocation = globalThis.location;
const previousAuth = globalThis.WebGoogleAuth;
const previousCfg = globalThis.MUSIC_APP_AUTH;
const previousFetch = globalThis.fetch;
globalThis.location = { hostname: 'noteschallenge.vercel.app', search: '?classroomDemo=1' };
globalThis.WebGoogleAuth = teacherAuth;
globalThis.MUSIC_APP_AUTH = { authApiBase: base };
globalThis.localStorage = {
  length: 1,
  key() { return 'ncClassroom.v1.cskphc'; },
  getItem() { return JSON.stringify({ assignments: [{ activity: 'local-only-marker', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z', grade: '1', class: 'A' }], records: [], papers: [] }); }
};
const liveFetch = callsOf((url) => {
  if (url.endsWith('/class/assignments')) return jsonResponse(200, { ok: true, assignments: [] });
  if (url.endsWith('/class/records')) return jsonResponse(200, { ok: true, records: [] });
  if (url.endsWith('/class/report')) return jsonResponse(200, { ok: true, students: [], records: [], papers: [] });
  if (url.endsWith('/class/codes')) return jsonResponse(200, { ok: true, codes: [] });
  return jsonResponse(404, { ok: false });
});
globalThis.fetch = liveFetch.fetchImpl;
const teacherPage = screen();
await Classroom.mount(teacherPage);
assert.match(teacherPage.rootEl.innerHTML, /id="classroomAssignForm"/);
assert.match(teacherPage.rootEl.innerHTML, /id="classroomRecordForm"/);
assert.match(teacherPage.rootEl.innerHTML, /id="classroomPaperForm"/);
assert.match(teacherPage.rootEl.innerHTML, /id="classroomCsvBtn"/);
assert.match(teacherPage.rootEl.innerHTML, /id="classroomCodeForm"/);
assert.equal(teacherPage.rootEl.innerHTML.includes('local-only-marker'), false);
assert.equal(liveFetch.calls.some((call) => call.url === 'https://auth.example/class/report'), true);
assert.equal(Classroom.demoAllowed(), false);

globalThis.WebGoogleAuth = codeAuth;
const codeFetch = callsOf(() => jsonResponse(200, { ok: true, assignments: [
  { id: 'a', grade: '1', class: 'A', activity: 'game1', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' },
  { id: 'b', grade: '1', class: 'B', activity: 'game3', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' }
] }));
globalThis.fetch = codeFetch.fetchImpl;
const codePage = screen();
await Classroom.mount(codePage);
assert.equal(codePage.rootEl.innerHTML.includes('id="classroomAssignForm"'), false);
assert.equal(codePage.rootEl.innerHTML.includes('id="classroomRecordForm"'), false);
assert.match(codePage.rootEl.innerHTML, /id="classroomJoinForm"/);
assert.match(codePage.rootEl.innerHTML, /術語識辨/);
assert.equal(codePage.rootEl.innerHTML.includes('音名識辨'), false);
assert.deepEqual(codeFetch.calls.map((call) => call.method + ' ' + call.url), ['GET https://auth.example/class/assignments']);

globalThis.WebGoogleAuth = { signedIn: false, tester: false, token: '', binding: null };
globalThis.fetch = () => { throw new Error('demo must not call the worker'); };
globalThis.location = { hostname: 'localhost', search: '?classroomDemo=1' };
assert.equal(Classroom.demoAllowed(), true);
const demoPage = screen();
await Classroom.mount(demoPage);
assert.match(demoPage.rootEl.innerHTML, /id="classroomAssignForm"/);
assert.match(demoPage.rootEl.innerHTML, /示範學生/);

globalThis.location = previousLocation;
globalThis.WebGoogleAuth = previousAuth;
globalThis.MUSIC_APP_AUTH = previousCfg;
globalThis.fetch = previousFetch;

console.log('classroom tests passed');
