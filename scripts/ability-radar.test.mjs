import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../ability-radar.js', import.meta.url), 'utf8');
const mapSrc = fs.readFileSync(new URL('../baa-music-map.js', import.meta.url), 'utf8');
const AbilityRadar = new Function(mapSrc + '\n' + src + '\nreturn globalThis.AbilityRadar;')();
const scoringSrc = src.slice(0, src.indexOf('function point'));
assert.doesNotMatch(scoringSrc, /BaaMusicMap/);
assert.deepEqual(AbilityRadar.axes.map((axis) => axis.id), ['reading', 'solfege', 'harmony', 'rhythm', 'theory', 'instruments', 'listening']);
assert.deepEqual(AbilityRadar.axes.map((axis) => axis.games.join(',')), [
  'game1,keysig',
  'solfege',
  'chord',
  'game2',
  'game3',
  'game4',
  'aural-interval,aural-rhythm,aural-quality,listenInterval,listenRhythm,listenColor'
]);
assert.deepEqual(AbilityRadar.axes.map((axis) => axis.scale), [200, 200, 200, 2000, 200, 200, 100]);

const empty = AbilityRadar.evaluate({ history: [], gameBests: {} });
assert.equal(empty.length, 7);
assert.equal(empty.find((axis) => axis.id === 'listening').score, null);
assert.equal(empty.every((axis) => axis.score == null), true);
assert.match(AbilityRadar.summarise(empty), /未有足夠/);

const profile = {
  gameBests: { game1: 100, keysig: 50, game2: 1000 },
  history: [
    { game: 'game1', score: 100, accuracy: 80, challenge: true },
    { game: 'keysig', score: 50, accuracy: 40, challenge: true },
    { game: 'game1', score: 999, accuracy: 100, practice: true },
    { game: 'game2', score: 1000, accuracy: 90, challenge: true },
    { game: 'listenInterval', score: 80, accuracy: 70, challenge: true }
  ]
};
const scored = AbilityRadar.evaluate(profile);
const byId = Object.fromEntries(scored.map((axis) => [axis.id, axis.score]));
assert.deepEqual(byId, {
  reading: 47,
  solfege: null,
  harmony: null,
  rhythm: 66,
  theory: null,
  instruments: null,
  listening: 76
});
const withAppreciation = {
  gameBests: Object.assign({ 'appreciate-form': 90 }, profile.gameBests),
  history: profile.history.concat([
    { game: 'appreciate-form', score: 90, accuracy: 100, challenge: true },
    { game: 'appreciate-genre', score: 40, accuracy: 50, challenge: true },
    { game: 'appreciate-traits', score: 70, accuracy: 80, challenge: true }
  ])
};
assert.deepEqual(
  AbilityRadar.evaluate(withAppreciation).map((axis) => axis.score),
  scored.map((axis) => axis.score)
);
assert.match(AbilityRadar.summarise(scored), /較強係/);
assert.match(AbilityRadar.summarise(scored), /可以再練/);
assert.doesNotMatch(AbilityRadar.summarise(scored), /聽力（0）/);

const host = { innerHTML: '' };
AbilityRadar.render(host, profile);
assert.match(host.innerHTML, /<svg/);
assert.match(host.innerHTML, /未有紀錄/);
assert.match(host.innerHTML, /聽力/);
assert.match(host.innerHTML, /C-1/);
assert.match(host.innerHTML, /教師補錄/);
assert.match(host.innerHTML, /未由本平台評核/);
assert.match(host.innerHTML, /不是澳門教育及青年發展局的基本學力達標評級/);
assert.match(host.innerHTML, /readonly/);

['ability-radar.js', 'baa-music-map.js', 'appreciate-listen.js', 'style.css', 'index.html', 'script.js', 'bootstrap-instruments.js'].forEach((file) => {
  assert.equal(
    fs.readFileSync(new URL('../www/' + file, import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'),
    file
  );
});

console.log('ability-radar tests passed');
