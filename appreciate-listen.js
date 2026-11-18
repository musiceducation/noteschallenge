/**
 * Appreciation listening: simple form, song type, and musical characteristics.
 * Original Web Audio phrases only. No commercial recordings.
 * Scores use appreciate-* keys and are not part of the seven-axis 聽力 total.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AppreciateListen = api;
  if (root && root.document) {
    var boot = function () { api.mount(root.document); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var CHALLENGE_COUNT = 6;
  var SOURCE_NOTE = '聲音是為課堂寫的原創短句，由網頁音訊即時奏出，沒有使用商業錄音。澳門現成曲例未收錄。';

  function round(n) { return Math.round(n * 1000) / 1000; }

  function seq(midis, start, step, dur, gain) {
    return midis.map(function (midi, i) {
      return { midi: midi, at: round(start + i * step), dur: dur, gain: gain };
    });
  }

  function chords(list, step, dur, gain) {
    var out = [];
    list.forEach(function (chord, i) {
      chord.forEach(function (midi) {
        out.push({ midi: midi, at: round(i * step), dur: dur, gain: gain });
      });
    });
    return out;
  }

  function pulse(count, step) {
    var out = [];
    var i;
    for (i = 0; i < count; i++) out.push({ tick: true, at: round(i * step), strong: i % 4 === 0 });
    return out;
  }

  var FORM_CHOICES = [
    { id: 'binary', label: '二段體　A—A′' },
    { id: 'ternary', label: '三段體　A—B—A' },
    { id: 'rondo', label: '回旋曲式　A—B—A—C—A' }
  ];
  var GENRE_CHOICES = [
    { id: 'art', label: '藝術歌曲 · 個人抒情' },
    { id: 'folk', label: '民歌 · 生活傳唱' },
    { id: 'pop', label: '流行歌曲 · 娛樂傳唱' },
    { id: 'hymn', label: '宗教歌曲 · 禮拜祈禱' }
  ];

  var TASKS = {
    form: {
      key: 'appreciate-form',
      title: '曲式聽辨',
      articles: 'B-3',
      blurb: '聽原創短句，選出二段體、三段體或回旋曲式。',
      hint: '二段體是第一段及其變化。三段體是對比之後回到開頭。回旋曲式的開頭主題會再出現，中間換了兩段不同的音樂。'
    },
    genre: {
      key: 'appreciate-genre',
      title: '歌曲體裁',
      articles: 'B-2',
      blurb: '聽原創短句，選出最接近的體裁和基本功能。這不是現成歌曲。',
      hint: '藝術歌曲較慢、像獨唱抒情。民歌多用五聲、句子重複。流行歌曲有穩定拍點和短樂句。宗教歌曲較慢，幾個音同時像讚美詩。'
    },
    traits: {
      key: 'appreciate-traits',
      title: '音樂特點',
      articles: 'B-1 · B-4',
      blurb: '用速度、力度、旋律、節奏或織體描述聽到的特點。',
      hint: 'B-4 只用原創短句說明音階或織體。沒有收錄需版權的澳門、中國或商業錄音。'
    }
  };

  function formItems() {
    var binaryA = seq([60, 62, 64, 67, 67, 64, 62, 60], 0, 0.42, 0.36, 0.24);
    var binaryAp = seq([60, 62, 64, 67, 69, 67, 65, 64], 3.8, 0.42, 0.36, 0.24);
    var binary2A = seq([62, 64, 66, 69, 69, 66, 64, 62], 0, 0.4, 0.34, 0.24);
    var binary2Ap = seq([62, 64, 66, 69, 71, 69, 67, 66], 3.6, 0.4, 0.34, 0.24);
    var ternA = seq([60, 64, 67, 72, 67, 64, 60], 0, 0.48, 0.42, 0.24);
    var ternB = seq([74, 72, 69, 67, 65, 64, 62], 3.7, 0.4, 0.34, 0.22);
    var ternBack = seq([60, 64, 67, 72, 67, 64, 60], 6.9, 0.48, 0.42, 0.24);
    var tern2A = seq([57, 60, 64, 60, 57], 0, 0.5, 0.44, 0.24);
    var tern2B = seq([69, 72, 74, 72, 69], 3.0, 0.42, 0.36, 0.22);
    var tern2Back = seq([57, 60, 64, 60, 57], 5.5, 0.5, 0.44, 0.24);
    var rondo = []
      .concat(seq([64, 62, 60, 64], 0, 0.3, 0.26, 0.26))
      .concat(seq([67, 69, 71, 67], 1.55, 0.3, 0.26, 0.22))
      .concat(seq([64, 62, 60, 64], 3.1, 0.3, 0.26, 0.26))
      .concat(seq([72, 71, 69, 67, 65, 64], 4.65, 0.28, 0.24, 0.22))
      .concat(seq([64, 62, 60, 64], 6.6, 0.3, 0.26, 0.26));
    var rondo2 = []
      .concat(seq([67, 65, 64, 67], 0, 0.32, 0.28, 0.26))
      .concat(seq([60, 62, 64, 62], 1.6, 0.32, 0.28, 0.22))
      .concat(seq([67, 65, 64, 67], 3.2, 0.32, 0.28, 0.26))
      .concat(seq([72, 71, 69, 67, 65], 4.8, 0.3, 0.26, 0.22))
      .concat(seq([67, 65, 64, 67], 6.6, 0.32, 0.28, 0.26));
    return [
      { id: 'binary-1', task: 'form', answer: 'binary', choices: FORM_CHOICES, diagram: 'A — A′', explain: '二段體：第二段是第一段的變化，沒有新主題後再回到開頭。', events: binaryA.concat(binaryAp) },
      { id: 'binary-2', task: 'form', answer: 'binary', choices: FORM_CHOICES, diagram: 'A — A′', explain: '仍是二段體。兩段旋律相近，第二段只改了結尾。', events: binary2A.concat(binary2Ap) },
      { id: 'ternary-1', task: 'form', answer: 'ternary', choices: FORM_CHOICES, diagram: 'A — B — A', explain: '三段體：中間一段旋律不同，最後回到開頭。', events: ternA.concat(ternB, ternBack) },
      { id: 'ternary-2', task: 'form', answer: 'ternary', choices: FORM_CHOICES, diagram: 'A — B — A', explain: '中間較高、較不同，最後回到第一段，所以是三段體。', events: tern2A.concat(tern2B, tern2Back) },
      { id: 'rondo-1', task: 'form', answer: 'rondo', choices: FORM_CHOICES, diagram: 'A — B — A — C — A', explain: '回旋曲式：開頭主題出現三次，中間是兩段不同的音樂。', events: rondo },
      { id: 'rondo-2', task: 'form', answer: 'rondo', choices: FORM_CHOICES, diagram: 'A — B — A — C — A', explain: '開頭的短句再回來兩次，中間換了兩段，這是回旋曲式。', events: rondo2 }
    ];
  }

  function genreItems() {
    return [
      { id: 'art-1', task: 'genre', answer: 'art', choices: GENRE_CHOICES, explain: '藝術歌曲多作個人抒情，旋律像一口氣唱完的句子。這是原創短句，不是某首藝術歌。', events: seq([60, 62, 64, 65, 67, 69, 71, 69, 67, 65, 64, 62, 60], 0, 0.5, 0.62, 0.16) },
      { id: 'art-2', task: 'genre', answer: 'art', choices: GENRE_CHOICES, explain: '速度較慢、一句拱形旋律，功能接近音樂會裡的抒情独唱。', events: seq([55, 57, 60, 62, 64, 67, 64, 62, 60, 57, 55], 0, 0.55, 0.66, 0.15) },
      { id: 'folk-1', task: 'genre', answer: 'folk', choices: GENRE_CHOICES, explain: '民歌常在生活裡傳唱，音域不寬，句子會重複。這裡是原創五聲短句，不是某地民歌。', events: seq([64, 64, 62, 60, 64, 67, 64, 62, 60, 64, 62, 60], 0, 0.34, 0.3, 0.26) },
      { id: 'folk-2', task: 'genre', answer: 'folk', choices: GENRE_CHOICES, explain: '五聲音階、句子短而重複，接近群體一起唱的民歌功能。', events: seq([67, 64, 67, 69, 67, 64, 60, 62, 64, 60, 67, 64], 0, 0.36, 0.32, 0.26) },
      { id: 'pop-1', task: 'genre', answer: 'pop', choices: GENRE_CHOICES, explain: '流行歌曲重視穩定拍點和容易跟著唱的短樂句，功能多是娛樂傳唱。', events: seq([60, 60, 64, 67, 64, 60, 67, 64], 0, 0.32, 0.22, 0.28).concat(pulse(8, 0.32)) },
      { id: 'pop-2', task: 'genre', answer: 'pop', choices: GENRE_CHOICES, explain: '拍點清楚、樂句很短，接近流行歌曲容易傳唱的特點。', events: seq([62, 62, 65, 69, 65, 62, 69, 65], 0, 0.3, 0.2, 0.28).concat(pulse(8, 0.3)) },
      { id: 'hymn-1', task: 'genre', answer: 'hymn', choices: GENRE_CHOICES, explain: '宗教歌曲常用於禮拜和祈禱，速度穩，幾個音同時，像讚美詩。', events: chords([[60, 64, 67], [62, 65, 69], [64, 67, 71], [59, 62, 67], [57, 60, 64], [55, 59, 62], [57, 60, 64], [60, 64, 67]], 0.85, 0.75, 0.11) },
      { id: 'hymn-2', task: 'genre', answer: 'hymn', choices: GENRE_CHOICES, explain: '和弦式、速度慢而平均，基本功能是禮拜情境裡的歌唱，不是流行歌的鼓點。', events: chords([[55, 59, 62], [57, 60, 64], [59, 62, 65], [60, 64, 67], [62, 65, 69], [59, 62, 65], [57, 60, 64], [55, 59, 62]], 0.9, 0.8, 0.11) }
    ];
  }

  function traitsItems() {
    var slow = [
      { id: 'slow-soft', label: '速度慢，力度弱，旋律多級進' },
      { id: 'fast-loud', label: '速度快，力度強，旋律多跳進' },
      { id: 'offbeat', label: '旋律落在拍與拍之間，像切分' },
      { id: 'chords', label: '幾個音同時響起，沒有單旋律' }
    ];
    var fast = [
      { id: 'fast-loud', label: '速度快，力度強，旋律多跳進' },
      { id: 'slow-soft', label: '速度慢，力度弱，旋律多級進' },
      { id: 'even', label: '速度中等，節奏平均，級進為主' },
      { id: 'drone', label: '長時間只停留在一個音' }
    ];
    var even = [
      { id: 'even', label: '拍點平均，旋律跟著拍走' },
      { id: 'offbeat', label: '旋律常落在拍與拍之間' },
      { id: 'free', label: '沒有明顯拍點，像說話一樣自由' },
      { id: 'chords', label: '只有同時響起的和弦' }
    ];
    var off = [
      { id: 'offbeat', label: '拍點清楚，但旋律落在拍與拍之間' },
      { id: 'even', label: '旋律和拍點同一時間出現' },
      { id: 'slow-soft', label: '速度很慢，而且沒有拍點' },
      { id: 'pentatonic', label: '重點是五聲音階，不是節奏位置' }
    ];
    var penta = [
      { id: 'pentatonic', label: '五聲音階式旋律（原創短句，不是某首民歌）' },
      { id: 'chromatic', label: '半音很多，音與音靠得很近又常升降' },
      { id: 'rhythm-only', label: '只有節奏，聽不到音高變化' },
      { id: 'one-note', label: '幾乎一直是同一個音' }
    ];
    var texture = [
      { id: 'chords', label: '幾個音同時，織體像讚美詩的和弦' },
      { id: 'solo', label: '只有一條級進的單旋律' },
      { id: 'fast-loud', label: '很快，而且大跳' },
      { id: 'drums', label: '只聽到鼓點，沒有音高' }
    ];
    return [
      { id: 'trait-slow', task: 'traits', answer: 'slow-soft', choices: slow, explain: '用術語說：速度慢、力度弱、旋律級進。這是 B-1 的描述練習。', events: seq([60, 62, 64, 65, 67, 65, 64, 62, 60], 0, 0.62, 0.7, 0.1) },
      { id: 'trait-leap', task: 'traits', answer: 'fast-loud', choices: fast, explain: '速度快、力度較強、旋律多跳進。', events: seq([60, 67, 72, 64, 71, 76, 67, 60], 0, 0.24, 0.2, 0.4) },
      { id: 'trait-even', task: 'traits', answer: 'even', choices: even, explain: '拍點平均，旋律落在拍上。', events: seq([60, 64, 67, 64, 60, 64, 67, 64], 0, 0.4, 0.32, 0.24).concat(pulse(8, 0.4)) },
      { id: 'trait-off', task: 'traits', answer: 'offbeat', choices: off, explain: '拍點在整拍，旋律卻落在兩拍中間，這是切分的感覺。', events: seq([64, 67, 64, 60, 64, 67], 0.2, 0.4, 0.18, 0.26).concat(pulse(8, 0.4)) },
      { id: 'trait-penta', task: 'traits', answer: 'pentatonic', choices: penta, explain: '這是原創五聲音階短句，用來認識中國音樂常見的音階特點，不是某首民歌，也不是澳門的現成曲例。', events: seq([60, 62, 64, 67, 69, 67, 64, 62, 60, 64, 67, 64], 0, 0.36, 0.32, 0.24) },
      { id: 'trait-chord', task: 'traits', answer: 'chords', choices: texture, explain: '幾個音同時響起，織體是和弦，不是單旋律。可用來對比不同風格的寫法，仍然是原創。', events: chords([[60, 64, 67], [62, 65, 69], [64, 67, 71], [65, 69, 72], [64, 67, 71], [60, 64, 67]], 0.8, 0.7, 0.12) }
    ];
  }

  function bank() {
    return formItems().concat(genreItems(), traitsItems());
  }

  function itemsFor(task) {
    return bank().filter(function (item) { return item.task === task; });
  }

  function pickInt(rng, count) {
    return Math.min(count - 1, Math.floor(rng() * count));
  }

  function shuffle(list, rng) {
    var copy = list.slice();
    var i;
    for (i = copy.length - 1; i > 0; i--) {
      var j = pickInt(rng, i + 1);
      var swap = copy[i];
      copy[i] = copy[j];
      copy[j] = swap;
    }
    return copy;
  }

  function present(item, rng) {
    return {
      id: item.id,
      task: item.task,
      answer: item.answer,
      explain: item.explain,
      diagram: item.diagram || '',
      choices: shuffle(item.choices, rng),
      events: item.events.slice()
    };
  }

  function buildQuestion(task, rng) {
    var random = rng || Math.random;
    var pool = itemsFor(task);
    if (!pool.length) return null;
    return present(pool[pickInt(random, pool.length)], random);
  }

  function buildRound(task, rng, count) {
    var random = rng || Math.random;
    var pool = shuffle(itemsFor(task), random);
    var need = count || CHALLENGE_COUNT;
    var out = [];
    var i = 0;
    if (!pool.length) return out;
    while (out.length < need) {
      out.push(present(pool[i % pool.length], random));
      i += 1;
    }
    return out;
  }

  function endsAt(events) {
    var end = 0;
    (events || []).forEach(function (ev) {
      var t = (ev.at || 0) + (ev.tick ? 0.12 : (ev.dur || 0));
      if (t > end) end = t;
    });
    return end;
  }

  function createRun(mode, task) {
    var meta = TASKS[task];
    return {
      mode: mode === 'challenge' ? 'challenge' : 'practice',
      task: task,
      gameKey: meta ? meta.key : '',
      score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0, asked: 0
    };
  }

  function scoreAnswer(run, isCorrect) {
    run.asked += 1;
    if (!isCorrect) { run.combo = 0; run.wrong += 1; return 0; }
    run.correct += 1;
    run.combo += 1;
    if (run.combo > run.maxCombo) run.maxCombo = run.combo;
    if (run.mode !== 'challenge') return 0;
    var points = 10 + run.combo;
    run.score += points;
    return points;
  }

  function accuracyOf(run) {
    if (!run || !run.asked) return 0;
    return Math.round((run.correct / run.asked) * 100);
  }

  function resultDetail(run) {
    if (!run || run.mode !== 'challenge' || run.asked < 1) return null;
    return { mode: 'challenge', gameKey: run.gameKey, score: run.score, accuracy: accuracyOf(run), maxCombo: run.maxCombo };
  }

  function canSavePlayer(player) {
    if (!player || !String(player.name || '').trim()) return false;
    if (root.WebGoogleAuth && root.WebGoogleAuth.tester) return false;
    var Store = root.ProfileStore;
    if (Store && typeof Store.isGuest === 'function' && Store.isGuest(player)) return false;
    return true;
  }

  var active = null;

  function audioContext() {
    var engine = root.AudioEngine;
    if (engine && typeof engine.ensureCtx === 'function') {
      var shared = engine.ensureCtx();
      if (shared) return shared;
    }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!audioContext.fallback) {
      try { audioContext.fallback = new AC(); } catch (err) { return null; }
    }
    return audioContext.fallback;
  }

  function unlock() {
    var engine = root.AudioEngine;
    if (engine && typeof engine.unlock === 'function') return engine.unlock();
    var ctx = audioContext();
    if (ctx && ctx.resume && (ctx.state === 'suspended' || ctx.state === 'interrupted')) return ctx.resume();
    return Promise.resolve(ctx);
  }

  function stop() {
    if (!active) return;
    var ctx = active.context;
    var master = active.master;
    active = null;
    try {
      var now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      master.disconnect();
    } catch (err) {}
  }

  function tone(ctx, dest, midi, when, dur, gain) {
    var freq = 440 * Math.pow(2, (midi - 69) / 12);
    var osc = ctx.createOscillator();
    var partial = ctx.createOscillator();
    var amp = ctx.createGain();
    var partialAmp = ctx.createGain();
    osc.type = 'sine';
    partial.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    partial.frequency.setValueAtTime(freq * 2, when);
    partialAmp.gain.setValueAtTime(0.16, when);
    osc.connect(amp);
    partial.connect(partialAmp);
    partialAmp.connect(amp);
    amp.connect(dest);
    var peak = gain == null ? 0.22 : gain;
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(dur, 0.08));
    osc.start(when);
    partial.start(when);
    osc.stop(when + dur + 0.03);
    partial.stop(when + dur + 0.03);
  }

  function tick(ctx, dest, when, strong) {
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(strong ? 180 : 140, when);
    osc.connect(amp);
    amp.connect(dest);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(strong ? 0.12 : 0.07, when + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    osc.start(when);
    osc.stop(when + 0.08);
  }

  function play(events) {
    var ctx = audioContext();
    unlock();
    if (!ctx || !events || !events.length) return false;
    stop();
    var master = ctx.createGain();
    master.gain.setValueAtTime(0.9, ctx.currentTime);
    master.connect(ctx.destination);
    active = { context: ctx, master: master };
    var start = ctx.currentTime + 0.05;
    events.forEach(function (ev) {
      if (ev.tick) tick(ctx, master, start + (ev.at || 0), !!ev.strong);
      else tone(ctx, master, ev.midi, start + (ev.at || 0), ev.dur || 0.4, ev.gain);
    });
    return true;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function storageKey(gameKey) {
    return 'appreciateLocalBoard_v1_' + gameKey;
  }

  function readBoard(storage, gameKey) {
    if (!storage) return [];
    try {
      var parsed = JSON.parse(storage.getItem(storageKey(gameKey)) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function sameStudent(a, b) {
    return String(a.name || '').trim() === String(b.name || '').trim()
      && String(a.class || '') === String(b.class || '')
      && String(a.id == null ? '' : a.id) === String(b.id == null ? '' : b.id);
  }

  function commitBoard(storage, gameKey, row) {
    if (!storage) return [];
    var rows = readBoard(storage, gameKey);
    var kept = null;
    rows.forEach(function (item) {
      if (item && sameStudent(item, row)) kept = item;
    });
    var next = rows.filter(function (item) { return !(item && sameStudent(item, row)); });
    if (!kept || (parseInt(row.score, 10) || 0) >= (parseInt(kept.score, 10) || 0)) next.push(row);
    else next.push(kept);
    next.sort(function (a, b) { return (parseInt(b.score, 10) || 0) - (parseInt(a.score, 10) || 0); });
    storage.setItem(storageKey(gameKey), JSON.stringify(next.slice(0, 20)));
    return next.slice(0, 5);
  }

  function mount(doc) {
    if (!doc || !doc.body || doc.body.dataset.appreciateMounted) return;
    var menu = doc.getElementById('appreciateMenu');
    var setup = doc.getElementById('appreciateSetup');
    var playPane = doc.getElementById('appreciatePlay');
    var result = doc.getElementById('appreciateResult');
    if (!menu || !setup || !playPane || !result) return;
    doc.body.dataset.appreciateMounted = '1';

    var task = 'form';
    var mode = 'practice';
    var run = createRun('practice', task);
    var queue = [];
    var question = null;
    var running = false;
    var settled = false;
    var lockAnswer = false;
    var pending = 0;

    function go(screen) {
      root.dispatchEvent(new CustomEvent('appreciate-navigate', { detail: { screen: screen } }));
    }

    function player() {
      if (doc.body.classList.contains('app-shell')) {
        var social = root.MusicAppAuth && root.MusicAppAuth.user;
        var name = (social && social.displayName) || '';
        try { if (!name) name = root.localStorage.getItem('appPlayerName') || ''; } catch (err) {}
        if (!name) return null;
        return { name: name, grade: '0', class: 'App', id: '' };
      }
      var nameEl = doc.getElementById('hubName');
      if (!nameEl || !nameEl.value) return null;
      var raw = nameEl.value;
      var name = raw;
      if (raw === '__guest__') name = '訪客';
      if (raw === '__other__') {
        var custom = doc.getElementById('hubCustomNameInput');
        name = custom ? custom.value.trim() : '';
      }
      if (!name) return null;
      return {
        name: name,
        grade: (doc.getElementById('hubGrade') || {}).value || '',
        class: (doc.getElementById('hubClass') || {}).value || '',
        id: (doc.getElementById('hubSeat') || {}).value || ''
      };
    }

    function show(which) {
      menu.hidden = which !== 'menu';
      setup.hidden = which !== 'setup';
      playPane.hidden = which !== 'play';
      result.hidden = which !== 'result';
      var back = doc.getElementById('appreciateBackHub');
      if (back) back.textContent = which === 'menu' ? '← 返回主頁' : '← 返回鑑賞';
    }

    function paintChoices() {
      var host = doc.getElementById('appreciateOptions');
      host.innerHTML = question.choices.map(function (choice) {
        return '<button type="button" class="aural-opt" data-choice="' + esc(choice.id) + '">' + esc(choice.label) + '</button>';
      }).join('');
    }

    function paintHud() {
      var score = doc.getElementById('appreciateScore');
      var meta = doc.getElementById('appreciateMeta');
      if (run.mode === 'challenge') {
        score.textContent = String(run.score);
        meta.textContent = '第 ' + Math.min(run.asked + (lockAnswer ? 0 : 1), CHALLENGE_COUNT) + ' / ' + CHALLENGE_COUNT + ' 題 · 連擊 ' + run.combo;
      } else {
        score.textContent = run.correct + ' / ' + run.asked;
        meta.textContent = '練習 · 答對 ' + run.correct + ' · 答錯 ' + run.wrong;
      }
    }

    function playCurrent() {
      if (!question) return;
      try { play(question.events); } catch (err) {}
    }

    function ask() {
      if (!running) return;
      if (run.mode === 'challenge' && run.asked >= CHALLENGE_COUNT) {
        finish();
        return;
      }
      question = run.mode === 'challenge' ? queue[run.asked] : buildQuestion(task, Math.random);
      if (!question) { finish(); return; }
      lockAnswer = false;
      doc.getElementById('appreciatePrompt').textContent = question.task === 'form'
        ? '聽完整段，再選曲式。'
        : (question.task === 'genre' ? '聽短句，選體裁和基本功能。' : '聽短句，選最符合的描述。');
      doc.getElementById('appreciateFeedback').textContent = '';
      var diagram = doc.getElementById('appreciateDiagram');
      diagram.textContent = '';
      paintChoices();
      paintHud();
      playCurrent();
    }

    function settle() {
      if (settled) return null;
      settled = true;
      running = false;
      lockAnswer = true;
      if (pending) clearTimeout(pending);
      pending = 0;
      stop();
      var detail = resultDetail(run);
      var who = player();
      if (!detail || !canSavePlayer(who)) return { detail: detail, saved: false };
      var row = {
        name: who.name,
        class: who.class || '',
        id: who.id || '',
        grade: who.grade,
        score: detail.score,
        accuracy: detail.accuracy,
        max_combo: detail.maxCombo,
        game: detail.gameKey
      };
      var rows = commitBoard(root.localStorage, detail.gameKey, row);
      root.dispatchEvent(new CustomEvent('appreciate-result', { detail: detail }));
      return { detail: detail, saved: true, rows: rows };
    }

    function renderBoard(rows, who) {
      var host = doc.getElementById('appreciateBoard');
      var list = rows || [];
      if (!list.length) { host.innerHTML = ''; return; }
      host.innerHTML = '<h3 class="aural-board-title">這部裝置的紀錄（未上傳）</h3>' + list.map(function (item, index) {
        var mine = who && String(item.name || '') === String(who.name || '');
        return '<div class="aural-board-row' + (mine ? ' is-self' : '') + '"><span>' + (index + 1) + '. ' + esc(item.name) + '</span><b>' + esc(item.score) + '</b></div>';
      }).join('');
    }

    function finish() {
      if (settled) return;
      var outcome = settle();
      var title = doc.getElementById('appreciateResultTitle');
      var body = doc.getElementById('appreciateResultBody');
      var who = player();
      if (run.mode !== 'challenge') {
        title.textContent = '練習結束';
        body.textContent = '答對 ' + run.correct + ' / ' + run.asked + '（' + accuracyOf(run) + '%）。練習分不會入榜，亦不計入聽力軸。';
        doc.getElementById('appreciateBoard').innerHTML = '';
      } else if (!run.asked) {
        title.textContent = '這一輪結束';
        body.textContent = '未作答，沒有寫入分數。';
        doc.getElementById('appreciateBoard').innerHTML = '';
      } else if (!outcome || !outcome.saved) {
        title.textContent = '這一輪結束';
        body.textContent = '這次 ' + run.score + ' 分（準確率 ' + accuracyOf(run) + '%）。訪客、測試人員或未選姓名的成績不會寫入，亦不會上傳。這不是基本學力達標。';
        doc.getElementById('appreciateBoard').innerHTML = '';
      } else {
        title.textContent = '這一輪結束';
        body.textContent = '這次 ' + run.score + ' 分（準確率 ' + outcome.detail.accuracy + '%）。已寫入本機個人檔案，沒有上傳排行榜，亦不改變七軸的聽力分數。這不是基本學力達標。';
        renderBoard(outcome.rows, who);
      }
      show('result');
    }

    function start() {
      unlock();
      run = createRun(mode, task);
      queue = mode === 'challenge' ? buildRound(task, Math.random, CHALLENGE_COUNT) : [];
      question = null;
      running = true;
      settled = false;
      doc.getElementById('appreciateEnd').textContent = mode === 'challenge' ? '結束這一輪' : '結束練習';
      show('play');
      ask();
    }

    function choose(id) {
      if (!running || lockAnswer || !question) return;
      lockAnswer = true;
      var correct = id === question.answer;
      var gained = scoreAnswer(run, correct);
      var feedback = doc.getElementById('appreciateFeedback');
      var picked = question.choices.filter(function (choice) { return choice.id === question.answer; })[0];
      feedback.textContent = (correct ? '正確。' : '未中。') + (picked ? picked.label + '。' : '') + question.explain + (gained ? '　+' + gained : '');
      var diagram = doc.getElementById('appreciateDiagram');
      diagram.textContent = question.diagram || '';
      var buttons = doc.querySelectorAll('#appreciateOptions .aural-opt');
      buttons.forEach(function (button) {
        button.disabled = true;
        if (button.getAttribute('data-choice') === question.answer) button.classList.add('is-correct');
        else if (button.getAttribute('data-choice') === id) button.classList.add('is-wrong');
      });
      paintHud();
      var done = run.mode === 'challenge' && run.asked >= CHALLENGE_COUNT;
      pending = setTimeout(function () {
        pending = 0;
        if (!running) return;
        if (done) finish();
        else ask();
      }, done ? 900 : 1400);
    }

    function openTask(next) {
      task = TASKS[next] ? next : 'form';
      mode = 'practice';
      var meta = TASKS[task];
      doc.getElementById('appreciateSetupTitle').textContent = meta.title;
      doc.getElementById('appreciateSetupBlurb').textContent = meta.blurb + '　對應 ' + meta.articles + '。不是基本學力達標。';
      doc.getElementById('appreciateSetupHint').textContent = meta.hint;
      doc.querySelectorAll('#appreciateModes [data-mode]').forEach(function (button) {
        button.classList.toggle('is-on', button.getAttribute('data-mode') === 'practice');
      });
      show('setup');
    }

    doc.getElementById('appreciateOpenForm').addEventListener('click', function () { openTask('form'); });
    doc.getElementById('appreciateOpenGenre').addEventListener('click', function () { openTask('genre'); });
    doc.getElementById('appreciateOpenTraits').addEventListener('click', function () { openTask('traits'); });
    doc.getElementById('appreciateBackHub').addEventListener('click', function () {
      if (!menu.hidden) { stop(); go('screen-hub'); return; }
      if (running) { finish(); return; }
      stop();
      show('menu');
    });
    doc.getElementById('appreciateModes').addEventListener('click', function (event) {
      var button = event.target.closest('[data-mode]');
      if (!button) return;
      mode = button.getAttribute('data-mode') === 'challenge' ? 'challenge' : 'practice';
      doc.querySelectorAll('#appreciateModes [data-mode]').forEach(function (item) {
        item.classList.toggle('is-on', item === button);
      });
    });
    doc.getElementById('appreciateStart').addEventListener('click', start);
    doc.getElementById('appreciateReplay').addEventListener('click', function () { unlock(); playCurrent(); });
    doc.getElementById('appreciateOptions').addEventListener('click', function (event) {
      var button = event.target.closest('[data-choice]');
      if (!button) return;
      choose(button.getAttribute('data-choice'));
    });
    doc.getElementById('appreciateEnd').addEventListener('click', function () { finish(); });
    doc.getElementById('appreciateAgain').addEventListener('click', function () { show('setup'); });
  }

  return {
    SOURCE_NOTE: SOURCE_NOTE,
    CHALLENGE_COUNT: CHALLENGE_COUNT,
    TASKS: TASKS,
    itemsFor: itemsFor,
    buildQuestion: buildQuestion,
    buildRound: buildRound,
    endsAt: endsAt,
    createRun: createRun,
    scoreAnswer: scoreAnswer,
    accuracyOf: accuracyOf,
    resultDetail: resultDetail,
    canSavePlayer: canSavePlayer,
    play: play,
    stop: stop,
    mount: mount
  };
});
