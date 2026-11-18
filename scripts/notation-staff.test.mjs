import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load(file) {
  const src = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(src + '\nthis.api = NotationStaff;', context);
  return context.api;
}

const root = load('notation-staff.js');
const www = load('www/notation-staff.js');
assert.equal(
  fs.readFileSync(new URL('../notation-staff.js', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../www/notation-staff.js', import.meta.url), 'utf8')
);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function quizKeysFrom(file) {
  const src = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const start = src.indexOf('const KEY_SIGNATURES');
  const end = src.indexOf('function keysigAccidentalCount');
  const context = {};
  vm.createContext(context);
  vm.runInContext(src.slice(start, end) + '\nthis.keys = KEY_SIGNATURES;', context);
  return context.keys;
}

for (const api of [root, www]) {
  const quiz = quizKeysFrom('script.js');
  assert.deepEqual(plain(api.KEYS.map((key) => key.id)), plain(quiz.map((key) => key.id)));
  quiz.forEach((key, index) => {
    assert.equal(api.KEYS[index].sharps, key.sharps);
    assert.equal(api.KEYS[index].flats, key.flats);
    assert.equal(api.KEYS[index].name, key.name);
  });

  assert.deepEqual(plain(api.SHARP_ORDER), ['F', 'C', 'G', 'D', 'A', 'E', 'B']);
  assert.deepEqual(plain(api.FLAT_ORDER), ['B', 'E', 'A', 'D', 'G', 'C', 'F']);
  for (const clef of api.CLEFS) {
    assert.equal(api.SHARP_STEPS[clef].length, 7, clef);
    assert.equal(api.FLAT_STEPS[clef].length, 7, clef);
    assert.equal(new Set(api.SHARP_STEPS[clef]).size, 7, clef);
    assert.equal(new Set(api.FLAT_STEPS[clef]).size, 7, clef);
  }

  for (const key of api.KEYS) {
    for (const clef of api.CLEFS) {
      const accs = api.accidentals(key.id, clef);
      const count = Math.max(key.sharps, key.flats);
      assert.equal(accs.length, count, key.id + ' ' + clef);
      accs.forEach((acc, index) => {
        if (key.sharps) {
          assert.equal(acc.kind, 'sharp');
          assert.equal(acc.letter, api.SHARP_ORDER[index]);
          assert.equal(acc.step, api.SHARP_STEPS[clef][index]);
        } else if (key.flats) {
          assert.equal(acc.kind, 'flat');
          assert.equal(acc.letter, api.FLAT_ORDER[index]);
          assert.equal(acc.step, api.FLAT_STEPS[clef][index]);
        }
      });
      const markup = api.signatureMarkup({ keyId: key.id, clef: clef });
      assert.equal((markup.match(/class="sig-acc"/g) || []).length, count, key.id + ' ' + clef);
      assert.equal(markup.includes('class="sig-note"'), false, key.id);
      assert.doesNotMatch(markup, /[\u{1D100}-\u{1D1FF}]/u);
      assert.doesNotMatch(markup, /[𝄞𝄢♯♭♮𝄪𝄫]/);
      assert.match(markup, /<path /);
      accs.forEach((acc) => {
        assert.match(markup, new RegExp('data-letter="' + acc.letter + '" data-step="' + acc.step + '"'));
      });
    }
  }

  assert.deepEqual(plain(api.accidentals('E', 'treble').map((acc) => acc.step)), [0, 1.5, -0.5, 1]);
  assert.deepEqual(plain(api.accidentals('E', 'bass').map((acc) => acc.letter)), ['F', 'C', 'G', 'D']);
  assert.deepEqual(plain(api.accidentals('Db', 'alto').map((acc) => acc.letter)), ['B', 'E', 'A', 'D', 'G']);
  assert.deepEqual(plain(api.accidentals('B', 'tenor').map((acc) => acc.step)), [3, 1, 2.5, 0.5, 2]);
  assert.deepEqual(plain(api.accidentals('C', 'treble')), []);
  assert.equal(api.SHARP_STEPS.treble[5], 0.5);
  assert.equal(api.SHARP_STEPS.treble[6], 2);
  assert.equal(api.FLAT_STEPS.treble[5], 1.5);
  assert.equal(api.FLAT_STEPS.treble[6], 3.5);

  const notes = api.paintPlan('practice');
  const keysig = api.paintPlan('keysig');
  const back = api.paintPlan(undefined);
  const solfege = api.paintPlan('solfege');
  assert.deepEqual(plain(notes), { view: 'note', signature: false, note: true });
  assert.deepEqual(plain(keysig), { view: 'signature', signature: true, note: false });
  assert.deepEqual(plain(back), plain(notes));
  assert.deepEqual(plain(solfege), { view: 'signature-note', signature: true, note: true });
  assert.equal(api.paintPlan('keysig').note, false);
  assert.equal(api.paintPlan('solfege').signature, true);

  for (const id of ['C', 'G', 'F', 'D']) {
    const withNote = api.signatureMarkup({
      keyId: id,
      clef: 'treble',
      keyName: api.KEYS.find((key) => key.id === id).name,
      note: { step: 2, reveal: true, solfege: 'Mi' }
    });
    assert.match(withNote, /class="sig-note"/);
    assert.match(withNote, /data-step="2"/);
    assert.match(withNote, />Mi</);
    assert.match(withNote, new RegExp('data-key="' + id + '"'));
    assert.equal((withNote.match(/class="sig-acc"/g) || []).length, api.accidentals(id, 'treble').length);
  }

  const low = api.signatureMarkup({ keyId: 'G', clef: 'treble', note: { step: 5 } });
  assert.match(low, /data-step="5"/);
  const high = api.signatureMarkup({ keyId: 'D', clef: 'treble', note: { step: -1 } });
  assert.match(high, /data-step="-1"/);
}

for (const file of ['script.js', 'www/script.js']) {
  const src = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const draw = src.slice(src.indexOf('function drawStaff()'), src.indexOf('function toggleCheckboxAppearance'));
  const guard = draw.indexOf("plan.view === 'signature'");
  const notePaint = draw.indexOf('renderAbrsmNote');
  assert.ok(guard > 0 && notePaint > guard, file);
  assert.match(draw, /plan\.view === 'signature-note'/);
  const question = src.slice(src.indexOf('function renderKeysigQuestion'), src.indexOf('function handleKeysigAnswer'));
  assert.match(question, /renderKeysigStaff/);
  assert.equal(question.includes('keysigImg.src'), false, file);
  const solfege = src.slice(src.indexOf('function drawStaffWithKeySig'), src.indexOf('function handleSolfegeAnswer'));
  assert.match(solfege, /signatureMarkup/);
  assert.match(solfege, /note\.keySig/);
  assert.equal(solfege.includes('fillText'), false, file);
}

for (const file of ['index.html', 'www/index.html']) {
  const page = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(page, /notation-staff\.js\?v=1/);
  assert.match(page, /rhythm-levels\.js\?v=2/);
}

console.log('notation-staff tests passed');
