import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(new URL('../composer-game.js', import.meta.url), 'utf8'),
  context
);
const CG = context.ComposerGame;

assert.equal(CG.ERAS.length, 4);
assert.equal(CG.COMPOSERS.length, 10);
for (const c of CG.COMPOSERS) {
  assert.ok(c.id && c.name && c.en && c.work && c.title);
  assert.ok(c.born > 1600 && c.died > c.born);
  assert.ok(Array.isArray(c.theme) && c.theme.length >= 6, `${c.id} has playable theme`);
  assert.ok(fs.existsSync(new URL(`../img/composers/${c.id}.jpg`, import.meta.url)), `${c.id} portrait exists`);
  assert.ok(fs.existsSync(new URL(`../www/img/composers/${c.id}.jpg`, import.meta.url)), `${c.id} www portrait exists`);
}

assert.equal(CG.detectivePoints(0), 30);
assert.equal(CG.detectivePoints(1), 20);
assert.equal(CG.detectivePoints(2), 10);

const round = CG.buildDetectiveRound(6, () => 0.3);
assert.equal(round.length, 6);
assert.equal(new Set(round.map((r) => r.target.id)).size, 6);
for (const q of round) {
  assert.equal(q.choices.length, 4);
  assert.equal(q.choices.filter((c) => c.id === q.target.id).length, 1);
}

const tl = CG.buildTimelineQuestion(() => 0.25);
assert.equal(tl.cards.length, 3);
assert.equal(tl.expectedIds.length, 3);
assert.ok(tl.ordered[0].born <= tl.ordered[1].born && tl.ordered[1].born <= tl.ordered[2].born);
assert.equal(CG.checkTimelineOrder(tl, tl.expectedIds), true);
assert.equal(CG.checkTimelineOrder(tl, tl.expectedIds.slice().reverse()), false);

const card = CG.buildEraSortCard('bach', () => 0.1);
assert.notEqual(card.id, 'bach');
assert.ok(['baroque', 'classical', 'romantic', 'modern'].includes(card.era));

for (const file of ['index.html', 'www/index.html']) {
  const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(html, /id="enterComposers"/);
  assert.match(html, /id="screen-composers"/);
  assert.match(html, /composer-game\.js\?v=2/);
  assert.match(html, /hub-scene-composers\.webp\?v=1/);
  assert.match(html, /composer-mode-atlas\.webp\?v=1/);
  assert.match(html, /composer-mode-detective\.webp\?v=1/);
  assert.match(html, /composer-mode-timeline\.webp\?v=1/);
  assert.match(html, /composer-mode-erasort\.webp\?v=1/);
}
const gameSrc = fs.readFileSync(new URL('../composer-game.js', import.meta.url), 'utf8');
assert.match(gameSrc, /img\/composers\//);
assert.match(gameSrc, /era-' \+ id \+ '\.webp\?v=1/);
assert.doesNotMatch(gameSrc, /hub-scene-composers/);
['baroque', 'classical', 'romantic', 'modern'].forEach((id) => {
  assert.ok(fs.existsSync(new URL(`../img/ui/era-${id}.webp`, import.meta.url)), id);
  assert.ok(fs.existsSync(new URL(`../www/img/ui/era-${id}.webp`, import.meta.url)), 'www ' + id);
});
assert.equal(
  fs.readFileSync(new URL('../composer-game.js', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../www/composer-game.js', import.meta.url), 'utf8')
);

console.log('composer-game tests passed');
