import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../note-name-teach.js', import.meta.url), 'utf8'), context);
const NT = context.NoteNameTeach;

const script = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const freqBlock = script.match(/NOTE_FREQUENCIES:\s*\{([^}]+)\}/)[1];

function gapsOk(model) {
  for (let i = 0; i < model.whites.length - 1; i++) {
    const gap = model.whites[i + 1].midi - model.whites[i].midi;
    const blacks = model.blacks.filter((key) => key.leftIndex === i);
    if (gap === 1) assert.equal(blacks.length, 0, 'semitone whites have no black key');
    if (gap === 2) {
      assert.equal(blacks.length, 1, 'whole-step whites have one black key');
      assert.equal(blacks[0].midi, model.whites[i].midi + 1);
    }
  }
}

assert.equal(NT.lineNames('treble').join(' '), 'E G B D F');
assert.equal(NT.spaceNames('treble').join(' '), 'F A C E');
assert.equal(NT.lineNames('bass').join(' '), 'G B D F A');
assert.equal(NT.spaceNames('bass').join(' '), 'A C E G');

const trebleC = NT.noteById('treble-C4');
const bassC = NT.noteById('bass-C4');
assert.equal(trebleC.midi, 60);
assert.equal(bassC.midi, 60);
assert.equal(NT.placeOf(trebleC.yFactor).label, '下加一線');
assert.equal(NT.placeOf(bassC.yFactor).label, '上加一線');
assert.match(NT.lessonText(trebleC, null), /中央 C/);
assert.match(NT.lessonText(bassC, null), /加線/);

const cs = NT.noteById('treble-Cs4');
const db = NT.noteById('treble-Db4');
assert.equal(cs.spelling, 'C#');
assert.equal(db.spelling, 'D♭');
assert.equal(cs.midi, db.midi);
assert.equal(cs.vexKey, 'c#/4');
assert.equal(db.vexKey, 'db/4');
assert.notEqual(cs.yFactor, db.yFactor);
assert.equal(cs.yFactor, trebleC.yFactor);
assert.equal(db.yFactor, NT.noteById('treble-D4').yFactor);
assert.equal(cs.freqKey, 'C#4');
assert.equal(db.freqKey, 'D♭4');
assert.equal(NT.enharmonicOf(cs).id, db.id);
assert.equal(NT.enharmonicOf(db).id, cs.id);
assert.match(NT.lessonText(cs, null), /同一個黑鍵/);
assert.match(NT.lessonText(cs, null), /D♭/);

assert.equal(NT.noteById('treble-Es4'), null);
assert.equal(NT.noteById('treble-Bs4'), null);
assert.equal(NT.noteById('treble-Cb4'), null);
assert.equal(NT.noteById('treble-Fb4'), null);

for (const note of NT.notes) {
  assert.match(freqBlock, new RegExp("'" + note.freqKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'"));
  assert.doesNotMatch(note.vexKey, /http|img\//);
}

for (const clef of ['treble', 'bass']) {
  for (const mode of ['natural', 'sharp', 'flat']) {
    const model = NT.keyboardModel(clef, mode);
    gapsOk(model);
    const ids = new Set([...model.whites, ...model.blacks].map((key) => key.id));
    for (const note of NT.sequence(clef, mode)) {
      assert.ok(ids.has(note.id), note.id + ' is on the ' + mode + ' keyboard');
    }
    const names = new Set([...model.whites, ...model.blacks].map((key) => key.name));
    if (mode === 'flat') assert.equal(names.has('C#'), false);
    if (mode === 'sharp' || mode === 'natural') assert.equal(names.has('D♭'), false);
  }
}

const sharpKb = NT.keyboardModel('treble', 'sharp');
const flatKb = NT.keyboardModel('treble', 'flat');
const sharpBlack = sharpKb.blacks.find((key) => key.midi === 61);
const flatBlack = flatKb.blacks.find((key) => key.midi === 61);
assert.equal(sharpBlack.name, 'C#');
assert.equal(flatBlack.name, 'D♭');
assert.equal(sharpBlack.leftIndex, flatBlack.leftIndex);
assert.notEqual(sharpBlack.id, flatBlack.id);

const html = NT.keyboardHtml('treble', 'sharp', 'treble-Cs4');
assert.match(html, /data-note-id="treble-Cs4"/);
assert.match(html, /is-selected/);
assert.match(html, />C#</);
assert.doesNotMatch(html, /D♭/);
assert.match(html, /left:7\.6923%/);
const flatHtml = NT.keyboardHtml('treble', 'flat', 'treble-Db4');
assert.match(flatHtml, /D♭/);
assert.doesNotMatch(flatHtml, /C#/);
assert.doesNotMatch(html + flatHtml, /https?:|tut-score|\.jpg/);

assert.equal(NT.topics.map((topic) => topic.label).join('|'), '線與間|中央 C|高音譜|低音譜|升號降號');
const joined = NT.topics.map((topic) => topic.blurb).join('') + NT.howTo + NT.playHow;
assert.match(joined, /線/);
assert.match(joined, /間/);
assert.match(joined, /中央 C/);
assert.match(joined, /加線/);
assert.match(joined, /高音譜/);
assert.match(joined, /低音譜/);
assert.match(joined, /升號/);
assert.match(joined, /降號/);
assert.match(NT.howTo, /聽這個音/);
assert.match(NT.playHow, /聽&看答案/);

for (const file of ['index.html', 'www/index.html']) {
  const page = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const setup = page.slice(page.indexOf('id="screen-setup"'), page.indexOf('id="screen-chord-card"'));
  const cardStart = setup.indexOf('id="setupUserCard"');
  const cardEnd = setup.indexOf('Custom settings removed', cardStart);
  const hidden = setup.slice(cardStart, cardEnd);
  assert.match(setup, /id="openNoteTeachBtn"/);
  assert.match(setup, /看圖學習/);
  assert.ok(setup.indexOf('id="openNoteTeachBtn"') > cardEnd);
  assert.doesNotMatch(hidden, /openNoteTeachBtn/);
  assert.match(page, /id="screen-note-teach"/);
  assert.match(page, /id="openNoteTeachFromHub"/);
  assert.match(page, /data-launch="openNoteTeachBtn"/);
  assert.match(page, /note-name-teach\.js\?v=3/);
  assert.match(page, /style\.css\?v=8/);
  assert.match(page, /bootstrap-instruments\.js\?v=7/);
  const teach = page.slice(page.indexOf('id="screen-note-teach"'), page.indexOf('介面二：遊戲核心'));
  assert.doesNotMatch(teach, /tut-score|tut-notes|\.jpg|raw\.githubusercontent/);
  assert.match(teach, /聽這個音/);
  assert.match(teach, /聽&amp;看答案|聽&看答案/);
}

assert.match(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /id="enterRhythmComposer"/);
assert.doesNotMatch(fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8'), /id="enterRhythmComposer"/);
assert.equal(
  fs.readFileSync(new URL('../note-name-teach.js', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../www/note-name-teach.js', import.meta.url), 'utf8')
);

const sharpWalk = NT.sequence('treble', 'sharp').map((note) => note.spelling);
assert.ok(sharpWalk.indexOf('C#') >= 0);
assert.equal(sharpWalk.includes('D♭'), false);
const flatWalk = NT.sequence('treble', 'flat').map((note) => note.spelling);
assert.ok(flatWalk.includes('D♭'));
assert.equal(flatWalk.includes('C#'), false);

console.log('note-name-teach tests ok', NT.notes.length, 'notes');
