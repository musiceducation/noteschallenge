import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'instrument-category.js'), 'utf8'), context);
const IC = context.InstrumentCategory;
const bank = JSON.parse(fs.readFileSync(path.join(root, 'data/instrument-bank.json'), 'utf8'));

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

function memoryStore() {
  const data = {};
  return {
    get(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    set(key, value) { data[key] = value; },
  };
}

const catalog = IC.catalog(bank);
const ids = catalog.map((choice) => choice.id);
const bankFamilies = [...new Set(bank.map((inst) => inst.family))];
for (const choice of catalog) {
  if (choice.id === 'orchestra' || choice.id === 'chinese') continue;
  assert.ok(bankFamilies.includes(choice.id), `${choice.id} is a bank family`);
  const sample = bank.find((inst) => inst.family === choice.id);
  assert.equal(choice.label, sample.familyZh);
}
assert.equal(ids.slice(0, 6).join(','), 'orchestra,strings,woodwind,brass,percussion,keyboard');
assert.ok(ids.includes('chinese'));
assert.ok(ids.includes('chinese-bowed'));
assert.ok(ids.includes('chinese-plucked'));
assert.ok(ids.includes('chinese-wind'));
assert.ok(ids.includes('chinese-perc'));
const chineseLabels = catalog.filter((choice) => choice.id.startsWith('chinese-')).map((choice) => choice.label);
assert.ok(chineseLabels.some((label) => label.includes('拉弦')));
assert.ok(chineseLabels.some((label) => label.includes('彈撥')));
assert.ok(chineseLabels.some((label) => label.includes('吹管')));
assert.ok(chineseLabels.some((label) => label.includes('敲擊')));
assert.equal(catalog.filter((choice) => choice.ranked).map((choice) => choice.id).join(','), 'orchestra');

const westernIds = new Set(IC.resolve(bank, 'orchestra').instruments.map((inst) => inst.id));
const chineseIds = new Set(IC.resolve(bank, 'chinese').instruments.map((inst) => inst.id));
assert.ok(westernIds.has('violin'));
assert.equal(chineseIds.has('violin'), false);
assert.ok(chineseIds.has('erhu'));
assert.equal(westernIds.has('erhu'), false);
assert.equal(IC.resolve(bank, 'chinese-bowed').instruments.every((inst) => inst.family === 'chinese-bowed'), true);
assert.equal(IC.resolve(bank, 'no-such-family').id, 'orchestra');

assert.equal(IC.recordsRank('orchestra'), true);
assert.equal(IC.recordsRank(''), true);
assert.equal(IC.recordsRank('strings'), false);
assert.equal(IC.recordsRank('keyboard'), false);
assert.equal(IC.recordsRank('chinese'), false);
assert.equal(IC.recordsRank('chinese-wind'), false);
assert.equal(IC.submitsGlobal('orchestra', 'challenge'), true);
assert.equal(IC.submitsGlobal('orchestra', 'practice'), false);
assert.equal(IC.submitsGlobal('chinese', 'challenge'), false);
assert.equal(IC.submitsGlobal('brass', 'challenge'), false);

function finishProfileTimer(startedAt, ranked, mode, now) {
  const action = IC.profileTimerAction(ranked, mode);
  let armedAt = startedAt;
  let attributedToGame4 = 0;
  if (action === 'record') {
    const secs = Math.min(30 * 60, Math.max(0, Math.round((now - armedAt) / 1000)));
    attributedToGame4 = secs;
    armedAt = 0;
  } else {
    armedAt = 0;
  }
  return { armedAt, attributedToGame4, action };
}

const unrankedTimed = finishProfileTimer(1_000_000, false, 'challenge', 1_000_000 + 125_000);
assert.equal(unrankedTimed.action, 'reset');
assert.equal(unrankedTimed.armedAt, 0);
assert.equal(unrankedTimed.attributedToGame4, 0);
for (const poolId of ['strings', 'woodwind', 'brass', 'percussion', 'keyboard', 'chinese', 'chinese-bowed', 'chinese-plucked', 'chinese-wind', 'chinese-perc']) {
  const ended = finishProfileTimer(5_000, IC.recordsRank(poolId), 'challenge', 5_000 + 45 * 60 * 1000);
  assert.equal(ended.armedAt, 0, poolId);
  assert.equal(ended.attributedToGame4, 0, poolId);
}
const rankedTimed = finishProfileTimer(1_000_000, true, 'challenge', 1_000_000 + 10_000);
assert.equal(rankedTimed.action, 'record');
assert.equal(rankedTimed.armedAt, 0);
assert.equal(rankedTimed.attributedToGame4, 10);
assert.equal(finishProfileTimer(1_000, true, 'practice', 61_000).attributedToGame4, 0);
assert.equal(finishProfileTimer(1_000, false, 'practice', 61_000).armedAt, 0);

const store = memoryStore();
assert.equal(IC.loadSelection(store, catalog), 'orchestra');
IC.saveSelection(store, 'chinese');
assert.equal(IC.loadSelection(store, catalog), 'chinese');
assert.equal(IC.loadSelection(store, catalog), 'chinese');
IC.saveSelection(store, 'chinese-plucked');
assert.equal(IC.loadSelection(store, catalog), 'chinese-plucked');
IC.saveSelection(store, 'made-up');
assert.equal(IC.loadSelection(store, catalog), 'orchestra');

function assertInside(question, pool) {
  const allowed = new Set(pool.map((inst) => inst.id));
  const names = new Set(pool.map((inst) => inst.nameZh));
  const families = new Set(pool.map((inst) => inst.familyZh));
  const sounds = new Set(pool.map((inst) => IC.soundLabel(inst)).filter(Boolean));
  assert.ok(allowed.has(question.instrument.id));
  assert.ok(question.options.length >= 2);
  assert.equal(new Set(question.options).size, question.options.length);
  assert.ok(question.options.includes(question.answer));
  if (question.type === 'image-name') {
    question.options.forEach((name) => assert.ok(names.has(name), name));
  } else if (question.type === 'name-image') {
    question.options.forEach((id) => assert.ok(allowed.has(id), id));
    question.imgOptions.forEach((inst) => assert.ok(allowed.has(inst.id)));
  } else if (question.type === 'name-family') {
    question.options.forEach((label) => assert.ok(families.has(label), label));
  } else if (question.type === 'sound-source') {
    question.options.forEach((label) => assert.ok(sounds.has(label), label));
  } else if (question.type === 'percussion-pitch') {
    assert.equal(question.instrument.family, 'percussion');
  } else if (question.type === 'listen-name') {
    question.options.forEach((name) => assert.ok(names.has(name), name));
    assert.equal(question.answer, question.instrument.nameZh);
    assert.ok(question.instrument.synthParams);
    assert.equal(question.imgOptions, null);
  } else {
    assert.fail(question.type);
  }
}

const westernSounds = new Set(Object.values({
  strings: '弓拉或撥動弦線',
  woodwind: '吹氣通過管口或簧片',
  brass: '嘴唇振動吹入管口',
  percussion: '敲擊使物體振動',
  keyboard: '按鍵觸動機械或電路',
}));
const orchestra = IC.resolve(bank, 'orchestra');
for (let seed = 1; seed <= 8; seed += 1) {
  const round = IC.buildQuestions(orchestra, 12, mulberry32(seed));
  assert.equal(round.length, 12);
  for (const question of round) {
    assertInside(question, orchestra.instruments);
    assert.equal(question.instrument.family.startsWith('chinese'), false);
    assert.notEqual(question.type, 'listen-name');
    if (question.type === 'sound-source') {
      question.options.forEach((label) => assert.ok(westernSounds.has(label)));
      assert.equal(question.options.includes('馬尾弓拉奏'), false);
    }
    if (question.type === 'name-family') assert.equal(question.options.some((label) => String(label).includes('中樂')), false);
  }
}

const chinese = IC.resolve(bank, 'chinese');
assert.equal(IC.availableTypes(chinese.instruments).includes('percussion-pitch'), false);
for (let seed = 1; seed <= 8; seed += 1) {
  const round = IC.buildQuestions(chinese, 10, mulberry32(seed + 40));
  assert.equal(round.length, 10);
  for (const question of round) {
    assertInside(question, chinese.instruments);
    assert.equal(question.type === 'percussion-pitch', false);
    assert.notEqual(question.type, 'listen-name');
    assert.equal(westernIds.has(question.instrument.id), false);
    if (question.type === 'name-image') {
      question.options.forEach((id) => assert.equal(westernIds.has(id), false));
    }
    if (question.type === 'image-name') {
      question.options.forEach((name) => assert.equal(name === '小提琴', false));
    }
  }
}

for (const family of ['strings', 'woodwind', 'brass', 'percussion', 'keyboard', 'chinese-bowed', 'chinese-plucked', 'chinese-wind', 'chinese-perc']) {
  const spec = IC.resolve(bank, family);
  const round = IC.buildQuestions(spec, 8, mulberry32(7));
  assert.equal(round.length, 8, family);
  for (const question of round) {
    assertInside(question, spec.instruments);
    assert.equal(question.instrument.family, family);
    assert.equal(question.type === 'name-family', false);
  }
}

assert.equal(IC.buildQuestions({ instruments: [] }, 5, Math.random).length, 0);
assert.equal(IC.buildQuestions({ instruments: [bank[0]] }, 5, Math.random).length, 0);
const sparse = [
  { id: 'only-a', nameZh: '甲', nameEn: 'A', family: 'chinese-wind', familyZh: '中樂吹管', img: 'img/a.jpg' },
  { id: 'violin', nameZh: '小提琴', nameEn: 'Violin', family: 'strings', familyZh: '弦樂', img: 'img/violin.jpg' },
];
assert.equal(IC.buildQuestions(IC.resolve(sparse, 'chinese-wind'), 4, mulberry32(3)).length, 0);
const pair = sparse.concat([
  { id: 'only-b', nameZh: '乙', nameEn: 'B', family: 'chinese-wind', familyZh: '中樂吹管', img: 'img/b.jpg' },
]);
const pairRound = IC.buildQuestions(IC.resolve(pair, 'chinese-wind'), 4, mulberry32(5));
assert.equal(pairRound.length, 4);
for (const question of pairRound) {
  assertInside(question, IC.resolve(pair, 'chinese-wind').instruments);
  assert.equal(question.options.includes('小提琴'), false);
  assert.equal(question.options.includes('violin'), false);
}

assert.equal(IC.availableTypes(IC.resolve(bank, 'chinese-bowed').instruments).includes('sound-source'), false);
assert.equal(IC.availableTypes(IC.resolve(bank, 'chinese-bowed').instruments).includes('listen-name'), false);
assert.equal(IC.availableTypes(IC.resolve(bank, 'strings').instruments).includes('percussion-pitch'), false);
assert.equal(IC.availableTypes(IC.resolve(bank, 'strings').instruments, 'listen').join(','), 'listen-name');
assert.equal(IC.availableTypes(IC.resolve(bank, 'chinese').instruments, 'see').includes('listen-name'), false);
assert.ok(IC.availableTypes(IC.resolve(bank, 'chinese').instruments, 'mix').includes('listen-name'));
assert.ok(IC.availableTypes(IC.resolve(bank, 'chinese').instruments, 'mix').includes('image-name'));

const listenTypes = new Set();
const mixTypes = new Set();
for (let seed = 1; seed <= 12; seed += 1) {
  const heard = IC.buildQuestions(orchestra, 12, mulberry32(seed + 80), 'listen');
  assert.equal(heard.length, 12);
  for (const question of heard) {
    assertInside(question, orchestra.instruments);
    assert.equal(question.type, 'listen-name');
    listenTypes.add(question.type);
    const wrongs = question.options.filter((name) => name !== question.answer);
    const sameFamily = wrongs.filter((name) => orchestra.instruments.some((inst) => inst.nameZh === name && inst.family === question.instrument.family));
    assert.ok(sameFamily.length >= 1, question.instrument.id);
  }
  for (const question of IC.buildQuestions(orchestra, 12, mulberry32(seed + 120), 'see')) {
    assert.notEqual(question.type, 'listen-name');
  }
  for (const question of IC.buildQuestions(orchestra, 12, mulberry32(seed + 160), 'mix')) {
    assertInside(question, orchestra.instruments);
    mixTypes.add(question.type);
  }
  for (const question of IC.buildQuestions(chinese, 10, mulberry32(seed + 200), 'listen')) {
    assertInside(question, chinese.instruments);
    assert.equal(question.type, 'listen-name');
    assert.equal(westernIds.has(question.instrument.id), false);
  }
}
assert.ok(listenTypes.has('listen-name'));
assert.ok(mixTypes.has('listen-name'));
assert.ok(mixTypes.has('image-name'));

const quiet = [
  { id: 'a', nameZh: '甲', nameEn: 'A', family: 'strings', familyZh: '弦樂', img: 'img/a.jpg', synthParams: { wave: 'sawtooth' } },
  { id: 'b', nameZh: '乙', nameEn: 'B', family: 'strings', familyZh: '弦樂', img: 'img/b.jpg' },
];
assert.equal(IC.availableTypes(quiet, 'listen').length, 0);
assert.equal(IC.buildQuestions({ instruments: quiet }, 4, mulberry32(1), 'listen').length, 0);
assert.equal(IC.buildQuestions({ instruments: quiet }, 4, mulberry32(2), 'mix').some((question) => question.type === 'listen-name'), false);
const audible = quiet.concat([
  { id: 'c', nameZh: '丙', nameEn: 'C', family: 'woodwind', familyZh: '木管', img: 'img/c.jpg', synthParams: { wave: 'triangle' } },
]);
assert.ok(IC.availableTypes(audible, 'listen').includes('listen-name'));
const audibleRound = IC.buildQuestions({ instruments: audible }, 6, mulberry32(3), 'listen');
assert.equal(audibleRound.length, 6);
for (const question of audibleRound) {
  assert.equal(question.type, 'listen-name');
  assert.notEqual(question.instrument.id, 'b');
  assert.ok(question.instrument.synthParams);
}
assert.equal(IC.buildQuestions({ instruments: audible }, 6, mulberry32(4), 'see').some((question) => question.type === 'listen-name'), false);

assert.equal(IC.normalizePrompt('listen'), 'listen');
assert.equal(IC.normalizePrompt('mix'), 'mix');
assert.equal(IC.normalizePrompt('see'), 'see');
assert.equal(IC.normalizePrompt('nope'), 'see');
assert.equal(IC.loadPrompt(store), 'see');
IC.savePrompt(store, 'listen');
assert.equal(IC.loadPrompt(store), 'listen');
IC.savePrompt(store, 'mix');
assert.equal(IC.loadPrompt(store), 'mix');
IC.savePrompt(store, 'nope');
assert.equal(IC.loadPrompt(store), 'see');
assert.equal(IC.recordsRank('orchestra', 'see'), true);
assert.equal(IC.recordsRank('orchestra', 'listen'), false);
assert.equal(IC.recordsRank('orchestra', 'mix'), false);
assert.equal(IC.recordsRank('orchestra'), true);
assert.equal(IC.submitsGlobal('orchestra', 'challenge', 'see'), true);
assert.equal(IC.submitsGlobal('orchestra', 'challenge', 'listen'), false);
assert.equal(IC.submitsGlobal('orchestra', 'challenge', 'mix'), false);
assert.equal(IC.submitsGlobal('orchestra', 'practice', 'see'), false);
assert.equal(IC.submitsGlobal('orchestra', 'challenge', 'see'), true);
assert.equal(IC.submitsGlobal('strings', 'challenge', 'see'), false);
assert.equal(IC.submitsGlobal('chinese', 'practice', 'see'), false);
const listenTimed = finishProfileTimer(1_000_000, IC.recordsRank('orchestra', 'listen'), 'challenge', 1_000_000 + 10_000);
assert.equal(listenTimed.action, 'reset');
assert.equal(listenTimed.armedAt, 0);
assert.equal(listenTimed.attributedToGame4, 0);
const mixTimed = finishProfileTimer(1_000_000, IC.recordsRank('orchestra', 'mix'), 'challenge', 1_000_000 + 8_000);
assert.equal(mixTimed.attributedToGame4, 0);
assert.equal(finishProfileTimer(1_000_000, IC.recordsRank('orchestra', 'see'), 'challenge', 1_000_000 + 8_000).attributedToGame4, 8);
assert.match(IC.SYNTH_NOTE, /合成示範音色/);
assert.match(IC.SYNTH_NOTE, /不是現場錄音/);

function sliceFn(source, name, next) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${next}`, start);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end);
}

for (const file of ['script.js', 'www/script.js']) {
  const script = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(script, /!isG4ChineseFamily\(i\.family\)/);
  assert.match(script, /InstrumentCategory\.buildQuestions/);
  assert.match(script, /InstrumentCategory\.saveSelection/);
  assert.match(script, /sessionStorage/);
  const saves = script.match(/saveLocalRank\('game4'/g) || [];
  assert.equal(saves.length, 1, file);
  const end = sliceFn(script, 'endGame4', 'renderG4Study');
  const rankAt = end.indexOf('recordsRank');
  const saveAt = end.indexOf("saveLocalRank('game4'");
  const submitAt = end.indexOf("submitScoreToGAS('game4'");
  assert.ok(rankAt >= 0 && rankAt < saveAt && saveAt < submitAt, file);
  const recordIf = end.indexOf("if (profileTimerAction === 'record')");
  assert.ok(recordIf >= 0 && recordIf < saveAt, `${file} practice must not saveLocalRank`);
  assert.match(end, /練習成績只留在這一頁，不計入樂器識辨排行榜/);
  const render = sliceFn(script, 'renderG4Question', 'handleG4Answer');
  assert.match(render, /getElementById\('g4Message'\)/);
  assert.match(render, /messageEl\.textContent = '🎻 準備好就點選答案！'/);
  assert.match(render, /id="g4ListenReplay"/);
  const answer = sliceFn(script, 'handleG4Answer', 'revealG4ListenAnswer');
  assert.match(answer, /revealG4ListenAnswer\(q\)/);
  assert.match(answer, /正確答案：/);
  assert.doesNotMatch(answer, /準備好就點選答案/);
  const gen = sliceFn(script, 'generateG4OrchestraQuestions', 'shuffle');
  assert.doesNotMatch(gen, /listenPool\.length \? listenPool : pool/);
  assert.match(gen, /type === 'listen-name' && listenPool\.length < 1/);
  assert.match(gen, /if \(promptMode === 'listen'\) continue/);
  assert.match(gen, /correct = listenPool\[/);
  assert.match(end, /recordsRank\(g4State\.poolId, promptMode\)/);
  assert.match(script, /InstrumentCategory\.savePrompt/);
  assert.match(script, /InstrumentCategory\.loadPrompt/);
  assert.match(script, /buildQuestions\(spec, count, Math\.random, mode\)/);
  assert.match(script, /g4ListenReplay/);
  assert.match(script, /playInstrumentSound\(q\.instrument\.id\)/);
  assert.doesNotMatch(script, /g4ListenFrame/);
  assert.doesNotMatch(script, /videoSrc\?autoplay/);
  assert.match(end, /if \(rankedPool\)/);
  assert.match(end, /renderG4PoolPicker\(\)/);
  assert.match(end, /profileTimerAction === 'record'/);
  assert.match(end, /if \(profileTimerAction === 'reset'\) _consumeProfilePlaySecs\(\);/);
  assert.doesNotMatch(end, /else if \(mode === 'practice'\)/);
  const recordAt = end.indexOf("recordGameResult(user, 'game4'");
  const resetAt = end.indexOf("if (profileTimerAction === 'reset') _consumeProfilePlaySecs();");
  assert.ok(recordAt >= 0 && resetAt > recordAt, file);
  const back = script.slice(script.indexOf("getElementById('g4BackBtn')"), script.indexOf('switchScreen(\'screen-game4\')'));
  assert.match(back, /_consumeProfilePlaySecs\(\)/);
}

for (const file of ['index.html', 'www/index.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /id="g4PoolGroups"/);
  assert.match(html, /id="g4PoolActive"/);
  assert.match(html, /id="g4PoolLive"/);
  assert.match(html, /id="g4ChineseTenBtn"/);
  assert.match(html, /id="g4ScopeNote"/);
  assert.match(html, /合成示範音色，不是現場錄音/);
  assert.match(html, /style\.css\?v=15/);
  assert.match(html, /bootstrap-instruments\.js\?v=10/);
  assert.match(html, /instrument-category\.js\?v=2/);
  assert.match(html, /chinese-instrument-challenge\.js\?v=3/);
  assert.match(html, /id="g4PromptModes"/);
  assert.match(html, /data-prompt="see"/);
  assert.match(html, /data-prompt="listen"/);
  assert.match(html, /data-prompt="mix"/);
  assert.match(html, /id="cnInstModeListen"/);
  assert.match(html, /data-cat="chinese"/);
  assert.match(html, /id="cnInstModeChallenge"/);
  assert.match(html, /不計入樂器識辨排行榜/);
}

for (const file of ['style.css', 'www/style.css']) {
  const css = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(css, /@media \(max-width: 600px\) \{\s*#screen-g4-setup\.screen\.active[\s\S]*?\.g4-pool-chip/);
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1024px\) \{\s*\.g4-pool-row[\s\S]*?\.g4-pool-chip/);
  assert.match(css, /\.g4-pool-live/);
  assert.match(css, /\.g4-scoped-result/);
  assert.match(css, /\.g4-prompt-chip/);
  assert.match(css, /\.g4-listen-replay/);
}

for (const file of ['bootstrap-instruments.js', 'www/bootstrap-instruments.js']) {
  const js = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(js, /script\.js\?v=15/);
  assert.equal(js.includes('script.js?v=14'), false);
  assert.equal(js.includes('script.js?v=13'), false);
  assert.equal(js.includes('script.js?v=12'), false);
  assert.equal(js.includes('script.js?v=11'), false);
  assert.equal(js.includes('script.js?v=10'), false);
  assert.equal(js.includes('script.js?v=9'), false);
  assert.equal(js.includes('script.js?v=8'), false);
}

assert.equal(
  fs.readFileSync(path.join(root, 'instrument-category.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'www/instrument-category.js'), 'utf8')
);

console.log('instrument-category: ok');
