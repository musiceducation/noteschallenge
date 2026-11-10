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

    function renderCard(root, type) {
        var model = keyboardModel(root, type);
        var spoken = model.tones.map(function (tone) {
            return tone.name + (tone.root ? '（根音）' : '');
        }).join('、');
        var spelling = model.tones.map(function (tone) {
            return '<span class="' + (tone.root ? 'is-root' : '') + '">' + escapeHtml(tone.name) + '</span>';
        }).join('<span class="chord-card-dot" aria-hidden="true">–</span>');
        return '<div class="chord-card" data-symbol="' + escapeHtml(model.symbol) + '">' +
            '<div class="chord-card-heading">' +
                '<span class="chord-card-symbol">' + escapeHtml(model.symbol) + '</span>' +
                '<span class="chord-card-sep" aria-hidden="true">·</span>' +
                '<span class="chord-card-quality">' + escapeHtml(model.qualityZh) + '</span>' +
            '</div>' +
            '<div class="chord-kb" style="--chord-kb-n-white:8" role="img" aria-label="' +
                escapeHtml(model.label + '，原位緊密排列：' + spoken) + '">' +
                '<div class="chord-kb-whites">' + model.whites.map(function (key) { return keyFace('white', key); }).join('') + '</div>' +
                '<div class="chord-kb-blacks">' + model.blacks.map(function (key) { return keyFace('black', key); }).join('') + '</div>' +
            '</div>' +
            '<p class="chord-card-spelling">' + spelling + '</p>' +
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
            backBtn.addEventListener('click', function () { switchScreen(returnScreen); });
        }
        paint();
    }

    return {
        ROOTS: ROOTS,
        QUALITY_ORDER: QUALITY_ORDER,
        QUALITIES: QUALITIES,
        chordToneNames: chordToneNames,
        symbolOf: symbolOf,
        keyboardModel: keyboardModel,
        renderCard: renderCard,
        mount: mount
    };
});
