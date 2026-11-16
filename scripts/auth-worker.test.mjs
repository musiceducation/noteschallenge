import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import worker, {
  allowedOrigin,
  clearJwksCache,
  mergeProfiles,
  signSessionToken,
  verifyGoogleIdToken,
  verifySessionToken
} from '../cloudflare/noteschallenge-auth/worker.js';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const SECRET = 'test-secret-test-secret-test-secret';

function b64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function jsonB64(obj) {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

let privateKey;
let publicJwk;

function keys() {
  if (privateKey) return;
  const generated = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = generated.privateKey;
  publicJwk = generated.publicKey.export({ format: 'jwk' });
  publicJwk.kid = 'test-key';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
}

function googleToken(claims, headerExtra) {
  keys();
  const header = jsonB64(Object.assign({ alg: 'RS256', typ: 'JWT', kid: 'test-key' }, headerExtra || {}));
  const body = jsonB64(claims);
  const data = header + '.' + body;
  const signer = createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  return data + '.' + b64url(signer.sign(privateKey));
}

function baseClaims(nowMs, extra) {
  const now = Math.floor(nowMs / 1000);
  return Object.assign({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-sub-1',
    email: 'student@school.edu.hk',
    email_verified: true,
    name: '陳小樂',
    picture: 'https://example.com/p.png',
    iat: now,
    exp: now + 3600
  }, extra || {});
}

function memoryDb() {
  const users = new Map();
  const profiles = new Map();
  return {
    prepare(sql) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...args) {
          return {
            async first() {
              if (compact.includes('FROM users')) return users.get(args[0]) || null;
              if (compact.includes('FROM profiles')) {
                const row = profiles.get(args[0]);
                return row ? { data: row.data } : null;
              }
              throw new Error('unexpected first ' + compact);
            },
            async run() {
              if (compact.startsWith('INSERT INTO users')) {
                const prev = users.get(args[0]);
                users.set(args[0], {
                  sub: args[0],
                  email: args[1],
                  name: args[2],
                  picture: args[3],
                  grade: prev ? prev.grade : null,
                  class: prev ? prev.class : null,
                  student_name: prev ? prev.student_name : null,
                  created_at: prev ? prev.created_at : args[4],
                  last_login: args[5]
                });
                return { success: true };
              }
              if (compact.startsWith('UPDATE users')) {
                const row = users.get(args[3]);
                if (!row) throw new Error('missing user');
                row.grade = args[0];
                row.class = args[1];
                row.student_name = args[2];
                return { success: true };
              }
              if (compact.startsWith('INSERT INTO profiles')) {
                profiles.set(args[0], { data: args[1], updated_at: args[2] });
                return { success: true };
              }
              throw new Error('unexpected run ' + compact);
            }
          };
        }
      };
    }
  };
}

test('verifyGoogleIdToken accepts a JWKS-signed token', async () => {
  keys();
  const now = Date.now();
  const token = await googleToken(baseClaims(now));
  const result = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks: [publicJwk], now: () => now });
  assert.equal(result.ok, true);
  assert.equal(result.claims.sub, 'google-sub-1');
  assert.equal(result.claims.email, 'student@school.edu.hk');
  assert.equal(result.claims.name, '陳小樂');
});

