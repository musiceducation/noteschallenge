/**
 * noteschallenge web auth worker.
 * ES module, no imports. Deploy this file as-is via the Cloudflare API or wrangler.
 *
 * Env:
 *   DB                     D1 binding
 *   GOOGLE_CLIENT_ID       Web OAuth client id (must match the ID token aud)
 *   JWT_SECRET             HMAC secret for session tokens
 *   ALLOWED_EMAIL_DOMAINS  optional comma list; empty = any verified Google account
 */

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
const JWKS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SEC = 60;
const PROFILE_MAX_CHARS = 200000;

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
  if (!emailDomainOk(email, opts.allowedDomains)) return { ok: false, error: 'email domain not allowed' };
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

function bindingFromRow(row) {
  if (!row || !text(row.student_name) || !text(row.grade) || !text(row.class)) return null;
  return { grade: String(row.grade), class: String(row.class), name: String(row.student_name) };
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

function validBinding(body) {
  const src = plainObject(body);
  const grade = text(src.grade);
  const klass = text(src.class).toUpperCase();
  const name = text(src.name || src.student_name);
  if (!/^[1-6]$/.test(grade)) return null;
  if (!/^[A-D]$/.test(klass)) return null;
  if (!name || name.length > 20) return null;
  if (name === '__guest__' || name === '__other__' || name === '訪客') return null;
  return { grade: grade, class: klass, name: name };
}

async function getUser(db, sub) {
  return db.prepare(
    'SELECT sub, email, name, picture, grade, class, student_name, created_at, last_login FROM users WHERE sub = ?'
  ).bind(sub).first();
}

async function upsertUser(db, claims, nowIso) {
  const existing = await getUser(db, claims.sub);
  const created = existing && existing.created_at ? existing.created_at : nowIso;
  await db.prepare(
    'INSERT INTO users (sub, email, name, picture, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture, last_login = excluded.last_login'
  ).bind(claims.sub, claims.email, claims.name || '', claims.picture || '', created, nowIso).run();
  return getUser(db, claims.sub);
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
          fetch: fetch,
          now: Date.now
        });
        if (!verified.ok) return jsonResponse({ ok: false, error: verified.error }, 401, cors);
        const nowIso = new Date().toISOString();
        const row = await upsertUser(env.DB, verified.claims, nowIso);
        const token = await signSessionToken(verified.claims, env.JWT_SECRET);
        const profile = await readProfile(env.DB, row.sub);
        return jsonResponse({
          ok: true,
          token: token,
          user: publicUser(row),
          binding: bindingFromRow(row),
          profile: profile
        }, 200, cors);
      }

      if (path === '/me' || path === '/me/binding' || path === '/me/profile') {
        const gate = await requireSession(request, env);
        if (gate.error) return gate.error;
        const row = gate.row;

        if (request.method === 'GET' && path === '/me') {
          const profile = await readProfile(env.DB, row.sub);
          return jsonResponse({ ok: true, user: publicUser(row), binding: bindingFromRow(row), profile: profile }, 200, cors);
        }

        if (request.method === 'PUT' && path === '/me/binding') {
          let body;
          try { body = await readJson(request); } catch (e) {
            return jsonResponse({ ok: false, error: 'invalid json' }, 400, cors);
          }
          const binding = validBinding(body);
          if (!binding) return jsonResponse({ ok: false, error: 'invalid binding' }, 400, cors);
          await env.DB.prepare(
            'UPDATE users SET grade = ?, class = ?, student_name = ? WHERE sub = ?'
          ).bind(binding.grade, binding.class, binding.name, row.sub).run();
          const next = await getUser(env.DB, row.sub);
          return jsonResponse({ ok: true, user: publicUser(next), binding: bindingFromRow(next) }, 200, cors);
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
