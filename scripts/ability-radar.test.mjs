import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../ability-radar.js', import.meta.url), 'utf8');
const AbilityRadar = new Function(src + '\nreturn globalThis.AbilityRadar;')();

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
const reading = scored.find((axis) => axis.id === 'reading').score;
const rhythm = scored.find((axis) => axis.id === 'rhythm').score;
const listening = scored.find((axis) => axis.id === 'listening').score;
const solfege = scored.find((axis) => axis.id === 'solfege').score;
assert.ok(reading > 0 && reading <= 100);
assert.ok(rhythm > 0 && rhythm <= 100);
assert.ok(listening > 0 && listening <= 100);
assert.equal(solfege, null);
assert.match(AbilityRadar.summarise(scored), /較強係/);
assert.match(AbilityRadar.summarise(scored), /可以再練/);
assert.doesNotMatch(AbilityRadar.summarise(scored), /聽力（0）/);

const host = { innerHTML: '' };
AbilityRadar.render(host, profile);
assert.match(host.innerHTML, /<svg/);
assert.match(host.innerHTML, /未有紀錄/);
assert.match(host.innerHTML, /聽力/);

assert.equal(
  fs.readFileSync(new URL('../www/ability-radar.js', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../ability-radar.js', import.meta.url), 'utf8')
);

console.log('ability-radar tests passed');
