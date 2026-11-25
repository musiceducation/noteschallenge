/**
 * Main Controller for Notes Challenge 3D Party Framework (Single-Player + Real-Time Multiplayer).
 */
(function () {
  'use strict';

  const { WebSocketPartyTransport, LocalSoloTransport } = window.PartyTransport;
  const VexAudio = window.PartyMusicVex;
  const CHECKPOINTS = window.PARTY_CHECKPOINTS || [];

  const MODE_META = {
    race: { name: '🏁 音樂地磚競速', desc: '依序跑過 4 道音符關門，踩上正確音名地磚並按「確認鎖定」前進；答錯退回該檢查點！' },
    survival: { name: '🔥 音樂生存戰', desc: '每波限時踩上正確音名地磚並確認鎖定；失誤達 2 次轉為觀戰，活到最後或得分最高獲勝！' },
    coop: { name: '🤝 全班合作任務', desc: '全班共同累積完成指定數量的音樂關卡任務，時間內達標即全班過關！' },
    team: { name: '⚔️ 紅藍分組對戰', desc: '老師分隊後各自完成音符任務累積隊分；人數不均時以人均分決勝，公平競爭！' }
  };

  const els = {
    canvas: document.getElementById('glCanvas'),
    nameLayer: document.getElementById('nameLayer'),
    entryOverlay: document.getElementById('entryOverlay'),
    hudRoom: document.getElementById('hudRoom'),
    hudPhase: document.getElementById('hudPhase'),
    hudTimer: document.getElementById('hudTimer'),
    hudProgress: document.getElementById('hudProgress'),
    hudScore: document.getElementById('hudScore'),
    teacherPanel: document.getElementById('teacherPanel'),
    playerListEl: document.getElementById('playerList'),
    studentLobbyBar: document.getElementById('studentLobbyBar'),
    btnReady: document.getElementById('btnReady'),
    briefingOverlay: document.getElementById('briefingOverlay'),
    briefingTitle: document.getElementById('briefingTitle'),
    briefingDesc: document.getElementById('briefingDesc'),
    briefingCountdown: document.getElementById('briefingCountdown'),
    questionCard: document.getElementById('questionCard'),
    qBadge: document.getElementById('qBadge'),
    qVexBox: document.getElementById('qVexBox'),
    qTileStatus: document.getElementById('qTileStatus'),
    btnConfirmAns: document.getElementById('btnConfirmAns'),
    btnHearNote: document.getElementById('btnHearNote'),
    resultOverlay: document.getElementById('resultOverlay'),
    resultTitle: document.getElementById('resultTitle'),
    resultSub: document.getElementById('resultSub'),
    resultTable: document.getElementById('resultTable'),
    resultHostActions: document.getElementById('resultHostActions'),
    btnNextRound: document.getElementById('btnNextRound'),
    btnBackLobby: document.getElementById('btnBackLobby'),
    btnRestartTourney: document.getElementById('btnRestartTourney'),
    spectatorBanner: document.getElementById('spectatorBanner'),
    toast: document.getElementById('toastBanner'),
    wsUrlInput: document.getElementById('wsUrlInput'),
    nickInput: document.getElementById('nickInput'),
    roomCodeInput: document.getElementById('roomCodeInput')
  };

  const scene3d = new window.PartyScene3D(els.canvas, els.nameLayer);
  window.addEventListener('resize', () => scene3d.resize());

  let transport = null;
  let snapshot = null;
  let myId = null;
  let hostToken = null;
  let reconnectToken = null;
  let lastQuestionKey = '';
  let confirmLocked = false;
  let currentStandingTile = null;

  const localPos = { x: 0, y: 0, z: 2, vx: 0, vy: 0, vz: 0, yaw: 0 };
  const keys = { w: false, a: false, s: false, d: false };
  const joy = { x: 0, y: 0 };
  let lastMoveSentAt = 0;

  let toastTimer = 0;
  function showToast(msg, ok = true) {
    els.toast.textContent = msg;
    els.toast.className = 'toast show ' + (ok ? 'ok' : 'err');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1800);
  }

  // Prefill nickname from existing site settings (read-only, never exposes email/token)
  try {
    const s = JSON.parse(localStorage.getItem('musicGameSettingsV4') || '{}') || {};
    const saved = s.savedName === '__other__' ? s.savedCustomName : s.savedName;
    if (saved && saved !== '訪客' && saved !== '__other__') els.nickInput.value = String(saved).slice(0, 16);
  } catch (e) {}

  function myPlayer() {
    if (!snapshot || !myId) return null;
    return (snapshot.players || []).find(p => p.id === myId) || null;
  }

  function isHost() {
    return !!(snapshot && myId && snapshot.hostId === myId && hostToken);
  }

  function bindTransportEvents(tr) {
    tr.onMessage((msg) => {
      if (msg.type === 'kicked') {
        showToast(msg.message || '你已被移出房間', false);
        leaveToEntry();
        return;
      }
      if (msg.type === 'transport_close') {
        showToast('與伺服器連線中斷，嘗試自動重連中...', false);
        attemptAutoReconnect();
        return;
      }
      if (msg.event === 'host_timeout_reset' || msg.event === 'host_left') {
        showToast(msg.message || '老師離線，已返回大廳', false);
      }
      if (msg.snapshot) applySnapshot(msg.snapshot);
    });
  }

  async function attemptAutoReconnect() {
    if (!transport || transport.isSolo || !snapshot || !myId || !reconnectToken) return;
    const savedCode = snapshot.roomCode;
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        await transport.connect();
        const res = await transport.request('reconnect', {
          roomCode: savedCode, playerId: myId, reconnectToken, hostToken
        });
        if (res && res.ok && res.snapshot) {
          applySnapshot(res.snapshot);
          showToast('✅ 已重新連回房間！', true);
          return;
        }
      } catch (e) {}
    }
  }

  function applySnapshot(nextSnap) {
    const prevPhase = snapshot ? snapshot.phase : null;
    snapshot = nextSnap;
    const me = myPlayer();

    // Sync avatars & answer tile labels
    scene3d.syncPlayers(snapshot.players, myId);
    scene3d.updateTileLabels(snapshot.questions, snapshot.config.mode, snapshot.survivalWave);

    // Reset local position when entering briefing or returning to lobby
    if (prevPhase !== snapshot.phase) {
      if (snapshot.phase === 'briefing' && me) {
        localPos.x = me.x; localPos.y = 0; localPos.z = me.z; localPos.vy = 0;
        confirmLocked = false;
      } else if (snapshot.phase === 'lobby' && me) {
        localPos.x = me.x; localPos.y = 0; localPos.z = me.z; localPos.vy = 0;
      }
    }

    // Top HUD
    els.hudRoom.textContent = snapshot.roomCode;
    const phaseLabels = {
      lobby: '等待大廳', briefing: '關卡說明', countdown: '準備倒數',
      playing: (MODE_META[snapshot.config.mode] || {}).name || '闖關中',
      round_result: '單關結算', final_result: '最終結算'
    };
    els.hudPhase.textContent = phaseLabels[snapshot.phase] || snapshot.phase;
    els.hudScore.textContent = me ? `${me.roundScore} (總 ${me.totalScore})` : '0';

    if (snapshot.config.mode === 'coop') {
      els.hudProgress.textContent = `合作 ${snapshot.coopProgress}/${snapshot.coopTarget}`;
    } else if (snapshot.config.mode === 'survival') {
      els.hudProgress.textContent = `第 ${snapshot.survivalWave + 1}/${snapshot.config.survivalMaxWaves} 波`;
    } else if (me) {
      els.hudProgress.textContent = `關卡 ${Math.min(me.checkpoint, snapshot.config.checkpointsCount)}/${snapshot.config.checkpointsCount}`;
    }

    // Lobby controls
    const inLobby = snapshot.phase === 'lobby';
    els.teacherPanel.classList.toggle('hidden', !(inLobby && isHost()));
    els.studentLobbyBar.classList.toggle('hidden', !(inLobby && !isHost()));
    if (me && !isHost()) {
      els.btnReady.textContent = me.ready ? '✅ 已準備（點此取消）' : '🙋 點擊準備';
      els.btnReady.classList.toggle('active', me.ready);
    }
    if (inLobby && isHost()) renderTeacherPlayerList();

    // Briefing & Countdown overlay
    const showBrief = snapshot.phase === 'briefing' || snapshot.phase === 'countdown';
    els.briefingOverlay.classList.toggle('hidden', !showBrief);
    if (showBrief) {
      const m = MODE_META[snapshot.config.mode] || MODE_META.race;
      els.briefingTitle.textContent = `${m.name}（第 ${snapshot.roundNumber}/${snapshot.config.totalRounds} 回合）`;
      els.briefingDesc.textContent = m.desc;
    }

    // Active Question Card (VexFlow)
    const isPlaying = snapshot.phase === 'playing';
    const isSpec = !!(me && (me.spectator || me.eliminated));
    els.spectatorBanner.classList.toggle('hidden', !(isPlaying && isSpec));
    els.questionCard.classList.toggle('hidden', !(isPlaying && !isSpec && !(snapshot.config.mode === 'race' && me && me.finished)));

    if (isPlaying && me && !isSpec) {
      const qIdx = snapshot.config.mode === 'survival'
        ? snapshot.survivalWave
        : (me.checkpoint % Math.max(1, snapshot.questions.length));
      const q = snapshot.questions[qIdx];
      const qKey = q ? `${snapshot.roundId}:${qIdx}:${q.qId}` : '';
      if (q && qKey !== lastQuestionKey) {
        lastQuestionKey = qKey;
        confirmLocked = false;
        els.qBadge.textContent = snapshot.config.mode === 'survival'
          ? `生存戰 · 第 ${snapshot.survivalWave + 1} 波`
          : `第 ${me.checkpoint + 1} 關門 · ${q.clef === 'bass' ? '低音譜號' : '高音譜號'}`;
        VexAudio.renderVexQuestion(els.qVexBox, q);
      }
    }

    // Result Overlay (Round Result or Final Result)
    const showRes = snapshot.phase === 'round_result' || snapshot.phase === 'final_result';
    els.resultOverlay.classList.toggle('hidden', !showRes);
    if (showRes) renderResults();
  }

  function renderTeacherPlayerList() {
    if (!snapshot) return;
    document.getElementById('cfgMode').value = snapshot.config.mode;
    document.getElementById('cfgDiff').value = snapshot.config.difficulty;
    document.getElementById('cfgRounds').value = String(snapshot.config.totalRounds);
    document.getElementById('cfgMax').value = String(snapshot.config.maxPlayers);

    els.playerListEl.innerHTML = snapshot.players.map((p) => {
      const teamBtn = snapshot.config.mode === 'team'
        ? `<button type="button" class="mini-btn" data-team="${p.id}" data-next="${p.team === 'red' ? 'blue' : 'red'}">${p.team === 'red' ? '🔴紅隊' : '🔵藍隊'}</button>`
        : '';
      const kickBtn = p.id !== snapshot.hostId
        ? `<button type="button" class="mini-btn danger" data-kick="${p.id}">移出</button>`
        : '<span class="host-chip">房主</span>';
      return `<div class="p-row"><span>${p.name} ${p.ready ? '✅' : '⏳'}</span><div class="p-acts">${teamBtn}${kickBtn}</div></div>`;
    }).join('');
  }

  function renderResults() {
    const isFinal = snapshot.phase === 'final_result';
    const rs = snapshot.lastRoundSummary;
    const fs = snapshot.finalSummary;
    els.resultTitle.textContent = isFinal ? '🏆 整場賽事最終結算' : `🎉 第 ${snapshot.roundNumber}/${snapshot.config.totalRounds} 回合結算`;

    let sub = '';
    if (rs && rs.mode === 'coop') {
      sub = rs.coopSuccess ? `🤝 全班合作成功！（${rs.coopProgress}/${rs.coopTarget}）` : `⏱ 時間到，全班完成 ${rs.coopProgress}/${rs.coopTarget}`;
    } else if (rs && rs.teamSummary) {
      const ts = rs.teamSummary;
      const winTxt = ts.winner === 'red' ? '🔴 紅隊勝出' : ts.winner === 'blue' ? '🔵 藍隊勝出' : '🤝 雙方平手';
      sub = `${winTxt}｜紅隊人均 ${ts.red.avgScore}（總 ${ts.red.rawScore}）vs 藍隊人均 ${ts.blue.avgScore}（總 ${ts.blue.rawScore}）`;
    } else if (rs) {
      sub = `模式：${(MODE_META[rs.mode] || {}).name || rs.mode}｜結束原因：${rs.reason}`;
    }
    els.resultSub.textContent = sub;

    const rows = (isFinal && fs ? fs.standings : (rs ? rs.standings : [])) || [];
    els.resultTable.innerHTML = rows.map(r => `
      <tr>
        <td>#${r.rank}</td>
        <td>${r.name}${r.eliminated ? ' (觀戰)' : ''}</td>
        <td>${r.roundScore != null ? r.roundScore : '-'}</td>
        <td><b>${r.totalScore}</b></td>
      </tr>
    `).join('');

    els.resultHostActions.classList.toggle('hidden', !isHost());
    els.btnNextRound.classList.toggle('hidden', isFinal || snapshot.roundNumber >= snapshot.config.totalRounds);
    els.btnRestartTourney.classList.toggle('hidden', !isFinal);
  }

  async function confirmCurrentTile() {
    if (!transport || !snapshot || snapshot.phase !== 'playing' || confirmLocked) return;
    if (!currentStandingTile) {
      showToast('請先走到其中一塊音名地磚上再按確認！', false);
      return;
    }
    VexAudio.unlockAudio();
    confirmLocked = true;
    els.btnConfirmAns.disabled = true;
    try {
      const res = await transport.request('submit_answer', {
        roundId: snapshot.roundId,
        checkpointIndex: currentStandingTile.checkpointIndex,
        choice: currentStandingTile.choice
      });
      if (!res.ok) {
        showToast(res.error || '提交失敗', false);
        confirmLocked = false;
      } else if (res.correct) {
        VexAudio.sfxCorrect();
        showToast(res.finished ? '🏁 完賽！等待其他同學結算' : '✅ 答對！前往下一道關門', true);
      } else {
        VexAudio.sfxWrong();
        if (typeof res.respawnZ === 'number') {
          localPos.z = res.respawnZ;
          localPos.y = 0;
        }
        showToast(res.eliminated ? '❌ 失誤達上限，已轉為觀戰' : '❌ 答錯，退回檢查點再試！', false);
        confirmLocked = false;
      }
    } catch (err) {
      showToast(err.message || '連線錯誤', false);
      confirmLocked = false;
    } finally {
      els.btnConfirmAns.disabled = false;
    }
  }

  function leaveToEntry() {
    if (transport) { transport.disconnect(); transport = null; }
    snapshot = null; myId = null; hostToken = null; reconnectToken = null;
    els.entryOverlay.classList.remove('hidden');
    els.teacherPanel.classList.add('hidden');
    els.studentLobbyBar.classList.add('hidden');
    els.questionCard.classList.add('hidden');
    els.briefingOverlay.classList.add('hidden');
    els.resultOverlay.classList.add('hidden');
  }

  // Entry Buttons
  document.getElementById('btnSoloPractice').addEventListener('click', async () => {
    VexAudio.unlockAudio();
    transport = new LocalSoloTransport();
    bindTransportEvents(transport);
    await transport.connect();
    const res = await transport.request('create_room', {
      hostName: els.nickInput.value.trim() || '單人練習',
      mode: 'race', difficulty: 'easy', totalRounds: 1
    });
    myId = res.playerId; hostToken = res.hostToken; reconnectToken = res.reconnectToken;
    els.entryOverlay.classList.add('hidden');
    applySnapshot(res.snapshot);
    showToast('已進入單人練習（成績不寫入多人競賽榜）', true);
  });

  document.getElementById('btnCreateRoom').addEventListener('click', async () => {
    VexAudio.unlockAudio();
    const wsUrl = els.wsUrlInput.value.trim() || 'ws://127.0.0.1:8788/ws';
    transport = new WebSocketPartyTransport(wsUrl);
    bindTransportEvents(transport);
    try {
      await transport.connect();
      const res = await transport.request('create_room', {
        hostName: els.nickInput.value.trim() || '老師',
        mode: 'race', difficulty: 'easy', totalRounds: 1, maxPlayers: 40
      });
      if (!res.ok) throw new Error(res.error || '建立失敗');
      myId = res.playerId; hostToken = res.hostToken; reconnectToken = res.reconnectToken;
      els.entryOverlay.classList.add('hidden');
      applySnapshot(res.snapshot);
      showToast(`已建立房間 ${res.roomCode}`, true);
    } catch (err) {
      showToast(err.message || '無法連線伺服器', false);
      transport.disconnect(); transport = null;
    }
  });

  document.getElementById('btnJoinRoom').addEventListener('click', async () => {
    VexAudio.unlockAudio();
    const code = els.roomCodeInput.value.trim().toUpperCase();
    if (!code) { showToast('請輸入 6 碼房間代碼', false); return; }
    const wsUrl = els.wsUrlInput.value.trim() || 'ws://127.0.0.1:8788/ws';
    transport = new WebSocketPartyTransport(wsUrl);
    bindTransportEvents(transport);
    try {
      await transport.connect();
      const res = await transport.request('join_room', {
        roomCode: code, name: els.nickInput.value.trim() || '同學'
      });
      if (!res.ok) throw new Error(res.error || '加入失敗');
      myId = res.playerId; hostToken = null; reconnectToken = res.reconnectToken;
      els.entryOverlay.classList.add('hidden');
      applySnapshot(res.snapshot);
      showToast(res.spectator ? '賽事進行中，已進入觀戰模式' : `已加入房間 ${res.roomCode}`, true);
    } catch (err) {
      showToast(err.message || '加入失敗', false);
      transport.disconnect(); transport = null;
    }
  });

  // Teacher & Student Lobby Controls
  els.btnReady.addEventListener('click', async () => {
    const me = myPlayer();
    if (!transport || !me) return;
    await transport.request('set_ready', { ready: !me.ready });
  });

  ['cfgMode', 'cfgDiff', 'cfgRounds', 'cfgMax'].forEach((id) => {
    document.getElementById(id).addEventListener('change', async () => {
      if (!transport || !isHost()) return;
      await transport.request('update_config', {
        hostToken,
        config: {
          mode: document.getElementById('cfgMode').value,
          difficulty: document.getElementById('cfgDiff').value,
          totalRounds: Number(document.getElementById('cfgRounds').value),
          maxPlayers: Number(document.getElementById('cfgMax').value)
        }
      });
    });
  });

  els.playerListEl.addEventListener('click', async (e) => {
    const teamBtn = e.target.closest('[data-team]');
    if (teamBtn && isHost()) {
      await transport.request('assign_team', { hostToken, targetPlayerId: teamBtn.dataset.team, team: teamBtn.dataset.next });
      return;
    }
    const kickBtn = e.target.closest('[data-kick]');
    if (kickBtn && isHost()) {
      await transport.request('kick_player', { hostToken, targetPlayerId: kickBtn.dataset.kick });
    }
  });

  document.getElementById('btnStartMatch').addEventListener('click', async () => {
    if (!transport || !isHost()) return;
    VexAudio.unlockAudio();
    const res = await transport.request('start_match', { hostToken });
    if (!res.ok) showToast(res.error || '無法開始', false);
  });

  els.btnNextRound.addEventListener('click', async () => {
    if (transport && isHost()) await transport.request('next_round', { hostToken });
  });
  els.btnBackLobby.addEventListener('click', async () => {
    if (transport && isHost()) await transport.request('return_lobby', { hostToken });
  });
  els.btnRestartTourney.addEventListener('click', async () => {
    if (transport && isHost()) await transport.request('start_match', { hostToken });
  });
  document.getElementById('btnLeave').addEventListener('click', async () => {
    if (transport && !transport.isSolo) { try { await transport.request('leave_room', {}); } catch (e) {} }
    leaveToEntry();
  });

  els.btnConfirmAns.addEventListener('click', confirmCurrentTile);
  els.btnHearNote.addEventListener('click', () => {
    VexAudio.unlockAudio();
    const me = myPlayer();
    if (!snapshot || !me) return;
    const qIdx = snapshot.config.mode === 'survival' ? snapshot.survivalWave : (me.checkpoint % Math.max(1, snapshot.questions.length));
    const q = snapshot.questions[qIdx];
    if (q && q.freq) VexAudio.playNote(q.freq, 0.45, 'triangle', 0.18);
  });
  document.getElementById('btnMute').addEventListener('click', (e) => {
    VexAudio.unlockAudio();
    VexAudio.setMuted(!VexAudio.isMuted());
    e.currentTarget.textContent = VexAudio.isMuted() ? '🔇' : '🔊';
  });

  // Keyboard & Mobile Touch Controls
  function triggerJump() {
    if (localPos.y <= 0.05) localPos.vy = 10.2;
  }
  window.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.w = true;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.s = true;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.a = true;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.d = true;
    if (e.code === 'Space') { e.preventDefault(); triggerJump(); }
    if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') confirmCurrentTile();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.w = false;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.s = false;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.a = false;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.d = false;
  });

  const joyBase = document.getElementById('joyBase');
  const joyKnob = document.getElementById('joyKnob');
  let joyPid = null;
  joyBase.addEventListener('pointerdown', (e) => { joyPid = e.pointerId; updateJoy(e); });
  window.addEventListener('pointermove', (e) => { if (joyPid !== null && e.pointerId === joyPid) updateJoy(e); });
  window.addEventListener('pointerup', (e) => { if (joyPid !== null && e.pointerId === joyPid) { joyPid = null; joy.x = 0; joy.y = 0; joyKnob.style.transform = ''; } });
  function updateJoy(e) {
    const r = joyBase.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const maxR = r.width * 0.36;
    const d = Math.hypot(dx, dy);
    if (d > maxR) { dx = (dx / d) * maxR; dy = (dy / d) * maxR; }
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.x = dx / maxR; joy.y = dy / maxR;
  }
  document.getElementById('btnJumpTouch').addEventListener('click', triggerJump);
  document.getElementById('btnConfirmTouch').addEventListener('click', confirmCurrentTile);

  // Main Animation Loop
  let lastT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (lastT || now)) / 1000);
    lastT = now;

    const me = myPlayer();
    if (snapshot && me && !me.spectator && (snapshot.phase === 'lobby' || snapshot.phase === 'playing')) {
      let ix = (keys.d ? 1 : 0) - (keys.a ? 1 : 0) + joy.x;
      let iz = (keys.s ? 1 : 0) - (keys.w ? 1 : 0) + joy.y;
      const mag = Math.hypot(ix, iz);
      if (mag > 1) { ix /= mag; iz /= mag; }
      const speed = 10.0;
      localPos.x += ix * speed * dt;
      localPos.z += iz * speed * dt;
      if (mag > 0.08) localPos.yaw = Math.atan2(-ix, -iz);

      // In lobby, keep inside lobby plaza; in playing, gate progress by current checkpoint
      if (snapshot.phase === 'lobby') {
        localPos.x = Math.max(-8.2, Math.min(8.2, localPos.x));
        localPos.z = Math.max(-5.2, Math.min(9.2, localPos.z));
      } else {
        const cp = CHECKPOINTS[Math.min(CHECKPOINTS.length - 1, me.checkpoint)] || CHECKPOINTS[0];
        const minZ = (snapshot.config.mode === 'race' && me.finished) ? -68 : (cp.z - 2.2);
        localPos.z = Math.max(minZ, Math.min(8, localPos.z));
      }

      // Gravity + ground collision + fall respawn
      const grounded = scene3d.isOnCourseGround(localPos.x, localPos.z);
      localPos.vy -= 26 * dt;
      localPos.y += localPos.vy * dt;
      if (grounded && localPos.y <= 0) { localPos.y = 0; localPos.vy = 0; }
      if (localPos.y < -8) {
        const cp = CHECKPOINTS[Math.min(CHECKPOINTS.length - 1, me.checkpoint)] || CHECKPOINTS[0];
        localPos.x = 0; localPos.y = 1.5; localPos.z = snapshot.phase === 'lobby' ? 2 : cp.spawnZ; localPos.vy = 0;
        showToast('☁️ 掉落重生！', false);
      }

      scene3d.setLocalPlayerPose(myId, localPos.x, localPos.y, localPos.z, localPos.yaw);

      // Detect standing tile during playing
      if (snapshot.phase === 'playing') {
        currentStandingTile = scene3d.getTileUnderPlayer(localPos.x, localPos.z, me.checkpoint, snapshot.config.mode);
        els.qTileStatus.textContent = currentStandingTile
          ? `目前踩在：【${currentStandingTile.choice}】地磚 — 按確認鎖定`
          : '請移動並踩上其中一塊音名地磚';
      } else {
        currentStandingTile = null;
      }

      // Send movement to authoritative server at ~15Hz
      if (transport && now - lastMoveSentAt > 65) {
        lastMoveSentAt = now;
        transport.sendMove(localPos.x, localPos.y, localPos.z, localPos.yaw);
      }
    }

    // Server-authoritative countdown & timer display
    if (snapshot && transport && snapshot.phaseEndsAt) {
      const rem = Math.max(0, (snapshot.phaseEndsAt - transport.nowServer()) / 1000);
      els.hudTimer.textContent = `⏱ ${rem.toFixed(1)}s`;
      if (snapshot.phase === 'countdown') {
        els.briefingCountdown.textContent = String(Math.max(1, Math.ceil(rem)));
      } else if (snapshot.phase === 'briefing') {
        els.briefingCountdown.textContent = '準備中...';
      }
    } else {
      els.hudTimer.textContent = '⏱ --';
    }

    scene3d.render(dt, localPos, snapshot ? snapshot.phase : 'lobby');
  }

  requestAnimationFrame(loop);
})();
