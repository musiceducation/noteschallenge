import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED = ['bach', 'mozart', 'beethoven', 'chopin', 'tchaikovsky', 'debussy', 'nie', 'xian'];
const NAMES = ['巴赫', '莫扎特', '貝多芬', '蕭邦', '柴可夫斯基', '德布西', '聶耳', '冼星海'];

function loadApi() {
  const code = fs.readFileSync(path.join(root, 'musician-mode.js'), 'utf8');
  const sandbox = { console, Math, Date, JSON, localStorage: { getItem() { return null; }, setItem() {} } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'musician-mode.js' });
  return sandbox.MusicianMode;
}

const api = loadApi();
const bank = JSON.parse(fs.readFileSync(path.join(root, 'data/musicians.json'), 'utf8'));

assert.equal(bank.uploadsScore, false);
assert.equal(bank.countsTowardRadar, false);
assert.match(bank.disclaimer, /不是音樂鑑賞/);
assert.match(bank.disclaimer, /演奏/);
assert.deepEqual(bank.musicians.map((m) => m.id), EXPECTED);
assert.deepEqual(bank.musicians.map((m) => m.nameZh), NAMES);

const seenQuestions = new Set();
for (const musician of bank.musicians) {
  assert.ok(musician.portrait && musician.portrait.src.endsWith('.jpg'));
  assert.match(musician.portrait.alt, /歷史(畫像|照片)/);
  assert.doesNotMatch(musician.portrait.alt, /插畫/);
  assert.match(musician.portrait.kind, /歷史/);
  assert.ok(musician.portrait.caption);
  assert.match(musician.portrait.reference.url, /^https:\/\//);
  assert.ok(musician.portrait.reference.license.length > 40);
  const imagePath = path.join(root, musician.portrait.src);
  const bytes = fs.readFileSync(imagePath);
  assert.ok(bytes.length > 1000, musician.id);
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  const own = bank.questions.filter((q) => q.musicianId === musician.id);
  assert.ok(own.length >= 3, musician.id + ' needs 3 questions');
  for (const fact of musician.facts) {
    assert.ok(fact.text);
    assert.ok(fact.sources && fact.sources.length >= 1, fact.id);
    for (const source of fact.sources) {
      assert.match(source.url, /^https?:\/\//, source.title);
      assert.ok(source.title);
    }
  }
  for (const question of own) {
    assert.ok(!seenQuestions.has(question.id));
    seenQuestions.add(question.id);
    assert.equal(question.choices.length, 4);
    assert.equal(new Set(question.choices).size, 4);
    assert.ok(question.answer >= 0 && question.answer < 4);
    const support = api.supportText(bank, question);
    const correct = question.choices[question.answer];
    assert.ok(support.includes(correct), question.id + ' answer not on card: ' + correct);
    question.choices.forEach((choice, index) => {
      if (index !== question.answer) assert.equal(support.includes(choice), false, question.id + ' distractor also on card: ' + choice);
    });
    assert.ok(question.explanation);
    assert.doesNotMatch(question.prompt, /卡片怎樣|卡片上|卡片寫|卡片要/);
  assert.equal(api.gradeChoice(question, question.answer).correct, true);
    assert.equal(api.gradeChoice(question, (question.answer + 1) % 4).correct, false);
  }
}

function rngFrom(seed) {
  let state = seed >>> 0;
  return function () {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

let used = [];
const first = api.selectRound(bank, rngFrom(7), used);
used = first.used;
assert.equal(first.round.length, 8);
assert.deepEqual([...first.round.map((q) => q.musicianId)].sort(), [...EXPECTED].sort());
assert.equal(new Set(first.round.map((q) => q.id)).size, 8);
const second = api.selectRound(bank, rngFrom(11), used);
assert.equal(second.round.length, 8);
const firstIds = new Set(first.round.map((q) => q.id));
second.round.forEach((question) => {
  assert.equal(firstIds.has(question.id), false, 'repeated ' + question.id);
});

const mode = fs.readFileSync(path.join(root, 'musician-mode.js'), 'utf8');
assert.doesNotMatch(mode, /recordGameResult|rank-sync|script\.google|ability-radar|aural-score|google\.script/);
assert.match(mode, /不上傳/);
assert.match(mode, /選一個答案。/);
assert.doesNotMatch(mode, /版面不會往下跳|卡片上的說法/);
assert.match(fs.readFileSync(path.join(root, 'musician-mode.css'), 'utf8'), /\.musician-explain\s*\{[^}]*min-height:\s*6\.75rem/);
const mozart = bank.musicians.find((m) => m.id === 'mozart');
assert.match(mozart.portrait.caption, /空白畫布沒有收入這張圖/);
assert.doesNotMatch(mozart.portrait.caption, /畫面右側大片未畫完/);
const hub = bank.hubComposite;
assert.deepEqual(hub.derivedFrom.map((item) => item.id), EXPECTED);
assert.match(hub.caption, /合成/);
assert.match(hub.alt, /不是新的歷史照片/);
hub.derivedFrom.forEach((item) => {
  assert.ok(item.license && item.license.length > 40, item.id);
  assert.match(item.url, /^https:\/\//);
});
assert.match(fs.readFileSync(path.join(root, 'musician-mode.css'), 'utf8'), /#screen-hub \.hub-games-grid \.hub-topic-musician \.illust-img[\s\S]*object-fit:\s*contain/);
assert.match(bank.musicians.find((m) => m.id === 'nie').portrait.reference.license, /攝影者姓名不見於/);
assert.match(bank.musicians.find((m) => m.id === 'xian').portrait.reference.license, /不把它寫成毫無限制/);
assert.equal(bank.musicians.find((m) => m.id === 'beethoven').regionShort, '波恩（今德國）');
const baptism = bank.musicians.find((m) => m.id === 'beethoven').facts.find((f) => f.id === 'birth').text;
assert.match(baptism, /1770年12月17日在波恩受洗/);
assert.match(baptism, /12月16日/);
for (const musician of bank.musicians) {
  for (const fact of musician.facts) {
    if (fact.label === '可學的一點') assert.equal(fact.text.startsWith('可學的一點'), false, musician.id);
  }
}

for (const file of ['index.html', 'www/index.html']) {
  const page = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(page, /id="enterMusician"/);
  assert.match(page, /id="screen-musician"/);
  assert.match(page, /musician-mode\.js\?v=6/);
  assert.match(page, /musician-mode\.css\?v=4/);
  assert.match(page, /上排由左至右：巴赫、莫扎特、貝多芬、蕭邦/);
  assert.match(page, /下排由左至右：柴可夫斯基、德布西、聶耳、冼星海/);
  assert.match(page, /img\/musicians\/hub-portraits\.jpg/);
  assert.doesNotMatch(page, /img\/musicians\/bach\.svg/);
  assert.match(page, /不計入能力圖/);
}
for (const file of ['script.js', 'www/script.js']) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(src, /musician-navigate/);
  assert.match(src, /screen-musician/);
  assert.doesNotMatch(src, /musician-result/);
}
assert.equal(
  fs.readFileSync(path.join(root, 'musician-mode.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'www/musician-mode.js'), 'utf8')
);
assert.equal(
  fs.readFileSync(path.join(root, 'data/musicians.json'), 'utf8'),
  fs.readFileSync(path.join(root, 'www/data/musicians.json'), 'utf8')
);

console.log('musician-mode tests passed');
