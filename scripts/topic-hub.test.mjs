import assert from 'node:assert/strict';
import fs from 'node:fs';

const order = ['enterGame1', 'enterKeysig', 'enterSolfege', 'enterChord', 'enterGame2', 'enterGame3', 'enterGame4'];
const names = ['音名識辨', '調號辨別', '唱名辨別', '和弦練習', '節奏識辨', '術語識辨', '樂器識辨'];

for (const file of ['index.html', 'www/index.html']) {
  const page = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const hub = page.slice(page.indexOf('id="screen-hub"'), page.indexOf('id="screen-profile"'));
  const ids = [...hub.matchAll(/id="(enterGame1|enterKeysig|enterSolfege|enterChord|enterGame2|enterGame3|enterGame4)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, order, file + ' hub order');
  names.forEach((name) => assert.match(hub, new RegExp(name), file));
  assert.doesNotMatch(hub, /遊戲一|遊戲二|遊戲三|遊戲四/);
  assert.match(hub, /id="enterCompositionStudio"/);
  assert.match(hub, /id="enterAural"/);
  assert.match(hub, /音程 · 節奏 · 色彩/);
  assert.doesNotMatch(hub, /即將推出/);
  assert.match(hub, /hidden/);
  const app = page.slice(page.indexOf('class="app-game-list"'), page.indexOf('id="appTabCodex"'));
  const appIds = [...app.matchAll(/data-launch="(enterGame1|enterKeysig|enterSolfege|enterChord|enterGame2|enterGame3|enterGame4)"/g)].map((m) => m[1]);
  assert.deepEqual(appIds, order, file + ' app list');
  assert.doesNotMatch(app, /遊戲一|遊戲二|遊戲三|遊戲四/);
}

const notes = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const setup = notes.slice(notes.indexOf('id="screen-setup"'), notes.indexOf('id="screen-game"'));
assert.match(setup, /data-setup="notes"/);
assert.match(setup, /data-setup="keysig"/);
assert.match(setup, /data-setup="solfege"/);
assert.doesNotMatch(setup, /openChordCardBtn|先看和弦鍵盤/);
assert.match(setup, /id="keysigAccRow"/);
assert.doesNotMatch(setup, /id="abrsmGradeRow"|id="abrsmGradeBtns"|id="abrsmCoverage"/);
assert.match(notes.slice(notes.indexOf('id="screen-g2-setup"'), notes.indexOf('id="screen-g3-setup"')), /英皇級別/);
assert.match(notes.slice(notes.indexOf('id="screen-g3-setup"'), notes.indexOf('id="screen-rc-grade"')), /英皇級別/);

for (const file of ['script.js', 'www/script.js']) {
  const src = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(src, /function applySetupTopic\(topic\)/);
  assert.match(src, /openSetupTopic\('keysig'\)/);
  assert.match(src, /openSetupTopic\('solfege'\)/);
  assert.match(src, /function openChordPractice\(/);
  assert.match(src, /openFromLobby/);
  assert.doesNotMatch(src, /openChordCardBtn/);
  assert.match(src, /card\.dataset\.setup === topic/);
}

console.log('topic-hub tests passed');
