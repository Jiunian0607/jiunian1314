/**
 * state.js - Application State Variables & DOM Elements
 * 应用状态变量与DOM元素引用
 * NOTE: This must be loaded after the DOM is ready (or wrapped in DOMContentLoaded)
 */

// 🔥 新增：分离存储配置 - 解决手机端数据被吞问题

const STORAGE_KEYS = {
    // 核心数据
    MESSAGES: 'chatMessages',
    SETTINGS: 'chatSettings',
    
    // 朋友圈相关
    MOMENTS: 'moments_list',
    MOMENT_AVATARS: 'momentAvatars',
    
    // 群聊
    GROUP_CHAT: 'groupChatData',
    
    // 回复库
    REPLIES: 'customReplies',
    REPLY_GROUPS: 'customReplyGroups',
    
    // 氛围感
    POKES: 'customPokes',
    POKE_GROUPS: 'customPokeGroups',
    STATUSES: 'customStatuses',
    STATUS_GROUPS: 'customStatusGroups',
    MOTTOS: 'customMottos',
    INTROS: 'customIntros',
    
    // 表情
    EMOJIS: 'customEmojis',
    STICKERS: 'stickerLibrary',
    MY_STICKERS: 'myStickerLibrary',
    
    // 纪念日
    ANNIVERSARIES: 'anniversaries',
    
    // 主题
    CUSTOM_THEMES: 'customThemes',
    THEME_SCHEMES: 'themeSchemes',
    
    // 头像
    PARTNER_AVATAR: 'partnerAvatar',
    MY_AVATAR: 'myAvatar',
    
    // 背景
    BACKGROUND: 'chatBackground',
    BACKGROUND_GALLERY: 'backgroundGallery',
    
    // 其他
    PARTNER_PERSONAS: 'partnerPersonas',
    SHOW_PARTNER_NAME: 'showPartnerNameInChat',
    REVERSE_QUESTIONS: 'customReverseQuestions',
};

// ============================================================
// 🔥 新增：安全存储工具函数
// ============================================================

// 获取存储键（带前缀）- 注意：这个函数在 core.js 中也有定义，这里统一
// 如果 core.js 中已有 getStorageKey，这里可以省略，但为了安全保留
function getStorageKeyLocal(baseKey) {
    if (!window.SESSION_ID) {
        console.error('[getStorageKey] SESSION_ID 尚未初始化');
        throw new Error('SESSION_ID 未初始化');
    }
    return `${window.APP_PREFIX || 'CHAT_APP_V3_'}${window.SESSION_ID}_${baseKey}`;
}

// 安全存储到 IndexedDB
async function safeStore(key, data) {
    try {
        await localforage.setItem(key, data);
        return true;
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.message?.includes('QuotaExceeded')) {
            console.error(`⚠️ 存储空间不足！键名: ${key}`, e);
            if (typeof window.showNotification === 'function') {
                window.showNotification('⚠️ 存储空间不足，请导出数据后清理缓存', 'warning', 5000);
            }
        } else {
            console.error(`❌ 存储失败 (${key}):`, e);
        }
        return false;
    }
}

// 安全读取 IndexedDB
async function safeLoad(key, defaultValue = null) {
    try {
        const data = await localforage.getItem(key);
        return data !== null && data !== undefined ? data : defaultValue;
    } catch (e) {
        console.error(`❌ 读取失败 (${key}):`, e);
        return defaultValue;
    }
}

// 检查存储使用情况（辅助调试）
async function checkStorageUsage() {
    try {
        const total = await localforage.length();
        let details = {};
        let totalSize = 0;
        for (let i = 0; i < total; i++) {
            const key = await localforage.key(i);
            if (key) {
                const val = await localforage.getItem(key);
                if (val) {
                    const size = new Blob([JSON.stringify(val)]).size;
                    totalSize += size;
                    details[key] = (size / 1024).toFixed(1) + 'KB';
                }
            }
        }
        console.log('📊 存储使用情况:', {
            total: (totalSize / 1024 / 1024).toFixed(2) + 'MB',
            details
        });
        return { total: (totalSize / 1024 / 1024).toFixed(2) + 'MB', details };
    } catch (e) {
        console.error('检查存储失败:', e);
        return null;
    }
}

