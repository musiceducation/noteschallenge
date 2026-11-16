/**
 * 大小調／和弦色彩. Level 1 is major or minor.
 * Higher levels add augmented and diminished triads, and optional cadences.
 */
(function (root, factory) {
    var api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.AuralQuality = api;
    if (root && root.document) {
        var boot = function () { api.mount(root.document); };
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
        else boot();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    var GAME_KEY = 'aural-quality';
    var CHALLENGE_MS = 60000;
    var QUALITY = {
        major: { intervals: [0, 4, 7], label: '大調' },
        minor: { intervals: [0, 3, 7], label: '小調' },
        aug: { intervals: [0, 4, 8], label: '增三和弦' },
        dim: { intervals: [0, 3, 6], label: '減三和弦' }
    };
    var CADENCE = {
        authentic: { label: '正格終止', degrees: ['I', 'V', 'I'] },
        plagal: { label: '變格終止', degrees: ['I', 'IV', 'I'] },
        half: { label: '半終止', degrees: ['I', 'V'] }
    };

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
    function triad(rootMidi, quality) {
        return QUALITY[quality].intervals.map(function (step) { return rootMidi + step; });
    }
    function degreeChord(rootMidi, degree) {
        var base = { I: 0, IV: 5, V: 7 }[degree];
        return [rootMidi + base, rootMidi + base + 4, rootMidi + base + 7];
    }
    function cadenceChords(rootMidi, id) {
        return CADENCE[id].degrees.map(function (degree) { return degreeChord(rootMidi, degree); });
    }

    function choice(id, label) { return { id: id, label: label }; }

    function buildQuestion(level, phrase, rng) {
        var random = rng || Math.random;
        var safe = level >= 3 ? 3 : (level === 2 ? 2 : 1);
        var rootMidi = 60 + [0, 2, 4, 5, 7, 9][pickInt(random, 6)];
        if (phrase && safe >= 3) {
            var ids = ['authentic', 'plagal', 'half'];
            var id = ids[pickInt(random, ids.length)];
            return {
                level: 3, kind: 'cadence', id: id, label: CADENCE[id].label,
                chords: cadenceChords(rootMidi, id),
                choices: ids.map(function (key) { return choice(key, CADENCE[key].label); })
            };
        }
        if (!phrase && safe >= 2) {
            var qualities = ['major', 'minor', 'aug', 'dim'];
            var quality = qualities[pickInt(random, qualities.length)];
            var midis = triad(rootMidi, quality);
            return {
                level: safe,
                kind: safe >= 3 ? 'arpeggio' : 'block',
                id: quality,
                label: QUALITY[quality].label,
                midis: midis,
                choices: qualities.map(function (key) { return choice(key, QUALITY[key].label); })
            };
        }
        var mode = random() < 0.5 ? 'major' : 'minor';
        var color = triad(rootMidi, mode);
        var phraseNotes = phrase ? [color[0], color[1], color[2], color[1]] : color;
        return {
            level: safe,
            kind: phrase ? 'arpeggio' : 'block',
            id: mode,
            label: QUALITY[mode].label,
            midis: phraseNotes,
            choices: [choice('major', '大調'), choice('minor', '小調')]
        };
    }

    function eventsFor(question) {
        if (question.kind === 'cadence') {
            var events = [];
            question.chords.forEach(function (chord, index) {
                chord.forEach(function (midi) {
                    events.push({ midi: midi, at: index * 0.62, dur: 0.7 });
                });
            });
            return events;
        }
        if (question.kind === 'arpeggio') {
            return question.midis.map(function (midi, index) {
                return { midi: midi, at: index * 0.22, dur: 0.55 };
            });
        }
        return question.midis.map(function (midi) {
            return { midi: midi, at: 0, dur: 1.1 };
        });
    }

    function createRun(mode) {
        return { mode: mode === 'challenge' ? 'challenge' : 'practice', score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0, asked: 0 };
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
        if (!doc || doc.body.dataset.auralQualityMounted) return;
        var setup = doc.getElementById('auralQualitySetup');
        var play = doc.getElementById('auralQualityPlay');
        var result = doc.getElementById('auralQualityResult');
        var open = doc.getElementById('auralOpenQuality');
        if (!setup || !play || !result || !open) return;
        doc.body.dataset.auralQualityMounted = '1';

        var mode = 'practice';
        var level = 1;
        var phrase = false;
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
        function paintHud() {
            var score = doc.getElementById('auralQualityScore');
            var meta = doc.getElementById('auralQualityMeta');
            if (run.mode === 'challenge') {
                score.textContent = String(run.score);
                meta.textContent = '連擊 ' + run.combo + ' · 剩餘 ' + Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) + ' 秒';
            } else {
                score.textContent = run.correct + ' / ' + run.asked;
                meta.textContent = '練習 · 答對 ' + run.correct + ' · 答錯 ' + run.wrong;
            }
        }
        function playCurrent() {
            if (!question || !root.AuralAudio) return;
            try {
                root.AuralAudio.unlock();
                root.AuralAudio.play(eventsFor(question));
            } catch (err) {}
        }
        function ask() {
            if (!running) return;
            if (run.mode === 'challenge' && Date.now() >= endsAt) { finish(); return; }
            question = buildQuestion(level, phrase, Math.random);
            lockAnswer = false;
            var prompt = doc.getElementById('auralQualityPrompt');
            prompt.textContent = question.kind === 'cadence' ? '聽終止式，選出種類。' : '聽色彩，選出大調或小調。';
            if (!phrase && level >= 2) prompt.textContent = '聽和弦，選出性質。';
            doc.getElementById('auralQualityOptions').innerHTML = question.choices.map(function (item) {
                return '<button type="button" class="aural-opt" data-choice="' + esc(item.id) + '">' + esc(item.label) + '</button>';
            }).join('');
            doc.getElementById('auralQualityFeedback').textContent = '';
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
            var host = doc.getElementById('auralQualityBoard');
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
            var title = doc.getElementById('auralQualityResultTitle');
            var body = doc.getElementById('auralQualityResultBody');
            var who = player();
            if (run.mode !== 'challenge') {
                title.textContent = '練習結束';
                body.textContent = '答對 ' + run.correct + ' / ' + run.asked + '（' + accuracyOf(run) + '%）。練習分不會入榜，亦不會改寫個人最佳。';
                doc.getElementById('auralQualityBoard').innerHTML = '';
            } else if (!run.asked) {
                title.textContent = '挑戰結束';
                body.textContent = '未作答，沒有寫入分數。';
                doc.getElementById('auralQualityBoard').innerHTML = '';
            } else if (!outcome || !outcome.saved) {
                title.textContent = '挑戰結束';
                body.textContent = '這次 ' + run.score + ' 分（準確率 ' + accuracyOf(run) + '%）。訪客或未選姓名的成績不會入榜。';
                doc.getElementById('auralQualityBoard').innerHTML = '';
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
            doc.getElementById('auralQualityEnd').textContent = mode === 'challenge' ? '結束挑戰' : '結束練習';
            show('play');
            ask();
        }
        function choose(id) {
            if (!running || lockAnswer || !question) return;
            lockAnswer = true;
            var correct = id === question.id;
            var gained = scoreAnswer(run, correct);
            doc.getElementById('auralQualityFeedback').textContent = correct
                ? ('正確，' + question.label + (gained ? '　+' + gained : ''))
                : ('未中。正確是' + question.label);
            doc.querySelectorAll('#auralQualityOptions .aural-opt').forEach(function (button) {
                button.disabled = true;
                if (button.getAttribute('data-choice') === question.id) button.classList.add('is-correct');
                else if (button.getAttribute('data-choice') === id) button.classList.add('is-wrong');
            });
            paintHud();
            pending = setTimeout(function () { pending = 0; if (running) ask(); }, 800);
        }

        open.addEventListener('click', function () { show('setup'); go('screen-aural-quality'); });
        doc.getElementById('auralQualityBack').addEventListener('click', function () {
            if (running) settle();
            if (root.AuralAudio) root.AuralAudio.stop();
            go('screen-aural');
        });
        doc.getElementById('auralQualityModes').addEventListener('click', function (event) {
            var button = event.target.closest('[data-mode]');
            if (!button) return;
            mode = button.getAttribute('data-mode') === 'challenge' ? 'challenge' : 'practice';
            doc.querySelectorAll('#auralQualityModes [data-mode]').forEach(function (item) {
                item.classList.toggle('is-on', item === button);
            });
        });
        doc.getElementById('auralQualityLevels').addEventListener('click', function (event) {
            var button = event.target.closest('[data-level]');
            if (!button) return;
            level = parseInt(button.getAttribute('data-level'), 10) || 1;
            doc.querySelectorAll('#auralQualityLevels [data-level]').forEach(function (item) {
                item.classList.toggle('is-on', item === button);
            });
            doc.getElementById('auralQualityLevelHint').textContent = button.getAttribute('data-hint') || '';
        });
        doc.getElementById('auralQualityVoicing').addEventListener('click', function (event) {
            var button = event.target.closest('[data-phrase]');
            if (!button) return;
            phrase = button.getAttribute('data-phrase') === '1';
            doc.querySelectorAll('#auralQualityVoicing [data-phrase]').forEach(function (item) {
                item.classList.toggle('is-on', item === button);
            });
        });
        doc.getElementById('auralQualityStart').addEventListener('click', start);
        doc.getElementById('auralQualityReplay').addEventListener('click', function () {
            if (root.AuralAudio) root.AuralAudio.unlock();
            playCurrent();
        });
        doc.getElementById('auralQualityOptions').addEventListener('click', function (event) {
            var button = event.target.closest('[data-choice]');
            if (!button) return;
            choose(button.getAttribute('data-choice'));
        });
        doc.getElementById('auralQualityEnd').addEventListener('click', function () { finish(); });
        doc.getElementById('auralQualityAgain').addEventListener('click', function () { show('setup'); });
    }

    return {
        GAME_KEY: GAME_KEY,
        QUALITY: QUALITY,
        triad: triad,
        cadenceChords: cadenceChords,
        buildQuestion: buildQuestion,
        eventsFor: eventsFor,
        createRun: createRun,
        scoreAnswer: scoreAnswer,
        resultDetail: resultDetail,
        mount: mount
    };
});
