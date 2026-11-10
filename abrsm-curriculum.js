/**
 * ABRSM Music Theory Grades 1–5 curriculum data.
 * Not wired to any game. School year (中一–中六) is not a grade here.
 *
 * Sources (exams from May 2020; specification version 1.2, April 2023):
 * - https://www.abrsm.org/sites/default/files/2024-01/music-theory-syllabus-outline-grades-1-5-from-2020.pdf
 * - https://www.abrsm.org/sites/default/files/2024-01/Music%20Theory%20Qual%20Spec%20April%202023%20%5B2023%20rebrand%5D.pdf
 * Term, clef, meter, and key introduction grades follow the Grades 1–5 tables
 * on pages 16–18 of the qualification specification. Signs whose columns
 * could not be read cleanly are listed without a grade.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.AbrsmCurriculum = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var SOURCES = [
        {
            id: 'outline-2020',
            title: 'The ABRSM Music Theory syllabus from 2020: Grades 1 to 5',
            url: 'https://www.abrsm.org/sites/default/files/2024-01/music-theory-syllabus-outline-grades-1-5-from-2020.pdf'
        },
        {
            id: 'qual-spec-1.2',
            title: 'Music Theory Grades Qualification Specification',
            version: '1.2',
            dated: 'April 2023',
            syllabusValidFrom: '2020',
            url: 'https://www.abrsm.org/sites/default/files/2024-01/Music%20Theory%20Qual%20Spec%20April%202023%20%5B2023%20rebrand%5D.pdf'
        }
    ];

    var GRADES = [
        { id: 'abrsm-g1', number: 1, ofqual: '603/6414/2' },
        { id: 'abrsm-g2', number: 2, ofqual: '603/6415/4' },
        { id: 'abrsm-g3', number: 3, ofqual: '603/6416/6' },
        { id: 'abrsm-g4', number: 4, ofqual: '603/6417/8' },
        { id: 'abrsm-g5', number: 5, ofqual: '603/6418/X' }
    ];

    /** Identity only. Never a musical difficulty and never an ABRSM badge. */
    var SCHOOL_YEARS = [
        { id: 's1', label: '中一' },
        { id: 's2', label: '中二' },
        { id: 's3', label: '中三' },
        { id: 's4', label: '中四' },
        { id: 's5', label: '中五' },
        { id: 's6', label: '中六' }
    ];

    /**
     * Existing boards. New theory scores must not be written into
     * musicGameRanks_<gameKey> under these difficulty strings.
     */
    var LEGACY_RANK_DIFFICULTIES = [
        'easy', 'normal', 'hard', 'expert',
        'p1', 'p2', 'p3', 'p4', 'p5', 'p6',
        'Easy', 'Normal', 'Hard', 'Expert',
        '中一', '中二', '中三', '中四', '中五', '中六',
        '小三', '小四', '小五', '小六'
    ];
    var LEGACY_RANK_KEY_PREFIX = 'musicGameRanks_';
    var RANK_NAMESPACE = 'abrsm-theory-v1';

    var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    var PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    var SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
    var FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

    function gradeNumber(id) {
        var found = GRADES.filter(function (g) { return g.id === id; })[0];
        if (!found) throw new Error('unknown ABRSM grade: ' + id);
        return found.number;
    }

    function isSchoolYear(id) {
        return SCHOOL_YEARS.some(function (y) { return y.id === id || y.label === id; });
    }

    function isAbrsmGrade(id) {
        return GRADES.some(function (g) { return g.id === id; });
    }

    function accidentalFor(letter, pitchClass) {
        var natural = PITCH_CLASS[letter];
        var delta = (pitchClass - natural + 12) % 12;
        if (delta > 6) delta -= 12;
        if (delta < -2 || delta > 2) {
            throw new Error('cannot spell ' + letter + ' at pitch class ' + pitchClass);
        }
        return delta;
    }

    function formatNote(letter, accidental) {
        if (accidental === 0) return letter;
        if (accidental === 1) return letter + '#';
        if (accidental === 2) return letter + '##';
        if (accidental === -1) return letter + 'b';
        if (accidental === -2) return letter + 'bb';
        throw new Error('bad accidental ' + accidental);
    }

    function parseNote(name) {
        var m = String(name).match(/^([A-G])(##|bb|#|b)?$/);
        if (!m) throw new Error('bad note ' + name);
        var acc = m[2] === '#' ? 1 : m[2] === '##' ? 2 : m[2] === 'b' ? -1 : m[2] === 'bb' ? -2 : 0;
        return { letter: m[1], accidental: acc, pitchClass: (PITCH_CLASS[m[1]] + acc + 12) % 12 };
    }

    /** Semitone steps between successive letters, including the return to the tonic. */
    var SCALE_STEPS = {
        major: [2, 2, 1, 2, 2, 2, 1],
        'harmonic-minor': [2, 1, 2, 2, 1, 3, 1],
        'melodic-minor-ascending': [2, 1, 2, 2, 2, 2, 1],
        'natural-minor': [2, 1, 2, 2, 1, 2, 2]
    };

    function scaleSpelling(tonic, kind) {
        var start = parseNote(tonic);
        var steps = SCALE_STEPS[kind];
        if (!steps) throw new Error('unknown scale ' + kind);
        var letterIndex = LETTERS.indexOf(start.letter);
        var pitch = start.pitchClass;
        var notes = [formatNote(start.letter, start.accidental)];
        for (var i = 0; i < steps.length - 1; i++) {
            letterIndex = (letterIndex + 1) % 7;
            pitch = (pitch + steps[i]) % 12;
            var letter = LETTERS[letterIndex];
            notes.push(formatNote(letter, accidentalFor(letter, pitch)));
        }
        return notes;
    }

    function relativeMajorName(minorTonic) {
        var minor = parseNote(minorTonic);
        var letter = LETTERS[(LETTERS.indexOf(minor.letter) + 2) % 7];
        var pitch = (minor.pitchClass + 3) % 12;
        return formatNote(letter, accidentalFor(letter, pitch));
    }

    function signatureAccidentals(majorTonic) {
        var notes = scaleSpelling(majorTonic, 'major');
        var altered = notes.filter(function (n) { return n.length > 1; });
        if (!altered.length) return [];
        var flats = altered[0].slice(-1) === 'b';
        var order = flats ? FLAT_ORDER : SHARP_ORDER;
        var byLetter = {};
        altered.forEach(function (n) { byLetter[n.charAt(0)] = n; });
        return order.map(function (letter) { return byLetter[letter]; }).filter(Boolean);
    }

    /**
     * Introduction grades are the specification table, not accidental-count.
     * A minor (no signature) is Grade 2; C major (no signature) is Grade 1.
     */
    var KEY_DEFS = [
        { id: 'C', mode: 'major', introduced: 1 },
        { id: 'F', mode: 'major', introduced: 1 },
        { id: 'G', mode: 'major', introduced: 1 },
        { id: 'D', mode: 'major', introduced: 1 },
        { id: 'Bb', mode: 'major', introduced: 2 },
        { id: 'Eb', mode: 'major', introduced: 2 },
        { id: 'A', mode: 'major', introduced: 2 },
        { id: 'A', mode: 'minor', introduced: 2 },
        { id: 'E', mode: 'minor', introduced: 2 },
        { id: 'D', mode: 'minor', introduced: 2 },
        { id: 'E', mode: 'major', introduced: 3 },
        { id: 'Ab', mode: 'major', introduced: 3 },
        { id: 'C#', mode: 'minor', introduced: 3 },
        { id: 'F', mode: 'minor', introduced: 3 },
        { id: 'B', mode: 'minor', introduced: 3 },
        { id: 'G', mode: 'minor', introduced: 3 },
        { id: 'C', mode: 'minor', introduced: 3 },
        { id: 'F#', mode: 'minor', introduced: 3 },
        { id: 'B', mode: 'major', introduced: 4 },
        { id: 'Db', mode: 'major', introduced: 4 },
        { id: 'G#', mode: 'minor', introduced: 4 },
        { id: 'Bb', mode: 'minor', introduced: 4 },
        { id: 'F#', mode: 'major', introduced: 5 },
        { id: 'Gb', mode: 'major', introduced: 5 },
        { id: 'D#', mode: 'minor', introduced: 5 },
        { id: 'Eb', mode: 'minor', introduced: 5 }
    ];

    function buildKey(def) {
        var relativeMajor = def.mode === 'major' ? def.id : relativeMajorName(def.id);
        var signature = signatureAccidentals(relativeMajor);
        var usesFlats = signature.length > 0 && signature[0].indexOf('b') !== -1;
        return {
            id: def.id + (def.mode === 'minor' ? 'm' : ''),
            tonic: def.id,
            mode: def.mode,
            introduced: def.introduced,
            relativeMajor: relativeMajor,
            signature: signature,
            accidentalCount: signature.length,
            accidentalKind: signature.length === 0 ? 'none' : usesFlats ? 'flat' : 'sharp',
            majorScale: def.mode === 'major' ? scaleSpelling(def.id, 'major') : null,
            harmonicMinor: def.mode === 'minor' ? scaleSpelling(def.id, 'harmonic-minor') : null,
            abrsm: true
        };
    }

    var KEYS = KEY_DEFS.map(buildKey);

    var CLEFS = [
        { id: 'treble', name: 'treble', introduced: 1 },
        { id: 'bass', name: 'bass', introduced: 1 },
        { id: 'alto', name: 'alto', introduced: 4, description: 'C clef on the 3rd line' },
        { id: 'tenor', name: 'tenor', introduced: 5, description: 'C clef on the 4th line' }
    ];

    /**
     * Grade 4 prose (Qualification Specification 1.2, Grade 4 item 1):
     * "All simple and compound duple, triple and quadruple time signatures".
     * The page 16 table names the new examples 4/8, 6/4, 9/4, 6/16, 9/16 and
     * 12/16, but that sentence is the whole grid of beat units already in use:
     * simple minim / crotchet / quaver, and compound dotted minim / dotted
     * crotchet / dotted quaver, each duple, triple and quadruple.
     * 2/8 and 12/4 are the two cells that sentence includes and the bullet
     * list omitted. Semiquaver simple times (2/16, 3/16, 4/16) and dotted-
     * semibreve compound times (6/2, 9/2, 12/2) are not in that grid.
     */
    var METERS = [
        { id: '2/4', introduced: 1, family: 'simple', beats: 2, beatUnit: '1/4' },
        { id: '3/4', introduced: 1, family: 'simple', beats: 3, beatUnit: '1/4' },
        { id: '4/4', introduced: 1, family: 'simple', beats: 4, beatUnit: '1/4' },
        { id: 'common-time', introduced: 1, family: 'simple', beats: 4, beatUnit: '1/4', sameAs: '4/4' },
        { id: '3/8', introduced: 2, family: 'simple', beats: 3, beatUnit: '1/8' },
        { id: '2/2', introduced: 2, family: 'simple', beats: 2, beatUnit: '1/2' },
        { id: 'alla-breve', introduced: 2, family: 'simple', beats: 2, beatUnit: '1/2', sameAs: '2/2' },
        { id: '3/2', introduced: 2, family: 'simple', beats: 3, beatUnit: '1/2' },
        { id: '4/2', introduced: 2, family: 'simple', beats: 4, beatUnit: '1/2' },
        { id: '6/8', introduced: 3, family: 'compound', beats: 2, beatUnit: '3/8' },
        { id: '9/8', introduced: 3, family: 'compound', beats: 3, beatUnit: '3/8' },
        { id: '12/8', introduced: 3, family: 'compound', beats: 4, beatUnit: '3/8' },
        { id: '2/8', introduced: 4, family: 'simple', beats: 2, beatUnit: '1/8' },
        { id: '4/8', introduced: 4, family: 'simple', beats: 4, beatUnit: '1/8' },
        { id: '6/4', introduced: 4, family: 'compound', beats: 2, beatUnit: '3/4' },
        { id: '9/4', introduced: 4, family: 'compound', beats: 3, beatUnit: '3/4' },
        { id: '12/4', introduced: 4, family: 'compound', beats: 4, beatUnit: '3/4' },
        { id: '6/16', introduced: 4, family: 'compound', beats: 2, beatUnit: '3/16' },
        { id: '9/16', introduced: 4, family: 'compound', beats: 3, beatUnit: '3/16' },
        { id: '12/16', introduced: 4, family: 'compound', beats: 4, beatUnit: '3/16' },
        { id: '5/4', introduced: 5, family: 'irregular', beats: 5, beatUnit: '1/4', groupingFixed: false },
        { id: '7/4', introduced: 5, family: 'irregular', beats: 7, beatUnit: '1/4', groupingFixed: false },
        { id: '5/8', introduced: 5, family: 'irregular', beats: 5, beatUnit: '1/8', groupingFixed: false },
        { id: '7/8', introduced: 5, family: 'irregular', beats: 7, beatUnit: '1/8', groupingFixed: false }
    ];

    /**
     * Grouping stated by the syllabus: beam inside the beat.
     * Irregular meters require grouping, but the table does not fix one pattern.
     */
    var GROUPING = [
        { introduced: 1, appliesTo: 'simple', includeRests: false },
        { introduced: 2, appliesTo: 'simple', includeRests: true },
        { introduced: 3, appliesTo: 'compound', includeRests: true },
        { introduced: 5, appliesTo: 'irregular', includeRests: true, patternFixed: false }
    ];

    var NOTE_VALUES = [
        { id: 'semibreve', introduced: 1, quarters: 4 },
        { id: 'minim', introduced: 1, quarters: 2 },
        { id: 'crotchet', introduced: 1, quarters: 1 },
        { id: 'quaver', introduced: 1, quarters: 0.5 },
        { id: 'semiquaver', introduced: 1, quarters: 0.25 },
        { id: 'dotted-minim', introduced: 1, quarters: 3 },
        { id: 'dotted-crotchet', introduced: 1, quarters: 1.5 },
        { id: 'dotted-quaver', introduced: 1, quarters: 0.75 },
        { id: 'dotted-semibreve', introduced: 2, quarters: 6 },
        { id: 'triplet', introduced: 2 },
        { id: 'demisemiquaver', introduced: 3, quarters: 0.125 },
        { id: 'dotted-semiquaver', introduced: 3, quarters: 0.375 },
        { id: 'breve', introduced: 4, quarters: 8 },
        { id: 'double-dotted', introduced: 4 },
        { id: 'duplet', introduced: 4 },
        { id: 'quintuplet', introduced: 5 },
        { id: 'sextuplet', introduced: 5 }
    ];

    var INTERVALS = [
        { id: 'number-above-tonic', introduced: 1, qualities: false },
        { id: 'major-minor-perfect-above-tonic', introduced: 3, qualities: true, aboveTonicOnly: true },
        { id: 'any-diatonic-within-octave', introduced: 4 },
        { id: 'chromatic-and-compound', introduced: 5 }
    ];

    var TRIADS = [
        { id: 'tonic-root-position', introduced: 1, degrees: ['I'], inversion: 'root' },
        { id: 'primary-root-position', introduced: 4, degrees: ['I', 'IV', 'V'], inversion: 'root' }
    ];

    /**
     * Grade 5 inversions and cadences. Not part of the existing root-position
     * chord keyboard; do not add slash symbols there.
     */
    var CHORD_FUTURE_MODE = {
        id: 'abrsm-inversion-cadence',
        implemented: false,
        abrsmGrades: [5],
        conflictsWith: 'chord-phase1-root-position',
        degrees: ['I', 'ii', 'IV', 'V'],
        inversions: ['root', 'first', 'second'],
        cadences: ['perfect', 'plagal', 'imperfect'],
        cadenceKeys: ['C', 'G', 'D', 'F'],
        slashChords: false
    };

    function term(id, name, language, introduced, aliases) {
        return {
            id: id,
            name: name,
            language: language,
            introduced: introduced,
            gradeVerified: true,
            aliases: aliases || [],
            abrsm: true
        };
    }

    var TERMS = [
        term('a-tempo', 'a tempo', 'it', 1),
        term('accelerando', 'accelerando', 'it', 1, ['accel.']),
        term('adagio', 'adagio', 'it', 1),
        term('allegretto', 'allegretto', 'it', 1),
        term('allegro', 'allegro', 'it', 1),
        term('andante', 'andante', 'it', 1),
        term('cantabile', 'cantabile', 'it', 1),
        term('crescendo', 'crescendo', 'it', 1, ['cresc.']),
        term('da-capo', 'da capo', 'it', 1, ['D.C.']),
        term('decrescendo', 'decrescendo', 'it', 1, ['decresc.']),
        term('diminuendo', 'diminuendo', 'it', 1, ['dim.']),
        term('dolce', 'dolce', 'it', 1),
        term('forte', 'forte', 'it', 1, ['f']),
        term('fortissimo', 'fortissimo', 'it', 1, ['ff']),
        term('fine', 'fine', 'it', 1, ['al fine']),
        term('legato', 'legato', 'it', 1),
        term('mezzo-forte', 'mezzo forte', 'it', 1, ['mf']),
        term('moderato', 'moderato', 'it', 1),
        term('mezzo-piano', 'mezzo piano', 'it', 1, ['mp']),
        term('piano', 'piano', 'it', 1, ['p']),
        term('pianissimo', 'pianissimo', 'it', 1, ['pp']),
        term('rallentando', 'rallentando', 'it', 1, ['rall.']),
        term('ritardando', 'ritardando', 'it', 1, ['ritard.', 'rit.']),
        term('staccato', 'staccato', 'it', 1, ['stacc.']),
        term('alla-marcia', 'alla marcia', 'it', 2),
        term('allargando', 'allargando', 'it', 2),
        term('con-moto', 'con moto', 'it', 2),
        term('con', 'con', 'it', 2, ['col']),
        term('dal-segno', 'dal segno', 'it', 2, ['D.S.']),
        term('e', 'e', 'it', 2, ['ed']),
        term('espressivo', 'espressivo', 'it', 2, ['espress.']),
        term('fp', 'fp', 'it', 2, ['fortepiano']),
        term('grave', 'grave', 'it', 2),
        term('grazioso', 'grazioso', 'it', 2),
        term('largo', 'largo', 'it', 2),
        term('lento', 'lento', 'it', 2),
        term('ma', 'ma', 'it', 2),
        term('meno', 'meno', 'it', 2),
        term('meno-mosso', 'meno mosso', 'it', 2),
        term('molto', 'molto', 'it', 2),
        term('non-troppo', 'non troppo', 'it', 2),
        term('piu', 'più', 'it', 2),
        term('piu-mosso', 'più mosso', 'it', 2),
        term('poco', 'poco', 'it', 2, ['poco a poco']),
        term('presto', 'presto', 'it', 2),
        term('ritenuto', 'ritenuto', 'it', 2, ['riten.', 'rit.']),
        term('senza', 'senza', 'it', 2),
        term('vivace', 'vivace', 'it', 2, ['vivo']),
        term('agitato', 'agitato', 'it', 3),
        term('andantino', 'andantino', 'it', 3),
        term('animato', 'animato', 'it', 3),
        term('ben', 'ben', 'it', 3),
        term('con-forza', 'con forza', 'it', 3),
        term('energico', 'energico', 'it', 3),
        term('giocoso', 'giocoso', 'it', 3),
        term('leggiero', 'leggiero', 'it', 3),
        term('maestoso', 'maestoso', 'it', 3),
        term('marcato', 'marcato', 'it', 3, ['marc.']),
        term('pesante', 'pesante', 'it', 3),
        term('prestissimo', 'prestissimo', 'it', 3),
        term('prima', 'prima', 'it', 3, ['primo']),
        term('risoluto', 'risoluto', 'it', 3),
        term('scherzando', 'scherzando', 'it', 3),
        term('semplice', 'semplice', 'it', 3),
        term('sempre', 'sempre', 'it', 3),
        term('sforzando', 'sforzando', 'it', 3, ['sforzato', 'sfz', 'sf']),
        term('simile', 'simile', 'it', 3, ['sim.']),
        term('sostenuto', 'sostenuto', 'it', 3, ['sost.']),
        term('subito', 'subito', 'it', 3, ['sub.']),
        term('tranquillo', 'tranquillo', 'it', 3),
        term('triste', 'triste', 'it', 3, ['tristamente']),
        term('affettuoso', 'affettuoso', 'it', 4),
        term('alla-breve-term', 'alla breve', 'it', 4),
        term('amabile', 'amabile', 'it', 4),
        term('appassionato', 'appassionato', 'it', 4),
        term('assai', 'assai', 'it', 4),
        term('come-prima', 'come prima', 'it', 4),
        term('comodo', 'comodo', 'it', 4, ['tempo comodo']),
        term('con-brio', 'con brio', 'it', 4),
        term('deciso', 'deciso', 'it', 4),
        term('larghetto', 'larghetto', 'it', 4),
        term('mesto', 'mesto', 'it', 4),
        term('misterioso', 'misterioso', 'it', 4),
        term('ritmico', 'ritmico', 'it', 4),
        term('rubato', 'rubato', 'it', 4, ['tempo rubato']),
        term('stringendo', 'stringendo', 'it', 4),
        term('anime', 'animé', 'fr', 4),
        term('douce', 'douce', 'fr', 4),
        term('lent', 'lent', 'fr', 4),
        term('modere', 'modéré', 'fr', 4),
        term('retenu', 'retenu', 'fr', 4),
        term('vite', 'vite', 'fr', 4),
        term('a-niente', 'a niente', 'it', 5),
        term('ad-libitum', 'ad libitum', 'it', 5, ['ad lib.']),
        term('attacca', 'attacca', 'it', 5),
        term('cantando', 'cantando', 'it', 5),
        term('con-dolore', 'con dolore', 'it', 5),
        term('con-spirito', 'con spirito', 'it', 5),
        term('doloroso', 'doloroso', 'it', 5),
        term('largamente', 'largamente', 'it', 5),
        term('morendo', 'morendo', 'it', 5),
        term('perdendosi', 'perdendosi', 'it', 5),
        term('quasi', 'quasi', 'it', 5),
        term('rinforzando', 'rinforzando', 'it', 5, ['rf', 'rfz', 'rinf.']),
        term('smorzando', 'smorzando', 'it', 5, ['smorz.']),
        term('sonoro', 'sonoro', 'it', 5),
        term('sotto-voce', 'sotto voce', 'it', 5),
        term('langsam', 'langsam', 'de', 5),
        term('lebhaft', 'lebhaft', 'de', 5),
        term('massig', 'mässig', 'de', 5),
        term('ruhig', 'ruhig', 'de', 5),
        term('schnell', 'schnell', 'de', 5),
        term('traurig', 'traurig', 'de', 5)
    ];

    /** Present on the signs row; the extract did not separate the five columns. */
    var UNGRADED_SIGNS = [
        'crescendo hairpin', 'diminuendo hairpin', 'slur', 'tie', 'staccato dot',
        'accent', 'pause', 'metronome mark', 'repeat', 'strong accent',
        'semi-staccato', 'staccatissimo', 'tenuto', '8va', 'multiple-bar rest',
        'volta bracket'
    ].map(function (name) {
        return { id: name, name: name, introduced: null, gradeVerified: false, abrsm: true };
    });

    var ORNAMENTS = [
        { id: 'trill', introduced: 4, writtenOut: false },
        { id: 'turn', introduced: 4, writtenOut: false },
        { id: 'upper-mordent', introduced: 4, writtenOut: false },
        { id: 'lower-mordent', introduced: 4, writtenOut: false },
        { id: 'acciaccatura', introduced: 4, writtenOut: false },
        { id: 'appoggiatura', introduced: 4, writtenOut: false },
        { id: 'written-out-ornament', introduced: 5, writtenOut: true, reverseNotRequired: true }
    ];

    var INSTRUMENTS = [
        { id: 'violin', family: 'strings', introduced: 4 },
        { id: 'viola', family: 'strings', introduced: 4 },
        { id: 'cello', family: 'strings', introduced: 4 },
        { id: 'double-bass', family: 'strings', introduced: 4 },
        { id: 'flute', family: 'woodwind', introduced: 4 },
        { id: 'oboe', family: 'woodwind', introduced: 4 },
        { id: 'clarinet', family: 'woodwind', introduced: 4 },
        { id: 'bassoon', family: 'woodwind', introduced: 4 },
        { id: 'trumpet', family: 'brass', introduced: 4 },
        { id: 'horn', family: 'brass', introduced: 4 },
        { id: 'trombone', family: 'brass', introduced: 4 },
        { id: 'tuba', family: 'brass', introduced: 4 },
        { id: 'timpani', family: 'percussion', introduced: 4, definitePitch: true },
        { id: 'side-drum', family: 'percussion', introduced: 4, definitePitch: false },
        { id: 'bass-drum', family: 'percussion', introduced: 4, definitePitch: false },
        { id: 'cymbals', family: 'percussion', introduced: 4, definitePitch: false },
        { id: 'harp', family: 'strings', introduced: 5 },
        { id: 'piccolo', family: 'woodwind', introduced: 5 },
        { id: 'cor-anglais', family: 'woodwind', introduced: 5 },
        { id: 'piano', family: 'keyboard', introduced: 5 }
    ];

    var VOICES = [
        'soprano', 'mezzo-soprano', 'alto', 'tenor', 'baritone', 'bass'
    ].map(function (id) { return { id: id, introduced: 5 }; });

    /**
     * Classroom or later-harmony material. Must not receive an ABRSM grade badge.
     */
    var SUPPLEMENTAL = [
        { id: 'chinese-instruments', kind: 'instrument', abrsm: false, badge: null },
        { id: 'listening-identification', kind: 'aural', abrsm: false, badge: null },
        { id: 'synthesized-timbre', kind: 'aural', abrsm: false, badge: null },
        { id: 'movable-solfege', kind: 'solfege', abrsm: false, badge: null, note: 'Movable Do with Si is not an ABRSM theory item' },
        { id: 'kodaly-syllables', kind: 'rhythm-syllable', abrsm: false, badge: null },
        { id: 'chord-sevenths', kind: 'harmony', abrsm: false, badge: null, note: 'Dominant and other sevenths begin at Grade 6' },
        { id: 'chord-suspensions-as-qualities', kind: 'harmony', abrsm: false, badge: null, note: 'sus2 and sus4 are outside Grades 1–5 triads' }
    ];

    var LEDGER_LINES = [
        { introduced: 1, max: 1, note: 'Middle C is on the syllabus; two ledger lines are not yet required' },
        { introduced: 2, max: 2 },
        { introduced: 3, max: null, note: 'Beyond two ledger lines; the table gives no fixed maximum' }
    ];

    function introducedAtMost(items, grade) {
        var n = gradeNumber(grade);
        return items.filter(function (item) { return item.introduced != null && item.introduced <= n; });
    }

    function keysFor(gradeId) {
        return introducedAtMost(KEYS, gradeId);
    }

    function metersFor(gradeId) {
        return introducedAtMost(METERS, gradeId);
    }

    function clefsFor(gradeId) {
        return introducedAtMost(CLEFS, gradeId);
    }

    function termsFor(gradeId) {
        return introducedAtMost(TERMS, gradeId);
    }

    function keyById(id) {
        var found = KEYS.filter(function (k) { return k.id === id; })[0];
        if (!found) throw new Error('unknown key ' + id);
        return found;
    }

    function rankStorageKey(gameKey, syllabusId) {
        if (!isAbrsmGrade(syllabusId)) throw new Error('not an ABRSM grade');
        if (!gameKey) throw new Error('game key required');
        return RANK_NAMESPACE + ':' + gameKey + ':' + syllabusId;
    }

    function rankRecord(input) {
        var syllabusId = input.syllabusId;
        if (!isAbrsmGrade(syllabusId)) throw new Error('syllabusId must be abrsm-g1..g5');
        if (isSchoolYear(input.schoolYear) === false && input.schoolYear) {
            throw new Error('schoolYear must be a school identity, not a music grade');
        }
        return {
            rankNamespace: RANK_NAMESPACE,
            storageKey: rankStorageKey(input.gameKey, syllabusId),
            gameKey: input.gameKey,
            syllabusId: syllabusId,
            score: input.score,
            schoolYear: input.schoolYear || null,
            legacyBoard: false
        };
    }

    function legacyBoardVisible(record) {
        if (!record || record.rankNamespace === RANK_NAMESPACE || record.legacyBoard === false) return false;
        if (isAbrsmGrade(record.difficulty) || isAbrsmGrade(record.syllabusId)) return false;
        var key = record.storageKey || '';
        if (key.indexOf(RANK_NAMESPACE) === 0) return false;
        return true;
    }

    return {
        sources: SOURCES,
        grades: GRADES,
        schoolYears: SCHOOL_YEARS,
        legacyRankDifficulties: LEGACY_RANK_DIFFICULTIES.slice(),
        legacyRankKeyPrefix: LEGACY_RANK_KEY_PREFIX,
        rankNamespace: RANK_NAMESPACE,
        keys: KEYS,
        clefs: CLEFS,
        meters: METERS,
        grouping: GROUPING,
        noteValues: NOTE_VALUES,
        intervals: INTERVALS,
        triads: TRIADS,
        chordFutureMode: CHORD_FUTURE_MODE,
        terms: TERMS,
        ungradedSigns: UNGRADED_SIGNS,
        ornaments: ORNAMENTS,
        instruments: INSTRUMENTS,
        voices: VOICES,
        supplemental: SUPPLEMENTAL,
        ledgerLines: LEDGER_LINES,
        gradeNumber: gradeNumber,
        isSchoolYear: isSchoolYear,
        isAbrsmGrade: isAbrsmGrade,
        scaleSpelling: scaleSpelling,
        signatureAccidentals: signatureAccidentals,
        relativeMajorName: relativeMajorName,
        keysFor: keysFor,
        metersFor: metersFor,
        clefsFor: clefsFor,
        termsFor: termsFor,
        keyById: keyById,
        rankStorageKey: rankStorageKey,
        rankRecord: rankRecord,
        legacyBoardVisible: legacyBoardVisible,
        uiConnected: false
    };
});
