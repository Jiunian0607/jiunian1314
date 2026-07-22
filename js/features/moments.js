// js/features/moments.js
(function() {
    'use strict';

    console.log('🔄 初始化朋友圈...');

 // 定义 boostExpiry（用于召唤功能）
    var boostExpiry = { moment: 0, like: 0, comment: 0 };

// ========== 模式 ==========
    var currentMode = window.momentsMode || 'partner';  // 🔥 移到顶部
    var loadMoreOffset = 20;

    // ========== 数据操作 ==========
async function getAll() {
    try {
        // 优先使用 state.js 中定义的 momentsDB（独立 store）
        if (window.momentsDB && typeof window.momentsDB.getItem === 'function') {
            var list = await window.momentsDB.getItem('moments_list') || [];
            return list;
        }
        // 降级：使用 localforage
        var list = await localforage.getItem('moments_list') || [];
        return list;
    } catch (e) {
        console.error('读取朋友圈失败:', e);
        // 再降级：使用 localStorage
        try {
            var fallback = JSON.parse(localStorage.getItem('moments_list_fallback') || '[]');
            return fallback;
        } catch (e2) {
            return [];
        }
    }
}

async function saveMoment(data) {
    try {
        var list = await getAll();
        data.id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        data.timestamp = data.timestamp || Date.now();
        data.likes = data.likes || [];
        data.comments = data.comments || [];
        data.reactAttempts = data.reactAttempts || 0;
        
        // 🔥 确保 media 是字符串（只做类型转换，不压缩）
        if (data.media && typeof data.media !== 'string') {
            data.media = String(data.media);
        }
        
        list.unshift(data);
        
        // 使用独立 store 保存
        if (window.momentsDB && typeof window.momentsDB.setItem === 'function') {
            await window.momentsDB.setItem('moments_list', list);
        } else {
            await localforage.setItem('moments_list', list);
        }
        
        // 备份到 localStorage（只备份最近50条）
        try {
            const backupList = list.slice(0, 50);
            localStorage.setItem('moments_list_fallback', JSON.stringify(backupList));
        } catch (e) {
            // 备份失败不影响主流程
        }
        return data.id;
    } catch (err) {
        console.error('保存朋友圈失败:', err);
        // 降级：尝试 localStorage
        try {
            var fallbackList = JSON.parse(localStorage.getItem('moments_list_fallback') || '[]');
            fallbackList.unshift(data);
            if (fallbackList.length > 50) {
                fallbackList = fallbackList.slice(0, 50);
            }
            localStorage.setItem('moments_list_fallback', JSON.stringify(fallbackList));
            console.warn('已降级保存到 localStorage');
            return data.id;
        } catch (e2) {
            if (typeof showNotification === 'function') {
                showNotification('⚠️ 存储空间不足，请清理缓存', 'warning');
            }
            throw err;
        }
    }
}

async function updateMoment(id, updater) {
    try {
        var list = await getAll();
        var idx = list.findIndex(function(m) { return m.id === id; });
        if (idx === -1) return false;
        updater(list[idx]);
        
        if (window.momentsDB && typeof window.momentsDB.setItem === 'function') {
            await window.momentsDB.setItem('moments_list', list);
        } else {
            await localforage.setItem('moments_list', list);
        }
        return true;
    } catch (e) {
        console.error('更新朋友圈失败:', e);
        return false;
    }
}

async function removeMoment(id) {
    try {
        var list = await getAll();
        list = list.filter(function(m) { return m.id !== id; });
        
        if (window.momentsDB && typeof window.momentsDB.setItem === 'function') {
            await window.momentsDB.setItem('moments_list', list);
        } else {
            await localforage.setItem('moments_list', list);
        }
        // 同步更新 localStorage 备份
        try {
            localStorage.setItem('moments_list_fallback', JSON.stringify(list.slice(0, 50)));
        } catch (e) {}
        return true;
    } catch (e) {
        console.error('删除朋友圈失败:', e);
        return false;
    }
}

// 🔥 把 clearAll 移到 saveAll 之前
async function clearAll() {
    try {
        if (window.momentsDB && typeof window.momentsDB.removeItem === 'function') {
            await window.momentsDB.removeItem('moments_list');
        } else {
            await localforage.removeItem('moments_list');
        }
        localStorage.removeItem('moments_list_fallback');
        return true;
    } catch (e) {
        console.error('清空朋友圈失败:', e);
        return false;
    }
}

async function saveAll(data) {
    try {
        // 限制数据大小：只保留最新 100 条
        let dataToSave = data;
        if (Array.isArray(data) && data.length > 100) {
            dataToSave = data.slice(0, 100);
            console.warn('📸 朋友圈数据超过100条，仅保存最新100条');
        }
        
        if (window.momentsDB && typeof window.momentsDB.setItem === 'function') {
            await window.momentsDB.setItem('moments_list', dataToSave);
        } else {
            await localforage.setItem('moments_list', dataToSave);
        }
        
        // 同步备份到 localStorage
        try {
            localStorage.setItem('moments_list_fallback', JSON.stringify(dataToSave.slice(0, 50)));
        } catch (e) {}
    } catch (e) {
        console.error('批量保存朋友圈失败:', e);
        // 降级到 localStorage
        try {
            const toSave = Array.isArray(data) ? data.slice(0, 50) : data;
            localStorage.setItem('moments_list_fallback', JSON.stringify(toSave));
        } catch (e2) {
            console.error('降级保存也失败:', e2);
        }
    }
}

async function getByMode(mode) {
    var all = await getAll();
    if (mode === 'partner') {
        return all.filter(function(m) { return m.author === 'partner' || m.author === 'me' || m.author === 'me_gc'; });
    }
    if (mode === 'group') {
        return all.filter(function(m) { return m.author && m.author.startsWith('gc_'); });
    }
    return all;
}

    // ========== 获取作者信息 ==========
    function getAvatarFromElement(selector) {
        var el = document.querySelector(selector);
        if (!el) return '';
        var img = el.querySelector('img');
        if (img && img.src && !img.src.includes('placeholder')) {
            return img.src;
        }
        return '';
    }

function getAuthorInfo(author) {
    var isMe = author === 'me' || author === 'me_gc';
    var isPartner = author === 'partner';
    var s = typeof settings !== 'undefined' ? settings : {};
    var name = '未知';
    var avatar = '';

    // 🔥 优先从 momentAvatars 读取头像
    if (window.momentAvatars && window.momentAvatars[author]) {
        avatar = window.momentAvatars[author];
    }

    if (isMe) {
        name = s.myName || '我';
        if (!avatar) avatar = getAvatarFromElement('#my-avatar') || s.myAvatar || '';
    } else if (isPartner) {
        name = s.partnerName || '梦角';
        if (!avatar) avatar = getAvatarFromElement('#partner-avatar') || s.partnerAvatar || '';
    }
    return { name: name, avatar: avatar, isMe: isMe, isPartner: isPartner };
}

    // ========== 时间格式化 ==========
    function getTimeAgo(timestamp) {
        var diff = Date.now() - timestamp;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
        return new Date(timestamp).toLocaleDateString();
    }

    // ========== 获取回复池 ==========
    async function getReplyPool() {
        var replies = [];
        if (typeof customReplies !== 'undefined' && customReplies && customReplies.length) {
            var first = customReplies[0];
            if (typeof first === 'string') {
                replies = customReplies;
            } else if (first && typeof first === 'object') {
                replies = customReplies.map(function(c) { return c.text || c.replyText || c.content || String(c); }).filter(Boolean);
            }
        }
        if (replies.length === 0) {
            try {
                var possibleKeys = ['customReplies', 'custom_replies', 'replyLibrary'];
                for (var ki = 0; ki < possibleKeys.length; ki++) {
                    var stored = localStorage.getItem(possibleKeys[ki]);
                    if (stored) {
                        var parsed = JSON.parse(stored);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            replies = parsed.map(function(c) { return typeof c === 'string' ? c : (c.text || c.replyText || String(c)); }).filter(Boolean);
                            if (replies.length > 0) break;
                        }
                    }
                }
            } catch (e) {}
        }
        if (replies.length === 0) {
            replies = ['好棒！', '喜欢 ❤️', '想你', '今天也要开心哦', '收到 ✦', '嗯嗯', '好的', '知道了', '哈哈', '真的吗？'];
        }
        return replies;
    }

    // ========== 获取表情包库 ==========
    function getStickerLibrary() {
        var stickers = [];
        if (typeof myStickerLibrary !== 'undefined' && myStickerLibrary.length > 0) {
            stickers = myStickerLibrary;
        } else if (typeof stickerLibrary !== 'undefined' && stickerLibrary.length > 0) {
            stickers = stickerLibrary;
        }
        return stickers;
    }

    // ========== 构建卡片（完整版 - 支持表情包显示） ==========
    function buildMomentCard(m) {
        var info = getAuthorInfo(m.author);
        var isMyMoment = info.isMe || m.author === 'me';

        // 头像
        var avatarHtml = '<i class="fas fa-user" style="font-size:16px;color:var(--text-secondary);"></i>';
        if (info.avatar) {
            avatarHtml = '<img src="' + info.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display=\'none\'">';
        }

// 媒体图片
var mediaHtml = '';
if (m.media) {
    // 🔥 确保 media 是字符串
    var mediaStr = typeof m.media === 'string' ? m.media : '';
    if (mediaStr && mediaStr.length > 100) {
        var safeSrc = mediaStr.replace(/'/g, "\\'");
        mediaHtml = '<img src="' + mediaStr + '" class="moment-media" loading="lazy" onclick="window.openImageViewer && window.openImageViewer(\'' + safeSrc + '\')" style="cursor:pointer;max-width:100%;max-height:300px;border-radius:12px;margin-top:8px;" onerror="this.style.display=\'none\'">';
    }
}

        // 点赞
        var myLiked = m.likes && m.likes.indexOf('me') > -1;
        var likeCount = (m.likes || []).length;
        var likeNames = [];
        if (m.likes) {
            m.likes.forEach(function(l) {
                if (l === 'me') likeNames.push((window.settings && window.settings.myName) || '我');
                else if (l === 'partner') likeNames.push((window.settings && window.settings.partnerName) || '梦角');
            });
        }
        var likesHtml = likeNames.length ? '<div class="moment-likes">❤️ ' + likeNames.join('、') + '</div>' : '';

// ========== 评论渲染（表情包显示为图片） ==========
var commentsHtml = '';
if (m.comments && m.comments.length) {
    commentsHtml = '<div class="moment-comments">';
    for (var ci = 0; ci < m.comments.length; ci++) {
        var c = m.comments[ci];
        var cInfo = getAuthorInfo(c.author);
        var cName = c.gcName || cInfo.name || '成员';
        var replyToHtml = c.replyToName ? '<span class="moment-comment-reply-to">回复 ' + c.replyToName + '</span>' : '';
        
        // 🔥 表情包显示为图片 - 添加类型检查
        var stickerHtml = '';
        if (c.sticker && typeof c.sticker === 'string') {
            var safeSticker = c.sticker.replace(/'/g, "\\'");
            stickerHtml = '<img src="' + c.sticker + '" style="max-height:30px;max-width:80px;border-radius:6px;vertical-align:middle;cursor:pointer;" onclick="window.openImageViewer && window.openImageViewer(\'' + safeSticker + '\')" onerror="this.style.display=\'none\'">';
        }
        
        var textHtml = c.text || '';
        // 如果只有表情包没有文字
        var contentHtml = '';
        if (stickerHtml && textHtml) {
            contentHtml = textHtml + ' ' + stickerHtml;
        } else if (stickerHtml) {
            contentHtml = stickerHtml;
        } else {
            contentHtml = textHtml;
        }
        
        // 删除按钮（仅自己的评论可删）
        var deleteBtn = '';
        if (c.author === 'me') {
            var commentId = c.id || Date.now() + '_' + ci;
            deleteBtn = '<button class="moment-comment-delete-btn" onclick="Moments.deleteComment(\'' + m.id + '\', \'' + commentId + '\')" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:12px;padding:0 4px;">✕</button>';
        }
        commentsHtml += '<div class="moment-comment">' +
            '<span class="moment-comment-author">' + cName + '</span>' +
            replyToHtml +
            '<span class="moment-comment-text">' + contentHtml + '</span>' +
            '<button class="moment-comment-reply-btn" onclick="Moments.replyComment(\'' + m.id + '\', ' + ci + ')">回复</button>' +
            deleteBtn +
        '</div>';
    }
    commentsHtml += '</div>';
}

        // ========== 评论输入框 ==========
        var commentInputWrap = '<div class="moment-comment-input-wrap" id="comment-wrap-' + m.id + '">' +
            '<input type="text" class="moment-comment-input" id="comment-input-' + m.id + '" placeholder="写评论..." maxlength="200" onkeydown="if(event.key===\'Enter\') Moments.sendComment(\'' + m.id + '\')">' +
            '<button class="moment-comment-emoji-btn" onclick="Moments.openCommentStickerPicker(\'' + m.id + '\')" title="添加表情包" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-secondary);padding:4px 8px;flex-shrink:0;">😊</button>' +
            '<button class="moment-comment-send-btn" onclick="Moments.sendComment(\'' + m.id + '\')">发送</button>' +
            '</div>';

        var timeAgo = getTimeAgo(m.timestamp);
        var deleteMomentBtn = isMyMoment ? '<button class="moment-delete-btn" onclick="Moments.deleteMoment(\'' + m.id + '\')">✕</button>' : '';
        var likedClass = myLiked ? 'liked' : '';
        var likeBtnText = myLiked ? '❤️' : '🤍';

        return '<div class="moment-card" data-id="' + m.id + '">' +
            '<div class="moment-avatar">' + avatarHtml + '</div>' +
            '<div class="moment-content">' +
                '<div class="moment-header">' +
                    '<span class="moment-author">' + info.name + '</span>' +
                    '<span class="moment-time">' + timeAgo + '</span>' +
                    deleteMomentBtn +
                '</div>' +
                '<div class="moment-text">' + (m.text || '') + '</div>' +
                mediaHtml +
                '<div class="moment-actions">' +
                    '<button class="moment-like-btn ' + likedClass + '" onclick="Moments.toggleLike(\'' + m.id + '\')">' + likeBtnText + ' ' + likeCount + '</button>' +
                    '<button class="moment-comment-btn" onclick="Moments.focusComment(\'' + m.id + '\')">💬 ' + (m.comments || []).length + '</button>' +
                '</div>' +
                likesHtml +
                commentsHtml +
                commentInputWrap +
            '</div>' +
        '</div>';
    }

    // ========== 渲染 ==========
    function render(containerId, mode) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var targetMode = mode || currentMode;
        currentMode = targetMode;
        window.momentsMode = targetMode;

        getByMode(targetMode).then(function(moments) {
            if (!moments.length) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">' +
                    '<i class="fas fa-images" style="font-size:32px;opacity:0.3;display:block;margin-bottom:12px;"></i>' +
                    (targetMode === 'partner' ? '还没有朋友圈动态，发一条吧 ✦' : '群成员还没有发朋友圈') +
                '</div>';
                return;
            }

            var show = moments.slice(0, 20);
            var html = '';
            for (var i = 0; i < show.length; i++) {
                html += buildMomentCard(show[i]);
            }
            container.innerHTML = html;
        });
    }

    function loadMore() {
        var container = document.getElementById('moments-list');
        if (!container) return;

        getByMode(currentMode).then(function(moments) {
            var start = loadMoreOffset;
            var end = start + 20;
            var more = moments.slice(start, end);
            if (!more.length) {
                showNotification('没有更多了', 'info');
                return;
            }
            var loadMoreBtn = container.querySelector('button[onclick*="loadMore"]');
            if (loadMoreBtn) {
                var parent = loadMoreBtn.parentNode;
                if (parent) parent.remove();
            }
            var html = '';
            for (var i = 0; i < more.length; i++) {
                html += buildMomentCard(more[i]);
            }
            container.insertAdjacentHTML('beforeend', html);
            loadMoreOffset = end;
            if (moments.length > end) {
                container.insertAdjacentHTML('beforeend',
                    '<div style="text-align:center;padding:12px;"><button onclick="Moments.loadMore()" style="padding:8px 20px;border:1px solid var(--border-color);border-radius:20px;background:var(--secondary-bg);color:var(--text-secondary);cursor:pointer;font-size:12px;font-family:var(--font-family);">加载更多（还有 ' + (moments.length - end) + ' 条）</button></div>'
                );
            }
        });
    }

    // ========== 图片处理 ==========
    function processImage(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var base64 = e.target.result;
                if (base64.length < 1.5 * 1024 * 1024) {
                    resolve(base64);
                    return;
                }
                var img = new Image();
                img.onload = function() {
                    try {
                        var maxWidth = 600;
                        var width = img.width;
                        var height = img.height;
                        if (width > maxWidth) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        }
                        var canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        var ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        var compressed = canvas.toDataURL('image/jpeg', 0.6);
                        resolve(compressed);
                    } catch (err) {
                        resolve(base64);
                    }
                };
                img.onerror = function() { resolve(base64); };
                img.src = base64;
            };
            reader.onerror = function(e) { reject(e); };
            reader.readAsDataURL(file);
        });
    }

   // ========== 发布 ==========
