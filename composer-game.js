/**
 * 西方音樂家互動模組（圖鑑、音樂偵探、時間軸快排、時期歸隊）
 * 使用 Web Audio 即時合成公版經典主題短句，無商業錄音版權問題且支援離線運作。
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ComposerGame = api;
  if (root && root.document) {
    var boot = function () { api.mount(root.document); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var GAME_KEY = 'western-composers';
  var DETECTIVE_COUNT = 6;
  var TIMELINE_COUNT = 5;
  var ERA_SORT_MS = 60000;

  var ERAS = [
    { id: 'baroque', label: '巴洛克時期', years: '1600–1750', traits: '複調對位、大鍵琴、華麗裝飾音', color: '#b45309' },
    { id: 'classical', label: '古典時期', years: '1750–1820', traits: '結構均衡、奏鳴曲式、清晰主調', color: '#1d4ed8' },
    { id: 'romantic', label: '浪漫時期', years: '1820–1900', traits: '情感奔放、標題音樂、鋼琴與管弦樂擴張', color: '#be185d' },
    { id: 'modern', label: '印象・現代', years: '1900–', traits: '色彩和聲、全音階與五聲、突破傳統調性', color: '#0f766e' }
  ];
  var ERA_MAP = {};
  ERAS.forEach(function (era) { ERA_MAP[era.id] = era; });

  function eraArt(id) {
    return 'img/ui/era-' + id + '.webp?v=1';
  }
  function modeBanner(id) {
    return '<img class="composer-mode-banner" src="img/ui/composer-mode-' + id + '.webp?v=1" alt="" loading="lazy" decoding="async">';
  }

  function seq(notes, step, dur, gain) {
    var t = 0;
    var out = [];
    notes.forEach(function (item) {
      var midi = Array.isArray(item) ? item[0] : item;
      var beats = Array.isArray(item) ? item[1] : 1;
      var g = Array.isArray(item) && item[2] != null ? item[2] : (gain || 0.24);
      if (midi > 0) {
        out.push({
          midi: midi,
          at: Math.round(t * 1000) / 1000,
          dur: Math.round(Math.max(0.14, beats * step * (dur || 0.88)) * 1000) / 1000,
          gain: g
        });
      }
      t += beats * step;
    });
    return out;
  }

  var COMPOSERS = [
    {
      id: 'bach',
      name: '巴赫',
      en: 'J.S. Bach',
      born: 1685,
      died: 1750,
      country: '德國',
      era: 'baroque',
      title: '音樂之父',
      work: '《G大調小步舞曲》',
      clue1: '被尊稱為「音樂之父」，精通管風琴與複調對位法。',
      clue2: '巴洛克時期德國大師，寫過《平均律鋼琴曲集》與《布蘭登堡協奏曲》。',
      tip: '旋律線條交織工整，常由管風琴或大鍵琴奏出。',
      theme: seq([[74, 1], [67, 0.5], [69, 0.5], [71, 0.5], [72, 0.5], [74, 1], [67, 1], [67, 1], [76, 1], [72, 0.5], [74, 0.5], [76, 0.5], [78, 0.5], [79, 1], [67, 1], [67, 1]], 0.36, 0.85, 0.24)
    },
    {
      id: 'vivaldi',
      name: '韋瓦第',
      en: 'A. Vivaldi',
      born: 1678,
      died: 1741,
      country: '義大利',
      era: 'baroque',
      title: '紅髮神父',
      work: '《四季・春》',
      clue1: '因一頭紅髮與神職身分被稱為「紅髮神父」，擅長小提琴協奏曲。',
      clue2: '巴洛克時期義大利作曲家，代表作描繪春夏秋冬四個季節。',
      tip: '明亮跳躍的小提琴獨奏與樂團呼應，充滿畫面感。',
      theme: seq([[64, 0.5], [68, 0.5], [68, 0.5], [68, 0.5], [66, 0.25], [64, 0.25], [71, 1.5], [71, 0.25], [69, 0.25], [68, 0.5], [68, 0.5], [68, 0.5], [66, 0.25], [64, 0.25], [71, 1.5]], 0.42, 0.82, 0.24)
    },
    {
      id: 'handel',
      name: '韓德爾',
      en: 'G.F. Handel',
      born: 1685,
      died: 1759,
      country: '德國／英國',
      era: 'baroque',
      title: '神劇大師',
      work: '《彌賽亞・哈利路亞》',
      clue1: '與巴赫同年出生，以宏偉的神劇與王室慶典音樂聞名。',
      clue2: '巴洛克時期德裔英籍大師，代表作《水上音樂》與《哈利路亞》。',
      tip: '氣勢莊嚴宏大，合唱與銅管節奏極具慶典感。',
      theme: seq([[74, 1.2], [69, 0.4], [71, 0.4], [69, 1], [0, 0.4], [74, 1.2], [69, 0.4], [71, 0.4], [69, 1], [0, 0.4], [74, 0.5], [74, 0.5], [74, 0.5], [73, 0.5], [74, 1.2]], 0.4, 0.86, 0.25)
    },
    {
      id: 'haydn',
      name: '海頓',
      en: 'J. Haydn',
      born: 1732,
      died: 1809,
      country: '奧地利',
      era: 'classical',
      title: '交響曲之父',
      work: '《驚愕交響曲》',
      clue1: '被稱為「交響曲之父」與「弦樂四重奏之父」，個性幽默風趣。',
      clue2: '古典時期奧地利大師，曾寫出突如其來的強音嚇醒打瞌睡的聽眾。',
      tip: '前面輕巧平穩，突然來一個超強音，正是他的招牌幽默。',
      theme: seq([[60, 0.7, 0.14], [60, 0.7, 0.14], [64, 0.7, 0.14], [64, 0.7, 0.14], [67, 0.7, 0.14], [67, 0.7, 0.14], [64, 1.2, 0.14], [65, 0.7, 0.14], [65, 0.7, 0.14], [62, 0.7, 0.14], [62, 0.7, 0.14], [59, 0.7, 0.14], [59, 0.7, 0.14], [60, 0.8, 0.14], [79, 1.4, 0.46]], 0.34, 0.82, 0.2)
    },
    {
      id: 'mozart',
      name: '莫札特',
      en: 'W.A. Mozart',
      born: 1756,
      died: 1791,
      country: '奧地利',
      era: 'classical',
      title: '音樂神童',
      work: '《G大調弦樂小夜曲》',
      clue1: '五歲開始作曲的「音樂神童」，旋律流暢自然、充滿陽光氣息。',
      clue2: '古典時期奧地利大師，代表作《魔笛》《土耳其進行曲》《小夜曲》。',
      tip: '開頭明快俐落的分解和弦，一聽就感受到古典時期的優雅均衡。',
      theme: seq([[67, 1], [0, 0.3], [62, 0.4], [67, 1], [0, 0.3], [62, 0.4], [67, 0.45], [62, 0.45], [67, 0.45], [71, 0.45], [74, 1.5]], 0.32, 0.84, 0.25)
    },
    {
      id: 'beethoven',
      name: '貝多芬',
      en: 'L.v. Beethoven',
      born: 1770,
      died: 1827,
      country: '德國',
      era: 'classical',
      title: '樂聖',
      work: '《第五號交響曲・命運》',
      clue1: '中年失聰仍創作出不朽鉅作的「樂聖」，承先啟後開啟浪漫大門。',
      clue2: '古典晚期德國大師，代表作《命運》《月光奏鳴曲》《歡樂頌》。',
      tip: '經典「短短短長」四音動機，像命運敲門一樣充滿張力。',
      theme: seq([[67, 0.45, 0.3], [67, 0.45, 0.3], [67, 0.45, 0.3], [63, 1.8, 0.32], [0, 0.35], [65, 0.45, 0.3], [65, 0.45, 0.3], [65, 0.45, 0.3], [62, 2.0, 0.32]], 0.34, 0.9, 0.28)
    },
    {
      id: 'schubert',
      name: '舒伯特',
      en: 'F. Schubert',
      born: 1797,
      died: 1828,
      country: '奧地利',
      era: 'romantic',
      title: '歌曲之王',
      work: '《鱒魚》',
      clue1: '短短 31 年生涯寫下超過 600 首藝術歌曲，被譽為「歌曲之王」。',
      clue2: '浪漫初期奧地利作曲家，代表作《魔王》《野玫瑰》《鱒魚》。',
      tip: '旋律如歌唱般清澈靈動，像溪水中的小魚跳躍。',
      theme: seq([[69, 0.5], [74, 0.5], [74, 0.5], [78, 0.5], [78, 0.5], [74, 1], [69, 0.5], [69, 0.5], [71, 0.75], [73, 0.25], [74, 0.5], [71, 0.5], [69, 1.2]], 0.36, 0.84, 0.24)
    },
    {
      id: 'chopin',
      name: '蕭邦',
      en: 'F. Chopin',
      born: 1810,
      died: 1849,
      country: '波蘭',
      era: 'romantic',
      title: '鋼琴詩人',
      work: '《降E大調夜曲 Op.9 No.2》',
      clue1: '幾乎所有作品都為鋼琴而寫，細膩多情，被稱為「鋼琴詩人」。',
      clue2: '浪漫時期波蘭作曲家，代表作《夜曲》《小狗圓舞曲》《革命練習曲》。',
      tip: '如歌般的右手裝飾旋律，充滿浪漫柔情與詩意。',
      theme: seq([[70, 0.6], [79, 1.5], [77, 0.45], [79, 0.45], [77, 0.45], [75, 1.4], [70, 0.6], [79, 1.2], [75, 0.6], [84, 1.5], [79, 1.2]], 0.42, 0.92, 0.22)
    },
    {
      id: 'tchaikovsky',
      name: '柴可夫斯基',
      en: 'P.I. Tchaikovsky',
      born: 1840,
      died: 1893,
      country: '俄國',
      era: 'romantic',
      title: '芭蕾音樂大師',
      work: '《天鵝湖》',
      clue1: '寫出三大經典芭蕾舞劇，旋律深情華麗、戲劇張力十足。',
      clue2: '浪漫時期俄國大師，代表作《天鵝湖》《胡桃鉗》《1812序曲》。',
      tip: '哀婉優美的小調長旋律，勾勒出月夜湖畔的天鵝身影。',
      theme: seq([[78, 1.4], [71, 0.5], [73, 0.5], [74, 0.5], [76, 0.5], [78, 1.1], [74, 0.5], [78, 1.1], [74, 0.5], [78, 1.1], [71, 0.5], [74, 0.5], [71, 0.5], [67, 0.5], [74, 0.5], [71, 1.6]], 0.38, 0.9, 0.24)
    },
    {
      id: 'debussy',
      name: '德布西',
      en: 'C. Debussy',
      born: 1862,
      died: 1918,
      country: '法國',
      era: 'modern',
      title: '印象派大師',
      work: '《月光》',
      clue1: '善用色彩和聲、五聲音階與全音階營造光影霧氣，開創印象派音樂。',
      clue2: '現代／印象派法國大師，代表作《月光》《牧神午後前奏曲》《大海》。',
      tip: '柔和飄渺的和聲色彩，如月光照映在水面上的朦朧光影。',
      theme: seq([[77, 1.4, 0.18], [73, 1.6, 0.18], [75, 0.6, 0.18], [73, 0.6, 0.18], [72, 1.2, 0.18], [73, 0.6, 0.18], [72, 0.6, 0.18], [70, 1.8, 0.18]], 0.44, 0.96, 0.18)
    }
  ];

  var COMPOSER_MAP = {};
  COMPOSERS.forEach(function (c) { COMPOSER_MAP[c.id] = c; });

  function pickInt(rng, count) {
    return Math.min(count - 1, Math.floor(rng() * count));
  }

  function shuffle(list, rng) {
    var copy = list.slice();
    var r = rng || Math.random;
    for (var i = copy.length - 1; i > 0; i--) {
      var j = pickInt(r, i + 1);
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function buildDetectiveRound(count, rng) {
    var r = rng || Math.random;
    var need = Math.min(count || DETECTIVE_COUNT, COMPOSERS.length);
    return shuffle(COMPOSERS, r).slice(0, need).map(function (target) {
      var distractors = shuffle(COMPOSERS.filter(function (c) { return c.id !== target.id; }), r).slice(0, 3);
      return {
        target: target,
        choices: shuffle([target].concat(distractors), r)
      };
    });
  }

  function detectivePoints(clueLevel) {
    if (clueLevel <= 0) return 30;
    if (clueLevel === 1) return 20;
    return 10;
  }

  function buildTimelineQuestion(rng) {
    var r = rng || Math.random;
    // Pick 3 composers with distinct birth years (preferring distinct eras)
    var byEra = shuffle(ERAS, r).slice(0, 3);
    var picked = byEra.map(function (era) {
      var pool = COMPOSERS.filter(function (c) { return c.era === era.id; });
      return pool[pickInt(r, pool.length)];
    });
    var sorted = picked.slice().sort(function (a, b) { return a.born - b.born; });
    return {
      cards: shuffle(picked, r),
      expectedIds: sorted.map(function (c) { return c.id; }),
      ordered: sorted
    };
  }

  function checkTimelineOrder(question, chosenIds) {
    if (!question || !Array.isArray(chosenIds) || chosenIds.length !== question.expectedIds.length) return false;
    for (var i = 0; i < question.expectedIds.length; i++) {
      if (chosenIds[i] !== question.expectedIds[i]) return false;
    }
    return true;
  }

  function buildEraSortCard(lastId, rng) {
    var r = rng || Math.random;
    var pool = COMPOSERS.filter(function (c) { return c.id !== lastId; });
    var c = pool[pickInt(r, pool.length)] || COMPOSERS[0];
    var showWork = r() < 0.45;
    return {
      id: c.id,
      era: c.era,
      headline: showWork ? c.work : (c.name + '（' + c.en + '）'),
      sub: showWork ? ('作曲家：' + c.name + ' · ' + c.title) : (c.title + ' · ' + c.country),
      composer: c
    };
  }

  // Lightweight self-contained Web Audio playback (reuses shared AudioEngine if present)
  var activePlay = null;
  function getCtx() {
    var engine = root.AudioEngine;
    if (engine && typeof engine.ensureCtx === 'function') {
      var shared = engine.ensureCtx();
      if (shared) return shared;
    }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!getCtx.ctx) {
      try { getCtx.ctx = new AC(); } catch (err) { return null; }
    }
    return getCtx.ctx;
  }

  function stopAudio() {
    if (!activePlay) return;
    var ctx = activePlay.ctx;
    var master = activePlay.master;
    activePlay = null;
    try {
      var now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      master.disconnect();
    } catch (err) {}
  }

  function playTheme(events) {
    var ctx = getCtx();
    if (!ctx || !events || !events.length) return false;
    if (root.AudioEngine && typeof root.AudioEngine.unlock === 'function') root.AudioEngine.unlock();
    else if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () {});
    stopAudio();
    var master = ctx.createGain();
    master.gain.setValueAtTime(0.9, ctx.currentTime);
    master.connect(ctx.destination);
    activePlay = { ctx: ctx, master: master };
    var start = ctx.currentTime + 0.04;
    events.forEach(function (ev) {
      var freq = 440 * Math.pow(2, (ev.midi - 69) / 12);
      var osc = ctx.createOscillator();
      var over = ctx.createOscillator();
      var amp = ctx.createGain();
      var overAmp = ctx.createGain();
      osc.type = 'triangle';
      over.type = 'sine';
      osc.frequency.setValueAtTime(freq, start + ev.at);
      over.frequency.setValueAtTime(freq * 2, start + ev.at);
      overAmp.gain.setValueAtTime(0.18, start + ev.at);
      osc.connect(amp);
      over.connect(overAmp);
      overAmp.connect(amp);
      amp.connect(master);
      var peak = ev.gain || 0.22;
      amp.gain.setValueAtTime(0.0001, start + ev.at);
      amp.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + ev.at + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + ev.at + Math.max(ev.dur, 0.1));
      osc.start(start + ev.at);
      over.start(start + ev.at);
      osc.stop(start + ev.at + ev.dur + 0.04);
      over.stop(start + ev.at + ev.dur + 0.04);
    });
    return true;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  var BOARD_PREFIX = 'composerLocalBoard_v1_';
  function readBoard(storage, subMode) {
    if (!storage) return [];
    try {
      var arr = JSON.parse(storage.getItem(BOARD_PREFIX + subMode) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (err) { return []; }
  }

  function commitBoard(storage, subMode, name, score) {
    if (!storage || !name || name === '訪客') return readBoard(storage, subMode).slice(0, 5);
    var rows = readBoard(storage, subMode);
    var existing = rows.find(function (r) { return r && r.name === name; });
    var next = rows.filter(function (r) { return !(r && r.name === name); });
    var best = existing ? Math.max(parseInt(existing.score, 10) || 0, score) : score;
    next.push({ name: name, score: best });
    next.sort(function (a, b) { return (parseInt(b.score, 10) || 0) - (parseInt(a.score, 10) || 0); });
    try { storage.setItem(BOARD_PREFIX + subMode, JSON.stringify(next.slice(0, 20))); } catch (err) {}
    return next.slice(0, 5);
  }

  var activeStopper = null;
  function stop() {
    stopAudio();
    if (typeof activeStopper === 'function') activeStopper();
  }

  function mount(doc) {
    if (!doc || !doc.body || doc.body.dataset.composerGameMounted) return;
    var rootEl = doc.getElementById('composerRoot');
    if (!rootEl) return;
    doc.body.dataset.composerGameMounted = '1';

    var activeTab = 'atlas';
    var atlasEra = 'all';
    var detState = null;
    var tlState = null;
    var eraState = null;
    var pendingTimer = 0;
    var eraTimer = 0;

    function clearTimers() {
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = 0; }
      if (eraTimer) { clearInterval(eraTimer); eraTimer = 0; }
    }
    activeStopper = clearTimers;

    function go(screenId) {
      clearTimers();
      stopAudio();
      root.dispatchEvent(new CustomEvent('composer-navigate', { detail: { screen: screenId } }));
    }

    function currentPlayerName() {
      if (doc.body.classList.contains('app-shell')) {
        var social = root.MusicAppAuth && root.MusicAppAuth.user;
        var n = (social && social.displayName) || '';
        try { if (!n) n = root.localStorage.getItem('appPlayerName') || ''; } catch (err) {}
        return n;
      }
      var el = doc.getElementById('hubName');
      if (!el || !el.value || el.value === '__guest__') return '';
      if (el.value === '__other__') {
        var custom = doc.getElementById('hubCustomNameInput');
        return custom ? custom.value.trim() : '';
      }
      return el.value;
    }

    function boardHtml(subMode, score) {
      var name = currentPlayerName();
      var rows = commitBoard(root.localStorage, subMode, name, score);
      if (!rows.length) return '';
      return '<div class="composer-board"><div class="aural-board-title">本機最高分</div>' +
        rows.map(function (r, idx) {
          return '<div class="aural-board-row' + (name && r.name === name ? ' is-self' : '') + '"><span>' + (idx + 1) + '. ' + esc(r.name) + '</span><b>' + esc(r.score) + '</b></div>';
        }).join('') + '</div>';
    }

    function setTab(tab) {
      clearTimers();
      stopAudio();
      activeTab = tab;
      doc.querySelectorAll('#composerTabs [data-composer-tab]').forEach(function (btn) {
        var on = btn.getAttribute('data-composer-tab') === tab;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (tab === 'atlas') renderAtlas();
      else if (tab === 'detective') startDetective();
      else if (tab === 'timeline') startTimeline();
      else if (tab === 'erasort') startEraSort();
    }

    /* ── 1. 音樂家圖鑑 ── */
    function renderAtlas() {
      var list = atlasEra === 'all' ? COMPOSERS : COMPOSERS.filter(function (c) { return c.era === atlasEra; });
      rootEl.innerHTML =
        modeBanner('atlas') +
        '<div class="composer-era-pills" role="group" aria-label="時期篩選">' +
          '<button type="button" class="hub-filter-pill' + (atlasEra === 'all' ? ' is-active' : '') + '" data-atlas-era="all">全部 (' + COMPOSERS.length + ')</button>' +
          ERAS.map(function (era) {
            return '<button type="button" class="hub-filter-pill' + (atlasEra === era.id ? ' is-active' : '') + '" data-atlas-era="' + era.id + '">' +
              '<img class="era-tile-art" src="' + eraArt(era.id) + '" alt="" loading="lazy" decoding="async">' +
              '<span>' + esc(era.label) + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="composer-atlas-grid">' +
          list.map(function (c) {
            var era = ERA_MAP[c.era];
            return '<article class="composer-card">' +
              '<div class="composer-card-head">' +
                '<img class="composer-portrait" src="img/composers/' + c.id + '.jpg" alt="' + esc(c.name) + '肖像" loading="lazy" decoding="async">' +
                '<div class="composer-card-meta">' +
                  '<div class="composer-card-top">' +
                    '<span class="composer-era-badge" style="background:' + era.color + '">' + esc(era.label) + '</span>' +
                    '<span class="composer-years">' + c.born + '–' + c.died + ' · ' + esc(c.country) + '</span>' +
                  '</div>' +
                  '<h3 class="composer-name">' + esc(c.name) + ' <span class="composer-en">' + esc(c.en) + '</span></h3>' +
                  '<div class="composer-title-tag">🏅 ' + esc(c.title) + ' · ' + esc(c.work) + '</div>' +
                '</div>' +
              '</div>' +
              '<p class="composer-tip">' + esc(c.tip) + '</p>' +
              '<button type="button" class="composer-listen-btn" data-play-composer="' + c.id + '">🔊 試聽代表主題</button>' +
            '</article>';
          }).join('') +
        '</div>';
    }

    /* ── 2. 音樂偵探（聽主題＋分段線索） ── */
    function startDetective() {
      detState = {
        rounds: buildDetectiveRound(DETECTIVE_COUNT),
        idx: 0,
        score: 0,
        correct: 0,
        combo: 0,
        clueLevel: 0,
        locked: false
      };
      renderDetective();
    }

    function renderDetective() {
      if (!detState) return;
      if (detState.idx >= detState.rounds.length) {
        stopAudio();
        rootEl.innerHTML =
          '<div class="composer-result">' +
            '<h2>🕵️ 音樂偵探結算</h2>' +
            '<p class="composer-result-score">' + detState.score + ' 分</p>' +
            '<p>答對 ' + detState.correct + ' / ' + detState.rounds.length + ' 題</p>' +
            boardHtml('detective', detState.score) +
            '<button type="button" class="btn-start" id="composerDetAgain">再玩一輪</button>' +
          '</div>';
        var again = doc.getElementById('composerDetAgain');
        if (again) again.onclick = startDetective;
        return;
      }
      var cur = detState.rounds[detState.idx];
      var target = cur.target;
      var ptsNow = detectivePoints(detState.clueLevel);
      var clueHtml = '';
      if (detState.clueLevel >= 1) clueHtml += '<div class="composer-clue">💡 線索 1：' + esc(target.clue1) + '</div>';
      if (detState.clueLevel >= 2) clueHtml += '<div class="composer-clue">💡 線索 2：' + esc(target.clue2) + '</div>';

      rootEl.innerHTML =
        modeBanner('detective') +
        '<div class="composer-hud">' +
          '<span>第 ' + (detState.idx + 1) + ' / ' + detState.rounds.length + ' 題</span>' +
          '<span>目前答對可得 <b>+' + ptsNow + '</b> 分</span>' +
          '<span>總分 <b>' + detState.score + '</b></span>' +
        '</div>' +
        '<div class="composer-stage">' +
          '<div class="composer-stage-actions">' +
            '<button type="button" class="aural-replay" id="composerDetPlay">🔊 播放代表主題</button>' +
            '<button type="button" class="composer-clue-btn" id="composerDetClue"' + (detState.clueLevel >= 2 || detState.locked ? ' disabled' : '') + '>💡 打開線索（目前可開 ' + (2 - detState.clueLevel) + ' 條）</button>' +
          '</div>' +
          '<div class="composer-clues">' + (clueHtml || '<p class="composer-hint">先聽主題旋律直接猜，越少開線索分數越高！</p>') + '</div>' +
          '<p class="composer-feedback" id="composerDetFeedback" aria-live="polite"></p>' +
          '<div class="composer-options">' +
            cur.choices.map(function (c) {
              return '<button type="button" class="aural-opt composer-opt-with-img" data-det-pick="' + c.id + '">' +
                '<img class="composer-thumb" src="img/composers/' + c.id + '.jpg" alt="" loading="lazy" decoding="async">' +
                '<span><strong>' + esc(c.name) + '</strong><br><small>' + esc(c.en) + '</small></span>' +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>';

      var playBtn = doc.getElementById('composerDetPlay');
      if (playBtn) playBtn.onclick = function () { playTheme(target.theme); };
      var clueBtn = doc.getElementById('composerDetClue');
      if (clueBtn) {
        clueBtn.onclick = function () {
          if (detState.locked || detState.clueLevel >= 2) return;
          detState.clueLevel += 1;
          renderDetective();
        };
      }
      if (detState.clueLevel === 0 && !detState.locked) playTheme(target.theme);
    }

    function handleDetectivePick(id) {
      if (!detState || detState.locked) return;
      detState.locked = true;
      var cur = detState.rounds[detState.idx];
      var target = cur.target;
      var ok = id === target.id;
      var gained = 0;
      if (ok) {
        detState.correct += 1;
        detState.combo += 1;
        gained = detectivePoints(detState.clueLevel);
        detState.score += gained;
      } else {
        detState.combo = 0;
      }
      var fb = doc.getElementById('composerDetFeedback');
      if (fb) {
        fb.textContent = (ok ? ('✅ 答對！+' + gained + ' 分 — ') : '❌ 未中 — ') +
          target.name + '（' + ERA_MAP[target.era].label + '，代表作' + target.work + '）';
      }
      rootEl.querySelectorAll('[data-det-pick]').forEach(function (btn) {
        btn.disabled = true;
        if (btn.getAttribute('data-det-pick') === target.id) btn.classList.add('is-correct');
        else if (btn.getAttribute('data-det-pick') === id) btn.classList.add('is-wrong');
      });
      pendingTimer = setTimeout(function () {
        pendingTimer = 0;
        if (!detState) return;
        detState.idx += 1;
        detState.clueLevel = 0;
        detState.locked = false;
        renderDetective();
      }, 1500);
    }

    /* ── 3. 時間軸快排 ── */
    function startTimeline() {
      tlState = { idx: 0, score: 0, correct: 0, q: buildTimelineQuestion(), picked: [], locked: false };
      renderTimeline();
    }

    function renderTimeline() {
      if (!tlState) return;
      if (tlState.idx >= TIMELINE_COUNT) {
        rootEl.innerHTML =
          '<div class="composer-result">' +
            '<h2>⏳ 時間軸快排結算</h2>' +
            '<p class="composer-result-score">' + tlState.score + ' 分</p>' +
            '<p>全對題數：' + tlState.correct + ' / ' + TIMELINE_COUNT + ' 題</p>' +
            boardHtml('timeline', tlState.score) +
            '<button type="button" class="btn-start" id="composerTlAgain">再玩一輪</button>' +
          '</div>';
        var again = doc.getElementById('composerTlAgain');
        if (again) again.onclick = startTimeline;
        return;
      }
      var q = tlState.q;
      rootEl.innerHTML =
        modeBanner('timeline') +
        '<div class="composer-hud">' +
          '<span>第 ' + (tlState.idx + 1) + ' / ' + TIMELINE_COUNT + ' 題</span>' +
          '<span>依 <b>最早 → 最晚</b> 順序點選</span>' +
          '<span>總分 <b>' + tlState.score + '</b></span>' +
        '</div>' +
        '<div class="composer-stage">' +
          '<div class="composer-timeline-slots">' +
            [0, 1, 2].map(function (slotIdx) {
              var cid = tlState.picked[slotIdx];
              var c = cid ? COMPOSER_MAP[cid] : null;
              return '<button type="button" class="composer-slot' + (c ? ' is-filled' : '') + '" data-tl-unpick="' + (cid || '') + '">' +
                '<span class="composer-slot-num">' + (slotIdx + 1) + '</span>' +
                '<span>' + (c ? esc(c.name) : '未選') + '</span>' +
              '</button>';
            }).join('<span class="composer-arrow" aria-hidden="true">→</span>') +
          '</div>' +
          '<div class="composer-timeline-cards">' +
            q.cards.map(function (c) {
              var used = tlState.picked.indexOf(c.id) !== -1;
              return '<button type="button" class="composer-tl-card' + (used ? ' is-used' : '') + '" data-tl-pick="' + c.id + '"' + (used || tlState.locked ? ' disabled' : '') + '>' +
                '<img class="composer-thumb" src="img/composers/' + c.id + '.jpg" alt="" loading="lazy" decoding="async">' +
                '<div class="composer-tl-copy"><strong>' + esc(c.name) + '</strong><span>' + esc(c.title) + ' · ' + esc(c.work) + '</span></div>' +
              '</button>';
            }).join('') +
          '</div>' +
          '<div class="composer-stage-actions">' +
            '<button type="button" class="btn-start" id="composerTlSubmit"' + (tlState.picked.length !== 3 || tlState.locked ? ' disabled' : '') + '>確認順序</button>' +
          '</div>' +
          '<p class="composer-feedback" id="composerTlFeedback" aria-live="polite"></p>' +
        '</div>';

      var sub = doc.getElementById('composerTlSubmit');
      if (sub) sub.onclick = submitTimeline;
    }

    function submitTimeline() {
      if (!tlState || tlState.locked || tlState.picked.length !== 3) return;
      tlState.locked = true;
      var ok = checkTimelineOrder(tlState.q, tlState.picked);
      if (ok) { tlState.correct += 1; tlState.score += 20; }
      var answerLine = tlState.q.ordered.map(function (c) {
        return c.name + '(' + c.born + ', ' + ERA_MAP[c.era].label + ')';
      }).join(' → ');
      var fb = doc.getElementById('composerTlFeedback');
      if (fb) fb.textContent = (ok ? '✅ 排序正確！+20 分　' : '❌ 正確順序：') + answerLine;
      pendingTimer = setTimeout(function () {
        pendingTimer = 0;
        if (!tlState) return;
        tlState.idx += 1;
        tlState.q = buildTimelineQuestion();
        tlState.picked = [];
        tlState.locked = false;
        renderTimeline();
      }, 2000);
    }

    /* ── 4. 時期歸隊（60 秒極速分類） ── */
    function startEraSort() {
      clearTimers();
      eraState = {
        score: 0,
        combo: 0,
        maxCombo: 0,
        correct: 0,
        wrong: 0,
        endsAt: Date.now() + ERA_SORT_MS,
        card: buildEraSortCard('', Math.random),
        locked: false,
        feedback: ''
      };
      eraTimer = setInterval(function () {
        if (!eraState) return;
        var left = Math.max(0, Math.ceil((eraState.endsAt - Date.now()) / 1000));
        var el = doc.getElementById('composerEraLeft');
        if (el) el.textContent = left + 's';
        if (left <= 0) finishEraSort();
      }, 200);
      renderEraSort();
    }

    function renderEraSort() {
      if (!eraState) return;
      var left = Math.max(0, Math.ceil((eraState.endsAt - Date.now()) / 1000));
      rootEl.innerHTML =
        modeBanner('erasort') +
        '<div class="composer-hud">' +
          '<span>剩餘 <b id="composerEraLeft">' + left + 's</b></span>' +
          '<span>連擊 <b>' + eraState.combo + '</b></span>' +
          '<span>總分 <b>' + eraState.score + '</b></span>' +
        '</div>' +
        '<div class="composer-stage">' +
          '<div class="composer-sort-card">' +
            '<img class="composer-portrait composer-portrait--lg" src="img/composers/' + eraState.card.id + '.jpg" alt="' + esc(eraState.card.composer.name) + '肖像" loading="lazy" decoding="async">' +
            '<div class="composer-sort-headline">' + esc(eraState.card.headline) + '</div>' +
            '<div class="composer-sort-sub">' + esc(eraState.card.sub) + '</div>' +
          '</div>' +
          '<p class="composer-feedback" id="composerEraFeedback" aria-live="polite">' + esc(eraState.feedback) + '</p>' +
          '<div class="composer-era-bins">' +
            ERAS.map(function (era) {
              return '<button type="button" class="composer-era-bin" data-era-pick="' + era.id + '" style="--era-c:' + era.color + '">' +
                '<img class="era-tile-art" src="' + eraArt(era.id) + '" alt="" loading="lazy" decoding="async">' +
                '<strong>' + esc(era.label) + '</strong><small>' + esc(era.years) + '</small>' +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>';
    }

    function handleEraPick(eraId) {
      if (!eraState || eraState.locked) return;
      var ok = eraId === eraState.card.era;
      if (ok) {
        eraState.correct += 1;
        eraState.combo += 1;
        if (eraState.combo > eraState.maxCombo) eraState.maxCombo = eraState.combo;
        var pts = 10 + Math.min(eraState.combo, 10);
        eraState.score += pts;
        eraState.feedback = '✅ 正確！+' + pts + ' 分';
      } else {
        eraState.wrong += 1;
        eraState.combo = 0;
        eraState.feedback = '❌ 屬於 ' + ERA_MAP[eraState.card.era].label + '（' + eraState.card.composer.born + '–' + eraState.card.composer.died + '）';
      }
      eraState.card = buildEraSortCard(eraState.card.id, Math.random);
      renderEraSort();
    }

    function finishEraSort() {
      clearTimers();
      if (!eraState) return;
      var st = eraState;
      eraState = null;
      var total = st.correct + st.wrong;
      var acc = total ? Math.round((st.correct / total) * 100) : 0;
      rootEl.innerHTML =
        '<div class="composer-result">' +
          '<h2>📦 時期歸隊結算</h2>' +
          '<p class="composer-result-score">' + st.score + ' 分</p>' +
          '<p>答對 ' + st.correct + ' / ' + total + ' 題（正確率 ' + acc + '% · 最高連擊 ' + st.maxCombo + '）</p>' +
          boardHtml('erasort', st.score) +
          '<button type="button" class="btn-start" id="composerEraAgain">再挑戰 60 秒</button>' +
        '</div>';
      var again = doc.getElementById('composerEraAgain');
      if (again) again.onclick = startEraSort;
    }

    /* ── Event Delegation ── */
    var backBtn = doc.getElementById('composerBackHub');
    if (backBtn) backBtn.addEventListener('click', function () { go('screen-hub'); });

    var tabsEl = doc.getElementById('composerTabs');
    if (tabsEl) {
      tabsEl.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-composer-tab]');
        if (!btn) return;
        setTab(btn.getAttribute('data-composer-tab'));
      });
    }

    rootEl.addEventListener('click', function (ev) {
      var atlasBtn = ev.target.closest('[data-atlas-era]');
      if (atlasBtn) {
        atlasEra = atlasBtn.getAttribute('data-atlas-era') || 'all';
        renderAtlas();
        return;
      }
      var playBtn = ev.target.closest('[data-play-composer]');
      if (playBtn) {
        var c = COMPOSER_MAP[playBtn.getAttribute('data-play-composer')];
        if (c) playTheme(c.theme);
        return;
      }
      var detBtn = ev.target.closest('[data-det-pick]');
      if (detBtn) {
        handleDetectivePick(detBtn.getAttribute('data-det-pick'));
        return;
      }
      var tlPick = ev.target.closest('[data-tl-pick]');
      if (tlPick && tlState && !tlState.locked) {
        var cid = tlPick.getAttribute('data-tl-pick');
        if (cid && tlState.picked.indexOf(cid) === -1 && tlState.picked.length < 3) {
          tlState.picked.push(cid);
          renderTimeline();
        }
        return;
      }
      var tlUnpick = ev.target.closest('[data-tl-unpick]');
      if (tlUnpick && tlState && !tlState.locked) {
        var uid = tlUnpick.getAttribute('data-tl-unpick');
        if (uid) {
          tlState.picked = tlState.picked.filter(function (x) { return x !== uid; });
          renderTimeline();
        }
        return;
      }
      var eraBtn = ev.target.closest('[data-era-pick]');
      if (eraBtn) {
        handleEraPick(eraBtn.getAttribute('data-era-pick'));
      }
    });

    setTab('atlas');
  }

  return {
    GAME_KEY: GAME_KEY,
    ERAS: ERAS,
    COMPOSERS: COMPOSERS,
    detectivePoints: detectivePoints,
    buildDetectiveRound: buildDetectiveRound,
    buildTimelineQuestion: buildTimelineQuestion,
    checkTimelineOrder: checkTimelineOrder,
    buildEraSortCard: buildEraSortCard,
    playTheme: playTheme,
    stop: stop,
    mount: mount
  };
});
