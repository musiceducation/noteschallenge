/**
 * 全站練習 ⚙ Customize 自訂引擎（參考 musictheory.net Exercise Customizer）
 * 支援 6 大核心練習：音名辨別、調號辨別、和弦練習、音程聽辨、節奏聽寫、和弦色彩聽辨
 * 提供統一自訂設定彈窗、永久分享連結 (?custom=...) 與自動載入。
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ExerciseCustomizer = api;
  if (root && root.document) {
    var boot = function () { api.mount(root.document); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var DEFAULTS = {
    notes: {
      clef: 'treble',       // treble | bass | alto | tenor | mixed
      ledgers: 1,           // 0 | 1 | 2
      positions: 'all',     // all | lines | spaces
      accidentals: true,    // boolean
      helpers: false,       // boolean (show solfege hint)
      questionLimit: 0      // 0 | 15 | 20 | 25
    },
    keysig: {
      direction: 'both',    // both | sharps | flats
      maxAcc: 5,            // 1..5
      includeC: true        // boolean
    },
    chord: {
      roots: 'all',         // all | white
      types: ['', 'm', 'dim', 'aug', '7', 'maj7', 'm7'],
      count: 10             // 5 | 10 | 15 | 20
    },
    'aural-interval': {
      intervals: ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'P8'],
      qualityMode: true,    // false = size only, true = major/minor/perfect
      harmonic: false
    },
    'aural-rhythm': {
      bpm: 120,             // 90 | 120 | 145
      includeHalf: true,
      includeRest: true,
      includeSync: false
    },
    'aural-quality': {
      qualities: ['major', 'minor', 'aug', 'dim'],
      cadences: false,
      phrase: false
    }
  };

  var TARGET_LABELS = {
    notes: '音名辨別',
    keysig: '調號辨別',
    chord: '和弦練習',
    'aural-interval': '音程聽辨',
    'aural-rhythm': '節奏聽寫',
    'aural-quality': '和弦色彩聽辨'
  };

  var ALL_CHORD_TYPES = [
    { id: '', label: '大三' }, { id: 'm', label: '小三' }, { id: 'dim', label: '減三' },
    { id: 'aug', label: '增三' }, { id: 'sus2', label: '掛二' }, { id: 'sus4', label: '掛四' },
    { id: '7', label: '屬七' }, { id: 'maj7', label: '大七' }, { id: 'm7', label: '小七' },
    { id: 'm7b5', label: '半減七' }, { id: 'dim7', label: '減七' }
  ];

  var ALL_INTERVALS = [
    { id: 'm2', label: '小二度' }, { id: 'M2', label: '大二度' },
    { id: 'm3', label: '小三度' }, { id: 'M3', label: '大三度' },
    { id: 'P4', label: '純四度' }, { id: 'P5', label: '純五度' },
    { id: 'm6', label: '小六度' }, { id: 'M6', label: '大六度' },
    { id: 'm7', label: '小七度' }, { id: 'M7', label: '大七度' },
    { id: 'P8', label: '純八度' }
  ];

  var ALL_QUALITIES = [
    { id: 'major', label: '大調' }, { id: 'minor', label: '小調' },
    { id: 'aug', label: '增三和弦' }, { id: 'dim', label: '減三和弦' }
  ];

  // Pure-JS Base64URL encode/decode (works in browsers, Capacitor, and isolated VM tests)
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function toBytes(str) {
    var s = encodeURIComponent(str);
    var out = [];
    for (var i = 0; i < s.length; i++) {
      if (s.charAt(i) === '%') { out.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
      else out.push(s.charCodeAt(i));
    }
    return out;
  }
  function fromBytes(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += '%' + ('00' + bytes[i].toString(16)).slice(-2);
    return decodeURIComponent(hex);
  }
  function b64Encode(str) {
    var b = toBytes(str);
    var out = '';
    for (var i = 0; i < b.length; i += 3) {
      var b0 = b[i], b1 = i + 1 < b.length ? b[i + 1] : 0, b2 = i + 2 < b.length ? b[i + 2] : 0;
      out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)];
      if (i + 1 < b.length) out += B64[((b1 & 15) << 2) | (b2 >> 6)];
      if (i + 2 < b.length) out += B64[b2 & 63];
    }
    return out;
  }
  function b64Decode(tok) {
    var c = String(tok || '').replace(/=+$/, '');
    var out = [];
    for (var i = 0; i < c.length; i += 4) {
      var c0 = B64.indexOf(c.charAt(i)), c1 = B64.indexOf(c.charAt(i + 1));
      var c2 = i + 2 < c.length ? B64.indexOf(c.charAt(i + 2)) : -1;
      var c3 = i + 3 < c.length ? B64.indexOf(c.charAt(i + 3)) : -1;
      if (c0 < 0 || c1 < 0) throw new Error('bad token');
      out.push((c0 << 2) | (c1 >> 4));
      if (c2 >= 0) out.push(((c1 & 15) << 4) | (c2 >> 2));
      if (c3 >= 0) out.push(((c2 & 3) << 6) | c3);
    }
    return fromBytes(out);
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function normalize(target, raw) {
    var base = DEFAULTS[target];
    if (!base) return null;
    var cfg = Object.assign(clone(base), raw || {});
    if (target === 'notes') {
      if (['treble', 'bass', 'alto', 'tenor', 'mixed'].indexOf(cfg.clef) === -1) cfg.clef = 'treble';
      cfg.ledgers = Math.max(0, Math.min(2, parseInt(cfg.ledgers, 10) || 0));
      if (['all', 'lines', 'spaces'].indexOf(cfg.positions) === -1) cfg.positions = 'all';
      cfg.accidentals = !!cfg.accidentals;
      cfg.helpers = !!cfg.helpers;
      cfg.questionLimit = [0, 15, 20, 25].indexOf(parseInt(cfg.questionLimit, 10)) !== -1 ? parseInt(cfg.questionLimit, 10) : 0;
    } else if (target === 'keysig') {
      if (['both', 'sharps', 'flats'].indexOf(cfg.direction) === -1) cfg.direction = 'both';
      cfg.maxAcc = Math.max(1, Math.min(5, parseInt(cfg.maxAcc, 10) || 5));
      cfg.includeC = cfg.includeC !== false;
    } else if (target === 'chord') {
      if (['all', 'white'].indexOf(cfg.roots) === -1) cfg.roots = 'all';
      var validTypes = ALL_CHORD_TYPES.map(function (t) { return t.id; });
      cfg.types = Array.isArray(cfg.types) ? cfg.types.filter(function (t) { return validTypes.indexOf(t) !== -1; }) : clone(base.types);
      if (cfg.types.length < 1) cfg.types = ['', 'm'];
      cfg.count = [5, 10, 15, 20].indexOf(parseInt(cfg.count, 10)) !== -1 ? parseInt(cfg.count, 10) : 10;
    } else if (target === 'aural-interval') {
      var validIv = ALL_INTERVALS.map(function (iv) { return iv.id; });
      cfg.intervals = Array.isArray(cfg.intervals) ? cfg.intervals.filter(function (id) { return validIv.indexOf(id) !== -1; }) : clone(base.intervals);
      if (cfg.intervals.length < 2) cfg.intervals = ['M3', 'P5', 'P8'];
      cfg.qualityMode = cfg.qualityMode !== false;
      cfg.harmonic = !!cfg.harmonic;
    } else if (target === 'aural-rhythm') {
      cfg.bpm = [90, 120, 145].indexOf(parseInt(cfg.bpm, 10)) !== -1 ? parseInt(cfg.bpm, 10) : 120;
      cfg.includeHalf = !!cfg.includeHalf;
      cfg.includeRest = !!cfg.includeRest;
      cfg.includeSync = !!cfg.includeSync;
    } else if (target === 'aural-quality') {
      var validQ = ALL_QUALITIES.map(function (q) { return q.id; });
      cfg.qualities = Array.isArray(cfg.qualities) ? cfg.qualities.filter(function (id) { return validQ.indexOf(id) !== -1; }) : clone(base.qualities);
      if (cfg.qualities.length < 2) cfg.qualities = ['major', 'minor'];
      cfg.cadences = !!cfg.cadences;
      cfg.phrase = !!cfg.phrase;
    }
    return cfg;
  }

  function encode(target, cfg) {
    var norm = normalize(target, cfg);
    if (!norm) return '';
    return b64Encode(JSON.stringify({ t: target, c: norm }));
  }

  function decode(token) {
    try {
      var parsed = JSON.parse(b64Decode(token));
      if (!parsed || !DEFAULTS[parsed.t]) return null;
      return { target: parsed.t, config: normalize(parsed.t, parsed.c) };
    } catch (err) {
      return null;
    }
  }

  var activeConfigs = {};
  var listeners = {};

  function get(target) {
    return activeConfigs[target] ? clone(activeConfigs[target]) : null;
  }

  function set(target, cfg) {
    var norm = normalize(target, cfg);
    if (!norm) return null;
    activeConfigs[target] = norm;
    (listeners[target] || []).forEach(function (fn) { try { fn(clone(norm)); } catch (e) {} });
    return clone(norm);
  }

  function clear(target) {
    delete activeConfigs[target];
    (listeners[target] || []).forEach(function (fn) { try { fn(null); } catch (e) {} });
  }

  function onChange(target, fn) {
    if (!listeners[target]) listeners[target] = [];
    listeners[target].push(fn);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildFormHtml(target, cfg) {
    if (target === 'notes') {
      return '<div class="td-setting-grid">' +
        '<label>譜號<select name="clef">' +
          '<option value="treble"' + (cfg.clef === 'treble' ? ' selected' : '') + '>高音譜號</option>' +
          '<option value="bass"' + (cfg.clef === 'bass' ? ' selected' : '') + '>低音譜號</option>' +
          '<option value="alto"' + (cfg.clef === 'alto' ? ' selected' : '') + '>中音譜號</option>' +
          '<option value="tenor"' + (cfg.clef === 'tenor' ? ' selected' : '') + '>次中音譜號</option>' +
          '<option value="mixed"' + (cfg.clef === 'mixed' ? ' selected' : '') + '>高音＋低音混合</option>' +
        '</select></label>' +
        '<label>加線音域<select name="ledgers">' +
          '<option value="0"' + (cfg.ledgers === 0 ? ' selected' : '') + '>五線內（無加線）</option>' +
          '<option value="1"' + (cfg.ledgers === 1 ? ' selected' : '') + '>含 1 條加線</option>' +
          '<option value="2"' + (cfg.ledgers === 2 ? ' selected' : '') + '>含 2 條加線</option>' +
        '</select></label>' +
        '<label>位置篩選<select name="positions">' +
          '<option value="all"' + (cfg.positions === 'all' ? ' selected' : '') + '>全部（線＋間）</option>' +
          '<option value="lines"' + (cfg.positions === 'lines' ? ' selected' : '') + '>只練線音（Lines）</option>' +
          '<option value="spaces"' + (cfg.positions === 'spaces' ? ' selected' : '') + '>只練間音（Spaces）</option>' +
        '</select></label>' +
        '<label>固定題數<select name="questionLimit">' +
          '<option value="0"' + (cfg.questionLimit === 0 ? ' selected' : '') + '>無限練習</option>' +
          '<option value="15"' + (cfg.questionLimit === 15 ? ' selected' : '') + '>15 題</option>' +
          '<option value="20"' + (cfg.questionLimit === 20 ? ' selected' : '') + '>20 題</option>' +
          '<option value="25"' + (cfg.questionLimit === 25 ? ' selected' : '') + '>25 題</option>' +
        '</select></label>' +
        '<label class="td-check"><input type="checkbox" name="accidentals"' + (cfg.accidentals ? ' checked' : '') + '> 包含升降記號（♯ / ♭）</label>' +
        '<label class="td-check"><input type="checkbox" name="helpers"' + (cfg.helpers ? ' checked' : '') + '> 顯示唱名輔助提示（Helpers）</label>' +
      '</div>';
    }
    if (target === 'keysig') {
      return '<div class="td-setting-grid">' +
        '<label>升降號方向<select name="direction">' +
          '<option value="both"' + (cfg.direction === 'both' ? ' selected' : '') + '>升號＋降號混合</option>' +
          '<option value="sharps"' + (cfg.direction === 'sharps' ? ' selected' : '') + '>只練升號調（♯）</option>' +
          '<option value="flats"' + (cfg.direction === 'flats' ? ' selected' : '') + '>只練降號調（♭）</option>' +
        '</select></label>' +
        '<label>最多升降號數<select name="maxAcc">' +
          [1, 2, 3, 4, 5].map(function (n) {
            return '<option value="' + n + '"' + (cfg.maxAcc === n ? ' selected' : '') + '>最多 ' + n + ' 個升降號</option>';
          }).join('') +
        '</select></label>' +
        '<label class="td-check"><input type="checkbox" name="includeC"' + (cfg.includeC ? ' checked' : '') + '> 包含 C 大調（0 升降號）</label>' +
      '</div>';
    }
    if (target === 'chord') {
      return '<div class="td-setting-grid">' +
        '<label>根音範圍<select name="roots">' +
          '<option value="all"' + (cfg.roots === 'all' ? ' selected' : '') + '>全部 12 個根音</option>' +
          '<option value="white"' + (cfg.roots === 'white' ? ' selected' : '') + '>僅白鍵根音（C–B）</option>' +
        '</select></label>' +
        '<label>每輪題數<select name="count">' +
          [5, 10, 15, 20].map(function (n) {
            return '<option value="' + n + '"' + (cfg.count === n ? ' selected' : '') + '>' + n + ' 題</option>';
          }).join('') +
        '</select></label>' +
      '</div>' +
      '<div class="ec-chips-label">勾選要練習的和弦種類：</div>' +
      '<div class="ec-check-chips">' +
        ALL_CHORD_TYPES.map(function (t) {
          var on = cfg.types.indexOf(t.id) !== -1;
          return '<label class="ec-chip"><input type="checkbox" name="types" value="' + esc(t.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(t.label) + '</span></label>';
        }).join('') +
      '</div>';
    }
    if (target === 'aural-interval') {
      return '<div class="td-setting-grid">' +
        '<label class="td-check"><input type="checkbox" name="qualityMode"' + (cfg.qualityMode ? ' checked' : '') + '> 區分大／小／純性質（取消則只選度數）</label>' +
        '<label class="td-check"><input type="checkbox" name="harmonic"' + (cfg.harmonic ? ' checked' : '') + '> 和聲同時發聲（取消則旋律先後）</label>' +
      '</div>' +
      '<div class="ec-chips-label">自由勾選要考的音程（至少 2 個）：</div>' +
      '<div class="ec-check-chips">' +
        ALL_INTERVALS.map(function (iv) {
          var on = cfg.intervals.indexOf(iv.id) !== -1;
          return '<label class="ec-chip"><input type="checkbox" name="intervals" value="' + iv.id + '"' + (on ? ' checked' : '') + '><span>' + esc(iv.label) + '</span></label>';
        }).join('') +
      '</div>';
    }
    if (target === 'aural-rhythm') {
      return '<div class="td-setting-grid">' +
        '<label>節拍速度<select name="bpm">' +
          '<option value="90"' + (cfg.bpm === 90 ? ' selected' : '') + '>慢速（90 BPM）</option>' +
          '<option value="120"' + (cfg.bpm === 120 ? ' selected' : '') + '>標準（120 BPM）</option>' +
          '<option value="145"' + (cfg.bpm === 145 ? ' selected' : '') + '>快速（145 BPM）</option>' +
        '</select></label>' +
        '<label class="td-check"><input type="checkbox" name="includeHalf"' + (cfg.includeHalf ? ' checked' : '') + '> 包含二分音符（2 拍）</label>' +
        '<label class="td-check"><input type="checkbox" name="includeRest"' + (cfg.includeRest ? ' checked' : '') + '> 包含四分休止符</label>' +
        '<label class="td-check"><input type="checkbox" name="includeSync"' + (cfg.includeSync ? ' checked' : '') + '> 包含附點四分與切分音</label>' +
      '</div>';
    }
    if (target === 'aural-quality') {
      return '<div class="td-setting-grid">' +
        '<label class="td-check"><input type="checkbox" name="cadences"' + (cfg.cadences ? ' checked' : '') + '> 改考終止式（正格／變格／半終止）</label>' +
        '<label class="td-check"><input type="checkbox" name="phrase"' + (cfg.phrase ? ' checked' : '') + '> 分解和弦短句播放</label>' +
      '</div>' +
      '<div class="ec-chips-label">勾選要考的和弦性質（至少 2 個）：</div>' +
      '<div class="ec-check-chips">' +
        ALL_QUALITIES.map(function (q) {
          var on = cfg.qualities.indexOf(q.id) !== -1;
          return '<label class="ec-chip"><input type="checkbox" name="qualities" value="' + q.id + '"' + (on ? ' checked' : '') + '><span>' + esc(q.label) + '</span></label>';
        }).join('') +
      '</div>';
    }
    return '';
  }

  function readForm(form, target) {
    var raw = {};
    if (target === 'notes') {
      raw.clef = form.querySelector('[name="clef"]').value;
      raw.ledgers = form.querySelector('[name="ledgers"]').value;
      raw.positions = form.querySelector('[name="positions"]').value;
      raw.questionLimit = form.querySelector('[name="questionLimit"]').value;
      raw.accidentals = form.querySelector('[name="accidentals"]').checked;
      raw.helpers = form.querySelector('[name="helpers"]').checked;
    } else if (target === 'keysig') {
      raw.direction = form.querySelector('[name="direction"]').value;
      raw.maxAcc = form.querySelector('[name="maxAcc"]').value;
      raw.includeC = form.querySelector('[name="includeC"]').checked;
    } else if (target === 'chord') {
      raw.roots = form.querySelector('[name="roots"]').value;
      raw.count = form.querySelector('[name="count"]').value;
      raw.types = Array.prototype.slice.call(form.querySelectorAll('[name="types"]:checked')).map(function (el) { return el.value; });
    } else if (target === 'aural-interval') {
      raw.qualityMode = form.querySelector('[name="qualityMode"]').checked;
      raw.harmonic = form.querySelector('[name="harmonic"]').checked;
      raw.intervals = Array.prototype.slice.call(form.querySelectorAll('[name="intervals"]:checked')).map(function (el) { return el.value; });
    } else if (target === 'aural-rhythm') {
      raw.bpm = form.querySelector('[name="bpm"]').value;
      raw.includeHalf = form.querySelector('[name="includeHalf"]').checked;
      raw.includeRest = form.querySelector('[name="includeRest"]').checked;
      raw.includeSync = form.querySelector('[name="includeSync"]').checked;
    } else if (target === 'aural-quality') {
      raw.cadences = form.querySelector('[name="cadences"]').checked;
      raw.phrase = form.querySelector('[name="phrase"]').checked;
      raw.qualities = Array.prototype.slice.call(form.querySelectorAll('[name="qualities"]:checked')).map(function (el) { return el.value; });
    }
    return normalize(target, raw);
  }

  var modalEl = null;

  function openModal(target, onApply) {
    if (!root.document || !DEFAULTS[target]) return;
    var doc = root.document;
    if (!modalEl) {
      modalEl = doc.createElement('div');
      modalEl.id = 'customizerModal';
      modalEl.className = 'ec-modal';
      modalEl.setAttribute('role', 'dialog');
      modalEl.setAttribute('aria-modal', 'true');
      doc.body.appendChild(modalEl);
    }
    var cur = get(target) || clone(DEFAULTS[target]);
    modalEl.innerHTML =
      '<div class="ec-backdrop" data-ec-close></div>' +
      '<form class="ec-dialog" id="ecForm">' +
        '<div class="ec-header">' +
          '<h3>⚙ 自訂練習：' + esc(TARGET_LABELS[target] || target) + '</h3>' +
          '<button type="button" class="ec-close-btn" data-ec-close aria-label="關閉">✕</button>' +
        '</div>' +
        '<div class="ec-body">' + buildFormHtml(target, cur) + '</div>' +
        '<p class="td-share-msg" id="ecShareMsg"></p>' +
        '<div class="ec-footer">' +
          '<button type="button" class="composer-listen-btn" id="ecCopyUrl">🔗 複製自訂連結</button>' +
          '<button type="button" class="composer-listen-btn" id="ecResetBtn">重設預設</button>' +
          '<button type="submit" class="btn-start">套用自訂設定</button>' +
        '</div>' +
      '</form>';
    modalEl.classList.add('is-open');

    function close() { modalEl.classList.remove('is-open'); }
    modalEl.querySelectorAll('[data-ec-close]').forEach(function (el) { el.onclick = close; });
    var form = doc.getElementById('ecForm');
    doc.getElementById('ecCopyUrl').onclick = function () {
      var next = readForm(form, target);
      var base = root.location ? (root.location.origin + root.location.pathname) : '';
      var url = base + '?custom=' + encode(target, next);
      var msg = doc.getElementById('ecShareMsg');
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
        root.navigator.clipboard.writeText(url).then(function () {
          if (msg) msg.textContent = '✅ 已複製自訂練習連結：' + url;
        }).catch(function () { if (msg) msg.textContent = url; });
      } else if (msg) {
        msg.textContent = url;
      }
    };
    doc.getElementById('ecResetBtn').onclick = function () {
      clear(target);
      if (typeof onApply === 'function') onApply(null);
      close();
    };
    form.onsubmit = function (ev) {
      ev.preventDefault();
      var next = set(target, readForm(form, target));
      if (typeof onApply === 'function') onApply(next);
      close();
    };
  }

  function mount(doc) {
    if (!doc || !doc.body || doc.body.dataset.customizerMounted) return;
    doc.body.dataset.customizerMounted = '1';
    try {
      var params = new URLSearchParams(root.location && root.location.search || '');
      var token = params.get('custom');
      if (token) {
        var parsed = decode(token);
        if (parsed) {
          set(parsed.target, parsed.config);
          setTimeout(function () {
            root.dispatchEvent(new CustomEvent('exercise-custom-launch', { detail: parsed }));
          }, 180);
        }
      }
    } catch (e) {}
  }

  return {
    DEFAULTS: DEFAULTS,
    TARGET_LABELS: TARGET_LABELS,
    normalize: normalize,
    encode: encode,
    decode: decode,
    get: get,
    set: set,
    clear: clear,
    onChange: onChange,
    openModal: openModal,
    mount: mount
  };
});
