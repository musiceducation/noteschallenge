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

    return {
        parseSharedRankKey: parseSharedRankKey,
        resolveSharedRow: resolveSharedRow,
        commitLocalRank: commitLocalRank,
        mergeIntoStore: mergeIntoStore,
        legacySheetGame: legacySheetGame,
        publishBody: publishBody,
        gradeBadge: gradeBadge,
        rankLoadPlan: rankLoadPlan
    };
})();
