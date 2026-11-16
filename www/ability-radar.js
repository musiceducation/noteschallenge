/**
 * Music-ability radar from saved challenge results. Practice rows are ignored.
 * Listening games are optional: until those keys exist, 聽力 is 未有紀錄.
 */
(function (root) {
  'use strict';

  var AXES = [
    { id: 'reading', label: '讀譜', games: ['game1', 'keysig'], scale: 200 },
    { id: 'solfege', label: '唱名', games: ['solfege'], scale: 200 },
    { id: 'harmony', label: '和聲', games: ['chord'], scale: 200 },
    { id: 'rhythm', label: '節奏', games: ['game2'], scale: 2000 },
    { id: 'theory', label: '樂理知識', games: ['game3'], scale: 200 },
    { id: 'instruments', label: '樂器認識', games: ['game4'], scale: 200 },
    { id: 'listening', label: '聽力', games: ['listenInterval', 'listenRhythm', 'listenColor'], scale: 100 }
  ];

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function isChallenge(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.practice === true || entry.challenge === false) return false;
    if (entry.challenge === true || entry.practice === false) return true;
    return false;
  }

  function rowsFor(profile, game) {
    var hist = profile && Array.isArray(profile.history) ? profile.history : [];
    var played = hist.filter(function (row) {
      return isChallenge(row) && row.game === game;
    });
    if (played.length) {
      return played.map(function (row) {
        return {
          score: num(row.score),
          accuracy: row.accuracy == null || row.accuracy === '' ? null : num(row.accuracy)
        };
      });
    }
    var best = profile && profile.gameBests ? num(profile.gameBests[game]) : 0;
    return best > 0 ? [{ score: best, accuracy: null }] : [];
  }

  function unitScore(best, accuracy, scale) {
    var scorePart = Math.max(0, Math.min(100, (best / scale) * 100));
    if (accuracy == null) return scorePart;
    var acc = Math.max(0, Math.min(100, accuracy));
    return scorePart * 0.6 + acc * 0.4;
  }

  function scoreAxis(profile, axis) {
    var parts = [];
    axis.games.forEach(function (game) {
      var rows = rowsFor(profile, game);
      if (!rows.length) return;
      var best = 0;
      var accSum = 0;
      var accN = 0;
      rows.forEach(function (row) {
        if (row.score > best) best = row.score;
        if (row.accuracy != null) {
          accSum += row.accuracy;
          accN += 1;
        }
      });
      parts.push(unitScore(best, accN ? accSum / accN : null, axis.scale));
    });
    if (!parts.length) return null;
    return Math.round(parts.reduce(function (sum, n) { return sum + n; }, 0) / parts.length);
  }

  function evaluate(profile) {
    return AXES.map(function (axis) {
      return { id: axis.id, label: axis.label, score: scoreAxis(profile, axis) };
    });
  }

  function summarise(axes) {
    var known = (axes || []).filter(function (axis) { return axis.score != null; });
    if (known.length < 2) return '未有足夠挑戰紀錄，暫時未能比較強項同弱項。';
    var strong = known[0];
    var weak = known[0];
    known.forEach(function (axis) {
      if (axis.score > strong.score) strong = axis;
      if (axis.score < weak.score) weak = axis;
    });
    if (strong.id === weak.id || strong.score === weak.score) return '各有紀錄的能力目前差不多。';
    return '較強係' + strong.label + '（' + strong.score + '），可以再練' + weak.label + '（' + weak.score + '）。';
  }

  function point(cx, cy, radius, index, total) {
    var angle = (-Math.PI / 2) + (index * 2 * Math.PI / total);
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  }

  function svgFor(axes) {
    var cx = 180;
    var cy = 168;
    var maxR = 108;
    var total = axes.length;
    var rings = [0.25, 0.5, 0.75, 1];
    var parts = ['<svg class="ability-radar-svg" viewBox="0 0 360 340" role="img" aria-label="音樂能力雷達圖">'];
    rings.forEach(function (ring) {
      var pts = [];
      for (var i = 0; i < total; i++) pts.push(point(cx, cy, maxR * ring, i, total));
      parts.push('<polygon class="ability-radar-ring" points="' + pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ') + '"></polygon>');
    });
    for (var s = 0; s < total; s++) {
      var tip = point(cx, cy, maxR, s, total);
      parts.push('<line class="ability-radar-spoke" x1="' + cx + '" y1="' + cy + '" x2="' + tip.x.toFixed(1) + '" y2="' + tip.y.toFixed(1) + '"></line>');
    }
    var scored = [];
    axes.forEach(function (axis, index) {
      if (axis.score == null) return;
      scored.push(point(cx, cy, maxR * (axis.score / 100), index, total));
    });
    if (scored.length >= 3) {
      parts.push('<polygon class="ability-radar-shape" points="' + scored.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ') + '"></polygon>');
    }
    scored.forEach(function (p) {
      parts.push('<circle class="ability-radar-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.5"></circle>');
    });
    axes.forEach(function (axis, index) {
      var label = point(cx, cy, maxR + 28, index, total);
      var text = axis.score == null ? '未有紀錄' : String(axis.score);
      parts.push('<text class="ability-radar-label" x="' + label.x.toFixed(1) + '" y="' + (label.y - 6).toFixed(1) + '" text-anchor="middle">' + axis.label + '</text>');
      parts.push('<text class="ability-radar-value' + (axis.score == null ? ' is-empty' : '') + '" x="' + label.x.toFixed(1) + '" y="' + (label.y + 10).toFixed(1) + '" text-anchor="middle">' + text + '</text>');
    });
    parts.push('</svg>');
    return parts.join('');
  }

  function render(container, profile) {
    if (!container) return null;
    var axes = evaluate(profile);
    container.innerHTML = svgFor(axes) + '<p class="ability-radar-summary">' + summarise(axes) + '</p>';
    return axes;
  }

  root.AbilityRadar = {
    axes: AXES,
    evaluate: evaluate,
    summarise: summarise,
    render: render
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
