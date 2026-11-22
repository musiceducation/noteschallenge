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
    bad_choice: '請選一個選項。',
    bad_quiz: '題目還未完成。請檢查題幹、選項和正確答案。',
    empty: '請先加至少一題。',
    migration_required: '課室服務還沒更新。請老師稍後再試。',
    not_found: '找不到這個代碼。',
    offline: '課室服務暫時連不上。'
  };
  var LETTERS = ['A', 'B', 'C', 'D'];

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
      return inst && inst.nameZh && /^img\/instruments\/[A-Za-z0-9._-]+$/.test(inst.img || '');
    });
  }

  function buildInstrument(bank, rng) {
    var Cat = root.InstrumentCategory;
    if (!Cat || typeof Cat.resolve !== 'function') return null;
    var spec = Cat.resolve(bank || [], 'chinese');
    var photos = localPhotos(spec);
    if (photos.length < 2) {
      spec = Cat.resolve(bank || [], 'orchestra');
      photos = localPhotos(spec);
    }
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

  function buildBankItem(game, rng, bank) {
    if (game === 'note-name') return buildNoteName(rng);
    if (game === 'staff-interval') return buildStaffInterval(rng);
    if (game === 'aural-interval') return buildAural(rng);
    if (game === 'rhythm') return buildRhythm(rng);
    if (game === 'terms') return buildTerms(rng);
    if (game === 'instrument') return buildInstrument(bank, rng);
    return null;
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

  function mediaHtml(question) {
    var render = question && question.render;
    if (!render) return '';
    if (render.kind === 'staff') {
      return '<div class="lq-media"><div data-live-staff="' + esc(JSON.stringify({ clef: render.clef, notes: render.notes })) + '"></div></div>';
    }
    if (render.kind === 'aural' && Array.isArray(render.midis)) {
      return '<div class="lq-media"><button type="button" class="lq-btn" data-act="play" data-midis="' + esc(render.midis.join(',')) + '" data-harmonic="' + (render.harmonic ? '1' : '0') + '">再聽一次</button></div>';
    }
    if (render.kind === 'rhythm') {
      return '<div class="lq-media"><div class="lq-rhythm" data-live-rhythm="1" data-shown="' + esc(render.shown || '') + '" data-blank="' + esc(render.blankQuarters) + '"></div></div>';
    }
    if (render.kind === 'instrument' && /^img\/instruments\/[A-Za-z0-9._-]+$/.test(render.image || '')) {
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
    return '<ol class="lq-board">' + (players || []).map(function (player) {
      return '<li class="lq-rank"><span class="lq-avatar">' + esc(player.avatar || '🎵') + '</span><span>' + esc(player.name) + '</span>' +
        (player.you ? '<span class="lq-you">你</span>' : '') + '<span class="lq-score">' + esc(player.score || 0) + '</span></li>';
    }).join('') + '</ol>';
  }

  function podiumHtml(players) {
    var top = (players || []).slice(0, 3);
    if (!top.length) return '';
    var order = [top[1], top[0], top[2]];
    return '<div class="lq-podium">' + order.map(function (player, index) {
      if (!player) return '<div></div>';
      var place = index === 1 ? 1 : (index === 0 ? 2 : 3);
      return '<div class="lq-pod lq-pod-' + place + '"><span>' + esc(player.avatar || '🎵') + '</span><b>' + place + '</b><div>' + esc(player.name) + '</div><div>' + esc(player.score || 0) + '</div></div>';
    }).join('') + '</div>';
  }

  function renderRoom(view, opts) {
    var host = !!(opts && opts.host) || !!(view && view.host);
    var phase = view.phase;
    var players = view.players || [];
    var question = view.question;
    var body = '';
    if (phase === 'lobby') {
      body = '<section class="lq-card"><p class="lq-sub">同學輸入代碼加入。老師按開始之後，全員同時作答。</p><p class="lq-code">' + esc(view.code) + '</p>' +
        '<p class="lq-note">已加入 ' + players.length + ' 人</p>' + peopleHtml(players) +
        (host ? '<div class="lq-row"><button type="button" class="lq-btn" data-act="advance">開始第一題</button></div>' : '<p class="lq-note">等待老師開始。</p>') +
        '</section>';
    } else if (phase === 'question' && question) {
      var remain = Math.max(0, Number(view.questionEndsAt) - (Date.now() + Number(opts && opts.offset || 0)));
      var ratio = view.limitMs ? Math.max(0, Math.min(1, remain / Number(view.limitMs))) : 0;
      body = '<section class="lq-card"><p class="lq-tag">' + esc(gameLabel(question.game || question.type)) + ' · 第 ' + (Number(view.index) + 1) + ' / ' + esc(view.total) + ' 題</p>' +
        '<div class="lq-count" id="lqCount" style="--lq-p:' + Math.round(ratio * 100) + '"><span id="lqCountNum">' + Math.ceil(remain / 1000) + '</span></div>' +
        '<h2 class="lq-prompt">' + esc(question.prompt) + '</h2>' + mediaHtml(question) +
        '<div class="lq-choices">' + question.choices.map(function (choice, index) {
          return '<button type="button" class="lq-choice lq-c' + (index % 4) + '" data-act="choice" data-choice="' + esc(choice.id) + '"' + (host || view.locked ? ' disabled' : '') + '><span class="lq-mark">' + LETTERS[index] + '</span><span>' + esc(choice.label) + '</span></button>';
        }).join('') + '</div><p class="lq-note">' + (view.locked ? '答案已鎖定。' : '已作答 ' + esc(view.answered || 0) + ' / ' + players.length) + '</p>' +
        (host ? '<div class="lq-row"><button type="button" class="lq-btn soft" data-act="advance">結束本題</button></div>' : '') +
        '</section>';
    } else if ((phase === 'reveal' || phase === 'done') && question) {
      var correct = (question.choices || []).filter(function (choice) { return choice.correct; })[0];
      body = '<section class="lq-card"><p class="lq-tag">正確答案</p><h2 class="lq-prompt">' + esc(question.prompt) + '</h2>' + mediaHtml(question) +
        '<div class="lq-choices">' + (question.choices || []).map(function (choice, index) {
          var cls = 'lq-choice lq-c' + (index % 4) + (choice.correct ? ' is-correct' : '') + (view.yourChoice === choice.id ? ' is-yours' : '');
          return '<button type="button" class="' + cls + '" disabled><span class="lq-mark">' + LETTERS[index] + '</span><span>' + esc(choice.label) + '</span></button>';
        }).join('') + '</div><p class="lq-note">' + (correct ? '答案是「' + esc(correct.label) + '」。' : '') +
        (view.yourChoice ? ' 你這一題 ' + esc(view.yourPoints || 0) + ' 分。' : '') + '</p></section>' +
        '<section class="lq-card"><h2>' + (phase === 'done' ? '最後名次' : '目前排名') + '</h2>' +
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
      var renderer = new Renderer(hostEl, Renderer.Backends.SVG);
      renderer.resize(width, height);
      var context = renderer.getContext();
      var stave = new Stave(10, 20, width - 20);
      stave.addTimeSignature('4/4');
      stave.setContext(context).draw();
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

  function hydrate(doc) {
    var staff = doc.querySelector('[data-live-staff]');
    if (staff && root.TheoryDrill && typeof root.TheoryDrill.renderStaffSvg === 'function') {
      try {
        var payload = JSON.parse(staff.getAttribute('data-live-staff') || '{}');
        staff.innerHTML = root.TheoryDrill.renderStaffSvg(payload.clef, payload.notes || []);
      } catch (err) {}
    }
    var rhythm = doc.querySelector('[data-live-rhythm]');
    if (rhythm) renderRhythm(rhythm);
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
      view: null,
      notice: '',
      offset: 0,
      sig: '',
      poll: 0,
      clock: 0,
      busy: false
    };

    function show(id) {
      doc.querySelectorAll('.screen').forEach(function (el) {
        el.classList.toggle('active', el.id === id);
      });
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

    function homeHtml(auth) {
      var join = '<section class="lq-card"><h2>加入搶答</h2><p class="lq-sub">用課堂短碼或名冊姓名加入。代碼在老師的畫面上。</p>' +
        '<div class="lq-field"><label for="lqJoinCode">加入代碼</label><input id="lqJoinCode" maxlength="6" autocomplete="off" placeholder="例如 K7M4QP"></div>' +
        '<div class="lq-row"><button type="button" class="lq-btn" data-act="join">加入</button></div></section>';
      if (!auth.signedIn) {
        return '<section class="lq-card"><h2>請先登入</h2><p class="lq-sub">老師用教師帳號。同學用名冊或課堂短碼。訪客和測試人員不能存正式成績。</p></section>';
      }
      if (auth.tester) {
        return '<section class="lq-card"><h2>測試人員</h2><p class="lq-sub">測試人員可以看畫面，但不能加入，也不會存成正式成績。</p></section>';
      }
      if (!auth.teacher) return join;
      var list = ui.quizzes.map(function (quiz) {
        return '<li><span><b>' + esc(quiz.title) + '</b><small> · ' + esc(quiz.count) + ' 題</small></span><button type="button" class="lq-btn soft" data-act="host" data-id="' + esc(quiz.id) + '">主持</button></li>';
      }).join('');
      return '<section class="lq-card"><h2>我的測驗</h2>' + (list ? '<ul class="lq-items">' + list + '</ul>' : '<p class="lq-note">還沒有已儲存的測驗。</p>') +
        '<div class="lq-row"><button type="button" class="lq-btn" data-act="editor">新測驗</button></div></section>' + join;
    }

    function editorHtml() {
      var draft = ui.draft;
      var items = draft.items.map(function (item, index) {
        return '<li><span><b>' + esc(gameLabel(item.game || item.type)) + '</b> ' + esc(item.prompt) + '</span><button type="button" class="lq-mini lq-btn soft" data-act="remove" data-index="' + index + '">刪除</button></li>';
      }).join('');
      var banks = GAMES.map(function (game) {
        return '<button type="button" class="lq-btn soft" data-act="bank" data-game="' + game.id + '">' + esc(game.label) + '</button>';
      }).join('');
      return '<section class="lq-card"><h2>新測驗</h2><div class="lq-grid"><label class="lq-field">測驗名稱<input id="lqTitle" maxlength="30" value="' + esc(draft.title) + '"></label>' +
        '<label class="lq-field">每題秒數<select id="lqLimit"><option value="10000"' + (draft.limitMs === 10000 ? ' selected' : '') + '>10 秒</option><option value="20000"' + (draft.limitMs === 20000 ? ' selected' : '') + '>20 秒</option><option value="30000"' + (draft.limitMs === 30000 ? ' selected' : '') + '>30 秒</option></select></label></div>' +
        (items ? '<ul class="lq-items">' + items + '</ul>' : '<p class="lq-note">還沒有題目。</p>') +
        '</section><section class="lq-card"><h2>自訂選擇題</h2><div class="lq-grid"><label class="lq-field">題目<input id="lqPrompt" maxlength="80"></label>' +
        [0, 1, 2, 3].map(function (index) {
          return '<label class="lq-field">選項 ' + LETTERS[index] + '<input id="lqC' + index + '" maxlength="40"><span><input type="radio" name="lqCorrect" value="' + index + '"' + (index === 0 ? ' checked' : '') + '> 正確</span></label>';
        }).join('') + '</div><div class="lq-row"><button type="button" class="lq-btn soft" data-act="add-custom">加入自訂題</button></div></section>' +
        '<section class="lq-card"><h2>從現有遊戲抽一題</h2><p class="lq-sub">看譜、聽辨、音名、節奏、術語和樂器。抽出來的題目會固定在這一張測驗裡。</p><div class="lq-row">' + banks + '</div></section>' +
        '<div class="lq-row"><button type="button" class="lq-btn" data-act="save">儲存並開始</button></div>';
    }

    function render() {
      if (!host) return;
      var auth = authState();
      var top = '<div class="lq-top"><button type="button" class="lq-back" data-act="back">← 返回</button><div><h1 class="lq-title">課堂搶答</h1><p class="lq-sub">老師主持，全班同一題。</p></div></div>';
      var main = '';
      if (ui.screen === 'room' && ui.view) main = renderRoom(ui.view, { host: ui.view.host, offset: ui.offset });
      else if (ui.screen === 'editor' && auth.teacher) main = editorHtml();
      else main = homeHtml(auth);
      host.innerHTML = '<div class="lq-wrap">' + top + noticeHtml() + main + '</div>';
      hydrate(doc);
    }

    function tick() {
      var num = doc.getElementById('lqCountNum');
      var ring = doc.getElementById('lqCount');
      if (!num || !ui.view || ui.view.phase !== 'question') return;
      var remain = Math.max(0, Number(ui.view.questionEndsAt) - (Date.now() + ui.offset));
      num.textContent = String(Math.ceil(remain / 1000));
      if (ring && ui.view.limitMs) ring.style.setProperty('--lq-p', String(Math.round(remain / Number(ui.view.limitMs) * 100)));
      if (remain === 0) pull();
    }

    function signature(view) {
      return [view.phase, view.index, view.answered, view.locked, view.yourChoice, (view.players || []).map(function (player) {
        return player.name + ':' + player.score + ':' + (player.you ? 1 : 0);
      }).join('|'), view.question && view.question.prompt].join('~');
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
      ui.offset = Number(data.serverNow || Date.now()) - Date.now();
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
      applyView(data);
      stopTimers();
      ui.poll = root.setInterval(pull, 1000);
      ui.clock = root.setInterval(tick, 200);
    }

    function readDraft() {
      var title = doc.getElementById('lqTitle');
      var limit = doc.getElementById('lqLimit');
      if (title) ui.draft.title = title.value;
      if (limit) ui.draft.limitMs = Number(limit.value) || 20000;
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
        var item = buildBankItem(game, Math.random, bank);
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
      var input = doc.getElementById('lqJoinCode');
      var code = String(input && input.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      var auth = authState();
      if (!code) return;
      call('POST', '/live/rooms/' + code + '/join', {
        avatar: (auth.binding && auth.binding.avatar) || '🎵',
        signature: (auth.binding && auth.binding.signature) || ''
      }).then(function (data) {
        if (!data || data.ok === false) {
          ui.notice = ERRORS[data && data.error] || ERRORS.offline;
          render();
          return;
        }
        beginRoom(data);
      });
    }

    function advance() {
      if (!ui.view || !ui.view.host) {
        if (ui.view && ui.view.phase === 'done') leave();
        return;
      }
      if (ui.view.phase === 'done') {
        leave();
        return;
      }
      call('POST', '/live/rooms/' + ui.view.code + '/advance', {}).then(function (data) {
        if (!data || data.ok === false) {
          ui.notice = ERRORS[data && data.error] || ERRORS.offline;
          render();
          return;
        }
        applyView(data);
      });
    }

    function answer(choiceId) {
      if (!ui.view || ui.view.host || ui.view.locked || ui.view.phase !== 'question') return;
      call('POST', '/live/rooms/' + ui.view.code + '/answer', { choiceId: choiceId }).then(function (data) {
        if (!data || (data.ok === false && data.error !== 'closed')) {
          ui.notice = ERRORS[data && data.error] || ERRORS.offline;
          render();
          return;
        }
        applyView(data);
      });
    }

    function play(button) {
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
      ui.screen = 'home';
      ui.view = null;
      ui.sig = '';
      show('screen-hub');
    }

    function open() {
      var auth = authState();
      if (auth.required && !auth.signedIn) return;
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
      host.addEventListener('click', function (event) {
        var button = event.target && event.target.closest ? event.target.closest('[data-act]') : null;
        if (!button || !host.contains(button)) return;
        var act = button.getAttribute('data-act');
        if (act === 'back') leave();
        else if (act === 'editor') { ui.screen = 'editor'; ui.notice = ''; render(); }
        else if (act === 'add-custom') addCustom();
        else if (act === 'bank') addBank(button.getAttribute('data-game'));
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
    }

    root.LiveQuiz.open = open;
    root.LiveQuiz.paint = function (target, view, options) {
      var box = (target || doc).getElementById('liveQuizRoot');
      if (!box) return;
      show('screen-live');
      var hostFlag = options && options.host;
      var painted = Object.assign({}, view, { host: hostFlag || view.host });
      box.innerHTML = '<div class="lq-wrap"><div class="lq-top"><button type="button" class="lq-back" data-act="back">← 返回</button><div><h1 class="lq-title">課堂搶答</h1><p class="lq-sub">' + esc(view.title || '') + '</p></div></div>' + renderRoom(painted, { host: !!hostFlag, offset: 0 }) + '</div>';
      hydrate(target || doc);
    };
  }

  return {
    GAMES: GAMES,
    nameBlocked: nameBlocked,
    buildBankItem: buildBankItem,
    customItem: customItem,
    rememberOfficial: rememberOfficial,
    renderRoom: renderRoom,
    mount: mount
  };
});
