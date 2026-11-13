var RhythmLevels = (function () {
    var LEVELS = ['easy', 'medium', 'hard'];
    var METERS = { '2/4': 2, '3/4': 3, '4/4': 4 };
    var CHOICES = {
        whole: { id: 'whole', quarters: 4, label: '全音符', symbol: '𝅝' },
        half: { id: 'half', quarters: 2, label: '二分音符', symbol: '𝅗𝅥' },
        quarter: { id: 'quarter', quarters: 1, label: '四分音符', symbol: '𝅘𝅥' },
        eighth: { id: 'eighth', quarters: 0.5, label: '八分音符', symbol: '𝅘𝅥𝅮' },
        sixteenth: { id: 'sixteenth', quarters: 0.25, label: '十六分音符', symbol: '𝅘𝅥𝅯' }
    };
    var EXPAND = {
        'ta-a-a-a': [{ q: 4, vex: 'w' }],
        'ta-a': [{ q: 2, vex: 'h' }],
        'ta': [{ q: 1, vex: 'q' }],
        'ti-ti': [{ q: 0.5, vex: '8' }, { q: 0.5, vex: '8' }],
        'ti-ri-ti-ri': [{ q: 0.25, vex: '16' }, { q: 0.25, vex: '16' }, { q: 0.25, vex: '16' }, { q: 0.25, vex: '16' }],
        'ti-ti-ri': [{ q: 0.5, vex: '8' }, { q: 0.25, vex: '16' }, { q: 0.25, vex: '16' }],
        'ti-ri-ti': [{ q: 0.25, vex: '16' }, { q: 0.25, vex: '16' }, { q: 0.5, vex: '8' }],
        'ri-ti-ri': [{ q: 0.25, vex: '16' }, { q: 0.5, vex: '8' }, { q: 0.25, vex: '16' }],
        'ti': [{ q: 0.5, vex: '8' }],
        'ri': [{ q: 0.25, vex: '16' }]
    };
    var LABELS = { easy: '容易', medium: '中等', hard: '困難' };

    function round(n) { return Math.round(n * 1000) / 1000; }

    function choiceList(levelId) {
        var ids = levelId === 'hard'
            ? ['whole', 'half', 'quarter', 'eighth', 'sixteenth']
            : levelId === 'medium'
                ? ['whole', 'half', 'quarter', 'eighth']
                : ['whole', 'half', 'quarter'];
        return ids.map(function (id) { return CHOICES[id]; });
    }

    function placements(levelId, pos, remaining) {
        var onBeat = Math.abs(pos - Math.round(pos)) < 0.001;
        var out = [];
        function add(tokens, quarters) {
            if (quarters <= remaining + 0.001) out.push({ tokens: tokens, quarters: quarters });
        }
        if (onBeat) {
            if (remaining >= 4 && pos === 0) add(['ta-a-a-a'], 4);
            if (remaining >= 2) add(['ta-a'], 2);
            if (remaining >= 1) add(['ta'], 1);
            if (levelId !== 'easy' && remaining >= 1) add(['ti-ti'], 1);
            if (levelId === 'hard' && remaining >= 1) {
                add(['ti-ri-ti-ri'], 1);
                add(['ti-ti-ri'], 1);
                add(['ti-ri-ti'], 1);
                add(['ri-ti-ri'], 1);
            }
        }
        if (Math.abs(remaining - 0.5) < 0.001 && levelId !== 'easy') add(['ti'], 0.5);
        if (levelId === 'hard' && Math.abs(remaining - 0.25) < 0.001) add(['ri'], 0.25);
        if (levelId === 'hard' && Math.abs(remaining - 0.75) < 0.001) {
            add(['ti', 'ri'], 0.75);
            add(['ri', 'ti'], 0.75);
            add(['ri', 'ri', 'ri'], 0.75);
        }
        return out;
    }

    function fillExact(amount, levelId, random) {
        var target = round(amount);
        var parts = [];
        var pos = 0;
        var guard = 0;
        while (pos < target - 0.001 && guard++ < 40) {
            var remaining = round(target - pos);
            var options = placements(levelId, pos, remaining);
            if (!options.length) break;
            var pick = options[Math.floor(random() * options.length)];
            pick.tokens.forEach(function (token) { parts.push(token); });
            pos = round(pos + pick.quarters);
        }
        return parts.join(' ');
    }

    function buildBar(levelId, meterId, random) {
        var quarters = METERS[meterId];
        if (!quarters) throw new Error('meter');
        if (LEVELS.indexOf(levelId) < 0) throw new Error('level');
        return fillExact(quarters, levelId, random || Math.random);
    }

    function expandBar(tokenString) {
        var events = [];
        var pos = 0;
        String(tokenString || '').split(' ').filter(Boolean).forEach(function (token) {
            var notes = EXPAND[token];
            if (!notes) throw new Error('unknown token ' + token);
            notes.forEach(function (note) {
                events.push({ start: round(pos), quarters: note.q, vex: note.vex, token: token });
                pos = round(pos + note.q);
            });
        });
        return events;
    }

    function sumQuarters(tokenString) {
        return round(expandBar(tokenString).reduce(function (sum, event) { return sum + event.quarters; }, 0));
    }

    function beamGroups(tokenString) {
        var events = expandBar(tokenString);
        var groups = [];
        var run = [];
        function flush() {
            if (run.length) groups.push(run.slice());
            run = [];
        }
        events.forEach(function (event, index) {
            if (event.quarters > 0.5) { flush(); return; }
            var beat = Math.floor(event.start + 0.001);
            if (run.length && Math.floor(events[run[0]].start + 0.001) !== beat) flush();
            run.push(index);
        });
        flush();
        return groups.filter(function (group) { return group.length > 1; });
    }

    function groupStaysInBeat(tokenString) {
        var events = expandBar(tokenString);
        return beamGroups(tokenString).every(function (group) {
            var beat = Math.floor(events[group[0]].start + 0.001);
            return group.every(function (index) {
                var event = events[index];
                var end = event.start + event.quarters;
                return Math.floor(event.start + 0.001) === beat && end <= beat + 1 + 0.001;
            });
        });
    }

    function completionQuestion(levelId, random) {
        var rng = random || Math.random;
        var choices = choiceList(levelId);
        var answers = choices.filter(function (choice) { return choice.quarters < 4; });
        var answer = answers[Math.floor(rng() * answers.length)];
        var shown = fillExact(round(4 - answer.quarters), levelId, rng);
        var matches = choices.filter(function (choice) { return choice.quarters === answer.quarters; });
        return {
            meter: '4/4',
            shown: shown,
            blankQuarters: answer.quarters,
            answerId: answer.id,
            choices: choices,
            unique: matches.length === 1 && sumQuarters(shown) + answer.quarters === 4
        };
    }

    function tokensIn(tokenString) {
        return String(tokenString || '').split(' ').filter(Boolean);
    }

    function storageKey(mode, levelId) {
        var kind = mode === 'complete' ? 'rhythm-complete' : 'rhythm-level';
        return 'abrsm-theory-v1:' + kind + ':' + levelId;
    }

    function saveBest(storage, record) {
        if (!storage || !record || LEVELS.indexOf(record.level) < 0) return [];
        if (record.mode !== 'tap' && record.mode !== 'complete') return [];
        var key = storageKey(record.mode, record.level);
        var all = [];
        try { all = JSON.parse(storage.getItem(key) || '[]'); } catch (err) { all = []; }
        if (!Array.isArray(all)) all = [];
        var row = {
            rankNamespace: 'rhythm-level-v1',
            storageKey: key,
            level: record.level,
            mode: record.mode,
            legacyBoard: false,
            name: record.name,
            class: record.class || '',
            id: record.id || '',
            grade: record.grade,
            score: record.score || 0,
            accuracy: record.accuracy || 0,
            max_combo: record.maxCombo || record.max_combo || 0
        };
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            var item = all[i];
            if (!item) continue;
            if (item.name === row.name && item.class === row.class && String(item.id || '') === String(row.id || '') && item.level === row.level) idx = i;
        }
        if (idx >= 0) { if (row.score > (all[idx].score || 0)) all[idx] = row; }
        else all.push(row);
        storage.setItem(key, JSON.stringify(all));
        return all;
    }

    function challengeSpec(levelId) {
        var meta = {
            easy: { name: '容易', bpm: 72, hpLoss: 8, winScale: 1.45 },
            medium: { name: '中等', bpm: 84, hpLoss: 12, winScale: 1.2 },
            hard: { name: '困難', bpm: 96, hpLoss: 16, winScale: 1.05 }
        }[levelId];
        if (!meta) return null;
        return {
            id: levelId,
            name: meta.name,
            bpm: meta.bpm,
            bars: 4,
            hpLoss: meta.hpLoss,
            winScale: meta.winScale,
            meters: ['2/4', '3/4', '4/4'],
            tokens: [],
            syncopation: false,
            levelRank: true,
            storageKey: storageKey('tap', levelId)
        };
    }

    function coverageText(levelId) {
        if (levelId === 'medium') return '中等用 2/4、3/4、4/4。在全音符、二分音符、四分音符之外，加上同一拍裡面連在一起的八分音符。';
        if (levelId === 'hard') return '困難仍用 2/4、3/4、4/4，並加入十六分音符。較易的音符仍會出現。符尾只連在同一拍內，不跨拍，也不跨小節線。';
        return '容易用 2/4、3/4、4/4，只有全音符、二分音符和四分音符。八分音符和十六分音符未到。';
    }

    return {
        LEVELS: LEVELS,
        LABELS: LABELS,
        CHOICES: CHOICES,
        METERS: METERS,
        buildBar: buildBar,
        fillExact: fillExact,
        expandBar: expandBar,
        sumQuarters: sumQuarters,
        beamGroups: beamGroups,
        groupStaysInBeat: groupStaysInBeat,
        completionQuestion: completionQuestion,
        tokensIn: tokensIn,
        storageKey: storageKey,
        saveBest: saveBest,
        challengeSpec: challengeSpec,
        coverageText: coverageText,
        choiceList: choiceList
    };
})();