// 暴露到全局
window.STORAGE_KEYS = STORAGE_KEYS;
window.safeStore = safeStore;
window.safeLoad = safeLoad;
window.checkStorageUsage = checkStorageUsage;

        let SESSION_ID = null;
        let autoSendTimer = null; 
        let sessionList = [];
        let messages = [];
        let settings = {};
if (typeof window !== 'undefined' && window.localforage) {
    // 延迟执行，等页面加载完成
    setTimeout(async () => {
        try {
            await checkStorageUsage();
        } catch (e) {
            // 静默失败
        }
    }, 3000);
}
        let partnerPersonas = []; 
        let showPartnerNameInChat = false; 
        let readNoReplyTimer = null; 
        let isBatchMode = false;
        let batchMessages = [];
        let currentReplyTo = null;
        let lastCoinResult = null;
        let currentNoteMessageId = null;
        let savedBackgrounds = [];
        let saveTimeout;
        let displayedMessageCount = 20;
        const HISTORY_BATCH_SIZE = 20;
        let isLoadingHistory = false;
        let isBatchFavoriteMode = false;
        let selectedMessages = [];
        let customReplies = [];
        let customPokes = [];
        let customStatuses = [];
        let customPokeGroups = [];
        let customStatusGroups = [];
        let customMottos = [];
        let customIntros = []; 
        let currentMajorTab = 'reply'; 
        let currentSubTab = 'custom';  
        let currentReplyTab = 'custom';
        let customEmojis = [];
        let anniversaries = [];
        let stickerLibrary = []; 
        let myStickerLibrary = []; 
        let currentAnniversaryType = 'anniversary';
        let customThemes = [];
        let themeSchemes = []; 