test('verifyGoogleIdToken rejects bad audience, issuer, expiry, unverified email, domain, and alg', async () => {
  keys();
  const now = Date.now();
  const opts = { clientId: CLIENT_ID, jwks: [publicJwk], now: () => now };
  const badAud = await verifyGoogleIdToken(await googleToken(baseClaims(now, { aud: 'other.apps.googleusercontent.com' })), opts);
  assert.equal(badAud.ok, false);
  assert.equal(badAud.error, 'bad audience');

  const badIss = await verifyGoogleIdToken(await googleToken(baseClaims(now, { iss: 'https://evil.example' })), opts);
  assert.equal(badIss.error, 'bad issuer');

  const expired = await verifyGoogleIdToken(await googleToken(baseClaims(now, { exp: Math.floor(now / 1000) - 120 })), opts);
  assert.equal(expired.error, 'expired');

  const unverified = await verifyGoogleIdToken(await googleToken(baseClaims(now, { email_verified: false })), opts);
  assert.equal(unverified.error, 'email not verified');

  const domain = await verifyGoogleIdToken(
    await googleToken(baseClaims(now)),
    Object.assign({}, opts, { allowedDomains: 'other.edu.hk, school.edu.hk' })
  );
  assert.equal(domain.ok, true);
  const blocked = await verifyGoogleIdToken(
    await googleToken(baseClaims(now, { email: 'kid@gmail.com' })),
    Object.assign({}, opts, { allowedDomains: 'school.edu.hk' })
  );
  assert.equal(blocked.error, 'email domain not allowed');

  const noneHeader = jsonB64({ alg: 'none', typ: 'JWT', kid: 'test-key' });
  const noneBody = jsonB64(baseClaims(now));
  const noneToken = noneHeader + '.' + noneBody + '.';
  const none = await verifyGoogleIdToken(noneToken, opts);
  assert.equal(none.error, 'unsupported alg');

  const tampered = (await googleToken(baseClaims(now))).replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
  const badSig = await verifyGoogleIdToken(tampered, opts);
  assert.equal(badSig.ok, false);
});

test('verifyGoogleIdToken loads JWKS through fetch', async () => {
  keys();
  clearJwksCache();
  const now = Date.now();
  const token = await googleToken(baseClaims(now));
  const result = await verifyGoogleIdToken(token, {
    clientId: CLIENT_ID,
    now: () => now,
    fetch: async (url) => {
      assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs');
      return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });
    }
  });
  assert.equal(result.ok, true);
  clearJwksCache();
});

test('session token round-trips and rejects a bad secret or expiry', async () => {
  const now = Date.now();
  const token = await signSessionToken({ sub: 's1', email: 'a@b.com' }, SECRET, now);
  const ok = await verifySessionToken(token, SECRET, now + 1000);
  assert.equal(ok.sub, 's1');
  assert.equal(ok.email, 'a@b.com');
  assert.equal(await verifySessionToken(token, 'other-secret-other-secret-other', now), null);
  assert.equal(await verifySessionToken(token, SECRET, now + 31 * 24 * 60 * 60 * 1000), null);
});

test('mergeProfiles keeps higher bests and does not wipe text with blanks', () => {
  const stored = {
    name: '陳小樂',
    grade: 1,
    class: 'A',
    seat: '3',
    avatar: '🎵',
    signature: '加油',
    registeredAt: '2026-01-01T00:00:00.000Z',
    totalPlayTime: 40,
    level: 3,
    exp: 250,
    stats: { totalPlayed: 4, cleared: 2, totalScore: 800, totalAccuracy: 300, accuracyCount: 4, maxCombo: 12, fcCount: 1, apCount: 0 },
    diffClears: { easy: 2, normal: 1, hard: 0, expert: 0 },
    gameBests: { game1: 900, game2: 100 },
    history: [{ date: 'd1', game: 'game1', score: 900, accuracy: 80, maxCombo: 12 }]
  };
  const incoming = {
    name: '',
    signature: '',
    level: 2,
    exp: 10,
    totalPlayTime: 5,
    stats: { totalPlayed: 1, maxCombo: 20, totalScore: 50 },
    gameBests: { game1: 100, game2: 400, game3: 50 },
    diffClears: { easy: 0, hard: 3 },
    history: [{ date: 'd1', game: 'game1', score: 900, accuracy: 80, maxCombo: 12 }, { date: 'd2', game: 'game2', score: 400, accuracy: 70, maxCombo: 4 }]
  };
  const merged = mergeProfiles(stored, incoming);
  assert.equal(merged.name, '陳小樂');
  assert.equal(merged.signature, '加油');
  assert.equal(merged.level, 3);
  assert.equal(merged.exp, 250);
  assert.equal(merged.totalPlayTime, 40);
  assert.equal(merged.gameBests.game1, 900);
  assert.equal(merged.gameBests.game2, 400);
  assert.equal(merged.gameBests.game3, 50);
  assert.equal(merged.stats.maxCombo, 20);
  assert.equal(merged.stats.totalPlayed, 4);
  assert.equal(merged.stats.totalScore, 800);
  assert.equal(merged.diffClears.hard, 3);
  assert.equal(merged.diffClears.easy, 2);
  assert.equal(merged.history.length, 2);
  assert.equal(merged.registeredAt, '2026-01-01T00:00:00.000Z');
});

