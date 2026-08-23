/* 情绪字卡体系：情绪字卡(💭) / 心意字卡(❤️) / 交流意图字卡(💬)
 * 梦角回复时（仅组内第一条消息）按概率附带独立小卡片
 * 核心机制：
 *  - 触发概率：情绪 70%、心意 40%、意图 20%（连续触发递减 emotionStreak）
 *  - 稀有度：普通 80% / 稀有 15% / 特殊 5%
 *  - 关联映射：情绪→心意（_emotionToHeartMapping）、心意→意图（_heartToIntentMapping）
 *  - 冷却：24h 内特殊字卡不重复、最近 5 条字卡去重 */
(function() {
    'use strict';

    /* ============================================================
     * 常量与默认数据
     * ============================================================ */
    var STREAK_DECAY = 0.5;
    var MIN_CHANCE = 5;
    var MAX_STREAK = 6;
    var SPECIAL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h
    var RECENT_DEDUPE_SIZE = 5;

    var RARITY_KEYS = ['common', 'rare', 'special'];
    var RARITY_LABEL = ['普通', '稀有', '特殊'];
    var RARITY_WEIGHTS = [80, 15, 5];

    function _mk(t, r, lv) { return { t: t, r: r || 0, lv: lv || 0 }; }

    function _emotionDefaults() {
        return { groups: [
            { id: 'joy',         name: '喜悦与正向',   icon: '🥰', weight: 30, enabled: true, items: [
                _mk('开心'), _mk('快乐'), _mk('愉悦'), _mk('高兴'), _mk('满足'), _mk('幸福'), _mk('安心'), _mk('放松'),
                _mk('轻松'), _mk('温暖'), _mk('舒心'), _mk('欣慰'), _mk('愉快'), _mk('期待'), _mk('兴奋'), _mk('惊喜'),
                _mk('雀跃', 1), _mk('充实'), _mk('踏实'), _mk('幸运'), _mk('庆幸'), _mk('感激'), _mk('感动'), _mk('欣喜'),
                _mk('释然', 2)
            ]},
            { id: 'affection',   name: '亲近与爱意',   icon: '❤️', weight: 20, enabled: true, items: [
                _mk('喜欢'), _mk('在意'), _mk('珍惜'), _mk('信任'), _mk('依赖'), _mk('亲近'), _mk('眷恋', 1), _mk('想念'),
                _mk('思念'), _mk('牵挂'), _mk('心软'), _mk('心疼'), _mk('怜惜'), _mk('宠溺', 1), _mk('偏爱'), _mk('包容'),
                _mk('纵容', 1), _mk('依恋'), _mk('舍不得', 1), _mk('想靠近'), _mk('想陪伴'), _mk('想照顾'), _mk('想保护'),
                _mk('想了解'), _mk('想回应')
            ]},
            { id: 'neutral',     name: '中性与日常',   icon: '🍃', weight: 15, enabled: true, items: [
                _mk('普通'), _mk('平常'), _mk('淡然'), _mk('随意'), _mk('自然'), _mk('放空'), _mk('发呆'), _mk('安静'),
                _mk('专注'), _mk('认真'), _mk('观察'), _mk('等待'), _mk('好奇'), _mk('期待中'), _mk('没有特别情绪')
            ]},
            { id: 'thinking',    name: '思考与复杂情绪', icon: '🧠', weight: 10, enabled: true, items: [
                _mk('疑惑'), _mk('困惑'), _mk('好奇'), _mk('惊讶'), _mk('意外'), _mk('震惊'), _mk('犹豫'), _mk('纠结'),
                _mk('矛盾'), _mk('迟疑'), _mk('怀疑'), _mk('不确定'), _mk('复杂'), _mk('说不清'), _mk('想不明白', 2),
                _mk('若有所思', 1), _mk('沉思'), _mk('认真'), _mk('专注')
            ]},
            { id: 'shy',         name: '害羞与社交情绪', icon: '🙈', weight: 6, enabled: true, items: [
                _mk('害羞'), _mk('不好意思'), _mk('脸红'), _mk('羞涩'), _mk('尴尬'), _mk('拘谨'), _mk('腼腆'),
                _mk('害臊', 1), _mk('紧张'), _mk('小心翼翼'), _mk('不自然'), _mk('犹豫'), _mk('迟疑'), _mk('想说又停下')
            ]},
            { id: 'restraint',   name: '克制与隐藏',   icon: '🖤', weight: 8, enabled: true, items: [
                _mk('平静'), _mk('冷静'), _mk('克制'), _mk('忍耐'), _mk('沉默'), _mk('压下情绪'), _mk('隐藏情绪'),
                _mk('假装平静', 2), _mk('表面平静'), _mk('心里在意'), _mk('偷偷开心', 1), _mk('偷偷难过', 1),
                _mk('默默期待', 1), _mk('默默守护', 1), _mk('不愿表达'), _mk('不知道怎么说', 2)
            ]},
            { id: 'sad',         name: '悲伤与低落',   icon: '💧', weight: 4, enabled: true, items: [
                _mk('难过'), _mk('伤心'), _mk('失落'), _mk('遗憾'), _mk('孤单'), _mk('孤独'), _mk('寂寞'), _mk('委屈'),
                _mk('无奈'), _mk('疲惫'), _mk('疲倦'), _mk('低落'), _mk('沮丧'), _mk('失望'), _mk('心酸'), _mk('苦涩'),
                _mk('空虚'), _mk('迷茫'), _mk('迷失'), _mk('沉重'), _mk('压抑', 1), _mk('痛苦'), _mk('悲伤'), _mk('哀伤'), _mk('落寞')
            ]},
            { id: 'fear',        name: '不安与恐惧',   icon: '🥺', weight: 3, enabled: true, items: [
                _mk('害怕'), _mk('恐惧'), _mk('担心'), _mk('忧虑'), _mk('焦虑'), _mk('紧张'), _mk('不安'), _mk('慌张'),
                _mk('慌乱'), _mk('害怕失去'), _mk('忐忑', 1), _mk('不知所措'), _mk('心慌'), _mk('压力'), _mk('担忧'), _mk('敏感')
            ]},
            { id: 'specialEmo',  name: '特殊表达情绪', icon: '💭', weight: 2, enabled: true, items: [
                _mk('想被理解'), _mk('想被看见'), _mk('想确认'), _mk('想解释'), _mk('想安慰你'), _mk('想陪着你'),
                _mk('想靠近一点'), _mk('舍不得离开', 2), _mk('放心了'), _mk('安心下来'), _mk('松了一口气', 2),
                _mk('忍不住开心', 1), _mk('忍不住在意', 1), _mk('藏着心事', 1), _mk('有话想说', 1), _mk('不知道怎么表达', 2)
            ]},
            { id: 'anger',       name: '愤怒与不满',   icon: '🔥', weight: 1, enabled: true, items: [
                _mk('生气'), _mk('愤怒'), _mk('恼火'), _mk('烦躁'), _mk('不耐烦'), _mk('不满'), _mk('厌烦'),
                _mk('抗拒'), _mk('排斥'), _mk('恼怒'), _mk('气恼'), _mk('不甘'), _mk('嫉妒'), _mk('吃醋'),
                _mk('愤懑', 1), _mk('委屈'), _mk('赌气', 1), _mk('冷淡'), _mk('疏离', 1)
            ]},
            { id: 'selfEmo',     name: '自我情绪',     icon: '🫧', weight: 1, enabled: true, items: [
                _mk('骄傲'), _mk('自豪'), _mk('自信'), _mk('满足'), _mk('羞愧'), _mk('自责', 1), _mk('后悔'),
                _mk('内疚'), _mk('不甘心', 1), _mk('委屈自己', 2), _mk('怀疑自己'), _mk('失落感', 2), _mk('无力', 2),
                _mk('疲惫感', 2), _mk('释怀', 1), _mk('接受'), _mk('放下')
            ]}
        ] };
    }

    function _heartDefaults() {
        return {
            groups: [
                { id: 'companion', name: '陪伴与守护', icon: '🤍', weight: 25, enabled: true, items: [
                    _mk('陪伴', 0, 2), _mk('陪着你', 0, 1), _mk('我在这里', 0, 1), _mk('安静陪你', 0, 1),
                    _mk('想和你一起', 0, 1), _mk('不用一个人', 0, 1), _mk('待在你身边', 0, 1), _mk('不会离开', 1, 2),
                    _mk('想陪你走下去', 2, 3), _mk('想和你待一会', 1, 1)
                ]},
                { id: 'share',     name: '分享与交流',  icon: '💬', weight: 15, enabled: true, items: [
                    _mk('分享', 0, 1), _mk('想告诉你', 0, 1), _mk('想和你聊聊', 0, 1), _mk('想让你知道', 0, 1),
                    _mk('想听你的想法', 0, 1), _mk('想看看你的反应', 0, 1), _mk('想把这个分享给你', 1, 2),
                    _mk('想和你交换想法', 1, 2)
                ]},
                { id: 'care',      name: '关心与照顾',  icon: '🌱', weight: 15, enabled: true, items: [
                    _mk('关心', 0, 1), _mk('想照顾你', 1, 2), _mk('希望你好好的', 1, 2), _mk('记得休息', 0, 1),
                    _mk('不要太累', 0, 1), _mk('想确认你没事', 1, 2), _mk('希望你开心', 0, 1), _mk('想让你轻松一点', 0, 1)
                ]},
                { id: 'miss',      name: '思念与靠近',  icon: '🌙', weight: 20, enabled: true, items: [
                    _mk('想念', 1, 2), _mk('想到你', 0, 1), _mk('想靠近一点', 1, 2), _mk('想见你', 1, 2),
                    _mk('想和你在一起', 1, 2), _mk('想听你说话', 0, 1), _mk('想知道你在做什么', 0, 1),
                    _mk('舍不得离开', 2, 3)
                ]},
                { id: 'respond',   name: '理解与回应',  icon: '🔔', weight: 10, enabled: true, items: [
                    _mk('回应', 0, 1), _mk('我听到了', 0, 1), _mk('我明白', 1, 2), _mk('我知道', 0, 1),
                    _mk('我记住了', 1, 2), _mk('我理解', 1, 2), _mk('收到你的话', 0, 1), _mk('想回应你', 1, 2)
                ]},
                { id: 'support',   name: '鼓励与支持',  icon: '✨', weight: 8,  enabled: true, items: [
                    _mk('支持', 0, 1), _mk('相信你', 1, 2), _mk('陪你努力', 1, 2), _mk('为你加油', 0, 1),
                    _mk('认可你', 0, 1), _mk('为你感到骄傲', 2, 3), _mk('希望你坚持', 0, 1), _mk('我支持你的选择', 1, 2)
                ]},
                { id: 'invite',    name: '邀请与互动',  icon: '🎁', weight: 4,  enabled: true, items: [
                    _mk('邀请', 0, 1), _mk('想和你一起', 1, 2), _mk('想听你说', 0, 1), _mk('想和你讨论', 0, 1),
                    _mk('等你加入', 1, 2), _mk('想一起分享', 0, 1), _mk('想和你做同一件事', 1, 2)
                ]},
                { id: 'cherish',   name: '记录与珍惜',  icon: '📖', weight: 3,  enabled: true, items: [
                    _mk('记录', 0, 1), _mk('想记住', 0, 1), _mk('保存这一刻', 0, 1), _mk('珍惜现在', 0, 1),
                    _mk('留下回忆', 0, 1), _mk('这个瞬间很重要', 1, 2), _mk('想收藏这份感觉', 1, 2)
                ]},
                { id: 'specialEx', name: '特殊表达',    icon: '🌟', weight: 5,  enabled: true, items: [
                    _mk('想被理解', 0, 1), _mk('想被看见', 0, 1), _mk('有话想说', 0, 1), _mk('不知道怎么表达', 0, 1),
                    _mk('藏着一点心事', 1, 2), _mk('想确认你的心意', 1, 2), _mk('舍不得表达', 1, 2)
                ]}
            ],
            special: [
                { id: 's_treasure', name: '珍惜', icon: '🌟', items: [ _mk('想记住这个瞬间', 2, 3), _mk('这个时刻很特别', 2, 3), _mk('想保存这份感觉', 2, 3), _mk('不想忘记', 2, 3) ] },
                { id: 's_connect',  name: '连接', icon: '🔗', items: [ _mk('想一直保持联系', 2, 3), _mk('想继续陪你交流', 2, 3), _mk('想知道你的消息', 2, 3), _mk('想和你一直说话', 2, 3) ] },
                { id: 's_trust',    name: '信任', icon: '🤍', items: [ _mk('愿意告诉你', 2, 3), _mk('相信你', 2, 3), _mk('可以放心交给你', 2, 3), _mk('接受你的样子', 2, 3) ] },
                { id: 's_tacit',    name: '默契', icon: '🌌', items: [ _mk('你懂我的', 2, 3), _mk('不用说太多', 2, 3), _mk('我们之间有默契', 2, 3), _mk('这个感觉只有你懂', 2, 3) ] }
            ],
            specialChance: 5
        };
    }

    function _intentDefaults() {
        return { groups: [
            { id: 'respond',   name: '回应', icon: '🤍', weight: 25, enabled: true, items: [
                _mk('回应你'), _mk('听到了'), _mk('收到'), _mk('我在听'), _mk('想回答你', 1), _mk('认真听你说', 1), _mk('想回应你', 1)
            ]},
            { id: 'share',     name: '分享', icon: '💬', weight: 20, enabled: true, items: [
                _mk('想分享'), _mk('想告诉你'), _mk('想聊聊'), _mk('有事情想说', 1), _mk('想让你知道', 1), _mk('想和你说说', 1)
            ]},
            { id: 'listen',    name: '倾听', icon: '👂', weight: 15, enabled: true, items: [
                _mk('想听你说'), _mk('等待你的回应', 1), _mk('想知道你的想法', 1), _mk('想听听你的意见', 1), _mk('想看看你的反应', 1)
            ]},
            { id: 'approach',  name: '靠近', icon: '🌙', weight: 15, enabled: true, items: [
                _mk('想靠近'), _mk('想陪着你'), _mk('想和你待一会', 1), _mk('想一起聊聊', 1), _mk('想留在这里', 1)
            ]},
            { id: 'know',      name: '了解', icon: '🔍', weight: 10, enabled: true, items: [
                _mk('想问问你'), _mk('想了解'), _mk('有点好奇', 1), _mk('想知道更多', 1), _mk('想认识你', 1)
            ]},
            { id: 'comfort',   name: '安慰', icon: '🌱', weight: 8,  enabled: true, items: [
                _mk('想安慰你'), _mk('想陪陪你'), _mk('希望你好一点', 1), _mk('想让你安心', 1), _mk('想照顾你', 1)
            ]},
            { id: 'express',   name: '表达', icon: '🌟', weight: 5,  enabled: true, items: [
                _mk('想表达'), _mk('有话想说'), _mk('想让你懂', 1), _mk('希望你理解', 1), _mk('想告诉你一些事', 1)
            ]},
            { id: 'organize',  name: '整理', icon: '🌫', weight: 2,  enabled: true, items: [
                _mk('正在想'), _mk('想一想'), _mk('不知道怎么说', 1), _mk('慢慢整理', 1), _mk('还在思考', 1)
            ]}
        ] };
    }

    /* 关联映射（按分组 id 引用）：
     * 情绪 → 心意：[] 内为 [心意组 id, 权重] */
    var EMOTION_TO_HEART = {
        joy:         [['share', 30], ['support', 25], ['cherish', 25], ['invite', 20]],
        affection:   [['miss', 35], ['companion', 25], ['share', 20], ['cherish', 20]],
        neutral:     [['share', 30], ['companion', 20], ['invite', 20], ['cherish', 15], ['respond', 15]],
        thinking:    [['specialEx', 30], ['respond', 25], ['share', 25], ['cherish', 20]],
        shy:         [['share', 30], ['invite', 30], ['respond', 20], ['support', 20]],
        restraint:   [['specialEx', 40], ['respond', 30], ['cherish', 20], ['share', 10]],
        sad:         [['companion', 40], ['care', 30], ['respond', 20], ['miss', 10]],
        fear:        [['companion', 30], ['care', 30], ['share', 20], ['support', 20]],
        specialEmo:  [['specialEx', 40], ['companion', 20], ['respond', 20], ['care', 20]],
        anger:       [['respond', 30], ['companion', 25], ['support', 25], ['share', 20]],
        selfEmo:     [['support', 30], ['respond', 25], ['companion', 25], ['cherish', 20]]
    };
    /* 心意 → 意图：[] 内为 [意图组 id, 权重] */
    var HEART_TO_INTENT = {
        companion: [['approach', 40], ['respond', 30], ['listen', 30]],
        share:     [['share', 40], ['express', 30], ['listen', 20], ['know', 10]],
        care:      [['comfort', 40], ['listen', 30], ['approach', 30]],
        miss:      [['approach', 40], ['express', 30], ['share', 20], ['know', 10]],
        respond:   [['respond', 40], ['listen', 30], ['know', 30]],
        support:   [['express', 35], ['know', 30], ['respond', 20], ['share', 15]],
        invite:    [['share', 30], ['know', 30], ['approach', 20], ['express', 20]],
        cherish:   [['express', 35], ['organize', 25], ['share', 20], ['approach', 20]],
        specialEx: [['express', 40], ['organize', 20], ['listen', 20], ['know', 20]]
    };
    var HEART_SPECIAL_TO_INTENT = [['approach', 30], ['express', 25], ['listen', 25], ['share', 20]];

    /* ============================================================
     * 状态管理
     * ============================================================ */
    var _streaks = { emotion: 0, heart: 0, intent: 0, special: 0 };
    var _openState = {};          // 分组折叠（会话级）
    var _panelType = 'emotion';   // 当前内页：emotion / heart / intent / settings

    function _defaults() {
        return {
            enabled: true,
            typeSettings: {
                emotion: { enabled: true, chance: 70 },
                heart:   { enabled: true, chance: 40 },
                intent:  { enabled: true, chance: 20 }
            },
            rarityWeights: [80, 15, 5],
            useMappings: true,      // 情绪→心意→意图 关联映射
            specialCooldown: true,  // 24h 特殊字卡不重复
            recentDedupe: true,     // 最近 5 条去重
            emotion: _emotionDefaults(),
            heart: _heartDefaults(),
            intent: _intentDefaults(),
            meta: { specialUsed: {}, recent: [] }
        };
    }

    function _normalizeItems(items) {
        if (!Array.isArray(items)) return [];
        return items
            .map(function(it) {
                if (it && typeof it === 'object' && it.t !== undefined) {
                    return { t: String(it.t), r: parseInt(it.r) || 0, lv: parseInt(it.lv) || 0 };
                }
                var s = String(it || '').trim();
                if (!s) return null;
                return { t: s, r: 0, lv: 0 };
            })
            .filter(function(x) { return x && x.t; });
    }

    function _normalizeGroup(g, fallbackId) {
        return {
            id: (g && g.id) || 'g_' + Math.random().toString(36).slice(2, 7),
            name: (g && g.name) || '未命名分组',
            icon: (g && g.icon) || '💬',
            weight: (g && g.weight !== undefined && !isNaN(parseInt(g.weight))) ? (parseInt(g.weight) || 0) : 1,
            enabled: g && g.enabled !== undefined ? !!g.enabled : true,
            items: _normalizeItems(g && g.items)
        };
    }

    function _getState() {
        if (!window.emotionCardsData || typeof window.emotionCardsData !== 'object') {
            window.emotionCardsData = _defaults();
        }
        var st = window.emotionCardsData;
        if (st.enabled === undefined) st.enabled = true;
        if (!st.typeSettings || typeof st.typeSettings !== 'object') st.typeSettings = _defaults().typeSettings;
        ['emotion', 'heart', 'intent'].forEach(function(k) {
            var ts = st.typeSettings[k];
            if (!ts || typeof ts !== 'object') ts = st.typeSettings[k] = {};
            if (ts.enabled === undefined) ts.enabled = true;
            if (ts.chance === undefined || isNaN(parseFloat(ts.chance))) ts.chance = k === 'emotion' ? 70 : (k === 'heart' ? 40 : 20);
        });
        if (!Array.isArray(st.rarityWeights) || st.rarityWeights.length !== 3) st.rarityWeights = [80, 15, 5];
        if (st.useMappings === undefined) st.useMappings = true;
        if (st.specialCooldown === undefined) st.specialCooldown = true;
        if (st.recentDedupe === undefined) st.recentDedupe = true;
        if (typeof st.meta !== 'object' || !st.meta) st.meta = { specialUsed: {}, recent: [] };
        if (!st.meta.recent || !Array.isArray(st.meta.recent)) st.meta.recent = [];
        if (!st.meta.specialUsed || typeof st.meta.specialUsed !== 'object') st.meta.specialUsed = {};

        // 旧版数据迁移：旧格式的 groups 直接视为意图字卡，其余用默认
        if (!st.intent && st.groups) {
            st.intent = { groups: st.groups.map(function(g) { return _normalizeGroup(g); }) };
        }
        if (!st.emotion) { st.emotion = _emotionDefaults(); }
        else { st.emotion.groups = (st.emotion.groups || []).map(function(g) { return _normalizeGroup(g); }); }
        if (!st.heart) { st.heart = _heartDefaults(); }
        else {
            st.heart.groups = (st.heart.groups || []).map(function(g) { return _normalizeGroup(g); });
            if (!st.heart.special || !Array.isArray(st.heart.special)) st.heart.special = _heartDefaults().special;
            st.heart.special = st.heart.special.map(function(g) {
                return { id: g.id || 's_' + Math.random().toString(36).slice(2, 7), name: g.name || '特殊', icon: g.icon || '🌟', items: _normalizeItems(g.items) };
            });
            if (st.heart.specialChance === undefined) st.heart.specialChance = 5;
        }
        if (!st.intent) st.intent = _defaults().intent;
        else st.intent.groups = (st.intent.groups || []).map(function(g) { return _normalizeGroup(g); });
        return st;
    }
    window._emotionCardsGetState = _getState;

    function _persist() {
        try {
            if (typeof safeStore === 'function' && typeof getStorageKey === 'function') {
                safeStore(getStorageKey('emotionCards'), _getState());
            }
            if (typeof throttledSaveData === 'function') throttledSaveData();
        } catch (e) {
            console.warn('[emotion-cards] 保存失败:', e);
        }
    }
    window._emotionCardsPersist = _persist;

    /* ============================================================
     * 核心抽取逻辑
     * ============================================================ */
    function _chanceRoll(pct, typeKey) {
        var chance = pct * Math.pow(STREAK_DECAY, _streaks[typeKey] || 0);
        if (chance < MIN_CHANCE) chance = MIN_CHANCE;
        var hit = Math.random() * 100 < chance;
        _streaks[typeKey] = hit ? Math.min((_streaks[typeKey] || 0) + 1, MAX_STREAK) : 0;
        return hit;
    }

    function _weightedPickGroup(groups, enabledOnly) {
        var pool = groups.filter(function(g) {
            return (!enabledOnly || g.enabled) && g.items && g.items.length > 0;
        });
        if (!pool.length) return null;
        var total = 0;
        pool.forEach(function(g) { total += (g.weight || 1) > 0 ? (g.weight || 1) : 0; });
        if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];
        var r = Math.random() * total;
        for (var i = 0; i < pool.length; i++) {
            r -= (pool[i].weight || 1);
            if (r <= 0) return pool[i];
        }
        return pool[pool.length - 1];
    }

    /* 按 [分组, 权重] 对加权抽取 */
    function _weightedPickPairs(pairs) {
        if (!pairs.length) return null;
        var totalW = 0;
        pairs.forEach(function(x) { totalW += x.w; });
        if (totalW <= 0) return pairs[0].g;
        var rr = Math.random() * totalW;
        for (var i = 0; i < pairs.length; i++) {
            rr -= pairs[i].w;
            if (rr <= 0) return pairs[i].g;
        }
        return pairs[pairs.length - 1].g;
    }

    function _isUsedRecently(text) {
        var st = _getState();
        return st.recentDedupe && st.meta.recent.indexOf(text) !== -1;
    }
    function _isSpecialOnCooldown(text) {
        var st = _getState();
        if (!st.specialCooldown) return false;
        var ts = st.meta.specialUsed[text];
        if (!ts) return false;
        return (Date.now() - ts) < SPECIAL_COOLDOWN_MS;
    }

    function _rollRarity() {
        var rw = _getState().rarityWeights || [80, 15, 5];
        var total = rw[0] + rw[1] + rw[2] || 100;
        var r = Math.random() * total;
        if (r < rw[0]) return 0;
        if (r < rw[0] + rw[1]) return 1;
        return 2;
    }

    /* 在分组内按稀有度抽取（尽量避开冷却/最近去重，重试后兜底） */
    function _pickFromGroup(group, opts) {
        opts = opts || {};
        var items = group.items;
        if (!items || !items.length) return null;
        var tries = 10;
        for (var i = 0; i < tries; i++) {
            var tier = _rollRarity();
            var candidates = items.filter(function(it) { return it.r === tier; });
            if (!candidates.length) {
                // 稀有度不足则降级回普通，仍无则全池
                candidates = items.filter(function(it) { return it.r === 0; });
                if (!candidates.length) candidates = items;
            }
            var pick = candidates[Math.floor(Math.random() * candidates.length)];
            if (!pick) return null;
            if (pick.r === 2 && _isSpecialOnCooldown(pick.t)) continue;
            if (_isUsedRecently(pick.t)) continue;
            return pick;
        }
        return null;
    }

    function _pickMessageCard(typeData, groupRef, poolRank) {
        // groupRef: 指定分组（已按映射选出）；poolRank: 'special' 表示走特殊池
        var st = _getState();
        var group = groupRef;
        if (!group) return null;

        var pick = _pickFromGroup(group, { recentDedupe: st.recentDedupe });
        if (!pick) return null;

        // 记录冷却与最近去重
        st.meta.recent.push(pick.t);
        if (st.meta.recent.length > RECENT_DEDUPE_SIZE) st.meta.recent.shift();
        if (pick.r === 2) st.meta.specialUsed[pick.t] = Date.now();
        _persist();

        return {
            type: '',
            text: pick.t,
            rarity: pick.r,
            lv: pick.lv || 0,
            groupName: group.name || '',
            groupId: group.id || '',
            icon: group.icon || '💬',
            pool: poolRank === 'special' ? 'special' : 'normal'
        };
    }

    /* 抽取心意图卡主入口 */
    window._emotionCardsPick = function() {
        var st = _getState();
        if (!st.enabled) { _streaks.emotion = 0; _streaks.heart = 0; _streaks.intent = 0; return null; }

        var results = [];
        var emoCard = null, heartCard = null;

        // ── 1. 情绪字卡（70%）──
        var emoData = st.emotion || {};
        if (st.typeSettings.emotion.enabled && (emoData.groups || []).filter(function(g) { return g.enabled && g.items && g.items.length; }).length) {
            if (_chanceRoll(parseFloat(st.typeSettings.emotion.chance) || 70, 'emotion')) {
                var emoGroup = _weightedPickGroup(emoData.groups, true);
                var emo = _pickMessageCard(emoData, emoGroup);
                if (emo) { emo.type = 'emotion'; results.push(emo); emoCard = emo; }
            }
        }

        // ── 2. 心意字卡（40%，独立触发；有情绪时按 情绪→心意 映射）──
        var heartData = st.heart || {};
        if (st.typeSettings.heart.enabled && (heartData.groups || []).filter(function(g) { return g.enabled && g.items && g.items.length; }).length) {
            if (_chanceRoll(parseFloat(st.typeSettings.heart.chance) || 40, 'heart')) {
                var heartGroup = null;
                var mappedIds = null;
                if (st.useMappings && emoCard) {
                    var maps = EMOTION_TO_HEART[emoCard.groupId] || EMOTION_TO_HEART[emoCard.groupName] || null;
                    if (maps) mappedIds = maps;
                }
                // 特殊稀有池：独立 5% 触发（Lv3）
                var useSpecial = Math.random() * 100 < (parseFloat(heartData.specialChance) || 5);
                if (useSpecial && heartData.special && heartData.special.length) {
                    var spGroup = heartData.special[Math.floor(Math.random() * heartData.special.length)];
                    heartGroup = spGroup;
                } else if (mappedIds) {
                    var listByWeight = mappedIds.map(function(m) {
                        var g = heartData.groups.filter(function(x) { return x.id === m[0] || x.name === m[0]; })[0];
                        return g ? { g: g, w: m[1] } : null;
                    }).filter(Boolean);
                    if (listByWeight.length) heartGroup = _weightedPickPairs(listByWeight);
                    else heartGroup = _weightedPickGroup(heartData.groups, true);
                } else {
                    heartGroup = _weightedPickGroup(heartData.groups, true);
                }
                if (heartGroup) {
                    var hCard = _pickMessageCard(heartData, heartGroup, useSpecial ? 'special' : '');
                    if (hCard) { hCard.type = 'heart'; results.push(hCard); heartCard = hCard; }
                }
            }
        }

        // ── 3. 意图字卡（20%，独立触发；有心意时按 心意→意图 映射）──
        var intentData = st.intent || {};
        if (st.typeSettings.intent.enabled && (intentData.groups || []).filter(function(g) { return g.enabled && g.items && g.items.length; }).length) {
            if (_chanceRoll(parseFloat(st.typeSettings.intent.chance) || 20, 'intent')) {
                var intentGroup = null;
                if (st.useMappings && heartCard) {
                    var hMaps = null;
                    var hi = HEART_TO_INTENT[heartCard.groupId] || HEART_TO_INTENT[heartCard.groupName] || null;
                    if (hi) hMaps = hi;
                    if (!hMaps && heartCard.pool === 'special') hMaps = HEART_SPECIAL_TO_INTENT;
                    if (hMaps) {
                        var list2 = hMaps.map(function(m) {
                            var g = intentData.groups.filter(function(x) { return x.id === m[0] || x.name === m[0]; })[0];
                            return g ? { g: g, w: m[1] } : null;
                        }).filter(Boolean);
                        if (list2.length) intentGroup = _weightedPickPairs(list2);
                    }
                }
                if (!intentGroup) intentGroup = _weightedPickGroup(intentData.groups, true);
                if (intentGroup) {
                    var iCard = _pickMessageCard(intentData, intentGroup);
                    if (iCard) { iCard.type = 'intent'; results.push(iCard); }
                }
            }
        }

        return results.length ? results : null;
    };

    window._emotionCardsGetStreaks = function() { return _streaks; };
    window._emotionCardsResetStreak = function() { _streaks.emotion = 0; _streaks.heart = 0; _streaks.intent = 0; _streaks.special = 0; };
    window._emotionCardsGetStreak = function() { return _streaks.emotion + _streaks.heart + _streaks.intent; };
    window._emotionCardsRarityLabels = RARITY_LABEL;

    // ── 「新增」按钮：快速添加字卡到当前内页 ──
    window._emotionCardsQuickAdd = function() {
        var st = _getState();
        var typeCfg = { emotion: st.emotion, heart: st.heart, intent: st.intent }[_panelType];
        if (!typeCfg || !typeCfg.groups) {
            if (typeof showNotification === 'function') showNotification('请先切换到字卡分组页', 'warning');
            return;
        }
        var text = prompt('输入新的字卡内容：');
        if (text === null) return;
        text = String(text).trim();
        if (!text) return;
        var ri = prompt('稀有度（1 普通 / 2 稀有 / 3 特殊）：', '1');
        ri = String(ri || '').trim();
        var r = 0;
        if (ri === '2') r = 1; else if (ri === '3') r = 2;

        var groupName = prompt('添加到分组（默认：第一个启用分组）：', (typeCfg.groups.filter(function(g) { return g.enabled; })[0] || { name: '' }).name || '');
        if (groupName === null) return;
        groupName = String(groupName).trim();
        var group = null;
        typeCfg.groups.forEach(function(g) { if (!group && g.name === groupName) group = g; });
        if (!group) {
            group = { id: 'g_' + Math.random().toString(36).slice(2, 7), name: groupName || '自定义', icon: '💬', weight: 1, enabled: true, items: [] };
            typeCfg.groups.push(group);
        }
        if (!group.items.some(function(x) { return x.t === text; })) group.items.push({ t: text, r: r, lv: 0 });
        _persist();
        if (typeof renderReplyLibrary === 'function') renderReplyLibrary();
        if (typeof showNotification === 'function') showNotification('✓ 已添加到「' + group.name + '」', 'success');
    };

    /* ============================================================
     * 管理面板 UI
     * ============================================================ */
    function _css(style) {
        var parts = [];
        if (style.fontSize) parts.push('font-size:' + style.fontSize);
        if (style.weight) parts.push('font-weight:' + style.weight);
        if (style.color) parts.push('color:' + style.color);
        if (style.marginTop) parts.push('margin-top:' + style.marginTop);
        if (style.marginBottom) parts.push('margin-bottom:' + style.marginBottom);
        if (style.padding) parts.push('padding:' + style.padding);
        if (style.width) parts.push('width:' + style.width);
        if (style.textAlign) parts.push('text-align:' + style.textAlign);
        if (style.flex) parts.push('flex:' + style.flex);
        return parts.join(';');
    }
    function _text(tag, text, style) {
        var el = document.createElement(tag);
        if (style) el.style.cssText = _css(style);
        if (text !== undefined) el.textContent = text;
        return el;
    }
    function _div(cls, style) {
        var el = document.createElement('div');
        if (cls) el.className = cls;
        if (style) el.style.cssText = _css(style);
        return el;
    }
    function _btn(cls, text, cb) {
        var b = document.createElement('button');
        b.className = cls;
        b.textContent = text;
        b.addEventListener('click', cb);
        return b;
    }
    function _pillToggle(cb) {
        var el = document.createElement('div');
        el.style.cssText = 'width:44px;height:24px;border-radius:24px;background:var(--border-color);position:relative;transition:background 0.3s;flex-shrink:0;cursor:pointer;pointer-events:auto;';
        var knob = document.createElement('div');
        knob.style.cssText = 'position:absolute;width:18px;height:18px;border-radius:50%;background:#fff;top:3px;left:3px;transition:left 0.25s;box-shadow:0 1px 3px rgba(0,0,0,0.2);';
        el.appendChild(knob);
        var value = false;
        el.setTo = function(v) {
            value = !!v;
            el.style.background = value ? 'var(--accent-color)' : 'var(--border-color)';
            knob.style.left = value ? '23px' : '3px';
        };
        el.isOn = function() { return value; };
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            cb(!value);
        });
        return el;
    }

    var _ecStyleInjected = false;
    function _injectStyles() {
        if (_ecStyleInjected) return;
        _ecStyleInjected = true;
        var style = document.createElement('style');
        style.textContent = `
            .ec-card { background:var(--secondary-bg);border:1.5px solid var(--border-color);border-radius:14px;padding:14px 15px;margin-bottom:10px;font-family:var(--font-family); }
            .ec-row { display:flex;align-items:center;gap:10px; }
            .ec-slider { flex:1;accent-color:var(--accent-color);cursor:pointer; }
            .ec-subtab { display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap; }
            .ec-subtab-btn { padding:7px 13px;border-radius:20px;border:1.5px solid var(--border-color);background:var(--primary-bg);color:var(--text-secondary);font-size:12.5px;cursor:pointer;font-family:var(--font-family);transition:all 0.18s; }
            .ec-subtab-btn:hover { border-color:var(--accent-color);color:var(--accent-color); }
            .ec-subtab-btn.active { background:var(--accent-color);border-color:var(--accent-color);color:#fff;font-weight:600; }
            .ec-group { margin-bottom:10px; }
            .ec-group-head { display:flex;align-items:center;gap:9px;padding:10px 13px;background:var(--secondary-bg);border-radius:12px;border:1.5px solid var(--border-color);cursor:pointer;transition:all 0.18s; }
            .ec-group-head:hover { border-color:var(--accent-color); }
            .ec-group-head.ec-disabled { opacity:0.5; }
            .ec-group-body { padding:9px 10px;background:var(--primary-bg);border:1.5px solid var(--border-color);border-top:none;border-radius:0 0 12px 12px; }
            .ec-pill { display:inline-flex;align-items:center;gap:5px;padding:4px 8px 4px 11px;border-radius:20px;background:rgba(var(--accent-color-rgb,180,140,100),0.09);border:1px solid rgba(var(--accent-color-rgb,180,140,100),0.22);font-size:12px;color:var(--text-primary);margin:0 6px 6px 0; }
            .ec-pill button { border:none;background:none;color:var(--text-secondary);cursor:pointer;font-size:12px;padding:0 2px;border-radius:50%;line-height:1; }
            .ec-pill button:hover { color:#ef4444; }
            .ec-rarity { font-size:9.5px;padding:1px 5px;border-radius:8px;font-weight:700;letter-spacing:0.4px; }
            .ec-rarity.r0 { background:rgba(120,120,120,0.15);color:var(--text-secondary); }
            .ec-rarity.r1 { background:rgba(255,193,7,0.18);color:#c99700; }
            .ec-rarity.r2 { background:rgba(186,85,211,0.18);color:#9b59b6; }
            .ec-btn { padding:6px 14px;border-radius:9px;border:1.5px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);font-size:12px;cursor:pointer;font-family:var(--font-family);transition:all 0.15s; }
            .ec-btn:hover { border-color:var(--accent-color);color:var(--accent-color); }
            .ec-btn-primary { border:none;background:var(--accent-color);color:#fff;font-weight:600; }
            .ec-btn-primary:hover { color:#fff;opacity:0.9; }
            .ec-map-row { font-size:12px;color:var(--text-secondary);line-height:1.8;border:1px dashed var(--border-color);border-radius:10px;padding:8px 12px;margin-bottom:6px; }
            .ec-map-row b { color:var(--text-primary);font-weight:600; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    window._renderEmotionCardsTab = function(list) {
        if (!list) return;
        _injectStyles();
        var st = _getState();

        list.innerHTML = '';
        list.className = 'content-list-area';

        function renderAll() { window._renderEmotionCardsTab(list); }

        var typeMeta = {
            emotion: { label: '💭 情绪字卡', data: st.emotion },
            heart:   { label: '❤️ 心意字卡', data: st.heart },
            intent:  { label: '💬 意图字卡', data: st.intent },
            settings:{ label: '⚙️ 机制设置' }
        };

        // ── 内页切换 ──
        var subTabBar = _div('ec-subtab');
        Object.keys(typeMeta).forEach(function(k) {
            subTabBar.appendChild(_btn('ec-subtab-btn' + (_panelType === k ? ' active' : ''), typeMeta[k].label, function() {
                _panelType = k;
                renderAll();
            }));
        });
        list.appendChild(subTabBar);

        if (_panelType === 'settings') {
            renderSettings(list, st, renderAll);
            return;
        }

        var tm = typeMeta[_panelType];
        var data = tm.data;

        // ── 全局控制（类型开关 + 概率）──
        var ctrl = _div('ec-card');
        ctrl.appendChild(_text('div', tm.label + ' · 系统设置', { fontSize: '13.5px', weight: '700', color: 'var(--text-primary)', marginBottom: '10px' }));

        var toggleRow = _div('ec-row');
        toggleRow.appendChild(_text('div', '自动触发（梦角回复首条消息时）', { flex: '1', fontSize: '12.5px', color: 'var(--text-primary)' }));
        var enabledToggle = _pillToggle(function(now) {
            st.typeSettings[_panelType].enabled = !!now;
            _persist();
        });
        enabledToggle.setTo(!!st.typeSettings[_panelType].enabled);
        toggleRow.appendChild(enabledToggle);
        ctrl.appendChild(toggleRow);

        var chanceRow = _div('ec-row');
        chanceRow.style.marginTop = '12px';
        chanceRow.appendChild(_text('div', '触发概率', { fontSize: '12.5px', color: 'var(--text-primary)', width: '64px' }));
        var slider = document.createElement('input');
        slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '5';
        slider.className = 'ec-slider';
        slider.value = String(parseFloat(st.typeSettings[_panelType].chance) || 0);
        var pct = _text('div', (parseFloat(st.typeSettings[_panelType].chance) || 0) + '%', { fontSize: '12.5px', color: 'var(--accent-color)', weight: '700', width: '40px', textAlign: 'right' });
        slider.addEventListener('input', function() {
            st.typeSettings[_panelType].chance = parseInt(slider.value) || 0;
            pct.textContent = st.typeSettings[_panelType].chance + '%';
            _persist();
        });
        chanceRow.appendChild(slider);
        chanceRow.appendChild(pct);
        ctrl.appendChild(chanceRow);

        if (_panelType === 'heart') {
            var spRow = _div('ec-row');
            spRow.style.marginTop = '10px';
            spRow.appendChild(_text('div', '特殊稀有池', { flex: '1', fontSize: '12.5px', color: 'var(--text-primary)' }));
            var spPct = _text('div', (parseFloat(data.specialChance) || 5) + '%', { fontSize: '12.5px', color: 'var(--accent-color)', weight: '700' });
            spRow.appendChild(spPct);
            var spSlider = document.createElement('input');
            spSlider.type = 'range'; spSlider.min = '0'; spSlider.max = '30'; spSlider.step = '1';
            spSlider.className = 'ec-slider';
            spSlider.value = String(parseFloat(data.specialChance) || 5);
            spSlider.addEventListener('input', function() {
                data.specialChance = parseInt(spSlider.value) || 0;
                spPct.textContent = data.specialChance + '%';
                _persist();
            });
            spRow.appendChild(spSlider);
            ctrl.appendChild(spRow);
            var spDesc = _text('div', '独立于稀有度系统，命中后从 ➕ 特殊稀有池抽取（全部 Lv3）', { fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' });
            ctrl.appendChild(spDesc);
        }

        ctrl.appendChild(_text('div', '分组权重：按分组权重比例抽取，可点击权重修改', { fontSize: '11px', color: 'var(--text-secondary)', marginTop: '10px' }));
        list.appendChild(ctrl);

        // ── 关联映射展示 ──
        if (st.useMappings) {
            var mapCard = _div('ec-card');
            mapCard.appendChild(_text('div', '🔗 关联映射（预设权重）', { fontSize: '12.5px', weight: '700', color: 'var(--text-primary)', marginBottom: '8px' }));
            var mappingSrc = _panelType === 'heart' ? EMOTION_TO_HEART : HEART_TO_INTENT;
            var mappingLabel = _panelType === 'heart' ? '情绪 → 心意' : '心意 → 意图';
            var targetGroups = _panelType === 'heart' ? st.heart.groups : st.intent.groups;
            var srcGroups = _panelType === 'heart' ? st.emotion.groups : st.heart.groups;
            mapCard.appendChild(_text('div', mappingLabel + ' 映射（按分组名匹配，自定义分组自动均分）', { fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }));
            srcGroups.forEach(function(g) {
                var ms = mappingSrc[g.id] || null;
                if (!ms) return;
                var names = ms.map(function(m) {
                    var tg = null;
                    targetGroups.forEach(function(x) { if (!tg && (x.id === m[0] || x.name === m[0])) tg = x; });
                    return (tg && tg.name || m[0]) + '·' + m[1] + '%';
                }).join(' / ');
                var row = _div('ec-map-row');
                row.appendChild(_text('span', g.icon + ' '));
                row.appendChild(_text('b', g.name));
                row.appendChild(_text('span', ' → ' + names));
                mapCard.appendChild(row);
            });
            if (_panelType === 'intent') {
                var sp0 = _div('ec-map-row');
                sp0.appendChild(_text('b', '特殊稀有池'));
                sp0.appendChild(_text('span', ' → ' + (HEART_SPECIAL_TO_INTENT.map(function(m) {
                    var tg = null;
                    st.intent.groups.forEach(function(x) { if (!tg && (x.id === m[0] || x.name === m[0])) tg = x; });
                    return (tg && tg.name || m[0]) + '·' + m[1] + '%';
                }).join(' / '))));
                mapCard.appendChild(sp0);
            }
            list.appendChild(mapCard);
        }

        // ── 分组列表 ──
        data.groups.forEach(function(g, gi) {
            var isOpen = _openState[g.id] !== false;
            var block = _div('ec-group');

            var head = _div('ec-group-head' + (g.enabled ? '' : ' ec-disabled'));
            head.appendChild(_text('span', g.icon || '💬', { fontSize: '15px' }));
            var nameInfo = _div(null, { flex: '1', minWidth: '0' });
            nameInfo.appendChild(_text('div', g.name || '未命名', { fontSize: '13px', weight: '600', color: 'var(--text-primary)' }));
            nameInfo.appendChild(_text('div', (g.items || []).length + ' 条', { fontSize: '11px', color: 'var(--text-secondary)' }));
            head.appendChild(nameInfo);
            var wBtn = _btn('ec-btn', '权重 ' + (g.weight || 1), function(e) {
                e.stopPropagation();
                var w = prompt('「' + g.name + '」的分组权重：', String(g.weight || 1));
                if (w === null) return;
                w = parseInt(w);
                if (isNaN(w) || w <= 0) { showNotification('权重需为正整数', 'warning'); return; }
                g.weight = w;
                _persist(); renderAll();
            });
            wBtn.style.padding = '3px 9px';
            wBtn.style.fontSize = '11px';
            head.appendChild(wBtn);
            var addInline = _btn('ec-btn', '+ 添加', function(e) { e.stopPropagation(); addItemToGroup(g); });
            addInline.style.padding = '4px 10px';
            head.appendChild(addInline);
            var groupToggle = _pillToggle(function(now) {
                g.enabled = !!now;
                _persist(); renderAll();
            });
            groupToggle.setTo(!!g.enabled);
            head.appendChild(groupToggle);
            head.appendChild(_text('span', isOpen ? '▾' : '▸', { color: 'var(--text-secondary)', fontSize: '12px', pointerEvents: 'none' }));
            head.addEventListener('click', function() {
                _openState[g.id] = !isOpen;
                renderAll();
            });
            block.appendChild(head);

            var body = _div('ec-group-body');
            body.style.display = isOpen ? '' : 'none';
            (g.items || []).forEach(function(item, ii) {
                var pill = document.createElement('span');
                pill.className = 'ec-pill';
                var t = _text('span', item.t);
                t.style.cssText = 'cursor:pointer;';
                t.title = item.r === 2 ? '特殊（点击编辑）' : (item.r === 1 ? '稀有（点击编辑）' : '普通（点击编辑）');
                t.addEventListener('click', function() { editItem(g, ii, item); });
                var rarityBadge = _text('span', RARITY_LABEL[item.r] || '普通', { fontSize: '9.5px', padding: '1px 5px', borderRadius: '8px', weight: '700' });
                rarityBadge.className = 'ec-rarity r' + (item.r || 0);
                if (item.lv) {
                    pill.appendChild(_text('span', 'Lv' + item.lv, { fontSize: '9px', color: 'var(--text-secondary)', opacity: '0.8' }));
                }
                pill.appendChild(t);
                pill.appendChild(rarityBadge);
                var del = _btn('', '✕', function() {
                    if (!confirm('删除「' + item.t + '」？')) return;
                    g.items.splice(ii, 1);
                    _persist(); renderAll();
                });
                del.title = '删除';
                pill.appendChild(del);
                body.appendChild(pill);
            });
            if (!(g.items || []).length) {
                body.appendChild(_text('div', '该分组暂无字卡', { fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 2px 6px' }));
            }
            block.appendChild(body);
            list.appendChild(block);
        });

        // ── 底部操作 ──
        var addGrpRow = _div('ec-row');
        addGrpRow.style.padding = '2px 0 30px';
        addGrpRow.appendChild(_btn('ec-btn ec-btn-primary', '+ 新建分组', function() {
            var gname = prompt('新分组名称：');
            if (gname === null) return;
            gname = String(gname).trim();
            if (!gname) return;
            var icon = prompt('分组图标（可留空）：', '💬');
            data.groups.push({ id: 'g_' + Math.random().toString(36).slice(2, 7), name: gname, icon: (icon && String(icon).trim()) || '💬', weight: 1, enabled: true, items: [] });
            _persist(); renderAll();
        }));
        addGrpRow.appendChild(_btn('ec-btn', '重命名分组', function() {
            var gname = prompt('输入要重命名的分组名称：');
            if (gname === null) return;
            gname = String(gname).trim();
            var target = null;
            data.groups.forEach(function(g) { if (!target && g.name === gname) target = g; });
            if (!target) { showNotification('未找到该分组', 'warning'); return; }
            var newName = prompt('新名称：', target.name);
            if (newName === null) return;
            newName = String(newName).trim();
            if (newName) { target.name = newName; _persist(); renderAll(); }
        }));
        addGrpRow.appendChild(_btn('ec-btn', '删除分组', function() {
            var gname = prompt('输入要删除的分组名称：');
            if (gname === null) return;
            gname = String(gname).trim();
            var idx = -1;
            data.groups.forEach(function(g, i) { if (idx === -1 && g.name === gname) idx = i; });
            if (idx === -1) { showNotification('未找到该分组', 'warning'); return; }
            if (!confirm('删除「' + gname + '」及其全部字卡？')) return;
            data.groups.splice(idx, 1);
            _persist(); renderAll();
        }));
        list.appendChild(addGrpRow);

        function addItemToGroup(g) {
            var t = prompt('输入字卡内容（「' + g.name + '」组）：');
            if (t === null) return;
            t = String(t).trim();
            if (!t) return;
            var ri = prompt('稀有度（1 普通 / 2 稀有 / 3 特殊）：', '1');
            ri = String(ri || '').trim();
            var r = 0;
            if (ri === '2') r = 1; else if (ri === '3') r = 2;
            if (_panelType === 'heart') {
                var lv = prompt('强度等级（1-3）：', '1');
                lv = parseInt(lv);
                if (isNaN(lv)) lv = 1;
                lv = Math.max(1, Math.min(3, lv));
                if (g.items.some(function(x) { return x.t === t; })) { showNotification('该字卡已存在', 'warning'); return; }
                g.items.push({ t: t, r: r, lv: lv });
            } else {
                if (g.items.some(function(x) { return x.t === t; })) { showNotification('该字卡已存在', 'warning'); return; }
                g.items.push({ t: t, r: r, lv: 0 });
            }
            _persist(); renderAll();
        }

        function editItem(g, idx, item) {
            var nt = prompt('修改字卡内容：', item.t);
            if (nt === null) return;
            nt = String(nt).trim();
            if (!nt) return;
            var ri = prompt('稀有度（1 普通 / 2 稀有 / 3 特殊）：', String((item.r || 0) + 1));
            ri = String(ri || '').trim();
            var r = 0;
            if (ri === '2') r = 1; else if (ri === '3') r = 2;
            var nv = { t: nt, r: r, lv: item.lv || 0 };
            if (_panelType === 'heart') {
                var lv = prompt('强度等级（1-3）：', String(item.lv || 1));
                lv = parseInt(lv);
                nv.lv = isNaN(lv) ? (item.lv || 1) : Math.max(1, Math.min(3, lv));
            }
            g.items[idx] = nv;
            _persist(); renderAll();
        }
    };

    /* ── 机制设置面板 ── */
    function renderSettings(list, st, renderAll) {
        var card = _div('ec-card');
        card.appendChild(_text('div', '⚙️ 字卡机制设置', { fontSize: '13.5px', weight: '700', color: 'var(--text-primary)', marginBottom: '10px' }));

        var globalRow = _div('ec-row');
        globalRow.appendChild(_text('div', '整体开关（所有字卡）', { flex: '1', fontSize: '12.5px', color: 'var(--text-primary)' }));
        var gT = _pillToggle(function(now) { st.enabled = !!now; _persist(); });
        gT.setTo(!!st.enabled);
        globalRow.appendChild(gT);
        card.appendChild(globalRow);

        var mapRow = _div('ec-row');
        mapRow.style.marginTop = '12px';
        mapRow.appendChild(_text('div', '关联映射（情绪→心意→意图）', { flex: '1', fontSize: '12.5px', color: 'var(--text-primary)' }));
        var mT = _pillToggle(function(now) { st.useMappings = !!now; _persist(); });
        mT.setTo(!!st.useMappings);
        mapRow.appendChild(mT);
        card.appendChild(mapRow);

        var cdRow = _div('ec-row');
        cdRow.style.marginTop = '12px';
        cdRow.appendChild(_text('div', '24h 特殊字卡不重复', { flex: '1', fontSize: '12.5px', color: 'var(--text-primary)' }));
        var cT = _pillToggle(function(now) { st.specialCooldown = !!now; _persist(); });
        cT.setTo(!!st.specialCooldown);
        cdRow.appendChild(cT);
        card.appendChild(cdRow);

        var rdRow = _div('ec-row');
        rdRow.style.marginTop = '10px';
        rdRow.appendChild(_text('div', '最近 5 条字卡去重', { flex: '1', fontSize: '12.5px', color: 'var(--text-primary)' }));
        var rT = _pillToggle(function(now) { st.recentDedupe = !!now; _persist(); });
        rT.setTo(!!st.recentDedupe);
        rdRow.appendChild(rT);
        card.appendChild(rdRow);

        card.appendChild(_div('ec-row', { marginTop: '10px' }));
        card.lastChild.appendChild(_text('div', '稀有度权重（固定）：普通 80% · 稀有 15% · 特殊 5%', { fontSize: '11.5px', color: 'var(--text-secondary)' }));
        card.appendChild(_text('div', '触发概率：情绪 70% · 心意 40% · 意图 20%，连续触发后按 1/2 逐次递减（下限 5%）', { fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }));

        var streaks = window._emotionCardsGetStreaks();
        card.appendChild(_text('div', '当前连续序列：情绪 ' + streaks.emotion + ' · 心意 ' + streaks.heart + ' · 意图 ' + streaks.intent + ' 次', { fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '6px' }));
        card.appendChild(_btn('ec-btn', '清零连续序列', function() {
            window._emotionCardsResetStreak();
            renderAll();
        }));

        card.appendChild(_btn('ec-btn', '恢复默认字卡（三系全部）', function() {
            if (!confirm('恢复默认将覆盖当前自定义的 情绪/心意/意图 全部字卡内容，确定？')) return;
            var keep = {
                typeSettings: st.typeSettings,
                rarityWeights: st.rarityWeights,
                useMappings: st.useMappings,
                specialCooldown: st.specialCooldown,
                recentDedupe: st.recentDedupe,
                enabled: st.enabled
            };
            window.emotionCardsData = _defaults();
            window.emotionCardsData.typeSettings = keep.typeSettings;
            window.emotionCardsData.useMappings = keep.useMappings;
            window.emotionCardsData.specialCooldown = keep.specialCooldown;
            window.emotionCardsData.recentDedupe = keep.recentDedupe;
            window.emotionCardsData.enabled = keep.enabled;
            _persist();
            renderAll();
            if (typeof showNotification === 'function') showNotification('✓ 已恢复默认字卡', 'success');
        }));
        list.appendChild(card);

        // ── 特殊心意池管理 ──
        if (st.heart && st.heart.special && st.heart.special.length) {
            var spCard = _div('ec-card');
            spCard.appendChild(_text('div', '🌟 特殊稀有池（心意 · 全部 Lv3，5% 独立触发）', { fontSize: '12.5px', weight: '700', color: 'var(--text-primary)', marginBottom: '8px' }));
            st.heart.special.forEach(function(g, gi) {
                var block = _div('ec-group');
                var head = _div('ec-group-head');
                head.appendChild(_text('span', g.icon || '🌟', { fontSize: '14px' }));
                head.appendChild(_text('span', g.name, { flex: '1', fontSize: '12.5px', weight: '600', color: 'var(--text-primary)' }));
                var delG = _btn('ec-btn', '移除', function(e) {
                    e.stopPropagation();
                    if (!confirm('移除「' + g.name + '」特殊池？')) return;
                    st.heart.special.splice(gi, 1);
                    _persist(); renderAll();
                });
                delG.style.padding = '3px 9px'; delG.style.fontSize = '11px';
                head.appendChild(delG);
                block.appendChild(head);
                var body = _div('ec-group-body');
                (g.items || []).forEach(function(item, ii) {
                    var pill = document.createElement('span');
                    pill.className = 'ec-pill';
                    pill.appendChild(_text('span', 'Lv3', { fontSize: '9px', color: 'var(--text-secondary)', opacity: '0.8' }));
                    pill.appendChild(_text('span', item.t));
                    var badge = _text('span', '特殊', { fontSize: '9.5px', padding: '1px 5px', borderRadius: '8px', weight: '700' });
                    badge.className = 'ec-rarity r2';
                    pill.appendChild(badge);
                    var del = _btn('', '✕', function() {
                        if (!confirm('删除「' + item.t + '」？')) return;
                        g.items.splice(ii, 1);
                        _persist(); renderAll();
                    });
                    pill.appendChild(del);
                    body.appendChild(pill);
                });
                block.appendChild(body);
                spCard.appendChild(block);
            });
            var addSp = _btn('ec-btn', '+ 新增特殊字卡', function() {
                var t = prompt('输入特殊字卡内容：');
                if (t === null) return;
                t = String(t).trim();
                if (!t) return;
                if (!st.heart.special.length) {
                    st.heart.special.push({ id: 's_' + Math.random().toString(36).slice(2, 7), name: '自定义', icon: '🌟', items: [] });
                }
                st.heart.special[st.heart.special.length - 1].items.push({ t: t, r: 2, lv: 3 });
                _persist(); renderAll();
            });
            spCard.appendChild(_btn('ec-btn', '+ 新增特殊分组', function() {
                var gname = prompt('新特殊分组名称：');
                if (gname === null) return;
                gname = String(gname).trim();
                if (!gname) return;
                st.heart.special.push({ id: 's_' + Math.random().toString(36).slice(2, 7), name: gname, icon: '🌟', items: [] });
                _persist(); renderAll();
            }));
            spCard.appendChild(addSp);
            list.appendChild(spCard);
        }
    }
})();