if (typeof window.getStorageKey === 'undefined') {
    window.getStorageKey = function(baseKey) {
        if (!window.SESSION_ID) {
            console.error('[getStorageKey] SESSION_ID 尚未初始化');
            return `CHAT_APP_V3__${baseKey}`;
        }
        return `CHAT_APP_V3_${window.SESSION_ID}_${baseKey}`;
    };
}
        const DOMElements = {
            html: document.documentElement,
            chatContainer: document.getElementById('chat-container'),
            messageInput: document.getElementById('message-input'),
            sendBtn: document.getElementById('send-btn'),
            attachmentBtn: document.getElementById('attachment-btn'),
            imageInput: document.getElementById('image-input'),
            themeToggle: document.getElementById('theme-toggle'),
            batchBtn: document.getElementById('batch-btn'),
            continueBtn: document.getElementById('continue-btn'),
            comboBtn: document.getElementById('combo-btn'),
            coinTossOverlay: document.getElementById('coin-toss-overlay'),
            animatedCoin: document.getElementById('animated-coin'),
            coinResultText: document.getElementById('coin-result-text'),
            cancelCoinResult: document.getElementById('cancel-coin-result'),
            sendCoinResult: document.getElementById('send-coin-result'),
            typingIndicator: document.getElementById('typing-indicator'),
            emptyState: document.getElementById('empty-state'),
            welcomeAnimation: document.getElementById('welcome-animation'),
            batchPreview: document.getElementById('batch-preview'),
            replyPreviewContainer: document.getElementById('reply-preview-container'),
            pagination: document.getElementById('pagination'),
            prevPage: document.getElementById('prev-page'),
            nextPage: document.getElementById('next-page'),
            pageInfo: document.getElementById('page-info'),
            editModal: {
                modal: document.getElementById('edit-modal'),
                title: document.getElementById('edit-modal-title'),
                input: document.getElementById('name-input'),
                cancel: document.getElementById('cancel-edit'),
                save: document.getElementById('save-name')
            },
            avatarModal: {
                modal: document.getElementById('avatar-modal'),
                title: document.getElementById('avatar-modal-title'),
                input: document.getElementById('avatar-input'),
                cancel: document.getElementById('cancel-avatar'),
                save: document.getElementById('save-avatar')
            },
            noteModal: {
                modal: document.getElementById('note-modal'),
                input: document.getElementById('note-input'),
                cancel: document.getElementById('cancel-note'),
                save: document.getElementById('save-note')
            },
            pokeModal: {
                modal: document.getElementById('poke-modal'),
                input: document.getElementById('poke-input'),
                cancel: document.getElementById('cancel-poke'),
                save: document.getElementById('send-poke')
            },
            settingsModal: {
                modal: document.getElementById('settings-modal'),
                settingsBtn: document.getElementById('settings-btn'),
                cancel: document.getElementById('cancel-settings')
            },
            favoritesModal: {
                modal: document.getElementById('stats-modal'),
                favoritesBtn: document.getElementById('group-chat-btn'),
                list: document.getElementById('favorites-list'),
                cancel: document.getElementById('close-stats')
            },
            statsModal: {
                modal: document.getElementById('stats-modal'),
                content: document.getElementById('stats-content'),
                closeBtn: document.getElementById('close-stats')
            },
            sessionModal: {
                modal: document.getElementById('session-modal'),
                managerBtn: document.getElementById('session-manager-btn'),
                list: document.getElementById('session-list'),
                createBtn: document.getElementById('create-new-session'),
                cancelBtn: document.getElementById('cancel-session')
            },
            fortuneModal: {
                modal: document.getElementById('fortune-lenormand-modal'),
                content: document.getElementById('fortune-content'),
                shareBtn: document.getElementById('share-fortune'),
                closeBtn: document.getElementById('close-fortune')
            },
            customRepliesModal: {
                modal: document.getElementById('custom-replies-modal'),
                list: document.getElementById('custom-replies-list'),
                addBtn: document.getElementById('add-custom-reply'),
                closeBtn: document.getElementById('close-custom-replies')
            },
            backgroundInput: document.getElementById('background-input'),
            importInput: document.getElementById('import-input'),
            partner: {
                name: document.getElementById('partner-name'),
                avatarContainer: document.getElementById('partner-avatar-container'), 
                avatar: document.getElementById('partner-avatar'),
                status: document.getElementById('partner-status').querySelector('span')
            },
            me: {
                name: document.getElementById('my-name'),
                avatarContainer: document.getElementById('my-avatar-container'), 
                avatar: document.getElementById('my-avatar'),
                statusContainer: document.getElementById('my-status-container'),
                statusText: document.getElementById('my-status-text')
            },
            anniversaryModal: {
                modal: document.getElementById('anniversary-modal'),
                closeBtn: document.getElementById('close-anniversary-modal'),
                saveBtn: document.getElementById('save-ann-btn'),
                addBtn: document.getElementById('open-ann-add-btn'),
                dateInput: document.getElementById('ann-input-date'),
                nameInput: document.getElementById('ann-input-name'),
                displayArea: document.getElementById('anniversary-display'),
                daysElement: document.getElementById('anniversary-days'),
                dateShowElement: document.getElementById('anniversary-date-show'),
                list: document.getElementById('ann-list-container'),
                typeHint: document.getElementById('ann-type-desc')
            },            
            anniversaryAnimation: {
                modal: document.getElementById('anniversary-animation'),
                title: document.getElementById('anniversary-animation-title'),
                days: document.getElementById('anniversary-animation-days'),
                message: document.getElementById('anniversary-animation-message'),
                closeBtn: document.getElementById('close-anniversary-animation')
            },
            appearanceModal: {
                modal: document.getElementById('appearance-modal'),
                closeBtn: document.getElementById('close-appearance')
            },
            chatModal: {
                modal: document.getElementById('chat-modal'),
                closeBtn: document.getElementById('close-chat')
            },
            advancedModal: {
                modal: document.getElementById('advanced-modal'),
                closeBtn: document.getElementById('close-advanced')
            },
            dataModal: {
                modal: document.getElementById('data-modal'),
                closeBtn: document.getElementById('close-data')
            }
        };
// ============================================================
// 🔥 修改：朋友圈功能 - 使用 IndexedDB 分离存储
// ============================================================

// 创建独立的 IndexedDB 实例
const momentsStorage = localforage.createInstance({
    name: 'ChuanXun',
    storeName: 'moments_separated'
});