test('allowedOrigin permits the GitHub Pages site and localhost only', () => {
  assert.equal(allowedOrigin('https://musiceducation.github.io'), 'https://musiceducation.github.io');
  assert.equal(allowedOrigin('http://localhost:4173'), 'http://localhost:4173');
  assert.equal(allowedOrigin('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
  assert.equal(allowedOrigin('https://evil.example'), '');
  assert.equal(allowedOrigin('http://localhost.evil.com'), '');
});

test('worker login stores binding and profile merge never lowers bests', async () => {
  keys();
  clearJwksCache();
  const now = Date.now();
  const token = await googleToken(baseClaims(now));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/oauth2/v3/certs')) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('unexpected fetch ' + url);
  };
  const env = {
    DB: memoryDb(),
    GOOGLE_CLIENT_ID: CLIENT_ID,
    JWT_SECRET: SECRET,
    ALLOWED_EMAIL_DOMAINS: ''
  };
  const origin = 'https://musiceducation.github.io';
  try {
    const loginRes = await worker.fetch(new Request('https://auth.example/auth/google', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: token })
    }), env);
    assert.equal(loginRes.headers.get('Access-Control-Allow-Origin'), origin);
    const login = await loginRes.json();
    assert.equal(login.ok, true);
    assert.equal(login.binding, null);
    assert.equal(login.user.email, 'student@school.edu.hk');

    const auth = { Authorization: 'Bearer ' + login.token, Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
    const bindRes = await worker.fetch(new Request('https://auth.example/me/binding', {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ grade: 1, class: 'a', name: '陳小樂' })
    }), env);
    const bound = await bindRes.json();
    assert.equal(bound.ok, true);
    assert.deepEqual(bound.binding, { grade: '1', class: 'A', name: '陳小樂' });

    const guest = await worker.fetch(new Request('https://auth.example/me/binding', {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ grade: '1', class: 'A', name: '__guest__' })
    }), env);
    assert.equal(guest.status, 400);

    const firstProfile = await worker.fetch(new Request('https://auth.example/me/profile', {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ data: { name: '陳小樂', gameBests: { game1: 500 }, exp: 80, stats: { maxCombo: 9 } } })
    }), env);
    const stored = await firstProfile.json();
    assert.equal(stored.profile.gameBests.game1, 500);

    const lower = await worker.fetch(new Request('https://auth.example/me/profile', {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ data: { name: '', signature: '', gameBests: { game1: 10, game2: 70 }, exp: 5, stats: { maxCombo: 2, totalPlayed: 3 } } })
    }), env);
    const kept = await lower.json();
    assert.equal(kept.profile.gameBests.game1, 500);
    assert.equal(kept.profile.gameBests.game2, 70);
    assert.equal(kept.profile.exp, 80);
    assert.equal(kept.profile.stats.maxCombo, 9);
    assert.equal(kept.profile.stats.totalPlayed, 3);
    assert.equal(kept.profile.name, '陳小樂');

    const again = await worker.fetch(new Request('https://auth.example/auth/google', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: token })
    }), env);
    const relogin = await again.json();
    assert.deepEqual(relogin.binding, { grade: '1', class: 'A', name: '陳小樂' });
    assert.equal(relogin.profile.gameBests.game1, 500);

    const me = await worker.fetch(new Request('https://auth.example/me', {
      headers: { Authorization: 'Bearer ' + relogin.token, Origin: 'http://127.0.0.1:4173' }
    }), env);
    assert.equal(me.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:4173');
    const meBody = await me.json();
    assert.equal(meBody.user.student_name, '陳小樂');

    const evil = await worker.fetch(new Request('https://auth.example/me', {
      headers: { Authorization: 'Bearer ' + relogin.token, Origin: 'https://evil.example' }
    }), env);
    assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null);

    const preflight = await worker.fetch(new Request('https://auth.example/me', {
      method: 'OPTIONS',
      headers: { Origin: origin }
    }), env);
    assert.equal(preflight.status, 204);
  } finally {
    globalThis.fetch = realFetch;
    clearJwksCache();
  }
});
