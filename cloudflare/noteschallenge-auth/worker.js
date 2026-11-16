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
 */

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
const JWKS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SEC = 60;
const PROFILE_MAX_CHARS = 200000;
const PRESENCE_IDLE_MS = 3 * 60 * 1000;

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
        game: text(item.game).slice(0, 20),
        score: num(item.score),
        accuracy: Math.min(100, num(item.accuracy)),
        maxCombo: num(item.maxCombo)
      };
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
  const body = jsonB64url({
    sub: claims.sub,
    email: claims.email,
    iat: nowSec,
    exp: nowSec + SESSION_TTL_SEC
  });
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
  return { sub: text(payload.sub), email: text(payload.email).toLowerCase() };
}

export function allowedOrigin(origin) {
  const o = text(origin);
  if (o === 'https://musiceducation.github.io') return o;
  if (/^http:\/\/localhost(?::\d+)?$/.test(o)) return o;
  if (/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(o)) return o;
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
  return {
    grade: String(roster.grade).trim(),
    class: String(roster.class).trim().toUpperCase(),
    name: String(roster.student_name).trim(),
    seat: text(roster.seat)
  };
}

function publicUser(row) {
  return {
    sub: row.sub,
    email: row.email,
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
  return db.prepare(
    'SELECT email, grade, class, student_name, seat FROM roster WHERE lower(email) = lower(?)'
  ).bind(text(email).toLowerCase()).first();
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
  return rows.map((row) => ({
    name: row.display_name,
    classLabel: row.class_label || '',
    kind: row.kind
  }));
}

function publicLog(logs) {
  return logs.slice(-80).reverse().map((row) => ({
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

async function resolveAccount(env, row) {
  const roster = await findRoster(env.DB, row.email);
  const rosterBinding = bindingFromRoster(roster);
  if (rosterBinding) return { binding: rosterBinding, roster: roster, teacher: false };
  if (extraEmailOk(row.email, env.EXTRA_ALLOWED_EMAILS)) {
    return { binding: teacherBinding({ name: row.student_name || row.name }), roster: null, teacher: true };
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
        const verified = await verifyGoogleIdToken(body && body.credential, {
          clientId: env.GOOGLE_CLIENT_ID,
          allowedDomains: env.ALLOWED_EMAIL_DOMAINS,
          extraEmails: env.EXTRA_ALLOWED_EMAILS,
          fetch: fetch,
          now: Date.now
        });
        if (!verified.ok) return jsonResponse({ ok: false, error: verified.error }, 401, cors);
        const roster = await findRoster(env.DB, verified.claims.email);
        const rosterBinding = bindingFromRoster(roster);
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
          profile: profile
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
            const roster = await findRoster(env.DB, row.email);
            const rosterBinding = bindingFromRoster(roster);
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
          const account = await resolveAccount(env, row);
          if (!account) return jsonResponse({ ok: false, error: 'not_on_roster' }, 403, cors);
          const nowIso = new Date().toISOString();
          const next = account.teacher
            ? await applyIdentity(env.DB, row, account.binding, nowIso)
            : await applyRoster(env.DB, row, account.roster, nowIso);
          const profile = await readProfile(env.DB, next.sub);
          return jsonResponse({ ok: true, user: publicUser(next), binding: account.binding, profile: profile }, 200, cors);
        }

        if (request.method === 'PUT' && path === '/me/binding') {
          try { await readJson(request); } catch (e) {}
          const account = await resolveAccount(env, row);
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

      return jsonResponse({ ok: false, error: 'not found' }, 404, cors);
    } catch (err) {
      console.error('[noteschallenge-auth]', err && err.message ? err.message : err);
      return jsonResponse({ ok: false, error: 'server error' }, 500, cors);
    }
  }
};
