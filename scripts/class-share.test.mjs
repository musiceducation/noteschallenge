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

console.log('class-share: ok');
