import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import worker, {
  WORLD_ACTIVE_TTL_MS,
  WORLD_PUBLIC_IDLE_TTL_MS,
  WORLD_RECONNECT_GRACE_MS,
  WORLD_ROOM_IDLE_TTL_MS,
  computeWorldRound,
  resolveWorldChallenge,
  signSessionToken
} from '../cloudflare/noteschallenge-auth/worker.js';

const SECRET = 'world-test-secret-world-test-secret';

function createBarrier(count) {
  let arrived = 0;
  let release;
  const done = new Promise((resolve) => { release = resolve; });
  return async function wait() {
    arrived += 1;
    if (arrived >= count) release();
    await done;
  };
}

function createSharedWorldD1(opts = {}) {
  const users = new Map();
  const roster = new Map();
  const worldRooms = new Map();
  const worldPlayers = new Map(); // key: `${room_code}::${player_id}`
  const schoolDomains = [];
  const stats = {
    roomCasConflicts: 0,
    roomInsertConflicts: 0,
    playerCasConflicts: 0,
    playerInsertConflicts: 0
  };
  const onOp = opts.onOp || null;

  async function hook(op, compact, args) {
    if (onOp) await onOp(op, compact, args);
  }

  return {
    users,
    roster,
    worldRooms,
    worldPlayers,
    schoolDomains,
    stats,
    prepare(sql) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      if (compact.includes('FROM users')) {
        return { bind(sub) { return { async first() { return users.get(sub) || null; } }; } };
      }
      if (compact.includes('FROM roster')) {
        return { bind(email) { return { async first() { return roster.get(String(email || '').toLowerCase()) || null; } }; } };
      }
      if (compact.includes('school_domains')) {
        return {
          async all() { return { results: schoolDomains.slice() }; },
          bind() { return { async all() { return { results: schoolDomains.slice() }; } }; }
        };
      }
      if (compact.includes('world_rooms')) {
        if (compact.startsWith('SELECT')) {
          return {
            bind(code) {
              return {
                async first() {
                  const row = worldRooms.get(code);
                  const snap = row ? Object.assign({}, row) : null;
                  await hook('select_room', compact, [code]);
                  return snap;
                }
              };
            }
          };
        }
        if (compact.startsWith('INSERT')) {
          return {
            bind(code, school_id, host_id, version, state, updated_at) {
              return {
                async run() {
                  await hook('insert_room', compact, [code]);
                  if (worldRooms.has(code)) {
                    stats.roomInsertConflicts += 1;
                    throw new Error('UNIQUE constraint failed: world_rooms.code');
                  }
                  worldRooms.set(code, { code, school_id, host_id, version, state, updated_at });
                  return { success: true, meta: { changes: 1 } };
                }
              };
            }
          };
        }
        if (compact.startsWith('UPDATE')) {
          return {
            bind(school_id, host_id, nextVersion, state, updated_at, code, expectedVersion) {
              return {
                async run() {
                  await hook('update_room', compact, [code, expectedVersion]);
                  const existing = worldRooms.get(code);
                  if (!existing || existing.version !== expectedVersion) {
                    stats.roomCasConflicts += 1;
                    return { success: true, meta: { changes: 0 } };
                  }
                  worldRooms.set(code, { code, school_id, host_id, version: nextVersion, state, updated_at });
                  return { success: true, meta: { changes: 1 } };
                }
              };
            }
          };
        }
      }
      if (compact.includes('world_players')) {
        if (compact.startsWith('SELECT') && compact.includes('AND player_id = ?')) {
          return {
            bind(room_code, player_id) {
              return {
                async first() {
                  const row = worldPlayers.get(`${room_code}::${player_id}`);
                  const snap = row ? Object.assign({}, row) : null;
                  await hook('select_player', compact, [room_code, player_id]);
                  return snap;
                }
              };
            }
          };
        }
        if (compact.startsWith('SELECT')) {
          return {
            bind(room_code) {
              return {
                async all() {
                  await hook('select_players_all', compact, [room_code]);
                  const results = [];
                  for (const row of worldPlayers.values()) {
                    if (row.room_code === room_code) results.push(Object.assign({}, row));
                  }
                  return { results };
                }
              };
            }
          };
        }
        if (compact.startsWith('INSERT')) {
          return {
            bind(room_code, player_id, version, state, updated_at) {
              return {
                async run() {
                  await hook('insert_player', compact, [room_code, player_id]);
                  const k = `${room_code}::${player_id}`;
                  if (worldPlayers.has(k)) {
                    stats.playerInsertConflicts += 1;
                    throw new Error('UNIQUE constraint failed: world_players');
                  }
                  worldPlayers.set(k, { room_code, player_id, version, state, updated_at });
                  return { success: true, meta: { changes: 1 } };
                }
              };
            }
          };
        }
        if (compact.startsWith('UPDATE')) {
          return {
            bind(nextVersion, state, updated_at, room_code, player_id, expectedVersion) {
              return {
                async run() {
                  await hook('update_player', compact, [room_code, player_id, expectedVersion]);
                  const k = `${room_code}::${player_id}`;
                  const existing = worldPlayers.get(k);
                  if (!existing || existing.version !== expectedVersion) {
                    stats.playerCasConflicts += 1;
                    return { success: true, meta: { changes: 0 } };
                  }
                  worldPlayers.set(k, { room_code, player_id, version: nextVersion, state, updated_at });
                  return { success: true, meta: { changes: 1 } };
                }
              };
            }
          };
        }
        if (compact.startsWith('DELETE') && compact.includes('AND player_id = ?')) {
          return {
            bind(room_code, player_id) {
              return {
                async run() {
                  const deleted = worldPlayers.delete(`${room_code}::${player_id}`);
                  return { success: true, meta: { changes: deleted ? 1 : 0 } };
                }
              };
            }
          };
        }
        if (compact.startsWith('DELETE')) {
          return {
            bind(room_code) {
              return {
                async run() {
                  let count = 0;
                  for (const [k, row] of worldPlayers.entries()) {
                    if (row.room_code === room_code) {
                      worldPlayers.delete(k);
                      count += 1;
                    }
                  }
                  return { success: true, meta: { changes: count } };
                }
              };
            }
          };
        }
      }
      throw new Error('unexpected world sql: ' + compact);
    }
  };
}

