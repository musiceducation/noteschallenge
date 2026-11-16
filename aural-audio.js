/**
 * Short Web Audio tones for listening games.
 * Uses the shared AudioEngine context (same sine piano family as audio.playNote)
 * and resumes it inside the tap that asked for sound, so iPad Safari can play.
 */
(function (root, factory) {
    var api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.AuralAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    var MELODIC_GAP = 0.7;
    var NOTE_DUR = 0.85;
    var master = null;

    function schedulePlan(midis, harmonic, start) {
        var t0 = typeof start === 'number' ? start : 0;
        return (midis || []).map(function (midi, index) {
            return {
                midi: midi,
                at: harmonic ? t0 : t0 + index * MELODIC_GAP,
                dur: NOTE_DUR
            };
        });
    }

    function context() {
        var engine = root.AudioEngine;
        if (engine && typeof engine.ensureCtx === 'function') {
            var shared = engine.ensureCtx();
            if (shared) return shared;
        }
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        if (!context.fallback) {
            try { context.fallback = new AC(); } catch (err) { return null; }
            if (engine && typeof engine.register === 'function') engine.register(context.fallback);
        }
        return context.fallback;
    }

    function unlock() {
        var engine = root.AudioEngine;
        if (engine && typeof engine.unlock === 'function') return engine.unlock();
        var ctx = context();
        if (ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted') && ctx.resume) {
            return ctx.resume();
        }
        return Promise.resolve(ctx);
    }

    function stop() {
        if (!master) return;
        var ctx = master.context;
        var old = master;
        master = null;
        try {
            var now = ctx.currentTime;
            old.gain.cancelScheduledValues(now);
            old.gain.setValueAtTime(Math.max(old.gain.value, 0.0001), now);
            old.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
            old.disconnect();
        } catch (err) {}
    }

    function tone(ctx, dest, midi, when, dur) {
        var freq = 440 * Math.pow(2, (midi - 69) / 12);
        var osc = ctx.createOscillator();
        var overtone = ctx.createOscillator();
        var gain = ctx.createGain();
        var overtoneGain = ctx.createGain();
        osc.type = 'sine';
        overtone.type = 'triangle';
        osc.frequency.setValueAtTime(freq, when);
        overtone.frequency.setValueAtTime(freq * 2, when);
        overtoneGain.gain.setValueAtTime(0.18, when);
        osc.connect(gain);
        overtone.connect(overtoneGain);
        overtoneGain.connect(gain);
        gain.connect(dest);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(0.28, when + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        osc.start(when);
        overtone.start(when);
        osc.stop(when + dur + 0.02);
        overtone.stop(when + dur + 0.02);
    }

    function play(notes) {
        var ctx = context();
        unlock();
        if (!ctx || !notes || !notes.length) return false;
        stop();
        master = ctx.createGain();
        master.gain.setValueAtTime(0.9, ctx.currentTime);
        master.connect(ctx.destination);
        var start = ctx.currentTime + 0.05;
        notes.forEach(function (note) {
            tone(ctx, master, note.midi, start + (note.at || 0), note.dur || NOTE_DUR);
        });
        return true;
    }

    return {
        MELODIC_GAP: MELODIC_GAP,
        schedulePlan: schedulePlan,
        unlock: unlock,
        stop: stop,
        play: play
    };
});
