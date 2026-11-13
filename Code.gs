// ============================================================
// 音符小精靈 — Google Apps Script 排行榜後端
// 支援：遊戲一（音名辨別）、遊戲二（節奏挑戰）、遊戲三（音樂術語）、遊戲四（樂器辨別）
// ============================================================

// 對應 game 欄位 → 工作表名稱
const GAME_SHEETS = {
  game1: '音名辨別',
  game2: '節奏挑戰',
  game3: '音樂術語',
  game4: '樂器辨別'
};

// 個人檔案結果工作表
const PROFILE_SHEET = '個人檔案';

// 個人檔案欄位順序
const PROFILE_COLUMNS = [
  'name','grade','class','id','game',
  'score','accuracy','max_combo',
  'level','exp',
  'total_played','cleared','fc_count','ap_count',
  'timestamp'
];

// 欄位順序（與現有工作表一致）
// name | grade | class | id | mode | mode_name | score | max_combo | total_questions | accuracy | timestamp
const COLUMNS = ['name','grade','class','id','mode','mode_name','score','max_combo','total_questions','accuracy','timestamp'];

// 新榜只把 canonical storageKey 放在既有 mode 欄。重新部署後，較低分不能覆蓋較高分。
const SHARED_RANK_SHEET = '共用排行榜';

function parseSharedRankKey(raw) {
  const key = String(raw || '');
  const prefix = 'abrsm-theory-v1:';
  if (key.slice(0, prefix.length) !== prefix) return null;
  const rest = key.slice(prefix.length);
  const clef = /^notes-clef-(treble|bass|alto|tenor|mixed)$/.exec(rest);
  if (clef) {
    return {
      storageKey: key,
      gameKey: 'notes-clef-' + clef[1],
      syllabusId: '',
      clefChoice: clef[1]
    };
  }
  const graded = /^(rhythm-tap|notes|keys|rhythm|terms):(abrsm-g[1-5])$/.exec(rest);
  if (!graded) return null;
  return {
    storageKey: key,
    gameKey: graded[1],
    syllabusId: graded[2],
    clefChoice: ''
  };
}

function resolveSharedRankPost(rec) {
  if (!rec) return null;
  const mode = String(rec.mode || '');
  const storageKey = String(rec.storageKey || '');
  const parsed = parseSharedRankKey(storageKey || mode);
  if (!parsed) return null;
  if (storageKey && storageKey !== parsed.storageKey) return null;
  if (mode.indexOf('abrsm-theory-v1:') === 0 && mode !== parsed.storageKey) return null;
  if (rec.gameKey && String(rec.gameKey) !== parsed.gameKey) return null;
  if (rec.syllabusId && String(rec.syllabusId) !== parsed.syllabusId) return null;
  if (rec.clefChoice && String(rec.clefChoice) !== parsed.clefChoice) return null;
  return parsed;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 工具：取得或建立指定工作表 ──────────────────────────────
function getSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length)
      .setFontWeight('bold')
      .setBackground('#8B66FF')
      .setFontColor('#FFFFFF');
    sheet.setColumnWidths(1, COLUMNS.length, 130);
  }
  return sheet;
}

// ── 工具：取得或建立個人檔案工作表 ─────────────────────────────
function getProfileSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PROFILE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PROFILE_SHEET);
    sheet.appendRow(PROFILE_COLUMNS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, PROFILE_COLUMNS.length)
      .setFontWeight('bold')
      .setBackground('#34A853')
      .setFontColor('#FFFFFF');
    sheet.setColumnWidths(1, PROFILE_COLUMNS.length, 130);
  }
  return sheet;
}

// 學生創作備份工作表（旋律／節奏 JSON）
const COMPOSITION_COLUMNS = ['name', 'grade', 'class', 'id', 'tab', 'key_sig', 'json', 'timestamp'];

function getCompositionSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = '學生創作';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(COMPOSITION_COLUMNS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COMPOSITION_COLUMNS.length)
      .setFontWeight('bold')
      .setBackground('#8B66FF')
      .setFontColor('#FFFFFF');
    sheet.setColumnWidths(1, COMPOSITION_COLUMNS.length, 120);
  }
  return sheet;
}

