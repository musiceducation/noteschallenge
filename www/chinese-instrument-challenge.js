/**
 * 中國樂器挑戰：圖鑑裡的十題選擇題。
 * 只從題庫中 family 以 chinese 開頭、而且有相片和中文名的樂器出題。
 * 分數留在這一頁，不寫入樂器識辨排行榜——那份榜是管弦樂計時挑戰。
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.ChineseInstrumentChallenge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var ROUND_LENGTH = 10;
    var OPTION_COUNT = 4;
    var ADVANCE_MS = 2200;
    var OPTION_LETTERS = ['A', 'B', 'C', 'D'];

    function isChinese(inst) {
        return !!(inst
            && typeof inst.family === 'string'
            && inst.family.indexOf('chinese') === 0
            && inst.id
            && inst.nameZh
            && inst.img);
    }

    function chinesePool(bank) {
        return (bank || []).filter(isChinese);
    }

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

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function roundSize(poolLength) {
        var n = poolLength || 0;
        if (n < 2) return 0;
        return Math.min(ROUND_LENGTH, n);
    }

    /** Prefer other instruments in the same family; never leave the Chinese pool. */
    function pickDistractors(correct, pool, n, random) {
        var others = (pool || []).filter(function (inst) {
            return isChinese(inst) && inst.id !== correct.id;
        });
        var same = shuffle(others.filter(function (inst) { return inst.family === correct.family; }), random);
        var rest = shuffle(others.filter(function (inst) { return inst.family !== correct.family; }), random);
        var picked = same.slice(0, n);
        if (picked.length < n) picked = picked.concat(rest.slice(0, n - picked.length));
        return picked;
    }

    function buildQuestion(correct, pool, random) {
        if (!isChinese(correct)) return null;
        var chinese = chinesePool(pool);
        if (!chinese.some(function (inst) { return inst.id === correct.id; })) chinese = chinese.concat([correct]);
        var distractors = pickDistractors(correct, chinese, OPTION_COUNT - 1, random);
        var options = shuffle([correct].concat(distractors), random).map(function (inst) {
            return { id: inst.id, nameZh: inst.nameZh, family: inst.family };
        });
        return {
            id: correct.id,
            nameZh: correct.nameZh,
            nameEn: correct.nameEn || '',
            family: correct.family,
            familyZh: correct.familyZh || '',
            img: correct.img,
            options: options
        };
    }

    function buildRound(bank, count, random) {
        var pool = chinesePool(bank);
        var total = count == null ? roundSize(pool.length) : Math.min(count, pool.length);
        if (total < 1) return [];
        return shuffle(pool, random).slice(0, total).map(function (inst) {
            return buildQuestion(inst, pool, random);
        }).filter(Boolean);
    }

    /** Same points as 術語識辨 practice and 和弦挑戰: 10, plus 10 more once the combo reaches 5. */
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

    function renderPrompt(question, reveal) {
        var alt = reveal ? question.nameZh : '中國樂器';
        var nameBlock = reveal
            ? '<div class="cn-inst-name">' + escapeHtml(question.nameZh) + '</div>' +
              '<div class="cn-inst-en">' + escapeHtml(question.nameEn) +
              (question.familyZh ? ' · ' + escapeHtml(question.familyZh) : '') + '</div>'
            : '<div class="cn-inst-name cn-inst-name--hidden">？</div>' +
              '<div class="cn-inst-en">選出名稱後顯示</div>';
        return '<div class="cn-inst-visual">' +
            '<img class="cn-inst-photo" src="' + escapeHtml(question.img) + '" alt="' + escapeHtml(alt) + '">' +
            nameBlock +
            '<p class="cn-inst-credit">相片來自維基共享資源。聲音是題庫裡的示範音色，不是現場錄音。</p>' +
        '</div>';
    }

    function mount(options) {
        var opts = options || {};
        var getBank = opts.getBank || function () { return []; };
        var modeRow = document.getElementById('cnInstModeRow');
        var learnBtn = document.getElementById('cnInstModeLearn');
        var challengeBtn = document.getElementById('cnInstModeChallenge');
        var panel = document.getElementById('cnInstChallengePanel');
        var playEl = document.getElementById('cnInstChallengePlay');
        var resultEl = document.getElementById('cnInstChallengeResult');
        var mountEl = document.getElementById('cnInstChallengeMount');
        var optionsEl = document.getElementById('cnInstChallengeOptions');
        var messageEl = document.getElementById('cnInstChallengeMessage');
        var qNumEl = document.getElementById('cnInstQNum');
        var scoreEl = document.getElementById('cnInstScore');
        var comboEl = document.getElementById('cnInstCombo');
        var fillEl = document.getElementById('cnInstProgressFill');
        var reportEl = document.getElementById('cnInstReportGrid');
        var mistakesEl = document.getElementById('cnInstMistakeReview');
        var searchWrap = document.getElementById('g4StudySearchWrap');
        var grid = document.getElementById('g4StudyGrid');
        var startBtn = document.getElementById('g4StudyStartBtn');
        var advanceTimer = null;
        var family = 'all';
        var mode = 'learn';
        var round = null;

        function clearAdvance() {
            if (advanceTimer) {
                clearTimeout(advanceTimer);
                advanceTimer = null;
            }
        }

        function applyVisibility() {
            var chinese = family === 'chinese';
            var challenging = chinese && mode === 'challenge';
            if (modeRow) modeRow.hidden = !chinese;
            if (panel) panel.hidden = !challenging;
            if (searchWrap) searchWrap.hidden = challenging;
            if (grid) grid.hidden = challenging;
            if (startBtn) startBtn.hidden = challenging;
            if (learnBtn) {
                learnBtn.classList.toggle('active', !challenging);
                learnBtn.setAttribute('aria-selected', challenging ? 'false' : 'true');
            }
            if (challengeBtn) {
                challengeBtn.classList.toggle('active', challenging);
                challengeBtn.setAttribute('aria-selected', challenging ? 'true' : 'false');
            }
        }

        function freshStats() {
            return { score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0, mistakes: [] };
        }

        function updateHud() {
            if (!round) return;
            var answered = round.stats.correct + round.stats.wrong;
            if (qNumEl) qNumEl.textContent = '第 ' + (round.index + 1) + ' 題 / 共 ' + round.questions.length + ' 題';
            if (scoreEl) scoreEl.textContent = String(round.stats.score);
            if (comboEl) comboEl.textContent = String(round.stats.combo);
            if (fillEl) fillEl.style.width = (answered / round.questions.length * 100) + '%';
        }

        function playCurrent() {
            if (!round || !opts.playSound) return;
            var question = round.questions[round.index];
            if (question) opts.playSound(question.id);
        }

        function renderQuestion() {
            var question = round.questions[round.index];
            round.locked = false;
            if (mountEl) mountEl.innerHTML = renderPrompt(question, false);
            if (messageEl) {
                messageEl.textContent = '看相片、聽示範聲，選出樂器名稱。';
                messageEl.className = 'message-box';
            }
            if (optionsEl) {
                optionsEl.innerHTML = question.options.map(function (option, index) {
                    return '<button type="button" class="quiz-opt-btn" data-id="' + escapeHtml(option.id) + '">' +
                        '<span class="opt-letter">' + OPTION_LETTERS[index] + '</span>' +
                        '<span class="opt-text">' + escapeHtml(option.nameZh) + '</span></button>';
                }).join('');
            }
            updateHud();
            playCurrent();
        }

        function showResult() {
            clearAdvance();
            if (!round) return;
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

        function showLearn() {
            clearAdvance();
            mode = 'learn';
            applyVisibility();
        }

        function startRound() {
            clearAdvance();
            var questions = buildRound(getBank());
            if (!questions.length) {
                mode = 'challenge';
                family = 'chinese';
                applyVisibility();
                if (playEl) playEl.hidden = false;
                if (resultEl) resultEl.hidden = true;
                if (mountEl) mountEl.innerHTML = '';
                if (optionsEl) optionsEl.innerHTML = '';
                if (messageEl) messageEl.textContent = '中國樂器題庫不足，暫時不能出選擇題。';
                return;
            }
            round = { questions: questions, index: 0, stats: freshStats(), locked: false };
            mode = 'challenge';
            family = 'chinese';
            if (playEl) playEl.hidden = false;
            if (resultEl) resultEl.hidden = true;
            applyVisibility();
            renderQuestion();
        }

        function answerQuestion(button) {
            if (!round || round.locked) return;
            var question = round.questions[round.index];
            var chosenId = button.getAttribute('data-id') || '';
            var chosen = question.options.filter(function (option) { return option.id === chosenId; })[0];
            var isCorrect = chosenId === question.id;
            round.locked = true;
            var pts = applyAnswer(round.stats, isCorrect);
            if (optionsEl) {
                optionsEl.querySelectorAll('.quiz-opt-btn').forEach(function (el) { el.disabled = true; });
            }
            button.classList.add(isCorrect ? 'correct' : 'wrong');
            if (!isCorrect && optionsEl) {
                optionsEl.querySelectorAll('.quiz-opt-btn').forEach(function (el) {
                    if ((el.getAttribute('data-id') || '') === question.id) el.classList.add('correct');
                });
                round.stats.mistakes.push({
                    chosen: chosen ? chosen.nameZh : chosenId,
                    answer: question.nameZh
                });
            }
            if (mountEl) mountEl.innerHTML = renderPrompt(question, true);
            if (messageEl) {
                messageEl.className = 'message-box ' + (isCorrect ? 'correct' : 'wrong');
                messageEl.textContent = isCorrect
                    ? '答對了。+' + pts + ' 分'
                    : '再看一次。正確是「' + question.nameZh + '」。';
            }
            updateHud();
            if (isCorrect && opts.playCorrect) opts.playCorrect();
            if (!isCorrect && opts.playWrong) opts.playWrong();
            var last = round.index + 1 >= round.questions.length;
            advanceTimer = setTimeout(function () {
                advanceTimer = null;
                if (!round) return;
                if (last) showResult();
                else {
                    round.index += 1;
                    renderQuestion();
                }
            }, ADVANCE_MS);
        }

        if (optionsEl) {
            optionsEl.addEventListener('click', function (event) {
                var button = event.target.closest('.quiz-opt-btn');
                if (!button || button.disabled) return;
                answerQuestion(button);
            });
        }
        var replayBtn = document.getElementById('cnInstReplay');
        if (replayBtn) replayBtn.addEventListener('click', playCurrent);
        if (learnBtn) learnBtn.addEventListener('click', showLearn);
        if (challengeBtn) {
            challengeBtn.addEventListener('click', function () {
                if (challengeBtn.classList.contains('active') && playEl && !playEl.hidden) return;
                startRound();
            });
        }
        var retryBtn = document.getElementById('cnInstChallengeRetry');
        if (retryBtn) retryBtn.addEventListener('click', startRound);
        var toLearnBtn = document.getElementById('cnInstChallengeToLearn');
        if (toLearnBtn) toLearnBtn.addEventListener('click', showLearn);
        var endBtn = document.getElementById('cnInstChallengeEnd');
        if (endBtn) {
            endBtn.addEventListener('click', function () {
                if (!round || (playEl && playEl.hidden)) return;
                showResult();
            });
        }

        applyVisibility();

        return {
            onCodexOpen: function () {
                clearAdvance();
                family = 'all';
                mode = 'learn';
                round = null;
                applyVisibility();
            },
            onFamily: function (next) {
                var entering = next === 'chinese';
                if (!entering && mode === 'challenge') {
                    clearAdvance();
                    mode = 'learn';
                }
                family = next || 'all';
                applyVisibility();
            },
            leave: function () {
                clearAdvance();
                family = 'all';
                mode = 'learn';
                round = null;
                applyVisibility();
            }
        };
    }

    var controller = null;

    return {
        ROUND_LENGTH: ROUND_LENGTH,
        OPTION_COUNT: OPTION_COUNT,
        ADVANCE_MS: ADVANCE_MS,
        isChinese: isChinese,
        chinesePool: chinesePool,
        pickDistractors: pickDistractors,
        buildQuestion: buildQuestion,
        buildRound: buildRound,
        roundSize: roundSize,
        applyAnswer: applyAnswer,
        renderPrompt: renderPrompt,
        mount: function (options) {
            controller = mount(options);
            return controller;
        },
        onCodexOpen: function () { if (controller) controller.onCodexOpen(); },
        onFamily: function (family) { if (controller) controller.onFamily(family); },
        leave: function () { if (controller) controller.leave(); }
    };
});
