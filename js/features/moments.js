// js/features/moments.js
(function() {
    'use strict';

    // ========== 使用 state.js 中定义的 MomentsDB ==========
    const DB = window.MomentsDB;

    // 如果 MomentsDB 不存在，创建备用实例（防止加载顺序问题）
    if (!DB) {
        console.warn('MomentsDB 未初始化，创建备用实例');
        const fallbackDB = localForage.createInstance({
            name: 'ChuanXun',
            storeName: 'moments'
        });
        window.MomentsDB = {
            async getAll() {
                const data = await fallbackDB.getItem('moments_list');
                return data || [];
            },
            async saveAll(data) {
                await fallbackDB.setItem('moments_list', data);
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
                await fallbackDB.removeItem('moments_list');
                return true;
            }
        };
        // 重新赋值 DB
        DB = window.MomentsDB;
    }

    let currentMode = window.momentsMode || 'partner';
    let boostExpiry = window.momentsBoost || { moment: 0, like: 0, comment: 0 };

    // ========== 数据操作（使用 MomentsDB） ==========
    async function getAll() {
        return await DB.getAll();
    }

    async function save(data) {
        return await DB.add(data);
    }

    async function update(id, updater) {
        return await DB.update(id, updater);
    }

    async function remove(id) {
        return await DB.remove(id);
    }

    async function clearAll() {
        return await DB.clear();
    }

    async function saveAll(data) {
        return await DB.saveAll(data);
    }

    async function getByMode(mode) {
        const all = await getAll();
        if (mode === 'partner') {
            return all.filter(m => m.author === 'partner' || m.author === 'me' || m.author === 'me_gc');
        }
        if (mode === 'group') {
            return all.filter(m => m.author && m.author.startsWith('gc_'));
        }
        return all;
    }

  // ========== 获取回复池（从 IndexedDB 读取字卡） ==========
async function getReplyPool() {
    let replies = [];

    // 1. 从全局变量 customReplies 获取
    if (typeof customReplies !== 'undefined' && customReplies && customReplies.length) {
        const first = customReplies[0];
        if (typeof first === 'string') {
            replies = customReplies;
        } else if (first && typeof first === 'object' && first.text) {
            replies = customReplies.map(c => c.text || c.replyText || c.content || String(c)).filter(Boolean);
        } else if (first && typeof first === 'object') {
            replies = customReplies.map(c => {
                return c.text || c.replyText || c.content || c.value || String(c);
            }).filter(Boolean);
        }
        console.log('📸 从 customReplies 获取字卡:', replies.length, '条');
    }

    // 2. 尝试从 localStorage 的多个键读取
    if (replies.length === 0) {
        try {
            const possibleKeys = [
                'customReplies',
                'custom_replies',
                'replyLibrary',
                'BACKUP_V1_critical'
            ];
            for (const key of possibleKeys) {
                const stored = localStorage.getItem(key);
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            const first = parsed[0];
                            if (typeof first === 'string') {
                                replies = parsed;
                            } else if (first && typeof first === 'object') {
                                replies = parsed.map(c => c.text || c.replyText || c.content || String(c)).filter(Boolean);
                            } else {
                                replies = parsed.map(c => String(c)).filter(Boolean);
                            }
                            if (replies.length > 0) {
                                console.log(`📸 从 localStorage 键 "${key}" 获取字卡:`, replies.length, '条');
                                break;
                            }
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }

    // 3. 尝试从 IndexedDB 读取（如果 localforage 可用）
    if (replies.length === 0 && typeof localforage !== 'undefined') {
        try {
            // 尝试从 IndexedDB 的 customReplies 表读取
            const db = localforage.createInstance({
                name: 'ChuanXun',
                storeName: 'customReplies'
            });
            const data = await db.getItem('customReplies');
            if (data && Array.isArray(data)) {
                replies = data.map(c => {
                    if (typeof c === 'string') return c;
                    return c.text || c.replyText || c.content || String(c);
                }).filter(Boolean);
                console.log('📸 从 IndexedDB 获取字卡:', replies.length, '条');
            }
        } catch (e) {}
    }

    // 4. 如果还是没有，使用默认回复
    if (replies.length === 0) {
        console.warn('📸 未找到字卡，使用默认回复');
        replies = [
            '好棒！', '喜欢 ❤️', '想你', '今天也要开心哦', '收到 ✦',
            '嗯嗯', '好的', '知道了', '哈哈', '真的吗？',
            '太可爱了', '好感动', '加油', '晚安', '早安'
        ];
    }

    return replies;
}

    // ========== 获取群成员列表 ==========
    function getGroupMembers() {
        try {
            // 尝试从 groupMembers 获取
            if (window.groupMembers && window.groupMembers.length) {
                return window.groupMembers;
            }
            // 尝试从 localStorage 获取
            const data = localStorage.getItem('groupMembers');
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {}
        return [];
    }

    // ========== 时间格式化 ==========
    function getTimeAgo(timestamp) {
        const diff = Date.now() - timestamp;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
        return new Date(timestamp).toLocaleDateString();
    }

 // ========== 获取作者信息（修复头像 - 从 DOM 背景图提取） ==========
function getAvatarFromElement(selector) {
    const el = document.querySelector(selector);
    if (!el) return '';
    
    // 1. 检查是否有 img 子元素
    const img = el.querySelector('img');
    if (img && img.src && !img.src.includes('placeholder') && !img.src.includes('data:image/svg')) {
        return img.src;
    }
    
    // 2. 检查元素的 background-image
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none' && bg !== '') {
        const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (match) {
            const url = match[1];
            // 如果是 data:image 或 http 链接，直接返回
            if (url.startsWith('data:') || url.startsWith('http')) {
                return url;
            }
        }
    }
    
    // 3. 检查内联样式中的 background-image
    const inlineBg = el.style.backgroundImage;
    if (inlineBg && inlineBg !== 'none') {
        const match = inlineBg.match(/url\(["']?([^"')]+)["']?\)/);
        if (match) {
            const url = match[1];
            if (url.startsWith('data:') || url.startsWith('http')) {
                return url;
            }
        }
    }
    
    return '';
}

function getAuthorInfo(author) {
    const isMe = author === 'me' || author === 'me_gc';
    const isPartner = author === 'partner';
    const isGc = author && author.startsWith('gc_');

    let name = '未知';
    let avatar = '';

    // 使用全局变量 settings
    const s = typeof settings !== 'undefined' ? settings : {};

    if (isMe) {
        name = s.myName || '我';
        // 从 DOM 获取头像
        avatar = getAvatarFromElement('#my-avatar');
        // 如果 DOM 没有，尝试从 settings 获取（作为后备）
        if (!avatar) avatar = s.myAvatar || '';
    } else if (isPartner) {
        name = s.partnerName || '梦角';
        // 从 DOM 获取头像
        avatar = getAvatarFromElement('#partner-avatar');
        // 如果 DOM 没有，尝试从 settings 获取（作为后备）
        if (!avatar) avatar = s.partnerAvatar || '';
    } else if (isGc) {
        const members = getGroupMembers();
        const id = parseInt(author.replace('gc_', ''));
        const found = members.find(m => m.id === id);
        name = found?.name || '群成员';
        avatar = found?.avatar || '';
    }

    return { name, avatar, isMe, isPartner, isGc };
}

   // ========== 构建朋友圈卡片 HTML ==========
function buildMomentCard(m) {
    const info = getAuthorInfo(m.author);
    const isMyMoment = info.isMe || m.author === 'me';

    // 头像
    let avatarHtml = '<i class="fas fa-user" style="font-size:16px;color:var(--text-secondary);"></i>';
    if (info.avatar) {
        avatarHtml = `<img src="${info.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none'">`;
    }

    // 媒体 - 支持点击放大
let mediaHtml = '';
if (m.media && m.media !== '' && m.media !== 'null' && m.media !== 'undefined') {
    // 转义单引号，防止 XSS
    var safeSrc = m.media.replace(/'/g, "\\'");
    mediaHtml = `
        <img src="${m.media}" class="moment-media" loading="lazy" 
             onclick="window.openImageViewer && window.openImageViewer('${safeSrc}')"
             style="cursor:pointer;"
             onerror="this.style.display='none'">
    `;
}

    // 点赞
    const myLiked = m.likes && m.likes.includes('me');
    const likeCount = (m.likes || []).length;
    const likeNames = [];
    if (m.likes) {
        m.likes.forEach(l => {
            if (l === 'me') likeNames.push(typeof settings !== 'undefined' ? settings.myName || '我' : '我');
            else if (l === 'partner') likeNames.push(typeof settings !== 'undefined' ? settings.partnerName || '梦角' : '梦角');
            else if (l.startsWith('gc_')) {
                const members = getGroupMembers();
                const id = parseInt(l.replace('gc_', ''));
                const found = members.find(m => m.id === id);
                if (found) likeNames.push(found.name);
            }
        });
    }
    const likesHtml = likeNames.length ? 
        `<div class="moment-likes">❤️ ${likeNames.join('、')}</div>` : '';

    // 🔥 评论 - 表情包也支持点击放大
   const commentsHtml = m.comments && m.comments.length ? 
    `<div class="moment-comments">${m.comments.map((c, idx) => {
        const cInfo = getAuthorInfo(c.author);
        const cName = c.gcName || cInfo.name || '成员';
        const replyToHtml = c.replyToName ? 
            `<span class="moment-comment-reply-to">回复 ${c.replyToName}</span>` : '';
        let stickerHtml = '';
        if (c.sticker) {
            const safeSticker = c.sticker.replace(/'/g, "\\'");
            stickerHtml = `<img src="${c.sticker}" style="max-height:30px;max-width:80px;border-radius:6px;vertical-align:middle;cursor:pointer;" onclick="window.openImageViewer && window.openImageViewer('${safeSticker}')">`;
        }
        const textHtml = c.text || '';
        const contentHtml = stickerHtml && textHtml ? 
            `${textHtml} ${stickerHtml}` : (stickerHtml || textHtml);
        return `<div class="moment-comment">
            <span class="moment-comment-author">${cName}</span>
            ${replyToHtml}
            <span class="moment-comment-text">${contentHtml}</span>
            <button class="moment-comment-reply-btn" onclick="Moments.replyComment('${m.id}', ${idx})">回复</button>
        </div>`;
    }).join('')}</div>` : '';
    // 评论输入框 - 添加表情包按钮
const commentInputWrap = `
    <div class="moment-comment-input-wrap" id="comment-wrap-${m.id}">
        <input type="text" class="moment-comment-input" id="comment-input-${m.id}" 
               placeholder="写评论..." maxlength="200"
               onkeydown="if(event.key==='Enter') Moments.sendComment('${m.id}')">
        <button class="moment-comment-emoji-btn" onclick="Moments.openCommentStickerPicker('${m.id}')" title="添加表情包" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-secondary);padding:4px 8px;flex-shrink:0;">
            😊
        </button>
        <button class="moment-comment-send-btn" onclick="Moments.sendComment('${m.id}')">发送</button>
    </div>
`;

    const timeAgo = getTimeAgo(m.timestamp);

    return `
        <div class="moment-card" data-id="${m.id}">
            <div class="moment-avatar">${avatarHtml}</div>
            <div class="moment-content">
                <div class="moment-header">
                    <span class="moment-author">${info.name}</span>
                    <span class="moment-time">${timeAgo}</span>
                    ${isMyMoment ? `<button class="moment-delete-btn" onclick="Moments.deleteMoment('${m.id}')">✕</button>` : ''}
                </div>
                <div class="moment-text">${m.text || ''}</div>
                ${mediaHtml}
                <div class="moment-actions">
                    <button class="moment-like-btn ${myLiked ? 'liked' : ''}" onclick="Moments.toggleLike('${m.id}')">
                        ${myLiked ? '❤️' : '🤍'} ${likeCount}
                    </button>
                    <button class="moment-comment-btn" onclick="Moments.focusComment('${m.id}')">
                        💬 ${(m.comments || []).length}
                    </button>
                </div>
                ${likesHtml}
                ${commentsHtml}
                ${commentInputWrap}
            </div>
        </div>
    `;
}

    // ========== 渲染朋友圈列表 ==========
    function render(containerId, mode) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const targetMode = mode || currentMode;
        currentMode = targetMode;
        // 同步到全局
        window.momentsMode = targetMode;

        getByMode(targetMode).then(moments => {
            if (!moments.length) {
                container.innerHTML = `
                    <div style="text-align:center;padding:40px;color:var(--text-secondary);">
                        <i class="fas fa-images" style="font-size:32px;opacity:0.3;display:block;margin-bottom:12px;"></i>
                        ${targetMode === 'partner' ? '还没有朋友圈动态，发一条吧 ✦' : '群成员还没有发朋友圈'}
                    </div>
                `;
                return;
            }

            // 显示最新 20 条
            const show = moments.slice(0, 20);
            container.innerHTML = show.map(m => buildMomentCard(m)).join('');

            // 加载更多
            if (moments.length > 20) {
                container.innerHTML += `
                    <div style="text-align:center;padding:12px;">
                        <button onclick="Moments.loadMore()" 
                                style="padding:8px 20px;border:1px solid var(--border-color);border-radius:20px;
                                       background:var(--secondary-bg);color:var(--text-secondary);cursor:pointer;font-size:12px;
                                       font-family:var(--font-family);">
                            加载更多（还有 ${moments.length - 20} 条）
                        </button>
                    </div>
                `;
            }
        });
    }
// ========== 评论表情包选择器 ==========
let _pendingCommentId = null;

function openCommentStickerPicker(momentId) {
    _pendingCommentId = momentId;
    
    // 检查是否有可用表情包
    const stickers = typeof myStickerLibrary !== 'undefined' && myStickerLibrary.length > 0 
        ? myStickerLibrary 
        : (typeof stickerLibrary !== 'undefined' && stickerLibrary.length > 0 
            ? stickerLibrary 
            : []);
    
    if (!stickers || stickers.length === 0) {
        showNotification('还没有表情包，请在聊天输入区添加 😊', 'warning');
        return;
    }
    
    // 创建选择器弹窗
    const oldPicker = document.getElementById('comment-sticker-picker');
    if (oldPicker) oldPicker.remove();
    
    const picker = document.createElement('div');
    picker.id = 'comment-sticker-picker';
    picker.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;
        display:flex;align-items:flex-end;justify-content:center;
        backdrop-filter:blur(4px);
    `;
    picker.onclick = function(e) {
        if (e.target === this) {
            this.remove();
            _pendingCommentId = null;
        }
    };
    
    // 生成表情包网格
    const stickerItems = stickers.map((sticker, index) => `
        <div style="padding:4px;background:var(--primary-bg);border-radius:8px;cursor:pointer;transition:transform 0.15s;border:1px solid var(--border-color);"
             onclick="Moments.insertCommentSticker('${_pendingCommentId}', ${index})"
             onmouseover="this.style.transform='scale(1.05)'"
             onmouseout="this.style.transform='scale(1)'">
            <img src="${sticker}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;display:block;">
        </div>
    `).join('');
    
    picker.innerHTML = `
        <div style="background:var(--secondary-bg);width:100%;max-width:500px;border-radius:20px 20px 0 0;padding:16px 16px max(env(safe-area-inset-bottom),16px);max-height:60vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <span style="font-size:15px;font-weight:600;color:var(--text-primary);">选择表情包</span>
                <button onclick="document.getElementById('comment-sticker-picker').remove();_pendingCommentId=null;" style="background:none;border:none;font-size:20px;color:var(--text-secondary);cursor:pointer;">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
                ${stickerItems}
            </div>
            <div style="margin-top:12px;text-align:center;">
                <button onclick="document.getElementById('comment-sticker-picker').remove();document.getElementById('comment-sticker-upload-input').click();" style="padding:8px 16px;border:1px dashed var(--border-color);border-radius:10px;background:var(--primary-bg);color:var(--text-secondary);cursor:pointer;font-size:13px;font-family:var(--font-family);">
                    <i class="fas fa-plus"></i> 添加新表情包
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(picker);
    
    // 添加文件上传输入
    const uploadInput = document.createElement('input');
    uploadInput.id = 'comment-sticker-upload-input';
    uploadInput.type = 'file';
    uploadInput.accept = 'image/*';
    uploadInput.multiple = true;
    uploadInput.style.display = 'none';
    uploadInput.onchange = function(e) {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = function(ev) {
                const base64 = ev.target.result;
                if (typeof myStickerLibrary !== 'undefined' && Array.isArray(myStickerLibrary)) {
                    myStickerLibrary.push(base64);
                    if (typeof throttledSaveData === 'function') throttledSaveData();
                    showNotification('✅ 表情包已添加', 'success');
                }
            };
            reader.readAsDataURL(file);
        });
        this.value = '';
        setTimeout(() => {
            if (document.getElementById('comment-sticker-picker')) {
                document.getElementById('comment-sticker-picker').remove();
                openCommentStickerPicker(_pendingCommentId);
            }
        }, 300);
    };
    document.body.appendChild(uploadInput);
}

function insertCommentSticker(momentId, stickerIndex) {
    if (!momentId) return;
    
    const stickers = typeof myStickerLibrary !== 'undefined' && myStickerLibrary.length > 0 
        ? myStickerLibrary 
        : (typeof stickerLibrary !== 'undefined' && stickerLibrary.length > 0 
            ? stickerLibrary 
            : []);
    
    const sticker = stickers[stickerIndex];
    if (!sticker) return;
    
    const input = document.getElementById('comment-input-' + momentId);
    if (!input) {
        showNotification('找不到评论输入框', 'error');
        return;
    }
    
    const currentText = input.value;
    input.value = currentText + (currentText ? ' ' : '') + '[表情包]';
    
    const picker = document.getElementById('comment-sticker-picker');
    if (picker) picker.remove();
    _pendingCommentId = null;
    
    sendCommentWithSticker(momentId, sticker);
}

async function sendCommentWithSticker(momentId, sticker) {
    const input = document.getElementById('comment-input-' + momentId);
    if (!input) return;
    
    const text = input.value.trim().replace(/\[表情包\]/g, '').trim();
    
    await update(momentId, (m) => {
        if (!m.comments) m.comments = [];
        m.comments.push({
            author: 'me',
            text: text || '',
            sticker: sticker,
            timestamp: Date.now()
        });
    });
    input.value = '';
    render('moments-list', currentMode);
    
    if (Math.random() < 0.3) {
        setTimeout(() => {
            simulateReply(momentId);
        }, 3000 + Math.random() * 5000);
    }
}

    // ========== 加载更多 ==========
    let loadMoreOffset = 20;

    function loadMore() {
        const container = document.getElementById('moments-list');
        if (!container) return;

        getByMode(currentMode).then(moments => {
            const start = loadMoreOffset;
            const end = start + 20;
            const more = moments.slice(start, end);
            if (!more.length) {
                showNotification('没有更多了', 'info');
                return;
            }
            // 移除"加载更多"按钮
            const loadMoreBtn = container.querySelector('button[onclick*="loadMore"]');
            if (loadMoreBtn) {
                loadMoreBtn.closest('div')?.remove();
            }
            // 追加新卡片
            more.forEach(m => {
                container.insertAdjacentHTML('beforeend', buildMomentCard(m));
            });
            loadMoreOffset = end;
            // 如果还有更多，重新添加加载更多按钮
            if (moments.length > end) {
                container.insertAdjacentHTML('beforeend', `
                    <div style="text-align:center;padding:12px;">
                        <button onclick="Moments.loadMore()" 
                                style="padding:8px 20px;border:1px solid var(--border-color);border-radius:20px;
                                       background:var(--secondary-bg);color:var(--text-secondary);cursor:pointer;font-size:12px;
                                       font-family:var(--font-family);">
                            加载更多（还有 ${moments.length - end} 条）
                        </button>
                    </div>
                `);
            }
        });
    }

    // ========== 用户操作 ==========
    async function publishMoment(text, media) {
        if (!text && !media) {
            showNotification('请写点什么或添加图片', 'warning');
            return;
        }

        const scene = currentMode === 'group' ? 'gc' : 'partner';
        const data = {
            author: scene === 'gc' ? 'me_gc' : 'me',
            text: text || '',
            media: media || null,
            scene: scene,
            timestamp: Date.now(),
            likes: [],
            comments: [],
            reactAttempts: 0
        };

        const id = await save(data);
        // 重置加载偏移
        loadMoreOffset = 20;
        render('moments-list', currentMode);
        showNotification('已发布 ✦', 'success');

        // 安排自动互动
        scheduleMomentReactions(id);
        return id;
    }

    async function toggleLike(id) {
        await update(id, (m) => {
            if (!m.likes) m.likes = [];
            const idx = m.likes.indexOf('me');
            if (idx > -1) {
                m.likes.splice(idx, 1);
            } else {
                m.likes.push('me');
            }
        });
        render('moments-list', currentMode);
    }

// ========== 发送评论（修复版 - 支持表情包） ==========
async function sendComment(id) {
    const input = document.getElementById('comment-input-' + id);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    console.log('📸 用户评论:', text);

    // 检测是否包含 [表情包] 标记
    if (text.includes('[表情包]')) {
        openCommentStickerPicker(id);
        return;
    }

    await update(id, (m) => {
        if (!m.comments) m.comments = [];
        m.comments.push({
            author: 'me',
            text: text,
            timestamp: Date.now()
        });
    });
    input.value = '';
    render('moments-list', currentMode);

    if (Math.random() < 0.3) {
        setTimeout(() => {
            simulateReply(id);
        }, 3000 + Math.random() * 5000);
    }
}

// ========== 模拟回复（修复版 - 支持表情包） ==========
async function simulateReply(id) {
    const all = await getAll();
    const m = all.find(item => item.id === id);
    if (!m) return;

    const replyPool = await getReplyPool();
    if (!replyPool.length) return;

    // 获取表情包库
    const stickers = typeof myStickerLibrary !== 'undefined' && myStickerLibrary.length > 0 
        ? myStickerLibrary 
        : (typeof stickerLibrary !== 'undefined' && stickerLibrary.length > 0 
            ? stickerLibrary 
            : []);

    // 回复评论：使用 1~4 张字卡组合
    const count = 1 + Math.floor(Math.random() * Math.min(4, replyPool.length));
    let text = '';
    for (let i = 0; i < count; i++) {
        text += replyPool[Math.floor(Math.random() * replyPool.length)] + ' ';
    }
    text = text.trim();
    
    // 🔥 30% 概率附带表情包，10% 概率只有表情包（没有文字）
let sticker = null;
const stickerRand = Math.random();
if (stickerRand < 0.10 && stickers.length > 0) {
    // 只有表情包，没有文字
    sticker = stickers[Math.floor(Math.random() * stickers.length)];
    text = '';
    console.log('📸 梦角回复：只有表情包');
} else if (stickerRand < 0.40 && stickers.length > 0) {
    // 文字 + 表情包
    sticker = stickers[Math.floor(Math.random() * stickers.length)];
    console.log('📸 梦角回复：文字 + 表情包');
}
    
    if (!m.comments) m.comments = [];
    
    // 40% 概率回复已有评论，60% 独立评论
    const hasComments = m.comments.length > 0;
    if (hasComments && Math.random() < 0.4) {
        const target = m.comments[Math.floor(Math.random() * m.comments.length)];
        const targetInfo = getAuthorInfo(target.author);
        const targetName = target.gcName || targetInfo.name || '成员';
        m.comments.push({
            author: 'partner',
            text: text,
            sticker: sticker,  // 可能包含表情包
            replyToName: targetName,
            replyToAuthor: target.author,
            timestamp: Date.now(),
            gcName: typeof settings !== 'undefined' ? settings.partnerName || '梦角' : '梦角'
        });
        console.log('📸 梦角回复了评论:', text);
    } else {
        m.comments.push({
            author: 'partner',
            text: text,
            sticker: sticker,  // 可能包含表情包
            timestamp: Date.now(),
            gcName: typeof settings !== 'undefined' ? settings.partnerName || '梦角' : '梦角'
        });
        console.log('📸 梦角独立评论:', text);
    }

    await saveAll(all);
    render('moments-list', currentMode);
    showNotification(`${typeof settings !== 'undefined' ? settings.partnerName || '梦角' : '梦角'} 评论了你`, 'info');
}

    async function deleteMoment(id) {
        if (!confirm('确定删除这条朋友圈？')) return;
        await remove(id);
        loadMoreOffset = 20;
        render('moments-list', currentMode);
        showNotification('已删除', 'info');
    }

    function focusComment(id) {
        const input = document.getElementById('comment-input-' + id);
        if (input) {
            input.focus();
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

  // ========== 回复评论（支持表情包） ==========
let _replyCommentData = null; // 存储待回复的评论信息

async function replyComment(id, commentIdx) {
    const all = await getAll();
    const m = all.find(item => item.id === id);
    if (!m || !m.comments || !m.comments[commentIdx]) {
        console.warn('📸 找不到评论或朋友圈');
        return;
    }
    
    const target = m.comments[commentIdx];
    const targetInfo = getAuthorInfo(target.author);
    const targetName = target.gcName || targetInfo.name || '成员';
    
    // 保存回复上下文
    _replyCommentData = {
        momentId: id,
        commentIdx: commentIdx,
        targetName: targetName,
        targetAuthor: target.author,
        moment: m
    };
    
    // 创建一个自定义回复输入框（替代 prompt）
    showReplyInputWithSticker(id, targetName);
}

// ========== 显示回复输入框（带表情包按钮） ==========
function showReplyInputWithSticker(momentId, targetName) {
    // 移除旧的回复输入框
    const old = document.getElementById('reply-sticker-input-container');
    if (old) old.remove();
    
    // 获取评论输入框的位置
    const commentWrap = document.getElementById('comment-wrap-' + momentId);
    if (!commentWrap) {
        // 如果找不到评论输入框，使用 prompt 作为降级
        const replyText = prompt(`回复 ${targetName}：`);
        if (replyText && replyText.trim()) {
            submitReplyWithText(momentId, replyText.trim());
        }
        return;
    }
    
    // 在评论输入框上方插入回复输入框
    const container = document.createElement('div');
    container.id = 'reply-sticker-input-container';
    container.style.cssText = `
        display:flex; align-items:center; gap:6px; 
        padding:6px 4px; background:var(--secondary-bg); 
        border-radius:10px; margin-bottom:6px;
        border:1px solid var(--border-color);
    `;
    
    container.innerHTML = `
        <span style="font-size:11px; color:var(--text-secondary); padding-left:4px; white-space:nowrap;">
            回复 ${targetName}：
        </span>
        <input type="text" id="reply-sticker-input" 
               placeholder="输入回复内容..." 
               style="flex:1; padding:5px 8px; border:1px solid var(--border-color); border-radius:8px; 
                      font-size:13px; background:var(--primary-bg); color:var(--text-primary); 
                      outline:none; font-family:var(--font-family); min-width:60px;">
        <button class="reply-emoji-btn" onclick="Moments.openReplyStickerPicker()" 
                title="添加表情包" 
                style="background:none; border:none; cursor:pointer; font-size:18px; 
                       color:var(--text-secondary); padding:4px 6px; flex-shrink:0;">
            😊
        </button>
        <button class="reply-send-btn" onclick="Moments.submitReplyWithSticker()" 
                style="padding:4px 12px; background:var(--accent-color); color:#fff; 
                       border:none; border-radius:8px; font-size:12px; cursor:pointer; 
                       font-weight:600; font-family:var(--font-family); flex-shrink:0;">
            发送
        </button>
        <button class="reply-cancel-btn" onclick="Moments.cancelReplyInput()" 
                style="background:none; border:none; color:var(--text-secondary); 
                       cursor:pointer; font-size:14px; padding:2px 4px; flex-shrink:0;">
            ✕
        </button>
    `;
    
    // 插入到评论输入框前面
    commentWrap.parentNode.insertBefore(container, commentWrap);
    
    // 聚焦输入框
    const input = document.getElementById('reply-sticker-input');
    if (input) setTimeout(() => input.focus(), 100);
    
    // 回车发送
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitReplyWithSticker();
        }
    });
}

// ========== 取消回复输入 ==========
function cancelReplyInput() {
    const container = document.getElementById('reply-sticker-input-container');
    if (container) container.remove();
    _replyCommentData = null;
}

// ========== 打开回复表情包选择器 ==========
let _replyStickerPending = false;

function openReplyStickerPicker() {
    _replyStickerPending = true;
    
    // 检查是否有可用表情包
    const stickers = typeof myStickerLibrary !== 'undefined' && myStickerLibrary.length > 0 
        ? myStickerLibrary 
        : (typeof stickerLibrary !== 'undefined' && stickerLibrary.length > 0 
            ? stickerLibrary 
            : []);
    
    if (!stickers || stickers.length === 0) {
        showNotification('还没有表情包，请在聊天输入区添加 😊', 'warning');
        _replyStickerPending = false;
        return;
    }
    
    // 创建选择器弹窗
    const oldPicker = document.getElementById('reply-sticker-picker');
    if (oldPicker) oldPicker.remove();
    
    const picker = document.createElement('div');
    picker.id = 'reply-sticker-picker';
    picker.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:99999;
        display:flex; align-items:flex-end; justify-content:center;
        backdrop-filter:blur(4px);
    `;
    picker.onclick = function(e) {
        if (e.target === this) {
            this.remove();
            _replyStickerPending = false;
        }
    };
    
    const stickerItems = stickers.map((sticker, index) => `
        <div style="padding:4px; background:var(--primary-bg); border-radius:8px; cursor:pointer; 
                    transition:transform 0.15s; border:1px solid var(--border-color);"
             onclick="Moments.insertReplySticker(${index})"
             onmouseover="this.style.transform='scale(1.05)'"
             onmouseout="this.style.transform='scale(1)'">
            <img src="${sticker}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; display:block;">
        </div>
    `).join('');
    
    picker.innerHTML = `
        <div style="background:var(--secondary-bg); width:100%; max-width:500px; border-radius:20px 20px 0 0; 
                    padding:16px 16px max(env(safe-area-inset-bottom),16px); max-height:60vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-size:15px; font-weight:600; color:var(--text-primary);">选择表情包（回复）</span>
                <button onclick="document.getElementById('reply-sticker-picker').remove(); _replyStickerPending=false;" 
                        style="background:none; border:none; font-size:20px; color:var(--text-secondary); cursor:pointer;">✕</button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px;">
                ${stickerItems}
            </div>
        </div>
    `;
    document.body.appendChild(picker);
}

// ========== 插入回复表情包 ==========
function insertReplySticker(stickerIndex) {
    const stickers = typeof myStickerLibrary !== 'undefined' && myStickerLibrary.length > 0 
        ? myStickerLibrary 
        : (typeof stickerLibrary !== 'undefined' && stickerLibrary.length > 0 
            ? stickerLibrary 
            : []);
    
    const sticker = stickers[stickerIndex];
    if (!sticker) return;
    
    // 关闭选择器
    const picker = document.getElementById('reply-sticker-picker');
    if (picker) picker.remove();
    _replyStickerPending = false;
    
    // 在回复输入框中插入表情包标记
    const input = document.getElementById('reply-sticker-input');
    if (input) {
        const currentText = input.value;
        input.value = currentText + (currentText ? ' ' : '') + '[表情包]';
        // 保存 sticker 到全局，供提交时使用
        window._replyStickerData = sticker;
        input.focus();
        showNotification('✅ 已添加表情包，点击发送即可', 'success');
    }
}

// ========== 提交带表情包的回复 ==========
async function submitReplyWithSticker() {
    const input = document.getElementById('reply-sticker-input');
    if (!input) return;
    
    const text = input.value.trim().replace(/\[表情包\]/g, '').trim();
    const sticker = window._replyStickerData || null;
    window._replyStickerData = null;
    
    if (!text && !sticker) {
        showNotification('请输入内容或选择表情包', 'warning');
        return;
    }
    
    if (!_replyCommentData) {
        showNotification('回复上下文丢失，请重新操作', 'error');
        cancelReplyInput();
        return;
    }
    
    const { momentId, targetName, targetAuthor } = _replyCommentData;
    
    try {
        await update(momentId, (m) => {
            if (!m.comments) m.comments = [];
            m.comments.push({
                author: 'me',
                text: text || '',
                sticker: sticker || null,
                replyToName: targetName,
                replyToAuthor: targetAuthor,
                timestamp: Date.now()
            });
        });
        
        // 清理
        cancelReplyInput();
        render('moments-list', currentMode);
        showNotification('✅ 回复已发送', 'success');
        
        // 模拟对方回复
        if (Math.random() < 0.3) {
            setTimeout(() => {
                simulateReply(momentId);
            }, 3000 + Math.random() * 5000);
        }
    } catch (err) {
        console.error('回复失败:', err);
        showNotification('回复失败，请重试', 'error');
    }
}

// ========== 纯文字回复（降级方案） ==========
async function submitReplyWithText(momentId, text) {
    if (!_replyCommentData) {
        showNotification('回复上下文丢失', 'error');
        return;
    }
    
    const { targetName, targetAuthor } = _replyCommentData;
    
    try {
        await update(momentId, (m) => {
            if (!m.comments) m.comments = [];
            m.comments.push({
                author: 'me',
                text: text,
                replyToName: targetName,
                replyToAuthor: targetAuthor,
                timestamp: Date.now()
            });
        });
        _replyCommentData = null;
        render('moments-list', currentMode);
        showNotification('✅ 回复已发送', 'success');
    } catch (err) {
        showNotification('回复失败', 'error');
    }
}

    // ========== 自动引擎 ==========
    let autoTimers = [];

    function scheduleAutoMoments() {
        // 清除旧定时器
        autoTimers.forEach(t => clearTimeout(t));
        autoTimers = [];

        // 每天随机发 0~3 条
        const dayCount = Math.floor(Math.random() * 4);
        const interval = 2 * 60 * 60 * 1000; // 至少间隔2小时

        for (let i = 0; i < dayCount; i++) {
            const delay = interval + Math.random() * 4 * 60 * 60 * 1000;
            const timer = setTimeout(() => {
                generateAutoMoment();
            }, delay);
            autoTimers.push(timer);
        }
    }

  // ========== 自动发圈（修复版 - 支持表情包配图） ==========
async function generateAutoMoment() {
    console.log('📸 开始生成自动朋友圈');
    
    const pool = await getReplyPool();
    if (!pool.length) {
        console.warn('📸 没有可用字卡，跳过自动发圈');
        return;
    }

    console.log('📸 字卡池大小:', pool.length);

    // 发朋友圈：使用 3~8 张字卡
    const maxCount = Math.min(8, pool.length);
    const count = 3 + Math.floor(Math.random() * (maxCount - 2));
    let text = '';
    for (let i = 0; i < count; i++) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        text += pick + ' ';
    }
    text = text.trim();

    // 随机加 emoji
    const emojis = ['💕', '🥺', '✨', '🌙', '❤️', '😘', '🤍', '🌸', '🫶', '☁️'];
    if (Math.random() < 0.3) {
        text += ' ' + emojis[Math.floor(Math.random() * emojis.length)];
    }

        // 🔥 随机从表情包库选取配图（30% 概率）
    let media = null;
    if (Math.random() < 0.3) {
        try {
            // 🔥 优先使用 myStickerLibrary（用户自己的表情包），如果没有则用 stickerLibrary
            let stickers = [];
            if (typeof myStickerLibrary !== 'undefined' && myStickerLibrary.length > 0) {
                stickers = myStickerLibrary;
            } else if (typeof stickerLibrary !== 'undefined' && stickerLibrary.length > 0) {
                stickers = stickerLibrary;
            }
            if (stickers && stickers.length > 0) {
                media = stickers[Math.floor(Math.random() * stickers.length)];
                console.log('📸 自动发圈配图：已添加表情包');
            }
        } catch (e) {
            console.warn('📸 获取表情包失败:', e);
        }
    }

    console.log('📸 自动发圈内容:', text);

    const data = {
        author: 'partner',
        text: text,
        media: media,  // ← 现在可能包含表情包图片
        scene: 'partner',
        timestamp: Date.now(),
        likes: [],
        comments: [],
        reactAttempts: 0
    };

    try {
        await save(data);
        console.log('📸 自动发圈保存成功');
        render('moments-list', currentMode);
        showNotification(`${typeof settings !== 'undefined' ? settings.partnerName || '梦角' : '梦角'} 发布了新动态 ✦`, 'info');

        // 安排互动
        scheduleMomentReactions(data.id);
    } catch (err) {
        console.error('❌ 自动发圈失败:', err);
    }
}

    function scheduleMomentReactions(momentId) {
        // 在 1~3 分钟内开始第一次互动
        const delay = 60000 + Math.random() * 120000;
        setTimeout(() => {
            triggerReaction(momentId);
        }, delay);

        // 之后每隔 2~4 小时再尝试一次，最多 3 次
        for (let i = 1; i < 3; i++) {
            const interval = 2 * 60 * 60 * 1000 + Math.random() * 2 * 60 * 60 * 1000;
            setTimeout(() => {
                triggerReaction(momentId);
            }, delay + interval * i);
        }
    }

   // ========== 触发互动（修复版） ==========
async function triggerReaction(momentId) {
    console.log('📸 触发互动:', momentId);
    
    const all = await getAll();
    const m = all.find(item => item.id === momentId);
    if (!m) {
        console.warn('❌ 找不到朋友圈:', momentId);
        return;
    }

    // 检查是否已尝试过太多次
    if (m.reactAttempts >= 5) {
        console.log('📸 已达到最大尝试次数');
        return;
    }
    m.reactAttempts = (m.reactAttempts || 0) + 1;

    // 检查召唤加成
    const boostActive = isBoostActive('like') || isBoostActive('comment');
    const likeChance = boostActive ? 0.35 : 0.08;
    const commentChance = boostActive ? 0.35 : 0.08;

    let changed = false;

    // 点赞
    if (Math.random() < likeChance && (!m.likes || !m.likes.includes('partner'))) {
        if (!m.likes) m.likes = [];
        m.likes.push('partner');
        changed = true;
        console.log('📸 梦角点赞了');
        showNotification(`${typeof settings !== 'undefined' ? settings.partnerName || '梦角' : '梦角'} 点赞了你`, 'info');
    }

       // 评论
if (Math.random() < commentChance) {
    const pool = await getReplyPool();
    if (pool.length) {
        // 获取表情包库
        const stickers = typeof myStickerLibrary !== 'undefined' && myStickerLibrary.length > 0 
            ? myStickerLibrary 
            : (typeof stickerLibrary !== 'undefined' && stickerLibrary.length > 0 
                ? stickerLibrary 
                : []);
        
        // 使用 1~4 张字卡组合
        const count = 1 + Math.floor(Math.random() * Math.min(4, pool.length));
        let text = '';
        for (let i = 0; i < count; i++) {
            text += pool[Math.floor(Math.random() * pool.length)] + ' ';
        }
        text = text.trim();
        
       // 🔥 25% 概率附带表情包，10% 概率只有表情包
let sticker = null;
const stickerRand = Math.random();
if (stickerRand < 0.10 && stickers.length > 0) {
    sticker = stickers[Math.floor(Math.random() * stickers.length)];
    text = '';
    console.log('📸 梦角自动评论：只有表情包');
} else if (stickerRand < 0.35 && stickers.length > 0) {
    sticker = stickers[Math.floor(Math.random() * stickers.length)];
    console.log('📸 梦角自动评论：文字 + 表情包');
}
        
        if (!m.comments) m.comments = [];
        const hasComments = m.comments.length > 0;
        if (hasComments && Math.random() < 0.2) {
            const target = m.comments[Math.floor(Math.random() * m.comments.length)];
            const targetInfo = getAuthorInfo(target.author);
            const targetName = target.gcName || targetInfo.name || '成员';
            m.comments.push({
                author: 'partner',
                text: text,
                sticker: sticker,
                replyToName: targetName,
                replyToAuthor: target.author,
                timestamp: Date.now(),
                gcName: typeof settings !== 'undefined' ? settings.partnerName || '梦角' : '梦角'
            });
            console.log('📸 梦角回复了评论');
        } else {
            m.comments.push({
                author: 'partner',
                text: text,
                sticker: sticker,
                timestamp: Date.now(),
                gcName: typeof settings !== 'undefined' ? settings.partnerName || '梦角' : '梦角'
            });
            console.log('📸 梦角独立评论了');
        }
        changed = true;
        showNotification(`${typeof settings !== 'undefined' ? settings.partnerName || '梦角' : '梦角'} 评论了你`, 'info');
    }
}
    if (changed) {
        // 保存数据
        await saveAll(all);
        // 重新渲染
        render('moments-list', currentMode);
        console.log('📸 互动已保存并刷新');
    } else {
        // 没触发互动，但也要保存尝试次数
        await saveAll(all);
        console.log('📸 本次未触发互动，已记录尝试次数');
    }
}

    // ========== 召唤功能 ==========
    function boostMoment(type) {
        boostExpiry[type] = Date.now() + 3600000; // 1小时
        // 同步到全局
        window.momentsBoost = boostExpiry;
        
        const labels = {
            moment: '发朋友圈',
            like: '点赞',
            comment: '评论'
        };
        showNotification(`已召唤 ${labels[type]} 🌸 接下来1小时更活跃`, 'success');
        
        if (type === 'moment') {
            // 触发一次额外发圈
            setTimeout(() => {
                if (isBoostActive(type) && Math.random() < 0.6) {
                    generateAutoMoment();
                }
            }, 30000 + Math.random() * 60000);
        }
    }

    function isBoostActive(type) {
        return boostExpiry[type] && Date.now() < boostExpiry[type];
    }

    // ========== 通知系统 ==========
    function showNotification(msg, type) {
        // 使用已有的通知系统
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, type);
            return;
        }
        // 备用通知
        const el = document.createElement('div');
        el.style.cssText = `
            position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
            padding:10px 20px;border-radius:12px;
            background:rgba(0,0,0,0.8);color:#fff;
            font-size:13px;z-index:9999;max-width:90%;text-align:center;
            backdrop-filter:blur(10px);
        `;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.3s';
            setTimeout(() => el.remove(), 400);
        }, 3000);
    }

    // ========== 设置模式 ==========
    function setMode(mode) {
        currentMode = mode;
        window.momentsMode = mode;
    }

    function getMode() {
        return currentMode;
    }

    // ========== 重置加载偏移 ==========
    function resetLoadMore() {
        loadMoreOffset = 20;
    }

    // ========== 公开 API ==========
    window.Moments = {
        // 数据操作
        getAll,
        save,
        update,
        remove,
        clearAll,
        saveAll,
        getByMode,
        
        // UI 渲染
        render,
        loadMore,
        resetLoadMore,
        buildMomentCard,
        
        // 用户操作
        publishMoment,
        toggleLike,
        sendComment,
        replyComment,
        deleteMoment,
        focusComment,
        
        // 自动引擎
        scheduleAutoMoments,
        scheduleMomentReactions,
        generateAutoMoment,
        simulateReply,
        
        // 召唤
        boostMoment,
        isBoostActive,
        
        // 模式
        setMode,
        getMode,

        // 回复表情包相关
        replyComment,
        showReplyInputWithSticker,
        cancelReplyInput,
        openReplyStickerPicker,
        insertReplySticker,
        submitReplyWithSticker,
        submitReplyWithText,
 
        // 新增
        openCommentStickerPicker,
        insertCommentSticker,
        sendCommentWithSticker,
        sendComment,  // 覆盖原有 sendComment
        
        // 工具
        getReplyPool: async function() { return await getReplyPool(); },
        getTimeAgo,
        getAuthorInfo
    };

    // 如果页面已加载，自动调度
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => {
            window.Moments.scheduleAutoMoments();
        }, 5000);
    }
    // ========== 图片放大预览功能 ==========
    function openImageViewer(imageSrc) {
        if (!imageSrc) return;
        
        const overlay = document.getElementById('image-viewer-overlay');
        const img = document.getElementById('image-viewer-img');
        
        if (!overlay || !img) {
            // 如果元素不存在，动态创建
            const newOverlay = document.createElement('div');
            newOverlay.id = 'image-viewer-overlay';
            newOverlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99999;cursor:zoom-out;align-items:center;justify-content:center;flex-direction:column;padding:20px;backdrop-filter:blur(10px);';
            newOverlay.onclick = closeImageViewer;
            
            newOverlay.innerHTML = `
                <div style="position:absolute;top:max(env(safe-area-inset-top),20px);right:20px;color:rgba(255,255,255,0.7);font-size:24px;cursor:pointer;z-index:10;background:rgba(0,0,0,0.3);border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;transition:all 0.3s;" onclick="event.stopPropagation();closeImageViewer()">
                    <i class="fas fa-times"></i>
                </div>
                <img id="image-viewer-img" src="" style="max-width:95%;max-height:85vh;border-radius:8px;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,0.5);user-select:none;-webkit-user-select:none;" onclick="event.stopPropagation()">
                <div style="position:absolute;bottom:max(env(safe-area-inset-bottom),30px);left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.5);font-size:13px;letter-spacing:0.5px;background:rgba(0,0,0,0.4);padding:6px 16px;border-radius:20px;backdrop-filter:blur(4px);">
                    点击空白处关闭
                </div>
            `;
            document.body.appendChild(newOverlay);
            
            const newImg = document.getElementById('image-viewer-img');
            if (newImg) {
                newImg.src = imageSrc;
                newOverlay.style.display = 'flex';
            }
            return;
        }
        
        img.src = imageSrc;
        overlay.style.display = 'flex';
        
        // 添加键盘 ESC 关闭支持
        document.addEventListener('keydown', handleImageViewerKeydown);
    }

    function closeImageViewer() {
        const overlay = document.getElementById('image-viewer-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            const img = document.getElementById('image-viewer-img');
            if (img) {
                setTimeout(function() { img.src = ''; }, 300);
            }
        }
        document.removeEventListener('keydown', handleImageViewerKeydown);
    }

    function handleImageViewerKeydown(e) {
        if (e.key === 'Escape') {
            closeImageViewer();
        }
    }

    // 将函数暴露到全局，供 HTML onclick 调用
    window.openImageViewer = openImageViewer;
    window.closeImageViewer = closeImageViewer;

})();