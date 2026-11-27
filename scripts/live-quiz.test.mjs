import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import worker, {
  RHYTHM_ECHO_WINDOWS,
  advanceLiveState,
  answerLiveState,
  blankLiveState,
  expectedEchoOnsetsMs,
  gradeRhythmEcho,
  joinLiveState,
  normalizeLiveQuiz,
  officialLiveBoard,
  publicLiveState,
  scoreLivePoints,
  signSessionToken,
  tapLiveState
} from '../cloudflare/noteschallenge-auth/worker.js';

const SECRET = 'test-secret-test-secret-test-secret';
const LIVE_TABLES = ['live_results', 'live_quizzes', 'live_rooms', 'school_domains'];

function classroomBag(compact, bags, opts) {
  const table = LIVE_TABLES.find((name) => compact.includes(name));
  if (!table) return null;
  const rows = bags[table];
  const stats = opts && opts.stats;
  const onOp = opts && opts.onOp;
  function wherePairs(sql, args, from) {
    const part = sql.includes(' WHERE ') ? sql.split(' WHERE ')[1] : '';
    const names = [];
    const re = /(\w+)\s*=\s*\?/g;
    let match;
    while ((match = re.exec(part))) names.push(match[1]);
    return names.map((name, index) => [name, args[from + index]]);
  }
  function same(row, pairs) {
    return pairs.every(([col, value]) => String(row[col] == null ? '' : row[col]) === String(value == null ? '' : value));
  }
  function apply(args) {
    if (compact.startsWith('INSERT')) {
      const cols = compact.slice(compact.indexOf('(') + 1, compact.indexOf(')')).split(',').map((col) => col.trim());
      const row = {};
      cols.forEach((col, index) => { row[col] = args[index]; });
      rows.push(row);
      return 1;
    }
    if (compact.startsWith('UPDATE')) {
      const setSql = compact.split(' SET ')[1].split(' WHERE ')[0];
      const setNames = [];
      const re = /(\w+)\s*=\s*\?/g;
      let match;
      while ((match = re.exec(setSql))) setNames.push(match[1]);
      const pairs = wherePairs(compact, args, setNames.length);
      let changed = 0;
      rows.forEach((row) => {
        if (!same(row, pairs)) return;
        setNames.forEach((name, index) => { row[name] = args[index]; });
        changed += 1;
      });
      if (changed === 0 && stats && table === 'live_rooms') stats.casConflicts += 1;
      return changed;
    }
    return 0;
  }
  return {
    async all() {
      return { results: rows.map((row) => Object.assign({}, row)) };
    },
    bind(...args) {
      return {
        async all() {
          const pairs = wherePairs(compact, args, 0);
          return { results: rows.filter((row) => same(row, pairs)).map((row) => Object.assign({}, row)) };
        },
        async first() {
          const pairs = wherePairs(compact, args, 0);
          const found = rows.find((row) => same(row, pairs));
          const snap = found ? Object.assign({}, found) : null;
          if (onOp) await onOp('first', table, compact, args);
          return snap;
        },
        async run() {
          if (onOp) await onOp('run', table, compact, args);
          const changes = apply(args);
          return { success: true, meta: { changes } };
        }
      };
    }
  };
}

function memoryDb(opts = {}) {
  const users = new Map();
  const roster = new Map();
  const bags = { school_domains: [], live_quizzes: [], live_rooms: [], live_results: [] };
  const stats = { casConflicts: 0 };
  const bagOpts = { stats, onOp: opts.onOp || null };
  return {
    bags,
    users,
    roster,
    stats,
    prepare(sql) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      if (compact.includes('FROM users')) {
        return { bind(...args) { return { async first() { return users.get(args[0]) || null; } }; } };
      }
      if (compact.includes('FROM roster')) {
        return { bind(...args) { return { async first() { return roster.get(String(args[0] || '').toLowerCase()) || null; } }; } };
      }
      const bag = classroomBag(compact, bags, bagOpts);
      if (!bag) throw new Error('unexpected sql ' + compact);
      return bag;
    }
  };
}

const custom = {
  type: 'custom',
  prompt: '四分音符通常唱什麼？',
  choices: [
    { id: 'c1', label: 'ta' },
    { id: 'c2', label: 'ti-ti' },
    { id: 'c3', label: 'ta-a' }
  ],
  correctId: 'c1'
};
const bank = {
  type: 'bank',
  game: 'staff-interval',
  prompt: '這兩個音是什麼音程？',
  choices: [
    { id: 'P5', label: '純五度' },
    { id: 'P4', label: '純四度' },
    { id: 'M3', label: '大三度' },
    { id: 'M6', label: '大六度' }
  ],
  correctId: 'P5',
  render: {
    kind: 'staff',
    clef: 'treble',
    notes: [{ pos: -2, acc: '', x: 170 }, { pos: 2, acc: '', x: 270 }]
  }
};

test('live points drop from 1000 to 500 and wrong answers score 0', () => {
  // points = 500 + round(500 * (1 - elapsed / limit))
  assert.equal(scoreLivePoints(true, 0, 20000), 1000);
  assert.equal(scoreLivePoints(true, 10000, 20000), 750);
  assert.equal(scoreLivePoints(true, 20000, 20000), 500);
  assert.equal(scoreLivePoints(false, 0, 20000), 0);
  assert.equal(scoreLivePoints(false, 10000, 20000), 0);
});

