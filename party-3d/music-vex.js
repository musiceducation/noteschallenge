/**
 * VexFlow 5.0.0 Notation Renderer + Web Audio Helper for Party 3D Framework.
 * Renders real vector staves (treble & bass clefs + sharps/flats), never fake images.
 * Handles browser audio unlock & visibility suspend cleanly.
 */
(function (root) {
  'use strict';

  let audioCtx = null;
  let muted = false;

  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  }

  function setMuted(val) { muted = !!val; }
  function isMuted() { return muted; }

  document.addEventListener('visibilitychange', () => {
    if (!audioCtx) return;
    try {
      if (document.hidden && audioCtx.state === 'running') audioCtx.suspend();
      else if (!document.hidden && !muted && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  });

  function playNote(freq, dur, type, vol) {
    if (muted || !audioCtx || !freq) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol || 0.16, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (dur || 0.35));
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + (dur || 0.35) + 0.03);
    } catch (e) {}
  }

  function sfxCorrect(freq) {
    const f = freq || 523.25;
    playNote(f, 0.25, 'triangle', 0.16);
    setTimeout(() => playNote(f * 1.25, 0.22, 'sine', 0.13), 70);
    setTimeout(() => playNote(f * 1.5, 0.28, 'sine', 0.13), 140);
  }

  function sfxWrong() {
    playNote(210, 0.18, 'sawtooth', 0.1);
    setTimeout(() => playNote(165, 0.24, 'sawtooth', 0.1), 100);
  }

  function renderVexQuestion(container, q) {
    if (!container) return;
    container.innerHTML = '';
    if (!q) return;
    const VF = typeof VexFlow !== 'undefined' ? VexFlow : null;
    if (!VF || !VF.Renderer) {
      container.innerHTML = '<div style="padding:10px;font-weight:800;color:#dc2626;">VexFlow 載入失敗</div>';
      return;
    }
    try {
      const w = 230, h = 112;
      const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
      renderer.resize(w, h);
      const ctx = renderer.getContext();
      const clef = q.clef === 'bass' ? 'bass' : 'treble';
      const stave = new VF.Stave(14, 10, w - 28);
      stave.addClef(clef);
      stave.setContext(ctx).draw();

      const sn = new VF.StaveNote({ clef, keys: [q.vexKey], duration: 'w' });
      if (typeof sn.setStyle === 'function') {
        sn.setStyle({ fillStyle: '#0284c7', strokeStyle: '#0f172a' });
      }
      if (q.acc && typeof VF.Accidental === 'function') {
        sn.addModifier(new VF.Accidental(q.acc), 0);
      }
      const voice = new VF.Voice({ numBeats: 4, beatValue: 4 });
      if (typeof voice.setMode === 'function') voice.setMode(2);
      voice.addTickables([sn]);
      new VF.Formatter().joinVoices([voice]).format([voice], w - stave.getNoteStartX() - 36);
      voice.draw(ctx, stave);

      const svg = container.querySelector('svg');
      if (svg) {
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.style.width = '210px';
        svg.style.height = '96px';
        svg.style.display = 'block';
        svg.style.margin = '0 auto';
      }
    } catch (err) {
      container.innerHTML = '<div style="padding:10px;font-weight:800;color:#dc2626;">樂譜渲染錯誤</div>';
    }
  }

  root.PartyMusicVex = { unlockAudio, setMuted, isMuted, playNote, sfxCorrect, sfxWrong, renderVexQuestion };
})(window);
