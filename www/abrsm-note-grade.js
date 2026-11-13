/**
 * Playable note and key-signature pools for abrsm-g1..g5.
 * Depends on AbrsmCurriculum. Does not draw UI.
 * Transposition is not covered.
 */
(function (root, factory) {
    var api = factory(root && root.AbrsmCurriculum);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.AbrsmNoteGrade = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (curriculum) {
    'use strict';

    if (!curriculum) throw new Error('AbrsmCurriculum must load first');

    var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    var ANCHOR = {
        treble: { letter: 'F', octave: 5, y: 0 },
        bass: { letter: 'A', octave: 3, y: 0 },
        alto: { letter: 'C', octave: 4, y: 2 },
        tenor: { letter: 'C', octave: 4, y: 1 }
    };

    function gradeNumber(id) { return curriculum.gradeNumber(id); }

    function ledgerMax(gradeId) {
        var n = gradeNumber(gradeId);
        if (n <= 1) return 1;
        if (n === 2) return 2;
        if (n === 3) return 3;
        return 4;
    }

    function accidentalsFor(gradeId) {
        return gradeNumber(gradeId) >= 4 ? ['', '#', 'b', '##', 'bb'] : ['', '#', 'b'];
    }

    function positionAt(clef, yFactor) {
        var anchor = ANCHOR[clef];
        if (!anchor) throw new Error('unknown clef ' + clef);
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

    function positions(clef, maxLedger) {
        var out = [];
        var start = -maxLedger;
        var end = 4 + maxLedger;
        for (var y = start; y <= end + 1e-9; y += 0.5) {
            var rounded = Math.round(y * 2) / 2;
            out.push(positionAt(clef, rounded));
        }
        return out;
    }

    function accidentalOffset(acc) {
        if (acc === '#') return 1;
        if (acc === '##') return 2;
        if (acc === 'b') return -1;
        if (acc === 'bb') return -2;
        return 0;
    }

    function displaySpelling(letter, acc) {
        if (acc === '#') return letter + '#';
        if (acc === 'b') return letter + '♭';
        if (acc === '##') return letter + '×';
        if (acc === 'bb') return letter + '𝄫';
        return letter;
    }

    function vexKey(letter, acc, octave) {
        var mark = acc === '##' ? '##' : acc === 'bb' ? 'bb' : acc === '#' ? '#' : acc === 'b' ? 'b' : '';
        return letter.toLowerCase() + mark + '/' + octave;
    }

    function midiOf(letter, octave, acc) {
        return (octave + 1) * 12 + PC[letter] + accidentalOffset(acc);
    }

    function freqKeyFromMidi(midi) {
        var names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        var pc = ((midi % 12) + 12) % 12;
        var octave = Math.floor(midi / 12) - 1;
        return names[pc] + octave;
    }

    var PRACTICE_LEDGER = 4;
    var PRACTICE_ACCIDENTALS = ['', '#', 'b'];

    function notesOnClefs(clefs, max, accs, gradeId) {
        var notes = [];
        clefs.forEach(function (clef) {
            if (!ANCHOR[clef]) throw new Error('unknown clef ' + clef);
            positions(clef, max).forEach(function (pos) {
                accs.forEach(function (acc) {
                    var midi = midiOf(pos.letter, pos.octave, acc);
                    notes.push({
                        clef: clef,
                        letter: pos.letter,
                        octave: pos.octave,
                        accidental: acc,
                        yFactor: pos.yFactor,
                        spelling: displaySpelling(pos.letter, acc),
                        vexKey: vexKey(pos.letter, acc, pos.octave),
                        vexAccidental: acc || null,
                        midi: midi,
                        freqKey: freqKeyFromMidi(midi),
                        gradeId: gradeId
                    });
                });
            });
        });
        return notes;
    }

    function chosenClefs(clefIds) {
        var allowed = { treble: 1, bass: 1, alto: 1, tenor: 1 };
        var clefs = [];
        (clefIds || []).forEach(function (id) {
            if (allowed[id] && clefs.indexOf(id) < 0) clefs.push(id);
        });
        if (!clefs.length) throw new Error('clef required');
        return clefs;
    }

    function notePool(gradeId) {
        return notesOnClefs(curriculum.clefsFor(gradeId).map(function (c) { return c.id; }), ledgerMax(gradeId), accidentalsFor(gradeId), gradeId);
    }

    function notePoolForClefs(gradeId, clefIds) {
        return notesOnClefs(chosenClefs(clefIds), ledgerMax(gradeId), accidentalsFor(gradeId), gradeId);
    }

    function practicePool(clefIds) {
        return notesOnClefs(chosenClefs(clefIds), PRACTICE_LEDGER, PRACTICE_ACCIDENTALS, null);
    }

    function ledgerDepth(yFactor) {
        if (yFactor > 4) return yFactor - 4;
        if (yFactor < 0) return -yFactor;
        return 0;
    }

    function keyItems(gradeId) {
        var n = gradeNumber(gradeId);
        var clefs = curriculum.clefsFor(gradeId).map(function (c) { return c.id; });
        var items = [];
        curriculum.keysFor(gradeId).forEach(function (key) {
            var forms = key.mode === 'major' ? ['major'] : (n < 3 ? ['harmonic'] : ['harmonic', 'melodic']);
            forms.forEach(function (form) {
                var scaleKind = key.mode === 'major' ? 'major'
                    : form === 'harmonic' ? 'harmonic-minor' : 'melodic-minor-ascending';
                var scale = curriculum.scaleSpelling(key.tonic, scaleKind);
                var label = key.mode === 'major'
                    ? key.tonic + '大調'
                    : key.tonic + '小調・' + (form === 'harmonic' ? '和聲' : '旋律');
                clefs.forEach(function (clef) {
                    items.push({
                        id: key.id + '-' + form + '-' + clef,
                        keyId: key.id,
                        tonic: key.tonic,
                        mode: key.mode,
                        form: form,
                        label: label,
                        clef: clef,
                        signature: key.signature.slice(),
                        vexKeySpec: key.relativeMajor,
                        cueNotes: form === 'major' ? [] : scale.slice(-2),
                        introduced: key.introduced,
                        abrsm: true
                    });
                });
            });
        });
        return items;
    }

    function coverage() {
        return {
            noteNaming: true,
            keySignatures: true,
            minorForms: { g2: 'harmonic-only', g3toG5: 'harmonic-and-melodic' },
            altoClef: 'abrsm-g4',
            tenorClef: 'abrsm-g5',
            transposition: false,
            ornaments: false,
            terms: false,
            rhythmMeters: false,
            chords: false,
            orchestra: false,
            solfege: false,
            examReady: false
        };
    }

    return {
        ledgerMax: ledgerMax,
        accidentalsFor: accidentalsFor,
        positionAt: positionAt,
        positions: positions,
        ledgerDepth: ledgerDepth,
        notePool: notePool,
        notePoolForClefs: notePoolForClefs,
        practicePool: practicePool,
        keyItems: keyItems,
        coverage: coverage,
        displaySpelling: displaySpelling
    };
});
