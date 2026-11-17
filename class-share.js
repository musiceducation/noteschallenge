/**
 * Class-scoped classmate cards and presence.
 * Uses the classroom identity (grade + class + name + seat). No Google sign-in.
 * Guests and testers are not uploaded. Other classes are not returned.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.ClassShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var BLOCKED = { '訪客': 1, '測試人員': 1, '__guest__': 1, '__other__': 1 };
    var SCREEN = {
        'screen-hub': '大廳',
        'screen-app-root': '大廳',
        'screen-profile': '檔案',
        'screen-presence': '在線同紀錄',
        'screen-leaderboard': '排行榜',
        'screen-classmates': '同學名冊',
        'screen-view-profile': '同學檔案',
        'screen-setup': '音名',
        'screen-game': '音名作答',
        'screen-g2-setup': '節奏',
        'screen-g2-duration': '節奏練習',
        'screen-rc-levels': '課堂柯達伊',
        'screen-rc-detail': '課堂柯達伊',
        'screen-rc-game': '課堂柯達伊',
        'screen-rc-grade': '節奏挑戰',
        'screen-g3-setup': '術語',
        'screen-game3': '術語作答',
        'screen-g4-setup': '樂器',
        'screen-game4': '樂器作答',
        'screen-note-teach': '看圖學習',
        'screen-chord-card': '和弦',
        'screen-aural': '聽力',
        'screen-aural-interval': '音程聽辨',
        'screen-aural-rhythm': '節奏聽寫',
        'screen-aural-quality': '和弦色彩',
        'screen-composition-studio': '創作工作室'
    };
    var timer = 0;
    var lastUser = null;
    var lastScreen = '大廳';

    function text(value) {
        return String(value == null ? '' : value).trim();
    }

    function shareable(user, opts) {
        opts = opts || {};
        if (opts.tester) return false;
        if (!user || user.guest || user.tester) return false;
        var name = text(user.name);
        if (!name || BLOCKED[name] || name.indexOf('訪客') === 0) return false;
        if (/[|%]/.test(name)) return false;
        var grade = parseInt(user.grade, 10);
        if (!(grade >= 1 && grade <= 6)) return false;
        var klass = text(user.class);
        if (!/^[A-Za-z0-9]{1,8}$/.test(klass)) return false;
        return true;
    }

    function identity(user) {
        return {
            name: text(user && user.name).slice(0, 20),
            grade: parseInt(user && user.grade, 10) || 0,
            class: text(user && user.class).toUpperCase().slice(0, 8),
            seat: text(user && (user.seat || user.id)).slice(0, 8)
        };
    }

    function sameClass(a, b) {
        if (!a || !b) return false;
        return String(parseInt(a.grade, 10) || 0) === String(parseInt(b.grade, 10) || 0)
            && text(a.class).toUpperCase() === text(b.class).toUpperCase();
    }

    function cleanAvatar(value) {
        var s = text(value);
        if (!s) return '';
        if (s.indexOf('data:image/jpeg;base64,') === 0) {
            if (s.length > 80000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s)) return '';
            return s;
        }
        if (s.indexOf('data:') === 0) return '';
        return s.slice(0, 16);
    }

    function cardFromProfile(profile) {
        if (!shareable(profile)) return null;
        var id = identity(profile);
        var bests = {};
        var raw = profile.gameBests || {};
        Object.keys(raw).forEach(function (key) {
            if (!/^[A-Za-z0-9_-]{1,40}$/.test(key)) return;
            bests[key] = parseInt(raw[key], 10) || 0;
        });
        return {
            name: id.name,
            grade: id.grade,
            class: id.class,
            seat: id.seat,
            avatar: cleanAvatar(profile.avatar) || '🎵',
            signature: text(profile.signature).slice(0, 30),
            level: parseInt(profile.level, 10) || 1,
            exp: parseInt(profile.exp, 10) || 0,
            totalPlayTime: parseInt(profile.totalPlayTime, 10) || 0,
            gameBests: bests
        };
    }

    function applyCard(local, card) {
        var base = Object.assign({}, local || {});
        if (!card || !shareable(card) || !sameClass(base.name ? base : card, card)) return base;
        if (base.name && !sameClass(base, card)) return base;
        var avatar = cleanAvatar(card.avatar);
        if (avatar) base.avatar = avatar;
        var signature = text(card.signature);
        if (signature) base.signature = signature.slice(0, 30);
        base.level = Math.max(parseInt(base.level, 10) || 1, parseInt(card.level, 10) || 1);
        base.exp = Math.max(parseInt(base.exp, 10) || 0, parseInt(card.exp, 10) || 0);
        base.totalPlayTime = Math.max(parseInt(base.totalPlayTime, 10) || 0, parseInt(card.totalPlayTime, 10) || 0);
        if (card.seat && !text(base.seat)) base.seat = text(card.seat).slice(0, 8);
        var bests = Object.assign({}, base.gameBests || {});
        Object.keys(card.gameBests || {}).forEach(function (key) {
            if (!/^[A-Za-z0-9_-]{1,40}$/.test(key)) return;
            bests[key] = Math.max(parseInt(bests[key], 10) || 0, parseInt(card.gameBests[key], 10) || 0);
        });
        base.gameBests = bests;
        return base;
    }

    function classRows(rows, scope) {
        return (rows || []).filter(function (row) {
            return row && shareable(row) && sameClass(row, scope);
        });
    }

    function directoryNames(rosterNames, cards, scope) {
        var roster = (rosterNames || []).map(text).filter(Boolean);
        if (roster.length) return roster;
        var seen = {};
        var out = [];
        classRows(cards, scope).forEach(function (card) {
            if (seen[card.name]) return;
            seen[card.name] = 1;
            out.push(card.name);
        });
        return out;
    }

    function visibleOnline(rosterNames, online, scope) {
        var rows = classRows(online, scope);
        var roster = (rosterNames || []).map(text).filter(Boolean);
        if (!roster.length) return rows;
        var allow = {};
        roster.forEach(function (name) { allow[name] = 1; });
        return rows.filter(function (row) { return allow[row.name]; });
    }

    function cardFor(cards, name, seat) {
        var matches = (cards || []).filter(function (card) { return card && card.name === name; });
        var wanted = text(seat);
        for (var i = 0; i < matches.length; i++) {
            if (wanted && text(matches[i].seat) === wanted) return matches[i];
        }
        return matches[0] || null;
    }

    function statusText(online, screen) {
        if (!online) return '離線';
        var where = text(screen) || '大廳';
        return '在線·' + where;
    }

    function screenLabel(screenId) {
        return SCREEN[screenId] || '大廳';
    }

    function apiBase() {
        var cfg = (typeof window !== 'undefined' && window.MUSIC_APP_AUTH) || {};
        return String(cfg.authApiBase || '').replace(/\/$/, '');
    }

    function postJson(path, body) {
        var base = apiBase();
        if (!base || typeof fetch !== 'function') return Promise.resolve(null);
        return fetch(base + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (res) {
            return res.json().catch(function () { return null; });
        }).catch(function () { return null; });
    }

    function postCard(profile, opts) {
        var card = cardFromProfile(profile);
        if (!card || (opts && opts.tester)) return Promise.resolve(null);
        return postJson('/class/card', card);
    }

    function postPresence(user, screen, opts) {
        if (!shareable(user, opts)) return Promise.resolve(null);
        var id = identity(user);
        id.screen = text(screen).slice(0, 40) || '大廳';
        return postJson('/class/presence', id);
    }

    function loadBoard(scope) {
        var empty = { cards: [], online: [], log: [] };
        var base = apiBase();
        if (!base || !shareable(scope) || typeof fetch !== 'function') return Promise.resolve(empty);
        var id = identity(scope);
        var url = base + '/class/board?grade=' + encodeURIComponent(id.grade) + '&class=' + encodeURIComponent(id.class);
        return fetch(url, { method: 'GET' }).then(function (res) {
            return res.json().catch(function () { return null; });
        }).then(function (data) {
            if (!data || data.ok === false) return empty;
            return {
                cards: classRows(data.cards, id),
                online: classRows(data.online, id),
                log: classRows(data.log, id)
            };
        }).catch(function () { return empty; });
    }

    function note(user, screenId, opts) {
        opts = opts || {};
        if (!shareable(user, opts)) {
            lastUser = null;
            return;
        }
        lastUser = identity(user);
        if (opts.activity) lastScreen = text(opts.activity).slice(0, 40) || lastScreen;
        else if (screenId) lastScreen = screenLabel(screenId);
        postPresence(lastUser, lastScreen, opts);
        if (!timer) timer = setInterval(function () {
            if (lastUser) postPresence(lastUser, lastScreen);
        }, 45000);
    }

    return {
        shareable: shareable,
        identity: identity,
        sameClass: sameClass,
        cleanAvatar: cleanAvatar,
        cardFromProfile: cardFromProfile,
        applyCard: applyCard,
        classRows: classRows,
        directoryNames: directoryNames,
        visibleOnline: visibleOnline,
        cardFor: cardFor,
        statusText: statusText,
        screenLabel: screenLabel,
        postCard: postCard,
        postPresence: postPresence,
        loadBoard: loadBoard,
        note: note
    };
});
