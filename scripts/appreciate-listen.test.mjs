import assert from 'node:assert/strict';
import fs from 'node:fs';

const profileSrc = fs.readFileSync(new URL('../profile-store.js', import.meta.url), 'utf8');
const radarSrc = fs.readFileSync(new URL('../ability-radar.js', import.meta.url), 'utf8');
const src = fs.readFileSync(new URL('../appreciate-listen.js', import.meta.url), 'utf8');
assert.doesNotMatch(src, /https?:\/\/|gasPost|submitProfile|musicGameRanks_|localStorage\.setItem\('musicGame/);
const api = new Function(profileSrc + '\n' + radarSrc + '\n' + src + '\nreturn { AppreciateListen: globalThis.AppreciateListen, AbilityRadar: globalThis.AbilityRadar, ProfileStore: globalThis.ProfileStore };')();
const Listen = api.AppreciateListen;

assert.match(Listen.SOURCE_NOTE, /原創/);
assert.match(Listen.SOURCE_NOTE, /沒有使用商業錄音/);
assert.match(Listen.SOURCE_NOTE, /澳門現成曲例未收錄/);

const tasks = ['form', 'genre', 'traits'];
const answers = { form: new Set(), genre: new Set(), traits: new Set() };
tasks.forEach((task) => {
  const items = Listen.itemsFor(task);
  assert.ok(items.length >= 6, task);
  items.forEach((item) => {
    assert.ok(item.events.length > 0, item.id);
    assert.ok(Listen.endsAt(item.events) < 16, item.id);
    assert.equal(JSON.stringify(item).includes('http'), false);
    answers[task].add(item.answer);
    item.choices.forEach((choice) => assert.equal(typeof choice.label, 'string'));
  });
});
assert.deepEqual([...answers.form].sort(), ['binary', 'rondo', 'ternary']);
assert.deepEqual([...answers.genre].sort(), ['art', 'folk', 'hymn', 'pop']);
const penta = Listen.itemsFor('traits').find((item) => item.id === 'trait-penta');
assert.match(penta.explain, /原創五聲音階/);
assert.match(penta.explain, /不是某首民歌/);
assert.match(penta.explain, /澳門/);

const radarGames = api.AbilityRadar.axes.flatMap((axis) => axis.games);
['appreciate-form', 'appreciate-genre', 'appreciate-traits'].forEach((key) => {
  assert.equal(radarGames.includes(key), false, key);
});

let question = Listen.buildQuestion('form', () => 0);
assert.ok(question.choices.some((choice) => choice.id === question.answer));
const round = Listen.buildRound('genre', () => 0.3, Listen.CHALLENGE_COUNT);
assert.equal(round.length, Listen.CHALLENGE_COUNT);
round.forEach((item) => assert.ok(item.choices.some((choice) => choice.id === item.answer)));

const practice = Listen.createRun('practice', 'form');
assert.equal(Listen.scoreAnswer(practice, true), 0);
assert.equal(practice.score, 0);
assert.equal(Listen.resultDetail(practice), null);

const challenge = Listen.createRun('challenge', 'traits');
assert.equal(Listen.scoreAnswer(challenge, true), 11);
assert.equal(Listen.scoreAnswer(challenge, true), 12);
assert.equal(challenge.score, 23);
const detail = Listen.resultDetail(challenge);
assert.equal(detail.gameKey, 'appreciate-traits');
assert.equal(detail.mode, 'challenge');

assert.equal(Listen.canSavePlayer(null), false);
assert.equal(Listen.canSavePlayer({ name: '訪客' }), false);
assert.equal(Listen.canSavePlayer({ name: '測試人員' }), false);
assert.equal(Listen.canSavePlayer({ name: '陳同學', grade: '1', class: 'A' }), true);
globalThis.WebGoogleAuth = { tester: true };
assert.equal(Listen.canSavePlayer({ name: '陳同學', grade: '1', class: 'A' }), false);

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /baa-music-map\.js\?v=2/);
assert.match(html, /ability-radar\.js\?v=2/);
assert.match(html, /appreciate-listen\.js\?v=1/);
assert.match(html, /classroom\.js\?v=2/);
assert.match(html, /style\.css\?v=26/);
assert.match(html, /bootstrap-instruments\.js\?v=22/);
assert.match(html, /id="screen-appreciate"/);
assert.match(html, /id="enterAppreciate"/);
assert.match(html, /hub-scene-appreciate\.webp\?v=1/);
assert.match(html, /appreciate-form\.webp\?v=1/);
assert.match(html, /appreciate-genre\.webp\?v=1/);
assert.match(html, /appreciate-traits\.webp\?v=1/);
['hub-scene-appreciate', 'appreciate-form', 'appreciate-genre', 'appreciate-traits'].forEach((name) => {
  assert.ok(fs.existsSync(new URL(`../img/ui/${name}.webp`, import.meta.url)), name);
});
assert.doesNotMatch(html, /id="enterCompositionStudio"[^>]*hidden/);
assert.match(fs.readFileSync(new URL('../bootstrap-instruments.js', import.meta.url), 'utf8'), /script\.js\?v=34/);
assert.match(fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8'), /skipRemote: true/);

console.log('appreciate-listen tests passed');
