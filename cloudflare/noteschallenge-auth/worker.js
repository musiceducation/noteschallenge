/**
 * noteschallenge web auth worker.
 * ES module, no imports. Deploy this file as-is via the Cloudflare API or wrangler.
 *
 * Env:
 *   DB                     D1 binding
 *   GOOGLE_CLIENT_ID       Web OAuth client id (must match the ID token aud)
 *   JWT_SECRET             HMAC secret for session tokens
 *   ALLOWED_EMAIL_DOMAINS  optional comma list of school domains; empty = any verified Google account
 *   EXTRA_ALLOWED_EMAILS   optional comma list of exact emails (teacher accounts). Not a domain.
 *   EXTRA_ALLOWED_EMAIL_SCHOOLS  optional email=schoolId pairs. Unset extras stay on cskphc.
 *   DEFAULT_SCHOOL_ID      optional. Unset means cskphc, the first tenant (cskphc.edu.mo).
 * Do not set NOW in production. Deploy later with keep_bindings so secrets stay.
 */

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
const JWKS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SEC = 60;
const PROFILE_MAX_CHARS = 200000;
const PRESENCE_IDLE_MS = 3 * 60 * 1000;
export const DEFAULT_SCHOOL_ID = 'cskphc';
export const DEFAULT_SCHOOL_DOMAIN = 'cskphc.edu.mo';
const JOIN_EMAIL_HOST = 'join.invalid';
const JOIN_LIMIT = 8;
const JOIN_WINDOW_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const joinHits = new Map();
export function clearJoinLimits() {
  joinHits.clear();
}

const STAT_KEYS = ['totalPlayed', 'cleared', 'totalScore', 'totalAccuracy', 'accuracyCount', 'maxCombo', 'fcCount', 'apCount'];
const DIFF_KEYS = ['easy', 'normal', 'hard', 'expert'];

let jwksCache = { exp: 0, keys: null };

export function clearJwksCache() {
  jwksCache = { exp: 0, keys: null };
}

function bytesToB64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function jsonB64url(obj) {
  return bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)));
}

function decodeJsonB64url(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

function text(v) {
  if (v == null) return '';
  return String(v).trim();
}

function num(v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function plainObject(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return v;
}

function earlier(x, y) {
  const xs = text(x);
  const ys = text(y);
  if (xs && ys) return xs < ys ? xs : ys;
  return xs || ys || '';
}

function mergeHistory(a, b) {
  const out = [];
  const seen = new Set();
  [a, b].forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      const row = {
        date: text(item.date).slice(0, 40),
        game: text(item.game).slice(0, 40),
        score: num(item.score),
        accuracy: Math.min(100, num(item.accuracy)),
        maxCombo: num(item.maxCombo)
      };
      if (item.challenge === true || item.challenge === false) row.challenge = item.challenge === true;
      if (item.practice === true || item.practice === false) row.practice = item.practice === true;
      if (text(item.at)) row.at = text(item.at).slice(0, 40);
      if (text(item.difficulty)) row.difficulty = text(item.difficulty).slice(0, 40);
      const id = [row.date, row.game, row.score, row.accuracy, row.maxCombo].join('|');
      if (seen.has(id)) return;
      seen.add(id);
      out.push(row);
    });
  });
  return out.slice(-30);
}

/** Keep the higher numeric bests. Incoming non-empty text wins; empty incoming does not wipe stored text. */
export function mergeProfiles(existing, incoming) {
  const a = plainObject(existing);
  const b = plainObject(incoming);
  const statsA = plainObject(a.stats);
  const statsB = plainObject(b.stats);
  const bestA = plainObject(a.gameBests);
  const bestB = plainObject(b.gameBests);
  const diffA = plainObject(a.diffClears);
  const diffB = plainObject(b.diffClears);
  const stats = {};
  STAT_KEYS.forEach((k) => { stats[k] = Math.max(num(statsA[k]), num(statsB[k])); });
  const gameBests = {};
  Object.keys(bestA).concat(Object.keys(bestB)).forEach((k) => {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(k)) return;
    gameBests[k] = Math.max(num(bestA[k]), num(bestB[k]));
  });
  const diffClears = {};
  DIFF_KEYS.forEach((k) => { diffClears[k] = Math.max(num(diffA[k]), num(diffB[k])); });
  const level = Math.max(num(a.level), num(b.level));
  return {
    name: text(b.name) || text(a.name),
    grade: num(b.grade) || num(a.grade),
    class: text(b.class) || text(a.class),
    seat: text(b.seat) || text(a.seat),
    avatar: text(b.avatar) || text(a.avatar) || '🎵',
    signature: text(b.signature) || text(a.signature),
    registeredAt: earlier(a.registeredAt, b.registeredAt),
    totalPlayTime: Math.max(num(a.totalPlayTime), num(b.totalPlayTime)),
    level: level > 0 ? level : 1,
    exp: Math.max(num(a.exp), num(b.exp)),
    stats: stats,
    diffClears: diffClears,
    gameBests: gameBests,
    history: mergeHistory(a.history, b.history)
  };
}

function emailDomainOk(email, raw) {
  const list = String(raw || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  const domain = text(email).split('@')[1] || '';
  return list.indexOf(domain.toLowerCase()) !== -1;
}

export function extraEmailOk(email, raw) {
  const want = text(email).toLowerCase();
  if (!want || want.indexOf('@') === -1) return false;
  const list = String(raw || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.indexOf(want) !== -1;
}

export function teacherBinding(claims) {
  const name = text(claims && claims.name).slice(0, 40) || '老師';
  return { grade: '', class: '', name: name, seat: '', role: 'teacher' };
}

export function rowSchool(row) {
  return text(row && row.school_id) || DEFAULT_SCHOOL_ID;
}

export function allowListFor(env, domainRows) {
  const base = String((env && env.ALLOWED_EMAIL_DOMAINS) || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!base.length) return '';
  const extra = (domainRows || []).map((row) => text(row && row.domain).toLowerCase()).filter(Boolean);
  return Array.from(new Set(base.concat(extra))).join(',');
}

export function extraSchoolMap(raw) {
  const out = {};
  String(raw || '').split(',').forEach((part) => {
    const bits = part.split('=');
    const email = text(bits[0]).toLowerCase();
    const schoolId = text(bits[1]);
    if (email && schoolId && /^[a-z0-9]{2,32}$/.test(schoolId)) out[email] = schoolId;
  });
  return out;
}

export function schoolForAccount(email, domainRows, env) {
  const domain = text(email).split('@')[1].toLowerCase();
  const rows = Array.isArray(domainRows) ? domainRows : [];
  for (let i = 0; i < rows.length; i++) {
    if (text(rows[i] && rows[i].domain).toLowerCase() === domain && text(rows[i].school_id)) return text(rows[i].school_id);
  }
  if (extraEmailOk(email, env && env.EXTRA_ALLOWED_EMAILS)) {
    const mapped = extraSchoolMap(env && env.EXTRA_ALLOWED_EMAIL_SCHOOLS)[text(email).toLowerCase()];
    if (mapped) return mapped;
  }
  return text(env && env.DEFAULT_SCHOOL_ID) || DEFAULT_SCHOOL_ID;
}

async function loadSchoolDomains(db) {
  try {
    const loaded = await db.prepare('SELECT domain, school_id FROM school_domains').all();
    return (loaded && loaded.results) || [];
  } catch (e) {
    return [];
  }
}

async function importRsa(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

async function loadJwks(fetchImpl, nowMs) {
  if (jwksCache.keys && jwksCache.exp > nowMs) return jwksCache.keys;
  const res = await fetchImpl(GOOGLE_JWKS_URL);
  if (!res || !res.ok) throw new Error('jwks fetch failed');
  const body = await res.json();
  const keys = body && Array.isArray(body.keys) ? body.keys : [];
  jwksCache = { exp: nowMs + JWKS_TTL_MS, keys: keys };
  return keys;
}

/**
 * Verify a Google ID token (RS256) against Google's JWKS.
 * opts: { clientId, allowedDomains, fetch, now, jwks }
 */
export async function verifyGoogleIdToken(credential, opts) {
  opts = opts || {};
  const nowMs = typeof opts.now === 'function' ? opts.now() : Date.now();
  const token = text(credential);
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 20000) return { ok: false, error: 'malformed token' };
  let header;
  let payload;
  try {
    header = decodeJsonB64url(parts[0]);
    payload = decodeJsonB64url(parts[1]);
  } catch (e) {
    return { ok: false, error: 'malformed token' };
  }
  if (!header || header.alg !== 'RS256' || (header.typ && header.typ !== 'JWT')) {
    return { ok: false, error: 'unsupported alg' };
  }
  const keys = Array.isArray(opts.jwks) ? opts.jwks : await loadJwks(opts.fetch || fetch, nowMs);
  const candidates = keys.filter((k) => k && k.kty === 'RSA' && (!header.kid || k.kid === header.kid));
  if (!candidates.length) return { ok: false, error: 'unknown signing key' };
  const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  let sig;
  try { sig = b64urlToBytes(parts[2]); } catch (e) { return { ok: false, error: 'malformed signature' }; }
  let valid = false;
  for (let i = 0; i < candidates.length; i++) {
    try {
      const key = await importRsa(candidates[i]);
      if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data)) { valid = true; break; }
    } catch (e) {}
  }
  if (!valid) return { ok: false, error: 'bad signature' };

  const nowSec = Math.floor(nowMs / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SEC < nowSec) return { ok: false, error: 'expired' };
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec + CLOCK_SKEW_SEC) return { ok: false, error: 'not yet valid' };
  const iss = payload.iss;
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') return { ok: false, error: 'bad issuer' };
  const clientId = text(opts.clientId);
  if (!clientId) return { ok: false, error: 'server missing client id' };
  const audOk = Array.isArray(payload.aud) ? payload.aud.indexOf(clientId) !== -1 : payload.aud === clientId;
  if (!audOk) return { ok: false, error: 'bad audience' };
  if (payload.email_verified !== true && payload.email_verified !== 'true') return { ok: false, error: 'email not verified' };
  const email = text(payload.email).toLowerCase();
  const sub = text(payload.sub);
  if (!sub || !email || email.indexOf('@') === -1) return { ok: false, error: 'missing identity' };
  if (!emailDomainOk(email, opts.allowedDomains) && !extraEmailOk(email, opts.extraEmails)) {
    return { ok: false, error: 'email domain not allowed' };
  }
  return {
    ok: true,
    claims: {
      sub: sub,
      email: email,
      name: text(payload.name).slice(0, 80),
      picture: text(payload.picture).slice(0, 500)
    }
  };
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSessionToken(claims, secret, nowMs) {
  const nowSec = Math.floor((nowMs == null ? Date.now() : nowMs) / 1000);
  const header = jsonB64url({ alg: 'HS256', typ: 'JWT' });
  const payload = {
    sub: claims.sub,
    email: claims.email,
    iat: nowSec,
    exp: nowSec + SESSION_TTL_SEC
  };
  if (claims.kind === 'code') {
    payload.kind = 'code';
    payload.schoolId = text(claims.schoolId);
    payload.grade = text(claims.grade);
    payload.class = text(claims.class);
    payload.name = text(claims.name).slice(0, 20);
    payload.seat = text(claims.seat).slice(0, 8);
  }
  const body = jsonB64url(payload);
  const data = header + '.' + body;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return data + '.' + bytesToB64url(sig);
}

export async function verifySessionToken(token, secret, nowMs) {
  const parts = text(token).split('.');
  if (parts.length !== 3 || !secret) return null;
  let header;
  let payload;
  try {
    header = decodeJsonB64url(parts[0]);
    payload = decodeJsonB64url(parts[1]);
  } catch (e) {
    return null;
  }
  if (!header || header.alg !== 'HS256') return null;
  let sig;
  try { sig = b64urlToBytes(parts[2]); } catch (e) { return null; }
  const key = await hmacKey(secret);
  const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const ok = await crypto.subtle.verify('HMAC', key, sig, data);
  if (!ok) return null;
  const nowSec = Math.floor((nowMs == null ? Date.now() : nowMs) / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < nowSec) return null;
  if (!text(payload.sub) || !text(payload.email)) return null;
  const session = { sub: text(payload.sub), email: text(payload.email).toLowerCase() };
  if (payload.kind === 'code') {
    session.kind = 'code';
    session.schoolId = text(payload.schoolId);
    session.grade = text(payload.grade);
    session.class = text(payload.class);
    session.name = text(payload.name);
    session.seat = text(payload.seat);
  }
  return session;
}

export function allowedOrigin(origin) {
  const o = text(origin);
  if (o === 'https://musiceducation.github.io') return o;
  if (o === 'https://noteschallenge.vercel.app') return o;
  if (/^http:\/\/localhost(?::\d+)?$/.test(o)) return o;
  if (/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(o)) return o;
  if (o === 'https://localhost' || o === 'capacitor://localhost' || o === 'ionic://localhost') return o;
  return '';
}

function corsHeaders(request) {
  const allow = allowedOrigin(request.headers.get('Origin') || '');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (allow) headers['Access-Control-Allow-Origin'] = allow;
  return headers;
}

function jsonResponse(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors)
  });
}

function bindingFromRoster(roster) {
  if (!roster || !text(roster.student_name) || !text(roster.grade) || !text(roster.class)) return null;
  const grade = schoolGrade(roster.grade) || String(roster.grade).trim();
  const klass = schoolClass(roster.class, grade) || String(roster.class).trim().toUpperCase();
  return {
    grade: grade,
    class: klass,
    name: String(roster.student_name).trim(),
    seat: text(roster.seat)
  };
}

function publicUser(row) {
  const email = text(row.email);
  const hidden = email.endsWith('@' + JOIN_EMAIL_HOST);
  return {
    sub: row.sub,
    email: hidden ? '' : email,
    name: row.name || '',
    picture: row.picture || '',
    grade: row.grade || '',
    class: row.class || '',
    student_name: row.student_name || ''
  };
}

async function readJson(request) {
  const raw = await request.text();
  if (!raw) return {};
  if (raw.length > PROFILE_MAX_CHARS + 1000) throw new Error('body too large');
  return JSON.parse(raw);
}

function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : '';
}

async function findRoster(db, email) {
  const key = text(email).toLowerCase();
  try {
    return await db.prepare(
      'SELECT email, grade, class, student_name, seat, school_id FROM roster WHERE lower(email) = lower(?)'
    ).bind(key).first();
  } catch (e) {
    return db.prepare(
      'SELECT email, grade, class, student_name, seat FROM roster WHERE lower(email) = lower(?)'
    ).bind(key).first();
  }
}

async function allRoster(db) {
  try {
    return await db.prepare('SELECT email, grade, class, student_name, seat, school_id FROM roster').all();
  } catch (e) {
    return db.prepare('SELECT email, grade, class, student_name, seat FROM roster').all();
  }
}

async function getUser(db, sub) {
  return db.prepare(
    'SELECT sub, email, name, picture, grade, class, student_name, created_at, last_login FROM users WHERE sub = ?'
  ).bind(sub).first();
}

async function applyIdentity(db, claims, binding, nowIso) {
  const existing = await getUser(db, claims.sub);
  const created = existing && existing.created_at ? existing.created_at : nowIso;
  await db.prepare(
    'INSERT INTO users (sub, email, name, picture, grade, class, student_name, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture, grade = excluded.grade, class = excluded.class, student_name = excluded.student_name, last_login = excluded.last_login'
  ).bind(
    claims.sub,
    text(claims.email).toLowerCase(),
    claims.name || '',
    claims.picture || '',
    binding.grade || '',
    binding.class || '',
    binding.name,
    created,
    nowIso
  ).run();
  return getUser(db, claims.sub);
}

async function applyRoster(db, claims, roster, nowIso) {
  const binding = bindingFromRoster(roster);
  if (!binding) throw new Error('incomplete roster row');
  return applyIdentity(db, claims, binding, nowIso);
}

async function readProfile(db, sub) {
  const row = await db.prepare('SELECT data FROM profiles WHERE sub = ?').bind(sub).first();
  if (!row || !row.data) return null;
  try {
    const parsed = JSON.parse(row.data);
    return plainObject(parsed);
  } catch (e) {
    return null;
  }
}

