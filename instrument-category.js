/**
 * 樂器識辨的練習類別。
 * 類別只來自題庫已有的 family / familyZh，不加新族群。
 * 只有「管弦樂全部」加上看圖的限時挑戰可以寫入舊的樂器識辨排行榜。
 * 中樂聲音是合成示範音色，不是現場錄音。聽聽題也用同一句合成聲說明。
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.InstrumentCategory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var STORAGE_KEY = 'g4InstrumentPool';
    var PROMPT_KEY = 'g4PromptMode';
    var SYNTH_NOTE = '聲音是合成示範音色，不是現場錄音。';
    var Q_TYPES = [
        ['image-name', 0.30],
        ['name-image', 0.25],
        ['name-family', 0.27],
        ['percussion-pitch', 0.08],
        ['sound-source', 0.10],
        ['listen-name', 0.25]
    ];
    var SOUND_LABELS = {
        strings: '弓拉或撥動弦線',
        woodwind: '吹氣通過管口或簧片',
        brass: '嘴唇振動吹入管口',
        percussion: '敲擊使物體振動',
        keyboard: '按鍵觸動機械或電路',
        'chinese-bowed': '馬尾弓拉奏',
        'chinese-plucked': '彈撥或琴竹擊弦',
        'chinese-wind': '吹管發聲',
        'chinese-perc': '槌或手敲擊'
    };
    var PITCHED_PERCUSSION = {
        timpani: true,
        xylophone: true,
        glockenspiel: true,
        marimba: true,
        vibraphone: true
    };

    function isChineseFamily(family) {
        return typeof family === 'string' && family.indexOf('chinese') === 0;
    }

    function catalog(bank) {
        var choices = [{ id: 'orchestra', label: '管弦樂全部', group: '管弦樂', ranked: true, chinese: false }];
        var seenWest = Object.create(null);
        var seenChinese = Object.create(null);
        var chinese = [];
        (bank || []).forEach(function (inst) {
            if (!inst || !inst.family) return;
            var label = inst.familyZh || inst.family;
            if (isChineseFamily(inst.family)) {
                if (!seenChinese[inst.family]) {
                    seenChinese[inst.family] = true;
                    chinese.push({ id: inst.family, label: label, group: '中國樂器', ranked: false, chinese: true });
                }
            } else if (!seenWest[inst.family]) {
                seenWest[inst.family] = true;
                choices.push({ id: inst.family, label: label, group: '管弦樂', ranked: false, chinese: false });
            }
        });
        if (chinese.length) {
            choices.push({ id: 'chinese', label: '中國樂器全部', group: '中國樂器', ranked: false, chinese: true });
            choices = choices.concat(chinese);
        }
        return choices;
    }

    function findChoice(bank, poolId) {
        var list = catalog(bank);
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === poolId) return list[i];
        }
        return list[0];
    }

    function resolve(bank, poolId) {
        var choice = findChoice(bank, poolId);
        var instruments = (bank || []).filter(function (inst) {
            if (!inst || !inst.id || !inst.nameZh || !inst.family) return false;
            if (choice.id === 'orchestra') return !isChineseFamily(inst.family);
            if (choice.id === 'chinese') return isChineseFamily(inst.family);
            return inst.family === choice.id;
        });
        return {
            id: choice.id,
            label: choice.label,
            group: choice.group,
            ranked: !!choice.ranked,
            chinese: !!choice.chinese,
            instruments: instruments
        };
    }

    function normalizePrompt(promptMode) {
        return promptMode === 'listen' || promptMode === 'mix' ? promptMode : 'see';
    }

    function isSeePrompt(promptMode) {
        return normalizePrompt(promptMode) === 'see';
    }

    function recordsRank(poolId, promptMode) {
        return (!poolId || poolId === 'orchestra') && isSeePrompt(promptMode);
    }

    function submitsGlobal(poolId, mode, promptMode) {
        return recordsRank(poolId, promptMode) && mode !== 'practice';
    }

    /**
     * startGame4 always arms the profile timer.
     * Only a ranked timed finish should hand that time to recordGameResult.
     * Ranked means 管弦樂全部 and 看圖. 聽聽 and 混合 pass ranked=false.
     * Every other finish, including an unranked timed challenge, must reset it.
     */
    function profileTimerAction(ranked, mode) {
        return ranked && mode !== 'practice' ? 'record' : 'reset';
    }

    function loadSelection(store, catalogList) {
        var id = '';
        try { id = store && store.get ? (store.get(STORAGE_KEY) || '') : ''; } catch (e) { id = ''; }
        var known = (catalogList || []).some(function (choice) { return choice.id === id; });
        return known ? id : 'orchestra';
    }

    function saveSelection(store, poolId) {
        try { if (store && store.set) store.set(STORAGE_KEY, poolId || 'orchestra'); } catch (e) {}
    }

    function loadPrompt(store) {
        var id = '';
        try { id = store && store.get ? (store.get(PROMPT_KEY) || '') : ''; } catch (e) { id = ''; }
        return normalizePrompt(id);
    }

    function savePrompt(store, promptMode) {
        try { if (store && store.set) store.set(PROMPT_KEY, normalizePrompt(promptMode)); } catch (e) {}
    }

    function soundLabel(inst) {
        return (inst && SOUND_LABELS[inst.family]) || '';
    }

    function hasPitch(id) {
        return !!PITCHED_PERCUSSION[id];
    }

    function hasPhoto(inst) {
        return !!(inst && inst.img && /\.(png|jpg|jpeg|avif|webp)$/i.test(inst.img));
    }

    function hasSynth(inst) {
        return !!(inst && inst.synthParams);
    }

    function uniqueValues(list, read) {
        var seen = Object.create(null);
        var out = [];
        list.forEach(function (item) {
            var value = read(item);
            if (!value || seen[value]) return;
            seen[value] = true;
            out.push(value);
        });
        return out;
    }

    function availableTypes(instruments, promptMode) {
        var pool = instruments || [];
        var mode = normalizePrompt(promptMode);
        var photos = pool.filter(hasPhoto);
        var types = [];
        if (mode !== 'listen') {
            if (uniqueValues(photos, function (inst) { return inst.nameZh; }).length >= 2) types.push('image-name');
            if (photos.length >= 2) types.push('name-image');
            if (uniqueValues(pool, function (inst) { return inst.familyZh; }).length >= 2) types.push('name-family');
            if (pool.some(function (inst) { return inst.family === 'percussion'; })) types.push('percussion-pitch');
            if (uniqueValues(pool, soundLabel).length >= 2) types.push('sound-source');
        }
        if (mode !== 'see') {
            var audible = pool.filter(hasSynth);
            if (uniqueValues(audible, function (inst) { return inst.nameZh; }).length >= 2) types.push('listen-name');
        }
        return types;
    }

    function randomOf(random) {
        return typeof random === 'function' ? random : Math.random;
    }

    function shuffle(list, random) {
        var arr = list.slice();
        var rand = randomOf(random);
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(rand() * (i + 1));
            var swap = arr[i];
            arr[i] = arr[j];
            arr[j] = swap;
        }
        return arr;
    }

    function pickFrom(list, recent, random) {
        if (!list.length) return null;
        var rand = randomOf(random);
        var choice = list[Math.floor(rand() * list.length)];
        var safety = 0;
        while (choice && recent.indexOf(choice.id) !== -1 && safety < 30) {
            choice = list[Math.floor(rand() * list.length)];
            safety++;
        }
        return choice || null;
    }

    function pickType(types, random) {
        var weighted = Q_TYPES.filter(function (entry) { return types.indexOf(entry[0]) !== -1; });
        var total = weighted.reduce(function (sum, entry) { return sum + entry[1]; }, 0);
        if (!total) return null;
        var cursor = randomOf(random)() * total;
        for (var i = 0; i < weighted.length; i++) {
            cursor -= weighted[i][1];
            if (cursor <= 0) return weighted[i][0];
        }
        return weighted[weighted.length - 1][0];
    }

    function pickFieldDistractors(correct, pool, field, n, random) {
        var answer = correct[field];
        var same = shuffle(pool.filter(function (inst) {
            return inst.family === correct.family && inst[field] && inst[field] !== answer;
        }), random);
        var diff = shuffle(pool.filter(function (inst) {
            return inst.family !== correct.family && inst[field] && inst[field] !== answer;
        }), random);
        var seen = Object.create(null);
        seen[answer] = true;
        var wrongs = [];
        function take(list, cap) {
            for (var i = 0; i < list.length; i++) {
                if (wrongs.length >= cap) return;
                var value = list[i][field];
                if (!value || seen[value]) continue;
                seen[value] = true;
                wrongs.push(value);
            }
        }
        take(same, Math.min(2, n));
        take(diff, n);
        take(same, n);
        return wrongs.slice(0, n);
    }

    function pickImageDistractors(correct, pool, n, random) {
        var same = shuffle(pool.filter(function (inst) {
            return inst.id !== correct.id && inst.family === correct.family;
        }), random);
        var diff = shuffle(pool.filter(function (inst) {
            return inst.id !== correct.id && inst.family !== correct.family;
        }), random);
        var result = [];
        function take(list) {
            for (var i = 0; i < list.length; i++) {
                if (result.length >= n) return;
                if (result.indexOf(list[i]) === -1) result.push(list[i]);
            }
        }
        var capped = [];
        for (var i = 0; i < same.length && capped.length < Math.min(2, n); i++) capped.push(same[i]);
        result = capped.slice();
        take(diff);
        take(same);
        return result.slice(0, n);
    }

    function makeQuestion(pool, type, recent, random) {
        var photos = pool.filter(hasPhoto);
        var source = pool;
        if (type === 'image-name' || type === 'name-image' || type === 'sound-source') source = photos;
        if (type === 'percussion-pitch') source = pool.filter(function (inst) { return inst.family === 'percussion'; });
        if (type === 'listen-name') source = pool.filter(hasSynth);
        var correct = pickFrom(source, recent, random);
        if (!correct) return null;

        var answer = '';
        var options = [];
        var imgOptions = null;
        if (type === 'image-name') {
            answer = correct.nameZh;
            var names = pickFieldDistractors(correct, pool, 'nameZh', 3, random);
            if (!names.length) return null;
            options = shuffle([answer].concat(names), random);
        } else if (type === 'name-image') {
            answer = correct.id;
            var images = pickImageDistractors(correct, photos, 3, random);
            if (!images.length) return null;
            imgOptions = shuffle([correct].concat(images), random);
            options = imgOptions.map(function (inst) { return inst.id; });
        } else if (type === 'name-family') {
            answer = correct.familyZh;
            var families = uniqueValues(pool, function (inst) { return inst.familyZh; }).filter(function (label) {
                return label !== answer;
            });
            if (!families.length) return null;
            options = shuffle([answer].concat(shuffle(families, random).slice(0, 3)), random);
        } else if (type === 'percussion-pitch') {
            answer = hasPitch(correct.id) ? '有固定音高' : '沒有固定音高';
            options = ['有固定音高', '沒有固定音高'];
        } else if (type === 'sound-source') {
            answer = soundLabel(correct);
            var methods = uniqueValues(pool, soundLabel).filter(function (label) { return label && label !== answer; });
            if (!answer || !methods.length) return null;
            options = shuffle([answer].concat(shuffle(methods, random).slice(0, 3)), random);
        } else if (type === 'listen-name') {
            answer = correct.nameZh;
            var heard = pickFieldDistractors(correct, pool, 'nameZh', 3, random);
            if (!heard.length || !hasSynth(correct)) return null;
            options = shuffle([answer].concat(heard), random);
        } else {
            return null;
        }

        var unique = Object.create(null);
        var distinct = true;
        options.forEach(function (option) {
            if (unique[option]) distinct = false;
            unique[option] = true;
        });
        if (!distinct || options.length < 2 || !unique[answer]) return null;
        return { instrument: correct, type: type, answer: answer, options: options, imgOptions: imgOptions };
    }

    function buildQuestions(spec, count, random, promptMode) {
        var pool = (spec && spec.instruments) || [];
        var total = count > 0 ? count : 0;
        var types = availableTypes(pool, promptMode);
        if (pool.length < 2 || !types.length || !total) return [];
        var questions = [];
        var recent = [];
        var recentWindow = Math.min(8, Math.floor(pool.length * 0.5));
        var guard = 0;
        while (questions.length < total && guard < total * 12) {
            guard++;
            var type = pickType(types, random);
            var question = type ? makeQuestion(pool, type, recent, random) : null;
            if (!question) continue;
            questions.push(question);
            recent.push(question.instrument.id);
            if (recent.length > recentWindow) recent.shift();
        }
        return questions;
    }

    return {
        STORAGE_KEY: STORAGE_KEY,
        PROMPT_KEY: PROMPT_KEY,
        SYNTH_NOTE: SYNTH_NOTE,
        SOUND_LABELS: SOUND_LABELS,
        isChineseFamily: isChineseFamily,
        catalog: catalog,
        resolve: resolve,
        recordsRank: recordsRank,
        submitsGlobal: submitsGlobal,
        profileTimerAction: profileTimerAction,
        loadSelection: loadSelection,
        saveSelection: saveSelection,
        normalizePrompt: normalizePrompt,
        loadPrompt: loadPrompt,
        savePrompt: savePrompt,
        soundLabel: soundLabel,
        hasPitch: hasPitch,
        availableTypes: availableTypes,
        buildQuestions: buildQuestions
    };
});
