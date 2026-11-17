import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../class-share.js', import.meta.url), 'utf8');
const www = fs.readFileSync(new URL('../www/class-share.js', import.meta.url), 'utf8');
assert.equal(src, www);
for (const file of ['../index.html', '../www/index.html']) {
  const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  assert.match(html, /class-share\.js\?v=4/);
  assert.doesNotMatch(html, /class-share\.js\?v=3/);
}
const ClassShare = new Function(src + '\nreturn ClassShare;')();

const student = { name: '陳小樂', grade: 2, class: 'A', seat: '12', avatar: '🎹', signature: '練拍號', level: 2, exp: 10 };
assert.equal(ClassShare.shareable(student), true);
assert.equal(ClassShare.shareable({ name: '陳小樂', grade: 'F1', class: 'A' }), true);
assert.equal(ClassShare.shareable({ name: '陳小樂', grade: '中二', class: 'B班' }), true);
assert.equal(ClassShare.identity({ name: '陳小樂', grade: 'F2', class: '2B' }).grade, 2);
assert.equal(ClassShare.identity({ name: '陳小樂', grade: 'F2', class: '2B' }).class, 'B');
assert.equal(ClassShare.sameClass({ grade: 'F1', class: 'A' }, { grade: '中一', class: 'A班' }), true);
assert.equal(ClassShare.sameClass({ grade: 'F1', class: 'A' }, { grade: 'F3', class: 'A' }), false);
assert.equal(ClassShare.shareable({ name: '訪客', grade: 2, class: 'A' }), false);
assert.equal(ClassShare.shareable({ name: '測試人員', grade: 2, class: 'A' }), false);
assert.equal(ClassShare.shareable(student, { tester: true }), false);
assert.equal(ClassShare.shareable({ name: '陳小樂', grade: 2, class: '' }), false);
assert.equal(ClassShare.cardFromProfile({ name: '訪客', grade: 2, class: 'A', avatar: '🎹' }), null);

const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEA';
const card = ClassShare.cardFromProfile(Object.assign({}, student, { avatar: photo }));
assert.equal(card.avatar, photo);
assert.equal(card.class, 'A');
const local = { name: '陳小樂', grade: '2', class: 'a', avatar: '🎵', signature: '', level: 1, exp: 0, gameBests: { game2: 3 } };
const merged = ClassShare.applyCard(local, Object.assign({}, card, { gameBests: { game2: 9, game3: 4 } }));
assert.equal(merged.avatar, photo);
assert.equal(merged.signature, '練拍號');
assert.equal(merged.gameBests.game2, 9);
assert.equal(merged.gameBests.game3, 4);
const keptPhoto = ClassShare.applyCard(merged, Object.assign({}, card, { avatar: '' }));
assert.equal(keptPhoto.avatar, photo);

const other = { name: '李同學', grade: 3, class: 'B', seat: '4', avatar: '🎻', signature: '別班' };
assert.equal(ClassShare.sameClass(student, other), false);
assert.equal(ClassShare.applyCard(local, other).avatar, '🎵');
const rows = ClassShare.classRows([card, other, { name: '訪客', grade: 2, class: 'A' }], student);
assert.deepEqual(rows.map((row) => row.name), ['陳小樂']);
assert.deepEqual(ClassShare.directoryNames(['陳小樂', '周同學'], [card, other], student), ['陳小樂', '周同學']);
assert.deepEqual(ClassShare.directoryNames([], [card, other], student), ['陳小樂']);
const quiet = { name: '周未登入', grade: 'F1', class: 'A', seat: '9', avatar: '🎵', signature: '' };
const same = Object.assign({}, card, { grade: 1, class: 'A' });
assert.deepEqual(ClassShare.directoryNames(['陳小樂'], [same, quiet], { name: '陳小樂', grade: '中一', class: 'A班' }), ['陳小樂', '周未登入']);
assert.equal(ClassShare.cardFor([same, quiet], '周未登入', '1').name, '周未登入');
assert.notEqual(ClassShare.cardFor([same, quiet], '周未登入', '').name, '陳小樂');
const online = ClassShare.visibleOnline(['陳小樂'], [
  { name: '陳小樂', grade: 2, class: 'A', seat: '12', screen: '節奏挑戰' },
  { name: '李同學', grade: 3, class: 'B', screen: '術語作答' },
  { name: '測試人員', grade: 2, class: 'A', screen: '大廳' }
], student);
assert.equal(online.length, 1);
assert.equal(ClassShare.statusText(true, online[0].screen), '在線·節奏挑戰');
assert.equal(ClassShare.statusText(false, '節奏挑戰'), '離線');
assert.equal(ClassShare.screenLabel('screen-rc-grade'), '節奏挑戰');

