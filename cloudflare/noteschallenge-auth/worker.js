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

      return jsonResponse({ ok: false, error: 'not found' }, 404, cors);
    } catch (err) {
      console.error('[noteschallenge-auth]', err && err.message ? err.message : err);
      return jsonResponse({ ok: false, error: 'server error' }, 500, cors);
    }
  }
};
