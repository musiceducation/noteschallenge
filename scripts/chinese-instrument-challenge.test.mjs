import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'chinese-instrument-challenge.js'), 'utf8'), context);
const CN = context.ChineseInstrumentChallenge;

const bank = JSON.parse(fs.readFileSync(path.join(root, 'data/instrument-bank.json'), 'utf8'));
const chinese = CN.chinesePool(bank);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

assert.equal(chinese.length, 21, 'the Chinese bank has 21 named, pictured instruments');
assert.equal(CN.roundSize(chinese.length), 10);
assert.equal(CN.roundSize(3), 3);
assert.equal(CN.roundSize(1), 0);

const families = {};
for (const inst of chinese) {
  assert.ok(inst.family.startsWith('chinese'), inst.id);
  assert.equal(bank.filter((item) => item.id === inst.id).length, 1);
  assert.ok(fs.existsSync(path.join(root, inst.img)), `missing photo ${inst.img}`);
  assert.ok(inst.synthParams, `${inst.id} keeps its existing synth timbre`);
  families[inst.family] = (families[inst.family] || 0) + 1;
}
for (const [family, count] of Object.entries(families)) {
  assert.ok(count >= CN.OPTION_COUNT, `${family} can fill a same-family question`);
}

const westernIds = new Set(bank.filter((item) => !CN.isChinese(item)).map((item) => item.id));
assert.ok(westernIds.has('violin'));
assert.equal(CN.isChinese(bank.find((item) => item.id === 'violin')), false);

for (let seed = 1; seed <= 20; seed += 1) {
  const random = mulberry32(seed);
  const round = CN.buildRound(bank, null, random);
  assert.equal(round.length, 10);
  const ids = round.map((question) => question.id);
  assert.equal(new Set(ids).size, 10, 'a round does not repeat an instrument');
  for (const question of round) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options.map((option) => option.id)).size, 4);
    assert.ok(question.options.some((option) => option.id === question.id));
    for (const option of question.options) {
      assert.equal(option.family, question.family, `${question.id} distractors stay in ${question.family}`);
      assert.equal(westernIds.has(option.id), false);
      assert.equal(CN.isChinese(chinese.find((item) => item.id === option.id)), true);
    }
    const hidden = CN.renderPrompt(question, false).replace(/src="[^"]*"/g, '');
    assert.equal(hidden.includes(question.nameZh), false, `hidden prompt leaks ${question.nameZh}`);
    if (question.nameEn) assert.equal(hidden.includes(question.nameEn), false);
    assert.match(CN.renderPrompt(question, false), new RegExp(`src="${question.img.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    const shown = CN.renderPrompt(question, true);
    assert.match(shown, new RegExp(question.nameZh));
    assert.match(shown, new RegExp(question.nameEn));
    assert.match(shown, /維基共享資源/);
    const ear = CN.renderPrompt(question, false, 'listen');
    assert.equal(ear.includes('<img'), false, 'listen prompt hides the photo');
    assert.equal(ear.includes(question.img), false);
    assert.equal(ear.includes(question.nameZh), false);
    if (question.nameEn) assert.equal(ear.includes(question.nameEn), false);
    assert.match(ear, /合成示範音色，不是現場錄音/);
    const revealed = CN.renderPrompt(question, true, 'listen');
    assert.match(revealed, /<img/);
    assert.match(revealed, new RegExp(question.nameZh));
  }
  const heard = CN.buildRound(bank, null, random, 'listen');
  assert.equal(heard.length, 10);
  for (const question of heard) {
    assert.equal(question.options.every((option) => option.family === question.family), true);
    assert.ok(chinese.find((item) => item.id === question.id).synthParams);
  }
}

const stripped = bank.map((item) => (item.id === 'erhu' ? { ...item, synthParams: undefined } : item));
const withoutErhu = CN.buildRound(stripped, null, mulberry32(3), 'listen');
assert.equal(withoutErhu.some((question) => question.id === 'erhu'), false);
assert.equal(withoutErhu.length, 10);
assert.ok(CN.buildRound(stripped, 21, mulberry32(3), 'see').some((question) => question.id === 'erhu'));

const sparse = [
  { id: 'only-a', nameZh: '甲', nameEn: 'A', family: 'chinese-wind', familyZh: '中樂吹管', img: 'img/a.jpg' },
  { id: 'only-b', nameZh: '乙', nameEn: 'B', family: 'chinese-perc', familyZh: '中樂敲擊', img: 'img/b.jpg' },
  { id: 'violin', nameZh: '小提琴', nameEn: 'Violin', family: 'strings', img: 'img/violin.jpg' },
];
const sparseRound = CN.buildRound(sparse, null, mulberry32(2));
assert.equal(sparseRound.length, 2);
for (const question of sparseRound) {
  assert.equal(question.options.some((option) => option.id === 'violin'), false);
  assert.equal(question.options.length, 2);
}

const stats = { score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0, mistakes: [] };
for (let i = 0; i < 4; i += 1) assert.equal(CN.applyAnswer(stats, true), 10);
assert.equal(stats.score, 40);
assert.equal(stats.combo, 4);
assert.equal(CN.applyAnswer(stats, true), 20);
assert.equal(stats.score, 60);
assert.equal(stats.maxCombo, 5);
assert.equal(CN.applyAnswer(stats, false), 0);
assert.equal(stats.combo, 0);
assert.equal(stats.wrong, 1);
assert.equal(stats.score, 60);
assert.equal(CN.applyAnswer(stats, true), 10);
assert.equal(stats.combo, 1);

const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const wwwScript = fs.readFileSync(path.join(root, 'www/script.js'), 'utf8');
assert.match(script, /!isG4ChineseFamily\(i\.family\)/);
assert.match(wwwScript, /!isG4ChineseFamily\(i\.family\)/);
assert.match(script, /ChineseInstrumentChallenge\.mount/);
assert.match(wwwScript, /ChineseInstrumentChallenge\.mount/);

for (const file of ['index.html', 'www/index.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /id="cnInstModeChallenge"/);
  assert.match(html, /樂器挑戰/);
  assert.match(html, /再挑戰一次/);
  assert.match(html, /不計入樂器識辨排行榜/);
  assert.match(html, /chinese-instrument-challenge\.js\?v=3/);
  assert.match(html, /id="cnInstModeListen"/);
  assert.match(html, /id="cnInstChallengePrompt"/);
  assert.match(html, /data-cat="chinese"/);
}

console.log('chinese-instrument-challenge: ok');
