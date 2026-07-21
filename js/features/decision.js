// js/features/decision.js（修改后）
let _askMeBoost = {};
let _askMeBoostChance = {};
let _reverseQShowing = false;

function askMeChance(who) {
    return (_askMeBoost[who] && Date.now() < _askMeBoost[who]) ? (_askMeBoostChance[who] || 0.03) : 0.005;
}

function addAskMeBoost(who) {
    if (_askMeBoost[who] && Date.now() < _askMeBoost[who]) {
        _askMeBoostChance[who] = Math.min(0.60, (_askMeBoostChance[who] || 0.03) + 0.025);
    } else {
        _askMeBoost[who] = Date.now() + 3600000;
        _askMeBoostChance[who] = 0.03;
    }
}

function pickMultiOptions(arr, maxPick) {
    const max = Math.min(maxPick || 1, arr.length);
    const count = 1 + Math.floor(Math.random() * max);
    const shuffled = arr.slice().sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function singleDecideYesNo(question, onReply) {
    const min = parseInt(settings?.replyDelayMin || 3000);
    const max = parseInt(settings?.replyDelayMax || 7000);
    const delay = min + Math.random() * (max - min);
    setTimeout(() => {
        const r = Math.random();
        const ans = r < 0.4 ? '是' : (r < 0.8 ? '否' : '半对');
        onReply(`关于“${question}”，我的决定是：${ans}`);
    }, delay);
}

function singleDecideCustom(options, maxPick, onReply) {
    const min = parseInt(settings?.replyDelayMin || 3000);
    const max = parseInt(settings?.replyDelayMax || 7000);
    const delay = min + Math.random() * (max - min);
    setTimeout(() => {
        const picks = pickMultiOptions(options, maxPick);
        const text = picks.length ? `我选：${picks.join('、')}` : '这个我不选~你定吧';
        onReply(text);
    }, delay);
}

function gcAskYesNo(question, memberIds, onResults) {
    const members = window.groupChatSettings?.members || [];
    const selected = members.filter(m => memberIds.includes(String(m.id)));
    const delay = 2000 + Math.random() * 3000;
    const chatContainer = document.getElementById('chat-container');
    // 在群聊中显示用户的问题
    if (typeof addMessage === 'function') {
        addMessage({
            id: Date.now(),
            sender: 'system',
            text: '👥 【群聊决策】' + question,
            timestamp: new Date(),
            type: 'system'
        });
    }
    setTimeout(() => {
        selected.forEach((mem, index) => {
            setTimeout(() => {
                const r = Math.random();
                const ans = r < 0.4 ? '是' : (r < 0.8 ? '否' : '半对');
                if (typeof addMessage === 'function') {
                    addMessage({
                        id: Date.now() + index,
                        sender: 'system',
                        text: '👥 ' + mem.name + ' 的决定：' + ans,
                        timestamp: new Date(),
                        type: 'system'
                    });
                }
                if (index === selected.length - 1 && onResults) {
                    onResults(selected.map(m => ({ name: m.name, answer: '已回复' })));
                }
            }, index * 800 + Math.random() * 600);
        });
    }, delay);
}

function gcAskCustom(options, maxPick, memberIds, onResults) {
    const members = window.groupChatSettings?.members || [];
    const selected = members.filter(m => memberIds.includes(String(m.id)));
    const delay = 2000 + Math.random() * 3000;
    if (typeof addMessage === 'function') {
        addMessage({
            id: Date.now(),
            sender: 'system',
            text: '👥 【群聊决策】从以下选项选择（最多' + maxPick + '个）：' + options.join(' / '),
            timestamp: new Date(),
            type: 'system'
        });
    }
    setTimeout(() => {
        selected.forEach((mem, index) => {
            setTimeout(() => {
                const picks = pickMultiOptions(options, maxPick);
                const answer = picks.length ? picks.join('、') : '这个我不选~';
                if (typeof addMessage === 'function') {
                    addMessage({
                        id: Date.now() + index,
                        sender: 'system',
                        text: '👥 ' + mem.name + ' 选择了：' + answer,
                        timestamp: new Date(),
                        type: 'system'
                    });
                }
                if (index === selected.length - 1 && onResults) {
                    onResults(selected.map(m => ({ name: m.name, answer: '已选择' })));
                }
            }, index * 800 + Math.random() * 600);
        });
    }, delay);
}

function showReverseQuestion(askerName, question, who, onAnswer) {
    if (_reverseQShowing) return;
    _reverseQShowing = true;
    const overlay = document.createElement('div');
    overlay.className = 'reverse-question-overlay';
    overlay.innerHTML = `
        <div class="reverse-question-box">
            <div class="reverse-question-asker">${askerName} 想问你</div>
            <div class="reverse-question-text">${question}</div>
            <div class="reverse-question-btns">
                <button data-answer="是">是</button>
                <button data-answer="多半">多半</button>
                <button data-answer="否">否</button>
            </div>
            <!-- ===== 新增自定义输入框 ===== -->
            <div class="reverse-question-custom" style="margin-top: 15px; border-top: 1px solid rgba(0,0,0,0.15); padding-top: 12px;">
                <div style="font-size:12px; color:var(--text-secondary); margin-bottom:6px;">✍️ 自定义回答</div>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="reverse-custom-input" placeholder="输入你的回答..." style="flex:1; padding:8px 12px; border-radius:10px; border:1px solid var(--border-color); background:var(--primary-bg); color:var(--text-primary); outline:none; font-size:14px; font-family:var(--font-family);">
                    <button id="reverse-custom-send" style="padding:8px 16px; background:var(--accent-color); color:#fff; border:none; border-radius:10px; cursor:pointer; font-weight:600; font-family:var(--font-family);">发送</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // 快捷按钮事件
    overlay.querySelectorAll('.reverse-question-btns button').forEach(btn => {
        btn.addEventListener('click', function() {
            const ans = this.dataset.answer;
            overlay.remove();
            _reverseQShowing = false;
            onAnswer(ans);
        });
    });

    // ===== 新增：自定义输入框事件 =====
    const customInput = overlay.querySelector('#reverse-custom-input');
    const customSend = overlay.querySelector('#reverse-custom-send');
    if (customInput && customSend) {
        const sendCustom = function() {
            const val = customInput.value.trim();
            if (!val) return; // 空输入不处理
            overlay.remove();
            _reverseQShowing = false;
            onAnswer(val);
        };
        customSend.addEventListener('click', sendCustom);
        customInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendCustom();
            }
        });
        // 自动聚焦输入框
        setTimeout(function() { customInput.focus(); }, 100);
    }
}
// 暴露到全局
window.askMeChance = askMeChance;
window.addAskMeBoost = addAskMeBoost;
window.showReverseQuestion = showReverseQuestion;
window.getAskMeBoostHint = getAskMeBoostHint;
window.singleDecideYesNo = singleDecideYesNo;
window.singleDecideCustom = singleDecideCustom;
window.gcAskYesNo = gcAskYesNo;
window.gcAskCustom = gcAskCustom;