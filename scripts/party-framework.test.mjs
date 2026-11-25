import test from 'node:test';
import assert from 'node:assert/strict';
import { startPartyServer } from '../party-server/server.mjs';
import { generateQuestion, toPublicQuestion } from '../party-server/music-bank.mjs';

/**
 * Helper: Real Node.js WebSocket client wrapper (independent connection per client).
 */
class TestWsClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.reqId = 1;
    this.pending = new Map();
    this.events = [];
    this.lastSnapshot = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (err) => reject(err));
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.snapshot) this.lastSnapshot = msg.snapshot;
        if (msg.type === 'reply' && msg.reqId && this.pending.has(msg.reqId)) {
          const p = this.pending.get(msg.reqId);
          this.pending.delete(msg.reqId);
          p.resolve(msg);
        } else {
          this.events.push(msg);
        }
      });
    });
  }

  request(type, payload = {}) {
    const reqId = 't_' + (this.reqId++);
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
      this.ws.send(JSON.stringify({ type, reqId, ...payload }));
      setTimeout(() => {
        if (this.pending.has(reqId)) {
          this.pending.delete(reqId);
          reject(new Error(`Timeout waiting for ${type}`));
        }
      }, 4000);
    });
  }

  sendRaw(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  close() {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState === 3) { resolve(); return; }
      this.ws.addEventListener('close', () => resolve(), { once: true });
      this.ws.close();
    });
  }
}

async function waitForPhase(server, roomCode, targetPhase, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = server.manager.getPublicSnapshot(roomCode);
    if (snap && snap.phase === targetPhase) return snap;
    await new Promise(r => setTimeout(r, 30));
  }
  throw new Error(`Timed out waiting for phase ${targetPhase}`);
}

test('music-bank generates valid VexFlow questions and strips answers in public view', () => {
  for (const diff of ['easy', 'medium', 'hard']) {
    const q = generateQuestion(diff, 0);
    assert.ok(q.vexKey.includes('/'));
    assert.equal(q.choices.length, 4);
    assert.ok(q.choices.includes(q.answer));
    const pub = toPublicQuestion(q);
    assert.equal(pub.answer, undefined);
    assert.equal(pub.choices.length, 4);
  }
});

test('E2E Race Mode + Multi-Round + Return Lobby + Restart + Zero Residual State', async () => {
  const srv = await startPartyServer({ port: 0, briefingMs: 80, countdownMs: 80, tickMs: 25, answerCooldownMs: 10 });
  const teacher = new TestWsClient(srv.wsUrl);
  const student = new TestWsClient(srv.wsUrl);
  try {
    await teacher.connect();
    await student.connect();

    const created = await teacher.request('create_room', { hostName: '陳老師', mode: 'race', difficulty: 'easy', totalRounds: 2 });
    assert.equal(created.ok, true);
    const code = created.roomCode;

    // Privacy check: snapshot must never leak hostToken or reconnectToken
    assert.equal(created.snapshot.hostToken, undefined);
    assert.equal(created.snapshot.players[0].reconnectToken, undefined);

    const joined = await student.request('join_room', { roomCode: code, name: '小明' });
    assert.equal(joined.ok, true);
    assert.equal(joined.spectator, false);

    const readyRes = await student.request('set_ready', { ready: true });
    assert.equal(readyRes.ok, true);

    const startRes = await teacher.request('start_match', { hostToken: created.hostToken });
    assert.equal(startRes.ok, true);
    await waitForPhase(srv, code, 'playing');

    // Clear all 4 checkpoints for both players using server-authoritative answers
    const room = srv.manager.rooms.get(code);
    for (let cp = 0; cp < 4; cp++) {
      const ans = room.questions[cp].answer;
      const r1 = await student.request('submit_answer', { roundId: room.roundId, checkpointIndex: cp, choice: ans });
      assert.equal(r1.ok, true);
      assert.equal(r1.correct, true);
      await new Promise(r => setTimeout(r, 15));
      const r2 = await teacher.request('submit_answer', { roundId: room.roundId, checkpointIndex: cp, choice: ans });
      assert.equal(r2.ok, true);
      await new Promise(r => setTimeout(r, 15));
    }

    const r1Snap = srv.manager.getPublicSnapshot(code);
    assert.equal(r1Snap.phase, 'round_result');
    assert.equal(r1Snap.lastRoundSummary.roundNumber, 1);
    assert.equal(r1Snap.lastRoundSummary.standings[0].id, joined.playerId);

    // Advance to round 2 and settle
    const nextRes = await teacher.request('next_round', { hostToken: created.hostToken });
    assert.equal(nextRes.ok, true);
    await waitForPhase(srv, code, 'playing');
    for (let cp = 0; cp < 4; cp++) {
      const ans = room.questions[cp].answer;
      await teacher.request('submit_answer', { roundId: room.roundId, checkpointIndex: cp, choice: ans });
      await new Promise(r => setTimeout(r, 15));
      await student.request('submit_answer', { roundId: room.roundId, checkpointIndex: cp, choice: ans });
      await new Promise(r => setTimeout(r, 15));
    }
    const finalSnap = srv.manager.getPublicSnapshot(code);
    assert.equal(finalSnap.phase, 'final_result');
    assert.ok(finalSnap.finalSummary.standings[0].totalScore > 0);

    // Return to lobby and restart tournament -> previous totalScore must be wiped cleanly
    const lobRes = await teacher.request('return_lobby', { hostToken: created.hostToken });
    assert.equal(lobRes.ok, true);
    const restartRes = await teacher.request('start_match', { hostToken: created.hostToken });
    assert.equal(restartRes.ok, true);
    const restartedSnap = srv.manager.getPublicSnapshot(code);
    assert.equal(restartedSnap.players.every(p => p.totalScore === 0 && p.roundScore === 0), true);
  } finally {
    await teacher.close();
    await student.close();
    await srv.close();
  }
});

