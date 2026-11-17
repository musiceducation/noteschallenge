import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../class-share.js', import.meta.url), 'utf8');
const www = fs.readFileSync(new URL('../www/class-share.js', import.meta.url), 'utf8');
assert.equal(src, www);
const ClassShare = new Function(src + '\nreturn ClassShare;')();

const student = { name: '陳小樂', grade: 2, class: 'A', seat: '12', avatar: '🎹', signature: '練拍號', level: 2, exp: 10 };
assert.equal(ClassShare.shareable(student), true);
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

console.log('class-share: ok');