async function publishMoment(text, media) {
    // 🔥 修改：有文字 或 有图片 都可以发布
    if (!text && !media) {
        showNotification('请写点什么或添加图片', 'warning');
        return;
    }

    var finalMedia = null;

    if (media && media instanceof File) {
        try {
            console.log('📸 处理文件:', media.name, (media.size / 1024 / 1024).toFixed(2), 'MB');
            finalMedia = await processImage(media);
            console.log('✅ 处理完成，大小:', (finalMedia.length / 1024 / 1024).toFixed(2), 'MB');
        } catch (err) {
            console.error('处理失败:', err);
            showNotification('图片处理失败', 'error');
            return;
        }
    } else if (media && typeof media === 'string' && media.startsWith('data:image')) {
        finalMedia = media;
    } else {
        // 🔥 修改：如果没有图片，finalMedia 保持 null，但文字可以发布
        finalMedia = null;
    }

    // 🔥 修改：只有没有文字 且 没有图片 时才报错
    if (!text && !finalMedia) {
        showNotification('请写点什么或添加图片', 'error');
        return;
    }

    var data = {
        author: 'me',
        text: text || '',
        media: finalMedia,  // 可以为 null
        timestamp: Date.now(),
        likes: [],
        comments: [],
        reactAttempts: 0
    };

    try {
        var id = await saveMoment(data);
        loadMoreOffset = 20;
        render('moments-list', currentMode);
        showNotification('已发布 ✦', 'success');
        scheduleMomentReactions(id);
        return id;
    } catch (err) {
        console.error('发布失败:', err);
        showNotification('保存失败，请重试', 'error');
        return null;
    }
}
// ========== 发送评论（支持文字 + 表情包） ==========
async function sendComment(id) {
    const input = document.getElementById('comment-input-' + id);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    console.log('📸 用户评论:', text);

    // 检测是否包含 [表情包] 标记
    if (text.includes('[表情包]')) {
        window._pendingCommentText = text.replace(/\[表情包\]/g, '').trim();
        openCommentStickerPicker(id);
        return;
    }

    await updateMoment(id, function(m) {
        if (!m.comments) m.comments = [];
        m.comments.push({
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            author: 'me',
            text: text,
            timestamp: Date.now()
        });
    });
    input.value = '';
    render('moments-list', currentMode);

    if (Math.random() < 0.3) {
        setTimeout(function() {
            simulateReply(id);
        }, 3000 + Math.random() * 5000);
    }
}

    // ========== 评论中使用表情包 ==========
  function openCommentStickerPicker(momentId) {
    // 🔥 新增：保存当前输入框的内容
    const input = document.getElementById('comment-input-' + momentId);
    if (input) {
        window._pendingCommentText = input.value.replace(/\[表情包\]/g, '').trim();
    }
    
    var stickers = getStickerLibrary();
    if (!stickers || stickers.length === 0) {
        showNotification('还没有表情包，请在聊天输入区添加 😊', 'warning');
        return;
        }

        var oldPicker = document.getElementById('comment-sticker-picker');
        if (oldPicker) oldPicker.remove();

        var picker = document.createElement('div');
        picker.id = 'comment-sticker-picker';
        picker.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);';
        picker.onclick = function(e) {
            if (e.target === this) {
                this.remove();
                _pendingStickerMomentId = null;
            }
        };

        var stickerItems = '';
        for (var i = 0; i < stickers.length; i++) {
            var sticker = stickers[i];
            stickerItems += '<div style="padding:4px;background:var(--primary-bg);border-radius:8px;cursor:pointer;transition:transform 0.15s;border:1px solid var(--border-color);" onclick="Moments.insertCommentSticker(\'' + momentId + '\', ' + i + ')" onmouseover="this.style.transform=\'scale(1.05)\'" onmouseout="this.style.transform=\'scale(1)\'"><img src="' + sticker + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;display:block;"></div>';
        }

        picker.innerHTML = '<div style="background:var(--secondary-bg);width:100%;max-width:500px;border-radius:20px 20px 0 0;padding:16px 16px max(env(safe-area-inset-bottom),16px);max-height:60vh;overflow-y:auto;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
                '<span style="font-size:15px;font-weight:600;color:var(--text-primary);">选择表情包</span>' +
                '<button onclick="document.getElementById(\'comment-sticker-picker\').remove();" style="background:none;border:none;font-size:20px;color:var(--text-secondary);cursor:pointer;">✕</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">' + stickerItems + '</div>' +
            '<div style="margin-top:12px;text-align:center;font-size:11px;color:var(--text-secondary);">点击表情包直接添加到评论</div>' +
        '</div>';
        document.body.appendChild(picker);
    }

    // ========== 插入表情包到评论（支持文字 + 表情包） ==========