test('Security, Room Isolation, Anti-Cheat, Reconnect, Late-Join & Teacher Grace Timeout', async () => {
  const srv = await startPartyServer({ port: 0, briefingMs: 50, countdownMs: 50, teacherGraceMs: 180, tickMs: 25, answerCooldownMs: 10 });
  const hostA = new TestWsClient(srv.wsUrl);
  const stuA = new TestWsClient(srv.wsUrl);
  const hostB = new TestWsClient(srv.wsUrl);
  const lateStu = new TestWsClient(srv.wsUrl);
  try {
    await Promise.all([hostA.connect(), stuA.connect(), hostB.connect(), lateStu.connect()]);

    const rA = await hostA.request('create_room', { hostName: '老師A', maxPlayers: 3 });
    const rB = await hostB.request('create_room', { hostName: '老師B', maxPlayers: 3 });

    // Invalid room code
    const badJoin = await stuA.request('join_room', { roomCode: 'NOPE99', name: '小明' });
    assert.equal(badJoin.ok, false);
    assert.equal(badJoin.code, 'ROOM_NOT_FOUND');

    const jA = await stuA.request('join_room', { roomCode: rA.roomCode, name: '小明' });
    assert.equal(jA.ok, true);

    // Student cannot run host commands even with roomCode
    const unauthStart = await stuA.request('start_match', { roomCode: rA.roomCode, hostToken: rA.roomCode });
    assert.equal(unauthStart.ok, false);
    assert.equal(unauthStart.code, 'FORBIDDEN_NOT_HOST');

    // Cross-room isolation: hostB cannot start roomA
    const crossStart = await hostB.request('start_match', { roomCode: rA.roomCode, hostToken: rB.hostToken });
    assert.equal(crossStart.ok, false);
    assert.equal(crossStart.code, 'CROSS_ROOM_DENIED');

    // Start roomA -> late join enters as spectator
    await hostA.request('start_match', { hostToken: rA.hostToken });
    await waitForPhase(srv, rA.roomCode, 'playing');

    const lateRes = await lateStu.request('join_room', { roomCode: rA.roomCode, name: '遲到同學' });
    assert.equal(lateRes.ok, true);
    assert.equal(lateRes.spectator, true);

    // Room full rejection (maxPlayers=3: hostA + stuA + lateStu)
    const extraCli = new TestWsClient(srv.wsUrl);
    await extraCli.connect();
    const fullRes = await extraCli.request('join_room', { roomCode: rA.roomCode, name: '第四人' });
    assert.equal(fullRes.ok, false);
    assert.equal(fullRes.code, 'ROOM_FULL');
    await extraCli.close();

    // Spectator cannot answer
    const specAns = await lateStu.request('submit_answer', { checkpointIndex: 0, choice: 'C' });
    assert.equal(specAns.ok, false);
    assert.equal(specAns.code, 'SPECTATOR_CANNOT_ANSWER');

    // Anti-cheat: forged score & out-of-order checkpoint rejected
    const forged = await stuA.request('submit_answer', { checkpointIndex: 0, choice: 'C', score: 99999 });
    assert.equal(forged.ok, false);
    assert.equal(forged.code, 'FORBIDDEN_CLIENT_SCORE');

    const skipCp = await stuA.request('submit_answer', { checkpointIndex: 2, choice: 'C' });
    assert.equal(skipCp.ok, false);
    assert.equal(skipCp.code, 'INVALID_CHECKPOINT_ORDER');

    // Player disconnect + reconnect restores slot
    await stuA.close();
    await new Promise(r => setTimeout(r, 40));
    const stuAReconnect = new TestWsClient(srv.wsUrl);
    await stuAReconnect.connect();
    const recRes = await stuAReconnect.request('reconnect', {
      roomCode: rA.roomCode, playerId: jA.playerId, reconnectToken: jA.reconnectToken
    });
    assert.equal(recRes.ok, true);
    await stuAReconnect.close();

    // Teacher disconnect grace expires -> safely returns to lobby, host stays hostA (never transferred to student)
    await hostA.close();
    await new Promise(r => setTimeout(r, 260));
    const afterHostTimeout = srv.manager.getPublicSnapshot(rA.roomCode);
    assert.equal(afterHostTimeout.phase, 'lobby');
    assert.equal(afterHostTimeout.hostId, rA.playerId);
  } finally {
    await hostA.close();
    await stuA.close();
    await hostB.close();
    await lateStu.close();
    await srv.close();
  }
});

