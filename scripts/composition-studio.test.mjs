import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(new URL('../composition-studio.js', import.meta.url), 'utf8'),
  context
);

function duration(token) {
  switch (token) {
    case '休': return 1;
    case 'ta': return 1;
    case 'ta-a': return 2;
    case 'ta-a-a': return 3;
    case 'ta-i': return 1.5;
    case 'ti': return 0.5;
    case 'ti-ti': return 1;
    case 'ti-ri-ti-ri': return 1;
    case 'ti-ri': return 1;
    case 'ti-ti-ri': return 1;
    case 'ti-ri-ti': return 1;
    case 'ri-ti-ri': return 1;
    default: return 1;
  }
}

const studio = context.window.CompositionStudioFactory({
  CONFIG: {},
  MAPS: {},
  getRhythmTokenDuration: duration,
  beamTokens: new Set(),
  parseRhythmTaps() { return { taps: [], totalBeats: 0 }; },
  renderVexFlowBars() {},
  audio: {},
  getState() { return {}; },
  switchScreen() {},
  showToast() {},
  gasPost() {},
  renderNoteGlyph() { return ''; },
  keySignatures: [],
  openLightbox() {}
});

const api = studio._test;
const GLYPH_BEATS = { q: 1, h: 2, '8': 0.5, '16': 0.25, qr: 1 };

function beatsOf(specs) {
  return specs.reduce(function (sum, spec) {
    var b = GLYPH_BEATS[spec.dur];
    if (spec.dotted) b *= 1.5;
    return sum + b;
  }, 0);
}

function sig(specs) {
  return specs.map(function (spec) {
    return spec.dur + (spec.dotted ? '.' : '');
  }).join(' ');
}

function fill(token, count) {
  return Array.from({ length: count }, function () { return token; });
}

assert.equal(api.maxMeasures, 8);

const special = api.tokenGroups.find(function (group) {
  return group.title.indexOf('附點與切分') !== -1;
});
const taI = special.tokens.find(function (token) { return token.id === 'ta-i'; });
assert.equal(taI.label, '附點四分');
assert.equal(taI.sub, '1.5 拍');

assert.equal(sig(api.getRhythmTokenGlyphSpecs('ti-ri-ti-ri')), '16 16 16 16');
assert.equal(sig(api.getRhythmTokenGlyphSpecs('ti-ri')), '8. 16');
assert.equal(sig(api.getRhythmTokenGlyphSpecs('ti-ti-ri')), '8 16 16');
assert.equal(sig(api.getRhythmTokenGlyphSpecs('ti-ri-ti')), '16 16 8');
assert.equal(sig(api.getRhythmTokenGlyphSpecs('ri-ti-ri')), '16 8 16');
assert.equal(sig(api.getRhythmTokenGlyphSpecs('ta-i')), 'q.');
assert.notEqual(
  sig(api.getRhythmTokenGlyphSpecs('ri-ti-ri')),
  sig(api.getRhythmTokenGlyphSpecs('ti-ri'))
);

['ta', 'ta-a', 'ta-a-a', 'ta-i', '休', 'ti', 'ti-ti', 'ti-ri-ti-ri', 'ti-ri', 'ti-ti-ri', 'ti-ri-ti', 'ri-ti-ri']
  .forEach(function (id) {
    const specs = api.getRhythmTokenGlyphSpecs(id);
    assert.ok(specs && specs.length, id + ' has glyphs');
    assert.equal(beatsOf(specs), duration(id), id + ' glyph beats');
  });

assert.equal(api.canAddRhythmToken(['ta', 'ta', 'ta'], 'ta-a'), false);
assert.equal(api.rhythmAddBlockReason(['ta', 'ta', 'ta'], 'ta-a'), 'bar');
assert.equal(api.canAddRhythmToken(['ta', 'ta', 'ta'], 'ta'), true);
assert.equal(api.canAddRhythmToken([], 'ta-i'), true);
assert.equal(api.canAddRhythmToken(['ta', 'ta'], 'ta-i'), true);
assert.equal(api.canAddRhythmToken(['ta', 'ta', 'ti'], 'ta-i'), true);
assert.equal(api.canAddRhythmToken(['ta', 'ta', 'ta'], 'ta-i'), false);
assert.equal(api.canAddRhythmToken(['ti'], 'ti-ti'), false);
assert.equal(api.rhythmAddBlockReason(['ti'], 'ti-ri'), 'beat');
assert.equal(api.canAddRhythmToken(['ti'], 'ta-i'), true);

const eightBars = fill('ta', 32);
assert.equal(api.canAddRhythmToken(eightBars, 'ta'), false);
assert.equal(api.rhythmAddBlockReason(eightBars, 'ta'), 'max');
assert.equal(api.canAddRhythmToken(fill('ta', 31), 'ta'), true);
assert.equal(api.canAddRhythmToken(fill('ta', 31), 'ta-a'), false);

function list(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.deepEqual(list(api.normalizeLoadedRhythmFlat(eightBars.concat(['ta-i']))), []);
assert.deepEqual(list(api.normalizeLoadedRhythmFlat(fill('ta', 33))), []);
assert.deepEqual(list(api.normalizeLoadedRhythmFlat(eightBars)), eightBars);
assert.deepEqual(list(api.normalizeLoadedRhythmFlat(['ta-i', 'ti', 'ta', 'ta'])), ['ta-i', 'ti', 'ta', 'ta']);

const www = fs.readFileSync(new URL('../www/composition-studio.js', import.meta.url), 'utf8');
const root = fs.readFileSync(new URL('../composition-studio.js', import.meta.url), 'utf8');
assert.equal(www, root);
