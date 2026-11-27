/**
 * 課堂搶答。老師控制節奏，全班同時作答。
 * 分數由課室服務計算：答對由 1000 分線性降到截止時的 500 分，答錯是 0。
 * 這一場不寫入 Google 試算表，也不寫入能力圖。
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LiveQuiz = api;
  if (root && root.document) {
    var boot = function () { api.mount(root.document); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var GAMES = [
    { id: 'staff-interval', label: '看譜辨音程' },
    { id: 'aural-interval', label: '音程聽辨' },
    { id: 'note-name', label: '音名識辨' },
    { id: 'rhythm', label: '節奏' },
    { id: 'rhythm-echo', label: '節奏跟打（投影）' },
    { id: 'terms', label: '術語' },
    { id: 'instrument', label: '樂器' }
  ];
  var ERRORS = {
    unauthorized: '請先登入課堂帳號。',
    forbidden: '只有老師可以做這一步。',
    not_joined: '請先加入這個課室。',
    bad_student: '這個身分不能加入。',
    started: '搶答已經開始，不能再加入。',
    closed: '這一題已經收卷。',
    spectating: '你本題正旁觀中，下一題會自動加入！',
    too_early: '示範還未結束，請等開始跟打提示再打拍。',
    bad_choice: '請選一個選項。',
    bad_quiz: '題目還未完成。請檢查題幹、選項、節奏小節拍數和正確答案。',
    empty: '請先加至少一題。',
    migration_required: '課室服務還沒更新。請老師稍後再試。',
    not_found: '找不到這個代碼。',
    offline: '課室服務暫時連不上。'
  };
  var LETTERS = ['A', 'B', 'C', 'D'];
  var SHAPES = ['▲', '◆', '●', '■'];

  var RHYTHM_ECHO_WINDOWS = {
    easy: { id: 'easy', label: '容易', bpm: 72, hitWindowMs: 240, perfectMs: 90 },
    medium: { id: 'medium', label: '中等', bpm: 84, hitWindowMs: 180, perfectMs: 70 },
    hard: { id: 'hard', label: '困難', bpm: 96, hitWindowMs: 135, perfectMs: 55 }
  };
  var ECHO_METERS = { '2/4': 2, '3/4': 3, '4/4': 4 };
  var ECHO_TOKENS = {
    'ta-a-a-a': [{ q: 4, vex: 'w', rest: false }],
    'ta-a-a': [{ q: 3, vex: 'hd', rest: false }],
    'ta-a': [{ q: 2, vex: 'h', rest: false }],
    'ta': [{ q: 1, vex: 'q', rest: false }],
    'ti-ti': [{ q: 0.5, vex: '8', rest: false }, { q: 0.5, vex: '8', rest: false }],
    'ti-ri-ti-ri': [
      { q: 0.25, vex: '16', rest: false },
      { q: 0.25, vex: '16', rest: false },
      { q: 0.25, vex: '16', rest: false },
      { q: 0.25, vex: '16', rest: false }
    ],
    'ti-ti-ri': [{ q: 0.5, vex: '8', rest: false }, { q: 0.25, vex: '16', rest: false }, { q: 0.25, vex: '16', rest: false }],
    'ti-ri-ti': [{ q: 0.25, vex: '16', rest: false }, { q: 0.25, vex: '16', rest: false }, { q: 0.5, vex: '8', rest: false }],
    'ri-ti-ri': [{ q: 0.25, vex: '16', rest: false }, { q: 0.5, vex: '8', rest: false }, { q: 0.25, vex: '16', rest: false }],
    'ti': [{ q: 0.5, vex: '8', rest: false }],
    'ri': [{ q: 0.25, vex: '16', rest: false }],
    'r': [{ q: 1, vex: 'qr', rest: true }],
    '休': [{ q: 1, vex: 'qr', rest: true }],
    'rh': [{ q: 2, vex: 'hr', rest: true }]
  };

  function roundBeat(v) { return Math.round(v * 1000) / 1000; }

  function expandEchoBars(bars, meter) {
    var meterBeats = ECHO_METERS[meter];
    if (!meterBeats || !Array.isArray(bars) || !bars.length || bars.length > 4) return null;
    var events = [];
    var normalizedBars = [];
    for (var b = 0; b < bars.length; b++) {
      var tokens = String(bars[b] || '').trim().split(/\s+/).filter(Boolean);
      if (!tokens.length || tokens.length > 24) return null;
      var pos = 0;
      var barOut = [];
      for (var i = 0; i < tokens.length; i++) {
        var tok = tokens[i] === '休' ? 'r' : tokens[i].toLowerCase();
        var spec = ECHO_TOKENS[tok];
        if (!spec) return null;
        barOut.push(tok);
        for (var j = 0; j < spec.length; j++) {
          events.push({
            bar: b,
            beatInBar: roundBeat(pos),
            startBeat: roundBeat(b * meterBeats + pos),
            quarters: spec[j].q,
            vex: spec[j].vex,
            rest: spec[j].rest === true,
            token: tok
          });
          pos = roundBeat(pos + spec[j].q);
        }
      }
      if (Math.abs(pos - meterBeats) > 0.002) return null;
      normalizedBars.push(barOut.join(' '));
    }
    if (!events.some(function (ev) { return !ev.rest; })) return null;
    return {
      meter: meter,
      meterBeats: meterBeats,
      bars: normalizedBars,
      totalBeats: meterBeats * normalizedBars.length,
      events: events
    };
  }

  function expectedEchoOnsetsMs(render) {
    if (!render) return [];
    var meter = ECHO_METERS[render.meter] ? render.meter : '4/4';
    var bpm = Math.max(50, Math.min(140, Math.round(Number(render.bpm) || 84)));
    var expanded = expandEchoBars(render.bars, meter);
    if (!expanded) return [];
    var beatMs = 60000 / bpm;
    return expanded.events.filter(function (ev) { return !ev.rest; }).map(function (ev) {
      return Math.round(ev.startBeat * beatMs);
    });
  }

  function gradeRhythmEcho(render, rawOnsets) {
    var levelKey = render && RHYTHM_ECHO_WINDOWS[render.level] ? render.level : 'medium';
    var win = RHYTHM_ECHO_WINDOWS[levelKey];
    var expected = expectedEchoOnsetsMs(render);
    var taps = (Array.isArray(rawOnsets) ? rawOnsets : [])
      .slice(0, 64)
      .map(function (v) { return Number(v); })
      .filter(function (v) { return Number.isFinite(v) && v >= -600 && v <= 45000; })
      .sort(function (a, b) { return a - b; });
    var used = taps.map(function () { return false; });
    var beats = [];
    var hitCount = 0;
    var perfectCount = 0;
    var absErrSum = 0;
    for (var i = 0; i < expected.length; i++) {
      var targetMs = expected[i];
      var bestIdx = -1;
      var bestAbs = Infinity;
      for (var j = 0; j < taps.length; j++) {
        if (used[j]) continue;
        var diff = Math.abs(taps[j] - targetMs);
        if (diff <= win.hitWindowMs && diff < bestAbs) {
          bestAbs = diff;
          bestIdx = j;
        }
      }
      if (bestIdx >= 0) {
        used[bestIdx] = true;
        var errMs = Math.round(taps[bestIdx] - targetMs);
        var status = bestAbs <= win.perfectMs ? 'perfect' : 'good';
        hitCount += 1;
        if (status === 'perfect') perfectCount += 1;
        absErrSum += bestAbs;
        beats.push({ index: i, expectedMs: targetMs, tapMs: Math.round(taps[bestIdx]), errorMs: errMs, status: status });
      } else {
        beats.push({ index: i, expectedMs: targetMs, tapMs: null, errorMs: null, status: 'miss' });
      }
    }
    var expectedCount = expected.length;
    var missedCount = expectedCount - hitCount;
    var extraCount = used.filter(function (u) { return !u; }).length;
    var rawAcc = expectedCount > 0 ? ((hitCount - extraCount * 0.5) / expectedCount) * 100 : 0;
    var accuracy = Math.max(0, Math.min(100, Math.round(rawAcc)));
    var verdict = 'wrong';
    if (expectedCount > 0 && missedCount === 0 && extraCount === 0) verdict = 'correct';
    else if (hitCount > 0 && accuracy >= 50) verdict = 'partial';
    var points = 0;
    if (verdict === 'correct') {
      var meanAbs = hitCount > 0 ? absErrSum / hitCount : win.hitWindowMs;
      var precision = Math.max(0, Math.min(1, 1 - meanAbs / Math.max(1, win.hitWindowMs)));
      points = 750 + Math.round(250 * precision);
    } else if (verdict === 'partial') {
      points = Math.max(100, Math.round(600 * (accuracy / 100)));
    }
    return {
      level: levelKey,
      hitWindowMs: win.hitWindowMs,
      perfectMs: win.perfectMs,
      expectedCount: expectedCount,
      hitCount: hitCount,
      perfectCount: perfectCount,
      missedCount: missedCount,
      extraCount: extraCount,
      accuracy: accuracy,
      verdict: verdict,
      correct: verdict === 'correct',
      points: points,
      beats: beats
    };
  }

  var _sfxCtx = null;
  function ensureAudioCtx() {
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      if (!_sfxCtx) _sfxCtx = new AC();
      if (_sfxCtx.state === 'suspended') _sfxCtx.resume();
      return _sfxCtx;
    } catch (err) { return null; }
  }

  function audioUnlocked() {
    return !!(_sfxCtx && _sfxCtx.state === 'running');
  }

  function playSfx(kind) {
    try {
      var ctx = ensureAudioCtx();
      if (!ctx) return;
      var now = ctx.currentTime;
      var notes = kind === 'win' ? [[523.25, 0, 0.1], [659.25, 0.08, 0.12], [783.99, 0.16, 0.2]]
        : kind === 'lose' ? [[311.13, 0, 0.14], [261.63, 0.12, 0.2]]
        : kind === 'metro1' ? [[1180, 0, 0.045]]
        : kind === 'metro' ? [[780, 0, 0.038]]
        : kind === 'demo-note' ? [[523.25, 0, 0.11], [1046.5, 0, 0.045]]
        : kind === 'drum' ? [[210, 0, 0.09], [420, 0, 0.04]]
        : kind === 'tick' ? [[880, 0, 0.045]]
        : [[587.33, 0, 0.06]];
      notes.forEach(function (n) {
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = kind === 'lose' || kind === 'demo-note' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(n[0], now + n[1]);
        if (kind === 'drum') osc.frequency.exponentialRampToValueAtTime(95, now + n[1] + n[2]);
        g.gain.setValueAtTime(kind === 'demo-note' || kind === 'drum' ? 0.16 : (kind === 'metro1' ? 0.13 : 0.08), now + n[1]);
        g.gain.exponentialRampToValueAtTime(0.001, now + n[1] + n[2]);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + n[1]);
        osc.stop(now + n[1] + n[2] + 0.02);
      });
    } catch (err) {}
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function nameBlocked(name) {
    var n = String(name || '').trim();
    if (!n || n === '訪客' || n === '測試人員' || n === '__guest__' || n === '__other__') return true;
    if (n.indexOf('訪客') === 0 || n.indexOf('測試') === 0) return true;
    return false;
  }

  function shuffle(list, rng) {
    var copy = list.slice();
    var random = rng || Math.random;
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var swap = copy[i];
      copy[i] = copy[j];
      copy[j] = swap;
    }
    return copy;
  }

  function gameLabel(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i].label;
    return id === 'custom' || !id ? '自訂題' : id;
  }

  function gradeLabel(grade) {
    return { '1': '中一', '2': '中二', '3': '中三', '4': '中四', '5': '中五', '6': '中六' }[String(grade || '')] || String(grade || '');
  }

  function buildNoteName(rng) {
    var TD = root.TheoryDrill;
    if (!TD || typeof TD.buildNoteQuestion !== 'function') return null;
    var question = TD.buildNoteQuestion({ mode: 'note-id', clef: 'treble', accidentals: false, ledgers: 0, positions: 'all' }, '', rng);
    if (!question || !question.displayName) return null;
    var letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].filter(function (letter) { return letter !== question.letter; });
    var choices = shuffle([{ id: question.displayName, label: question.displayName }].concat(shuffle(letters, rng).slice(0, 3).map(function (letter) {
      return { id: letter, label: letter };
    })), rng);
    return {
      type: 'bank',
      game: 'note-name',
      prompt: '這個音的音名是什麼？',
      choices: choices,
      correctId: question.displayName,
      render: { kind: 'staff', clef: question.clef || 'treble', notes: [{ pos: question.pos, acc: question.acc || '', x: 220 }] }
    };
  }

  function buildStaffInterval(rng) {
    var TD = root.TheoryDrill;
    if (!TD || typeof TD.buildIntervalQuestion !== 'function') return null;
    var question = TD.buildIntervalQuestion({ mode: 'staff-interval', clef: 'treble', intervalQuality: true }, '', rng);
    if (!question || !question.choices || question.choices.length < 2) return null;
    return {
      type: 'bank',
      game: 'staff-interval',
      prompt: '這兩個音是什麼音程？',
      choices: question.choices.map(function (choice) { return { id: choice.id, label: choice.label }; }),
      correctId: question.answerId,
      render: {
        kind: 'staff',
        clef: question.clef || 'treble',
        notes: [
          { pos: question.low.pos, acc: question.low.acc || '', x: 170 },
          { pos: question.high.pos, acc: question.high.acc || '', x: 270 }
        ]
      }
    };
  }

  function buildAural(rng) {
    var Aural = root.AuralInterval;
    if (!Aural || typeof Aural.buildQuestion !== 'function') return null;
    var question = Aural.buildQuestion(1, rng, false);
    if (!question || !question.choices || question.choices.length < 2) return null;
    return {
      type: 'bank',
      game: 'aural-interval',
      prompt: '聽一聽，這是什麼音程？',
      choices: question.choices.map(function (choice) { return { id: choice.id, label: choice.label }; }),
      correctId: question.correct,
      render: { kind: 'aural', midis: question.midis, harmonic: false }
    };
  }

  function buildRhythm(rng) {
    var Levels = root.RhythmLevels;
    if (!Levels || typeof Levels.completionQuestion !== 'function') return null;
    var question = null;
    for (var i = 0; i < 8; i++) {
      var next = Levels.completionQuestion('easy', rng);
      if (next && next.unique && next.choices && next.choices.length >= 2 && next.choices.length <= 4) {
        question = next;
        break;
      }
    }
    if (!question) return null;
    return {
      type: 'bank',
      game: 'rhythm',
      prompt: '這是 4/4。空位還沒有音符，請選一個時值把它填滿。',
      choices: question.choices.map(function (choice) { return { id: choice.id, label: choice.label }; }),
      correctId: question.answerId,
      render: { kind: 'rhythm', meter: '4/4', shown: question.shown, blankQuarters: question.blankQuarters }
    };
  }

  function buildTerms(rng) {
    var Terms = root.AbrsmRhythmTerms;
    if (!Terms || typeof Terms.questionsForLevel !== 'function') return null;
    var rows = Terms.questionsForLevel('terms', 'easy').filter(function (row) {
      return row && row.q && row.ans && Array.isArray(row.opts) && row.opts.length >= 2 && row.opts.length <= 4;
    });
    if (!rows.length) return null;
    var question = rows[Math.floor((rng || Math.random)() * rows.length)];
    var choices = [];
    var seen = {};
    question.opts.forEach(function (label) {
      var text = String(label || '').trim();
      if (!text || seen[text]) return;
      seen[text] = 1;
      choices.push({ id: text, label: text });
    });
    if (choices.length < 2 || !seen[question.ans]) return null;
    return {
      type: 'bank',
      game: 'terms',
      prompt: question.q,
      choices: choices.slice(0, 4),
      correctId: question.ans,
      render: { kind: 'text' }
    };
  }

  function localPhotos(spec) {
    return (spec.instruments || []).filter(function (inst) {
      return inst && inst.nameZh && /^img\/instruments\/[A-Za-z0-9._% -]+$/.test(inst.img || '');
    });
  }

  function buildInstrument(bank, rng) {
    var Cat = root.InstrumentCategory;
    if (!Cat || typeof Cat.resolve !== 'function') return null;
    var orch = localPhotos(Cat.resolve(bank || [], 'orchestra'));
    var cn = localPhotos(Cat.resolve(bank || [], 'chinese'));
    var photos = orch.concat(cn);
    if (photos.length < 2) return null;
    var correct = photos[Math.floor((rng || Math.random)() * photos.length)];
    var names = shuffle(photos.filter(function (inst) { return inst.nameZh !== correct.nameZh; }), rng).slice(0, 3);
    var choices = shuffle([{ id: correct.nameZh, label: correct.nameZh }].concat(names.map(function (inst) {
      return { id: inst.nameZh, label: inst.nameZh };
    })), rng);
    var seen = {};
    choices = choices.filter(function (choice) {
      if (seen[choice.id]) return false;
      seen[choice.id] = 1;
      return true;
    });
    if (choices.length < 2 || !seen[correct.nameZh]) return null;
    return {
      type: 'bank',
      game: 'instrument',
      prompt: '這是哪一種樂器？',
      choices: choices.slice(0, 4),
      correctId: correct.nameZh,
      render: { kind: 'instrument', image: correct.img }
    };
  }

  function buildRhythmEcho(opts, rng) {
    var cfg = opts || {};
    var level = RHYTHM_ECHO_WINDOWS[cfg.level] ? cfg.level : 'easy';
    var meter = ECHO_METERS[cfg.meter] ? cfg.meter : '4/4';
    var win = RHYTHM_ECHO_WINDOWS[level];
    var Levels = root.RhythmLevels;
    var spec = Levels && typeof Levels.challengeSpec === 'function' ? Levels.challengeSpec(level) : null;
    var bpm = Math.max(50, Math.min(140, Math.round(Number(cfg.bpm) || (spec && spec.bpm) || win.bpm)));
    var barCount = Math.max(1, Math.min(4, Math.round(Number(cfg.barCount) || 1)));
    var bars = [];
    if (Array.isArray(cfg.bars) && cfg.bars.length) {
      bars = cfg.bars.slice(0, 4);
    } else if (Levels && typeof Levels.buildBar === 'function') {
      for (var i = 0; i < barCount; i++) {
        bars.push(Levels.buildBar(level, meter, rng || Math.random));
      }
    } else {
      var fallback = meter === '2/4' ? 'ta ta' : (meter === '3/4' ? 'ta ta ta' : 'ta ti-ti ta ta');
      for (var j = 0; j < barCount; j++) bars.push(fallback);
    }
    var expanded = expandEchoBars(bars, meter);
    if (!expanded) return null;
    return {
      type: 'bank',
      game: 'rhythm-echo',
      prompt: cfg.prompt || ('先聽示範，再跟著拍子打出這段 ' + meter + ' 節奏（' + win.label + ' · ' + bpm + ' BPM）'),
      choices: [],
      correctId: '',
      render: {
        kind: 'rhythm-echo',
        meter: expanded.meter,
        bpm: bpm,
        level: level,
        bars: expanded.bars,
        countInBeats: expanded.meterBeats,
        totalBeats: expanded.totalBeats
      }
    };
  }

  function buildBankItem(game, rng, bank) {
    if (game === 'note-name') return buildNoteName(rng);
    if (game === 'staff-interval') return buildStaffInterval(rng);
    if (game === 'aural-interval') return buildAural(rng);
    if (game === 'rhythm') return buildRhythm(rng);
    if (game === 'rhythm-echo') return buildRhythmEcho({ level: 'easy', meter: '4/4', barCount: 1 }, rng);
    if (game === 'terms') return buildTerms(rng);
    if (game === 'instrument') return buildInstrument(bank, rng);
    return null;
  }

  function buildComposerCustomItem(rng) {
    var list = (root.WesternComposers && Array.isArray(root.WesternComposers.COMPOSERS) && root.WesternComposers.COMPOSERS.length)
      ? root.WesternComposers.COMPOSERS
      : [
          { nameZh: '巴赫', era: '巴洛克時期', famous: '《G弦之歌》、《布蘭登堡協奏曲》' },
          { nameZh: '韋瓦第', era: '巴洛克時期', famous: '《四季》小提琴協奏曲' },
          { nameZh: '韓德爾', era: '巴洛克時期', famous: '《彌賽亞》〈哈利路亞〉' },
          { nameZh: '海頓', era: '古典時期', famous: '《驚愕交響曲》' },
          { nameZh: '莫札特', era: '古典時期', famous: '《小夜曲》、《魔笛》' },
          { nameZh: '貝多芬', era: '古典／浪漫過渡', famous: '《命運交響曲》、《給愛麗絲》' },
          { nameZh: '舒伯特', era: '浪漫時期', famous: '《鱒魚》、《魔王》' },
          { nameZh: '蕭邦', era: '浪漫時期', famous: '《夜曲》、《革命練習曲》' },
          { nameZh: '柴可夫斯基', era: '浪漫時期', famous: '《天鵝湖》、《胡桃鉗》' },
          { nameZh: '德布西', era: '印象樂派', famous: '《月光》、《大海》' }
        ];
    var random = rng || Math.random;
    var target = list[Math.floor(random() * list.length)];
    var others = shuffle(list.filter(function (c) { return c.nameZh !== target.nameZh; }), random).slice(0, 3);
    var workTitle = (target.works && target.works.length) ? target.works[Math.floor(random() * target.works.length)].title : target.famous;
    var pool = shuffle([target].concat(others), random);
    var correctIdx = pool.indexOf(target);
    return customItem('名曲「' + workTitle + '」是哪一位作曲家的代表作？', pool.map(function (c) { return c.nameZh; }), correctIdx);
  }

  function customItem(prompt, labels, correctIndex) {
    var choices = [];
    (labels || []).forEach(function (label) {
      var text = String(label || '').trim();
      if (!text) return;
      choices.push({ id: 'c' + (choices.length + 1), label: text });
    });
    var index = Number(correctIndex);
    if (!String(prompt || '').trim() || choices.length < 2 || choices.length > 4 || !choices[index]) return null;
    return { type: 'custom', prompt: String(prompt).trim(), choices: choices, correctId: choices[index].id };
  }

  function authBase() {
    var cfg = root.MUSIC_APP_AUTH || {};
    var base = cfg.authApiBase || '';
    try {
      var host = root.location && root.location.hostname;
      var query = new URLSearchParams(root.location.search || '').get('authApi');
      if (query && (host === 'localhost' || host === '127.0.0.1')) base = query;
    } catch (err) {}
    return String(base || '').replace(/\/$/, '');
  }

  function authState() {
    var auth = root.WebGoogleAuth || {};
    var binding = auth.binding || {};
    return {
      required: !!auth.required,
      signedIn: !!auth.signedIn,
      tester: !!auth.tester,
      token: auth.token || '',
      teacher: binding.role === 'teacher',
      code: binding.role === 'code',
      binding: binding
    };
  }

  /**
   * School/device copy of the official board only.
   * Short-code students stay on the in-room board and are omitted here.
   * Guests, testers, 訪客, and names starting with 測試 are dropped again.
   * This does not upload anywhere.
   */
  function rememberOfficial(storage, view) {
    if (!storage || !view || view.host !== true || view.phase !== 'done' || !Array.isArray(view.officialBoard)) return false;
    var board = view.officialBoard.filter(function (row) {
      return row && !nameBlocked(row.name);
    }).map(function (row) {
      return {
        name: String(row.name || ''),
        grade: String(row.grade || ''),
        class: String(row.class || ''),
        seat: String(row.seat || ''),
        avatar: String(row.avatar || '🎵'),
        signature: String(row.signature || ''),
        score: Number(row.score) || 0
      };
    });
    var key = 'ncLiveOfficial.v1';
    var prev = [];
    try { prev = JSON.parse(storage.getItem(key) || '[]'); } catch (err) { prev = []; }
    if (!Array.isArray(prev)) prev = [];
    var stamp = String(view.code || '') + ':' + board.map(function (row) { return row.name + row.score; }).join(',');
    if (prev.length && prev[prev.length - 1].stamp === stamp) return false;
    prev.push({ stamp: stamp, code: view.code || '', title: view.title || '', board: board });
    storage.setItem(key, JSON.stringify(prev.slice(-20)));
    return true;
  }

  var ART = {
    join: 'img/ui/lq-join.webp',
    quiz: 'img/ui/lq-quiz.webp',
    custom: 'img/ui/lq-custom.webp',
    listen: 'img/ui/lq-listen.webp',
    notes: 'img/ui/lq-notes.webp',
    rhythm: 'img/ui/lq-rhythm.webp',
    terms: 'img/ui/lq-terms.webp',
    instrument: 'img/ui/lq-instrument.webp',
    interval: 'img/ui/lq-interval.webp',
    question: 'img/ui/lq-question.webp',
    reveal: 'img/ui/lq-reveal.webp',
    podium: 'img/ui/hub-scene-live.webp'
  };
  var BANK_ART = {
    'staff-interval': 'interval',
    'aural-interval': 'listen',
    'note-name': 'notes',
    rhythm: 'rhythm',
    'rhythm-echo': 'rhythm',
    terms: 'terms',
    instrument: 'instrument'
  };
  var STEP_LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
  var CLEF_BOTTOM = {
    treble: 4 * 7 + 2,
    bass: 2 * 7 + 4,
    alto: 3 * 7 + 3
  };

  function artTag(id, mark) {
    var src = ART[id];
    if (!src) return '';
    return '<img class="lq-art' + (mark ? ' lq-art-mark' : '') + '" src="' + esc(src) + '" alt="">';
  }

  function vexSpec(render) {
    var clef = render && (render.clef === 'bass' || render.clef === 'alto') ? render.clef : 'treble';
    var bottom = CLEF_BOTTOM[clef];
    return {
      clef: clef,
      notes: ((render && render.notes) || []).map(function (note) {
        var step = bottom + Number(note.pos);
        var octave = Math.floor(step / 7);
        var index = ((step % 7) + 7) % 7;
        var accidental = note.acc === '#' || note.acc === 'b' ? note.acc : '';
        return { key: STEP_LETTERS[index] + '/' + octave, accidental: accidental };
      })
    };
  }

  function mediaHtml(question) {
    var render = question && question.render;
    if (!render) return '';
    if (render.kind === 'staff') {
      return '<div class="lq-media"><div class="lq-vex" data-live-staff="' + esc(JSON.stringify({ clef: render.clef, notes: render.notes })) + '"></div></div>';
    }
    if (render.kind === 'aural' && Array.isArray(render.midis)) {
      return '<div class="lq-media"><button type="button" class="lq-btn" data-act="play" data-midis="' + esc(render.midis.join(',')) + '" data-harmonic="' + (render.harmonic ? '1' : '0') + '">再聽一次</button></div>';
    }
    if (render.kind === 'rhythm') {
      return '<div class="lq-media"><div class="lq-rhythm" data-live-rhythm="1" data-shown="' + esc(render.shown || '') + '" data-blank="' + esc(render.blankQuarters) + '"></div></div>';
    }
    if (render.kind === 'rhythm-echo') {
      return '<div class="lq-media"><div class="lq-echo-score lq-vex" data-live-rhythm-echo="' + esc(JSON.stringify({
        meter: render.meter,
        bpm: render.bpm,
        level: render.level,
        bars: render.bars
      })) + '"></div></div>';
    }
    if (render.kind === 'instrument' && /^img\/instruments\/[A-Za-z0-9._% -]+$/.test(render.image || '')) {
      return '<div class="lq-media"><img src="' + esc(render.image) + '" alt="樂器圖片"></div>';
    }
    return '';
  }

  function peopleHtml(players) {
    return '<ul class="lq-people">' + (players || []).map(function (player) {
      var place = [gradeLabel(player.grade), player.class, player.seat].filter(Boolean).join(' ');
      return '<li class="lq-person"><span class="lq-avatar">' + esc(player.avatar || '🎵') + '</span><span><b>' + esc(player.name) + '</b>' +
        (place ? '<small> · ' + esc(place) + '</small>' : '') + '</span></li>';
    }).join('') + '</ul>';
  }

  function boardHtml(players) {
    return '<ol class="lq-board">' + (players || []).map(function (player, idx) {
      var isLeader = idx === 0 && Number(player.score || 0) > 0;
      var correctBadge = Number(player.correctCount || 0) > 0
        ? '<span class="lq-correct-tag">✓ ' + esc(player.correctCount) + ' 題</span>'
        : '';
      return '<li class="lq-rank' + (isLeader ? ' is-leader' : '') + '"><span class="lq-avatar">' + esc(player.avatar || '🎵') + '</span><span>' + (isLeader ? '👑 ' : '') + esc(player.name) + '</span>' +
        correctBadge + (player.you ? '<span class="lq-you">你</span>' : '') + '<span class="lq-score">' + esc(player.score || 0) + '</span></li>';
    }).join('') + '</ol>';
  }

  function rosterGridHtml(players) {
    var labels = {
      correct: '✅ 全對',
      partial: '🟡 部分',
      wrong: '❌ 未中',
      missed: '⏳ 未交',
      submitted: '📩 已交',
      tapping: '🥁 跟打中',
      spectating: '👀 旁觀',
      waiting: '⌛ 等待'
    };
    return '<div class="lq-roster-grid">' + (players || []).map(function (player) {
      var st = player.roundStatus || 'waiting';
      var place = [gradeLabel(player.grade), player.class, player.seat].filter(Boolean).join(' ');
      return '<div class="lq-roster-cell st-' + esc(st) + '"><span>' + esc(player.avatar || '🎵') + ' ' + esc(player.name) +
        (place ? '<small style="opacity:.7"> ' + esc(place) + '</small>' : '') + '</span><span>' + (labels[st] || '⌛') + '</span></div>';
    }).join('') + '</div>';
  }

  function podiumHtml(players) {
    var top = (players || []).slice(0, 3);
    if (!top.length) return '';
    var order = [top[1], top[0], top[2]];
    var medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    return '<div class="lq-podium">' + order.map(function (player, index) {
      if (!player) return '<div></div>';
      var place = index === 1 ? 1 : (index === 0 ? 2 : 3);
      return '<div class="lq-pod lq-pod-' + place + '"><span>' + medals[place] + ' ' + esc(player.avatar || '🎵') + '</span><b>' + place + '</b><div>' + esc(player.name) + '</div><div>' + esc(player.score || 0) + ' 分</div></div>';
    }).join('') + '</div>';
  }

  function echoBeatsFeedbackHtml(yourEcho, showDetail) {
    if (!yourEcho) return '';
    var cls = yourEcho.verdict === 'correct' ? 'is-correct' : (yourEcho.verdict === 'partial' ? 'is-partial' : 'is-wrong');
    var heading = yourEcho.verdict === 'correct' ? '✅ 全對！節奏超準！'
      : (yourEcho.verdict === 'partial' ? '🟡 部分命中！（' + esc(yourEcho.hitCount) + '/' + esc(yourEcho.expectedCount) + ' 拍 · ' + esc(yourEcho.accuracy) + '%）'
        : '❌ 未命中全部節拍（命中 ' + esc(yourEcho.hitCount) + '/' + esc(yourEcho.expectedCount) + '）');
    var extra = Number(yourEcho.extraCount || 0) > 0 ? ' · 多打 ' + esc(yourEcho.extraCount) + ' 拍' : '';
    var pts = showDetail && typeof yourEcho.points === 'number' ? ' · 本題 +' + esc(yourEcho.points) + ' 分' : '';
    var detail = '';
    if (showDetail && Array.isArray(yourEcho.beats) && yourEcho.beats.length) {
      detail = '<div class="lq-beat-chips">' + yourEcho.beats.map(function (b, idx) {
        var tag = b.status === 'perfect' ? '精準' : (b.status === 'good' ? '命中' : '漏拍');
        var err = b.errorMs == null ? '' : (' ' + (b.errorMs >= 0 ? '+' : '') + b.errorMs + 'ms');
        return '<span class="lq-beat-chip is-' + esc(b.status) + '">第' + (idx + 1) + '音：' + tag + err + '</span>';
      }).join('') + '</div>';
    } else if (!showDetail) {
      detail = '<p class="lq-note" style="margin-top:6px;">已送出！逐拍準度細節將在老師揭示後顯示。</p>';
    }
    return '<div class="lq-echo-feedback ' + cls + '">' + heading + extra + pts + detail + '</div>';
  }

  function renderEchoQuestion(view, opts) {
    var host = !!(opts && opts.host) || !!(view && view.host);
    var projection = !!(opts && opts.projection);
    var streak = Number(opts && opts.streak || 0);
    var question = view.question;
    var r = question.render || {};
    var players = view.players || [];
    var win = RHYTHM_ECHO_WINDOWS[r.level] || RHYTHM_ECHO_WINDOWS.medium;
    var meterBeats = ECHO_METERS[r.meter] || 4;
    var tl = view.echoTimeline || null;
    var nowCal = Date.now() + Number(opts && opts.offset || 0);
    var subPhase = view.echoSubPhase || 'demo';
    if (tl) {
      if (nowCal < tl.demoStartAt) subPhase = 'prepare';
      else if (!tl.skipDemo && nowCal < tl.demoEndsAt) subPhase = 'demo';
      else if (nowCal < tl.tapStartAt) subPhase = 'count-in';
      else if (nowCal <= tl.tapEndsAt) subPhase = 'tap';
      else subPhase = 'closing';
    }
    var phaseText = '準備開始…';
    var phaseCls = '';
    if (view.spectating && !host) {
      phaseText = '👀 你本題正旁觀中，下一題會自動加入跟打！';
      phaseCls = 'is-spec';
    } else if (subPhase === 'prepare') {
      phaseText = '⏱️ 全班同步預備中…';
    } else if (subPhase === 'demo') {
      phaseText = '👂 聽示範節奏（暫未開始打拍）';
      phaseCls = 'is-demo';
    } else if (subPhase === 'count-in') {
      phaseText = '🥁 預備拍！準備跟打…';
      phaseCls = 'is-countin';
    } else if (subPhase === 'tap') {
      phaseText = view.locked ? '✅ 已送出！等待老師揭示…' : '🥁 請跟打！照著拍子點擊！';
      phaseCls = 'is-tap';
    } else {
      phaseText = '⌛ 正在結算本題節奏…';
    }

    var dots = '';
    for (var d = 0; d < meterBeats; d++) {
      dots += '<span class="lq-beat-dot' + (d === 0 ? ' is-accent' : '') + '" data-beat-dot="' + d + '"></span>';
    }
    var tapCount = Number(opts && opts.tapCount || 0);
    var expectedTotal = expectedEchoOnsetsMs(r).length;

    var studentControls = '';
    if (!host) {
      if (view.spectating) {
        studentControls = '<div class="lq-demo-shield">👀 本題旁觀模式（仍可看譜與預聽，下一題正式計分）</div>';
      } else if (view.locked && view.yourEcho) {
        studentControls = echoBeatsFeedbackHtml(view.yourEcho, false);
      } else if (subPhase === 'prepare' || subPhase === 'demo') {
        studentControls = '<div class="lq-demo-shield" id="lqEchoShield">👂 先睇譜、聽示範，預備拍完再打拍（防誤觸鎖定中）</div>';
      } else {
        var padDisabled = subPhase !== 'tap';
        studentControls = '<button type="button" class="lq-tap-pad" id="lqTapPad" data-act="echo-tap"' + (padDisabled ? ' disabled' : '') + '>' +
          '<span>🥁 點擊打拍</span>' +
          '<span class="lq-tap-sub" id="lqTapMeta">' + (padDisabled ? '等預備拍完成即可開打' : ('已擊拍 ' + tapCount + ' / ' + expectedTotal + '（或按空白鍵）')) + '</span>' +
          '</button>' +
          '<div class="lq-row" style="justify-content:center;margin-top:8px;">' +
          '<button type="button" class="lq-btn soft" id="lqEchoSubmit" data-act="echo-submit"' + (padDisabled || tapCount === 0 ? ' disabled' : '') + '>送出節奏</button>' +
          '</div>';
      }
    }

    var hostControls = host
      ? '<div class="lq-row" style="justify-content:center;margin-top:12px;">' +
        '<button type="button" class="lq-btn soft" data-act="echo-replay">🔁 重播示範</button>' +
        '<button type="button" class="lq-btn soft" data-act="echo-start-tap">🥁 立即開始跟打</button>' +
        '<button type="button" class="lq-btn" data-act="advance">👁️ 結束本題並揭示</button>' +
        '</div>'
      : '';

    var stageCard = '<section class="lq-card">' +
      '<p class="lq-tag">🥁 課堂投影節奏跟打 · 第 ' + (Number(view.index) + 1) + ' / ' + esc(view.total) + ' 題' +
      (streak >= 2 ? ' <span class="lq-streak-badge">🔥 ' + streak + ' 連勝</span>' : '') + '</p>' +
      '<div class="lq-echo-meta">' +
        '<span class="lq-pill is-' + esc(win.id) + '">難度：' + esc(win.label) + '（±' + esc(win.hitWindowMs) + 'ms）</span>' +
        '<span class="lq-pill">拍號：' + esc(r.meter) + '</span>' +
        '<span class="lq-pill">速度：' + esc(r.bpm) + ' BPM</span>' +
        '<span class="lq-pill">' + esc((r.bars || []).length) + ' 小節 · ' + esc(expectedTotal) + ' 音</span>' +
      '</div>' +
      '<div class="lq-echo-phase ' + phaseCls + '" id="lqEchoPhase">' + phaseText + '</div>' +
      '<div class="lq-beat-dots" id="lqBeatDots">' + dots + '</div>' +
      '<h2 class="lq-prompt">' + esc(question.prompt) + '</h2>' +
      mediaHtml(question) +
      studentControls +
      hostControls +
      '<p class="lq-note" style="text-align:center;margin-top:10px;">已提交 ' + esc(view.answered || 0) + ' / ' + players.length + ' 人</p>' +
      '</section>';

    if (host) {
      var sideCard = '<section class="lq-card"><h2>全班即時狀態（' + esc(view.answered || 0) + '/' + players.length + '）</h2>' +
        rosterGridHtml(players) +
        '<h2 style="margin-top:16px;">🏆 即時排名</h2>' + boardHtml(players) + '</section>';
      return projection ? ('<div class="lq-proj-split">' + stageCard + sideCard + '</div>') : (stageCard + sideCard);
    }
    return stageCard;
  }

  function renderRoom(view, opts) {
    var host = !!(opts && opts.host) || !!(view && view.host);
    var projection = !!(opts && opts.projection);
    var streak = Number(opts && opts.streak || 0);
    var phase = view.phase;
    var players = view.players || [];
    var question = view.question;
    var isEcho = !!(question && question.render && question.render.kind === 'rhythm-echo');
    var body = '';
    if (phase === 'lobby') {
      body = '<section class="lq-card">' + artTag('join') + '<p class="lq-sub">同學輸入代碼加入。老師按開始之後，全員同時同步進行。</p><p class="lq-code">' + esc(view.code) + '</p>' +
        (host && view.code ? '<div class="lq-row" style="justify-content:center;margin-bottom:8px;">' +
          '<button type="button" class="lq-btn soft" data-act="copy-link" data-code="' + esc(view.code) + '">📋 複製快速加入連結</button>' +
          '<button type="button" class="lq-btn soft" data-act="toggle-projection">' + (projection ? '✕ 退出投影模式' : '🖥️ 開啟全螢幕投影模式') + '</button>' +
          '</div>' : '') +
        '<p class="lq-note">已加入 ' + players.length + ' 人</p>' + peopleHtml(players) +
        (host ? '<div class="lq-row" style="margin-top:10px;"><button type="button" class="lq-btn" data-act="advance">開始第一題</button></div>' : '<p class="lq-note">等待老師開始。</p>') +
        '</section>';
    } else if (phase === 'question' && question) {
      if (isEcho) return renderEchoQuestion(view, opts);
      var remain = Math.max(0, Number(view.questionEndsAt) - (Date.now() + Number(opts && opts.offset || 0)));
      var ratio = view.limitMs ? Math.max(0, Math.min(1, remain / Number(view.limitMs))) : 0;
      var urgent = remain > 0 && remain <= 5000;
      body = '<section class="lq-card">' + artTag('question') + '<p class="lq-tag">' + esc(gameLabel(question.game || question.type)) + ' · 第 ' + (Number(view.index) + 1) + ' / ' + esc(view.total) + ' 題' + (streak >= 2 ? ' <span class="lq-streak-badge">🔥 ' + streak + ' 連勝</span>' : '') + '</p>' +
        '<div class="lq-count' + (urgent ? ' is-urgent' : '') + '" id="lqCount" style="--lq-p:' + Math.round(ratio * 100) + '"><span id="lqCountNum">' + Math.ceil(remain / 1000) + '</span></div>' +
        '<h2 class="lq-prompt">' + esc(question.prompt) + '</h2>' + mediaHtml(question) +
        (view.spectating && !host ? '<div class="lq-demo-shield">👀 你本題正旁觀中，下一題會自動加入！</div>' : '') +
        '<div class="lq-choices">' + (question.choices || []).map(function (choice, index) {
          return '<button type="button" class="lq-choice lq-c' + (index % 4) + '" data-act="choice" data-choice="' + esc(choice.id) + '"' + (host || view.locked || view.spectating ? ' disabled' : '') + '><span class="lq-mark" aria-label="' + LETTERS[index] + '">' + SHAPES[index % 4] + '</span><span>' + esc(choice.label) + '</span></button>';
        }).join('') + '</div><p class="lq-note">' + (view.locked ? '答案已鎖定，等待揭曉…' : '已作答 ' + esc(view.answered || 0) + ' / ' + players.length + (host ? '' : '（鍵盤 1–4 亦可作答）')) + '</p>' +
        (host ? '<div class="lq-row"><button type="button" class="lq-btn soft" data-act="advance">結束本題</button></div>' : '') +
        '</section>';
    } else if ((phase === 'reveal' || phase === 'done') && question) {
      if (isEcho) {
        var echoDetail = '<section class="lq-card">' + artTag('reveal') + '<p class="lq-tag">🥁 節奏跟打揭示 · 第 ' + (Number(view.index) + 1) + ' / ' + esc(view.total) + ' 題</p>' +
          '<h2 class="lq-prompt">' + esc(question.prompt) + '</h2>' + mediaHtml(question) +
          (host ? '<div class="lq-row" style="justify-content:center;margin:8px 0;"><button type="button" class="lq-btn soft" data-act="play-echo-demo">🔊 播放標準示範節奏</button></div>' : '') +
          (view.yourEcho ? echoBeatsFeedbackHtml(view.yourEcho, true) : (!host ? '<p class="lq-note" style="text-align:center;">本題未提交或旁觀中。</p>' : '')) +
          (host ? ('<h3 style="margin:14px 0 4px;">全班本題判定</h3>' + rosterGridHtml(players)) : '') +
          '</section>';
        var rankCard = '<section class="lq-card">' + artTag(phase === 'done' ? 'podium' : 'quiz') + '<h2>' + (phase === 'done' ? '🏆 最後名次' : '🏆 目前排名') + '</h2>' +
          (phase === 'done' ? podiumHtml(players) : '') + boardHtml(players) +
          (host ? '<div class="lq-row" style="margin-top:12px;"><button type="button" class="lq-btn" data-act="advance">' + (phase === 'done' ? '返回' : (Number(view.index) + 1 >= Number(view.total) ? '公布名次' : '下一題')) + '</button></div>' : '<p class="lq-note">等待老師繼續。</p>') +
          '<p class="lq-note">成績只留在這一場，不會寫入排行榜，也不會計入能力圖。</p></section>';
        return projection ? ('<div class="lq-proj-split">' + echoDetail + rankCard + '</div>') : (echoDetail + rankCard);
      }
      var correct = (question.choices || []).filter(function (choice) { return choice.correct; })[0];
      body = '<section class="lq-card">' + artTag('reveal') + '<p class="lq-tag">正確答案' + (streak >= 2 ? ' <span class="lq-streak-badge">🔥 ' + streak + ' 連勝</span>' : '') + '</p><h2 class="lq-prompt">' + esc(question.prompt) + '</h2>' + mediaHtml(question) +
        '<div class="lq-choices is-reveal">' + (question.choices || []).map(function (choice, index) {
          var cls = 'lq-choice lq-c' + (index % 4) + (choice.correct ? ' is-correct' : '') + (view.yourChoice === choice.id ? ' is-yours' : '');
          return '<button type="button" class="' + cls + '" disabled><span class="lq-mark" aria-label="' + LETTERS[index] + '">' + SHAPES[index % 4] + '</span><span>' + esc(choice.label) + '</span></button>';
        }).join('') + '</div><p class="lq-note">' + (correct ? '答案是「' + esc(correct.label) + '」。' : '') +
        (view.yourChoice ? ' 你這一題 ' + esc(view.yourPoints || 0) + ' 分。' : '') + '</p></section>' +
        '<section class="lq-card">' + artTag(phase === 'done' ? 'podium' : 'quiz') + '<h2>' + (phase === 'done' ? '最後名次' : '目前排名') + '</h2>' +
        (phase === 'done' ? podiumHtml(players) : '') + boardHtml(players) +
        (host ? '<div class="lq-row"><button type="button" class="lq-btn" data-act="advance">' + (phase === 'done' ? '返回' : (Number(view.index) + 1 >= Number(view.total) ? '公布名次' : '下一題')) + '</button></div>' : '<p class="lq-note">等待老師繼續。</p>') +
        '<p class="lq-note">成績只留在這一場，不會寫入排行榜，也不會計入能力圖。</p></section>';
    }
    return body;
  }

  function renderRhythm(hostEl) {
    if (!hostEl) return;
    var shown = hostEl.getAttribute('data-shown') || '';
    var blank = Number(hostEl.getAttribute('data-blank'));
    var VF = root.VexFlow;
    var Levels = root.RhythmLevels;
    if (!VF || !Levels) {
      hostEl.textContent = (shown ? shown + '  ' : '') + '？';
      return;
    }
    try {
      hostEl.innerHTML = '';
      var width = Math.max(hostEl.clientWidth || 0, 320);
      var height = 180;
      var Renderer = VF.Renderer;
      var Stave = VF.Stave;
      var StaveNote = VF.StaveNote;
      var Voice = VF.Voice;
      var Formatter = VF.Formatter;
      var Beam = VF.Beam;
      var Stem = VF.Stem;
      hostEl.classList.add('lq-vex');
      var renderer = new Renderer(hostEl, Renderer.Backends.SVG);
      renderer.resize(width, height);
      var context = renderer.getContext();
      var stave = new Stave(10, 20, width - 20);
      stave.addTimeSignature('4/4');
      stave.setContext(context).draw();
      if (typeof stave.setNoteStartX === 'function') stave.setNoteStartX(stave.getNoteStartX() + 26);
      var blankToken = { 4: 'ta-a-a-a', 2: 'ta-a', 1: 'ta', 0.5: 'ti', 0.25: 'ri' }[blank] || 'ta';
      var shownEvents = shown ? Levels.expandBar(shown) : [];
      var allEvents = Levels.expandBar((shown ? shown + ' ' : '') + blankToken);
      var notes = allEvents.map(function (event) {
        return new StaveNote(event.vex === 'w'
          ? { keys: ['b/4'], duration: event.vex }
          : { keys: ['b/4'], duration: event.vex, stemDirection: Stem.UP });
      });
      var voice = new Voice({ numBeats: 16, beatValue: 16 });
      voice.setMode(2);
      voice.addTickables(notes);
      new Formatter().joinVoices([voice]).format([voice], Math.max(80, width - 120));
      var groups = Levels.beamGroups(shown).map(function (group) {
        return group.map(function (index) { return notes[index]; });
      }).filter(function (group) { return group.length > 1; });
      voice.draw(context, stave);
      groups.forEach(function (group) {
        try { new Beam(group).setContext(context).draw(); } catch (err) {}
      });
      var blankEls = notes.slice(shownEvents.length).map(function (note) {
        return note.getSVGElement && note.getSVGElement();
      }).filter(Boolean);
      blankEls.forEach(function (el) { el.remove(); });
      var svg = hostEl.querySelector('svg');
      if (!svg || !blankEls.length) return;
      var boxes = blankEls.map(function (el) { return el.getBBox(); });
      var start = Math.min.apply(null, boxes.map(function (box) { return box.x; })) - 8;
      var end = Math.max.apply(null, boxes.map(function (box) { return box.x + box.width; })) + 12;
      var rect = root.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(start));
      rect.setAttribute('y', String(stave.getY() + 18));
      rect.setAttribute('width', String(Math.max(36, end - start)));
      rect.setAttribute('height', '72');
      rect.setAttribute('rx', '12');
      rect.setAttribute('fill', '#fff7e8');
      rect.setAttribute('stroke', '#7c3aed');
      rect.setAttribute('stroke-width', '3');
      rect.setAttribute('stroke-dasharray', '7 5');
      svg.appendChild(rect);
    } catch (err) {
      hostEl.textContent = (shown ? shown + '  ' : '') + '？';
    }
  }

  function renderRhythmEcho(hostEl) {
    if (!hostEl) return;
    var VF = root.VexFlow;
    hostEl.innerHTML = '';
    hostEl.classList.add('lq-vex');
    var payload = {};
    try { payload = JSON.parse(hostEl.getAttribute('data-live-rhythm-echo') || '{}'); } catch (err) { payload = {}; }
    var expanded = expandEchoBars(payload.bars, payload.meter || '4/4');
    if (!expanded) {
      hostEl.textContent = '節奏譜未能繪出';
      return;
    }
    if (!VF || !VF.Renderer || !VF.Stave || !VF.StaveNote) {
      hostEl.textContent = expanded.meter + ' ｜ ' + expanded.bars.join(' ｜ ');
      return;
    }
    try {
      var barCount = expanded.bars.length;
      var availW = Math.max(hostEl.clientWidth || 0, barCount > 2 ? 780 : 540);
      var padX = 16;
      var firstExtra = 64;
      var usableW = Math.max(320, availW - padX * 2);
      var baseBarW = Math.floor((usableW - firstExtra) / barCount);
      var height = 168;
      var renderer = new VF.Renderer(hostEl, VF.Renderer.Backends.SVG);
      renderer.resize(usableW + padX * 2, height);
      var context = renderer.getContext();
      var BarlineType = VF.BarlineType || (VF.Barline && VF.Barline.type);
      var soundIdx = 0;
      var cursorX = padX;

      for (var b = 0; b < barCount; b++) {
        var barW = b === 0 ? (baseBarW + firstExtra) : baseBarW;
        var stave = new VF.Stave(cursorX, 24, barW);
        if (b === 0) {
          stave.addClef('percussion');
          stave.addTimeSignature(expanded.meter);
        }
        if (b === barCount - 1 && BarlineType && BarlineType.END && typeof stave.setEndBarType === 'function') {
          stave.setEndBarType(BarlineType.END);
        }
        stave.setContext(context).draw();
        if (b === 0 && typeof stave.setNoteStartX === 'function') {
          stave.setNoteStartX(stave.getNoteStartX() + 14);
        }

        var barEvents = expanded.events.filter(function (ev) { return ev.bar === b; });
        var noteObjs = [];
        var beamRuns = [];
        var curRun = [];
        function flushBeam() {
          if (curRun.length > 1) beamRuns.push(curRun.slice());
          curRun = [];
        }

        barEvents.forEach(function (ev) {
          var isRest = ev.rest === true;
          var dur = ev.vex;
          var isDotted = dur === 'hd';
          var vfDur = isDotted ? 'h' : dur;
          var cfg = { keys: ['b/4'], duration: vfDur };
          if (!isRest && vfDur !== 'w') cfg.stemDirection = VF.Stem ? VF.Stem.UP : 1;
          var sn = new VF.StaveNote(cfg);
          if (isDotted && VF.Dot && typeof VF.Dot.buildAndAttach === 'function') {
            VF.Dot.buildAndAttach([sn], { all: true });
          } else if (isDotted && typeof sn.addDotToAll === 'function') {
            sn.addDotToAll();
          }
          noteObjs.push({ sn: sn, ev: ev, soundIndex: isRest ? -1 : soundIdx++ });
          if (isRest || ev.quarters > 0.5) {
            flushBeam();
          } else {
            var beatNum = Math.floor(ev.beatInBar + 0.001);
            if (curRun.length && Math.floor(curRun[0].ev.beatInBar + 0.001) !== beatNum) flushBeam();
            curRun.push({ sn: sn, ev: ev });
          }
        });
        flushBeam();

        var voice = new VF.Voice({ numBeats: expanded.meterBeats * 4, beatValue: 16 });
        if (typeof voice.setMode === 'function') voice.setMode(2);
        voice.addTickables(noteObjs.map(function (o) { return o.sn; }));
        var fmtWidth = Math.max(60, (b === 0 ? (barW - (stave.getNoteStartX() - cursorX) - 18) : (barW - 28)));
        new VF.Formatter().joinVoices([voice]).format([voice], fmtWidth);
        voice.draw(context, stave);

        beamRuns.forEach(function (run) {
          try {
            new VF.Beam(run.map(function (item) { return item.sn; })).setContext(context).draw();
          } catch (err) {}
        });

        noteObjs.forEach(function (o) {
          if (o.soundIndex >= 0 && o.sn.getSVGElement) {
            var el = o.sn.getSVGElement();
            if (el) el.setAttribute('data-echo-note', String(o.soundIndex));
          }
        });
        cursorX += barW;
      }

      var svg = hostEl.querySelector('svg');
      if (svg) {
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', expanded.meter + ' 節奏譜');
        svg.setAttribute('viewBox', '0 0 ' + (usableW + padX * 2) + ' ' + height);
      }
    } catch (err) {
      hostEl.textContent = expanded.meter + ' ｜ ' + expanded.bars.join(' ｜ ');
    }
  }

  function renderLiveStaff(hostEl) {
    if (!hostEl) return;
    var VF = root.VexFlow;
    hostEl.innerHTML = '';
    hostEl.classList.add('lq-vex');
    if (!VF || !VF.Renderer || !VF.Stave || !VF.StaveNote) {
      hostEl.textContent = '譜面未能繪出';
      return;
    }
    var payload = {};
    try { payload = JSON.parse(hostEl.getAttribute('data-live-staff') || '{}'); } catch (err) { payload = {}; }
    var spec = vexSpec(payload);
    if (!spec.notes.length) {
      hostEl.textContent = '譜面未能繪出';
      return;
    }
    try {
      var width = Math.max(360, Math.min(560, hostEl.clientWidth || 480));
      var height = 240;
      var renderer = new VF.Renderer(hostEl, VF.Renderer.Backends.SVG);
      renderer.resize(width, height);
      var context = renderer.getContext();
      var stave = new VF.Stave(12, 64, Math.max(220, width - 28));
      stave.addClef(spec.clef);
      stave.setContext(context).draw();
      // VexFlow's note start sits inside the treble and bass clefs. Step the notes clear of the glyph.
      if (typeof stave.setNoteStartX === 'function') stave.setNoteStartX(stave.getNoteStartX() + 40);
      var notes = spec.notes.map(function (note) {
        var staveNote = new VF.StaveNote({ clef: spec.clef, keys: [note.key], duration: 'w' });
        if (note.accidental && VF.Accidental) staveNote.addModifier(new VF.Accidental(note.accidental), 0);
        return staveNote;
      });
      var voice = new VF.Voice({ numBeats: Math.max(4, notes.length * 4), beatValue: 4 });
      if (typeof voice.setMode === 'function') voice.setMode(2);
      voice.addTickables(notes);
      new VF.Formatter().joinVoices([voice]).format([voice], Math.max(80, width - stave.getNoteStartX() - 24));
      voice.draw(context, stave);
      var svg = hostEl.querySelector('svg');
      if (svg) {
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', '五線譜');
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      }
    } catch (err) {
      hostEl.textContent = '譜面未能繪出';
    }
  }

  function hydrate(doc) {
    doc.querySelectorAll('[data-live-staff]').forEach(function (staff) { renderLiveStaff(staff); });
    doc.querySelectorAll('[data-live-rhythm]').forEach(function (rhythm) { renderRhythm(rhythm); });
    doc.querySelectorAll('[data-live-rhythm-echo]').forEach(function (echoEl) { renderRhythmEcho(echoEl); });
  }

  function mount(doc) {
    if (!doc || !doc.getElementById) return;
    var card = doc.getElementById('enterLiveQuiz');
    var host = doc.getElementById('liveQuizRoot');
    if (!card && !host) return;
    if (doc.body && doc.body.dataset.liveQuizMounted) return;
    if (doc.body) doc.body.dataset.liveQuizMounted = '1';
    var ui = {
      screen: 'home',
      quizzes: [],
      draft: { title: '', limitMs: 20000, items: [] },
      echoCfg: { level: 'easy', meter: '4/4', bpm: 72, barCount: 1, count: 3, customBars: 'ta ti-ti ta ta' },
      view: null,
      notice: '',
      offset: 0,
      sig: '',
      poll: 0,
      clock: 0,
      busy: false,
      zeroPulled: false,
      lastSec: -1,
      streak: 0,
      demo: null,
      projection: false,
      echoRunKey: '',
      echoSubPhase: '',
      echoTaps: [],
      echoSubmitted: false,
      echoLastBeatIdx: -1,
      echoLastNoteIdx: -1,
      echoMuted: false
    };

    function show(id) {
      doc.querySelectorAll('.screen').forEach(function (el) {
        el.classList.toggle('active', el.id === id);
      });
    }

    function applyProjectionClass() {
      var scr = doc.getElementById('screen-live');
      if (scr) scr.classList.toggle('lq-projection', !!ui.projection);
    }

    function toggleProjection(forceVal) {
      ui.projection = typeof forceVal === 'boolean' ? forceVal : !ui.projection;
      applyProjectionClass();
      try {
        var scr = doc.getElementById('screen-live');
        if (ui.projection && scr && !doc.fullscreenElement) {
          var req = scr.requestFullscreen || scr.webkitRequestFullscreen;
          if (typeof req === 'function') req.call(scr);
        } else if (!ui.projection && doc.fullscreenElement) {
          var ex = doc.exitFullscreen || doc.webkitExitFullscreen;
          if (typeof ex === 'function') ex.call(doc);
        }
      } catch (err) {}
      render();
    }

    function stopTimers() {
      if (ui.poll) root.clearInterval(ui.poll);
      if (ui.clock) root.clearInterval(ui.clock);
      ui.poll = 0;
      ui.clock = 0;
    }

    function noticeHtml() {
      return ui.notice ? '<p class="lq-warn">' + esc(ui.notice) + '</p>' : '';
    }

    function prefillCode() {
      try {
        var q = new URLSearchParams(root.location && root.location.search || '').get('live') || '';
        return q.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      } catch (err) { return ''; }
    }

    function wantsProjectionParam() {
      try {
        return new URLSearchParams(root.location && root.location.search || '').get('project') === '1';
      } catch (err) { return false; }
    }

    function quickEchoCardHtml(isTeacher) {
      var c = ui.echoCfg;
      return '<section class="lq-card">' + artTag('rhythm') +
        '<h2>🥁 課堂投影節奏跟打（同步看譜＋預聽＋即時排名）</h2>' +
        '<p class="lq-sub">老師接大螢幕投影一條節奏，全班 iPad 同步聽示範並跟打，系統即時判定對錯與排名（成績只留本場）。</p>' +
        '<div class="lq-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin:10px 0;">' +
          '<label class="lq-field">難度<select id="lqQuickEchoLevel">' +
            '<option value="easy"' + (c.level === 'easy' ? ' selected' : '') + '>容易（±240ms）</option>' +
            '<option value="medium"' + (c.level === 'medium' ? ' selected' : '') + '>中等（±180ms）</option>' +
            '<option value="hard"' + (c.level === 'hard' ? ' selected' : '') + '>困難（±135ms）</option>' +
          '</select></label>' +
          '<label class="lq-field">拍號<select id="lqQuickEchoMeter">' +
            '<option value="4/4"' + (c.meter === '4/4' ? ' selected' : '') + '>4/4 拍</option>' +
            '<option value="3/4"' + (c.meter === '3/4' ? ' selected' : '') + '>3/4 拍</option>' +
            '<option value="2/4"' + (c.meter === '2/4' ? ' selected' : '') + '>2/4 拍</option>' +
          '</select></label>' +
          '<label class="lq-field">每題小節<select id="lqQuickEchoBars">' +
            '<option value="1"' + (c.barCount === 1 ? ' selected' : '') + '>1 小節</option>' +
            '<option value="2"' + (c.barCount === 2 ? ' selected' : '') + '>2 小節</option>' +
          '</select></label>' +
          '<label class="lq-field">題數<select id="lqQuickEchoCount">' +
            '<option value="3"' + (c.count === 3 ? ' selected' : '') + '>3 題</option>' +
            '<option value="5"' + (c.count === 5 ? ' selected' : '') + '>5 題</option>' +
          '</select></label>' +
        '</div>' +
        '<div class="lq-row">' +
          (isTeacher ? '<button type="button" class="lq-btn" data-act="quick-echo-host">🖥️ 立即開課堂投影節奏房</button>' : '') +
          '<button type="button" class="lq-btn soft" data-act="demo-echo">⚡ 單機體驗節奏跟打</button>' +
        '</div></section>';
    }

    function homeHtml(auth) {
      var codeVal = prefillCode();
      var demoCard = '<section class="lq-card">' + artTag('quiz') + '<h2>單機互動體驗（免連線）</h2><p class="lq-sub">老師備課或課堂示範用：立即模擬課堂搶答或節奏跟打。</p>' +
        '<div class="lq-row"><button type="button" class="lq-btn soft" data-act="demo">⚡ 立即模擬 3 題搶答</button><button type="button" class="lq-btn soft" data-act="demo-echo">🥁 單機體驗節奏跟打</button></div></section>';
      var join = '<section class="lq-card">' + artTag('join') + '<h2>加入課堂</h2><p class="lq-sub">用課堂短碼或名冊姓名加入（支持選擇題搶答與節奏跟打）。代碼在老師的畫面上。</p>' +
        '<div class="lq-field"><label for="lqJoinCode">加入代碼</label><input id="lqJoinCode" maxlength="6" autocomplete="off" placeholder="例如 K7M4QP" value="' + esc(codeVal) + '"></div>' +
        '<div class="lq-row"><button type="button" class="lq-btn" data-act="join">加入</button></div></section>';
      if (!auth.signedIn) {
        return '<section class="lq-card">' + artTag('join') + '<h2>請先登入</h2><p class="lq-sub">老師用教師帳號。同學用名冊或課堂短碼。訪客和測試人員不能存正式成績。</p></section>' + demoCard;
      }
      if (auth.tester) {
        return '<section class="lq-card">' + artTag('quiz') + '<h2>測試人員</h2><p class="lq-sub">測試人員可以看畫面或進行單機模擬，不會存成正式成績。</p></section>' + demoCard;
      }
      if (!auth.teacher) return join;
      var list = ui.quizzes.map(function (quiz) {
        return '<li><span><b>' + esc(quiz.title) + '</b><small> · ' + esc(quiz.count) + ' 題</small></span><button type="button" class="lq-btn soft" data-act="host" data-id="' + esc(quiz.id) + '">主持</button></li>';
      }).join('');
      return quickEchoCardHtml(true) +
        '<section class="lq-card">' + artTag('quiz') + '<h2>我的測驗</h2>' + (list ? '<ul class="lq-items">' + list + '</ul>' : '<p class="lq-note">還沒有已儲存的測驗。</p>') +
        '<div class="lq-row"><button type="button" class="lq-btn" data-act="editor">新測驗（混合選擇題／節奏跟打）</button><button type="button" class="lq-btn soft" data-act="demo">⚡ 單機模擬試玩</button></div></section>' + join;
    }

    function editorHtml() {
      var draft = ui.draft;
      var c = ui.echoCfg;
      var items = draft.items.map(function (item, index) {
        return '<li><span><b>' + esc(gameLabel(item.game || item.type)) + '</b> ' + esc(item.prompt) + '</span><button type="button" class="lq-mini lq-btn soft" data-act="remove" data-index="' + index + '">刪除</button></li>';
      }).join('');
      var banks = GAMES.map(function (game) {
        return '<button type="button" class="lq-bank" data-act="bank" data-game="' + game.id + '">' + artTag(BANK_ART[game.id]) + '<span>' + esc(game.label) + '</span></button>';
      }).join('') + '<button type="button" class="lq-bank" data-act="bank-composer">' + artTag('custom') + '<span>西方音樂家</span></button>';
      var tokBtns = [
        ['ta', '♩ ta (1拍)'],
        ['ti-ti', '♫ ti-ti (1拍)'],
        ['ta-a', '𝅗𝅥 ta-a (2拍)'],
        ['ta-a-a-a', '𝅝 ta-a-a-a (4拍)'],
        ['ti-ri-ti-ri', '♬ 十六分×4 (1拍)'],
        ['ti-ti-ri', 'ti-ti-ri (1拍)'],
        ['ti-ri-ti', 'ti-ri-ti (1拍)'],
        ['r', '𝄽 休止 (1拍)']
      ].map(function (pair) {
        return '<button type="button" class="lq-tok-btn" data-act="echo-tok" data-tok="' + pair[0] + '">' + pair[1] + '</button>';
      }).join('');
      var previewBars = String(c.customBars || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      var previewValid = expandEchoBars(previewBars, c.meter);
      return '<section class="lq-card">' + artTag('quiz') + '<h2>新測驗（共 ' + draft.items.length + ' 題）</h2><div class="lq-grid"><label class="lq-field">測驗名稱<input id="lqTitle" maxlength="30" value="' + esc(draft.title) + '" placeholder="例如：中一音樂節奏跟打與搶答"></label>' +
        '<label class="lq-field">選擇題每題秒數<select id="lqLimit"><option value="10000"' + (draft.limitMs === 10000 ? ' selected' : '') + '>10 秒</option><option value="20000"' + (draft.limitMs === 20000 ? ' selected' : '') + '>20 秒</option><option value="30000"' + (draft.limitMs === 30000 ? ' selected' : '') + '>30 秒</option></select></label></div>' +
        '<div class="lq-row" style="margin-top:10px;"><button type="button" class="lq-btn soft" data-act="quick-mix" data-count="5">🎲 一鍵混搭 5 題</button><button type="button" class="lq-btn soft" data-act="quick-mix" data-count="10">🎲 一鍵混搭 10 題</button></div>' +
        (items ? '<ul class="lq-items">' + items + '</ul>' : '<p class="lq-note">還沒有題目。可用上方「一鍵混搭」、下方「節奏跟打」或題庫快速出題。</p>') +
        '</section>' +
        '<section class="lq-card">' + artTag('rhythm') + '<h2>🥁 新增節奏跟打題（預設或自訂 1–4 小節）</h2>' +
        '<div class="lq-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));">' +
          '<label class="lq-field">難度<select id="lqEchoLevel"><option value="easy"' + (c.level === 'easy' ? ' selected' : '') + '>容易</option><option value="medium"' + (c.level === 'medium' ? ' selected' : '') + '>中等</option><option value="hard"' + (c.level === 'hard' ? ' selected' : '') + '>困難</option></select></label>' +
          '<label class="lq-field">拍號<select id="lqEchoMeter"><option value="4/4"' + (c.meter === '4/4' ? ' selected' : '') + '>4/4</option><option value="3/4"' + (c.meter === '3/4' ? ' selected' : '') + '>3/4</option><option value="2/4"' + (c.meter === '2/4' ? ' selected' : '') + '>2/4</option></select></label>' +
          '<label class="lq-field">速度 BPM<input id="lqEchoBpm" type="number" min="50" max="140" value="' + esc(c.bpm) + '"></label>' +
        '</div>' +
        '<label class="lq-field" style="margin-top:8px;">節奏小節（多小節請用 <code>|</code> 分隔，例如 <code>ta ti-ti ta ta | ti-ti ta ta-a</code>）<input id="lqEchoBars" maxlength="140" value="' + esc(c.customBars) + '"></label>' +
        '<div class="lq-tok-bar">' + tokBtns + '<button type="button" class="lq-tok-btn" data-act="echo-tok" data-tok="|">｜ 換小節</button><button type="button" class="lq-tok-btn" data-act="echo-tok" data-tok="__clear">清除</button></div>' +
        (previewValid ? ('<div class="lq-media"><div class="lq-echo-score lq-vex" data-live-rhythm-echo="' + esc(JSON.stringify({ meter: c.meter, bpm: c.bpm, level: c.level, bars: previewValid.bars })) + '"></div></div>') : '<p class="lq-warn">目前小節拍數與拍號未完全吻合（請湊滿每小節拍數）。</p>') +
        '<div class="lq-row"><button type="button" class="lq-btn soft" data-act="add-echo-custom">➕ 加入此自訂節奏跟打題</button><button type="button" class="lq-btn soft" data-act="add-echo-preset">🎲 依難度隨機抽一條節奏跟打</button></div>' +
        '</section>' +
        '<section class="lq-card">' + artTag('custom') + '<h2>自訂選擇題</h2><div class="lq-grid"><label class="lq-field">題目<input id="lqPrompt" maxlength="80"></label>' +
        [0, 1, 2, 3].map(function (index) {
          return '<label class="lq-field">選項 ' + LETTERS[index] + '<input id="lqC' + index + '" maxlength="40"><span><input type="radio" name="lqCorrect" value="' + index + '"' + (index === 0 ? ' checked' : '') + '> 正確</span></label>';
        }).join('') + '</div><div class="lq-row"><button type="button" class="lq-btn soft" data-act="add-custom">加入自訂題</button></div></section>' +
        '<section class="lq-card">' + artTag('interval') + '<h2>從現有遊戲抽一題</h2><p class="lq-sub">看譜、聽辨、音名、節奏（空位填空／節奏跟打）、術語、樂器與西方音樂家。</p><div class="lq-banks">' + banks + '</div></section>' +
        '<div class="lq-row"><button type="button" class="lq-btn" data-act="save">儲存並開始</button></div>';
    }

    function render() {
      if (!host) return;
      var auth = authState();
      applyProjectionClass();
      var inRoom = ui.screen === 'room' && ui.view;
      var soundBtn = inRoom
        ? '<button type="button" class="lq-back" data-act="toggle-sound">' + (ui.echoMuted ? '🔇 已靜音' : (audioUnlocked() ? '🔊 聲音已開' : '🔊 啟用聲音')) + '</button>'
        : '';
      var projBtn = inRoom && ui.view.host
        ? '<button type="button" class="lq-back" data-act="toggle-projection">' + (ui.projection ? '✕ 退出投影' : '🖥️ 投影模式') + '</button>'
        : '';
      var top = '<div class="lq-top"><button type="button" class="lq-back" data-act="back">← 返回</button>' +
        (ui.projection ? '' : artTag('podium', true)) +
        '<div style="flex:1;"><h1 class="lq-title">' + (ui.projection && ui.view ? esc(ui.view.title || '課堂投影節奏跟打') : '課堂搶答') + '</h1>' +
        '<p class="lq-sub">' + (ui.demo ? '單機模擬模式（練習／示範用）' : (inRoom ? ('代碼 ' + esc(ui.view.code) + ' · 同步進行中') : '老師主持，全班同一題（支援選擇題與投影節奏跟打）。')) + '</p></div>' +
        '<div class="lq-row">' + soundBtn + projBtn + '</div></div>';
      var main = '';
      if (inRoom) {
        main = renderRoom(ui.view, {
          host: ui.view.host,
          projection: ui.projection,
          offset: ui.offset,
          streak: ui.streak,
          tapCount: ui.echoTaps.length
        });
      } else if (ui.screen === 'editor' && auth.teacher) main = editorHtml();
      else main = homeHtml(auth);
      host.innerHTML = '<div class="lq-wrap">' + top + noticeHtml() + main + '</div>';
      hydrate(doc);
    }

    function highlightEchoBeat(beatIdx, isTapPhase) {
      var dots = doc.querySelectorAll('#lqBeatDots [data-beat-dot]');
      if (!dots.length) return;
      dots.forEach(function (dot) {
        var idx = Number(dot.getAttribute('data-beat-dot'));
        dot.classList.toggle('is-on', !isTapPhase && idx === beatIdx);
        dot.classList.toggle('is-tap-on', isTapPhase && idx === beatIdx);
      });
    }

    function highlightEchoNote(noteIdx) {
      doc.querySelectorAll('[data-echo-note]').forEach(function (el) {
        var idx = Number(el.getAttribute('data-echo-note'));
        el.style.fill = idx === noteIdx ? '#ea580c' : '';
        el.style.stroke = idx === noteIdx ? '#ea580c' : '';
      });
    }

    function playManualEchoDemo(renderSpec) {
      ensureAudioCtx();
      var onsets = expectedEchoOnsetsMs(renderSpec);
      if (!onsets.length) return;
      onsets.forEach(function (ms, idx) {
        root.setTimeout(function () {
          if (!ui.echoMuted) playSfx('demo-note');
          highlightEchoNote(idx);
        }, ms);
      });
      root.setTimeout(function () { highlightEchoNote(-1); }, (onsets[onsets.length - 1] || 0) + 450);
    }

    function submitEchoTaps() {
      if (!ui.view || ui.view.phase !== 'question' || ui.view.host || ui.view.locked || ui.view.spectating || ui.echoSubmitted) return;
      ui.echoSubmitted = true;
      var payload = { onsets: ui.echoTaps.slice() };
      if (ui.demo) {
        finishDemoEcho(payload.onsets);
        return;
      }
      call('POST', '/live/rooms/' + ui.view.code + '/tap', payload).then(function (data) {
        if (!data || (data.ok === false && data.error !== 'closed')) {
          ui.echoSubmitted = false;
          ui.notice = ERRORS[data && data.error] || ERRORS.offline;
          render();
          return;
        }
        applyView(data);
      }, function () { ui.echoSubmitted = false; });
    }

    function recordEchoTap(isTouch) {
      ensureAudioCtx();
      if (!ui.view || ui.view.phase !== 'question' || ui.view.host || ui.view.locked || ui.view.spectating || ui.echoSubmitted) return;
      var tl = ui.view.echoTimeline;
      var question = ui.view.question;
      if (!tl || !question || !question.render || question.render.kind !== 'rhythm-echo') return;
      var nowCal = Date.now() + ui.offset;
      if (nowCal < tl.tapStartAt - tl.hitWindowMs || nowCal > tl.tapEndsAt) return;
      var compMs = isTouch ? 30 : 0;
      var relMs = Math.round(nowCal - tl.tapStartAt - compMs);
      ui.echoTaps.push(relMs);
      if (!ui.echoMuted) playSfx('drum');
      var pad = doc.getElementById('lqTapPad');
      if (pad) {
        pad.classList.add('is-flash');
        root.setTimeout(function () { pad.classList.remove('is-flash'); }, 90);
      }
      var expectedTotal = expectedEchoOnsetsMs(question.render).length;
      var meta = doc.getElementById('lqTapMeta');
      if (meta) meta.textContent = '已擊拍 ' + ui.echoTaps.length + ' / ' + expectedTotal + '（或按空白鍵）';
      var subBtn = doc.getElementById('lqEchoSubmit');
      if (subBtn) subBtn.disabled = false;
    }

    function tickEcho() {
      var view = ui.view;
      if (!view || view.phase !== 'question' || !view.echoTimeline || !view.question || !view.question.render) return;
      var tl = view.echoTimeline;
      var r = view.question.render;
      var nowCal = Date.now() + ui.offset;
      var subPhase = 'closing';
      if (nowCal < tl.demoStartAt) subPhase = 'prepare';
      else if (!tl.skipDemo && nowCal < tl.demoEndsAt) subPhase = 'demo';
      else if (nowCal < tl.tapStartAt) subPhase = 'count-in';
      else if (nowCal <= tl.tapEndsAt) subPhase = 'tap';

      if (subPhase !== ui.echoSubPhase) {
        ui.echoSubPhase = subPhase;
        ui.echoLastBeatIdx = -1;
        ui.echoLastNoteIdx = -1;
        render();
      }

      var meterBeats = ECHO_METERS[r.meter] || 4;
      var beatMs = tl.beatMs || (60000 / (Number(r.bpm) || 84));

      if (subPhase === 'demo') {
        var demoElapsed = nowCal - tl.demoStartAt;
        var beatNum = Math.floor(demoElapsed / beatMs);
        if (beatNum >= 0 && beatNum !== ui.echoLastBeatIdx) {
          ui.echoLastBeatIdx = beatNum;
          var dotIdx = beatNum % meterBeats;
          highlightEchoBeat(dotIdx, false);
          if (!ui.echoMuted) playSfx(dotIdx === 0 ? 'metro1' : 'metro');
        }
        var patternElapsed = demoElapsed - tl.countInMs;
        if (patternElapsed >= -20) {
          var onsets = expectedEchoOnsetsMs(r);
          for (var i = ui.echoLastNoteIdx + 1; i < onsets.length; i++) {
            if (patternElapsed >= onsets[i]) {
              ui.echoLastNoteIdx = i;
              if (!ui.echoMuted) playSfx('demo-note');
              highlightEchoNote(i);
            } else break;
          }
        }
      } else if (subPhase === 'count-in') {
        highlightEchoNote(-1);
        var ciElapsed = nowCal - tl.tapCountInAt;
        var ciBeat = Math.floor(ciElapsed / beatMs);
        if (ciBeat >= 0 && ciBeat !== ui.echoLastBeatIdx) {
          ui.echoLastBeatIdx = ciBeat;
          var ciDot = ciBeat % meterBeats;
          highlightEchoBeat(ciDot, true);
          if (!ui.echoMuted) playSfx(ciDot === 0 ? 'metro1' : 'metro');
        }
      } else if (subPhase === 'tap') {
        var tapElapsed = nowCal - tl.tapStartAt;
        var tBeat = Math.floor(tapElapsed / beatMs);
        if (tBeat >= 0 && tBeat < (r.totalBeats || meterBeats) && tBeat !== ui.echoLastBeatIdx) {
          ui.echoLastBeatIdx = tBeat;
          var tDot = tBeat % meterBeats;
          highlightEchoBeat(tDot, true);
          if (!ui.echoMuted && (view.host || !view.locked)) playSfx(tDot === 0 ? 'metro1' : 'metro');
        }
        // Highlight current target note position visually during tap
        var tapOnsets = expectedEchoOnsetsMs(r);
        var activeIdx = -1;
        for (var k = 0; k < tapOnsets.length; k++) {
          if (tapElapsed >= tapOnsets[k] - 60) activeIdx = k;
        }
        highlightEchoNote(activeIdx);
        // Auto-submit once full pattern + hitWindow finishes
        if (!view.host && !view.locked && !view.spectating && !ui.echoSubmitted && tapElapsed >= tl.patternMs + tl.hitWindowMs + 250) {
          submitEchoTaps();
        }
      }

      if (nowCal >= tl.tapEndsAt && !ui.zeroPulled) {
        ui.zeroPulled = true;
        if (ui.demo) finishDemoEcho(ui.echoTaps.slice());
        else pull();
      }
    }

    function tick() {
      if (!ui.view || ui.view.phase !== 'question') return;
      if (ui.view.echoTimeline) {
        tickEcho();
        return;
      }
      var num = doc.getElementById('lqCountNum');
      var ring = doc.getElementById('lqCount');
      if (!num) return;
      var remain = Math.max(0, Number(ui.view.questionEndsAt) - (Date.now() + ui.offset));
      var sec = Math.ceil(remain / 1000);
      num.textContent = String(sec);
      if (ring && ui.view.limitMs) {
        ring.style.setProperty('--lq-p', String(Math.round(remain / Number(ui.view.limitMs) * 100)));
        ring.classList.toggle('is-urgent', remain > 0 && remain <= 5000);
      }
      if (sec !== ui.lastSec) {
        if (sec > 0 && sec <= 5 && ui.lastSec !== -1) playSfx('tick');
        ui.lastSec = sec;
      }
      if (remain === 0 && !ui.zeroPulled) {
        ui.zeroPulled = true;
        if (ui.demo) finishDemoQuestion(null);
        else pull();
      }
    }

    function signature(view) {
      return [
        view.phase,
        view.index,
        view.answered,
        view.locked,
        view.spectating ? 1 : 0,
        view.yourChoice,
        view.yourEcho ? (view.yourEcho.verdict + ':' + (view.yourEcho.points || 0) + ':' + (view.yourEcho.beats ? 1 : 0)) : '',
        view.echoTimeline ? (view.echoTimeline.demoStartAt + ':' + view.echoTimeline.tapStartAt) : '',
        (view.players || []).map(function (player) {
          return player.name + ':' + player.score + ':' + (player.roundStatus || '') + ':' + (player.you ? 1 : 0);
        }).join('|'),
        view.question && view.question.prompt
      ].join('~');
    }

    function call(method, path, body) {
      var auth = authState();
      var base = authBase();
      if (!base || !auth.token) return Promise.resolve({ ok: false, error: 'unauthorized' });
      return root.fetch(base + path, {
        method: method,
        headers: { Authorization: 'Bearer ' + auth.token, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      }).then(function (res) {
        return res.json().then(function (data) { return data || { ok: false }; }, function () { return { ok: false, error: 'offline' }; });
      }, function () { return { ok: false, error: 'offline' }; });
    }

    function applyView(data) {
      var prevPhase = ui.view && ui.view.phase;
      var prevIdx = ui.view && ui.view.index;
      var newEchoRun = data.echoTimeline ? (data.index + ':' + data.echoTimeline.demoStartAt + ':' + data.echoTimeline.tapStartAt) : '';
      ui.offset = Number(data.serverNow || Date.now()) - Date.now();
      if (data.phase === 'question' && (prevPhase !== 'question' || prevIdx !== data.index || newEchoRun !== ui.echoRunKey)) {
        ui.zeroPulled = false;
        ui.lastSec = -1;
        ui.echoRunKey = newEchoRun;
        ui.echoSubPhase = '';
        ui.echoTaps = [];
        ui.echoSubmitted = !!data.locked;
        ui.echoLastBeatIdx = -1;
        ui.echoLastNoteIdx = -1;
      }
      if ((data.phase === 'reveal' || data.phase === 'done') && prevPhase === 'question') {
        if (data.yourChoice || data.yourEcho) {
          if (Number(data.yourPoints) > 0) { ui.streak += 1; if (!ui.echoMuted) playSfx('win'); }
          else { ui.streak = 0; if (!ui.echoMuted) playSfx('lose'); }
        }
      }
      var next = signature(data);
      ui.view = data;
      ui.notice = '';
      if (next !== ui.sig) {
        ui.sig = next;
        render();
      } else tick();
      if (data.host && data.phase === 'done') {
        try { rememberOfficial(root.localStorage, data); } catch (err) {}
      }
    }

    function pull() {
      if (!ui.view || !ui.view.code) return Promise.resolve();
      return call('GET', '/live/rooms/' + ui.view.code).then(function (data) {
        if (!data || data.ok === false) {
          ui.notice = ERRORS[data && data.error] || ERRORS.offline;
          render();
          return;
        }
        applyView(data);
      });
    }

    function beginRoom(data) {
      ui.screen = 'room';
      ui.sig = '';
      if (data.host && wantsProjectionParam()) ui.projection = true;
      applyView(data);
      stopTimers();
      ui.poll = root.setInterval(pull, 1000);
      ui.clock = root.setInterval(tick, 35);
    }

    function readDraft() {
      var title = doc.getElementById('lqTitle');
      var limit = doc.getElementById('lqLimit');
      if (title) ui.draft.title = title.value;
      if (limit) ui.draft.limitMs = Number(limit.value) || 20000;
      var elLevel = doc.getElementById('lqEchoLevel') || doc.getElementById('lqQuickEchoLevel');
      var elMeter = doc.getElementById('lqEchoMeter') || doc.getElementById('lqQuickEchoMeter');
      var elBpm = doc.getElementById('lqEchoBpm');
      var elBars = doc.getElementById('lqEchoBars');
      var elBarCount = doc.getElementById('lqQuickEchoBars');
      var elCount = doc.getElementById('lqQuickEchoCount');
      if (elLevel && RHYTHM_ECHO_WINDOWS[elLevel.value]) {
        if (elLevel.value !== ui.echoCfg.level && !elBpm) {
          ui.echoCfg.bpm = RHYTHM_ECHO_WINDOWS[elLevel.value].bpm;
        }
        ui.echoCfg.level = elLevel.value;
      }
      if (elMeter && ECHO_METERS[elMeter.value]) ui.echoCfg.meter = elMeter.value;
      if (elBpm) ui.echoCfg.bpm = Math.max(50, Math.min(140, Math.round(Number(elBpm.value) || 84)));
      if (elBars) ui.echoCfg.customBars = elBars.value;
      if (elBarCount) ui.echoCfg.barCount = Math.max(1, Math.min(4, Number(elBarCount.value) || 1));
      if (elCount) ui.echoCfg.count = Math.max(1, Math.min(10, Number(elCount.value) || 3));
    }

    function addCustom() {
      readDraft();
      var labels = [0, 1, 2, 3].map(function (index) {
        var input = doc.getElementById('lqC' + index);
        return input ? input.value : '';
      });
      var picked = doc.querySelector('input[name="lqCorrect"]:checked');
      var item = customItem(doc.getElementById('lqPrompt') && doc.getElementById('lqPrompt').value, labels, picked ? picked.value : 0);
      if (!item) {
        ui.notice = '自訂題需要題目、2 至 4 個選項，和一個正確答案。';
        render();
        return;
      }
      ui.draft.items.push(item);
      ui.notice = '';
      render();
    }

    function addEchoCustom(usePreset) {
      readDraft();
      var c = ui.echoCfg;
      var item = null;
      if (usePreset) {
        item = buildRhythmEcho({ level: c.level, meter: c.meter, bpm: c.bpm, barCount: c.barCount }, Math.random);
      } else {
        var bars = String(c.customBars || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
        item = buildRhythmEcho({ level: c.level, meter: c.meter, bpm: c.bpm, bars: bars }, Math.random);
      }
      if (!item) {
        ui.notice = '節奏小節拍數未湊滿（' + c.meter + ' 每小節需 ' + (ECHO_METERS[c.meter] || 4) + ' 拍）。';
        render();
        return;
      }
      ui.draft.items.push(item);
      if (!ui.draft.title.trim()) ui.draft.title = '課堂投影節奏跟打（' + RHYTHM_ECHO_WINDOWS[c.level].label + '）';
      ui.notice = '';
      render();
    }

    function quickEchoHost() {
      readDraft();
      ensureAudioCtx();
      var c = ui.echoCfg;
      var win = RHYTHM_ECHO_WINDOWS[c.level] || RHYTHM_ECHO_WINDOWS.easy;
      var items = [];
      for (var i = 0; i < c.count; i++) {
        var it = buildRhythmEcho({ level: c.level, meter: c.meter, bpm: win.bpm, barCount: c.barCount }, Math.random);
        if (it) items.push(it);
      }
      if (!items.length) {
        ui.notice = '無法建立節奏題目，請再試一次。';
        render();
        return;
      }
      ui.busy = true;
      var title = '節奏跟打·' + win.label + ' ' + c.meter;
      call('POST', '/live/quizzes', { title: title, limitMs: 20000, items: items }).then(function (saved) {
        if (!saved || !saved.ok) {
          ui.busy = false;
          ui.notice = ERRORS[saved && saved.error] || ERRORS.offline;
          render();
          return;
        }
        return call('POST', '/live/rooms', { quizId: saved.quiz.id }).then(function (room) {
          ui.busy = false;
          if (!room || room.ok === false) {
            ui.notice = ERRORS[room && room.error] || ERRORS.offline;
            render();
            return;
          }
          ui.projection = true;
          beginRoom(room);
        });
      });
    }

    function addBank(game) {
      readDraft();
      var ready = Promise.resolve(root.__INSTRUMENT_BANK__ || []);
      if (game === 'instrument' && (!root.__INSTRUMENT_BANK__ || !root.__INSTRUMENT_BANK__.length)) {
        ready = root.fetch('data/instrument-bank.json').then(function (res) { return res.json(); }).then(function (bank) {
          root.__INSTRUMENT_BANK__ = bank;
          return bank;
        });
      }
      ready.then(function (bank) {
        var item = game === 'rhythm-echo'
          ? buildRhythmEcho({ level: ui.echoCfg.level, meter: ui.echoCfg.meter, barCount: ui.echoCfg.barCount }, Math.random)
          : buildBankItem(game, Math.random, bank);
        if (!item) {
          ui.notice = '這一題暫時組不出來，請再抽一次。';
        } else {
          ui.draft.items.push(item);
          ui.notice = '';
        }
        render();
      }, function () {
        ui.notice = '讀不到樂器題庫。';
        render();
      });
    }

    function saveAndStart() {
      readDraft();
      if (!ui.draft.title.trim() || !ui.draft.items.length) {
        ui.notice = '請填測驗名稱，並至少加一題。';
        render();
        return;
      }
      ui.busy = true;
      call('POST', '/live/quizzes', { title: ui.draft.title.trim(), limitMs: ui.draft.limitMs, items: ui.draft.items }).then(function (saved) {
        if (!saved || !saved.ok) {
          ui.busy = false;
          ui.notice = ERRORS[saved && saved.error] || ERRORS.offline;
          render();
          return;
        }
        return call('POST', '/live/rooms', { quizId: saved.quiz.id }).then(function (room) {
          ui.busy = false;
          if (!room || room.ok === false) {
            ui.notice = ERRORS[room && room.error] || ERRORS.offline;
            render();
            return;
          }
          ui.draft = { title: '', limitMs: 20000, items: [] };
          beginRoom(room);
        });
      });
    }

    function hostSaved(id) {
      call('POST', '/live/rooms', { quizId: id }).then(function (room) {
        if (!room || room.ok === false) {
          ui.notice = ERRORS[room && room.error] || ERRORS.offline;
          render();
          return;
        }
        beginRoom(room);
      });
    }

    function join() {
      ensureAudioCtx();
      var input = doc.getElementById('lqJoinCode');
      var code = String(input && input.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      var auth = authState();
      if (!code) return;
      call('POST', '/live/rooms/' + code + '/join', {
        avatar: (auth.binding && auth.binding.avatar) || '🎵',
        signature: (auth.binding && auth.binding.signature) || '',
        spectate: true
      }).then(function (data) {
        if (!data || data.ok === false) {
          ui.notice = ERRORS[data && data.error] || ERRORS.offline;
          render();
          return;
        }
        beginRoom(data);
      });
    }

    function addComposerBank() {
      readDraft();
      var item = buildComposerCustomItem(Math.random);
      if (item) { ui.draft.items.push(item); ui.notice = ''; }
      else { ui.notice = '無法建立音樂家題目，請再試一次。'; }
      render();
    }

    function addQuickMix(count) {
      readDraft();
      var n = Math.max(1, Math.min(15, Number(count) || 5));
      var pool = ['note-name', 'staff-interval', 'rhythm', 'rhythm-echo', 'terms', 'composer'];
      var added = 0;
      for (var i = 0; i < n; i++) {
        var pick = pool[i % pool.length];
        var item = pick === 'composer' ? buildComposerCustomItem(Math.random) : buildBankItem(pick, Math.random, root.__INSTRUMENT_BANK__ || []);
        if (!item) item = buildComposerCustomItem(Math.random);
        if (item) { ui.draft.items.push(item); added++; }
      }
      if (!ui.draft.title.trim()) ui.draft.title = '課堂綜合搶答（' + ui.draft.items.length + ' 題）';
      ui.notice = added ? '已加入 ' + added + ' 題混搭題目。' : '暫時無法自動出題。';
      render();
    }

    function copyJoinLink(code) {
      try {
        var base = (root.location && root.location.origin && root.location.origin !== 'null') ? (root.location.origin + (root.location.pathname || '/')) : '';
        var text = base ? (base + '?live=' + encodeURIComponent(code)) : code;
        if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
          root.navigator.clipboard.writeText(text).then(function () {
            ui.notice = '已複製快速加入連結（代碼 ' + code + '）。';
            render();
          }, function () {
            ui.notice = '加入代碼：' + code;
            render();
          });
        } else {
          ui.notice = '加入代碼：' + code;
          render();
        }
      } catch (err) {}
    }

    function demoQuestionView(idx) {
      var d = ui.demo;
      var item = d.items[idx];
      var now = Date.now();
      if (item.render && item.render.kind === 'rhythm-echo') {
        var r = item.render;
        var win = RHYTHM_ECHO_WINDOWS[r.level] || RHYTHM_ECHO_WINDOWS.easy;
        var beatMs = 60000 / (Number(r.bpm) || win.bpm);
        var countInMs = Math.round((r.countInBeats || 4) * beatMs);
        var patternMs = Math.round((r.totalBeats || 4) * beatMs);
        var demoStartAt = now + 900;
        var demoEndsAt = demoStartAt + countInMs + patternMs;
        var tapStartAt = demoEndsAt + countInMs;
        var tapEndsAt = tapStartAt + patternMs + win.hitWindowMs + 1500;
        return {
          code: 'ECHO',
          title: '單機節奏跟打體驗',
          host: false,
          phase: 'question',
          index: idx,
          total: d.items.length,
          limitMs: tapEndsAt - now,
          questionEndsAt: tapEndsAt,
          serverNow: now,
          echoTimeline: {
            demoStartAt: demoStartAt,
            demoEndsAt: demoEndsAt,
            tapCountInAt: demoEndsAt,
            tapStartAt: tapStartAt,
            tapEndsAt: tapEndsAt,
            countInMs: countInMs,
            patternMs: patternMs,
            beatMs: beatMs,
            hitWindowMs: win.hitWindowMs,
            perfectMs: win.perfectMs,
            skipDemo: false
          },
          answered: 0,
          locked: false,
          players: d.players,
          question: item
        };
      }
      return {
        code: 'DEMO',
        title: '單機模擬搶答',
        host: false,
        phase: 'question',
        index: idx,
        total: d.items.length,
        limitMs: 15000,
        questionEndsAt: now + 15000,
        serverNow: now,
        answered: 1,
        locked: false,
        players: d.players,
        question: item
      };
    }

    function finishDemoEcho(onsets) {
      var d = ui.demo;
      if (!d || !ui.view || ui.view.phase !== 'question') return;
      var item = d.items[d.index];
      var grade = gradeRhythmEcho(item.render, onsets);
      d.players.forEach(function (p) {
        if (p.you) {
          p.score += grade.points;
          if (grade.correct) p.correctCount = (p.correctCount || 0) + 1;
          p.roundStatus = grade.verdict;
        } else {
          var ok = Math.random() < 0.72;
          p.score += ok ? Math.round(780 + Math.random() * 200) : Math.round(Math.random() * 350);
          if (ok) p.correctCount = (p.correctCount || 0) + 1;
          p.roundStatus = ok ? 'correct' : 'partial';
        }
      });
      d.players.sort(function (a, b) { return b.score - a.score; });
      var isLast = d.index + 1 >= d.items.length;
      applyView({
        code: 'ECHO',
        title: '單機節奏跟打體驗',
        host: true,
        phase: isLast ? 'done' : 'reveal',
        index: d.index,
        total: d.items.length,
        serverNow: Date.now(),
        yourEcho: grade,
        yourPoints: grade.points,
        players: d.players,
        question: item
      });
    }

    function finishDemoQuestion(choiceId) {
      var d = ui.demo;
      if (!d || !ui.view || ui.view.phase !== 'question') return;
      var item = d.items[d.index];
      var remain = Math.max(0, Number(ui.view.questionEndsAt) - Date.now());
      var ratio = Math.max(0, Math.min(1, remain / 15000));
      var isCorrect = choiceId && choiceId === item.correctId;
      var pts = isCorrect ? Math.round(500 + 500 * ratio) : 0;
      d.players.forEach(function (p) {
        if (p.you) p.score += pts;
        else p.score += Math.random() < 0.7 ? Math.round(520 + Math.random() * 420) : 0;
      });
      d.players.sort(function (a, b) { return b.score - a.score; });
      var isLast = d.index + 1 >= d.items.length;
      applyView({
        code: 'DEMO',
        title: '單機模擬搶答',
        host: true,
        phase: isLast ? 'done' : 'reveal',
        index: d.index,
        total: d.items.length,
        limitMs: 15000,
        serverNow: Date.now(),
        yourChoice: choiceId || '__timeout__',
        yourPoints: pts,
        players: d.players,
        question: {
          game: item.game,
          type: item.type,
          prompt: item.prompt,
          render: item.render,
          choices: item.choices.map(function (c) { return { id: c.id, label: c.label, correct: c.id === item.correctId }; })
        }
      });
    }

    function startDemo() {
      ensureAudioCtx();
      var items = [buildBankItem('terms', Math.random), buildComposerCustomItem(Math.random), buildBankItem('note-name', Math.random) || buildComposerCustomItem(Math.random)].filter(Boolean);
      if (!items.length) return;
      ui.demo = {
        index: 0,
        items: items,
        players: [
          { name: '你（體驗模式）', avatar: '🎹', score: 0, correctCount: 0, you: true },
          { name: '阿明（AI同學）', avatar: '🎻', score: 0, correctCount: 0 },
          { name: '小晴（AI同學）', avatar: '🎺', score: 0, correctCount: 0 }
        ]
      };
      ui.streak = 0;
      ui.screen = 'room';
      ui.sig = '';
      stopTimers();
      applyView(demoQuestionView(0));
      ui.clock = root.setInterval(tick, 35);
    }

    function startEchoDemo() {
      readDraft();
      ensureAudioCtx();
      var c = ui.echoCfg;
      var win = RHYTHM_ECHO_WINDOWS[c.level] || RHYTHM_ECHO_WINDOWS.easy;
      var items = [];
      for (var i = 0; i < 3; i++) {
        var it = buildRhythmEcho({ level: c.level, meter: c.meter, bpm: win.bpm, barCount: c.barCount }, Math.random);
        if (it) items.push(it);
      }
      if (!items.length) return;
      ui.demo = {
        index: 0,
        items: items,
        players: [
          { name: '你（體驗模式）', avatar: '🥁', score: 0, correctCount: 0, you: true },
          { name: '阿明（AI同學）', avatar: '🎻', score: 0, correctCount: 0 },
          { name: '小晴（AI同學）', avatar: '🎺', score: 0, correctCount: 0 }
        ]
      };
      ui.streak = 0;
      ui.screen = 'room';
      ui.sig = '';
      stopTimers();
      applyView(demoQuestionView(0));
      ui.clock = root.setInterval(tick, 35);
    }

    function advance(subAction) {
      ensureAudioCtx();
      if (ui.demo) {
        if (!ui.view || ui.view.phase === 'done') { leave(); return; }
        if (ui.view.phase === 'reveal') {
          ui.demo.index += 1;
          applyView(demoQuestionView(ui.demo.index));
        }
        return;
      }
      if (ui.busy) return;
      if (!ui.view || !ui.view.host) {
        if (ui.view && ui.view.phase === 'done') leave();
        return;
      }
      if (ui.view.phase === 'done') {
        leave();
        return;
      }
      ui.busy = true;
      call('POST', '/live/rooms/' + ui.view.code + '/advance', subAction ? { action: subAction } : {}).then(function (data) {
        ui.busy = false;
        if (!data || data.ok === false) {
          ui.notice = ERRORS[data && data.error] || ERRORS.offline;
          render();
          return;
        }
        applyView(data);
      }, function () { ui.busy = false; });
    }

    function answer(choiceId) {
      ensureAudioCtx();
      if (ui.demo) {
        if (!ui.view || ui.view.phase !== 'question') return;
        playSfx('tap');
        finishDemoQuestion(choiceId);
        return;
      }
      if (ui.busy || !ui.view || ui.view.host || ui.view.locked || ui.view.spectating || ui.view.phase !== 'question') return;
      ui.busy = true;
      playSfx('tap');
      call('POST', '/live/rooms/' + ui.view.code + '/answer', { choiceId: choiceId }).then(function (data) {
        ui.busy = false;
        if (!data || (data.ok === false && data.error !== 'closed')) {
          ui.notice = ERRORS[data && data.error] || ERRORS.offline;
          render();
          return;
        }
        applyView(data);
      }, function () { ui.busy = false; });
    }

    function play(button) {
      ensureAudioCtx();
      var midis = String(button.getAttribute('data-midis') || '').split(',').map(Number).filter(function (n) { return n > 0; });
      if (root.AuralAudio && typeof root.AuralAudio.play === 'function') {
        if (root.AuralAudio.unlock) root.AuralAudio.unlock();
        var gap = root.AuralAudio.MELODIC_GAP || 0.55;
        root.AuralAudio.play(midis.map(function (midi, index) { return { midi: midi, at: index * gap }; }));
        return;
      }
      if (root.TheoryDrill && typeof root.TheoryDrill.playMidis === 'function') root.TheoryDrill.playMidis(midis, button.getAttribute('data-harmonic') === '1');
    }

    function leave() {
      stopTimers();
      ui.projection = false;
      applyProjectionClass();
      ui.demo = null;
      ui.streak = 0;
      ui.busy = false;
      ui.screen = 'home';
      ui.view = null;
      ui.sig = '';
      show('screen-hub');
    }

    function open() {
      var auth = authState();
      if (auth.required && !auth.signedIn) return;
      ui.demo = null;
      ui.projection = false;
      applyProjectionClass();
      ui.streak = 0;
      ui.screen = 'home';
      ui.notice = '';
      show('screen-live');
      render();
      if (auth.teacher && auth.token) {
        call('GET', '/live/quizzes').then(function (data) {
          ui.quizzes = data && data.ok ? data.quizzes || [] : [];
          if (ui.screen === 'home') render();
        });
      }
    }

    if (card) {
      card.addEventListener('click', function (event) {
        if (event.target && event.target.closest && event.target.closest('button') && event.target.closest('button') !== card) return;
        open();
      });
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    }
    if (host) {
      host.addEventListener('pointerdown', function (event) {
        ensureAudioCtx();
        var pad = event.target && event.target.closest ? event.target.closest('[data-act="echo-tap"]') : null;
        if (pad && !pad.disabled) {
          event.preventDefault();
          recordEchoTap(event.pointerType === 'touch');
        }
      });
      host.addEventListener('change', function (event) {
        var id = event.target && event.target.id;
        if (id === 'lqEchoLevel' || id === 'lqEchoMeter' || id === 'lqEchoBpm' || id === 'lqEchoBars') {
          readDraft();
          if (id === 'lqEchoLevel' && RHYTHM_ECHO_WINDOWS[ui.echoCfg.level]) {
            ui.echoCfg.bpm = RHYTHM_ECHO_WINDOWS[ui.echoCfg.level].bpm;
          }
          if (ui.screen === 'editor') render();
        }
      });
      host.addEventListener('click', function (event) {
        var button = event.target && event.target.closest ? event.target.closest('[data-act]') : null;
        if (!button || !host.contains(button)) return;
        var act = button.getAttribute('data-act');
        if (act === 'echo-tap') return; // Handled with zero-delay on pointerdown
        if (act === 'back') leave();
        else if (act === 'editor') { ui.screen = 'editor'; ui.notice = ''; render(); }
        else if (act === 'demo') startDemo();
        else if (act === 'demo-echo') startEchoDemo();
        else if (act === 'quick-echo-host') quickEchoHost();
        else if (act === 'toggle-projection') toggleProjection();
        else if (act === 'toggle-sound') {
          ensureAudioCtx();
          ui.echoMuted = !ui.echoMuted;
          render();
        }
        else if (act === 'echo-submit') submitEchoTaps();
        else if (act === 'echo-replay') advance('replay-demo');
        else if (act === 'echo-start-tap') advance('start-tap');
        else if (act === 'play-echo-demo') {
          if (ui.view && ui.view.question && ui.view.question.render) playManualEchoDemo(ui.view.question.render);
        }
        else if (act === 'echo-tok') {
          readDraft();
          var tok = button.getAttribute('data-tok') || '';
          if (tok === '__clear') ui.echoCfg.customBars = '';
          else ui.echoCfg.customBars = (ui.echoCfg.customBars ? ui.echoCfg.customBars.trim() + ' ' : '') + tok;
          render();
        }
        else if (act === 'add-echo-custom') addEchoCustom(false);
        else if (act === 'add-echo-preset') addEchoCustom(true);
        else if (act === 'copy-link') copyJoinLink(button.getAttribute('data-code') || '');
        else if (act === 'add-custom') addCustom();
        else if (act === 'bank') addBank(button.getAttribute('data-game'));
        else if (act === 'bank-composer') addComposerBank();
        else if (act === 'quick-mix') addQuickMix(button.getAttribute('data-count'));
        else if (act === 'remove') {
          readDraft();
          ui.draft.items.splice(Number(button.getAttribute('data-index')), 1);
          render();
        }
        else if (act === 'save') saveAndStart();
        else if (act === 'host') hostSaved(button.getAttribute('data-id'));
        else if (act === 'join') join();
        else if (act === 'advance') advance();
        else if (act === 'choice') answer(button.getAttribute('data-choice'));
        else if (act === 'play') play(button);
      });
      doc.addEventListener('keydown', function (event) {
        if (ui.screen !== 'room' || !ui.view) return;
        var tag = event.target && event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (ui.view.phase === 'question' && !ui.view.host && !ui.view.locked && !ui.view.spectating) {
          if (ui.view.echoTimeline && (event.code === 'Space' || event.key === ' ')) {
            event.preventDefault();
            recordEchoTap(false);
            return;
          }
          var map = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
          var idx = map[String(event.key || '').toLowerCase()];
          var choices = ui.view.question && ui.view.question.choices;
          if (idx != null && choices && choices[idx]) {
            event.preventDefault();
            answer(choices[idx].id);
          }
        }
      });
    }

    root.LiveQuiz.open = open;
    root.LiveQuiz.paint = function (target, view, options) {
      var box = (target || doc).getElementById('liveQuizRoot');
      if (!box) return;
      show('screen-live');
      var hostFlag = options && options.host;
      var painted = Object.assign({}, view, { host: hostFlag || view.host });
      box.innerHTML = '<div class="lq-wrap"><div class="lq-top"><button type="button" class="lq-back" data-act="back">← 返回</button>' + artTag('podium', true) + '<div><h1 class="lq-title">課堂搶答</h1><p class="lq-sub">' + esc(view.title || '') + '</p></div></div>' + renderRoom(painted, { host: !!hostFlag, projection: !!(options && options.projection), offset: 0 }) + '</div>';
      hydrate(target || doc);
    };
  }

  return {
    GAMES: GAMES,
    RHYTHM_ECHO_WINDOWS: RHYTHM_ECHO_WINDOWS,
    nameBlocked: nameBlocked,
    expandEchoBars: expandEchoBars,
    expectedEchoOnsetsMs: expectedEchoOnsetsMs,
    gradeRhythmEcho: gradeRhythmEcho,
    buildRhythmEcho: buildRhythmEcho,
    buildBankItem: buildBankItem,
    customItem: customItem,
    rememberOfficial: rememberOfficial,
    ART: ART,
    vexSpec: vexSpec,
    renderRhythmEcho: renderRhythmEcho,
    renderRoom: renderRoom,
    mount: mount
  };
});
