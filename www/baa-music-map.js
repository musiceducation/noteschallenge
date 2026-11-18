/**
 * Curriculum tags for the profile radar.
 * Maps the existing seven axes onto Macao junior-secondary music
 * 《初中音樂科課程指引》domains. Does not score, and is not a 基本學力達標 rating.
 * Guide: https://www.dsedj.gov.mo/crdc/guide/data/junior/Music_guide_c.pdf (pp. 16–18)
 * Dispatch: 第56/2017號社會文化司司長批示.
 */
(function (root) {
  'use strict';

  var UNAUDITED = '未由本平台評核';
  var STUDIO_STATUS = '已提供創作入口，未由本平台自動評核';
  var B_STATUS = '鑑賞練習只部分涵蓋 B-1、B-2、B-3、B-4，仍未涵蓋 B-5 同儕互評，亦不是基本學力達標。成績不計入七軸。';

  /** Studio entry is shown. Work there is not written onto the seven axes. */
  var STUDIO_ENTRY = true;

  var AXES = [
    { id: 'reading', label: '讀譜', tags: ['C-1'], note: '記譜、五線譜與調號。' },
    { id: 'solfege', label: '唱名', tags: ['C-1', 'C-4'], note: '唱名記譜與視唱辨認。不是現場演唱，不標 A。' },
    { id: 'harmony', label: '和聲', tags: ['C'], note: '和聲知識與聽辨。不是合唱或演奏，不標 A-2、A-4。' },
    { id: 'rhythm', label: '節奏', tags: ['C-1'], note: '音符時值、節奏與拍號。現有節奏挑戰不是現場演奏，不標 A。' },
    { id: 'theory', label: '樂理知識', tags: ['C-2'], note: '音樂術語與基本技術概念。' },
    { id: 'instruments', label: '樂器認識', tags: ['C-3'], note: '音色、特徵與分類。不是 A-3 樂器演奏。' },
    { id: 'listening', label: '聽力', tags: ['C-4'], note: '聽音與聽寫。只涉及鑑賞裡的聽辨，不涵蓋 B-1 至 B-5 的風格、文化、曲式或同儕互評。' }
  ];

  function item(id, label, status) {
    return { id: id, label: label, status: status };
  }

  var DOMAINS = [
    {
      id: 'A',
      title: 'A 演唱與演奏',
      status: UNAUDITED,
      note: 'A-1 至 A-4 沒有自動評分的演唱或演奏。',
      items: [
        item('A-1', '演唱', 'none'),
        item('A-2', '合唱', 'none'),
        item('A-3', '樂器演奏', 'none'),
        item('A-4', '合奏', 'none')
      ]
    },
    {
      id: 'B',
      title: 'B 鑑賞及感受',
      status: B_STATUS,
      note: '聽力軸只標 C-4。曲式、體裁與音樂特點在鑑賞練習，不改變七軸分數。',
      items: [
        item('B-1', '以術語描述音樂特點', 'partial'),
        item('B-2', '歌曲體裁與基本功能', 'partial'),
        item('B-3', '簡單曲式（二段體、三段體、回旋曲式）', 'partial'),
        item('B-4', '不同文化的音樂特點（僅原創短句，未收錄需版權的錄音）', 'partial'),
        item('B-5', '同儕互評', 'none')
      ]
    },
    {
      id: 'C',
      title: 'C 基本概念與常用知識',
      status: '有挑戰分數可對應，但不是基本學力達標評級。',
      note: '唱名與節奏不標 A。和聲只標 C，不標 A-2、A-4。樂器認識是 C-3，不是 A-3 演奏。',
      items: [
        item('C-1', '記譜、時值、拍號、調號', 'tagged'),
        item('C-2', '術語與基本概念', 'tagged'),
        item('C-3', '樂器音色、特徵、分類', 'tagged'),
        item('C-4', '聽音與視唱辨認', 'tagged')
      ]
    },
    {
      id: 'D',
      title: 'D 創意表現與舞台體驗',
      status: STUDIO_ENTRY ? STUDIO_STATUS : UNAUDITED,
      note: STUDIO_ENTRY
        ? '創作工作室可作節奏與旋律創作。D-1 至 D-6 不逐條評分，作品不計入七軸。'
        : 'D-1 至 D-6 未由本平台評核。',
      items: [
        item('D-1–D-6', '創意、編配與舞台經驗', STUDIO_ENTRY ? 'entry' : 'none')
      ]
    }
  ];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function axisById(id) {
    for (var i = 0; i < AXES.length; i++) {
      if (AXES[i].id === id) return AXES[i];
    }
    return null;
  }

  function tagLine(id) {
    var axis = axisById(id);
    if (!axis || !axis.tags.length) return '';
    return axis.tags.join(' · ');
  }

  /** Hub cards reuse axis tags, or a domain item id already listed above. */
  var HUB = [
    { id: 'enterGame1', axis: 'reading' },
    { id: 'enterKeysig', axis: 'reading' },
    { id: 'enterSolfege', axis: 'solfege' },
    { id: 'enterChord', axis: 'harmony' },
    { id: 'enterGame2', axis: 'rhythm' },
    { id: 'enterGame3', axis: 'theory' },
    { id: 'enterGame4', axis: 'instruments' },
    { id: 'enterAural', axis: 'listening' },
    { id: 'enterAppreciate', tags: ['B-1', 'B-2', 'B-3', 'B-4'] },
    { id: 'enterCompositionStudio', tags: ['D-1–D-6'] }
  ];

  function hubTags(id) {
    var row = null;
    for (var i = 0; i < HUB.length; i++) {
      if (HUB[i].id === id) row = HUB[i];
    }
    if (!row) return [];
    if (row.axis) {
      var axis = axisById(row.axis);
      return axis ? axis.tags.slice() : [];
    }
    return row.tags.slice();
  }

  function statusLabel(code) {
    if (code === 'none') return UNAUDITED;
    if (code === 'partial') return '部分練習，未判定達標';
    if (code === 'entry') return STUDIO_STATUS;
    if (code === 'tagged') return '挑戰標籤，未判定達標';
    return '';
  }

  function legendHtml() {
    var chips = AXES.map(function (axis) {
      return '<li><span>' + esc(axis.label) + '</span> <b>' + esc(tagLine(axis.id)) + '</b></li>';
    }).join('');
    var domains = DOMAINS.map(function (domain) {
      var rows = domain.items.map(function (row) {
        return '<li><b>' + esc(row.id) + '</b> ' + esc(row.label) + '　' + esc(statusLabel(row.status)) + '</li>';
      }).join('');
      return '<section class="ability-domain">' +
        '<div class="ability-domain-head"><span>' + esc(domain.title) + '</span></div>' +
        '<p class="ability-domain-status">' + esc(domain.status) + '</p>' +
        '<ul class="ability-domain-list">' + rows + '</ul>' +
        '<p class="ability-domain-note">' + esc(domain.note) + '</p>' +
        '</section>';
    }).join('');
    return '<div class="ability-baa">' +
      '<ul class="ability-axis-tags">' + chips + '</ul>' +
      '<p class="ability-baa-disclaimer">這張圖是挑戰分數的課程對應標籤，不是澳門教育及青年發展局的基本學力達標評級，亦不是官方評核證書。</p>' +
      domains +
      '<div class="ability-teacher-note">' +
      '<div class="ability-teacher-note-title">教師補錄</div>' +
      '<textarea rows="2" readonly placeholder="這一版只留位置，不會寫入本機或雲端。" aria-label="教師補錄，不會儲存"></textarea>' +
      '<p class="ability-teacher-note-hint">演唱、演奏、同儕互評請記入「教師紀錄」。這個欄位仍然不會儲存。</p>' +
      '</div></div>';
  }

  root.BaaMusicMap = {
    UNAUDITED: UNAUDITED,
    STUDIO_STATUS: STUDIO_STATUS,
    B_STATUS: B_STATUS,
    STUDIO_ENTRY: STUDIO_ENTRY,
    axes: AXES,
    domains: DOMAINS,
    tagLine: tagLine,
    hub: HUB,
    hubTags: hubTags,
    legendHtml: legendHtml,
    statusLabel: statusLabel
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
