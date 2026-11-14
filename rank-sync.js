var RankSync = (function () {
    var KEY_PREFIX = 'abrsm-theory-v1:';

    function parseSharedRankKey(raw) {
        var key = String(raw || '');
        if (key.slice(0, KEY_PREFIX.length) !== KEY_PREFIX) return null;
        var rest = key.slice(KEY_PREFIX.length);
        var clef = /^notes-clef-(treble|bass|alto|tenor|mixed)$/.exec(rest);
        if (clef) {
            return {
                storageKey: key,
                gameKey: 'notes-clef-' + clef[1],
                syllabusId: '',
                clefChoice: clef[1]
            };
        }
        var graded = /^(rhythm-tap|notes|keys|rhythm|terms):(abrsm-g[1-5])$/.exec(rest);
        if (!graded) return null;
        return {
            storageKey: key,
            gameKey: graded[1],
            syllabusId: graded[2],
            clefChoice: ''
        };
    }

    function resolveSharedRow(row) {
        if (!row || typeof row !== 'object') return null;
        var storageKey = String(row.storageKey || '');
        var mode = String(row.mode || '');
        var parsed = null;
        if (storageKey) {
            parsed = parseSharedRankKey(storageKey);
            if (!parsed) return null;
            if (mode.slice(0, KEY_PREFIX.length) === KEY_PREFIX && mode !== storageKey) return null;
        } else {
            parsed = parseSharedRankKey(mode);
            if (!parsed) return null;
        }
        if (row.gameKey != null && String(row.gameKey) !== '' && String(row.gameKey) !== parsed.gameKey) return null;
        if (row.syllabusId != null && String(row.syllabusId) !== '' && String(row.syllabusId) !== parsed.syllabusId) return null;
        if (row.clefChoice != null && String(row.clefChoice) !== '' && String(row.clefChoice) !== parsed.clefChoice) return null;
        return parsed;
    }

    function sameStudent(a, b) {
        return String(a.name || '') === String(b.name || '')
            && String(a.class || '') === String(b.class || '')
            && String(a.id || '') === String(b.id || '');
    }

    function commitLocalRank(list, record) {
        var parsed = parseSharedRankKey(record && record.storageKey);
        var all = Array.isArray(list) ? list.slice() : [];
        if (!parsed || !record || !record.name) return { list: all, publish: null };
        var incoming = {
            rankNamespace: 'abrsm-theory-v1',
            storageKey: parsed.storageKey,
            gameKey: parsed.gameKey,
            clefChoice: parsed.clefChoice,
            syllabusId: parsed.syllabusId,
            score: parseInt(record.score, 10) || 0,
            name: record.name,
            class: record.class || '',
            id: record.id || '',
            accuracy: parseInt(record.accuracy, 10) || 0,
            max_combo: parseInt(record.max_combo, 10) || 0,
            grade: record.grade,
            legacyBoard: false
        };
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            var item = all[i];
            if (!item || !sameStudent(item, incoming)) continue;
            if (String(item.syllabusId || '') !== String(parsed.syllabusId || '')) continue;
            idx = i;
            break;
        }
        if (idx >= 0) {
            if (incoming.score > (parseInt(all[idx].score, 10) || 0)) {
                all[idx] = incoming;
                return { list: all, publish: incoming };
            }
            return { list: all, publish: null };
        }
        all.push(incoming);
        return { list: all, publish: incoming };
    }

    function mergeIntoStore(rows, storage) {
        if (!Array.isArray(rows) || !storage) return;
        rows.forEach(function (row) {
            var parsed = resolveSharedRow(row);
            if (!parsed || !row.name) return;
            var current = [];
            try { current = JSON.parse(storage.getItem(parsed.storageKey) || '[]'); }
            catch (err) { current = []; }
            var committed = commitLocalRank(current, {
                storageKey: parsed.storageKey,
                score: row.score,
                name: row.name,
                class: row.class || '',
                id: row.id || '',
                accuracy: row.accuracy,
                max_combo: row.max_combo,
                grade: row.grade
            });
            storage.setItem(parsed.storageKey, JSON.stringify(committed.list));
        });
    }

    function legacySheetGame(gameKey) {
        if (gameKey === 'terms') return 'game3';
        if (gameKey === 'rhythm' || gameKey === 'rhythm-tap') return 'game2';
        return 'game1';
    }

    function publishBody(record) {
        var parsed = parseSharedRankKey(record && record.storageKey);
        if (!parsed || !record.name) return null;
        // The deployed web app ignores unknown actions and rejects game
        // "abrsm-theory-v1". It appends a fixed column row and doGet keeps mode.
        // action saveRank is enforced only after Code.gs is redeployed.
        return {
            action: 'saveRank',
            game: legacySheetGame(parsed.gameKey),
            mode: parsed.storageKey,
            mode_name: parsed.clefChoice ? ('音名譜號·' + parsed.clefChoice) : (parsed.gameKey + '·' + parsed.syllabusId),
            name: record.name,
            grade: record.grade,
            class: record.class || '',
            id: record.id || '',
            score: parseInt(record.score, 10) || 0,
            max_combo: parseInt(record.max_combo, 10) || 0,
            accuracy: parseInt(record.accuracy, 10) || 0,
            total_questions: parseInt(record.total_questions, 10) || 0
        };
    }

    function gradeBadge(syllabusId) {
        return String(syllabusId || '').replace('abrsm-g', 'G');
    }

    function rankLoadPlan(input) {
        input = input || {};
        var cacheRows = parseInt(input.legacyCacheRows, 10) || 0;
        var fresh = !!input.legacyCacheFresh && cacheRows > 0;
        var localBoard = !!input.localBoard;
        return {
            paintLocalImmediately: localBoard,
            paintLegacyCache: cacheRows > 0,
            fetchNetwork: !!input.force || !fresh,
            replaceWithConnectionError: !localBoard
        };
    }

    // Device-origin ledger. Rank keys cannot show which rows were played here
    // once a remote merge has copied peers into them, so the scan runs once,
    // before that merge, and later plays are added one by one.
    var ORIGIN_KEY = 'abrsm-theory-v1:device-origin-v1';

    function originId(record) {
        return [
            String(record.storageKey || ''),
            String(record.name || '').trim(),
            String(record.class || '').trim(),
            String(record.id || '').trim()
        ].join('\n');
    }

    function wholeNumber(value) {
        if (typeof value === 'number' && isFinite(value) && Math.floor(value) === value) return value;
        var text = String(value == null ? '' : value).trim();
        if (!/^\d+$/.test(text)) return null;
        return parseInt(text, 10);
    }

    function validLocalBest(record) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
        var storageKey = String(record.storageKey || '');
        var parsed = parseSharedRankKey(storageKey);
        if (!parsed) return null;
        if (record.mode && String(record.mode) !== storageKey) return null;
        if (record.gameKey != null && String(record.gameKey) !== '' && String(record.gameKey) !== parsed.gameKey) return null;
        if (record.syllabusId != null && String(record.syllabusId) !== '' && String(record.syllabusId) !== parsed.syllabusId) return null;
        if (record.clefChoice != null && String(record.clefChoice) !== '' && String(record.clefChoice) !== parsed.clefChoice) return null;
        var name = String(record.name == null ? '' : record.name).trim();
        var klass = String(record.class == null ? '' : record.class).trim();
        var seat = String(record.id == null ? '' : record.id).trim();
        if (!name || name.length > 20 || !klass || !seat) return null;
        if (!/^[1-6]$/.test(String(record.grade == null ? '' : record.grade).trim())) return null;
        var score = wholeNumber(record.score);
        if (score == null) return null;
        return {
            storageKey: parsed.storageKey,
            gameKey: parsed.gameKey,
            clefChoice: parsed.clefChoice,
            syllabusId: parsed.syllabusId,
            name: name,
            class: klass,
            id: seat,
            grade: String(record.grade).trim(),
            score: score,
            accuracy: wholeNumber(record.accuracy) || 0,
            max_combo: wholeNumber(record.max_combo) || 0
        };
    }

    function readLedger(storage) {
        var rawText = null;
        try { rawText = storage.getItem(ORIGIN_KEY); } catch (err) { rawText = null; }
        if (rawText == null || rawText === '') return { captured: false, bests: {}, acked: {}, readable: true };
        try {
            var raw = JSON.parse(rawText);
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { captured: true, bests: {}, acked: {}, readable: false };
            return {
                captured: raw.captured === true,
                bests: raw.bests && typeof raw.bests === 'object' && !Array.isArray(raw.bests) ? raw.bests : {},
                acked: raw.acked && typeof raw.acked === 'object' && !Array.isArray(raw.acked) ? raw.acked : {},
                readable: true
            };
        } catch (err) {
            return { captured: true, bests: {}, acked: {}, readable: false };
        }
    }

    function writeLedger(storage, ledger) {
        storage.setItem(ORIGIN_KEY, JSON.stringify({
            captured: ledger.captured === true,
            bests: ledger.bests || {},
            acked: ledger.acked || {}
        }));
    }

    function rememberBest(ledger, candidate) {
        var id = originId(candidate);
        var prev = ledger.bests[id];
        if (!prev || candidate.score > (parseInt(prev.score, 10) || 0)) ledger.bests[id] = candidate;
    }

    function storageKeys(storage) {
        if (storage && typeof storage.keys === 'function') return storage.keys();
        var out = [];
        if (storage && typeof storage.length === 'number' && typeof storage.key === 'function') {
            for (var i = 0; i < storage.length; i++) out.push(storage.key(i));
        }
        return out;
    }

    function captureDeviceOrigins(storage) {
        var ledger = readLedger(storage);
        if (!storage || ledger.captured || ledger.readable === false) return ledger;
        storageKeys(storage).forEach(function (key) {
            if (!parseSharedRankKey(key) || key === ORIGIN_KEY) return;
            var list = null;
            try { list = JSON.parse(storage.getItem(key) || '[]'); } catch (err) { return; }
            if (!Array.isArray(list)) return;
            list.forEach(function (row) {
                if (!row || typeof row !== 'object') return;
                if (row.mode && String(row.mode) !== key) return;
                if (row.storageKey && String(row.storageKey) !== key) return;
                var candidate = validLocalBest(Object.assign({}, row, { storageKey: key }));
                if (candidate) rememberBest(ledger, candidate);
            });
        });
        ledger.captured = true;
        writeLedger(storage, ledger);
        return readLedger(storage);
    }

    function noteLocalBest(storage, record) {
        var ledger = readLedger(storage);
        if (!storage || ledger.readable === false) return ledger;
        var candidate = validLocalBest(record);
        if (!candidate) return ledger;
        rememberBest(ledger, candidate);
        writeLedger(storage, ledger);
        return readLedger(storage);
    }

    function remoteBestScore(remoteRows, candidate) {
        var best = null;
        (remoteRows || []).forEach(function (row) {
            var parsed = resolveSharedRow(row);
            if (!parsed || parsed.storageKey !== candidate.storageKey || !sameStudent(row, candidate)) return;
            var score = parseInt(row.score, 10) || 0;
            if (best == null || score > best) best = score;
        });
        return best;
    }

    function planBackfill(storage, remoteRows, opts) {
        opts = opts || {};
        var limit = opts.limit == null ? 20 : opts.limit;
        var pending = opts.pending || {};
        var ledger = readLedger(storage);
        if (ledger.readable === false) return [];
        var queued = [];
        Object.keys(ledger.bests).forEach(function (id) {
            var best = validLocalBest(ledger.bests[id]);
            if (!best) return;
            var remote = remoteBestScore(remoteRows, best);
            if (remote != null && remote >= best.score) return;
            var acked = parseInt(ledger.acked[id], 10);
            if (!isNaN(acked) && acked >= best.score) return;
            if (pending[id + '@' + best.score]) return;
            queued.push(best);
        });
        queued.sort(function (a, b) {
            if (a.storageKey !== b.storageKey) return a.storageKey < b.storageKey ? -1 : 1;
            if (a.name !== b.name) return a.name < b.name ? -1 : 1;
            if (a.id !== b.id) return a.id < b.id ? -1 : 1;
            return 0;
        });
        if (limit < 0) return [];
        return queued.slice(0, limit);
    }

    function ackBackfill(storage, record) {
        var ledger = readLedger(storage);
        var candidate = validLocalBest(record);
        if (!storage || ledger.readable === false || !candidate) return ledger;
        var id = originId(candidate);
        var prev = parseInt(ledger.acked[id], 10);
        if (isNaN(prev) || candidate.score > prev) ledger.acked[id] = candidate.score;
        writeLedger(storage, ledger);
        return readLedger(storage);
    }

    function ackedCovers(storage, record) {
        var candidate = validLocalBest(record);
        if (!candidate) return false;
        var ledger = readLedger(storage);
        var acked = parseInt(ledger.acked[originId(candidate)], 10);
        return !isNaN(acked) && acked >= candidate.score;
    }

    function explicitOk(result) {
        return !!(result && result.ok === true && result.explicit === true && !result.error);
    }

    // Old classroom modes that are the same 1-minute clef challenge as 音名譜號.
    var LEGACY_CLEF_MODE = { classic60: 'treble', bass60: 'bass', mixed60: 'mixed' };
    // These stayed separate games. They are not mixed into a clef or grade board.
    var LEGACY_GAME1_MODE = { noMiss: '零失誤挑戰', keysig60: '調號挑戰', solfege60: '唱名挑戰' };
    var NO_MISS_CLEF = { treble: 1, bass: 1, alto: 1, tenor: 1, mixed: 1 };

    // New runs store the clef in the existing mode column (noMiss-bass).
    // Bare noMiss has no clef field: the game always forced treble.
    function noMissModeKey(clef) {
        return NO_MISS_CLEF[clef] ? ('noMiss-' + clef) : 'noMiss-treble';
    }

    function legacyNoMissClef(row) {
        var mode = legacyMode(row);
        var tagged = /^noMiss-(treble|bass|alto|tenor|mixed)$/.exec(mode);
        if (tagged) return tagged[1];
        if (mode !== 'noMiss') return '';
        var clef = row && row.clefChoice != null ? String(row.clefChoice) : '';
        if (NO_MISS_CLEF[clef]) return clef;
        return 'treble';
    }

    function legacyMode(row) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return '';
        if (resolveSharedRow(row)) return '';
        return String(row.mode || row.difficulty || '');
    }

    function legacyClefChoice(row) {
        return LEGACY_CLEF_MODE[legacyMode(row)] || '';
    }

    function legacyGame1Mode(row) {
        var mode = legacyMode(row);
        return LEGACY_GAME1_MODE[mode] ? mode : '';
    }

    function rankIdentity(row) {
        return [
            String(row.name || '').trim(),
            String(row.class || '').trim(),
            String(row.id == null ? '' : row.id).trim()
        ].join('\n');
    }

    // First row wins a tie, so the caller can pass the current board before older rows.
    function keepHigherScore(rows) {
        var best = {};
        var order = [];
        (rows || []).forEach(function (row) {
            if (!row || !String(row.name || '').trim()) return;
            var id = rankIdentity(row);
            var score = parseInt(row.score, 10) || 0;
            if (!Object.prototype.hasOwnProperty.call(best, id)) {
                best[id] = row;
                order.push(id);
                return;
            }
            if (score > (parseInt(best[id].score, 10) || 0)) best[id] = row;
        });
        return order.map(function (id) { return best[id]; });
    }

    return {
        parseSharedRankKey: parseSharedRankKey,
        resolveSharedRow: resolveSharedRow,
        commitLocalRank: commitLocalRank,
        mergeIntoStore: mergeIntoStore,
        legacySheetGame: legacySheetGame,
        publishBody: publishBody,
        gradeBadge: gradeBadge,
        rankLoadPlan: rankLoadPlan,
        ORIGIN_KEY: ORIGIN_KEY,
        originId: originId,
        validLocalBest: validLocalBest,
        captureDeviceOrigins: captureDeviceOrigins,
        noteLocalBest: noteLocalBest,
        planBackfill: planBackfill,
        ackBackfill: ackBackfill,
        ackedCovers: ackedCovers,
        explicitOk: explicitOk,
        legacyClefChoice: legacyClefChoice,
        legacyGame1Mode: legacyGame1Mode,
        noMissModeKey: noMissModeKey,
        legacyNoMissClef: legacyNoMissClef,
        keepHigherScore: keepHigherScore
    };
})();
