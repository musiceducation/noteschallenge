/**
 * 練習模式自訂出題。對應 musictheory.net Note Identification 的 Customize 項目，
 * 用這個站的譜位與音名，不使用對方的圖檔或版面。
 * 譜位 0 是該譜號的中線，往上為正、偶數是線、奇數是間。
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.PracticeCustomize = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    var STEPS = [0, 2, 4, 5, 7, 9, 11];
    var STORAGE_KEY = 'musicGamePracticeCustomizeV1';
    var CHROMATIC_SKIP = { 4: 1, 26: 1, 34: 1, 66: 1 };

    var CLEFS = [
        { id: 'grand', zh: '大譜表', code: 28, extent: 12, grand: true },
        { id: 'treble', zh: '高音譜號', vex: 'treble', code: 34, extent: 8 },
        { id: 'bass', zh: '低音譜號', vex: 'bass', code: 22, extent: 8 },
        { id: 'alto', zh: '中音譜號', vex: 'alto', code: 28, extent: 8 },
        { id: 'tenor', zh: '次中音譜號', vex: 'tenor', code: 26, extent: 8 },
        { id: 'soprano', zh: '女高音譜號', vex: 'soprano', code: 32, extent: 8 },
        { id: 'mezzo', zh: '女中音譜號', vex: 'mezzo-soprano', code: 30, extent: 8 },
        { id: 'baritone', zh: '男中音譜號', vex: 'baritone-f', code: 24, extent: 8 }
    ];
    var CLEF_BY_ID = {};
    CLEFS.forEach(function (clef) { CLEF_BY_ID[clef.id] = clef; });

    var NOTE_NAMES = [
        { id: 0, zh: '字母', group: 'letter' },
        { id: 11, zh: '字母（A 到 G）', group: 'letter' },
        { id: 1, zh: '固定唱名 Do–Si', group: 'fixed' },
        { id: 2, zh: '固定唱名 Do–Ti', group: 'fixed' },
        { id: 3, zh: '固定唱名 Ut–Si', group: 'fixed' },
        { id: 4, zh: '固定唱名 Ut–Ti', group: 'fixed' },
        { id: 13, zh: '固定唱名（半音）', group: 'fixed' },
        { id: 5, zh: '首調唱名 Do', group: 'scale' },
        { id: 6, zh: '首調小調 Do', group: 'scale' },
        { id: 12, zh: '首調小調 La', group: 'scale' },
        { id: 7, zh: '音級整數', group: 'integer' },
        { id: 8, zh: '音級整數（t、e）', group: 'integer' },
        { id: 9, zh: '音級（大調）', group: 'scale' },
        { id: 10, zh: '音級（小調）', group: 'scale' },
        { id: 14, zh: '德文音名', group: 'letter' }
    ];
    var NAME_BY_ID = {};
    NOTE_NAMES.forEach(function (item) { NAME_BY_ID[item.id] = item; });

    var KEY_SPECS = {
        0: null, 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#',
        '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db', '-6': 'Gb', '-7': 'Cb'
    };
    var KEY_ZH = {
        0: '無調號', 1: '一個升號', 2: '兩個升號', 3: '三個升號', 4: '四個升號',
        5: '五個升號', 6: '六個升號', 7: '七個升號',
        '-1': '一個降號', '-2': '兩個降號', '-3': '三個降號', '-4': '四個降號',
        '-5': '五個降號', '-6': '六個降號', '-7': '七個降號'
    };
    var DURATIONS = [
        { id: 0, zh: '全音符', vex: 'w' },
        { id: 1, zh: '二分音符', vex: 'h' },
        { id: 2, zh: '四分音符', vex: 'q' }
    ];
    var NEXT_MODES = [
        { id: 0, zh: '立即' },
        { id: 1, zh: '等待' },
        { id: 2, zh: '播放後' },
        { id: 3, zh: '動畫後' }
    ];

    function mod(n, m) { return ((n % m) + m) % m; }
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
    function nameGroup(id) {
        var item = NAME_BY_ID[id];
        return item ? item.group : 'letter';
    }
    function isScaleStyle(id) { return nameGroup(id) === 'scale'; }
    function isIntegerStyle(id) { return nameGroup(id) === 'integer'; }

    function defaultRange(clefId) {
        var clef = CLEF_BY_ID[clefId] || CLEF_BY_ID.treble;
        return { low: -clef.extent, high: clef.extent };
    }

    function defaultSettings() {
        var ranges = {};
        CLEFS.forEach(function (clef) { ranges[clef.id] = defaultRange(clef.id); });
        return {
            clefs: ['treble'],
            ranges: ranges,
            positions: 0,
            keySignatures: [0],
            noteValues: [0],
            noteNames: 0,
            helpers: false,
            accidentals: true,
            noteFilter: false,
            notes: spellingTags().slice(),
            next: 2
        };
    }

    function spellingTags() {
        var tags = [];
        for (var letter = 0; letter < 7; letter++) {
            tags.push(letter * 10 + 4, letter * 10 + 5, letter * 10 + 6);
        }
        return tags;
    }

    function normalize(raw) {
        var base = defaultSettings();
        var src = raw && typeof raw === 'object' ? raw : {};
        var clefs = [];
        (Array.isArray(src.clefs) ? src.clefs : base.clefs).forEach(function (id) {
            if (CLEF_BY_ID[id] && clefs.indexOf(id) < 0) clefs.push(id);
        });
        if (!clefs.length) clefs = ['treble'];
        var ranges = {};
        CLEFS.forEach(function (clef) {
            var given = src.ranges && src.ranges[clef.id];
            var low = given ? Math.round(Number(given.low)) : -clef.extent;
            var high = given ? Math.round(Number(given.high)) : clef.extent;
            if (!isFinite(low)) low = -clef.extent;
            if (!isFinite(high)) high = clef.extent;
            low = clamp(low, -clef.extent, clef.extent);
            high = clamp(high, -clef.extent, clef.extent);
            if (low > high) { var swap = low; low = high; high = swap; }
            ranges[clef.id] = { low: low, high: high };
        });
        var positions = [0, 1, 2].indexOf(Number(src.positions)) >= 0 ? Number(src.positions) : 0;
        var keys = [];
        (Array.isArray(src.keySignatures) ? src.keySignatures : [0]).forEach(function (key) {
            var n = Math.round(Number(key));
            if (n >= -7 && n <= 7 && keys.indexOf(n) < 0) keys.push(n);
        });
        if (!keys.length) keys = [0];
        var values = [];
        (Array.isArray(src.noteValues) ? src.noteValues : [0]).forEach(function (value) {
            var n = Math.round(Number(value));
            if ((n === 0 || n === 1 || n === 2) && values.indexOf(n) < 0) values.push(n);
        });
        if (!values.length) values = [0];
        var noteNames = NAME_BY_ID[src.noteNames] ? Number(src.noteNames) : 0;
        var group = nameGroup(noteNames);
        var notes = [];
        var allowed = spellingTags();
        (Array.isArray(src.notes) ? src.notes : allowed).forEach(function (tag) {
            var n = Math.round(Number(tag));
            if (allowed.indexOf(n) >= 0 && notes.indexOf(n) < 0) notes.push(n);
        });
        if (noteNames === 13) notes = notes.filter(function (tag) { return !CHROMATIC_SKIP[tag]; });
        if (!notes.length) notes = allowed.filter(function (tag) { return noteNames !== 13 || !CHROMATIC_SKIP[tag]; });
        var next = [0, 1, 2, 3].indexOf(Number(src.next)) >= 0 ? Number(src.next) : 2;
        return {
            clefs: clefs,
            ranges: ranges,
            positions: positions,
            keySignatures: keys,
            noteValues: values,
            noteNames: noteNames,
            helpers: group === 'integer' ? false : !!src.helpers,
            accidentals: src.accidentals !== false,
            noteFilter: group === 'integer' || group === 'scale' ? false : !!src.noteFilter,
            notes: notes,
            next: next
        };
    }

    function clickRange(low, high, position, extent) {
        var pos = clamp(Math.round(Number(position)), -extent, extent);
        var lo = Math.round(Number(low));
        var hi = Math.round(Number(high));
        if (Math.abs(pos - lo) <= Math.abs(pos - hi)) lo = pos;
        else hi = pos;
        if (lo > hi) { var swap = lo; lo = hi; hi = swap; }
        return { low: lo, high: hi };
    }

    function pitchAt(code, position) {
        var index = code + position;
        return { letter: mod(index, 7), octave: Math.floor(index / 7) };
    }

    function midiOf(letter, octave, quality) {
        return [12, 14, 16, 17, 19, 21, 23][letter] + octave * 12 + quality;
    }

    function freqKeyFromMidi(midi) {
        var names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        var pc = mod(midi, 12);
        return names[pc] + (Math.floor(midi / 12) - 1);
    }

    function keyAccidental(letter, keySig) {
        if (!keySig) return 0;
        var abs = Math.abs(keySig);
        var span = Math.floor(abs / 7) + 1;
        var rem = abs % 7;
        if (keySig < 0) {
            var flat = [6, 4, 2, 7, 5, 3, 1][letter];
            return flat <= rem ? -span : 1 - span;
        }
        var sharp = [2, 4, 6, 1, 3, 5, 7][letter];
        return sharp <= rem ? span : span - 1;
    }

    function diatonicQuality(letter, keySig) {
        return keyAccidental(letter, keySig) === 0 ? 0 : (keySig < 0 ? -1 : 1);
    }

    function printedAccidental(quality, letter, keySig) {
        return quality === keyAccidental(letter, keySig) ? -100 : quality;
    }

    function accidentalChoices(settings) {
        if (!settings.accidentals) return [-100];
        var list = [-1, 0, 1];
        if (isIntegerStyle(settings.noteNames)) list.push(-2, 2);
        return list;
    }

    function positionKindOk(position, positions) {
        var line = mod(position, 2) === 0;
        if (positions === 1) return line;
        if (positions === 2) return !line;
        return true;
    }

    function drawPlacement(clef, position) {
        if (!clef.grand) return { vex: clef.vex, position: position, staff: clef.id };
        if (position >= 0) return { vex: 'treble', position: position - 6, staff: 'treble' };
        return { vex: 'bass', position: position + 6, staff: 'bass' };
    }

    function spellingTag(letter, quality) { return letter * 10 + 5 + quality; }

    function allowedTagList(settings) {
        if (settings.noteNames === 13) {
            var base = settings.noteFilter ? settings.notes : spellingTags();
            return base.filter(function (tag) { return !CHROMATIC_SKIP[tag]; });
        }
        if (!settings.noteFilter) return null;
        return settings.notes.slice();
    }

    function tonic(style, keySig) {
        var minor = !(style === 5 || style === 9);
        var cursor = keySig + (minor ? 4 : 1);
        var circle = [3, 0, 4, 1, 5, 2, 6];
        return { letter: circle[mod(cursor, 7)], quality: Math.floor(cursor / 7) };
    }

    function intervalTag(noteLetter, noteOctave, quality, ton) {
        var oct = noteOctave;
        if (noteLetter < ton.letter) oct -= 1;
        var dia = (noteOctave * 7 + noteLetter) - (oct * 7 + ton.letter);
        if (dia < 0) dia += 7;
        var expected = [0, 2, 4, 5, 7, 9, 11][dia % 7] + 12 * Math.floor(dia / 7);
        var qual = (midiOf(noteLetter, noteOctave, quality) - midiOf(ton.letter, oct, ton.quality)) - expected;
        var number = dia + 1;
        var perfect = number % 7 === 1 || number % 7 === 4 || number % 7 === 5;
        if (qual <= -1 && perfect) qual -= 1;
        var tag = number * 10 + 5 + qual;
        if (perfect && qual <= -2) tag += 1;
        return tag;
    }

    function degreeSet(style, accidentalsOn) {
        if (!accidentalsOn) {
            return (style === 5 || style === 9) ? [15, 25, 35, 45, 55, 65, 75] : [15, 25, 34, 45, 55, 64, 74];
        }
        if (style === 5 || style === 9) return [15, 16, 24, 25, 26, 34, 35, 45, 46, 54, 55, 56, 64, 65, 66, 74, 75];
        if (style === 6 || style === 10) return [15, 16, 24, 25, 26, 34, 35, 45, 46, 54, 55, 56, 64, 65, 74, 75];
        return [15, 16, 24, 25, 34, 35, 45, 46, 54, 55, 64, 65, 74, 75];
    }

    function accMark(quality) {
        if (quality === 1) return '#';
        if (quality === -1) return 'b';
        if (quality === 2) return '##';
        if (quality === -2) return 'bb';
        return '';
    }

    function vexAccidental(printed) {
        if (printed === -100) return null;
        if (printed === 0) return 'n';
        if (printed === 1) return '#';
        if (printed === -1) return 'b';
        if (printed === 2) return '##';
        if (printed === -2) return 'bb';
        return null;
    }

    function letterLabel(style, letter, quality) {
        var name = LETTERS[letter];
        if (style === 14) return germanLabel(letter, quality);
        if (style === 1 || style === 2 || style === 3 || style === 4 || style === 13) return solfegeFixed(style, letter, quality);
        if (!quality) return name;
        if (quality === 1) return name + '#';
        if (quality === -1) return name + '♭';
        if (quality === 2) return name + '×';
        if (quality === -2) return name + '𝄫';
        return name;
    }

    function germanLabel(letter, quality) {
        if (letter === 6 && quality === -1) return 'B';
        var names = ['C', 'D', 'E', 'F', 'G', 'A', 'H'];
        if (!quality) return names[letter];
        var suffix = ['eseseses', 'eseses', 'eses', 'es', '', 'is', 'isis', 'isisis', 'isisisis'][quality + 4] || '';
        if (quality <= -1 && (letter === 2 || letter === 5)) return names[letter] + suffix.slice(1);
        return names[letter] + suffix;
    }

    function solfegeFixed(style, letter, quality) {
        var tag = spellingTag(letter, quality);
        if (style === 13) {
            var chromatic = { 6: 'Di', 14: 'Ra', 16: 'Ri', 24: 'Me', 36: 'Fi', 44: 'Se', 46: 'Si', 54: 'Le', 56: 'Li', 64: 'Te' };
            if (chromatic[tag]) return chromatic[tag];
        }
        var ut = style === 3 || style === 4;
        var si = style === 3 || style === 1 || style === 13;
        var syllable = [ut ? 'Ut' : 'Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', si ? 'Si' : 'Ti'][letter];
        if (!quality) return syllable;
        if (quality === 1) return syllable + '♯';
        if (quality === -1) return syllable + '♭';
        if (quality === 2) return syllable + '×';
        return syllable + '𝄫';
    }

    function integerLabel(style, pc) {
        if (style === 8 && pc === 10) return 't';
        if (style === 8 && pc === 11) return 'e';
        return String(pc);
    }

    function degreeLabel(style, tag) {
        var minorLa = style === 12;
        var minorNumbers = style === 6 || style === 10 || style === 12;
        if (style === 9 || style === 10) return degreeNumber(tag, minorNumbers);
        return degreeSolfege(tag, minorLa);
    }

    function degreeNumber(tag, minor) {
        var map = { 15: '1', 16: '♯1', 24: '♭2', 25: '2', 26: '♯2', 45: '4', 46: '♯4', 54: '♭5', 55: '5', 56: '♯5' };
        if (map[tag]) return map[tag];
        if (!minor) {
            return { 34: '♭3', 35: '3', 64: '♭6', 65: '6', 66: '♯6', 74: '♭7', 75: '7' }[tag] || String(tag);
        }
        return { 34: '3', 35: '♯3', 64: '6', 65: '♯6', 74: '7', 75: '♯7' }[tag] || String(tag);
    }

    function degreeSolfege(tag, minorLa) {
        if (minorLa) {
            return { 15: 'La', 16: 'Li', 24: 'Te', 25: 'Ti', 34: 'Do', 35: 'Di', 45: 'Re', 46: 'Ri', 54: 'Me', 55: 'Mi', 64: 'Fa', 65: 'Fi', 74: 'Sol', 75: 'Si' }[tag] || String(tag);
        }
        return {
            14: 'De', 15: 'Do', 16: 'Di', 24: 'Ra', 25: 'Re', 26: 'Ri', 34: 'Me', 35: 'Mi', 36: 'Ma',
            44: 'Fe', 45: 'Fa', 46: 'Fi', 54: 'Se', 55: 'Sol', 56: 'Si', 64: 'Le', 65: 'La', 66: 'Li',
            74: 'Te', 75: 'Ti', 76: 'To'
        }[tag] || String(tag);
    }

    function answerFor(style, letter, octave, quality, keySig) {
        if (isIntegerStyle(style)) {
            var pc = mod(STEPS[letter] + quality, 12);
            return { id: 'pc' + pc, label: integerLabel(style, pc) };
        }
        if (isScaleStyle(style)) {
            var tag = intervalTag(letter, octave, quality, tonic(style, keySig));
            return { id: 'sd' + tag, label: degreeLabel(style, tag), degree: tag };
        }
        var spell = spellingTag(letter, quality);
        return { id: 'sp' + spell, label: letterLabel(style, letter, quality), spelling: spell };
    }

    function questions(raw) {
        var settings = normalize(raw);
        var tags = allowedTagList(settings);
        var choices = accidentalChoices(settings);
        var degrees = isScaleStyle(settings.noteNames) ? degreeSet(settings.noteNames, settings.accidentals) : null;
        var out = [];
        settings.clefs.forEach(function (clefId) {
            var clef = CLEF_BY_ID[clefId];
            var range = settings.ranges[clefId];
            for (var position = range.low; position <= range.high; position++) {
                if (!positionKindOk(position, settings.positions)) continue;
                var pitch = pitchAt(clef.code, position);
                if (tags && !tags.some(function (tag) { return Math.floor(tag / 10) === pitch.letter; })) continue;
                settings.keySignatures.forEach(function (keySig) {
                    choices.forEach(function (choice) {
                        var quality = choice === -100 ? diatonicQuality(pitch.letter, keySig) : choice;
                        var spell = spellingTag(pitch.letter, quality);
                        if (tags && tags.indexOf(spell) < 0) return;
                        var answer = answerFor(settings.noteNames, pitch.letter, pitch.octave, quality, keySig);
                        if (degrees && degrees.indexOf(answer.degree) < 0) return;
                        var printed = printedAccidental(quality, pitch.letter, keySig);
                        var placed = drawPlacement(clef, position);
                        var midi = midiOf(pitch.letter, pitch.octave, quality);
                        settings.noteValues.forEach(function (value) {
                            var duration = DURATIONS[value];
                            out.push({
                                abrsm: true,
                                custom: true,
                                clef: placed.vex,
                                clefId: clefId,
                                clefZh: clef.zh,
                                grand: !!clef.grand,
                                position: position,
                                drawPosition: placed.position,
                                keySig: keySig,
                                keySpec: KEY_SPECS[String(keySig)] || null,
                                letter: LETTERS[pitch.letter],
                                letterIndex: pitch.letter,
                                octave: pitch.octave,
                                quality: quality,
                                printed: printed,
                                accidental: printed === -100 ? null : printed === 0 ? 'n' : accMark(quality) === 'b' ? '♭' : accMark(quality) === 'bb' ? '𝄫' : accMark(quality) === '##' ? '×' : accMark(quality),
                                vexKey: LETTERS[pitch.letter].toLowerCase() + (printed === -100 || printed === 0 ? '' : accMark(printed)) + '/' + pitch.octave,
                                vexAccidental: vexAccidental(printed),
                                vexDuration: duration.vex,
                                correctName: answer.label,
                                answerId: answer.id,
                                freqKey: freqKeyFromMidi(midi),
                                helpers: helperLabels(settings, clef, keySig)
                            });
                        });
                    });
                });
            }
        });
        return out;
    }

    function helperLabels(settings, clef, keySig) {
        if (!settings.helpers || isIntegerStyle(settings.noteNames)) return [];
        var lines = settings.positions !== 2;
        var spaces = settings.positions !== 1;
        var staves = clef.grand
            ? [{ id: 'treble', vex: 'treble', code: 34 }, { id: 'bass', vex: 'bass', code: 22 }]
            : [{ id: clef.id, vex: clef.vex, code: clef.code }];
        var labels = [];
        if (isScaleStyle(settings.noteNames)) {
            var ton = tonic(settings.noteNames, keySig);
            var text = settings.noteNames === 9 || settings.noteNames === 10 ? '1' : (settings.noteNames === 12 ? 'La' : 'Do');
            staves.forEach(function (staff) {
                for (var position = -4; position <= 4; position++) {
                    var pitch = pitchAt(staff.code, position);
                    if (pitch.letter !== ton.letter) continue;
                    if (mod(position, 2) === 0 && !lines) continue;
                    if (mod(position, 2) !== 0 && !spaces) continue;
                    labels.push({ staff: staff.id, position: position, text: text });
                    break;
                }
            });
            return labels;
        }
        staves.forEach(function (staff) {
            for (var position = -4; position <= 4; position++) {
                var line = mod(position, 2) === 0;
                if (line && !lines) continue;
                if (!line && !spaces) continue;
                var pitch = pitchAt(staff.code, position);
                var quality = diatonicQuality(pitch.letter, keySig);
                labels.push({
                    staff: staff.id,
                    position: position,
                    text: letterLabel(settings.noteNames, pitch.letter, quality)
                });
            }
        });
        return labels;
    }

    function answerButtons(raw) {
        var settings = normalize(raw);
        var style = settings.noteNames;
        if (isIntegerStyle(style)) {
            var rows = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]];
            return rows.map(function (row) {
                return row.map(function (pc) {
                    return { id: 'pc' + pc, label: integerLabel(style, pc), key: pc === 10 ? 't' : pc === 11 ? 'e' : String(pc) };
                });
            });
        }
        if (isScaleStyle(style)) {
            var ids = degreeSet(style, settings.accidentals);
            var major = style === 5 || style === 9;
            var layout = major
                ? [[16, 26, null, 46, 56, 66, null], [15, 25, 35, 45, 55, 65, 75], [null, 24, 34, null, 54, 64, 74]]
                : [[16, 26, 35, 46, 56, 65, 75], [15, 25, 34, 45, 55, 64, 74], [null, 24, null, null, 54, null, null]];
            if (!settings.accidentals) {
                layout = major
                    ? [[null, null, null, null, null, null, null], [15, 25, 35, 45, 55, 65, 75], [null, null, null, null, null, null, null]]
                    : [[null, null, null, null, null, null, null], [15, 25, 34, 45, 55, 64, 74], [null, null, null, null, null, null, null]];
            }
            return layout.map(function (row, rowIndex) {
                return row.map(function (tag) {
                    if (tag == null || ids.indexOf(tag) < 0) return null;
                    return { id: 'sd' + tag, label: degreeLabel(style, tag), key: rowIndex === 1 && tag % 10 === 5 ? String(Math.floor(tag / 10)) : '' };
                });
            });
        }
        var order = style === 11 ? [5, 6, 0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6];
        var qualities = [1, 0, -1];
        return qualities.map(function (quality) {
            return order.map(function (letter) {
                var tag = spellingTag(letter, quality);
                if (settings.noteNames === 13 && CHROMATIC_SKIP[tag]) return null;
                if (settings.noteFilter && settings.notes.indexOf(tag) < 0) return null;
                var shortcut = quality === 0 ? LETTERS[letter].toLowerCase() : '';
                return { id: 'sp' + tag, label: letterLabel(style, letter, quality), key: shortcut };
            });
        });
    }

    function rangeModel(clefId, low, high) {
        var clef = CLEF_BY_ID[clefId] || CLEF_BY_ID.treble;
        var extent = clef.extent;
        var lo = clamp(Math.round(low), -extent, extent);
        var hi = clamp(Math.round(high), -extent, extent);
        if (lo > hi) { var swap = lo; lo = hi; hi = swap; }
        var positions = [];
        for (var position = extent; position >= -extent; position--) {
            var pitch = pitchAt(clef.code, position);
            var placed = drawPlacement(clef, position);
            positions.push({
                position: position,
                letter: LETTERS[pitch.letter],
                octave: pitch.octave,
                included: position >= lo && position <= hi,
                endpoint: position === lo || position === hi,
                line: mod(position, 2) === 0,
                staff: placed.staff,
                drawPosition: placed.position
            });
        }
        return { clef: clef, low: lo, high: hi, positions: positions };
    }

    function controls() {
        return [
            { id: 'clefs', source: 'Clefs', zh: '譜號' },
            { id: 'ranges', source: 'Treble/Bass/Alto/Tenor/Soprano/Mezzo-sop./Baritone/Grand Range', zh: '音域' },
            { id: 'positions', source: 'Positions', zh: '位置' },
            { id: 'keySignatures', source: 'Key Signatures', zh: '調號' },
            { id: 'noteValues', source: 'Note Values', zh: '音符時值' },
            { id: 'noteNames', source: 'Note Names', zh: '音名' },
            { id: 'helpers', source: 'Helpers', zh: '提示' },
            { id: 'accidentals', source: 'Accidentals', zh: '臨時記號' },
            { id: 'noteFilter', source: 'Note Filter', zh: '音高篩選' },
            { id: 'next', source: 'Next Question', zh: '下一題' }
        ];
    }

    function esc(value) {
        return String(value).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function staffBlock(clefId, positions, title) {
        if (!positions.length) return '';
        var visuals = positions.map(function (item) { return item.visual == null ? item.position : item.visual; });
        var extentTop = Math.max.apply(null, visuals);
        var extentBottom = Math.min.apply(null, visuals);
        var step = 13;
        var height = (extentTop - extentBottom) * step + 28;
        var lines = [4, 2, 0, -2, -4].filter(function (line) {
            return line <= extentTop && line >= extentBottom;
        });
        var lineHtml = lines.map(function (line) {
            var top = (extentTop - line) * step + 14;
            return '<span class="pc-line" style="top:' + top + 'px"></span>';
        }).join('');
        var ledgerHtml = positions.filter(function (item) {
            var visual = item.visual == null ? item.position : item.visual;
            return Math.abs(visual) > 4 && visual % 2 === 0;
        }).map(function (item) {
            var visual = item.visual == null ? item.position : item.visual;
            var top = (extentTop - visual) * step + 14;
            return '<span class="pc-line pc-ledger" style="top:' + top + 'px"></span>';
        }).join('');
        var notes = positions.map(function (item) {
            var visual = item.visual == null ? item.position : item.visual;
            var top = (extentTop - visual) * step + 14;
            var cls = 'pc-note' + (item.included ? ' is-in' : '') + (item.endpoint ? ' is-end' : '');
            var name = item.letter + item.octave;
            return '<button type="button" class="' + cls + '" data-range-clef="' + esc(clefId) + '" data-range-pos="' + item.position + '" style="top:' + top + 'px" aria-label="' + esc(name) + (item.included ? '，範圍內' : '，範圍外') + '"></button>';
        }).join('');
        var heading = title ? '<div class="pc-staff-name">' + esc(title) + '</div>' : '';
        return '<div class="pc-staff-block">' + heading + '<div class="pc-staff" style="height:' + height + 'px">' + lineHtml + ledgerHtml + notes + '</div></div>';
    }

    function rangeCard(settings, clef) {
        var range = settings.ranges[clef.id];
        var model = rangeModel(clef.id, range.low, range.high);
        var lowNote = model.positions.filter(function (item) { return item.position === model.low; })[0];
        var highNote = model.positions.filter(function (item) { return item.position === model.high; })[0];
        var span = (lowNote ? lowNote.letter + lowNote.octave : '') + ' – ' + (highNote ? highNote.letter + highNote.octave : '');
        var body;
        if (clef.grand) {
            var treble = model.positions.filter(function (item) { return item.position >= 0; }).map(function (item) {
                return { position: item.position, visual: item.drawPosition, letter: item.letter, octave: item.octave, included: item.included, endpoint: item.endpoint };
            });
            var bass = model.positions.filter(function (item) { return item.position < 0; }).map(function (item) {
                return { position: item.position, visual: item.drawPosition, letter: item.letter, octave: item.octave, included: item.included, endpoint: item.endpoint };
            });
            body = staffBlock(clef.id, treble, '高音') + staffBlock(clef.id, bass, '低音');
        } else body = staffBlock(clef.id, model.positions, '');
        return '<section class="pc-range-card"><h3>' + esc(clef.zh) + '音域</h3><p class="pc-range-span">' + esc(span) + '</p>' + body + '</section>';
    }

    function panelHtml(settings) {
        var group = nameGroup(settings.noteNames);
        var clefBtns = CLEFS.map(function (clef) {
            var on = settings.clefs.indexOf(clef.id) >= 0;
            return '<button type="button" class="pc-choice' + (on ? ' is-on' : '') + '" data-clef="' + clef.id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(clef.zh) + '</button>';
        }).join('');
        var ranges = settings.clefs.map(function (id) { return rangeCard(settings, CLEF_BY_ID[id]); }).join('');
        var positions = [
            { id: 0, zh: '線與間' },
            { id: 1, zh: '只限線' },
            { id: 2, zh: '只限間' }
        ].map(function (item) {
            var on = settings.positions === item.id;
            return '<button type="button" class="pc-choice' + (on ? ' is-on' : '') + '" data-positions="' + item.id + '" aria-pressed="' + on + '">' + item.zh + '</button>';
        }).join('');
        var keyOrder = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7];
        var keys = keyOrder.map(function (key) {
            var on = settings.keySignatures.indexOf(key) >= 0;
            return '<button type="button" class="pc-choice pc-key' + (on ? ' is-on' : '') + '" data-key="' + key + '" aria-pressed="' + on + '">' + esc(KEY_ZH[String(key)]) + '</button>';
        }).join('');
        var values = DURATIONS.map(function (item) {
            var on = settings.noteValues.indexOf(item.id) >= 0;
            return '<button type="button" class="pc-choice' + (on ? ' is-on' : '') + '" data-value="' + item.id + '" aria-pressed="' + on + '">' + item.zh + '</button>';
        }).join('');
        var names = NOTE_NAMES.map(function (item) {
            return '<option value="' + item.id + '"' + (settings.noteNames === item.id ? ' selected' : '') + '>' + esc(item.zh) + '</option>';
        }).join('');
        var next = NEXT_MODES.map(function (item) {
            var on = settings.next === item.id;
            return '<button type="button" class="pc-choice' + (on ? ' is-on' : '') + '" data-next="' + item.id + '" aria-pressed="' + on + '">' + item.zh + '</button>';
        }).join('');
        var helperRow = group === 'integer' ? '' : toggleRow('helpers', '提示', settings.helpers, '在五線上標出線或間的音名。音級整數沒有這項。');
        var accHint = isIntegerStyle(settings.noteNames)
            ? '開：降號、還原號、升號，以及變降號、變升號。關：只出調號裡的音。'
            : '開：降號、還原號、升號。關：只出調號裡的音。';
        var filterRow = group === 'integer' || group === 'scale' ? '' : (
            toggleRow('noteFilter', '音高篩選', settings.noteFilter, '只出勾選的音名。首調與音級不用這項。') +
            (settings.noteFilter ? '<div class="pc-spell-grid" role="group" aria-label="音高篩選">' + spellingButtons(settings) + '</div>' : '')
        );
        var count = questions(settings).length;
        var status = count
            ? '這個設定可以出 ' + count + ' 種題。'
            : '這個範圍出不到題。請放寬音域、位置或調號。';
        return '' +
            '<section class="pc-block"><h3>譜號</h3><div class="pc-choices" role="group" aria-label="譜號">' + clefBtns + '</div></section>' +
            '<section class="pc-block"><h3>音域</h3><p class="pc-help">點譜上的音，改最低音或最高音。實心是會出現的音，範圍包含兩端。</p><div class="pc-ranges">' + ranges + '</div></section>' +
            '<section class="pc-block"><h3>位置</h3><div class="pc-choices" role="group" aria-label="位置">' + positions + '</div></section>' +
            '<section class="pc-block"><h3>調號</h3><div class="pc-choices pc-keys" role="group" aria-label="調號">' + keys + '</div></section>' +
            '<section class="pc-block"><h3>音符時值</h3><div class="pc-choices" role="group" aria-label="音符時值">' + values + '</div></section>' +
            '<section class="pc-block"><h3>音名</h3><label class="pc-select-label">答題用的名稱<select id="pcNoteNames" class="pc-select">' + names + '</select></label></section>' +
            helperRow +
            toggleRow('accidentals', '臨時記號', settings.accidentals, accHint) +
            filterRow +
            '<section class="pc-block"><h3>下一題</h3><p class="pc-help">答對之後：立即換題、等你按下一題、先播放這個音，或先顯示答案動畫。</p><div class="pc-choices" role="group" aria-label="下一題">' + next + '</div></section>' +
            '<p class="pc-status' + (count ? '' : ' is-empty') + '" id="pcStatus">' + esc(status) + '</p>';
    }

    function toggleRow(key, title, on, help) {
        return '<section class="pc-block"><h3>' + title + '</h3><div class="pc-choices" role="group" aria-label="' + title + '">' +
            '<button type="button" class="pc-choice' + (on ? '' : ' is-on') + '" data-toggle="' + key + '" data-toggle-value="0" aria-pressed="' + (!on) + '">關</button>' +
            '<button type="button" class="pc-choice' + (on ? ' is-on' : '') + '" data-toggle="' + key + '" data-toggle-value="1" aria-pressed="' + (!!on) + '">開</button>' +
            '</div><p class="pc-help">' + esc(help) + '</p></section>';
    }

    function spellingButtons(settings) {
        var order = [0, 1, 2, 3, 4, 5, 6];
        return [-1, 0, 1].map(function (quality) {
            return '<div class="pc-spell-row">' + order.map(function (letter) {
                var tag = spellingTag(letter, quality);
                var disabled = settings.noteNames === 13 && CHROMATIC_SKIP[tag];
                var on = !disabled && settings.notes.indexOf(tag) >= 0;
                return '<button type="button" class="pc-spell' + (on ? ' is-on' : '') + '" data-spell="' + tag + '" aria-pressed="' + on + '"' + (disabled ? ' disabled' : '') + '>' + esc(letterLabel(0, letter, quality)) + '</button>';
            }).join('') + '</div>';
        }).join('');
    }

    function mount(container, raw, onChange) {
        var settings = normalize(raw);
        function emit(next) {
            settings = normalize(next);
            draw();
            if (onChange) onChange(settings);
        }
        function draw() {
            container.innerHTML = panelHtml(settings);
        }
        container.addEventListener('click', function (event) {
            var btn = event.target.closest('button');
            if (!btn || !container.contains(btn)) return;
            if (btn.dataset.clef) {
                var id = btn.dataset.clef;
                var clefs = settings.clefs.slice();
                var at = clefs.indexOf(id);
                if (at >= 0) { if (clefs.length === 1) return; clefs.splice(at, 1); }
                else clefs.push(id);
                clefs = CLEFS.map(function (clef) { return clef.id; }).filter(function (clefId) { return clefs.indexOf(clefId) >= 0; });
                emit(Object.assign({}, settings, { clefs: clefs }));
                return;
            }
            if (btn.dataset.rangeClef) {
                var clef = CLEF_BY_ID[btn.dataset.rangeClef];
                var current = settings.ranges[clef.id];
                var moved = clickRange(current.low, current.high, btn.dataset.rangePos, clef.extent);
                var ranges = Object.assign({}, settings.ranges);
                ranges[clef.id] = moved;
                emit(Object.assign({}, settings, { ranges: ranges }));
                return;
            }
            if (btn.dataset.positions != null && btn.dataset.positions !== '') {
                emit(Object.assign({}, settings, { positions: Number(btn.dataset.positions) }));
                return;
            }
            if (btn.dataset.key != null && btn.dataset.key !== '') {
                var key = Number(btn.dataset.key);
                var keys = settings.keySignatures.slice();
                var keyAt = keys.indexOf(key);
                if (keyAt >= 0) { if (keys.length === 1) return; keys.splice(keyAt, 1); }
                else keys.push(key);
                emit(Object.assign({}, settings, { keySignatures: keys }));
                return;
            }
            if (btn.dataset.value != null && btn.dataset.value !== '') {
                var value = Number(btn.dataset.value);
                var values = settings.noteValues.slice();
                var valueAt = values.indexOf(value);
                if (valueAt >= 0) { if (values.length === 1) return; values.splice(valueAt, 1); }
                else values.push(value);
                emit(Object.assign({}, settings, { noteValues: values }));
                return;
            }
            if (btn.dataset.toggle) {
                emit(Object.assign({}, settings, (function () {
                    var patch = {};
                    patch[btn.dataset.toggle] = btn.dataset.toggleValue === '1';
                    return patch;
                })()));
                return;
            }
            if (btn.dataset.spell) {
                var tag = Number(btn.dataset.spell);
                var notes = settings.notes.slice();
                var spellAt = notes.indexOf(tag);
                if (spellAt >= 0) { if (notes.length === 1) return; notes.splice(spellAt, 1); }
                else notes.push(tag);
                emit(Object.assign({}, settings, { notes: notes, noteFilter: true }));
                return;
            }
            if (btn.dataset.next != null && btn.dataset.next !== '') {
                emit(Object.assign({}, settings, { next: Number(btn.dataset.next) }));
            }
        });
        container.addEventListener('change', function (event) {
            if (event.target.id !== 'pcNoteNames') return;
            emit(Object.assign({}, settings, { noteNames: Number(event.target.value) }));
        });
        draw();
        return {
            read: function () { return settings; },
            write: function (next) { settings = normalize(next); draw(); }
        };
    }

    return {
        STORAGE_KEY: STORAGE_KEY,
        clefs: CLEFS,
        noteNames: NOTE_NAMES,
        durations: DURATIONS,
        nextModes: NEXT_MODES,
        keyLabel: function (key) { return KEY_ZH[String(key)] || KEY_ZH[key] || ''; },
        keySpec: function (key) { return KEY_SPECS[String(key)] || null; },
        spellingTags: spellingTags,
        defaultSettings: defaultSettings,
        normalize: normalize,
        clickRange: clickRange,
        pitchAt: pitchAt,
        keyAccidental: keyAccidental,
        questions: questions,
        answerButtons: answerButtons,
        rangeModel: rangeModel,
        controls: controls,
        nameGroup: nameGroup,
        mount: mount
    };
});
