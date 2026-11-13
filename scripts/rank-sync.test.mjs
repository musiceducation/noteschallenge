import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rankSync = fs.readFileSync(new URL('../rank-sync.js', import.meta.url), 'utf8');
const RankSync = new Function(rankSync + '\nreturn RankSync;')();

const CLEF_BADGE = {
  treble: '高音譜號',
  bass: '低音譜號',
  alto: '中音譜號',
  tenor: '次中音譜號',
  mixed: '混合'
};
const STUDENT = { name: '陳小樂', class: 'A', id: '12', grade: '2' };

function memoryStore() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    keys() { return [...data.keys()]; }
  };
}

function readRows(storage, key) {
  return JSON.parse(storage.getItem(key) || '[]');
}

function played(storageKey, score) {
  return {
    storageKey,
    score,
    name: STUDENT.name,
    class: STUDENT.class,
    id: STUDENT.id,
    grade: STUDENT.grade,
    accuracy: 80,
    max_combo: 4
  };
}

function modeOnly(storageKey, score, extra) {
  return Object.assign({
    game: 'abrsm-theory-v1',
    mode: storageKey,
    name: STUDENT.name,
    class: STUDENT.class,
    id: STUDENT.id,
    grade: STUDENT.grade,
    score
  }, extra || {});
}

const clefKeys = ['treble', 'bass', 'alto', 'tenor', 'mixed'].map((clef) => 'abrsm-theory-v1:notes-clef-' + clef);
const gradedGames = ['notes', 'keys', 'rhythm', 'rhythm-tap', 'terms'];
const gradedKeys = [];
for (const game of gradedGames) {
  for (let n = 1; n <= 5; n++) gradedKeys.push('abrsm-theory-v1:' + game + ':abrsm-g' + n);
}

for (const key of clefKeys.concat(gradedKeys)) {
  const parsed = RankSync.parseSharedRankKey(key);
  assert.ok(parsed, key);
  assert.equal(parsed.storageKey, key);
  assert.deepEqual(RankSync.resolveSharedRow(modeOnly(key, 10)), parsed);
  assert.equal(RankSync.resolveSharedRow({ game: 'game1', mode: key, name: STUDENT.name, score: 10 }).storageKey, key);
}

assert.equal(RankSync.parseSharedRankKey('abrsm-theory-v1:notes-clef-treble:abrsm-g1'), null);
assert.equal(RankSync.parseSharedRankKey('abrsm-theory-v1:notes-clef-soprano'), null);
assert.equal(RankSync.parseSharedRankKey('abrsm-theory-v1:keys'), null);
assert.equal(RankSync.parseSharedRankKey('abrsm-theory-v1:keys:abrsm-g6'), null);
assert.equal(RankSync.parseSharedRankKey('abrsm-theory-v1:foo:abrsm-g1'), null);
assert.equal(RankSync.parseSharedRankKey('classic60'), null);
assert.equal(RankSync.resolveSharedRow(modeOnly('abrsm-theory-v1:keys:abrsm-g3', 10, { syllabusId: 'abrsm-g4' })), null);
assert.equal(RankSync.resolveSharedRow(modeOnly('abrsm-theory-v1:notes-clef-alto', 10, { clefChoice: 'treble' })), null);
assert.equal(RankSync.resolveSharedRow(modeOnly('abrsm-theory-v1:keys:abrsm-g3', 10, { gameKey: 'rhythm' })), null);

const store = memoryStore();
for (const key of clefKeys) {
  const clef = key.split('notes-clef-')[1];
  RankSync.mergeIntoStore([modeOnly(key, 12)], store);
  const rows = readRows(store, key);
  assert.equal(rows.length, 1, key);
  assert.equal(rows[0].clefChoice, clef);
  assert.equal(rows[0].syllabusId, '');
  assert.equal(CLEF_BADGE[rows[0].clefChoice], CLEF_BADGE[clef]);
  assert.equal(RankSync.gradeBadge(rows[0].syllabusId), '');
}
for (const key of gradedKeys) {
  const local = memoryStore();
  const existing = played(key, 30);
  existing.syllabusId = key.split(':').pop();
  existing.gameKey = key.split(':')[1];
  local.setItem(key, JSON.stringify([existing]));
  RankSync.mergeIntoStore([modeOnly(key, 12)], local);
  let rows = readRows(local, key);
  assert.equal(rows.length, 1, key);
  assert.equal(rows[0].score, 30, key);
  assert.equal(RankSync.gradeBadge(rows[0].syllabusId), existing.syllabusId.replace('abrsm-g', 'G'), key);
  RankSync.mergeIntoStore([modeOnly(key, 40)], local);
  rows = readRows(local, key);
  assert.equal(rows.length, 1, key);
  assert.equal(rows[0].score, 40, key);
  assert.equal(rows[0].syllabusId, existing.syllabusId, key);
  assert.equal(local.keys().length, 1, key);
}