test('custom and game-bank items normalize, and a bad custom item is refused', () => {
  const quiz = normalizeLiveQuiz({ title: '三年級搶答', limitMs: 20000, items: [custom, bank] });
  assert.equal(quiz.ok, true);
  assert.equal(quiz.quiz.items[0].type, 'custom');
  assert.equal(quiz.quiz.items[1].type, 'bank');
  assert.equal(quiz.quiz.items[1].game, 'staff-interval');
  assert.equal(quiz.quiz.items[1].render.kind, 'staff');
  assert.equal(normalizeLiveQuiz({ title: '缺選項', items: [{ type: 'custom', prompt: '只得一個', choices: [{ id: 'c1', label: '甲' }], correctId: 'c1' }] }).ok, false);
  assert.equal(normalizeLiveQuiz({ title: '沒有正確', items: [{ type: 'custom', prompt: '兩個', choices: [{ id: 'c1', label: '甲' }, { id: 'c2', label: '乙' }], correctId: 'c9' }] }).ok, false);
  assert.equal(normalizeLiveQuiz({ title: '電郵', items: [{ type: 'custom', prompt: '寫去 a@b.com', choices: [{ id: 'c1', label: '甲' }, { id: 'c2', label: '乙' }], correctId: 'c1' }] }).ok, false);
});

test('join, host advance, and official board keep short-code and test names out of the saved result', () => {
  const quiz = normalizeLiveQuiz({ title: '測驗', limitMs: 20000, items: [custom, bank] });
  const state = blankLiveState(Object.assign({ id: 'q1' }, quiz.quiz), 'K7M4QP', 'teacher-sub', 'cskphc');
  assert.equal(joinLiveState(state, { id: 'user:s', name: '陳同學', grade: '1', class: 'A', seat: '12', role: 'student', avatar: '🎵', signature: '嗨' }).ok, true);
  assert.equal(joinLiveState(state, { id: 'code:1', name: '短碼生', grade: '1', class: 'A', seat: '8', role: 'code', avatar: '🥁', signature: '' }).ok, true);
  assert.equal(joinLiveState(state, { id: 'user:t', name: '測試生', grade: '1', class: 'A', seat: '9', role: 'student', avatar: '🎵', signature: '' }).ok, true);
  assert.equal(joinLiveState(state, { id: 'user:s', name: '陳同學', grade: '1', class: 'A', seat: '12', role: 'student', avatar: '🎵', signature: '嗨' }).ok, true);
  assert.equal(state.players.length, 3);
  assert.equal(joinLiveState(state, { id: 'guest', name: '訪客', grade: '1', class: 'A', seat: '1', role: 'student' }).ok, false);
  const started = advanceLiveState(state, 1_700_000_000_000);
  assert.equal(started.ok, true);
  assert.equal(state.phase, 'question');
  const hidden = publicLiveState(state, 'user:s', 1_700_000_000_000);
  assert.equal(JSON.stringify(hidden).includes('@'), false);
  assert.equal(JSON.stringify(hidden.question).includes('"correct"'), false);
  assert.equal(hidden.players.some((player) => player.name === '短碼生'), true);
  assert.equal(answerLiveState(state, 'user:s', 'c1', 1_700_000_000_000).ok, true);
  assert.equal(answerLiveState(state, 'code:1', 'c2', 1_700_000_010_000).ok, true);
  assert.equal(answerLiveState(state, 'user:t', 'c1', 1_700_000_010_000).ok, true);
  assert.equal(answerLiveState(state, 'user:s', 'c2', 1_700_000_012_000).locked, true);
  const revealed = advanceLiveState(state, 1_700_000_012_000);
  assert.equal(revealed.ok, true);
  assert.equal(state.phase, 'reveal');
  assert.equal(state.players.find((player) => player.name === '陳同學').score, 1000);
  assert.equal(state.players.find((player) => player.name === '短碼生').score, 0);
  assert.equal(state.players.find((player) => player.name === '測試生').score, 750);
  const shown = publicLiveState(state, 'code:1', 1_700_000_012_000);
  assert.equal(shown.question.choices.filter((choice) => choice.correct).length, 1);
  assert.equal(shown.players[0].name, '陳同學');
  const next = advanceLiveState(state, 1_700_000_020_000);
  assert.equal(next.ok, true);
  assert.equal(state.phase, 'question');
  assert.equal(state.index, 1);
  assert.equal(JSON.stringify(publicLiveState(state, '', 1_700_000_020_000).question).includes('"correct"'), false);
  assert.equal(advanceLiveState(state, 1_700_000_021_000).ok, true);
  assert.equal(state.phase, 'reveal');
  const done = advanceLiveState(state, 1_700_000_022_000);
  assert.equal(done.finished, true);
  const board = officialLiveBoard(state);
  assert.deepEqual(board.map((row) => row.name), ['陳同學']);
  assert.equal(JSON.stringify(board).includes('@'), false);
  assert.equal(JSON.stringify(board).includes('短碼生'), false);
  assert.equal(JSON.stringify(board).includes('測試生'), false);
});

