import crypto from 'node:crypto';
import { DIFFICULTIES, generateQuestionSet, toPublicQuestion } from './music-bank.mjs';

export const GAME_MODES = ['race', 'survival', 'coop', 'team'];
export const PHASES = ['lobby', 'briefing', 'countdown', 'playing', 'round_result', 'final_result'];

const PLAYER_COLORS = [
  '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#10b981',
  '#ef4444', '#3b82f6', '#f97316', '#14b8a6', '#a855f7'
];

export const COURSE_CHECKPOINTS = [
  { index: 0, z: -12, spawnZ: -4, label: '第 1 關門' },
  { index: 1, z: -28, spawnZ: -20, label: '第 2 關門' },
  { index: 2, z: -44, spawnZ: -36, label: '第 3 關門' },
  { index: 3, z: -60, spawnZ: -52, label: '第 4 關門（終點）' }
];

function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function randomRoomCode(existing) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(0, chars.length)];
    if (!existing.has(code)) return code;
  }
  return 'RM' + Date.now().toString(36).slice(-4).toUpperCase();
}

function cleanName(raw, fallback = '玩家') {
  const s = String(raw || '').replace(/[<>&"'`]/g, '').trim().slice(0, 18);
  return s || fallback;
}

export class PartyRoomManager {
  constructor(options = {}) {
    this.rooms = new Map();
    this.now = options.now || (() => Date.now());
    this.briefingMs = options.briefingMs ?? 2500;
    this.countdownMs = options.countdownMs ?? 3000;
    this.teacherGraceMs = options.teacherGraceMs ?? 15000;
    this.reconnectGraceMs = options.reconnectGraceMs ?? 30000;
    this.roomIdleMs = options.roomIdleMs ?? 1800000; // 30 min
    this.answerCooldownMs = options.answerCooldownMs ?? 350;
    this.onBroadcast = options.onBroadcast || (() => {});
  }

  createRoom({ hostName = '老師', maxPlayers = 40, mode = 'race', difficulty = 'easy', totalRounds = 1, roundDurationMs = 90000 } = {}) {
    const code = randomRoomCode(this.rooms);
    const hostId = 'p_' + randomToken(6);
    const hostToken = randomToken(18);
    const reconnectToken = randomToken(14);
    const ts = this.now();

    const safeMax = Math.max(2, Math.min(45, Number(maxPlayers) || 40));
    const safeMode = GAME_MODES.includes(mode) ? mode : 'race';
    const safeDiff = DIFFICULTIES.includes(difficulty) ? difficulty : 'easy';
    const safeRounds = Math.max(1, Math.min(5, Number(totalRounds) || 1));

    const hostPlayer = {
      id: hostId,
      name: cleanName(hostName, '老師'),
      role: 'teacher',
      color: PLAYER_COLORS[0],
      team: 'red',
      ready: true,
      spectator: false,
      connected: true,
      reconnectToken,
      disconnectedAt: null,
      x: 0, y: 0, z: 2, yaw: 0,
      lastMoveAt: ts,
      lastAnswerAt: 0,
      answerLockedForKey: '',
      checkpoint: 0,
      mistakes: 0,
      eliminated: false,
      finishedAt: null,
      roundScore: 0,
      totalScore: 0,
      roundTasks: 0
    };

    const room = {
      code,
      createdAt: ts,
      lastActivityAt: ts,
      hostId,
      hostToken,
      hostDisconnectedAt: null,
      phase: 'lobby',
      config: {
        maxPlayers: safeMax,
        mode: safeMode,
        difficulty: safeDiff,
        totalRounds: safeRounds,
        roundDurationMs: Math.max(15000, Math.min(300000, Number(roundDurationMs) || 90000)),
        survivalWaveMs: 8000,
        survivalMaxWaves: 5,
        survivalMaxMistakes: 2,
        checkpointsCount: COURSE_CHECKPOINTS.length
      },
      tournamentId: 1,
      roundNumber: 0,
      roundId: '',
      phaseStartedAt: ts,
      phaseEndsAt: null,
      questions: [],
      survivalWave: 0,
      survivalWaveStartedAt: 0,
      survivalWaveEndsAt: 0,
      survivalAnswered: new Set(),
      coopProgress: 0,
      coopTarget: 4,
      lastRoundSummary: null,
      finalSummary: null,
      players: new Map([[hostId, hostPlayer]])
    };

    this.rooms.set(code, room);
    return {
      ok: true,
      roomCode: code,
      playerId: hostId,
      hostToken,
      reconnectToken,
      snapshot: this.getPublicSnapshot(code)
    };
  }

  joinRoom(roomCode, { name = '同學', team = null } = {}) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', error: '找不到此房間代碼' };

    const activeCount = room.players.size;
    if (activeCount >= room.config.maxPlayers) {
      return { ok: false, code: 'ROOM_FULL', error: '房間人數已滿' };
    }

    const baseName = cleanName(name, '同學');
    let finalName = baseName;
    let suffix = 2;
    const existingNames = new Set(Array.from(room.players.values()).map(p => p.name));
    while (existingNames.has(finalName)) {
      finalName = `${baseName.slice(0, 14)}#${suffix++}`;
    }

    const playerId = 'p_' + randomToken(6);
    const reconnectToken = randomToken(14);
    const ts = this.now();
    const isMidGame = room.phase !== 'lobby' && room.phase !== 'final_result';

    // Auto-balance team assignment
    let redCount = 0, blueCount = 0;
    for (const p of room.players.values()) {
      if (p.role === 'student' || p.role === 'teacher') {
        if (p.team === 'red') redCount++;
        else blueCount++;
      }
    }
    const assignedTeam = (team === 'red' || team === 'blue') ? team : (redCount <= blueCount ? 'red' : 'blue');

    const slotIdx = room.players.size;
    const player = {
      id: playerId,
      name: finalName,
      role: 'student',
      color: PLAYER_COLORS[slotIdx % PLAYER_COLORS.length],
      team: assignedTeam,
      ready: false,
      spectator: isMidGame,
      connected: true,
      reconnectToken,
      disconnectedAt: null,
      x: ((slotIdx % 7) - 3) * 1.8,
      y: 0,
      z: 2 + Math.floor(slotIdx / 7) * 1.6,
      yaw: 0,
      lastMoveAt: ts,
      lastAnswerAt: 0,
      answerLockedForKey: '',
      checkpoint: 0,
      mistakes: 0,
      eliminated: isMidGame,
      finishedAt: null,
      roundScore: 0,
      totalScore: 0,
      roundTasks: 0
    };

    room.players.set(playerId, player);
    room.lastActivityAt = ts;
    this.broadcastRoom(room, 'player_joined', { playerId, name: finalName, spectator: isMidGame });
    return {
      ok: true,
      roomCode: code,
      playerId,
      reconnectToken,
      spectator: isMidGame,
      snapshot: this.getPublicSnapshot(code)
    };
  }

  reconnectPlayer(roomCode, { playerId, reconnectToken, hostToken = null } = {}) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', error: '找不到此房間代碼' };
    const player = room.players.get(playerId);
    if (!player || player.reconnectToken !== reconnectToken) {
      return { ok: false, code: 'INVALID_RECONNECT', error: '重連憑證無效' };
    }
    const ts = this.now();
    player.connected = true;
    player.disconnectedAt = null;
    if (player.id === room.hostId && hostToken && hostToken === room.hostToken) {
      room.hostDisconnectedAt = null;
    }
    room.lastActivityAt = ts;
    this.broadcastRoom(room, 'player_reconnected', { playerId });
    return { ok: true, roomCode: code, playerId, snapshot: this.getPublicSnapshot(code) };
  }

  disconnectPlayer(roomCode, playerId) {
    const room = this.rooms.get(String(roomCode || '').toUpperCase());
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;
    const ts = this.now();
    player.connected = false;
    player.disconnectedAt = ts;
    if (playerId === room.hostId) {
      room.hostDisconnectedAt = ts;
    }
    room.lastActivityAt = ts;
    this.broadcastRoom(room, 'player_disconnected', { playerId, isHost: playerId === room.hostId });
  }

  leaveRoom(roomCode, playerId) {
    const room = this.rooms.get(String(roomCode || '').toUpperCase());
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND' };
    if (!room.players.has(playerId)) return { ok: false, code: 'PLAYER_NOT_FOUND' };
    const wasHost = playerId === room.hostId;
    if (wasHost) {
      // Never transfer host privilege to students; safely reset to lobby and mark host offline
      this.disconnectPlayer(room.code, playerId);
      if (room.phase !== 'lobby') {
        room.phase = 'lobby';
        room.phaseEndsAt = null;
      }
      this.broadcastRoom(room, 'host_left', { message: '老師已離開房間，賽事已安全暫停並返回大廳' });
      return { ok: true, snapshot: this.getPublicSnapshot(room.code) };
    }
    room.players.delete(playerId);
    room.lastActivityAt = this.now();
    this.broadcastRoom(room, 'player_left', { playerId });
    return { ok: true, snapshot: this.getPublicSnapshot(room.code) };
  }

  _requireHost(roomCode, playerId, hostToken) {
    const room = this.rooms.get(String(roomCode || '').toUpperCase());
    if (!room) return { error: { ok: false, code: 'ROOM_NOT_FOUND', error: '找不到房間' } };
    if (playerId !== room.hostId || !hostToken || hostToken !== room.hostToken) {
      return { error: { ok: false, code: 'FORBIDDEN_NOT_HOST', error: '權限不足：僅限房主老師操作' } };
    }
    return { room };
  }

  setReady(roomCode, playerId, ready) {
    const room = this.rooms.get(String(roomCode || '').toUpperCase());
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', error: '找不到房間' };
    const player = room.players.get(playerId);
    if (!player) return { ok: false, code: 'PLAYER_NOT_FOUND', error: '玩家不在此房間' };
    player.ready = !!ready;
    room.lastActivityAt = this.now();
    this.broadcastRoom(room, 'state_sync', {});
    return { ok: true, ready: player.ready };
  }

  updateConfig(roomCode, playerId, hostToken, patch = {}) {
    const { room, error } = this._requireHost(roomCode, playerId, hostToken);
    if (error) return error;
    if (room.phase !== 'lobby' && room.phase !== 'final_result') {
      return { ok: false, code: 'INVALID_PHASE', error: '僅能在大廳修改規則設定' };
    }
    if (patch.mode && GAME_MODES.includes(patch.mode)) room.config.mode = patch.mode;
    if (patch.difficulty && DIFFICULTIES.includes(patch.difficulty)) room.config.difficulty = patch.difficulty;
    if (patch.totalRounds != null) room.config.totalRounds = Math.max(1, Math.min(5, Number(patch.totalRounds) || 1));
    if (patch.maxPlayers != null) room.config.maxPlayers = Math.max(2, Math.min(45, Number(patch.maxPlayers) || 40));
    if (patch.roundDurationMs != null) room.config.roundDurationMs = Math.max(15000, Math.min(300000, Number(patch.roundDurationMs) || 90000));
    room.lastActivityAt = this.now();
    this.broadcastRoom(room, 'config_updated', { config: room.config });
    return { ok: true, config: { ...room.config } };
  }

  assignTeam(roomCode, playerId, hostToken, targetPlayerId, team) {
    const { room, error } = this._requireHost(roomCode, playerId, hostToken);
    if (error) return error;
    if (team !== 'red' && team !== 'blue') return { ok: false, code: 'INVALID_TEAM', error: '隊伍必須為 red 或 blue' };
    const target = room.players.get(targetPlayerId);
    if (!target) return { ok: false, code: 'PLAYER_NOT_FOUND', error: '找不到目標玩家' };
    target.team = team;
    room.lastActivityAt = this.now();
    this.broadcastRoom(room, 'state_sync', {});
    return { ok: true, targetPlayerId, team };
  }

  kickPlayer(roomCode, playerId, hostToken, targetPlayerId) {
    const { room, error } = this._requireHost(roomCode, playerId, hostToken);
    if (error) return error;
    if (targetPlayerId === room.hostId) return { ok: false, code: 'CANNOT_KICK_HOST', error: '不能移除房主自己' };
    if (!room.players.has(targetPlayerId)) return { ok: false, code: 'PLAYER_NOT_FOUND', error: '玩家不在此房間' };
    room.players.delete(targetPlayerId);
    room.lastActivityAt = this.now();
    this.broadcastRoom(room, 'player_kicked', { targetPlayerId });
    return { ok: true, targetPlayerId };
  }

  startMatch(roomCode, playerId, hostToken) {
    const { room, error } = this._requireHost(roomCode, playerId, hostToken);
    if (error) return error;
    if (room.phase !== 'lobby' && room.phase !== 'final_result') {
      return { ok: false, code: 'INVALID_PHASE', error: '目前不在大廳狀態' };
    }
    // Reset tournament totals cleanly (zero residual state from previous match)
    room.tournamentId += 1;
    room.roundNumber = 1;
    room.lastRoundSummary = null;
    room.finalSummary = null;
    for (const p of room.players.values()) {
      p.totalScore = 0;
      p.spectator = false;
      p.eliminated = false;
    }
    this._beginRoundBriefing(room);
    return { ok: true, roundId: room.roundId, phase: room.phase };
  }

  nextRound(roomCode, playerId, hostToken) {
    const { room, error } = this._requireHost(roomCode, playerId, hostToken);
    if (error) return error;
    if (room.phase !== 'round_result') {
      return { ok: false, code: 'INVALID_PHASE', error: '目前尚未進入單關結算' };
    }
    if (room.roundNumber >= room.config.totalRounds) {
      this._finalizeTournament(room);
      return { ok: true, phase: room.phase };
    }
    room.roundNumber += 1;
    this._beginRoundBriefing(room);
    return { ok: true, roundId: room.roundId, phase: room.phase };
  }

  returnToLobby(roomCode, playerId, hostToken) {
    const { room, error } = this._requireHost(roomCode, playerId, hostToken);
    if (error) return error;
    room.phase = 'lobby';
    room.phaseEndsAt = null;
    room.roundId = '';
    room.questions = [];
    room.lastRoundSummary = null;
    for (const p of room.players.values()) {
      p.spectator = false;
      p.eliminated = false;
      p.checkpoint = 0;
      p.mistakes = 0;
      p.finishedAt = null;
      p.roundScore = 0;
      p.roundTasks = 0;
      p.answerLockedForKey = '';
      p.x = 0; p.y = 0; p.z = 2;
      if (p.role !== 'teacher') p.ready = false;
    }
    room.lastActivityAt = this.now();
    this.broadcastRoom(room, 'returned_lobby', {});
    return { ok: true, phase: 'lobby' };
  }

  _beginRoundBriefing(room) {
    const ts = this.now();
    room.roundId = `t${room.tournamentId}_r${room.roundNumber}_${randomToken(4)}`;
    room.phase = 'briefing';
    room.phaseStartedAt = ts;
    room.phaseEndsAt = ts + this.briefingMs;
    const qCount = room.config.mode === 'survival'
      ? room.config.survivalMaxWaves
      : Math.max(room.config.checkpointsCount, 6);
    room.questions = generateQuestionSet(room.config.difficulty, qCount);
    room.survivalWave = 0;
    room.survivalAnswered = new Set();
    room.coopProgress = 0;
    const activePlayers = Array.from(room.players.values()).filter(p => p.connected && !p.spectator).length;
    room.coopTarget = Math.max(4, activePlayers * 2);

    let idx = 0;
    for (const p of room.players.values()) {
      p.spectator = false;
      p.eliminated = false;
      p.checkpoint = 0;
      p.mistakes = 0;
      p.finishedAt = null;
      p.roundScore = 0;
      p.roundTasks = 0;
      p.answerLockedForKey = '';
      p.x = ((idx % 7) - 3) * 1.6;
      p.y = 0;
      p.z = -3 + Math.floor(idx / 7) * 1.2;
      idx++;
    }
    room.lastActivityAt = ts;
    this.broadcastRoom(room, 'phase_changed', { phase: 'briefing', roundId: room.roundId });
  }

  handleMove(roomCode, playerId, payload = {}) {
    // Reject any client attempt to inject authoritative fields
    if (payload.score !== undefined || payload.totalScore !== undefined || payload.finished !== undefined || payload.checkpoint !== undefined) {
      return { ok: false, code: 'FORBIDDEN_CLIENT_SCORE', error: '分數與過關進度由伺服器權威判定，不接受客戶端提交' };
    }
    const room = this.rooms.get(String(roomCode || '').toUpperCase());
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND' };
    const p = room.players.get(playerId);
    if (!p || !p.connected) return { ok: false, code: 'PLAYER_NOT_FOUND' };

    const ts = this.now();
    const dt = Math.max(0.016, Math.min(1.0, (ts - p.lastMoveAt) / 1000));
    const nx = Number(payload.x);
    const ny = Number(payload.y);
    const nz = Number(payload.z);
    const nyaw = Number(payload.yaw) || 0;
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) {
      return { ok: false, code: 'INVALID_COORDS' };
    }

    // Plausibility clamp (anti-teleportation; allows normal run + jump + respawn)
    const maxStep = Math.max(4.5, dt * 26.0);
    const dist = Math.hypot(nx - p.x, nz - p.z);
    if (dist > maxStep && room.phase === 'playing' && !p.spectator) {
      const ratio = maxStep / dist;
      p.x = p.x + (nx - p.x) * ratio;
      p.z = p.z + (nz - p.z) * ratio;
    } else {
      p.x = Math.max(-18, Math.min(18, nx));
      p.z = Math.max(-72, Math.min(16, nz));
    }
    p.y = Math.max(-5, Math.min(15, ny));
    p.yaw = nyaw;
    p.lastMoveAt = ts;
    room.lastActivityAt = ts;
    return { ok: true };
  }

  submitAnswer(roomCode, playerId, payload = {}) {
    // Anti-cheat: reject forged score / client-claimed result
    if (payload.score !== undefined || payload.totalScore !== undefined || payload.isCorrect !== undefined || payload.finished !== undefined) {
      return { ok: false, code: 'FORBIDDEN_CLIENT_SCORE', error: '不接受客戶端提交分數或判定結果' };
    }
    const room = this.rooms.get(String(roomCode || '').toUpperCase());
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', error: '找不到房間' };
    if (room.phase !== 'playing') {
      return { ok: false, code: 'NOT_PLAYING', error: '目前不在進行中的關卡' };
    }
    if (payload.roundId && payload.roundId !== room.roundId) {
      return { ok: false, code: 'STALE_ROUND', error: '過期回合訊息已忽略' };
    }
    const p = room.players.get(playerId);
    if (!p || !p.connected) return { ok: false, code: 'PLAYER_NOT_FOUND', error: '玩家不在此房間' };
    if (p.spectator || p.eliminated) {
      return { ok: false, code: 'SPECTATOR_CANNOT_ANSWER', error: '觀戰中無法作答' };
    }

    const ts = this.now();
    const choice = String(payload.choice || '').trim();
    if (!choice) return { ok: false, code: 'EMPTY_CHOICE', error: '請先踩上地磚再確認作答' };

    const mode = room.config.mode;

    // MODE 2: SURVIVAL (check wave lock before rate limit so double-submit returns DUPLICATE_ANSWER)
    if (mode === 'survival') {
      const waveIdx = room.survivalWave;
      const lockKey = `${room.roundId}:w${waveIdx}`;
      if (p.answerLockedForKey === lockKey) {
        return { ok: false, code: 'DUPLICATE_ANSWER', error: '本波題目已鎖定作答，請勿重複提交' };
      }
      if (ts - p.lastAnswerAt < this.answerCooldownMs) {
        return { ok: false, code: 'RATE_LIMITED', error: '作答頻率過快，請稍候' };
      }
      p.lastAnswerAt = ts;
      room.lastActivityAt = ts;
      const q = room.questions[waveIdx];
      if (!q) return { ok: false, code: 'NO_QUESTION' };
      p.answerLockedForKey = lockKey;
      room.survivalAnswered.add(playerId);

      const correct = choice === q.answer;
      if (correct) {
        p.roundScore += 150;
        p.roundTasks += 1;
      } else {
        p.mistakes += 1;
        if (p.mistakes >= room.config.survivalMaxMistakes) {
          p.eliminated = true;
          p.spectator = true;
        }
      }
      this.broadcastRoom(room, 'answer_result', {
        playerId, correct, eliminated: p.eliminated, mistakes: p.mistakes, wave: waveIdx
      });
      this._checkRoundCompletion(room);
      return { ok: true, correct, eliminated: p.eliminated, mistakes: p.mistakes, roundScore: p.roundScore };
    }

    // MODE 1 (RACE), MODE 3 (COOP), MODE 4 (TEAM)
    const reqCp = Number(payload.checkpointIndex);
    if (!Number.isInteger(reqCp) || reqCp !== p.checkpoint) {
      return { ok: false, code: 'INVALID_CHECKPOINT_ORDER', error: `必須依序完成第 ${p.checkpoint + 1} 檢查點` };
    }
    if (mode === 'race' && p.finishedAt !== null) {
      return { ok: false, code: 'ALREADY_FINISHED', error: '你已經完成本關' };
    }

    const qIdx = p.checkpoint % room.questions.length;
    const q = room.questions[qIdx];
    const lockKey = `${room.roundId}:cp${p.checkpoint}:${q.qId}`;
    if (p.answerLockedForKey === lockKey) {
      return { ok: false, code: 'DUPLICATE_ANSWER', error: '此檢查點已完成確認' };
    }
    if (ts - p.lastAnswerAt < this.answerCooldownMs) {
      return { ok: false, code: 'RATE_LIMITED', error: '作答頻率過快，請稍候' };
    }
    p.lastAnswerAt = ts;
    room.lastActivityAt = ts;

    const correct = choice === q.answer;
    if (correct) {
      p.answerLockedForKey = lockKey;
      p.roundTasks += 1;
      p.checkpoint += 1;
      const elapsedSec = Math.max(0, (ts - room.phaseStartedAt) / 1000);
      const speedBonus = Math.max(20, Math.round(100 - elapsedSec * 1.2));
      p.roundScore += 100 + speedBonus;

      if (mode === 'coop') {
        room.coopProgress += 1;
      }

      let finished = false;
      if (mode === 'race' && p.checkpoint >= room.config.checkpointsCount) {
        p.finishedAt = ts;
        p.roundScore += 200;
        finished = true;
      }
      // In coop / team, loop checkpoints seamlessly after clearing 4
      if ((mode === 'coop' || mode === 'team') && p.checkpoint >= room.config.checkpointsCount) {
        p.checkpoint = 0;
        p.z = -3;
        p.answerLockedForKey = '';
      }

      this.broadcastRoom(room, 'answer_result', {
        playerId, correct: true, checkpoint: p.checkpoint, finished, coopProgress: room.coopProgress, coopTarget: room.coopTarget
      });
      this._checkRoundCompletion(room);
      return { ok: true, correct: true, checkpoint: p.checkpoint, finished, roundScore: p.roundScore };
    } else {
      p.mistakes += 1;
      const cpDef = COURSE_CHECKPOINTS[p.checkpoint] || COURSE_CHECKPOINTS[0];
      p.z = cpDef.spawnZ;
      p.y = 0;
      this.broadcastRoom(room, 'answer_result', {
        playerId, correct: false, checkpoint: p.checkpoint, respawnZ: cpDef.spawnZ, mistakes: p.mistakes
      });
      return { ok: true, correct: false, checkpoint: p.checkpoint, respawnZ: cpDef.spawnZ, mistakes: p.mistakes };
    }
  }

  _checkRoundCompletion(room) {
    if (room.phase !== 'playing') return;
    const mode = room.config.mode;
    const active = Array.from(room.players.values()).filter(p => p.connected && (!p.spectator || p.eliminated));

    if (mode === 'race') {
      const racers = Array.from(room.players.values()).filter(p => p.connected && !p.spectator);
      if (racers.length > 0 && racers.every(p => p.finishedAt !== null)) {
        this._settleRound(room, 'all_finished');
      }
    } else if (mode === 'coop') {
      if (room.coopProgress >= room.coopTarget) {
        this._settleRound(room, 'coop_target_reached');
      }
    } else if (mode === 'survival') {
      const survivors = Array.from(room.players.values()).filter(p => p.connected && !p.eliminated && !p.spectator);
      if (survivors.length === 0) {
        this._settleRound(room, 'all_eliminated');
      } else if (active.length > 1 && survivors.length === 1) {
        this._settleRound(room, 'last_survivor');
      } else if (survivors.every(p => room.survivalAnswered.has(p.id))) {
        this._advanceSurvivalWave(room);
      }
    }
  }

  _advanceSurvivalWave(room) {
    const ts = this.now();
    // Penalize connected non-eliminated players who failed to answer before wave timeout
    for (const p of room.players.values()) {
      if (p.connected && !p.spectator && !p.eliminated && !room.survivalAnswered.has(p.id)) {
        p.mistakes += 1;
        if (p.mistakes >= room.config.survivalMaxMistakes) {
          p.eliminated = true;
          p.spectator = true;
        }
      }
    }
    const survivors = Array.from(room.players.values()).filter(p => p.connected && !p.eliminated && !p.spectator);
    if (survivors.length === 0 || room.survivalWave + 1 >= room.config.survivalMaxWaves) {
      this._settleRound(room, survivors.length === 0 ? 'all_eliminated' : 'waves_completed');
      return;
    }
    room.survivalWave += 1;
    room.survivalAnswered = new Set();
    room.survivalWaveStartedAt = ts;
    room.survivalWaveEndsAt = ts + room.config.survivalWaveMs;
    this.broadcastRoom(room, 'survival_wave', { wave: room.survivalWave, endsAt: room.survivalWaveEndsAt });
  }

  _settleRound(room, reason) {
    const ts = this.now();
    room.phase = 'round_result';
    room.phaseStartedAt = ts;
    room.phaseEndsAt = null;
    const mode = room.config.mode;

    const list = Array.from(room.players.values());
    // Sort players per mode rules
    const ranked = list.slice().sort((a, b) => {
      if (mode === 'race') {
        const aFin = a.finishedAt !== null ? 0 : 1;
        const bFin = b.finishedAt !== null ? 0 : 1;
        if (aFin !== bFin) return aFin - bFin;
        if (a.finishedAt !== null && b.finishedAt !== null && a.finishedAt !== b.finishedAt) {
          return a.finishedAt - b.finishedAt;
        }
        if (b.checkpoint !== a.checkpoint) return b.checkpoint - a.checkpoint;
        return a.mistakes - b.mistakes;
      }
      if (mode === 'survival') {
        if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
        if (b.roundScore !== a.roundScore) return b.roundScore - a.roundScore;
        return a.mistakes - b.mistakes;
      }
      if (b.roundScore !== a.roundScore) return b.roundScore - a.roundScore;
      return a.mistakes - b.mistakes;
    });

    // Accumulate tournament totalScore
    ranked.forEach((p, idx) => {
      if (mode === 'race' && p.finishedAt !== null) {
        p.roundScore += Math.max(0, 120 - idx * 25);
      }
      if (mode === 'coop' && room.coopProgress >= room.coopTarget) {
        p.roundScore += 150;
      }
      p.totalScore += p.roundScore;
    });

    // Team battle fairness calculation (handles uneven team sizes, ties & disconnects)
    let teamSummary = null;
    if (mode === 'team') {
      const calcTeam = (teamId) => {
        const members = list.filter(p => p.team === teamId && !p.spectator);
        const activeCount = Math.max(1, members.filter(p => p.connected || p.roundTasks > 0).length);
        const rawScore = members.reduce((s, p) => s + p.roundScore, 0);
        const avgScore = Math.round((rawScore / activeCount) * 10) / 10;
        return { team: teamId, memberCount: members.length, activeCount, rawScore, avgScore };
      };
      const red = calcTeam('red');
      const blue = calcTeam('blue');
      let winner = 'draw';
      if (red.avgScore > blue.avgScore) winner = 'red';
      else if (blue.avgScore > red.avgScore) winner = 'blue';
      else if (red.rawScore > blue.rawScore) winner = 'red';
      else if (blue.rawScore > red.rawScore) winner = 'blue';
      teamSummary = { red, blue, winner, rule: '人數不均時以人均分(avgScore)決勝，同分則比總分，再同則平手' };
    }

    room.lastRoundSummary = {
      roundId: room.roundId,
      roundNumber: room.roundNumber,
      totalRounds: room.config.totalRounds,
      mode,
      reason,
      coopSuccess: mode === 'coop' ? room.coopProgress >= room.coopTarget : null,
      coopProgress: room.coopProgress,
      coopTarget: room.coopTarget,
      teamSummary,
      standings: ranked.map((p, i) => ({
        rank: i + 1,
        id: p.id,
        name: p.name,
        team: p.team,
        checkpoint: p.checkpoint,
        finishedMs: p.finishedAt ? Math.max(0, p.finishedAt - room.phaseStartedAt) : null,
        eliminated: p.eliminated,
        mistakes: p.mistakes,
        roundScore: p.roundScore,
        totalScore: p.totalScore
      }))
    };

    this.broadcastRoom(room, 'round_settled', { summary: room.lastRoundSummary });
    if (room.roundNumber >= room.config.totalRounds) {
      this._finalizeTournament(room);
    }
  }

  _finalizeTournament(room) {
    const ts = this.now();
    room.phase = 'final_result';
    room.phaseStartedAt = ts;
    const ranked = Array.from(room.players.values()).sort((a, b) => b.totalScore - a.totalScore || a.mistakes - b.mistakes);
    room.finalSummary = {
      tournamentId: room.tournamentId,
      totalRounds: room.config.totalRounds,
      mode: room.config.mode,
      standings: ranked.map((p, i) => ({
        rank: i + 1,
        id: p.id,
        name: p.name,
        team: p.team,
        totalScore: p.totalScore
      }))
    };
    this.broadcastRoom(room, 'tournament_finished', { finalSummary: room.finalSummary });
  }

  /**
   * Periodic authoritative server tick (phases, timeouts, teacher grace, idle cleanup).
   */
  tick() {
    const ts = this.now();
    for (const [code, room] of this.rooms.entries()) {
      // 1. Clean up completely idle rooms
      const anyConnected = Array.from(room.players.values()).some(p => p.connected);
      if (!anyConnected && ts - room.lastActivityAt > this.roomIdleMs) {
        this.rooms.delete(code);
        continue;
      }

      // 2. Teacher disconnect grace expiration -> safely return to lobby, NEVER hand host to students
      if (room.hostDisconnectedAt !== null && ts - room.hostDisconnectedAt >= this.teacherGraceMs) {
        room.hostDisconnectedAt = null;
        if (room.phase !== 'lobby') {
          room.phase = 'lobby';
          room.phaseEndsAt = null;
          room.roundId = '';
          this.broadcastRoom(room, 'host_timeout_reset', {
            message: '老師斷線超過寬限時間，已安全結束本局並返回等待大廳'
          });
        }
      }

      // 3. Prune long-disconnected non-host students in lobby
      if (room.phase === 'lobby') {
        for (const [pid, p] of room.players.entries()) {
          if (pid !== room.hostId && !p.connected && p.disconnectedAt && ts - p.disconnectedAt > this.reconnectGraceMs) {
            room.players.delete(pid);
          }
        }
      }

      // 4. Phase transitions driven strictly by server clock
      if (room.phase === 'briefing' && room.phaseEndsAt && ts >= room.phaseEndsAt) {
        room.phase = 'countdown';
        room.phaseStartedAt = ts;
        room.phaseEndsAt = ts + this.countdownMs;
        this.broadcastRoom(room, 'phase_changed', { phase: 'countdown', endsAt: room.phaseEndsAt });
      } else if (room.phase === 'countdown' && room.phaseEndsAt && ts >= room.phaseEndsAt) {
        room.phase = 'playing';
        room.phaseStartedAt = ts;
        room.phaseEndsAt = ts + room.config.roundDurationMs;
        if (room.config.mode === 'survival') {
          room.survivalWave = 0;
          room.survivalWaveStartedAt = ts;
          room.survivalWaveEndsAt = ts + room.config.survivalWaveMs;
        }
        this.broadcastRoom(room, 'phase_changed', { phase: 'playing', endsAt: room.phaseEndsAt });
      } else if (room.phase === 'playing') {
        if (room.config.mode === 'survival' && room.survivalWaveEndsAt && ts >= room.survivalWaveEndsAt) {
          this._advanceSurvivalWave(room);
        } else if (room.phaseEndsAt && ts >= room.phaseEndsAt) {
          this._settleRound(room, 'timeout');
        }
      }
    }
  }

  /**
   * Privacy-safe public snapshot: strictly omits hostToken, reconnectToken, email, and secrets.
   */
  getPublicSnapshot(roomCode) {
    const room = this.rooms.get(String(roomCode || '').toUpperCase());
    if (!room) return null;
    const ts = this.now();
    const publicPlayers = [];
    for (const p of room.players.values()) {
      publicPlayers.push({
        id: p.id,
        name: p.name,
        role: p.role,
        color: p.color,
        team: p.team,
        ready: p.ready,
        spectator: p.spectator,
        connected: p.connected,
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
        z: Number(p.z.toFixed(2)),
        yaw: Number(p.yaw.toFixed(2)),
        checkpoint: p.checkpoint,
        mistakes: p.mistakes,
        eliminated: p.eliminated,
        finished: p.finishedAt !== null,
        roundScore: p.roundScore,
        totalScore: p.totalScore
      });
    }
    const activeQuestions = room.phase === 'playing' || room.phase === 'countdown' || room.phase === 'briefing'
      ? room.questions.map(toPublicQuestion)
      : [];
    return {
      roomCode: room.code,
      serverTime: ts,
      phase: room.phase,
      phaseEndsAt: room.phaseEndsAt,
      roundId: room.roundId,
      roundNumber: room.roundNumber,
      tournamentId: room.tournamentId,
      config: { ...room.config },
      hostId: room.hostId,
      hostOnline: room.hostDisconnectedAt === null,
      survivalWave: room.survivalWave,
      survivalWaveEndsAt: room.survivalWaveEndsAt,
      coopProgress: room.coopProgress,
      coopTarget: room.coopTarget,
      questions: activeQuestions,
      lastRoundSummary: room.lastRoundSummary,
      finalSummary: room.finalSummary,
      players: publicPlayers
    };
  }

  broadcastRoom(room, event, extra = {}) {
    this.onBroadcast(room.code, {
      type: 'event',
      event,
      ...extra,
      snapshot: this.getPublicSnapshot(room.code)
    });
  }
}