const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(new URL('../world-3d-logic.js', import.meta.url), 'utf8'),
  ctx
);
const Logic = ctx.MusicPartyWorldLogic;

test('all 6 distinct 3D layouts generate deterministic challenges and match worker resolveWorldChallenge 100%', () => {
  assert.equal(Logic.ARENA_METRICS.maxPlayers, 50);
  assert.equal(Logic.PIANO_STAGE_KEYS.length, 13);
  assert.equal(Logic.ARENA_METRICS.crownTiers.length, 3);

  const modes = ['tiles', 'piano', 'gates', 'turntable', 'freeze', 'crown'];
  const topics = ['mixed', 'notes', 'rhythm', 'ear', 'terms'];
  const levels = [1, 2, 3, 4, 5, 'basic', 'advanced'];

  for (const mode of modes) {
    for (const topic of topics) {
      for (const level of levels) {
        const seed = Logic.hashSeed(`${mode}_${topic}_${level}_round9`);
        const clientA = Logic.generateRoundChallenge(mode, topic, level, seed);
        const clientB = Logic.generateRoundChallenge(mode, topic, level, seed);
        const serverCh = resolveWorldChallenge(mode, topic, level, seed);
        assert.deepEqual(clientA, clientB, `client mismatch for ${mode}/${topic}/${level}`);

        if (mode === 'crown') {
          assert.equal(clientA.orbs.length, 14);
          assert.equal(serverCh.orbs.length, 14);
          assert.deepEqual(
            JSON.parse(JSON.stringify(clientA.orbs.map((o) => ({ label: o.label, good: o.good })))),
            serverCh.orbs,
            `crown orb parity for ${topic}/${level}`
          );
        } else if (mode === 'piano') {
          assert.ok(Logic.PIANO_STAGE_KEYS.some((k) => k.id === clientA.targetKeyId));
          assert.equal(clientA.options.length, 13);
          assert.equal(serverCh.targetKeyId, clientA.targetKeyId, `piano targetKeyId parity for ${topic}/${level}`);
          assert.equal(serverCh.ans, clientA.ans);
        } else {
          const expectedCount = (mode === 'gates' || mode === 'freeze' || mode === 'turntable') ? 4 : 9;
          assert.equal(clientA.options.length, expectedCount);
          assert.ok(clientA.options.includes(clientA.ans), `answer missing in ${mode}/${topic}`);
          assert.equal(new Set(clientA.options).size, expectedCount);
          assert.equal(serverCh.ans, clientA.ans, `ans parity for ${mode}/${topic}/${level}`);
          assert.deepEqual(serverCh.options, JSON.parse(JSON.stringify(clientA.options)), `options parity for ${mode}/${topic}/${level}`);
          assert.equal(serverCh.options[serverCh.correctIndex], clientA.ans);
        }
      }
    }
  }
});

