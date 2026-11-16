/**
 * Profile identity and merge rules. Guest data stays on its own key.
 * Numeric bests only move upward. Empty cloud fields do not wipe local text.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.ProfileStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var PREFIX = 'musicGameProfile_';
    var GUEST_KEY = 'musicGameProfile_guest';
    var POINTER_KEY = 'musicGameProfilePointer';

    function num(value) {
        var n = parseInt(value, 10);
        return isNaN(n) ? 0 : n;
    }

    function isGuest(user) {
        if (!user) return true;
        if (user.guest) return true;
        var name = String(user.name || '').trim();
        if (!name || name === '__guest__' || name === '訪客' || name === '測試人員') return true;
        if (name.indexOf('訪客') === 0) return true;
        return false;
    }

    function profileKey(user) {
        if (isGuest(user)) return GUEST_KEY;
        return PREFIX + num(user.grade) + '_' + String(user.class || '') + '_' + String(user.name);
    }

    function readJson(raw, fallback) {
        try {
            var parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (err) {
            return fallback;
        }
    }

    function mergeSettings(existing, patch) {
        var next = Object.assign({}, existing || {});
        Object.keys(patch || {}).forEach(function (key) {
            if (patch[key] !== undefined) next[key] = patch[key];
        });
        return next;
    }

    function mergeBests(local, incoming) {
        var out = Object.assign({}, local || {});
        Object.keys(incoming || {}).forEach(function (key) {
            out[key] = Math.max(num(out[key]), num(incoming[key]));
        });
        return out;
    }

    function preferText(local, incoming) {
        var inc = String(incoming == null ? '' : incoming).trim();
        if (inc) return inc;
        return String(local == null ? '' : local);
    }

    function mergeProfile(local, incoming) {
        var base = Object.assign({}, local || {});
        var inc = incoming || {};
        base.avatar = preferText(base.avatar, inc.avatar) || '🎵';
        base.signature = preferText(base.signature, inc.signature);
        base.totalPlayTime = Math.max(num(base.totalPlayTime), num(inc.totalPlayTime));
        base.level = Math.max(num(base.level) || 1, num(inc.level) || 1);
        base.exp = Math.max(num(base.exp), num(inc.exp));
        base.seat = preferText(base.seat, inc.seat);
        base.gameBests = mergeBests(base.gameBests, inc.gameBests);
        base.stats = Object.assign({}, base.stats || {});
        if (inc.stats) {
            ['totalPlayed', 'cleared', 'totalScore', 'maxCombo', 'fcCount', 'apCount', 'totalAccuracy', 'accuracyCount'].forEach(function (key) {
                base.stats[key] = Math.max(num(base.stats[key]), num(inc.stats[key]));
            });
        }
        var localHist = Array.isArray(base.history) ? base.history : [];
        var incHist = Array.isArray(inc.history) ? inc.history : [];
        base.history = (incHist.length > localHist.length ? incHist : localHist).slice(-30);
        return base;
    }

    function sameNamedPerson(oldProfile, user) {
        if (!oldProfile || isGuest(oldProfile) || isGuest(user)) return false;
        return String(oldProfile.name || '') === String(user.name || '');
    }

    function relabel(oldProfile, user) {
        var next = Object.assign({}, oldProfile);
        next.name = user.name;
        next.grade = num(user.grade);
        next.class = user.class || '';
        next.seat = user.seat || user.id || oldProfile.seat || '';
        return next;
    }

    function readPointer(storage) {
        if (!storage) return null;
        return readJson(storage.getItem(POINTER_KEY), null);
    }

    function writePointer(storage, user) {
        if (!storage || isGuest(user)) return;
        storage.setItem(POINTER_KEY, JSON.stringify({
            key: profileKey(user),
            name: user.name,
            grade: num(user.grade),
            class: user.class || ''
        }));
    }

    function safeSet(storage, key, value) {
        try {
            storage.setItem(key, value);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: (err && err.name) || 'QuotaExceededError' };
        }
    }

    return {
        GUEST_KEY: GUEST_KEY,
        POINTER_KEY: POINTER_KEY,
        isGuest: isGuest,
        profileKey: profileKey,
        readJson: readJson,
        mergeSettings: mergeSettings,
        mergeBests: mergeBests,
        mergeProfile: mergeProfile,
        sameNamedPerson: sameNamedPerson,
        relabel: relabel,
        readPointer: readPointer,
        writePointer: writePointer,
        safeSet: safeSet
    };
});