async function writeProfile(db, sub, profile, nowIso) {
  const data = JSON.stringify(profile);
  await db.prepare(
    'INSERT INTO profiles (sub, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(sub) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  ).bind(sub, data, nowIso).run();
}

export function settlePresence(rows, logs, entry, nowMs, idleMs) {
  const idle = idleMs || PRESENCE_IDLE_MS;
  const nowIso = new Date(nowMs).toISOString();
  const kept = [];
  (rows || []).forEach((row) => {
    const seen = Date.parse(row.last_seen);
    if (!Number.isFinite(seen) || nowMs - seen > idle) {
      logs.push({
        presence_id: row.id,
        kind: row.kind,
        display_name: row.display_name,
        class_label: row.class_label || '',
        event: 'offline',
        screen: row.screen || '',
        at: row.last_seen || nowIso
      });
      return;
    }
    kept.push(row);
  });
  if (entry && entry.id) {
    const prev = kept.find((row) => row.id === entry.id);
    if (!prev) {
      kept.push({
        id: entry.id,
        kind: entry.kind,
        display_name: entry.displayName,
        class_label: entry.classLabel || '',
        screen: entry.screen || '',
        last_seen: nowIso,
        online_at: nowIso
      });
      logs.push({
        presence_id: entry.id,
        kind: entry.kind,
        display_name: entry.displayName,
        class_label: entry.classLabel || '',
        event: 'online',
        screen: entry.screen || '',
        at: nowIso
      });
    } else {
      if ((prev.screen || '') !== (entry.screen || '')) {
        logs.push({
          presence_id: entry.id,
          kind: entry.kind,
          display_name: entry.displayName,
          class_label: entry.classLabel || '',
          event: 'screen',
          screen: entry.screen || '',
          at: nowIso
        });
      }
      prev.kind = entry.kind;
      prev.display_name = entry.displayName;
      prev.class_label = entry.classLabel || '';
      prev.screen = entry.screen || '';
      prev.last_seen = nowIso;
    }
  }
  return kept;
}

function publicOnline(rows) {
  return rows.filter((row) => row.kind !== 'classmate').map((row) => ({
    name: row.display_name,
    classLabel: row.class_label || '',
    kind: row.kind
  }));
}

function publicLog(logs) {
  return logs.filter((row) => row.kind !== 'classmate').slice(-80).reverse().map((row) => ({
    name: row.display_name,
    classLabel: row.class_label || '',
    kind: row.kind,
    event: row.event,
    screen: row.screen || '',
    at: row.at
  }));
}

function classLabelFor(binding, role) {
  if (role === 'teacher') return '老師';
  if (role === 'tester') return '';
  const grade = text(binding && binding.grade);
  const klass = text(binding && binding.class);
  if (!klass) return '';
  const gradeNames = { '1': '中一', '2': '中二', '3': '中三', '4': '中四', '5': '中五', '6': '中六' };
  const gradeLabel = gradeNames[grade] || '';
  return (gradeLabel ? gradeLabel + ' ' : '') + klass + '班';
}

async function loadPresence(db) {
  const online = await db.prepare('SELECT id, kind, display_name, class_label, screen, last_seen, online_at FROM presence').all();
  const logs = await db.prepare('SELECT presence_id, kind, display_name, class_label, event, screen, at FROM presence_log').all();
  return {
    rows: (online && online.results) || [],
    logs: (logs && logs.results) || []
  };
}

async function savePresence(db, rows, logs, previousLogCount) {
  await db.prepare('DELETE FROM presence').run();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    await db.prepare(
      'INSERT INTO presence (id, kind, display_name, class_label, screen, last_seen, online_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(row.id, row.kind, row.display_name, row.class_label || '', row.screen || '', row.last_seen, row.online_at).run();
  }
  const fresh = logs.slice(previousLogCount);
  for (let i = 0; i < fresh.length; i++) {
    const row = fresh[i];
    await db.prepare(
      'INSERT INTO presence_log (presence_id, kind, display_name, class_label, event, screen, at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(row.presence_id, row.kind, row.display_name, row.class_label || '', row.event, row.screen || '', row.at).run();
  }
}

async function resolveAccount(env, row, schoolId) {
  const wanted = schoolId || DEFAULT_SCHOOL_ID;
  const roster = await findRoster(env.DB, row.email);
  const rosterBinding = roster && rowSchool(roster) === wanted ? bindingFromRoster(roster) : null;
  if (rosterBinding) return { binding: rosterBinding, roster: roster, teacher: false, schoolId: wanted };
  if (extraEmailOk(row.email, env.EXTRA_ALLOWED_EMAILS) && schoolForAccount(row.email, await loadSchoolDomains(env.DB), env) === wanted) {
    return { binding: teacherBinding({ name: row.student_name || row.name }), roster: null, teacher: true, schoolId: wanted };
  }
  return null;
}

async function requireSession(request, env) {
  const session = await verifySessionToken(bearer(request), env.JWT_SECRET);
  if (!session) return { error: jsonResponse({ ok: false, error: 'unauthorized' }, 401, corsHeaders(request)) };
  const row = await getUser(env.DB, session.sub);
  if (!row || text(row.email).toLowerCase() !== session.email) {
    return { error: jsonResponse({ ok: false, error: 'unauthorized' }, 401, corsHeaders(request)) };
  }
  return { session: session, row: row };
}

const CLASS_BLOCKED = { '訪客': 1, '測試人員': 1, '__guest__': 1, '__other__': 1 };
const GRADE_WORDS = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6' };

// School roster rows use F1–F6, 中一–中六, or 1–6. Class sharing only compares the form number.
export function schoolGrade(value) {
  const raw = text(value).replace(/\s+/g, '').replace(/\.$/, '');
  if (/^[1-6]$/.test(raw)) return raw;
  let match = /^F[.\-]?([1-6])$/i.exec(raw) || /^S([1-6])$/i.exec(raw) || /^FORM([1-6])$/i.exec(raw);
  if (match) return match[1];
  match = /^中([1-6一二三四五六])$/.exec(raw);
  if (match) return GRADE_WORDS[match[1]] || match[1];
  return '';
}

export function schoolClass(value, grade) {
  const form = schoolGrade(grade);
  let raw = text(value).replace(/\s+/g, '').replace(/班$/u, '').toUpperCase();
  if (!raw) return '';
  let match = /^(?:F|S)?([1-6])([A-Z])$/.exec(raw);
  if (match && (!form || match[1] === form)) return match[2];
  match = /^中([1-6一二三四五六])([A-Z])$/.exec(raw);
  if (match) {
    const n = GRADE_WORDS[match[1]] || match[1];
    if (!form || n === form) return match[2];
  }
  if (/^[A-Z0-9]{1,8}$/.test(raw)) return raw;
  return '';
}

export function classIdentity(body) {
  const src = plainObject(body);
  if (text(src.kind) === 'tester' || src.tester === true || src.guest === true) return null;
  const name = text(src.name).slice(0, 20);
  const grade = schoolGrade(src.grade);
  const klass = schoolClass(src.class, grade);
  const seat = text(src.seat || src.id).slice(0, 8);
  if (!/^[1-6]$/.test(grade)) return null;
  if (!/^[A-Z0-9]{1,8}$/.test(klass)) return null;
  if (!name || CLASS_BLOCKED[name] || name.indexOf('訪客') === 0) return null;
  if (/[|%]/.test(name) || /[|%]/.test(seat)) return null;
  return { name: name, grade: grade, class: klass, seat: seat };
}

function clockMs(env) {
  const stamped = env && Number(env.NOW);
  return Number.isFinite(stamped) && stamped > 0 ? stamped : Date.now();
}

function claimedIdentityMismatch(body, id) {
  const src = plainObject(body);
  if (text(src.name) && text(src.name) !== id.name) return true;
  if (text(src.class) && schoolClass(src.class, id.grade) !== id.class) return true;
  if (text(src.grade) && schoolGrade(src.grade) !== String(id.grade)) return true;
  const claimedSeat = text(src.seat || src.id);
  if (claimedSeat && claimedSeat !== id.seat) return true;
  if (text(src.kind) === 'tester' || src.tester === true || src.guest === true) return true;
  return false;
}

function classKey(id) {
  return id.grade + '|' + id.class + '|' + id.name + '|' + id.seat;
}

function classSub(id, schoolId) {
  const school = schoolId || DEFAULT_SCHOOL_ID;
  if (school === DEFAULT_SCHOOL_ID) return 'class:' + classKey(id);
  return 'class:' + school + ':' + classKey(id);
}

function codeClassSub(id, schoolId) {
  return 'class:code:' + (schoolId || DEFAULT_SCHOOL_ID) + ':' + classKey(id);
}

function classSubSchool(sub) {
  const rest = text(sub).slice('class:'.length);
  if (rest.indexOf('code:') === 0) {
    const bits = rest.slice('code:'.length).split(':');
    return { schoolId: bits[0] || DEFAULT_SCHOOL_ID, coded: true, key: bits.slice(1).join(':') };
  }
  const split = /^([a-z0-9]{2,32}):(.+)$/.exec(rest);
  if (split && split[2].indexOf('|') !== -1 && split[1] !== DEFAULT_SCHOOL_ID) {
    return { schoolId: split[1], coded: false, key: split[2] };
  }
  return { schoolId: DEFAULT_SCHOOL_ID, coded: false, key: rest };
}

function classAvatar(value) {
  const s = text(value);
  if (!s) return '';
  if (s.indexOf('data:image/jpeg;base64,') === 0) {
    if (s.length > 80000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s)) return null;
    return s;
  }
  if (s.indexOf('data:') === 0) return null;
  return s.slice(0, 16);
}

function publicClassCard(profile, id) {
  const who = id || classIdentity(profile);
  if (!who) return null;
  const avatar = classAvatar(profile && profile.avatar);
  return {
    name: who.name,
    grade: who.grade,
    class: who.class,
    seat: who.seat,
    avatar: avatar || '🎵',
    signature: text(profile && profile.signature).slice(0, 30)
  };
}

async function listClassCards(db, grade, klass, schoolId) {
  const wanted = schoolId || DEFAULT_SCHOOL_ID;
  const loaded = await db.prepare('SELECT sub, data FROM profiles WHERE sub LIKE ?').bind('class:%').all();
  const cards = [];
  ((loaded && loaded.results) || []).forEach((row) => {
    if (!row || text(row.sub).indexOf('class:') !== 0) return;
    if (classSubSchool(row.sub).schoolId !== wanted) return;
    let parsed = null;
    try { parsed = JSON.parse(row.data); } catch (e) { parsed = null; }
    const card = publicClassCard(parsed);
    if (!card) return;
    if (grade && card.grade !== String(grade)) return;
    if (klass && card.class !== klass) return;
    cards.push(card);
  });
  return cards;
}

function matchClassCard(cards, id) {
  const same = (cards || []).filter((card) => card && card.name === id.name && card.grade === id.grade && card.class === id.class);
  const wanted = text(id.seat);
  for (let i = 0; i < same.length; i++) {
    if (wanted && text(same[i].seat) === wanted) return same[i];
  }
  return same.length === 1 ? same[0] : null;
}

function publicBits(profile) {
  const avatar = classAvatar(profile && profile.avatar);
  return {
    avatar: avatar || '🎵',
    signature: text(profile && profile.signature).slice(0, 30)
  };
}

async function listClassDirectory(db, grade, klass, schoolId) {
  const wanted = schoolId || DEFAULT_SCHOOL_ID;
  const rosterLoaded = await allRoster(db);
  const rosterRows = ((rosterLoaded && rosterLoaded.results) || []).filter((row) => {
    if (rowSchool(row) !== wanted) return false;
    const g = schoolGrade(row && row.grade);
    const c = schoolClass(row && row.class, g);
    if (!g || !c) return false;
    if (grade && g !== String(grade)) return false;
    if (klass && c !== klass) return false;
    return true;
  });
  const usersLoaded = await db.prepare('SELECT sub, email, student_name FROM users').all();
  const byEmail = {};
  ((usersLoaded && usersLoaded.results) || []).forEach((row) => {
    const email = text(row && row.email).toLowerCase();
    if (email && text(row.sub).indexOf('class:') !== 0) byEmail[email] = row;
  });
  const profilesLoaded = await db.prepare('SELECT sub, data FROM profiles').all();
  const profileBySub = {};
  ((profilesLoaded && profilesLoaded.results) || []).forEach((row) => {
    if (!row || !row.sub || text(row.sub).indexOf('class:') === 0) return;
    try { profileBySub[row.sub] = JSON.parse(row.data); } catch (e) { profileBySub[row.sub] = null; }
  });
  const posted = await listClassCards(db, grade, klass, wanted);
  const cards = [];
  rosterRows.forEach((row) => {
    const g = schoolGrade(row.grade);
    const c = schoolClass(row.class, g);
    const id = classIdentity({
      name: row.student_name,
      grade: g,
      class: c,
      seat: row.seat
    });
    if (!id) return;
    const card = matchClassCard(posted, id);
    let bits = card ? { avatar: card.avatar || '🎵', signature: text(card.signature).slice(0, 30) } : null;
    if (!bits) {
      const user = byEmail[text(row.email).toLowerCase()];
      const stored = user ? profileBySub[user.sub] : null;
      if (stored && (!text(stored.name) || text(stored.name) === id.name)) bits = publicBits(stored);
    }
    if (!bits) bits = { avatar: '🎵', signature: '' };
    cards.push({
      name: id.name,
      grade: id.grade,
      class: id.class,
      seat: id.seat,
      avatar: bits.avatar || '🎵',
      signature: bits.signature || ''
    });
  });
  const seen = {};
  cards.forEach((card) => { seen[card.grade + '|' + card.class + '|' + card.name + '|' + card.seat] = 1; });
  posted.forEach((card) => {
    const key = card.grade + '|' + card.class + '|' + card.name + '|' + card.seat;
    if (seen[key]) return;
    seen[key] = 1;
    cards.push(card);
  });
  cards.sort((a, b) => String(a.grade).localeCompare(String(b.grade)) || String(a.class).localeCompare(String(b.class)) || ((parseInt(a.seat, 10) || 999) - (parseInt(b.seat, 10) || 999)) || a.name.localeCompare(b.name, 'zh'));
  return cards;
}

function boardQueryFilter(url) {
  const rawGrade = text(url.searchParams.get('grade'));
  const rawClass = text(url.searchParams.get('class'));
  if (!rawGrade && !rawClass) return { grade: '', class: '' };
  const grade = rawGrade ? schoolGrade(rawGrade) : '';
  if (rawGrade && !grade) return { error: 'bad_filter' };
  const klass = rawClass ? schoolClass(rawClass, grade) : '';
  if (rawClass && !klass) return { error: 'bad_filter' };
  return { grade: grade, class: klass };
}

async function classBoardReader(request, env, url) {
  const gate = await requireSession(request, env);
  if (gate.error) return gate;
  const domains = await loadSchoolDomains(env.DB);
  if (gate.session.kind === 'code') {
    const id = classIdentity({
      name: gate.session.name,
      grade: gate.session.grade,
      class: gate.session.class,
      seat: gate.session.seat
    });
    if (!id || !gate.session.schoolId) return { error: jsonResponse({ ok: false, error: 'not_on_roster' }, 403, corsHeaders(request)) };
    return { id: id, filter: { grade: id.grade, class: id.class }, teacher: false, schoolId: gate.session.schoolId, code: true };
  }
  const schoolId = schoolForAccount(gate.row.email, domains, env);
  const account = await resolveAccount(env, gate.row, schoolId);
  if (!account) return { error: jsonResponse({ ok: false, error: 'not_on_roster' }, 403, corsHeaders(request)) };
  const filter = boardQueryFilter(url);
  if (filter.error) return { error: jsonResponse({ ok: false, error: filter.error }, 400, corsHeaders(request)) };
  if (account.teacher) return { filter: filter, teacher: true, schoolId: schoolId };
  const id = classIdentity(account.binding);
  if (!id) return { error: jsonResponse({ ok: false, error: 'not_on_roster' }, 403, corsHeaders(request)) };
  return { id: id, filter: filter, teacher: false, schoolId: schoolId };
}

function presencePlace(row) {
  const label = text(row && row.class_label).split('|');
  const grade = schoolGrade(label[0] || '');
  const klass = schoolClass(label[1] || '', grade);
  return { grade: grade, class: klass };
}

function presenceSeat(row) {
  const parts = text(row && (row.id || row.presence_id)).split('|');
  return parts.length >= 4 ? parts.slice(3).join('|') : '';
}

function presenceSchool(row) {
  const label = text(row && row.class_label).split('|');
  return label[2] || DEFAULT_SCHOOL_ID;
}

function inBoardFilter(place, grade, klass) {
  if (!place.grade || !place.class) return false;
  if (grade && place.grade !== String(grade)) return false;
  if (klass && place.class !== klass) return false;
  return true;
}

function classOnline(rows, cards, grade, klass, schoolId) {
  const wanted = schoolId || DEFAULT_SCHOOL_ID;
  rows = (rows || []).filter((row) => presenceSchool(row) === wanted);
  const byKey = {};
  cards.forEach((card) => { byKey[card.grade + '|' + card.class + '|' + card.name + '|' + card.seat] = card; });
  return rows.filter((row) => row && row.kind === 'classmate' && inBoardFilter(presencePlace(row), grade, klass)).map((row) => {
    const place = presencePlace(row);
    const name = row.display_name;
    const seat = presenceSeat(row);
    const card = byKey[place.grade + '|' + place.class + '|' + name + '|' + seat] || null;
    return {
      name: name,
      grade: place.grade,
      class: place.class,
      seat: card ? card.seat : seat,
      screen: row.screen || '',
      avatar: card ? card.avatar : '🎵',
      signature: card ? card.signature : ''
    };
  }).filter((row) => classIdentity(row));
}

function classLog(logs, grade, klass, schoolId) {
  const wanted = schoolId || DEFAULT_SCHOOL_ID;
  return logs.filter((row) => row && row.kind === 'classmate' && presenceSchool(row) === wanted && inBoardFilter(presencePlace(row), grade, klass)).slice(-80).reverse().map((row) => {
    const place = presencePlace(row);
    return {
      name: row.display_name,
      grade: place.grade,
      class: place.class,
      seat: presenceSeat(row),
      event: row.event,
      screen: row.screen || '',
      at: row.at
    };
  }).filter((row) => classIdentity(row));
}

async function enrolledClassStudent(request, env) {
  const gate = await requireSession(request, env);
  if (gate.error) return gate;
  if (gate.session.kind === 'code') {
    const id = classIdentity({
      name: gate.session.name,
      grade: gate.session.grade,
      class: gate.session.class,
      seat: gate.session.seat
    });
    if (!id || !gate.session.schoolId) return { error: jsonResponse({ ok: false, error: 'not_on_roster' }, 403, corsHeaders(request)) };
    return { id: id, schoolId: gate.session.schoolId, code: true };
  }
  const domains = await loadSchoolDomains(env.DB);
  const schoolId = schoolForAccount(gate.row.email, domains, env);
  const roster = await findRoster(env.DB, gate.row.email);
  if (!roster || rowSchool(roster) !== schoolId) {
    return { error: jsonResponse({ ok: false, error: 'not_on_roster' }, 403, corsHeaders(request)) };
  }
  const binding = bindingFromRoster(roster);
  const id = binding && classIdentity(binding);
  if (!id) return { error: jsonResponse({ ok: false, error: 'not_on_roster' }, 403, corsHeaders(request)) };
  return { id: id, schoolId: schoolId, code: false };
}

async function saveClassCard(db, id, body, schoolId, coded) {
  if (claimedIdentityMismatch(body, id)) return { error: 'forbidden', status: 403 };
  const avatar = classAvatar(body && body.avatar);
  if (avatar == null) return { error: 'avatar too large', status: 400 };
  const sub = coded ? codeClassSub(id, schoolId) : classSub(id, schoolId);
  const existing = await readProfile(db, sub) || {};
  const stored = {
    name: id.name,
    grade: id.grade,
    class: id.class,
    seat: id.seat,
    avatar: avatar || classAvatar(existing.avatar) || '🎵',
    signature: text(body && body.signature) ? text(body.signature).slice(0, 30) : text(existing.signature).slice(0, 30)
  };
  const packed = JSON.stringify(stored);
  if (packed.length > PROFILE_MAX_CHARS) return { error: 'avatar too large', status: 400 };
  await writeProfile(db, sub, stored, new Date().toISOString());
  return { card: publicClassCard(stored, id) };
}

function presenceIdFor(id, schoolId) {
  if (!schoolId || schoolId === DEFAULT_SCHOOL_ID) return 'mate:' + classKey(id);
  return 'mate:' + schoolId + ':' + classKey(id);
}

function classLabelForStudent(id, schoolId) {
  return id.grade + '|' + id.class + '|' + (schoolId || DEFAULT_SCHOOL_ID);
}

function dropOwnPresence(rows, logs, id, nowIso, schoolId) {
  const presenceId = presenceIdFor(id, schoolId);
  const kept = [];
  (rows || []).forEach((row) => {
    if (!row || row.id !== presenceId) { kept.push(row); return; }
    logs.push({
      presence_id: row.id,
      kind: row.kind,
      display_name: row.display_name,
      class_label: row.class_label || '',
      event: 'offline',
      screen: row.screen || '',
      at: nowIso
    });
  });
  return kept;
}

const ASSIGNABLE = {
  game1: ['classic60', 'bass60', 'mixed60', 'noMiss'],
  keysig: ['keysig60'],
  solfege: ['solfege60'],
  chord: [],
  game2: ['easy', 'medium', 'hard'],
  game3: ['easy', 'medium', 'hard'],
  game4: [],
  aural: [],
  appreciate: []
};

const RECORD_CHANNELS = {
  'A-1': ['口語', '實作'],
  'A-2': ['口語', '實作'],
  'A-3': ['實作'],
  'A-4': ['實作'],
  'B-5': ['口語', '檔案']
};

function newId(prefix) {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return prefix + bytesToB64url(bytes);
}

function randomCode(length) {
  const n = length === 6 || length === 8 ? length : 7;
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < n; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

async function bumpJoinLimit(db, key, nowMs) {
  const mem = joinHits.get(key) || { hits: 0, start: nowMs };
  if (nowMs - mem.start > JOIN_WINDOW_MS) {
    mem.hits = 0;
    mem.start = nowMs;
  }
  mem.hits += 1;
  joinHits.set(key, mem);
  let hits = mem.hits;
  try {
    const row = await db.prepare('SELECT key, hits, window_start FROM join_limits WHERE key = ?').bind(key).first();
    let stored = row ? Number(row.hits) || 0 : 0;
    let start = row && row.window_start ? Date.parse(row.window_start) : nowMs;
    if (!row || !Number.isFinite(start) || nowMs - start > JOIN_WINDOW_MS) {
      stored = 1;
      start = nowMs;
    } else {
      stored += 1;
    }
    const startIso = new Date(start).toISOString();
    if (row) {
      await db.prepare('UPDATE join_limits SET hits = ?, window_start = ? WHERE key = ?').bind(stored, startIso, key).run();
    } else {
      await db.prepare('INSERT INTO join_limits (key, hits, window_start) VALUES (?, ?, ?)').bind(key, stored, startIso).run();
    }
    if (stored > hits) hits = stored;
  } catch (e) { /* memory window still applies before the table exists */ }
  return hits <= JOIN_LIMIT;
}

async function classActor(request, env) {
  const gate = await requireSession(request, env);
  if (gate.error) return gate;
  if (gate.session.kind === 'code') {
    const id = classIdentity({
      name: gate.session.name, grade: gate.session.grade, class: gate.session.class, seat: gate.session.seat
    });
    if (!id || !gate.session.schoolId) return { error: jsonResponse({ ok: false, error: 'forbidden' }, 403, corsHeaders(request)) };
    return { schoolId: gate.session.schoolId, teacher: false, grade: id.grade, className: id.class, code: true };
  }
  const domains = await loadSchoolDomains(env.DB);
  const schoolId = schoolForAccount(gate.row.email, domains, env);
  const account = await resolveAccount(env, gate.row, schoolId);
  if (!account) return { error: jsonResponse({ ok: false, error: 'not_on_roster' }, 403, corsHeaders(request)) };
  if (account.teacher) return { schoolId: schoolId, teacher: true, code: false };
  const id = classIdentity(account.binding);
  if (!id) return { error: jsonResponse({ ok: false, error: 'not_on_roster' }, 403, corsHeaders(request)) };
  return { schoolId: schoolId, teacher: false, grade: id.grade, className: id.class, code: false };
}

function migration(cors) {
  return jsonResponse({ ok: false, error: 'migration_required' }, 503, cors);
}

function safeHistory(profile) {
  const hist = profile && Array.isArray(profile.history) ? profile.history : [];
  return hist.filter((row) => row && typeof row === 'object').map((row) => ({
    date: text(row.date).slice(0, 40),
    game: text(row.game).slice(0, 40),
    score: num(row.score),
    accuracy: Math.min(100, num(row.accuracy)),
    maxCombo: num(row.maxCombo),
    challenge: row.challenge === true,
    practice: row.practice === true,
    at: text(row.at).slice(0, 40),
    difficulty: text(row.difficulty).slice(0, 40)
  }));
}

async function handleClassroom(request, env, path, cors) {
  const classroomPath = path === '/class/assignments' || path === '/class/records' || path === '/class/paper' || path === '/class/report' || path === '/class/codes' || path === '/class/join';
  if (!classroomPath) return null;
  const nowMs = clockMs(env);
  const nowIso = new Date(nowMs).toISOString();
  try {
    if (path === '/class/join' && request.method === 'POST') {
      let body = {};
      try { body = await readJson(request); } catch (e) {
        return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
      }
      const ip = text(request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')).split(',')[0].trim() || 'local';
      const allowed = await bumpJoinLimit(env.DB, 'join:' + ip, nowMs);
      if (!allowed) return jsonResponse({ ok: false, error: 'rate_limited' }, 429, cors);
      const code = text(body.code).toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{6,8}$/.test(code)) return jsonResponse({ ok: false, error: 'bad_code' }, 400, cors);
      let row = null;
      try {
        row = await env.DB.prepare('SELECT code, school_id, grade, class, expires_at, revoked_at FROM class_codes WHERE code = ?').bind(code).first();
      } catch (e) {
        return migration(cors);
      }
      if (!row) return jsonResponse({ ok: false, error: 'bad_code' }, 404, cors);
      if (text(row.revoked_at)) return jsonResponse({ ok: false, error: 'revoked' }, 403, cors);
      if (Date.parse(row.expires_at) < nowMs) return jsonResponse({ ok: false, error: 'expired' }, 403, cors);
      const id = classIdentity({ name: body.name, grade: row.grade, class: body.class, seat: body.seat });
      if (!id || id.class !== text(row.class) || id.grade !== text(row.grade)) {
        return jsonResponse({ ok: false, error: 'bad_student' }, 400, cors);
      }
      const schoolId = text(row.school_id) || DEFAULT_SCHOOL_ID;
      const sub = 'join:' + schoolId + ':' + newId('');
      const email = 'codeuser-' + sub.replace(/[^a-z0-9]+/gi, '').slice(0, 24) + '@' + JOIN_EMAIL_HOST;
      await applyIdentity(env.DB, { sub: sub, email: email, name: id.name, picture: '' }, {
        grade: id.grade, class: id.class, name: id.name, seat: id.seat
      }, nowIso);
      const saved = await saveClassCard(env.DB, id, { avatar: '🎵', signature: '' }, schoolId, true);
      if (saved.error) return jsonResponse({ ok: false, error: saved.error }, saved.status, cors);
      const token = await signSessionToken({
        sub: sub, email: email, kind: 'code', schoolId: schoolId, grade: id.grade, class: id.class, name: id.name, seat: id.seat
      }, env.JWT_SECRET, nowMs);
      return jsonResponse({
        ok: true,
        token: token,
        schoolId: schoolId,
        binding: { grade: id.grade, class: id.class, name: id.name, seat: id.seat, role: 'code' },
        user: { email: '', name: id.name, student_name: id.name },
        card: saved.card
      }, 200, cors);
    }

    const actor = await classActor(request, env);
    if (actor.error) return actor.error;

    if (path === '/class/assignments' && request.method === 'GET') {
      let loaded;
      try {
        loaded = await env.DB.prepare('SELECT id, school_id, grade, class, activity, difficulty, starts_at, ends_at FROM assignments WHERE school_id = ?').bind(actor.schoolId).all();
      } catch (e) { return migration(cors); }
      let rows = (loaded && loaded.results) || [];
      if (!actor.teacher) rows = rows.filter((row) => text(row.grade) === actor.grade && text(row.class) === actor.className);
      return jsonResponse({
        ok: true,
        assignments: rows.map((row) => ({
          id: row.id, grade: row.grade, class: row.class, activity: row.activity,
          difficulty: row.difficulty || '', startsAt: row.starts_at, endsAt: row.ends_at
        }))
      }, 200, cors);
    }

    if (path === '/class/assignments' && request.method === 'POST') {
      if (!actor.teacher) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      let body = {};
      try { body = await readJson(request); } catch (e) {
        return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
      }
      const activity = text(body.activity);
      if (!Object.prototype.hasOwnProperty.call(ASSIGNABLE, activity)) {
        return jsonResponse({ ok: false, error: 'not_assignable' }, 400, cors);
      }
      const difficulty = text(body.difficulty);
      if (difficulty && ASSIGNABLE[activity].indexOf(difficulty) < 0) {
        return jsonResponse({ ok: false, error: 'bad_difficulty' }, 400, cors);
      }
      const grade = schoolGrade(body.grade);
      const klass = schoolClass(body.class, grade);
      const startsAt = text(body.startsAt);
      const endsAt = text(body.endsAt);
      if (!grade || !klass || !Date.parse(startsAt) || !Date.parse(endsAt) || Date.parse(endsAt) < Date.parse(startsAt)) {
        return jsonResponse({ ok: false, error: 'bad_window' }, 400, cors);
      }
      const id = newId('as_');
      try {
        await env.DB.prepare(
          'INSERT INTO assignments (id, school_id, grade, class, activity, difficulty, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, actor.schoolId, grade, klass, activity, difficulty, startsAt, endsAt, nowIso).run();
      } catch (e) { return migration(cors); }
      return jsonResponse({ ok: true, assignment: { id: id, grade: grade, class: klass, activity: activity, difficulty: difficulty, startsAt: startsAt, endsAt: endsAt } }, 200, cors);
    }

    if (path === '/class/records' && request.method === 'GET') {
      if (!actor.teacher) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      let loaded;
      try {
        loaded = await env.DB.prepare('SELECT id, grade, class, student_name, seat, item, channel, note, created_at FROM classroom_records WHERE school_id = ?').bind(actor.schoolId).all();
      } catch (e) { return migration(cors); }
      return jsonResponse({ ok: true, records: (loaded && loaded.results) || [] }, 200, cors);
    }

    if (path === '/class/records' && request.method === 'POST') {
      if (!actor.teacher) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      let body = {};
      try { body = await readJson(request); } catch (e) {
        return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
      }
      const item = text(body.item);
      const channel = text(body.channel);
      const channels = RECORD_CHANNELS[item];
      const who = classIdentity({ name: body.studentName, grade: body.grade, class: body.class, seat: body.seat || '1' });
      if (!channels || channels.indexOf(channel) < 0 || !who) {
        return jsonResponse({ ok: false, error: 'bad_record' }, 400, cors);
      }
      const grade = schoolGrade(body.grade);
      const klass = schoolClass(body.class, grade);
      if (!grade || !klass) return jsonResponse({ ok: false, error: 'bad_record' }, 400, cors);
      const note = text(body.note).slice(0, 500);
      if (!note) return jsonResponse({ ok: false, error: 'bad_record' }, 400, cors);
      const id = newId('rec_');
      try {
        await env.DB.prepare(
          'INSERT INTO classroom_records (id, school_id, grade, class, student_name, seat, item, channel, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, actor.schoolId, grade, klass, who.name, text(body.seat).slice(0, 8), item, channel, note, nowIso).run();
      } catch (e) { return migration(cors); }
      return jsonResponse({ ok: true, record: { id: id, grade: grade, class: klass, studentName: who.name, seat: text(body.seat).slice(0, 8), item: item, channel: channel, note: note } }, 200, cors);
    }

    if (path === '/class/paper' && request.method === 'POST') {
      if (!actor.teacher) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      let body = {};
      try { body = await readJson(request); } catch (e) {
        return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
      }
      const who = classIdentity({ name: body.studentName, grade: '1', class: 'A', seat: body.seat || '1' });
      const grade = schoolGrade(body.grade);
      const klass = schoolClass(body.class, grade);
      const note = text(body.note).slice(0, 500);
      if (!who || !grade || !klass || !note) return jsonResponse({ ok: false, error: 'bad_record' }, 400, cors);
      const id = newId('paper_');
      try {
        await env.DB.prepare(
          'INSERT INTO paper_entries (id, school_id, grade, class, student_name, seat, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, actor.schoolId, grade, klass, who.name, text(body.seat).slice(0, 8), note, nowIso).run();
      } catch (e) { return migration(cors); }
      return jsonResponse({ ok: true, paper: { id: id, grade: grade, class: klass, studentName: who.name, seat: text(body.seat).slice(0, 8), note: note } }, 200, cors);
    }

    if (path === '/class/report' && request.method === 'GET') {
      if (!actor.teacher) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      const url = new URL(request.url);
      const filter = boardQueryFilter(url);
      if (filter.error) return jsonResponse({ ok: false, error: filter.error }, 400, cors);
      const cards = await listClassDirectory(env.DB, filter.grade, filter.class, actor.schoolId);
      const rosterLoaded = await allRoster(env.DB);
      const usersLoaded = await env.DB.prepare('SELECT sub, email, student_name FROM users').all();
      const profilesLoaded = await env.DB.prepare('SELECT sub, data FROM profiles').all();
      const byEmail = {};
      ((usersLoaded && usersLoaded.results) || []).forEach((row) => {
        const email = text(row && row.email).toLowerCase();
        if (email && email.indexOf('@' + JOIN_EMAIL_HOST) < 0 && text(row.sub).indexOf('class:') !== 0 && text(row.sub).indexOf('join:') !== 0) byEmail[email] = row;
      });
      const profileBySub = {};
      ((profilesLoaded && profilesLoaded.results) || []).forEach((row) => {
        try { profileBySub[row.sub] = JSON.parse(row.data); } catch (e) { profileBySub[row.sub] = null; }
      });
      const students = [];
      ((rosterLoaded && rosterLoaded.results) || []).forEach((row) => {
        if (rowSchool(row) !== actor.schoolId) return;
        const g = schoolGrade(row.grade);
        const c = schoolClass(row.class, g);
        if (filter.grade && g !== filter.grade) return;
        if (filter.class && c !== filter.class) return;
        const id = classIdentity({ name: row.student_name, grade: g, class: c, seat: row.seat });
        if (!id) return;
        const user = byEmail[text(row.email).toLowerCase()];
        const stored = user ? profileBySub[user.sub] : null;
        students.push({
          name: id.name, grade: id.grade, class: id.class, seat: id.seat,
          history: safeHistory(stored),
          gameBests: stored && stored.gameBests && typeof stored.gameBests === 'object' ? stored.gameBests : {}
        });
      });
      let records = [];
      let papers = [];
      try {
        const rec = await env.DB.prepare('SELECT grade, class, student_name, seat, item, channel, note FROM classroom_records WHERE school_id = ?').bind(actor.schoolId).all();
        records = ((rec && rec.results) || []).map((row) => ({
          grade: row.grade, class: row.class, studentName: row.student_name, seat: row.seat, item: row.item, channel: row.channel, note: row.note
        }));
        const paper = await env.DB.prepare('SELECT grade, class, student_name, seat, note FROM paper_entries WHERE school_id = ?').bind(actor.schoolId).all();
        papers = ((paper && paper.results) || []).map((row) => ({
          grade: row.grade, class: row.class, studentName: row.student_name, seat: row.seat, note: row.note
        }));
      } catch (e) { return migration(cors); }
      return jsonResponse({ ok: true, students: students, records: records, papers: papers, cards: cards }, 200, cors);
    }

    if (path === '/class/codes' && request.method === 'GET') {
      if (!actor.teacher) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      let loaded;
      try {
        loaded = await env.DB.prepare('SELECT code, grade, class, expires_at, revoked_at FROM class_codes WHERE school_id = ?').bind(actor.schoolId).all();
      } catch (e) { return migration(cors); }
      return jsonResponse({
        ok: true,
        codes: ((loaded && loaded.results) || []).map((row) => ({
          code: row.code, grade: row.grade, class: row.class, expiresAt: row.expires_at, revokedAt: row.revoked_at || ''
        }))
      }, 200, cors);
    }

    if (path === '/class/codes' && request.method === 'POST') {
      if (!actor.teacher) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      let body = {};
      try { body = await readJson(request); } catch (e) {
        return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
      }
      if (body.revoke === true) {
        const code = text(body.code).toUpperCase();
        try {
          const row = await env.DB.prepare('SELECT code, school_id, revoked_at FROM class_codes WHERE code = ?').bind(code).first();
          if (!row || text(row.school_id) !== actor.schoolId) return jsonResponse({ ok: false, error: 'bad_code' }, 404, cors);
          await env.DB.prepare('UPDATE class_codes SET revoked_at = ? WHERE code = ? AND school_id = ?').bind(nowIso, code, actor.schoolId).run();
        } catch (e) { return migration(cors); }
        return jsonResponse({ ok: true, code: code, revokedAt: nowIso }, 200, cors);
      }
      const limited = await bumpJoinLimit(env.DB, 'code:' + actor.schoolId, nowMs);
      if (!limited) return jsonResponse({ ok: false, error: 'rate_limited' }, 429, cors);
      const grade = schoolGrade(body.grade);
      const klass = schoolClass(body.class, grade);
      const hours = Math.min(24 * 30, Math.max(1, Number(body.hours) || 24));
      const length = Number(body.length) || 7;
      if (!grade || !klass) return jsonResponse({ ok: false, error: 'bad_class' }, 400, cors);
      let code = '';
      try {
        for (let i = 0; i < 5; i++) {
          const candidate = randomCode(length);
          const existing = await env.DB.prepare('SELECT code FROM class_codes WHERE code = ?').bind(candidate).first();
          if (!existing) { code = candidate; break; }
        }
        if (!code) return jsonResponse({ ok: false, error: 'bad_code' }, 500, cors);
        const expires = new Date(nowMs + hours * 60 * 60 * 1000).toISOString();
        await env.DB.prepare(
          'INSERT INTO class_codes (code, school_id, grade, class, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(code, actor.schoolId, grade, klass, expires, '', nowIso).run();
        return jsonResponse({ ok: true, code: code, grade: grade, class: klass, expiresAt: expires }, 200, cors);
      } catch (e) { return migration(cors); }
    }

    return null;
  } catch (err) {
    console.error('[noteschallenge-auth]', err && err.message ? err.message : err);
    return jsonResponse({ ok: false, error: 'server error' }, 500, cors);
  }
}

const LIVE_GAMES = {
  'staff-interval': 1,
  'aural-interval': 1,
  'note-name': 1,
  'rhythm': 1,
  'rhythm-echo': 1,
  'terms': 1,
  'instrument': 1
};

export const RHYTHM_ECHO_WINDOWS = {
  easy: { id: 'easy', label: '容易', bpm: 72, hitWindowMs: 240, perfectMs: 90 },
  medium: { id: 'medium', label: '中等', bpm: 84, hitWindowMs: 180, perfectMs: 70 },
  hard: { id: 'hard', label: '困難', bpm: 96, hitWindowMs: 135, perfectMs: 55 }
};

const RHYTHM_ECHO_METERS = { '2/4': 2, '3/4': 3, '4/4': 4 };
const RHYTHM_ECHO_TOKENS = {
  'ta-a-a-a': [{ q: 4, vex: 'w', rest: false }],
  'ta-a-a': [{ q: 3, vex: 'hd', rest: false }],
  'ta-a': [{ q: 2, vex: 'h', rest: false }],
  'ta': [{ q: 1, vex: 'q', rest: false }],
  'ti-ti': [{ q: 0.5, vex: '8', rest: false }, { q: 0.5, vex: '8', rest: false }],
  'ti-ri-ti-ri': [
    { q: 0.25, vex: '16', rest: false },
    { q: 0.25, vex: '16', rest: false },
    { q: 0.25, vex: '16', rest: false },
    { q: 0.25, vex: '16', rest: false }
  ],
  'ti-ti-ri': [{ q: 0.5, vex: '8', rest: false }, { q: 0.25, vex: '16', rest: false }, { q: 0.25, vex: '16', rest: false }],
  'ti-ri-ti': [{ q: 0.25, vex: '16', rest: false }, { q: 0.25, vex: '16', rest: false }, { q: 0.5, vex: '8', rest: false }],
  'ri-ti-ri': [{ q: 0.25, vex: '16', rest: false }, { q: 0.5, vex: '8', rest: false }, { q: 0.25, vex: '16', rest: false }],
  'ti': [{ q: 0.5, vex: '8', rest: false }],
  'ri': [{ q: 0.25, vex: '16', rest: false }],
  'r': [{ q: 1, vex: 'qr', rest: true }],
  '休': [{ q: 1, vex: 'qr', rest: true }],
  'rh': [{ q: 2, vex: 'hr', rest: true }]
};

function roundBeat(v) {
  return Math.round(v * 1000) / 1000;
}

export function expandRhythmEchoBars(bars, meter) {
  const meterBeats = RHYTHM_ECHO_METERS[meter];
  if (!meterBeats || !Array.isArray(bars) || !bars.length || bars.length > 4) return null;
  const events = [];
  const normalizedBars = [];
  for (let b = 0; b < bars.length; b++) {
    const tokens = String(bars[b] || '').trim().split(/\s+/).filter(Boolean);
    if (!tokens.length || tokens.length > 24) return null;
    let pos = 0;
    const barOut = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i] === '休' ? 'r' : tokens[i].toLowerCase();
      const spec = RHYTHM_ECHO_TOKENS[tok];
      if (!spec) return null;
      barOut.push(tok);
      for (let j = 0; j < spec.length; j++) {
        events.push({
          bar: b,
          beatInBar: roundBeat(pos),
          startBeat: roundBeat(b * meterBeats + pos),
          quarters: spec[j].q,
          vex: spec[j].vex,
          rest: spec[j].rest === true,
          token: tok
        });
        pos = roundBeat(pos + spec[j].q);
      }
    }
    if (Math.abs(pos - meterBeats) > 0.002) return null;
    normalizedBars.push(barOut.join(' '));
  }
  const hasSound = events.some((ev) => !ev.rest);
  if (!hasSound) return null;
  return {
    meter: meter,
    meterBeats: meterBeats,
    bars: normalizedBars,
    totalBeats: meterBeats * normalizedBars.length,
    events: events
  };
}

export function expectedEchoOnsetsMs(render) {
  const spec = plainObject(render);
  const meter = RHYTHM_ECHO_METERS[spec.meter] ? spec.meter : '4/4';
  const bpm = Math.max(50, Math.min(140, Math.round(Number(spec.bpm) || 84)));
  const expanded = expandRhythmEchoBars(spec.bars, meter);
  if (!expanded) return [];
  const beatMs = 60000 / bpm;
  return expanded.events
    .filter((ev) => !ev.rest)
    .map((ev) => Math.round(ev.startBeat * beatMs));
}

/**
 * Server-authoritative Rhythm Echo grading.
 * Compares submitted tap onsets (ms relative to tapStartAt) against expected onsets.
 * Explicit per-difficulty windows (RHYTHM_ECHO_WINDOWS):
 *   easy (容易): ±240ms (perfect ±90ms)
 *   medium (中等): ±180ms (perfect ±70ms)
 *   hard (困難): ±135ms (perfect ±55ms)
 */
export function gradeRhythmEcho(render, rawOnsets) {
  const spec = plainObject(render);
  const levelKey = RHYTHM_ECHO_WINDOWS[spec.level] ? spec.level : 'medium';
  const win = RHYTHM_ECHO_WINDOWS[levelKey];
  const expected = expectedEchoOnsetsMs(spec);
  const taps = (Array.isArray(rawOnsets) ? rawOnsets : [])
    .slice(0, 64)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= -600 && v <= 45000)
    .sort((a, b) => a - b);

  const usedTap = new Array(taps.length).fill(false);
  const beats = [];
  let hitCount = 0;
  let perfectCount = 0;
  let absErrSum = 0;

  for (let i = 0; i < expected.length; i++) {
    const targetMs = expected[i];
    let bestIdx = -1;
    let bestAbs = Infinity;
    for (let j = 0; j < taps.length; j++) {
      if (usedTap[j]) continue;
      const diff = Math.abs(taps[j] - targetMs);
      if (diff <= win.hitWindowMs && diff < bestAbs) {
        bestAbs = diff;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0) {
      usedTap[bestIdx] = true;
      const errMs = Math.round(taps[bestIdx] - targetMs);
      const status = bestAbs <= win.perfectMs ? 'perfect' : 'good';
      hitCount += 1;
      if (status === 'perfect') perfectCount += 1;
      absErrSum += bestAbs;
      beats.push({ index: i, expectedMs: targetMs, tapMs: Math.round(taps[bestIdx]), errorMs: errMs, status: status });
    } else {
      beats.push({ index: i, expectedMs: targetMs, tapMs: null, errorMs: null, status: 'miss' });
    }
  }

  const expectedCount = expected.length;
  const missedCount = expectedCount - hitCount;
  const extraCount = usedTap.filter((u) => !u).length;
  const rawAcc = expectedCount > 0 ? ((hitCount - extraCount * 0.5) / expectedCount) * 100 : 0;
  const accuracy = Math.max(0, Math.min(100, Math.round(rawAcc)));

  let verdict = 'wrong';
  if (expectedCount > 0 && missedCount === 0 && extraCount === 0) {
    verdict = 'correct';
  } else if (hitCount > 0 && accuracy >= 50) {
    verdict = 'partial';
  }

  let points = 0;
  if (verdict === 'correct') {
    const meanAbs = hitCount > 0 ? absErrSum / hitCount : win.hitWindowMs;
    const precision = Math.max(0, Math.min(1, 1 - meanAbs / Math.max(1, win.hitWindowMs)));
    points = 750 + Math.round(250 * precision);
  } else if (verdict === 'partial') {
    points = Math.max(100, Math.round(600 * (accuracy / 100)));
  }

  return {
    level: levelKey,
    hitWindowMs: win.hitWindowMs,
    perfectMs: win.perfectMs,
    expectedCount: expectedCount,
    hitCount: hitCount,
    perfectCount: perfectCount,
    missedCount: missedCount,
    extraCount: extraCount,
    accuracy: accuracy,
    verdict: verdict,
    correct: verdict === 'correct',
    points: points,
    beats: beats
  };
}

function liveNameBlocked(name) {
  const n = text(name);
  if (!n || n === '訪客' || n === '測試人員' || n === '__guest__' || n === '__other__') return true;
  if (n.indexOf('訪客') === 0 || n.indexOf('測試') === 0) return true;
  return false;
}

/**
 * Kahoot-style points for one live answer.
 * A correct answer scores 1000 at the first instant and 500 when it lands
 * on the deadline. The drop is linear:
 *   points = 500 + round(500 * (1 - elapsed / limit))
 * Wrong, blank, and late answers score 0.
 * elapsedMs and limitMs are milliseconds. The result is a deterministic integer.
 */
export function scoreLivePoints(correct, elapsedMs, limitMs) {
  if (!correct) return 0;
  const limit = Math.max(1, Number(limitMs) || 1);
  const elapsed = Math.min(limit, Math.max(0, Number(elapsedMs) || 0));
  return 500 + Math.round(500 * (1 - elapsed / limit));
}

function cleanLiveText(value, max) {
  const out = text(value).replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  if (!out || out.indexOf('@') !== -1 || /[|%]/.test(out)) return '';
  return out.slice(0, max);
}

function cleanLiveRender(game, raw) {
  const src = plainObject(raw);
  if (game === 'staff-interval' || game === 'note-name') {
    const clef = src.clef === 'bass' || src.clef === 'alto' ? src.clef : (src.clef === 'treble' ? 'treble' : '');
    const notes = Array.isArray(src.notes) ? src.notes.slice(0, 4).map((note) => {
      const row = plainObject(note);
      const pos = Math.round(Number(row.pos));
      if (!Number.isFinite(pos) || pos < -8 || pos > 16) return null;
      const acc = row.acc === '#' || row.acc === 'b' ? row.acc : '';
      const x = Math.round(Number(row.x));
      return { pos: pos, acc: acc, x: Number.isFinite(x) ? Math.max(80, Math.min(340, x)) : 220 };
    }).filter(Boolean) : [];
    if (!clef || !notes.length) return null;
    return { kind: 'staff', clef: clef, notes: notes };
  }
  if (game === 'aural-interval') {
    const midis = Array.isArray(src.midis) ? src.midis.slice(0, 4).map((midi) => Math.round(Number(midi))).filter((midi) => midi >= 36 && midi <= 96) : [];
    if (midis.length < 2) return null;
    return { kind: 'aural', midis: midis, harmonic: src.harmonic === true };
  }
  if (game === 'rhythm') {
    const shown = text(src.shown).slice(0, 80);
    if (!/^[a-z\- ]*$/.test(shown)) return null;
    const blank = Number(src.blankQuarters);
    if (blank !== 0.25 && blank !== 0.5 && blank !== 1 && blank !== 2 && blank !== 4) return null;
    return { kind: 'rhythm', meter: '4/4', shown: shown, blankQuarters: blank };
  }
  if (game === 'rhythm-echo') {
    const meter = RHYTHM_ECHO_METERS[src.meter] ? src.meter : '4/4';
    const level = RHYTHM_ECHO_WINDOWS[src.level] ? src.level : 'medium';
    const defaultBpm = RHYTHM_ECHO_WINDOWS[level].bpm;
    const bpm = Math.max(50, Math.min(140, Math.round(Number(src.bpm) || defaultBpm)));
    const rawBars = Array.isArray(src.bars) ? src.bars : (typeof src.bar === 'string' ? [src.bar] : []);
    const expanded = expandRhythmEchoBars(rawBars, meter);
    if (!expanded) return null;
    const countInBeats = Math.max(2, Math.min(4, Math.round(Number(src.countInBeats) || expanded.meterBeats)));
    return {
      kind: 'rhythm-echo',
      meter: expanded.meter,
      bpm: bpm,
      level: level,
      bars: expanded.bars,
      countInBeats: countInBeats,
      totalBeats: expanded.totalBeats
    };
  }
  if (game === 'instrument') {
    const image = text(src.image);
    if (!/^img\/instruments\/[A-Za-z0-9._-]+$/.test(image)) return null;
    return { kind: 'instrument', image: image };
  }
  if (game === 'terms') return { kind: 'text' };
  return null;
}

function cleanLiveChoices(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4) return null;
  const choices = [];
  const seen = {};
  for (let i = 0; i < raw.length; i++) {
    const row = plainObject(raw[i]);
    const label = cleanLiveText(row.label, 40);
    const id = cleanLiveText(row.id, 48);
    if (!label || !id || seen[id]) return null;
    seen[id] = 1;
    choices.push({ id: id, label: label });
  }
  return choices;
}

export function normalizeLiveQuiz(body) {
  const src = plainObject(body);
  const title = cleanLiveText(src.title, 30);
  const limitMs = Number(src.limitMs) === 10000 || Number(src.limitMs) === 30000 ? Number(src.limitMs) : 20000;
  const rawItems = Array.isArray(src.items) ? src.items.slice(0, 30) : [];
  if (!title || !rawItems.length) return { ok: false, error: 'bad_quiz' };
  const items = [];
  for (let i = 0; i < rawItems.length; i++) {
    const row = plainObject(rawItems[i]);
    const isEcho = row.type === 'rhythm-echo' || (row.type === 'bank' && text(row.game) === 'rhythm-echo');
    if (isEcho) {
      const prompt = cleanLiveText(row.prompt || '先聽示範，再跟著節拍打出這段節奏！', 80);
      const render = cleanLiveRender('rhythm-echo', row.render || row);
      if (!prompt || !render) return { ok: false, error: 'bad_quiz' };
      items.push({
        type: 'bank',
        game: 'rhythm-echo',
        prompt: prompt,
        choices: [],
        correctId: '',
        render: render
      });
      continue;
    }
    const type = row.type === 'bank' ? 'bank' : (row.type === 'custom' ? 'custom' : '');
    const prompt = cleanLiveText(row.prompt, 80);
    const choices = cleanLiveChoices(row.choices);
    const correctId = cleanLiveText(row.correctId, 48);
    if (!type || !prompt || !choices || !choices.some((choice) => choice.id === correctId)) {
      return { ok: false, error: 'bad_quiz' };
    }
    const item = { type: type, prompt: prompt, choices: choices, correctId: correctId };
    if (type === 'bank') {
      const game = text(row.game);
      if (!LIVE_GAMES[game]) return { ok: false, error: 'bad_quiz' };
      const render = cleanLiveRender(game, row.render);
      if (!render) return { ok: false, error: 'bad_quiz' };
      item.game = game;
      item.render = render;
    }
    items.push(item);
  }
  return { ok: true, quiz: { title: title, limitMs: limitMs, items: items } };
}

function isEchoItem(item) {
  return !!(item && item.game === 'rhythm-echo' && item.render && item.render.kind === 'rhythm-echo');
}

function buildEchoTimeline(item, nowMs, skipDemo) {
  const r = item.render;
  const win = RHYTHM_ECHO_WINDOWS[r.level] || RHYTHM_ECHO_WINDOWS.medium;
  const beatMs = 60000 / Math.max(50, Math.min(140, Number(r.bpm) || win.bpm));
  const meterBeats = RHYTHM_ECHO_METERS[r.meter] || 4;
  const countInBeats = Number(r.countInBeats) || meterBeats;
  const totalBeats = Number(r.totalBeats) || ((Array.isArray(r.bars) ? r.bars.length : 1) * meterBeats);
  const countInMs = Math.round(countInBeats * beatMs);
  const patternMs = Math.round(totalBeats * beatMs);
  const syncLeadMs = skipDemo ? 600 : 1200;
  const demoStartAt = nowMs + syncLeadMs;
  const demoEndsAt = skipDemo ? demoStartAt : (demoStartAt + countInMs + patternMs);
  const tapCountInAt = demoEndsAt;
  const tapStartAt = tapCountInAt + countInMs;
  const tapEndsAt = tapStartAt + patternMs + win.hitWindowMs + 1600;
  return {
    demoStartAt: demoStartAt,
    demoEndsAt: demoEndsAt,
    tapCountInAt: tapCountInAt,
    tapStartAt: tapStartAt,
    tapEndsAt: tapEndsAt,
    countInMs: countInMs,
    patternMs: patternMs,
    beatMs: Math.round(beatMs * 100) / 100,
    hitWindowMs: win.hitWindowMs,
    perfectMs: win.perfectMs,
    skipDemo: !!skipDemo
  };
}

function echoSubPhaseAt(tl, nowMs) {
  if (!tl) return '';
  if (nowMs < tl.demoStartAt) return 'prepare';
  if (!tl.skipDemo && nowMs < tl.demoEndsAt) return 'demo';
  if (nowMs < tl.tapStartAt) return 'count-in';
  if (nowMs <= tl.tapEndsAt) return 'tap';
  return 'closing';
}

export function blankLiveState(quiz, code, teacherSub, schoolId) {
  return {
    v: 2,
    code: code,
    schoolId: schoolId,
    teacherSub: teacherSub,
    quizId: quiz.id,
    title: quiz.title,
    limitMs: quiz.limitMs,
    phase: 'lobby',
    index: -1,
    questionStartedAt: 0,
    questionEndsAt: 0,
    echoTimeline: null,
    items: quiz.items,
    players: [],
    answers: {}
  };
}

export function joinLiveState(state, player, opts) {
  if (!state || state.phase === 'done') return { ok: false, error: 'closed' };
  const role = player && player.role === 'code' ? 'code' : (player && player.role === 'student' ? 'student' : '');
  const name = cleanLiveText(player && player.name, 20);
  if (!player || !text(player.id) || !role || !name) return { ok: false, error: 'bad_student' };
  if (name === '測試人員' || name.indexOf('訪客') === 0) return { ok: false, error: 'bad_student' };
  const id = text(player.id).slice(0, 80);
  const existing = state.players.find((row) => row.id === id);
  if (existing) {
    existing.avatar = cleanLiveText(player.avatar, 16) || existing.avatar || '🎵';
    existing.signature = cleanLiveText(player.signature, 30);
    return { ok: true, reconnected: true };
  }
  const hasEcho = Array.isArray(state.items) && state.items.some((it) => isEchoItem(it));
  const allowSpectate = hasEcho || !!(opts && opts.allowSpectate === true);
  if (state.phase !== 'lobby' && !allowSpectate) {
    return { ok: false, error: 'started' };
  }
  if (state.players.length >= 50) return { ok: false, error: 'full' };
  const spectatingUntilIndex = state.phase === 'lobby' ? -1 : (Number(state.index) + 1);
  state.players.push({
    id: id,
    name: name,
    grade: cleanLiveText(player.grade, 8),
    class: cleanLiveText(player.class, 8),
    seat: cleanLiveText(player.seat, 8),
    avatar: cleanLiveText(player.avatar, 16) || '🎵',
    signature: cleanLiveText(player.signature, 30),
    role: role,
    official: role === 'student' && !liveNameBlocked(name),
    score: 0,
    correctCount: 0,
    spectatingUntilIndex: spectatingUntilIndex
  });
  return { ok: true, spectating: spectatingUntilIndex > state.index };
}

function closeLiveQuestion(state, nowMs) {
  const bag = state.answers[String(state.index)] || {};
  state.players.forEach((player) => {
    const row = bag[player.id];
    if (row && row.applied !== true) {
      player.score = num(player.score) + num(row.points);
      if (row.correct === true) player.correctCount = num(player.correctCount) + 1;
      row.applied = true;
    }
  });
  state.phase = 'reveal';
  state.closedAt = nowMs;
}

function openLiveQuestion(state, index, nowMs) {
  const item = state.items[index];
  state.phase = 'question';
  state.index = index;
  state.questionStartedAt = nowMs;
  if (isEchoItem(item)) {
    const tl = buildEchoTimeline(item, nowMs, false);
    state.echoTimeline = tl;
    state.questionEndsAt = tl.tapEndsAt;
  } else {
    state.echoTimeline = null;
    state.questionEndsAt = nowMs + state.limitMs;
  }
  if (!state.answers[String(index)]) state.answers[String(index)] = {};
}

export function settleLiveState(state, nowMs) {
  if (!state || state.phase !== 'question') return false;
  if (nowMs < state.questionEndsAt) return false;
  closeLiveQuestion(state, nowMs);
  return true;
}

export function answerLiveState(state, playerId, choiceId, nowMs) {
  settleLiveState(state, nowMs);
  if (!state || state.phase !== 'question') return { ok: false, error: 'closed' };
  const player = state.players.find((row) => row.id === playerId);
  if (!player) return { ok: false, error: 'not_joined' };
  if (num(player.spectatingUntilIndex) > state.index) return { ok: false, error: 'spectating' };
  const item = state.items[state.index];
  if (!item || isEchoItem(item)) return { ok: false, error: 'bad_choice' };
  const key = String(state.index);
  const bag = state.answers[key] || (state.answers[key] = {});
  if (bag[playerId]) return { ok: true, locked: true };
  const choice = item.choices.find((row) => row.id === choiceId);
  if (!choice) return { ok: false, error: 'bad_choice' };
  const elapsed = Math.max(0, nowMs - state.questionStartedAt);
  if (elapsed > state.limitMs) return { ok: false, error: 'closed' };
  const correct = choice.id === item.correctId;
  bag[playerId] = {
    choiceId: choice.id,
    elapsedMs: elapsed,
    correct: correct,
    points: scoreLivePoints(correct, elapsed, state.limitMs),
    applied: false
  };
  return { ok: true, locked: true };
}

export function tapLiveState(state, playerId, payload, nowMs) {
  settleLiveState(state, nowMs);
  if (!state || state.phase !== 'question') return { ok: false, error: 'closed' };
  const player = state.players.find((row) => row.id === playerId);
  if (!player) return { ok: false, error: 'not_joined' };
  if (num(player.spectatingUntilIndex) > state.index) return { ok: false, error: 'spectating' };
  const item = state.items[state.index];
  const tl = state.echoTimeline;
  if (!item || !isEchoItem(item) || !tl) return { ok: false, error: 'bad_choice' };
  const key = String(state.index);
  const bag = state.answers[key] || (state.answers[key] = {});
  if (bag[playerId]) return { ok: true, locked: true, grade: bag[playerId].echo };
  if (nowMs < tl.tapStartAt - tl.hitWindowMs) return { ok: false, error: 'too_early' };
  if (nowMs > tl.tapEndsAt + 400) return { ok: false, error: 'closed' };

  const src = plainObject(payload);
  let onsets = [];
  if (Array.isArray(src.onsets)) {
    onsets = src.onsets.map((v) => Number(v));
  } else if (Array.isArray(src.tapTimestamps)) {
    onsets = src.tapTimestamps.map((ts) => Number(ts) - tl.tapStartAt);
  }
  const grade = gradeRhythmEcho(item.render, onsets);
  bag[playerId] = {
    kind: 'rhythm-echo',
    submittedAt: nowMs,
    correct: grade.correct,
    verdict: grade.verdict,
    points: grade.points,
    echo: grade,
    applied: false
  };
  return { ok: true, locked: true, grade: grade };
}

export function advanceLiveState(state, nowMs, action) {
  if (!state) return { ok: false, error: 'closed' };
  const was = state.phase;
  const item = state.index >= 0 ? state.items[state.index] : null;
  if (was === 'question' && isEchoItem(item) && (action === 'replay-demo' || action === 'start-tap')) {
    const skipDemo = action === 'start-tap';
    const tl = buildEchoTimeline(item, nowMs, skipDemo);
    state.echoTimeline = tl;
    state.questionStartedAt = nowMs;
    state.questionEndsAt = tl.tapEndsAt;
    if (action === 'replay-demo') state.answers[String(state.index)] = {};
    return { ok: true, action: action };
  }
  const settled = settleLiveState(state, nowMs);
  if (was === 'lobby') {
    if (!state.items.length) return { ok: false, error: 'empty' };
    openLiveQuestion(state, 0, nowMs);
    return { ok: true };
  }
  if (was === 'question') {
    if (!settled) closeLiveQuestion(state, nowMs);
    return { ok: true };
  }
  if (was === 'reveal') {
    if (state.index + 1 >= state.items.length) {
      state.phase = 'done';
      state.finishedAt = nowMs;
      return { ok: true, finished: true };
    }
    openLiveQuestion(state, state.index + 1, nowMs);
    return { ok: true };
  }
  return { ok: false, error: 'done' };
}

function publicLivePlayer(player, viewerId, bag, state, isHostView, showAnswer) {
  const row = bag ? bag[player.id] : null;
  const isSpec = state.phase === 'question' && num(player.spectatingUntilIndex) > state.index;
  const pendingPts = row && row.applied !== true ? num(row.points) : 0;
  const pendingCorrect = row && row.applied !== true && row.correct === true ? 1 : 0;
  const displayScore = (isHostView && state.phase === 'question') ? (num(player.score) + pendingPts) : num(player.score);
  const displayCorrect = (isHostView && state.phase === 'question') ? (num(player.correctCount) + pendingCorrect) : num(player.correctCount);
  let roundStatus = 'waiting';
  if (state.phase === 'question') {
    if (isSpec) roundStatus = 'spectating';
    else if (row) {
      if (isHostView) roundStatus = row.verdict || (row.correct ? 'correct' : 'wrong');
      else roundStatus = 'submitted';
    } else {
      roundStatus = 'tapping';
    }
  } else if (showAnswer && row) {
    roundStatus = row.verdict || (row.correct ? 'correct' : 'wrong');
  } else if (showAnswer) {
    roundStatus = isSpec ? 'spectating' : 'missed';
  }
  return {
    name: text(player.name).slice(0, 20),
    grade: text(player.grade).slice(0, 8),
    class: text(player.class).slice(0, 8),
    seat: text(player.seat).slice(0, 8),
    avatar: text(player.avatar).slice(0, 16) || '🎵',
    signature: text(player.signature).slice(0, 30),
    score: displayScore,
    correctCount: displayCorrect,
    roundStatus: roundStatus,
    spectating: isSpec,
    you: player.id === viewerId
  };
}

export function officialLiveBoard(state) {
  return (state && state.players || []).filter((player) => player.official === true && player.role === 'student' && !liveNameBlocked(player.name)).map((player) => ({
    name: text(player.name).slice(0, 20),
    grade: text(player.grade).slice(0, 8),
    class: text(player.class).slice(0, 8),
    seat: text(player.seat).slice(0, 8),
    avatar: text(player.avatar).slice(0, 16) || '🎵',
    signature: text(player.signature).slice(0, 30),
    score: num(player.score),
    correctCount: num(player.correctCount)
  })).sort((a, b) => b.score - a.score || b.correctCount - a.correctCount || a.name.localeCompare(b.name, 'zh-Hant'));
}

export function publicLiveState(state, viewerId, nowMs, opts) {
  const showAnswer = state.phase === 'reveal' || state.phase === 'done';
  const isHostView = !!(opts && opts.host === true);
  const item = state.index >= 0 ? state.items[state.index] : null;
  const bag = state.answers[String(state.index)] || {};
  const mine = viewerId ? bag[viewerId] : null;
  const viewerPlayer = viewerId ? state.players.find((p) => p.id === viewerId) : null;
  const spectating = !!(viewerPlayer && state.phase === 'question' && num(viewerPlayer.spectatingUntilIndex) > state.index);
  const mappedPlayers = state.players.map((player) => publicLivePlayer(player, viewerId, bag, state, isHostView, showAnswer));
  mappedPlayers.sort((a, b) => num(b.score) - num(a.score) || num(b.correctCount) - num(a.correctCount) || text(a.name).localeCompare(text(b.name), 'zh-Hant'));

  let yourEcho = null;
  if (mine && mine.echo) {
    yourEcho = {
      submitted: true,
      verdict: mine.echo.verdict,
      hitCount: mine.echo.hitCount,
      expectedCount: mine.echo.expectedCount,
      missedCount: mine.echo.missedCount,
      extraCount: mine.echo.extraCount,
      accuracy: mine.echo.accuracy
    };
    if (showAnswer) {
      yourEcho.points = num(mine.points);
      yourEcho.beats = mine.echo.beats;
    }
  }

  return {
    code: state.code,
    title: state.title,
    phase: state.phase,
    serverNow: nowMs,
    limitMs: state.limitMs,
    index: state.index,
    total: state.items.length,
    questionStartedAt: state.phase === 'question' ? state.questionStartedAt : 0,
    questionEndsAt: state.phase === 'question' ? state.questionEndsAt : 0,
    echoTimeline: state.phase === 'question' && isEchoItem(item) ? state.echoTimeline : null,
    echoSubPhase: state.phase === 'question' && isEchoItem(item) ? echoSubPhaseAt(state.echoTimeline, nowMs) : '',
    question: item && state.phase !== 'lobby' ? {
      prompt: item.prompt,
      game: item.game || '',
      type: item.type,
      render: item.render || null,
      choices: (item.choices || []).map((choice) => {
        const row = { id: choice.id, label: choice.label };
        if (showAnswer) row.correct = choice.id === item.correctId;
        return row;
      })
    } : null,
    players: mappedPlayers,
    answered: Object.keys(bag).length,
    yourChoice: mine ? (mine.choiceId || '') : '',
    yourEcho: yourEcho,
    yourPoints: showAnswer && mine ? num(mine.points) : 0,
    spectating: spectating,
    locked: !!(mine)
  };
}

function liveJoinCode() {
  return randomCode(6);
}

async function liveActor(request, env) {
  const gate = await requireSession(request, env);
  if (gate.error) return gate;
  if (gate.session.kind === 'code') {
    const id = classIdentity({
      name: gate.session.name, grade: gate.session.grade, class: gate.session.class, seat: gate.session.seat
    });
    if (!id || !gate.session.schoolId) return { error: jsonResponse({ ok: false, error: 'bad_student' }, 403, corsHeaders(request)) };
    return {
      schoolId: gate.session.schoolId,
      teacher: false,
      sub: gate.session.sub,
      player: {
        id: 'code:' + gate.session.sub,
        name: id.name,
        grade: id.grade,
        class: id.class,
        seat: id.seat,
        role: 'code',
        official: false
      }
    };
  }
  const domains = await loadSchoolDomains(env.DB);
  const schoolId = schoolForAccount(gate.row.email, domains, env);
  const account = await resolveAccount(env, gate.row, schoolId);
  if (!account) return { error: jsonResponse({ ok: false, error: 'not_on_roster' }, 403, corsHeaders(request)) };
  if (account.teacher) return { schoolId: schoolId, teacher: true, sub: gate.row.sub, player: null };
  const id = classIdentity(account.binding);
  if (!id) return { error: jsonResponse({ ok: false, error: 'bad_student' }, 403, corsHeaders(request)) };
  return {
    schoolId: schoolId,
    teacher: false,
    sub: gate.row.sub,
    player: {
      id: 'user:' + gate.row.sub,
      name: id.name,
      grade: id.grade,
      class: id.class,
      seat: id.seat,
      role: 'student',
      official: !liveNameBlocked(id.name)
    }
  };
}

async function readLiveRoomRecord(db, code) {
  const row = await db.prepare('SELECT code, school_id, teacher_sub, quiz_id, state, updated_at FROM live_rooms WHERE code = ?').bind(code).first();
  if (!row) return null;
  let state = null;
  try { state = JSON.parse(row.state); } catch (e) { state = null; }
  if (!state || !Array.isArray(state.items) || !Array.isArray(state.players)) return null;
  return { raw: String(row.state), state: state };
}

function casSucceeded(res) {
  if (!res || res.success === false) return false;
  if (res.meta && typeof res.meta.changes === 'number') return res.meta.changes > 0;
  return true;
}

async function casYield(attempt) {
  if (attempt <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, Math.min(25, 2 + attempt * 2)));
}

async function mutateLiveRoom(db, code, nowIso, mutator) {
  const MAX_RETRIES = 20;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const rec = await readLiveRoomRecord(db, code);
    if (!rec) return { ok: false, error: 'not_found', status: 404 };
    const outcome = mutator(rec.state);
    if (!outcome || outcome.write !== true) {
      return Object.assign({ state: rec.state }, outcome || { ok: true });
    }
    rec.state.rev = num(rec.state.rev) + 1;
    const nextRaw = JSON.stringify(rec.state);
    const res = await db.prepare(
      'UPDATE live_rooms SET state = ?, updated_at = ? WHERE code = ? AND state = ?'
    ).bind(nextRaw, nowIso, code, rec.raw).run();
    if (casSucceeded(res)) {
      return Object.assign({ state: rec.state, retries: attempt }, outcome);
    }
    await casYield(attempt + 1);
  }
  return { ok: false, error: 'busy', status: 409 };
}

async function saveLiveResult(db, state, nowIso) {
  const existing = await db.prepare('SELECT id FROM live_results WHERE room_code = ? AND school_id = ?').bind(state.code, state.schoolId).first();
  if (existing) return;
  const board = officialLiveBoard(state);
  await db.prepare(
    'INSERT INTO live_results (id, school_id, room_code, quiz_title, recorded_at, board) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(newId('res'), state.schoolId, state.code, state.title, nowIso, JSON.stringify(board)).run();
}

function liveViewResponse(state, actor, nowMs) {
  const viewerId = actor.player ? actor.player.id : '';
  const isHost = actor.teacher === true && actor.sub === state.teacherSub;
  const body = publicLiveState(state, viewerId, nowMs, { host: isHost });
  body.ok = true;
  body.host = isHost;
  if (body.host && state.phase === 'done') body.officialBoard = officialLiveBoard(state);
  return body;
}

async function handleLiveQuiz(request, env, path, cors) {
  const quizPath = path === '/live/quizzes' || path.startsWith('/live/quizzes/');
  const roomPath = path === '/live/rooms' || path.startsWith('/live/rooms/');
  if (!quizPath && !roomPath) return null;
  const nowMs = clockMs(env);
  const nowIso = new Date(nowMs).toISOString();
  try {
    const actor = await liveActor(request, env);
    if (actor.error) return actor.error;
    if (path === '/live/quizzes' && request.method === 'GET') {
      if (!actor.teacher) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      const loaded = await env.DB.prepare('SELECT id, school_id, teacher_sub, title, limit_ms, items, updated_at FROM live_quizzes WHERE school_id = ? AND teacher_sub = ?').bind(actor.schoolId, actor.sub).all();
      const rows = ((loaded && loaded.results) || []).filter((row) => text(row.school_id) === actor.schoolId && text(row.teacher_sub) === actor.sub);
      return jsonResponse({
        ok: true,
        quizzes: rows.map((row) => {
          let count = 0;
          try { count = JSON.parse(row.items).length; } catch (e) { count = 0; }
          return { id: row.id, title: row.title, limitMs: Number(row.limit_ms) || 20000, count: count, updatedAt: row.updated_at };
        })
      }, 200, cors);
    }
    if (path === '/live/quizzes' && request.method === 'POST') {
      if (!actor.teacher) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      let body = {};
      try { body = await readJson(request); } catch (e) {
        return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
      }
      const quiz = normalizeLiveQuiz(body);
      if (!quiz.ok) return jsonResponse({ ok: false, error: quiz.error }, 400, cors);
      const packed = JSON.stringify(quiz.quiz.items);
      if (packed.length > 100000) return jsonResponse({ ok: false, error: 'bad_quiz' }, 413, cors);
      const id = newId('q');
      await env.DB.prepare(
        'INSERT INTO live_quizzes (id, school_id, teacher_sub, title, limit_ms, items, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, actor.schoolId, actor.sub, quiz.quiz.title, quiz.quiz.limitMs, packed, nowIso).run();
      return jsonResponse({ ok: true, quiz: { id: id, title: quiz.quiz.title, limitMs: quiz.quiz.limitMs, items: quiz.quiz.items } }, 200, cors);
    }
    if (path === '/live/rooms' && request.method === 'POST') {
      if (!actor.teacher) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      let body = {};
      try { body = await readJson(request); } catch (e) {
        return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
      }
      const quizId = text(body.quizId);
      const row = await env.DB.prepare('SELECT id, school_id, teacher_sub, title, limit_ms, items FROM live_quizzes WHERE id = ?').bind(quizId).first();
      if (!row || text(row.school_id) !== actor.schoolId || text(row.teacher_sub) !== actor.sub) {
        return jsonResponse({ ok: false, error: 'not_found' }, 404, cors);
      }
      let items = [];
      try { items = JSON.parse(row.items); } catch (e) { items = []; }
      if (!Array.isArray(items) || !items.length) return jsonResponse({ ok: false, error: 'bad_quiz' }, 400, cors);
      let code = '';
      for (let i = 0; i < 5; i++) {
        const candidate = liveJoinCode();
        const existing = await env.DB.prepare('SELECT code FROM live_rooms WHERE code = ?').bind(candidate).first();
        if (!existing) { code = candidate; break; }
      }
      if (!code) return jsonResponse({ ok: false, error: 'bad_code' }, 500, cors);
      const state = blankLiveState({
        id: row.id,
        title: text(row.title),
        limitMs: Number(row.limit_ms) || 20000,
        items: items
      }, code, actor.sub, actor.schoolId);
      state.rev = 1;
      await env.DB.prepare(
        'INSERT INTO live_rooms (code, school_id, teacher_sub, quiz_id, state, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(code, actor.schoolId, actor.sub, row.id, JSON.stringify(state), nowIso).run();
      return jsonResponse(liveViewResponse(state, actor, nowMs), 200, cors);
    }

    const roomMatch = /^\/live\/rooms\/([A-HJ-NP-Z2-9]{6})(?:\/(join|answer|tap|advance))?$/.exec(path);
    if (!roomMatch) return jsonResponse({ ok: false, error: 'not found' }, 404, cors);
    const code = roomMatch[1];
    const action = roomMatch[2] || '';

    if (request.method === 'GET' && !action) {
      const outcome = await mutateLiveRoom(env.DB, code, nowIso, (state) => {
        if (text(state.schoolId) !== actor.schoolId) return { ok: false, error: 'not_found', status: 404, write: false };
        const isHost = actor.teacher === true && actor.sub === state.teacherSub;
        if (!isHost && !state.players.some((player) => actor.player && player.id === actor.player.id)) {
          return { ok: false, error: 'not_joined', status: 403, write: false };
        }
        const settled = settleLiveState(state, nowMs);
        return { ok: true, write: settled };
      });
      if (!outcome.ok) return jsonResponse({ ok: false, error: outcome.error }, outcome.status || 400, cors);
      return jsonResponse(liveViewResponse(outcome.state, actor, nowMs), 200, cors);
    }
    if (request.method === 'POST' && action === 'join') {
      if (!actor.player) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      let body = {};
      try { body = await readJson(request); } catch (e) { body = {}; }
      const safeBody = plainObject(body);
      const pickedAvatar = classAvatar(safeBody.avatar);
      const outcome = await mutateLiveRoom(env.DB, code, nowIso, (state) => {
        if (text(state.schoolId) !== actor.schoolId) return { ok: false, error: 'not_found', status: 404, write: false };
        const joined = joinLiveState(state, {
          id: actor.player.id,
          name: actor.player.name,
          grade: actor.player.grade,
          class: actor.player.class,
          seat: actor.player.seat,
          role: actor.player.role,
          avatar: pickedAvatar && pickedAvatar.indexOf('data:') !== 0 ? pickedAvatar : '🎵',
          signature: safeBody.signature
        }, { allowSpectate: safeBody.spectate === true });
        if (!joined.ok) {
          return { ok: false, error: joined.error, status: joined.error === 'bad_student' ? 403 : 409, write: false };
        }
        return { ok: true, write: true };
      });
      if (!outcome.ok) return jsonResponse({ ok: false, error: outcome.error }, outcome.status || 409, cors);
      return jsonResponse(liveViewResponse(outcome.state, actor, nowMs), 200, cors);
    }
    if (request.method === 'POST' && (action === 'answer' || action === 'tap')) {
      if (!actor.player) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      let body = {};
      try { body = await readJson(request); } catch (e) {
        return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
      }
      const safeBody = plainObject(body);
      const useTap = action === 'tap' || Array.isArray(safeBody.onsets) || Array.isArray(safeBody.tapTimestamps);
      const outcome = await mutateLiveRoom(env.DB, code, nowIso, (state) => {
        if (text(state.schoolId) !== actor.schoolId) return { ok: false, error: 'not_found', status: 404, write: false };
        const wasPhase = state.phase;
        const result = useTap
          ? tapLiveState(state, actor.player.id, safeBody, nowMs)
          : answerLiveState(state, actor.player.id, cleanLiveText(safeBody.choiceId, 48), nowMs);
        if (!result.ok && result.error !== 'closed') {
          const status = result.error === 'not_joined' || result.error === 'spectating' ? 403 : (result.error === 'too_early' ? 409 : 400);
          return { ok: false, error: result.error, status: status, write: false };
        }
        return { ok: result.ok, closed: !result.ok, write: result.ok || state.phase !== wasPhase };
      });
      if (!outcome.ok && !outcome.closed) return jsonResponse({ ok: false, error: outcome.error }, outcome.status || 400, cors);
      if (outcome.closed) {
        const closedView = liveViewResponse(outcome.state, actor, nowMs);
        closedView.ok = false;
        closedView.error = 'closed';
        return jsonResponse(closedView, 409, cors);
      }
      return jsonResponse(liveViewResponse(outcome.state, actor, nowMs), 200, cors);
    }
    if (request.method === 'POST' && action === 'advance') {
      let body = {};
      try { body = await readJson(request); } catch (e) { body = {}; }
      const subAction = text(plainObject(body).action);
      const outcome = await mutateLiveRoom(env.DB, code, nowIso, (state) => {
        if (text(state.schoolId) !== actor.schoolId) return { ok: false, error: 'not_found', status: 404, write: false };
        const isHost = actor.teacher === true && actor.sub === state.teacherSub;
        if (!isHost) return { ok: false, error: 'forbidden', status: 403, write: false };
        const result = advanceLiveState(state, nowMs, subAction);
        if (!result.ok) return { ok: false, error: result.error, status: 409, write: false };
        return { ok: true, finished: !!result.finished, write: true };
      });
      if (!outcome.ok) return jsonResponse({ ok: false, error: outcome.error }, outcome.status || 409, cors);
      if (outcome.finished) await saveLiveResult(env.DB, outcome.state, nowIso);
      return jsonResponse(liveViewResponse(outcome.state, actor, nowMs), 200, cors);
    }
    return jsonResponse({ ok: false, error: 'not found' }, 404, cors);
  } catch (err) {
    console.error('[noteschallenge-auth]', err && err.message ? err.message : err);
    const message = String(err && err.message ? err.message : err);
    if (/no such table/i.test(message)) return migration(cors);
    return jsonResponse({ ok: false, error: 'server error' }, 500, cors);
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (!env || !env.DB || !env.JWT_SECRET) {
        return jsonResponse({ ok: false, error: 'server not configured' }, 500, cors);
      }
      if (request.method === 'POST' && path === '/auth/google') {
        let body;
        try { body = await readJson(request); } catch (e) {
          return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
        }
        const domains = await loadSchoolDomains(env.DB);
        const verified = await verifyGoogleIdToken(body && body.credential, {
          clientId: env.GOOGLE_CLIENT_ID,
          allowedDomains: allowListFor(env, domains),
          extraEmails: env.EXTRA_ALLOWED_EMAILS,
          fetch: fetch,
          now: Date.now
        });
        if (!verified.ok) return jsonResponse({ ok: false, error: verified.error }, 401, cors);
        const schoolId = schoolForAccount(verified.claims.email, domains, env);
        const roster = await findRoster(env.DB, verified.claims.email);
        const rosterBinding = roster && rowSchool(roster) === schoolId ? bindingFromRoster(roster) : null;
        const teacher = !rosterBinding && extraEmailOk(verified.claims.email, env.EXTRA_ALLOWED_EMAILS);
        if (!rosterBinding && !teacher) return jsonResponse({ ok: false, error: 'not_on_roster' }, 403, cors);
        const nowIso = new Date().toISOString();
        const binding = teacher ? teacherBinding(verified.claims) : rosterBinding;
        const row = teacher
          ? await applyIdentity(env.DB, verified.claims, binding, nowIso)
          : await applyRoster(env.DB, verified.claims, roster, nowIso);
        const token = await signSessionToken(verified.claims, env.JWT_SECRET);
        const profile = await readProfile(env.DB, row.sub);
        return jsonResponse({
          ok: true,
          token: token,
          user: publicUser(row),
          binding: binding,
          schoolId: schoolId,
          profile: profile
        }, 200, cors);
      }

      if (path === '/class/board' && request.method === 'GET') {
        const reader = await classBoardReader(request, env, url);
        if (reader.error) return reader.error;
        const filter = reader.filter || { grade: '', class: '' };
        const cards = await listClassDirectory(env.DB, filter.grade, filter.class, reader.schoolId);
        if (!cards.length) return jsonResponse({ ok: false, error: 'unknown_class' }, 404, cors);
        const loaded = await loadPresence(env.DB);
        const before = loaded.logs.length;
        const kept = settlePresence(loaded.rows, loaded.logs, null, clockMs(env), PRESENCE_IDLE_MS);
        await savePresence(env.DB, kept, loaded.logs, before);
        return jsonResponse({
          ok: true,
          cards: cards,
          online: classOnline(kept, cards, filter.grade, filter.class, reader.schoolId),
          log: classLog(loaded.logs, filter.grade, filter.class, reader.schoolId)
        }, 200, cors);
      }

      if (path === '/class/card' && request.method === 'POST') {
        const enrolled = await enrolledClassStudent(request, env);
        if (enrolled.error) return enrolled.error;
        let body = {};
        try { body = await readJson(request); } catch (e) {
          return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
        }
        const saved = await saveClassCard(env.DB, enrolled.id, body, enrolled.schoolId, enrolled.code);
        if (saved.error) return jsonResponse({ ok: false, error: saved.error }, saved.status, cors);
        return jsonResponse({ ok: true, card: saved.card }, 200, cors);
      }

      if (path === '/class/presence' && request.method === 'POST') {
        const enrolled = await enrolledClassStudent(request, env);
        if (enrolled.error) return enrolled.error;
        let body = {};
        try { body = await readJson(request); } catch (e) {
          return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
        }
        const id = enrolled.id;
        if (claimedIdentityMismatch(body, id)) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
        const loaded = await loadPresence(env.DB);
        const before = loaded.logs.length;
        const nowMs = clockMs(env);
        let kept = settlePresence(loaded.rows, loaded.logs, body.offline === true ? null : {
          id: presenceIdFor(id, enrolled.schoolId),
          kind: 'classmate',
          displayName: id.name,
          classLabel: classLabelForStudent(id, enrolled.schoolId),
          screen: text(body.screen).slice(0, 40)
        }, nowMs, PRESENCE_IDLE_MS);
        if (body.offline === true) kept = dropOwnPresence(kept, loaded.logs, id, new Date(nowMs).toISOString(), enrolled.schoolId);
        await savePresence(env.DB, kept, loaded.logs, before);
        const cards = await listClassCards(env.DB, id.grade, id.class, enrolled.schoolId);
        return jsonResponse({
          ok: true,
          online: classOnline(kept, cards, id.grade, id.class, enrolled.schoolId)
        }, 200, cors);
      }

      if (path === '/presence' && (request.method === 'GET' || request.method === 'POST')) {
        const loaded = await loadPresence(env.DB);
        const nowMs = Date.now();
        let entry = null;
        if (request.method === 'POST') {
          let body = {};
          try { body = await readJson(request); } catch (e) {
            return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
          }
          const screen = text(body && body.screen).slice(0, 40);
          const session = await verifySessionToken(bearer(request), env.JWT_SECRET);
          if (session) {
            const row = await getUser(env.DB, session.sub);
            if (!row || text(row.email).toLowerCase() !== session.email) {
              return jsonResponse({ ok: false, error: 'unauthorized' }, 401, cors);
            }
            if (session.kind === 'code') return jsonResponse({ ok: false, error: 'not_on_roster' }, 403, cors);
            const domains = await loadSchoolDomains(env.DB);
            const schoolId = schoolForAccount(row.email, domains, env);
            const roster = await findRoster(env.DB, row.email);
            const rosterBinding = roster && rowSchool(roster) === schoolId ? bindingFromRoster(roster) : null;
            const teacher = !rosterBinding && extraEmailOk(row.email, env.EXTRA_ALLOWED_EMAILS);
            if (!rosterBinding && !teacher) return jsonResponse({ ok: false, error: 'not_on_roster' }, 403, cors);
            const binding = teacher ? teacherBinding({ name: row.student_name || row.name }) : rosterBinding;
            entry = {
              id: 'user:' + row.sub,
              kind: teacher ? 'teacher' : 'student',
              displayName: binding.name,
              classLabel: classLabelFor(binding, teacher ? 'teacher' : 'student'),
              screen: screen
            };
          } else if (text(body && body.kind) === 'tester') {
            const clientId = text(body && body.clientId);
            if (!/^[A-Za-z0-9_-]{8,40}$/.test(clientId)) {
              return jsonResponse({ ok: false, error: 'bad client' }, 400, cors);
            }
            entry = {
              id: 'tester:' + clientId,
              kind: 'tester',
              displayName: '測試人員',
              classLabel: '',
              screen: screen
            };
          } else {
            return jsonResponse({ ok: false, error: 'unauthorized' }, 401, cors);
          }
        }
        const before = loaded.logs.length;
        const kept = settlePresence(loaded.rows, loaded.logs, entry, nowMs, PRESENCE_IDLE_MS);
        await savePresence(env.DB, kept, loaded.logs, before);
        return jsonResponse({ ok: true, online: publicOnline(kept), log: publicLog(loaded.logs) }, 200, cors);
      }

      if (path === '/me' || path === '/me/binding' || path === '/me/profile') {
        const gate = await requireSession(request, env);
        if (gate.error) return gate.error;
        const row = gate.row;

        if (request.method === 'GET' && path === '/me') {
          const domains = await loadSchoolDomains(env.DB);
          const account = await resolveAccount(env, row, schoolForAccount(row.email, domains, env));
          if (!account) return jsonResponse({ ok: false, error: 'not_on_roster' }, 403, cors);
          const nowIso = new Date().toISOString();
          const next = account.teacher
            ? await applyIdentity(env.DB, row, account.binding, nowIso)
            : await applyRoster(env.DB, row, account.roster, nowIso);
          const profile = await readProfile(env.DB, next.sub);
          return jsonResponse({ ok: true, user: publicUser(next), binding: account.binding, schoolId: account.schoolId, profile: profile }, 200, cors);
        }

        if (request.method === 'PUT' && path === '/me/binding') {
          try { await readJson(request); } catch (e) {}
          const domains = await loadSchoolDomains(env.DB);
          const account = await resolveAccount(env, row, schoolForAccount(row.email, domains, env));
          if (!account) return jsonResponse({ ok: false, error: 'not_on_roster' }, 403, cors);
          const nowIso = new Date().toISOString();
          const next = account.teacher
            ? await applyIdentity(env.DB, row, account.binding, nowIso)
            : await applyRoster(env.DB, row, account.roster, nowIso);
          return jsonResponse({ ok: true, user: publicUser(next), binding: account.binding }, 200, cors);
        }

        if (request.method === 'GET' && path === '/me/profile') {
          const profile = await readProfile(env.DB, row.sub);
          return jsonResponse({ ok: true, profile: profile }, 200, cors);
        }

        if (request.method === 'PUT' && path === '/me/profile') {
          let body;
          try { body = await readJson(request); } catch (e) {
            return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
          }
          const incoming = body && body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : body;
          if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
            return jsonResponse({ ok: false, error: 'invalid profile' }, 400, cors);
          }
          const existing = await readProfile(env.DB, row.sub);
          const merged = mergeProfiles(existing, incoming);
          const packed = JSON.stringify(merged);
          if (packed.length > PROFILE_MAX_CHARS) return jsonResponse({ ok: false, error: 'profile too large' }, 413, cors);
          await writeProfile(env.DB, row.sub, merged, new Date().toISOString());
          return jsonResponse({ ok: true, profile: merged }, 200, cors);
        }
      }

      const classroom = await handleClassroom(request, env, path, cors);
      if (classroom) return classroom;

      const live = await handleLiveQuiz(request, env, path, cors);
      if (live) return live;

      const world3d = await handleWorld3D(request, env, path, cors);
      if (world3d) return world3d;

      return jsonResponse({ ok: false, error: 'not found' }, 404, cors);
    } catch (err) {
      console.error('[noteschallenge-auth]', err && err.message ? err.message : err);
      return jsonResponse({ ok: false, error: 'server error' }, 500, cors);
    }
  }
};

// =========================================================================
// 3D Music Party World — Cross-Isolate D1-Backed Server-Authoritative Sync
// Uses versioned CAS on world_rooms + per-player versioned CAS on world_players
// so concurrent requests never overwrite each other's positions, scores, or claims.
// Completely separate from /live/* classroom quizzes, Google Sheet, and radar.
// =========================================================================
export const WORLD_ACTIVE_TTL_MS = 18000;
export const WORLD_RECONNECT_GRACE_MS = 60000;
export const WORLD_RATE_LIMIT_MS = 120;
export const WORLD_ROOM_IDLE_TTL_MS = 30 * 60 * 1000;
export const WORLD_PUBLIC_IDLE_TTL_MS = 15 * 60 * 1000;
export const WORLD_HIT_COOLDOWN_MS = 750;
export const WORLD_BONK_IMMUNITY_MS = 1400;
const WORLD_KICK_TTL_MS = 120000;
const WORLD_MAX_ROOM_PLAYERS = 64;
const WORLD_DEFAULT_CODES = new Set(['MUSIC1', 'MUSIC', 'PARTY', 'LOBBY', 'DEFAULT']);

const VALID_WORLD_MODES = new Set(['mix', 'free', 'tiles', 'piano', 'gates', 'turntable', 'freeze', 'crown']);
const VALID_WORLD_TOPICS = new Set(['mixed', 'notes', 'rhythm', 'ear', 'terms']);
const VALID_WORLD_LEVELS = new Set(['auto', 'basic', 'advanced']);
const VALID_WORLD_HATS = new Set(['none', 'headphones', 'crown', 'conductor', 'star', 'note']);
const VALID_WORLD_PATTERNS = new Set(['solid', 'stripes', 'dots', 'star']);
const VALID_WORLD_FACES = new Set(['happy', 'cool', 'star', 'wink']);
const WORLD_MIX_ROTATION = ['tiles', 'piano', 'gates', 'turntable', 'crown'];
const WORLD_MODE_TIMINGS = {
  mix: { roundSec: 10.0, revealSec: 3.0 },
  tiles: { roundSec: 8.5, revealSec: 2.8 },
  piano: { roundSec: 9.5, revealSec: 2.8 },
  gates: { roundSec: 9.5, revealSec: 2.8 },
  turntable: { roundSec: 9.0, revealSec: 2.8 },
  freeze: { roundSec: 8.0, revealSec: 2.8 },
  crown: { roundSec: 16.0, revealSec: 3.5 },
  free: { roundSec: 0, revealSec: 0 }
};
const WORLD_ESCALATION_TIERS = [
  { tier: 1, label: 'Lv.1 熱身', speedMult: 1.0, timerFactor: 1.0, bpm: 120, poolMode: 'basic' },
  { tier: 2, label: 'Lv.2 加速', speedMult: 1.2, timerFactor: 0.9, bpm: 128, poolMode: 'mixed' },
  { tier: 3, label: 'Lv.3 進階', speedMult: 1.4, timerFactor: 0.8, bpm: 136, poolMode: 'mixed' },
  { tier: 4, label: 'Lv.4 極速', speedMult: 1.62, timerFactor: 0.72, bpm: 146, poolMode: 'advanced' },
  { tier: 5, label: 'Lv.5 巔峰🔥', speedMult: 1.85, timerFactor: 0.65, bpm: 156, poolMode: 'advanced' }
];
const WORLD_MODE_BASE_POINTS = {
  tiles: 150,
  piano: 165,
  gates: 170,
  turntable: 165,
  freeze: 160,
  crown: 220
};

// Deterministic challenge mirror of world-3d-logic.js for server-authoritative scoring
const WORLD_PIANO_KEYS = [
  { id: 'C4', label: 'C4 (Do)' }, { id: 'D4', label: 'D4 (Re)' }, { id: 'E4', label: 'E4 (Mi)' },
  { id: 'F4', label: 'F4 (Fa)' }, { id: 'G4', label: 'G4 (Sol)' }, { id: 'A4', label: 'A4 (La)' },
  { id: 'B4', label: 'B4 (Si)' }, { id: 'C5', label: 'C5 (高Do)' },
  { id: 'C#4', label: 'C♯4 / D♭4' }, { id: 'Eb4', label: 'E♭4 / D♯4' },
  { id: 'F#4', label: 'F♯4 / G♭4' }, { id: 'G#4', label: 'G♯4 / A♭4' }, { id: 'Bb4', label: 'B♭4 / A♯4' }
];
const WORLD_PIANO_BANK = [
  { level: 'basic', keyId: 'C4' }, { level: 'basic', keyId: 'E4' }, { level: 'basic', keyId: 'F4' },
  { level: 'basic', keyId: 'G4' }, { level: 'basic', keyId: 'A4' }, { level: 'basic', keyId: 'B4' },
  { level: 'basic', keyId: 'C5' }, { level: 'basic', keyId: 'G4' },
  { level: 'advanced', keyId: 'F#4' }, { level: 'advanced', keyId: 'Bb4' },
  { level: 'advanced', keyId: 'Eb4' }, { level: 'advanced', keyId: 'C#4' }, { level: 'advanced', keyId: 'C4' }
];
const WORLD_QUESTION_BANK = {
  notes: [
    { level: 'basic', ans: 'C4 (Do)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'D5'] },
    { level: 'basic', ans: 'D4 (Re)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'E5'] },
    { level: 'basic', ans: 'E4 (Mi)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'F5'] },
    { level: 'basic', ans: 'F4 (Fa)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'D5'] },
    { level: 'basic', ans: 'G4 (Sol)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'E5'] },
    { level: 'basic', ans: 'A4 (La)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'F5'] },
    { level: 'basic', ans: 'B4 (Si)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'D5'] },
    { level: 'basic', ans: 'C5 (Do)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5 (Do)', 'E5'] },
    { level: 'basic', ans: 'E5 (Mi)', pool: ['E5 (Mi)', 'D5 (Re)', 'C5 (Do)', 'F5 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'F4', 'D4'] },
    { level: 'advanced', ans: 'C3 (Do)', pool: ['C3 (Do)', 'A2 (La)', 'B2 (Si)', 'D3 (Re)', 'E3 (Mi)', 'F3 (Fa)', 'G3 (Sol)', 'G2', 'A3'] },
    { level: 'advanced', ans: 'F3 (Fa)', pool: ['F3 (Fa)', 'D3 (Re)', 'E3 (Mi)', 'G3 (Sol)', 'A3 (La)', 'C3 (Do)', 'B2 (Si)', 'G2', 'C4'] },
    { level: 'advanced', ans: 'C4 (中央C)', pool: ['C4 (中央C)', 'A3 (La)', 'B3 (Si)', 'G3 (Sol)', 'F3 (Fa)', 'D4 (Re)', 'E3 (Mi)', 'D3', 'G2'] },
    { level: 'advanced', ans: 'F♯4', pool: ['F♯4', 'F♭4', 'G♯4', 'E♯4', 'C♯5', 'B♭4', 'D♯4', 'A♯4', 'G4'] },
    { level: 'advanced', ans: 'B♭4', pool: ['B♭4', 'B♯4', 'E♭4', 'A♭4', 'D♭5', 'F♯4', 'G♭4', 'C5', 'A4'] },
    { level: 'advanced', ans: 'F♯', pool: ['F♯', 'B♭', 'C♯', 'E♭', 'G♯', 'A♭', 'D♯', '無升降', 'F♭'] },
    { level: 'advanced', ans: 'B♭', pool: ['B♭', 'F♯', 'E♭', 'C♯', 'A♭', 'G♯', 'D♭', '無升降', 'B♯'] }
  ],
  rhythm: [
    { level: 'basic', ans: '1 拍', pool: ['1 拍', '2 拍', '4 拍', '0.5 拍', '3 拍', '1.5 拍', '0.25 拍', '6 拍', '8 拍'] },
    { level: 'basic', ans: '2 拍', pool: ['2 拍', '1 拍', '4 拍', '0.5 拍', '3 拍', '1.5 拍', '0.25 拍', '6 拍', '8 拍'] },
    { level: 'basic', ans: '4 拍', pool: ['4 拍', '2 拍', '1 拍', '0.5 拍', '3 拍', '1.5 拍', '6 拍', '8 拍', '0.25 拍'] },
    { level: 'basic', ans: '3 拍', pool: ['3 拍', '2 拍', '4 拍', '1.5 拍', '1 拍', '0.5 拍', '2.5 拍', '6 拍', '0.75 拍'] },
    { level: 'basic', ans: '0.5 拍', pool: ['0.5 拍', '1 拍', '2 拍', '0.25 拍', '1.5 拍', '3 拍', '4 拍', '0.75 拍', '6 拍'] },
    { level: 'basic', ans: '3/4 拍', pool: ['3/4 拍', '2/4 拍', '4/4 拍', '6/8 拍', '2/2 拍', '5/4 拍', '7/8 拍', '12/8 拍', '9/8 拍'] },
    { level: 'basic', ans: '2/4 拍', pool: ['2/4 拍', '3/4 拍', '6/8 拍', '9/8 拍', '5/4 拍', '7/8 拍', '3/8 拍', '12/8 拍', '3/2 拍'] },
    { level: 'advanced', ans: '0.25 拍', pool: ['0.25 拍', '0.5 拍', '1 拍', '0.75 拍', '1.5 拍', '2 拍', '0.125 拍', '3 拍', '4 拍'] },
    { level: 'advanced', ans: '1.5 拍', pool: ['1.5 拍', '1 拍', '2 拍', '2.5 拍', '3 拍', '0.75 拍', '0.5 拍', '4 拍', '1.25 拍'] },
    { level: 'advanced', ans: '複二拍子', pool: ['複二拍子', '單三拍子', '單二拍子', '複三拍子', '單四拍子', '混合拍子', '自由拍', '複四拍子', '切分拍'] },
    { level: 'advanced', ans: '1 拍', pool: ['1 拍', '1.5 拍', '2 拍', '3 拍', '0.5 拍', '0.75 拍', '4 拍', '2.5 拍', '6 拍'] }
  ],
  ear: [
    { level: 'basic', ans: '大三和弦 Major', pool: ['大三和弦 Major', '小三和弦 Minor', '減三和弦 Dim', '增三和弦 Aug', '純五度 P5', '純八度 P8', '大二度 M2', '小二度 m2', '純四度 P4'] },
    { level: 'basic', ans: '小三和弦 Minor', pool: ['小三和弦 Minor', '大三和弦 Major', '減三和弦 Dim', '增三和弦 Aug', '純五度 P5', '純八度 P8', '大二度 M2', '小二度 m2', '純四度 P4'] },
    { level: 'basic', ans: '純八度 P8', pool: ['純八度 P8', '純五度 P5', '大三度 M3', '小三度 m3', '純四度 P4', '大二度 M2', '大六度 M6', '大七度 M7', '同度 P1'] },
    { level: 'basic', ans: '純五度 P5', pool: ['純五度 P5', '純八度 P8', '大三度 M3', '小三度 m3', '純四度 P4', '大二度 M2', '大六度 M6', '小二度 m2', '大七度 M7'] },
    { level: 'basic', ans: '大三度 M3', pool: ['大三度 M3', '小三度 m3', '純五度 P5', '純四度 P4', '純八度 P8', '大二度 M2', '小二度 m2', '大六度 M6', '小七度 m7'] },
    { level: 'advanced', ans: '小三度 m3', pool: ['小三度 m3', '大三度 M3', '純四度 P4', '純五度 P5', '大二度 M2', '小二度 m2', '純八度 P8', '大六度 M6', '增四度 A4'] },
    { level: 'advanced', ans: '減三和弦 Dim', pool: ['減三和弦 Dim', '增三和弦 Aug', '大三和弦 Major', '小三和弦 Minor', '屬七和弦 Dom7', '大七和弦 Maj7', '純五度 P5', '純四度 P4', '掛留和弦'] },
    { level: 'advanced', ans: '屬七和弦 Dom7', pool: ['屬七和弦 Dom7', '大三和弦 Major', '小三和弦 Minor', '減三和弦 Dim', '增三和弦 Aug', '純八度 P8', '純五度 P5', '小二度 m2', '空五度和弦'] },
    { level: 'advanced', ans: '純四度 P4', pool: ['純四度 P4', '純五度 P5', '大三度 M3', '小三度 m3', '大六度 M6', '純八度 P8', '小二度 m2', '大二度 M2', '大七度 M7'] }
  ],
  terms: [
    { level: 'basic', ans: 'f (Forte)', pool: ['f (Forte)', 'p (Piano)', 'pp', 'mp', 'mf', 'ff', 'cresc.', 'dim.', 'rit.'] },
    { level: 'basic', ans: 'p (Piano)', pool: ['p (Piano)', 'f (Forte)', 'ff', 'mf', 'mp', 'pp', 'cresc.', 'accel.', 'sfz'] },
    { level: 'basic', ans: 'pp', pool: ['pp', 'p', 'mp', 'mf', 'f', 'ff', 'sfz', 'cresc.', 'fp'] },
    { level: 'basic', ans: 'Allegro', pool: ['Allegro', 'Adagio', 'Andante', 'Moderato', 'Largo', 'Ritardando', 'Legato', 'Staccato', 'Fermata'] },
    { level: 'basic', ans: 'Andante', pool: ['Andante', 'Allegro', 'Presto', 'Largo', 'Vivace', 'Ritardando', 'Accelerando', 'Forte', 'Piano'] },
    { level: 'basic', ans: 'cresc.', pool: ['cresc.', 'dim.', 'rit.', 'accel.', 'stacc.', 'legato', 'pp', 'ff', 'D.C.'] },
    { level: 'basic', ans: '♯', pool: ['♯', '♭', '♮', '𝄐', '𝄋', '𝄞', '𝄢', '𝄀', '𝄂'] },
    { level: 'advanced', ans: 'rit.', pool: ['rit.', 'accel.', 'cresc.', 'dim.', 'a tempo', 'vivace', 'presto', 'sfz', 'legato'] },
    { level: 'advanced', ans: 'Presto', pool: ['Presto', 'Andante', 'Adagio', 'Moderato', 'Largo', 'Grave', 'Lento', 'Sostenuto', 'Cantabile'] },
    { level: 'advanced', ans: 'Staccato 斷奏', pool: ['Staccato 斷奏', 'Legato 連奏', 'Tenuto 保持音', 'Accent 重音', 'Fermata 延長', 'Tremolo 震音', 'Glissando 滑音', 'Pizzicato 撥奏', 'Arco 拉奏'] },
    { level: 'advanced', ans: '♮', pool: ['♮', '♯', '♭', '𝄐', '𝄪', '𝄫', '𝄞', '𝄢', '𝄋'] }
  ]
};
const WORLD_CROWN_BANK = [
  { level: 'basic', targets: ['C4 (Do)', 'E4 (Mi)', 'G4 (Sol)', 'C5', 'E5', 'G5', 'Do'], decoys: ['F♯4', 'B♭4', 'D♭', 'A♭', 'C♯', 'G♯', 'F4'] },
  { level: 'basic', targets: ['mf', 'f', 'ff', 'sfz', 'f (強)', 'ff (極強)', 'cresc.'], decoys: ['pp', 'p', 'mp', 'dim.', 'rit.', 'p (弱)', 'pp (極弱)'] },
  { level: 'basic', targets: ['♩ (1拍)', '𝅗𝅥 (2拍)', '𝅝 (4拍)', '𝅗𝅥. (3拍)', '♩', '𝅗𝅥', '𝅝'], decoys: ['♪ (0.5拍)', '𝅘𝅥𝅯 (0.25拍)', '𝄾 (休止)', '♭', '♯', '♪', '𝅘𝅥𝅯'] },
  { level: 'basic', targets: ['G4 (Sol)', 'B4 (Si)', 'D4 (Re)', 'G5', 'B3', 'D5', 'Sol'], decoys: ['F♮', 'C♯', 'E♭', 'A♭', 'C4', 'F4', 'B♭4'] },
  { level: 'advanced', targets: ['A4 (La)', 'C4 (Do)', 'E4 (Mi)', 'A3', 'C5', 'E5', 'La'], decoys: ['C♯', 'G♯', 'F♯4', 'B♭4', 'D♯', 'F4', 'B4'] },
  { level: 'advanced', targets: ['G4', 'B4', 'D5', 'F5', 'G3', 'B3', 'F4'], decoys: ['F♯4', 'C♯', 'E♭', 'A♭', 'C5', 'E4', 'B♭4'] },
  { level: 'advanced', targets: ['Allegro', 'Vivace', 'Presto', 'Allegretto', '快板', '急板', '活潑地'], decoys: ['Largo', 'Adagio', 'Grave', 'Lento', '廣板', '慢板', '行板'] },
  { level: 'advanced', targets: ['Do (宮)', 'Re (商)', 'Mi (角)', 'Sol (徵)', 'La (羽)', '宮', '徵'], decoys: ['Fa (清角)', 'Si (變宮)', 'F♯4', 'B♭4', 'E♭', 'A♭', 'C♯'] }
];

function createWorldRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWorldRng(list, rng) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function filterWorldDiff(items, levelOrTier) {
  if (typeof levelOrTier === 'number') {
    if (levelOrTier <= 1) {
      const b = items.filter((it) => it.level === 'basic');
      return b.length ? b : items;
    }
    if (levelOrTier >= 4) {
      const a = items.filter((it) => it.level === 'advanced');
      return a.length ? a : items;
    }
    return items;
  }
  if (levelOrTier === 'advanced') return items;
  const bOnly = items.filter((it) => it.level === 'basic');
  return bOnly.length ? bOnly : items;
}

export function resolveWorldChallenge(effectiveMode, topic, levelOrTier, roundSeed) {
  const rng = createWorldRng(roundSeed || 1);
  const normTopic = VALID_WORLD_TOPICS.has(topic) ? topic : 'mixed';
  const diffArg = typeof levelOrTier === 'number' ? levelOrTier : (levelOrTier === 'basic' || levelOrTier === 'advanced' ? levelOrTier : 1);

  if (effectiveMode === 'piano') {
    const pPool = filterWorldDiff(WORLD_PIANO_BANK, diffArg);
    const pq = pPool[Math.floor(rng() * pPool.length)];
    const keyDef = WORLD_PIANO_KEYS.find((k) => k.id === pq.keyId) || WORLD_PIANO_KEYS[0];
    return {
      mode: 'piano',
      ans: keyDef.label,
      targetKeyId: keyDef.id,
      options: WORLD_PIANO_KEYS.map((k) => k.label),
      correctIndex: WORLD_PIANO_KEYS.findIndex((k) => k.id === keyDef.id)
    };
  }

  if (effectiveMode === 'crown') {
    const cPool = filterWorldDiff(WORLD_CROWN_BANK, diffArg);
    const ch = cPool[Math.floor(rng() * cPool.length)];
    const rawOrbs = [];
    ch.targets.slice(0, 7).forEach((t) => rawOrbs.push({ label: t, good: true }));
    ch.decoys.slice(0, 7).forEach((d) => rawOrbs.push({ label: d, good: false }));
    const orbs = shuffleWorldRng(rawOrbs, rng).map((item) => {
      rng(); // Consume exact same angle jitter draw as world-3d-logic.js
      return { label: item.label, good: item.good };
    });
    return { mode: 'crown', orbs: orbs };
  }

  let bank = [];
  if (normTopic === 'mixed') {
    bank = bank.concat(
      filterWorldDiff(WORLD_QUESTION_BANK.notes, diffArg),
      filterWorldDiff(WORLD_QUESTION_BANK.rhythm, diffArg),
      filterWorldDiff(WORLD_QUESTION_BANK.ear, diffArg),
      filterWorldDiff(WORLD_QUESTION_BANK.terms, diffArg)
    );
  } else {
    bank = filterWorldDiff(WORLD_QUESTION_BANK[normTopic] || WORLD_QUESTION_BANK.notes, diffArg);
  }

  const q = bank[Math.floor(rng() * bank.length)];
  const distractors = shuffleWorldRng(q.pool.filter((opt) => opt !== q.ans), rng);
  const optionCount = (effectiveMode === 'gates' || effectiveMode === 'freeze' || effectiveMode === 'turntable') ? 4 : 9;
  const chosen = [q.ans].concat(distractors.slice(0, optionCount - 1));
  while (chosen.length < optionCount) chosen.push('♪');
  const options = shuffleWorldRng(chosen, rng);
  return {
    mode: effectiveMode,
    ans: q.ans,
    options: options,
    correctIndex: options.indexOf(q.ans)
  };
}

export function computeWorldRound(modeState, nowMs) {
  const mode = (modeState && WORLD_MODE_TIMINGS[modeState.mode]) ? modeState.mode : 'free';
  const cfg = WORLD_MODE_TIMINGS[mode];
  if (mode === 'free') {
    return {
      mode: 'free',
      effectiveMode: 'free',
      phase: 'idle',
      roundNum: 0,
      showRound: 0,
      showNumber: 1,
      isFinale: false,
      escalation: WORLD_ESCALATION_TIERS[0],
      timeLeft: 0,
      roundElapsedSec: 0,
      roundSeed: 0,
      roundKey: 'free'
    };
  }
  const epochMs = Number(modeState && modeState.epochMs) || nowMs;
  const baseSeed = (Number(modeState && modeState.seed) >>> 0) || 12345;
  const seq = Number(modeState && modeState.seq) || 1;
  const elapsed = Math.max(0, (nowMs - epochMs) / 1000);

  let roundNum = 0;
  let tCursor = 0;
  const maxRamp = WORLD_ESCALATION_TIERS.length - 1;
  while (roundNum < maxRamp) {
    const escLoop = WORLD_ESCALATION_TIERS[roundNum];
    const rDur = Math.max(4.5, Number((cfg.roundSec * escLoop.timerFactor).toFixed(2)));
    const cDur = rDur + cfg.revealSec;
    if (elapsed < tCursor + cDur) break;
    tCursor += cDur;
    roundNum++;
  }
  if (roundNum >= maxRamp) {
    const maxEsc = WORLD_ESCALATION_TIERS[maxRamp];
    const maxRDur = Math.max(4.5, Number((cfg.roundSec * maxEsc.timerFactor).toFixed(2)));
    const maxCDur = maxRDur + cfg.revealSec;
    const extra = Math.floor((elapsed - tCursor) / maxCDur);
    roundNum += extra;
    tCursor += extra * maxCDur;
  }

  const esc = WORLD_ESCALATION_TIERS[Math.min(maxRamp, roundNum)];
  const activeRoundSec = Math.max(4.5, Number((cfg.roundSec * esc.timerFactor).toFixed(2)));
  const cycleSec = activeRoundSec + cfg.revealSec;
  const inCycle = Math.max(0, elapsed - tCursor);
  const phase = inCycle < activeRoundSec ? 'countdown' : 'reveal';
  const timeLeft = phase === 'countdown' ? (activeRoundSec - inCycle) : (cycleSec - inCycle);
  const roundSeed = (baseSeed + Math.imul(roundNum + 1, 2654435761)) >>> 0;
  const showRound = (roundNum % 5) + 1;
  const showNumber = Math.floor(roundNum / 5) + 1;
  const isFinale = showRound === 5;
  const effectiveMode = mode === 'mix' ? WORLD_MIX_ROTATION[roundNum % WORLD_MIX_ROTATION.length] : mode;

  return {
    mode: mode,
    effectiveMode: effectiveMode,
    phase: phase,
    roundNum: roundNum,
    showRound: showRound,
    showNumber: showNumber,
    isFinale: isFinale,
    escalation: esc,
    timeLeft: Number(timeLeft.toFixed(2)),
    roundElapsedSec: Number(inCycle.toFixed(2)),
    roundSeed: roundSeed,
    roundKey: seq + '_' + mode + '_' + roundNum
  };
}

function buildRoundDescriptor(modeState, roundNum) {
  const mode = (modeState && WORLD_MODE_TIMINGS[modeState.mode]) ? modeState.mode : 'free';
  const baseSeed = (Number(modeState && modeState.seed) >>> 0) || 12345;
  const seq = Number(modeState && modeState.seq) || 1;
  const esc = WORLD_ESCALATION_TIERS[Math.min(WORLD_ESCALATION_TIERS.length - 1, Math.max(0, roundNum))];
  const showRound = (roundNum % 5) + 1;
  return {
    mode: mode,
    effectiveMode: mode === 'mix' ? WORLD_MIX_ROTATION[roundNum % WORLD_MIX_ROTATION.length] : mode,
    roundNum: roundNum,
    isFinale: showRound === 5,
    escalation: esc,
    roundSeed: (baseSeed + Math.imul(roundNum + 1, 2654435761)) >>> 0,
    roundKey: seq + '_' + mode + '_' + roundNum
  };
}

/**
 * Server-authoritative round scoring.
 * Never trusts client-supplied `points` or `won`.
 * `roundClaim.roundKey` is used ONLY for round identification & idempotent deduplication.
 */
export function evaluateWorldRoundClaim(modeState, currentRound, pRecord, rawClaim) {
  if (!modeState || modeState.mode === 'free' || !currentRound || !rawClaim || typeof rawClaim !== 'object') {
    return { applied: false, points: 0, won: false };
  }
  const claim = plainObject(rawClaim);
  const baseKey = text(claim.roundKey).slice(0, 40);
  if (!baseKey) return { applied: false, points: 0, won: false };

  // Match against current round, or immediately preceding round if within 3s rollover grace
  let targetRound = null;
  if (baseKey === currentRound.roundKey) {
    targetRound = currentRound;
  } else if (currentRound.roundNum > 0 && currentRound.roundElapsedSec <= 3.0) {
    const prev = buildRoundDescriptor(modeState, currentRound.roundNum - 1);
    if (baseKey === prev.roundKey) targetRound = prev;
  }
  if (!targetRound) return { applied: false, points: 0, won: false, reason: 'stale_round' };
  if (pRecord.spectateRoundKey && pRecord.spectateRoundKey === targetRound.roundKey) {
    return { applied: false, points: 0, won: false, reason: 'spectating' };
  }

  const dedupKey = claim.orbIndex != null
    ? (targetRound.roundKey + ':orb_' + Math.floor(Number(claim.orbIndex)))
    : targetRound.roundKey;
  if (!pRecord.awardedRounds || typeof pRecord.awardedRounds !== 'object') pRecord.awardedRounds = {};
  if (pRecord.awardedRounds[dedupKey] !== undefined) {
    return { applied: false, points: 0, won: false, reason: 'duplicate' };
  }

  const ch = resolveWorldChallenge(targetRound.effectiveMode, modeState.topic, targetRound.escalation.tier, targetRound.roundSeed);
  let won = false;
  let basePts = WORLD_MODE_BASE_POINTS[targetRound.effectiveMode] || 150;

  if (targetRound.effectiveMode === 'piano') {
    const keyId = text(claim.keyId);
    const ans = text(claim.answer);
    won = Boolean((keyId && keyId === ch.targetKeyId) || (ans && ans === ch.ans));
  } else if (targetRound.effectiveMode === 'crown') {
    if (claim.orbIndex != null) {
      const idx = Math.floor(Number(claim.orbIndex));
      won = Boolean(ch.orbs && ch.orbs[idx] && ch.orbs[idx].good === true);
      basePts = 65;
    } else if (claim.reachedCrown === true) {
      const cx = clampCoord(pRecord.x, -75, 75);
      const cz = clampCoord(pRecord.z, -75, 75);
      const cy = clampCoord(pRecord.y, -30, 50);
      won = Math.hypot(cx, cz) <= 6.5 && cy >= 1.2;
      basePts = 220;
    }
  } else if (targetRound.effectiveMode === 'turntable') {
    const sector = claim.sector != null ? Math.floor(Number(claim.sector)) : -1;
    const ans = text(claim.answer);
    won = Boolean((sector >= 0 && sector === ch.correctIndex) || (ans && ans === ch.ans));
  } else {
    // tiles, gates, freeze
    const optIdx = claim.optionIndex != null ? Math.floor(Number(claim.optionIndex)) : -1;
    const ans = text(claim.answer);
    won = Boolean((optIdx >= 0 && optIdx === ch.correctIndex) || (ans && ans === ch.ans));
  }

  const nextStreak = won ? Math.min(9999, num(pRecord.streak) + 1) : 0;
  const streakMult = nextStreak >= 5 ? 3 : (nextStreak >= 3 ? 2 : 1);
  const finaleMult = targetRound.isFinale ? 2 : 1;
  const points = won ? Math.min(600, basePts * streakMult * finaleMult) : 0;

  pRecord.awardedRounds[dedupKey] = points;
  const keys = Object.keys(pRecord.awardedRounds);
  if (keys.length > 48) delete pRecord.awardedRounds[keys[0]];

  if (won) {
    pRecord.score = Math.min(999999, num(pRecord.score) + points);
    pRecord.streak = nextStreak;
  } else if (claim.orbIndex == null) {
    pRecord.streak = 0;
  }
  return { applied: true, points: points, won: won };
}

function clampCoord(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
}

function cleanWorldRoomCode(raw) {
  const code = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16);
  return code.length >= 3 ? code : '';
}

function worldStorageCode(roomCode, actor) {
  // Default/shared room codes (like MUSIC1) are always scoped per school or public so they never leak across classrooms
  if (WORLD_DEFAULT_CODES.has(roomCode)) {
    return (actor && actor.authenticated && actor.schoolId ? ('s:' + actor.schoolId) : 'pub') + ':' + roomCode;
  }
  return roomCode;
}

function cleanWorldName(raw) {
  const out = text(raw).replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  if (!out || out.indexOf('@') !== -1) return '';
  return out.slice(0, 24);
}

async function resolveWorldActor(request, env, body) {
  const token = bearer(request);
  if (token) {
    const actor = await liveActor(request, env);
    if (actor.error) return { error: actor.error };
    if (actor.teacher) {
      const userRow = await getUser(env.DB, actor.sub);
      const tName = cleanWorldName(userRow && (userRow.student_name || userRow.name)) || '老師';
      return {
        authenticated: true,
        teacher: true,
        schoolId: actor.schoolId,
        id: 'teacher:' + actor.sub,
        clientKey: 'auth:' + actor.sub,
        name: tName,
        grade: '',
        class: '',
        seat: '',
        avatar: '🎓'
      };
    }
    return {
      authenticated: true,
      teacher: false,
      schoolId: actor.schoolId,
      id: actor.player.id,
      clientKey: 'auth:' + actor.player.id,
      name: actor.player.name,
      grade: actor.player.grade,
      class: actor.player.class,
      seat: actor.player.seat,
      avatar: '🎵'
    };
  }
  const pid = text(body && body.id).replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 48);
  const clientKey = text(body && body.clientKey).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  if (!pid || pid.length < 4) return { error: jsonResponse({ ok: false, error: 'missing_id' }, 400, corsHeaders(request)) };
  if (!clientKey || clientKey.length < 12) return { error: jsonResponse({ ok: false, error: 'auth_or_key_required' }, 401, corsHeaders(request)) };
  const name = cleanWorldName(body && body.name) || '玩家';
  return {
    authenticated: false,
    teacher: false,
    schoolId: 'public',
    id: pid,
    clientKey: clientKey,
    name: name,
    grade: cleanLiveText(body && body.grade, 8),
    class: cleanLiveText(body && body.class, 8),
    seat: cleanLiveText(body && body.seat, 8),
    avatar: classAvatar(body && body.avatar) || '🎵'
  };
}

async function readWorldRoomRow(db, storageCode) {
  const row = await db.prepare('SELECT code, school_id, host_id, version, state, updated_at FROM world_rooms WHERE code = ?').bind(storageCode).first();
  if (!row) return null;
  let state = null;
  try { state = JSON.parse(row.state); } catch (e) { state = null; }
  if (!state || typeof state !== 'object') return null;
  if (!state.kicked || typeof state.kicked !== 'object') state.kicked = {};
  return { version: Math.max(1, num(row.version) || 1), state: state };
}

async function readWorldPlayers(db, storageCode) {
  const loaded = await db.prepare('SELECT player_id, version, state FROM world_players WHERE room_code = ?').bind(storageCode).all();
  const rows = (loaded && loaded.results) || [];
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const p = JSON.parse(rows[i].state);
      if (p && p.id) out.push({ version: Math.max(1, num(rows[i].version) || 1), player: p });
    } catch (e) {}
  }
  return out;
}

async function readSingleWorldPlayer(db, storageCode, playerId) {
  const row = await db.prepare('SELECT player_id, version, state FROM world_players WHERE room_code = ? AND player_id = ?').bind(storageCode, playerId).first();
  if (!row) return null;
  try {
    const p = JSON.parse(row.state);
    if (p && p.id) return { version: Math.max(1, num(row.version) || 1), player: p };
  } catch (e) {}
  return null;
}

async function deleteWorldPlayer(db, storageCode, playerId) {
  await db.prepare('DELETE FROM world_players WHERE room_code = ? AND player_id = ?').bind(storageCode, playerId).run();
}

async function clearWorldRoomPlayers(db, storageCode) {
  await db.prepare('DELETE FROM world_players WHERE room_code = ?').bind(storageCode).run();
}

function isWorldRoomExpired(state, nowMs) {
  if (!state) return true;
  const ttl = state.schoolId === 'public' ? WORLD_PUBLIC_IDLE_TTL_MS : WORLD_ROOM_IDLE_TTL_MS;
  const exp = num(state.expiresAt) || (num(state.lastActivityAt) + ttl);
  return exp > 0 && nowMs > exp;
}

function createFreshRoomState(storageCode, displayCode, actor, initMs, nowMs) {
  const ttl = actor.schoolId === 'public' ? WORLD_PUBLIC_IDLE_TTL_MS : WORLD_ROOM_IDLE_TTL_MS;
  return {
    v: 3,
    storageCode: storageCode,
    code: displayCode,
    schoolId: actor.schoolId,
    hostId: actor.id,
    hostClientKey: actor.clientKey,
    teacherHosted: actor.teacher === true,
    requireAuth: actor.teacher === true,
    createdAt: nowMs,
    lastActivityAt: nowMs,
    expiresAt: nowMs + ttl,
    modeState: {
      mode: VALID_WORLD_MODES.has(initMs.mode) ? initMs.mode : 'mix',
      topic: VALID_WORLD_TOPICS.has(initMs.topic) ? initMs.topic : 'mixed',
      level: VALID_WORLD_LEVELS.has(initMs.level) ? initMs.level : 'auto',
      epochMs: nowMs,
      seed: (Math.floor(Number(initMs.seed)) >>> 0) || ((nowMs ^ 0x5a3c91) >>> 0),
      seq: 1,
      hostId: actor.id,
      hostName: actor.name,
      ts: nowMs
    },
    kicked: {}
  };
}

function applyWorldModeSwitch(state, actor, ms, nowMs) {
  const nextMode = VALID_WORLD_MODES.has(ms && ms.mode) ? ms.mode : (state.modeState ? state.modeState.mode : 'mix');
  const nextTopic = VALID_WORLD_TOPICS.has(ms && ms.topic) ? ms.topic : (state.modeState ? state.modeState.topic : 'mixed');
  const nextLevel = VALID_WORLD_LEVELS.has(ms && ms.level) ? ms.level : 'auto';
  const nextSeed = (Math.floor(Number(ms && ms.seed)) >>> 0) || ((nowMs ^ 0x5a3c91) >>> 0);
  const nextSeq = state.modeState ? (num(state.modeState.seq) + 1) : 1;
  state.modeState = {
    mode: nextMode,
    topic: nextTopic,
    level: nextLevel,
    epochMs: nowMs,
    seed: nextSeed,
    seq: nextSeq,
    hostId: actor.id,
    hostName: actor.name,
    ts: nowMs
  };
  const ttl = state.schoolId === 'public' ? WORLD_PUBLIC_IDLE_TTL_MS : WORLD_ROOM_IDLE_TTL_MS;
  state.lastActivityAt = nowMs;
  state.expiresAt = nowMs + ttl;
}

async function mutateWorldRoomCas(db, storageCode, nowIso, mutator) {
  const MAX_RETRIES = 12;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const rec = await readWorldRoomRow(db, storageCode);
    const outcome = await mutator(rec);
    if (!outcome || outcome.write !== true) {
      return Object.assign({ state: rec ? rec.state : null, version: rec ? rec.version : 0 }, outcome || { ok: true });
    }
    const nextState = outcome.state;
    if (outcome.isNew) {
      try {
        await db.prepare(
          'INSERT INTO world_rooms (code, school_id, host_id, version, state, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(storageCode, nextState.schoolId, nextState.hostId, 1, JSON.stringify(nextState), nowIso).run();
        return Object.assign({ state: nextState, version: 1, retries: attempt }, outcome);
      } catch (err) {
        // Concurrent INSERT race: retry against newly created row
        await casYield(attempt + 1);
        continue;
      }
    }
    const nextVer = rec.version + 1;
    const res = await db.prepare(
      'UPDATE world_rooms SET school_id = ?, host_id = ?, version = ?, state = ?, updated_at = ? WHERE code = ? AND version = ?'
    ).bind(nextState.schoolId, nextState.hostId, nextVer, JSON.stringify(nextState), nowIso, storageCode, rec.version).run();
    if (casSucceeded(res)) {
      return Object.assign({ state: nextState, version: nextVer, retries: attempt }, outcome);
    }
    await casYield(attempt + 1);
  }
  return { ok: false, error: 'busy', status: 409 };
}

async function mutateWorldPlayerCas(db, storageCode, playerId, nowIso, mutator) {
  const MAX_RETRIES = 12;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const rec = await readSingleWorldPlayer(db, storageCode, playerId);
    const outcome = mutator(rec);
    if (!outcome || outcome.write !== true) {
      return Object.assign({ player: rec ? rec.player : null }, outcome || { ok: true });
    }
    const nextPlayer = outcome.player;
    if (!rec) {
      try {
        await db.prepare(
          'INSERT INTO world_players (room_code, player_id, version, state, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(storageCode, playerId, 1, JSON.stringify(nextPlayer), nowIso).run();
        return Object.assign({ player: nextPlayer, version: 1, retries: attempt }, outcome);
      } catch (err) {
        // Concurrent INSERT race for same player: retry via UPDATE CAS
        await casYield(attempt + 1);
        continue;
      }
    }
    const nextVer = rec.version + 1;
    const res = await db.prepare(
      'UPDATE world_players SET version = ?, state = ?, updated_at = ? WHERE room_code = ? AND player_id = ? AND version = ?'
    ).bind(nextVer, JSON.stringify(nextPlayer), nowIso, storageCode, playerId, rec.version).run();
    if (casSucceeded(res)) {
      return Object.assign({ player: nextPlayer, version: nextVer, retries: attempt }, outcome);
    }
    await casYield(attempt + 1);
  }
  return { ok: false, error: 'busy', status: 409 };
}

function publicWorldPlayersList(playerRows, roomState, currentRoundKey, nowMs) {
  const active = [];
  for (let i = 0; i < playerRows.length; i++) {
    const p = playerRows[i].player;
    if (!p || nowMs - num(p.ts) > WORLD_ACTIVE_TTL_MS) continue;
    const spectating = Boolean(p.spectateRoundKey && p.spectateRoundKey === currentRoundKey);
    active.push({
      id: p.id,
      name: p.name,
      grade: p.grade || '',
      class: p.class || '',
      seat: p.seat || '',
      avatar: p.avatar || '🎵',
      skin: p.skin,
      hat: p.hat,
      pattern: p.pattern || 'solid',
      face: p.face || 'happy',
      x: p.x,
      y: p.y,
      z: p.z,
      vx: p.vx,
      vz: p.vz,
      yaw: p.yaw,
      dive: !!p.dive,
      bonked: Boolean(p.bonkedAt && (nowMs - num(p.bonkedAt) < 650)),
      emote: p.emote || '',
      score: num(p.score),
      streak: num(p.streak),
      spectating: spectating,
      isHost: p.id === roomState.hostId
    });
  }
  return active.slice(0, 50);
}

async function handleWorld3D(request, env, path, cors) {
  if ((path !== '/world/sync' && path !== '/world/host') || request.method !== 'POST') return null;
  const nowMs = clockMs(env);
  const nowIso = new Date(nowMs).toISOString();
  try {
    let body = null;
    try { body = await readJson(request); } catch (e) {
      return jsonResponse({ ok: false, error: 'bad_json' }, 400, cors);
    }
    const safeBody = plainObject(body);
    const displayRoom = cleanWorldRoomCode(safeBody.room);
    if (!displayRoom) return jsonResponse({ ok: false, error: 'bad_room_code' }, 400, cors);

    const actor = await resolveWorldActor(request, env, safeBody);
    if (actor.error) return actor.error;

    const storageCode = worldStorageCode(displayRoom, actor);

    if (path === '/world/host') {
      const action = text(safeBody.action);
      const targetId = text(safeBody.targetId).slice(0, 80);
      const roomOutcome = await mutateWorldRoomCas(env.DB, storageCode, nowIso, async (rec) => {
        if (!rec || isWorldRoomExpired(rec.state, nowMs)) {
          return { ok: false, error: 'not_found', status: 404, write: false };
        }
        const st = rec.state;
        const isTeacherHost = actor.teacher && (st.schoolId === actor.schoolId || st.schoolId === 'public');
        const isCurrentHost = actor.id === st.hostId && (actor.authenticated || st.hostClientKey === actor.clientKey);
        if (!isTeacherHost && !isCurrentHost) {
          return { ok: false, error: 'forbidden', status: 403, write: false };
        }
        if (actor.teacher) {
          st.schoolId = actor.schoolId;
          st.hostId = actor.id;
          st.hostClientKey = actor.clientKey;
          st.teacherHosted = true;
          st.requireAuth = true;
        }
        if (action === 'switch_mode' || action === 'reset_round') {
          applyWorldModeSwitch(st, actor, plainObject(safeBody.modeState), nowMs);
        } else if (action === 'kick') {
          if (!targetId || targetId === actor.id) return { ok: false, error: 'bad_target', status: 400, write: false };
          st.kicked[targetId] = nowMs + WORLD_KICK_TTL_MS;
        } else if (action === 'transfer_host') {
          if (!targetId) return { ok: false, error: 'bad_target', status: 400, write: false };
          const targetRec = await readSingleWorldPlayer(env.DB, storageCode, targetId);
          if (!targetRec) return { ok: false, error: 'not_found', status: 404, write: false };
          st.hostId = targetId;
          st.hostClientKey = targetRec.player.clientKey;
          st.teacherHosted = targetRec.player.teacher === true;
          if (st.modeState) {
            st.modeState.hostId = targetId;
            st.modeState.hostName = targetRec.player.name;
          }
        } else {
          return { ok: false, error: 'bad_action', status: 400, write: false };
        }
        return { ok: true, state: st, write: true };
      });
      if (!roomOutcome.ok) return jsonResponse({ ok: false, error: roomOutcome.error }, roomOutcome.status || 400, cors);
      if (action === 'kick' && targetId) {
        await deleteWorldPlayer(env.DB, storageCode, targetId);
      }
      const roundInfo = computeWorldRound(roomOutcome.state.modeState, nowMs);
      const playerRows = await readWorldPlayers(env.DB, storageCode);
      return jsonResponse({
        ok: true,
        room: displayRoom,
        maxPlayers: 50,
        serverTime: nowMs,
        hostId: roomOutcome.state.hostId,
        players: publicWorldPlayersList(playerRows, roomOutcome.state, roundInfo.roundKey, nowMs),
        modeState: roomOutcome.state.modeState,
        roundInfo: roundInfo
      }, 200, cors);
    }

    // POST /world/sync — Step 1: Ensure / validate room row with version CAS
    const initMs = plainObject(safeBody.modeState);
    const roomOutcome = await mutateWorldRoomCas(env.DB, storageCode, nowIso, async (rec) => {
      if (!rec) {
        const fresh = createFreshRoomState(storageCode, displayRoom, actor, initMs, nowMs);
        return { ok: true, isNew: true, wasReset: false, state: fresh, write: true };
      }
      const st = rec.state;
      // Expire idle rooms cleanly so default rooms like MUSIC1 never persist indefinitely
      if (isWorldRoomExpired(st, nowMs)) {
        const fresh = createFreshRoomState(storageCode, displayRoom, actor, initMs, nowMs);
        return { ok: true, isNew: false, wasReset: true, state: fresh, write: true };
      }
      // Teacher-hosted rooms STRICTLY block unauthenticated guests and other schools
      if (st.requireAuth || st.teacherHosted) {
        if (!actor.authenticated) {
          return { ok: false, error: 'classroom_auth_required', status: 401, write: false };
        }
        if (st.schoolId !== 'public' && actor.schoolId !== st.schoolId) {
          return { ok: false, error: 'wrong_school', status: 403, write: false };
        }
      }
      if (st.kicked && st.kicked[actor.id] && nowMs < num(st.kicked[actor.id])) {
        return { ok: false, error: 'kicked', status: 403, write: false };
      }

      let dirty = false;
      // Clean expired kicks
      if (st.kicked) {
        for (const kId of Object.keys(st.kicked)) {
          if (nowMs >= num(st.kicked[kId])) {
            delete st.kicked[kId];
            dirty = true;
          }
        }
      }
      // Teacher joining their school's room claims host & locks auth requirement
      if (actor.teacher && (st.schoolId === 'public' || st.schoolId === actor.schoolId) && (st.hostId !== actor.id || !st.teacherHosted)) {
        st.schoolId = actor.schoolId;
        st.hostId = actor.id;
        st.hostClientKey = actor.clientKey;
        st.teacherHosted = true;
        st.requireAuth = true;
        if (st.modeState) {
          st.modeState.hostId = actor.id;
          st.modeState.hostName = actor.name;
        }
        dirty = true;
      }
      // Host-only mode switch via /world/sync
      const isHost = actor.id === st.hostId && (actor.authenticated || st.hostClientKey === actor.clientKey);
      if (isHost && safeBody.modeState && typeof safeBody.modeState === 'object' && safeBody.modeState.resetEpoch === true) {
        applyWorldModeSwitch(st, actor, plainObject(safeBody.modeState), nowMs);
        dirty = true;
      }
      // Refresh room expiry periodically (>60s since lastActivityAt) without causing write contention on every heartbeat
      const ttl = st.schoolId === 'public' ? WORLD_PUBLIC_IDLE_TTL_MS : WORLD_ROOM_IDLE_TTL_MS;
      if (nowMs - num(st.lastActivityAt) > 60000) {
        st.lastActivityAt = nowMs;
        st.expiresAt = nowMs + ttl;
        dirty = true;
      }
      return { ok: true, isNew: false, wasReset: false, state: st, write: dirty };
    });

    if (!roomOutcome.ok) {
      return jsonResponse({ ok: false, error: roomOutcome.error }, roomOutcome.status || 400, cors);
    }
    if (roomOutcome.wasReset) {
      await clearWorldRoomPlayers(env.DB, storageCode);
    }

    const roomState = roomOutcome.state;
    const roundInfo = computeWorldRound(roomState.modeState, nowMs);

    // Check active player count for brand-new join capacity
    const preRows = await readWorldPlayers(env.DB, storageCode);
    const activeCount = preRows.filter((r) => nowMs - num(r.player.ts) <= WORLD_ACTIVE_TTL_MS).length;
    const alreadyExists = preRows.some((r) => r.player.id === actor.id);
    if (!alreadyExists && activeCount >= WORLD_MAX_ROOM_PLAYERS) {
      return jsonResponse({ ok: false, error: 'room_full', maxPlayers: 50 }, 429, cors);
    }

    // Step 2: Update ONLY this player's row in world_players with version CAS
    const rawHat = text(safeBody.hat).toLowerCase();
    const rawPattern = text(safeBody.pattern).toLowerCase();
    const rawFace = text(safeBody.face).toLowerCase();
    const playerOutcome = await mutateWorldPlayerCas(env.DB, storageCode, actor.id, nowIso, (rec) => {
      const existing = rec ? rec.player : null;
      const withinGrace = existing && (nowMs - num(existing.ts) <= WORLD_ACTIVE_TTL_MS + WORLD_RECONNECT_GRACE_MS);
      const isReconnect = Boolean(existing && withinGrace && (nowMs - num(existing.ts) > WORLD_ACTIVE_TTL_MS));

      if (existing && withinGrace && !actor.authenticated && existing.clientKey !== actor.clientKey) {
        return { ok: false, error: 'id_conflict', status: 403, write: false };
      }

      if (existing && !isReconnect && (nowMs - num(existing.ts) < WORLD_RATE_LIMIT_MS) && !safeBody.roundClaim && !safeBody.hitEvent) {
        return { ok: true, throttled: true, reconnected: false, player: existing, write: false };
      }

      const hat = VALID_WORLD_HATS.has(rawHat) ? rawHat : (existing && withinGrace ? existing.hat : 'none');
      const pattern = VALID_WORLD_PATTERNS.has(rawPattern) ? rawPattern : (existing && withinGrace && existing.pattern ? existing.pattern : 'solid');
      const face = VALID_WORLD_FACES.has(rawFace) ? rawFace : (existing && withinGrace && existing.face ? existing.face : 'happy');
      const skin = Number(safeBody.skin) || (existing && withinGrace ? existing.skin : 0xf59e0b);
      let pRecord;

      if (existing && withinGrace) {
        pRecord = Object.assign({}, existing);
        pRecord.awardedRounds = Object.assign({}, existing.awardedRounds || {});
        if (isReconnect) {
          pRecord.spectateRoundKey = '';
        }
      } else {
        const joinedMidRound = !roomOutcome.isNew && roomState.modeState && roomState.modeState.mode !== 'free' &&
          (roundInfo.phase === 'reveal' || (roundInfo.phase === 'countdown' && roundInfo.roundElapsedSec > 2.5));
        pRecord = {
          id: actor.id,
          name: actor.name,
          grade: actor.grade,
          class: actor.class,
          seat: actor.seat,
          avatar: actor.avatar,
          teacher: actor.teacher === true,
          clientKey: actor.clientKey,
          skin: skin,
          hat: hat,
          pattern: pattern,
          face: face,
          score: 0,
          streak: 0,
          awardedRounds: {},
          spectateRoundKey: joinedMidRound ? roundInfo.roundKey : '',
          joinedAt: nowMs,
          ts: nowMs
        };
      }

      pRecord.name = actor.name;
      pRecord.grade = actor.grade;
      pRecord.class = actor.class;
      pRecord.seat = actor.seat;
      pRecord.avatar = actor.avatar;
      pRecord.skin = skin;
      pRecord.hat = hat;
      pRecord.pattern = pattern;
      pRecord.face = face;
      if (safeBody.x !== undefined) pRecord.x = clampCoord(safeBody.x, -75, 75);
      else if (pRecord.x === undefined) pRecord.x = 0;
      if (safeBody.y !== undefined) pRecord.y = clampCoord(safeBody.y, -30, 50);
      else if (pRecord.y === undefined) pRecord.y = 0;
      if (safeBody.z !== undefined) pRecord.z = clampCoord(safeBody.z, -75, 75);
      else if (pRecord.z === undefined) pRecord.z = 0;
      if (safeBody.vx !== undefined) pRecord.vx = Number(clampCoord(safeBody.vx, -25, 25).toFixed(2));
      else if (pRecord.vx === undefined) pRecord.vx = 0;
      if (safeBody.vz !== undefined) pRecord.vz = Number(clampCoord(safeBody.vz, -25, 25).toFixed(2));
      else if (pRecord.vz === undefined) pRecord.vz = 0;
      if (safeBody.yaw !== undefined) pRecord.yaw = Number(clampCoord(safeBody.yaw, -Math.PI * 4, Math.PI * 4).toFixed(2));
      else if (pRecord.yaw === undefined) pRecord.yaw = 0;
      if (safeBody.dive !== undefined) pRecord.dive = !!safeBody.dive;
      else if (pRecord.dive === undefined) pRecord.dive = false;
      if (safeBody.emote !== undefined) pRecord.emote = text(safeBody.emote).slice(0, 8);
      else if (pRecord.emote === undefined) pRecord.emote = '';
      pRecord.ts = nowMs;

      if (pRecord.spectateRoundKey && pRecord.spectateRoundKey !== roundInfo.roundKey) {
        pRecord.spectateRoundKey = '';
      }

      // Deliver and clear any pending knockback bonk from another player
      let deliveredBonk = null;
      if (pRecord.pendingBonk && typeof pRecord.pendingBonk === 'object') {
        if (nowMs - num(pRecord.pendingBonk.ts) <= 3000) {
          deliveredBonk = pRecord.pendingBonk;
        }
        pRecord.pendingBonk = null;
      }

      // Rate-limit player-to-player hitEvent (active players only)
      let hitAllowed = false;
      const isSpectatingNow = Boolean(pRecord.spectateRoundKey && pRecord.spectateRoundKey === roundInfo.roundKey);
      if (!isSpectatingNow && safeBody.hitEvent && typeof safeBody.hitEvent === 'object') {
        if (nowMs - num(pRecord.lastHitAt) >= WORLD_HIT_COOLDOWN_MS) {
          pRecord.lastHitAt = nowMs;
          hitAllowed = true;
        }
      }

      // Server-authoritative round scoring (never trusts client points/won!)
      let claimResult = null;
      if (safeBody.roundClaim && typeof safeBody.roundClaim === 'object') {
        claimResult = evaluateWorldRoundClaim(roomState.modeState, roundInfo, pRecord, safeBody.roundClaim);
      }

      return {
        ok: true,
        throttled: false,
        reconnected: isReconnect,
        claimResult: claimResult,
        deliveredBonk: deliveredBonk,
        hitAllowed: hitAllowed,
        player: pRecord,
        write: true
      };
    });

    if (!playerOutcome.ok) {
      return jsonResponse({ ok: false, error: playerOutcome.error }, playerOutcome.status || 400, cors);
    }

    const me = playerOutcome.player;

    // Step 2b: Apply server-validated playful knockback to nearby targets via per-player CAS
    let appliedHitCount = 0;
    if (playerOutcome.hitAllowed && safeBody.hitEvent && typeof safeBody.hitEvent === 'object') {
      const ev = plainObject(safeBody.hitEvent);
      const kind = ev.kind === 'dive' ? 'dive' : 'boop';
      const maxRange = kind === 'dive' ? 3.8 : 5.6;
      const power = kind === 'dive' ? 16.0 : 12.5;
      const hitId = text(ev.id).slice(0, 40) || ('hit_' + nowMs + '_' + me.id.slice(-4));
      const rawTargets = Array.isArray(ev.targetIds) ? ev.targetIds : [];
      const uniqTargets = [];
      for (let i = 0; i < rawTargets.length && uniqTargets.length < 6; i++) {
        const tid = text(rawTargets[i]).slice(0, 64);
        if (tid && tid !== me.id && !uniqTargets.includes(tid)) uniqTargets.push(tid);
      }
      for (let i = 0; i < uniqTargets.length; i++) {
        const tid = uniqTargets[i];
        const bonkRes = await mutateWorldPlayerCas(env.DB, storageCode, tid, nowIso, (tRec) => {
          if (!tRec || !tRec.player) return { ok: false, write: false };
          const target = tRec.player;
          if (nowMs - num(target.ts) > WORLD_ACTIVE_TTL_MS) return { ok: false, write: false };
          if (nowMs < num(target.bonkImmuneUntil)) return { ok: false, write: false };
          const dx = num(target.x) - num(me.x);
          const dz = num(target.z) - num(me.z);
          const dist = Math.hypot(dx, dz);
          if (dist > maxRange) return { ok: false, write: false };
          let nx = dist > 0.05 ? (dx / dist) : Math.sin(num(me.yaw));
          let nz = dist > 0.05 ? (dz / dist) : Math.cos(num(me.yaw));
          const mag = Math.hypot(nx, nz) || 1;
          nx /= mag;
          nz /= mag;
          const nextTarget = Object.assign({}, target);
          nextTarget.pendingBonk = {
            id: hitId,
            byId: me.id,
            byName: me.name,
            vx: Number((nx * power).toFixed(2)),
            vz: Number((nz * power).toFixed(2)),
            vy: kind === 'dive' ? 7.2 : 6.2,
            kind: kind,
            ts: nowMs
          };
          nextTarget.bonkImmuneUntil = nowMs + WORLD_BONK_IMMUNITY_MS;
          nextTarget.bonkedAt = nowMs;
          return { ok: true, hit: true, player: nextTarget, write: true };
        });
        if (bonkRes && bonkRes.hit) appliedHitCount += 1;
      }
    }

    // Re-read fresh room player list (includes all concurrent peers!)
    const freshRows = await readWorldPlayers(env.DB, storageCode);
    // Clean up stale player rows expired beyond grace period (opportunistic hygiene)
    for (let i = 0; i < freshRows.length; i++) {
      const rp = freshRows[i].player;
      if (nowMs - num(rp.ts) > WORLD_ACTIVE_TTL_MS + WORLD_RECONNECT_GRACE_MS) {
        await deleteWorldPlayer(env.DB, storageCode, rp.id);
      }
    }

    return jsonResponse({
      ok: true,
      throttled: !!playerOutcome.throttled,
      room: displayRoom,
      maxPlayers: 50,
      serverTime: nowMs,
      hostId: roomState.hostId,
      self: {
        id: me.id,
        score: num(me.score),
        streak: num(me.streak),
        isHost: me.id === roomState.hostId,
        spectating: Boolean(me.spectateRoundKey && me.spectateRoundKey === roundInfo.roundKey),
        reconnected: !!playerOutcome.reconnected,
        lastClaim: playerOutcome.claimResult || null,
        bonk: playerOutcome.deliveredBonk || null,
        lastHitCount: appliedHitCount
      },
      players: publicWorldPlayersList(freshRows, roomState, roundInfo.roundKey, nowMs),
      modeState: roomState.modeState,
      roundInfo: roundInfo
    }, 200, cors);
  } catch (err) {
    console.error('[noteschallenge-auth]', err && err.message ? err.message : err);
    const message = String(err && err.message ? err.message : err);
    if (/no such table/i.test(message)) return migration(cors);
    return jsonResponse({ ok: false, error: 'server error' }, 500, cors);
  }
}