test('Party Mix (mix) mode rotates across 5 layouts with escalating speed & difficulty aligned between client and server', () => {
  const ms = { mode: 'mix', topic: 'mixed', level: 'auto', epochMs: 100000, seed: 888 };
  const expectedLayouts = ['tiles', 'piano', 'gates', 'turntable', 'crown'];
  const cfg = Logic.MODE_CONFIG.mix;
  let offsetMs = 0;
  let prevSpeed = 0;
  let prevBpm = 0;
  let prevTimer = Infinity;

  for (let r = 0; r < 5; r++) {
    const info = Logic.computeSyncedRound(ms, 100000 + offsetMs + 1000);
    const serverInfo = computeWorldRound(ms, 100000 + offsetMs + 1000);
    assert.equal(info.roundNum, r);
    assert.equal(serverInfo.roundNum, r);
    assert.equal(info.showRound, r + 1);
    assert.equal(info.effectiveMode, expectedLayouts[r]);
    assert.equal(serverInfo.effectiveMode, expectedLayouts[r]);
    assert.equal(info.isFinale, r === 4);
    assert.equal(info.escalation.tier, r + 1);
    assert.ok(info.escalation.speedMult > prevSpeed);
    assert.ok(info.escalation.bpm > prevBpm);
    assert.ok(info.escalation.timerFactor < prevTimer);

    prevSpeed = info.escalation.speedMult;
    prevBpm = info.escalation.bpm;
    prevTimer = info.escalation.timerFactor;

    const rDur = Math.max(4.5, Number((cfg.roundSec * info.escalation.timerFactor).toFixed(2)));
    offsetMs += (rDur + cfg.revealSec) * 1000;
  }
});

test('computeTurntableState and computeSpawnSlot work accurately for 50 players', () => {
  const s0 = Logic.computeTurntableState(8, 8, 0);
  assert.equal(s0.onTurntable, true);
  assert.equal(s0.sector, 0);
  assert.ok(Math.hypot(s0.carryVx, s0.carryVz) > 1.0);

  const outside = Logic.computeTurntableState(25, 0, 0);
  assert.equal(outside.onTurntable, false);
  assert.equal(outside.sector, -1);

  for (const mode of ['piano', 'gates', 'tiles']) {
    const slots = [];
    for (let i = 0; i < 50; i++) slots.push(Logic.computeSpawnSlot(i, mode));
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const dist = Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z);
        assert.ok(dist >= 1.5, `spawn overlap in ${mode}`);
      }
    }
  }
});

