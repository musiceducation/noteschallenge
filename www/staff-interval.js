/**
 * 看譜辨音程. Two notes on one staff; the student names the interval.
 * Level 1 asks for the degree only (二度–八度).
 * Level 2 also asks 大 / 小 / 純, using the same pool as 音程聽辨 level 2.
 * Simple diatonic intervals only: no compound, diminished, or augmented.
 * Treble and bass only. Clefs and noteheads are vector paths, not music-font glyphs.
 * Challenge scores may be saved like other digital tests. countsTowardRadar is false,
 * so this game is not added to the seven-axis formula.
 */
(function (root, factory) {
    var api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.StaffInterval = api;
    if (root && root.document) {
        var boot = function () { api.mount(root.document); };
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
        else boot();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    var META = {
        gameKey: 'staff-interval',
        label: '看譜辨音程',
        domain: 'C',
        tags: ['C-1'],
        axis: 'reading',
        uploadsScore: true,
        countsTowardRadar: false
    };
    var GAME_KEY = META.gameKey;
    var CHALLENGE_MS = 60000;
    var ADVANCE_MS = 900;
    var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    var SEMI = [0, 2, 4, 5, 7, 9, 11];
    var SIZE_LABEL = { 2: '二度', 3: '三度', 4: '四度', 5: '五度', 6: '六度', 7: '七度', 8: '八度' };
    var QUALITY_LABEL = { minor: '小', major: '大', perfect: '純' };
    var RANGE = {
        treble: { min: 0, max: 12 },
        bass: { min: -12, max: 0 }
    };
    var LEVEL2 = [
        { size: 2, quality: 'minor', id: 'm2' },
        { size: 2, quality: 'major', id: 'M2' },
        { size: 3, quality: 'minor', id: 'm3' },
        { size: 3, quality: 'major', id: 'M3' },
        { size: 4, quality: 'perfect', id: 'P4' },
        { size: 5, quality: 'perfect', id: 'P5' },
        { size: 8, quality: 'perfect', id: 'P8' }
    ];
    var TREBLE_PATH = 'm12.049 3.5296c0.305 3.1263-2.019 5.6563-4.0772 7.7014-0.9349 0.897-0.155 0.148-0.6437 0.594-0.1022-0.479-0.2986-1.731-0.2802-2.11 0.1304-2.6939 2.3198-6.5875 4.2381-8.0236 0.309 0.5767 0.563 0.6231 0.763 1.8382zm0.651 16.142c-1.232-0.906-2.85-1.144-4.3336-0.885-0.1913-1.255-0.3827-2.51-0.574-3.764 2.3506-2.329 4.9066-5.0322 5.0406-8.5394 0.059-2.232-0.276-4.6714-1.678-6.4836-1.7004 0.12823-2.8995 2.156-3.8019 3.4165-1.4889 2.6705-1.1414 5.9169-0.57 8.7965-0.8094 0.952-1.9296 1.743-2.7274 2.734-2.3561 2.308-4.4085 5.43-4.0046 8.878 0.18332 3.334 2.5894 6.434 5.8702 7.227 1.2457 0.315 2.5639 0.346 3.8241 0.099 0.2199 2.25 1.0266 4.629 0.0925 6.813-0.7007 1.598-2.7875 3.004-4.3325 2.192-0.5994-0.316-0.1137-0.051-0.478-0.252 1.0698-0.257 1.9996-1.036 2.26-1.565 0.8378-1.464-0.3998-3.639-2.1554-3.358-2.262 0.046-3.1904 3.14-1.7356 4.685 1.3468 1.52 3.833 1.312 5.4301 0.318 1.8125-1.18 2.0395-3.544 1.8325-5.562-0.07-0.678-0.403-2.67-0.444-3.387 0.697-0.249 0.209-0.059 1.193-0.449 2.66-1.053 4.357-4.259 3.594-7.122-0.318-1.469-1.044-2.914-2.302-3.792zm0.561 5.757c0.214 1.991-1.053 4.321-3.079 4.96-0.136-0.795-0.172-1.011-0.2626-1.475-0.4822-2.46-0.744-4.987-1.116-7.481 1.6246-0.168 3.4576 0.543 4.0226 2.184 0.244 0.577 0.343 1.197 0.435 1.812zm-5.1486 5.196c-2.5441 0.141-4.9995-1.595-5.6343-4.081-0.749-2.153-0.5283-4.63 0.8207-6.504 1.1151-1.702 2.6065-3.105 4.0286-4.543 0.183 1.127 0.366 2.254 0.549 3.382-2.9906 0.782-5.0046 4.725-3.215 7.451 0.5324 0.764 1.9765 2.223 2.7655 1.634-1.102-0.683-2.0033-1.859-1.8095-3.227-0.0821-1.282 1.3699-2.911 2.6513-3.198 0.4384 2.869 0.9413 6.073 1.3797 8.943-0.5054 0.1-1.0211 0.143-1.536 0.143z';

    function fromDiatonic(index) {
        var octave = 4 + Math.floor(index / 7);
        var mod = ((index % 7) + 7) % 7;
        return {
            letter: LETTERS[mod],
            octave: octave,
            diatonic: index,
            midi: (octave + 1) * 12 + SEMI[mod]
        };
    }

    function classify(low, high) {
        var steps = high.diatonic - low.diatonic;
        var size = steps + 1;
        var semitones = high.midi - low.midi;
        var quality = null;
        if (size === 2) quality = semitones === 1 ? 'minor' : (semitones === 2 ? 'major' : null);
        else if (size === 3) quality = semitones === 3 ? 'minor' : (semitones === 4 ? 'major' : null);
        else if (size === 4) quality = semitones === 5 ? 'perfect' : (semitones === 6 ? 'augmented' : null);
        else if (size === 5) quality = semitones === 7 ? 'perfect' : (semitones === 6 ? 'diminished' : null);
        else if (size === 6) quality = semitones === 8 ? 'minor' : (semitones === 9 ? 'major' : null);
        else if (size === 7) quality = semitones === 10 ? 'minor' : (semitones === 11 ? 'major' : null);
        else if (size === 8) quality = semitones === 12 ? 'perfect' : null;
        return { size: size, semitones: semitones, quality: quality };
    }

    function simpleAllowed(info) {
        return info.size >= 2 && info.size <= 8 &&
            (info.quality === 'minor' || info.quality === 'major' || info.quality === 'perfect');
    }

    function spellings(clef, spec) {
        var range = RANGE[clef] || RANGE.treble;
        var found = [];
        var span = spec.size - 1;
        for (var d = range.min; d <= range.max - span; d++) {
            var low = fromDiatonic(d);
            var high = fromDiatonic(d + span);
            var info = classify(low, high);
            if (!simpleAllowed(info)) continue;
            if (spec.quality && info.quality !== spec.quality) continue;
            if (info.size !== spec.size) continue;
            found.push({ low: low, high: high, size: info.size, quality: info.quality, semitones: info.semitones });
        }
        return found;
    }

    function specsFor(level) {
        if (level === 2) return LEVEL2.map(function (item) {
            return { size: item.size, quality: item.quality, id: item.id };
        });
        var list = [];
        for (var size = 2; size <= 8; size++) list.push({ size: size, quality: null, id: 'size:' + size });
        return list;
    }

    function tokenOf(level, info) {
        if (level <= 1) return 'size:' + info.size;
        return info.quality + ':' + info.size;
    }

    function labelOf(token) {
        var text = String(token || '');
        if (text.indexOf('size:') === 0) return SIZE_LABEL[parseInt(text.slice(5), 10)] || text;
        var parts = text.split(':');
        var q = QUALITY_LABEL[parts[0]];
        var size = SIZE_LABEL[parseInt(parts[1], 10)];
        return q && size ? q + size : text;
    }

    function choicesFor(level) {
        return specsFor(level).map(function (spec) {
            var token = level <= 1 ? spec.id : (spec.quality + ':' + spec.size);
            return { id: token, label: labelOf(token) };
        });
    }

    function pickInt(rng, count) {
        return Math.min(count - 1, Math.floor(rng() * count));
    }

    function buildQuestion(level, clef, rng, previousKey) {
        var random = rng || Math.random;
        var safeLevel = level === 2 ? 2 : 1;
        var safeClef = clef === 'bass' ? 'bass' : 'treble';
        var specs = specsFor(safeLevel);
        var order = specs.map(function (_, index) { return index; });
        for (var i = order.length - 1; i > 0; i--) {
            var j = pickInt(random, i + 1);
            var swap = order[i];
            order[i] = order[j];
            order[j] = swap;
        }
        var chosen = null;
        var spec = null;
        for (var n = 0; n < order.length && !chosen; n++) {
            spec = specs[order[n]];
            var bag = spellings(safeClef, spec);
            if (!bag.length) continue;
            var pool = bag.filter(function (item) {
                return previousKey !== safeClef + ':' + item.low.diatonic + '-' + item.high.diatonic;
            });
            if (!pool.length) pool = bag;
            chosen = pool[pickInt(random, pool.length)];
        }
        if (!chosen) throw new Error('no interval in range');
        var info = { size: chosen.size, quality: chosen.quality };
        return {
            level: safeLevel,
            clef: safeClef,
            low: chosen.low,
            high: chosen.high,
            size: chosen.size,
            quality: chosen.quality,
            semitones: chosen.semitones,
            label: safeLevel <= 1 ? SIZE_LABEL[chosen.size] : (QUALITY_LABEL[chosen.quality] + SIZE_LABEL[chosen.size]),
            correct: tokenOf(safeLevel, info),
            choices: choicesFor(safeLevel),
            key: safeClef + ':' + chosen.low.diatonic + '-' + chosen.high.diatonic
        };
    }

    function numAttr(value) {
        return (Math.round(value * 10) / 10).toString();
    }

    function staffStep(clef, note) {
        return clef === 'bass' ? note.diatonic + 6 : note.diatonic - 6;
    }

    function staffMarkup(question) {
        var line = 18;
        var midY = 128;
        var left = 28;
        var right = 492;
        function yOf(step) { return midY - step * (line / 2); }
        var parts = ['<svg class="staff-interval-svg" viewBox="0 0 520 240" role="img">'];
        parts.push('<rect x="0" y="0" width="520" height="240" rx="18" fill="#FFF8EE"/>');
        for (var s = -4; s <= 4; s += 2) {
            var y = yOf(s);
            parts.push('<line x1="' + left + '" y1="' + y + '" x2="' + right + '" y2="' + y + '" stroke="#1E1E2F" stroke-width="1.6"/>');
        }
        if (question.clef === 'bass') {
            var fY = yOf(2);
            var scale = line / 18;
            parts.push('<g transform="translate(22 ' + numAttr(fY) + ') scale(' + numAttr(scale) + ')">');
            parts.push('<path fill="none" stroke="#1E1E2F" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" d="M34-40C12-38 2-22 8-6c5 14 20 24 34 16 9-5 13-16 8-24-4-7-13-9-18-4-6 6-2 15 7 16"/>');
            parts.push('<circle cx="58" cy="-9" r="3.8" fill="#1E1E2F"/>');
            parts.push('<circle cx="58" cy="9" r="3.8" fill="#1E1E2F"/>');
            parts.push('</g>');
        } else {
            var imgH = line * 7.6;
            var gY = yOf(-2);
            var top = gY - imgH * 0.623;
            var glyphScale = imgH / 40.768;
            parts.push('<g transform="translate(34 ' + numAttr(top) + ') scale(' + numAttr(glyphScale) + ')"><path fill="#1E1E2F" d="' + TREBLE_PATH + '"/></g>');
        }
        [question.low, question.high].forEach(function (note, index) {
            var step = staffStep(question.clef, note);
            var nx = index === 0 ? 210 : 360;
            var ny = yOf(step);
            var ledgerFrom = step >= 6 ? 6 : (step <= -6 ? -6 : 0);
            if (ledgerFrom) {
                var dir = step >= 6 ? 2 : -2;
                for (var led = ledgerFrom; dir > 0 ? led <= step : led >= step; led += dir) {
                    var ly = yOf(led);
                    parts.push('<line x1="' + (nx - 22) + '" y1="' + ly + '" x2="' + (nx + 22) + '" y2="' + ly + '" stroke="#1E1E2F" stroke-width="1.6"/>');
                }
            }
            parts.push('<ellipse cx="' + nx + '" cy="' + numAttr(ny) + '" rx="13" ry="9" fill="#FFF8EE" stroke="#1E1E2F" stroke-width="2.2" transform="rotate(-18 ' + nx + ' ' + numAttr(ny) + ')"/>');
        });
        parts.push('</svg>');
        return parts.join('');
    }

    function createRun(mode) {
        return {
            mode: mode === 'challenge' ? 'challenge' : 'practice',
            score: 0,
            combo: 0,
            maxCombo: 0,
            correct: 0,
            wrong: 0,
            asked: 0
        };
    }

    function scoreAnswer(run, isCorrect) {
        run.asked += 1;
        if (!isCorrect) {
            run.combo = 0;
            run.wrong += 1;
            return 0;
        }
        run.correct += 1;
        run.combo += 1;
        if (run.combo > run.maxCombo) run.maxCombo = run.combo;
        if (run.mode !== 'challenge') return 0;
        var points = 10 + run.combo;
        run.score += points;
        return points;
    }

    function accuracyOf(run) {
        if (!run || !run.asked) return 0;
        return Math.round((run.correct / run.asked) * 100);
    }

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function blockedName(name) {
        var text = String(name || '').trim();
        if (!text) return true;
        if (text === '訪客' || text === '測試人員' || text === '__guest__' || text === '__other__') return true;
        if (text.indexOf('訪客') === 0 || text.indexOf('測試') === 0) return true;
        return false;
    }

    function mount(doc) {
        if (!doc || !doc.body || doc.body.dataset.staffIntervalMounted) return;
        var setup = doc.getElementById('staffIntervalSetup');
        var play = doc.getElementById('staffIntervalPlay');
        var result = doc.getElementById('staffIntervalResult');
        if (!setup || !play || !result) return;
        doc.body.dataset.staffIntervalMounted = '1';

        var mode = 'practice';
        var level = 1;
        var clef = 'treble';
        var run = createRun('practice');
        var question = null;
        var previousKey = '';
        var running = false;
        var settled = false;
        var lockAnswer = false;
        var reviewing = false;
        var timer = 0;
        var endsAt = 0;
        var pending = 0;

        function go(screenId) {
            root.dispatchEvent(new CustomEvent('staff-interval-navigate', { detail: { screen: screenId } }));
        }

        function show(which) {
            setup.hidden = which !== 'setup';
            play.hidden = which !== 'play';
            result.hidden = which !== 'result';
        }

        function player() {
            if (root.WebGoogleAuth && root.WebGoogleAuth.tester) return null;
            if (doc.body.classList.contains('app-shell')) {
                var social = root.MusicAppAuth && root.MusicAppAuth.user;
                var name = (social && social.displayName) || '';
                try { if (!name) name = root.localStorage.getItem('appPlayerName') || ''; } catch (err) {}
                if (blockedName(name)) return null;
                return { name: name, grade: '0', class: 'App', id: '' };
            }
            var nameEl = doc.getElementById('hubName');
            if (!nameEl || !nameEl.value) return null;
            var raw = nameEl.value;
            var who = raw;
            if (raw === '__guest__') who = '訪客';
            if (raw === '__other__') {
                var custom = doc.getElementById('hubCustomNameInput');
                who = custom ? custom.value.trim() : '';
            }
            if (blockedName(who)) return null;
            var Store = root.ProfileStore;
            var person = {
                name: who,
                grade: (doc.getElementById('hubGrade') || {}).value || '',
                class: (doc.getElementById('hubClass') || {}).value || '',
                id: (doc.getElementById('hubSeat') || {}).value || ''
            };
            if (Store && typeof Store.isGuest === 'function' && Store.isGuest(person)) return null;
            return person;
        }

        function paintChoices() {
            var host = doc.getElementById('staffIntervalOptions');
            host.innerHTML = question.choices.map(function (choice) {
                return '<button type="button" class="staff-interval-opt" data-choice="' + esc(choice.id) + '">' + esc(choice.label) + '</button>';
            }).join('');
        }

        function paintStaff() {
            var host = doc.getElementById('staffIntervalStaff');
            var clefName = question.clef === 'bass' ? '低音譜號' : '高音譜號';
            host.classList.remove('is-correct', 'is-wrong');
            host.innerHTML = staffMarkup(question);
            host.setAttribute('aria-label', clefName + '，兩個音，低音在左');
            host.dataset.question = question.key;
        }

        function paintHud() {
            var score = doc.getElementById('staffIntervalScore');
            var meta = doc.getElementById('staffIntervalMeta');
            if (run.mode === 'challenge') {
                var left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
                score.textContent = String(run.score);
                meta.textContent = '連擊 ' + run.combo + ' · 剩餘 ' + left + ' 秒';
            } else {
                score.textContent = run.correct + ' / ' + run.asked;
                meta.textContent = '練習 · 答對 ' + run.correct + ' · 答錯 ' + run.wrong;
            }
        }

        function clearFeedback() {
            var feedback = doc.getElementById('staffIntervalFeedback');
            feedback.textContent = '';
            feedback.classList.remove('is-correct', 'is-wrong');
            var next = doc.getElementById('staffIntervalNext');
            next.hidden = true;
            var staff = doc.getElementById('staffIntervalStaff');
            staff.classList.remove('is-correct', 'is-wrong');
            staff.innerHTML = '';
            staff.removeAttribute('data-question');
            doc.getElementById('staffIntervalOptions').innerHTML = '';
        }

        function ask() {
            if (!running) return;
            if (run.mode === 'challenge' && Date.now() >= endsAt) {
                finish();
                return;
            }
            reviewing = false;
            lockAnswer = false;
            clearFeedback();
            question = buildQuestion(level, clef, Math.random, previousKey);
            previousKey = question.key;
            var prompt = doc.getElementById('staffIntervalPrompt');
            prompt.textContent = level <= 1 ? '這兩個音相距幾度？' : '這是哪一種音程？';
            paintStaff();
            paintChoices();
            paintHud();
        }

        function readBoard() {
            try {
                var parsed = JSON.parse(root.localStorage.getItem('musicGameRanks_' + GAME_KEY) || '[]');
                return Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                return [];
            }
        }

        function commitBoard(row) {
            var rows = readBoard();
            var idx = -1;
            rows.forEach(function (item, index) {
                if (!item) return;
                if (String(item.name || '') === row.name && String(item.class || '') === String(row.class || '') && String(item.id || '') === String(row.id || '')) idx = index;
            });
            if (idx >= 0) {
                if ((parseInt(row.score, 10) || 0) >= (parseInt(rows[idx].score, 10) || 0)) rows[idx] = row;
            } else rows.push(row);
            rows.sort(function (a, b) { return (parseInt(b.score, 10) || 0) - (parseInt(a.score, 10) || 0); });
            var next = rows.slice(0, 50);
            root.localStorage.setItem('musicGameRanks_' + GAME_KEY, JSON.stringify(next));
            return next;
        }

        function resultDetail() {
            if (!run || run.mode !== 'challenge' || run.asked < 1) return null;
            return {
                mode: 'challenge',
                gameKey: GAME_KEY,
                score: run.score,
                accuracy: accuracyOf(run),
                maxCombo: run.maxCombo,
                clef: clef,
                level: level,
                uploadsScore: META.uploadsScore,
                countsTowardRadar: META.countsTowardRadar,
                domain: META.domain,
                tags: META.tags.slice(),
                axis: META.axis
            };
        }

        function settle() {
            if (settled) return null;
            settled = true;
            running = false;
            lockAnswer = true;
            reviewing = false;
            if (timer) clearInterval(timer);
            timer = 0;
            if (pending) clearTimeout(pending);
            pending = 0;
            var detail = resultDetail();
            var who = player();
            if (!detail || !who) return { detail: detail, saved: false, rows: [] };
            var before = 0;
            readBoard().forEach(function (item) {
                if (item && item.name === who.name) before = Math.max(before, parseInt(item.score, 10) || 0);
            });
            var row = {
                name: who.name,
                class: who.class || '',
                id: who.id || '',
                grade: who.grade,
                score: detail.score,
                accuracy: detail.accuracy,
                max_combo: detail.maxCombo,
                game: GAME_KEY,
                difficulty: 'challenge',
                clef: clef,
                level: level
            };
            var rows = commitBoard(row);
            root.dispatchEvent(new CustomEvent('staff-interval-result', { detail: detail }));
            return { detail: detail, saved: true, kept: detail.score >= before, best: Math.max(before, detail.score), rows: rows };
        }

        function renderBoard(rows, who) {
            var host = doc.getElementById('staffIntervalBoard');
            var list = (rows || []).slice().sort(function (a, b) {
                return (parseInt(b.score, 10) || 0) - (parseInt(a.score, 10) || 0);
            }).slice(0, 5);
            if (!list.length) {
                host.innerHTML = '';
                return;
            }
            host.innerHTML = '<h3 class="staff-interval-board-title">這部裝置的挑戰榜</h3>' + list.map(function (item, index) {
                var mine = who && String(item.name || '') === String(who.name || '');
                return '<div class="staff-interval-board-row' + (mine ? ' is-self' : '') + '"><span>' + (index + 1) + '. ' + esc(item.name) + '</span><b>' + esc(item.score) + '</b></div>';
            }).join('');
        }

        function finish() {
            if (settled) return;
            var outcome = settle();
            var title = doc.getElementById('staffIntervalResultTitle');
            var body = doc.getElementById('staffIntervalResultBody');
            var who = player();
            if (run.mode !== 'challenge') {
                title.textContent = '練習完成';
                body.textContent = '答對 ' + run.correct + ' / ' + run.asked + '（' + accuracyOf(run) + '%）。練習分數不會記入排行榜。';
                doc.getElementById('staffIntervalBoard').innerHTML = '';
            } else if (!run.asked) {
                title.textContent = '挑戰完成';
                body.textContent = '未作答，沒有寫入分數。';
                doc.getElementById('staffIntervalBoard').innerHTML = '';
            } else if (!outcome || !outcome.saved) {
                title.textContent = '挑戰完成';
                var tester = root.WebGoogleAuth && root.WebGoogleAuth.tester;
                body.textContent = tester
                    ? ('這次 ' + run.score + ' 分（準確率 ' + accuracyOf(run) + '%）。測試人員的分數不會記入排行榜。')
                    : ('這次 ' + run.score + ' 分（準確率 ' + accuracyOf(run) + '%）。未選擇姓名，分數不會記入排行榜。');
                doc.getElementById('staffIntervalBoard').innerHTML = '';
            } else if (outcome.kept) {
                title.textContent = '挑戰完成';
                body.textContent = '這次 ' + run.score + ' 分（準確率 ' + outcome.detail.accuracy + '%）。已記在這部裝置的挑戰榜。';
                renderBoard(outcome.rows, who);
            } else {
                title.textContent = '挑戰完成';
                body.textContent = '這次 ' + run.score + ' 分（準確率 ' + outcome.detail.accuracy + '%）。這部裝置上記下的最高分仍是 ' + outcome.best + ' 分。';
                renderBoard(outcome.rows, who);
            }
            show('result');
        }

        function stopRun() {
            running = false;
            if (!settled && run && run.mode === 'challenge' && run.asked) settle();
            else {
                settled = true;
                if (timer) clearInterval(timer);
                timer = 0;
                if (pending) clearTimeout(pending);
                pending = 0;
            }
        }

        function start() {
            run = createRun(mode);
            question = null;
            previousKey = '';
            running = true;
            settled = false;
            reviewing = false;
            lockAnswer = false;
            endsAt = mode === 'challenge' ? Date.now() + CHALLENGE_MS : 0;
            if (timer) clearInterval(timer);
            if (mode === 'challenge') {
                timer = setInterval(function () {
                    paintHud();
                    if (Date.now() >= endsAt) finish();
                }, 200);
            }
            doc.getElementById('staffIntervalEnd').textContent = mode === 'challenge' ? '結束挑戰' : '結束練習';
            show('play');
            ask();
        }

        function choose(id) {
            if (!running || lockAnswer || reviewing || !question) return;
            lockAnswer = true;
            var correct = id === question.correct;
            var gained = scoreAnswer(run, correct);
            var feedback = doc.getElementById('staffIntervalFeedback');
            var staff = doc.getElementById('staffIntervalStaff');
            feedback.textContent = correct
                ? ('答對了，' + question.label + (gained ? '　+' + gained : ''))
                : ('未答對。正確是' + question.label);
            feedback.classList.toggle('is-correct', correct);
            feedback.classList.toggle('is-wrong', !correct);
            staff.classList.toggle('is-correct', correct);
            staff.classList.toggle('is-wrong', !correct);
            var buttons = doc.querySelectorAll('#staffIntervalOptions .staff-interval-opt');
            buttons.forEach(function (button) {
                button.disabled = true;
                if (button.getAttribute('data-choice') === question.correct) button.classList.add('is-correct');
                else if (button.getAttribute('data-choice') === id) button.classList.add('is-wrong');
            });
            paintHud();
            if (run.mode === 'challenge') {
                pending = setTimeout(function () {
                    pending = 0;
                    if (!running) return;
                    ask();
                }, ADVANCE_MS);
                return;
            }
            reviewing = true;
            doc.getElementById('staffIntervalNext').hidden = false;
        }

        function bindChoice(groupId, attr, apply) {
            doc.getElementById(groupId).addEventListener('click', function (event) {
                var button = event.target.closest('[' + attr + ']');
                if (!button) return;
                apply(button);
                doc.querySelectorAll('#' + groupId + ' [' + attr + ']').forEach(function (item) {
                    var on = item === button;
                    item.classList.toggle('is-on', on);
                    item.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
            });
        }

        bindChoice('staffIntervalModes', 'data-mode', function (button) {
            mode = button.getAttribute('data-mode') === 'challenge' ? 'challenge' : 'practice';
        });
        bindChoice('staffIntervalClefs', 'data-clef', function (button) {
            clef = button.getAttribute('data-clef') === 'bass' ? 'bass' : 'treble';
        });
        bindChoice('staffIntervalLevels', 'data-level', function (button) {
            level = parseInt(button.getAttribute('data-level'), 10) === 2 ? 2 : 1;
            doc.getElementById('staffIntervalHint').textContent = button.getAttribute('data-hint') || '';
        });
        doc.getElementById('staffIntervalStart').addEventListener('click', start);
        doc.getElementById('staffIntervalOptions').addEventListener('click', function (event) {
            var button = event.target.closest('[data-choice]');
            if (!button || button.disabled) return;
            choose(button.getAttribute('data-choice'));
        });
        doc.getElementById('staffIntervalNext').addEventListener('click', function () {
            if (!reviewing) return;
            reviewing = false;
            ask();
        });
        doc.getElementById('staffIntervalEnd').addEventListener('click', function () { finish(); });
        doc.getElementById('staffIntervalAgain').addEventListener('click', function () { show('setup'); });
        doc.getElementById('staffIntervalBack').addEventListener('click', function () {
            stopRun();
            show('setup');
            go('screen-hub');
        });
        doc.getElementById('staffIntervalResultBack').addEventListener('click', function () {
            show('setup');
            go('screen-hub');
        });
        root.addEventListener('staff-interval-open', function () {
            stopRun();
            show('setup');
        });
    }

    return {
        META: META,
        GAME_KEY: GAME_KEY,
        SIZE_LABEL: SIZE_LABEL,
        fromDiatonic: fromDiatonic,
        classify: classify,
        spellings: spellings,
        buildQuestion: buildQuestion,
        staffMarkup: staffMarkup,
        staffStep: staffStep,
        createRun: createRun,
        scoreAnswer: scoreAnswer,
        accuracyOf: accuracyOf,
        labelOf: labelOf,
        mount: mount
    };
});
