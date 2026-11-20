/**
 * 節奏聽寫. A count-in, then one bar. The student picks the matching notation.
 */
(function (root, factory) {
    var api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.AuralRhythm = api;
    if (root && root.document) {
        var boot = function () { api.mount(root.document); };
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
        else boot();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    var GAME_KEY = 'aural-rhythm';
    var BEAT = 0.5;
    var CHALLENGE_MS = 60000;

    function cell(beats, rest) { return { beats: beats, rest: !!rest }; }
    function bar() {
        var cells = Array.prototype.slice.call(arguments);
        var total = cells.reduce(function (sum, item) { return sum + item.beats; }, 0);
        return { cells: cells, beats: total };
    }

    var BARS = [
        { id: 'qqqq', level: 1, bar: bar(cell(1), cell(1), cell(1), cell(1)) },
        { id: 'qqeeq', level: 1, bar: bar(cell(1), cell(1), cell(0.5), cell(0.5), cell(1)) },
        { id: 'eeqqq', level: 1, bar: bar(cell(0.5), cell(0.5), cell(1), cell(1), cell(1)) },
        { id: 'qeeqq', level: 1, bar: bar(cell(1), cell(0.5), cell(0.5), cell(1), cell(1)) },
        { id: 'eeeeqq', level: 1, bar: bar(cell(0.5), cell(0.5), cell(0.5), cell(0.5), cell(1), cell(1)) },
        { id: 'qeeeeq', level: 1, bar: bar(cell(1), cell(0.5), cell(0.5), cell(0.5), cell(0.5), cell(1)) },
        { id: 'hqq', level: 2, bar: bar(cell(2), cell(1), cell(1)) },
        { id: 'qqh', level: 2, bar: bar(cell(1), cell(1), cell(2)) },
        { id: 'qhq', level: 2, bar: bar(cell(1), cell(2), cell(1)) },
        { id: 'hh', level: 2, bar: bar(cell(2), cell(2)) },
        { id: 'rqqq', level: 2, bar: bar(cell(1, true), cell(1), cell(1), cell(1)) },
        { id: 'qrqq', level: 2, bar: bar(cell(1), cell(1, true), cell(1), cell(1)) },
        { id: 'qqqr', level: 2, bar: bar(cell(1), cell(1), cell(1), cell(1, true)) },
        { id: 'dqeqq', level: 3, bar: bar(cell(1.5), cell(0.5), cell(1), cell(1)) },
        { id: 'qdqeq', level: 3, bar: bar(cell(1), cell(1.5), cell(0.5), cell(1)) },
        { id: 'eqeqq', level: 3, bar: bar(cell(0.5), cell(1), cell(0.5), cell(1), cell(1)) },
        { id: 'eeeeeeee', level: 3, bar: bar(cell(0.5), cell(0.5), cell(0.5), cell(0.5), cell(0.5), cell(0.5), cell(0.5), cell(0.5)) },
        { id: 'qeeqee', level: 3, bar: bar(cell(1), cell(0.5), cell(0.5), cell(1), cell(0.5), cell(0.5)) }
    ];

    function poolForLevel(level) {
        var cap = level >= 3 ? 3 : (level === 2 ? 2 : 1);
        return BARS.filter(function (item) { return item.level <= cap; });
    }

    function pickInt(rng, count) {
        return Math.min(count - 1, Math.floor(rng() * count));
    }

    function shuffle(list, rng) {
        var copy = list.slice();
        for (var i = copy.length - 1; i > 0; i--) {
            var j = pickInt(rng, i + 1);
            var swap = copy[i];
            copy[i] = copy[j];
            copy[j] = swap;
        }
        return copy;
    }

    function rhythmPlan(pattern, beat) {
        var step = beat || BEAT;
        var events = [];
        var i;
        for (i = 0; i < 4; i++) {
            events.push({ tick: true, strong: i === 0, countIn: true, at: i * step });
        }
        var at = 4 * step + 0.2;
        pattern.cells.forEach(function (item) {
            if (!item.rest) events.push({ tick: true, rhythm: true, at: Math.round(at * 1000) / 1000 });
            at += item.beats * step;
        });
        return events;
    }

    function syllable(cells) {
        var parts = [];
        var i = 0;
        while (i < cells.length) {
            var item = cells[i];
            var next = cells[i + 1];
            if (item.rest && item.beats === 1) { parts.push('休'); i++; continue; }
            if (item.beats === 0.5 && next && next.beats === 0.5 && !next.rest) { parts.push('ti-ti'); i += 2; continue; }
            if (item.beats === 1.5 && next && next.beats === 0.5 && !next.rest) { parts.push('ta-i ti'); i += 2; continue; }
            if (item.beats === 2) parts.push('ta-a');
            else if (item.beats === 0.5) parts.push('ti');
            else parts.push('ta');
            i++;
        }
        return parts.join(' ');
    }

    function noteHead(x, filled) {
        var body = '<ellipse cx="' + (x + 8) + '" cy="46" rx="7" ry="5" transform="rotate(-18 ' + (x + 8) + ' 46)" fill="' + (filled ? '#164e63' : 'none') + '" stroke="#164e63" stroke-width="1.6"/>';
        return body + '<rect x="' + (x + 14) + '" y="16" width="1.8" height="30" fill="#164e63"/>';
    }

    function eighthFlag(x) {
        return '<path d="M' + (x + 15) + ' 17 C' + (x + 23) + ' 21,' + (x + 24) + ' 28,' + (x + 19) + ' 34" fill="none" stroke="#164e63" stroke-width="2" stroke-linecap="round"/>';
    }

    function notationSvg(cells) {
        var x = 6;
        var parts = ['<line x1="4" y1="58" x2="999" y2="58" stroke="#99f6e4" stroke-width="2"/>'];
        var i = 0;
        while (i < cells.length) {
            var item = cells[i];
            var next = cells[i + 1];
            if (item.rest) {
                parts.push('<text x="' + x + '" y="40" font-size="28" fill="#164e63">𝄽</text>');
                x += 34;
                i++;
                continue;
            }
            if (item.beats === 0.5 && next && !next.rest && next.beats === 0.5) {
                parts.push(noteHead(x, true) + noteHead(x + 22, true));
                parts.push('<rect x="' + (x + 15) + '" y="16" width="24" height="3.2" fill="#164e63"/>');
                x += 48;
                i += 2;
                continue;
            }
            if (item.beats === 1.5 && next && !next.rest && next.beats === 0.5) {
                parts.push(noteHead(x, true));
                parts.push('<circle cx="' + (x + 22) + '" cy="50" r="2.3" fill="#164e63"/>');
                parts.push(noteHead(x + 30, true) + eighthFlag(x + 30));
                x += 62;
                i += 2;
                continue;
            }
            parts.push(noteHead(x, item.beats < 2));
            if (item.beats === 1.5) parts.push('<circle cx="' + (x + 22) + '" cy="50" r="2.3" fill="#164e63"/>');
            if (item.beats === 0.5) parts.push(eighthFlag(x));
            x += item.beats >= 2 ? 36 : 30;
            i++;
        }
        return '<svg class="aural-rhythm-svg" viewBox="0 0 ' + (x + 8) + ' 64" aria-hidden="true">' + parts.join('') + '</svg>';
    }

    function buildQuestion(level, rng) {
        var random = rng || Math.random;
        var pool = poolForLevel(level);
        var correct = pool[pickInt(random, pool.length)];
        var bag = pool.filter(function (item) { return item.id !== correct.id; });
        var choices = shuffle([correct].concat(shuffle(bag, random).slice(0, 3)), random);
        return {
            level: level >= 3 ? 3 : (level === 2 ? 2 : 1),
            id: correct.id,
            cells: correct.bar.cells,
            syllable: syllable(correct.bar.cells),
            choices: choices.map(function (item) {
                return { id: item.id, cells: item.bar.cells, syllable: syllable(item.bar.cells) };
            })
        };
    }

    function createRun(mode) {
        return {
            mode: mode === 'challenge' ? 'challenge' : 'practice',
            score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0, asked: 0
        };
    }

    function scoreAnswer(run, isCorrect) {
        run.asked += 1;
        if (!isCorrect) { run.combo = 0; run.wrong += 1; return 0; }
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

    function resultDetail(run) {
        if (!run || run.mode !== 'challenge' || run.asked < 1) return null;
        return { mode: 'challenge', gameKey: GAME_KEY, score: run.score, accuracy: accuracyOf(run), maxCombo: run.maxCombo };
    }

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function mount(doc) {
        if (!doc || doc.body.dataset.auralRhythmMounted) return;
        var setup = doc.getElementById('auralRhythmSetup');
        var play = doc.getElementById('auralRhythmPlay');
        var result = doc.getElementById('auralRhythmResult');
        var open = doc.getElementById('auralOpenRhythm');
        if (!setup || !play || !result || !open) return;
        doc.body.dataset.auralRhythmMounted = '1';

        var mode = 'practice';
        var level = 1;
        var run = createRun('practice');
        var question = null;
        var running = false;
        var settled = false;
        var lockAnswer = false;
        var timer = 0;
        var endsAt = 0;
        var pending = 0;
        var cues = [];

        function go(screenId) {
            root.dispatchEvent(new CustomEvent('aural-navigate', { detail: { screen: screenId } }));
        }
        function show(which) {
            setup.hidden = which !== 'setup';
            play.hidden = which !== 'play';
            result.hidden = which !== 'result';
        }
        function clearCues() {
            cues.forEach(function (id) { clearTimeout(id); });
            cues = [];
        }
        function player() {
            if (doc.body.classList.contains('app-shell')) {
                var social = root.MusicAppAuth && root.MusicAppAuth.user;
                var name = (social && social.displayName) || '';
                try { if (!name) name = root.localStorage.getItem('appPlayerName') || ''; } catch (err) {}
                if (!name) return null;
                return { name: name, grade: '0', class: 'App', id: '' };
            }
            var nameEl = doc.getElementById('hubName');
            if (!nameEl || !nameEl.value) return null;
            var raw = nameEl.value;
            var name = raw;
            if (raw === '__guest__') name = '訪客';
            if (raw === '__other__') {
                var custom = doc.getElementById('hubCustomNameInput');
                name = custom ? custom.value.trim() : '';
            }
            if (!name) return null;
            return {
                name: name,
                grade: (doc.getElementById('hubGrade') || {}).value || '',
                class: (doc.getElementById('hubClass') || {}).value || '',
                id: (doc.getElementById('hubSeat') || {}).value || ''
            };
        }
        function paintHud() {
            var score = doc.getElementById('auralRhythmScore');
            var meta = doc.getElementById('auralRhythmMeta');
            if (run.mode === 'challenge') {
                var left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
                score.textContent = String(run.score);
                meta.textContent = '連擊 ' + run.combo + ' · 剩餘 ' + left + ' 秒';
            } else {
                score.textContent = run.correct + ' / ' + run.asked;
                meta.textContent = '練習 · 答對 ' + run.correct + ' · 答錯 ' + run.wrong;
            }
        }
        function activeBeatStep() {
            var custom = root.ExerciseCustomizer && root.ExerciseCustomizer.get('aural-rhythm');
            return custom && custom.bpm ? (60 / custom.bpm) : BEAT;
        }
        function customPool(custom) {
            var filtered = BARS.filter(function (item) {
                var hasHalf = item.bar.cells.some(function (c) { return c.beats >= 2; });
                var hasRest = item.bar.cells.some(function (c) { return c.rest; });
                var hasSync = item.level === 3;
                if (hasHalf && !custom.includeHalf) return false;
                if (hasRest && !custom.includeRest) return false;
                if (hasSync && !custom.includeSync) return false;
                return true;
            });
            return filtered.length >= 4 ? filtered : poolForLevel(1);
        }
        function playCurrent() {
            if (!question) return;
            clearCues();
            var step = activeBeatStep();
            var plan = rhythmPlan({ cells: question.cells }, step);
            var cue = doc.getElementById('auralRhythmCue');
            cue.textContent = '預備 1';
            plan.forEach(function (event) {
                if (!event.countIn) return;
                var n = Math.round(event.at / step) + 1;
                cues.push(setTimeout(function () { if (running) cue.textContent = '預備 ' + n; }, event.at * 1000));
            });
            cues.push(setTimeout(function () { if (running) cue.textContent = '聽節奏'; }, (4 * step + 0.2) * 1000));
            try {
                if (root.AuralAudio) {
                    root.AuralAudio.unlock();
                    root.AuralAudio.play(plan);
                }
            } catch (err) {}
        }
        function ask() {
            if (!running) return;
            if (run.mode === 'challenge' && Date.now() >= endsAt) { finish(); return; }
            var custom = root.ExerciseCustomizer && root.ExerciseCustomizer.get('aural-rhythm');
            var lastId = question ? question.id : '';
            function makeQ() {
                if (!custom) return buildQuestion(level, Math.random);
                var pool = customPool(custom);
                var correct = pool[pickInt(Math.random, pool.length)];
                var bag = pool.filter(function (item) { return item.id !== correct.id; });
                var choices = shuffle([correct].concat(shuffle(bag, Math.random).slice(0, 3)), Math.random);
                return {
                    level: 3, id: correct.id, cells: correct.bar.cells, syllable: syllable(correct.bar.cells),
                    choices: choices.map(function (item) { return { id: item.id, cells: item.bar.cells, syllable: syllable(item.bar.cells) }; })
                };
            }
            var next = makeQ();
            for (var tries = 0; tries < 10 && next.id === lastId; tries++) next = makeQ();
            question = next;
            lockAnswer = false;
            var host = doc.getElementById('auralRhythmOptions');
            host.innerHTML = question.choices.map(function (choice) {
                return '<button type="button" class="aural-rhythm-opt" data-choice="' + esc(choice.id) + '">'
                    + notationSvg(choice.cells)
                    + '<span class="aural-rhythm-syl">' + esc(choice.syllable) + '</span></button>';
            }).join('');
            doc.getElementById('auralRhythmFeedback').textContent = '';
            paintHud();
            playCurrent();
        }
        function settle() {
            if (settled) return null;
            settled = true;
            running = false;
            lockAnswer = true;
            if (timer) clearInterval(timer);
            timer = 0;
            if (pending) clearTimeout(pending);
            pending = 0;
            clearCues();
            if (root.AuralAudio) root.AuralAudio.stop();
            var detail = resultDetail(run);
            var who = player();
            var Score = root.AuralScore;
            if (!detail || !Score || !Score.canSavePlayer(who)) return { detail: detail, saved: false };
            var row = {
                name: who.name, class: who.class || '', id: who.id || '', grade: who.grade,
                score: detail.score, accuracy: detail.accuracy, max_combo: detail.maxCombo, game: GAME_KEY
            };
            var before = Score.previousBest(Score.readBoard(root.localStorage, GAME_KEY), row);
            var rows = Score.commitBoard(root.localStorage, GAME_KEY, row);
            root.dispatchEvent(new CustomEvent('aural-result', { detail: detail }));
            return { detail: detail, saved: true, kept: detail.score > before, best: Math.max(before, detail.score), rows: rows };
        }
        function renderBoard(rows, who) {
            var host = doc.getElementById('auralRhythmBoard');
            var list = (rows || []).slice().sort(function (a, b) { return (parseInt(b.score, 10) || 0) - (parseInt(a.score, 10) || 0); }).slice(0, 5);
            if (!list.length) { host.innerHTML = ''; return; }
            host.innerHTML = '<h3 class="aural-board-title">本機挑戰榜</h3>' + list.map(function (item, index) {
                var mine = who && String(item.name || '') === String(who.name || '');
                return '<div class="aural-board-row' + (mine ? ' is-self' : '') + '"><span>' + (index + 1) + '. ' + esc(item.name) + '</span><b>' + esc(item.score) + '</b></div>';
            }).join('');
        }
        function finish() {
            if (settled) return;
            var outcome = settle();
            var title = doc.getElementById('auralRhythmResultTitle');
            var body = doc.getElementById('auralRhythmResultBody');
            var who = player();
            if (run.mode !== 'challenge') {
                title.textContent = '練習結束';
                body.textContent = '答對 ' + run.correct + ' / ' + run.asked + '（' + accuracyOf(run) + '%）。練習分不會入榜，亦不會改寫個人最佳。';
                doc.getElementById('auralRhythmBoard').innerHTML = '';
            } else if (!run.asked) {
                title.textContent = '挑戰結束';
                body.textContent = '未作答，沒有寫入分數。';
                doc.getElementById('auralRhythmBoard').innerHTML = '';
            } else if (!outcome || !outcome.saved) {
                title.textContent = '挑戰結束';
                body.textContent = '這次 ' + run.score + ' 分（準確率 ' + accuracyOf(run) + '%）。訪客或未選姓名的成績不會入榜。';
                doc.getElementById('auralRhythmBoard').innerHTML = '';
            } else if (outcome.kept) {
                title.textContent = '挑戰結束';
                body.textContent = '這次 ' + run.score + ' 分（準確率 ' + outcome.detail.accuracy + '%）。已寫入個人檔案的聽力分數。較低的舊分不會蓋過這次。';
                renderBoard(outcome.rows, who);
            } else if (!outcome.best) {
                title.textContent = '挑戰結束';
                body.textContent = '這次 0 分（準確率 ' + outcome.detail.accuracy + '%）。未寫入更高的聽力分數。';
                renderBoard(outcome.rows, who);
            } else {
                title.textContent = '挑戰結束';
                body.textContent = '這次 ' + run.score + ' 分（準確率 ' + outcome.detail.accuracy + '%）。個人最佳仍是 ' + outcome.best + ' 分，沒有被較低分蓋過。';
                renderBoard(outcome.rows, who);
            }
            show('result');
        }
        function start() {
            if (root.AuralAudio) root.AuralAudio.unlock();
            run = createRun(mode);
            running = true;
            settled = false;
            endsAt = mode === 'challenge' ? Date.now() + CHALLENGE_MS : 0;
            if (timer) clearInterval(timer);
            if (mode === 'challenge') {
                timer = setInterval(function () {
                    paintHud();
                    if (Date.now() >= endsAt) finish();
                }, 200);
            }
            doc.getElementById('auralRhythmEnd').textContent = mode === 'challenge' ? '結束挑戰' : '結束練習';
            show('play');
            ask();
        }
        function choose(id) {
            if (!running || lockAnswer || !question) return;
            lockAnswer = true;
            var correct = id === question.id;
            var gained = scoreAnswer(run, correct);
            doc.getElementById('auralRhythmFeedback').textContent = correct
                ? ('正確，' + question.syllable + (gained ? '　+' + gained : ''))
                : ('未中。正確是 ' + question.syllable);
            doc.querySelectorAll('#auralRhythmOptions .aural-rhythm-opt').forEach(function (button) {
                button.disabled = true;
                if (button.getAttribute('data-choice') === question.id) button.classList.add('is-correct');
                else if (button.getAttribute('data-choice') === id) button.classList.add('is-wrong');
            });
            paintHud();
            pending = setTimeout(function () {
                pending = 0;
                if (running) ask();
            }, 900);
        }

        open.addEventListener('click', function () { show('setup'); go('screen-aural-rhythm'); });
        doc.getElementById('auralRhythmBack').addEventListener('click', function () {
            if (running) settle();
            clearCues();
            if (root.AuralAudio) root.AuralAudio.stop();
            go('screen-aural');
        });
        doc.getElementById('auralRhythmModes').addEventListener('click', function (event) {
            var button = event.target.closest('[data-mode]');
            if (!button) return;
            mode = button.getAttribute('data-mode') === 'challenge' ? 'challenge' : 'practice';
            doc.querySelectorAll('#auralRhythmModes [data-mode]').forEach(function (item) {
                item.classList.toggle('is-on', item === button);
            });
        });
        doc.getElementById('auralRhythmLevels').addEventListener('click', function (event) {
            var button = event.target.closest('[data-level]');
            if (!button) return;
            level = parseInt(button.getAttribute('data-level'), 10) || 1;
            doc.querySelectorAll('#auralRhythmLevels [data-level]').forEach(function (item) {
                item.classList.toggle('is-on', item === button);
            });
            doc.getElementById('auralRhythmLevelHint').textContent = button.getAttribute('data-hint') || '';
        });
        doc.getElementById('auralRhythmStart').addEventListener('click', start);
        var rhCustomBtn = doc.getElementById('auralRhythmCustomBtn');
        if (rhCustomBtn) {
            rhCustomBtn.addEventListener('click', function () {
                if (root.ExerciseCustomizer) root.ExerciseCustomizer.openModal('aural-rhythm', function () { if (running) ask(); });
            });
        }
        doc.getElementById('auralRhythmReplay').addEventListener('click', function () {
            if (root.AuralAudio) root.AuralAudio.unlock();
            playCurrent();
        });
        doc.getElementById('auralRhythmOptions').addEventListener('click', function (event) {
            var button = event.target.closest('[data-choice]');
            if (!button) return;
            choose(button.getAttribute('data-choice'));
        });
        doc.getElementById('auralRhythmEnd').addEventListener('click', function () { finish(); });
        doc.getElementById('auralRhythmAgain').addEventListener('click', function () { show('setup'); });
    }

    return {
        GAME_KEY: GAME_KEY,
        BEAT: BEAT,
        BARS: BARS,
        poolForLevel: poolForLevel,
        rhythmPlan: rhythmPlan,
        syllable: syllable,
        notationSvg: notationSvg,
        buildQuestion: buildQuestion,
        createRun: createRun,
        scoreAnswer: scoreAnswer,
        resultDetail: resultDetail,
        mount: mount
    };
});