// 使用 IndexedDB 存储朋友圈数据
const momentsDB = {
    async getItem(key) {
        try {
            return await momentsStorage.getItem(key);
        } catch (e) { 
            console.error('momentsDB.getItem 失败:', e);
            return null; 
        }
    },
    async setItem(key, value) {
        try {
            await momentsStorage.setItem(key, value);
        } catch (e) {
            console.error('momentsDB.setItem 失败:', e);
        }
    },
    async removeItem(key) {
        try {
            await momentsStorage.removeItem(key);
        } catch (e) {
            console.error('momentsDB.removeItem 失败:', e);
        }
    }
};

// 朋友圈状态变量
let momentsList = [];
let momentsMode = 'partner';
let momentsBoost = {
    moment: 0,
    like: 0,
    comment: 0
};
let momentsAutoTimers = [];

// 朋友圈 DOM 引用
const MomentsDOMElements = {
    modal: document.getElementById('moments-modal'),
    list: document.getElementById('moments-list'),
    input: document.getElementById('moments-input'),
    mediaInput: document.getElementById('moments-media-input'),
    mediaPreview: document.getElementById('moments-media-preview'),
    mediaPreviewImg: document.getElementById('moments-media-preview-img'),
    publishOverlay: document.getElementById('moments-publish-overlay'),
    submitBtn: document.getElementById('moments-submit-btn'),
    closeBtn: document.getElementById('close-moments'),
    tabPartner: document.getElementById('moments-tab-partner'),
    tabGroup: document.getElementById('moments-tab-group'),
    boostMoment: document.getElementById('moments-boost-moment'),
    boostLike: document.getElementById('moments-boost-like'),
    boostComment: document.getElementById('moments-boost-comment')
};

// ============================================================
// 🔥 修改：朋友圈数据操作（使用 IndexedDB 分离存储）
// ============================================================

const MomentsDB = {
    async getAll() {
        const data = await momentsDB.getItem('moments_list');
        return data || [];
    },
    
    async saveAll(data) {
        await momentsDB.setItem('moments_list', data);
    },
    
    async add(moment) {
        const list = await this.getAll();
        moment.id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        moment.timestamp = moment.timestamp || Date.now();
        moment.likes = moment.likes || [];
        moment.comments = moment.comments || [];
        moment.reactAttempts = moment.reactAttempts || 0;
        list.unshift(moment);
        await this.saveAll(list);
        return moment.id;
    },
    
    async update(id, updater) {
        const list = await this.getAll();
        const idx = list.findIndex(m => m.id === id);
        if (idx === -1) return false;
        updater(list[idx]);
        await this.saveAll(list);
        return true;
    },
    
    async remove(id) {
        let list = await this.getAll();
        list = list.filter(m => m.id !== id);
        await this.saveAll(list);
        return true;
    },
    
    async clear() {
        await momentsDB.removeItem('moments_list');
        return true;
    }
};

// ============================================================
// 🔥 修改：初始化朋友圈存储
// ============================================================

(async function initMomentsStorage() {
    try {
        const exists = await momentsDB.getItem('moments_list');
        if (exists === null || exists === undefined) {
            await momentsDB.setItem('moments_list', []);
            console.log('📸 朋友圈存储已初始化 (IndexedDB 分离存储)');
        } else {
            console.log('📸 朋友圈存储已就绪，共', exists.length, '条数据');
        }
    } catch (e) {
        console.warn('📸 朋友圈存储初始化失败:', e);
        // 降级方案：尝试使用 localStorage
        try {
            const fallback = localStorage.getItem('moments_list');
            if (fallback) {
                await momentsDB.setItem('moments_list', JSON.parse(fallback));
                localStorage.removeItem('moments_list');
                console.log('📸 已从 localStorage 迁移到 IndexedDB');
            }
        } catch (e2) {}
    }
})();

// 将 MomentsDB 暴露到全局
window.momentsDB = momentsDB;
window.MomentsDB = MomentsDB;
window.momentsList = momentsList;
window.momentsMode = momentsMode;
window.momentsBoost = momentsBoost;
// 暴露 settings 到全局
window.settings = settings;
window.momentsStorage = momentsStorage;