test('worker live room joins a roster student and a short code, then the host advances without a sheet upload', async () => {
  const db = memoryDb();
  const now = Date.now();
  const env = {
    DB: db,
    JWT_SECRET: SECRET,
    EXTRA_ALLOWED_EMAILS: 'teacher.allow@gmail.com',
    NOW: now
  };
  db.users.set('teacher-sub', { sub: 'teacher-sub', email: 'teacher.allow@gmail.com', name: '陳老師', student_name: '陳老師', grade: '', class: '' });
  db.users.set('student-sub', { sub: 'student-sub', email: 'student@school.edu.hk', name: '陳同學', student_name: '陳同學', grade: '1', class: 'A' });
  db.users.set('test-sub', { sub: 'test-sub', email: 'teststudent@school.edu.hk', name: '測試生', student_name: '測試生', grade: '1', class: 'A' });
  db.users.set('join:cskphc:abc', { sub: 'join:cskphc:abc', email: 'codeuser-abc@join.invalid', name: '短碼生', student_name: '短碼生', grade: '1', class: 'A' });
  db.users.set('late-sub', { sub: 'late-sub', email: 'late@school.edu.hk', name: '晚到', student_name: '晚到', grade: '1', class: 'A' });
  db.roster.set('student@school.edu.hk', { email: 'student@school.edu.hk', grade: '1', class: 'A', student_name: '陳同學', seat: '12' });
  db.roster.set('teststudent@school.edu.hk', { email: 'teststudent@school.edu.hk', grade: '1', class: 'A', student_name: '測試生', seat: '9' });
  db.roster.set('late@school.edu.hk', { email: 'late@school.edu.hk', grade: '1', class: 'A', student_name: '晚到', seat: '3' });
  const teacher = await signSessionToken({ sub: 'teacher-sub', email: 'teacher.allow@gmail.com' }, SECRET, now);
  const student = await signSessionToken({ sub: 'student-sub', email: 'student@school.edu.hk' }, SECRET, now);
  const testerName = await signSessionToken({ sub: 'test-sub', email: 'teststudent@school.edu.hk' }, SECRET, now);
  const codeStudent = await signSessionToken({
    sub: 'join:cskphc:abc', email: 'codeuser-abc@join.invalid', kind: 'code', schoolId: 'cskphc', grade: '1', class: 'A', name: '短碼生', seat: '8'
  }, SECRET, now);
  const late = await signSessionToken({ sub: 'late-sub', email: 'late@school.edu.hk' }, SECRET, now);
  async function hit(token, method, path, body) {
    const res = await worker.fetch(new Request('https://auth.example' + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, Origin: 'http://127.0.0.1:4173', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }), env);
    return { status: res.status, data: await res.json() };
  }
  const saved = await hit(teacher, 'POST', '/live/quizzes', { title: '三年級搶答', limitMs: 20000, items: [custom, bank] });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.quiz.items[0].type, 'custom');
  assert.equal(saved.data.quiz.items[1].type, 'bank');
  const room = await hit(teacher, 'POST', '/live/rooms', { quizId: saved.data.quiz.id });
  assert.equal(room.data.ok, true);
  assert.equal(room.data.host, true);
  assert.equal(room.data.phase, 'lobby');
  assert.match(room.data.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const code = room.data.code;
  const joined = await hit(student, 'POST', '/live/rooms/' + code + '/join', {
    name: '冒名',
    email: 'secret@school.edu.hk',
    grade: '6',
    avatar: '🎵',
    signature: '不要電郵 secret@school.edu.hk'
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.players.length, 1);
  assert.equal(joined.data.players[0].name, '陳同學');
  assert.equal(joined.data.players[0].grade, '1');
  assert.equal(JSON.stringify(joined.data).includes('@'), false);
  assert.equal(JSON.stringify(joined.data).includes('secret'), false);
  assert.equal((await hit(codeStudent, 'POST', '/live/rooms/' + code + '/join', { avatar: '🥁' })).data.players.some((player) => player.name === '短碼生'), true);
  assert.equal((await hit(testerName, 'POST', '/live/rooms/' + code + '/join', { avatar: '🎵' })).data.players.some((player) => player.name === '測試生'), true);
  assert.equal((await hit(student, 'POST', '/live/rooms/' + code + '/advance')).status, 403);
  env.NOW = now;
  const question = await hit(teacher, 'POST', '/live/rooms/' + code + '/advance');
  assert.equal(question.data.phase, 'question');
  assert.equal(JSON.stringify(question.data.question).includes('"correct"'), false);
  assert.equal((await hit(late, 'POST', '/live/rooms/' + code + '/join', { name: '再加入' })).status, 409);
  const answered = await hit(student, 'POST', '/live/rooms/' + code + '/answer', { choiceId: 'c1' });
  assert.equal(answered.data.locked, true);
  assert.equal(answered.data.question.choices.some((choice) => choice.correct), false);
  env.NOW = now + 10000;
  await hit(codeStudent, 'POST', '/live/rooms/' + code + '/answer', { choiceId: 'c2' });
  await hit(testerName, 'POST', '/live/rooms/' + code + '/answer', { choiceId: 'c1' });
  const reveal = await hit(teacher, 'POST', '/live/rooms/' + code + '/advance');
  assert.equal(reveal.data.phase, 'reveal');
  assert.equal(reveal.data.players.find((player) => player.name === '陳同學').score, 1000);
  assert.equal(reveal.data.players.find((player) => player.name === '短碼生').score, 0);
  assert.equal(reveal.data.question.choices.find((choice) => choice.id === 'c1').correct, true);
  await hit(teacher, 'POST', '/live/rooms/' + code + '/advance');
  env.NOW = now + 30000;
  const closed = await hit(teacher, 'GET', '/live/rooms/' + code);
  assert.equal(closed.data.phase, 'reveal');
  const podium = await hit(teacher, 'POST', '/live/rooms/' + code + '/advance');
  assert.equal(podium.data.phase, 'done');
  assert.deepEqual(podium.data.officialBoard.map((row) => row.name), ['陳同學']);
  assert.equal(JSON.stringify(podium.data.officialBoard).includes('@'), false);
  const studentDone = await hit(student, 'GET', '/live/rooms/' + code);
  assert.equal(studentDone.data.officialBoard, undefined);
  assert.equal(studentDone.data.players.some((player) => player.name === '短碼生'), true);
  const stored = db.bags.live_results[0];
  assert.equal(JSON.parse(stored.board).some((row) => row.name === '短碼生' || row.name === '測試生'), false);
  assert.equal(JSON.parse(stored.board)[0].name, '陳同學');
});