test('Survival, Co-op, and Team Battle (uneven teams) rules settle accurately', async () => {
  const srv = await startPartyServer({ port: 0, briefingMs: 40, countdownMs: 40, tickMs: 25, answerCooldownMs: 10 });
  const t = new TestWsClient(srv.wsUrl);
  const s1 = new TestWsClient(srv.wsUrl);
  const s2 = new TestWsClient(srv.wsUrl);
  try {
    await Promise.all([t.connect(), s1.connect(), s2.connect()]);
    const r = await t.request('create_room', { hostName: '老師', mode: 'survival' });
    const j1 = await s1.request('join_room', { roomCode: r.roomCode, name: '生還者' });
    const j2 = await s2.request('join_room', { roomCode: r.roomCode, name: '淘汰者' });

    // 1. Survival: s2 answers wrong twice -> eliminated & becomes spectator
    await t.request('start_match', { hostToken: r.hostToken });
    await waitForPhase(srv, r.roomCode, 'playing');
    const room = srv.manager.rooms.get(r.roomCode);
    const wrong0 = room.questions[0].choices.find(c => c !== room.questions[0].answer);
    const dup1 = await s2.request('submit_answer', { choice: wrong0 });
    assert.equal(dup1.correct, false);
    const dup2 = await s2.request('submit_answer', { choice: wrong0 });
    assert.equal(dup2.ok, false);
    assert.equal(dup2.code, 'DUPLICATE_ANSWER');

    await t.request('submit_answer', { choice: room.questions[0].answer });
    await s1.request('submit_answer', { choice: room.questions[0].answer });
    // Wave 1 auto-advances; s2 fails wave 1 -> eliminated (2 mistakes)
    await new Promise(res => setTimeout(res, 20));
    const wrong1 = room.questions[1].choices.find(c => c !== room.questions[1].answer);
    const elimRes = await s2.request('submit_answer', { choice: wrong1 });
    assert.equal(elimRes.eliminated, true);

    // 2. Co-op: reach collective target -> coopSuccess = true
    await t.request('return_lobby', { hostToken: r.hostToken });
    await t.request('update_config', { hostToken: r.hostToken, config: { mode: 'coop', totalRounds: 1 } });
    await t.request('start_match', { hostToken: r.hostToken });
    await waitForPhase(srv, r.roomCode, 'playing');
    const target = room.coopTarget;
    for (let i = 0; i < target; i++) {
      const cp = room.players.get(j1.playerId).checkpoint;
      const ans = room.questions[cp % room.questions.length].answer;
      await s1.request('submit_answer', { checkpointIndex: cp, choice: ans });
      await new Promise(res => setTimeout(res, 15));
    }
    const coopSnap = srv.manager.getPublicSnapshot(r.roomCode);
    assert.equal(coopSnap.lastRoundSummary.coopSuccess, true);

    // 3. Team Battle (uneven 2 red vs 1 blue): avgScore decides winner fairly
    await t.request('return_lobby', { hostToken: r.hostToken });
    await t.request('update_config', { hostToken: r.hostToken, config: { mode: 'team', totalRounds: 1, roundDurationMs: 15000 } });
    await t.request('assign_team', { hostToken: r.hostToken, targetPlayerId: r.playerId, team: 'red' });
    await t.request('assign_team', { hostToken: r.hostToken, targetPlayerId: j1.playerId, team: 'red' });
    await t.request('assign_team', { hostToken: r.hostToken, targetPlayerId: j2.playerId, team: 'blue' });
    await t.request('start_match', { hostToken: r.hostToken });
    await waitForPhase(srv, r.roomCode, 'playing');
    // Blue's solo member clears 2 checkpoints; Red clears 1 total -> Blue avgScore > Red avgScore
    for (let cp = 0; cp < 2; cp++) {
      await s2.request('submit_answer', { checkpointIndex: cp, choice: room.questions[cp].answer });
      await new Promise(res => setTimeout(res, 15));
    }
    await s1.request('submit_answer', { checkpointIndex: 0, choice: room.questions[0].answer });
    srv.manager._settleRound(room, 'timeout');
    const teamSnap = srv.manager.getPublicSnapshot(r.roomCode);
    assert.equal(teamSnap.lastRoundSummary.teamSummary.winner, 'blue');
  } finally {
    await t.close();
    await s1.close();
    await s2.close();
    await srv.close();
  }
});

