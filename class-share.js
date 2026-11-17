/**
 * Class-scoped classmate cards and presence.
 * Uploads and downloads only with a roster-bound Google session token.
 * A hub name, grade, class, or seat is not a credential.
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
    var beatToken = '';
    var lastUser = null;
    var lastScreen = '大廳';

    var GRADE_WORDS = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6' };

    function text(value) {
        return String(value == null ? '' : value).trim();
    }

    function schoolGrade(value) {
        var raw = text(value).replace(/\s+/g, '').replace(/\.$/, '');
        if (/^[1-6]$/.test(raw)) return raw;
        var match = /^F[.\-]?([1-6])$/i.exec(raw) || /^S([1-6])$/i.exec(raw) || /^FORM([1-6])$/i.exec(raw);
        if (match) return match[1];
        match = /^中([1-6一二三四五六])$/.exec(raw);
        if (match) return GRADE_WORDS[match[1]] || match[1];
        return '';
    }

    function schoolClass(value, grade) {
        var form = schoolGrade(grade);
        var raw = text(value).replace(/\s+/g, '').replace(/班$/g, '').toUpperCase();
        if (!raw) return '';
        var match = /^(?:F|S)?([1-6])([A-Z])$/.exec(raw);
        if (match && (!form || match[1] === form)) return match[2];
        match = /^中([1-6一二三四五六])([A-Z])$/.exec(raw);
        if (match) {
            var n = GRADE_WORDS[match[1]] || match[1];
            if (!form || n === form) return match[2];
        }
        if (/^[A-Z0-9]{1,8}$/.test(raw)) return raw;
        return '';
    }

    function classScope(user) {
        var grade = schoolGrade(user && user.grade);
        var klass = schoolClass(user && user.class, grade);
        if (!grade || !klass) return null;
        return { grade: grade, class: klass };
    }

    function shareable(user, opts) {
        opts = opts || {};
        if (opts.tester) return false;
        if (!user || user.guest || user.tester) return false;
        var name = text(user.name);
        if (!name || BLOCKED[name] || name.indexOf('訪客') === 0) return false;
        if (/[|%]/.test(name)) return false;
        return !!classScope(user);
    }

    function identity(user) {
        var scope = classScope(user) || { grade: '', class: '' };
        return {
            name: text(user && user.name).slice(0, 20),
            grade: parseInt(scope.grade, 10) || 0,
            class: scope.class,
            seat: text(user && (user.seat || user.id)).slice(0, 8)
        };
    }

    function sameClass(a, b) {
        var left = classScope(a);
        var right = classScope(b);
        if (!left || !right) return false;
        return left.grade === right.grade && left.class === right.class;
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
        var seen = {};
        var out = [];
        function add(name) {
            name = text(name);
            if (!name || seen[name] || BLOCKED[name] || name.indexOf('訪客') === 0) return;
            seen[name] = 1;
            out.push(name);
        }
        classRows(cards, scope).forEach(function (card) { add(card.name); });
        (rosterNames || []).forEach(add);
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

    function credential(opts) {
        var token = opts && text(opts.token);
        if (!token || token.length < 20 || (opts && opts.tester)) return '';
        return token;
    }

    function emptyBoard() {
        return { cards: [], online: [], log: [] };
    }

    function takeBoard(board, scope) {
        if (!classScope(scope)) return emptyBoard();
        return {
            cards: classRows(board && board.cards, scope),
            online: classRows(board && board.online, scope),
            log: classRows(board && board.log, scope)
        };
    }

    function failedBoard(error) {
        var board = emptyBoard();
        board.ok = false;
        board.error = error || 'board_failed';
        return board;
    }

    function presenceAction(state) {
        state = state || {};
        if (!credential(state) || state.enrolled === false || state.signedOut) return 'stop';
        if (state.visible === false) return 'offline';
        return 'ping';
    }

    function postJson(path, body, token) {
        var base = apiBase();
        if (!base || !token || typeof fetch !== 'function') return Promise.resolve(null);
        return fetch(base + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify(body)
        }).then(function (res) {
            return res.json().catch(function () { return null; });
        }).catch(function () { return null; });
    }

    function postCard(profile, opts) {
        var token = credential(opts);
        if (!token || !profile) return Promise.resolve(null);
        var avatar = cleanAvatar(profile.avatar);
        if (!avatar) return Promise.resolve(null);
        return postJson('/class/card', {
            avatar: avatar,
            signature: text(profile.signature).slice(0, 30)
        }, token);
    }

    function postPresence(user, screen, opts) {
        var token = credential(opts);
        if (!token) return Promise.resolve(null);
        var body = { screen: text(screen).slice(0, 40) };
        if (opts && opts.offline) body.offline = true;
        return postJson('/class/presence', body, token);
    }

    function loadBoard(scope, opts) {
        var token = credential(opts);
        var base = apiBase();
        opts = opts || {};
        if (!token || !base || typeof fetch !== 'function') return Promise.resolve(failedBoard('unauthorized'));
        if (!classScope(scope)) return Promise.resolve(failedBoard('not_on_roster'));
        var path = '/class/board';
        if (opts.teacher) path += '?grade=' + encodeURIComponent(classScope(scope).grade) + '&class=' + encodeURIComponent(classScope(scope).class);
        return fetch(base + path, {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + token }
        }).then(function (res) {
            return res.json().catch(function () { return null; }).then(function (data) {
                if (!res.ok || !data || data.ok === false) return failedBoard((data && data.error) || ('HTTP ' + res.status));
                var board = takeBoard(data, scope);
                board.ok = true;
                board.error = '';
                return board;
            });
        }).catch(function () { return failedBoard('network'); });
    }

    function stop() {
        lastUser = null;
        beatToken = '';
        if (timer) { clearInterval(timer); timer = 0; }
    }

    function note(user, screenId, opts) {
        opts = opts || {};
        var token = credential(opts);
        if (!token || !shareable(user, opts)) {
            stop();
            return false;
        }
        beatToken = token;
        lastUser = identity(user);
        if (opts.activity) lastScreen = text(opts.activity).slice(0, 40) || lastScreen;
        else if (screenId) lastScreen = screenLabel(screenId);
        postPresence(lastUser, lastScreen, { token: beatToken });
        if (!timer) timer = setInterval(function () {
            if (beatToken && lastUser) postPresence(lastUser, lastScreen, { token: beatToken });
        }, 45000);
        return true;
    }

    return {
        shareable: shareable,
        schoolGrade: schoolGrade,
        schoolClass: schoolClass,
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
        takeBoard: takeBoard,
        presenceAction: presenceAction,
        note: note,
        stop: stop
    };
});
