/* 撤回模拟体系：梦角回复后按概率「撤回消息」
 *  - 撤回概率 recallChance（默认 15%）：TA 每条回复有概率被撤回
 *  - 撤回后补发概率 recallResendChance（默认 25%）：撤回后有机会再补发一条新消息
 *  - 撤回形式：整条撤回(all) / 局部撤回多段(partial) / 情绪字卡撤回(emotion)
 *  - 所有撤回提示均可点击展开/收起原文
 */

(function() {
    function _clamp(v, min, max) { v = Number(v); if (isNaN(v)) v = min; return Math.max(min, Math.min(max, v)); }

    function _cfg() {
        return {
            enabled: settings.recallEnabled !== false,
            chance: _clamp(settings.recallChance, 0, 100),
            resendChance: _clamp(settings.recallResendChance, 0, 100)
        };
    }

    /* 纯文本消息按空白拆分为「段」（多字卡回复以空格拼接） */
    function _getSegments(text) {
        if (!text) return [];
        return String(text).split(/\s+/).map(function(s) { return s.trim(); }).filter(Boolean);
    }
    window._recallGetSegments = _getSegments;

    function _getEmotionCards(msg) {
        if (!msg) return [];
        if (Array.isArray(msg.emotionCards) && msg.emotionCards.length) return msg.emotionCards;
        if (msg.emotionCard) return [msg.emotionCard];
        return [];
    }

    function _isPoke(msg) { return !!msg.isPoke; }

    /* ── 调度：新消息到达后滚一次概率 ── */
    window._recallTrySchedule = function(msg) {
        try {
            const c = _cfg();
            if (!c.enabled || c.chance <= 0) return;
            if (!msg || msg.recall) return;
            if (msg.isResend) return;                 // 补发消息不再触发递归撤回
            if (msg.sender === 'user') return;        // 只撤梦角/对方发出的
            if (msg.type === 'system' && !_isPoke(msg)) return; // 普通系统消息不撤（拍一拍除外）
            if (msg.sender !== 'user' && typeof window.getGroupMemberForMessage === 'function') {
                try { if (window.getGroupMemberForMessage(msg.id)) return; } catch (e) {}
            }
            if (Math.random() * 100 >= c.chance) return;
            const delay = 1500 + Math.random() * 4500; // 消息出现 1.5~6s 后被撤回
            setTimeout(function() { window._recallApplyById(msg.id); }, delay);
        } catch (e) { console.warn('[recall] 调度失败:', e); }
    };

    /* ── 执行撤回（数据 + DOM）── */
    window._recallApplyById = function(id) {
        try {
            const c = _cfg();
            if (!c.enabled || c.chance <= 0) return;
            const msg = messages.find(function(m) { return String(m.id) === String(id); });
            if (!msg || msg.recall) return;
            if (msg.sender === 'user') return;
            if (msg.type === 'system' && !_isPoke(msg)) return;

            const segs = _getSegments(msg.text);
            const emo = _getEmotionCards(msg);
            const canPartial = segs.length >= 2 && !!msg.text && !msg.image;   // 纯文本且多段
            const canEmotion = emo.length >= 1;

            // 形式权重：整条撤回恒可触发；多段文本可局部撤回；带情绪字卡可撤字卡
            const opts = [];
            opts.push({ t: 'all', w: 45 });
            if (canPartial) opts.push({ t: 'partial', w: 30 });
            if (canEmotion) opts.push({ t: 'emotion', w: 25 });
            let total = 0;
            opts.forEach(function(o) { total += o.w; });
            let roll = Math.random() * total;
            let type = 'all';
            for (let i = 0; i < opts.length; i++) {
                roll -= opts[i].w;
                if (roll < 0) { type = opts[i].t; break; }
            }

            if (type === 'partial') {
                const maxCount = Math.max(1, segs.length - 1);               // 至少保留 1 段
                const pickCount = Math.min(3, maxCount);
                const count = 1 + Math.floor(Math.random() * pickCount);
                const avail = segs.map(function(_, i) { return i; });
                const chosen = [];
                for (let k = 0; k < count && avail.length; k++) {
                    const idx = avail.splice(Math.floor(Math.random() * avail.length), 1)[0];
                    chosen.push(idx);
                }
                msg.recall = { type: 'partial', segments: chosen.sort(function(a, b) { return a - b; }) };
            } else if (type === 'emotion') {
                const pickCount = Math.min(2, emo.length);
                const count = 1 + Math.floor(Math.random() * pickCount);
                const avail = emo.map(function(_, i) { return i; });
                const chosen = [];
                for (let k = 0; k < count && avail.length; k++) {
                    const idx = avail.splice(Math.floor(Math.random() * avail.length), 1)[0];
                    chosen.push(idx);
                }
                msg.recall = { type: 'emotion', emotion: chosen.sort(function(a, b) { return a - b; }) };
            } else {
                msg.recall = { type: 'all' };
            }

            if (typeof throttledSaveData === 'function') throttledSaveData();
            if (typeof renderMessages === 'function') renderMessages(true);

            // 撤回后按概率补发一条新消息
            if (Math.random() * 100 < c.resendChance) window._recallScheduleResend(msg);
        } catch (e) { console.warn('[recall] 执行撤回时出错:', e); }
    };

    /* ── 撤回后补发：重新走一轮「打字中 → 新回复」 ── */
    window._recallScheduleResend = function(origMsg) {
        const delay = 1800 + Math.random() * 4200;
        setTimeout(function() {
            try {
                const text = _pickResendText();
                if (!text) return;

                var _tiW = document.getElementById('typing-indicator-wrapper');
                if (settings.typingIndicatorEnabled && _tiW) {
                    var tiLabel = document.getElementById('typing-indicator-label');
                    if (tiLabel) tiLabel.textContent = (settings.partnerName || '对方') + ' 正在输入';
                    if (typeof positionTypingIndicator === 'function') positionTypingIndicator();
                    _tiW.style.display = 'block';
                }

                setTimeout(function() {
                    addMessage({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        sender: settings.partnerName || '对方',
                        text: text,
                        timestamp: new Date(),
                        status: 'received',
                        favorited: false,
                        note: null,
                        type: 'normal',
                        isResend: true
                    });
                    if (typeof playSound === 'function') playSound('message');
                    if (typeof window._sendPartnerNotification === 'function') {
                        window._sendPartnerNotification(settings.partnerName || '对方', text);
                    }
                    // 收起「正在输入」
                    try {
                        if (window._typingIndicatorAutoHideTimer) { clearTimeout(window._typingIndicatorAutoHideTimer); window._typingIndicatorAutoHideTimer = null; }
                    } catch (e2) {}
                    var _tiW2 = document.getElementById('typing-indicator-wrapper');
                    if (_tiW2) {
                        var _tiInner2 = _tiW2.querySelector('.typing-indicator');
                        if (_tiInner2) {
                            _tiInner2.classList.add('hiding');
                            setTimeout(function() { _tiW2.style.display = 'none'; if (_tiInner2) _tiInner2.classList.remove('hiding'); }, 240);
                        } else { _tiW2.style.display = 'none'; }
                    }
                }, 900 + Math.random() * 1600);
            } catch (e) { console.warn('[recall] 补发失败:', e); }
        }, delay);
    };

    /* 补发文案：与主回复同一套抽取逻辑（排除已屏蔽/禁用分组项） */
    function _pickResendText() {
        try {
            let disabledItems = new Set();
            try {
                const raw = localStorage.getItem('disabledReplyItems');
                if (raw) disabledItems = new Set(JSON.parse(raw));
            } catch (e) {}
            const disabledGroupItems = new Set();
            (window.customReplyGroups || []).forEach(function(g) {
                if (g.disabled && Array.isArray(g.items)) g.items.forEach(function(it) { disabledGroupItems.add(it); });
            });
            const pool = (customReplies || [])
                .filter(function(r) { return !disabledItems.has(r) && !disabledGroupItems.has(r); })
                .map(function(r) { return String(r || '').trim(); })
                .filter(Boolean);
            if (!pool.length) return null;
            return pool[Math.floor(Math.random() * pool.length)];
        } catch (e) { return null; }
    }

    /* ── 胶囊点击：展开/收起被撤回的原文 ── */
    window._recallToggleCapsule = function(capsule) {
        if (!capsule) return;
        const wrap = capsule.closest ? capsule.closest('.recall-capsule-wrap') : null;
        if (!wrap) return;
        const original = wrap.querySelector('.recall-original');
        capsule.classList.toggle('open');
        if (original) {
            const isEmotionRow = original.classList.contains('emotion-cards-row');
            original.style.display = original.style.display === 'none' ? (isEmotionRow ? 'flex' : 'block') : 'none';
        }
    };
})();