test('Real WebSocket Load Tests: 2, 8, and 35 concurrent simulated clients', async () => {
  const srv = await startPartyServer({ port: 0, briefingMs: 40, countdownMs: 40, tickMs: 100, answerCooldownMs: 10 });
  const results = [];
  try {
    for (const count of [2, 8, 35]) {
      const clients = [];
      const t0 = performance.now();
      for (let i = 0; i < count; i++) {
        const c = new TestWsClient(srv.wsUrl);
        await c.connect();
        clients.push(c);
      }
      const hostRes = await clients[0].request('create_room', { hostName: `Host_${count}`, maxPlayers: 40, mode: 'race' });
      const code = hostRes.roomCode;
      await Promise.all(clients.slice(1).map((c, idx) => c.request('join_room', { roomCode: code, name: `Stu_${idx + 1}` })));

      // Measure RTT ping latency & simultaneous movement broadcast across all connected clients
      const rtts = [];
      await Promise.all(clients.map(async (c, idx) => {
        const p0 = performance.now();
        await c.request('ping', { clientTime: Date.now() });
        rtts.push(performance.now() - p0);
        c.sendRaw({ type: 'move', x: (idx % 7) - 3, y: 0, z: -2, yaw: 0.5 });
      }));
      await new Promise(r => setTimeout(r, 150));

      const snap = srv.manager.getPublicSnapshot(code);
      assert.equal(snap.players.length, count);
      const syncedAll = clients.every(c => c.lastSnapshot && c.lastSnapshot.players.length === count);
      assert.equal(syncedAll, true);

      rtts.sort((a, b) => a - b);
      const avgMs = (rtts.reduce((a, b) => a + b, 0) / rtts.length).toFixed(2);
      const p95Ms = rtts[Math.min(rtts.length - 1, Math.floor(rtts.length * 0.95))].toFixed(2);
      const memMb = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);
      results.push({ clients: count, setupMs: (performance.now() - t0).toFixed(1), avgRttMs: avgMs, p95RttMs: p95Ms, rssMb: memMb });

      await Promise.all(clients.map(c => c.close()));
    }
    console.log('[party-load-test]', JSON.stringify(results));
  } finally {
    await srv.close();
  }
});
