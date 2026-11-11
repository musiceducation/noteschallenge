/**
 * Graded rhythm and term questions for abrsm-g1..g5.
 * Depends on AbrsmCurriculum.
 * Kodály syllables stay a classroom layer. The /rhythm/ composer is not a G5 meter set.
 */
(function (root, factory) {
    var api = factory(root && root.AbrsmCurriculum);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.AbrsmRhythmTerms = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (curriculum) {
    'use strict';

    if (!curriculum) throw new Error('AbrsmCurriculum must load first');

    var FAMILY = {
        'simple:2': '單二拍',
        'simple:3': '單三拍',
        'simple:4': '單四拍',
        'compound:2': '複二拍',
        'compound:3': '複三拍',
        'compound:4': '複四拍',
        'irregular:5': '五拍子',
        'irregular:7': '七拍子'
    };
    var BEAT = {
        '1/4': '四分音符',
        '1/8': '八分音符',
        '1/2': '二分音符',
        '3/8': '附點四分音符',
        '3/4': '附點二分音符',
        '3/16': '附點八分音符'
    };
    var GLOSS = {
        'a-tempo': '回原速', accelerando: '漸快', adagio: '柔板', allegretto: '小快板', allegro: '快板',
        andante: '行板', cantabile: '如歌地', crescendo: '漸強', 'da-capo': '從頭再奏', decrescendo: '漸弱',
        diminuendo: '漸弱', dolce: '柔美地', forte: '強', fortissimo: '很強', fine: '結束', legato: '連奏',
        'mezzo-forte': '中強', moderato: '中板', 'mezzo-piano': '中弱', piano: '弱', pianissimo: '很弱',
        rallentando: '漸慢', ritardando: '漸慢', staccato: '斷奏', 'alla-marcia': '進行曲風格',
        allargando: '漸慢並漸強', 'con-moto': '有動感地', con: '用、帶著', 'dal-segno': '從記號再奏',
        e: '以及', espressivo: '有表情地', fp: '強後即弱', grave: '莊板', grazioso: '優雅地', largo: '廣板',
        lento: '慢板', ma: '但是', meno: '較少', 'meno-mosso': '較慢地', molto: '非常', 'non-troppo': '不過分',
        piu: '更', 'piu-mosso': '更快地', poco: '少許', presto: '急板', ritenuto: '立即放慢', senza: '不加',
        vivace: '活潑地', agitato: '激動地', andantino: '小行板', animato: '有生氣地', ben: '充分地',
        'con-forza': '有力地', energico: '精力充沛地', giocoso: '嬉戲地', leggiero: '輕巧地', maestoso: '莊嚴地',
        marcato: '強調地', pesante: '沉重地', prestissimo: '最急板', prima: '第一', risoluto: '堅決地',
        scherzando: '諧謔地', semplice: '單純地', sempre: '一直', sforzando: '突強', simile: '同樣地繼續',
        sostenuto: '持續地', subito: '突然', tranquillo: '平靜地', triste: '憂傷地', affettuoso: '深情地',
        'alla-breve-term': '以二分音符為一拍', amabile: '親切地', appassionato: '熱情地', assai: '非常',
        'come-prima': '像先前一樣', comodo: '舒適的速度', 'con-brio': '有精神地', deciso: '果斷地',
        larghetto: '小廣板', mesto: '憂鬱地', misterioso: '神秘地', ritmico: '有節奏感地', rubato: '自由伸縮速度',
        stringendo: '加緊並漸快', anime: '活潑地', douce: '柔和地', lent: '慢', modere: '中等速度',
        retenu: '放慢', vite: '快', 'a-niente': '漸弱到無聲', 'ad-libitum': '隨演奏者', attacca: '緊接下一段',
        cantando: '如唱歌般', 'con-dolore': '悲痛地', 'con-spirito': '有精神地', doloroso: '痛苦地',
        largamente: '寬廣地', morendo: '逐漸消失', perdendosi: '逐漸聽不見', quasi: '好像', rinforzando: '加強',
        smorzando: '逐漸消失', sonoro: '響亮地', 'sotto-voce': '輕聲地', langsam: '慢', lebhaft: '活潑地',
        massig: '中等速度', ruhig: '平靜地', schnell: '快', traurig: '悲傷地'
    };
    var ORNAMENT_ZH = {
        trill: '顫音', turn: '回音', 'upper-mordent': '上波音', 'lower-mordent': '下波音',
        acciaccatura: '碎音', appoggiatura: '倚音'
    };
    var VALUES = [
        { id: 'semibreve', name: '全音符', quarters: 4, introduced: 1, kind: 'note' },
        { id: 'minim', name: '二分音符', quarters: 2, introduced: 1, kind: 'note' },
        { id: 'crotchet', name: '四分音符', quarters: 1, introduced: 1, kind: 'note' },
        { id: 'quaver', name: '八分音符', quarters: 0.5, introduced: 1, kind: 'note' },
        { id: 'semiquaver', name: '十六分音符', quarters: 0.25, introduced: 1, kind: 'note' },
        { id: 'dotted-minim', name: '附點二分音符', quarters: 3, introduced: 1, kind: 'note' },
        { id: 'dotted-crotchet', name: '附點四分音符', quarters: 1.5, introduced: 1, kind: 'note' },
        { id: 'dotted-quaver', name: '附點八分音符', quarters: 0.75, introduced: 1, kind: 'note' },
        { id: 'dotted-semibreve', name: '附點全音符', quarters: 6, introduced: 2, kind: 'note' },
        { id: 'triplet', name: '三連音', quarters: null, introduced: 2, kind: 'group', parts: 3 },
        { id: 'semibreve-rest', name: '全休止符', quarters: 4, introduced: 2, kind: 'rest' },
        { id: 'minim-rest', name: '二分休止符', quarters: 2, introduced: 2, kind: 'rest' },
        { id: 'crotchet-rest', name: '四分休止符', quarters: 1, introduced: 2, kind: 'rest' },
        { id: 'quaver-rest', name: '八分休止符', quarters: 0.5, introduced: 2, kind: 'rest' },
        { id: 'demisemiquaver', name: '三十二分音符', quarters: 0.125, introduced: 3, kind: 'note' },
        { id: 'dotted-semiquaver', name: '附點十六分音符', quarters: 0.375, introduced: 3, kind: 'note' },
        { id: 'breve', name: '二全音符', quarters: 8, introduced: 4, kind: 'note' },
        { id: 'double-dotted', name: '雙附點', quarters: null, introduced: 4, kind: 'dot' },
        { id: 'duplet', name: '二連音', quarters: null, introduced: 4, kind: 'group', parts: 2 },
        { id: 'quintuplet', name: '五連音', quarters: null, introduced: 5, kind: 'group', parts: 5 },
        { id: 'sextuplet', name: '六連音', quarters: null, introduced: 5, kind: 'group', parts: 6 }
    ];

    function gradeNumber(id) { return curriculum.gradeNumber(id); }

    function familyLabel(meter) {
        return FAMILY[meter.family + ':' + meter.beats] || meter.family;
    }

    function meters(gradeId) {
        return curriculum.metersFor(gradeId).map(function (meter) {
            return {
                id: meter.id,
                introduced: meter.introduced,
                family: meter.family,
                beats: meter.beats,
                beatUnit: meter.beatUnit,
                sameAs: meter.sameAs || null,
                irregular: meter.family === 'irregular',
                familyLabel: familyLabel(meter),
                beatLabel: BEAT[meter.beatUnit] || meter.beatUnit
            };
        });
    }

    function pick(list, answer, count) {
        var wrong = [];
        list.forEach(function (item) {
            if (item !== answer && wrong.indexOf(item) < 0) wrong.push(item);
        });
        var opts = [answer];
        for (var i = 0; i < wrong.length && opts.length < count; i++) opts.push(wrong[i]);
        return opts;
    }

    function meterQuestions(gradeId) {
        var rows = meters(gradeId);
        var families = rows.map(function (meter) { return meter.familyLabel; });
        var beats = rows.map(function (meter) { return meter.beatLabel; });
        var ids = rows.map(function (meter) { return meter.sameAs || meter.id; });
        var out = [];
        rows.forEach(function (meter) {
            var shown = meter.id === 'common-time' ? 'C（普通拍號）'
                : meter.id === 'alla-breve' ? '切開拍號' : meter.id;
            if (meter.sameAs) {
                out.push({
                    id: meter.id + '-same',
                    prompt: '拍號「' + shown + '」等於哪一個分數拍號？',
                    answer: meter.sameAs,
                    options: pick(ids, meter.sameAs, 4)
                });
                return;
            }
            out.push({
                id: meter.id + '-family',
                prompt: '拍號 ' + shown + ' 屬於哪一種拍子？',
                answer: meter.familyLabel,
                options: pick(families, meter.familyLabel, 4)
            });
            out.push({
                id: meter.id + '-beat',
                prompt: '拍號 ' + shown + ' 的一拍是什麼音符？',
                answer: meter.beatLabel,
                options: pick(beats, meter.beatLabel, 4)
            });
            if (meter.irregular) {
                out.push({
                    id: meter.id + '-group',
                    prompt: '拍號 ' + shown + ' 的小節分組是不是只有一種固定方式？',
                    answer: '不是。大綱要求分組，但沒有規定唯一分法。',
                    options: ['不是。大綱要求分組，但沒有規定唯一分法。', '一定是 3+2', '一定是 2+2+3', '一定是每拍都平均']
                });
            }
        });
        return out;
    }

    function values(gradeId) {
        var n = gradeNumber(gradeId);
        return VALUES.filter(function (item) { return item.introduced <= n; });
    }

    function valueQuestions(gradeId) {
        var rows = values(gradeId);
        var quarterAnswers = rows.filter(function (item) { return item.quarters != null; }).map(function (item) {
            return String(item.quarters);
        });
        return rows.map(function (item) {
            if (item.kind === 'group') {
                return {
                    id: item.id,
                    prompt: item.name + '是把音值分成幾等份？',
                    answer: String(item.parts),
                    options: pick(['2', '3', '4', '5', '6'], String(item.parts), 4)
                };
            }
            if (item.kind === 'dot') {
                return {
                    id: item.id,
                    prompt: '雙附點在原本音長之外，再加原本音長的多少？',
                    answer: '四分之三',
                    options: ['四分之三', '一半', '一倍', '四分之一']
                };
            }
            return {
                id: item.id,
                prompt: item.name + '等於幾個四分音符？',
                answer: String(item.quarters),
                options: pick(quarterAnswers.concat(['0.125', '0.375', '6', '8']), String(item.quarters), 4)
            };
        });
    }

    function glossedTerms(gradeId) {
        return curriculum.termsFor(gradeId).filter(function (term) {
            return Object.prototype.hasOwnProperty.call(GLOSS, term.id);
        }).map(function (term) {
            return {
                id: term.id,
                name: term.name,
                language: term.language,
                introduced: term.introduced,
                meaning: GLOSS[term.id]
            };
        });
    }

    function termQuestions(gradeId) {
        var rows = glossedTerms(gradeId);
        var meanings = rows.map(function (term) { return term.meaning; });
        var out = rows.map(function (term) {
            return {
                id: term.id,
                q: '「' + term.name + '」是什麼意思？',
                sym: term.name,
                ans: term.meaning,
                opts: pick(meanings, term.meaning, 4),
                isText: true,
                language: term.language
            };
        });
        if (gradeNumber(gradeId) >= 4) {
            var names = Object.keys(ORNAMENT_ZH).map(function (id) { return ORNAMENT_ZH[id]; });
            curriculum.ornaments.filter(function (item) {
                return item.introduced <= gradeNumber(gradeId) && ORNAMENT_ZH[item.id];
            }).forEach(function (item) {
                out.push({
                    id: 'ornament-' + item.id,
                    q: '「' + item.id.replace(/-/g, ' ') + '」是哪一種裝飾音？',
                    sym: item.id,
                    ans: ORNAMENT_ZH[item.id],
                    opts: pick(names, ORNAMENT_ZH[item.id], 4),
                    isText: true,
                    language: 'ornament'
                });
            });
        }
        if (gradeNumber(gradeId) >= 5) {
            out.push({
                id: 'ornament-written-out',
                q: '五級要寫出裝飾音的奏法。要不要從奏法反推原來的記號？',
                sym: '寫出裝飾音',
                ans: '不用',
                opts: ['不用', '一定要', '只限顫音', '只限倚音'],
                isText: true,
                language: 'ornament'
            });
        }
        return out;
    }

    function coverage(gradeId) {
        return {
            meters: true,
            noteValues: true,
            restsFrom: 'abrsm-g2',
            terms: true,
            frenchFrom: 'abrsm-g4',
            germanFrom: 'abrsm-g5',
            ornamentSignsFrom: 'abrsm-g4',
            writtenOutOrnamentReverse: false,
            kodalyClassroom: true,
            rhythmComposerMeters: ['2/4', '3/4', '4/4'],
            rhythmComposerThroughG5: false,
            transposition: false,
            chords: false,
            examReady: false,
            gradeId: gradeId || null
        };
    }

    function coverageText(gradeId) {
        var n = gradeNumber(gradeId);
        var meterNote = n < 2 ? 'G1 是 2/4、3/4、4/4 和普通拍號。'
            : n < 3 ? 'G2 加入 3/8、2/2、3/2、4/2、切開拍號、附點全音符、三連音和休止符。'
            : n < 4 ? 'G3 加入 6/8、9/8、12/8，以及三十二分音符。'
            : n < 5 ? 'G4 加入其餘單拍和複拍，包括 2/8 和 12/4，以及雙附點、二連音和裝飾音記號。'
            : 'G5 加入 5/4、7/4、5/8、7/8。這些拍子要分組，但沒有唯一固定分法。';
        return '難度是英皇樂理 G' + n + '。' + meterNote
            + '自由練習的柯達伊名是課堂層，不是級別。節奏拍回頁仍只有 2/4、3/4、4/4：它以四分音符為一拍，而且不用休止符，所以未包含 3/8、複拍子和 5/4、7/8。'
            + '移調、和弦轉位和終止式不在這一關，亦不是完整考試準備。';
    }

    return {
        meters: meters,
        meterQuestions: meterQuestions,
        values: values,
        valueQuestions: valueQuestions,
        glossedTerms: glossedTerms,
        termQuestions: termQuestions,
        coverage: coverage,
        coverageText: coverageText
    };
});
