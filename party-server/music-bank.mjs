/**
 * Shared Music Question Bank for Notes Challenge Multiplayer & Single-Player Practice.
 * Strictly VexFlow 5.0.0 compatible (clef, keys, accidental, exact pitch answer).
 * Difficulties: easy (容易), medium (中等), hard (困難) — aligned with existing site conventions.
 */

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

const EASY_NOTES = [
  { id: 'c4', clef: 'treble', vexKey: 'c/4', acc: null, answer: 'C', display: 'C4 (中央 Do)', freq: 261.63 },
  { id: 'd4', clef: 'treble', vexKey: 'd/4', acc: null, answer: 'D', display: 'D4 (Re)', freq: 293.66 },
  { id: 'e4', clef: 'treble', vexKey: 'e/4', acc: null, answer: 'E', display: 'E4 (Mi)', freq: 329.63 },
  { id: 'f4', clef: 'treble', vexKey: 'f/4', acc: null, answer: 'F', display: 'F4 (Fa)', freq: 349.23 },
  { id: 'g4', clef: 'treble', vexKey: 'g/4', acc: null, answer: 'G', display: 'G4 (Sol)', freq: 392.00 },
  { id: 'a4', clef: 'treble', vexKey: 'a/4', acc: null, answer: 'A', display: 'A4 (La)', freq: 440.00 },
  { id: 'b4', clef: 'treble', vexKey: 'b/4', acc: null, answer: 'B', display: 'B4 (Si)', freq: 493.88 },
  { id: 'c5', clef: 'treble', vexKey: 'c/5', acc: null, answer: 'C', display: 'C5 (高音 Do)', freq: 523.25 }
];

const MEDIUM_NOTES = [
  ...EASY_NOTES,
  { id: 'd5', clef: 'treble', vexKey: 'd/5', acc: null, answer: 'D', display: 'D5 (高音 Re)', freq: 587.33 },
  { id: 'e5', clef: 'treble', vexKey: 'e/5', acc: null, answer: 'E', display: 'E5 (高音 Mi)', freq: 659.25 },
  { id: 'f5', clef: 'treble', vexKey: 'f/5', acc: null, answer: 'F', display: 'F5 (高音 Fa)', freq: 698.46 },
  { id: 'g5', clef: 'treble', vexKey: 'g/5', acc: null, answer: 'G', display: 'G5 (高音 Sol)', freq: 783.99 },
  { id: 'c3', clef: 'bass', vexKey: 'c/3', acc: null, answer: 'C', display: '低音譜號 C3', freq: 130.81 },
  { id: 'e3', clef: 'bass', vexKey: 'e/3', acc: null, answer: 'E', display: '低音譜號 E3', freq: 164.81 },
  { id: 'g3', clef: 'bass', vexKey: 'g/3', acc: null, answer: 'G', display: '低音譜號 G3', freq: 196.00 },
  { id: 'a3', clef: 'bass', vexKey: 'a/3', acc: null, answer: 'A', display: '低音譜號 A3', freq: 220.00 }
];

const HARD_NOTES = [
  { id: 'f#4', clef: 'treble', vexKey: 'f#/4', acc: '#', answer: 'F#', display: 'F♯4 (升 Fa)', freq: 369.99 },
  { id: 'bb4', clef: 'treble', vexKey: 'bb/4', acc: 'b', answer: 'Bb', display: 'B♭4 (降 Si)', freq: 466.16 },
  { id: 'c#5', clef: 'treble', vexKey: 'c#/5', acc: '#', answer: 'C#', display: 'C♯5 (升 Do)', freq: 554.37 },
  { id: 'eb5', clef: 'treble', vexKey: 'eb/5', acc: 'b', answer: 'Eb', display: 'E♭5 (降 Mi)', freq: 622.25 },
  { id: 'g#4', clef: 'treble', vexKey: 'g#/4', acc: '#', answer: 'G#', display: 'G♯4 (升 Sol)', freq: 415.30 },
  { id: 'ab4', clef: 'treble', vexKey: 'ab/4', acc: 'b', answer: 'Ab', display: 'A♭4 (降 La)', freq: 415.30 },
  { id: 'f#3', clef: 'bass', vexKey: 'f#/3', acc: '#', answer: 'F#', display: '低音譜號 F♯3', freq: 185.00 },
  { id: 'bb2', clef: 'bass', vexKey: 'bb/2', acc: 'b', answer: 'Bb', display: '低音譜號 B♭2', freq: 116.54 },
  { id: 'eb3', clef: 'bass', vexKey: 'eb/3', acc: 'b', answer: 'Eb', display: '低音譜號 E♭3', freq: 155.56 },
  { id: 'c#4', clef: 'treble', vexKey: 'c#/4', acc: '#', answer: 'C#', display: 'C♯4 (升 Do)', freq: 277.18 }
];

const NATURAL_CHOICES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ACCIDENTAL_CHOICES = ['C#', 'Eb', 'F#', 'G#', 'Ab', 'Bb', 'C', 'D', 'E', 'F', 'G', 'A', 'B'];

function shuffle(arr, rng = Math.random) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getPoolForDifficulty(difficulty) {
  if (difficulty === 'hard') return HARD_NOTES;
  if (difficulty === 'medium') return MEDIUM_NOTES;
  return EASY_NOTES;
}

/**
 * Generates a single server-authoritative music question with 4 distinct tile choices.
 * Note: `answer` is kept server-side; call `toPublicQuestion(q)` before sending to clients.
 */
export function generateQuestion(difficulty = 'easy', qIndex = 0, rng = Math.random) {
  const diff = DIFFICULTIES.includes(difficulty) ? difficulty : 'easy';
  const pool = getPoolForDifficulty(diff);
  const item = pool[Math.floor(rng() * pool.length)];
  const choiceSource = diff === 'hard' ? ACCIDENTAL_CHOICES : NATURAL_CHOICES;
  const distractors = shuffle(choiceSource.filter(c => c !== item.answer), rng).slice(0, 3);
  const choices = shuffle([item.answer, ...distractors], rng);
  return {
    qId: `q_${qIndex}_${item.id}_${Math.floor(rng() * 1e6)}`,
    index: qIndex,
    difficulty: diff,
    clef: item.clef,
    vexKey: item.vexKey,
    acc: item.acc,
    freq: item.freq,
    display: item.display,
    answer: item.answer,
    choices
  };
}

export function generateQuestionSet(difficulty = 'easy', count = 4, rng = Math.random) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(generateQuestion(difficulty, i, rng));
  }
  return list;
}

/**
 * Strips the authoritative answer before broadcasting to clients during active play.
 */
export function toPublicQuestion(q) {
  if (!q) return null;
  return {
    qId: q.qId,
    index: q.index,
    difficulty: q.difficulty,
    clef: q.clef,
    vexKey: q.vexKey,
    acc: q.acc,
    freq: q.freq,
    choices: q.choices.slice()
  };
}
