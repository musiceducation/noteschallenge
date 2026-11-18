/**
 * Musician cards: explorable fact cards and a local practice quiz.
 * Scores stay on this device. Nothing here calls rank upload, radar, or Apps Script.
 * Visual design: Claude layout pass was unavailable (monthly usage limit on the
 * Claude design route). Layout follows the existing paper, glass, and hub radii.
 */
(function (root, factory) {
  var api = factory();
  if (root) root.MusicianMode = api;
  if (root && root.document) {
    var boot = function () { api.mount(root.document); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var DATA_URL = 'data/musicians.json?v=1';
  var STORE_KEY = 'musicianPracticeLocalV1';
  var ROUND_SIZE_NOTE = 8;

  function shuffle(list, rng) {
    var arr = list.slice();
    var i;
    for (i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function musicianById(bank, id) {
    var found = null;
    (bank.musicians || []).forEach(function (musician) {
      if (musician.id === id) found = musician;
    });
    return found;
  }

  function factById(musician, id) {
    var found = null;
    (musician.facts || []).forEach(function (fact) {
      if (fact.id === id) found = fact;
    });
    return found;
  }

  function supportText(bank, question) {
    var musician = musicianById(bank, question.musicianId);
    if (!musician) return '';
    return (question.support || []).map(function (id) {
      var fact = factById(musician, id);
      return fact ? fact.text : '';
    }).join('\n');
  }

  function selectRound(bank, rng, used) {
    var random = typeof rng === 'function' ? rng : Math.random;
    var seen = {};
    (used || []).forEach(function (id) { seen[id] = true; });
    var musicians = shuffle(bank.musicians || [], random);
    var round = [];
    var newly = [];
    musicians.forEach(function (musician) {
      var pool = (bank.questions || []).filter(function (question) {
        return question.musicianId === musician.id && !seen[question.id];
      });
      var exhausted = false;
      if (!pool.length) {
        exhausted = true;
        pool = (bank.questions || []).filter(function (question) {
          return question.musicianId === musician.id;
        });
      }
      if (!pool.length) return;
      var pick = pool[Math.floor(random() * pool.length)];
      round.push(pick);
      if (!exhausted) newly.push(pick.id);
    });
    return { round: round, used: (used || []).concat(newly) };
  }

  function gradeChoice(question, index) {
    return {
      correct: index === question.answer,
      explanation: question.explanation || ''
    };
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var data = raw ? JSON.parse(raw) : {};
      if (!data || typeof data !== 'object') data = {};
      if (!data.seen || typeof data.seen !== 'object') data.seen = {};
      return data;
    } catch (err) {
      return { seen: {} };
    }
  }

  function writeStore(data) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (err) {}
  }

  function mount(doc) {
    if (!doc || !doc.getElementById) return;
    var host = doc.getElementById('musicianRoot');
    if (!host || host.getAttribute('data-musician-ready') === '1') return;
    host.setAttribute('data-musician-ready', '1');
    var back = doc.getElementById('musicianBackBtn');
    var bank = null;
    var view = { name: 'gallery' };
    var sessionUsed = [];
    var round = [];
    var cursor = 0;
    var correctCount = 0;
    var answered = false;
    var misses = [];

    function goHub() {
      root.dispatchEvent(new CustomEvent('musician-navigate', { detail: { screen: 'screen-hub' } }));
    }

    function setBack(label) {
      if (!back) return;
      back.textContent = label;
    }

    function render(html) {
      host.innerHTML = html;
    }

    function factBlock(musician) {
      return (musician.facts || []).map(function (fact) {
        return '<section class="musician-fact"><h3>' + esc(fact.label) + '</h3><p>' + esc(fact.text) + '</p></section>';
      }).join('');
    }

    function sourceList(items) {
      if (!items.length) return '<p>這張卡還沒有來源。</p>';
      return '<ul class="musician-sources">' + items.map(function (item) {
        return '<li><a href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.title) + '</a></li>';
      }).join('') + '</ul>';
    }

    function sourcesFor(musician) {
      var items = [];
      (musician.facts || []).forEach(function (fact) {
        (fact.sources || []).forEach(function (source) {
          items.push(source);
        });
      });
      if (musician.portrait && musician.portrait.reference) {
        items.push({
          title: '圖片參考：' + musician.portrait.reference.title + '（' + musician.portrait.reference.license + '）',
          url: musician.portrait.reference.url
        });
      }
      return items;
    }

    function showGallery() {
      view = { name: 'gallery' };
      setBack('← 返回主頁');
      if (!bank) {
        render('<p class="musician-status">正在讀取卡片…</p>');
        return;
      }
      var store = readStore();
      var cards = bank.musicians.map(function (musician) {
        var seen = store.seen[musician.id] ? '<span class="musician-seen">已看過</span>' : '<span class="musician-seen musician-seen--new">未看</span>';
        return '<button type="button" class="musician-card" data-open="' + esc(musician.id) + '">' +
          '<img src="' + esc(musician.portrait.src) + '" alt="' + esc(musician.portrait.alt) + '" width="280" height="340">' +
          '<span class="musician-card-body">' +
          '<span class="musician-era">' + esc(musician.era) + '</span>' +
          '<span class="musician-name">' + esc(musician.nameZh) + '</span>' +
          '<span class="musician-en">' + esc(musician.nameEn) + '</span>' +
          '<span class="musician-meta">' + esc(musician.years) + '</span>' +
          '<span class="musician-meta">' + esc(musician.regionShort) + '</span>' +
          seen +
          '</span></button>';
      }).join('');
      render(
        '<header class="musician-head">' +
          '<h1>音樂家卡片</h1>' +
          '<p>先看圖卡，再做八題練習。八位音樂家都會出現。練習只留在這部裝置。</p>' +
          '<p class="musician-disclaimer">' + esc(bank.disclaimer) + '</p>' +
        '</header>' +
        '<div class="musician-actions">' +
          '<button type="button" class="musician-primary" data-act="quiz">練習八題</button>' +
          '<button type="button" data-act="credits">來源與圖片</button>' +
        '</div>' +
        '<div class="musician-gallery">' + cards + '</div>'
      );
    }

    function showDetail(id) {
      var musician = musicianById(bank, id);
      if (!musician) { showGallery(); return; }
      view = { name: 'detail', id: id };
      setBack('← 返回卡片');
      var store = readStore();
      store.seen[id] = true;
      writeStore(store);
      render(
        '<article class="musician-detail">' +
          '<div class="musician-detail-layout">' +
            '<figure><img src="' + esc(musician.portrait.src) + '" alt="' + esc(musician.portrait.alt) + '">' +
            '<figcaption>' + esc(musician.portrait.label) + '</figcaption></figure>' +
            '<div>' +
              '<p class="musician-era">' + esc(musician.era) + '</p>' +
              '<h1>' + esc(musician.nameZh) + '</h1>' +
              '<p class="musician-en">' + esc(musician.nameEn) + '</p>' +
              '<p class="musician-meta">' + esc(musician.years) + ' · ' + esc(musician.regionShort) + '</p>' +
              factBlock(musician) +
              '<div class="musician-actions">' +
                '<button type="button" class="musician-primary" data-act="quiz">用八張卡練習</button>' +
                '<button type="button" data-act="one-source">這一卡的來源</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }

    function showCredits(musician) {
      view = { name: 'credits', id: musician ? musician.id : '' };
      setBack('← 返回卡片');
      var blocks;
      if (musician) {
        blocks = '<h1>' + esc(musician.nameZh) + '的來源</h1>' + sourceList(sourcesFor(musician));
      } else {
        blocks = '<h1>來源與圖片</h1><p>每一項史實都附上查閱過的頁面。畫像是依公有領域參考畫的插畫，不是照片。</p>' +
          bank.musicians.map(function (item) {
            return '<h2>' + esc(item.nameZh) + '</h2>' + sourceList(sourcesFor(item));
          }).join('');
      }
      render('<article class="musician-credits">' + blocks + '</article>');
    }

    function showQuestion() {
      var question = round[cursor];
      if (!question) { showSummary(); return; }
      view = { name: 'quiz' };
      setBack('← 返回卡片');
      answered = false;
      var musician = musicianById(bank, question.musicianId);
      var nextLabel = cursor + 1 >= round.length ? '看結果' : '下一題';
      var options = question.choices.map(function (choice, index) {
        return '<button type="button" class="musician-option" data-choice="' + index + '">' + esc(choice) + '</button>';
      }).join('');
      render(
        '<section class="musician-quiz" aria-labelledby="musicianQuizTitle">' +
          '<p class="musician-progress" id="musicianQuizTitle">第 ' + (cursor + 1) + ' / ' + round.length + ' 題 · ' + esc(musician ? musician.nameZh : '') + ' · 練習，不上傳</p>' +
          '<h1 class="musician-prompt">' + esc(question.prompt) + '</h1>' +
          '<div class="musician-options" role="group" aria-label="答案選項">' + options + '</div>' +
          '<div class="musician-explain" id="musicianExplain" aria-live="polite">選一個答案。說明會留在這個位置，版面不會往下跳。</div>' +
          '<div class="musician-actions"><button type="button" class="musician-primary" data-act="next" disabled>' + nextLabel + '</button></div>' +
        '</section>'
      );
    }

    function showSummary() {
      view = { name: 'summary' };
      setBack('← 返回卡片');
      var store = readStore();
      store.last = { correct: correctCount, total: round.length, at: new Date().toISOString() };
      writeStore(store);
      var missHtml = misses.length
        ? '<ul class="musician-misses">' + misses.map(function (item) {
          return '<li><b>' + esc(item.prompt) + '</b> ' + esc(item.explanation) + '</li>';
        }).join('') + '</ul>'
        : '<p>這一輪八題都答對了。可以再練一次，換還沒出過的題。</p>';
      render(
        '<section class="musician-summary">' +
          '<h1>這一輪練習</h1>' +
          '<p class="musician-score">答對 ' + correctCount + ' / ' + round.length + '</p>' +
          '<p class="musician-disclaimer">' + esc(bank.disclaimer) + '</p>' +
          '<p>分數只寫在這部裝置，沒有上傳，也不會計入能力圖。</p>' +
          missHtml +
          '<div class="musician-actions">' +
            '<button type="button" class="musician-primary" data-act="retry">再練一次</button>' +
            '<button type="button" data-act="gallery">返回卡片</button>' +
          '</div>' +
        '</section>'
      );
    }

    function startQuiz(resetUsed) {
      if (resetUsed) sessionUsed = [];
      var picked = selectRound(bank, Math.random, sessionUsed);
      round = picked.round;
      sessionUsed = picked.used;
      cursor = 0;
      correctCount = 0;
      misses = [];
      showQuestion();
    }

    function choose(index) {
      if (answered) return;
      var question = round[cursor];
      if (!question) return;
      answered = true;
      var result = gradeChoice(question, index);
      if (result.correct) correctCount += 1;
      else misses.push({ prompt: question.prompt, explanation: result.explanation });
      var buttons = host.querySelectorAll('.musician-option');
      buttons.forEach(function (button) {
        var value = Number(button.getAttribute('data-choice'));
        button.disabled = true;
        if (value === question.answer) button.classList.add('is-correct');
        else if (value === index) button.classList.add('is-wrong');
      });
      var explain = doc.getElementById('musicianExplain');
      var answerText = question.choices[question.answer];
      if (explain) {
        explain.textContent = (result.correct ? '答對。' : '這題不是這個答案。') +
          '卡片上的說法是：' + answerText + '。' + result.explanation;
      }
      var next = host.querySelector('[data-act="next"]');
      if (next) next.disabled = false;
    }

    host.addEventListener('click', function (event) {
      var open = event.target.closest('[data-open]');
      if (open) { showDetail(open.getAttribute('data-open')); return; }
      var choice = event.target.closest('[data-choice]');
      if (choice && view.name === 'quiz') { choose(Number(choice.getAttribute('data-choice'))); return; }
      var act = event.target.closest('[data-act]');
      if (!act) return;
      var name = act.getAttribute('data-act');
      if (name === 'quiz' || name === 'retry') startQuiz(false);
      else if (name === 'credits') showCredits(null);
      else if (name === 'one-source') showCredits(musicianById(bank, view.id));
      else if (name === 'gallery') showGallery();
      else if (name === 'next') {
        cursor += 1;
        if (cursor >= round.length) showSummary();
        else showQuestion();
      }
    });

    if (back) {
      back.addEventListener('click', function () {
        if (view.name === 'gallery') goHub();
        else showGallery();
      });
    }

    showGallery();
    fetch(DATA_URL, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    }).then(function (data) {
      bank = data;
      if (view.name === 'gallery') showGallery();
    }).catch(function () {
      render('<p class="musician-status">卡片暫時讀不到。請稍後再打開這一頁。</p>');
    });
  }

  return {
    DATA_URL: DATA_URL,
    STORE_KEY: STORE_KEY,
    ROUND_SIZE_NOTE: ROUND_SIZE_NOTE,
    selectRound: selectRound,
    gradeChoice: gradeChoice,
    supportText: supportText,
    musicianById: musicianById,
    mount: mount
  };
});
