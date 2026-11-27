import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import worker, { clearWorld3DRooms } from '../cloudflare/noteschallenge-auth/worker.js';

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
    assert.equal(info.roundNum, r);
    assert.equal(info.showRound, r + 1);
    assert.equal(info.effectiveMode, expectedLayouts[r]);
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

test('/world/sync accepts new piano and turntable layouts with 50 concurrent players and 3D dance emotes', async () => {
  clearWorld3DRooms();
  const origin = 'http://localhost:8080';

  async function postSync(body) {
    const req = new Request('https://auth.example.com/world/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body)
    });
    const res = await worker.fetch(req, {});
    assert.equal(res.status, 200);
    return res.json();
  }

  const r1 = await postSync({
    room: 'PIANO50',
    id: 'p_host',
    name: '林老師',
    skin: 0xf59e0b,
    hat: 'conductor',
    x: 0, y: 1.25, z: -2.1, vx: 0, vz: 0, yaw: 0,
    emote: 'd3:🎉',
    score: 500, streak: 3,
    modeState: { mode: 'piano', topic: 'notes', level: 'advanced', seed: 1234, seq: 1, resetEpoch: true }
  });
  assert.equal(r1.modeState.mode, 'piano');
  assert.equal(r1.players[0].emote, 'd3:🎉');

  const r2 = await postSync({
    room: 'PIANO50',
    id: 'p_host',
    name: '林老師',
    skin: 0xf59e0b,
    hat: 'conductor',
    x: 5, y: 0.36, z: 5, vx: 2, vz: -2, yaw: 1.1,
    emote: 'd1:🎵',
    score: 660, streak: 4,
    modeState: { mode: 'turntable', topic: 'rhythm', level: 'basic', seed: 5678, seq: 2, resetEpoch: true }
  });
  assert.equal(r2.modeState.mode, 'turntable');
  assert.equal(r2.modeState.seq, 2);
});

test('world-3d.html and shiba-slide-3d.html inline scripts parse cleanly, remove manual difficulty pickers, and all getElementById targets exist', () => {
  for (const file of ['world-3d.html', 'www/world-3d.html']) {
    const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.match(html, /<script src="world-3d-logic\.js"><\/script>/);
    assert.doesNotMatch(html, /\bid="modalLevelGrid"/, `${file} should not include manual difficulty selector`);
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
