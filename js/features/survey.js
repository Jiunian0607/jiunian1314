/* ============================================================
 * js/features/survey.js — 心意问卷
 * 用户出题 · 我 + 梦角/群成员 共同作答（逐题互相等待）
 * 核心：真实时间戳 Date.now() 驱动节奏，不依赖整数秒 tick
 * ============================================================ */
(function() {
    'use strict';

    // ── 常量 ────────────────────────────────────────────────
    var SV_DEFAULT_DURATION = 120;   // 默认 02:00
    var SV_DEFAULT_EARLY    = 0.15;  // 提前交卷概率
    var SV_DEFAULT_SKIP     = 0.10;  // 未作答概率
    var SV_KEY              = 'surveyRecords';
    var SV_STEP             = 30;    // 时长步进（秒）
    var SV_MIN_DURATION     = 10;    // 最短时长（秒）
    var SV_SAFE_POOL = [
        '这个嘛…', '我想想哦', '当然可以', '看情况~', '因为我在想你呀',
        '你说呢？', '好呀好呀', '哈哈', '嗯嗯', '偷偷告诉你', '随你决定',
        '有你在就很好', '我觉得不错', '再想想', '嘿嘿', '没问题', '先保密',
        '有点期待', '相信你', '都听你的'
    ];

    // ── 状态 ────────────────────────────────────────────────
    var records = [];        // 历史记录
    var draft   = null;      // 创建中的问卷
    var run     = null;      // 进行中的问卷会话
    var viewMode   = 'list'; // list | create | running | detail
    var viewedId   = null;   // 详情查看的记录 id
    var root       = null;

    // ── 工具 ────────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function fmtDur(sec) {
        sec = Math.max(0, Math.ceil(sec));
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    function fmtDate(ts) {
        var d = new Date(ts);
        return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' +
            String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0');
    }
    function el(id) { return document.getElementById(id); }
    function notif(msg, type, dur) {
        if (typeof showNotification === 'function') showNotification(msg, type || 'info', dur || 1800);
    }
    function safePlay(name) {
        if (typeof playSound === 'function') { try { playSound(name); } catch (e) {} }
    }
    function myName() {
        return (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
    }

    function storeKey() {
        if (typeof getStorageKey === 'function') {
            try { return getStorageKey(SV_KEY); } catch (e) { return 'CHAT_APP_V3_' + SV_KEY; }
        }
        return 'CHAT_APP_V3_' + SV_KEY;
    }
    function sidStr() {
        return (typeof SESSION_ID !== 'undefined' && SESSION_ID) ? SESSION_ID : (window.SESSION_ID || 'nosid');
    }
    function rawKey() { return 'SV_RECORDS_' + sidStr(); }
    // 同步主存储（localStorage）+ IndexedDB 镜像（供备份引擎扫描/导入）
    function loadRecords() {
        try {
            var saved = JSON.parse(localStorage.getItem(rawKey()) || 'null');
            if (Array.isArray(saved)) records = saved;
        } catch (e) { records = []; }
        // 兜底：从 IndexedDB 补读（旧版本数据 / 导入引擎写入的键）
        if (typeof safeLoad === 'function') {
            var p = safeLoad(storeKey(), []);
            if (p && typeof p.then === 'function') {
                p.then(function(v) {
                    if (Array.isArray(v) && v.length && JSON.stringify(v) !== JSON.stringify(records)) {
                        records = v;
                        saveRecords();
                        if (root && (viewMode === 'list' || viewMode === 'detail')) renderCurrent();
                    }
                }).catch(function() {});
            }
        }
        if (root && (viewMode === 'list' || viewMode === 'detail')) renderCurrent();
    }
    function saveRecords() {
        try { localStorage.setItem(rawKey(), JSON.stringify(records)); } catch (e) {}
        try {
            if (typeof safeStore === 'function') safeStore(storeKey(), records);
            else localStorage.setItem(storeKey(), JSON.stringify(records));
        } catch (e2) {}
    }

    // ── 联系人候选（梦角 + 群成员） ───────────────────────────
    function getCandidates() {
        var pName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
        var list = [{ id: 'partner', name: pName }];
        (window.groupChatSettings && window.groupChatSettings.members || []).forEach(function(m) {
            list.push({ id: 'gcm_' + (m.id || m.name), name: m.name || '成员' });
        });
        return list;
    }

    // ── 字卡库 ──────────────────────────────────────────────
    function getWordPool() {
        var pool = [];
        if (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) {
            pool = pool.concat(customReplies);
        }
        if (typeof CONSTANTS !== 'undefined' && CONSTANTS.REPLY_MESSAGES && Array.isArray(CONSTANTS.REPLY_MESSAGES)) {
            pool = pool.concat(CONSTANTS.REPLY_MESSAGES);
        }
        pool = pool.map(function(c) {
            if (typeof c === 'string') return c;
            if (c && (c.text || c.replyText || c.content)) return c.text || c.replyText || c.content;
            return String(c);
        }).filter(function(t) { return !!t && String(t).trim().length > 0; });
        return pool.length ? pool : SV_SAFE_POOL.slice();
    }
    function pickCards() {
        var pool = getWordPool();
        var count = 1 + Math.floor(Math.random() * Math.min(6, pool.length));
        var shuffled = pool.slice().sort(function() { return Math.random() - 0.5; });
        return shuffled.slice(0, count).join('，');
    }

    // ── 视图切换 ────────────────────────────────────────────
    function showView(mode, opts) {
        viewMode = mode;
        if (mode === 'detail' && opts) viewedId = opts;
        renderCurrent();
    }
    function renderCurrent() {
        if (!root) return;
        if (viewMode === 'create') renderCreate();
        else if (viewMode === 'running' && run) renderRunning();
        else if (viewMode === 'detail') renderDetail();
        else renderList();
    }

    // ═══ 列表视图 ═══════════════════════════════════════════
    function renderList() {
        var html = '';
        if (run && !run.finished) {
            var remain = Math.max(0, run.endAt - Date.now());
            html += '<div class="sv-banner">' +
                '<span class="sv-banner-icon">⏳</span>' +
                '<div class="sv-banner-text"><b>' + esc(run.survey.title) + '</b> 问卷进行中' +
                '<div class="sv-banner-sub">剩余 ' + fmtDur(remain / 1000) + ' · ' + run.contacts.length + ' 位联系人在作答</div></div>' +
                '<button class="sv-btn" data-act="open-running">查看</button></div>';
        }
        html += '<button class="sv-btn" data-act="create" style="width:100%;padding:12px 0;margin-bottom:14px;"><i class="fas fa-plus"></i> 创建问卷</button>';

        if (!records.length) {
            html += '<div class="sv-empty"><i class="fas fa-clipboard-list"></i><span>还没有问卷记录<br>点击上方按钮创建第一份心意问卷吧~</span></div>';
        } else {
            records.forEach(function(r) {
                html += '<div class="sv-record-card">' +
                    '<div class="sv-record-title">📋 ' + esc(r.title) + '</div>' +
                    '<div class="sv-record-meta">' + fmtDate(r.createdAt) + ' · ' + ((r.contacts || []).length + 1) + ' 人作答 · ' +
                    IntegerDesc(r) + '</div>' +
                    '<div class="sv-record-ops">' +
                    '<button data-act="detail" data-id="' + r.id + '"><i class="fas fa-eye"></i> 详情</button>' +
                    '<button data-act="send-card" data-id="' + r.id + '"><i class="fas fa-paper-plane"></i> 发送到聊天</button>' +
                    '<button class="sv-del-op" data-act="del" data-id="' + r.id + '"><i class="fas fa-trash"></i></button>' +
                    '</div></div>';
            });
        }
        html += '<div class="sv-hint" style="text-align:center;margin:10px 0 4px;">💾 记录已自动保存在本地 · 共 ' + records.length + ' 条 · 全量备份包含问卷数据</div>';
        html += '<button class="sv-btn sv-btn-ghost" data-act="import-backup" style="width:100%;padding:8px 0;margin-bottom:6px;"><i class="fas fa-file-import"></i> 从备份文件恢复问卷记录</button>';
        root.innerHTML = '<div class="survey-view">' + html + '</div>';
    }
    function IntegerDesc(r) {
        var a = r.answers || {};
        var me = r.myAnswers || {};
        var qs = r.questions || [];
        var total = 0, doneCount = 0;
        qs.forEach(function(q, qi) {
            var meAns = me[qi];
            total++;
            if (meAns && (meAns.type === 'option' || meAns.type === 'cards')) doneCount++;
            (r.contacts || []).forEach(function(c) {
                total++;
                var ans = a[c.id] && a[c.id][qi];
                if (ans && (ans.type === 'option' || ans.type === 'cards')) doneCount++;
            });
        });
        return doneCount + '/' + total + ' 条回答';
    }

    // ═══ 创建视图 ═══════════════════════════════════════════
    function newDraft() {
        return {
            title: '',
            contactIds: getCandidates().map(function(c) { return c.id; }),
            questions: [{ id: 'q' + Date.now() + '_0', text: '', options: '' }],
            durTotal: SV_DEFAULT_DURATION,
            earlyRate: SV_DEFAULT_EARLY,
            skipRate: SV_DEFAULT_SKIP
        };
    }
    function renderCreate() {
        if (!draft) draft = newDraft();
        var cands = getCandidates();
        var html = '<div class="survey-view">';

        html += '<label class="sv-label">问卷标题</label>' +
            '<input class="sv-input" id="sv-title" maxlength="30" placeholder="例如：你对我的了解程度测试" value="' + esc(draft.title) + '">';

        html += '<label class="sv-label">选择回答的联系人（多选，我也会参与作答）</label><div class="sv-contact-chips" id="sv-contacts">';
        html += '<span class="sv-chip on"><span class="sv-chip-av">' + esc((myName() || '我').charAt(0)) + '</span>' + esc(myName()) + '</span>';
        cands.forEach(function(c) {
            var on = draft.contactIds.indexOf(c.id) !== -1;
            var initial = esc((c.name || '?').charAt(0));
            html += '<span class="sv-chip' + (on ? ' on' : '') + '" data-act="pick-contact" data-id="' + esc(c.id) + '">' +
                '<span class="sv-chip-av">' + initial + '</span>' + esc(c.name) + '</span>';
        });
        html += '</div>';

        html += '<label class="sv-label">问题列表（动态增删）</label>';
        draft.questions.forEach(function(q, i) {
            var hasOpt = q.options.split(/[,，|｜]/).map(function(x) { return x.trim(); }).filter(Boolean).length > 0;
            html += '<div class="sv-q-item">' +
                '<div class="sv-q-head">' +
                '<span class="sv-q-index">第 ' + (i + 1) + ' 题</span>' +
                '<input class="sv-input sv-q-title-input" data-qi="' + i + '" placeholder="问题内容，如：你觉得我是什么样的人？" value="' + esc(q.text) + '">' +
                '<button class="sv-q-del" data-act="del-q" data-qi="' + i + '">✕</button>' +
                '</div>' +
                '<input class="sv-input sv-q-options" data-qi="' + i + '" placeholder="答案选项（用 ，分隔，留空则该题用字卡回答）" value="' + esc(q.options) + '">' +
                '<span class="sv-q-mode-tag' + (hasOpt ? '' : ' sv-q-mode-card') + '">' + (hasOpt ? 'ABCD 单选题' : '字卡回答题') + '</span>' +
                '</div>';
        });
        html += '<button class="sv-add-q-btn" data-act="add-q"><i class="fas fa-plus"></i> 添加问题</button>';

        html += '<label class="sv-label">开始设置</label><div class="sv-set-grid">';
        html += '<div class="sv-set-cell"><div class="sv-label">作答时间</div>' +
            '<div class="sv-dur-stepper">' +
            '<button class="sv-step-btn" data-act="dur-minus" title="减 30 秒">−</button>' +
            '<div class="sv-dur-display" id="sv-dur-disp">' + fmtDur(draft.durTotal) + '</div>' +
            '<button class="sv-step-btn" data-act="dur-plus" title="加 30 秒">＋</button>' +
            '</div>' +
            '<div class="sv-hint sv-dur-hint">每步 ' + SV_STEP + ' 秒 · 最短 ' + fmtDur(SV_MIN_DURATION) + '</div></div>';
        html += '<div class="sv-set-cell"><div class="sv-label">模拟设置</div>' +
            '<div class="sv-range-row"><span style="font-size:11px;color:var(--text-secondary);width:74px;flex-shrink:0;">提前交卷概率</span>' +
            '<input type="range" id="sv-early" min="0" max="60" step="1" value="' + Math.round(draft.earlyRate * 100) + '">' +
            '<span class="sv-range-val" id="sv-early-val">' + Math.round(draft.earlyRate * 100) + '%</span></div>' +
            '<div class="sv-range-row"><span style="font-size:11px;color:var(--text-secondary);width:74px;flex-shrink:0;">未作答概率</span>' +
            '<input type="range" id="sv-skip" min="0" max="50" step="1" value="' + Math.round(draft.skipRate * 100) + '">' +
            '<span class="sv-range-val" id="sv-skip-val">' + Math.round(draft.skipRate * 100) + '%</span></div>' +
            '</div>';
        html += '</div>';

        html += '<div class="sv-hint" style="margin-top:10px;">💡 填空了「答案选项」的题会模拟单选出答案；没填的题会从「字卡库」随机抽 1–6 张拼成回答。每一题都要等你和我都答完才会进入下一题。</div>';

        html += '<div class="sv-btn-row">' +
            '<button class="sv-btn sv-btn-ghost" data-act="back-list">返回</button>' +
            '<button class="sv-btn" data-act="start">开始问卷 🚀</button>' +
            '</div></div>';
        root.innerHTML = html;

        // 事件绑定
        var title = el('sv-title');
        title.addEventListener('input', function() { draft.title = this.value; });
        var early = el('sv-early'), skip = el('sv-skip');
        early.addEventListener('input', function() {
            draft.earlyRate = parseInt(this.value, 10) / 100;
            el('sv-early-val').textContent = this.value + '%';
        });
        skip.addEventListener('input', function() {
            draft.skipRate = parseInt(this.value, 10) / 100;
            el('sv-skip-val').textContent = this.value + '%';
        });
        root.querySelectorAll('.sv-q-title-input').forEach(function(inp) {
            inp.addEventListener('input', function() { draft.questions[parseInt(this.dataset.qi, 10)].text = this.value; });
        });
        root.querySelectorAll('.sv-q-options').forEach(function(inp) {
            inp.addEventListener('input', function() {
                draft.questions[parseInt(this.dataset.qi, 10)].options = this.value;
                // 实时切换 单选/字卡 模式标识
                var item = inp.closest('.sv-q-item');
                if (item) {
                    var tag = item.querySelector('.sv-q-mode-tag');
                    if (tag) {
                        var hasNow = this.value.split(/[,，|｜]/).map(function(x) { return x.trim(); }).filter(Boolean).length > 0;
                        tag.classList.toggle('sv-q-mode-card', !hasNow);
                        tag.textContent = hasNow ? 'ABCD 单选题' : '字卡回答题';
                    }
                }
            });
        });
    }

    // ═══ 运行逻辑 ═══════════════════════════════════════════
    function buildDeadlines(survey, compressFactor) {
        var n = survey.questions.length;
        var total = survey.durationSec * 1000 * compressFactor;
        var spacing = total / n;
        var dl = [];
        for (var i = 0; i < n; i++) {
            var jitter = (Math.random() * 2 - 1) * spacing * 0.25;
            var t = Math.max(1500, spacing * i + jitter);
            if (i === n - 1) t = Math.min(t, total - Math.min(1000, total * 0.08));
            dl.push(t);
        }
        return dl;
    }
    function startSurvey(survey) {
        var now = Date.now();
        var contacts = survey.contacts.map(function(c) {
            var early = Math.random() < (survey.earlyRate || 0);
            var cf = early ? (0.55 + Math.random() * 0.30) : 1;
            return {
                id: c.id, name: c.name,
                deadlines: buildDeadlines(survey, cf),
                answers: {},      // qi 索引 -> {type, idx|text}
                progress: 0,      // 下一个待处理题 qi
                done: false,
                early: early
            };
        });
        run = {
            survey: survey,
            startedAt: now,
            endAt: now + survey.durationSec * 1000,
            contacts: contacts,
            myAnswers: {},        // 我（用户）的作答：qi -> {type, idx|text, at}
            myCardDraft: {},      // 字卡题输入草稿（重渲染时保留）
            viewQ: 0,             // 当前展示题 qi（全局同步）
            manualUntil: 0,       // 手动游览锁
            finished: false,
            ticker: null,
            timeouts: [],
            finishTimer: null
        };
        _runSig = '';
        contacts.forEach(function(c) {
            c.deadlines.forEach(function(dl, i) {
                run.timeouts.push(setTimeout(function() { processQ(c, i); }, Math.max(0, dl)));
            });
        });
        run.ticker = setInterval(function() { tickRun(); }, 250);
        safePlay('send');
    }

    // 模拟方按节奏逐题作答（自动，不受浏览影响）
    function processQ(c, qi) {
        if (!run || run.finished) return;
        if (c.answers[qi] !== undefined) return;
        var q = run.survey.questions[qi];
        if (!q) return;
        var roll = Math.random();
        if (roll < (run.survey.skipRate || 0)) {
            c.answers[qi] = { type: 'skip', at: Date.now() };
        } else if (q.options && q.options.length) {
            c.answers[qi] = { type: 'option', idx: Math.floor(Math.random() * q.options.length), at: Date.now() };
        } else {
            c.answers[qi] = { type: 'cards', text: pickCards(), at: Date.now() };
        }
        c.progress = Math.max(c.progress, qi + 1);
        var allProcessed = c.deadlines.every(function(d, i) { return c.answers[i] !== undefined; });
        if (allProcessed) c.done = true;
        tickRun();
    }

    // 一道题是否已"双方"全部解决：我 + 所有联系人都有作答（已答或已跳过）
    function qResolved(qi) {
        if (!run) return false;
        if (run.myAnswers[qi] === undefined) return false;
        return run.contacts.every(function(c) { return c.answers[qi] !== undefined; });
    }
    function firstUnresolved(from) {
        if (!run) return 0;
        var n = run.survey.questions.length;
        for (var k = from; k < n; k++) {
            if (!qResolved(k)) return k;
        }
        return n;
    }
    // 我作答后 / 模拟作答后：当前未解决的题解决时就自动切到下一道未解决的题
    function advanceGate() {
        if (!run || run.finished) return;
        var n = run.survey.questions.length;
        if (Date.now() > run.manualUntil && qResolved(run.viewQ)) {
            var next = firstUnresolved(Math.min(run.viewQ + 1, n));
            if (next < n) run.viewQ = Math.max(run.viewQ, next);
        }
    }

    function checkFinishAll() {
        if (!run || run.finished) return;
        var meAll = run.survey.questions.every(function(q, qi) { return run.myAnswers[qi] !== undefined; });
        var contactsDone = run.contacts.every(function(c) { return c.done; });
        if (meAll && contactsDone) {
            var lastAt = Math.max.apply(null, run.contacts.map(function(c) {
                return Math.max(c.deadlines[c.deadlines.length - 1] || 0, 0);
            }));
            setTimeout(function() {
                if (run && !run.finished) finishSurvey('all-done');
            }, Math.max(300, lastAt + 1200 - Date.now()));
        }
    }

    function tickRun() {
        if (!run || run.finished) return;
        var now = Date.now();
        if (now >= run.endAt) {
            run.contacts.forEach(function(c) {
                run.survey.questions.forEach(function(q, qi) {
                    if (c.answers[qi] === undefined) c.answers[qi] = { type: 'skip', at: now };
                });
                c.done = true;
            });
            run.survey.questions.forEach(function(q, qi) {
                if (run.myAnswers[qi] === undefined) run.myAnswers[qi] = { type: 'skip', at: now };
            });
            finishSurvey('time-up');
            return;
        }
        advanceGate();
        checkFinishAll();
        // 仅轻量刷新计时器/进度条，避免 250ms 全量重渲染闪烁
        if (viewMode === 'running') {
            var timerEl = el('sv-timer-val');
            if (timerEl) {
                var remain = (run.endAt - now) / 1000;
                timerEl.textContent = fmtDur(remain);
                timerEl.classList.toggle('sv-timer-warn', remain <= 15);
            }
            var fill = el('sv-progress-fill');
            if (fill) {
                var n = run.survey.questions.length;
                var resolved = run.survey.questions.filter(function(q, qi) { return qResolved(qi); }).length;
                fill.style.width = (n ? Math.round(resolved / n * 100) : 0) + '%';
            }
        }
        // 状态变化（自动答题/自动翻页/联系人完成）时整帧重渲染
        var sig = run.viewQ + '|' + Object.keys(run.myAnswers).length + '|' + run.contacts.map(function(cc) {
            return cc.id + ':' + cc.done + ':' + Object.keys(cc.answers).length;
        }).join(',');
        if (sig !== _runSig) {
            _runSig = sig;
            var modal = el('survey-modal');
            var modalOpen = modal && modal.style.display === 'flex';
            if (modalOpen && viewMode === 'running') renderRunning();
        }
    }
    var _runSig = '';

    function finishSurvey(reason) {
        if (!run || run.finished) return;
        run.finished = true;
        if (run.ticker) clearInterval(run.ticker);
        run.timeouts.forEach(clearTimeout);
        if (run.finishTimer) clearTimeout(run.finishTimer);

        var now = Date.now();
        var record = {
            id: 'sv_' + now,
            title: run.survey.title,
            createdAt: now,
            durationSec: run.survey.durationSec,
            earlyRate: run.survey.earlyRate,
            skipRate: run.survey.skipRate,
            contacts: run.survey.contacts,
            questions: run.survey.questions,
            answers: {}
        };
        run.contacts.forEach(function(c) {
            var map = {};
            run.survey.questions.forEach(function(q, qi) {
                map[qi] = c.answers[qi] !== undefined ? c.answers[qi] : { type: 'skip', at: now };
            });
            record.answers[c.id] = map;
        });
        var myMap = {};
        run.survey.questions.forEach(function(q, qi) {
            myMap[qi] = run.myAnswers[qi] !== undefined ? run.myAnswers[qi] : { type: 'skip', at: now };
        });
        record.myAnswers = myMap;
        if (reason === 'manual') record.manualSubmit = true;
        _runSig = '';
        records.unshift(record);
        saveRecords();
        run = null;
        safePlay('message');
        notif('问卷已完成，已保存记录 ✓', 'success', 2200);
        if (viewMode === 'running') {
            showView('detail', record.id);
        } else { viewMode = 'list'; renderCurrent(); }
    }
    function cancelRun() { // 手动提前结束
        if (!run || run.finished) return;
        finishSurvey('manual');
    }

    // ═══ 运行视图 ═══════════════════════════════════════════
    function optionBlockHtml(opts, ans, letters, interactive) {
        var html = '<div class="sv-opt-list">';
        opts.forEach(function(o, oi) {
            var picked = ans && ans.type === 'option' && ans.idx === oi;
            var cls = 'sv-opt' + (picked ? ' sv-opt-picked' : '') + (interactive && !ans ? '' : ' sv-opt-view');
            var inner = '<span class="sv-opt-letter">' + (letters[oi] || '·') + '</span>' + esc(o) + (picked ? ' ✓' : '');
            if (interactive && !ans) {
                html += '<button class="' + cls + '" data-act="my-answer" data-oi="' + oi + '">' + inner + '</button>';
            } else {
                html += '<div class="' + cls + '">' + inner + '</div>';
            }
        });
        html += '</div>';
        return html;
    }
    function renderRunning() {
        if (!run) return;
        var n = run.survey.questions.length;
        var remain = Math.max(0, run.endAt - Date.now());
        var q = run.survey.questions[Math.min(run.viewQ, n - 1)] || run.survey.questions[0];
        var isOptMode = q && q.options && q.options.length;
        var me = myName();

        var html = '<div class="survey-view">';
        // 参与人状态条
        html += '<div class="sv-tabs" id="sv-tabs">';
        html += '<span class="sv-tab' + ((!qResolved(run.viewQ) && run.myAnswers[run.viewQ] === undefined) ? ' sv-tab-doing' : ' sv-tab-done') + ' sv-tab-me"><span class="sv-tab-dot"></span>' + esc(me) + '</span>';
        run.contacts.forEach(function(cc) {
            var cls = 'sv-tab' + (cc.done ? ' sv-tab-done' : ' sv-tab-doing');
            html += '<span class="' + cls + '"><span class="sv-tab-dot"></span>' + esc(cc.name) + '</span>';
        });
        html += '</div>';

        // 计时 + 进度
        var warn = remain <= 15000;
        html += '<div class="sv-timer-box"><div class="sv-timer' + (warn ? ' sv-timer-warn' : '') + '" id="sv-timer-val">' + fmtDur(remain / 1000) + '</div></div>';
        var resolved = run.survey.questions.filter(function(qq, qi) { return qResolved(qi); }).length;
        var pct = n ? Math.round(resolved / n * 100) : 0;
        html += '<div class="sv-progress-track"><div class="sv-progress-fill" id="sv-progress-fill" style="width:' + pct + '%"></div></div>';
        html += '<div class="sv-progress-meta"><span>第 ' + (q ? (run.viewQ + 1) : 1) + ' / ' + n + ' 题</span><span>完成 ' + resolved + ' / ' + n + '</span></div>';

        // 当前题卡（双方同屏）
        if (q) {
            html += '<div class="sv-q-box">' +
                '<div class="sv-q-num">第 ' + (run.viewQ + 1) + ' 题</div>' +
                '<div class="sv-q-text">' + esc(q.text || '（未填写题面）') + '</div>' +
                '<span class="sv-q-badge">' + (isOptMode ? '单选题' : '字卡题') + '</span>';

            // ── 我 ──
            var myAns = run.myAnswers[run.viewQ];
            html += '<div class="sv-person-block sv-person-me">' +
                '<div class="sv-person-head"><i class="fas fa-user"></i><span>' + esc(me) + '（你）</span>' +
                (myAns ? '<span class="sv-person-state done">已作答 ✓</span>' : '<span class="sv-person-state wait">待你作答</span>') + '</div>';
            if (!myAns) {
                if (isOptMode) {
                    html += optionBlockHtml(q.options, null, 'ABCDEF', true);
                    html += '<div class="sv-hint" style="margin-top:6px;text-align:center;">✏️ 点击选项作答，选定后等待对方完成</div>';
                } else {
                    html += '<div class="sv-my-card-box">' +
                        '<input class="sv-input" id="sv-my-card-input" maxlength="60" placeholder="写下你的回答，字卡模式会由对方随机抽卡…" value="' + esc(run.myCardDraft[run.viewQ] || '') + '">' +
                        '<button class="sv-btn" data-act="my-card-submit" style="width:100%;margin-top:6px;padding:8px 0;">✍️ 提交我的回答</button>' +
                        '</div>';
                }
            } else {
                if (myAns.type === 'option') {
                    html += optionBlockHtml(q.options, myAns, 'ABCDEF', false);
                } else if (myAns.type === 'cards') {
                    html += '<div class="sv-detail-cards" style="margin-top:8px;">✍️ ' + esc(myAns.text) + '</div>';
                }
            }
            html += '</div>';

            // ── 模拟联系人 ──
            run.contacts.forEach(function(c, ci) {
                var cAns = c.answers[run.viewQ];
                html += '<div class="sv-person-block">' +
                    '<div class="sv-person-head"><i class="fas fa-user-circle"></i><span>' + esc(c.name) + '</span>' +
                    (!cAns ? '<span class="sv-person-state wait">' + (ci === 0 ? '回复中…' : '也要等你答') + '</span>'
                        : '<span class="sv-person-state done">已作答 ✓</span>') + '</div>';
                if (!cAns) {
                    html += '<div class="sv-thinking">🧧 思考中…<span class="sv-dots"><span>。</span><span>。</span><span>。</span></span></div>';
                } else if (cAns.type === 'skip') {
                    html += '<div class="sv-detail-na" style="margin-top:8px;">这题未作答（跳过了）</div>';
                } else if (cAns.type === 'option') {
                    html += optionBlockHtml(q.options, cAns, 'ABCDEF', false);
                } else {
                    html += '<div class="sv-detail-cards" style="margin-top:8px;">✨ ' + esc(cAns.text) + '</div>';
                }
                html += '</div>';
            });

            // 等待提示
            var myWait = run.myAnswers[run.viewQ] === undefined;
            var contactsWait = run.contacts.some(function(c) { return c.answers[run.viewQ] === undefined; });
            if (myWait) {
                html += '<div class="sv-wait-note">⏳ 你选好后才会进入下一题…</div>';
            } else if (contactsWait) {
                html += '<div class="sv-wait-note">⏳ 已收到你的答案，等待对方作答后再进入下一题…</div>';
            } else {
                html += '<div class="sv-wait-note ok">✅ 双方已作答完毕，即将进入下一题</div>';
            }
            html += '</div>';
        } else {
            html += '<div class="sv-empty" style="padding:20px;">问卷没有题目</div>';
        }

        // 导航
        html += '<div class="sv-nav-row">' +
            '<button class="sv-btn sv-btn-ghost" data-act="prev-q" ' + (run.viewQ <= 0 ? 'disabled' : '') + '><i class="fas fa-arrow-left"></i> 上一题</button>' +
            '<button class="sv-btn sv-btn-ghost" data-act="skip-q" title="跳到目前待作答的题">⏭ 跳题</button>' +
            '<button class="sv-btn sv-btn-ghost" data-act="next-q" ' + (run.viewQ >= n - 1 ? 'disabled' : '') + '>下一题 <i class="fas fa-arrow-right"></i></button>' +
            '</div>';
        html += '<div class="sv-btn-row"><button class="sv-btn sv-btn-danger" data-act="finish-now">提前结束并结算</button></div>';
        html += '</div>';
        root.innerHTML = html;
        // 字卡输入草稿留存（模拟方作答触发重渲染不丢字）
        var myCardInp = el('sv-my-card-input');
        if (myCardInp) {
            myCardInp.addEventListener('input', function() {
                if (run) run.myCardDraft[run.viewQ] = this.value;
            });
        }
    }

    // ═══ 详情视图 ═══════════════════════════════════════════
    function getRecord(id) {
        return records.filter(function(r) { return String(r.id) === String(id); })[0] || null;
    }
    function renderDetail() {
        var r = getRecord(viewedId);
        if (!r) { viewMode = 'list'; renderCurrent(); return; }
        var qs = r.questions || [];
        var aMap = r.answers || {};
        var myMap = r.myAnswers || {};
        var participants = [{ id: 'me', name: myName() + '（我）', answers: myMap, avatar: 'user' }]
            .concat((r.contacts || []).map(function(c) {
                return { id: c.id, name: c.name, answers: aMap[c.id] || {}, avatar: 'user-circle' };
            }));

        var html = '<div class="survey-view">';
        html += '<div class="sv-detail-head">' +
            '<div class="sv-detail-title">📋 ' + esc(r.title) + '</div>' +
            '<div class="sv-detail-meta">' + fmtDate(r.createdAt) + ' · 时限 ' + fmtDur(r.durationSec) +
            ' · 提前交卷概率 ' + Math.round((r.earlyRate || 0) * 100) + '% · 未作答概率 ' + Math.round((r.skipRate || 0) * 100) + '%' + (r.manualSubmit ? ' · ⚡ 提前结束' : '') + '</div>' +
            '</div>';

        // 参与人作答小结
        html += '<div class="sv-detail-parts">';
        participants.forEach(function(p) {
            var ansCount = qs.filter(function(q, qi) {
                var a = p.answers[qi];
                return a && (a.type === 'option' || a.type === 'cards');
            }).length;
            html += '<div class="sv-detail-part-chip"><i class="fas fa-' + (p.avatar === 'user' ? 'user' : 'user-circle') + '"></i>' +
                esc(p.name) + ' · <b style="color:var(--accent-color);">' + ansCount + '</b> / ' + qs.length + ' 题</div>';
        });
        html += '</div>';

        qs.forEach(function(q, qi) {
            var isOpt = q.options && q.options.length;
            html += '<div class="sv-detail-q">' +
                '<div class="sv-q-num">第 ' + (qi + 1) + ' 题 · ' + (isOpt ? '单选题' : '字卡题') + '</div>' +
                '<div class="sv-q-text">' + esc(q.text || '（无标题）') + '</div>';
            participants.forEach(function(p) {
                var ans = p.answers[qi];
                html += '<div class="sv-detail-a">' +
                    '<i class="fas fa-' + (p.avatar === 'user' ? 'user' : 'user-circle') + '" style="font-size:10px;opacity:.5;margin-right:2px;"></i>' +
                    '<span class="sv-detail-who">' + esc(p.name) + '</span>';
                if (isOpt) {
                    q.options.forEach(function(o, oi) {
                        var picked = ans && ans.type === 'option' && ans.idx === oi;
                        html += '<span class="sv-detail-opt' + (picked ? ' sv-detail-picked' : '') + '">' + esc(o) + '</span>';
                    });
                } else if (ans && ans.type === 'cards') {
                    html += '<span class="sv-detail-cards">✨ ' + esc(ans.text) + '</span>';
                }
                if (!ans || ans.type === 'skip') {
                    html += '<span class="sv-detail-na">未作答</span>';
                }
                html += '</div>';
            });
            html += '</div>';
        });

        html += '<div class="sv-btn-row">' +
            '<button class="sv-btn sv-btn-ghost" data-act="back-list">返回</button>' +
            '<button class="sv-btn" data-act="send-card" data-id="' + esc(r.id) + '"><i class="fas fa-paper-plane"></i> 发送问卷卡片到聊天</button>' +
            '</div></div>';
        root.innerHTML = html;
    }

    // ── 事件委派 ────────────────────────────────────────────
    function onRootClick(e) {
        var t = e.target.closest ? e.target.closest('[data-act]') : null;
        if (!t || !t.dataset) return;
        var act = t.dataset.act;

        if (act === 'create') {
            if (run && !run.finished) { notif('已有问卷进行中，请先等待完成或提前结束', 'warning'); return; }
            draft = newDraft(); showView('create');
        }
        else if (act === 'back-list') { draft = null; viewMode = 'list'; renderCurrent(); }
        else if (act === 'pick-contact') {
            var cid = t.dataset.id;
            var i = draft.contactIds.indexOf(cid);
            if (i === -1) draft.contactIds.push(cid);
            else draft.contactIds.splice(i, 1);
            renderCreate();
        }
        else if (act === 'add-q') {
            draft.questions.push({ id: 'q' + Date.now() + '_' + draft.questions.length, text: '', options: '' });
            renderCreate();
        }
        else if (act === 'del-q') {
            var qi = parseInt(t.dataset.qi, 10);
            if (draft.questions.length <= 1) { notif('至少保留一道题', 'warning'); return; }
            draft.questions.splice(qi, 1);
            renderCreate();
        }
        else if (act === 'dur-minus' || act === 'dur-plus') {
            var delta = act === 'dur-plus' ? SV_STEP : -SV_STEP;
            draft.durTotal = Math.max(SV_MIN_DURATION, Math.min(3600, draft.durTotal + delta));
            var disp = el('sv-dur-disp');
            if (disp) disp.textContent = fmtDur(draft.durTotal);
            var hint = root.querySelector('.sv-dur-hint');
            if (hint) hint.textContent = '每步 ' + SV_STEP + ' 秒 · 最短 ' + fmtDur(SV_MIN_DURATION);
        }
        else if (act === 'start') { tryStart(); }
        else if (act === 'open-running') {
            if (run && !run.finished) { viewMode = 'running'; renderRunning(); }
            else { viewMode = 'list'; renderCurrent(); }
        }
        else if (act === 'my-answer') {
            if (!run) return;
            var qiA = run.viewQ;
            if (run.myAnswers[qiA] !== undefined) return;
            var qA = run.survey.questions[qiA];
            if (!qA || !qA.options || !qA.options.length) return;
            var oi = parseInt(t.dataset.oi, 10);
            run.myAnswers[qiA] = { type: 'option', idx: oi, at: Date.now() };
            safePlay('mood');
            advanceGate();
            renderRunning();
            checkFinishAll();
        }
        else if (act === 'my-card-submit') {
            if (!run) return;
            var qiB = run.viewQ;
            if (run.myAnswers[qiB] !== undefined) return;
            var inp = el('sv-my-card-input');
            var val = inp ? inp.value.trim() : '';
            var qB = run.survey.questions[qiB];
            if (!qB) return;
            if (qB.options && qB.options.length) return; // 该题是单选模式
            if (!val) { notif('写一句你的回答再提交吧~', 'warning'); return; }
            run.myAnswers[qiB] = { type: 'cards', text: val, at: Date.now() };
            safePlay('send');
            advanceGate();
            renderRunning();
            checkFinishAll();
        }
        else if (act === 'prev-q' || act === 'next-q' || act === 'skip-q') {
            if (!run) return;
            var n2 = run.survey.questions.length;
            run.manualUntil = Date.now() + 4000;
            if (act === 'prev-q') {
                run.viewQ = Math.max(0, run.viewQ - 1);
            } else if (act === 'next-q') {
                var F = firstUnresolved(0);
                if (run.viewQ + 1 > F) {
                    if (run.viewQ + 1 >= n2) notif('已经是最后一题', 'info', 1200);
                    else notif('双方都作答后才会进入下一题', 'warning', 1600);
                } else {
                    run.viewQ = Math.min(n2 - 1, run.viewQ + 1);
                }
            } else { // 跳题 = 跳到目前待作答的题
                var F2 = firstUnresolved(0);
                if (F2 >= n2) {
                    notif('所有题都已作答完毕', 'info', 1400);
                } else {
                    run.viewQ = Math.min(F2, n2 - 1);
                }
            }
            renderRunning();
        }
        else if (act === 'finish-now') {
            cancelRun();
        }
        else if (act === 'detail') {
            var rid = t.dataset.id;
            showView('detail', rid);
        }
        else if (act === 'send-card') { sendRecordCard(t.dataset.id); }
        else if (act === 'del') {
            delRecord(t.dataset.id);
        }
        else if (act === 'import-backup') {
            var inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.json,.zip,application/json,application/zip';
            inp.onchange = function(ev) {
                var f = ev.target.files && ev.target.files[0];
                if (f) importSurveyRecordsFromFile(f);
            };
            inp.click();
        }
    }

    // ═══ 从备份文件恢复问卷记录（独立于全量备份的分类选择） ═════
    async function importSurveyRecordsFromFile(file) {
        if (file.size > 220 * 1024 * 1024) { notif('文件过大，请检查是否为正确的备份文件', 'error'); return; }
        var data = null;
        try {
            if (typeof ChatBackup !== 'undefined' && ChatBackup.loadBackupFromFile) {
                data = await ChatBackup.loadBackupFromFile(file);
            } else {
                var text = await file.text();
                data = JSON.parse(text);
            }
        } catch (err) {
            notif('无法解析备份文件', 'error', 2600);
            return;
        }
        var list = (data && Array.isArray(data.surveyRecords)) ? data.surveyRecords : null;
        console.log('[survey] 备份文件字段 surveyRecords:', list ? list.length + ' 条' : '无');
        if (!list && data) {
            var lf = data.localforage || data.indexedDB || {};
            var ks = Object.keys(lf);
            for (var i = 0; i < ks.length; i++) {
                if (ks[i].indexOf('surveyRecords') !== -1 && Array.isArray(lf[ks[i]])) { list = lf[ks[i]]; console.log('[survey] 从 localforage 键找到:', ks[i], list.length + ' 条'); break; }
            }
            if (!list && data.localStorage) {
                for (var k in data.localStorage) {
                    if (Object.prototype.hasOwnProperty.call(data.localStorage, k) && k.indexOf('surveyRecords') !== -1) {
                        try {
                            var v = JSON.parse(data.localStorage[k]);
                            if (Array.isArray(v)) { list = v; console.log('[survey] 从 localStorage 键找到:', k, v.length + ' 条'); break; }
                        } catch (e2) {}
                    }
                }
            }
        }
        if (!list) { notif('备份文件中没有找到问卷记录', 'warning', 2600); return; }
        if (run && !run.finished) { notif('已有问卷进行中，请先完成或提前结束再导入', 'warning'); return; }
        if (records.length !== 0 && typeof confirm === 'function' && !confirm('将用备份中的 ' + list.length + ' 条记录覆盖当前的 ' + records.length + ' 条？')) return;
        records = list;
        if (viewMode !== 'list') viewMode = 'list';
        saveRecords();
        renderCurrent();
        notif('已恢复 ' + list.length + ' 条问卷记录 ✓', 'success', 2400);
    }

    function tryStart() {
        if (run && !run.finished) { notif('已有问卷进行中，请先等待完成或提前结束', 'warning'); return; }
        var title = (draft.title || '').trim();
        if (!title) { notif('请先填写问卷标题', 'warning'); return; }
        if (!draft.contactIds.length) { notif('请至少选择一位联系人', 'warning'); return; }
        var qs = [];
        for (var i = 0; i < draft.questions.length; i++) {
            var q = draft.questions[i];
            var text = (q.text || '').trim();
            if (!text) { notif('第 ' + (i + 1) + ' 题缺少问题内容', 'warning'); return; }
            var opts = q.options.split(/[,，|｜]/).map(function(x) { return x.trim(); }).filter(Boolean);
            if (opts.length === 1) { notif('第 ' + (i + 1) + ' 题选项过少（单选需要 2 个及以上，用 ，分隔）', 'warning'); return; }
            qs.push({ id: q.id, text: text, options: opts });
        }
        var durSec = draft.durTotal;
        if (durSec < SV_MIN_DURATION) { notif('最短作答时间为 ' + SV_MIN_DURATION + ' 秒', 'warning'); return; }
        var cand = getCandidates();
        var contacts = draft.contactIds.map(function(id) {
            var found = cand.filter(function(c) { return c.id === id; })[0];
            return { id: id, name: found ? found.name : id };
        });
        var survey = {
            title: title,
            contacts: contacts,
            questions: qs,
            durationSec: durSec,
            earlyRate: draft.earlyRate,
            skipRate: draft.skipRate
        };
        draft = null;
        startSurvey(survey);
        viewMode = 'running';
        renderRunning();
    }

    function delRecord(id) {
        if (typeof confirm === 'function' && !confirm('确定删除该问卷记录吗？')) return;
        records = records.filter(function(r) { return String(r.id) !== String(id); });
        saveRecords();
        notif('问卷记录已删除', 'success');
        viewMode = 'list';
        renderCurrent();
    }

    // ═══ 发送问卷卡片到聊天 ══════════════════════════════════
    function sendRecordCard(id) {
        var r = getRecord(id);
        if (!r) return;
        if (typeof addMessage !== 'function') { notif('聊天模块未就绪', 'warning'); return; }
        addMessage({
            id: Date.now(),
            sender: 'user',
            text: '',
            timestamp: new Date(),
            status: 'sent',
            type: 'survey-card',
            survey: r,
            favorited: false,
            note: null
        });
        safePlay('send');
        notif('问卷卡片已发送到聊天 ✓', 'success', 2200);
        if (viewMode === 'detail') { viewMode = 'list'; renderCurrent(); }
    }

    // ── 聊天卡片渲染（包装 createMessageFragment） ────────────
    function buildSurveyCardFragment(msg, prevMsg, lastSenderRef) {
        var frag = document.createDocumentFragment();
        var wrap = document.createElement('div');
        wrap.className = 'survey-chat-card-wrap';
        var d = msg.survey || {};
        var qs = d.questions || [];
        var answers = d.answers || {};
        var myAnswers = d.myAnswers || {};
        var participants = [
            { id: 'me', name: myName() + '（我）', answers: myAnswers }
        ].concat((d.contacts || []).map(function(c) {
            return { id: c.id, name: c.name, answers: answers[c.id] || {} };
        }));
        var html = '<div class="survey-chat-card">' +
            '<div class="survey-card-head"><span class="survey-card-emoji">📋</span><span class="survey-card-title">心意问卷 · ' + esc(d.title || '') + '</span></div>';
        qs.forEach(function(q, qi) {
            html += '<div class="survey-card-q"><b>Q' + (qi + 1) + '.</b> ' + esc(q.text || '') + '</div>';
            participants.forEach(function(p) {
                var a = p.answers[qi];
                var ansHtml;
                if (!a || a.type === 'skip') {
                    ansHtml = '<span class="survey-card-na">未作答</span>';
                } else if (a.type === 'option') {
                    ansHtml = '<span class="survey-card-ans">' + esc((q.options || [])[a.idx] || '') + '</span>';
                } else {
                    ansHtml = '<span class="survey-card-ans">' + esc(a.text || '') + '</span>';
                }
                html += '<div class="survey-card-a"><span class="survey-card-who">' + esc(p.name || '') + '</span>' + ansHtml + '</div>';
            });
        });
        html += '<div class="sv-hint" style="font-size:10px;opacity:.6;margin-top:6px;">— 心意问卷 · ' + fmtDate(d.createdAt) + ' —</div>';
        html += '</div>';
        wrap.innerHTML = html;
        frag.appendChild(wrap);
        if (lastSenderRef) lastSenderRef.current = 'system';
        return frag;
    }
    (function wrapMsgRenderer() {
        var orig = window.createMessageFragment;
        if (typeof orig !== 'function') return;
        window.createMessageFragment = function(msg, prevMsg, nextMsg, lastSenderRef) {
            if (msg && msg.type === 'survey-card') {
                return buildSurveyCardFragment(msg, prevMsg, lastSenderRef);
            }
            return orig(msg, prevMsg, nextMsg, lastSenderRef);
        };
    })();

    // ── 备份联动（全量备份导出/恢复使用） ─────────────────────
    window.callSurveyBackup = function(mode, data) {
        if (mode === 'export-data') return records.slice();
        if (mode === 'restore-data') {
            var before = records.length;
            if (Array.isArray(data)) records = data;
            else loadRecords();
            saveRecords();
            if (viewMode === 'list' || viewMode === 'detail') renderCurrent();
            notif('已恢复 ' + records.length + ' 条问卷记录 ✓', 'success', 2200);
            return true;
        }
        return null;
    };

    // ── 初始化 ──────────────────────────────────────────────
    function init() {
        root = el('survey-view-root');
        if (!root) return;
        loadRecords();
        root.addEventListener('click', onRootClick);

        var entry = el('survey-function');
        if (entry) {
            entry.addEventListener('click', function() {
                var adv = el('advanced-modal');
                if (adv && typeof hideModal === 'function') hideModal(adv);
                setTimeout(function() {
                    var modal = el('survey-modal');
                    if (modal && typeof showModal === 'function') showModal(modal);
                    if (run && !run.finished) viewMode = 'running';
                    else viewMode = 'list';
                    renderCurrent();
                }, 150);
            });
        }
        var closeBtn = el('close-survey-modal');
        if (closeBtn) {
            closeBtn.innerHTML = '<i class="fas fa-arrow-left"></i> 返回';
            closeBtn.addEventListener('click', function() {
                var modal = el('survey-modal');
                if (modal && typeof hideModal === 'function') hideModal(modal);
                setTimeout(function() {
                    var adv = el('advanced-modal');
                    if (adv && typeof showModal === 'function') showModal(adv);
                }, 320);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