const rejected = memoryStore();
RankSync.mergeIntoStore([
  modeOnly('abrsm-theory-v1:keys:abrsm-g9', 99),
  modeOnly('abrsm-theory-v1:notes-clef-treble:abrsm-g1', 99),
  modeOnly('classic60', 99),
  modeOnly('abrsm-theory-v1:keys:abrsm-g3', 15, { syllabusId: 'abrsm-g1' })
], rejected);
assert.deepEqual(rejected.keys(), []);

function deployedAppend(rows, rec) {
  if (!rec || !rec.name || !rec.game) return { ok: false, error: 'missing required fields' };
  if (['game1', 'game2', 'game3', 'game4'].indexOf(rec.game) === -1) return { ok: false, error: 'invalid game' };
  const grade = parseInt(rec.grade, 10);
  if (!(grade >= 1 && grade <= 6)) return { ok: false, error: 'invalid grade' };
  rows.push({
    game: rec.game,
    name: String(rec.name).trim().slice(0, 20),
    grade: String(grade),
    class: String(rec.class || '').trim(),
    id: String(rec.id || '').trim(),
    mode: String(rec.mode || ''),
    mode_name: String(rec.mode_name || ''),
    score: parseInt(rec.score, 10) || 0,
    max_combo: parseInt(rec.max_combo, 10) || 0,
    total_questions: parseInt(rec.total_questions, 10) || 0,
    accuracy: Math.max(0, Math.min(100, parseInt(rec.accuracy, 10) || 0))
  });
  return { ok: true };
}

function deployedGet(rows) {
  return rows.map((row) => ({
    game: row.game,
    name: row.name,
    grade: row.grade,
    class: row.class,
    id: row.id,
    mode: row.mode,
    mode_name: row.mode_name,
    score: row.score,
    max_combo: row.max_combo,
    total_questions: row.total_questions,
    accuracy: row.accuracy,
    timestamp: ''
  }));
}

const keysKey = 'abrsm-theory-v1:keys:abrsm-g3';
let local = [];
const first = RankSync.commitLocalRank(local, played(keysKey, 20));
local = first.list;
assert.equal(first.publish.score, 20);
const body = RankSync.publishBody(first.publish);
assert.equal(body.action, 'saveRank');
assert.equal(body.game, 'game1');
assert.equal(body.mode, keysKey);
assert.equal(body.syllabusId, undefined);
assert.equal(body.storageKey, undefined);
assert.equal(deployedAppend([], { action: 'saveRank', game: 'abrsm-theory-v1', mode: keysKey, name: STUDENT.name, grade: 2, score: 20 }).error, 'invalid game');
const sheet = [];
assert.equal(deployedAppend(sheet, body).ok, true);
const lower = RankSync.commitLocalRank(local, played(keysKey, 8));
assert.equal(lower.publish, null);
assert.equal(lower.list.length, 1);
assert.equal(lower.list[0].score, 20);
assert.equal(sheet.length, 1);
const remoteOnly = memoryStore();
RankSync.mergeIntoStore(deployedGet(sheet), remoteOnly);
assert.equal(readRows(remoteOnly, keysKey)[0].score, 20);
assert.equal(RankSync.gradeBadge(readRows(remoteOnly, keysKey)[0].syllabusId), 'G3');
sheet.push(Object.assign({}, sheet[0], { score: 8 }));
const remoteWithDuplicate = memoryStore();
RankSync.mergeIntoStore(deployedGet(sheet), remoteWithDuplicate);
const kept = readRows(remoteWithDuplicate, keysKey);
assert.equal(kept.length, 1);
assert.equal(kept[0].score, 20);
assert.equal(RankSync.gradeBadge(kept[0].syllabusId), 'G3');

