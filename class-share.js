/**
 * School classmate cards and presence.
 * Reads and writes only with a roster-bound or allowlisted-teacher session token.
 * A hub name, grade, class, or seat is not a credential.
 * Guests and testers are not uploaded. Grade and class query values are filters, not identity.
 * Writes stay on the signed-in student. The directory read may cover the whole school.
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
    var GAME_LABEL = {
        game1: '音名',
        keysig: '調號',
        solfege: '唱名',
        chord: '和弦',
        game2: '節奏',
        game3: '術語',
        game4: '樂器',
        listening: '聽力',
        'aural-interval': '音程聽辨',
        'aural-rhythm': '節奏聽寫',
        'aural-quality': '和弦色彩'
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

    function boardFilter(scope) {
        scope = scope || {};
        var rawGrade = text(scope.grade);
        var rawClass = text(scope.class);
        var grade = rawGrade ? schoolGrade(scope.grade) : '';
        var klass = rawClass ? schoolClass(scope.class, grade) : '';
        return {
            grade: grade,
            class: klass,
            invalid: !!((rawGrade && !grade) || (rawClass && !klass))
        };
    }

    function matchesFilter(row, filter) {
        var scope = classScope(row);
        if (!scope) return false;
        var wanted = boardFilter(filter);
        if (wanted.invalid) return false;
        if (wanted.grade && scope.grade !== wanted.grade) return false;
        if (wanted.class && scope.class !== wanted.class) return false;
        return true;
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

    function directoryEntries(groups, cards, filter) {
        var byKey = {};
        function put(row) {
            if (!row || !matchesFilter(row, filter)) return;
            var name = text(row.name);
            if (!name || BLOCKED[name] || name.indexOf('訪客') === 0 || /[|%]/.test(name)) return;
            var scope = classScope(row);
            var key = scope.grade + '|' + scope.class + '|' + name;
            var seat = text(row.seat).slice(0, 8);
            var prev = byKey[key];
            if (!prev) {
                byKey[key] = { name: name, grade: parseInt(scope.grade, 10), class: scope.class, seat: seat };
                return;
            }
            if (seat && !prev.seat) prev.seat = seat;
        }
        (cards || []).forEach(put);
        (groups || []).forEach(function (group) {
            (group.names || []).forEach(function (name, i) {
                put({ name: name, grade: group.grade, class: group.class, seat: String(i + 1) });
            });
        });
        return Object.keys(byKey).map(function (key) { return byKey[key]; }).sort(function (a, b) {
            return String(a.grade).localeCompare(String(b.grade)) || String(a.class).localeCompare(String(b.class)) || ((parseInt(a.seat, 10) || 999) - (parseInt(b.seat, 10) || 999)) || a.name.localeCompare(b.name, 'zh');
        });
    }

    function visibleOnline(rosterNames, online, scope) {
        var rows = classRows(online, scope);
        var roster = (rosterNames || []).map(text).filter(Boolean);
        if (!roster.length) return rows;
        var allow = {};
        roster.forEach(function (name) { allow[name] = 1; });
        return rows.filter(function (row) { return allow[row.name]; });
    }

    function cardFor(cards, name, seat, scope) {
        var matches = (cards || []).filter(function (card) {
            if (!card || card.name !== name) return false;
            if (scope && classScope(scope) && classScope(card) && !sameClass(card, scope)) return false;
            return true;
        });
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

    function publicCard(row) {
        if (!shareable(row)) return null;
        var id = identity(row);
        return {
            name: id.name,
            grade: id.grade,
            class: id.class,
            seat: id.seat,
            avatar: cleanAvatar(row.avatar) || '🎵',
            signature: text(row.signature).slice(0, 30)
        };
    }

    function publicOnline(row) {
        var card = publicCard(row);
        if (!card) return null;
        card.screen = text(row.screen).slice(0, 40);
        return card;
    }

    function publicLog(row) {
        var card = publicCard(row);
        if (!card) return null;
        return {
            name: card.name,
            grade: card.grade,
            class: card.class,
            seat: card.seat,
            event: text(row.event).slice(0, 20),
            screen: text(row.screen).slice(0, 40),
            at: text(row.at || row.timestamp).slice(0, 40)
        };
    }

    function publicGameRecord(row) {
        if (!row || typeof row !== 'object') return null;
        var name = text(row.name).slice(0, 20);
        if (!name || BLOCKED[name] || name.indexOf('訪客') === 0 || /[|%]/.test(name)) return null;
        var grade = schoolGrade(row.grade);
        var klass = schoolClass(row.class, grade);
        if (!grade || !klass) return null;
        var game = text(row.game || row.gameKey || '');
        if (!game || !GAME_LABEL[game]) {
            var mode = text(row.mode);
            game = GAME_LABEL[mode] ? mode : '';
        }
        if (!game) return null;
        if (row.score == null || row.score === '') return null;
        var score = parseInt(row.score, 10);
        if (!isFinite(score)) return null;
        var rec = {
            kind: 'game',
            name: name,
            grade: grade,
            class: klass,
            game: game,
            gameLabel: GAME_LABEL[game],
            score: score
        };
        var seat = text(row.seat || row.id).slice(0, 8);
        if (seat && seat.indexOf('@') === -1 && !/[|%]/.test(seat)) rec.seat = seat;
        if (row.accuracy != null && row.accuracy !== '' && isFinite(parseInt(row.accuracy, 10))) rec.accuracy = parseInt(row.accuracy, 10);
        var combo = row.max_combo != null ? row.max_combo : row.maxCombo;
        if (combo != null && combo !== '' && isFinite(parseInt(combo, 10))) rec.combo = parseInt(combo, 10);
        var at = text(row.timestamp || row.at || row.date);
        if (at) rec.at = at.slice(0, 40);
        return rec;
    }

    function timeValue(value) {
        var parsed = Date.parse(value);
        return isFinite(parsed) ? parsed : 0;
    }

    function radarRecords(log, ranks, filter) {
        var events = [];
        (log || []).forEach(function (row) {
            var clean = publicLog(row);
            if (!clean || !matchesFilter(clean, filter)) return;
            clean.kind = 'presence';
            events.push(clean);
        });
        var games = [];
        (ranks || []).forEach(function (row) {
            var clean = publicGameRecord(row);
            if (!clean || !matchesFilter(clean, filter)) return;
            games.push(clean);
        });
        return events.concat(games).sort(function (a, b) {
            return timeValue(b.at) - timeValue(a.at);
        });
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
        var filter = boardFilter(scope);
        if (filter.invalid) return emptyBoard();
        function kept(rows, pub) {
            var out = [];
            (rows || []).forEach(function (row) {
                var clean = pub(row);
                if (!clean || !matchesFilter(clean, filter)) return;
                out.push(clean);
            });
            return out;
        }
        return {
            cards: kept(board && board.cards, publicCard),
            online: kept(board && board.online, publicOnline),
            log: kept(board && board.log, publicLog)
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
        var filter = boardFilter(scope);
        if (filter.invalid) return Promise.resolve(failedBoard('bad_filter'));
        var path = '/class/board';
        var query = [];
        if (filter.grade) query.push('grade=' + encodeURIComponent(filter.grade));
        if (filter.class) query.push('class=' + encodeURIComponent(filter.class));
        if (query.length) path += '?' + query.join('&');
        return fetch(base + path, {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + token }
        }).then(function (res) {
            return res.json().catch(function () { return null; }).then(function (data) {
                if (!res.ok || !data || data.ok === false) return failedBoard((data && data.error) || ('HTTP ' + res.status));
                var board = takeBoard(data, filter);
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
        boardFilter: boardFilter,
        matchesFilter: matchesFilter,
        cleanAvatar: cleanAvatar,
        cardFromProfile: cardFromProfile,
        applyCard: applyCard,
        classRows: classRows,
        directoryNames: directoryNames,
        directoryEntries: directoryEntries,
        visibleOnline: visibleOnline,
        cardFor: cardFor,
        statusText: statusText,
        screenLabel: screenLabel,
        publicGameRecord: publicGameRecord,
        radarRecords: radarRecords,
        postCard: postCard,
        postPresence: postPresence,
        loadBoard: loadBoard,
        takeBoard: takeBoard,
        presenceAction: presenceAction,
        note: note,
        stop: stop
    };
});
