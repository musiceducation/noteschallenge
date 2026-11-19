/**
 * Web-only Google sign-in for the classroom hub.
 * Native Capacitor builds keep using auth.js (Firebase / Apple) and ignore this gate.
 *
 * Config: window.MUSIC_APP_AUTH.googleClientId and .authApiBase
 * Session: localStorage ncWebGoogleSession (HMAC JWT from the Cloudflare worker).
 */
(function () {
  'use strict';

  var SESSION_KEY = 'ncWebGoogleSession';
  var CODE_KEY = 'ncCodeSession';
  var cfg = window.MUSIC_APP_AUTH || {};
  var state = {
    required: false,
    ready: false,
    signedIn: false,
    user: null,
    binding: null,
    token: '',
    tester: false
  };
  var bindingKey = '';

  function isNative() {
    try {
      var C = window.Capacitor;
      if (C && typeof C.isNativePlatform === 'function' && C.isNativePlatform()) return true;
      if (C && typeof C.getPlatform === 'function' && C.getPlatform() !== 'web') return true;
    } catch (e) {}
    try {
      if (new URLSearchParams(location.search).get('app') === '1') return true;
      if (localStorage.getItem('forceAppShell') === '1') return true;
    } catch (e) {}
    return false;
  }

  function isLocalHost() {
    var host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  function stubMode() {
    if (!isLocalHost()) return false;
    try { return new URLSearchParams(location.search).get('stubAuth') === '1'; }
    catch (e) { return false; }
  }

  function apiBase() {
    var base = cfg.authApiBase || '';
    if (isLocalHost()) {
      try {
        var q = new URLSearchParams(location.search).get('authApi');
        if (q) base = q;
      } catch (e) {}
    }
    return String(base || '').replace(/\/$/, '');
  }

  function clientId() {
    var id = String(cfg.googleClientId || '').trim();
    if (!id || id.indexOf('YOUR_GOOGLE') === 0) return '';
    return id;
  }

  function showGate() {
    document.documentElement.classList.add('web-auth-pending');
  }

  function hideGate() {
    document.documentElement.classList.remove('web-auth-pending');
  }

  function setError(msg) {
    var el = document.getElementById('webGoogleAuthError');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); }
    catch (e) {}
  }

  function notifySession() {
    emit('webgoogle:session', {
      signedIn: state.signedIn,
      user: state.user,
      binding: state.binding
    });
  }

  function text(v) {
    if (v == null) return '';
    return String(v).trim();
  }

  function num(v) {
    var n = typeof v === 'number' ? v : (typeof v === 'string' && String(v).trim() !== '' ? Number(v) : NaN);
    if (!isFinite(n) || n < 0) return 0;
    return n;
  }

  function plain(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return v;
  }

  // Same numeric-max rules as mergeProfiles() in cloudflare/noteschallenge-auth/worker.js.
  function mergeProfiles(existing, incoming) {
    var a = plain(existing);
    var b = plain(incoming);
    var statKeys = ['totalPlayed', 'cleared', 'totalScore', 'totalAccuracy', 'accuracyCount', 'maxCombo', 'fcCount', 'apCount'];
    var diffKeys = ['easy', 'normal', 'hard', 'expert'];
    var statsA = plain(a.stats);
    var statsB = plain(b.stats);
    var bestA = plain(a.gameBests);
    var bestB = plain(b.gameBests);
    var diffA = plain(a.diffClears);
    var diffB = plain(b.diffClears);
    var stats = {};
    var gameBests = {};
    var diffClears = {};
    var seen = {};
    var history = [];
    statKeys.forEach(function (k) { stats[k] = Math.max(num(statsA[k]), num(statsB[k])); });
    Object.keys(bestA).concat(Object.keys(bestB)).forEach(function (k) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(k)) return;
      gameBests[k] = Math.max(num(bestA[k]), num(bestB[k]));
    });
    diffKeys.forEach(function (k) { diffClears[k] = Math.max(num(diffA[k]), num(diffB[k])); });
    [a.history, b.history].forEach(function (list) {
      if (!Array.isArray(list)) return;
      list.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        var row = {
          date: text(item.date).slice(0, 40),
          game: text(item.game).slice(0, 20),
          score: num(item.score),
          accuracy: Math.min(100, num(item.accuracy)),
          maxCombo: num(item.maxCombo)
        };
        var id = [row.date, row.game, row.score, row.accuracy, row.maxCombo].join('|');
        if (seen[id]) return;
        seen[id] = 1;
        history.push(row);
      });
    });
    var regA = text(a.registeredAt);
    var regB = text(b.registeredAt);
    var level = Math.max(num(a.level), num(b.level));
    return {
      name: text(b.name) || text(a.name),
      grade: num(b.grade) || num(a.grade),
      class: text(b.class) || text(a.class),
      seat: text(b.seat) || text(a.seat),
      avatar: text(b.avatar) || text(a.avatar) || '🎵',
      signature: text(b.signature) || text(a.signature),
      registeredAt: regA && regB ? (regA < regB ? regA : regB) : (regA || regB),
      totalPlayTime: Math.max(num(a.totalPlayTime), num(b.totalPlayTime)),
      level: level > 0 ? level : 1,
      exp: Math.max(num(a.exp), num(b.exp)),
      stats: stats,
      diffClears: diffClears,
      gameBests: gameBests,
      history: history.slice(-30)
    };
  }

  function profileKey(profile) {
    if (!profile || !profile.name) return '';
    return 'musicGameProfile_' + profile.grade + '_' + profile.class + '_' + profile.name;
  }

  function readLocalProfile(profile) {
    var key = profileKey(profile);
    if (!key) return null;
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function publishProfile(profile) {
    if (!profile || !profile.name) return;
    var key = profileKey(profile);
    try { if (key) localStorage.setItem(key, JSON.stringify(profile)); } catch (e) {}
    emit('webgoogle:profile', { profile: profile });
  }

  function api(method, path, body) {
    var base = apiBase();
    if (!base) return Promise.reject(new Error('missing authApiBase'));
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    return fetch(base + path, {
      method: method,
      headers: headers,
      body: body == null ? undefined : JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.ok === false) {
          var err = new Error((data && data.error) || ('HTTP ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  var ROSTER_DENIED = '呢個 Google 帳號未在學生名單入面。請用學校電郵（@cskphc.edu.mo）登入，或聯絡老師。';

  function authFailure(err) {
    if (err && err.message === 'not_on_roster') return ROSTER_DENIED;
    return '登入未成功，請再試一次。（' + (err && err.message ? err.message : '網絡') + '）';
  }

  function bindingKeyOf(binding) {
    if (!binding || !binding.name) return '';
    return String(binding.grade) + '|' + String(binding.class) + '|' + String(binding.name);
  }

  function adopt(data, token) {
    state.token = token || state.token;
    state.user = data.user || null;
    state.binding = data.binding || null;
    state.signedIn = !!(state.user && state.user.sub);
    bindingKey = bindingKeyOf(state.binding);
    if (state.token) {
      try { localStorage.setItem(SESSION_KEY, state.token); } catch (e) {}
    }
    hideGate();
    setError('');
    notifySession();
    reconcileProfile(data.profile || null);
    startPresence();
  }

  function reconcileProfile(remote) {
    var binding = state.binding;
    var identity = binding && binding.name ? {
      name: binding.name,
      grade: parseInt(binding.grade, 10) || 0,
      class: binding.class || '',
      seat: binding.seat || ''
    } : null;
    var local = identity ? readLocalProfile(identity) : null;
    if (local && local.seat && !identity.seat) identity.seat = local.seat;
    var merged = mergeProfiles(remote || {}, local || {});
    if (identity) {
      merged.name = identity.name;
      merged.grade = identity.grade || merged.grade;
      merged.class = identity.class || merged.class;
      if (identity.seat) merged.seat = identity.seat;
    }
    if (!merged.name) return;
    publishProfile(merged);
    if (state.tester) return;
    api('PUT', '/me/profile', { data: merged }).then(function (data) {
      if (!data.profile) return;
      var current = identity ? readLocalProfile(identity) : null;
      var next = mergeProfiles(data.profile, current || {});
      if (identity && identity.seat) next.seat = identity.seat;
      if (identity) {
        next.name = identity.name;
        next.grade = identity.grade || next.grade;
        next.class = identity.class || next.class;
      }
      publishProfile(next);
    }).catch(function () {});
  }

  var TESTER_FLAG = 'ncTesterSession';
  var PRESENCE_ID = 'ncPresenceId';
  var presenceTimer = 0;
  var lastScreen = '';

  function screenLabel(screenId) {
    var map = {
      'screen-hub': '大廳',
      'screen-profile': '檔案',
      'screen-presence': '在線同紀錄',
      'screen-leaderboard': '排行榜',
      'screen-setup': '音名',
      'screen-game': '音名作答',
      'screen-g2-setup': '節奏',
      'screen-g3-setup': '術語',
      'screen-game3': '術語作答',
      'screen-g4-setup': '樂器',
      'screen-game4': '樂器作答',
      'screen-note-teach': '看圖學習',
      'screen-chord-card': '和弦',
      'screen-staff-interval': '看譜辨音程',
      'screen-aural': '聽力',
      'screen-aural-interval': '音程聽辨',
      'screen-aural-rhythm': '節奏聽寫',
      'screen-aural-quality': '和弦色彩'
    };
    return map[screenId] || '大廳';
  }

  function presenceClientId() {
    var id = '';
    try { id = sessionStorage.getItem(PRESENCE_ID) || ''; } catch (e) {}
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
      id = 't' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      id = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
      try { sessionStorage.setItem(PRESENCE_ID, id); } catch (e) {}
    }
    return id;
  }

  function currentScreenLabel() {
    var active = document.querySelector('.screen.active');
    return screenLabel(active && active.id);
  }

  function pingPresence() {
    if (!state.signedIn || !apiBase()) return;
    var screen = currentScreenLabel();
    var body = { screen: screen };
    var headers = { 'Content-Type': 'application/json' };
    if (state.tester) {
      body.kind = 'tester';
      body.clientId = presenceClientId();
    } else if (state.token) {
      headers.Authorization = 'Bearer ' + state.token;
    } else {
      return;
    }
    fetch(apiBase() + '/presence', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    }).catch(function () {});
  }

  function setPresenceDot(on) {
    var btn = document.getElementById('hubPresenceBtn');
    if (btn) btn.classList.toggle('is-online', !!on);
  }

  function startPresence() {
    if (presenceTimer) clearInterval(presenceTimer);
    pingPresence();
    presenceTimer = setInterval(pingPresence, 45000);
    setPresenceDot(true);
  }

  function clearSession() {
    var token = state.token;
    var wasTester = state.tester;
    state.signedIn = false;
    state.user = null;
    state.binding = null;
    state.token = '';
    state.tester = false;
    if (token && !wasTester) emit('webgoogle:presence-stop', { token: token });
    bindingKey = '';
    lastScreen = '';
    if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = 0; }
    setPresenceDot(false);
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(CODE_KEY); } catch (e) {}
    try { sessionStorage.removeItem(TESTER_FLAG); } catch (e) {}
    showGate();
    notifySession();
  }

  function enterTester() {
    state.tester = true;
    state.token = '';
    state.user = { sub: 'tester', email: '', name: '測試人員' };
    state.binding = { grade: '', class: '', name: '測試人員', seat: '', role: 'tester' };
    state.signedIn = true;
    bindingKey = '';
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(CODE_KEY); } catch (e) {}
    try { sessionStorage.setItem(TESTER_FLAG, '1'); } catch (e) {}
    hideGate();
    setError('');
    notifySession();
    startPresence();
  }

  function exchange(credential) {
    setError('');
    return api('POST', '/auth/google', { credential: credential }).then(function (data) {
      adopt(data, data.token);
    }).catch(function (err) {
      setError(authFailure(err));
    });
  }

  var gsiStarted = false;
  function renderGoogleButton() {
    var host = document.getElementById('webGoogleBtn');
    var stubBtn = document.getElementById('webGoogleStubBtn');
    var id = clientId();
    if (stubMode() && stubBtn) {
      stubBtn.hidden = false;
      stubBtn.onclick = function () { exchange('stub'); };
    }
    if (!id) {
      if (!stubMode()) setError('登入尚未設定。請老師把 Google Client ID 填入 auth-config.js 的 googleClientId。');
      return;
    }
    if (gsiStarted) return;
    gsiStarted = true;
    var script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=zh-TW';
    script.async = true;
    script.onload = function () {
      try {
        window.google.accounts.id.initialize({
          client_id: id,
          callback: function (resp) {
            if (resp && resp.credential) exchange(resp.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true
        });
        if (host) {
          window.google.accounts.id.renderButton(host, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'pill',
            logo_alignment: 'left',
            locale: 'zh_TW',
            width: 280
          });
        }
      } catch (e) {
        setError('Google 登入按鈕載入失敗，請重新整理。');
      }
    };
    script.onerror = function () {
      setError('載入唔到 Google 登入，請檢查網絡再試。');
    };
    document.head.appendChild(script);
  }

  function stubAuto() {
    if (!stubMode()) return false;
    try { return new URLSearchParams(location.search).get('stubAuto') === '1'; }
    catch (e) { return false; }
  }

  function bindTesterButton() {
    var btn = document.getElementById('webTesterBtn');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () { enterTester(); });
  }

  function restore() {
    bindTesterButton();
    var testerFlag = '';
    try { testerFlag = sessionStorage.getItem(TESTER_FLAG) || ''; } catch (e) {}
    var token = '';
    try { token = localStorage.getItem(SESSION_KEY) || ''; } catch (e) {}
    if (testerFlag === '1' && !token) {
      state.ready = true;
      enterTester();
      return;
    }
    if (!token || !apiBase()) {
      var codeRaw = '';
      try { codeRaw = localStorage.getItem(CODE_KEY) || ''; } catch (e) {}
      if (codeRaw) {
        try { if (adoptCodeSession(JSON.parse(codeRaw), false)) return; } catch (e) {}
      }
      state.ready = true;
      showGate();
      renderGoogleButton();
      if (!apiBase() && !stubMode()) setError('登入尚未設定。請老師填入 auth-config.js 的 authApiBase。');
      notifySession();
      if (stubAuto()) exchange('stub');
      return;
    }
    state.token = token;
    api('GET', '/me').then(function (data) {
      state.ready = true;
      adopt(data, token);
    }).catch(function (err) {
      state.ready = true;
      try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
      state.token = '';
      state.signedIn = false;
      showGate();
      renderGoogleButton();
      if (err && err.message === 'not_on_roster') setError(ROSTER_DENIED);
      notifySession();
      if (stubAuto()) exchange('stub');
    });
  }

  function saveBinding(binding) {
    if (state.tester) return Promise.resolve(state.binding);
    var key = bindingKeyOf(binding);
    if (!state.signedIn || !key || key === bindingKey) return Promise.resolve(state.binding);
    var previous = bindingKey;
    bindingKey = key;
    return api('PUT', '/me/binding', {
      grade: binding.grade,
      class: binding.class,
      name: binding.name
    }).then(function (data) {
      state.binding = data.binding || binding;
      if (data.user) state.user = data.user;
      bindingKey = bindingKeyOf(state.binding);
      return state.binding;
    }).catch(function (err) {
      bindingKey = previous;
      throw err;
    });
  }

  function syncProfile(profile) {
    if (state.tester || !state.signedIn || !profile) return Promise.resolve(null);
    return api('PUT', '/me/profile', { data: profile }).then(function (data) {
      return data.profile || null;
    });
  }

  function adoptCodeSession(data, persist) {
    if (!data || !data.token || !data.binding || data.binding.role !== 'code') return false;
    if (!text(data.binding.name) || !text(data.binding.class)) return false;
    state.tester = false;
    state.token = data.token;
    state.user = { email: '', name: data.binding.name, student_name: data.binding.name };
    state.binding = data.binding;
    state.signedIn = true;
    state.ready = true;
    if (persist !== false) {
      try {
        localStorage.setItem(CODE_KEY, JSON.stringify({
          token: data.token,
          binding: data.binding,
          schoolId: data.schoolId || ''
        }));
      } catch (e) {}
    }
    hideGate();
    setError('');
    notifySession();
    return true;
  }

  window.WebGoogleAuth = {
    get required() { return state.required; },
    get ready() { return state.ready; },
    get signedIn() { return state.signedIn; },
    get tester() { return state.tester; },
    get token() { return state.tester ? '' : state.token; },
    get user() { return state.user; },
    get binding() { return state.binding; },
    signOut: function () { clearSession(); renderGoogleButton(); },
    noteScreen: function (screenId) {
      var label = screenLabel(screenId);
      if (!state.signedIn || label === lastScreen) return;
      lastScreen = label;
      pingPresence();
    },
    loadPresence: function () {
      if (!apiBase()) return Promise.resolve({ online: [], log: [] });
      return fetch(apiBase() + '/presence', { method: 'GET' }).then(function (res) {
        return res.json();
      }).then(function (data) {
        return { online: (data && data.online) || [], log: (data && data.log) || [] };
      }).catch(function () { return { online: [], log: [] }; });
    },
    saveBinding: saveBinding,
    syncProfile: syncProfile,
    adoptCodeSession: adoptCodeSession,
    mergeProfiles: mergeProfiles
  };

  if (isNative()) {
    state.required = false;
    state.ready = true;
    hideGate();
    return;
  }

  state.required = true;
  showGate();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restore);
  } else {
    restore();
  }
})();