assert.equal(RankSync.legacySheetGame('rhythm'), 'game2');
assert.equal(RankSync.legacySheetGame('rhythm-tap'), 'game2');
assert.equal(RankSync.legacySheetGame('terms'), 'game3');
assert.equal(RankSync.publishBody(played('abrsm-theory-v1:terms:abrsm-g5', 11)).game, 'game3');

const emptyCache = RankSync.rankLoadPlan({ localBoard: true, legacyCacheRows: 0, legacyCacheFresh: false, force: false });
assert.equal(emptyCache.paintLocalImmediately, true);
assert.equal(emptyCache.paintLegacyCache, false);
assert.equal(emptyCache.fetchNetwork, true);
assert.equal(emptyCache.replaceWithConnectionError, false);
const fresh = RankSync.rankLoadPlan({ localBoard: true, legacyCacheRows: 4, legacyCacheFresh: true, force: false });
assert.equal(fresh.paintLocalImmediately, true);
assert.equal(fresh.fetchNetwork, false);
const afterScore = RankSync.rankLoadPlan({ localBoard: true, legacyCacheRows: 4, legacyCacheFresh: true, force: true });
assert.equal(afterScore.fetchNetwork, true);
assert.equal(afterScore.paintLocalImmediately, true);

const gasContext = {
  sheets: {},
  ContentService: {
    MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
    createTextOutput(text) {
      return { setMimeType() { return this; }, getContent() { return text; } };
    }
  }
};
gasContext.SpreadsheetApp = {
  getActiveSpreadsheet() {
    return {
      getSheetByName(name) { return gasContext.sheets[name] || null; },
      insertSheet(name) {
        const rows = [];
        const sheet = {
          appendRow(values) { rows.push(values.slice()); },
          getDataRange() { return { getValues() { return rows.map((row) => row.slice()); } }; },
          setFrozenRows() {},
          setColumnWidths() {},
          getLastRow() { return rows.length; },
          getRange(...args) {
            const chain = {
              setFontWeight() { return chain; },
              setBackground() { return chain; },
              setFontColor() { return chain; },
              setValues() { return chain; },
              setValue(value) {
                if (args.length === 2) rows[args[0] - 1][args[1] - 1] = value;
                return chain;
              }
            };
            return chain;
          }
        };
        gasContext.sheets[name] = sheet;
        return sheet;
      }
    };
  }
};
vm.createContext(gasContext);
vm.runInContext(fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8'), gasContext);

for (const key of clefKeys.concat(gradedKeys)) {
  assert.deepEqual(JSON.parse(JSON.stringify(gasContext.parseSharedRankKey(key))), JSON.parse(JSON.stringify(RankSync.parseSharedRankKey(key))), key);
}
for (const bad of ['abrsm-theory-v1:notes-clef-treble:abrsm-g1', 'abrsm-theory-v1:keys', 'classic60', '']) {
  assert.equal(gasContext.parseSharedRankKey(bad), null, bad);
  assert.equal(RankSync.parseSharedRankKey(bad), null, bad);
}

function postRank(record) {
  return JSON.parse(gasContext.doPost({ postData: { contents: JSON.stringify(record) } }).getContent());
}
function getRows() {
  return JSON.parse(gasContext.doGet({}).getContent());
}

const serverKey = 'abrsm-theory-v1:rhythm:abrsm-g2';
const high = RankSync.publishBody(played(serverKey, 20));
assert.equal(postRank(high).ok, true);
const low = RankSync.publishBody(played(serverKey, 8));
const keptPost = postRank(low);
assert.equal(keptPost.ok, true);
assert.equal(keptPost.kept, true);
assert.equal(keptPost.score, 20);
const listed = getRows().filter((row) => row.mode === serverKey);
assert.equal(listed.length, 1);
assert.equal(listed[0].score, 20);
assert.equal(listed[0].syllabusId, undefined);
assert.equal(listed[0].storageKey, undefined);
assert.equal(listed[0].game, 'abrsm-theory-v1');
assert.deepEqual(Object.keys(listed[0]).sort(), ['accuracy', 'class', 'game', 'grade', 'id', 'max_combo', 'mode', 'mode_name', 'name', 'score', 'timestamp', 'total_questions']);
const fromServer = memoryStore();
RankSync.mergeIntoStore(listed, fromServer);
const restored = readRows(fromServer, serverKey);
assert.equal(restored.length, 1);
assert.equal(restored[0].score, 20);
assert.equal(restored[0].gameKey, 'rhythm');
assert.equal(RankSync.gradeBadge(restored[0].syllabusId), 'G2');
const raised = postRank(RankSync.publishBody(played(serverKey, 27)));
assert.equal(raised.updated, true);
assert.equal(raised.score, 27);
assert.equal(getRows().filter((row) => row.mode === serverKey).length, 1);
assert.equal(getRows().find((row) => row.mode === serverKey).score, 27);
assert.equal(postRank(RankSync.publishBody(played(serverKey, 8))).score, 27);
assert.equal(postRank(Object.assign({}, high, { mode: 'abrsm-theory-v1:nope:abrsm-g2', score: 99 })).error, 'invalid rank key');
assert.equal(getRows().filter((row) => row.mode === 'abrsm-theory-v1:nope:abrsm-g2').length, 0);
assert.equal(postRank(Object.assign({}, high, { syllabusId: 'abrsm-g5' })).error, 'invalid rank key');

const clefBody = RankSync.publishBody(played('abrsm-theory-v1:notes-clef-alto', 14));
assert.equal(postRank(clefBody).ok, true);
const clefRow = getRows().find((row) => row.mode === 'abrsm-theory-v1:notes-clef-alto');
assert.equal(clefRow.clefChoice, undefined);
const clefStore = memoryStore();
RankSync.mergeIntoStore([clefRow], clefStore);
const clefRestored = readRows(clefStore, 'abrsm-theory-v1:notes-clef-alto');
assert.equal(clefRestored[0].clefChoice, 'alto');
assert.equal(CLEF_BADGE[clefRestored[0].clefChoice], '中音譜號');
assert.equal(clefRestored[0].syllabusId, '');

assert.equal(
  fs.readFileSync(new URL('../rank-sync.js', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../www/rank-sync.js', import.meta.url), 'utf8')
);

function loadGas(source) {
  const gas = {
    sheets: {},
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput(text) {
        return { setMimeType() { return this; }, getContent() { return text; } };
      }
    }
  };
  gas.SpreadsheetApp = {
    getActiveSpreadsheet() {
      return {
        getSheetByName(name) { return gas.sheets[name] || null; },
        insertSheet(name) {
          const rows = [];
          const sheet = {
            appendRow(values) { rows.push(values.slice()); },
            getDataRange() { return { getValues() { return rows.map((row) => row.slice()); } }; },
            setFrozenRows() {},
            setColumnWidths() {},
            getLastRow() { return rows.length; },
            getRange() {
              const chain = {
                setFontWeight() { return chain; },
                setBackground() { return chain; },
                setFontColor() { return chain; },
                setValues() { return chain; }
              };
              return chain;
            }
          };
          gas.sheets[name] = sheet;
          return sheet;
        }
      };
    }
  };
  vm.createContext(gas);
  vm.runInContext(source, gas);
  return gas;
}

function gasPost(gas, record) {
  return JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(record) } }).getContent());
}

