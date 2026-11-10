/**
 * 和弦鍵盤圖（第一張卡）：每個和弦只畫一個緊密原位。
 * 根音在最低，其餘和弦音往上排；只點亮這一個排列的音，不點亮其他八度。
 * 音名從根音的音級拼出（Abaug = Ab–C–E，E7 = E–G#–B–D），不是 MIDI 全升號。
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.ChordKeyboard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    var NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
    var WHITE_PC = { 0: 1, 2: 1, 4: 1, 5: 1, 7: 1, 9: 1, 11: 1 };
    var SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    var FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    var ROOT_MIDI = 60;

    var QUALITIES = {
        '':     { intervals: [0, 4, 7],       steps: [0, 2, 4],    zh: '大三和弦' },
        m:      { intervals: [0, 3, 7],       steps: [0, 2, 4],    zh: '小三和弦' },
        dim:    { intervals: [0, 3, 6],       steps: [0, 2, 4],    zh: '減三和弦' },
        aug:    { intervals: [0, 4, 8],       steps: [0, 2, 4],    zh: '增三和弦' },
        sus2:   { intervals: [0, 2, 7],       steps: [0, 1, 4],    zh: '掛二和弦' },
        sus4:   { intervals: [0, 5, 7],       steps: [0, 3, 4],    zh: '掛四和弦' },
        '7':    { intervals: [0, 4, 7, 10],   steps: [0, 2, 4, 6], zh: '屬七和弦' },
        maj7:   { intervals: [0, 4, 7, 11],   steps: [0, 2, 4, 6], zh: '大七和弦' },
        m7:     { intervals: [0, 3, 7, 10],   steps: [0, 2, 4, 6], zh: '小七和弦' },
        m7b5:   { intervals: [0, 3, 6, 10],   steps: [0, 2, 4, 6], zh: '半減七和弦' },
        dim7:   { intervals: [0, 3, 6, 9],    steps: [0, 2, 4, 6], zh: '減七和弦' }
    };

    var ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'Eb', 'F#', 'Ab', 'Bb'];
    var QUALITY_ORDER = ['', 'm', 'dim', 'aug', 'sus2', 'sus4', '7', 'maj7', 'm7', 'm7b5', 'dim7'];
    var PICK_LABELS = {
        '': '大三', m: '小三', dim: '減', aug: '增', sus2: '掛二', sus4: '掛四',
        '7': '屬七', maj7: '大七', m7: '小七', m7b5: '半減七', dim7: '減七'
    };

    function parseRootName(name) {
        var letterIdx = LETTERS.indexOf(name && name.charAt(0));
        if (letterIdx < 0) return { letterIdx: 0, pc: 0 };
        var offset = 0;
        var rest = name.slice(1);
        for (var i = 0; i < rest.length; i++) {
            if (rest.charAt(i) === '#') offset += 1;
            else if (rest.charAt(i) === 'b') offset -= 1;
        }
        return { letterIdx: letterIdx, pc: (NATURAL_PC[letterIdx] + offset + 12) % 12 };
    }

    function spellLetter(letterIdx, pc) {
        var offset = ((pc - NATURAL_PC[letterIdx] + 18) % 12) - 6;
        var letter = LETTERS[letterIdx];
        if (offset > 0) return letter + '#'.repeat(offset);
        if (offset < 0) return letter + 'b'.repeat(-offset);
        return letter;
    }

    function qualityOf(type) {
        return QUALITIES[type] || QUALITIES[''];
    }

    function chordToneNames(root, type) {
        var parsed = parseRootName(root);
        var q = qualityOf(type);
        var names = [];
        for (var i = 0; i < q.intervals.length; i++) {
            var tonePc = (parsed.pc + q.intervals[i]) % 12;
            var idx = (parsed.letterIdx + q.steps[i]) % 7;
            names.push(spellLetter(idx, tonePc));
        }
        return names;
    }

    function symbolOf(root, type) {
        return String(root) + (type || '');
    }

    function preferFlats(root, toneNames) {
        var blob = String(root) + toneNames.join('');
        return blob.indexOf('b') !== -1 && blob.indexOf('#') === -1;
    }

    function isWhite(midi) {
        return !!WHITE_PC[((midi % 12) + 12) % 12];
    }

    function whiteStart(rootMidi) {
        var m = rootMidi;
        while (!isWhite(m)) m -= 1;
        return m;
    }

    function collectWhites(start, count) {
        var whites = [];
        var m = start;
        while (whites.length < count && m < start + 36) {
            if (isWhite(m)) whites.push(m);
            m += 1;
        }
        return whites;
    }

    /**
     * One close root-position voicing, plus an 8-white-key window
     * that starts on the white key at or just below the root and
     * reaches the 7th (a major 7th lands on the top key).
     */
    function keyboardModel(root, type) {
        var q = qualityOf(type);
        var names = chordToneNames(root, type);
        var parsed = parseRootName(root);
        var rootMidi = ROOT_MIDI + parsed.pc;
        var tones = q.intervals.map(function (interval, index) {
            return {
                midi: rootMidi + interval,
                name: names[index],
                root: index === 0
            };
        });
        var byMidi = {};
        tones.forEach(function (tone) { byMidi[tone.midi] = tone; });
        var flats = preferFlats(root, names);
        var namesByPc = flats ? FLAT_NAMES : SHARP_NAMES;

        function labelFor(midi) {
            if (byMidi[midi]) return byMidi[midi].name;
            return namesByPc[((midi % 12) + 12) % 12];
        }
        function roleFor(midi) {
            if (!byMidi[midi]) return '';
            return byMidi[midi].root ? 'root' : 'tone';
        }

        var whites = collectWhites(whiteStart(rootMidi), 8);
        var end = whites[whites.length - 1];
        var blacks = [];
        for (var m = whites[0] + 1; m < end; m++) {
            if (!isWhite(m)) {
                var leftIndex = 0;
                for (var i = 0; i < whites.length; i++) {
                    if (whites[i] < m) leftIndex = i;
                    else break;
                }
                blacks.push({
                    midi: m,
                    name: labelFor(m),
                    role: roleFor(m),
                    leftIndex: leftIndex
                });
            }
        }

        return {
            root: root,
            type: type || '',
            symbol: symbolOf(root, type),
            qualityZh: q.zh,
            label: symbolOf(root, type) + ' · ' + q.zh,
            tones: tones,
            whites: whites.map(function (midi) {
                return { midi: midi, name: labelFor(midi), role: roleFor(midi) };
            }),
            blacks: blacks
        };
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function keyFace(kind, key) {
        var roleClass = key.role ? ' chord-kb-key--' + key.role : '';
        var mark = key.role === 'root' ? '<span class="chord-kb-root-mark">R</span>' : '';
        var style = kind === 'black'
            ? ' style="left:' + (((key.leftIndex + 1) / 8) * 100) + '%"'
            : '';
        return '<div class="chord-kb-' + kind + roleClass + '"' + style + ' aria-hidden="true">' +
            mark + '<span class="chord-kb-name">' + escapeHtml(key.name) + '</span></div>';
    }

    var CONFUSIONS = {
        '': ['m', 'aug', '7', 'sus4', 'maj7'],
        m: ['', 'dim', 'm7', 'sus2'],
        dim: ['m', 'dim7', 'm7b5', 'aug'],
        aug: ['', 'dim', 'maj7'],
        sus2: ['sus4', '', 'm'],
        sus4: ['sus2', '', '7'],
        '7': ['maj7', 'm7', ''],
        maj7: ['7', '', 'm7'],
        m7: ['7', 'm', 'm7b5', 'maj7'],
        m7b5: ['dim7', 'm7', 'dim'],
        dim7: ['dim', 'm7b5', 'm7']
    };
    var ROUND_LENGTH = 10;
    var OPTION_LETTERS = ['A', 'B', 'C', 'D'];

    function shuffle(list, random) {
        var arr = list.slice();
        var rand = random || Math.random;
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(rand() * (i + 1));
            var swap = arr[i];
            arr[i] = arr[j];
            arr[j] = swap;
        }
        return arr;
    }

    function optionLabel(root, type) {
        return symbolOf(root, type) + ' · ' + qualityOf(type).zh;
    }

    function distractorTypes(type) {
        var preferred = CONFUSIONS[type] || [];
        var pool = preferred.slice();
        QUALITY_ORDER.forEach(function (quality) {
            if (quality !== type && pool.indexOf(quality) === -1) pool.push(quality);
        });
        return pool;
    }

    function buildQuestion(root, type, random) {
        var picked = shuffle(distractorTypes(type), random).slice(0, 3);
        var options = shuffle([type].concat(picked), random).map(function (quality) {
            return {
                root: root,
                type: quality,
                symbol: symbolOf(root, quality),
                label: optionLabel(root, quality)
            };
        });
        return {
            root: root,
            type: type || '',
            symbol: symbolOf(root, type),
            label: optionLabel(root, type),
            options: options
        };
    }

    function buildRound(count, random) {
        var total = count || ROUND_LENGTH;
        var bag = [];
        ROOTS.forEach(function (root) {
            QUALITY_ORDER.forEach(function (type) {
                bag.push({ root: root, type: type });
            });
        });
        return shuffle(bag, random).slice(0, total).map(function (item) {
            return buildQuestion(item.root, item.type, random);
        });
    }

    /** Same points as 術語識辨 practice: 10, plus 10 more once the combo reaches 5. */
    function applyAnswer(stats, isCorrect) {
        if (isCorrect) {
            stats.combo += 1;
            if (stats.combo > stats.maxCombo) stats.maxCombo = stats.combo;
            var pts = 10;
            if (stats.combo >= 5) pts += 10;
            stats.score += pts;
            stats.correct += 1;
            return pts;
        }
        stats.combo = 0;
        stats.wrong += 1;
        return 0;
    }

    function renderCard(root, type, options) {
        var reveal = !options || options.reveal !== false;
        var model = keyboardModel(root, type);
        var spoken = model.tones.map(function (tone) {
            return tone.name + (tone.root ? '（根音）' : '');
        }).join('、');
        var aria = reveal
            ? model.label + '，原位緊密排列：' + spoken
            : '原位緊密和弦。金色琴鍵和 R 是根音，綠色是其他和弦音。請選出和弦名稱。';
        var heading = '';
        var spelling = '';
        if (reveal) {
            spelling = '<p class="chord-card-spelling">' + model.tones.map(function (tone) {
                return '<span class="' + (tone.root ? 'is-root' : '') + '">' + escapeHtml(tone.name) + '</span>';
            }).join('<span class="chord-card-dot" aria-hidden="true">–</span>') + '</p>';
            heading = '<div class="chord-card-heading">' +
                '<span class="chord-card-symbol">' + escapeHtml(model.symbol) + '</span>' +
                '<span class="chord-card-sep" aria-hidden="true">·</span>' +
                '<span class="chord-card-quality">' + escapeHtml(model.qualityZh) + '</span>' +
            '</div>';
        }
        return '<div class="chord-card"' + (reveal ? ' data-symbol="' + escapeHtml(model.symbol) + '"' : '') + '>' +
            heading +
            '<div class="chord-kb" style="--chord-kb-n-white:8" role="img" aria-label="' + escapeHtml(aria) + '">' +
                '<div class="chord-kb-whites">' + model.whites.map(function (key) { return keyFace('white', key); }).join('') + '</div>' +
                '<div class="chord-kb-blacks">' + model.blacks.map(function (key) { return keyFace('black', key); }).join('') + '</div>' +
            '</div>' +
            spelling +
        '</div>';
    }

    function mount(options) {
        var mountEl = document.getElementById('chordCardMount');
        var rootPicker = document.getElementById('chordRootPicker');
        var qualPicker = document.getElementById('chordQualityPicker');
        if (!mountEl || !rootPicker || !qualPicker) return;
        var switchScreen = options && options.switchScreen;
        var rootName = 'C';
        var type = '';
        var returnScreen = 'screen-setup';

        function paintPickers() {
            rootPicker.innerHTML = ROOTS.map(function (name) {
                var on = name === rootName;
                return '<button type="button" class="chord-pick' + (on ? ' active' : '') +
                    '" data-root="' + name + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + name + '</button>';
            }).join('');
            qualPicker.innerHTML = QUALITY_ORDER.map(function (q) {
                var on = q === type;
                return '<button type="button" class="chord-pick' + (on ? ' active' : '') +
                    '" data-type="' + q + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
                    PICK_LABELS[q] + '</button>';
            }).join('');
        }

        function paint() {
            mountEl.innerHTML = renderCard(rootName, type);
            paintPickers();
        }

        rootPicker.addEventListener('click', function (event) {
            var button = event.target.closest('[data-root]');
            if (!button) return;
            rootName = button.getAttribute('data-root');
            paint();
        });
        qualPicker.addEventListener('click', function (event) {
            var button = event.target.closest('[data-type]');
            if (!button) return;
            type = button.getAttribute('data-type') || '';
            paint();
        });

        var openBtn = document.getElementById('openChordCardBtn');
        if (openBtn && switchScreen) {
            openBtn.addEventListener('click', function () {
                var current = document.querySelector('.screen.active');
                if (current && current.id && current.id !== 'screen-chord-card') returnScreen = current.id;
                paint();
                switchScreen('screen-chord-card');
            });
        }
        var backBtn = document.getElementById('chordCardBack');
        if (backBtn && switchScreen) {
            backBtn.addEventListener('click', function () {
                clearAdvance();
                switchScreen(returnScreen);
            });
        }

        var learnPanel = document.getElementById('chordLearnPanel');
        var challengePanel = document.getElementById('chordChallengePanel');
        var learnBtn = document.getElementById('chordModeLearn');
        var challengeBtn = document.getElementById('chordModeChallenge');
        var playEl = document.getElementById('chordChallengePlay');
        var resultEl = document.getElementById('chordChallengeResult');
        var challengeMount = document.getElementById('chordChallengeMount');
        var optionsEl = document.getElementById('chordChallengeOptions');
        var messageEl = document.getElementById('chordChallengeMessage');
        var qNumEl = document.getElementById('chordQNum');
        var scoreEl = document.getElementById('chordScore');
        var comboEl = document.getElementById('chordCombo');
        var fillEl = document.getElementById('chordProgressFill');
        var reportEl = document.getElementById('chordReportGrid');
        var mistakesEl = document.getElementById('chordMistakeReview');
        var advanceTimer = null;
        var round = null;

        function clearAdvance() {
            if (advanceTimer) {
                clearTimeout(advanceTimer);
                advanceTimer = null;
            }
        }

        function showMode(mode) {
            var learning = mode !== 'challenge';
            if (learnPanel) learnPanel.hidden = !learning;
            if (challengePanel) challengePanel.hidden = learning;
            if (learnBtn) {
                learnBtn.classList.toggle('active', learning);
                learnBtn.setAttribute('aria-selected', learning ? 'true' : 'false');
            }
            if (challengeBtn) {
                challengeBtn.classList.toggle('active', !learning);
                challengeBtn.setAttribute('aria-selected', learning ? 'false' : 'true');
            }
        }

        function freshStats() {
            return { score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0, mistakes: [] };
        }

        function updateHud() {
            var answered = round.stats.correct + round.stats.wrong;
            if (qNumEl) qNumEl.textContent = '第 ' + (round.index + 1) + ' 題 / 共 ' + round.questions.length + ' 題';
            if (scoreEl) scoreEl.textContent = String(round.stats.score);
            if (comboEl) comboEl.textContent = String(round.stats.combo);
            if (fillEl) fillEl.style.width = (answered / round.questions.length * 100) + '%';
        }

        function renderQuestion() {
            var question = round.questions[round.index];
            round.locked = false;
            if (challengeMount) challengeMount.innerHTML = renderCard(question.root, question.type, { reveal: false });
            if (messageEl) {
                messageEl.textContent = '看點亮的琴鍵，選出和弦名稱。';
                messageEl.className = 'message-box';
            }
            if (!optionsEl) return;
            optionsEl.innerHTML = question.options.map(function (option, index) {
                return '<button type="button" class="quiz-opt-btn" data-type="' + escapeHtml(option.type) + '">' +
                    '<span class="opt-letter">' + OPTION_LETTERS[index] + '</span>' +
                    '<span class="opt-text">' + escapeHtml(option.label) + '</span></button>';
            }).join('');
            updateHud();
        }

        function showResult() {
            clearAdvance();
            var stats = round.stats;
            var total = stats.correct + stats.wrong;
            var accuracy = total ? Math.round(stats.correct / total * 100) : 0;
            if (playEl) playEl.hidden = true;
            if (resultEl) resultEl.hidden = false;
            if (reportEl) {
                reportEl.innerHTML =
                    '<div class="report-item"><div class="report-label">答題數</div><div class="report-value">' + total + '</div></div>' +
                    '<div class="report-item"><div class="report-label">得分</div><div class="report-value">' + stats.score + '</div></div>' +
                    '<div class="report-item"><div class="report-label">正確率</div><div class="report-value">' + accuracy + '%</div></div>' +
                    '<div class="report-item"><div class="report-label">答錯</div><div class="report-value">' + stats.wrong + '</div></div>' +
                    '<div class="report-item"><div class="report-label">最高連對</div><div class="report-value">' + stats.maxCombo + '</div></div>';
            }
            if (mistakesEl) {
                mistakesEl.innerHTML = stats.mistakes.length
                    ? '<div class="mistake-review-title">錯題回顧</div>' + stats.mistakes.map(function (item) {
                        return '<div class="mistake-item"><div class="mistake-detail">' +
                            '<span class="mistake-wrong">你的答案：' + escapeHtml(item.chosen) + '</span> → ' +
                            '<span class="mistake-correct">正確：' + escapeHtml(item.answer) + '</span></div></div>';
                    }).join('')
                    : (stats.correct > 0 ? '<div>全部答對。</div>' : '<div>這輪還沒有作答。</div>');
            }
        }

        function startRound() {
            clearAdvance();
            round = { questions: buildRound(ROUND_LENGTH), index: 0, stats: freshStats(), locked: false };
            if (playEl) playEl.hidden = false;
            if (resultEl) resultEl.hidden = true;
            showMode('challenge');
            renderQuestion();
        }

        function answerQuestion(button) {
            if (!round || round.locked) return;
            var question = round.questions[round.index];
            var chosenType = button.getAttribute('data-type') || '';
            var isCorrect = chosenType === question.type;
            round.locked = true;
            var pts = applyAnswer(round.stats, isCorrect);
            if (optionsEl) {
                optionsEl.querySelectorAll('.quiz-opt-btn').forEach(function (el) { el.disabled = true; });
            }
            button.classList.add(isCorrect ? 'correct' : 'wrong');
            if (!isCorrect && optionsEl) {
                optionsEl.querySelectorAll('.quiz-opt-btn').forEach(function (el) {
                    if ((el.getAttribute('data-type') || '') === question.type) el.classList.add('correct');
                });
                round.stats.mistakes.push({ chosen: optionLabel(question.root, chosenType), answer: question.label });
            }
            if (challengeMount) challengeMount.innerHTML = renderCard(question.root, question.type, { reveal: true });
            if (messageEl) {
                messageEl.className = 'message-box ' + (isCorrect ? 'correct' : 'wrong');
                messageEl.textContent = isCorrect
                    ? '答對了。+' + pts + ' 分'
                    : '再看一次。正確是「' + question.label + '」。';
            }
            updateHud();
            if (isCorrect && options && options.playCorrect) options.playCorrect();
            if (!isCorrect && options && options.playWrong) options.playWrong();
            var last = round.index + 1 >= round.questions.length;
            advanceTimer = setTimeout(function () {
                advanceTimer = null;
                if (last) showResult();
                else {
                    round.index += 1;
                    renderQuestion();
                }
            }, 1200);
        }

        if (optionsEl) {
            optionsEl.addEventListener('click', function (event) {
                var button = event.target.closest('.quiz-opt-btn');
                if (!button || button.disabled) return;
                answerQuestion(button);
            });
        }
        if (learnBtn) {
            learnBtn.addEventListener('click', function () {
                clearAdvance();
                showMode('learn');
            });
        }
        if (challengeBtn) {
            challengeBtn.addEventListener('click', function () {
                if (challengeBtn.classList.contains('active') && playEl && !playEl.hidden) return;
                startRound();
            });
        }
        var retryBtn = document.getElementById('chordChallengeRetry');
        if (retryBtn) retryBtn.addEventListener('click', startRound);
        var toLearnBtn = document.getElementById('chordChallengeToLearn');
        if (toLearnBtn) {
            toLearnBtn.addEventListener('click', function () {
                clearAdvance();
                showMode('learn');
            });
        }
        var endBtn = document.getElementById('chordChallengeEnd');
        if (endBtn) {
            endBtn.addEventListener('click', function () {
                if (!round || (playEl && playEl.hidden)) return;
                showResult();
            });
        }

        paint();
        showMode('learn');
    }

    return {
        ROOTS: ROOTS,
        QUALITY_ORDER: QUALITY_ORDER,
        QUALITIES: QUALITIES,
        chordToneNames: chordToneNames,
        symbolOf: symbolOf,
        keyboardModel: keyboardModel,
        renderCard: renderCard,
        buildQuestion: buildQuestion,
        buildRound: buildRound,
        distractorTypes: distractorTypes,
        applyAnswer: applyAnswer,
        optionLabel: optionLabel,
        ROUND_LENGTH: ROUND_LENGTH,
        mount: mount
    };
});
