import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../profile-store.js', import.meta.url), 'utf8'), context);
const P = context.ProfileStore;

assert.equal(P.profileKey({ name: '訪客', grade: 1, class: 'A' }), P.GUEST_KEY);
assert.equal(P.profileKey({ name: '測試人員', guest: true }), P.GUEST_KEY);
assert.equal(P.profileKey({ name: '陳心瑜', grade: 1, class: 'A', seat: '3' }), 'musicGameProfile_1_A_陳心瑜');
assert.equal(P.profileKey({ name: '陳心瑜', grade: 1, class: 'A', seat: '9' }), P.profileKey({ name: '陳心瑜', grade: 1, class: 'A', seat: '3' }));
assert.notEqual(P.profileKey({ name: '陳心瑜', grade: 2, class: 'A' }), P.profileKey({ name: '陳心瑜', grade: 1, class: 'A' }));

const settings = P.mergeSettings({ userGrade: '1', extraAuth: 'keep-me' }, { userClass: 'B', savedName: '陳心瑜' });
assert.equal(settings.userGrade, '1');
assert.equal(settings.userClass, 'B');
assert.equal(settings.savedName, '陳心瑜');
assert.equal(settings.extraAuth, 'keep-me');

const bests = P.mergeBests({ game1: 80, keysig: 40 }, { game1: 20, keysig: 55, chord: 10 });
assert.equal(bests.game1, 80);
assert.equal(bests.keysig, 55);
assert.equal(bests.chord, 10);

const merged = P.mergeProfile({
  avatar: '🎹',
  signature: '勤力練習',
  totalPlayTime: 400,
  level: 6,
  exp: 20,
  gameBests: { game1: 90 },
  history: [{ score: 90 }, { score: 80 }],
  stats: { totalPlayed: 4, maxCombo: 12 }
}, {
  avatar: '',
  signature: '',
  totalPlayTime: 10,
  level: 1,
  exp: 0,
  gameBests: { game1: 30, game2: 15 },
  history: [{ score: 30 }],
  stats: { totalPlayed: 1, maxCombo: 3 }
});
assert.equal(merged.avatar, '🎹');
const photo = 'data:image/jpeg;base64,' + 'A'.repeat(40);
assert.equal(P.mergeProfile({ avatar: photo, gameBests: { game1: 80 } }, { avatar: '', gameBests: { game1: 10 } }).avatar, photo);
assert.equal(P.mergeProfile({ avatar: photo, gameBests: { game1: 80 } }, { avatar: '', gameBests: { game1: 10 } }).gameBests.game1, 80);
assert.equal(merged.signature, '勤力練習');
assert.equal(merged.totalPlayTime, 400);
assert.equal(merged.level, 6);
assert.equal(merged.gameBests.game1, 90);
assert.equal(merged.gameBests.game2, 15);
assert.equal(merged.history.length, 2);
assert.equal(merged.stats.totalPlayed, 4);
assert.equal(merged.stats.maxCombo, 12);

assert.equal(P.sameNamedPerson({ name: '陳心瑜' }, { name: '陳心瑜', grade: 2, class: 'B' }), true);
assert.equal(P.sameNamedPerson({ name: '陳心瑜' }, { name: '周倬睿', grade: 1, class: 'A' }), false);
assert.equal(P.sameNamedPerson({ name: '訪客' }, { name: '陳心瑜' }), false);
assert.equal(P.sameNamedPerson({ name: '陳心瑜' }, { name: '訪客', guest: true }), false);
const moved = P.relabel({ name: '陳心瑜', grade: 1, class: 'A', avatar: '🎹', gameBests: { game1: 50 } }, { name: '陳心瑜', grade: 2, class: 'B', seat: '4' });
assert.equal(moved.grade, 2);
assert.equal(moved.class, 'B');
assert.equal(moved.seat, '4');
assert.equal(moved.avatar, '🎹');
assert.equal(moved.gameBests.game1, 50);

const memory = {
  data: {},
  getItem(k) { return this.data[k] || null; },
  setItem(k, v) { if (k === 'full') throw new Error('QuotaExceededError'); this.data[k] = String(v); }
};
assert.equal(P.safeSet(memory, 'ok', '1').ok, true);
assert.equal(P.safeSet(memory, 'full', '1').ok, false);
P.writePointer(memory, { name: '陳心瑜', grade: 1, class: 'A' });
assert.equal(P.readPointer(memory).name, '陳心瑜');
P.writePointer(memory, { name: '訪客', guest: true });
assert.equal(P.readPointer(memory).name, '陳心瑜');

const www = fs.readFileSync(new URL('../www/profile-store.js', import.meta.url), 'utf8');
assert.equal(www, fs.readFileSync(new URL('../profile-store.js', import.meta.url), 'utf8'));

console.log('profile-store tests passed');