var _pendingStickerMomentId = null;

function insertCommentSticker(momentId, stickerIndex) {
    var stickers = getStickerLibrary();
    var sticker = stickers[stickerIndex];
    if (!sticker) return;

    var picker = document.getElementById('comment-sticker-picker');
    if (picker) picker.remove();

    // 获取之前保存的文字内容
    var input = document.getElementById('comment-input-' + momentId);
    var text = window._pendingCommentText || '';
    window._pendingCommentText = null;

    if (input) {
        var inputText = input.value.replace(/\[表情包\]/g, '').trim();
        if (inputText) text = inputText;
    }

    // 发送评论（文字 + 表情包）
    updateMoment(momentId, function(m) {
        if (!m.comments) m.comments = [];
        m.comments.push({
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            author: 'me',
            text: text || '',
            sticker: sticker,
            timestamp: Date.now()
        });
    }).then(function() {
        if (input) input.value = '';
        render('moments-list', currentMode);
        showNotification('✅ 评论已发送', 'success');
        
        if (Math.random() < 0.3) {
            setTimeout(function() {
                simulateReply(momentId);
            }, 3000 + Math.random() * 5000);
        }
    });
}

    // ========== 回复评论（支持表情包） ==========
    async function replyComment(id, commentIdx) {
        var all = await getAll();
        var m = all.find(function(item) { return item.id === id; });
        if (!m || !m.comments || !m.comments[commentIdx]) {
            showNotification('找不到评论', 'warning');
            return;
        }

        var target = m.comments[commentIdx];
        var targetInfo = getAuthorInfo(target.author);
        var targetName = target.gcName || targetInfo.name || '成员';

        // 创建输入框让用户选择是否添加表情包
        showReplyDialog(id, commentIdx, targetName);
    }

    // ========== 回复对话框 ==========
    function showReplyDialog(momentId, commentIdx, targetName) {
        var oldDialog = document.getElementById('reply-dialog');
        if (oldDialog) oldDialog.remove();

        var overlay = document.createElement('div');
        overlay.id = 'reply-dialog';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
        overlay.onclick = function(e) {
            if (e.target === this) {
                this.remove();
            }
        };

        overlay.innerHTML = '<div style="background:var(--secondary-bg);width:90%;max-width:400px;border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
            '<div style="font-size:15px;font-weight:600;margin-bottom:12px;color:var(--text-primary);">回复 ' + targetName + '</div>' +
            '<textarea id="reply-text-input" style="width:100%;height:80px;padding:10px;border:1px solid var(--border-color);border-radius:10px;font-size:14px;background:var(--primary-bg);color:var(--text-primary);outline:none;resize:none;font-family:var(--font-family);" placeholder="输入回复内容..."></textarea>' +
            '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">' +
                '<button onclick="Moments.insertReplySticker(\'' + momentId + '\', ' + commentIdx + ')" style="padding:8px 16px;border:1px dashed var(--border-color);border-radius:10px;background:var(--primary-bg);color:var(--text-secondary);cursor:pointer;font-size:13px;font-family:var(--font-family);">😊 添加表情包</button>' +
                '<div style="flex:1;"></div>' +
                '<button onclick="document.getElementById(\'reply-dialog\').remove()" style="padding:8px 16px;border:1px solid var(--border-color);border-radius:10px;background:transparent;color:var(--text-secondary);cursor:pointer;font-size:13px;font-family:var(--font-family);">取消</button>' +
                '<button onclick="Moments.submitReply(\'' + momentId + '\', ' + commentIdx + ')" style="padding:8px 20px;border:none;border-radius:10px;background:var(--accent-color);color:#fff;cursor:pointer;font-size:13px;font-weight:600;font-family:var(--font-family);">发送</button>' +
            '</div>' +
            '<div id="reply-sticker-preview" style="margin-top:8px;display:none;padding:6px 10px;background:rgba(var(--accent-color-rgb),0.08);border-radius:8px;font-size:12px;color:var(--text-secondary);">✅ 已添加一个表情包</div>' +
        '</div>';
        document.body.appendChild(overlay);

        var textarea = document.getElementById('reply-text-input');
        if (textarea) setTimeout(function() { textarea.focus(); }, 100);
    }

    // ========== 回复中插入表情包 ==========
    var _replyStickerData = null;

    function insertReplySticker(momentId, commentIdx) {
        var stickers = getStickerLibrary();
        if (!stickers || stickers.length === 0) {
            showNotification('还没有表情包，请在聊天输入区添加 😊', 'warning');
            return;
        }

        // 选择表情包
        var oldPicker = document.getElementById('reply-sticker-picker');
        if (oldPicker) oldPicker.remove();

        var picker = document.createElement('div');
        picker.id = 'reply-sticker-picker';
        picker.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);';
        picker.onclick = function(e) {
            if (e.target === this) {
                this.remove();
            }
        };

        var stickerItems = '';
        for (var i = 0; i < stickers.length; i++) {
            var sticker = stickers[i];
            stickerItems += '<div style="padding:4px;background:var(--primary-bg);border-radius:8px;cursor:pointer;transition:transform 0.15s;border:1px solid var(--border-color);" onclick="Moments.selectReplySticker(\'' + momentId + '\', ' + commentIdx + ', ' + i + ')" onmouseover="this.style.transform=\'scale(1.05)\'" onmouseout="this.style.transform=\'scale(1)\'"><img src="' + sticker + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;display:block;"></div>';
        }

        picker.innerHTML = '<div style="background:var(--secondary-bg);width:100%;max-width:500px;border-radius:20px 20px 0 0;padding:16px 16px max(env(safe-area-inset-bottom),16px);max-height:60vh;overflow-y:auto;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
                '<span style="font-size:15px;font-weight:600;color:var(--text-primary);">选择表情包（回复）</span>' +
                '<button onclick="document.getElementById(\'reply-sticker-picker\').remove();" style="background:none;border:none;font-size:20px;color:var(--text-secondary);cursor:pointer;">✕</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">' + stickerItems + '</div>' +
        '</div>';
        document.body.appendChild(picker);
    }

    // ========== 选择回复表情包 ==========
    function selectReplySticker(momentId, commentIdx, stickerIndex) {
        var stickers = getStickerLibrary();
        var sticker = stickers[stickerIndex];
        if (!sticker) return;

        var picker = document.getElementById('reply-sticker-picker');
        if (picker) picker.remove();

        _replyStickerData = sticker;
        var preview = document.getElementById('reply-sticker-preview');
        if (preview) {
            preview.style.display = 'block';
            preview.innerHTML = '✅ 已添加一个表情包 <img src="' + sticker + '" style="max-height:20px;max-width:40px;border-radius:4px;vertical-align:middle;margin-left:4px;">';
        }
        showNotification('表情包已添加，点击"发送"提交', 'success', 1500);
    }

    // ========== 提交回复 ==========
    async function submitReply(momentId, commentIdx) {
        var textarea = document.getElementById('reply-text-input');
        var text = textarea ? textarea.value.trim() : '';
        var sticker = _replyStickerData || null;

        if (!text && !sticker) {
            showNotification('请输入内容或添加表情包', 'warning');
            return;
        }

        // 获取目标评论信息
        var all = await getAll();
        var m = all.find(function(item) { return item.id === momentId; });
        if (!m || !m.comments || !m.comments[commentIdx]) {
            showNotification('找不到评论', 'error');
            return;
        }

        var target = m.comments[commentIdx];
        var targetInfo = getAuthorInfo(target.author);
        var targetName = target.gcName || targetInfo.name || '成员';

        await updateMoment(momentId, function(m) {
            if (!m.comments) m.comments = [];
            m.comments.push({
                id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                author: 'me',
                text: text || '',
                sticker: sticker || null,
                replyToName: targetName,
                replyToAuthor: target.author,
                timestamp: Date.now()
            });
        });

        // 关闭对话框
        var dialog = document.getElementById('reply-dialog');
        if (dialog) dialog.remove();
        _replyStickerData = null;

        render('moments-list', currentMode);
        showNotification('✅ 回复已发送', 'success');

        // 触发梦角回复
        if (Math.random() < 0.3) {
            setTimeout(function() {
                simulateReply(momentId);
            }, 3000 + Math.random() * 5000);
        }
    }

    // ========== 梦角自动回复 ==========
    async function simulateReply(id) {
        var all = await getAll();
        var m = all.find(function(item) { return item.id === id; });
        if (!m) return;

        var replyPool = await getReplyPool();
        if (!replyPool.length) return;

        var stickers = getStickerLibrary();

        var count = 1 + Math.floor(Math.random() * Math.min(3, replyPool.length));
        var text = '';
        for (var i = 0; i < count; i++) {
            text += replyPool[Math.floor(Math.random() * replyPool.length)] + ' ';
        }
        text = text.trim();

        var sticker = null;
        var stickerRand = Math.random();
        if (stickerRand < 0.10 && stickers.length > 0) {
            sticker = stickers[Math.floor(Math.random() * stickers.length)];
            text = '';
        } else if (stickerRand < 0.35 && stickers.length > 0) {
            sticker = stickers[Math.floor(Math.random() * stickers.length)];
        }

        if (!m.comments) m.comments = [];
        var hasComments = m.comments.length > 0;
        if (hasComments && Math.random() < 0.3) {
            var target = m.comments[Math.floor(Math.random() * m.comments.length)];
            var targetInfo = getAuthorInfo(target.author);
            var targetName = target.gcName || targetInfo.name || '成员';
            m.comments.push({
                id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                author: 'partner',
                text: text,
                sticker: sticker,
                replyToName: targetName,
                replyToAuthor: target.author,
                timestamp: Date.now(),
                gcName: (window.settings && window.settings.partnerName) || '梦角'
            });
        } else {
            m.comments.push({
                id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                author: 'partner',
                text: text,
                sticker: sticker,
                timestamp: Date.now(),
                gcName: (window.settings && window.settings.partnerName) || '梦角'
            });
        }

        await saveAll(all);
        render('moments-list', currentMode);
        showNotification((window.settings && window.settings.partnerName) || '梦角' + ' 评论了你', 'info');
    }

    // ========== 点赞 ==========
    async function toggleLike(id) {
        await updateMoment(id, function(m) {
            if (!m.likes) m.likes = [];
            var idx = m.likes.indexOf('me');
            if (idx > -1) m.likes.splice(idx, 1);
            else m.likes.push('me');
        });
        render('moments-list', currentMode);
    }

    // ========== 删除 ==========
    async function deleteMoment(id) {
        if (!confirm('确定删除这条朋友圈？')) return;
        await removeMoment(id);
        loadMoreOffset = 20;
        render('moments-list', currentMode);
        showNotification('已删除', 'info');
    }

    async function deleteComment(momentId, commentId) {
        await updateMoment(momentId, function(m) {
            if (!m.comments) return;
            var idx = -1;
            for (var i = 0; i < m.comments.length; i++) {
                if (String(m.comments[i].id) === String(commentId)) {
                    idx = i;
                    break;
                }
            }
            if (idx > -1 && m.comments[idx].author === 'me') {
                m.comments.splice(idx, 1);
            }
        });
        render('moments-list', currentMode);
        showNotification('评论已删除', 'success');
    }

    // ========== 聚焦评论 ==========
    function focusComment(id) {
        var input = document.getElementById('comment-input-' + id);
        if (input) {
            input.focus();
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

   // ========== 自动引擎 ==========
let autoTimers = [];

function scheduleAutoMoments() {
    // 清除旧定时器
    autoTimers.forEach(t => clearTimeout(t));
    autoTimers = [];

    // 🔥 检查召唤加成
    const boostActive = isBoostActive('moment');
    
    // 每天随机发 0~3 条（召唤时增加发圈概率）
    let dayCount = Math.floor(Math.random() * 4);
    if (boostActive) {
        dayCount = Math.min(dayCount + 2, 5); // 召唤时额外增加 1~2 条
        console.log('📸 召唤加成生效，今天将多发朋友圈');
    }
    
    const interval = 2 * 60 * 60 * 1000; // 至少间隔2小时

    for (let i = 0; i < dayCount; i++) {
        const delay = interval + Math.random() * 4 * 60 * 60 * 1000;
        const timer = setTimeout(() => {
            generateAutoMoment();
        }, delay);
        autoTimers.push(timer);
    }
    console.log(`📸 自动朋友圈已调度，今天将发 ${dayCount} 条`);
}

    async function generateAutoMoment() {
        var pool = await getReplyPool();
        if (!pool.length) return;

        var count = 3 + Math.floor(Math.random() * Math.min(5, pool.length));
        var text = '';
        for (var i = 0; i < count; i++) {
            text += pool[Math.floor(Math.random() * pool.length)] + ' ';
        }
        text = text.trim();

        var emojis = ['💕', '🥺', '✨', '🌙', '❤️', '😘', '🤍', '🌸', '🫶', '☁️'];
        if (Math.random() < 0.3) {
            text += ' ' + emojis[Math.floor(Math.random() * emojis.length)];
        }

        var media = null;
        if (Math.random() < 0.2) {
            var stickers = getStickerLibrary();
            if (stickers && stickers.length > 0) {
                media = stickers[Math.floor(Math.random() * stickers.length)];
            }
        }

        var data = {
            author: 'partner',
            text: text,
            media: media,
            scene: 'partner',
            timestamp: Date.now(),
            likes: [],
            comments: [],
            reactAttempts: 0
        };

        try {
            var id = await saveMoment(data);
            render('moments-list', currentMode);
            showNotification((window.settings && window.settings.partnerName) || '梦角' + ' 发布了新动态 ✦', 'info');
            scheduleMomentReactions(id);
        } catch (err) {
            console.error('自动发圈失败:', err);
        }
    }
// ========== 安排梦角互动 ==========   ← 🔥 新增
function scheduleMomentReactions(momentId) {
    const delay = 60000 + Math.random() * 120000;
    setTimeout(() => {
        triggerReaction(momentId);
    }, delay);
    for (let i = 1; i < 3; i++) {
        const interval = 2 * 60 * 60 * 1000 + Math.random() * 2 * 60 * 60 * 1000;
        setTimeout(() => {
            triggerReaction(momentId);
        }, delay + interval * i);
    }
}

   // ========== 触发互动（修复版 - 恢复原概率和召唤加成） ==========
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

    // 🔥 检查召唤加成（从 boostExpiry 读取）
    const boostLikeActive = isBoostActive('like');
    const boostCommentActive = isBoostActive('comment');
    const boostMomentActive = isBoostActive('moment');
    
    // 🔥 基础概率 + 召唤加成
    let likeChance = 0.08;        // 基础 8%
    let commentChance = 0.08;     // 基础 8%
    
    if (boostLikeActive) likeChance = 0.35;      // 召唤后 35%
    if (boostCommentActive) commentChance = 0.35; // 召唤后 35%

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
            
            // 25% 概率附带表情包，10% 概率只有表情包
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
        await saveAll(all);
        render('moments-list', currentMode);
        console.log('📸 互动已保存并刷新');
    } else {
        await saveAll(all);
        console.log('📸 本次未触发互动，已记录尝试次数');
    }
}


    function setMode(mode) {
        currentMode = mode;
        window.momentsMode = mode;
    }

    function getMode() {
        return currentMode;
    }

    function resetLoadMore() {
        loadMoreOffset = 20;
    }
 // ========== 召唤功能 ==========
    function boostMoment(type) {
        boostExpiry[type] = Date.now() + 3600000;
        window.momentsBoost = boostExpiry;
        
        const labels = {
            moment: '发朋友圈',
            like: '点赞',
            comment: '评论'
        };
        
        let boostInfo = '';
        if (type === 'like') boostInfo = '点赞概率 8% → 35% 🌸';
        else if (type === 'comment') boostInfo = '评论概率 8% → 35% 🌸';
        else if (type === 'moment') boostInfo = '发圈概率提升 🌸';
        
        showNotification(`已召唤 ${labels[type]} ${boostInfo} 接下来1小时更活跃`, 'success');
        
        if (type === 'moment') {
            setTimeout(() => {
                if (isBoostActive(type) && Math.random() < 0.6) {
                    generateAutoMoment();
                }
            }, 30000 + Math.random() * 60000);
        }
    }