test('true overlapping concurrency on /world/sync: 8 simultaneous players, same-player CAS retry, and concurrent room creation race never lose positions or scores', async () => {
  let activeBarrier = null;
  let barrierFilter = null;
  const sharedDb = createSharedWorldD1({
    async onOp(op, _sql, args) {
      if (activeBarrier && barrierFilter && barrierFilter(op, args)) {
        await activeBarrier();
      }
    }
  });
  const baseNow = Date.now();
  const isolateA = { DB: sharedDb, JWT_SECRET: SECRET, EXTRA_ALLOWED_EMAILS: 'teacher@school.edu.mo', NOW: baseNow };
  const isolateB = { DB: sharedDb, JWT_SECRET: SECRET, EXTRA_ALLOWED_EMAILS: 'teacher@school.edu.mo', NOW: baseNow };

  async function post(envObj, path, body, token) {
    const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:8080' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await worker.fetch(new Request('https://auth.example.com' + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }), envObj);
    return { status: res.status, data: await res.json() };
  }

  // 1) Concurrent room creation race: 3 peers read world_rooms=null simultaneously and race to INSERT
  activeBarrier = createBarrier(3);
  barrierFilter = (op, args) => op === 'select_room' && args[0] === 'RACE99' && !sharedDb.worldRooms.has('RACE99');
  const raceRes = await Promise.all([
    post(isolateA, '/world/sync', { room: 'RACE99', id: 'p_race_1', clientKey: 'key_race_player_0001', name: '選手1', x: 1, z: 2, modeState: { mode: 'turntable', topic: 'rhythm', seed: 7777 } }),
    post(isolateB, '/world/sync', { room: 'RACE99', id: 'p_race_2', clientKey: 'key_race_player_0002', name: '選手2', x: 3, z: 4, modeState: { mode: 'turntable', topic: 'rhythm', seed: 7777 } }),
    post(isolateA, '/world/sync', { room: 'RACE99', id: 'p_race_3', clientKey: 'key_race_player_0003', name: '選手3', x: 5, z: 6, modeState: { mode: 'turntable', topic: 'rhythm', seed: 7777 } })
  ]);
  activeBarrier = null;
  barrierFilter = null;
  raceRes.forEach((r) => assert.equal(r.status, 200));
  assert.ok(sharedDb.stats.roomInsertConflicts >= 2, 'concurrent room INSERT race should trigger retries');

  // Verify room exists and extract deterministic round challenge
  const seedInfo = raceRes[0].data.modeState;
  const rInfo = raceRes[0].data.roundInfo;
  const ch = resolveWorldChallenge(rInfo.effectiveMode, seedInfo.topic, rInfo.escalation.tier, rInfo.roundSeed);

  // 2) 8 overlapping players syncing concurrently with forced SELECT-before-UPDATE barrier
  isolateA.NOW = baseNow + 600;
  isolateB.NOW = baseNow + 600;
  activeBarrier = createBarrier(8);
  barrierFilter = (op) => op === 'select_player';

  const eightRequests = [];
  for (let i = 1; i <= 8; i++) {
    const isCorrect = i % 2 === 1; // odd players send correct sector, even players try to cheat with wrong sector + forged points
    const envPick = i % 2 === 0 ? isolateB : isolateA;
    eightRequests.push(post(envPick, '/world/sync', {
      room: 'RACE99',
      id: `p_race_${i}`,
      clientKey: `key_race_player_000${i}`,
      name: `選手${i}`,
      x: i * 3,
      y: 0,
      z: -i * 2,
      roundClaim: isCorrect
        ? { roundKey: rInfo.roundKey, sector: ch.correctIndex }
        : { roundKey: rInfo.roundKey, sector: (ch.correctIndex + 1) % 4, points: 999999, won: true }
    }));
  }
  const eightRes = await Promise.all(eightRequests);
  activeBarrier = null;
  barrierFilter = null;

  eightRes.forEach((r) => assert.equal(r.status, 200));

  // Verify final DB state preserved ALL 8 players' positions AND exact server-authoritative scores!
  isolateA.NOW = baseNow + 1200;
  const snap = await post(isolateA, '/world/sync', {
    room: 'RACE99', id: 'p_race_1', clientKey: 'key_race_player_0001', name: '選手1'
  });
  assert.equal(snap.data.players.length, 8, 'all 8 overlapping players preserved');
  for (let i = 1; i <= 8; i++) {
    const p = snap.data.players.find((row) => row.id === `p_race_${i}`);
    assert.ok(p, `player ${i} present`);
    assert.equal(p.x, i * 3, `player ${i} x position preserved`);
    assert.equal(p.z, -i * 2, `player ${i} z position preserved`);
    assert.equal(p.score, i % 2 === 1 ? 165 : 0, `player ${i} server-authoritative score exact`);
  }

  // 3) Same player fires 2 truly overlapping requests that both read the SAME version before either writes
  // Advance to round 1 so a new roundKey is active
  isolateA.NOW = baseNow + 13000;
  isolateB.NOW = baseNow + 13000;
  const r1Info = computeWorldRound(seedInfo, isolateA.NOW);
  const ch1 = resolveWorldChallenge(r1Info.effectiveMode, seedInfo.topic, r1Info.escalation.tier, r1Info.roundSeed);

  let hitCount = 0;
  const twoBarrier = createBarrier(2);
  activeBarrier = async () => {
    hitCount += 1;
    if (hitCount <= 2) await twoBarrier();
  };
  barrierFilter = (op, args) => op === 'select_player' && args[1] === 'p_race_2';

  const beforeConflicts = sharedDb.stats.playerCasConflicts;
  const [dupA, dupB] = await Promise.all([
    post(isolateA, '/world/sync', {
      room: 'RACE99', id: 'p_race_2', clientKey: 'key_race_player_0002', name: '選手2',
      x: 19.5, z: -11.5,
      roundClaim: { roundKey: r1Info.roundKey, sector: ch1.correctIndex }
    }),
    post(isolateB, '/world/sync', {
      room: 'RACE99', id: 'p_race_2', clientKey: 'key_race_player_0002', name: '選手2',
      roundClaim: { roundKey: r1Info.roundKey, sector: ch1.correctIndex }
    })
  ]);
  activeBarrier = null;
  barrierFilter = null;

  assert.equal(dupA.status, 200);
  assert.equal(dupB.status, 200);
  assert.ok(sharedDb.stats.playerCasConflicts > beforeConflicts, 'same-player overlapping write MUST trigger CAS conflict and retry');

  const finalP2Row = JSON.parse(sharedDb.worldPlayers.get('RACE99::p_race_2').state);
  assert.equal(finalP2Row.score, 165, 'overlapping duplicate claim must award score EXACTLY ONCE');
  assert.equal(finalP2Row.x, 19.5, 'position update must not be clobbered by claim-only overlapping request');
  assert.equal(finalP2Row.z, -11.5, 'z coordinate preserved across CAS retry');
});

