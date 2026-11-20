/**
 * 音程聽辨. Level 1 asks for the size (2nd–8ve).
 * Levels 2 and 3 ask for major, minor, or perfect.
 */
(function (root, factory) {
    var api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.AuralInterval = api;
    if (root && root.document) {
        var boot = function () { api.mount(root.document); };
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
        else boot();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    var GAME_KEY = 'aural-interval';
    var CHALLENGE_MS = 60000;
    var INTERVALS = [
        { id: 'm2', semitones: 1, size: 2, quality: 'minor', label: '小二度', sizeLabel: '二度' },
        { id: 'M2', semitones: 2, size: 2, quality: 'major', label: '大二度', sizeLabel: '二度' },
        { id: 'm3', semitones: 3, size: 3, quality: 'minor', label: '小三度', sizeLabel: '三度' },
        { id: 'M3', semitones: 4, size: 3, quality: 'major', label: '大三度', sizeLabel: '三度' },
        { id: 'P4', semitones: 5, size: 4, quality: 'perfect', label: '純四度', sizeLabel: '四度' },
        { id: 'P5', semitones: 7, size: 5, quality: 'perfect', label: '純五度', sizeLabel: '五度' },
        { id: 'm6', semitones: 8, size: 6, quality: 'minor', label: '小六度', sizeLabel: '六度' },
        { id: 'M6', semitones: 9, size: 6, quality: 'major', label: '大六度', sizeLabel: '六度' },
        { id: 'm7', semitones: 10, size: 7, quality: 'minor', label: '小七度', sizeLabel: '七度' },
        { id: 'M7', semitones: 11, size: 7, quality: 'major', label: '大七度', sizeLabel: '七度' },
        { id: 'P8', semitones: 12, size: 8, quality: 'perfect', label: '純八度', sizeLabel: '八度' }
    ];
    var BY_ID = {};
    INTERVALS.forEach(function (item) { BY_ID[item.id] = item; });

    var LEVEL_POOL = {
        1: ['M2', 'M3', 'P4', 'P5', 'M6', 'M7', 'P8'],
        2: ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'P8'],
        3: ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8']
    };

    function poolForLevel(level) {
        var ids = LEVEL_POOL[level] || LEVEL_POOL[1];
        return ids.map(function (id) { return BY_ID[id]; });
    }

    function tokenOf(interval, level) {
        return level <= 1 ? 'size:' + interval.size : interval.id;
    }

    function labelOf(token) {
        if (String(token).indexOf('size:') === 0) {
            var size = parseInt(String(token).slice(5), 10);
            var found = INTERVALS.filter(function (item) { return item.size === size; })[0];
            return found ? found.sizeLabel : token;
        }
        return BY_ID[token] ? BY_ID[token].label : token;
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

    function buildQuestion(level, rng, harmonic) {
        var random = rng || Math.random;
        var safeLevel = level >= 3 ? 3 : (level === 2 ? 2 : 1);
        var pool = poolForLevel(safeLevel);
        var interval = pool[pickInt(random, pool.length)];
        var low = 60 + pickInt(random, 8);
        var correct = tokenOf(interval, safeLevel);
        var bag = [];
        pool.forEach(function (item) {
            var token = tokenOf(item, safeLevel);
            if (token !== correct && bag.indexOf(token) < 0) bag.push(token);
        });
        var picked = shuffle(bag, random).slice(0, 3);
        var choices = shuffle([correct].concat(picked), random).map(function (token) {
            return { id: token, label: labelOf(token) };
        });
        return {
            level: safeLevel,
            intervalId: interval.id,
            semitones: interval.semitones,
            label: safeLevel <= 1 ? interval.sizeLabel : interval.label,
            low: low,
            high: low + interval.semitones,
            midis: [low, low + interval.semitones],
            harmonic: !!harmonic,
            correct: correct,
            choices: choices
        };
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

    function resultDetail(run) {
        if (!run || run.mode !== 'challenge' || run.asked < 1) return null;
        return {
            mode: 'challenge',
            gameKey: GAME_KEY,
            score: run.score,
            accuracy: accuracyOf(run),
            maxCombo: run.maxCombo
        };
    }

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function mount(doc) {
        if (!doc || doc.body.dataset.auralIntervalMounted) return;
        var setup = doc.getElementById('auralIntervalSetup');
        var play = doc.getElementById('auralIntervalPlay');
        var result = doc.getElementById('auralIntervalResult');
        if (!setup || !play || !result) return;
        doc.body.dataset.auralIntervalMounted = '1';

        var mode = 'practice';
        var level = 1;
        var harmonic = false;
        var run = createRun('practice');
        var question = null;
        var running = false;
        var settled = false;
        var lockAnswer = false;
        var timer = 0;
        var endsAt = 0;
        var pending = 0;

        function go(screenId) {
            root.dispatchEvent(new CustomEvent('aural-navigate', { detail: { screen: screenId } }));
        }

        function show(which) {
            setup.hidden = which !== 'setup';
            play.hidden = which !== 'play';
            result.hidden = which !== 'result';
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

        function paintChoices() {
            var host = doc.getElementById('auralIntervalOptions');
            host.innerHTML = question.choices.map(function (choice) {
                return '<button type="button" class="aural-opt" data-choice="' + esc(choice.id) + '">' + esc(choice.label) + '</button>';
            }).join('');
        }

        function paintHud() {
            var score = doc.getElementById('auralIntervalScore');
            var meta = doc.getElementById('auralIntervalMeta');
            if (run.mode === 'challenge') {
                var left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
                score.textContent = String(run.score);
                meta.textContent = '連擊 ' + run.combo + ' · 剩餘 ' + left + ' 秒';
            } else {
                score.textContent = run.correct + ' / ' + run.asked;
                meta.textContent = '練習 · 答對 ' + run.correct + ' · 答錯 ' + run.wrong;
            }
        }

        function playCurrent() {
            var audio = root.AuralAudio;
            if (!audio || !question) return;
            try {
                audio.unlock();
                audio.play(audio.schedulePlan(question.midis, question.harmonic, 0));
            } catch (err) {}
        }

        function ask() {
            if (!running) return;
            if (run.mode === 'challenge' && Date.now() >= endsAt) {
                finish(false);
                return;
            }
            var lastCorrect = question ? question.correct : '';
            var next = buildQuestion(level, Math.random, harmonic);
            if (poolForLevel(level).length > 1) {
                for (var tries = 0; tries < 10 && next.correct === lastCorrect; tries++) {
                    next = buildQuestion(level, Math.random, harmonic);
                }
            }
            question = next;
            lockAnswer = false;
            var prompt = doc.getElementById('auralIntervalPrompt');
            prompt.textContent = level <= 1 ? '聽兩個音，選出度數。' : '聽兩個音，選出音程（大、小或純）。';
            doc.getElementById('auralIntervalFeedback').textContent = harmonic ? '和聲：兩個音同時響起。' : '旋律：低音先，高音後。';
            paintChoices();
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
            if (root.AuralAudio) root.AuralAudio.stop();
            var detail = resultDetail(run);
            var who = player();
            var Score = root.AuralScore;
            if (!detail || !Score || !Score.canSavePlayer(who)) {
                return { detail: detail, saved: false };
            }
            var row = {
                name: who.name,
                class: who.class || '',
                id: who.id || '',
                grade: who.grade,
                score: detail.score,
                accuracy: detail.accuracy,
                max_combo: detail.maxCombo,
                game: GAME_KEY
            };
            var before = Score.previousBest(Score.readBoard(root.localStorage, GAME_KEY), row);
            var rows = Score.commitBoard(root.localStorage, GAME_KEY, row);
            root.dispatchEvent(new CustomEvent('aural-result', { detail: detail }));
            return { detail: detail, saved: true, kept: detail.score > before, best: Math.max(before, detail.score), rows: rows };
        }

        function renderBoard(rows, who) {
            var host = doc.getElementById('auralIntervalBoard');
            var list = (rows || []).slice().sort(function (a, b) { return (parseInt(b.score, 10) || 0) - (parseInt(a.score, 10) || 0); }).slice(0, 5);
            if (!list.length) {
                host.innerHTML = '';
                return;
            }
            host.innerHTML = '<h3 class="aural-board-title">本機挑戰榜</h3>' + list.map(function (item, index) {
                var mine = who && String(item.name || '') === String(who.name || '');
                return '<div class="aural-board-row' + (mine ? ' is-self' : '') + '"><span>' + (index + 1) + '. ' + esc(item.name) + '</span><b>' + esc(item.score) + '</b></div>';
            }).join('');
        }

        function finish() {
            if (settled) return;
            var outcome = settle();
            var title = doc.getElementById('auralIntervalResultTitle');
            var body = doc.getElementById('auralIntervalResultBody');
            var who = player();
            if (run.mode !== 'challenge') {
                title.textContent = '練習結束';
                body.textContent = '答對 ' + run.correct + ' / ' + run.asked + '（' + accuracyOf(run) + '%）。練習分不會入榜，亦不會改寫個人最佳。';
                doc.getElementById('auralIntervalBoard').innerHTML = '';
            } else if (!run.asked) {
                title.textContent = '挑戰結束';
                body.textContent = '未作答，沒有寫入分數。';
                doc.getElementById('auralIntervalBoard').innerHTML = '';
            } else if (!outcome || !outcome.saved) {
                title.textContent = '挑戰結束';
                body.textContent = '這次 ' + run.score + ' 分（準確率 ' + accuracyOf(run) + '%）。訪客或未選姓名的成績不會入榜。';
                doc.getElementById('auralIntervalBoard').innerHTML = '';
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
            question = null;
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
            doc.getElementById('auralIntervalEnd').textContent = mode === 'challenge' ? '結束挑戰' : '結束練習';
            show('play');
            ask();
        }

        function choose(id) {
            if (!running || lockAnswer || !question) return;
            lockAnswer = true;
            var correct = id === question.correct;
            var gained = scoreAnswer(run, correct);
            var feedback = doc.getElementById('auralIntervalFeedback');
            feedback.textContent = correct
                ? ('正確，' + question.label + (gained ? '　+' + gained : ''))
                : ('未中。正確是' + question.label);
            var buttons = doc.querySelectorAll('#auralIntervalOptions .aural-opt');
            buttons.forEach(function (button) {
                button.disabled = true;
                if (button.getAttribute('data-choice') === question.correct) button.classList.add('is-correct');
                else if (button.getAttribute('data-choice') === id) button.classList.add('is-wrong');
            });
            paintHud();
            pending = setTimeout(function () {
                pending = 0;
                if (!running) return;
                ask();
            }, 700);
        }

        doc.getElementById('auralOpenInterval').addEventListener('click', function () {
            show('setup');
            go('screen-aural-interval');
        });
        doc.getElementById('auralBackHub').addEventListener('click', function () { go('screen-hub'); });
        doc.getElementById('auralIntervalBack').addEventListener('click', function () {
            if (running) settle();
            if (root.AuralAudio) root.AuralAudio.stop();
            go('screen-aural');
        });
        doc.getElementById('auralIntervalModes').addEventListener('click', function (event) {
            var button = event.target.closest('[data-mode]');
            if (!button) return;
            mode = button.getAttribute('data-mode') === 'challenge' ? 'challenge' : 'practice';
            doc.querySelectorAll('#auralIntervalModes [data-mode]').forEach(function (item) {
                item.classList.toggle('is-on', item === button);
            });
        });
        doc.getElementById('auralIntervalLevels').addEventListener('click', function (event) {
            var button = event.target.closest('[data-level]');
            if (!button) return;
            level = parseInt(button.getAttribute('data-level'), 10) || 1;
            doc.querySelectorAll('#auralIntervalLevels [data-level]').forEach(function (item) {
                item.classList.toggle('is-on', item === button);
            });
            var hint = doc.getElementById('auralIntervalLevelHint');
            hint.textContent = button.getAttribute('data-hint') || '';
        });
        doc.getElementById('auralIntervalVoicing').addEventListener('click', function (event) {
            var button = event.target.closest('[data-harmonic]');
            if (!button) return;
            harmonic = button.getAttribute('data-harmonic') === '1';
            doc.querySelectorAll('#auralIntervalVoicing [data-harmonic]').forEach(function (item) {
                item.classList.toggle('is-on', item === button);
            });
        });
        doc.getElementById('auralIntervalStart').addEventListener('click', start);
        doc.getElementById('auralIntervalReplay').addEventListener('click', function () {
            if (root.AuralAudio) root.AuralAudio.unlock();
            playCurrent();
        });
        doc.getElementById('auralIntervalOptions').addEventListener('click', function (event) {
            var button = event.target.closest('[data-choice]');
            if (!button) return;
            choose(button.getAttribute('data-choice'));
        });
        doc.getElementById('auralIntervalEnd').addEventListener('click', function () { finish(); });
        doc.getElementById('auralIntervalAgain').addEventListener('click', function () { show('setup'); });
    }

    return {
        GAME_KEY: GAME_KEY,
        INTERVALS: INTERVALS,
        poolForLevel: poolForLevel,
        buildQuestion: buildQuestion,
        createRun: createRun,
        scoreAnswer: scoreAnswer,
        accuracyOf: accuracyOf,
        resultDetail: resultDetail,
        mount: mount
    };
});
