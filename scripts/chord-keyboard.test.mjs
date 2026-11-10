import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(new URL('../chord-keyboard.js', import.meta.url), 'utf8'),
  context
);
const CK = context.ChordKeyboard;

function lit(model) {
  return [...model.whites, ...model.blacks]
    .filter((key) => key.role)
    .sort((a, b) => a.midi - b.midi);
}

function names(root, type) {
  return CK.chordToneNames(root, type).join(' ');
}

assert.equal(CK.symbolOf('C', ''), 'C');
assert.equal(CK.symbolOf('C', '7'), 'C7');
assert.equal(CK.symbolOf('C', 'maj7'), 'Cmaj7');
assert.equal(CK.QUALITIES[''].zh, '大三和弦');
assert.equal(CK.QUALITIES.sus2.zh, '掛二和弦');
assert.equal(CK.QUALITIES.sus4.zh, '掛四和弦');
assert.equal(CK.QUALITIES['7'].zh, '屬七和弦');
assert.doesNotMatch(CK.QUALITIES.sus2.zh, /大三|小三/);
assert.doesNotMatch(CK.QUALITIES.sus4.zh, /大三|小三/);

assert.equal(names('C', ''), 'C E G');
assert.equal(names('C', 'm'), 'C Eb G');
assert.equal(names('C', 'aug'), 'C E G#');
assert.equal(names('C', 'dim'), 'C Eb Gb');
assert.equal(names('C', 'sus2'), 'C D G');
assert.equal(names('C', 'sus4'), 'C F G');
assert.equal(names('C', '7'), 'C E G Bb');
assert.equal(names('C', 'maj7'), 'C E G B');
assert.equal(names('C', 'm7'), 'C Eb G Bb');
assert.equal(names('E', '7'), 'E G# B D');
assert.equal(names('Ab', 'aug'), 'Ab C E');
assert.equal(names('C', 'dim7'), 'C Eb Gb Bbb');
assert.equal(names('C#', 'aug'), 'C# E# G##');
assert.equal(names('F', 'dim'), 'F Ab Cb');

const major = CK.keyboardModel('C', '');
assert.deepEqual(lit(major).map((key) => key.midi), [60, 64, 67]);
assert.equal(lit(major)[0].role, 'root');
assert.equal(lit(major).filter((key) => key.role === 'tone').length, 2);
const cKeys = major.whites.filter((key) => key.midi % 12 === 0);
assert.equal(cKeys.length, 2);
assert.equal(cKeys[0].role, 'root');
assert.equal(cKeys[1].role, '');

const dom7 = CK.keyboardModel('C', '7');
assert.deepEqual(lit(dom7).map((key) => [key.name, key.role]), [
  ['C', 'root'],
  ['E', 'tone'],
  ['G', 'tone'],
  ['Bb', 'tone'],
]);
assert.ok(dom7.whites[dom7.whites.length - 1].midi >= 70);

const bbMaj7 = CK.keyboardModel('Bb', 'maj7');
assert.deepEqual(lit(bbMaj7).map((key) => key.name), ['Bb', 'D', 'F', 'A']);
const aKeys = [...bbMaj7.whites, ...bbMaj7.blacks].filter((key) => key.midi % 12 === 9);
assert.equal(aKeys.length, 2);
assert.equal(aKeys.find((key) => key.midi === 69).role, '');
assert.equal(aKeys.find((key) => key.midi === 81).role, 'tone');

for (const root of CK.ROOTS) {
  for (const type of CK.QUALITY_ORDER) {
    const model = CK.keyboardModel(root, type);
    const sounded = lit(model);
    const expected = CK.QUALITIES[type].intervals.length;
    assert.equal(sounded.length, expected, `${root}${type} lights every tone once`);
    assert.equal(sounded[0].role, 'root');
    assert.equal(sounded[0].midi, Math.min(...sounded.map((key) => key.midi)));
    const pcs = sounded.map((key) => key.midi % 12);
    assert.equal(new Set(pcs).size, pcs.length, `${root}${type} does not light a second octave`);
    const present = new Set([...model.whites, ...model.blacks].map((key) => key.midi));
    for (const tone of model.tones) {
      assert.ok(present.has(tone.midi), `${root}${type} keeps ${tone.name} on the keyboard`);
    }
    assert.equal(sounded.map((key) => key.name).join(' '), CK.chordToneNames(root, type).join(' '));
  }
}

const html = CK.renderCard('C', '7');
assert.match(html, /class="chord-card-symbol">C7</);
assert.match(html, /屬七和弦/);
assert.equal((html.match(/chord-kb-key--root/g) || []).length, 1);
assert.equal((html.match(/chord-kb-key--tone/g) || []).length, 3);
const keyNames = [...html.matchAll(/chord-kb-name">([^<]+)/g)].map((match) => match[1]);
assert.ok(!keyNames.includes('C7'));
assert.ok(keyNames.includes('Bb'));

const aug = CK.renderCard('Ab', 'aug');
assert.match(aug, /Ab/);
assert.match(aug, /增三和弦/);
assert.equal((aug.match(/chord-kb-name">G#/g) || []).length, 0);

console.log('chord-keyboard tests passed');
