/**
 * Classroom tasks, teacher records, and the assessment report.
 * Challenge scores only. Practice, studio, guests, and testers stay out.
 * This is a classroom aid, not a DSEDJ 基本學力達標 rating.
 */
(function (root) {
  'use strict';

  var DISCLAIMER = '本表是課堂輔助紀錄，不是澳門教育及青年發展局的基本學力達標評級，亦不是官方證書。';
  var MACAU_OFFSET = '+08:00';
  var BLOCKED = { '訪客': 1, '測試人員': 1, '__guest__': 1, '__other__': 1 };

  var ACTIVITIES = [
    { id: 'game1', label: '音名識辨', games: ['game1'], hub: 'enterGame1', difficulties: [
      { id: 'classic60', label: '1分鐘挑戰' },
      { id: 'bass60', label: '低音譜 1分鐘' },
      { id: 'mixed60', label: '混合譜 1分鐘' },
      { id: 'noMiss', label: '零失誤挑戰' }
    ]},
    { id: 'keysig', label: '調號辨別', games: ['keysig'], hub: 'enterKeysig', difficulties: [
      { id: 'keysig60', label: '調號挑戰' }
    ]},
    { id: 'solfege', label: '唱名辨別', games: ['solfege'], hub: 'enterSolfege', difficulties: [
      { id: 'solfege60', label: '唱名計時' }
    ]},
    { id: 'chord', label: '和弦練習', games: ['chord'], hub: 'enterChord', difficulties: [] },
    { id: 'game2', label: '節奏識辨', games: ['game2'], hub: 'enterGame2', difficulties: [
      { id: 'easy', label: '容易' },
      { id: 'medium', label: '中等' },
      { id: 'hard', label: '困難' }
    ]},
    { id: 'game3', label: '術語識辨', games: ['game3'], hub: 'enterGame3', difficulties: [
      { id: 'easy', label: '容易' },
      { id: 'medium', label: '中等' },
      { id: 'hard', label: '困難' }
    ]},
    { id: 'game4', label: '樂器識辨', games: ['game4'], hub: 'enterGame4', difficulties: [] },
    { id: 'aural', label: '聽力', games: ['aural-interval', 'aural-rhythm', 'aural-quality', 'listenInterval', 'listenRhythm', 'listenColor'], hub: 'enterAural', difficulties: [] },
    { id: 'appreciate', label: '音樂鑑賞', games: ['appreciate-form', 'appreciate-genre', 'appreciate-traits'], hub: 'enterAppreciate', difficulties: [] }
  ];

  var RECORD_ITEMS = [
    { id: 'A-1', label: '演唱', channels: ['口語', '實作'] },
    { id: 'A-2', label: '合唱', channels: ['口語', '實作'] },
    { id: 'A-3', label: '樂器演奏', channels: ['實作'] },
    { id: 'A-4', label: '合奏', channels: ['實作'] },
    { id: 'B-5', label: '同儕互評', channels: ['口語', '檔案'] }
  ];

  var CHANNELS = ['口語', '實作', '檔案'];
  var STUDIO_GAMES = { studio: 1, composition: 1, compose: 1 };

  function text(value) {
    if (value == null) return '';
    return String(value).trim();
  }

  function esc(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function activityById(id) {
    for (var i = 0; i < ACTIVITIES.length; i++) {
      if (ACTIVITIES[i].id === id) return ACTIVITIES[i];
    }
    return null;
  }

  function recordItem(id) {
    for (var i = 0; i < RECORD_ITEMS.length; i++) {
      if (RECORD_ITEMS[i].id === id) return RECORD_ITEMS[i];
    }
    return null;
  }

  function namedStudent(person) {
    var name = text(person && (person.name || person.studentName));
    if (!name || BLOCKED[name] || name.indexOf('訪客') === 0 || name.indexOf('測試') === 0) return '';
    return name;
  }

  function isChallengeRow(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.studio === true || STUDIO_GAMES[text(entry.game)]) return false;
    if (entry.practice === true || entry.challenge === false) return false;
    if (entry.challenge === true || entry.practice === false) return true;
    return false;
  }

  function rowInstant(entry) {
    var at = text(entry && entry.at);
    if (/^\d{4}-\d{2}-\d{2}T/.test(at)) {
      var parsed = Date.parse(at);
      if (!isNaN(parsed)) return parsed;
    }
    return NaN;
  }

  /** Wall time from a datetime-local value, read as Asia/Macau (UTC+8, no DST). */
  function macauLocalToIso(value) {
    var raw = text(value);
    var match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(raw);
    if (!match) {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && /[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) return raw;
      return '';
    }
    return match[1] + 'T' + match[2] + ':' + (match[3] || '00') + MACAU_OFFSET;
  }

  function inWindow(instant, startIso, endIso) {
    if (isNaN(instant)) return false;
    var start = Date.parse(startIso);
    var end = Date.parse(endIso);
    if (isNaN(start) || isNaN(end) || end < start) return false;
    return instant >= start && instant <= end;
  }

  function assignmentCompleted(assignment, profile) {
    var activity = activityById(assignment && assignment.activity);
    if (!activity || !namedStudent(profile)) return false;
    var want = text(assignment.difficulty);
    if (want) {
      var known = false;
      activity.difficulties.forEach(function (item) { if (item.id === want) known = true; });
      if (!known) return false;
    }
    var hist = profile && Array.isArray(profile.history) ? profile.history : [];
    for (var i = 0; i < hist.length; i++) {
      var row = hist[i];
      if (!isChallengeRow(row)) continue;
      if (activity.games.indexOf(text(row.game)) < 0) continue;
      if (want && text(row.difficulty) !== want) continue;
      if (!inWindow(rowInstant(row), assignment.startsAt, assignment.endsAt)) continue;
      return true;
    }
    return false;
  }

  function challengeRows(profile) {
    var hist = profile && Array.isArray(profile.history) ? profile.history : [];
    return hist.filter(isChallengeRow);
  }

  function digitalCell(profile, evaluate) {
    if (!namedStudent(profile)) return '';
    var axes = typeof evaluate === 'function' ? evaluate(profile) : [];
    var map = root.BaaMusicMap;
    var parts = [];
    (axes || []).forEach(function (axis) {
      var tags = map && typeof map.tagLine === 'function' ? map.tagLine(axis.id) : '';
      var score = axis.score == null ? '未有挑戰分數' : String(axis.score);
      parts.push(axis.label + (tags ? ' ' + tags : '') + ' ' + score);
    });
    var appreciateLabels = { 'appreciate-form': '曲式', 'appreciate-genre': '體裁', 'appreciate-traits': '特點' };
    var appreciate = [];
    challengeRows(profile).forEach(function (row) {
      var game = text(row.game);
      if (!appreciateLabels[game]) return;
      appreciate.push(appreciateLabels[game] + ' ' + (Number(row.score) || 0));
    });
    if (appreciate.length) parts.push('鑑賞 ' + appreciate.join('、'));
    if (!parts.length) return '未有挑戰分數';
    return parts.join('；');
  }

  function channelText(records, student, channel) {
    var name = namedStudent(student);
    var bits = [];
    (records || []).forEach(function (row) {
      if (!row || text(row.channel) !== channel) return;
      if (text(row.studentName) !== name) return;
      if (text(student.seat) && text(row.seat) && text(row.seat) !== text(student.seat)) return;
      var item = recordItem(row.item);
      if (!item || item.channels.indexOf(channel) < 0) return;
      var note = text(row.note);
      if (!note) return;
      bits.push(item.id + ' ' + note);
    });
    return bits.join('；');
  }

  function paperText(papers, student) {
    var name = namedStudent(student);
    var bits = [];
    (papers || []).forEach(function (row) {
      if (!row || text(row.studentName) !== name) return;
      if (text(student.seat) && text(row.seat) && text(row.seat) !== text(student.seat)) return;
      var note = text(row.note);
      if (note) bits.push(note);
    });
    return bits.join('；');
  }

  function reportRows(input) {
    var src = input || {};
    var evaluate = src.evaluate;
    return (src.students || []).filter(function (student) {
      return namedStudent(student);
    }).map(function (student) {
      return {
        name: namedStudent(student),
        grade: text(student.grade),
        className: text(student.class || student.className),
        seat: text(student.seat),
        口語: channelText(src.records, student, '口語'),
        實作: channelText(src.records, student, '實作'),
        檔案: channelText(src.records, student, '檔案'),
        紙筆測試: paperText(src.papers, student),
        數碼測試: digitalCell(student, evaluate)
      };
    });
  }

  function csvCell(value) {
    var raw = text(value).replace(/"/g, '""');
    if (/[",\n]/.test(raw)) return '"' + raw + '"';
    return raw;
  }

  function toCsv(rows) {
    var header = ['姓名', '年級', '班別', '座號', '口語', '實作', '檔案', '紙筆測試', '數碼測試'];
    var lines = [header.join(',')];
    (rows || []).forEach(function (row) {
      lines.push([
        row.name, row.grade, row.className, row.seat,
        row.口語, row.實作, row.檔案, row.紙筆測試, row.數碼測試
      ].map(csvCell).join(','));
    });
    lines.push(csvCell(DISCLAIMER));
    return '\uFEFF' + lines.join('\n');
  }

  function printableHtml(rows) {
    var body = (rows || []).map(function (row) {
      return '<tr><td>' + esc(row.name) + '</td><td>' + esc(row.grade) + '</td><td>' + esc(row.className) +
        '</td><td>' + esc(row.seat) + '</td><td>' + esc(row.口語) + '</td><td>' + esc(row.實作) +
        '</td><td>' + esc(row.檔案) + '</td><td>' + esc(row.紙筆測試) + '</td><td>' + esc(row.數碼測試) + '</td></tr>';
    }).join('');
    return '<table class="classroom-report"><thead><tr><th>姓名</th><th>年級</th><th>班別</th><th>座號</th><th>口語</th><th>實作</th><th>檔案</th><th>紙筆測試</th><th>數碼測試</th></tr></thead><tbody>' +
      body + '</tbody></table><p class="classroom-disclaimer">' + esc(DISCLAIMER) + '</p>';
  }

  function publicCard(person) {
    var name = namedStudent(person);
    if (!name) return null;
    return {
      name: name,
      grade: text(person.grade),
      class: text(person.class || person.className),
      seat: text(person.seat),
      avatar: text(person.avatar) || '🎵',
      signature: text(person.signature).slice(0, 30)
    };
  }

  function gradeLabel(grade) {
    return { '1': '中一', '2': '中二', '3': '中三', '4': '中四', '5': '中五', '6': '中六' }[text(grade)] || text(grade);
  }

  function difficultyLabel(activity, id) {
    if (!activity || !id) return '不限難度';
    for (var i = 0; i < activity.difficulties.length; i++) {
      if (activity.difficulties[i].id === id) return activity.difficulties[i].label;
    }
    return id;
  }

  function formatWindow(assignment) {
    function show(iso) {
      var match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(text(iso));
      if (!match) return text(iso);
      return match[1] + ' ' + match[2];
    }
    return show(assignment.startsAt) + ' – ' + show(assignment.endsAt) + '（澳門）';
  }

  function storageKey(schoolId) {
    return 'ncClassroom.v1.' + (text(schoolId) || 'cskphc');
  }

  function readStore(storage, schoolId) {
    var empty = { assignments: [], records: [], papers: [] };
    if (!storage) return empty;
    try {
      var parsed = JSON.parse(storage.getItem(storageKey(schoolId)) || '');
      if (!parsed || typeof parsed !== 'object') return empty;
      empty.assignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];
      empty.records = Array.isArray(parsed.records) ? parsed.records : [];
      empty.papers = Array.isArray(parsed.papers) ? parsed.papers : [];
      return empty;
    } catch (err) {
      return empty;
    }
  }

  function writeStore(storage, schoolId, data) {
    if (!storage) return;
    storage.setItem(storageKey(schoolId), JSON.stringify({
      assignments: data.assignments || [],
      records: data.records || [],
      papers: data.papers || []
    }));
  }

  function localStudents(storage) {
    var students = [];
    if (!storage) return students;
    for (var i = 0; i < storage.length; i++) {
      var key = storage.key(i);
      if (!key || key.indexOf('musicGameProfile_') !== 0 || key === 'musicGameProfile_guest') continue;
      try {
        var profile = JSON.parse(storage.getItem(key) || '');
        if (namedStudent(profile)) students.push(profile);
      } catch (err) { /* skip broken rows */ }
    }
    return students;
  }

  function optionList(items, valueKey, labelKey) {
    return items.map(function (item) {
      return '<option value="' + esc(item[valueKey]) + '">' + esc(item[labelKey]) + '</option>';
    }).join('');
  }

  function render(doc, state) {
    var rootEl = doc.getElementById('classroomRoot');
    if (!rootEl) return;
    var activities = optionList(ACTIVITIES, 'id', 'label');
    var items = RECORD_ITEMS.map(function (item) {
      return '<option value="' + esc(item.id) + '">' + esc(item.id + ' ' + item.label) + '</option>';
    }).join('');
    var assignments = (state.assignments || []).map(function (row) {
      var activity = activityById(row.activity);
      var done = (state.students || []).filter(function (student) {
        return assignmentCompleted(row, student);
      });
      var total = (state.students || []).filter(function (student) { return namedStudent(student); }).length;
      return '<li><b>' + esc(activity ? activity.label : row.activity) + '</b> ' +
        esc(difficultyLabel(activity, row.difficulty)) + '　' + esc(formatWindow(row)) +
        '　完成 ' + done.length + '/' + total + '</li>';
    }).join('') || '<li>未有課題。</li>';
    var studentBits = (state.assignments || []).map(function (row) {
      var activity = activityById(row.activity);
      var mine = !state.selfProfile
        ? '班內完成見下面'
        : (assignmentCompleted(row, state.selfProfile) ? '已完成' : '未完成');
      return '<li><b>' + esc(activity ? activity.label : row.activity) + '</b> ' +
        esc(difficultyLabel(activity, row.difficulty)) + '　' + esc(formatWindow(row)) + '　' + mine + '</li>';
    }).join('') || '<li>老師還沒有佈置挑戰。</li>';
    var teacher = state.teacher ? '' : ' hidden';
    rootEl.innerHTML =
      '<section class="card classroom-card"><h2>課堂任務</h2><p>只計挑戰分數。練習、創作工作室同訪客不會當成完成。</p><ul class="classroom-list" id="classroomStudentList">' +
      studentBits + '</ul></section>' +
      '<section class="card classroom-card"' + teacher + '><h2>老師佈置</h2>' +
      '<p>為一個班指定挑戰、可選難度，同埋澳門時間的開始／結束。練習同創作工作室不能佈置。</p>' +
      '<form id="classroomAssignForm" class="classroom-form">' +
      '<label>年級<select name="grade"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select></label>' +
      '<label>班別<input name="class" maxlength="8" required placeholder="A"></label>' +
      '<label>挑戰<select name="activity">' + activities + '</select></label>' +
      '<label>難度（可留空）<select name="difficulty"><option value="">不限</option></select></label>' +
      '<label>開始<input name="start" type="datetime-local" required></label>' +
      '<label>結束<input name="end" type="datetime-local" required></label>' +
      '<button type="submit" class="btn-start">儲存課題</button></form>' +
      '<ul class="classroom-list" id="classroomTeacherList">' + assignments + '</ul></section>' +
      '<section class="card classroom-card"' + teacher + '><h2>課堂紀錄</h2>' +
      '<p>A 演唱與演奏、B-5 同儕互評。這是觀察，不是達標評級，也不會出現在同學卡片。</p>' +
      '<form id="classroomRecordForm" class="classroom-form">' +
      '<label>學生<input name="studentName" required maxlength="20"></label>' +
      '<label>座號<input name="seat" maxlength="8"></label>' +
      '<label>項目<select name="item">' + items + '</select></label>' +
      '<label>欄目<select name="channel"><option>口語</option><option>實作</option><option>檔案</option></select></label>' +
      '<label>觀察<textarea name="note" rows="3" required maxlength="500"></textarea></label>' +
      '<button type="submit" class="btn-start">儲存紀錄</button></form>' +
      '<h3>紙筆測試</h3><p>平台沒有紙筆測驗。這裡只記老師另行輸入的結果。</p>' +
      '<form id="classroomPaperForm" class="classroom-form">' +
      '<label>學生<input name="studentName" required maxlength="20"></label>' +
      '<label>座號<input name="seat" maxlength="8"></label>' +
      '<label>結果<textarea name="note" rows="2" required maxlength="500"></textarea></label>' +
      '<button type="submit" class="btn-start">儲存紙筆</button></form></section>' +
      '<section class="card classroom-card"' + teacher + '><h2>評估報告</h2>' +
      '<p>欄目依照第28/2020號行政法規：口語、實作、檔案、紙筆測試、數碼測試。數碼測試只來自挑戰分數、七軸雷達同鑑賞挑戰。</p>' +
      '<div class="classroom-actions"><button type="button" class="btn-view-ranks" id="classroomCsvBtn">下載 CSV</button>' +
      '<button type="button" class="btn-view-ranks" id="classroomPrintBtn">列印預覽</button></div>' +
      '<div id="classroomPrint">' + printableHtml(reportRows(state)) + '</div></section>' +
      '<section class="card classroom-card" id="classroomCodeCard"><h2>班級短碼</h2>' +
      '<p>6–8 個字。學生用短碼、姓名、班別同座號加入，不必用學校 Google。短碼可以到期同作廢。</p>' +
      '<form id="classroomCodeForm" class="classroom-form"' + teacher + '>' +
      '<label>年級<select name="grade"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select></label>' +
      '<label>班別<input name="class" maxlength="8" required placeholder="A"></label>' +
      '<label>有效時數<input name="hours" type="number" min="1" max="720" value="24"></label>' +
      '<button type="submit" class="btn-start">產生短碼</button></form>' +
      '<p id="classroomCodeOut"></p>' +
      '<form id="classroomJoinForm" class="classroom-form">' +
      '<label>短碼<input name="code" minlength="6" maxlength="8" required autocomplete="off"></label>' +
      '<label>姓名<input name="name" required maxlength="20"></label>' +
      '<label>班別<input name="class" required maxlength="8"></label>' +
      '<label>座號<input name="seat" required maxlength="8"></label>' +
      '<button type="submit" class="btn-start">用短碼加入</button></form>' +
      '<p id="classroomJoinOut"></p></section>';
    var activitySelect = rootEl.querySelector('select[name="activity"]');
    var difficultySelect = rootEl.querySelector('select[name="difficulty"]');
    function fillDifficulty() {
      if (!activitySelect || !difficultySelect) return;
      var activity = activityById(activitySelect.value);
      var html = '<option value="">不限</option>';
      (activity ? activity.difficulties : []).forEach(function (item) {
        html += '<option value="' + esc(item.id) + '">' + esc(item.label) + '</option>';
      });
      difficultySelect.innerHTML = html;
    }
    if (activitySelect) {
      activitySelect.addEventListener('change', fillDifficulty);
      fillDifficulty();
    }
    bindForms(doc, state);
  }

  function bindForms(doc, state) {
    var assign = doc.getElementById('classroomAssignForm');
    if (assign) assign.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(assign);
      var activity = activityById(text(data.get('activity')));
      if (!activity) return;
      var difficulty = text(data.get('difficulty'));
      if (difficulty && !activity.difficulties.some(function (item) { return item.id === difficulty; })) return;
      state.onAssign && state.onAssign({
        grade: text(data.get('grade')),
        className: text(data.get('class')).toUpperCase(),
        activity: activity.id,
        difficulty: difficulty,
        startsAt: macauLocalToIso(data.get('start')),
        endsAt: macauLocalToIso(data.get('end'))
      });
    });
    var record = doc.getElementById('classroomRecordForm');
    if (record) record.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(record);
      var item = recordItem(text(data.get('item')));
      var channel = text(data.get('channel'));
      if (!item || item.channels.indexOf(channel) < 0) return;
      state.onRecord && state.onRecord({
        studentName: text(data.get('studentName')),
        seat: text(data.get('seat')),
        item: item.id,
        channel: channel,
        note: text(data.get('note'))
      });
    });
    var paper = doc.getElementById('classroomPaperForm');
    if (paper) paper.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(paper);
      state.onPaper && state.onPaper({
        studentName: text(data.get('studentName')),
        seat: text(data.get('seat')),
        note: text(data.get('note'))
      });
    });
    var csv = doc.getElementById('classroomCsvBtn');
    if (csv) csv.addEventListener('click', function () {
      state.onCsv && state.onCsv(toCsv(reportRows(state)));
    });
    var printBtn = doc.getElementById('classroomPrintBtn');
    if (printBtn) printBtn.addEventListener('click', function () {
      if (state.onPrint) state.onPrint();
      else if (root.print) root.print();
    });
    var codeForm = doc.getElementById('classroomCodeForm');
    if (codeForm) codeForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(codeForm);
      state.onCode && state.onCode({
        grade: text(data.get('grade')),
        className: text(data.get('class')).toUpperCase(),
        hours: Number(data.get('hours')) || 24
      });
    });
    var join = doc.getElementById('classroomJoinForm');
    if (join) join.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(join);
      state.onJoin && state.onJoin({
        code: text(data.get('code')).toUpperCase(),
        name: text(data.get('name')),
        className: text(data.get('class')).toUpperCase(),
        seat: text(data.get('seat'))
      });
    });
  }

  function demoAllowed() {
    try {
      var host = root.location && root.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') return false;
      return new URLSearchParams(root.location.search).get('classroomDemo') === '1';
    } catch (err) {
      return false;
    }
  }

  function demoState() {
    var profile = {
      name: '示範學生',
      grade: '1',
      class: 'A',
      seat: '12',
      avatar: '🎵',
      signature: '',
      history: [
        { game: 'game1', score: 80, accuracy: 90, challenge: true, practice: false, difficulty: 'classic60', at: '2026-11-18T02:00:00.000Z' },
        { game: 'game1', score: 10, challenge: false, practice: true, difficulty: 'practice', at: '2026-11-18T02:10:00.000Z' },
        { game: 'appreciate-form', score: 20, challenge: true, practice: false, at: '2026-11-18T03:00:00.000Z' },
        { game: 'studio', score: 99, challenge: true, practice: false, at: '2026-11-18T03:10:00.000Z' }
      ],
      gameBests: { game1: 80 }
    };
    return {
      teacher: true,
      schoolId: 'cskphc',
      students: [profile],
      selfProfile: null,
      assignments: [{
        id: 'demo',
        activity: 'game1',
        difficulty: 'classic60',
        startsAt: '2026-11-01T08:00:00+08:00',
        endsAt: '2026-11-30T22:00:00+08:00',
        grade: '1',
        className: 'A'
      }],
      records: [{ id: 'rec', studentName: '示範學生', seat: '12', item: 'A-1', channel: '實作', note: '課堂演唱，只作觀察。' }],
      papers: [{ id: 'paper', studentName: '示範學生', seat: '12', note: '紙筆由老師記入。' }]
    };
  }

  function mount(doc) {
    if (!doc || !doc.getElementById) return;
    var openBtn = doc.getElementById('hubClassroomBtn');
    var screen = doc.getElementById('screen-classroom');
    if (openBtn && screen) {
      openBtn.addEventListener('click', function () {
        var nodes = doc.querySelectorAll('.screen');
        for (var i = 0; i < nodes.length; i++) nodes[i].classList.remove('active');
        screen.classList.add('active');
      });
    }
    var back = doc.getElementById('classroomBackBtn');
    if (back) back.addEventListener('click', function () {
      var nodes = doc.querySelectorAll('.screen');
      for (var i = 0; i < nodes.length; i++) nodes[i].classList.remove('active');
      var hub = doc.getElementById('screen-hub');
      if (hub) hub.classList.add('active');
    });
    function authBase() {
      var cfg = root.MUSIC_APP_AUTH || {};
      var base = cfg.authApiBase || '';
      try {
        var host = root.location && root.location.hostname;
        var q = new URLSearchParams(root.location.search).get('authApi');
        if (q && (host === 'localhost' || host === '127.0.0.1')) base = q;
      } catch (err) {}
      return String(base || '').replace(/\/$/, '');
    }
    function postJoin(row, out) {
      var base = authBase();
      if (!base) {
        if (out) out.textContent = '這部瀏覽器還沒有連上登入服務。';
        return;
      }
      fetch(base + '/class/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: row.code, name: row.name, class: row.className, seat: row.seat })
      }).then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); }).then(function (result) {
        var data = result.data || {};
        if (!out) return;
        if (data.ok && root.WebGoogleAuth && typeof root.WebGoogleAuth.adoptCodeSession === 'function') {
          root.WebGoogleAuth.adoptCodeSession(data);
          out.textContent = '已加入 ' + row.name + '。此身份只限該班，看不到同學電郵。';
          return;
        }
        var message = { bad_code: '短碼不正確。', revoked: '短碼已作廢。', expired: '短碼已過期。', rate_limited: '試太多次，請稍後再試。', bad_student: '姓名、班別或座號不符合。訪客同測試人員不能加入。' };
        out.textContent = message[data.error] || '未能加入。';
      }).catch(function () {
        if (out) out.textContent = '未能連上登入服務。';
      });
    }
    var gateForm = doc.getElementById('webCodeJoinForm');
    if (gateForm) gateForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(gateForm);
      postJoin({
        code: text(data.get('code')).toUpperCase(),
        name: text(data.get('name')),
        className: text(data.get('class')).toUpperCase(),
        seat: text(data.get('seat'))
      }, doc.getElementById('webCodeJoinOut'));
    });
    if (!demoAllowed()) {
      var stored = readStore(root.localStorage, 'cskphc');
      var quiet = {
        teacher: false,
        students: localStudents(root.localStorage),
        assignments: stored.assignments,
        records: stored.records,
        papers: stored.papers,
        evaluate: root.AbilityRadar && root.AbilityRadar.evaluate,
        onJoin: function (row) { postJoin(row, doc.getElementById('classroomJoinOut')); }
      };
      render(doc, quiet);
      return;
    }
    var state = demoState();
    state.evaluate = root.AbilityRadar && root.AbilityRadar.evaluate;
    var overlay = doc.getElementById('webGoogleAuthOverlay');
    if (overlay) overlay.hidden = true;
    if (doc.documentElement) doc.documentElement.classList.remove('web-auth-pending');
    state.onAssign = function (row) {
      if (!row.startsAt || !row.endsAt) return;
      state.assignments.push(row);
      render(doc, state);
    };
    state.onRecord = function (row) {
      if (!namedStudent({ name: row.studentName })) return;
      state.records.push(row);
      render(doc, state);
    };
    state.onPaper = function (row) {
      if (!namedStudent({ name: row.studentName })) return;
      state.papers.push(row);
      render(doc, state);
    };
    state.onCode = function (row) {
      var out = doc.getElementById('classroomCodeOut');
      if (out) out.textContent = '示範短碼 K7M4QP2　' + gradeLabel(row.grade) + row.className + '　24 小時內有效，可作廢。不會顯示電郵。';
    };
    state.onJoin = function (row) {
      var out = doc.getElementById('classroomJoinOut');
      if (!out) return;
      if (row.code !== 'K7M4QP2') {
        out.textContent = '這是示範頁。請用短碼 K7M4QP2，或在已連上 worker 的環境使用老師發出的短碼。';
        return;
      }
      if (!namedStudent({ name: row.name })) {
        out.textContent = '訪客同測試人員不能用短碼加入。';
        return;
      }
      out.textContent = '已加入 ' + row.name + '　' + row.className + ' 班 ' + row.seat + ' 號。此身份只限該班，看不到同學電郵。';
    };
    render(doc, state);
  }

  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { mount(root.document); });
    else mount(root.document);
  }

  root.Classroom = {
    DISCLAIMER: DISCLAIMER,
    ACTIVITIES: ACTIVITIES,
    RECORD_ITEMS: RECORD_ITEMS,
    CHANNELS: CHANNELS,
    activityById: activityById,
    isChallengeRow: isChallengeRow,
    macauLocalToIso: macauLocalToIso,
    assignmentCompleted: assignmentCompleted,
    digitalCell: digitalCell,
    reportRows: reportRows,
    toCsv: toCsv,
    printableHtml: printableHtml,
    publicCard: publicCard,
    namedStudent: namedStudent,
    readStore: readStore,
    writeStore: writeStore,
    mount: mount
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
