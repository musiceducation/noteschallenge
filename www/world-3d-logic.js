/**
 * 糖豆人音樂派對世界 3D — 50人多地形關卡、動作與音樂教育核心模組 (MusicPartyWorldLogic)
 * - 六大立體關卡地形：
 *   1. tiles     🟦 懸浮蜂巢地磚陣
 *   2. piano     🎹 13鍵巨型立體鋼琴階梯（白鍵 0.55m ＋ 黑鍵 1.25m 雙層高低差）
 *   3. gates     🚪 峽谷加速帶＋擺錘音門衝關賽
 *   4. turntable 💿 雙環反向旋轉黑膠唱片轉盤
 *   5. freeze    🥁 四島彩虹橋浮空鼓陣
 *   6. crown     👑 三層黃金金字塔皇冠山丘（0.65m / 1.35m / 2.05m 登頂搶分）
 * - 綜藝五關皇冠秀 (mix)：5 關一輪全部採用不同立體地形！
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MusicPartyWorldLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ARENA_METRICS = {
    maxPlayers: 50,
    islandRadius: 38.0,
    tileSize: 6.8,
    tileGap: 7.5,
    tilePitHalf: 11.1,
    gateCount: 4,
    gateXs: [-13.5, -4.5, 4.5, 13.5],
    gateZ: -6.5,
    gateWidth: 5.8,
    gateBumpers: [
      { x: -9.0, z: 4.2, radius: 1.35 },
      { x: 0.0, z: 3.5, radius: 1.45 },
      { x: 9.0, z: 4.2, radius: 1.35 }
    ],
    gateBoostPads: [
      { x: -11.0, z: 10.2, w: 3.2, d: 2.6 },
      { x: 0.0, z: 10.6, w: 3.4, d: 2.6 },
      { x: 11.0, z: 10.2, w: 3.2, d: 2.6 }
    ],
    turntableRadius: 19.2,
    turntableInnerRadius: 9.8,
    turntableOmega: 0.42,
    freezeZoneRadius: 5.2,
    freezeCoords: [
      { x: -13.5, z: -11.5, color: 0xf43f5e },
      { x: 13.5, z: -11.5, color: 0x0ea5e9 },
      { x: -13.5, z: 11.5, color: 0x10b981 },
      { x: 13.5, z: 11.5, color: 0xa855f7 }
    ],
    crownRadius: 7.6,
    crownTiers: [
      { radius: 7.6, height: 0.65 },
      { radius: 5.0, height: 1.35 },
      { radius: 2.7, height: 2.05 }
    ],
    crownOrbCount: 14
  };

  // 13 Giant 3D Grand Piano Keys (8 White C4..C5 + 5 Raised Black Sharps/Flats)
  var PIANO_STAGE_KEYS = [
    { id: 'C4',  label: 'C4 (Do)', isSharp: false, x: -13.3, z: 0.8,  w: 3.55, d: 13.6, topY: 0.55, freq: 261.63 },
    { id: 'D4',  label: 'D4 (Re)', isSharp: false, x: -9.5,  z: 0.8,  w: 3.55, d: 13.6, topY: 0.55, freq: 293.66 },
    { id: 'E4',  label: 'E4 (Mi)', isSharp: false, x: -5.7,  z: 0.8,  w: 3.55, d: 13.6, topY: 0.55, freq: 329.63 },
    { id: 'F4',  label: 'F4 (Fa)', isSharp: false, x: -1.9,  z: 0.8,  w: 3.55, d: 13.6, topY: 0.55, freq: 349.23 },
    { id: 'G4',  label: 'G4 (Sol)',isSharp: false, x: 1.9,   z: 0.8,  w: 3.55, d: 13.6, topY: 0.55, freq: 392.00 },
    { id: 'A4',  label: 'A4 (La)', isSharp: false, x: 5.7,   z: 0.8,  w: 3.55, d: 13.6, topY: 0.55, freq: 440.00 },
    { id: 'B4',  label: 'B4 (Si)', isSharp: false, x: 9.5,   z: 0.8,  w: 3.55, d: 13.6, topY: 0.55, freq: 493.88 },
    { id: 'C5',  label: 'C5 (高Do)',isSharp: false, x: 13.3,  z: 0.8,  w: 3.55, d: 13.6, topY: 0.55, freq: 523.25 },
    // Elevated Black Keys (topY: 1.25m, placed toward back half of white keys)
    { id: 'C#4', label: 'C♯4 / D♭4', isSharp: true, x: -11.4, z: -2.1, w: 2.25, d: 8.0, topY: 1.25, freq: 277.18 },
    { id: 'Eb4', label: 'E♭4 / D♯4', isSharp: true, x: -7.6,  z: -2.1, w: 2.25, d: 8.0, topY: 1.25, freq: 311.13 },
    { id: 'F#4', label: 'F♯4 / G♭4', isSharp: true, x: 0.0,   z: -2.1, w: 2.25, d: 8.0, topY: 1.25, freq: 369.99 },
    { id: 'G#4', label: 'G♯4 / A♭4', isSharp: true, x: 3.8,   z: -2.1, w: 2.25, d: 8.0, topY: 1.25, freq: 415.30 },
    { id: 'Bb4', label: 'B♭4 / A♯4', isSharp: true, x: 7.6,   z: -2.1, w: 2.25, d: 8.0, topY: 1.25, freq: 466.16 }
  ];

  // Every round in the 5-Round Crown Show uses a completely distinct 3D layout!
  var MIX_ROTATION = ['tiles', 'piano', 'gates', 'turntable', 'crown'];

  function hashSeed(str) {
    var s = String(str || 'MUSIC1');
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function createSeededRng(seed) {
    var a = (Number(seed) >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleWithRng(list, rng) {
    var arr = list.slice();
    var rand = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function shortestAngleDiff(fromRad, toRad) {
    var twoPi = Math.PI * 2;
    var diff = (toRad - fromRad) % twoPi;
    if (diff > Math.PI) diff -= twoPi;
    if (diff < -Math.PI) diff += twoPi;
    return diff;
  }

  var NOTE_FREQ_MAP = {
    'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
    'C4': 261.63, 'C♯4': 277.18, 'D4': 293.66, 'E♭4': 311.13, 'E4': 329.63, 'F4': 349.23,
    'F♯4': 369.99, 'G4': 392.00, 'G♯4': 415.30, 'A4': 440.00, 'B♭4': 466.16, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99
  };
  var PENTA_FALLBACK = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99];

  function labelToFreq(label, fallbackIndex) {
    var s = String(label || '');
    var keys = Object.keys(NOTE_FREQ_MAP);
    for (var i = 0; i < keys.length; i++) {
      if (s.indexOf(keys[i]) === 0 || s.indexOf(keys[i] + ' ') === 0) return NOTE_FREQ_MAP[keys[i]];
    }
    if (s.indexOf('Do') >= 0) return 523.25;
    if (s.indexOf('Re') >= 0) return 587.33;
    if (s.indexOf('Mi') >= 0) return 659.25;
    if (s.indexOf('Fa') >= 0) return 349.23;
    if (s.indexOf('Sol') >= 0) return 392.00;
    if (s.indexOf('La') >= 0) return 440.00;
    if (s.indexOf('Si') >= 0) return 493.88;
    var idx = Math.abs(Number(fallbackIndex) || hashSeed(s)) % PENTA_FALLBACK.length;
    return PENTA_FALLBACK[idx];
  }

  function computeSpawnSlot(slotIndex, effectiveMode) {
    var idx = ((Math.floor(Number(slotIndex) || 0) % 50) + 50) % 50;
    if (effectiveMode === 'gates' || effectiveMode === 'piano') {
      var row = Math.floor(idx / 17);
      var col = idx % 17;
      var colsInRow = row === 2 ? 16 : 17;
      var x = (col - (colsInRow - 1) * 0.5) * 1.95;
      var baseZ = effectiveMode === 'piano' ? 12.2 : 16.5;
      var z = baseZ + row * 2.25;
      return { x: Number(x.toFixed(2)), z: Number(z.toFixed(2)), yaw: Math.PI };
    }
    var ring = idx < 25 ? 0 : 1;
    var posInRing = idx < 25 ? idx : (idx - 25);
    var rad = ring === 0 ? 16.8 : 20.6;
    var ang = (posInRing / 25) * Math.PI * 2 + ring * 0.12;
    var sx = Math.cos(ang) * rad;
    var sz = Math.sin(ang) * rad;
    return {
      x: Number(sx.toFixed(2)),
      z: Number(sz.toFixed(2)),
      yaw: Number(Math.atan2(-sx, -sz).toFixed(2))
    };
  }

  /**
   * Computes turntable sector index (0..3) and tangential velocity at (px, pz)
   * given deterministic turntable rotation angle `turntableAngle` (matching Three.js group.rotation.y).
   */
  function computeTurntableState(px, pz, turntableAngle) {
    var r = Math.hypot(px, pz);
    if (r > ARENA_METRICS.turntableRadius || r < 0.01) {
      return { onTurntable: false, sector: -1, carryVx: 0, carryVz: 0 };
    }
    // World angle in XZ plane -> local angle inside Three.js group rotated by `rotation.y = turntableAngle`
    // Local point (lx, lz) rotated by +Y `a` goes to: wx = lx*cos(a) + lz*sin(a), wz = -lx*sin(a) + lz*cos(a)
    // Inverse: lx = wx*cos(a) - wz*sin(a), lz = wx*sin(a) + wz*cos(a)
    var cosA = Math.cos(turntableAngle);
    var sinA = Math.sin(turntableAngle);
    var lx = px * cosA - pz * sinA;
    var lz = px * sinA + pz * cosA;
    var localAng = Math.atan2(lz, lx); // [-pi, pi]
    if (localAng < 0) localAng += Math.PI * 2;
    var sector = Math.floor(localAng / (Math.PI * 0.5)) % 4;

    // Tangential carry velocity from rotation.y += omega * dt:
    // d(wx)/dt = omega * wz, d(wz)/dt = -omega * wx
    var omega = r < ARENA_METRICS.turntableInnerRadius
      ? ARENA_METRICS.turntableOmega
      : ARENA_METRICS.turntableOmega * 0.75;
    return {
      onTurntable: true,
      sector: sector,
      carryVx: omega * pz,
      carryVz: -omega * px
    };
  }

  var SURNAMES = ['陳', '李', '張', '黃', '林', '吳', '周', '鄭', '何', '劉', '梁', '謝', '蘇', '郭', '馬', '葉', '鄧'];
  var GIVEN_NAMES = ['樂彤', '子軒', '思穎', '浩然', '嘉欣', '柏霖', '芷晴', '宇軒', '詠琳', '俊傑', '心怡', '卓霖', '曉晴', '梓軒', '雅婷', '宥辰', '語嫣'];
  var CLASSES = ['A', 'B', 'C', 'D', 'E'];
  var BOT_SKINS = [0xf472b6, 0x38bdf8, 0xa855f7, 0x10b981, 0xf59e0b, 0x22d3ee, 0xf43f5e, 0x818cf8, 0xfacc15, 0x34d399];
  var BOT_HATS = ['headphones', 'crown', 'conductor', 'star', 'none'];

  function generateBotRoster(count) {
    var n = Math.max(0, Math.min(49, Math.floor(Number(count) || 0)));
    var list = [];
    for (var i = 0; i < n; i++) {
      var sur = SURNAMES[i % SURNAMES.length];
      var giv = GIVEN_NAMES[(i * 3 + Math.floor(i / SURNAMES.length)) % GIVEN_NAMES.length];
      var cls = CLASSES[i % CLASSES.length];
      list.push({
        index: i + 1,
        name: sur + giv + '·' + cls,
        skin: BOT_SKINS[i % BOT_SKINS.length],
        hat: BOT_HATS[i % BOT_HATS.length]
      });
    }
    return list;
  }

  var MODE_CONFIG = {
    mix: {
      id: 'mix',
      name: '🎡 綜藝五關皇冠秀',
      short: '綜藝皇冠秀',
      roundSec: 10.0,
      revealSec: 3.0,
      sub: '五關五種地形輪播：蜂巢地磚 → 巨型琴鍵 → 峽谷音門 → 黑膠轉盤 → 皇冠金字塔！'
    },
    tiles: {
      id: 'tiles',
      name: '🟦 蜂巢地磚生存戰',
      short: '蜂巢地磚',
      roundSec: 8.5,
      revealSec: 2.8,
      sub: '看準高空懸浮答案牌衝上正確地磚（可容納 50 人），錯題地磚將墜入雲海！'
    },
    piano: {
      id: 'piano',
      name: '🎹 巨型琴鍵階梯賽',
      short: '巨型琴鍵',
      roundSec: 9.0,
      revealSec: 2.8,
      sub: '跳上 13 鍵巨型立體鋼琴（白鍵一階／黑鍵高階）踩住正確音鍵，錯鍵下沉！'
    },
    gates: {
      id: 'gates',
      name: '🚪 峽谷音門大衝關',
      short: '峽谷音門',
      roundSec: 10.0,
      revealSec: 2.6,
      sub: '踩加速帶、閃避擺錘與定音鼓，飛撲撞破正確答案的音樂拱門衝上終點台！'
    },
    turntable: {
      id: 'turntable',
      name: '💿 黑膠轉盤離心戰',
      short: '黑膠轉盤',
      roundSec: 9.0,
      revealSec: 2.8,
      sub: '地面會隨黑膠唱片旋轉！逆著離心力與障礙棒，留在正確顏色的音樂扇區！'
    },
    freeze: {
      id: 'freeze',
      name: '🥁 四島浮空搶位戰',
      short: '四島搶位',
      roundSec: 8.5,
      revealSec: 2.8,
      sub: '跨越彩虹連接橋與四支旋轉棒，在倒數歸零前登上正確的浮空音樂鼓島！'
    },
    crown: {
      id: 'crown',
      name: '👑 金字塔皇冠山丘',
      short: '皇冠山丘',
      roundSec: 16.0,
      revealSec: 3.0,
      sub: '拾級跳上三層黃金金字塔頂端每秒高分加冕，或收集雙環漂浮音符球！'
    },
    free: {
      id: 'free',
      name: '🎪 自由派對樂園',
      short: '自由樂園',
      roundSec: 0,
      revealSec: 0,
      sub: '自由探索：十鍵彩虹鋼琴橋、六大彈跳鼓墊、3D 舞步與三大傳送門！'
    }
  };

  var TOPIC_META = {
    mixed: { id: 'mixed', label: '🎵 綜合音樂', badge: '綜合音樂挑戰' },
    notes: { id: 'notes', label: '🎼 視譜認音', badge: '五線譜視譜' },
    rhythm: { id: 'rhythm', label: '🥁 節奏拍號', badge: '節奏與拍號' },
    ear: { id: 'ear', label: '🎹 音程聽力', badge: '聽力辨音挑戰' },
    terms: { id: 'terms', label: '🎭 術語表情', badge: '力度速度術語' }
  };

  var LEVEL_META = {
    basic: { id: 'basic', label: '🌱 初階課堂' },
    advanced: { id: 'advanced', label: '🔥 進階挑戰' }
  };

  var PIANO_QUESTIONS = [
    { level: 'basic', title: '請跳上「中央 C（下加一線 Do）」白鍵！', keyId: 'C4', clef: 'treble', staffStep: -2, acc: '', audio: [261.63] },
    { level: 'basic', title: '請跳上高音譜號「第一線 E4 (Mi)」白鍵！', keyId: 'E4', clef: 'treble', staffStep: 0, acc: '', audio: [329.63] },
    { level: 'basic', title: '請跳上高音譜號「第一間 F4 (Fa)」白鍵！', keyId: 'F4', clef: 'treble', staffStep: 1, acc: '', audio: [349.23] },
    { level: 'basic', title: '請跳上高音譜號「第二線 G4 (Sol)」白鍵！', keyId: 'G4', clef: 'treble', staffStep: 2, acc: '', audio: [392.00] },
    { level: 'basic', title: '請跳上高音譜號「第二間 A4 (La)」白鍵！', keyId: 'A4', clef: 'treble', staffStep: 3, acc: '', audio: [440.00] },
    { level: 'basic', title: '請跳上高音譜號「第三線 B4 (Si)」白鍵！', keyId: 'B4', clef: 'treble', staffStep: 4, acc: '', audio: [493.88] },
    { level: 'basic', title: '請跳上高音譜號「第三間 C5 (高音Do)」白鍵！', keyId: 'C5', clef: 'treble', staffStep: 5, acc: '', audio: [523.25] },
    { level: 'basic', title: '從 C4 往上數「純五度」是哪一個琴鍵？', keyId: 'G4', seq: [261.63, 392.00] },
    { level: 'advanced', title: 'G 大調的調號包含哪一個「高層黑鍵」？', keyId: 'F#4', clef: 'treble', staffStep: 1, acc: '#', audio: [369.99] },
    { level: 'advanced', title: 'F 大調的調號包含哪一個「高層黑鍵」？', keyId: 'Bb4', clef: 'treble', staffStep: 4, acc: 'b', audio: [466.16] },
    { level: 'advanced', title: 'C 小調三和弦的中間音（C 往上小三度）是哪個黑鍵？', keyId: 'Eb4', seq: [261.63, 311.13] },
    { level: 'advanced', title: 'A 大調三和弦的中間音（A 往上大三度）對應哪個黑鍵音名？', keyId: 'C#4', audio: [277.18] },
    { level: 'advanced', title: '低音譜號「上加一線」對應巨型鋼琴最左邊哪個鍵？', keyId: 'C4', clef: 'bass', staffStep: 10, acc: '', audio: [261.63] }
  ];

  var QUESTION_BANK = {
    notes: [
      { level: 'basic', title: '高音譜號「下加一線」是什麼音？', ans: 'C4 (Do)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'D5'], clef: 'treble', staffStep: -2, acc: '', audio: [261.63] },
      { level: 'basic', title: '高音譜號「下加一間」是什麼音？', ans: 'D4 (Re)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'E5'], clef: 'treble', staffStep: -1, acc: '', audio: [293.66] },
      { level: 'basic', title: '高音譜號「第一線」是什麼音？', ans: 'E4 (Mi)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'F5'], clef: 'treble', staffStep: 0, acc: '', audio: [329.63] },
      { level: 'basic', title: '高音譜號「第一間」是什麼音？', ans: 'F4 (Fa)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'D5'], clef: 'treble', staffStep: 1, acc: '', audio: [349.23] },
      { level: 'basic', title: '高音譜號「第二線（G 線）」是什麼音？', ans: 'G4 (Sol)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'E5'], clef: 'treble', staffStep: 2, acc: '', audio: [392.00] },
      { level: 'basic', title: '高音譜號「第二間」是什麼音？', ans: 'A4 (La)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'F5'], clef: 'treble', staffStep: 3, acc: '', audio: [440.00] },
      { level: 'basic', title: '高音譜號「第三線」是什麼音？', ans: 'B4 (Si)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5', 'D5'], clef: 'treble', staffStep: 4, acc: '', audio: [493.88] },
      { level: 'basic', title: '高音譜號「第三間」是什麼音？', ans: 'C5 (Do)', pool: ['C4 (Do)', 'D4 (Re)', 'E4 (Mi)', 'F4 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'C5 (Do)', 'E5'], clef: 'treble', staffStep: 5, acc: '', audio: [523.25] },
      { level: 'basic', title: '高音譜號「第四間」是什麼音？', ans: 'E5 (Mi)', pool: ['E5 (Mi)', 'D5 (Re)', 'C5 (Do)', 'F5 (Fa)', 'G4 (Sol)', 'A4 (La)', 'B4 (Si)', 'F4', 'D4'], clef: 'treble', staffStep: 7, acc: '', audio: [659.25] },
      { level: 'advanced', title: '低音譜號「第二間」是什麼音？', ans: 'C3 (Do)', pool: ['C3 (Do)', 'A2 (La)', 'B2 (Si)', 'D3 (Re)', 'E3 (Mi)', 'F3 (Fa)', 'G3 (Sol)', 'G2', 'A3'], clef: 'bass', staffStep: 3, acc: '', audio: [130.81] },
      { level: 'advanced', title: '低音譜號「第四線（F 線）」是什麼音？', ans: 'F3 (Fa)', pool: ['F3 (Fa)', 'D3 (Re)', 'E3 (Mi)', 'G3 (Sol)', 'A3 (La)', 'C3 (Do)', 'B2 (Si)', 'G2', 'C4'], clef: 'bass', staffStep: 6, acc: '', audio: [174.61] },
      { level: 'advanced', title: '低音譜號「上加一線」是什麼音？', ans: 'C4 (中央C)', pool: ['C4 (中央C)', 'A3 (La)', 'B3 (Si)', 'G3 (Sol)', 'F3 (Fa)', 'D4 (Re)', 'E3 (Mi)', 'D3', 'G2'], clef: 'bass', staffStep: 10, acc: '', audio: [261.63] },
      { level: 'advanced', title: '譜上的升記號音符是什麼音？', ans: 'F♯4', pool: ['F♯4', 'F♭4', 'G♯4', 'E♯4', 'C♯5', 'B♭4', 'D♯4', 'A♯4', 'G4'], clef: 'treble', staffStep: 1, acc: '#', audio: [369.99] },
      { level: 'advanced', title: '譜上的降記號音符是什麼音？', ans: 'B♭4', pool: ['B♭4', 'B♯4', 'E♭4', 'A♭4', 'D♭5', 'F♯4', 'G♭4', 'C5', 'A4'], clef: 'treble', staffStep: 4, acc: 'b', audio: [466.16] },
      { level: 'advanced', title: 'G 大調的調號包含哪一個升降音？', ans: 'F♯', pool: ['F♯', 'B♭', 'C♯', 'E♭', 'G♯', 'A♭', 'D♯', '無升降', 'F♭'] },
      { level: 'advanced', title: 'F 大調的調號包含哪一個升降音？', ans: 'B♭', pool: ['B♭', 'F♯', 'E♭', 'C♯', 'A♭', 'G♯', 'D♭', '無升降', 'B♯'] }
    ],
    rhythm: [
      { level: 'basic', title: '四分音符（♩）在 4/4 拍中佔幾拍？', ans: '1 拍', pool: ['1 拍', '2 拍', '4 拍', '0.5 拍', '3 拍', '1.5 拍', '0.25 拍', '6 拍', '8 拍'] },
      { level: 'basic', title: '二分音符（𝅗𝅥）在 4/4 拍中佔幾拍？', ans: '2 拍', pool: ['2 拍', '1 拍', '4 拍', '0.5 拍', '3 拍', '1.5 拍', '0.25 拍', '6 拍', '8 拍'] },
      { level: 'basic', title: '全音符（𝅝）在 4/4 拍中佔幾拍？', ans: '4 拍', pool: ['4 拍', '2 拍', '1 拍', '0.5 拍', '3 拍', '1.5 拍', '6 拍', '8 拍', '0.25 拍'] },
      { level: 'basic', title: '附點二分音符（𝅗𝅥.）在 4/4 拍中佔幾拍？', ans: '3 拍', pool: ['3 拍', '2 拍', '4 拍', '1.5 拍', '1 拍', '0.5 拍', '2.5 拍', '6 拍', '0.75 拍'] },
      { level: 'basic', title: '八分音符（♪）在 4/4 拍中佔幾拍？', ans: '0.5 拍', pool: ['0.5 拍', '1 拍', '2 拍', '0.25 拍', '1.5 拍', '3 拍', '4 拍', '0.75 拍', '6 拍'] },
      { level: 'basic', title: '圓舞曲（Waltz）最典型的拍號是？', ans: '3/4 拍', pool: ['3/4 拍', '2/4 拍', '4/4 拍', '6/8 拍', '2/2 拍', '5/4 拍', '7/8 拍', '12/8 拍', '9/8 拍'] },
      { level: 'basic', title: '進行曲（March）常見的二拍子拍號是？', ans: '2/4 拍', pool: ['2/4 拍', '3/4 拍', '6/8 拍', '9/8 拍', '5/4 拍', '7/8 拍', '3/8 拍', '12/8 拍', '3/2 拍'] },
      { level: 'advanced', title: '十六分音符（𝅘𝅥𝅯）在 4/4 拍中佔幾拍？', ans: '0.25 拍', pool: ['0.25 拍', '0.5 拍', '1 拍', '0.75 拍', '1.5 拍', '2 拍', '0.125 拍', '3 拍', '4 拍'] },
      { level: 'advanced', title: '附點四分音符（♩.）在 4/4 拍中佔幾拍？', ans: '1.5 拍', pool: ['1.5 拍', '1 拍', '2 拍', '2.5 拍', '3 拍', '0.75 拍', '0.5 拍', '4 拍', '1.25 拍'] },
      { level: 'advanced', title: '6/8 拍屬於哪一類拍子？', ans: '複二拍子', pool: ['複二拍子', '單三拍子', '單二拍子', '複三拍子', '單四拍子', '混合拍子', '自由拍', '複四拍子', '切分拍'] },
      { level: 'advanced', title: '三個八分音符組成的「三連音」總共等於幾拍（4/4）？', ans: '1 拍', pool: ['1 拍', '1.5 拍', '2 拍', '3 拍', '0.5 拍', '0.75 拍', '4 拍', '2.5 拍', '6 拍'] }
    ],
    ear: [
      { level: 'basic', title: '聆聽和弦：這組明亮開朗的和弦是？', ans: '大三和弦 Major', pool: ['大三和弦 Major', '小三和弦 Minor', '減三和弦 Dim', '增三和弦 Aug', '純五度 P5', '純八度 P8', '大二度 M2', '小二度 m2', '純四度 P4'], chord: [261.63, 329.63, 392.00] },
      { level: 'basic', title: '聆聽和弦：這組柔和憂鬱的和弦是？', ans: '小三和弦 Minor', pool: ['小三和弦 Minor', '大三和弦 Major', '減三和弦 Dim', '增三和弦 Aug', '純五度 P5', '純八度 P8', '大二度 M2', '小二度 m2', '純四度 P4'], chord: [261.63, 311.13, 392.00] },
      { level: 'basic', title: '聆聽音程：兩個音相差一個八度是？', ans: '純八度 P8', pool: ['純八度 P8', '純五度 P5', '大三度 M3', '小三度 m3', '純四度 P4', '大二度 M2', '大六度 M6', '大七度 M7', '同度 P1'], seq: [261.63, 523.25] },
      { level: 'basic', title: '聆聽音程：號角般寬廣協和的 C → G 是？', ans: '純五度 P5', pool: ['純五度 P5', '純八度 P8', '大三度 M3', '小三度 m3', '純四度 P4', '大二度 M2', '大六度 M6', '小二度 m2', '大七度 M7'], seq: [261.63, 392.00] },
      { level: 'basic', title: '聆聽音程：明亮溫暖的 Do → Mi 是？', ans: '大三度 M3', pool: ['大三度 M3', '小三度 m3', '純五度 P5', '純四度 P4', '純八度 P8', '大二度 M2', '小二度 m2', '大六度 M6', '小七度 m7'], seq: [261.63, 329.63] },
      { level: 'advanced', title: '聆聽音程：柔和略帶憂傷的 C → E♭ 是？', ans: '小三度 m3', pool: ['小三度 m3', '大三度 M3', '純四度 P4', '純五度 P5', '大二度 M2', '小二度 m2', '純八度 P8', '大六度 M6', '增四度 A4'], seq: [261.63, 311.13] },
      { level: 'advanced', title: '聆聽和弦：緊張收縮的 C - E♭ - G♭ 是？', ans: '減三和弦 Dim', pool: ['減三和弦 Dim', '增三和弦 Aug', '大三和弦 Major', '小三和弦 Minor', '屬七和弦 Dom7', '大七和弦 Maj7', '純五度 P5', '純四度 P4', '掛留和弦'], chord: [261.63, 311.13, 369.99] },
      { level: 'advanced', title: '聆聽和弦：充滿解決傾向的四音和弦是？', ans: '屬七和弦 Dom7', pool: ['屬七和弦 Dom7', '大三和弦 Major', '小三和弦 Minor', '減三和弦 Dim', '增三和弦 Aug', '純八度 P8', '純五度 P5', '小二度 m2', '空五度和弦'], chord: [261.63, 329.63, 392.00, 466.16] },
      { level: 'advanced', title: '聆聽音程：結婚進行曲開頭 C → F 是？', ans: '純四度 P4', pool: ['純四度 P4', '純五度 P5', '大三度 M3', '小三度 m3', '大六度 M6', '純八度 P8', '小二度 m2', '大二度 M2', '大七度 M7'], seq: [261.63, 349.23] }
    ],
    terms: [
      { level: 'basic', title: '哪個力度記號代表「強（Loud）」？', ans: 'f (Forte)', pool: ['f (Forte)', 'p (Piano)', 'pp', 'mp', 'mf', 'ff', 'cresc.', 'dim.', 'rit.'] },
      { level: 'basic', title: '哪個力度記號代表「弱（Soft）」？', ans: 'p (Piano)', pool: ['p (Piano)', 'f (Forte)', 'ff', 'mf', 'mp', 'pp', 'cresc.', 'accel.', 'sfz'] },
      { level: 'basic', title: '哪個力度記號代表「極弱（Very Soft）」？', ans: 'pp', pool: ['pp', 'p', 'mp', 'mf', 'f', 'ff', 'sfz', 'cresc.', 'fp'] },
      { level: 'basic', title: '哪個速度術語代表「快板（Fast & Bright）」？', ans: 'Allegro', pool: ['Allegro', 'Adagio', 'Andante', 'Moderato', 'Largo', 'Ritardando', 'Legato', 'Staccato', 'Fermata'] },
      { level: 'basic', title: '哪個速度術語代表「行板（Walking Pace）」？', ans: 'Andante', pool: ['Andante', 'Allegro', 'Presto', 'Largo', 'Vivace', 'Ritardando', 'Accelerando', 'Forte', 'Piano'] },
      { level: 'basic', title: '代表「漸強（Gradually Louder）」的縮寫是？', ans: 'cresc.', pool: ['cresc.', 'dim.', 'rit.', 'accel.', 'stacc.', 'legato', 'pp', 'ff', 'D.C.'] },
      { level: 'basic', title: '將音高升高半音的「升記號」是？', ans: '♯', pool: ['♯', '♭', '♮', '𝄐', '𝄋', '𝄞', '𝄢', '𝄀', '𝄂'] },
      { level: 'advanced', title: '代表「漸慢（Gradually Slower）」的縮寫是？', ans: 'rit.', pool: ['rit.', 'accel.', 'cresc.', 'dim.', 'a tempo', 'vivace', 'presto', 'sfz', 'legato'] },
      { level: 'advanced', title: '代表「極快板（Very Fast）」的速度術語是？', ans: 'Presto', pool: ['Presto', 'Andante', 'Adagio', 'Moderato', 'Largo', 'Grave', 'Lento', 'Sostenuto', 'Cantabile'] },
      { level: 'advanced', title: '音符上方加小圓點代表什麼奏法？', ans: 'Staccato 斷奏', pool: ['Staccato 斷奏', 'Legato 連奏', 'Tenuto 保持音', 'Accent 重音', 'Fermata 延長', 'Tremolo 震音', 'Glissando 滑音', 'Pizzicato 撥奏', 'Arco 拉奏'] },
      { level: 'advanced', title: '取消先前升降記號的「還原記號」是？', ans: '♮', pool: ['♮', '♯', '♭', '𝄐', '𝄪', '𝄫', '𝄞', '𝄢', '𝄋'] }
    ]
  };

  var CROWN_CHALLENGES = [
    { level: 'basic', title: '收集「C 大調三和弦」組成音（C、E、G）！', targets: ['C4 (Do)', 'E4 (Mi)', 'G4 (Sol)', 'C5', 'E5', 'G5', 'Do'], decoys: ['F♯4', 'B♭4', 'D♭', 'A♭', 'C♯', 'G♯', 'F4'] },
    { level: 'basic', title: '收集「強音力度家族」（mf、f、ff、sfz）！', targets: ['mf', 'f', 'ff', 'sfz', 'f (強)', 'ff (極強)', 'cresc.'], decoys: ['pp', 'p', 'mp', 'dim.', 'rit.', 'p (弱)', 'pp (極弱)'] },
    { level: 'basic', title: '收集「1 拍以上音符」（♩、𝅗𝅥、𝅝、𝅗𝅥.）！', targets: ['♩ (1拍)', '𝅗𝅥 (2拍)', '𝅝 (4拍)', '𝅗𝅥. (3拍)', '♩', '𝅗𝅥', '𝅝'], decoys: ['♪ (0.5拍)', '𝅘𝅥𝅯 (0.25拍)', '𝄾 (休止)', '♭', '♯', '♪', '𝅘𝅥𝅯'] },
    { level: 'basic', title: '收集「G 大調三和弦」組成音（G、B、D）！', targets: ['G4 (Sol)', 'B4 (Si)', 'D4 (Re)', 'G5', 'B3', 'D5', 'Sol'], decoys: ['F♮', 'C♯', 'E♭', 'A♭', 'C4', 'F4', 'B♭4'] },
    { level: 'advanced', title: '收集「A 小調三和弦」組成音（A、C、E）！', targets: ['A4 (La)', 'C4 (Do)', 'E4 (Mi)', 'A3', 'C5', 'E5', 'La'], decoys: ['C♯', 'G♯', 'F♯4', 'B♭4', 'D♯', 'F4', 'B4'] },
    { level: 'advanced', title: '收集「G7 屬七和弦」組成音（G、B、D、F）！', targets: ['G4', 'B4', 'D5', 'F5', 'G3', 'B3', 'F4'], decoys: ['F♯4', 'C♯', 'E♭', 'A♭', 'C5', 'E4', 'B♭4'] },
    { level: 'advanced', title: '收集「快速速度術語」（Allegro、Vivace、Presto）！', targets: ['Allegro', 'Vivace', 'Presto', 'Allegretto', '快板', '急板', '活潑地'], decoys: ['Largo', 'Adagio', 'Grave', 'Lento', '廣板', '慢板', '行板'] },
    { level: 'advanced', title: '收集「中國五聲音階」（宮商角徵羽 Do Re Mi Sol La）！', targets: ['Do (宮)', 'Re (商)', 'Mi (角)', 'Sol (徵)', 'La (羽)', '宮', '徵'], decoys: ['Fa (清角)', 'Si (變宮)', 'F♯4', 'B♭4', 'E♭', 'A♭', 'C♯'] }
  ];

  var ESCALATION_TIERS = [
    { tier: 1, label: 'Lv.1 熱身',   speedMult: 1.00, timerFactor: 1.00, bpm: 120, poolMode: 'basic' },
    { tier: 2, label: 'Lv.2 加速',   speedMult: 1.20, timerFactor: 0.90, bpm: 128, poolMode: 'mixed' },
    { tier: 3, label: 'Lv.3 進階',   speedMult: 1.40, timerFactor: 0.80, bpm: 136, poolMode: 'mixed' },
    { tier: 4, label: 'Lv.4 極速',   speedMult: 1.62, timerFactor: 0.72, bpm: 146, poolMode: 'advanced' },
    { tier: 5, label: 'Lv.5 巔峰🔥', speedMult: 1.85, timerFactor: 0.65, bpm: 156, poolMode: 'advanced' }
  ];

  function computeEscalation(roundNum) {
    var r = Math.max(0, Math.floor(Number(roundNum) || 0));
    var idx = Math.min(ESCALATION_TIERS.length - 1, r);
    return ESCALATION_TIERS[idx];
  }

  function computeSyncedRound(modeState, syncedNowMs) {
    var mode = (modeState && MODE_CONFIG[modeState.mode]) ? modeState.mode : 'free';
    var cfg = MODE_CONFIG[mode];
    if (mode === 'free') {
      return {
        mode: 'free',
        effectiveMode: 'free',
        phase: 'idle',
        roundNum: 0,
        showRound: 0,
        showNumber: 1,
        isFinale: false,
        escalation: ESCALATION_TIERS[0],
        timeLeft: 0,
        progress: 0,
        turntableAngle: 0,
        roundSeed: 0
      };
    }
    var epochMs = Number(modeState && modeState.epochMs) || 0;
    var baseSeed = (Number(modeState && modeState.seed) >>> 0) || 12345;
    var elapsed = Math.max(0, (syncedNowMs - epochMs) / 1000);

    // Deterministic escalating timeline: rounds 0..3 ramp up faster each round, round 4+ runs at max tier speed
    var roundNum = 0;
    var tCursor = 0;
    var maxRamp = ESCALATION_TIERS.length - 1;
    while (roundNum < maxRamp) {
      var escLoop = ESCALATION_TIERS[roundNum];
      var rDur = Math.max(4.5, Number((cfg.roundSec * escLoop.timerFactor).toFixed(2)));
      var cDur = rDur + cfg.revealSec;
      if (elapsed < tCursor + cDur) break;
      tCursor += cDur;
      roundNum++;
    }
    if (roundNum >= maxRamp) {
      var maxEsc = ESCALATION_TIERS[maxRamp];
      var maxRDur = Math.max(4.5, Number((cfg.roundSec * maxEsc.timerFactor).toFixed(2)));
      var maxCDur = maxRDur + cfg.revealSec;
      var extraRounds = Math.floor((elapsed - tCursor) / maxCDur);
      roundNum += extraRounds;
      tCursor += extraRounds * maxCDur;
    }

    var esc = computeEscalation(roundNum);
    var activeRoundSec = Math.max(4.5, Number((cfg.roundSec * esc.timerFactor).toFixed(2)));
    var cycleSec = activeRoundSec + cfg.revealSec;
    var inCycle = Math.max(0, elapsed - tCursor);
    var phase = inCycle < activeRoundSec ? 'countdown' : 'reveal';
    var timeLeft = phase === 'countdown' ? (activeRoundSec - inCycle) : (cycleSec - inCycle);
    var progress = phase === 'countdown' ? Math.max(0, Math.min(1, 1 - inCycle / activeRoundSec)) : 0;
    var roundSeed = (baseSeed + Math.imul(roundNum + 1, 2654435761)) >>> 0;
    var showRound = (roundNum % 5) + 1;
    var showNumber = Math.floor(roundNum / 5) + 1;
    var isFinale = showRound === 5;
    var effectiveMode = mode === 'mix' ? MIX_ROTATION[roundNum % MIX_ROTATION.length] : mode;
    var turntableAngle = (elapsed * ARENA_METRICS.turntableOmega * esc.speedMult) % (Math.PI * 2);

    return {
      mode: mode,
      effectiveMode: effectiveMode,
      phase: phase,
      roundNum: roundNum,
      showRound: showRound,
      showNumber: showNumber,
      isFinale: isFinale,
      escalation: esc,
      timeLeft: timeLeft,
      progress: progress,
      turntableAngle: turntableAngle,
      roundSeed: roundSeed
    };
  }

  function filterByDifficulty(items, levelOrTier) {
    if (typeof levelOrTier === 'number') {
      if (levelOrTier <= 1) {
        var bOnly = items.filter(function (it) { return it.level === 'basic'; });
        return bOnly.length ? bOnly : items;
      }
      if (levelOrTier >= 4) {
        var aOnly = items.filter(function (it) { return it.level === 'advanced'; });
        return aOnly.length ? aOnly : items;
      }
      return items; // Tiers 2 & 3 blend basic + advanced progressively
    }
    if (levelOrTier === 'advanced') return items;
    var basicOnly = items.filter(function (it) { return it.level === 'basic'; });
    return basicOnly.length ? basicOnly : items;
  }

  function generateRoundChallenge(effectiveMode, topic, levelOrTier, roundSeed) {
    var rng = createSeededRng(roundSeed || 1);
    var normTopic = TOPIC_META[topic] ? topic : 'mixed';
    var diffArg = (typeof levelOrTier === 'number') ? levelOrTier : (LEVEL_META[levelOrTier] ? levelOrTier : 1);

    if (effectiveMode === 'piano') {
      var pPool = filterByDifficulty(PIANO_QUESTIONS, diffArg);
      var pq = pPool[Math.floor(rng() * pPool.length)];
      var keyDef = PIANO_STAGE_KEYS.find(function (k) { return k.id === pq.keyId; }) || PIANO_STAGE_KEYS[0];
      return {
        mode: 'piano',
        badge: '🎹 巨型琴鍵階梯賽',
        title: pq.title,
        sub: MODE_CONFIG.piano.sub,
        ans: keyDef.label,
        targetKeyId: keyDef.id,
        options: PIANO_STAGE_KEYS.map(function (k) { return k.label; }),
        clef: pq.clef || null,
        staffStep: typeof pq.staffStep === 'number' ? pq.staffStep : null,
        acc: pq.acc || '',
        chord: pq.chord || null,
        seq: pq.seq || null,
        audio: pq.audio || null
      };
    }

    if (effectiveMode === 'crown') {
      var crownPool = filterByDifficulty(CROWN_CHALLENGES, diffArg);
      var ch = crownPool[Math.floor(rng() * crownPool.length)];
      var rawOrbs = [];
      ch.targets.slice(0, 7).forEach(function (t) { rawOrbs.push({ label: t, good: true }); });
      ch.decoys.slice(0, 7).forEach(function (d) { rawOrbs.push({ label: d, good: false }); });
      var shuffledOrbs = shuffleWithRng(rawOrbs, rng).map(function (item, idx) {
        var ring = idx < 7 ? 0 : 1;
        var posInRing = idx < 7 ? idx : (idx - 7);
        var ang = (posInRing / 7) * Math.PI * 2 + ring * 0.45 + (rng() - 0.5) * 0.18;
        var rad = ring === 0 ? 11.4 : 17.6;
        return {
          label: item.label,
          good: item.good,
          freq: labelToFreq(item.label, idx),
          x: Number((Math.cos(ang) * rad).toFixed(2)),
          z: Number((Math.sin(ang) * rad).toFixed(2))
        };
      });
      return {
        mode: 'crown',
        badge: '👑 金字塔皇冠山丘',
        title: ch.title,
        sub: MODE_CONFIG.crown.sub,
        orbs: shuffledOrbs
      };
    }

    var bank = [];
    if (normTopic === 'mixed') {
      bank = bank.concat(
        filterByDifficulty(QUESTION_BANK.notes, diffArg),
        filterByDifficulty(QUESTION_BANK.rhythm, diffArg),
        filterByDifficulty(QUESTION_BANK.ear, diffArg),
        filterByDifficulty(QUESTION_BANK.terms, diffArg)
      );
    } else {
      bank = filterByDifficulty(QUESTION_BANK[normTopic] || QUESTION_BANK.notes, diffArg);
    }

    var q = bank[Math.floor(rng() * bank.length)];
    var distractors = shuffleWithRng(
      q.pool.filter(function (opt) { return opt !== q.ans; }),
      rng
    );

    var optionCount = (effectiveMode === 'gates' || effectiveMode === 'freeze' || effectiveMode === 'turntable')
      ? 4
      : 9;
    var chosen = [q.ans].concat(distractors.slice(0, optionCount - 1));
    while (chosen.length < optionCount) chosen.push('♪');
    var options = shuffleWithRng(chosen, rng);

    return {
      mode: effectiveMode,
      badge: MODE_CONFIG[effectiveMode] ? (MODE_CONFIG[effectiveMode].short + ' · ' + TOPIC_META[normTopic].badge) : TOPIC_META[normTopic].badge,
      title: q.title,
      sub: MODE_CONFIG[effectiveMode] ? MODE_CONFIG[effectiveMode].sub : '',
      ans: q.ans,
      options: options,
      clef: q.clef || null,
      staffStep: typeof q.staffStep === 'number' ? q.staffStep : null,
      acc: q.acc || '',
      chord: q.chord || null,
      seq: q.seq || null,
      audio: q.audio || null
    };
  }

  function checkSweeperCollision(px, pz, py, sw, playerRadius, barRadius) {
    if (py > 1.25 || py < -1.0) return { hit: false, pushX: 0, pushZ: 0 };
    var pRad = playerRadius || 0.52;
    var bRad = barRadius || 0.30;
    var dx = px - sw.x;
    var dz = pz - sw.z;
    var dirX = Math.cos(sw.angle);
    var dirZ = -Math.sin(sw.angle);
    var proj = Math.max(-sw.len, Math.min(sw.len, dx * dirX + dz * dirZ));
    var closestX = proj * dirX;
    var closestZ = proj * dirZ;
    var distSq = (dx - closestX) * (dx - closestX) + (dz - closestZ) * (dz - closestZ);
    var minDist = pRad + bRad;
    if (distSq > minDist * minDist) return { hit: false, pushX: 0, pushZ: 0 };

    var sign = (sw.speed >= 0 ? 1 : -1) * (proj >= 0 ? 1 : -1);
    var tanX = -dirZ * sign;
    var tanZ = dirX * sign;
    var outLen = Math.hypot(dx, dz) || 1;
    var pushX = tanX * 13.5 + (dx / outLen) * 4.5;
    var pushZ = tanZ * 13.5 + (dz / outLen) * 4.5;
    return { hit: true, pushX: pushX, pushZ: pushZ };
  }

  return {
    ARENA_METRICS: ARENA_METRICS,
    ESCALATION_TIERS: ESCALATION_TIERS,
    PIANO_STAGE_KEYS: PIANO_STAGE_KEYS,
    MIX_ROTATION: MIX_ROTATION,
    MODE_CONFIG: MODE_CONFIG,
    TOPIC_META: TOPIC_META,
    LEVEL_META: LEVEL_META,
    PIANO_QUESTIONS: PIANO_QUESTIONS,
    QUESTION_BANK: QUESTION_BANK,
    CROWN_CHALLENGES: CROWN_CHALLENGES,
    hashSeed: hashSeed,
    createSeededRng: createSeededRng,
    shuffleWithRng: shuffleWithRng,
    shortestAngleDiff: shortestAngleDiff,
    labelToFreq: labelToFreq,
    computeSpawnSlot: computeSpawnSlot,
    computeTurntableState: computeTurntableState,
    computeEscalation: computeEscalation,
    generateBotRoster: generateBotRoster,
    computeSyncedRound: computeSyncedRound,
    generateRoundChallenge: generateRoundChallenge,
    checkSweeperCollision: checkSweeperCollision
  };
});