const stale = ClassShare.takeBoard({
  cards: [card, other],
  online: [
    { name: '陳小樂', grade: 2, class: 'A', seat: '12', screen: '節奏挑戰' },
    { name: '李同學', grade: 3, class: 'B', screen: '術語作答' }
  ],
  log: [{ name: '李同學', grade: 3, class: 'B', event: 'screen', screen: '術語作答' }]
}, student);
assert.deepEqual(stale.cards.map((row) => row.name), ['陳小樂']);
assert.deepEqual(stale.online.map((row) => row.name), ['陳小樂']);
assert.equal(stale.log.length, 0);
assert.equal(ClassShare.presenceAction({}), 'stop');
assert.equal(ClassShare.presenceAction({ token: 'x'.repeat(24), tester: true, enrolled: true }), 'stop');
assert.equal(ClassShare.presenceAction({ token: 'x'.repeat(24), enrolled: true, visible: false }), 'offline');
assert.equal(ClassShare.presenceAction({ token: 'x'.repeat(24), enrolled: true, visible: true }), 'ping');

let calls = 0;
let sent = null;
global.window = { MUSIC_APP_AUTH: { authApiBase: 'https://auth.example' } };
global.fetch = async (url, opts) => {
  calls += 1;
  sent = { url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null, auth: opts.headers.Authorization };
  return { ok: true, json: async () => ({ ok: false, error: 'unauthorized' }) };
};
await ClassShare.postCard(Object.assign({}, student, { avatar: photo, email: 'a@school.edu.hk' }));
await ClassShare.loadBoard(student);
await ClassShare.postPresence(student, '大廳');
assert.equal(ClassShare.note(student, 'screen-hub'), false);
assert.equal(calls, 0);
const denied = await ClassShare.loadBoard(student, { token: 'z'.repeat(24) });
assert.equal(denied.ok, false);
assert.equal(denied.error, 'unauthorized');
assert.equal(denied.cards.length, 0);
assert.equal(calls, 1);

const tokenA = 'a'.repeat(24);
const tokenB = 'b'.repeat(24);
const memory = { cards: [], online: [] };
global.fetch = async (url, opts) => {
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  const who = opts.headers.Authorization.endsWith(tokenA) ? student : { name: '李同學', grade: 2, class: 'A', seat: '4' };
  if (String(url).endsWith('/class/card')) {
    memory.cards = memory.cards.filter((row) => row.name !== who.name);
    memory.cards.push({ name: who.name, grade: '2', class: 'A', seat: who.seat, avatar: body.avatar, signature: body.signature || '' });
    assert.equal(body.email, undefined);
    assert.equal(body.name, undefined);
  } else if (String(url).endsWith('/class/presence')) {
    memory.online = memory.online.filter((row) => row.name !== who.name);
    if (!body.offline) memory.online.push({ name: who.name, grade: '2', class: 'A', seat: who.seat, screen: body.screen, avatar: '🎹' });
  }
  return { ok: true, json: async () => ({ ok: true, cards: memory.cards, online: memory.online, log: [] }) };
};
await ClassShare.postCard(Object.assign({}, student, { avatar: photo, signature: '同班', email: 'a@school.edu.hk', history: [{ score: 1 }] }), { token: tokenA });
await ClassShare.postPresence({ name: '李同學', grade: 2, class: 'A', seat: '4' }, '節奏挑戰', { token: tokenB });
const seen = await ClassShare.loadBoard(student, { token: tokenA });
assert.equal(seen.cards[0].avatar, photo);
assert.equal(seen.cards[0].signature, '同班');
assert.equal(seen.online[0].name, '李同學');
assert.equal(ClassShare.statusText(true, seen.online[0].screen), '在線·節奏挑戰');
await ClassShare.postPresence({ name: '李同學', grade: 2, class: 'A', seat: '4' }, '', { token: tokenB, offline: true });
const after = await ClassShare.loadBoard(student, { token: tokenA });
assert.equal(after.online.length, 0);
assert.equal(ClassShare.statusText(false, ''), '離線');
assert.equal(after.cards[0].avatar, photo);
ClassShare.stop();

const wide = ClassShare.takeBoard({
  cards: [card, Object.assign({}, other, { email: 'c@school.edu.hk', history: [{ score: 1 }] })],
  online: [
    { name: '陳小樂', grade: 2, class: 'A', seat: '12', screen: '節奏挑戰' },
    { name: '李同學', grade: 3, class: 'B', screen: '術語作答', email: 'b@school.edu.hk' }
  ],
  log: [{ name: '李同學', grade: 3, class: 'B', event: 'screen', screen: '術語作答', at: '2026-11-17T01:00:00.000Z' }]
}, {});
assert.equal(wide.cards.length, 2);
assert.equal(wide.online.length, 2);
assert.equal(wide.log.length, 1);
assert.equal(wide.cards.find((row) => row.name === '李同學').email, undefined);
assert.equal(JSON.stringify(wide).includes('@'), false);
assert.equal(JSON.stringify(wide).includes('history'), false);
const formB = ClassShare.takeBoard(wide, { grade: 3, class: 'B' });
assert.deepEqual(formB.cards.map((row) => row.name), ['李同學']);
assert.equal(formB.online.length, 1);
assert.equal(formB.log.length, 1);

