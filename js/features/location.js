(function() {
    'use strict';

    var LOC_KEY = 'locationData';
    var EGG_COOLDOWN = 7 * 24 * 3600 * 1000;
    var SENSE_CD_MIN = 15 * 60 * 1000;
    var SENSE_CD_MAX = 45 * 60 * 1000;
    var AUTO_MIN = 1 * 3600 * 1000;
    var AUTO_MAX = 6 * 3600 * 1000;
    var MAX_HISTORY = 300;

    var CARDS = {
        dir: ['在你左边', '在你右边', '在你身后', '在你前面', '离你两步', '抬头就能看到', '在你看不到的地方偷看你'],
        dist: ['再近一点', '再远一点', '就停这儿', '马上到你身边', '一直在原地等你'],
        state: ['跟在你后面', '陪你走着', '停下来等你', '绕着你转圈', '在你身边'],
        sense: ['在你看不到的地方', '隔着世界在你身边', '感觉到了吗', '能摸到我吗', '一直没走远', '隐约在你身旁'],
        egg: ['在你心里'],
        direct: ['正前方', '右前方', '右侧', '右后方', '后方', '左后方', '左侧', '左前方', '身边', '无法判断'],
        rangef: ['很近', '近', '稍远', '很远', '无法判断'],
        power: ['明显', '微弱', '若有若无', '消失'],
        touch: ['好像碰到了你的手', '有什么轻轻碰了一下你的肩', '耳边好像有气息拂过', '衣角被轻轻拉了一下']
    };

    var COMPANION = ['在你身边', '一直没走远', '隔着世界在你身边', '隐约在你身旁', '在你看不到的地方'];

    var DIRS = ['正前方', '右前方', '右侧', '右后方', '后方', '左后方', '左侧', '左前方'];

    var DIR_ARROW = {
        '正前方': '↑',
        '右前方': '↗',
        '右侧': '→',
        '右后方': '↘',
        '后方': '↓',
        '左后方': '↙',
        '左侧': '←',
        '左前方': '↖',
        '身边': '◉',
        '无法判断': '？'
    };

    var locData = freshData();
    var autoTimer = null;
    var tickTimer = null;
    var fxTimer = null;
    var fxHideTimer = null;
    var popupTimer = null;
    var asking = false;
    var viewDate = startOfDay(new Date());
    var root = null;
    var renderedEntries = [];

    function freshData() {
        return {
            dir: '在你前面',
            dist: '一直在原地等你',
            state: '',
            sense: '',
            touch: '',
            direct: '正前方',
            rangef: '很远',
            power: '明显',
            center: false,
            updatedAt: Date.now(),
            lastSwitchText: '',
            lastSenseAt: 0,
            nextSenseAt: 0,
            lastEggAt: 0,
            nextAutoAt: 0,
            history: [],
            settings: {
                autoSwitch: true,
                switchPopup: true
            }
        };
    }

    function el(id) { return document.getElementById(id); }

    function notif(msg, type, dur) {
        if (typeof showNotification === 'function') showNotification(msg, type || 'info', dur || 2000);
    }

    function safePlay(name) {
        if (typeof playSound === 'function') {
            try { playSound(name); } catch (e) {}
        }
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function pickWeighted(list, weights) {
        var total = 0;
        for (var i = 0; i < weights.length; i++) total += weights[i];
        if (total <= 0) return pick(list);
        var r = Math.random() * total;
        for (var j = 0; j < list.length; j++) {
            r -= weights[j];
            if (r < 0) return list[j];
        }
        return list[list.length - 1];
    }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function fmtTime(ts) {
        var d = new Date(ts);
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    function startOfDay(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function sameDay(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    function arrowOf(d) { return DIR_ARROW[d] || '·'; }

    function dirFromText(text) {
        if (!text) return null;
        var t = String(text);
        if (t.indexOf('心里') >= 0) return '身边';
        if (t.indexOf('左前') >= 0) return '左前方';
        if (t.indexOf('右前') >= 0) return '右前方';
        if (t.indexOf('左后') >= 0) return '左后方';
        if (t.indexOf('右后') >= 0) return '右后方';
        if (t.indexOf('左边') >= 0 || t.indexOf('左侧') >= 0) return '左侧';
        if (t.indexOf('右边') >= 0 || t.indexOf('右侧') >= 0) return '右侧';
        if (t.indexOf('身后') >= 0 || t.indexOf('后面') >= 0 || t.indexOf('后方') >= 0 || t.indexOf('跟在') >= 0 || t.indexOf('跟着') >= 0 || t.indexOf('绕着你') >= 0) return '后方';
        if (t.indexOf('前面') >= 0 || t.indexOf('前方') >= 0 || t.indexOf('抬头') >= 0) return '正前方';
        if (t.indexOf('身边') >= 0 || t.indexOf('身旁') >= 0 || t.indexOf('两步') >= 0 || t.indexOf('陪你走') >= 0) return '身边';
        return null;
    }

    function recentTendency() {
        var recs = [];
        for (var i = locData.history.length - 1; i >= 0 && recs.length < 4; i--) {
            if (locData.history[i].type === 'sense') recs.push(locData.history[i]);
        }
        var near = 0, far = 0;
        recs.forEach(function(r) {
            if (r.rangef === '很近' || r.rangef === '近') near++;
            else if (r.rangef === '稍远' || r.rangef === '很远') far++;
        });
        if (recs.length && near > recs.length / 2) return 'near';
        if (recs.length && far > recs.length / 2) return 'far';
        return 'neutral';
    }

    function pickDirect() {
        var r = Math.random();
        if (r < 0.02) return '无法判断';
        if (r < 0.1) return '身边';
        var pool = DIRS.filter(function(d) { return d !== locData.direct; });
        return pick(pool.length ? pool : DIRS);
    }

    function pickRangef(tend) {
        var w = tend === 'near' ? [6, 4, 1, 0.4, 0.6] : (tend === 'far' ? [0.4, 1, 4, 6, 0.6] : [1.5, 1.5, 1.5, 1.5, 0.5]);
        return pickWeighted(CARDS.rangef, w);
    }

    function pickPower(tend) {
        var w = tend === 'near' ? [6, 1, 0.6, 0.4] : (tend === 'far' ? [0.5, 4, 3, 1.2] : [1.5, 1.5, 1.5, 0.6]);
        return pickWeighted(CARDS.power, w);
    }

    function playCenterFx() {
        var fx = el('loc-fx');
        if (!fx) return;
        clearTimeout(fxTimer);
        clearTimeout(fxHideTimer);
        fx.className = 'loc-fx center show';
        fxTimer = setTimeout(function() { fx.classList.remove('show'); }, 4200);
        fxHideTimer = setTimeout(function() { fx.className = 'loc-fx'; }, 5000);
    }

    function storeKey() {
        if (typeof getStorageKey === 'function') {
            try {
                var k = getStorageKey(LOC_KEY);
                if (k) return k;
            } catch (e) {}
        }
        return null;
    }

    function fallbackKey() {
        return 'CHAT_APP_V3_' + LOC_KEY;
    }

    function save() {
        var key = storeKey();
        if (!key) return false;
        try {
            if (typeof safeStore === 'function') {
                safeStore(key, locData);
                return true;
            }
            if (typeof localforage !== 'undefined') localforage.setItem(key, locData);
        } catch (e) {}
        return true;
    }

    function merge(saved) {
        var d = freshData();
        Object.keys(d).forEach(function(k) {
            if (saved[k] === undefined || saved[k] === null) return;
            if (k === 'settings') {
                var s = saved.settings || {};
                locData.settings.autoSwitch = s.autoSwitch !== false;
                locData.settings.switchPopup = s.switchPopup !== false;
                return;
            }
            locData[k] = saved[k];
        });
        if (!Array.isArray(locData.history)) locData.history = [];
        if (typeof locData.nextSenseAt !== 'number') locData.nextSenseAt = 0;
        if (typeof locData.nextAutoAt !== 'number') locData.nextAutoAt = 0;
        if (typeof locData.updatedAt !== 'number') locData.updatedAt = Date.now();
    }

    function load(done) {
        function finish(v) {
            if (v && typeof v === 'object') merge(v);
            if (typeof done === 'function') done();
        }
        var key = storeKey();
        if (!key) {
            if (typeof done === 'function') done();
            return;
        }
        try {
            if (typeof safeLoad === 'function') {
                var p = safeLoad(key, null);
                if (p && typeof p.then === 'function') {
                    p.then(finish).catch(function() { finish(null); });
                    return;
                }
                finish(p);
                return;
            }
            if (typeof localforage !== 'undefined') {
                localforage.getItem(key).then(finish).catch(function() { finish(null); });
                return;
            }
        } catch (e) {}
        finish(null);
    }

    function sessionReady() {
        try {
            return (typeof SESSION_ID !== 'undefined' && !!SESSION_ID);
        } catch (e) {
            return false;
        }
    }

    function waitForSession(cb) {
        if (sessionReady()) {
            cb();
            return;
        }
        var tries = 0;
        var timer = setInterval(function() {
            tries++;
            if (sessionReady()) {
                clearInterval(timer);
                cb();
                return;
            }
            if (tries > 120) {
                clearInterval(timer);
                cb();
            }
        }, 250);
    }

    function migrateLegacy(done) {
        var real = storeKey();
        if (!real || typeof localforage === 'undefined') {
            if (typeof done === 'function') done();
            return;
        }
        localforage.getItem(fallbackKey()).then(function(legacy) {
            if (!legacy) return null;
            return localforage.getItem(real).then(function(cur) {
                if (cur) return localforage.removeItem(fallbackKey());
                return localforage.setItem(real, legacy).then(function() {
                    return localforage.removeItem(fallbackKey());
                });
            });
        }).catch(function() {}).then(function() {
            if (typeof done === 'function') done();
        });
    }

    function pushHistory(e) {
        locData.history.push(e);
        if (locData.history.length > MAX_HISTORY) {
            locData.history.splice(0, locData.history.length - MAX_HISTORY);
        }
    }

    function feelText() {
        if (locData.center) return '你感觉到 TA 在你心里';
        if (locData.sense) return locData.sense;
        if (locData.dir) return '你感觉到 TA ' + locData.dir;
        return '你感觉到 TA 在' + (locData.direct || '身边');
    }

    function renderCompass() {
        var dir = locData.center ? '身边' : (locData.direct || '无法判断');
        document.querySelectorAll('#loc-compass .fw-dir').forEach(function(b) {
            b.classList.toggle('active', b.getAttribute('data-dir') === dir);
        });
        var center = el('loc-compass-center');
        if (center) center.classList.toggle('active', !!locData.center);
        var label = el('loc-compass-label');
        if (label) label.textContent = locData.center ? 'TA 在你心里' : (dir === '无法判断' ? '无法判断' : arrowOf(dir) + ' ' + dir);
    }

    function renderAttrs() {
        var d = el('loc-attr-dir');
        if (d) d.textContent = arrowOf(locData.direct) + ' ' + (locData.direct || '无法判断');
        var r = el('loc-attr-range');
        if (r) r.textContent = locData.rangef || '无法判断';
        var p = el('loc-attr-power');
        if (p) p.textContent = locData.power || '—';
    }

    function renderResult() {
        var dirEl = el('loc-result-dir');
        var subEl = el('loc-result-sub');
        var touchEl = el('loc-result-touch');
        if (!locData.lastSenseAt) {
            if (dirEl) dirEl.textContent = '· · ·';
            if (subEl) subEl.textContent = '点击「感知一下」感受 TA 的方向';
            if (touchEl) touchEl.style.display = 'none';
            return;
        }
        if (dirEl) dirEl.textContent = arrowOf(locData.direct) + ' ' + (locData.direct || '无法判断');
        if (subEl) subEl.textContent = (locData.rangef || '无法判断') + ' · ' + (locData.power || '—');
        if (touchEl) {
            if (locData.touch) {
                touchEl.style.display = 'block';
                touchEl.textContent = '✧ ' + locData.touch;
            } else {
                touchEl.style.display = 'none';
            }
        }
    }

    function renderFeel() {
        var t = el('loc-feel-text');
        if (t) t.textContent = feelText();
    }

    function renderCurrent() {
        var textEl = el('loc-now-text');
        var metaEl = el('loc-now-meta');
        var parts = [];
        if (locData.center) {
            parts.push('在你心里');
        } else {
            if (locData.dir) parts.push(locData.dir);
            if (locData.dist) parts.push(locData.dist);
            if (locData.state) parts.push(locData.state);
            if (locData.sense) parts.push(locData.sense);
            if (!parts.length) parts.push('在你身边');
        }
        if (textEl) textEl.textContent = parts.join(' ');
        if (metaEl) {
            var combo = !!(locData.dir && locData.dist && !locData.center);
            metaEl.textContent = (combo ? '组合 · ' : '') + fmtTime(locData.updatedAt || Date.now());
        }
    }

    function renderTimeline() {
        var list = el('loc-timeline-list');
        var label = el('loc-date-label');
        var nextBtn = el('loc-date-next');
        var countEl = el('loc-timeline-count');
        if (!list) return;
        var today = startOfDay(new Date());
        var yesterday = startOfDay(new Date(Date.now() - 86400000));
        if (label) {
            if (sameDay(viewDate, today)) label.textContent = '今天';
            else if (sameDay(viewDate, yesterday)) label.textContent = '昨天';
            else label.textContent = (viewDate.getMonth() + 1) + '月' + viewDate.getDate() + '日';
        }
        if (nextBtn) nextBtn.disabled = sameDay(viewDate, today);
        var entries = locData.history.filter(function(e) {
            return sameDay(new Date(e.t), viewDate);
        }).sort(function(a, b) { return a.t - b.t; });
        renderedEntries = entries;
        if (!entries.length) {
            list.innerHTML = '<div class="loc-tl-empty">这一天还没有感知记录</div>';
        } else {
            list.innerHTML = entries.map(function(e, i) {
                var body = '';
                if (e.type === 'sense') {
                    body = '<span class="loc-tl-tag">方位感知</span>：' + arrowOf(e.direct) + ' ' + esc(e.direct) + ' · ' + esc(e.rangef) + ' · ' + esc(e.power);
                } else if (e.type === 'switch') {
                    body = '<span class="loc-tl-tag">TA换位</span>：' + esc(e.text);
                } else if (e.type === 'ask') {
                    body = '<span class="loc-tl-tag">问TA一声</span>：' + esc(e.text);
                } else if (e.type === 'touch') {
                    body = '<span class="loc-tl-tag">触碰</span>：' + esc(e.text);
                } else if (e.type === 'egg') {
                    body = '<span class="loc-tl-tag">彩蛋</span>：TA在你心里';
                } else {
                    body = esc(e.text || '');
                }
                return '<div class="loc-tl-item"><span class="loc-tl-time">' + fmtTime(e.t) + '</span><span class="loc-tl-body">' + body + '</span><button class="loc-tl-del" data-idx="' + i + '" title="删除这条记录"><i class="fas fa-xmark"></i></button></div>';
            }).join('');
        }
        if (countEl) countEl.textContent = '共 ' + entries.length + ' 条';
    }

    function renderToggles() {
        var autoPill = el('loc-auto-pill');
        if (autoPill) autoPill.classList.toggle('on', !!locData.settings.autoSwitch);
        var popupPill = el('loc-popup-pill');
        if (popupPill) popupPill.classList.toggle('on', !!locData.settings.switchPopup);
    }

    function renderSenseBtn() {
        var btn = el('loc-sense-btn');
        if (!btn) return;
        var hint = el('loc-sense-hint');
        var left = (locData.nextSenseAt || 0) - Date.now();
        if (left > 0) {
            btn.classList.add('cooling');
            btn.innerHTML = '<i class="fas fa-hourglass-half"></i> 冷却中 · 还需 ' + Math.ceil(left / 60000) + ' 分钟';
            if (hint) hint.textContent = '方位感知每 15-45 分钟可进行一次';
        } else {
            btn.classList.remove('cooling');
            btn.innerHTML = '<i class="fas fa-satellite-dish"></i> 感知一下';
            if (hint) hint.textContent = '每次感知将记录到位置时间线';
        }
    }

    function render() {
        if (!root) return;
        renderCompass();
        renderAttrs();
        renderResult();
        renderFeel();
        renderCurrent();
        renderTimeline();
        renderToggles();
        renderSenseBtn();
    }

    function startTicker() {
        stopTicker();
        tickTimer = setInterval(renderSenseBtn, 30000);
    }

    function stopTicker() {
        if (tickTimer) {
            clearInterval(tickTimer);
            tickTimer = null;
        }
    }

    function showSwitchPopup(text, isEgg) {
        var mask = el('loc-popup-mask');
        if (!mask) return;
        var title = el('loc-popup-title');
        var body = el('loc-popup-text');
        if (title) title.textContent = isEgg ? '咦…有哪里不一样' : 'TA 换了个位置';
        if (body) body.textContent = text;
        mask.classList.add('show');
        clearTimeout(popupTimer);
        popupTimer = setTimeout(hideSwitchPopup, 8000);
    }

    function hideSwitchPopup() {
        var mask = el('loc-popup-mask');
        if (mask) mask.classList.remove('show');
    }

    function triggerEgg(source) {
        var now = Date.now();
        locData.lastEggAt = now;
        locData.center = true;
        locData.touch = '';
        locData.direct = '身边';
        locData.rangef = '很近';
        locData.power = '明显';
        locData.lastSenseAt = now;
        locData.updatedAt = now;
        locData.lastSwitchText = '在你心里';
        locData.nextSenseAt = now + SENSE_CD_MIN + Math.random() * (SENSE_CD_MAX - SENSE_CD_MIN);
        pushHistory({ t: now, type: 'egg', text: '在你心里' });
        save();
        render();
        playCenterFx();
        if (locData.settings.switchPopup) showSwitchPopup('在你心里', true);
        notif('✧ TA 在你心里', 'success', 2600);
        return { egg: true, source: source };
    }

    function getSense() {
        var now = Date.now();
        if (now < (locData.nextSenseAt || 0)) {
            notif('方位感知冷却中，还需等待 ' + Math.ceil((locData.nextSenseAt - now) / 60000) + ' 分钟', 'info', 2200);
            return null;
        }
        if (now - (locData.lastEggAt || 0) >= EGG_COOLDOWN && Math.random() < 0.05) {
            return triggerEgg('sense');
        }
        var tend = recentTendency();
        locData.center = false;
        var direct = pickDirect();
        var rangef = pickRangef(tend);
        var power = pickPower(tend);
        var touch = Math.random() < 0.04 ? pick(CARDS.touch) : null;
        locData.direct = direct;
        locData.rangef = rangef;
        locData.power = power;
        locData.touch = touch || '';
        locData.lastSenseAt = now;
        locData.updatedAt = now;
        locData.nextSenseAt = now + SENSE_CD_MIN + Math.random() * (SENSE_CD_MAX - SENSE_CD_MIN);
        pushHistory({ t: now, type: 'sense', direct: direct, rangef: rangef, power: power });
        if (touch) pushHistory({ t: now + 1, type: 'touch', text: touch });
        save();
        render();
        if (touch) notif('✧ ' + touch, 'info', 3000);
        else notif('方位感知完成', 'success', 1500);
        return { direct: direct, rangef: rangef, power: power, touch: touch };
    }

    function pickRelocContent() {
        if (Math.random() < 0.7) return { cat: 'sense', text: pick(COMPANION) };
        var cat = pick(['dir', 'dist', 'state', 'sense']);
        return { cat: cat, text: pick(CARDS[cat]) };
    }

    function applyReloc(content) {
        var now = Date.now();
        locData.center = false;
        if (content.cat === 'dir') locData.dir = content.text;
        else if (content.cat === 'dist') locData.dist = content.text;
        else if (content.cat === 'state') locData.state = content.text;
        else if (content.cat === 'sense') locData.sense = content.text;
        var inferred = dirFromText(content.text) || dirFromText(locData.dir) || dirFromText(locData.state);
        if (inferred) locData.direct = inferred;
        locData.lastSwitchText = content.text;
        locData.updatedAt = now;
        pushHistory({ t: now, type: 'switch', text: content.text, cat: content.cat, direct: locData.direct });
        save();
        render();
        if (locData.settings.switchPopup) showSwitchPopup(content.text, false);
    }

    function performAutoSwitch(forced) {
        if (!forced && !locData.settings.autoSwitch) return null;
        var now = Date.now();
        if (!forced && now - (locData.lastEggAt || 0) >= EGG_COOLDOWN && Math.random() < 0.03) {
            return triggerEgg('auto');
        }
        var content = null;
        for (var i = 0; i < 6; i++) {
            var c = pickRelocContent();
            if (c.text !== locData.lastSwitchText) {
                content = c;
                break;
            }
        }
        if (!content) return null;
        applyReloc(content);
        return content;
    }

    function scheduleAutoSwitch(ms) {
        if (autoTimer) {
            clearTimeout(autoTimer);
            autoTimer = null;
        }
        if (!locData.settings.autoSwitch) return;
        var delay = (typeof ms === 'number' && ms > 0) ? ms : (AUTO_MIN + Math.random() * (AUTO_MAX - AUTO_MIN));
        locData.nextAutoAt = Date.now() + delay;
        save();
        autoTimer = setTimeout(function() {
            autoTimer = null;
            performAutoSwitch(false);
            scheduleAutoSwitch();
        }, delay);
    }

    function askWhere() {
        if (asking) return;
        asking = true;
        if (locData.center) notif('TA 正在你心里呢', 'info', 1800);
        var btn = el('loc-ask-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> TA 正在回应…';
        }
        if (typeof addMessage === 'function') {
            addMessage({
                id: Date.now(),
                sender: 'user',
                text: '你在哪？',
                timestamp: new Date(),
                status: 'sent',
                favorited: false,
                note: null,
                type: 'normal'
            });
        }
        safePlay('send');
        var delay = 2000 + Math.random() * 8000;
        setTimeout(function() {
            asking = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-comment-dots"></i> 问 TA 一声「你在哪？」';
            }
            var dirText = pick(CARDS.dir);
            var distText = pick(CARDS.dist);
            var text = dirText + ' ' + distText;
            var partnerName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : 'TA';
            if (typeof addMessage === 'function') {
                addMessage({
                    id: Date.now() + 1,
                    sender: partnerName,
                    text: text,
                    timestamp: new Date(),
                    status: 'received',
                    favorited: false,
                    note: null,
                    type: 'normal'
                });
            }
            safePlay('message');
            var now = Date.now();
            locData.center = false;
            locData.dir = dirText;
            locData.dist = distText;
            var inferred = dirFromText(dirText);
            if (inferred) locData.direct = inferred;
            locData.updatedAt = now;
            locData.lastSwitchText = text;
            pushHistory({ t: now, type: 'ask', text: text, direct: locData.direct });
            save();
            render();
        }, delay);
    }

    function changeDate(delta) {
        var d = new Date(viewDate);
        d.setDate(d.getDate() + delta);
        if (d > startOfDay(new Date())) return;
        viewDate = d;
        renderTimeline();
    }

    function deleteHistoryAt(idx) {
        var entry = renderedEntries[idx];
        if (!entry) return;
        var pos = locData.history.indexOf(entry);
        if (pos < 0) return;
        locData.history.splice(pos, 1);
        save();
        render();
        notif('已删除这条记录', 'success', 1200);
    }

    function historyDedupeKey(e) {
        return (e.t || 0) + '|' + (e.type || '') + '|' + (e.text || '') + '|' + (e.direct || '') + '|' + (e.rangef || '') + '|' + (e.power || '');
    }

    function exportRecords() {
        if (!locData.history.length) {
            notif('还没有可导出的记录', 'info', 1800);
            return;
        }
        var payload = {
            type: 'ta-location-records',
            version: 1,
            exportedAt: new Date().toISOString(),
            history: locData.history.slice()
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var d = new Date();
        a.href = url;
        a.download = 'location-records-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
        notif('已导出 ' + locData.history.length + ' 条位置记录', 'success', 1800);
    }

    function importRecordsFile(file) {
        var reader = new FileReader();
        reader.onload = function(ev) {
            try {
                var text = String(ev.target.result || '');
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                var data = JSON.parse(text);
                var list = Array.isArray(data) ? data : (data && Array.isArray(data.history) ? data.history : null);
                if (!list) throw new Error('invalid');
                var added = 0;
                list.forEach(function(item) {
                    if (!item || typeof item !== 'object') return;
                    var t = Number(item.t);
                    if (!isFinite(t) || t <= 0) return;
                    var type = String(item.type || '');
                    if (['sense', 'switch', 'ask', 'touch', 'egg'].indexOf(type) === -1) return;
                    var entry = {
                        t: t,
                        type: type,
                        direct: item.direct ? String(item.direct) : '',
                        rangef: item.rangef ? String(item.rangef) : '',
                        power: item.power ? String(item.power) : '',
                        text: item.text ? String(item.text) : '',
                        cat: item.cat ? String(item.cat) : ''
                    };
                    var key = historyDedupeKey(entry);
                    var dup = locData.history.some(function(e) { return historyDedupeKey(e) === key; });
                    if (dup) return;
                    locData.history.push(entry);
                    added++;
                });
                if (added > 0) {
                    locData.history.sort(function(a, b) { return a.t - b.t; });
                    if (locData.history.length > MAX_HISTORY) {
                        locData.history.splice(0, locData.history.length - MAX_HISTORY);
                    }
                    save();
                    render();
                }
                notif(added > 0 ? '已导入 ' + added + ' 条记录' : '没有新增记录（可能已存在）', added > 0 ? 'success' : 'info', 2000);
            } catch (err) {
                notif('导入失败：文件格式不正确', 'error', 2400);
            }
        };
        reader.onerror = function() { notif('读取文件失败', 'error', 2000); };
        reader.readAsText(file, 'utf-8');
    }

    function clearRecords() {
        if (!locData.history.length) {
            notif('还没有记录', 'info', 1600);
            return;
        }
        if (typeof confirm === 'function' && !confirm('确定要删除全部位置记录吗？此操作不可恢复，可先导出备份。')) return;
        locData.history = [];
        save();
        render();
        notif('已清空全部位置记录', 'success', 1800);
    }

    function closePanel() {
        var modal = el('location-modal');
        if (modal && typeof hideModal === 'function') hideModal(modal);
        stopTicker();
        setTimeout(function() {
            var adv = el('advanced-modal');
            if (adv && typeof showModal === 'function') showModal(adv);
        }, 320);
    }

    function openPanel() {
        var adv = el('advanced-modal');
        if (adv && typeof hideModal === 'function') hideModal(adv);
        setTimeout(function() {
            var modal = el('location-modal');
            viewDate = startOfDay(new Date());
            render();
            startTicker();
            if (modal && typeof showModal === 'function') showModal(modal);
        }, 150);
    }

    function bindStatic() {
        var entry = el('location-function');
        if (entry && !entry.dataset.locInit) {
            entry.dataset.locInit = '1';
            entry.addEventListener('click', openPanel);
        }
        var back = el('loc-back-btn');
        if (back && !back.dataset.locInit) {
            back.dataset.locInit = '1';
            back.addEventListener('click', closePanel);
        }
        var senseBtn = el('loc-sense-btn');
        if (senseBtn && !senseBtn.dataset.locInit) {
            senseBtn.dataset.locInit = '1';
            senseBtn.addEventListener('click', function() { getSense(); });
        }
        var askBtn = el('loc-ask-btn');
        if (askBtn && !askBtn.dataset.locInit) {
            askBtn.dataset.locInit = '1';
            askBtn.addEventListener('click', askWhere);
        }
        var prev = el('loc-date-prev');
        if (prev && !prev.dataset.locInit) {
            prev.dataset.locInit = '1';
            prev.addEventListener('click', function() { changeDate(-1); });
        }
        var next = el('loc-date-next');
        if (next && !next.dataset.locInit) {
            next.dataset.locInit = '1';
            next.addEventListener('click', function() { changeDate(1); });
        }
        var autoRow = el('loc-toggle-auto');
        if (autoRow && !autoRow.dataset.locInit) {
            autoRow.dataset.locInit = '1';
            autoRow.addEventListener('click', function() {
                locData.settings.autoSwitch = !locData.settings.autoSwitch;
                if (locData.settings.autoSwitch) {
                    scheduleAutoSwitch();
                    notif('已开启 TA 自动换位', 'success', 1800);
                } else {
                    if (autoTimer) {
                        clearTimeout(autoTimer);
                        autoTimer = null;
                    }
                    locData.nextAutoAt = 0;
                    notif('已关闭 TA 自动换位', 'info', 1800);
                }
                save();
                renderToggles();
            });
        }
        var popupRow = el('loc-toggle-popup');
        if (popupRow && !popupRow.dataset.locInit) {
            popupRow.dataset.locInit = '1';
            popupRow.addEventListener('click', function() {
                locData.settings.switchPopup = !locData.settings.switchPopup;
                notif(locData.settings.switchPopup ? '已开启换位提醒弹窗' : '已关闭换位提醒弹窗', 'info', 1800);
                save();
                renderToggles();
            });
        }
        var popupBtn = el('loc-popup-btn');
        if (popupBtn && !popupBtn.dataset.locInit) {
            popupBtn.dataset.locInit = '1';
            popupBtn.addEventListener('click', hideSwitchPopup);
        }
        var mask = el('loc-popup-mask');
        if (mask && !mask.dataset.locInit) {
            mask.dataset.locInit = '1';
            mask.addEventListener('click', function(e) {
                if (e.target === mask) hideSwitchPopup();
            });
        }
        var exportBtn = el('loc-export-btn');
        if (exportBtn && !exportBtn.dataset.locInit) {
            exportBtn.dataset.locInit = '1';
            exportBtn.addEventListener('click', exportRecords);
        }
        var importBtn = el('loc-import-btn');
        var importInput = el('loc-import-file');
        if (importBtn && !importBtn.dataset.locInit) {
            importBtn.dataset.locInit = '1';
            importBtn.addEventListener('click', function() {
                if (importInput) importInput.click();
            });
        }
        if (importInput && !importInput.dataset.locInit) {
            importInput.dataset.locInit = '1';
            importInput.addEventListener('change', function(e) {
                var f = e.target.files && e.target.files[0];
                if (f) importRecordsFile(f);
                e.target.value = '';
            });
        }
        var clearBtn = el('loc-clear-btn');
        if (clearBtn && !clearBtn.dataset.locInit) {
            clearBtn.dataset.locInit = '1';
            clearBtn.addEventListener('click', clearRecords);
        }
        var tlList = el('loc-timeline-list');
        if (tlList && !tlList.dataset.locInit) {
            tlList.dataset.locInit = '1';
            tlList.addEventListener('click', function(e) {
                var btn = e.target && e.target.closest ? e.target.closest('.loc-tl-del') : null;
                if (!btn) return;
                deleteHistoryAt(parseInt(btn.getAttribute('data-idx'), 10));
            });
        }
    }

    function init() {
        root = el('location-view-root');
        if (!root) return;
        bindStatic();
        render();
        waitForSession(function() {
            migrateLegacy(function() {
                load(function() {
                    render();
                    if (locData.settings.autoSwitch) {
                        var remain = (locData.nextAutoAt || 0) - Date.now();
                        scheduleAutoSwitch(remain > 5000 ? remain : undefined);
                    }
                });
            });
        });
    }

    window.TALocation = {
        sense: getSense,
        reloc: function() { return performAutoSwitch(true); },
        dirFromText: dirFromText,
        data: function() { return locData; },
        save: save
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