// ── 接收分數（POST） ─────────────────────────────────────────
function doPost(e) {
  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const rec = JSON.parse(raw);

    // 創作工作室 — 備份 JSON（不計分）
    if (rec.action === 'saveComposition') {
      const name = String(rec.name || '').trim().slice(0, 20);
      if (!name) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, error: 'invalid name' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const sheet = getCompositionSheet();
      sheet.appendRow([
        name,
        String(parseInt(rec.grade, 10) || 0),
        String(rec.class || '').trim(),
        String(rec.id || '').trim(),
        String(rec.tab || '').trim(),
        String(rec.keySig || rec.key_sig || '').trim().slice(0, 12),
        String(rec.json || '').slice(0, 50000),
        String(rec.timestamp || new Date().toLocaleString('zh-TW'))
      ]);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 個人檔案結果寫入（與排行榜分流）
    if (rec.action === 'saveProfileResult') {
      const grade = parseInt(rec.grade);
      if (isNaN(grade) || grade < 1 || grade > 6) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, error: 'invalid grade' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const name = String(rec.name || '').trim().slice(0, 20);
      if (!name) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, error: 'invalid name' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const score = parseInt(rec.score) || 0;
      const accuracy = Math.max(0, Math.min(100, parseInt(rec.accuracy) || 0));

      const sheet = getProfileSheet();
      sheet.appendRow([
        name,
        String(grade),
        String(rec.class || '').trim(),
        String(rec.id || '').trim(),
        String(rec.game || '').trim(),
        score,
        accuracy,
        parseInt(rec.max_combo) || 0,
        parseInt(rec.level) || 1,
        parseInt(rec.exp) || 0,
        parseInt(rec.total_played) || 0,
        parseInt(rec.cleared) || 0,
        parseInt(rec.fc_count) || 0,
        parseInt(rec.ap_count) || 0,
        new Date().toLocaleString('zh-TW')
      ]);

      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (rec.action === 'saveRank') {
      const parsed = resolveSharedRankPost(rec);
      if (!parsed) return jsonOut({ ok: false, error: 'invalid rank key' });
      const grade = parseInt(rec.grade, 10);
      if (isNaN(grade) || grade < 1 || grade > 6) return jsonOut({ ok: false, error: 'invalid grade' });
      const name = String(rec.name || '').trim().slice(0, 20);
      if (!name) return jsonOut({ ok: false, error: 'invalid name' });
      const score = parseInt(rec.score, 10) || 0;
      const accuracy = Math.max(0, Math.min(100, parseInt(rec.accuracy, 10) || 0));
      const klass = String(rec.class || '').trim();
      const sid = String(rec.id || '').trim();
      const sheet = getSheet(SHARED_RANK_SHEET);
      const data = sheet.getDataRange().getValues();
      const headers = data[0].map(function (h) { return String(h); });
      const col = function (header) { return headers.indexOf(header); };
      const iName = col('name');
      const iClass = col('class');
      const iId = col('id');
      const iMode = col('mode');
      const iScore = col('score');
      let bestRow = -1;
      let bestScore = -1;
      for (let r = 1; r < data.length; r++) {
        const row = data[r];
        if (String(row[iName] || '').trim() !== name) continue;
        if (String(row[iClass] || '').trim() !== klass) continue;
        if (String(row[iId] || '').trim() !== sid) continue;
        if (String(row[iMode] || '') !== parsed.storageKey) continue;
        const existing = parseInt(row[iScore], 10) || 0;
        if (existing > bestScore) {
          bestScore = existing;
          bestRow = r;
        }
      }
      if (bestRow >= 1 && score <= bestScore) return jsonOut({ ok: true, kept: true, score: bestScore });
      if (bestRow >= 1) {
        sheet.getRange(bestRow + 1, iScore + 1).setValue(score);
        const iCombo = col('max_combo');
        const iAcc = col('accuracy');
        const iTs = col('timestamp');
        if (iCombo >= 0) sheet.getRange(bestRow + 1, iCombo + 1).setValue(parseInt(rec.max_combo, 10) || 0);
        if (iAcc >= 0) sheet.getRange(bestRow + 1, iAcc + 1).setValue(accuracy);
        if (iTs >= 0) sheet.getRange(bestRow + 1, iTs + 1).setValue(new Date().toLocaleString('zh-TW'));
        return jsonOut({ ok: true, updated: true, score: score });
      }
      sheet.appendRow([
        name,
        String(grade),
        klass,
        sid,
        parsed.storageKey,
        String(rec.mode_name || ''),
        score,
        parseInt(rec.max_combo, 10) || 0,
        parseInt(rec.total_questions, 10) || 0,
        accuracy,
        new Date().toLocaleString('zh-TW')
      ]);
      return jsonOut({ ok: true, score: score });
    }

    if (!rec.name || !rec.game) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'missing required fields' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Input validation
    const validGames = Object.keys(GAME_SHEETS);
    if (validGames.indexOf(rec.game) === -1) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'invalid game' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const grade = parseInt(rec.grade);
    if (isNaN(grade) || grade < 1 || grade > 6) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'invalid grade' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const score = parseInt(rec.score) || 0;
    const accuracy = Math.max(0, Math.min(100, parseInt(rec.accuracy) || 0));
    const name = String(rec.name || '').trim().slice(0, 20);
    if (!name) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'invalid name' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const sheetName = GAME_SHEETS[rec.game];
    const sheet = getSheet(sheetName);

    // 寫入順序必須與 COLUMNS 一致 — use server timestamp
    sheet.appendRow([
      name,
      String(grade),
      String(rec.class            || '').trim(),
      String(rec.id               || '').trim(),
      String(rec.mode             || ''),
      String(rec.mode_name        || ''),
      score,
      parseInt(rec.max_combo)     || 0,
      parseInt(rec.total_questions) || 0,
      accuracy,
      new Date().toLocaleString('zh-TW')
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── 讀取排行榜（GET） ────────────────────────────────────────
// 合併所有工作表，每筆紀錄加上 game 欄位供前端篩選
// Supports optional ?game=game1 parameter to limit data returned
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── 個人檔案查詢 ─────────────────────────────────────────
    if (e && e.parameter && e.parameter.action === 'getProfile') {
      const qName  = String(e.parameter.name  || '').trim().toLowerCase();
      const qGrade = String(e.parameter.grade || '').trim();
      const qClass = String(e.parameter.class || '').trim().toLowerCase();
      const sheet  = ss.getSheetByName(PROFILE_SHEET);
      if (!sheet) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
      const headers = data[0].map(h => String(h).trim().toLowerCase());
      const rows = data.slice(1).filter(row => {
        const rName  = String(row[headers.indexOf('name')]  || '').trim().toLowerCase();
        const rGrade = String(row[headers.indexOf('grade')] || '').trim();
        const rClass = String(row[headers.indexOf('class')] || '').trim().toLowerCase();
        return rName === qName && rGrade === qGrade && rClass === qClass;
      }).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
      });
      return ContentService
        .createTextOutput(JSON.stringify(rows))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── 批次取得所有個人檔案（可選 grade/class 過濾）────────
    if (e && e.parameter && e.parameter.action === 'getAllProfiles') {
      const qGrade = String(e.parameter.grade || '').trim();
      const qClass = String(e.parameter.class || '').trim().toLowerCase();
      const sheet  = ss.getSheetByName(PROFILE_SHEET);
      if (!sheet) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
      const headers = data[0].map(h => String(h).trim().toLowerCase());
      let rows = data.slice(1);
      if (qGrade) rows = rows.filter(row => String(row[headers.indexOf('grade')] || '').trim() === qGrade);
      if (qClass) rows = rows.filter(row => String(row[headers.indexOf('class')] || '').trim().toLowerCase() === qClass);
      const result = rows.map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
      });
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    let allRows = [];
    const filterGame = (e && e.parameter && e.parameter.game) ? e.parameter.game : null;
    const sheetsToLoad = filterGame && GAME_SHEETS[filterGame]
      ? [[filterGame, GAME_SHEETS[filterGame]]]
      : Object.entries(GAME_SHEETS);

    sheetsToLoad.forEach(([gameKey, sheetName]) => {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return;

      const headers = data[0];
      data.slice(1).forEach(row => {
        const obj = { game: gameKey };
        headers.forEach((h, i) => { obj[h] = row[i]; });
        allRows.push(obj);
      });
    });

    if (!filterGame || filterGame === 'abrsm-theory-v1') {
      const shared = ss.getSheetByName(SHARED_RANK_SHEET);
      if (shared) {
        const data = shared.getDataRange().getValues();
        if (data.length > 1) {
          const headers = data[0];
          data.slice(1).forEach(row => {
            const obj = { game: 'abrsm-theory-v1' };
            headers.forEach((h, i) => { obj[h] = row[i]; });
            allRows.push(obj);
          });
        }
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify(allRows))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── OPTIONS（CORS preflight） ────────────────────────────────
function doOptions(e) {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ── 本地測試用（在 GAS 編輯器執行） ─────────────────────────
function testPost() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        game: 'game1',
        name: '測試學生',
        grade: '4',
        class: 'A',
        id: '1',
        mode: 'classic60',
        mode_name: '高音譜號挑戰',
        score: 120,
        max_combo: 15,
        accuracy: 90,
        total_questions: 20,
        timestamp: new Date().toLocaleString('zh-TW')
      })
    }
  };
  const result = doPost(fakeEvent);
  Logger.log(result.getContent());
}