const people = ClassShare.directoryEntries(
  [{ grade: '1', class: 'A', names: ['陳小樂'] }, { grade: '3', class: 'B', names: ['靜靜'] }],
  [same, other],
  {}
);
assert.equal(people.some((row) => row.name === '李同學' && row.class === 'B'), true);
assert.equal(people.some((row) => row.name === '靜靜' && String(row.grade) === '3'), true);
const onlyB = ClassShare.directoryEntries(
  [{ grade: '1', class: 'A', names: ['陳小樂'] }, { grade: '3', class: 'B', names: ['靜靜'] }],
  [same, other],
  { grade: 3, class: 'B' }
);
assert.deepEqual(onlyB.map((row) => row.name).sort(), ['李同學', '靜靜'].sort());
assert.equal(ClassShare.cardFor([same, other], '李同學', '4', { grade: 1, class: 'A' }), null);
assert.equal(ClassShare.cardFor([same, other], '李同學', '4', { grade: 3, class: 'B' }).name, '李同學');

const game = ClassShare.publicGameRecord({
  name: '周同學', grade: '3', class: 'B', game: 'game2', score: 88,
  accuracy: 90, max_combo: 12, timestamp: '2026-11-17T01:02:03.000Z',
  email: 'c@school.edu.hk', history: [{ score: 1 }]
});
assert.equal(game.email, undefined);
assert.equal(game.history, undefined);
assert.equal(game.gameLabel, '節奏');
assert.equal(game.score, 88);
assert.equal(game.accuracy, 90);
assert.equal(game.combo, 12);
assert.equal(ClassShare.publicGameRecord({ name: '周同學', grade: 3, class: 'B', game: 'game2', email: 'a@school.edu.hk' }), null);
const records = ClassShare.radarRecords(
  [{ name: '李同學', grade: 1, class: 'A', event: 'offline', screen: '大廳', at: '2026-11-17T01:00:00.000Z', email: 'b@school.edu.hk' }],
  [
    { name: '周同學', grade: 3, class: 'B', game: 'game1', score: 40, timestamp: '2026-11-17T02:00:00.000Z', email: 'c@school.edu.hk' },
    { name: '陳小樂', grade: 1, class: 'A', game: 'game3', score: 10 }
  ],
  {}
);
assert.equal(JSON.stringify(records).includes('@'), false);
assert.equal(records.some((row) => row.kind === 'game' && row.name === '周同學' && row.score === 40 && row.gameLabel === '音名'), true);
assert.equal(records.some((row) => row.kind === 'presence' && row.event === 'offline'), true);
assert.equal(records.find((row) => row.name === '陳小樂').accuracy, undefined);
assert.equal(records.find((row) => row.name === '陳小樂').at, undefined);
const onlyA = ClassShare.radarRecords(
  [{ name: '李同學', grade: 1, class: 'A', event: 'offline', screen: '大廳', at: '2026-11-17T01:00:00.000Z' }],
  [
    { name: '周同學', grade: 3, class: 'B', game: 'game1', score: 40, email: 'c@school.edu.hk' },
    { name: '陳小樂', grade: 1, class: 'A', game: 'game3', score: 10 }
  ],
  { grade: '1', class: 'A' }
);
assert.equal(onlyA.some((row) => row.name === '周同學'), false);
assert.equal(onlyA.some((row) => row.name === '陳小樂' && row.kind === 'game'), true);
assert.equal(onlyA.some((row) => row.name === '李同學' && row.kind === 'presence'), true);

let boardUrl = '';
global.fetch = async (url) => {
  boardUrl = String(url);
  return { ok: true, json: async () => ({ ok: true, cards: [card, other], online: [], log: [] }) };
};
const schoolBoard = await ClassShare.loadBoard({}, { token: tokenA });
assert.equal(boardUrl.endsWith('/class/board'), true);
assert.equal(schoolBoard.cards.length, 2);
const narrowedBoard = await ClassShare.loadBoard({ grade: 3, class: 'B' }, { token: tokenA });
assert.equal(boardUrl.includes('grade=3'), true);
assert.equal(boardUrl.includes('class=B'), true);
assert.deepEqual(narrowedBoard.cards.map((row) => row.name), ['李同學']);
assert.equal(JSON.stringify(narrowedBoard).includes('@'), false);

console.log('class-share: ok');