function gasGet(gas, parameter) {
  return JSON.parse(gas.doGet({ parameter: parameter || {} }).getContent());
}

const repo = fileURLToPath(new URL('..', import.meta.url));
const appendOnlySrc = execFileSync('git', ['show', '68762b3:Code.gs'], { cwd: repo, encoding: 'utf8' });
assert.equal(appendOnlySrc.includes("action === 'saveRank'"), false);
assert.equal(appendOnlySrc.includes("action === 'saveProfileResult'"), true);
const appendOnly = loadGas(appendOnlySrc);

const appendCases = [
  'abrsm-theory-v1:notes-clef-alto',
  'abrsm-theory-v1:notes:abrsm-g1',
  'abrsm-theory-v1:keys:abrsm-g3',
  'abrsm-theory-v1:rhythm:abrsm-g2',
  'abrsm-theory-v1:rhythm-tap:abrsm-g4',
  'abrsm-theory-v1:terms:abrsm-g5'
];
for (const key of appendCases) {
  const body = RankSync.publishBody(played(key, 20));
  assert.equal(body.action, 'saveRank', key);
  assert.equal(['game1', 'game2', 'game3'].includes(body.game), true, key);
  const accepted = gasPost(appendOnly, body);
  assert.equal(accepted.ok, true, key);
  assert.equal(accepted.error, undefined, key);
  const found = gasGet(appendOnly).filter((row) => row.mode === key);
  assert.equal(found.length, 1, key);
  assert.equal(found[0].game, body.game, key);
  assert.equal(found[0].syllabusId, undefined, key);
  assert.equal(found[0].storageKey, undefined, key);
  const empty = memoryStore();
  RankSync.mergeIntoStore(found, empty);
  const merged = readRows(empty, key);
  assert.equal(merged.length, 1, key);
  assert.equal(merged[0].score, 20, key);
  if (key.includes('notes-clef-')) {
    assert.equal(CLEF_BADGE[merged[0].clefChoice], '中音譜號', key);
    assert.equal(merged[0].syllabusId, '', key);
  } else {
    assert.equal(RankSync.gradeBadge(merged[0].syllabusId), key.slice(-1).replace(/(\d)/, 'G$1'), key);
  }
}

