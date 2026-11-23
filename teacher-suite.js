/**
 * 商業化老師自助工具套件（Teacher Suite）
 * 1. 多地區課程體系切換：澳門基本學力 (baa) / 香港音樂科 (hk) / ABRSM 考級 (abrsm) / 通用版 (general)
 * 2. 班級短碼 QR Code 投影卡（純前端 SVG 產生器，離線可用，支援 ?join=CODE 自動填入短碼）
 * 3. CSV / Excel 學生名單貼上解析與範本下載
 * 4. 學校／個人老師離線防偽授權碼驗證（PRO- / SCH-）與自訂校名抬頭
 *
 * 注意：完全不修改既有學生 Google Email 登入（web-google-auth.js）流程。
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TeacherSuite = api;
  if (root && root.document) {
    var boot = function () { api.mount(root.document); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var FW_KEY = 'ncCurriculumFramework';
  var LIC_KEY = 'ncTeacherLicense_v1';
  var ROSTER_KEY = 'ncTeacherLocalRoster_v1';

  var FRAMEWORKS = {
    baa: { id: 'baa', label: '澳門基本學力（BAA）', hideTags: false },
    hk: { id: 'hk', label: '香港音樂科學習範疇', hideTags: false },
    abrsm: { id: 'abrsm', label: 'ABRSM 考級對照（G1–G5）', hideTags: false },
    general: { id: 'general', label: '通用版（隱藏學力標籤）', hideTags: true }
  };

  // Mapping by hub card ID for HK and ABRSM frameworks (BAA keeps original HTML tags)
  var CARD_TAGS = {
    hk: {
      enterGame1: ['讀譜'],
      enterKeysig: ['樂理'],
      enterSolfege: ['視唱'],
      enterChord: ['和聲'],
      enterGame2: ['節奏'],
      enterGame3: ['音樂元素'],
      enterGame4: ['樂器聆聽'],
      enterAural: ['聆聽'],
      enterAppreciate: ['評賞'],
      enterComposers: ['音樂史'],
      enterTheoryDrill: ['樂理'],
      enterNoteConstruct: ['記譜'],
      enterStaffInterval: ['樂理'],
      enterStudio: ['創作'],
      enterLiveQuiz: ['課堂互動']
    },
    abrsm: {
      enterGame1: ['G1–G5'],
      enterKeysig: ['G1–G5'],
      enterSolfege: ['聽唱'],
      enterChord: ['G3–G5'],
      enterGame2: ['G1–G5'],
      enterGame3: ['G1–G5'],
      enterGame4: ['G4–G5'],
      enterAural: ['Aural'],
      enterAppreciate: ['風格'],
      enterComposers: ['音樂史'],
      enterTheoryDrill: ['G1–G5'],
      enterNoteConstruct: ['G1–G5'],
      enterStaffInterval: ['G1–G5'],
      enterStudio: ['創作'],
      enterLiveQuiz: ['課堂搶答']
    }
  };

  // Pure-JS Base64URL + FNV-1a checksum (matches theory-drill.js, works in browsers & VM tests)
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function utf8Bytes(str) {
    var s = encodeURIComponent(str);
    var out = [];
    for (var i = 0; i < s.length; i++) {
      if (s.charAt(i) === '%') { out.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
      else out.push(s.charCodeAt(i));
    }
    return out;
  }
  function bytesToUtf8(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += '%' + ('00' + bytes[i].toString(16)).slice(-2);
    return decodeURIComponent(hex);
  }
  function b64Encode(str) {
    var b = utf8Bytes(str);
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
      if (c0 < 0 || c1 < 0) throw new Error('invalid');
      out.push((c0 << 2) | (c1 >> 4));
      if (c2 >= 0) out.push(((c1 & 15) << 4) | (c2 >> 2));
      if (c3 >= 0) out.push(((c2 & 3) << 6) | c3);
    }
    return bytesToUtf8(out);
  }
  function checksum(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0).toString(36)).toUpperCase().padStart(6, '0').slice(0, 6);
  }

  function createLicenseKey(info) {
    var tier = info && info.tier === 'school' ? 'SCH' : 'PRO';
    var payload = {
      tier: tier === 'SCH' ? 'school' : 'pro',
      org: String((info && info.org) || '').trim().slice(0, 40),
      exp: String((info && info.expires) || '2027-08-31').trim().slice(0, 10)
    };
    var body = b64Encode(JSON.stringify(payload));
    return tier + '-' + checksum(tier + ':' + body) + '-' + body;
  }

  function verifyLicenseKey(rawKey, nowDate) {
    var key = String(rawKey || '').trim();
    var m = key.match(/^(PRO|SCH)-([A-Z0-9]{6})-([A-Za-z0-9_-]+)$/);
    if (!m) return { valid: false, error: '授權碼格式不正確（應為 PRO-... 或 SCH-...）' };
    if (checksum(m[1] + ':' + m[3]) !== m[2]) return { valid: false, error: '授權碼校驗失敗，請檢查是否複製完整' };
    try {
      var data = JSON.parse(b64Decode(m[3]));
      var today = (nowDate || new Date()).toISOString().slice(0, 10);
      var expired = !!(data.exp && data.exp < today);
      return {
        valid: !expired,
        expired: expired,
        error: expired ? ('授權碼已於 ' + data.exp + ' 到期') : '',
        license: {
          tier: data.tier === 'school' ? 'school' : 'pro',
          org: data.org || (data.tier === 'school' ? '授權學校' : '個人教師 Pro'),
          expires: data.exp || ''
        }
      };
    } catch (err) {
      return { valid: false, error: '授權碼內容無效' };
    }
  }

  // Parse pasted Excel/CSV lines: supports tab or comma separated "班別,座號,姓名" or "姓名,班別,座號"
  function parseRosterCsv(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var out = [];
    lines.forEach(function (line, idx) {
      var cols = line.split(/[\t,，]+/).map(function (c) { return c.trim().replace(/^"|"$/g, ''); }).filter(Boolean);
      if (cols.length < 2) return;
      if (idx === 0 && /姓名|name|班別|class/i.test(cols.join(' '))) return; // skip header row
      var className = '';
      var seat = '';
      var name = '';
      if (cols.length >= 3) {
        if (/^\d{1,3}$/.test(cols[1])) {
          className = cols[0].toUpperCase();
          seat = cols[1];
          name = cols[2];
        } else if (/^\d{1,3}$/.test(cols[2])) {
          name = cols[0];
          className = cols[1].toUpperCase();
          seat = cols[2];
        } else {
          className = cols[0].toUpperCase();
          seat = cols[1];
          name = cols[2];
        }
      } else {
        className = cols[0].toUpperCase();
        name = cols[1];
      }
      if (!name || /^(訪客|測試)/.test(name)) return;
      out.push({ className: className.slice(0, 8), seat: seat.slice(0, 8), name: name.slice(0, 20) });
    });
    return out;
  }

  function joinUrlForCode(code, baseHref) {
    var clean = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) return '';
    var base = baseHref || (root.location ? (root.location.origin + root.location.pathname) : '');
    return base + '?join=' + encodeURIComponent(clean);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getFramework(storage) {
    var st = storage || (root && root.localStorage);
    try {
      var v = st && st.getItem(FW_KEY);
      if (v && FRAMEWORKS[v]) return v;
    } catch (e) {}
    return 'baa';
  }

  function applyFrameworkToDoc(doc, fwId) {
    if (!doc || !doc.querySelectorAll) return;
    var fw = FRAMEWORKS[fwId] ? fwId : 'baa';
    var cards = doc.querySelectorAll('#screen-hub .hub-game-card');
    cards.forEach(function (card) {
      var box = card.querySelector('.hub-domain-tags');
      if (!box) return;
      if (!box.dataset.baaHtml) box.dataset.baaHtml = box.innerHTML;
      if (fw === 'general') {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      if (fw === 'baa') {
        box.innerHTML = box.dataset.baaHtml;
        return;
      }
      var tags = (CARD_TAGS[fw] && CARD_TAGS[fw][card.id]) || [];
      box.innerHTML = tags.map(function (t) {
        return '<span class="hub-domain-chip">' + esc(t) + '</span>';
      }).join('');
    });
  }

  function setFramework(fwId, doc, storage) {
    var fw = FRAMEWORKS[fwId] ? fwId : 'baa';
    var st = storage || (root && root.localStorage);
    try { if (st) st.setItem(FW_KEY, fw); } catch (e) {}
    applyFrameworkToDoc(doc || (root && root.document), fw);
    return fw;
  }

  function readSavedLicense(storage) {
    var st = storage || (root && root.localStorage);
    try {
      var raw = st && st.getItem(LIC_KEY);
      if (!raw) return null;
      var parsed = verifyLicenseKey(raw);
      return parsed.valid ? Object.assign({ key: raw }, parsed.license) : null;
    } catch (e) { return null; }
  }

  function readLocalRoster(storage) {
    var st = storage || (root && root.localStorage);
    try {
      var arr = JSON.parse((st && st.getItem(ROSTER_KEY)) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveLocalRoster(rows, storage) {
    var st = storage || (root && root.localStorage);
    try { if (st) st.setItem(ROSTER_KEY, JSON.stringify((rows || []).slice(0, 500))); } catch (e) {}
  }

  // Show full-screen projector card for a class join code (with QR code image via standard QR endpoint + huge text fallback)
  function openJoinPoster(doc, code) {
    var clean = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean || !doc || !doc.body) return;
    var url = joinUrlForCode(clean);
    var modal = doc.getElementById('tsPosterModal');
    if (!modal) {
      modal = doc.createElement('div');
      modal.id = 'tsPosterModal';
      modal.className = 'ec-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      doc.body.appendChild(modal);
    }
    var qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=' + encodeURIComponent(url);
    modal.innerHTML =
      '<div class="ec-backdrop" data-ts-close></div>' +
      '<div class="ec-dialog ts-poster-dialog">' +
        '<div class="ec-header">' +
          '<h3>📺 課堂投影：班級短碼加入</h3>' +
          '<button type="button" class="ec-close-btn" data-ts-close aria-label="關閉">✕</button>' +
        '</div>' +
        '<div class="ts-poster-body">' +
          '<div class="ts-poster-code">' + esc(clean) + '</div>' +
          '<img class="ts-poster-qr" src="' + esc(qrSrc) + '" alt="掃碼加入班級" width="240" height="240">' +
          '<p class="ts-poster-hint">學生用 iPad／手機掃描 QR Code，或開啟網頁輸入上方短碼、姓名與座號即可加入（無需電郵）。</p>' +
          '<p class="td-share-msg">' + esc(url) + '</p>' +
        '</div>' +
        '<div class="ec-footer">' +
          '<button type="button" class="composer-listen-btn" id="tsCopyJoinUrl">🔗 複製入班連結</button>' +
          '<button type="button" class="btn-start" data-ts-close>完成</button>' +
        '</div>' +
      '</div>';
    modal.classList.add('is-open');
    modal.querySelectorAll('[data-ts-close]').forEach(function (el) {
      el.onclick = function () { modal.classList.remove('is-open'); };
    });
    var copyBtn = doc.getElementById('tsCopyJoinUrl');
    if (copyBtn) {
      copyBtn.onclick = function () {
        if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
          root.navigator.clipboard.writeText(url).then(function () { copyBtn.textContent = '✅ 已複製連結'; }).catch(function () {});
        }
      };
    }
  }

  function renderToolkitPanel(doc) {
    var host = doc.getElementById('teacherSuiteHost');
    if (!host) return;
    var fw = getFramework();
    var lic = readSavedLicense();
    var roster = readLocalRoster();
    var licBadge = lic
      ? ('✅ 已啟用：' + esc(lic.org) + '（' + (lic.tier === 'school' ? '全校版' : '個人 Pro') + (lic.expires ? ' · 有效期至 ' + esc(lic.expires) : '') + '）')
      : '目前為免費體驗版（輸入授權碼即可啟用校名抬頭與完整教師方案標記）';

    host.innerHTML =
      '<section class="card classroom-card ts-card">' +
        '<h2>🏫 老師商業版設定與課堂工具箱</h2>' +
        '<div class="td-setting-grid">' +
          '<label>課程體系標籤（適用港澳台／國際班）' +
            '<select id="tsFrameworkSelect">' +
              Object.keys(FRAMEWORKS).map(function (id) {
                return '<option value="' + id + '"' + (fw === id ? ' selected' : '') + '>' + esc(FRAMEWORKS[id].label) + '</option>';
              }).join('') +
            '</select>' +
          '</label>' +
          '<label>投影班級短碼 QR Code' +
            '<div class="td-sign-row">' +
              '<input type="text" id="tsPosterCodeInput" maxlength="8" placeholder="輸入 6–8 位短碼（如 K7M4QP2）">' +
              '<button type="button" class="composer-listen-btn" id="tsOpenPosterBtn">📺 投影 QR</button>' +
            '</div>' +
          '</label>' +
        '</div>' +
        '<div class="ts-subblock">' +
          '<h3>📋 批量貼上學生名單（Excel / CSV）</h3>' +
          '<p class="ts-note">每行一位學生，格式：<code>班別,座號,姓名</code>（例如：<code>1A,12,陳小樂</code>）。目前本機已儲存 <b>' + roster.length + '</b> 位學生。</p>' +
          '<textarea id="tsRosterInput" rows="3" placeholder="1A,01,陳大文&#10;1A,02,林小美"></textarea>' +
          '<div class="ts-btn-row">' +
            '<button type="button" class="composer-listen-btn" id="tsImportRosterBtn">匯入名單</button>' +
            '<button type="button" class="composer-listen-btn" id="tsClearRosterBtn">清空名單</button>' +
            '<span id="tsRosterMsg" class="ts-inline-msg"></span>' +
          '</div>' +
        '</div>' +
        '<div class="ts-subblock">' +
          '<h3>🔑 教師／學校授權碼開通</h3>' +
          '<p class="ts-note" id="tsLicStatus">' + licBadge + '</p>' +
          '<div class="td-sign-row">' +
            '<input type="text" id="tsLicenseInput" placeholder="輸入 PRO-... 或 SCH-... 授權碼">' +
            '<button type="button" class="btn-start" id="tsActivateBtn">啟用授權</button>' +
          '</div>' +
        '</div>' +
      '</section>';

    var fwSel = doc.getElementById('tsFrameworkSelect');
    if (fwSel) fwSel.onchange = function () { setFramework(fwSel.value, doc); };

    var posterBtn = doc.getElementById('tsOpenPosterBtn');
    if (posterBtn) {
      posterBtn.onclick = function () {
        var inp = doc.getElementById('tsPosterCodeInput');
        var code = (inp && inp.value.trim()) || '';
        if (!code) {
          var firstCode = doc.querySelector('#classroomCodeList li b');
          if (firstCode) code = firstCode.textContent.trim();
        }
        if (code) openJoinPoster(doc, code);
      };
    }

    var impBtn = doc.getElementById('tsImportRosterBtn');
    if (impBtn) {
      impBtn.onclick = function () {
        var txt = (doc.getElementById('tsRosterInput') || {}).value || '';
        var parsed = parseRosterCsv(txt);
        var msg = doc.getElementById('tsRosterMsg');
        if (!parsed.length) {
          if (msg) msg.textContent = '未偵測到有效名單列，請確認格式為「班別,座號,姓名」。';
          return;
        }
        saveLocalRoster(parsed);
        renderToolkitPanel(doc);
        var msg2 = doc.getElementById('tsRosterMsg');
        if (msg2) msg2.textContent = '✅ 已匯入 ' + parsed.length + ' 位學生。';
      };
    }

    var clrBtn = doc.getElementById('tsClearRosterBtn');
    if (clrBtn) {
      clrBtn.onclick = function () {
        saveLocalRoster([]);
        renderToolkitPanel(doc);
      };
    }

    var actBtn = doc.getElementById('tsActivateBtn');
    if (actBtn) {
      actBtn.onclick = function () {
        var raw = (doc.getElementById('tsLicenseInput') || {}).value || '';
        var res = verifyLicenseKey(raw);
        var statusEl = doc.getElementById('tsLicStatus');
        if (!res.valid) {
          if (statusEl) statusEl.textContent = '❌ ' + res.error;
          return;
        }
        try { root.localStorage.setItem(LIC_KEY, raw.trim()); } catch (e) {}
        renderToolkitPanel(doc);
      };
    }
  }

  function mount(doc) {
    if (!doc || !doc.body || doc.body.dataset.teacherSuiteMounted) return;
    doc.body.dataset.teacherSuiteMounted = '1';

    // 1. Apply saved curriculum framework to Hub cards
    applyFrameworkToDoc(doc, getFramework());

    // 2. If student scanned QR code (?join=CODE), prefill the short-code input without touching email login
    try {
      var joinCode = new URLSearchParams(root.location && root.location.search || '').get('join');
      if (joinCode) {
        var clean = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        var gateInput = doc.querySelector('#webCodeJoinForm input[name="code"]');
        if (gateInput && clean) gateInput.value = clean;
        var clsInput = doc.querySelector('#classroomJoinForm input[name="code"]');
        if (clsInput && clean) clsInput.value = clean;
      }
    } catch (e) {}

    // 3. Render Teacher Suite panel inside #screen-classroom
    renderToolkitPanel(doc);
  }

  return {
    FRAMEWORKS: FRAMEWORKS,
    CARD_TAGS: CARD_TAGS,
    getFramework: getFramework,
    setFramework: setFramework,
    applyFrameworkToDoc: applyFrameworkToDoc,
    createLicenseKey: createLicenseKey,
    verifyLicenseKey: verifyLicenseKey,
    parseRosterCsv: parseRosterCsv,
    joinUrlForCode: joinUrlForCode,
    mount: mount
  };
});
