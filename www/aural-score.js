/**
 * Listening challenge scores.
 * gameBests.listening is the 聽力 axis for a later radar chart:
 * the highest challenge score among the aural game keys.
 * Practice never reaches this module. A lower score does not replace a higher one.
 */
(function (root, factory) {
    var api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.AuralScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    var AXIS_KEY = 'listening';
    var GAME_KEYS = ['aural-interval', 'aural-rhythm', 'aural-quality'];

    function whole(value) {
        var n = parseInt(value, 10);
        return isNaN(n) ? 0 : n;
    }

    function canSavePlayer(player) {
        if (!player || !String(player.name || '').trim()) return false;
        var Store = root.ProfileStore;
        if (Store && typeof Store.isGuest === 'function' && Store.isGuest(player)) return false;
        return true;
    }

    function applyListeningBests(bests, gameKey, score) {
        var out = Object.assign({}, bests || {});
        var next = whole(score);
        if (GAME_KEYS.indexOf(gameKey) >= 0 && next > whole(out[gameKey])) out[gameKey] = next;
        var axis = whole(out[AXIS_KEY]);
        GAME_KEYS.forEach(function (key) {
            axis = Math.max(axis, whole(out[key]));
        });
        out[AXIS_KEY] = axis;
        return out;
    }

    function storageKey(gameKey) {
        return 'musicGameRanks_' + gameKey;
    }

    function readBoard(storage, gameKey) {
        if (!storage) return [];
        try {
            var parsed = JSON.parse(storage.getItem(storageKey(gameKey)) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            return [];
        }
    }

    function sameStudent(a, b) {
        return String(a.name || '').trim() === String(b.name || '').trim()
            && String(a.class || '') === String(b.class || '')
            && String(a.id == null ? '' : a.id) === String(b.id == null ? '' : b.id);
    }

    function previousBest(rows, row) {
        var best = 0;
        (rows || []).forEach(function (item) {
            if (item && sameStudent(item, row)) best = Math.max(best, whole(item.score));
        });
        return best;
    }

    function commitBoard(storage, gameKey, row) {
        if (!storage || GAME_KEYS.indexOf(gameKey) < 0) return [];
        if (!root.RankSync || typeof root.RankSync.keepHigherScore !== 'function') {
            throw new Error('RankSync.keepHigherScore missing');
        }
        var next = root.RankSync.keepHigherScore(readBoard(storage, gameKey).concat([row]));
        storage.setItem(storageKey(gameKey), JSON.stringify(next));
        return next;
    }

    return {
        AXIS_KEY: AXIS_KEY,
        GAME_KEYS: GAME_KEYS,
        gameKeys: GAME_KEYS,
        canSavePlayer: canSavePlayer,
        applyListeningBests: applyListeningBests,
        storageKey: storageKey,
        readBoard: readBoard,
        previousBest: previousBest,
        commitBoard: commitBoard
    };
});