test('/world/sync enforces server-authoritative scoring, teacher classroom auth isolation, school-scoped MUSIC1, idle expiry, latecomer spectating, reconnect grace, and host kick', async () => {
  const sharedDb = createSharedWorldD1();
  const baseNow = Date.now();
  sharedDb.schoolDomains.push(
    { domain: 'schoola.edu.mo', school_id: 'schoolA' },
    { domain: 'schoolb.edu.mo', school_id: 'schoolB' }
  );
  const envA = { DB: sharedDb, JWT_SECRET: SECRET, EXTRA_ALLOWED_EMAILS: 'teacher@schoola.edu.mo', NOW: baseNow };
  const envB = { DB: sharedDb, JWT_SECRET: SECRET, EXTRA_ALLOWED_EMAILS: 'teacher@schoola.edu.mo', NOW: baseNow };

  sharedDb.users.set('t-sub', { sub: 't-sub', email: 'teacher@schoola.edu.mo', name: '林老師', student_name: '林老師', grade: '', class: '' });
  sharedDb.users.set('s1-sub', { sub: 's1-sub', email: 's1@schoola.edu.mo', name: '陳小明', student_name: '陳小明', grade: '1', class: 'A' });
  sharedDb.users.set('s2-sub', { sub: 's2-sub', email: 's2@schoola.edu.mo', name: '李小芳', student_name: '李小芳', grade: '1', class: 'A' });
  sharedDb.users.set('sb-sub', { sub: 'sb-sub', email: 'sb@schoolb.edu.mo', name: '外校生', student_name: '外校生', grade: '2', class: 'B' });
  sharedDb.roster.set('s1@schoola.edu.mo', { email: 's1@schoola.edu.mo', school_id: 'schoolA', grade: '1', class: 'A', student_name: '陳小明', seat: '5' });
  sharedDb.roster.set('s2@schoola.edu.mo', { email: 's2@schoola.edu.mo', school_id: 'schoolA', grade: '1', class: 'A', student_name: '李小芳', seat: '6' });
  sharedDb.roster.set('sb@schoolb.edu.mo', { email: 'sb@schoolb.edu.mo', school_id: 'schoolB', grade: '2', class: 'B', student_name: '外校生', seat: '1' });

  const teacherTok = await signSessionToken({ sub: 't-sub', email: 'teacher@schoola.edu.mo' }, SECRET, baseNow);
  const s1Tok = await signSessionToken({ sub: 's1-sub', email: 's1@schoola.edu.mo' }, SECRET, baseNow);
  const s2Tok = await signSessionToken({ sub: 's2-sub', email: 's2@schoola.edu.mo' }, SECRET, baseNow);
  const sbTok = await signSessionToken({ sub: 'sb-sub', email: 'sb@schoolb.edu.mo' }, SECRET, baseNow);

  async function post(envObj, path, body, token) {
    const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:8080' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await worker.fetch(new Request('https://auth.example.com' + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }), envObj);
    return { status: res.status, data: await res.json() };
  }

  // 1) Teacher opens classroom room CLASS50 -> unauthenticated guest knowing CLASS50 is BLOCKED (401)!
  const rHost = await post(envA, '/world/sync', {
    room: 'CLASS50',
    skin: 0xf59e0b,
    hat: 'conductor',
    x: 0, y: 1.25, z: -2.1,
    modeState: { mode: 'piano', topic: 'notes', level: 'auto', seed: 1234, seq: 1, resetEpoch: true }
  }, teacherTok);
  assert.equal(rHost.status, 200);
  assert.equal(rHost.data.self.isHost, true);
  assert.equal(JSON.stringify(rHost.data).includes('@'), false, 'no email in public payload');

  // Unauthenticated guest with valid clientKey cannot enter teacher-hosted CLASS50!
  const guestBlocked = await post(envB, '/world/sync', {
    room: 'CLASS50', id: 'guest_intruder', clientKey: 'valid_guest_key_123456', name: '未登入訪客'
  });
  assert.equal(guestBlocked.status, 401);
  assert.equal(guestBlocked.data.error, 'classroom_auth_required');

  // Student from School B cannot enter School A's teacher-hosted CLASS50!
  const otherSchoolBlocked = await post(envB, '/world/sync', {
    room: 'CLASS50', x: 1, z: 1
  }, sbTok);
  assert.equal(otherSchoolBlocked.status, 403);
  assert.equal(otherSchoolBlocked.data.error, 'wrong_school');

  // Same-school student joins CLASS50 with custom wardrobe (pattern + face + note hat) -> allowed & synced
  const rS1 = await post(envB, '/world/sync', {
    room: 'CLASS50', skin: 0x38bdf8, hat: 'note', pattern: 'star', face: 'cool', x: 3, y: 0, z: 4
  }, s1Tok);
  assert.equal(rS1.status, 200);
  assert.equal(rS1.data.self.isHost, false);
  assert.equal(rS1.data.self.spectating, false);
  const syncedS1 = rS1.data.players.find((p) => p.id === 'user:s1-sub');
  assert.equal(syncedS1.hat, 'note');
  assert.equal(syncedS1.pattern, 'star');
  assert.equal(syncedS1.face, 'cool');

  // Non-host cannot switch mode (403)
  const badSwitch = await post(envB, '/world/host', {
    room: 'CLASS50', action: 'switch_mode', modeState: { mode: 'turntable', topic: 'rhythm' }
  }, s1Tok);
  assert.equal(badSwitch.status, 403);

  // Teacher switches to piano; test server-authoritative scoring (forged points rejected, real targetKeyId accepted)
  envA.NOW = baseNow + 1000;
  envB.NOW = baseNow + 1000;
  const switched = await post(envA, '/world/host', {
    room: 'CLASS50', action: 'switch_mode', modeState: { mode: 'piano', topic: 'notes', seed: 5678 }
  }, teacherTok);
  assert.equal(switched.status, 200);
  const rKey0 = switched.data.roundInfo.roundKey;
  const pianoCh = resolveWorldChallenge('piano', 'notes', switched.data.roundInfo.escalation.tier, switched.data.roundInfo.roundSeed);

  // Forged client points with wrong keyId scores 0 (Wait: wrong claim records awardedRounds[rKey0]=0, so test on s2 first or test wrong on s2 and right on s1)
  envB.NOW = baseNow + 2000;
  const s1Right = await post(envB, '/world/sync', {
    room: 'CLASS50', roundClaim: { roundKey: rKey0, keyId: pianoCh.targetKeyId, points: 999999, won: true }
  }, s1Tok);
  assert.equal(s1Right.data.self.score, 165, 'server ignores forged 999999 and computes exact 165');
  assert.equal(s1Right.data.self.streak, 1);

  // Duplicate claim for same roundKey does NOT double score
  envB.NOW = baseNow + 2500;
  const s1Dup = await post(envB, '/world/sync', {
    room: 'CLASS50', roundClaim: { roundKey: rKey0, keyId: pianoCh.targetKeyId }
  }, s1Tok);
  assert.equal(s1Dup.data.self.score, 165);

  // Latecomer s2 joins 4s into the active round -> spectating=true and cannot score this round
  envB.NOW = baseNow + 5000;
  const lateJoin = await post(envB, '/world/sync', {
    room: 'CLASS50',
    roundClaim: { roundKey: rKey0, keyId: pianoCh.targetKeyId }
  }, s2Tok);
  assert.equal(lateJoin.status, 200);
  assert.equal(lateJoin.data.self.spectating, true);
  assert.equal(lateJoin.data.self.score, 0, 'spectator cannot score current round');

  // Advance clock past round 0 -> s2 automatically joins round 1, tries forged wrong answer -> 0 pts
  envB.NOW = baseNow + 14000;
  const r1Info = computeWorldRound(switched.data.modeState, envB.NOW);
  const s2Cheat = await post(envB, '/world/sync', {
    room: 'CLASS50',
    roundClaim: { roundKey: r1Info.roundKey, keyId: 'INVALID_KEY', points: 50000, won: true }
  }, s2Tok);
  assert.equal(s2Cheat.data.self.spectating, false);
  assert.equal(s2Cheat.data.self.score, 0, 'forged points with wrong keyId must score 0');

  // s1 disconnects beyond WORLD_ACTIVE_TTL_MS, reconnects within WORLD_RECONNECT_GRACE_MS -> score preserved
  envA.NOW = baseNow + 2000 + WORLD_ACTIVE_TTL_MS + 5000;
  envB.NOW = envA.NOW;
  const afterDrop = await post(envA, '/world/sync', { room: 'CLASS50' }, teacherTok);
  assert.equal(afterDrop.data.players.some((p) => p.id === 'user:s1-sub'), false);
  assert.ok(WORLD_RECONNECT_GRACE_MS >= 60000);
  envB.NOW = envA.NOW + 2000;
  const reconnected = await post(envB, '/world/sync', { room: 'CLASS50' }, s1Tok);
  assert.equal(reconnected.data.self.reconnected, true);
  assert.equal(reconnected.data.self.score, 165);

  // Host kicks s2 -> blocked with 403 kicked
  const kicked = await post(envA, '/world/host', {
    room: 'CLASS50', action: 'kick', targetId: 'user:s2-sub'
  }, teacherTok);
  assert.equal(kicked.status, 200);
  const blocked = await post(envB, '/world/sync', { room: 'CLASS50' }, s2Tok);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error, 'kicked');

  // 2) Default room MUSIC1 is isolated across School A, School B, and public guests — NEVER a global cross-classroom room
  envA.NOW = baseNow + 10000;
  envB.NOW = baseNow + 10000;
  const mSchoolA = await post(envA, '/world/sync', { room: 'MUSIC1', x: 1, z: 1 }, s1Tok);
  const mSchoolB = await post(envB, '/world/sync', { room: 'MUSIC1', x: 2, z: 2 }, sbTok);
  const mPublic = await post(envB, '/world/sync', { room: 'MUSIC1', id: 'pub_guest_1', clientKey: 'public_guest_key_1234', name: '公眾玩家', x: 3, z: 3 });
  assert.equal(mSchoolA.data.players.length, 1);
  assert.equal(mSchoolB.data.players.length, 1);
  assert.equal(mPublic.data.players.length, 1);
  assert.equal(sharedDb.worldRooms.has('s:schoolA:MUSIC1'), true);
  assert.equal(sharedDb.worldRooms.has('s:schoolB:MUSIC1'), true);
  assert.equal(sharedDb.worldRooms.has('pub:MUSIC1'), true);

  // 3) Idle expiry: public room expires after WORLD_PUBLIC_IDLE_TTL_MS, school room expires after WORLD_ROOM_IDLE_TTL_MS
  envB.NOW = baseNow + 10000 + WORLD_PUBLIC_IDLE_TTL_MS + 5000;
  const mPublicExpired = await post(envB, '/world/sync', {
    room: 'MUSIC1', id: 'pub_guest_2', clientKey: 'public_guest_key_5678', name: '新訪客',
    modeState: { mode: 'tiles', topic: 'ear', seed: 999 }
  });
  assert.equal(mPublicExpired.status, 200);
  assert.equal(mPublicExpired.data.self.isHost, true, 'expired public room resets cleanly with new host');
  assert.equal(mPublicExpired.data.players.length, 1, 'old public players cleared on expiry');

  envA.NOW = baseNow + 10000 + WORLD_ROOM_IDLE_TTL_MS + 5000;
  const mSchoolExpired = await post(envA, '/world/sync', { room: 'MUSIC1', x: 0, z: 0 }, s1Tok);
  assert.equal(mSchoolExpired.status, 200);
  assert.equal(mSchoolExpired.data.self.score, 0, 'expired school room resets cleanly');
});

