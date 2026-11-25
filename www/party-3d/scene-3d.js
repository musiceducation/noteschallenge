/**
 * Modular Three.js r128 Shared 3D Space for Notes Challenge Multiplayer & Solo Party.
 * Strict separation of:
 *   1. Course geometry & answer tile pads
 *   2. Placeholder capsule/box avatar factory (with `attachGlbModel` hook for future GLB + AnimationMixer)
 *   3. Smooth interpolation for remote players (anti-teleport)
 *   4. Basic jump, ground collision, fall respawn, and third-person camera follow
 */
(function (root) {
  'use strict';

  const CHECKPOINTS = [
    { index: 0, z: -12, spawnZ: -4 },
    { index: 1, z: -28, spawnZ: -20 },
    { index: 2, z: -44, spawnZ: -36 },
    { index: 3, z: -60, spawnZ: -52 }
  ];
  const TILE_X = [-5.4, -1.8, 1.8, 5.4];
  const TILE_COLORS = [0xef4444, 0x0284c7, 0x10b981, 0xf59e0b];

  function makeTileLabelTexture(text, bgHex) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#' + bgHex.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, 238, 238);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 104px Inter, "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text || '?', 128, 134);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Placeholder capsule/box avatar builder.
   * Future replacement point: call `scene3d.attachGlbModel(playerId, glbScene, animations)`
   * to swap placeholder meshes for GLB + THREE.AnimationMixer without touching game rules.
   */
  function createPlaceholderAvatar(colorHex, team) {
    const group = new THREE.Group();
    const rig = new THREE.Group();
    group.add(rig);

    const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex || '#f59e0b', roughness: 0.55 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfffbeb, roughness: 0.65 });
    const teamMat = new THREE.MeshBasicMaterial({ color: team === 'blue' ? 0x3b82f6 : 0xef4444 });

    // Capsule-like torso (cylinder + two spheres for Three.js r128 compatibility)
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.85, 14), bodyMat);
    cyl.position.y = 0.82; cyl.castShadow = true; rig.add(cyl);
    const topCap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), bodyMat);
    topCap.position.y = 1.24; topCap.castShadow = true; rig.add(topCap);
    const botCap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), bodyMat);
    botCap.position.y = 0.4; rig.add(botCap);

    // Head box + visor
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.62, 0.64), headMat);
    head.position.set(0, 1.72, 0); head.castShadow = true; rig.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.12), new THREE.MeshBasicMaterial({ color: 0x1e293b }));
    visor.position.set(0, 1.76, -0.32); rig.add(visor);

    // Ready / Team ring at feet
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 20), teamMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);

    group.userData = { rig, ring, ringMat: teamMat, mixer: null };
    return group;
  }

  class PartyScene3D {
    constructor(canvas, nameLayer) {
      this.canvas = canvas;
      this.nameLayer = nameLayer;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xdbeafe);
      this.scene.fog = new THREE.Fog(0xdbeafe, 35, 110);

      this.camera = new THREE.PerspectiveCamera(54, 1, 0.1, 160);
      this.camera.position.set(0, 8.5, 13);

      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x93c5fd, 0.95));
      const sun = new THREE.DirectionalLight(0xfffbeb, 0.9);
      sun.position.set(14, 28, 16);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      this.scene.add(sun);

      this.tileMeshes = []; // [cpIdx][choiceIdx]
      this.avatars = new Map(); // playerId -> { group, tagEl, x, y, z, tx, ty, tz, yaw, tyaw, role, ready, spectator, team }
      this.mixers = [];
      this.projVec = new THREE.Vector3();

      this._buildCourse();
      this.resize();
    }

    _buildCourse() {
      // Lobby start plaza
      const lobbyMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.75 });
      const lobbyFloor = new THREE.Mesh(new THREE.BoxGeometry(18, 0.8, 16), lobbyMat);
      lobbyFloor.position.set(0, -0.4, 2);
      lobbyFloor.receiveShadow = true;
      this.scene.add(lobbyFloor);

      // Course bridge runway from z = -6 to z = -68
      const runwayMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 });
      const runway = new THREE.Mesh(new THREE.BoxGeometry(16, 0.8, 64), runwayMat);
      runway.position.set(0, -0.4, -38);
      runway.receiveShadow = true;
      this.scene.add(runway);

      // 4 Checkpoints, each with 4 answer tiles (x = -5.4, -1.8, 1.8, 5.4)
      CHECKPOINTS.forEach((cp, cpIdx) => {
        const row = [];
        // Checkpoint start line strip
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(15.2, 0.06, 0.5),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
        );
        line.position.set(0, 0.03, cp.spawnZ);
        this.scene.add(line);

        TILE_X.forEach((tx, cIdx) => {
          const tex = makeTileLabelTexture('?', TILE_COLORS[cIdx]);
          const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
          const tile = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.24, 3.0), mat);
          tile.position.set(tx, 0.12, cp.z);
          tile.receiveShadow = true;
          this.scene.add(tile);
          row.push({ mesh: tile, mat, tex, x: tx, z: cp.z, choice: '' });
        });
        this.tileMeshes.push(row);
      });

      // Finish arch at z = -66
      const archMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35 });
      const pL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5, 0.7), archMat);
      pL.position.set(-6.5, 2.5, -66); this.scene.add(pL);
      const pR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5, 0.7), archMat);
      pR.position.set(6.5, 2.5, -66); this.scene.add(pR);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.9, 0.8), archMat);
      bar.position.set(0, 5.1, -66); this.scene.add(bar);
    }

    updateTileLabels(questions, mode, survivalWave) {
      if (!Array.isArray(questions) || !questions.length) return;
      if (mode === 'survival') {
        const q = questions[survivalWave] || questions[0];
        this.tileMeshes.forEach((row) => {
          row.forEach((tile, cIdx) => {
            const label = (q && q.choices && q.choices[cIdx]) || '?';
            if (tile.choice !== label) {
              tile.choice = label;
              if (tile.tex) tile.tex.dispose();
              tile.tex = makeTileLabelTexture(label, TILE_COLORS[cIdx]);
              tile.mat.map = tile.tex;
              tile.mat.needsUpdate = true;
            }
          });
        });
        return;
      }
      this.tileMeshes.forEach((row, cpIdx) => {
        const q = questions[cpIdx % questions.length];
        row.forEach((tile, cIdx) => {
          const label = (q && q.choices && q.choices[cIdx]) || '?';
          if (tile.choice !== label) {
            tile.choice = label;
            if (tile.tex) tile.tex.dispose();
            tile.tex = makeTileLabelTexture(label, TILE_COLORS[cIdx]);
            tile.mat.map = tile.tex;
            tile.mat.needsUpdate = true;
          }
        });
      });
    }

    /**
     * Future GLB + AnimationMixer hook: swap placeholder meshes cleanly without rewriting game logic.
     */
    attachGlbModel(playerId, glbScene, animations) {
      const av = this.avatars.get(playerId);
      if (!av || !glbScene) return;
      av.group.userData.rig.children.forEach(c => { c.visible = false; });
      av.group.userData.rig.add(glbScene);
      if (animations && animations.length) {
        const mixer = new THREE.AnimationMixer(glbScene);
        mixer.clipAction(animations[0]).play();
        av.group.userData.mixer = mixer;
        this.mixers.push(mixer);
      }
    }

    syncPlayers(players, myId) {
      const seen = new Set();
      (players || []).forEach((p) => {
        seen.add(p.id);
        let av = this.avatars.get(p.id);
        if (!av) {
          const group = createPlaceholderAvatar(p.color, p.team);
          this.scene.add(group);
          const tagEl = document.createElement('div');
          tagEl.className = 'name-tag' + (p.id === myId ? ' me' : '');
          this.nameLayer.appendChild(tagEl);
          av = {
            id: p.id, group, tagEl,
            x: p.x, y: p.y, z: p.z, tx: p.x, ty: p.y, tz: p.z,
            yaw: p.yaw, tyaw: p.yaw
          };
          this.avatars.set(p.id, av);
        }
        av.name = p.name;
        av.role = p.role;
        av.ready = p.ready;
        av.spectator = p.spectator;
        av.connected = p.connected;
        av.team = p.team;
        if (p.id !== myId) {
          av.tx = p.x; av.ty = p.y; av.tz = p.z; av.tyaw = p.yaw;
        }
        av.group.visible = !p.spectator;
        av.group.userData.ringMat.color.setHex(
          p.role === 'teacher' ? 0xfacc15 : (p.team === 'blue' ? 0x3b82f6 : 0xef4444)
        );
      });

      for (const [id, av] of this.avatars.entries()) {
        if (!seen.has(id)) {
          this.scene.remove(av.group);
          if (av.tagEl && av.tagEl.parentNode) av.tagEl.parentNode.removeChild(av.tagEl);
          this.avatars.delete(id);
        }
      }
    }

    setLocalPlayerPose(myId, x, y, z, yaw) {
      const av = this.avatars.get(myId);
      if (!av) return;
      av.x = x; av.y = y; av.z = z; av.yaw = yaw;
      av.tx = x; av.ty = y; av.tz = z; av.tyaw = yaw;
    }

    /**
     * Detects which answer tile (if any) the player is currently standing on for their active checkpoint.
     */
    getTileUnderPlayer(x, z, checkpointIdx, mode) {
      const targetCp = mode === 'survival' ? 0 : Math.min(CHECKPOINTS.length - 1, Math.max(0, checkpointIdx));
      const row = this.tileMeshes[targetCp];
      if (!row) return null;
      for (let i = 0; i < row.length; i++) {
        const t = row[i];
        if (Math.abs(x - t.x) <= 1.65 && Math.abs(z - t.z) <= 1.65) {
          return { checkpointIndex: targetCp, choiceIndex: i, choice: t.choice };
        }
      }
      return null;
    }

    isOnCourseGround(x, z) {
      if (z >= -6 && z <= 10 && Math.abs(x) <= 9.0) return true; // lobby plaza
      if (z >= -70 && z <= -6 && Math.abs(x) <= 8.0) return true; // course runway
      return false;
    }

    resize() {
      const w = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : window.innerWidth;
      const h = this.canvas.parentElement ? this.canvas.parentElement.clientHeight : window.innerHeight;
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    }

    render(dt, followPos, phase) {
      for (let i = 0; i < this.mixers.length; i++) this.mixers[i].update(dt);

      const cw = this.canvas.clientWidth || window.innerWidth;
      const ch = this.canvas.clientHeight || window.innerHeight;

      this.avatars.forEach((av) => {
        // Smooth interpolation for remote players
        av.x += (av.tx - av.x) * Math.min(1, dt * 12);
        av.y += (av.ty - av.y) * Math.min(1, dt * 12);
        av.z += (av.tz - av.z) * Math.min(1, dt * 12);
        av.yaw += (av.tyaw - av.yaw) * Math.min(1, dt * 12);
        av.group.position.set(av.x, av.y, av.z);
        av.group.rotation.y = av.yaw;

        // Nameplate projection
        if (av.spectator) {
          av.tagEl.style.display = 'none';
          return;
        }
        this.projVec.set(av.x, av.y + 2.45, av.z).project(this.camera);
        if (this.projVec.z > 1) {
          av.tagEl.style.display = 'none';
        } else {
          av.tagEl.style.display = 'block';
          av.tagEl.style.left = ((this.projVec.x * 0.5 + 0.5) * cw) + 'px';
          av.tagEl.style.top = ((-this.projVec.y * 0.5 + 0.5) * ch) + 'px';
          const status = !av.connected ? ' (斷線)' : (phase === 'lobby' ? (av.ready ? ' ✅' : ' ⏳') : '');
          const crown = av.role === 'teacher' ? '👑 ' : '';
          av.tagEl.textContent = `${crown}${av.name}${status}`;
        }
      });

      const targetX = (followPos ? followPos.x : 0) * 0.55;
      const targetY = (followPos ? followPos.y : 0) + 7.8;
      const targetZ = (followPos ? followPos.z : 2) + 11.2;
      this.camera.position.x += (targetX - this.camera.position.x) * Math.min(1, dt * 7);
      this.camera.position.y += (targetY - this.camera.position.y) * Math.min(1, dt * 7);
      this.camera.position.z += (targetZ - this.camera.position.z) * Math.min(1, dt * 7);
      this.camera.lookAt(followPos ? followPos.x * 0.5 : 0, (followPos ? followPos.y : 0) + 1.0, (followPos ? followPos.z : 2) - 5.5);

      this.renderer.render(this.scene, this.camera);
    }
  }

  root.PartyScene3D = PartyScene3D;
  root.PARTY_CHECKPOINTS = CHECKPOINTS;
})(window);