test('the live mode has no Google Sheet upload and does not touch the radar', () => {
  const client = fs.readFileSync(new URL('../live-quiz.js', import.meta.url), 'utf8');
  const workerSrc = fs.readFileSync(new URL('../cloudflare/noteschallenge-auth/worker.js', import.meta.url), 'utf8');
  assert.equal(client.includes('submitScoreToGAS'), false);
  assert.equal(client.includes('script.google.com'), false);
  assert.equal(client.includes('AbilityRadar'), false);
  assert.equal(client.includes('ability-radar'), false);
  assert.equal(workerSrc.includes('submitScoreToGAS'), false);
  assert.equal(workerSrc.includes('script.google.com'), false);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /live-quiz\.js\?v=2/);
  assert.match(html, /live-quiz\.css\?v=2/);
  assert.match(html, /id="enterLiveQuiz"/);
  assert.match(html, /id="screen-live"/);
});

test('bank builders cover the classroom games and the device record drops test names', () => {
  const context = { console };
  vm.createContext(context);
  for (const file of ['theory-drill.js', 'aural-audio.js', 'aural-interval.js', 'rhythm-levels.js', 'abrsm-curriculum.js', 'abrsm-rhythm-terms.js', 'instrument-category.js', 'live-quiz.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  const LiveQuiz = context.LiveQuiz;
  const bank = JSON.parse(fs.readFileSync(new URL('../data/instrument-bank.json', import.meta.url), 'utf8'));
  const rng = () => 0.3;
  const items = ['staff-interval', 'aural-interval', 'note-name', 'rhythm', 'terms', 'instrument'].map((game) => {
    const item = LiveQuiz.buildBankItem(game, rng, bank);
    assert.ok(item, game);
    assert.equal(item.type, 'bank');
    assert.equal(item.game, game);
    assert.ok(item.choices.length >= 2 && item.choices.length <= 4, game);
    assert.equal(item.choices.filter((choice) => choice.id === item.correctId).length, 1, game);
    return item;
  });
  const customItem = LiveQuiz.customItem('哪一個是高音譜號？', ['𝄞', '𝄢', ''], 0);
  assert.equal(customItem.choices.length, 2);
  assert.equal(LiveQuiz.customItem('只有一個', ['甲'], 0), null);
  const saved = normalizeLiveQuiz({ title: '混合', limitMs: 20000, items: [customItem].concat(items) });
  assert.equal(saved.ok, true);
  assert.equal(saved.quiz.items[0].type, 'custom');
  assert.equal(saved.quiz.items.filter((item) => item.type === 'bank').length, 6);
  const staffHtml = LiveQuiz.renderRoom({
    phase: 'question',
    code: 'K7M4QP',
    title: '混合',
    index: 1,
    total: 2,
    limitMs: 20000,
    questionEndsAt: Date.now() + 20000,
    question: {
      prompt: items[0].prompt,
      game: 'staff-interval',
      type: 'bank',
      render: items[0].render,
      choices: items[0].choices
    },
    players: [{ name: '陳同學', grade: '1', class: 'A', seat: '12', avatar: '🎵', signature: '', score: 0, you: false }],
    answered: 0,
    locked: false
  }, { host: true, offset: 0 });
  assert.match(staffHtml, /data-live-staff/);
  assert.match(staffHtml, /class="lq-vex"/);
  assert.match(staffHtml, /lq-question\.webp/);
  assert.equal(staffHtml.includes('renderStaffSvg'), false);
  assert.equal(staffHtml.includes('td-staff-svg'), false);
  const lobbyHtml = LiveQuiz.renderRoom({
    phase: 'lobby', code: 'K7M4QP', title: '混合', players: []
  }, { host: true });
  assert.match(lobbyHtml, /lq-join\.webp/);
  const revealHtml = LiveQuiz.renderRoom({
    phase: 'reveal',
    code: 'K7M4QP',
    title: '混合',
    index: 0,
    total: 2,
    question: {
      prompt: '四分音符通常唱什麼？',
      type: 'custom',
      choices: [{ id: 'c1', label: 'ta', correct: true }, { id: 'c2', label: 'ti-ti' }]
    },
    players: [{ name: '陳同學', avatar: '🎵', score: 1000 }],
    yourChoice: '',
    yourPoints: 0
  }, { host: true });
  assert.match(revealHtml, /lq-reveal\.webp/);
  assert.match(revealHtml, /lq-quiz\.webp/);
  const fifth = LiveQuiz.vexSpec({
    clef: 'treble',
    notes: [{ pos: -2, acc: '' }, { pos: 2, acc: '' }]
  });
  assert.equal(JSON.stringify(fifth.notes), JSON.stringify([
    { key: 'c/4', accidental: '' },
    { key: 'g/4', accidental: '' }
  ]));
  const minorThird = LiveQuiz.vexSpec({
    clef: 'treble',
    notes: [{ pos: 1, acc: '' }, { pos: 3, acc: 'b' }]
  });
  assert.equal(minorThird.notes[0].key, 'f/4');
  assert.equal(minorThird.notes[1].key, 'a/4');
  assert.equal(minorThird.notes[1].accidental, 'b');
  assert.equal(LiveQuiz.vexSpec({ clef: 'bass', notes: [{ pos: 0, acc: '' }] }).notes[0].key, 'g/2');
  assert.equal(LiveQuiz.vexSpec({ clef: 'alto', notes: [{ pos: 0, acc: '' }] }).notes[0].key, 'f/3');
  const liveSrc = fs.readFileSync(new URL('../live-quiz.js', import.meta.url), 'utf8');
  assert.equal(liveSrc.includes('renderStaffSvg'), false);
  assert.match(liveSrc, /new VF\.Renderer/);
  assert.match(liveSrc, /VF\.StaveNote/);
  assert.match(liveSrc, /VF\.Accidental/);
  assert.match(liveSrc, /addClef/);
  Object.keys(LiveQuiz.ART).forEach((id) => assert.match(liveSrc, new RegExp(LiveQuiz.ART[id].replace(/[.]/g, '\\.'))));
  assert.equal(staffHtml.includes('submitScoreToGAS'), false);
  assert.equal(staffHtml.includes('@'), false);
  const storage = {
    value: '',
    getItem() { return this.value; },
    setItem(key, value) { this.value = value; this.key = key; }
  };
  assert.equal(LiveQuiz.rememberOfficial(storage, {
    host: true,
    phase: 'done',
    code: 'K7M4QP',
    title: '混合',
    officialBoard: [
      { name: '陳同學', grade: '1', class: 'A', seat: '12', avatar: '🎵', signature: '', score: 1000 },
      { name: '測試生', score: 750 },
      { name: '訪客', score: 1 },
      { name: '測試人員', score: 1 }
    ]
  }), true);
  const remembered = JSON.parse(storage.value);
  assert.equal(storage.key, 'ncLiveOfficial.v1');
  assert.deepEqual(remembered[0].board.map((row) => row.name), ['陳同學']);
});

test('rhythm-echo hit windows are locked for 容易/中等/困難 and grade exact, missed, extra, and clock-calibrated taps', () => {
  // Explicit ms windows locked per difficulty
  assert.deepEqual(
    {
      easy: [RHYTHM_ECHO_WINDOWS.easy.label, RHYTHM_ECHO_WINDOWS.easy.hitWindowMs, RHYTHM_ECHO_WINDOWS.easy.perfectMs],
      medium: [RHYTHM_ECHO_WINDOWS.medium.label, RHYTHM_ECHO_WINDOWS.medium.hitWindowMs, RHYTHM_ECHO_WINDOWS.medium.perfectMs],
      hard: [RHYTHM_ECHO_WINDOWS.hard.label, RHYTHM_ECHO_WINDOWS.hard.hitWindowMs, RHYTHM_ECHO_WINDOWS.hard.perfectMs]
    },
    {
      easy: ['容易', 240, 90],
      medium: ['中等', 180, 70],
      hard: ['困難', 135, 55]
    }
  );

  // 4/4 at 60 BPM => 1000ms per beat: ta (0), ti-ti (1000, 1500), ta (2000), r (rest at 3000)
  const specMed = { kind: 'rhythm-echo', meter: '4/4', bpm: 60, level: 'medium', bars: ['ta ti-ti ta r'] };
  const expected = expectedEchoOnsetsMs(specMed);
  assert.deepEqual(expected, [0, 1000, 1500, 2000]);

  // Perfect / within window => verdict='correct', high points
  const exact = gradeRhythmEcho(specMed, [15, 980, 1520, 2010]);
  assert.equal(exact.verdict, 'correct');
  assert.equal(exact.correct, true);
  assert.equal(exact.missedCount, 0);
  assert.equal(exact.extraCount, 0);
  assert.ok(exact.points >= 900 && exact.points <= 1000);

  // Missed one beat => partial (3/4 = 75%)
  const missed = gradeRhythmEcho(specMed, [0, 1000, 2000]);
  assert.equal(missed.verdict, 'partial');
  assert.equal(missed.correct, false);
  assert.equal(missed.missedCount, 1);
  assert.equal(missed.hitCount, 3);
  assert.ok(missed.points > 0 && missed.points < 750);

  // Extra taps penalize accuracy and prevent full 'correct'
  const extra = gradeRhythmEcho(specMed, [0, 450, 1000, 1500, 2000, 2600]);
  assert.equal(extra.extraCount, 2);
  assert.equal(extra.correct, false);
  assert.equal(extra.verdict, 'partial');

  // Hard window (±135ms) rejects a 170ms drift that easy (±240ms) accepts
  const specEasy = Object.assign({}, specMed, { level: 'easy' });
  const specHard = Object.assign({}, specMed, { level: 'hard' });
  const drifted = [170, 1170, 1670, 2170];
  assert.equal(gradeRhythmEcho(specEasy, drifted).verdict, 'correct');
  assert.equal(gradeRhythmEcho(specHard, drifted).verdict, 'wrong');

  // Verify client LiveQuiz.gradeRhythmEcho matches server worker.js identically
  const context = { console };
  vm.createContext(context);
  for (const file of ['rhythm-levels.js', 'live-quiz.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  assert.deepEqual(JSON.parse(JSON.stringify(context.LiveQuiz.gradeRhythmEcho(specMed, [15, 980, 1520, 2010]))), exact);
  assert.deepEqual(JSON.parse(JSON.stringify(context.LiveQuiz.gradeRhythmEcho(specMed, [0, 1000, 2000]))), missed);
  const built = context.LiveQuiz.buildRhythmEcho({ level: 'medium', meter: '4/4', barCount: 2 }, () => 0.4);
  assert.equal(built.game, 'rhythm-echo');
  assert.equal(built.render.bars.length, 2);
});

test('worker /live/* rhythm-echo vertical slice: synced timeline, clock-calibrated taps, live teacher ranking, latecomer spectate, reconnect, and projection UI', async () => {
  const db = memoryDb();
  const baseNow = Date.now();
  const env = { DB: db, JWT_SECRET: SECRET, EXTRA_ALLOWED_EMAILS: 'teacher.allow@gmail.com', NOW: baseNow };

  db.users.set('teacher-sub', { sub: 'teacher-sub', email: 'teacher.allow@gmail.com', name: '陳老師', student_name: '陳老師', grade: '', class: '' });
  db.users.set('s1-sub', { sub: 's1-sub', email: 's1@school.edu.hk', name: '阿明', student_name: '阿明', grade: '2', class: 'A' });
  db.users.set('s2-sub', { sub: 's2-sub', email: 's2@school.edu.hk', name: '小晴', student_name: '小晴', grade: '2', class: 'A' });
  db.users.set('s3-sub', { sub: 's3-sub', email: 's3@school.edu.hk', name: '遲到生', student_name: '遲到生', grade: '2', class: 'A' });
  db.roster.set('s1@school.edu.hk', { email: 's1@school.edu.hk', grade: '2', class: 'A', student_name: '阿明', seat: '1' });
  db.roster.set('s2@school.edu.hk', { email: 's2@school.edu.hk', grade: '2', class: 'A', student_name: '小晴', seat: '2' });
  db.roster.set('s3@school.edu.hk', { email: 's3@school.edu.hk', grade: '2', class: 'A', student_name: '遲到生', seat: '3' });

  const teacher = await signSessionToken({ sub: 'teacher-sub', email: 'teacher.allow@gmail.com' }, SECRET, baseNow);
  const s1 = await signSessionToken({ sub: 's1-sub', email: 's1@school.edu.hk' }, SECRET, baseNow);
  const s2 = await signSessionToken({ sub: 's2-sub', email: 's2@school.edu.hk' }, SECRET, baseNow);
  const s3 = await signSessionToken({ sub: 's3-sub', email: 's3@school.edu.hk' }, SECRET, baseNow);

  async function hit(token, method, path, body) {
    const res = await worker.fetch(new Request('https://auth.example' + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, Origin: 'http://127.0.0.1:4173', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }), env);
    return { status: res.status, data: await res.json() };
  }

  const echoQuiz = {
    title: '課堂節奏跟打',
    limitMs: 20000,
    items: [
      { type: 'rhythm-echo', meter: '4/4', bpm: 60, level: 'easy', bars: ['ta ti-ti ta ta'] },
      { type: 'rhythm-echo', meter: '3/4', bpm: 84, level: 'medium', bars: ['ta ti-ti ta', 'ta ta-a'] }
    ]
  };
  const saved = await hit(teacher, 'POST', '/live/quizzes', echoQuiz);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.quiz.items[0].game, 'rhythm-echo');

  const room = await hit(teacher, 'POST', '/live/rooms', { quizId: saved.data.quiz.id });
  const code = room.data.code;
  assert.equal((await hit(s1, 'POST', `/live/rooms/${code}/join`, { avatar: '🥁' })).status, 200);
  assert.equal((await hit(s2, 'POST', `/live/rooms/${code}/join`, { avatar: '🎹' })).status, 200);

  // Start Q0: everyone receives identical synchronized timeline
  const q0 = await hit(teacher, 'POST', `/live/rooms/${code}/advance`, {});
  assert.equal(q0.data.phase, 'question');
  assert.ok(q0.data.echoTimeline);
  const tl = q0.data.echoTimeline;

  // Early tap during demo is rejected (409 too_early)
  env.NOW = tl.demoStartAt + 500;
  const early = await hit(s1, 'POST', `/live/rooms/${code}/tap`, { onsets: [0, 1000, 1500, 2000, 3000] });
  assert.equal(early.status, 409);
  assert.equal(early.data.error, 'too_early');

  // Latecomer s3 joins mid-Q0 -> allowed as spectator, cannot submit Q0
  const late = await hit(s3, 'POST', `/live/rooms/${code}/join`, { avatar: '🎺' });
  assert.equal(late.status, 200);
  assert.equal(late.data.spectating, true);

  // s1 reconnects mid-Q0 -> preserves single identity without duplicating row
  const rejoin = await hit(s1, 'POST', `/live/rooms/${code}/join`, { avatar: '🥁' });
  assert.equal(rejoin.status, 200);
  assert.equal(rejoin.data.players.length, 3);

  // Move into tap window: s1 submits clock-calibrated absolute tapTimestamps (simulating +3500ms drifted client corrected by serverNow offset!)
  env.NOW = tl.tapStartAt + 3500;
  const clientClockOffset = 3500;
  const rawDrifted = [0, 1000, 1500, 2000, 3000].map((rel) => (tl.tapStartAt + rel) + clientClockOffset);
  const calibrated = rawDrifted.map((ts) => ts - clientClockOffset);
  const tap1 = await hit(s1, 'POST', `/live/rooms/${code}/tap`, { tapTimestamps: calibrated });
  assert.equal(tap1.status, 200);
  assert.equal(tap1.data.yourEcho.verdict, 'correct');
  assert.equal(tap1.data.yourEcho.beats, undefined, 'beat details stay hidden until teacher reveal');
  assert.equal(JSON.stringify(tap1.data).includes('@'), false);

  // Spectator s3 trying to tap Q0 gets 403 spectating
  const specTap = await hit(s3, 'POST', `/live/rooms/${code}/tap`, { onsets: [0, 1000, 1500, 2000, 3000] });
  assert.equal(specTap.status, 403);
  assert.equal(specTap.data.error, 'spectating');

  // s2 misses two beats => partial/wrong
  const tap2 = await hit(s2, 'POST', `/live/rooms/${code}/tap`, { onsets: [0, 1000, 2000] });
  assert.equal(tap2.status, 200);
  assert.equal(tap2.data.yourEcho.verdict, 'partial');

  // Teacher's live projection view sees instant rankings (#1 阿明) and live status grid
  const hostLive = await hit(teacher, 'GET', `/live/rooms/${code}`);
  assert.equal(hostLive.data.players[0].name, '阿明');
  assert.equal(hostLive.data.players[0].roundStatus, 'correct');
  assert.equal(hostLive.data.players.find((p) => p.name === '小晴').roundStatus, 'partial');
  assert.equal(hostLive.data.players.find((p) => p.name === '遲到生').roundStatus, 'spectating');

  // Teacher reveals Q0 -> per-beat details appear for s1 and scores lock permanently
  const rev = await hit(teacher, 'POST', `/live/rooms/${code}/advance`, {});
  assert.equal(rev.data.phase, 'reveal');
  const s1Rev = await hit(s1, 'GET', `/live/rooms/${code}`);
  assert.equal(s1Rev.data.yourEcho.beats.length, 5);
  assert.equal(s1Rev.data.players[0].score, 1000);
  assert.equal(s1Rev.data.players[0].correctCount, 1);

  // Advance to Q1 -> latecomer s3 is no longer spectating and can tap!
  const q1 = await hit(teacher, 'POST', `/live/rooms/${code}/advance`, {});
  assert.equal(q1.data.index, 1);
  env.NOW = q1.data.echoTimeline.tapStartAt + 4000;
  const s3Q1 = await hit(s3, 'POST', `/live/rooms/${code}/tap`, {
    onsets: expectedEchoOnsetsMs(q1.data.question.render)
  });
  assert.equal(s3Q1.status, 200);
  assert.equal(s3Q1.data.spectating, false);
  assert.equal(s3Q1.data.yourEcho.verdict, 'correct');

  // Verify projection & student HTML render cleanly (no tap pad during demo, giant tap pad during tap)
  const context = { console };
  vm.createContext(context);
  for (const file of ['rhythm-levels.js', 'live-quiz.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  const projHtml = context.LiveQuiz.renderRoom(hostLive.data, { host: true, projection: true, offset: 0 });
  assert.match(projHtml, /lq-proj-split/);
  assert.match(projHtml, /data-live-rhythm-echo/);
  assert.match(projHtml, /lq-roster-grid/);

  const demoStudentHtml = context.LiveQuiz.renderRoom(
    Object.assign({}, q0.data, { host: false, echoSubPhase: 'demo', echoTimeline: null }),
    { host: false, offset: 0 }
  );
  assert.match(demoStudentHtml, /lq-demo-shield/);
  assert.equal(demoStudentHtml.includes('lq-tap-pad'), false, 'no tap pad during demo');

  const tapStudentHtml = context.LiveQuiz.renderRoom(
    Object.assign({}, q0.data, { host: false, echoSubPhase: 'tap', echoTimeline: null }),
    { host: false, offset: 0 }
  );
  assert.match(tapStudentHtml, /lq-tap-pad/);
});

test('worker /live/* CAS prevents dropped submissions when 6 students submit /tap and /answer concurrently', async () => {
  let gateRelease = null;
  let gatePromise = null;
  let gateTarget = 0;
  let gateCount = 0;
  function armSelectBarrier(n) {
    gateTarget = n;
    gateCount = 0;
    gatePromise = new Promise((resolve) => { gateRelease = resolve; });
  }
  function clearBarrier() {
    gateTarget = 0;
    gatePromise = null;
    gateRelease = null;
  }

  const db = memoryDb({
    async onOp(kind, table, compact) {
      if (gateTarget > 0 && kind === 'first' && table === 'live_rooms' && compact.startsWith('SELECT')) {
        gateCount += 1;
        if (gateCount <= gateTarget) {
          if (gateCount === gateTarget) gateRelease();
          await gatePromise;
        }
      }
    }
  });

  const baseNow = Date.now();
  const env = { DB: db, JWT_SECRET: SECRET, EXTRA_ALLOWED_EMAILS: 'teacher.allow@gmail.com', NOW: baseNow };
  db.users.set('teacher-sub', { sub: 'teacher-sub', email: 'teacher.allow@gmail.com', name: '陳老師', student_name: '陳老師', grade: '', class: '' });
  const teacher = await signSessionToken({ sub: 'teacher-sub', email: 'teacher.allow@gmail.com' }, SECRET, baseNow);

  const studentTokens = [];
  for (let i = 1; i <= 6; i++) {
    const sub = `conc-s-${i}`;
    const email = `conc${i}@school.edu.hk`;
    db.users.set(sub, { sub, email, name: `同學${i}`, student_name: `同學${i}`, grade: '3', class: 'A' });
    db.roster.set(email, { email, grade: '3', class: 'A', student_name: `同學${i}`, seat: String(i) });
    studentTokens.push(await signSessionToken({ sub, email }, SECRET, baseNow));
  }

  async function hit(token, method, path, body) {
    const res = await worker.fetch(new Request('https://auth.example' + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, Origin: 'http://127.0.0.1:4173', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }), env);
    return { status: res.status, data: await res.json() };
  }

  const saved = await hit(teacher, 'POST', '/live/quizzes', {
    title: '並發壓測',
    limitMs: 20000,
    items: [
      { type: 'rhythm-echo', meter: '4/4', bpm: 60, level: 'easy', bars: ['ta ti-ti ta ta'] },
      custom
    ]
  });
  const room = await hit(teacher, 'POST', '/live/rooms', { quizId: saved.data.quiz.id });
  const code = room.data.code;

  // All 6 students join concurrently with forced SELECT barrier
  armSelectBarrier(6);
  const joins = await Promise.all(studentTokens.map((tok) => hit(tok, 'POST', `/live/rooms/${code}/join`, { avatar: '🥁' })));
  clearBarrier();
  joins.forEach((r) => assert.equal(r.status, 200));
  assert.ok(db.stats.casConflicts >= 5, 'concurrent /join must hit CAS conflicts and retry cleanly');

  const q0 = await hit(teacher, 'POST', `/live/rooms/${code}/advance`, {});
  assert.equal(q0.data.players.length, 6, 'all 6 concurrently joined students preserved');

  // All 6 students submit /tap simultaneously while holding all 6 SELECTs at the same snapshot
  env.NOW = q0.data.echoTimeline.tapStartAt + 3500;
  const conflictsBeforeTap = db.stats.casConflicts;
  armSelectBarrier(6);
  const taps = await Promise.all(studentTokens.map((tok, idx) =>
    hit(tok, 'POST', `/live/rooms/${code}/tap`, {
      onsets: idx % 2 === 0 ? [0, 1000, 1500, 2000, 3000] : [0, 1000, 2000]
    })
  ));
  clearBarrier();
  taps.forEach((r) => assert.equal(r.status, 200));
  assert.ok(db.stats.casConflicts > conflictsBeforeTap, 'concurrent /tap must trigger CAS retries');

  const rev0 = await hit(teacher, 'POST', `/live/rooms/${code}/advance`, {});
  assert.equal(rev0.data.answered, 6, 'ALL 6 concurrent rhythm-echo /tap submissions preserved without drops');
  assert.equal(rev0.data.players.filter((p) => p.score > 0).length, 6);
  assert.equal(rev0.data.players.filter((p) => p.correctCount === 1).length, 3);

  // Move to Q1 (multiple-choice) and fire all 6 /answer requests concurrently
  const q1 = await hit(teacher, 'POST', `/live/rooms/${code}/advance`, {});
  assert.equal(q1.data.index, 1);
  const conflictsBeforeAns = db.stats.casConflicts;
  armSelectBarrier(6);
  const answers = await Promise.all(studentTokens.map((tok) =>
    hit(tok, 'POST', `/live/rooms/${code}/answer`, { choiceId: 'c1' })
  ));
  clearBarrier();
  answers.forEach((r) => assert.equal(r.status, 200));
  assert.ok(db.stats.casConflicts > conflictsBeforeAns, 'concurrent /answer must trigger CAS retries');

  const rev1 = await hit(teacher, 'POST', `/live/rooms/${code}/advance`, {});
  assert.equal(rev1.data.answered, 6, 'ALL 6 concurrent /answer submissions preserved without drops');
});

