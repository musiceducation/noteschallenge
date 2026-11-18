/**
 * Key-signature layout and font-free note glyphs.
 * Staff steps are measured from the top line, positive downward, 1 = one line.
 * Positions match VexFlow 5 key signatures on treble, bass, alto, and tenor.
 * Quiz keys stop at five accidentals; the step tables include all seven.
 */
var NotationStaff = (function () {
    var CLEFS = ['treble', 'bass', 'alto', 'tenor'];
    var SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
    var FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
    var SHARP_STEPS = {
        treble: [0, 1.5, -0.5, 1, 2.5, 0.5, 2],
        bass: [1, 2.5, 0.5, 2, 3.5, 1.5, 3],
        alto: [0.5, 2, 0, 1.5, 3, 1, 2.5],
        tenor: [3, 1, 2.5, 0.5, 2, 0, 1.5]
    };
    var FLAT_STEPS = {
        treble: [2, 0.5, 2.5, 1, 3, 1.5, 3.5],
        bass: [3, 1.5, 3.5, 2, 4, 2.5, 4.5],
        alto: [2.5, 1, 3, 1.5, 3.5, 2, 4],
        tenor: [1.5, 0, 2, 0.5, 2.5, 1, 3]
    };
    var KEYS = [
        { id: 'C', name: 'C大調', sharps: 0, flats: 0 },
        { id: 'G', name: 'G大調', sharps: 1, flats: 0 },
        { id: 'F', name: 'F大調', sharps: 0, flats: 1 },
        { id: 'D', name: 'D大調', sharps: 2, flats: 0 },
        { id: 'Bb', name: 'B♭大調', sharps: 0, flats: 2 },
        { id: 'A', name: 'A大調', sharps: 3, flats: 0 },
        { id: 'Eb', name: 'E♭大調', sharps: 0, flats: 3 },
        { id: 'E', name: 'E大調', sharps: 4, flats: 0 },
        { id: 'Ab', name: 'A♭大調', sharps: 0, flats: 4 },
        { id: 'B', name: 'B大調', sharps: 5, flats: 0 },
        { id: 'Db', name: 'D♭大調', sharps: 0, flats: 5 }
    ];
    var BY_ID = {};
    KEYS.forEach(function (key) { BY_ID[key.id] = key; });

    function paintPlan(gameType) {
        if (gameType === 'keysig') return { view: 'signature', signature: true, note: false };
        if (gameType === 'solfege') return { view: 'signature-note', signature: true, note: true };
        return { view: 'note', signature: false, note: true };
    }

    function keyById(id) {
        var key = BY_ID[id];
        if (!key) throw new Error('unknown key ' + id);
        return key;
    }

    function accidentals(keyId, clef) {
        if (CLEFS.indexOf(clef) < 0) throw new Error('unknown clef ' + clef);
        var key = keyById(keyId);
        var count = key.sharps || key.flats || 0;
        var kind = key.sharps ? 'sharp' : key.flats ? 'flat' : '';
        var order = kind === 'flat' ? FLAT_ORDER : SHARP_ORDER;
        var steps = kind === 'flat' ? FLAT_STEPS[clef] : SHARP_STEPS[clef];
        var out = [];
        for (var i = 0; i < count; i++) {
            out.push({ kind: kind, letter: order[i], step: steps[i] });
        }
        return out;
    }

    function escapeXml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function sharpGlyph() {
        return '<path d="M-3.1 -11.2 V11.2 M3.1 -11.2 V11.2" stroke="#1E1E2F" stroke-width="1.45" fill="none"/>'
            + '<path d="M-6.4 -1.6 L6.4 -4.8 M-6.4 4.8 L6.4 1.6" stroke="#1E1E2F" stroke-width="2.7" stroke-linecap="butt" fill="none"/>';
    }

    function flatGlyph() {
        return '<path d="M-2.1 -13.2 V7.4 M-2.1 -1.2 C5.6 -6.4 7.2 5.6 -2.1 7.2 C2.4 4.2 1.2 -0.2 -2.1 -1.2" fill="#1E1E2F"/>';
    }

    function clefMarkup(clef, top, gap) {
        if (clef === 'bass') {
            var y = top + gap;
            return '<g class="sig-clef" data-clef="bass" transform="translate(6 ' + (y - 22) + ')">'
                + '<path d="M16 4c-9 1-15 8-15 16 0 11 8 18 16 18 5 0 9-3 10-7 1-6-4-9-8-8-3 1-4 4-3 6 2 3 6 2 7-1 1-4-3-6-6-4" fill="#1E1E2F"/>'
                + '<circle cx="30" cy="10" r="2.3" fill="#1E1E2F"/>'
                + '<circle cx="30" cy="18" r="2.3" fill="#1E1E2F"/>'
                + '</g>';
        }
        if (clef === 'alto' || clef === 'tenor') {
            var mid = top + (clef === 'alto' ? 2 : 1) * gap;
            return '<g class="sig-clef" data-clef="' + clef + '" transform="translate(8 ' + (mid - 22) + ')">'
                + '<path d="M8 2 V42" stroke="#1E1E2F" stroke-width="2.2" fill="none"/>'
                + '<path d="M8 22c8-2 14-8 14-14 0-4-3-6-6-6-6 0-8 6-8 10 0 6 6 8 10 8-4 0-10 2-10 8 0 4 2 10 8 10 3 0 6-2 6-6 0-6-6-12-14-14z" fill="#1E1E2F"/>'
                + '</g>';
        }
        return '<g class="sig-clef" data-clef="treble" transform="translate(4 ' + (top + 3 * gap - 48.6) + ') scale(1.91)">'
            + '<path fill="#1E1E2F" d="m12.049 3.5296c0.305 3.1263-2.019 5.6563-4.0772 7.7014-0.9349 0.897-0.155 0.148-0.6437 0.594-0.1022-0.479-0.2986-1.731-0.2802-2.11 0.1304-2.6939 2.3198-6.5875 4.2381-8.0236 0.309 0.5767 0.563 0.6231 0.763 1.8382zm0.651 16.142c-1.232-0.906-2.85-1.144-4.3336-0.885-0.1913-1.255-0.3827-2.51-0.574-3.764 2.3506-2.329 4.9066-5.0322 5.0406-8.5394 0.059-2.232-0.276-4.6714-1.678-6.4836-1.7004 0.12823-2.8995 2.156-3.8019 3.4165-1.4889 2.6705-1.1414 5.9169-0.57 8.7965-0.8094 0.952-1.9296 1.743-2.7274 2.734-2.3561 2.308-4.4085 5.43-4.0046 8.878 0.18332 3.334 2.5894 6.434 5.8702 7.227 1.2457 0.315 2.5639 0.346 3.8241 0.099 0.2199 2.25 1.0266 4.629 0.0925 6.813-0.7007 1.598-2.7875 3.004-4.3325 2.192-0.5994-0.316-0.1137-0.051-0.478-0.252 1.0698-0.257 1.9996-1.036 2.26-1.565 0.8378-1.464-0.3998-3.639-2.1554-3.358-2.262 0.046-3.1904 3.14-1.7356 4.685 1.3468 1.52 3.833 1.312 5.4301 0.318 1.8125-1.18 2.0395-3.544 1.8325-5.562-0.07-0.678-0.403-2.67-0.444-3.387 0.697-0.249 0.209-0.059 1.193-0.449 2.66-1.053 4.357-4.259 3.594-7.122-0.318-1.469-1.044-2.914-2.302-3.792zm0.561 5.757c0.214 1.991-1.053 4.321-3.079 4.96-0.136-0.795-0.172-1.011-0.2626-1.475-0.4822-2.46-0.744-4.987-1.116-7.481 1.6246-0.168 3.4576 0.543 4.0226 2.184 0.244 0.577 0.343 1.197 0.435 1.812zm-5.1486 5.196c-2.5441 0.141-4.9995-1.595-5.6343-4.081-0.749-2.153-0.5283-4.63 0.8207-6.504 1.1151-1.702 2.6065-3.105 4.0286-4.543 0.183 1.127 0.366 2.254 0.549 3.382-2.9906 0.782-5.0046 4.725-3.215 7.451 0.5324 0.764 1.9765 2.223 2.7655 1.634-1.102-0.683-2.0033-1.859-1.8095-3.227-0.0821-1.282 1.3699-2.911 2.6513-3.198 0.4384 2.869 0.9413 6.073 1.3797 8.943-0.5054 0.1-1.0211 0.143-1.536 0.143z"/>'
            + '</g>';
    }

    function noteMarkup(step, x, y, reveal, solfege) {
        var head = '<ellipse cx="0" cy="0" rx="8.2" ry="5.6" fill="#1E1E2F" transform="rotate(-18)"/>';
        var stem = '<path d="M6.2 -1 V-34" stroke="#1E1E2F" stroke-width="1.7" fill="none"/>';
        var mark = '';
        if (reveal) {
            mark = '<circle cx="0" cy="-8" r="16" fill="none" stroke="#FF4A6B" stroke-width="2" stroke-dasharray="5 4"/>';
            if (solfege) {
                mark += '<text class="sig-solfege" x="0" y="22" text-anchor="middle" font-size="12" font-weight="800" fill="#FF4A6B" font-family="Nunito, Noto Sans TC, sans-serif">'
                    + escapeXml(solfege) + '</text>';
            }
        }
        return '<g class="sig-note" data-step="' + step + '" transform="translate(' + x + ' ' + y + ')">' + head + stem + mark + '</g>';
    }

    function signatureMarkup(opts) {
        opts = opts || {};
        var clef = CLEFS.indexOf(opts.clef) >= 0 ? opts.clef : 'treble';
        var accs = opts.keyId ? accidentals(opts.keyId, clef) : [];
        var gap = 10;
        var top = 42;
        var height = 132;
        var accStart = clef === 'treble' ? 46 : 52;
        var accGap = 13;
        var accEnd = accStart + (accs.length ? accs.length * accGap : 0);
        var width = Math.max(280, accEnd + 150);
        var noteX = accs.length ? Math.round(accEnd + (width - 16 - accEnd) / 2) : Math.round(width * 0.62);
        var parts = [];
        for (var line = 0; line < 5; line++) {
            var ly = top + line * gap;
            parts.push('<line x1="8" y1="' + ly + '" x2="' + (width - 8) + '" y2="' + ly + '" stroke="#1E1E2F" stroke-width="1.4"/>');
        }
        parts.push(clefMarkup(clef, top, gap));
        accs.forEach(function (acc, index) {
            var x = accStart + index * accGap;
            var y = top + acc.step * gap;
            parts.push('<g class="sig-acc" data-kind="' + acc.kind + '" data-letter="' + acc.letter + '" data-step="' + acc.step + '" transform="translate(' + x + ' ' + y + ')">'
                + (acc.kind === 'flat' ? flatGlyph() : sharpGlyph()) + '</g>');
        });
        if (opts.note && typeof opts.note.step === 'number') {
            var step = opts.note.step;
            var ny = top + step * gap;
            if (step > 4) {
                for (var s = 5; s <= Math.floor(step + 0.001); s++) {
                    parts.push('<line x1="' + (noteX - 14) + '" y1="' + (top + s * gap) + '" x2="' + (noteX + 14) + '" y2="' + (top + s * gap) + '" stroke="#1E1E2F" stroke-width="1.5"/>');
                }
            }
            if (step < 0) {
                for (var s2 = -1; s2 >= Math.ceil(step - 0.001); s2--) {
                    parts.push('<line x1="' + (noteX - 14) + '" y1="' + (top + s2 * gap) + '" x2="' + (noteX + 14) + '" y2="' + (top + s2 * gap) + '" stroke="#1E1E2F" stroke-width="1.5"/>');
                }
            }
            parts.push(noteMarkup(step, noteX, ny, !!opts.note.reveal, opts.note.solfege || ''));
        }
        if (opts.keyName) {
            parts.push('<text class="sig-key-name" x="10" y="' + (top + 4 * gap + 22) + '" font-size="13" font-weight="800" fill="#7c3aed" font-family="Nunito, Noto Sans TC, sans-serif">'
                + escapeXml(opts.keyName) + '</text>');
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" class="sig-staff" data-clef="' + clef + '" data-key="' + escapeXml(opts.keyId || '') + '" data-acc-count="' + accs.length + '">'
            + parts.join('') + '</svg>';
    }

    return {
        CLEFS: CLEFS,
        KEYS: KEYS,
        SHARP_ORDER: SHARP_ORDER,
        FLAT_ORDER: FLAT_ORDER,
        SHARP_STEPS: SHARP_STEPS,
        FLAT_STEPS: FLAT_STEPS,
        paintPlan: paintPlan,
        accidentals: accidentals,
        signatureMarkup: signatureMarkup
    };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NotationStaff;