// ========== 检查召唤是否激活 ==========
function isBoostActive(type) {
    return boostExpiry[type] && Date.now() < boostExpiry[type];
}

    // ========== 通知 ==========
    function showNotification(msg, type, duration) {
        duration = duration || 2500;
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, type);
            return;
        }
        var el = document.createElement('div');
        el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:12px;background:rgba(0,0,0,0.8);color:#fff;font-size:13px;z-index:9999;max-width:90%;text-align:center;backdrop-filter:blur(10px);';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function() {
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.3s';
            setTimeout(function() { el.remove(); }, 400);
        }, duration);
    }

    // ========== 占位函数 ==========
    var noop = function() {};
// ========== 图片放大预览功能 ==========
function openImageViewer(imageSrc) {
    if (!imageSrc) return;
    
    var old = document.getElementById('custom-image-viewer');
    if (old) old.remove();
    
    var overlay = document.createElement('div');
    overlay.id = 'custom-image-viewer';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:20px;backdrop-filter:blur(10px);';
    overlay.onclick = function() { this.remove(); };
    
    var img = document.createElement('img');
    img.src = imageSrc;
    img.style.cssText = 'max-width:95%;max-height:85vh;border-radius:8px;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,0.5);';
    img.onclick = function(e) { e.stopPropagation(); };
    
    var closeBtn = document.createElement('div');
    closeBtn.style.cssText = 'position:absolute;top:max(env(safe-area-inset-top),20px);right:20px;color:rgba(255,255,255,0.7);font-size:24px;cursor:pointer;z-index:10;background:rgba(0,0,0,0.3);border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.onclick = function(e) { e.stopPropagation(); overlay.remove(); };
    
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    
    var keyHandler = function(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', keyHandler);
        }
    };
    document.addEventListener('keydown', keyHandler);
}