const keysAgain = 'abrsm-theory-v1:keys:abrsm-g3';
const lowerAppend = gasPost(appendOnly, RankSync.publishBody(played(keysAgain, 8)));
assert.equal(lowerAppend.ok, true);
const both = gasGet(appendOnly).filter((row) => row.mode === keysAgain);
assert.equal(both.length, 2);
assert.equal(both.some((row) => row.score === 8), true);
const remote = memoryStore();
RankSync.mergeIntoStore(both, remote);
const best = readRows(remote, keysAgain);
assert.equal(best.length, 1);
assert.equal(best[0].score, 20);
assert.equal(RankSync.gradeBadge(best[0].syllabusId), 'G3');

const rejectedGame = gasPost(appendOnly, {
  action: 'saveRank',
  game: 'abrsm-theory-v1',
  mode: keysAgain,
  name: STUDENT.name,
  grade: STUDENT.grade,
  class: STUDENT.class,
  id: STUDENT.id,
  score: 99
});
assert.equal(rejectedGame.ok, false);
assert.equal(rejectedGame.error, 'invalid game');

const ranksBeforeProfile = gasGet(appendOnly).length;
const profile = {
  action: 'saveProfileResult',
  game: 'game1',
  name: STUDENT.name,
  grade: '4',
  class: STUDENT.class,
  id: STUDENT.id,
  score: 50,
  accuracy: 90,
  max_combo: 3,
  level: 2,
  exp: 10,
  total_played: 4,
  cleared: 3,
  fc_count: 1,
  ap_count: 0
};
assert.equal(gasPost(appendOnly, profile).ok, true);
assert.equal(gasGet(appendOnly).length, ranksBeforeProfile);
const oldProfiles = gasGet(appendOnly, { action: 'getProfile', name: STUDENT.name, grade: '4', class: STUDENT.class });
assert.equal(oldProfiles.length, 1);
assert.equal(Number(oldProfiles[0].score), 50);
assert.equal(oldProfiles[0].game, 'game1');
assert.equal(oldProfiles[0].mode, undefined);

const currentRanksBeforeProfile = getRows().length;
assert.equal(postRank(profile).ok, true);
assert.equal(getRows().length, currentRanksBeforeProfile);
const currentProfiles = JSON.parse(gasContext.doGet({
  parameter: { action: 'getProfile', name: STUDENT.name, grade: '4', class: STUDENT.class }
}).getContent());
assert.equal(currentProfiles.length, 1);
assert.equal(Number(currentProfiles[0].score), 50);

const gameSrc = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
assert.equal(gameSrc.split('storeSharedRank(').length - 1, 4);
assert.equal(gameSrc.split('publishSharedRank(').length - 1, 2);
const loadBody = gameSrc.slice(gameSrc.indexOf('async function loadRanks'), gameSrc.indexOf('function escHtml'));
assert.doesNotMatch(loadBody, /storeSharedRank|publishSharedRank|publishBody/);

console.log('rank-sync: ok');
