/**
 * 音名看圖學習：高音／低音譜用 VexFlow 畫出，旁邊是真實鋼琴鍵位。
 * C# 與 D♭ 維持不同拼法；黑鍵只放在全音的空隙（E–F、B–C 之間沒有黑鍵）。
 * 不改練習計分、和弦鍵盤或答題音名。
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.NoteNameTeach = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    // 與 script.js MAPS 的自然音位置一致（yFactor 愈大愈低）。
    var TREBLE = [
        { letter: 'C', octave: 4, yFactor: 5 },
        { letter: 'D', octave: 4, yFactor: 4.5 },
        { letter: 'E', octave: 4, yFactor: 4 },
        { letter: 'F', octave: 4, yFactor: 3.5 },
        { letter: 'G', octave: 4, yFactor: 3 },
        { letter: 'A', octave: 4, yFactor: 2.5 },
        { letter: 'B', octave: 4, yFactor: 2 },
        { letter: 'C', octave: 5, yFactor: 1.5 },
        { letter: 'D', octave: 5, yFactor: 1 },
        { letter: 'E', octave: 5, yFactor: 0.5 },
        { letter: 'F', octave: 5, yFactor: 0 },
        { letter: 'G', octave: 5, yFactor: -0.5 },
        { letter: 'A', octave: 5, yFactor: -1 }
    ];
    var BASS = [
        { letter: 'G', octave: 2, yFactor: 4 },
        { letter: 'A', octave: 2, yFactor: 3.5 },
        { letter: 'B', octave: 2, yFactor: 3 },
        { letter: 'C', octave: 3, yFactor: 2.5 },
        { letter: 'D', octave: 3, yFactor: 2 },
        { letter: 'E', octave: 3, yFactor: 1.5 },
        { letter: 'F', octave: 3, yFactor: 1 },
        { letter: 'G', octave: 3, yFactor: 0.5 },
        { letter: 'A', octave: 3, yFactor: 0 },
        { letter: 'B', octave: 3, yFactor: -0.5 },
        { letter: 'C', octave: 4, yFactor: -1 }
    ];
    var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    var CLEF_ANCHOR = {
        treble: { letter: 'F', octave: 5, y: 0 },
        bass: { letter: 'A', octave: 3, y: 0 },
        alto: { letter: 'C', octave: 4, y: 2 },
        tenor: { letter: 'C', octave: 4, y: 1 }
    };
    var CLEF_ZH = { treble: '高音譜號', bass: '低音譜號', alto: '中音譜號', tenor: '次中音譜號' };

    function positionAt(clef, yFactor) {
        var anchor = CLEF_ANCHOR[clef];
        var steps = Math.round((yFactor - anchor.y) * 2);
        var idx = LETTERS.indexOf(anchor.letter);
        var octave = anchor.octave;
        var dir = steps >= 0 ? -1 : 1;
        var n = Math.abs(steps);
        for (var i = 0; i < n; i++) {
            if (dir < 0) {
                if (idx === 0) { idx = 6; octave -= 1; }
                else idx -= 1;
            } else if (idx === 6) { idx = 0; octave += 1; }
            else idx += 1;
        }
        return { letter: LETTERS[idx], octave: octave, yFactor: yFactor };
    }

    function extendStaff(clef, bases, maxLedger) {
        var have = {};
        bases.forEach(function (base) { have[base.yFactor] = true; });
        var extra = [];
        for (var y = -maxLedger; y <= 4 + maxLedger + 1e-9; y += 0.5) {
            var rounded = Math.round(y * 2) / 2;
            if (have[rounded]) continue;
            extra.push(positionAt(clef, rounded));
        }
        return bases.concat(extra);
    }

    var HOW_TO = '點琴鍵就會出聲。五線譜顯示同一個音。「聽這個音」可以再聽一次。';
    var PLAY_HOW = '回到音名識辨後，看譜按對應的音名。不確定可以按「聽&看答案」，或按「跳過」。';

    var TOPICS = [
        {
            id: 'lines',
            label: '線與間',
            clef: 'treble',
            mode: 'natural',
            noteId: 'treble-E4',
            blurb: '五線譜有五條線、四個間。由下往上數。音符在線上，圓圈壓着線；在間上，圓圈夾在兩條線中間。高音譜的線是 E G B D F，間是 F A C E。'
        },
        {
            id: 'middle',
            label: '中央 C',
            clef: 'treble',
            mode: 'natural',
            noteId: 'treble-C4',
            blurb: '中央 C 在鋼琴正中。五條線不夠就用加線。高音譜的中央 C 在下加一線，低音譜在上加一線。兩邊都是同一個 C4。'
        },
        {
            id: 'treble',
            label: '高音譜',
            clef: 'treble',
            mode: 'natural',
            noteId: 'treble-G4',
            blurb: '高音譜號圈住第二線的 G。五條線由下到上是 E、G、B、D、F。四個間由下到上是 F、A、C、E。'
        },
        {
            id: 'bass',
            label: '低音譜',
            clef: 'bass',
            mode: 'natural',
            noteId: 'bass-F3',
            blurb: '低音譜號的兩個點夾着第四線的 F。五條線由下到上是 G、B、D、F、A。四個間由下到上是 A、C、E、G。中央 C 在上加一線。'
        },
        {
            id: 'acc',
            label: '升號降號',
            clef: 'treble',
            mode: 'sharp',
            noteId: 'treble-Cs4',
            blurb: '升號 ♯ 把音升高半音，仍寫在原來的音位，例如 C♯ 在 C。降號 ♭ 把音降低半音，寫在高一個音名，例如 D♭ 在 D。C♯ 和 D♭ 是同一個黑鍵，但名稱和譜上的位置都不同。'
        },
        {
            id: 'alto',
            label: '中音譜',
            clef: 'alto',
            mode: 'natural',
            noteId: 'alto-C4',
            blurb: '中音譜號把中央 C 放在第三線。這是英皇樂理四級才加入的譜號，不是課堂高音／低音練習的替代。'
        },
        {
            id: 'tenor',
            label: '次中音譜',
            clef: 'tenor',
            mode: 'natural',
            noteId: 'tenor-C4',
            blurb: '次中音譜號把中央 C 放在第四線。這是英皇樂理五級才加入的譜號。移調樂器不在看圖學習裡。'
        }
    ];

    function midiOf(letter, octave, accidental) {
        var off = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
        return (octave + 1) * 12 + PC[letter] + off;
    }

    function spellingOf(letter, accidental) {
        if (accidental === '#') return letter + '#';
        if (accidental === 'b') return letter + '♭';
        return letter;
    }

    function idOf(clef, letter, accidental, octave) {
        var mark = accidental === '#' ? 's' : accidental === 'b' ? 'b' : '';
        return clef + '-' + letter + mark + octave;
    }

    function freqKeyOf(letter, accidental, octave) {
        return spellingOf(letter, accidental) + octave;
    }

    function vexKeyOf(letter, accidental, octave) {
        var mark = accidental === '#' ? '#' : accidental === 'b' ? 'b' : '';
        return letter.toLowerCase() + mark + '/' + octave;
    }

    function makeNote(clef, base, accidental) {
        return {
            id: idOf(clef, base.letter, accidental, base.octave),
            clef: clef,
            letter: base.letter,
            accidental: accidental,
            octave: base.octave,
            spelling: spellingOf(base.letter, accidental),
            yFactor: base.yFactor,
            midi: midiOf(base.letter, base.octave, accidental),
            freqKey: freqKeyOf(base.letter, accidental, base.octave),
            vexKey: vexKeyOf(base.letter, accidental, base.octave)
        };
    }

    function buildNotes(clef, bases) {
        var naturals = bases.map(function (base) { return makeNote(clef, base, ''); });
        var min = naturals[0].midi;
        var max = naturals[0].midi;
        naturals.forEach(function (note) {
            if (note.midi < min) min = note.midi;
            if (note.midi > max) max = note.midi;
        });
        var notes = [];
        bases.forEach(function (base) {
            notes.push(makeNote(clef, base, ''));
            if (base.letter !== 'E' && base.letter !== 'B') {
                var sharp = makeNote(clef, base, '#');
                if (sharp.midi > min && sharp.midi < max) notes.push(sharp);
            }
            if (base.letter !== 'C' && base.letter !== 'F') {
                var flat = makeNote(clef, base, 'b');
                if (flat.midi > min && flat.midi < max) notes.push(flat);
            }
        });
        return notes;
    }

    var NOTES = buildNotes('treble', extendStaff('treble', TREBLE, 4))
        .concat(buildNotes('bass', extendStaff('bass', BASS, 4)))
        .concat(buildNotes('alto', extendStaff('alto', [], 2)))
        .concat(buildNotes('tenor', extendStaff('tenor', [], 2)));
    var BY_ID = {};
    NOTES.forEach(function (note) { BY_ID[note.id] = note; });

    function noteById(id) { return BY_ID[id] || null; }

    function topicById(id) {
        for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return TOPICS[i];
        return null;
    }

    function placeOf(yFactor) {
        var lines = { 4: '第一線', 3: '第二線', 2: '第三線', 1: '第四線', 0: '第五線' };
        var spaces = { 3.5: '第一間', 2.5: '第二間', 1.5: '第三間', 0.5: '第四間' };
        if (Object.prototype.hasOwnProperty.call(lines, yFactor)) return { kind: 'line', label: lines[yFactor] };
        if (Object.prototype.hasOwnProperty.call(spaces, yFactor)) return { kind: 'space', label: spaces[yFactor] };
        if (yFactor === 5) return { kind: 'ledger', label: '下加一線' };
        if (yFactor === -1) return { kind: 'ledger', label: '上加一線' };
        if (yFactor === 4.5) return { kind: 'ledger', label: '下加間' };
        if (yFactor === -0.5) return { kind: 'ledger', label: '上加間' };
        if (yFactor === 6) return { kind: 'ledger', label: '下加二線' };
        if (yFactor === 7) return { kind: 'ledger', label: '下加三線' };
        if (yFactor === 8) return { kind: 'ledger', label: '下加四線' };
        if (yFactor === -2) return { kind: 'ledger', label: '上加二線' };
        if (yFactor === -3) return { kind: 'ledger', label: '上加三線' };
        if (yFactor === -4) return { kind: 'ledger', label: '上加四線' };
        return { kind: 'ledger', label: '加線' };
    }

    function naturals(clef) {
        return NOTES.filter(function (note) { return note.clef === clef && !note.accidental; });
    }

    function staffNames(clef, kind) {
        return naturals(clef).filter(function (note) {
            var place = placeOf(note.yFactor);
            return place.kind === kind;
        }).sort(function (a, b) { return b.yFactor - a.yFactor; }).map(function (note) { return note.letter; });
    }

    function lineNames(clef) { return staffNames(clef, 'line'); }
    function spaceNames(clef) { return staffNames(clef, 'space'); }

    function enharmonicOf(note) {
        if (!note || !note.accidental) return null;
        for (var i = 0; i < NOTES.length; i++) {
            var other = NOTES[i];
            if (other.clef === note.clef && other.midi === note.midi && other.id !== note.id) return other;
        }
        return null;
    }

    function modeFits(note, mode) {
        if (mode === 'sharp') return note.accidental !== 'b';
        if (mode === 'flat') return note.accidental !== '#';
        return !note.accidental;
    }

    // Topic chips already name 高音譜 / 低音譜. Clef and spelling rows appear only
    // when that topic does not already choose them, and they use glyphs so the
    // same words are not printed twice.
    function controlsFor(topicId) {
        var clefLocked = topicId === 'lines' || topicId === 'treble' || topicId === 'bass' || topicId === 'alto' || topicId === 'tenor';
        var modes = [];
        if (topicId === 'acc') modes = ['sharp', 'flat'];
        else if (!topicId) modes = ['natural', 'sharp', 'flat'];
        return {
            showClef: !clefLocked,
            showSpelling: modes.length > 0,
            modes: modes
        };
    }

    // Notehead x that puts the written note (head, plus accidental if any) in
    // the middle of the staff area after the clef. A left-aligned note on a
    // wide iPad staff is the bug this corrects.
    function centeredNoteheadX(noteStartX, staveRight, accidentalWidth) {
        var acc = accidentalWidth > 0 ? accidentalWidth : 0;
        var mid = (noteStartX + staveRight) / 2;
        return mid + acc / 2;
    }

    function noteheadShift(currentX, noteStartX, staveRight, accidentalWidth) {
        return centeredNoteheadX(noteStartX, staveRight, accidentalWidth) - currentX;
    }

    // Shift that puts the written note on the horizontal center of the staff card.
    // The live bug is a note at x=145 inside a card spanning x=77..823.
    function cardCenterShift(cardLeft, cardRight, markCenter) {
        return ((cardLeft + cardRight) / 2) - markCenter;
    }

    function spellingsAt(clef, midi) {
        return NOTES.filter(function (note) {
            return note.clef === clef && note.midi === midi && note.accidental;
        }).sort(function (a, b) {
            if (a.accidental === b.accidental) return a.letter < b.letter ? -1 : 1;
            return a.accidental === '#' ? -1 : 1;
        });
    }

    function sequence(clef, mode) {
        return NOTES.filter(function (note) {
            return note.clef === clef && modeFits(note, mode);
        }).sort(function (a, b) {
            return a.midi - b.midi || (a.accidental === '#' ? -1 : 1);
        });
    }

    function lessonText(note, topic) {
        if (!note) return '';
        var place = placeOf(note.yFactor);
        var clefName = CLEF_ZH[note.clef] || '高音譜號';
        var where = clefName + '的' + place.label;
        var sentence;
        if (!note.accidental && note.letter === 'C' && note.octave === 4) {
            sentence = '中央 C（C4）在' + where + '。高音譜往下加線，低音譜往上加線，兩邊是同一個音。';
        } else if (!note.accidental && place.kind === 'line') {
            sentence = note.spelling + note.octave + ' 在' + where + '。線上的音，圓圈壓着那條線。由下往上數。';
        } else if (!note.accidental && place.kind === 'space') {
            sentence = note.spelling + note.octave + ' 在' + where + '。間上的音，圓圈夾在兩條線中間。';
        } else if (!note.accidental) {
            sentence = note.spelling + note.octave + ' 在' + where + '。五條線不夠，就加一條短線。';
        } else if (note.accidental === '#') {
            sentence = note.spelling + note.octave + ' 把 ' + note.letter + ' 升高半音，仍寫在 ' + note.letter + ' 的' + place.label + '。黑鍵在旁邊。';
        } else {
            sentence = note.spelling + note.octave + ' 把 ' + note.letter + ' 降低半音，寫在 ' + note.letter + ' 的' + place.label + '。';
        }
        var parts = [];
        if (topic && topic.blurb) parts.push(topic.blurb);
        parts.push(sentence);
        var partner = enharmonicOf(note);
        if (partner) {
            parts.push(note.spelling + ' 和 ' + partner.spelling + ' 是同一個黑鍵，譜上的位置不同，答題時要分開。');
        }
        return parts.join('');
    }

    function keyboardModel(clef, mode) {
        var whites = naturals(clef).map(function (note) {
            return { midi: note.midi, name: note.spelling, octave: note.octave, id: note.id };
        }).sort(function (a, b) { return a.midi - b.midi; });
        var blacks = [];
        for (var i = 0; i < whites.length - 1; i++) {
            if (whites[i + 1].midi - whites[i].midi !== 2) continue;
            var midi = whites[i].midi + 1;
            var candidates = NOTES.filter(function (note) {
                return note.clef === clef && note.midi === midi && note.accidental;
            });
            var chosen = null;
            candidates.forEach(function (note) {
                if (mode === 'flat' && note.accidental === 'b') chosen = note;
                if (mode !== 'flat' && note.accidental === '#') chosen = note;
            });
            if (!chosen) chosen = candidates[0];
            if (!chosen) continue;
            blacks.push({
                midi: midi,
                name: chosen.spelling,
                octave: chosen.octave,
                id: chosen.id,
                leftIndex: i
            });
        }
        return { clef: clef, mode: mode, whites: whites, blacks: blacks };
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function keyButton(kind, key, selectedId, nWhite) {
        var on = key.id === selectedId;
        var style = kind === 'black'
            ? ' style="left:' + (((key.leftIndex + 1) / nWhite) * 100).toFixed(4) + '%"'
            : '';
        return '<button type="button" class="ntk-' + kind + (on ? ' is-selected' : '') + '"' +
            style +
            ' data-note-id="' + escapeHtml(key.id) + '"' +
            ' data-midi="' + key.midi + '"' +
            ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
            ' aria-label="音名 ' + escapeHtml(key.name + key.octave) + '">' +
            '<span class="ntk-name">' + escapeHtml(key.name) + '</span>' +
            '<span class="ntk-oct">' + key.octave + '</span></button>';
    }

    function blackGroup(clef, key, selectedId) {
        var spells = spellingsAt(clef, key.midi);
        if (!spells.length) {
            spells = [{
                id: key.id,
                midi: key.midi,
                spelling: key.name,
                octave: key.octave,
                accidental: String(key.name).indexOf('♭') >= 0 ? 'b' : '#'
            }];
        }
        var buttons = spells.map(function (sp) {
            var kind = sp.accidental === 'b' ? 'flat' : 'sharp';
            var on = sp.id === selectedId;
            return '<button type="button" class="ntk-acc ntk-' + kind + (on ? ' is-selected' : '') + '"' +
                ' data-note-id="' + escapeHtml(sp.id) + '"' +
                ' data-midi="' + sp.midi + '"' +
                ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
                ' aria-label="音名 ' + escapeHtml(sp.spelling + sp.octave) + '">' +
                '<span class="ntk-name">' + escapeHtml(sp.spelling) + '</span>' +
                '<span class="ntk-oct">' + sp.octave + '</span></button>';
        }).join('');
        return '<div class="ntk-black" style="--ntk-slot:' + (key.leftIndex + 1) + '">' + buttons + '</div>';
    }

    function keyboardHtml(clef, mode, selectedId) {
        var model = keyboardModel(clef, mode);
        var nWhite = model.whites.length;
        var showBlacks = mode !== 'natural';
        var blacks = showBlacks ? model.blacks.map(function (key) {
            return blackGroup(clef, key, selectedId);
        }).join('') : '';
        return '<div class="ntk' + (showBlacks ? ' ntk--accidentals' : ' ntk--naturals') + '" style="--ntk-n-white:' + nWhite + '">' +
            '<div class="ntk-whites">' + model.whites.map(function (key) {
                return keyButton('white', key, selectedId, nWhite);
            }).join('') + '</div>' +
            '<div class="ntk-blacks">' + blacks + '</div></div>';
    }

    function centerStaveNote(stave, staveNote, note) {
        if (!stave || !staveNote || typeof staveNote.getAbsoluteX !== 'function') return;
        if (typeof staveNote.setCenterAlignment === 'function') staveNote.setCenterAlignment(true);
        var accW = 0;
        if (note && note.accidental && typeof staveNote.getMetrics === 'function') {
            var metrics = staveNote.getMetrics() || {};
            accW = metrics.modLeftPx || 0;
        }
        var right = stave.getX() + stave.getWidth() - 14;
        var delta = noteheadShift(staveNote.getAbsoluteX(), stave.getNoteStartX(), right, accW);
        if (typeof staveNote.setCenterXShift === 'function') {
            var current = typeof staveNote.getCenterXShift === 'function' ? (staveNote.getCenterXShift() || 0) : 0;
            staveNote.setCenterXShift(current + delta);
        }
    }

    function placeNoteInCard(container, note) {
        var card = container.closest ? (container.closest('.note-teach-stage') || container) : container;
        var svg = container.querySelector && container.querySelector('svg');
        var head = svg && svg.querySelector('.vf-notehead');
        var group = svg && svg.querySelector('.vf-stavenote');
        if (!card || !svg || !head || !group || !card.getBoundingClientRect) return false;
        var cardRect = card.getBoundingClientRect();
        var svgRect = svg.getBoundingClientRect();
        var headRect = head.getBoundingClientRect();
        if (!cardRect.width || !svgRect.width || !headRect.width) return false;
        var viewW = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width
            ? svg.viewBox.baseVal.width : svgRect.width;
        var scale = viewW / svgRect.width;
        var accScreen = 0;
        if (note && note.accidental) {
            var acc = svg.querySelector('.vf-accidental') || svg.querySelector('[class*="accidental"]');
            if (acc && acc.getBoundingClientRect) {
                var accRect = acc.getBoundingClientRect();
                if (accRect.width) accScreen = (headRect.left + headRect.width / 2) - (accRect.left + accRect.width / 2);
            } else {
                accScreen = 14;
            }
        }
        var markCenter = headRect.left + headRect.width / 2 - accScreen / 2;
        var dxScreen = cardCenterShift(cardRect.left, cardRect.right, markCenter);
        container.dataset.noteCentered = '1';
        container.dataset.cardShift = String(Math.round(dxScreen));
        if (Math.abs(dxScreen) < 1.5) return true;
        group.setAttribute('transform', 'translate(' + (dxScreen * scale).toFixed(2) + ' 0)');
        return true;
    }

    function renderStaff(container, note) {
        if (!container || !note) return false;
        container.innerHTML = '';
        container.dataset.noteId = note.id;
        container.dataset.clef = note.clef;
        container.dataset.vexKey = note.vexKey;
        var VF = typeof VexFlow !== 'undefined' ? VexFlow : null;
        if (!VF || !VF.Renderer) {
            container.appendChild(fallbackStaff(note));
            return false;
        }
        try {
            var width = Math.max(280, container.clientWidth || 360);
            var above = Math.max(56, note.yFactor < 0.5 ? Math.round((1 - note.yFactor) * 18) + 44 : 56);
            var below = note.yFactor >= 4.5 ? 78 : 40;
            var staveY = above;
            var height = staveY + 108 + below;
            var renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
            renderer.resize(width, height);
            var context = renderer.getContext();
            var stave = new VF.Stave(10, staveY, Math.max(120, width - 20));
            stave.addClef(note.clef);
            stave.setContext(context).draw();
            // Whole note: this screen teaches pitch and staff position, not duration.
            var staveNote = new VF.StaveNote({
                clef: note.clef,
                keys: [note.vexKey],
                duration: 'w',
                alignCenter: true
            });
            if (note.accidental && VF.Accidental) {
                var acc = note.accidental === '##' ? '##' : note.accidental === 'bb' ? 'bb' : note.accidental === '#' ? '#' : 'b';
                staveNote.addModifier(new VF.Accidental(acc), 0);
            }
            if (typeof staveNote.setStyle === 'function') {
                staveNote.setStyle({ fillStyle: '#9b3d62', strokeStyle: '#9b3d62' });
            }
            if (typeof staveNote.setStave === 'function') staveNote.setStave(stave);
            if (typeof staveNote.setCenterAlignment === 'function') staveNote.setCenterAlignment(true);
            var voice = new VF.Voice({ numBeats: 4, beatValue: 4 });
            if (typeof voice.setMode === 'function') voice.setMode(2);
            voice.addTickables([staveNote]);
            var justify = Math.max(40, width - stave.getNoteStartX() - 16);
            new VF.Formatter().joinVoices([voice]).format([voice], justify);
            centerStaveNote(stave, staveNote, note);
            voice.draw(context, stave);
            var svg = container.querySelector('svg');
            if (svg) {
                svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
                svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
                svg.style.display = 'block';
                svg.style.width = '100%';
                svg.style.maxWidth = 'none';
                svg.style.height = 'auto';
                svg.style.overflow = 'visible';
            }
            placeNoteInCard(container, note);
            var place = placeOf(note.yFactor);
            container.setAttribute('aria-label', (CLEF_ZH[note.clef] || '高音譜號') + ' ' + note.spelling + note.octave + ' ' + place.label);
            return true;
        } catch (err) {
            container.innerHTML = '';
            container.appendChild(fallbackStaff(note));
            return false;
        }
    }

    function fallbackStaff(note) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        var width = 360;
        var noteStart = 86;
        var staveRight = width - 16;
        var accW = note.accidental ? 18 : 0;
        var noteX = centeredNoteheadX(noteStart, staveRight, accW);
        svg.setAttribute('viewBox', '0 0 ' + width + ' 180');
        svg.setAttribute('class', 'ntk-fallback');
        svg.setAttribute('role', 'img');
        var place = placeOf(note.yFactor);
        svg.setAttribute('aria-label', note.spelling + note.octave + ' ' + place.label);
        var base = 36;
        var gap = 14;
        var staff = '';
        for (var i = 0; i < 5; i++) {
            var y = base + i * gap;
            staff += '<line x1="24" y1="' + y + '" x2="' + staveRight + '" y2="' + y + '" stroke="#1e1e2f" stroke-width="1.6"/>';
        }
        var noteY = base + note.yFactor * gap;
        var ledger = function (yLine) {
            staff += '<line x1="' + (noteX - 22) + '" y1="' + yLine + '" x2="' + (noteX + 22) + '" y2="' + yLine + '" stroke="#1e1e2f" stroke-width="1.6"/>';
        };
        if (note.yFactor >= 5) ledger(base + 5 * gap);
        if (note.yFactor <= -1) ledger(base - gap);
        var clef = note.clef === 'bass' ? '𝄢' : '𝄞';
        var acc = note.accidental === '#' ? '♯' : note.accidental === 'b' ? '♭' : '';
        staff += '<text x="32" y="' + (base + 3.2 * gap) + '" font-size="42" fill="#1e1e2f">' + clef + '</text>';
        if (acc) staff += '<text x="' + (noteX - accW) + '" y="' + (noteY + 6) + '" font-size="22" fill="#9b3d62" text-anchor="middle">' + acc + '</text>';
        staff += '<ellipse cx="' + noteX + '" cy="' + noteY + '" rx="12" ry="8" transform="rotate(-18 ' + noteX + ' ' + noteY + ')" fill="#fff" stroke="#9b3d62" stroke-width="2.2"/>';
        svg.innerHTML = staff;
        return svg;
    }

    function mount(options) {
        var screen = document.getElementById('screen-note-teach');
        var staffEl = document.getElementById('noteTeachStaff');
        var nameEl = document.getElementById('noteTeachName');
        var readout = document.getElementById('noteTeachReadout');
        var topicsEl = document.getElementById('noteTeachTopics');
        var clefsEl = document.getElementById('noteTeachClefs');
        var modesEl = document.getElementById('noteTeachSpellings');
        var keysEl = document.getElementById('noteTeachKeys');
        var posEl = document.getElementById('noteTeachPos');
        if (!screen || !staffEl || !keysEl) return;
        var switchScreen = options && options.switchScreen;
        var playNote = options && options.playNote;
        var state = { clef: 'treble', mode: 'natural', noteId: 'treble-C4', topicId: 'middle' };
        var returnScreen = 'screen-hub';
        var kbSig = '';

        function current() { return noteById(state.noteId) || noteById('treble-C4'); }

        function bindTap(el, handler) {
            if (!el) return;
            var engine = typeof globalThis !== 'undefined' && globalThis.AudioEngine;
            if (engine && engine.onInstantTap) engine.onInstantTap(el, handler);
            else el.addEventListener('click', handler);
        }

        function paintChrome() {
            var controls = controlsFor(state.topicId);
            if (topicsEl) {
                topicsEl.querySelectorAll('[data-topic]').forEach(function (btn) {
                    var on = btn.getAttribute('data-topic') === state.topicId;
                    btn.classList.toggle('is-on', on);
                    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
            }
            if (clefsEl) {
                clefsEl.hidden = !controls.showClef;
                clefsEl.querySelectorAll('[data-clef]').forEach(function (btn) {
                    var on = btn.getAttribute('data-clef') === state.clef;
                    btn.classList.toggle('is-on', on);
                    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
            }
            if (modesEl) {
                modesEl.hidden = !controls.showSpelling;
                modesEl.querySelectorAll('[data-mode]').forEach(function (btn) {
                    var mode = btn.getAttribute('data-mode');
                    var show = controls.modes.indexOf(mode) >= 0;
                    btn.hidden = !show;
                    var on = show && mode === state.mode;
                    btn.classList.toggle('is-on', on);
                    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
            }
        }

        function paintKeys(note) {
            var sig = state.clef + '|' + state.mode + '|' + keyboardModel(state.clef, state.mode).whites.length;
            if (sig !== kbSig) {
                kbSig = sig;
                keysEl.innerHTML = keyboardHtml(state.clef, state.mode, note.id);
                keysEl.querySelectorAll('[data-note-id]').forEach(function (btn) {
                    bindTap(btn, function () {
                        select(btn.getAttribute('data-note-id'), { play: true, clearTopic: true });
                    });
                });
            } else {
                keysEl.querySelectorAll('[data-note-id]').forEach(function (btn) {
                    var on = btn.getAttribute('data-note-id') === note.id;
                    btn.classList.toggle('is-selected', on);
                    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
            }
            var selected = keysEl.querySelector('.is-selected');
            if (selected) {
                var host = keysEl.getBoundingClientRect();
                var box = selected.getBoundingClientRect();
                if (host.width) keysEl.scrollLeft += box.left - host.left - (host.width - box.width) / 2;
            }
        }

        function paint(opts) {
            var note = current();
            state.noteId = note.id;
            if (!modeFits(note, state.mode)) {
                state.mode = note.accidental === 'b' ? 'flat' : note.accidental === '#' ? 'sharp' : 'natural';
            }
            state.clef = note.clef;
            paintChrome();
            var topic = topicById(state.topicId);
            var partner = enharmonicOf(note);
            var place = placeOf(note.yFactor);
            if (nameEl) {
                nameEl.innerHTML = escapeHtml(note.spelling + note.octave) +
                    '<span class="note-teach-place">' + escapeHtml(place.label) + '</span>';
            }
            if (readout) {
                readout.innerHTML =
                    '<p class="note-teach-sentence">' + escapeHtml(lessonText(note, topic)) + '</p>' +
                    (partner
                        ? '<button type="button" class="note-teach-swap" data-swap-id="' + escapeHtml(partner.id) + '">看成 ' + escapeHtml(partner.spelling + partner.octave) + '</button>'
                        : '');
            }
            var list = sequence(state.clef, state.mode);
            var index = 0;
            list.forEach(function (item, i) { if (item.id === note.id) index = i; });
            if (posEl) posEl.textContent = '第 ' + (index + 1) + ' 個 / 共 ' + list.length + ' 個';
            paintKeys(note);
            renderStaff(staffEl, note);
            if (!staffEl.clientWidth) {
                requestAnimationFrame(function () {
                    if (staffEl.clientWidth) renderStaff(staffEl, current());
                });
            }
            if (opts && opts.play && playNote) playNote(note.freqKey);
        }

        function select(id, opts) {
            var note = noteById(id);
            if (!note) return;
            if (opts && opts.clearTopic) state.topicId = '';
            state.clef = note.clef;
            state.noteId = note.id;
            if (!modeFits(note, state.mode)) {
                state.mode = note.accidental === 'b' ? 'flat' : note.accidental === '#' ? 'sharp' : state.mode;
            }
            paint(opts);
        }

        function applyTopic(id) {
            var topic = topicById(id);
            if (!topic) return;
            state.topicId = topic.id;
            state.clef = topic.clef;
            state.mode = topic.mode;
            state.noteId = topic.noteId;
            kbSig = '';
            paint({ play: true });
        }

        function step(dir) {
            var list = sequence(state.clef, state.mode);
            var index = 0;
            list.forEach(function (item, i) { if (item.id === state.noteId) index = i; });
            var next = index + dir;
            if (next < 0) next = list.length - 1;
            if (next >= list.length) next = 0;
            state.topicId = '';
            state.noteId = list[next].id;
            paint({ play: true });
        }

        function openFrom(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            var active = document.querySelector('.screen.active');
            if (active && active.id && active.id !== 'screen-note-teach') returnScreen = active.id;
            if (switchScreen) switchScreen('screen-note-teach');
            kbSig = '';
            requestAnimationFrame(function () { paint(); });
        }

        if (topicsEl) {
            topicsEl.innerHTML = TOPICS.map(function (topic) {
                return '<button type="button" class="note-teach-topic" data-topic="' + topic.id + '" aria-pressed="false">' +
                    escapeHtml(topic.label) + '</button>';
            }).join('');
            topicsEl.addEventListener('click', function (event) {
                var btn = event.target.closest('[data-topic]');
                if (!btn) return;
                applyTopic(btn.getAttribute('data-topic'));
            });
        }
        if (clefsEl) {
            clefsEl.innerHTML =
                '<button type="button" data-clef="treble" aria-pressed="true" aria-label="高音譜" title="高音譜">𝄞</button>' +
                '<button type="button" data-clef="bass" aria-pressed="false" aria-label="低音譜" title="低音譜">𝄢</button>' +
                '<button type="button" data-clef="alto" aria-pressed="false" aria-label="中音譜" title="中音譜">中</button>' +
                '<button type="button" data-clef="tenor" aria-pressed="false" aria-label="次中音譜" title="次中音譜">次</button>';
            clefsEl.addEventListener('click', function (event) {
                var btn = event.target.closest('[data-clef]');
                if (!btn) return;
                var clef = btn.getAttribute('data-clef');
                if (state.topicId !== 'middle' && state.topicId !== 'acc') state.topicId = '';
                state.clef = clef;
                var list = sequence(clef, state.mode);
                var currentNote = current();
                var same = null;
                var nearest = list[0] || null;
                list.forEach(function (item) {
                    if (item.letter === currentNote.letter && item.accidental === currentNote.accidental && item.octave === currentNote.octave) same = item;
                    if (nearest && Math.abs(item.midi - currentNote.midi) < Math.abs(nearest.midi - currentNote.midi)) nearest = item;
                });
                state.noteId = (same || nearest || currentNote).id;
                kbSig = '';
                paint({ play: true });
            });
        }
        if (modesEl) {
            modesEl.innerHTML =
                '<button type="button" data-mode="natural" aria-label="自然音" title="自然音">♮</button>' +
                '<button type="button" data-mode="sharp" aria-label="升號" title="升號">♯</button>' +
                '<button type="button" data-mode="flat" aria-label="降號" title="降號">♭</button>';
            modesEl.addEventListener('click', function (event) {
                var btn = event.target.closest('[data-mode]');
                if (!btn) return;
                var mode = btn.getAttribute('data-mode');
                if (!(state.topicId === 'acc' && mode !== 'natural')) state.topicId = '';
                state.mode = mode;
                var note = current();
                if (!modeFits(note, mode)) {
                    var partner = enharmonicOf(note);
                    if (partner && modeFits(partner, mode)) note = partner;
                    else {
                        var list = sequence(state.clef, mode);
                        var nearest = list[0];
                        list.forEach(function (item) {
                            if (Math.abs(item.midi - note.midi) < Math.abs(nearest.midi - note.midi)) nearest = item;
                        });
                        note = nearest || note;
                    }
                }
                state.noteId = note.id;
                kbSig = '';
                paint({ play: true });
            });
        }
        if (readout) {
            readout.addEventListener('click', function (event) {
                var btn = event.target.closest('[data-swap-id]');
                if (!btn) return;
                select(btn.getAttribute('data-swap-id'), { play: true, clearTopic: true });
            });
        }

        bindTap(document.getElementById('noteTeachPrev'), function () { step(-1); });
        bindTap(document.getElementById('noteTeachNext'), function () { step(1); });
        bindTap(document.getElementById('noteTeachHear'), function () { paint({ play: true }); });
        var back = document.getElementById('noteTeachBack');
        if (back) back.addEventListener('click', function () {
            if (switchScreen) switchScreen(returnScreen || 'screen-hub');
        });
        var howEl = document.getElementById('noteTeachHow');
        var playEl = document.getElementById('noteTeachPlay');
        if (howEl) howEl.textContent = HOW_TO;
        if (playEl) playEl.textContent = PLAY_HOW;
        document.querySelectorAll('.js-open-note-teach').forEach(function (btn) {
            btn.addEventListener('click', openFrom);
            btn.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                openFrom(event);
            });
        });
        document.addEventListener('keydown', function (event) {
            if (!screen.classList.contains('active')) return;
            var tag = event.target && event.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
            else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
            else if (event.key === ' ' || event.key === 'Enter') {
                if (event.target && event.target.closest && event.target.closest('button')) return;
                event.preventDefault();
                paint({ play: true });
            }
        });
        window.addEventListener('resize', function () {
            if (screen.classList.contains('active')) renderStaff(staffEl, current());
        });
        paint();
    }

    return {
        notes: NOTES,
        topics: TOPICS,
        howTo: HOW_TO,
        playHow: PLAY_HOW,
        controlsFor: controlsFor,
        centeredNoteheadX: centeredNoteheadX,
        noteheadShift: noteheadShift,
        cardCenterShift: cardCenterShift,
        noteById: noteById,
        naturals: naturals,
        lineNames: lineNames,
        spaceNames: spaceNames,
        placeOf: placeOf,
        lessonText: lessonText,
        enharmonicOf: enharmonicOf,
        sequence: sequence,
        keyboardModel: keyboardModel,
        keyboardHtml: keyboardHtml,
        renderStaff: renderStaff,
        mount: mount
    };
});