test('world-3d.html and shiba-slide-3d.html inline scripts parse cleanly, Sprite Stacking is removed, and all getElementById targets exist', () => {
  assert.equal(fs.existsSync(new URL('../sprite-stacker-3d.html', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../www/sprite-stacker-3d.html', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../godot-music-party/scripts/SpriteStackProp.gd', import.meta.url)), false);

  for (const file of ['world-3d.html', 'www/world-3d.html']) {
    const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.match(html, /<script src="world-3d-logic\.js"><\/script>/);
    assert.doesNotMatch(html, /\bid="modalLevelGrid"/, `${file} should not include manual difficulty selector`);
    assert.equal(html.includes('submitScoreToGAS'), false, `${file} must not upload to Google Sheet`);
    assert.equal(html.includes('AbilityRadar'), false, `${file} must not write to ability radar`);
    assert.equal(html.includes('MUSIC1'), false, `${file} should not default to hardcoded global MUSIC1 room`);
    assert.match(html, /\bid="fgLobbyTabs"/);
    assert.match(html, /\bid="patternPicker"/);
    assert.match(html, /\bid="facePicker"/);
    assert.match(html, /\bid="stageIntroBanner"/);
    assert.match(html, /\bid="countdownSplash"/);
    assert.match(html, /\bid="bootSplash"/);
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
    assert.ok(inline.length > 1000, `${file} inline script present`);
    assert.doesNotThrow(() => new Function(inline), `${file} inline script syntax`);
    const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const jsIds = [...inline.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    const missing = jsIds.filter((id) => !htmlIds.has(id));
    assert.deepEqual(missing, [], `${file} missing DOM IDs`);
  }

  for (const file of ['shiba-slide-3d.html', 'www/shiba-slide-3d.html']) {
    const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /\bid="speedPicker"/, `${file} should not include manual speed/difficulty selector`);
    assert.match(html, /\bid="speedBadge"/, `${file} should include live speed/tier HUD badge`);
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
    assert.ok(inline.length > 1000, `${file} inline script present`);
    assert.doesNotThrow(() => new Function(inline), `${file} inline script syntax`);
    const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const jsIds = [...inline.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    const missing = jsIds.filter((id) => !htmlIds.has(id));
    assert.deepEqual(missing, [], `${file} missing DOM IDs`);
  }
});
