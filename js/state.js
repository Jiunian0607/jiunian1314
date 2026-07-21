/**
 * state.js - Application State Variables & DOM Elements
 * 应用状态变量与DOM元素引用
 * NOTE: This must be loaded after the DOM is ready (or wrapped in DOMContentLoaded)
 */

        let SESSION_ID = null;
        let autoSendTimer = null; 
        let sessionList = [];
        let messages = [];
        let settings = {};
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
// 朋友圈功能 - 数据存储（localStorage 版本，无需 localForage）
// ============================================================

// 使用 localStorage 存储朋友圈数据
const momentsDB = {
    async getItem(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) { return null; }
    },
    async setItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {}
    },
    async removeItem(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {}
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

// 导出朋友圈数据操作函数
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

// 初始化：确保数据存在
(async function initMomentsStorage() {
    try {
        const exists = await momentsDB.getItem('moments_list');
        if (exists === null) {
            await momentsDB.setItem('moments_list', []);
            console.log('📸 朋友圈存储已初始化 (localStorage)');
        } else {
            console.log('📸 朋友圈存储已就绪，共', exists.length, '条数据');
        }
    } catch (e) {
        console.warn('📸 朋友圈存储初始化失败:', e);
    }
})();

// 将 MomentsDB 暴露到全局
window.MomentsDB = MomentsDB;
window.momentsList = momentsList;
window.momentsMode = momentsMode;
window.momentsBoost = momentsBoost;
// 暴露 settings 到全局
window.settings = settings;