import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import worker, {
  WORLD_ACTIVE_TTL_MS,
  WORLD_RECONNECT_GRACE_MS,
  computeWorldRound,
  signSessionToken
} from '../cloudflare/noteschallenge-auth/worker.js';

const SECRET = 'world-test-secret-world-test-secret';

function createSharedWorldD1() {
  const users = new Map();
  const roster = new Map();
  const worldRooms = new Map();
  const schoolDomains = [];
  return {
    users,
    roster,
    worldRooms,
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
                  return row ? Object.assign({}, row) : null;
                }
              };
            }
          };
        }
        if (compact.startsWith('INSERT')) {
          return {
            bind(code, school_id, host_id, state, updated_at) {
              return {
                async run() {
                  worldRooms.set(code, { code, school_id, host_id, state, updated_at });
                  return { success: true };
                }
              };
            }
          };
        }
        if (compact.startsWith('UPDATE')) {
          return {
            bind(school_id, host_id, state, updated_at, code) {
              return {
                async run() {
                  worldRooms.set(code, { code, school_id, host_id, state, updated_at });
                  return { success: true };
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

test('all 6 distinct 3D layouts (tiles, piano, gates, turntable, freeze, crown) generate deterministic challenges', () => {
  assert.equal(Logic.ARENA_METRICS.maxPlayers, 50);
  assert.equal(Logic.PIANO_STAGE_KEYS.length, 13);
  assert.equal(Logic.ARENA_METRICS.crownTiers.length, 3);

  const modes = ['tiles', 'piano', 'gates', 'turntable', 'freeze', 'crown'];
  const topics = ['mixed', 'notes', 'rhythm', 'ear', 'terms'];
  const levels = ['basic', 'advanced'];

  for (const mode of modes) {
    for (const topic of topics) {
      for (const level of levels) {
        const seed = Logic.hashSeed(`${mode}_${topic}_${level}_round9`);
        const clientA = Logic.generateRoundChallenge(mode, topic, level, seed);
        const clientB = Logic.generateRoundChallenge(mode, topic, level, seed);
        assert.deepEqual(clientA, clientB, `mismatch for ${mode}/${topic}/${level}`);

        if (mode === 'crown') {
          assert.equal(clientA.orbs.length, 14);
        } else if (mode === 'piano') {
          assert.ok(Logic.PIANO_STAGE_KEYS.some((k) => k.id === clientA.targetKeyId));
          assert.equal(clientA.options.length, 13);
        } else {
          const expectedCount = (mode === 'gates' || mode === 'freeze' || mode === 'turntable') ? 4 : 9;
          assert.equal(clientA.options.length, expectedCount);
          assert.ok(clientA.options.includes(clientA.ans), `answer missing in ${mode}/${topic}`);
          assert.equal(new Set(clientA.options).size, expectedCount);
        }
      }
    }
  }
});

test('Party Mix (mix) mode rotates across 5 completely distinct 3D layouts with automatic speed & difficulty escalation', () => {
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
    assert.ok(info.escalation.speedMult > prevSpeed, `speedMult should increase at round ${r}`);
    assert.ok(info.escalation.bpm > prevBpm, `bpm should increase at round ${r}`);
    assert.ok(info.escalation.timerFactor < prevTimer, `timerFactor should decrease at round ${r}`);

    prevSpeed = info.escalation.speedMult;
    prevBpm = info.escalation.bpm;
    prevTimer = info.escalation.timerFactor;

    const rDur = Math.max(4.5, Number((cfg.roundSec * info.escalation.timerFactor).toFixed(2)));
    offsetMs += (rDur + cfg.revealSec) * 1000;
  }

  // Verify numeric escalation tiers progressively unlock advanced questions
  const basicTitles = new Set(Logic.QUESTION_BANK.notes.filter((q) => q.level === 'basic').map((q) => q.title));
  const advTitles = new Set(Logic.QUESTION_BANK.notes.filter((q) => q.level === 'advanced').map((q) => q.title));
  for (let s = 1; s <= 12; s++) {
    const q1 = Logic.generateRoundChallenge('tiles', 'notes', 1, s * 97);
    const q5 = Logic.generateRoundChallenge('tiles', 'notes', 5, s * 97);
    assert.ok(basicTitles.has(q1.title), `tier 1 should pick basic note question, got ${q1.title}`);
    assert.ok(advTitles.has(q5.title), `tier 5 should pick advanced note question, got ${q5.title}`);
  }
});

test('computeTurntableState maps 4 sectors accurately and produces rotational carry velocity', () => {
  const s0 = Logic.computeTurntableState(8, 8, 0);
  assert.equal(s0.onTurntable, true);
  assert.equal(s0.sector, 0);
  assert.ok(Math.hypot(s0.carryVx, s0.carryVz) > 1.0);

  const outside = Logic.computeTurntableState(25, 0, 0);
  assert.equal(outside.onTurntable, false);
  assert.equal(outside.sector, -1);
});

test('computeSpawnSlot assigns 50 non-overlapping starting positions across piano, gates, and plaza', () => {
  for (const mode of ['piano', 'gates', 'tiles']) {
    const slots = [];
    for (let i = 0; i < 50; i++) {
      slots.push(Logic.computeSpawnSlot(i, mode));
    }
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const dist = Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z);
        assert.ok(dist >= 1.5, `spawn overlap in ${mode} between slot ${i} and ${j}: dist=${dist}`);
      }
    }
  }
});

test('/world/sync persists across isolates in D1, aligns 8 real clients, enforces auth/host/kick, latecomer spectating, and 60s reconnect grace', async () => {
  const sharedDb = createSharedWorldD1();
  const baseNow = Date.now();
  // Two separate env objects simulating two independent Cloudflare Worker isolates sharing the same D1 database
  const isolateA = { DB: sharedDb, JWT_SECRET: SECRET, EXTRA_ALLOWED_EMAILS: 'teacher@school.edu.mo', NOW: baseNow };
  const isolateB = { DB: sharedDb, JWT_SECRET: SECRET, EXTRA_ALLOWED_EMAILS: 'teacher@school.edu.mo', NOW: baseNow };

  sharedDb.users.set('t-sub', { sub: 't-sub', email: 'teacher@school.edu.mo', name: '林老師', student_name: '林老師', grade: '', class: '' });
  sharedDb.users.set('s1-sub', { sub: 's1-sub', email: 's1@school.edu.mo', name: '陳小明', student_name: '陳小明', grade: '1', class: 'A' });
  sharedDb.roster.set('s1@school.edu.mo', { email: 's1@school.edu.mo', grade: '1', class: 'A', student_name: '陳小明', seat: '5' });

  const teacherTok = await signSessionToken({ sub: 't-sub', email: 'teacher@school.edu.mo' }, SECRET, baseNow);
  const studentTok = await signSessionToken({ sub: 's1-sub', email: 's1@school.edu.mo' }, SECRET, baseNow);

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

  // Unauthenticated request without clientKey is rejected (anti-abuse)
  const noKey = await post(isolateA, '/world/sync', { room: 'CLASS50', id: 'anon_1', name: '無鑰匙' });
  assert.equal(noKey.status, 401);

  // Teacher opens room on Isolate A
  const rHost = await post(isolateA, '/world/sync', {
    room: 'CLASS50',
    skin: 0xf59e0b,
    hat: 'conductor',
    x: 0, y: 1.25, z: -2.1, vx: 0, vz: 0, yaw: 0,
    emote: 'd3:🎉',
    modeState: { mode: 'piano', topic: 'notes', level: 'auto', seed: 1234, seq: 1, resetEpoch: true }
  }, teacherTok);
  assert.equal(rHost.status, 200);
  assert.equal(rHost.data.self.isHost, true);
  assert.equal(rHost.data.modeState.mode, 'piano');
  assert.equal(JSON.stringify(rHost.data).includes('@'), false, 'no email in public payload');
  assert.equal(sharedDb.worldRooms.has('CLASS50'), true, 'room stored in D1');

  // Authenticated student + 6 more keyed clients join on Isolate B (8 total real clients)
  const rS1 = await post(isolateB, '/world/sync', {
    room: 'CLASS50', skin: 0x38bdf8, hat: 'headphones', x: 3, y: 0, z: 4
  }, studentTok);
  assert.equal(rS1.status, 200);
  assert.equal(rS1.data.self.isHost, false);
  assert.equal(rS1.data.self.spectating, false);
  assert.equal(JSON.stringify(rS1.data).includes('@'), false);

  for (let i = 2; i <= 7; i++) {
    const res = await post(isolateB, '/world/sync', {
      room: 'CLASS50',
      id: `peer_client_${i}`,
      clientKey: `secret_client_key_000${i}`,
      name: `同學${i}`,
      x: i * 2, y: 0, z: 5
    });
    assert.equal(res.status, 200);
  }

  // Isolate A sees all 8 real players and identical seed/roundInfo
  isolateA.NOW = baseNow + 500;
  isolateB.NOW = baseNow + 500;
  const viewA = await post(isolateA, '/world/sync', { room: 'CLASS50', x: 1, y: 0, z: 1 }, teacherTok);
  assert.equal(viewA.data.players.length, 8);
  assert.equal(viewA.data.modeState.seed, rS1.data.modeState.seed);

  // Non-host cannot switch mode via /world/host (403)
  const badSwitch = await post(isolateB, '/world/host', {
    room: 'CLASS50', action: 'switch_mode', modeState: { mode: 'turntable', topic: 'rhythm' }
  }, studentTok);
  assert.equal(badSwitch.status, 403);

  // Spoofing another player's id with wrong clientKey is rejected (403)
  const spoof = await post(isolateB, '/world/sync', {
    room: 'CLASS50', id: 'peer_client_2', clientKey: 'wrong_key_12345678', name: '冒充者'
  });
  assert.equal(spoof.status, 403);

  // Teacher switches stage to turntable; all clients immediately align
  isolateA.NOW = baseNow + 1000;
  isolateB.NOW = baseNow + 1000;
  const switched = await post(isolateA, '/world/host', {
    room: 'CLASS50', action: 'switch_mode', modeState: { mode: 'turntable', topic: 'rhythm', seed: 5678 }
  }, teacherTok);
  assert.equal(switched.status, 200);
  assert.equal(switched.data.modeState.mode, 'turntable');
  assert.equal(switched.data.modeState.seq, 2);

  // Student 1 claims round points (deduplicated per roundKey)
  const rKey0 = switched.data.roundInfo.roundKey;
  isolateB.NOW = baseNow + 2000;
  const claim1 = await post(isolateB, '/world/sync', {
    room: 'CLASS50', roundClaim: { roundKey: rKey0, points: 165, won: true }
  }, studentTok);
  assert.equal(claim1.data.self.score, 165);
  assert.equal(claim1.data.self.streak, 1);

  // Duplicate claim for same roundKey does NOT double score
  isolateB.NOW = baseNow + 2500;
  const claimDup = await post(isolateB, '/world/sync', {
    room: 'CLASS50', roundClaim: { roundKey: rKey0, points: 165, won: true }
  }, studentTok);
  assert.equal(claimDup.data.self.score, 165);

  // Latecomer joins 4s into the active round -> spectating=true and cannot score this round
  isolateB.NOW = baseNow + 5000;
  const lateJoin = await post(isolateB, '/world/sync', {
    room: 'CLASS50',
    id: 'late_player_9',
    clientKey: 'late_player_secret_key_9',
    name: '遲到同學',
    roundClaim: { roundKey: rKey0, points: 200, won: true }
  });
  assert.equal(lateJoin.status, 200);
  assert.equal(lateJoin.data.self.spectating, true);
  assert.equal(lateJoin.data.self.score, 0, 'spectator cannot score current round');

  // Advance clock past round 0 (9.0 + 2.8 = 11.8s) -> latecomer automatically joins round 1
  isolateB.NOW = baseNow + 14000;
  const lateNext = await post(isolateB, '/world/sync', {
    room: 'CLASS50',
    id: 'late_player_9',
    clientKey: 'late_player_secret_key_9',
    name: '遲到同學'
  });
  assert.equal(lateNext.data.self.spectating, false);

  // Student 1 disconnects beyond WORLD_ACTIVE_TTL_MS (18s), then reconnects within WORLD_RECONNECT_GRACE_MS (60s)
  isolateA.NOW = baseNow + 2000 + WORLD_ACTIVE_TTL_MS + 5000;
  isolateB.NOW = isolateA.NOW;
  const afterDrop = await post(isolateA, '/world/sync', { room: 'CLASS50' }, teacherTok);
  assert.equal(afterDrop.data.players.some((p) => p.id === 'user:s1-sub'), false, 'idle student pruned from active list');

  assert.ok(WORLD_RECONNECT_GRACE_MS >= 60000);
  isolateB.NOW = isolateA.NOW + 2000;
  const reconnected = await post(isolateB, '/world/sync', {
    room: 'CLASS50',
    roundClaim: { roundKey: rKey0, points: 165, won: true }
  }, studentTok);
  assert.equal(reconnected.status, 200);
  assert.equal(reconnected.data.self.reconnected, true);
  assert.equal(reconnected.data.self.score, 165, 'score restored without duplication');

  // Host kicks peer_client_2 -> removed and blocked from rejoining
  const kicked = await post(isolateA, '/world/host', {
    room: 'CLASS50', action: 'kick', targetId: 'peer_client_2'
  }, teacherTok);
  assert.equal(kicked.status, 200);
  const blocked = await post(isolateB, '/world/sync', {
    room: 'CLASS50', id: 'peer_client_2', clientKey: 'secret_client_key_0002', name: '同學2'
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error, 'kicked');
});

test('world-3d.html and shiba-slide-3d.html inline scripts parse cleanly, Sprite Stacking is removed, and all getElementById targets exist', () => {
  // Verify Sprite Stacking assets are deleted and no longer copied in build.mjs
  assert.equal(fs.existsSync(new URL('../sprite-stacker-3d.html', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../www/sprite-stacker-3d.html', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../godot-music-party/scripts/SpriteStackProp.gd', import.meta.url)), false);

  for (const file of ['world-3d.html', 'www/world-3d.html']) {
    const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.match(html, /<script src="world-3d-logic\.js"><\/script>/);
    assert.doesNotMatch(html, /\bid="modalLevelGrid"/, `${file} should not include manual difficulty selector`);
    assert.equal(html.includes('submitScoreToGAS'), false, `${file} must not upload to Google Sheet`);
    assert.equal(html.includes('AbilityRadar'), false, `${file} must not write to ability radar`);
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