function closeImageViewer() {
    var overlay = document.getElementById('custom-image-viewer');
    if (overlay) overlay.remove();
}

// 暴露到全局
window.openImageViewer = openImageViewer;
window.closeImageViewer = closeImageViewer;
    // ========== 暴露 API ==========
    window.Moments = {
        // 数据操作
        getAll: getAll,
        save: saveMoment,
        update: updateMoment,
        remove: removeMoment,
        clearAll: clearAll,
        saveAll: saveAll,
        getByMode: getByMode,

        // UI 渲染
        render: render,
        loadMore: loadMore,
        resetLoadMore: resetLoadMore,
        buildMomentCard: buildMomentCard,

        // 用户操作
        publishMoment: publishMoment,
        toggleLike: toggleLike,
        sendComment: sendComment,
        replyComment: replyComment,
        deleteMoment: deleteMoment,
        deleteComment: deleteComment,
        focusComment: focusComment,

        // 表情包
        openCommentStickerPicker: openCommentStickerPicker,
        insertCommentSticker: insertCommentSticker,
        insertReplySticker: insertReplySticker,
        selectReplySticker: selectReplySticker,
        submitReply: submitReply,

        // 梦角自动
        scheduleAutoMoments: scheduleAutoMoments,
        scheduleMomentReactions: scheduleMomentReactions,
        generateAutoMoment: generateAutoMoment,
        simulateReply: simulateReply,
        triggerReaction: triggerReaction,

        // 召唤
        boostMoment: boostMoment,
        isBoostActive: isBoostActive,

        // 模式
        setMode: setMode,
        getMode: getMode,

        // 工具
        getTimeAgo: getTimeAgo,
        getAuthorInfo: getAuthorInfo,
        getReplyPool: getReplyPool,

        // 占位
        showReplyInputWithSticker: noop,
        cancelReplyInput: noop,
        openReplyStickerPicker: noop,
        sendCommentWithSticker: noop,

    // ===== 🔥 新增：独立导出导入 =====
    exportData: async function() {
    try {
        const data = await this.getAll();
        if (!data || data.length === 0) {
            showNotification('⚠️ 没有朋友圈数据可导出', 'warning');
            return;
        }

        // 🔥 获取头像数据
        let avatars = {};
        try {
            if (window.momentAvatars) {
                avatars = window.momentAvatars;
            } else {
                const stored = localStorage.getItem('momentAvatars');
                if (stored) avatars = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('读取头像数据失败:', e);
        }

        let withImage = 0;
        data.forEach(m => {
            if (m.media && typeof m.media === 'string' && m.media.length > 100) {
                withImage++;
            }
        });

        const exportObj = {
            version: '1.1',  // 🔥 升级版本号
            exportType: 'moments',
            exportDate: new Date().toISOString(),
            totalCount: data.length,
            withImage: withImage,
            data: data,
            avatars: avatars  // 🔥 新增：导出头像数据
        };

        const jsonStr = JSON.stringify(exportObj, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `朋友圈备份_${new Date().toISOString().slice(0, 10)}.json`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        const avatarCount = Object.keys(avatars).length;
        showNotification(`✅ 已导出 ${data.length} 条朋友圈数据${avatarCount > 0 ? `，包含 ${avatarCount} 个头像` : ''}`, 'success');
    } catch (e) {
        console.error('导出朋友圈失败:', e);
        showNotification('❌ 导出失败', 'error');
    }
},
importData: function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                let rawText = e.target.result;
                if (rawText.charCodeAt(0) === 0xFEFF) rawText = rawText.slice(1);
                const imported = JSON.parse(rawText);

                if (imported.exportType !== 'moments') {
                    showNotification('❌ 不是有效的朋友圈备份文件', 'error');
                    reject(new Error('Invalid format'));
                    return;
                }

                if (!imported.data || !Array.isArray(imported.data) || imported.data.length === 0) {
                    showNotification('⚠️ 文件中没有朋友圈数据', 'warning');
                    reject(new Error('No data'));
                    return;
                }

                let withImage = 0;
                imported.data.forEach(m => {
                    if (m.media && typeof m.media === 'string' && m.media.length > 100) {
                        withImage++;
                    }
                });

                // 🔥 检查是否有头像数据
                const hasAvatars = imported.avatars && Object.keys(imported.avatars).length > 0;
                let avatarCount = hasAvatars ? Object.keys(imported.avatars).length : 0;

                const confirmMsg = `即将导入 ${imported.data.length} 条朋友圈数据\n其中包含图片 ${withImage} 条${hasAvatars ? `\n包含 ${avatarCount} 个头像` : ''}\n\n⚠️ 将覆盖当前所有朋友圈数据，确定继续吗？`;
                if (!confirm(confirmMsg)) {
                    resolve(false);
                    return;
                }

                // 确保每条数据的 media 都是字符串
                imported.data.forEach(m => {
                    if (m.media && typeof m.media !== 'string') {
                        m.media = String(m.media);
                    }
                });

                // 🔥 保存朋友圈数据
                await window.Moments.saveAll(imported.data);

                // 🔥 保存头像数据
                if (hasAvatars) {
                    try {
                        window.momentAvatars = imported.avatars;
                        localStorage.setItem('momentAvatars', JSON.stringify(imported.avatars));
                        console.log('✅ 已导入头像数据:', avatarCount, '个');
                    } catch (e) {
                        console.warn('保存头像数据失败:', e);
                    }
                }

                console.log('✅ 已导入', imported.data.length, '条朋友圈数据');
                window.Moments.render('moments-list', 'partner');
                showNotification(`✅ 成功导入 ${imported.data.length} 条朋友圈数据${hasAvatars ? `，包含 ${avatarCount} 个头像` : ''}`, 'success');
                resolve(true);

            } catch (e) {
                console.error('导入朋友圈失败:', e);
                showNotification('❌ 导入失败，文件格式错误', 'error');
                reject(e);
            }
        };
        reader.onerror = function(e) {
            showNotification('❌ 读取文件失败', 'error');
            reject(e);
        };
        reader.readAsText(file);
    });
  }
};

// 自动渲染
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(function() {
        render('moments-list', currentMode);
        scheduleAutoMoments();
        console.log('✅ 朋友圈初始化完成');
    }, 100);
} else {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() {
            render('moments-list', currentMode);
            scheduleAutoMoments();
            console.log('✅ 朋友圈初始化完成');
        }, 100);
    });
}

console.log('✅ Moments 加载完成');
})();
