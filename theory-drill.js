/**
 * 樂理專練室（參考 musictheory.net 設計）
 * - 三種專注題型：音名辨別（Note ID）、五線譜寫音（Note Construction）、五線譜音程辨別（Staff Interval）
 * - 老師自訂練習器（譜號、加線音域、線／間篩選、升降記號、輔助開關、固定題數）＋ 永久分享連結 (?drill=...)
 * - 離線防偽成績驗證碼（Progress Report & Code Checker）
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TheoryDrill = api;
  if (root && root.document) {
    var boot = function () { api.mount(root.document); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var NAT_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SOLFEGE = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

  // Diatonic step index: C0 = 0, D0 = 1, ..., C4 = 28, E4 = 30
  function stepOf(letter, octave) {
    return octave * 7 + LETTERS.indexOf(letter);
  }
  function fromStep(step) {
    var oct = Math.floor(step / 7);
    var idx = ((step % 7) + 7) % 7;
    return { letter: LETTERS[idx], octave: oct, step: step };
  }
  function midiOf(letter, octave, acc) {
    var shift = acc === '#' ? 1 : (acc === 'b' ? -1 : 0);
    return (octave + 1) * 12 + NAT_SEMI[letter] + shift;
  }

  // Bottom staff line (pos 0) to top staff line (pos 8)
  var CLEFS = {
    treble: { id: 'treble', label: '高音譜號', symbol: '𝄞', bottomStep: stepOf('E', 4), helperLines: '線：E G B D F', helperSpaces: '間：F A C E' },
    bass:   { id: 'bass',   label: '低音譜號', symbol: '𝄢', bottomStep: stepOf('G', 2), helperLines: '線：G B D F A', helperSpaces: '間：A C E G' },
    alto:   { id: 'alto',   label: '中音譜號', symbol: '𝄡', bottomStep: stepOf('F', 3), helperLines: '線：F A C E G', helperSpaces: '間：G B D F' }
  };

  var INTERVALS = [
    { id: 'm2', size: 2, semi: 1, label: '小二度', sizeLabel: '二度' },
    { id: 'M2', size: 2, semi: 2, label: '大二度', sizeLabel: '二度' },
    { id: 'm3', size: 3, semi: 3, label: '小三度', sizeLabel: '三度' },
    { id: 'M3', size: 3, semi: 4, label: '大三度', sizeLabel: '三度' },
    { id: 'P4', size: 4, semi: 5, label: '純四度', sizeLabel: '四度' },
    { id: 'P5', size: 5, semi: 7, label: '純五度', sizeLabel: '五度' },
    { id: 'm6', size: 6, semi: 8, label: '小六度', sizeLabel: '六度' },
    { id: 'M6', size: 6, semi: 9, label: '大六度', sizeLabel: '六度' },
    { id: 'm7', size: 7, semi: 10, label: '小七度', sizeLabel: '七度' },
    { id: 'M7', size: 7, semi: 11, label: '大七度', sizeLabel: '七度' },
    { id: 'P8', size: 8, semi: 12, label: '純八度', sizeLabel: '八度' }
  ];

  var DEFAULT_CONFIG = {
    mode: 'note-id',       // 'note-id' | 'note-construct' | 'staff-interval'
    clef: 'treble',        // 'treble' | 'bass' | 'alto' | 'mixed'
    ledgers: 1,            // 0 | 1 | 2
    positions: 'all',      // 'all' | 'lines' | 'spaces'
    accidentals: true,     // boolean
    helpers: false,        // boolean
    intervalQuality: true, // boolean (for staff-interval: false = generic size only)
    questionLimit: 0       // 0 = unlimited, or 15 / 20 / 25
  };

  function normalizeConfig(raw) {
    var src = raw || {};
    var mode = ['note-id', 'note-construct', 'staff-interval'].indexOf(src.mode) !== -1 ? src.mode : 'note-id';
    var clef = ['treble', 'bass', 'alto', 'mixed'].indexOf(src.clef) !== -1 ? src.clef : 'treble';
    var ledgers = parseInt(src.ledgers, 10);
    if (isNaN(ledgers) || ledgers < 0) ledgers = 0;
    if (ledgers > 2) ledgers = 2;
    var positions = ['all', 'lines', 'spaces'].indexOf(src.positions) !== -1 ? src.positions : 'all';
    var qLimit = parseInt(src.questionLimit, 10);
    if ([0, 15, 20, 25].indexOf(qLimit) === -1) qLimit = 0;
    return {
      mode: mode,
      clef: clef,
      ledgers: ledgers,
      positions: positions,
      accidentals: src.accidentals !== false,
      helpers: !!src.helpers,
      intervalQuality: src.intervalQuality !== false,
      questionLimit: qLimit
    };
  }

  // Pure-JS Base64URL encode/decode (works in browsers, Capacitor, and isolated VM tests)
  var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function utf8Bytes(str) {
    var s = encodeURIComponent(str);
    var out = [];
    for (var i = 0; i < s.length; i++) {
      if (s.charAt(i) === '%') {
        out.push(parseInt(s.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        out.push(s.charCodeAt(i));
      }
    }
    return out;
  }
  function bytesToUtf8(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += '%' + ('00' + bytes[i].toString(16)).slice(-2);
    }
    return decodeURIComponent(hex);
  }
  function toBase64Url(str) {
    var bytes = utf8Bytes(str);
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += B64_CHARS[b0 >> 2];
      out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
      if (i + 1 < bytes.length) out += B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)];
      if (i + 2 < bytes.length) out += B64_CHARS[b2 & 63];
    }
    return out;
  }
  function fromBase64Url(token) {
    var clean = String(token || '').replace(/=+$/, '');
    var bytes = [];
    for (var i = 0; i < clean.length; i += 4) {
      var c0 = B64_CHARS.indexOf(clean.charAt(i));
      var c1 = B64_CHARS.indexOf(clean.charAt(i + 1));
      var c2 = i + 2 < clean.length ? B64_CHARS.indexOf(clean.charAt(i + 2)) : -1;
      var c3 = i + 3 < clean.length ? B64_CHARS.indexOf(clean.charAt(i + 3)) : -1;
      if (c0 < 0 || c1 < 0) throw new Error('Invalid base64url');
      bytes.push((c0 << 2) | (c1 >> 4));
      if (c2 >= 0) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
      if (c3 >= 0) bytes.push(((c2 & 3) << 6) | c3);
    }
    return bytesToUtf8(bytes);
  }

  function encodeConfig(cfg) {
    var c = normalizeConfig(cfg);
    return toBase64Url(JSON.stringify({
      m: c.mode,
      c: c.clef,
      l: c.ledgers,
      p: c.positions,
      a: c.accidentals ? 1 : 0,
      h: c.helpers ? 1 : 0,
      iq: c.intervalQuality ? 1 : 0,
      q: c.questionLimit
    }));
  }

  function decodeConfig(token) {
    try {
      var obj = JSON.parse(fromBase64Url(token));
      return normalizeConfig({
        mode: obj.m,
        clef: obj.c,
        ledgers: obj.l,
        positions: obj.p,
        accidentals: obj.a !== 0,
        helpers: obj.h === 1,
        intervalQuality: obj.iq !== 0,
        questionLimit: obj.q
      });
    } catch (err) {
      return null;
    }
  }

  // Tamper-resistant offline Progress Report Verification Code (FNV-1a checksum)
  function checksum(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0).toString(36)).toUpperCase().padStart(6, '0').slice(0, 6);
  }

  function signReport(report) {
    var payload = {
      n: String(report.name || '').trim().slice(0, 24),
      m: report.mode || 'note-id',
      c: report.clef || 'treble',
      ok: parseInt(report.correct, 10) || 0,
      tot: parseInt(report.total, 10) || 0,
      acc: parseInt(report.accuracy, 10) || 0,
      ts: report.ts || Date.now()
    };
    var encoded = toBase64Url(JSON.stringify(payload));
    return 'NT-' + checksum(encoded) + '-' + encoded;
  }

  function verifyReport(code) {
    var trimmed = String(code || '').trim();
    var m = trimmed.match(/^NT-([A-Z0-9]{6})-([A-Za-z0-9_-]+)$/);
    if (!m) return { valid: false, error: '驗證碼格式不正確' };
    if (checksum(m[2]) !== m[1]) return { valid: false, error: '驗證碼校驗失敗（可能被修改或複製不完整）' };
    try {
      var data = JSON.parse(fromBase64Url(m[2]));
      return {
        valid: true,
        report: {
          name: data.n || '未署名',
          mode: data.m,
          clef: data.c,
          correct: data.ok,
          total: data.tot,
          accuracy: data.acc,
          ts: data.ts
        }
      };
    } catch (err) {
      return { valid: false, error: '驗證碼內容損毀' };
    }
  }

  function pickInt(rng, n) {
    return Math.min(n - 1, Math.floor(rng() * n));
  }

  function resolveClef(clefSetting, rng) {
    if (clefSetting === 'mixed') return rng() < 0.5 ? 'treble' : 'bass';
    return CLEFS[clefSetting] ? clefSetting : 'treble';
  }

  function allowedPositions(ledgers, positions) {
    var minPos = ledgers ? -(ledgers * 2) : 0;
    var maxPos = 8 + (ledgers * 2);
    var list = [];
    for (var p = minPos; p <= maxPos; p++) {
      var isLine = ((p % 2) + 2) % 2 === 0;
      if (positions === 'lines' && !isLine) continue;
      if (positions === 'spaces' && isLine) continue;
      list.push(p);
    }
    return list;
  }

  function displayAcc(acc) {
    if (acc === '#') return '♯';
    if (acc === 'b') return '♭';
    return '';
  }

  function formatNoteName(letter, acc) {
    return letter + displayAcc(acc);
  }

  function buildNoteQuestion(cfg, lastKey, rng) {
    var r = rng || Math.random;
    var c = normalizeConfig(cfg);
    var clefId = resolveClef(c.clef, r);
    var clef = CLEFS[clefId];
    var posList = allowedPositions(c.ledgers, c.positions);
    var pos = posList[pickInt(r, posList.length)];
    var acc = '';
    for (var tries = 0; tries < 10; tries++) {
      pos = posList[pickInt(r, posList.length)];
      acc = '';
      if (c.accidentals && r() < 0.42) {
        var isSharp = r() < 0.5;
        var base = fromStep(clef.bottomStep + pos);
        if (isSharp && base.letter !== 'E' && base.letter !== 'B') acc = '#';
        else if (!isSharp && base.letter !== 'F' && base.letter !== 'C') acc = 'b';
      }
      var infoTry = fromStep(clef.bottomStep + pos);
      var keyTry = clefId + ':' + infoTry.letter + acc + infoTry.octave;
      if (keyTry !== lastKey) break;
    }
    var info = fromStep(clef.bottomStep + pos);
    return {
      kind: c.mode,
      clef: clefId,
      pos: pos,
      letter: info.letter,
      octave: info.octave,
      acc: acc,
      answerKey: info.letter + acc,
      displayName: formatNoteName(info.letter, acc),
      fullName: formatNoteName(info.letter, acc) + info.octave,
      midi: midiOf(info.letter, info.octave, acc)
    };
  }

  function buildIntervalQuestion(cfg, lastKey, rng) {
    var r = rng || Math.random;
    var c = normalizeConfig(cfg);
    var clefId = resolveClef(c.clef, r);
    var clef = CLEFS[clefId];
    var pool = c.intervalQuality ? INTERVALS : INTERVALS.filter(function (iv) {
      return ['M2', 'M3', 'P4', 'P5', 'M6', 'M7', 'P8'].indexOf(iv.id) !== -1;
    });
    var chosen = null;
    for (var tries = 0; tries < 16; tries++) {
      var iv = pool[pickInt(r, pool.length)];
      var lowPos = pickInt(r, 7); // 0..6 so high note stays readable
      var lowInfo = fromStep(clef.bottomStep + lowPos);
      var lowMidi = midiOf(lowInfo.letter, lowInfo.octave, '');
      var highPos = lowPos + (iv.size - 1);
      var highInfo = fromStep(clef.bottomStep + highPos);
      var natHighMidi = midiOf(highInfo.letter, highInfo.octave, '');
      var diff = (lowMidi + iv.semi) - natHighMidi;
      if (diff < -1 || diff > 1) continue;
      var highAcc = diff === 1 ? '#' : (diff === -1 ? 'b' : '');
      var key = clefId + ':' + lowPos + ':' + iv.id;
      if (key === lastKey && tries < 12) continue;
      chosen = {
        kind: 'staff-interval',
        clef: clefId,
        low: { pos: lowPos, letter: lowInfo.letter, octave: lowInfo.octave, acc: '', midi: lowMidi },
        high: { pos: highPos, letter: highInfo.letter, octave: highInfo.octave, acc: highAcc, midi: lowMidi + iv.semi },
        interval: iv,
        answerId: c.intervalQuality ? iv.id : ('size:' + iv.size),
        answerLabel: c.intervalQuality ? iv.label : iv.sizeLabel
      };
      break;
    }
    if (!chosen) {
      // Deterministic safe fallback: C4 to G4 (P5)
      chosen = {
        kind: 'staff-interval',
        clef: 'treble',
        low: { pos: -2, letter: 'C', octave: 4, acc: '', midi: 60 },
        high: { pos: 2, letter: 'G', octave: 4, acc: '', midi: 67 },
        interval: INTERVALS[5],
        answerId: c.intervalQuality ? 'P5' : 'size:5',
        answerLabel: c.intervalQuality ? '純五度' : '五度'
      };
    }
    // Build 4 distinct choices
    var allChoices = c.intervalQuality
      ? INTERVALS.map(function (iv) { return { id: iv.id, label: iv.label }; })
      : [2, 3, 4, 5, 6, 7, 8].map(function (sz) {
          var found = INTERVALS.find(function (iv) { return iv.size === sz; });
          return { id: 'size:' + sz, label: found ? found.sizeLabel : (sz + '度') };
        });
    var others = allChoices.filter(function (ch) { return ch.id !== chosen.answerId; });
    for (var i = others.length - 1; i > 0; i--) {
      var j = pickInt(r, i + 1);
      var tmp = others[i]; others[i] = others[j]; others[j] = tmp;
    }
    var opts = [{ id: chosen.answerId, label: chosen.answerLabel }].concat(others.slice(0, 3));
    for (var k = opts.length - 1; k > 0; k--) {
      var m = pickInt(r, k + 1);
      var t = opts[k]; opts[k] = opts[m]; opts[m] = t;
    }
    chosen.choices = opts;
    return chosen;
  }

  // Crisp, scalable SVG Staff Renderer (musictheory.net aesthetic)
  function renderStaffSvg(clefId, notes, options) {
    var clef = CLEFS[clefId] || CLEFS.treble;
    var stepY = 10; // half a staff space = 10px -> line spacing = 20px
    var bottomLineY = 140; // pos 0 = bottom line, pos 8 = top line (y = 60)
    var yOf = function (pos) { return bottomLineY - pos * stepY; };
    var parts = [];
    // 5 staff lines
    for (var l = 0; l < 5; l++) {
      var ly = bottomLineY - l * 20;
      parts.push('<line x1="34" y1="' + ly + '" x2="366" y2="' + ly + '" stroke="#1f2937" stroke-width="1.8"/>');
    }
    // Clef glyph
    var clefY = clefId === 'bass' ? 105 : (clefId === 'alto' ? 124 : 126);
    var clefSize = clefId === 'bass' ? 66 : (clefId === 'alto' ? 76 : 92);
    parts.push('<text x="48" y="' + clefY + '" font-size="' + clefSize + '" fill="#111827" font-family="Bravura, Apple Symbols, serif">' + clef.symbol + '</text>');

    // Interactive click targets for Note Construction
    if (options && options.interactive) {
      var minP = -(options.ledgers || 1) * 2;
      var maxP = 8 + (options.ledgers || 1) * 2;
      for (var p = minP; p <= maxP; p++) {
        var py = yOf(p);
        parts.push('<rect class="td-hit-row" data-staff-pos="' + p + '" x="130" y="' + (py - 5) + '" width="200" height="10" fill="transparent" style="cursor:pointer"/>');
      }
    }

    // Draw notes & ledger lines
    (notes || []).forEach(function (n) {
      var cx = n.x || 220;
      var cy = yOf(n.pos);
      var fill = n.color || '#111827';
      // Ledger lines below (pos <= -2)
      for (var lp = -2; lp >= n.pos; lp -= 2) {
        var ylp = yOf(lp);
        parts.push('<line x1="' + (cx - 20) + '" y1="' + ylp + '" x2="' + (cx + 20) + '" y2="' + ylp + '" stroke="#1f2937" stroke-width="1.8"/>');
      }
      // Ledger lines above (pos >= 10)
      for (var up = 10; up <= n.pos; up += 2) {
        var yup = yOf(up);
        parts.push('<line x1="' + (cx - 20) + '" y1="' + yup + '" x2="' + (cx + 20) + '" y2="' + yup + '" stroke="#1f2937" stroke-width="1.8"/>');
      }
      if (n.acc) {
        parts.push('<text x="' + (cx - 32) + '" y="' + (cy + 8) + '" font-size="28" font-weight="700" fill="' + fill + '">' + displayAcc(n.acc) + '</text>');
      }
      // Whole-note style open oval like musictheory.net
      parts.push('<ellipse cx="' + cx + '" cy="' + cy + '" rx="12" ry="8.5" fill="#ffffff" stroke="' + fill + '" stroke-width="3.6" transform="rotate(-12 ' + cx + ' ' + cy + ')"/>');
    });

    return '<svg class="td-staff-svg" viewBox="0 0 400 200" role="img" aria-label="五線譜">' + parts.join('') + '</svg>';
  }

  function playMidis(midis, harmonic) {
    var engine = root.AudioEngine;
    var ctx = engine && typeof engine.ensureCtx === 'function' ? engine.ensureCtx() : null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      if (!playMidis.ctx) { try { playMidis.ctx = new AC(); } catch (e) { return; } }
      ctx = playMidis.ctx;
    }
    if (engine && engine.unlock) engine.unlock();
    else if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () {});
    var now = ctx.currentTime + 0.02;
    (midis || []).forEach(function (midi, idx) {
      var when = harmonic ? now : now + idx * 0.34;
      var osc = ctx.createOscillator();
      var amp = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), when);
      osc.connect(amp);
      amp.connect(ctx.destination);
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.exponentialRampToValueAtTime(0.24, when + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.65);
      osc.start(when);
      osc.stop(when + 0.68);
    });
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mount(doc) {
    if (!doc || !doc.body || doc.body.dataset.theoryDrillMounted) return;
    var host = doc.getElementById('theoryDrillRoot');
    if (!host) return;
    doc.body.dataset.theoryDrillMounted = '1';

    var cfg = normalizeConfig(DEFAULT_CONFIG);
    var stats = { correct: 0, total: 0 };
    var currentQ = null;
    var lastKey = '';
    var locked = false;
    var showSettings = false;
    var showReport = false;
    var showChecker = false;
    var constructPos = 4; // default middle line
    var constructAcc = '';
    var feedback = '';
    var feedbackCls = '';
    var pending = 0;

    // Auto-load ?drill=... teacher link if present
    try {
      var params = new URLSearchParams(root.location && root.location.search || '');
      var token = params.get('drill');
      if (token) {
        var decoded = decodeConfig(token);
        if (decoded) {
          cfg = decoded;
          setTimeout(function () {
            root.dispatchEvent(new CustomEvent('theory-drill-navigate', { detail: { screen: 'screen-theory-drill' } }));
          }, 120);
        }
      }
    } catch (e) {}

    function clearPending() {
      if (pending) { clearTimeout(pending); pending = 0; }
    }

    function nextQuestion() {
      clearPending();
      locked = false;
      feedback = '';
      feedbackCls = '';
      if (cfg.questionLimit > 0 && stats.total >= cfg.questionLimit) {
        showReport = true;
        render();
        return;
      }
      if (cfg.mode === 'staff-interval') {
        currentQ = buildIntervalQuestion(cfg, lastKey, Math.random);
        lastKey = currentQ.clef + ':' + currentQ.low.pos + ':' + currentQ.interval.id;
      } else {
        currentQ = buildNoteQuestion(cfg, lastKey, Math.random);
        lastKey = currentQ.clef + ':' + currentQ.answerKey + currentQ.octave;
        constructPos = 4;
        constructAcc = '';
      }
      render();
    }

    function resetSession() {
      stats = { correct: 0, total: 0 };
      showReport = false;
      nextQuestion();
    }

    function pct() {
      return stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
    }

    function answerNoteId(ansKey) {
      if (!currentQ || locked) return;
      locked = true;
      var ok = ansKey === currentQ.answerKey;
      stats.total += 1;
      if (ok) stats.correct += 1;
      playMidis([currentQ.midi], true);
      feedback = ok ? ('✅ 正確：' + currentQ.displayName + '（' + SOLFEGE[currentQ.letter] + '）') : ('❌ 正確答案是 ' + currentQ.displayName + '（' + SOLFEGE[currentQ.letter] + '）');
      feedbackCls = ok ? 'is-ok' : 'is-err';
      render();
      pending = setTimeout(nextQuestion, ok ? 650 : 1250);
    }

    function submitConstruct() {
      if (!currentQ || locked) return;
      locked = true;
      var placed = fromStep(CLEFS[currentQ.clef].bottomStep + constructPos);
      var ok = placed.letter === currentQ.letter && placed.octave === currentQ.octave && constructAcc === currentQ.acc;
      stats.total += 1;
      if (ok) stats.correct += 1;
      playMidis([currentQ.midi], true);
      feedback = ok ? ('✅ 寫對了！' + currentQ.fullName) : ('❌ 正確位置已以綠色顯示：' + currentQ.fullName);
      feedbackCls = ok ? 'is-ok' : 'is-err';
      render();
      pending = setTimeout(nextQuestion, ok ? 800 : 1500);
    }

    function answerInterval(choiceId) {
      if (!currentQ || locked) return;
      locked = true;
      var ok = choiceId === currentQ.answerId;
      stats.total += 1;
      if (ok) stats.correct += 1;
      playMidis([currentQ.low.midi, currentQ.high.midi], false);
      feedback = ok ? ('✅ 正確：' + currentQ.answerLabel) : ('❌ 正確答案是 ' + currentQ.answerLabel);
      feedbackCls = ok ? 'is-ok' : 'is-err';
      render();
      pending = setTimeout(nextQuestion, ok ? 950 : 1500);
    }

    function shareLink() {
      var base = (root.location ? (root.location.origin + root.location.pathname) : '');
      return base + '?drill=' + encodeConfig(cfg);
    }

    function modeLabel(m) {
      if (m === 'note-construct') return '五線譜寫音';
      if (m === 'staff-interval') return '五線譜音程';
      return '音名辨別';
    }

    function renderSettingsModal() {
      return '<div class="td-panel">' +
        '<h3>⚙ 自訂練習設定</h3>' +
        '<div class="td-setting-grid">' +
          '<label>題型<select id="tdSetMode">' +
            '<option value="note-id"' + (cfg.mode === 'note-id' ? ' selected' : '') + '>音名辨別（看譜選音名）</option>' +
            '<option value="note-construct"' + (cfg.mode === 'note-construct' ? ' selected' : '') + '>五線譜寫音（看音名點五線譜）</option>' +
            '<option value="staff-interval"' + (cfg.mode === 'staff-interval' ? ' selected' : '') + '>五線譜音程辨別</option>' +
          '</select></label>' +
          '<label>譜號<select id="tdSetClef">' +
            '<option value="treble"' + (cfg.clef === 'treble' ? ' selected' : '') + '>高音譜號</option>' +
            '<option value="bass"' + (cfg.clef === 'bass' ? ' selected' : '') + '>低音譜號</option>' +
            '<option value="alto"' + (cfg.clef === 'alto' ? ' selected' : '') + '>中音譜號</option>' +
            '<option value="mixed"' + (cfg.clef === 'mixed' ? ' selected' : '') + '>高低混合</option>' +
          '</select></label>' +
          '<label>加線音域<select id="tdSetLedgers">' +
            '<option value="0"' + (cfg.ledgers === 0 ? ' selected' : '') + '>五線內（無加線）</option>' +
            '<option value="1"' + (cfg.ledgers === 1 ? ' selected' : '') + '>含 1 條加線</option>' +
            '<option value="2"' + (cfg.ledgers === 2 ? ' selected' : '') + '>含 2 條加線</option>' +
          '</select></label>' +
          '<label>位置篩選<select id="tdSetPos">' +
            '<option value="all"' + (cfg.positions === 'all' ? ' selected' : '') + '>全部（線＋間）</option>' +
            '<option value="lines"' + (cfg.positions === 'lines' ? ' selected' : '') + '>只練線音（Lines）</option>' +
            '<option value="spaces"' + (cfg.positions === 'spaces' ? ' selected' : '') + '>只練間音（Spaces）</option>' +
          '</select></label>' +
          '<label>挑戰題數<select id="tdSetLimit">' +
            '<option value="0"' + (cfg.questionLimit === 0 ? ' selected' : '') + '>無限練習</option>' +
            '<option value="15"' + (cfg.questionLimit === 15 ? ' selected' : '') + '>15 題挑戰（禁跳題）</option>' +
            '<option value="20"' + (cfg.questionLimit === 20 ? ' selected' : '') + '>20 題挑戰（禁跳題）</option>' +
            '<option value="25"' + (cfg.questionLimit === 25 ? ' selected' : '') + '>25 題挑戰（禁跳題）</option>' +
          '</select></label>' +
          '<label class="td-check"><input type="checkbox" id="tdSetAcc"' + (cfg.accidentals ? ' checked' : '') + '> 包含升降記號（♯ / ♭）</label>' +
          '<label class="td-check"><input type="checkbox" id="tdSetHelp"' + (cfg.helpers ? ' checked' : '') + '> 開啟輔助提示（線間口訣）</label>' +
          '<label class="td-check"><input type="checkbox" id="tdSetIq"' + (cfg.intervalQuality ? ' checked' : '') + '> 音程區分大小純性質</label>' +
        '</div>' +
        '<div class="td-share-box">' +
          '<button type="button" class="composer-listen-btn" id="tdCopyLink">🔗 複製老師功課連結</button>' +
          '<button type="button" class="composer-listen-btn" id="tdOpenChecker">🔍 老師驗碼器</button>' +
          '<button type="button" class="btn-start" id="tdApplySettings">套用並重新開始</button>' +
        '</div>' +
        '<p class="td-share-msg" id="tdShareMsg"></p>' +
      '</div>';
    }

    function renderReportModal() {
      return '<div class="td-panel">' +
        '<h3>📋 成績報告與防偽驗證碼</h3>' +
        '<p class="td-report-summary">' + modeLabel(cfg.mode) + ' · ' + stats.correct + ' / ' + stats.total + ' 題（<b>' + pct() + '%</b>）</p>' +
        '<div class="td-sign-row">' +
          '<input type="text" id="tdSignName" maxlength="20" placeholder="輸入姓名或座號（例如：中一A-12）">' +
          '<button type="button" class="btn-start" id="tdSignBtn">產生驗證碼</button>' +
        '</div>' +
        '<div id="tdCodeOut" class="td-code-out"></div>' +
        '<div class="td-share-box">' +
          '<button type="button" class="composer-listen-btn" id="tdRestartBtn">再練一輪</button>' +
          '<button type="button" class="composer-listen-btn" id="tdCloseReport">返回題目</button>' +
        '</div>' +
      '</div>';
    }

    function renderCheckerModal() {
      return '<div class="td-panel">' +
        '<h3>🔍 老師成績驗碼器（離線防偽）</h3>' +
        '<div class="td-sign-row">' +
          '<input type="text" id="tdCheckInput" placeholder="貼上學生的 NT-XXXXXX-... 驗證碼">' +
          '<button type="button" class="btn-start" id="tdCheckBtn">驗證</button>' +
        '</div>' +
        '<div id="tdCheckOut" class="td-code-out"></div>' +
        '<button type="button" class="composer-listen-btn" id="tdCloseChecker">關閉</button>' +
      '</div>';
    }

    function render() {
      var header =
        '<div class="td-topbar">' +
          '<button type="button" class="td-icon-btn" id="tdHomeBtn" aria-label="返回主頁">🏠</button>' +
          '<div class="td-score-pill">' +
            '<span>' + stats.correct + '/' + stats.total + (cfg.questionLimit ? ('（目標 ' + cfg.questionLimit + '）') : '') + '</span>' +
            '<span>' + pct() + '%</span>' +
          '</div>' +
          '<div class="td-top-right">' +
            '<button type="button" class="td-icon-btn" id="tdReportBtn" title="成績報告與驗證碼" aria-label="成績報告">📋</button>' +
            '<button type="button" class="td-icon-btn" id="tdGearBtn" title="自訂設定" aria-label="自訂設定">⚙</button>' +
          '</div>' +
        '</div>';

      if (showSettings) { host.innerHTML = header + renderSettingsModal(); bindEvents(); return; }
      if (showReport) { host.innerHTML = header + renderReportModal(); bindEvents(); return; }
      if (showChecker) { host.innerHTML = header + renderCheckerModal(); bindEvents(); return; }
      if (!currentQ) { nextQuestion(); return; }

      var helperBar = cfg.helpers
        ? '<div class="td-helper-bar">💡 ' + esc(CLEFS[currentQ.clef].label) + ' — ' + esc(CLEFS[currentQ.clef].helperLines) + ' ｜ ' + esc(CLEFS[currentQ.clef].helperSpaces) + '</div>'
        : '';

      var body = '';
      if (cfg.mode === 'note-id') {
        var rows = cfg.accidentals ? ['#', '', 'b'] : [''];
        body =
          '<div class="td-staff-card">' + renderStaffSvg(currentQ.clef, [{ pos: currentQ.pos, acc: currentQ.acc }]) + '</div>' +
          helperBar +
          '<p class="td-feedback ' + feedbackCls + '" aria-live="polite">' + esc(feedback) + '</p>' +
          '<div class="td-note-rows">' +
            rows.map(function (acc) {
              return '<div class="td-note-row">' + LETTERS.map(function (lt) {
                var key = lt + acc;
                return '<button type="button" class="td-key-btn" data-td-ans="' + key + '"' + (locked ? ' disabled' : '') + '>' + lt + displayAcc(acc) + '</button>';
              }).join('') + '</div>';
            }).join('') +
          '</div>' +
          '<div class="td-util-row">' +
            '<button type="button" class="composer-listen-btn" id="tdRevealBtn"' + (locked || cfg.questionLimit > 0 ? ' disabled' : '') + '>👁 看答案</button>' +
            '<button type="button" class="composer-listen-btn" id="tdSkipBtn"' + (locked || cfg.questionLimit > 0 ? ' disabled' : '') + '>⏭ 跳過</button>' +
          '</div>';
      } else if (cfg.mode === 'note-construct') {
        var previewNotes = [{ pos: constructPos, acc: constructAcc, color: '#1d4ed8' }];
        if (locked && feedbackCls === 'is-err') {
          previewNotes.push({ pos: currentQ.pos, acc: currentQ.acc, x: 268, color: '#10b981' });
        }
        body =
          '<div class="td-construct-prompt">請在五線譜寫出：<strong>' + esc(currentQ.fullName) + '</strong></div>' +
          '<div class="td-staff-card">' + renderStaffSvg(currentQ.clef, previewNotes, { interactive: !locked, ledgers: cfg.ledgers }) + '</div>' +
          helperBar +
          '<p class="td-feedback ' + feedbackCls + '" aria-live="polite">' + esc(feedback) + '</p>' +
          '<div class="td-construct-controls">' +
            '<button type="button" class="td-key-btn" id="tdMoveUp"' + (locked ? ' disabled' : '') + '>▲ 移高</button>' +
            '<button type="button" class="td-key-btn" id="tdMoveDown"' + (locked ? ' disabled' : '') + '>▼ 移低</button>' +
            '<button type="button" class="td-key-btn' + (constructAcc === 'b' ? ' is-on' : '') + '" data-td-acc="b"' + (locked ? ' disabled' : '') + '>♭</button>' +
            '<button type="button" class="td-key-btn' + (constructAcc === '' ? ' is-on' : '') + '" data-td-acc=""' + (locked ? ' disabled' : '') + '>♮</button>' +
            '<button type="button" class="td-key-btn' + (constructAcc === '#' ? ' is-on' : '') + '" data-td-acc="#"' + (locked ? ' disabled' : '') + '>♯</button>' +
            '<button type="button" class="btn-start" id="tdSubmitConstruct"' + (locked ? ' disabled' : '') + '>確認位置</button>' +
          '</div>';
      } else {
        var ivNotes = [
          { pos: currentQ.low.pos, acc: currentQ.low.acc, x: 205 },
          { pos: currentQ.high.pos, acc: currentQ.high.acc, x: currentQ.high.pos - currentQ.low.pos <= 1 ? 234 : 205 }
        ];
        body =
          '<div class="td-staff-card">' + renderStaffSvg(currentQ.clef, ivNotes) + '</div>' +
          helperBar +
          '<p class="td-feedback ' + feedbackCls + '" aria-live="polite">' + esc(feedback) + '</p>' +
          '<div class="composer-options">' +
            currentQ.choices.map(function (ch) {
              return '<button type="button" class="aural-opt" data-td-iv="' + esc(ch.id) + '"' + (locked ? ' disabled' : '') + '>' + esc(ch.label) + '</button>';
            }).join('') +
          '</div>';
      }

      host.innerHTML = header + body;
      bindEvents();
    }

    function bindEvents() {
      var home = doc.getElementById('tdHomeBtn');
      if (home) home.onclick = function () {
        clearPending();
        root.dispatchEvent(new CustomEvent('theory-drill-navigate', { detail: { screen: 'screen-hub' } }));
      };
      var gear = doc.getElementById('tdGearBtn');
      if (gear) gear.onclick = function () { showSettings = !showSettings; showReport = false; showChecker = false; render(); };
      var rep = doc.getElementById('tdReportBtn');
      if (rep) rep.onclick = function () { showReport = !showReport; showSettings = false; showChecker = false; render(); };

      var apply = doc.getElementById('tdApplySettings');
      if (apply) apply.onclick = function () {
        cfg = normalizeConfig({
          mode: doc.getElementById('tdSetMode').value,
          clef: doc.getElementById('tdSetClef').value,
          ledgers: doc.getElementById('tdSetLedgers').value,
          positions: doc.getElementById('tdSetPos').value,
          questionLimit: doc.getElementById('tdSetLimit').value,
          accidentals: doc.getElementById('tdSetAcc').checked,
          helpers: doc.getElementById('tdSetHelp').checked,
          intervalQuality: doc.getElementById('tdSetIq').checked
        });
        showSettings = false;
        resetSession();
      };
      var copyBtn = doc.getElementById('tdCopyLink');
      if (copyBtn) copyBtn.onclick = function () {
        cfg = normalizeConfig({
          mode: doc.getElementById('tdSetMode').value,
          clef: doc.getElementById('tdSetClef').value,
          ledgers: doc.getElementById('tdSetLedgers').value,
          positions: doc.getElementById('tdSetPos').value,
          questionLimit: doc.getElementById('tdSetLimit').value,
          accidentals: doc.getElementById('tdSetAcc').checked,
          helpers: doc.getElementById('tdSetHelp').checked,
          intervalQuality: doc.getElementById('tdSetIq').checked
        });
        var url = shareLink();
        var msg = doc.getElementById('tdShareMsg');
        if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
          root.navigator.clipboard.writeText(url).then(function () {
            if (msg) msg.textContent = '✅ 已複製功課連結：' + url;
          }).catch(function () { if (msg) msg.textContent = url; });
        } else if (msg) {
          msg.textContent = url;
        }
      };
      var openChk = doc.getElementById('tdOpenChecker');
      if (openChk) openChk.onclick = function () { showSettings = false; showChecker = true; render(); };
      var closeChk = doc.getElementById('tdCloseChecker');
      if (closeChk) closeChk.onclick = function () { showChecker = false; render(); };
      var chkBtn = doc.getElementById('tdCheckBtn');
      if (chkBtn) chkBtn.onclick = function () {
        var res = verifyReport((doc.getElementById('tdCheckInput') || {}).value);
        var out = doc.getElementById('tdCheckOut');
        if (!out) return;
        if (!res.valid) out.textContent = '❌ ' + res.error;
        else {
          var r = res.report;
          out.innerHTML = '✅ 驗證通過！<br>學生：<b>' + esc(r.name) + '</b>｜題型：' + esc(modeLabel(r.mode)) +
            '<br>成績：<b>' + r.correct + ' / ' + r.total + '（' + r.accuracy + '%）</b>｜完成時間：' + new Date(r.ts).toLocaleString();
        }
      };
      var signBtn = doc.getElementById('tdSignBtn');
      if (signBtn) signBtn.onclick = function () {
        var name = (doc.getElementById('tdSignName') || {}).value || '未署名';
        var code = signReport({ name: name, mode: cfg.mode, clef: cfg.clef, correct: stats.correct, total: stats.total, accuracy: pct() });
        var out = doc.getElementById('tdCodeOut');
        if (out) out.innerHTML = '<code>' + esc(code) + '</code>';
        if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
          root.navigator.clipboard.writeText(code).catch(function () {});
        }
      };
      var restartBtn = doc.getElementById('tdRestartBtn');
      if (restartBtn) restartBtn.onclick = resetSession;
      var closeRep = doc.getElementById('tdCloseReport');
      if (closeRep) closeRep.onclick = function () { showReport = false; render(); };

      host.querySelectorAll('[data-td-ans]').forEach(function (b) {
        b.onclick = function () { answerNoteId(b.getAttribute('data-td-ans')); };
      });
      host.querySelectorAll('[data-td-iv]').forEach(function (b) {
        b.onclick = function () { answerInterval(b.getAttribute('data-td-iv')); };
      });
      host.querySelectorAll('[data-staff-pos]').forEach(function (row) {
        row.onclick = function () {
          if (locked) return;
          constructPos = parseInt(row.getAttribute('data-staff-pos'), 10);
          render();
        };
      });
      host.querySelectorAll('[data-td-acc]').forEach(function (b) {
        b.onclick = function () { if (locked) return; constructAcc = b.getAttribute('data-td-acc'); render(); };
      });
      var up = doc.getElementById('tdMoveUp');
      if (up) up.onclick = function () { constructPos = Math.min(8 + cfg.ledgers * 2, constructPos + 1); render(); };
      var dn = doc.getElementById('tdMoveDown');
      if (dn) dn.onclick = function () { constructPos = Math.max(-cfg.ledgers * 2, constructPos - 1); render(); };
      var subC = doc.getElementById('tdSubmitConstruct');
      if (subC) subC.onclick = submitConstruct;
      var rev = doc.getElementById('tdRevealBtn');
      if (rev) rev.onclick = function () {
        if (!currentQ || locked || cfg.questionLimit > 0) return;
        locked = true;
        playMidis([currentQ.midi], true);
        feedback = '👁 答案是 ' + currentQ.displayName + '（' + SOLFEGE[currentQ.letter] + '）';
        feedbackCls = '';
        render();
        pending = setTimeout(nextQuestion, 1300);
      };
      var skip = doc.getElementById('tdSkipBtn');
      if (skip) skip.onclick = function () { if (!locked && cfg.questionLimit === 0) nextQuestion(); };
    }

    // Keyboard shortcuts (musictheory.net style: A-G + Up/Down for #/b, Shift+R reveal, Shift+N skip)
    var heldAcc = '';
    doc.addEventListener('keydown', function (e) {
      var scr = doc.getElementById('screen-theory-drill');
      if (!scr || !scr.classList.contains('active') || showSettings || showReport || showChecker) return;
      if (e.key === 'ArrowUp') { heldAcc = '#'; if (cfg.mode === 'note-construct') { e.preventDefault(); constructPos = Math.min(8 + cfg.ledgers * 2, constructPos + 1); render(); } return; }
      if (e.key === 'ArrowDown') { heldAcc = 'b'; if (cfg.mode === 'note-construct') { e.preventDefault(); constructPos = Math.max(-cfg.ledgers * 2, constructPos - 1); render(); } return; }
      if (cfg.mode === 'note-construct' && e.key === 'Enter') { e.preventDefault(); submitConstruct(); return; }
      if (cfg.mode === 'note-id' && !locked) {
        if (e.shiftKey && e.key.toUpperCase() === 'N' && cfg.questionLimit === 0) { nextQuestion(); return; }
        var ch = e.key.toUpperCase();
        if (LETTERS.indexOf(ch) !== -1) {
          answerNoteId(ch + (cfg.accidentals ? heldAcc : ''));
        }
      }
    });
    doc.addEventListener('keyup', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') heldAcc = '';
    });

    root.TheoryDrill.openMode = function (modeName) {
      cfg = normalizeConfig(Object.assign({}, cfg, { mode: modeName }));
      showSettings = false; showReport = false; showChecker = false;
      resetSession();
    };

    nextQuestion();
  }

  return {
    CLEFS: CLEFS,
    INTERVALS: INTERVALS,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    normalizeConfig: normalizeConfig,
    encodeConfig: encodeConfig,
    decodeConfig: decodeConfig,
    signReport: signReport,
    verifyReport: verifyReport,
    buildNoteQuestion: buildNoteQuestion,
    buildIntervalQuestion: buildIntervalQuestion,
    renderStaffSvg: renderStaffSvg,
    mount: mount
  };
});