function testGet() {
  const result = doGet({});
  Logger.log(result.getContent().slice(0, 500));
}

function testProfilePost() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        action: 'saveProfileResult',
        game: 'game1',
        name: '測試學生',
        grade: '4',
        class: 'A',
        id: '1',
        score: 120,
        max_combo: 15,
        accuracy: 90,
        level: 3,
        exp: 45,
        total_played: 10,
        cleared: 8,
        fc_count: 2,
        ap_count: 1,
        timestamp: new Date().toLocaleString('zh-TW')
      })
    }
  };
  const result = doPost(fakeEvent);
  Logger.log(result.getContent());
}

// ── 一次性工具：把舊排行榜紀錄回填到 PROFILE ───────────────────
function _normText(v) {
  return String(v == null ? '' : v).trim();
}

function _toInt(v, fallback) {
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

function _profileDedupKey(obj) {
  return [
    _normText(obj.game),
    _normText(obj.name),
    _normText(obj.grade),
    _normText(obj.class),
    _normText(obj.id),
    _normText(obj.score),
    _normText(obj.accuracy),
    _normText(obj.max_combo),
    _normText(obj.timestamp)
  ].join('|');
}

function backfillProfileFromGameSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const profileSheet = getProfileSheet();
  const nowTs = new Date().toLocaleString('zh-TW');

  // 1) 先讀取 PROFILE 既有資料，建立去重索引
  const existingSet = new Set();
  const pData = profileSheet.getDataRange().getValues();
  if (pData.length > 1) {
    for (let i = 1; i < pData.length; i++) {
      const r = pData[i];
      const key = _profileDedupKey({
        name: r[0], grade: r[1], class: r[2], id: r[3], game: r[4],
        score: r[5], accuracy: r[6], max_combo: r[7], timestamp: r[14]
      });
      existingSet.add(key);
    }
  }

  // 2) 掃描 game1~game4 舊表，轉成 PROFILE 欄位格式
  const toAppend = [];
  let scanned = 0;
  let skippedDuplicate = 0;
  let skippedEmptyName = 0;
  let sheetsFound = 0;

  Object.entries(GAME_SHEETS).forEach(([gameKey, sheetName]) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    sheetsFound++;

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    const headers = data[0];
    const idx = {};
    headers.forEach((h, i) => { idx[String(h)] = i; });

    // Fallback: if header names are not standard, use known column positions
    // name | grade | class | id | mode | mode_name | score | max_combo | total_questions | accuracy | timestamp
    const iName = (idx.name != null) ? idx.name : 0;
    const iGrade = (idx.grade != null) ? idx.grade : 1;
    const iClass = (idx.class != null) ? idx.class : 2;
    const iId = (idx.id != null) ? idx.id : 3;
    const iScore = (idx.score != null) ? idx.score : 6;
    const iMaxCombo = (idx.max_combo != null) ? idx.max_combo : 7;
    const iAccuracy = (idx.accuracy != null) ? idx.accuracy : 9;
    const iTimestamp = (idx.timestamp != null) ? idx.timestamp : 10;

    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      scanned++;

      const name = _normText(row[iName]);
      if (!name) {
        skippedEmptyName++;
        continue;
      }

      const grade = _toInt(row[iGrade], 0);
      const klass = _normText(row[iClass]);
      const sid = _normText(row[iId]);
      const score = _toInt(row[iScore], 0);
      const accuracy = Math.max(0, Math.min(100, _toInt(row[iAccuracy], 0)));
      const maxCombo = _toInt(row[iMaxCombo], 0);
      const ts = _normText(row[iTimestamp]) || nowTs;

      const dedupKey = _profileDedupKey({
        game: gameKey,
        name,
        grade,
        class: klass,
        id: sid,
        score,
        accuracy,
        max_combo: maxCombo,
        timestamp: ts
      });

      if (existingSet.has(dedupKey)) {
        skippedDuplicate++;
        continue;
      }

      existingSet.add(dedupKey);
      toAppend.push([
        name,
        String(grade),
        klass,
        sid,
        gameKey,
        score,
        accuracy,
        maxCombo,
        1,    // level: 舊資料無法推算，先給預設值
        0,    // exp
        0,    // total_played
        0,    // cleared
        0,    // fc_count
        0,    // ap_count
        ts
      ]);
    }
  });

  // 3) 批次寫入 PROFILE
  if (toAppend.length > 0) {
    profileSheet.getRange(profileSheet.getLastRow() + 1, 1, toAppend.length, PROFILE_COLUMNS.length)
      .setValues(toAppend);
  }

  const summary = {
    ok: true,
    sheets_found: sheetsFound,
    scanned,
    imported: toAppend.length,
    skipped_duplicate: skippedDuplicate,
    skipped_empty_name: skippedEmptyName,
    profile_total_rows: profileSheet.getLastRow() - 1
  };
  Logger.log(JSON.stringify(summary));
  return summary;
}

