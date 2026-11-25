/**
 * Replaceable Transport Layer for Notes Challenge 3D Party Framework.
 * - WebSocketPartyTransport: Real authoritative WebSocket room backend (swappable URL for Node or Cloudflare DO).
 * - LocalSoloTransport: Single-player practice engine sharing the exact same checkpoint & VexFlow music rules,
 *   explicitly isolated from multiplayer leaderboards and Google Sheets.
 */
(function (root) {
  'use strict';

  const SOLO_POOLS = {
    easy: [
      { clef: 'treble', vexKey: 'c/4', acc: null, answer: 'C', freq: 261.63 },
      { clef: 'treble', vexKey: 'd/4', acc: null, answer: 'D', freq: 293.66 },
      { clef: 'treble', vexKey: 'e/4', acc: null, answer: 'E', freq: 329.63 },
      { clef: 'treble', vexKey: 'f/4', acc: null, answer: 'F', freq: 349.23 },
      { clef: 'treble', vexKey: 'g/4', acc: null, answer: 'G', freq: 392.00 },
      { clef: 'treble', vexKey: 'a/4', acc: null, answer: 'A', freq: 440.00 },
      { clef: 'treble', vexKey: 'b/4', acc: null, answer: 'B', freq: 493.88 },
      { clef: 'treble', vexKey: 'c/5', acc: null, answer: 'C', freq: 523.25 }
    ],
    medium: [
      { clef: 'treble', vexKey: 'd/5', acc: null, answer: 'D', freq: 587.33 },
      { clef: 'treble', vexKey: 'e/5', acc: null, answer: 'E', freq: 659.25 },
      { clef: 'treble', vexKey: 'f/5', acc: null, answer: 'F', freq: 698.46 },
      { clef: 'bass', vexKey: 'c/3', acc: null, answer: 'C', freq: 130.81 },
      { clef: 'bass', vexKey: 'e/3', acc: null, answer: 'E', freq: 164.81 },
      { clef: 'bass', vexKey: 'g/3', acc: null, answer: 'G', freq: 196.00 },
      { clef: 'bass', vexKey: 'a/3', acc: null, answer: 'A', freq: 220.00 }
    ],
    hard: [
      { clef: 'treble', vexKey: 'f#/4', acc: '#', answer: 'F#', freq: 369.99 },
      { clef: 'treble', vexKey: 'bb/4', acc: 'b', answer: 'Bb', freq: 466.16 },
      { clef: 'treble', vexKey: 'c#/5', acc: '#', answer: 'C#', freq: 554.37 },
      { clef: 'treble', vexKey: 'eb5'.replace('eb5', 'eb/5'), acc: 'b', answer: 'Eb', freq: 622.25 },
      { clef: 'treble', vexKey: 'g#/4', acc: '#', answer: 'G#', freq: 415.30 },
      { clef: 'bass', vexKey: 'f#/3', acc: '#', answer: 'F#', freq: 185.00 },
      { clef: 'bass', vexKey: 'bb/2', acc: 'b', answer: 'Bb', freq: 116.54 }
    ]
  };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function makeSoloQuestions(diff, count) {
    const pool = SOLO_POOLS[diff] || SOLO_POOLS.easy;
    const choicePool = diff === 'hard'
      ? ['C#', 'Eb', 'F#', 'G#', 'Ab', 'Bb', 'C', 'D', 'E', 'F', 'G', 'A', 'B']
      : ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const out = [];
    for (let i = 0; i < count; i++) {
      const item = pool[Math.floor(Math.random() * pool.length)];
      const wrong = shuffle(choicePool.filter(c => c !== item.answer)).slice(0, 3);
      out.push({
        qId: `solo_${i}_${Date.now()}`,
        index: i,
        difficulty: diff,
        clef: item.clef,
        vexKey: item.vexKey,
        acc: item.acc,
        freq: item.freq,
        answer: item.answer,
        choices: shuffle([item.answer, ...wrong])
      });
    }
    return out;
  }

  class WebSocketPartyTransport {
    constructor(wsUrl) {
      this.wsUrl = wsUrl || 'ws://127.0.0.1:8788/ws';
      this.ws = null;
      this.reqCounter = 1;
      this.pending = new Map();
      this.listeners = new Set();
      this.session = { roomCode: null, playerId: null, hostToken: null, reconnectToken: null };
      this.connected = false;
      this.serverOffsetMs = 0;
    }

    onMessage(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    _emit(msg) {
      this.listeners.forEach(fn => { try { fn(msg); } catch (e) {} });
    }

    connect() {
      return new Promise((resolve, reject) => {
        try {
          this.ws = new WebSocket(this.wsUrl);
        } catch (err) {
          reject(err);
          return;
        }
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            try { this.ws.close(); } catch (e) {}
            reject(new Error('連線逾時，請確認多人伺服器已啟動'));
          }
        }, 5000);

        this.ws.onopen = () => {
          clearTimeout(timer);
          this.connected = true;
          if (!settled) { settled = true; resolve(); }
          this._emit({ type: 'transport_open' });
          this.syncClock();
        };
        this.ws.onclose = () => {
          clearTimeout(timer);
          this.connected = false;
          for (const [, p] of this.pending.entries()) p.reject(new Error('連線已中斷'));
          this.pending.clear();
          this._emit({ type: 'transport_close' });
        };
        this.ws.onerror = () => {
          clearTimeout(timer);
          if (!settled) { settled = true; reject(new Error('無法連線至多人房間伺服器：' + this.wsUrl)); }
        };
        this.ws.onmessage = (ev) => {
          let msg;
          try { msg = JSON.parse(ev.data); } catch (e) { return; }
          if (msg.type === 'reply' && msg.reqId && this.pending.has(msg.reqId)) {
            const p = this.pending.get(msg.reqId);
            this.pending.delete(msg.reqId);
            p.resolve(msg);
          } else {
            this._emit(msg);
          }
        };
      });
    }

    disconnect() {
      if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
      this.connected = false;
    }

    async syncClock() {
      try {
        const t0 = Date.now();
        const res = await this.request('ping', { clientTime: t0 });
        const t1 = Date.now();
        if (res && res.serverTime) {
          const rtt = t1 - t0;
          this.serverOffsetMs = res.serverTime - (t0 + rtt * 0.5);
        }
      } catch (e) {}
    }

    nowServer() { return Date.now() + this.serverOffsetMs; }

    request(type, payload) {
      if (!this.ws || this.ws.readyState !== 1) {
        return Promise.reject(new Error('尚未連線至伺服器'));
      }
      const reqId = 'r_' + (this.reqCounter++);
      return new Promise((resolve, reject) => {
        this.pending.set(reqId, { resolve, reject });
        this.ws.send(JSON.stringify(Object.assign({ type, reqId }, payload || {})));
        setTimeout(() => {
          if (this.pending.has(reqId)) {
            this.pending.delete(reqId);
            reject(new Error('伺服器回應逾時'));
          }
        }, 6000);
      });
    }

    sendMove(x, y, z, yaw) {
      if (!this.ws || this.ws.readyState !== 1) return;
      this.ws.send(JSON.stringify({ type: 'move', x, y, z, yaw }));
    }
  }

  /**
   * Local single-player practice transport.
   * Uses the exact same checkpoint & 4-mode UI contract, but runs 100% locally and NEVER touches multiplayer boards.
   */
  class LocalSoloTransport {
    constructor() {
      this.listeners = new Set();
      this.connected = true;
      this.isSolo = true;
      this.session = { roomCode: 'SOLO', playerId: 'solo_me', hostToken: 'solo', reconnectToken: 'solo' };
      this.state = null;
      this.timerId = null;
    }
    onMessage(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    _emit(msg) { this.listeners.forEach(fn => { try { fn(msg); } catch (e) {} }); }
    connect() { return Promise.resolve(); }
    disconnect() { if (this.timerId) clearInterval(this.timerId); this.timerId = null; }
    nowServer() { return Date.now(); }

    _snapshot() {
      const s = this.state;
      if (!s) return null;
      return {
        roomCode: 'SOLO（單人練習）',
        serverTime: Date.now(),
        phase: s.phase,
        phaseEndsAt: s.phaseEndsAt,
        roundId: s.roundId,
        roundNumber: s.roundNumber,
        tournamentId: 1,
        config: { ...s.config },
        hostId: 'solo_me',
        hostOnline: true,
        survivalWave: 0,
        survivalWaveEndsAt: 0,
        coopProgress: s.player.checkpoint,
        coopTarget: 4,
        questions: s.questions.map(q => ({ qId: q.qId, index: q.index, difficulty: q.difficulty, clef: q.clef, vexKey: q.vexKey, acc: q.acc, freq: q.freq, choices: q.choices })),
        lastRoundSummary: s.lastRoundSummary,
        finalSummary: s.finalSummary,
        players: [{ ...s.player }]
      };
    }

    async request(type, payload = {}) {
      if (type === 'create_room') {
        this.state = {
          phase: 'lobby',
          phaseEndsAt: null,
          roundId: '',
          roundNumber: 0,
          config: {
            maxPlayers: 1,
            mode: payload.mode || 'race',
            difficulty: payload.difficulty || 'easy',
            totalRounds: 1,
            roundDurationMs: 90000,
            checkpointsCount: 4
          },
          questions: [],
          lastRoundSummary: null,
          finalSummary: null,
          player: {
            id: 'solo_me', name: payload.hostName || '單人練習', role: 'teacher', color: '#f59e0b',
            team: 'red', ready: true, spectator: false, connected: true,
            x: 0, y: 0, z: 2, yaw: 0, checkpoint: 0, mistakes: 0, eliminated: false, finished: false,
            roundScore: 0, totalScore: 0
          }
        };
        if (this.timerId) clearInterval(this.timerId);
        this.timerId = setInterval(() => this._tick(), 120);
        return { ok: true, roomCode: 'SOLO', playerId: 'solo_me', hostToken: 'solo', reconnectToken: 'solo', snapshot: this._snapshot() };
      }
      if (!this.state) return { ok: false, error: '尚未初始化單人練習' };
      if (type === 'update_config') {
        Object.assign(this.state.config, payload.config || payload);
        this._emit({ type: 'state_tick', snapshot: this._snapshot() });
        return { ok: true };
      }
      if (type === 'start_match') {
        const ts = Date.now();
        this.state.roundNumber = 1;
        this.state.roundId = 'solo_' + ts;
        this.state.phase = 'countdown';
        this.state.phaseEndsAt = ts + 2000;
        this.state.questions = makeSoloQuestions(this.state.config.difficulty, 4);
        this.state.lastRoundSummary = null;
        this.state.finalSummary = null;
        Object.assign(this.state.player, { checkpoint: 0, mistakes: 0, finished: false, roundScore: 0, x: 0, y: 0, z: -3 });
        this._emit({ type: 'state_tick', snapshot: this._snapshot() });
        return { ok: true };
      }
      if (type === 'return_lobby') {
        this.state.phase = 'lobby';
        this.state.phaseEndsAt = null;
        this._emit({ type: 'state_tick', snapshot: this._snapshot() });
        return { ok: true };
      }
      if (type === 'submit_answer') {
        const p = this.state.player;
        const q = this.state.questions[p.checkpoint];
        if (!q || payload.checkpointIndex !== p.checkpoint) return { ok: false, error: '請依序完成目前檢查點' };
        if (payload.choice === q.answer) {
          p.checkpoint += 1;
          p.roundScore += 150;
          if (p.checkpoint >= 4) {
            p.finished = true;
            p.totalScore += p.roundScore;
            this.state.phase = 'final_result';
            this.state.lastRoundSummary = {
              roundNumber: 1, totalRounds: 1, mode: this.state.config.mode, reason: 'solo_finished',
              standings: [{ rank: 1, id: p.id, name: p.name, checkpoint: p.checkpoint, mistakes: p.mistakes, roundScore: p.roundScore, totalScore: p.totalScore }]
            };
            this.state.finalSummary = { totalRounds: 1, mode: this.state.config.mode, standings: this.state.lastRoundSummary.standings };
          }
          this._emit({ type: 'state_tick', snapshot: this._snapshot() });
          return { ok: true, correct: true, checkpoint: p.checkpoint, finished: p.finished, roundScore: p.roundScore };
        }
        p.mistakes += 1;
        this._emit({ type: 'state_tick', snapshot: this._snapshot() });
        return { ok: true, correct: false, checkpoint: p.checkpoint, respawnZ: [-4, -20, -36, -52][p.checkpoint] || -4, mistakes: p.mistakes };
      }
      return { ok: true };
    }

    sendMove(x, y, z, yaw) {
      if (!this.state) return;
      this.state.player.x = x; this.state.player.y = y; this.state.player.z = z; this.state.player.yaw = yaw;
    }

    _tick() {
      if (!this.state) return;
      const now = Date.now();
      if (this.state.phase === 'countdown' && this.state.phaseEndsAt && now >= this.state.phaseEndsAt) {
        this.state.phase = 'playing';
        this.state.phaseEndsAt = now + this.state.config.roundDurationMs;
      }
      this._emit({ type: 'state_tick', snapshot: this._snapshot() });
    }
  }

  root.PartyTransport = { WebSocketPartyTransport, LocalSoloTransport };
})(window);