// ── 第二個函式：由 PROFILE 歷史列重建累積統計 ───────────────────
// 說明：此函式會依 PROFILE 目前列順序，為每位學生重算：
// level / exp / total_played / cleared / fc_count / ap_count。
// 建議在 backfillProfileFromGameSheets() 之後執行一次。

function _expForLevelGAS(lvl) {
  return lvl * 100;
}

function _expGainFromRow(score, accuracy) {
  return Math.floor(50 + (score / 10) + (accuracy >= 90 ? 30 : (accuracy >= 70 ? 15 : 0)));
}

function _addExpGAS(state, gain) {
  state.exp += gain;
  while (state.exp >= _expForLevelGAS(state.level)) {
    state.exp -= _expForLevelGAS(state.level);
    state.level++;
  }
}

function rebuildProfileStatsFromHistory() {
  const sheet = getProfileSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    const emptySummary = { ok: true, rows: 0, updated: 0 };
    Logger.log(JSON.stringify(emptySummary));
    return emptySummary;
  }

  const perStudent = {};
  const updates = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const name = _normText(r[0]);
    const grade = _normText(r[1]);
    const klass = _normText(r[2]);
    const sid = _normText(r[3]);
    const key = [name, grade, klass, sid].join('|');

    if (!name) {
      // 空名稱不更新統計，保持原值
      updates.push([r[8], r[9], r[10], r[11], r[12], r[13]]);
      continue;
    }

    if (!perStudent[key]) {
      perStudent[key] = {
        level: 1,
        exp: 0,
        totalPlayed: 0,
        cleared: 0,
        fcCount: 0,
        apCount: 0
      };
    }

    const s = perStudent[key];
    const score = _toInt(r[5], 0);
    const accuracy = Math.max(0, Math.min(100, _toInt(r[6], 0)));

    s.totalPlayed++;
    if (accuracy >= 60) s.cleared++;

    // 舊資料缺少 hitCounts，這裡以 100% 準確率近似視為 FC/AP
    if (accuracy === 100) {
      s.fcCount++;
      s.apCount++;
    }

    _addExpGAS(s, _expGainFromRow(score, accuracy));

    updates.push([
      s.level,
      s.exp,
      s.totalPlayed,
      s.cleared,
      s.fcCount,
      s.apCount
    ]);
  }

  // 覆寫 PROFILE 的 level/exp/total_played/cleared/fc/ap 六個欄位
  sheet.getRange(2, 9, updates.length, 6).setValues(updates);

  const summary = {
    ok: true,
    rows: data.length - 1,
    updated: updates.length,
    students: Object.keys(perStudent).length
  };
  Logger.log(JSON.stringify(summary));
  return summary;
}
