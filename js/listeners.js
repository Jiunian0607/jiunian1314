// ===== listeners.js =====
// 注意：此文件已移除所有 import，所有决策函数通过 window 对象暴露

function setupEventListeners() {
    try {
        initCoreListeners();
        initModalListeners();
        initChatActionListeners();
        initHeaderAndSettingsListeners();
        initDataManagementListeners();
        initNewFeatureListeners();
        setupTutorialListeners();
        initMoodListeners();
        initDecisionModule(); 
        initAnniversaryModule(); 
        initThemeEditor(); 
        initThemeSchemes();
        
        initComboMenu(); 
        
    } catch (e) {
        console.error("事件绑定过程中发生错误:", e);
    }
}

function initChatActionListeners() {
            DOMElements.chatContainer.addEventListener('click', (e) => {

                if (isBatchFavoriteMode) {
                    const wrapper = e.target.closest('.message-wrapper');
                    if (wrapper && !e.target.closest('.message-meta-actions')) {
                        const messageId = Number(wrapper.dataset.id);
                        const index = selectedMessages.indexOf(messageId);

                        if (index > -1) {
                            selectedMessages.splice(index, 1);
                            wrapper.classList.remove('selected');
                        } else {
                            selectedMessages.push(messageId);
                            wrapper.classList.add('selected');
                        }

                        const confirmBtn = document.getElementById('confirm-batch-favorite');
                        if (confirmBtn) {
                            confirmBtn.textContent = `确认收藏 (${selectedMessages.length})`;
                        }
                        return;
                    }
                }

                const favoriteBtn = e.target.closest('.favorite-action-btn'); 
                if (favoriteBtn) {
                    const wrapper = e.target.closest('.message-wrapper');
                    const messageId = Number(wrapper.dataset.id);
                    const message = messages.find(m => m.id === messageId);
                    
                    if (message) {
                        message.favorited = !message.favorited;
                        
                        showNotification(message.favorited ? '已收藏': '已取消收藏', 'success', 1500);
                        playSound('favorite');
                        
                        throttledSaveData();
                        
                        renderMessages(true);
                    }
                    return;
                }

                const target = e.target.closest('.meta-action-btn');
                if (!target) return;
                
                const wrapper = e.target.closest('.message-wrapper');
                if (!wrapper) return; 
                
                const messageId = Number(wrapper.dataset.id);
                const message = messages.find(m => m.id === messageId);
                if (!message) return;

if (target.classList.contains('delete-btn')) {
    if (confirm('确定要删除这条消息吗？')) {
        const index = messages.findIndex(m => m.id === messageId);
        if (index > -1) {
            const savedScrollTop = DOMElements.chatContainer.scrollTop;
            messages.splice(index, 1); 
            throttledSaveData(); 
            renderMessages(true);
            requestAnimationFrame(() => {
                DOMElements.chatContainer.scrollTop = savedScrollTop;
            });
            showNotification('消息已删除', 'success');
        }
    }
    return;
}
                if (target.classList.contains('reply-btn')) {
                    currentReplyTo = {
                        id: message.id,
                        sender: message.sender,
                        text: message.text
                    };
                    updateReplyPreview();
                    DOMElements.messageInput.focus();
                    const targetMessageElement = DOMElements.chatContainer.querySelector(`[data-id="${message.id}"]`);
                    if (targetMessageElement) targetMessageElement.scrollIntoView({
                        behavior: 'smooth', block: 'center'
                    });
                    return;
                } 
                throttledSaveData();
            });

            DOMElements.batchPreview.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.batch-preview-remove');
                if (removeBtn) {
                    const index = removeBtn.closest('.batch-preview-item').dataset.index;
                    batchMessages.splice(index, 1); updateBatchPreview();
                    return;
                }
                const editBtn = e.target.closest('.batch-preview-edit');
                if (editBtn) {
                    const item = editBtn.closest('.batch-preview-item');
                    const index = parseInt(item.dataset.index);
                    const msg = batchMessages[index];
                    if (!msg || msg.image) return;
                    const newText = prompt('编辑内容：', msg.text);
                    if (newText !== null) {
                        batchMessages[index].text = newText.trim();
                        updateBatchPreview();
                    }
                    return;
                }
                const sendBtn = e.target.closest('.batch-send-btn');
                if (sendBtn && !sendBtn.disabled) sendBatchMessages();
                if (e.target.matches('.batch-cancel-btn')) {
                    isBatchMode = false; DOMElements.batchBtn.classList.remove('active');
                    DOMElements.batchPreview.style.display = 'none';
                    const placeholder = "";
                    DOMElements.messageInput.placeholder = placeholder.length > 20 ? placeholder.substring(0, 20) + "...": placeholder;
                    batchMessages = [];
                }
            });
        }

        function initModalListeners() {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                const cancelBtns = modal.querySelectorAll('.modal-buttons .modal-btn-secondary');
                cancelBtns.forEach(cancelBtn => {
                    if (!cancelBtn.getAttribute('onclick') && !cancelBtn.dataset.noAutoClose) {
                        cancelBtn.addEventListener('click', () => hideModal(modal));
                    }
                });
            });

            const closeChatBtn = document.getElementById('close-chat');
            if (closeChatBtn) {
                closeChatBtn.addEventListener('click', () => {
                    hideModal(DOMElements.chatModal.modal);
                });
            }

            const closeDataBtn = document.getElementById('close-data');
            if (closeDataBtn) {
                closeDataBtn.addEventListener('click', () => {
                    hideModal(DOMElements.dataModal.modal);
                });
            }

            DOMElements.editModal.input.addEventListener('input', () => {
                DOMElements.editModal.save.disabled = !DOMElements.editModal.input.value.trim();
            });
            DOMElements.pokeModal.save.addEventListener('click', () => {
                let pokeText = DOMElements.pokeModal.input.value.trim() || `${settings.myName} 拍了拍 ${settings.partnerName}`;
                if (typeof window._sanitizePokeTextForDisplay === 'function') {
                    pokeText = window._sanitizePokeTextForDisplay(pokeText);
                }
                const pokeSaveChecked = document.getElementById('poke-save-to-library');
                const shouldSaveToLibrary = pokeSaveChecked ? !!pokeSaveChecked.checked : false;
                addMessage({
                    id: Date.now(), text: _formatPokeText(pokeText), timestamp: new Date(), type: 'system'
                });
                if (typeof playSound === 'function') playSound('poke');

                if (shouldSaveToLibrary) {
                    try {
                        if (!Array.isArray(customPokes)) customPokes = [];
                        const exists = customPokes.some(r => String(r) === String(pokeText));
                        if (!exists) {
                            customPokes.unshift(pokeText);
                            if (typeof throttledSaveData === 'function') throttledSaveData();
                            if (typeof renderReplyLibrary === 'function') renderReplyLibrary();
                        }
                    } catch (e) {
                        console.warn('拍一拍保存到库失败:', e);
                    }
                }
                hideModal(DOMElements.pokeModal.modal);
                DOMElements.pokeModal.input.value = '';
                const delayRange = settings.replyDelayMax - settings.replyDelayMin;
                const randomDelay = settings.replyDelayMin + Math.random() * delayRange;
                setTimeout(simulateReply, randomDelay);
            });


            DOMElements.cancelCoinResult.addEventListener('click', () => {
                DOMElements.coinTossOverlay.classList.remove('visible', 'finished');
                lastCoinResult = null;
            });


            DOMElements.sendCoinResult.addEventListener('click', () => {
                if (lastCoinResult) {
                    sendMessage(`🎲 抛硬币结果：${lastCoinResult}`, 'normal');
                    DOMElements.coinTossOverlay.classList.remove('visible', 'finished');
                    lastCoinResult = null;
                }
            });


            const retryBtn = document.getElementById('retry-coin-toss');

            if (retryBtn) {
                retryBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    startCoinFlipAnimation();
                });
            }
        }


        function initHeaderAndSettingsListeners() {

            const openNameModal = (isPartner) => {
                const modal = DOMElements.editModal;
                showModal(modal.modal, modal.input);
                modal.title.textContent = `修改${isPartner ? (settings.partnerName || '对方'): '我'}的昵称`;
                modal.input.value = isPartner ? settings.partnerName: settings.myName;
                modal.save.disabled = !modal.input.value.trim();
                modal.save.onclick = () => {
                    const newName = modal.input.value.trim();
                    if (newName) {
                        isPartner ? settings.partnerName = newName: settings.myName = newName;
                        throttledSaveData();
                        updateUI();
                        showNotification('昵称已更新', 'success');
                    }
                    hideModal(modal.modal);
                };
            };

            const openAvatarModal = (isPartner) => {
                const modal = DOMElements.avatarModal;

                modal.modal.querySelector('.modal-content').innerHTML = `
            <div class="modal-title"><i class="fas fa-portrait"></i><span>上传${isPartner ? '对方': '我'}的头像</span></div>
            <div style="margin-bottom: 16px;">
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <button class="modal-btn modal-btn-secondary" id="upload-file-btn" style="flex: 1;">选择文件</button>
            <button class="modal-btn modal-btn-secondary" id="paste-url-btn" style="flex: 1;">粘贴URL</button>
            </div>
            <input type="file" class="modal-input" id="avatar-file-input" accept="image/*" style="display: none;">
            <input type="text" class="modal-input" id="avatar-url-input" placeholder="输入图片URL地址" style="display: none;">
            <div id="avatar-preview" style="text-align: center; margin-top: 10px; display: none;">
            <img id="preview-image" style="max-width: 100px; max-height: 100px; border-radius: 50%; border: 2px solid var(--border-color);">
            </div>
            </div>
            <div class="modal-buttons">
            <button class="modal-btn modal-btn-secondary" id="cancel-avatar">取消</button>
            <button class="modal-btn modal-btn-primary" id="save-avatar" disabled>保存</button>
            </div>
            `;

                showModal(modal.modal);

                const fileInput = document.getElementById('avatar-file-input');
                const urlInput = document.getElementById('avatar-url-input');
                const uploadBtn = document.getElementById('upload-file-btn');
                const pasteUrlBtn = document.getElementById('paste-url-btn');
                const previewDiv = document.getElementById('avatar-preview');
                const previewImg = document.getElementById('preview-image');
                const saveBtn = document.getElementById('save-avatar');
                const cancelBtn = document.getElementById('cancel-avatar');

                let currentAvatarData = null;


                uploadBtn.addEventListener('click', () => {
                    fileInput.click();
                    urlInput.style.display = 'none';
                    uploadBtn.classList.add('active');
                    pasteUrlBtn.classList.remove('active');
                });


                pasteUrlBtn.addEventListener('click', () => {
                    urlInput.style.display = 'block';
                    fileInput.style.display = 'none';
                    pasteUrlBtn.classList.add('active');
                    uploadBtn.classList.remove('active');
                    urlInput.focus();
                });


fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > MAX_AVATAR_SIZE) {
            showNotification('头像图片不能超过2MB', 'error');
            return;
        }

        showNotification('正在裁剪处理...', 'info', 1000);
        
        cropImageToSquare(file, 300).then(base64Data => {
            currentAvatarData = base64Data;
            previewImg.src = currentAvatarData;
            previewDiv.style.display = 'block';
            saveBtn.disabled = false;
        }).catch(err => {
            console.error(err);
            showNotification('图片处理失败', 'error');
        });
    }
});


                urlInput.addEventListener('input',
                    function() {
                        const url = urlInput.value.trim();
                        if (url) {

                            if (/^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))$/i.test(url)) {
                                previewImg.src = url;
                                previewDiv.style.display = 'block';
                                currentAvatarData = url;
                                saveBtn.disabled = false;


                                const img = new Image();
                                img.onload = function() {

                                    previewImg.src = url;
                                };
                                img.onerror = function() {
                                    showNotification('图片URL无效或无法访问', 'error');
                                    saveBtn.disabled = true;
                                };
                                img.src = url;
                            } else {
                                saveBtn.disabled = true;
                                previewDiv.style.display = 'none';
                            }
                        } else {
                            saveBtn.disabled = true;
                            previewDiv.style.display = 'none';
                        }
                    });


                saveBtn.addEventListener('click',
                    () => {
                        if (currentAvatarData) {
                            updateAvatar(isPartner ? DOMElements.partner.avatar: DOMElements.me.avatar, currentAvatarData);
                            throttledSaveData();
                            showNotification('头像已更新', 'success');
                            hideModal(modal.modal);
                        }
                    });


                cancelBtn.addEventListener('click',
                    () => {
                        hideModal(modal.modal);
                    });
            };

            DOMElements.partner.name.addEventListener('click', () => openNameModal(true));
            DOMElements.me.name.addEventListener('click', () => openNameModal(false));
            DOMElements.partner.avatar.addEventListener('click', () => openAvatarModal(true));
            DOMElements.me.avatar.addEventListener('click', () => openAvatarModal(false));

            DOMElements.me.statusContainer.addEventListener('click', () => {
                const statusTextElement = DOMElements.me.statusText; const statusContainer = DOMElements.me.statusContainer;
                if (statusContainer.querySelector('input')) return;
                const input = document.createElement('input'); input.type = 'text'; input.id = 'my-status-input'; input.value = statusTextElement.textContent;
                const saveStatus = () => {
                    const newStatus = input.value.trim();
                    if (newStatus) {
                        settings.myStatus = newStatus; showNotification('状态已更新', 'success');
                    } else {
                        settings.myStatus = "在线";
                    }
                    statusTextElement.textContent = settings.myStatus;
                    statusContainer.innerHTML = '';
                    statusContainer.appendChild(statusTextElement);
                    throttledSaveData();
                };
                input.addEventListener('blur', saveStatus);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') input.blur();
                });
                statusContainer.innerHTML = ''; statusContainer.appendChild(input); input.focus();
            });

            DOMElements.themeToggle.addEventListener('click', () => {
                settings.isDarkMode = !settings.isDarkMode; throttledSaveData(); updateUI(); showNotification(`已切换到${settings.isDarkMode ? '夜': '昼'}模式`,
                    'success');
            });
            DOMElements.settingsModal.settingsBtn.addEventListener('click', () => {
                showModal(DOMElements.settingsModal.modal);
            });
            DOMElements.favoritesModal.favoritesBtn.addEventListener('click', () => {
                showModal(document.getElementById('group-chat-modal'));
            });


window.setReadReceiptStyle = function(style) {
    settings.readReceiptStyle = style;
    throttledSaveData();
    const iconBtn = document.getElementById('rr-style-icon');
    const textBtn = document.getElementById('rr-style-text');
    if (iconBtn) { iconBtn.className = style === 'icon' ? 'modal-btn modal-btn-primary' : 'modal-btn modal-btn-secondary'; iconBtn.style.cssText = 'padding:5px 12px;font-size:12px;'; }
    if (textBtn) { textBtn.className = style === 'text' ? 'modal-btn modal-btn-primary' : 'modal-btn modal-btn-secondary'; textBtn.style.cssText = 'padding:5px 12px;font-size:12px;'; }
    renderMessages();
    showNotification('已读回执样式已更新', 'success');
};

const _chatSettingsEl = document.getElementById('chat-settings');
if (_chatSettingsEl) _chatSettingsEl.addEventListener('click', () => {
    hideModal(DOMElements.settingsModal.modal);
    
    const toggleSyncMap = {
        '#reply-toggle': { prop: 'replyEnabled', name: '引用回复' },
        '#sound-toggle': { prop: 'soundEnabled', name: '音效' },
        '#read-receipts-toggle': { prop: 'readReceiptsEnabled', name: '已读回执' },
        '#typing-indicator-toggle': { prop: 'typingIndicatorEnabled', name: '正在输入' },
        '#read-no-reply-toggle': { prop: 'allowReadNoReply', name: '已读不回' },
        '#emoji-mix-toggle': { prop: 'emojiMixEnabled', name: '表情消息' }
    };
    for (const [selector, { prop }] of Object.entries(toggleSyncMap)) {
        const el = document.querySelector(selector);
        const val = prop === 'emojiMixEnabled' ? (settings[prop] !== false) : !!settings[prop];
        if (el) el.classList.toggle('active', val);
    }
    const svSlider = document.getElementById('sound-volume-slider');
    const svVal = document.getElementById('sound-volume-value');
    if (svSlider) { svSlider.value = Math.round((settings.soundVolume || 0.15) * 100); if (svVal) svVal.textContent = svSlider.value + '%'; }
    const legacyCustom = (settings.customSoundUrl || '').trim();

    const setSelect = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || 'tone_low';
    };
    const setInput = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };
    // 音频自定义值显示：base64 数据只显示友好文字
    const setSoundUrlInput = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (val && val.startsWith('data:audio')) {
            el.value = '[本地文件（已上传）]';
        } else {
            el.value = val || '';
        }
    };

    setSelect('sound-my-send-preset', settings.mySendSoundPreset || 'tone_low');
    setSoundUrlInput('sound-my-send-custom-url', (settings.mySendCustomSoundUrl || '').trim() || legacyCustom);

    setSelect('sound-partner-message-preset', settings.partnerMessageSoundPreset || 'tone_low');
    setSoundUrlInput('sound-partner-message-custom-url', (settings.partnerMessageCustomSoundUrl || '').trim() || legacyCustom);

    setSelect('sound-my-poke-preset', settings.myPokeSoundPreset || 'tone_low');
    setSoundUrlInput('sound-my-poke-custom-url', (settings.myPokeCustomSoundUrl || '').trim() || legacyCustom);

    setSelect('sound-partner-poke-preset', settings.partnerPokeSoundPreset || 'tone_low');
    setSoundUrlInput('sound-partner-poke-custom-url', (settings.partnerPokeCustomSoundUrl || '').trim() || legacyCustom);
    document.querySelectorAll('.time-fmt-opt').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.fmt === (settings.timeFormat || 'HH:mm'));
    });
    const autoToggle = document.getElementById('auto-send-toggle');
    if (autoToggle) autoToggle.classList.toggle('active', !!settings.autoSendEnabled);
    updateAutoSendUI();
    updateDelayUI();
    const immToggle = document.getElementById('immersive-toggle');
    if (immToggle) immToggle.classList.toggle('active', document.body.classList.contains('immersive-mode'));
    const rrStyle = settings.readReceiptStyle || 'icon';
    const rrIconBtn = document.getElementById('rr-style-icon');
    const rrTextBtn = document.getElementById('rr-style-text');
    if (rrIconBtn) { rrIconBtn.className = rrStyle === 'icon' ? 'modal-btn modal-btn-primary' : 'modal-btn modal-btn-secondary'; rrIconBtn.style.cssText = 'padding:5px 12px;font-size:12px;'; }
    if (rrTextBtn) { rrTextBtn.className = rrStyle === 'text' ? 'modal-btn modal-btn-primary' : 'modal-btn modal-btn-secondary'; rrTextBtn.style.cssText = 'padding:5px 12px;font-size:12px;'; }
    
    showModal(DOMElements.chatModal.modal);
    setupAvatarFrameSettings();
});
            const _advancedEl = document.getElementById('advanced-settings');
            if (_advancedEl) _advancedEl.addEventListener('click', () => {
                hideModal(DOMElements.settingsModal.modal);
                showModal(DOMElements.advancedModal.modal);
            });

            const _dataSettingsEl = document.getElementById('data-settings');
            if (_dataSettingsEl) _dataSettingsEl.addEventListener('click', () => {
                hideModal(DOMElements.settingsModal.modal);
                showModal(DOMElements.dataModal.modal);
                (async function calcDmStorage() {
                    try {
                        let total = 0, msgsSize = 0, settingsSize = 0, mediaSize = 0;
                        const keys = await localforage.keys();
                        for (const k of keys) {
                            const raw = await localforage.getItem(k);
                            const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
                            const bytes = new Blob([str]).size;
                            total += bytes;
                            if (/messages|msgs/i.test(k)) msgsSize += bytes;
                            else if (/avatar|image|photo|bg|background|wallpaper/i.test(k)) mediaSize += bytes;
                            else settingsSize += bytes;
                        }
                        const fmt = b => b > 1048576 ? (b/1048576).toFixed(1)+'MB' : b > 1024 ? (b/1024).toFixed(0)+'KB' : b+'B';
                        const MAX = 5 * 1024 * 1024;
                        const pct = Math.min(100, Math.round(total / MAX * 100));
                        const barEl = document.getElementById('dm-storage-bar');
                        const totalEl = document.getElementById('dm-storage-total');
                        if (barEl) barEl.style.width = pct + '%';
                        if (totalEl) totalEl.textContent = fmt(total);
                        const msgsEl = document.getElementById('dm-stat-msgs');
                        const setEl = document.getElementById('dm-stat-settings');
                        const medEl = document.getElementById('dm-stat-media');
                        if (msgsEl) msgsEl.textContent = fmt(msgsSize);
                        if (setEl) setEl.textContent = fmt(settingsSize);
                        if (medEl) medEl.textContent = fmt(mediaSize);
                    } catch(e) {
                        const totalEl = document.getElementById('dm-storage-total');
                        if (totalEl) totalEl.textContent = '无法读取';
                    }
                })();
            });
            const exportChatBtnDm = document.getElementById('export-chat-btn');
            const importChatBtnDm = document.getElementById('import-chat-btn');
            if (exportChatBtnDm) {
                exportChatBtnDm.addEventListener('click', () => {
                    if (typeof exportChatHistory === 'function') exportChatHistory();
                    else showNotification('功能暂不可用', 'error');
                });
            }
            if (importChatBtnDm) {
                importChatBtnDm.addEventListener('click', () => {
                    const inp = document.createElement('input');
                    inp.type = 'file'; inp.accept = '.json';
                    inp.onchange = e => { if (e.target.files[0] && typeof importChatHistory === 'function') importChatHistory(e.target.files[0]); };
                    inp.click();
                });
            }


            document.querySelectorAll('.theme-color-btn').forEach(btn => {
                btn.addEventListener('click',
                    () => {
                        settings.colorTheme = btn.dataset.theme;
                        throttledSaveData();
                        updateUI();
                        showNotification(`主题颜色已切换`, 'success');
                    });
            });


            document.querySelectorAll('[data-bubble-style]').forEach(item => {
                item.addEventListener('click',
                    () => {
                        settings.bubbleStyle = item.dataset.bubbleStyle;
                        throttledSaveData();
                        updateUI();
                        showNotification(`气泡样式已切换为${getBubbleStyleName(settings.bubbleStyle)}`, 'success');
                    });
            });

            const fontUrlInput = document.getElementById('custom-font-url');
            const applyFontBtn = document.getElementById('apply-font-btn');
            
            if (fontUrlInput) fontUrlInput.value = settings.customFontUrl || "";

            if (applyFontBtn) {
                applyFontBtn.addEventListener('click', () => {
                    const url = fontUrlInput.value.trim();
                    settings.customFontUrl = url;
                    
                    showNotification('正在尝试加载字体...', 'info', 1000);
                    applyCustomFont(url).then(() => {
                        throttledSaveData();
                        if(url) showNotification('字体已应用', 'success');
                        else showNotification('已恢复默认字体', 'success');
                    });
                });
            }

            
            const followSystemBtn = document.getElementById('follow-system-font-btn');
            if (followSystemBtn) {
                followSystemBtn.addEventListener('click', () => {
                    
                    const systemFontStack = 'system-ui, -apple-system, sans-serif';
                    
                    
                    if (fontUrlInput) fontUrlInput.value = "";
                    
                    
                    settings.customFontUrl = "";
                    
                    
                    settings.messageFontFamily = systemFontStack;
                    
                    
                    document.documentElement.style.setProperty('--font-family', systemFontStack);
                    document.documentElement.style.setProperty('--message-font-family', systemFontStack);
                    
                    
                    throttledSaveData();
                    
                    
                    renderMessages(true);
                    
                    showNotification('已应用跟随系统字体', 'success');
                });
            }
            
            const cssTextarea = document.getElementById('custom-bubble-css');
            const applyCssBtn = document.getElementById('apply-css-btn');
            const resetCssBtn = document.getElementById('reset-css-btn');

            if (cssTextarea) cssTextarea.value = settings.customBubbleCss || "";

            function updateCssLivePreview() {
                const previewStyle = document.getElementById('css-live-preview-style');
                if (!previewStyle) return;
                const raw = (cssTextarea ? cssTextarea.value : '') || '';
                const scoped = raw.replace(/([^{}]+)\{/g, (match, selector) => {
                    const parts = selector.split(',').map(s => `#css-live-preview ${s.trim()}`);
                    return parts.join(', ') + ' {';
                });
                previewStyle.textContent = scoped;
            }

            if (cssTextarea) {
                cssTextarea.addEventListener('input', updateCssLivePreview);
                updateCssLivePreview();
            }

            if (applyCssBtn) {
                applyCssBtn.addEventListener('click', () => {
                    const css = cssTextarea.value;
                    settings.customBubbleCss = css;
                    applyCustomBubbleCss(css);
                    throttledSaveData();
                    showNotification('自定义样式已应用', 'success');
                });
            }

            if (resetCssBtn) {
                resetCssBtn.addEventListener('click', () => {
                    cssTextarea.value = "";
                    settings.customBubbleCss = "";
                    applyCustomBubbleCss("");
                    if (document.getElementById('css-live-preview-style')) document.getElementById('css-live-preview-style').textContent = '';
                    throttledSaveData();
                    showNotification('自定义样式已清除', 'success');
                });
            }

            const globalCssTextarea = document.getElementById('custom-global-css');
            const applyGlobalCssBtn = document.getElementById('apply-global-css-btn');
            const resetGlobalCssBtn = document.getElementById('reset-global-css-btn');
            const globalCssLiveToggle = document.getElementById('global-css-live-toggle');
            const globalCssStatus = document.getElementById('global-css-status');

            if (globalCssTextarea) {
                globalCssTextarea.value = settings.customGlobalCss || '';

                globalCssTextarea.addEventListener('input', () => {
                    if (globalCssLiveToggle && globalCssLiveToggle.checked) {
                        applyGlobalThemeCss(globalCssTextarea.value);
                        if (globalCssStatus) {
                            globalCssStatus.style.display = 'block';
                            globalCssStatus.textContent = '● 实时应用中';
                            globalCssStatus.style.color = 'var(--accent-color)';
                        }
                    }
                });
            }

            if (applyGlobalCssBtn) {
                applyGlobalCssBtn.addEventListener('click', () => {
                    const css = globalCssTextarea ? globalCssTextarea.value : '';
                    settings.customGlobalCss = css;
                    applyGlobalThemeCss(css);
                    throttledSaveData();
                    showNotification('全局主题 CSS 已应用', 'success');
                    if (globalCssStatus) {
                        globalCssStatus.style.display = 'block';
                        globalCssStatus.textContent = '✓ 已应用到全局';
                        globalCssStatus.style.color = '#51cf66';
                        setTimeout(() => { if (globalCssStatus) globalCssStatus.style.display = 'none'; }, 2000);
                    }
                });
            }

            if (resetGlobalCssBtn) {
                resetGlobalCssBtn.addEventListener('click', () => {
                    if (globalCssTextarea) globalCssTextarea.value = '';
                    settings.customGlobalCss = '';
                    applyGlobalThemeCss('');
                    throttledSaveData();
                    showNotification('全局主题 CSS 已清除', 'success');
                    if (globalCssStatus) globalCssStatus.style.display = 'none';
                });
            }

            const fontSizeSlider = document.getElementById('font-size-slider');
            const fontSizeValue = document.getElementById('font-size-value');

            fontSizeSlider.value = settings.fontSize;
            fontSizeValue.textContent = `${settings.fontSize}px`;

            fontSizeSlider.addEventListener('input', (e) => {
                settings.fontSize = parseInt(e.target.value);
                document.documentElement.style.setProperty('--font-size',
                    `${settings.fontSize}px`);
                fontSizeValue.textContent = `${settings.fontSize}px`;
            });

            fontSizeSlider.addEventListener('change', throttledSaveData);

            const avatarToggle = document.getElementById('in-chat-avatar-toggle-2');
            const avatarSizeControl = document.getElementById('in-chat-avatar-size-control-2');
            const avatarPositionControl = document.getElementById('in-chat-avatar-position-control-2');
            const avatarPreview = document.getElementById('avatar-bubble-preview');
            const avatarSizeSlider = document.getElementById('in-chat-avatar-size-slider-2');
            const avatarSizeValue = document.getElementById('in-chat-avatar-size-value-2');

            if (!settings.inChatAvatarPosition) settings.inChatAvatarPosition = 'center';


            function updateBubblePreview() {
                const receivedBubble = document.getElementById('preview-bubble-received');
                const sentBubble = document.getElementById('preview-bubble-sent');
                if (!receivedBubble || !sentBubble) return;
                const style = settings.bubbleStyle || 'standard';
                const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-color-rgb').trim() || '100,150,255';
                const styleMap = {
                    'standard':      { recv: '16px 16px 16px 4px',  sent: '16px 16px 4px 16px',  recvShadow: '0 2px 10px rgba(0,0,0,0.08)', sentShadow: `0 3px 12px rgba(${accentRgb},0.22)` },
                    'rounded':       { recv: '18px 18px 18px 6px',  sent: '18px 18px 6px 18px',  recvShadow: '0 2px 10px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)', sentShadow: `0 3px 12px rgba(${accentRgb},0.25), 0 1px 3px rgba(${accentRgb},0.1)` },
                    'rounded-large': { recv: '24px 24px 24px 4px',  sent: '24px 24px 4px 24px',  recvShadow: '0 4px 16px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.05)', sentShadow: `0 4px 16px rgba(${accentRgb},0.28), 0 2px 4px rgba(${accentRgb},0.12)` },
                    'square':        { recv: '4px 4px 4px 0',       sent: '4px 4px 0 4px',       recvShadow: '0 3px 10px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)', sentShadow: `0 3px 10px rgba(${accentRgb},0.2), 0 1px 2px rgba(${accentRgb},0.08)` }
                };
                const radii = styleMap[style] || styleMap['standard'];
                receivedBubble.style.borderRadius = radii.recv;
                receivedBubble.style.boxShadow = radii.recvShadow;
                sentBubble.style.borderRadius = radii.sent;
                sentBubble.style.boxShadow = radii.sentShadow;
                const recvBg = getComputedStyle(document.documentElement).getPropertyValue('--message-received-bg').trim();
                const recvText = getComputedStyle(document.documentElement).getPropertyValue('--message-received-text').trim();
                const sentBg = getComputedStyle(document.documentElement).getPropertyValue('--message-sent-bg').trim();
                const sentText = getComputedStyle(document.documentElement).getPropertyValue('--message-sent-text').trim();
                if (recvBg) receivedBubble.style.background = recvBg;
                if (recvText) receivedBubble.style.color = recvText;
                if (sentBg) sentBubble.style.background = sentBg;
                if (sentText) sentBubble.style.color = sentText;
                receivedBubble.style.fontFamily = settings.messageFontFamily || '';
                sentBubble.style.fontFamily = settings.messageFontFamily || '';
                receivedBubble.style.fontSize = (settings.fontSize || 16) + 'px';
                sentBubble.style.fontSize = (settings.fontSize || 16) + 'px';
                const customCss = (document.getElementById('custom-bubble-css') || {}).value || '';
                let previewStyle = document.getElementById('bubble-preview-custom-style');
                if (!previewStyle) {
                    previewStyle = document.createElement('style');
                    previewStyle.id = 'bubble-preview-custom-style';
                    document.head.appendChild(previewStyle);
                }
                previewStyle.textContent = customCss;
            }

            function updateAvatarSettingsUI() {
                const enabled = settings.inChatAvatarEnabled;
                const pill = document.getElementById('avatar-toggle-pill-2');
                const knob = document.getElementById('avatar-toggle-knob-2');
                const statusText = document.getElementById('avatar-toggle-status-2');
                if (pill) pill.style.background = enabled ? 'var(--accent-color)' : 'var(--border-color)';
                if (knob) knob.style.right = enabled ? '3px' : '23px';
                if (statusText) statusText.textContent = enabled ? '已开启 — 消息旁显示头像' : '已关闭';

                if (avatarSizeControl) avatarSizeControl.style.display = enabled ? 'flex' : 'none';
                if (avatarPositionControl) avatarPositionControl.style.display = enabled ? 'block' : 'none';
                if (avatarPreview) avatarPreview.style.display = enabled ? 'block' : 'none';

                if (avatarSizeSlider) avatarSizeSlider.value = settings.inChatAvatarSize;
                if (avatarSizeValue) avatarSizeValue.textContent = `${settings.inChatAvatarSize}px`;
                document.documentElement.style.setProperty('--in-chat-avatar-size', `${settings.inChatAvatarSize}px`);

                const pos = settings.inChatAvatarPosition || 'center';
                const alignMap = { 'top': 'flex-start', 'center': 'center', 'bottom': 'flex-end', 'custom': 'flex-start' };
                document.documentElement.style.setProperty('--avatar-align', alignMap[pos] || 'center');
                document.body.dataset.avatarPos = pos;
                document.querySelectorAll('.preview-msg-row').forEach(row => {
                    row.style.alignItems = alignMap[pos] || 'flex-start';
                });
                const topBtn = document.getElementById('avatar-pos-top-2');
                const centerBtn = document.getElementById('avatar-pos-center-2');
                const bottomBtn = document.getElementById('avatar-pos-bottom-2');
                const customBtn = document.getElementById('avatar-pos-custom-2');
                [topBtn, centerBtn, bottomBtn, customBtn].forEach(btn => {
                    if (!btn) return;
                    btn.className = btn.dataset.pos === pos ? 'modal-btn modal-btn-primary' : 'modal-btn modal-btn-secondary';
                    btn.style.flex = '1'; btn.style.fontSize = '12px'; btn.style.padding = '7px 0';
                });

                const customOffsetCtrl = document.getElementById('avatar-custom-offset-control');
                if (customOffsetCtrl) customOffsetCtrl.style.display = pos === 'custom' ? 'block' : 'none';
                if (pos === 'custom') {
                    const offset = settings.inChatAvatarCustomOffset || 0;
                    document.documentElement.style.setProperty('--avatar-custom-offset', offset + 'px');
                    const sl = document.getElementById('avatar-custom-offset-slider');
                    const vl = document.getElementById('avatar-custom-offset-value');
                    if (sl) sl.value = offset;
                    if (vl) vl.textContent = offset + 'px';
                    const previewPartner = document.getElementById('preview-partner-avatar');
                    if (previewPartner) previewPartner.style.marginTop = offset + 'px';
                    const previewMy = document.getElementById('preview-my-avatar');
                    if (previewMy) previewMy.style.marginTop = offset + 'px';
                } else {
                    document.documentElement.style.removeProperty('--avatar-custom-offset');
                    const previewPartner = document.getElementById('preview-partner-avatar');
                    if (previewPartner) previewPartner.style.marginTop = '';
                    const previewMy = document.getElementById('preview-my-avatar');
                    if (previewMy) previewMy.style.marginTop = '';
                }

                const alwaysPill = document.getElementById('always-avatar-pill');
                const alwaysKnob = document.getElementById('always-avatar-knob');
                const alwaysStatus = document.getElementById('always-avatar-status');
                const alwaysOn = !!settings.alwaysShowAvatar;
                if (alwaysPill) alwaysPill.style.background = alwaysOn ? 'var(--accent-color)' : 'var(--border-color)';
                if (alwaysKnob) alwaysKnob.style.right = alwaysOn ? '3px' : '23px';
                if (alwaysStatus) alwaysStatus.textContent = alwaysOn ? '已开启 — 每条消息都显示头像' : '已关闭 — 仅首条消息显示';
                document.body.classList.toggle('always-show-avatar', alwaysOn);

                const namePill = document.getElementById('partner-name-chat-pill');
                const nameKnob = document.getElementById('partner-name-chat-knob');
                const nameStatus = document.getElementById('partner-name-chat-status');
                const nameOn = !!settings.showPartnerNameInChat;
                if (namePill) namePill.style.background = nameOn ? 'var(--accent-color)' : 'var(--border-color)';
                if (nameKnob) nameKnob.style.right = nameOn ? '3px' : '23px';
                if (nameStatus) nameStatus.textContent = nameOn ? '已开启 — 消息旁显示对方名字' : '已关闭';
                showPartnerNameInChat = nameOn;
                document.body.classList.toggle('show-partner-name', nameOn);

                updateAvatarPreview();
            }
            updateAvatarSettingsUI();

            if (avatarToggle) {
                avatarToggle.addEventListener('click', () => {
                    settings.inChatAvatarEnabled = !settings.inChatAvatarEnabled;
                    updateAvatarSettingsUI();
                    renderMessages(true);
                    throttledSaveData();
                });
            }

            if (avatarSizeSlider) {
                avatarSizeSlider.addEventListener('input', (e) => {
                    settings.inChatAvatarSize = parseInt(e.target.value, 10);
                    updateAvatarSettingsUI();
                    renderMessages(true); 
                });
                avatarSizeSlider.addEventListener('change', throttledSaveData);
            }

            ['avatar-pos-top-2','avatar-pos-center-2','avatar-pos-bottom-2','avatar-pos-custom-2'].forEach(btnId => {
                const btn = document.getElementById(btnId);
                if (btn) {
                    btn.addEventListener('click', () => {
                        settings.inChatAvatarPosition = btn.dataset.pos;
                        updateAvatarSettingsUI();
                        renderMessages(true);
                        throttledSaveData();
                    });
                }
            });

            const customOffsetSlider = document.getElementById('avatar-custom-offset-slider');
            const customOffsetValue = document.getElementById('avatar-custom-offset-value');
            if (customOffsetSlider) {
                customOffsetSlider.value = settings.inChatAvatarCustomOffset || 0;
                if (customOffsetValue) customOffsetValue.textContent = (settings.inChatAvatarCustomOffset || 0) + 'px';
                customOffsetSlider.addEventListener('input', () => {
                    const val = parseInt(customOffsetSlider.value, 10);
                    settings.inChatAvatarCustomOffset = val;
                    if (customOffsetValue) customOffsetValue.textContent = val + 'px';
                    document.documentElement.style.setProperty('--avatar-custom-offset', val + 'px');
                    document.querySelectorAll('.preview-msg-row').forEach(row => {
                        row.style.alignItems = 'flex-start';
                    });
                    const previewPartner = document.getElementById('preview-partner-avatar');
                    if (previewPartner) previewPartner.style.marginTop = val + 'px';
                    const previewMy = document.getElementById('preview-my-avatar');
                    if (previewMy) previewMy.style.marginTop = val + 'px';
                    renderMessages(true);
                });
                customOffsetSlider.addEventListener('change', throttledSaveData);
            }

            const alwaysAvatarToggle = document.getElementById('always-avatar-toggle');
            if (alwaysAvatarToggle) {
                alwaysAvatarToggle.addEventListener('click', () => {
                    settings.alwaysShowAvatar = !settings.alwaysShowAvatar;
                    updateAvatarSettingsUI();
                    renderMessages(true);
                    throttledSaveData();
                });
            }

            const partnerNameChatToggle = document.getElementById('partner-name-chat-toggle');
            if (partnerNameChatToggle) {
                partnerNameChatToggle.addEventListener('click', () => {
                    settings.showPartnerNameInChat = !settings.showPartnerNameInChat;
                    updateAvatarSettingsUI();
                    throttledSaveData();
                });
            }

            function updateAvatarPreview(shape, cornerRadius) {
                const previewPartner = document.getElementById('preview-partner-avatar');
                const previewMy = document.getElementById('preview-my-avatar');
                if (!previewPartner || !previewMy) return;
                const sz = `${settings.inChatAvatarSize || 36}px`;
                previewPartner.style.width = sz;
                previewPartner.style.height = sz;
                previewMy.style.width = sz;
                previewMy.style.height = sz;
                const partnerImg = DOMElements.partner && DOMElements.partner.avatar ? DOMElements.partner.avatar.querySelector('img') : null;
                const myImg = DOMElements.me && DOMElements.me.avatar ? DOMElements.me.avatar.querySelector('img') : null;
                const currentShape = shape || settings.myAvatarShape || 'circle';
                
                function applyToPreviewEl(el, img, shp, cr) {
                    if (img && img.src) {
                        el.innerHTML = `<img src="${img.src}" style="width:100%;height:100%;object-fit:cover;">`;
                    }
                    if (shp === 'circle') {
                        el.style.borderRadius = '50%';
                    } else if (shp === 'square') {
                        el.style.borderRadius = (cr || 8) + 'px';
                    }
                }
                const cr = cornerRadius !== undefined ? cornerRadius : parseInt(getComputedStyle(document.documentElement).getPropertyValue('--avatar-corner-radius') || '8') || 8;
                applyToPreviewEl(previewPartner, partnerImg, currentShape, cr);
                applyToPreviewEl(previewMy, myImg, currentShape, cr);
                if (typeof updateBubblePreview === 'function') updateBubblePreview();
            }

            function updateAvatarShapeBtns() {
                const shape = settings.myAvatarShape || 'circle';
                document.querySelectorAll('.avatar-shape-btn-2').forEach(b => {
                    b.classList.toggle('modal-btn-primary', b.dataset.shape === shape);
                    b.classList.toggle('modal-btn-secondary', b.dataset.shape !== shape);
                });
                const radiusCtrl = document.getElementById('avatar-corner-radius-control-2');
                if (radiusCtrl) radiusCtrl.style.display = shape === 'square' ? '' : 'none';
                updateAvatarPreview(shape);
            }
            document.querySelectorAll('.avatar-shape-btn-2').forEach(btn => {
                btn.addEventListener('click', () => {
                    const shape = btn.dataset.shape;
                    settings.myAvatarShape = shape;
                    settings.partnerAvatarShape = shape;
                    applyAvatarShapeToDOM && applyAvatarShapeToDOM('my', shape);
                    applyAvatarShapeToDOM && applyAvatarShapeToDOM('partner', shape);
                    updateAvatarShapeBtns();
                    updateAvatarPreview(shape);
                    renderMessages(true);
                    throttledSaveData();
                });
            });
            const cornerSlider = document.getElementById('avatar-corner-radius-slider-2');
            const cornerVal = document.getElementById('avatar-corner-radius-value-2');
            if (cornerSlider) {
                cornerSlider.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--avatar-corner-radius') || '8') || 8;
                if (cornerVal) cornerVal.textContent = cornerSlider.value + 'px';
                cornerSlider.addEventListener('input', () => {
                    const r = cornerSlider.value;
                    if (cornerVal) cornerVal.textContent = r + 'px';
                    document.documentElement.style.setProperty('--avatar-corner-radius', r + 'px');
                    updateAvatarPreview(settings.myAvatarShape || 'circle', parseInt(r));
                    renderMessages(true);
                });
                cornerSlider.addEventListener('change', () => {
                    settings.avatarCornerRadius = cornerSlider.value;
                    throttledSaveData();
                });
            }
            updateAvatarShapeBtns();

            document.querySelectorAll('[data-bubble-style]').forEach(item => {
                item.addEventListener('click', () => {
                    setTimeout(updateBubblePreview, 100);
                });
            });
            
            const minDelaySlider = document.getElementById('reply-delay-min-slider');
            const minDelayValue = document.getElementById('reply-delay-min-value');
            const maxDelaySlider = document.getElementById('reply-delay-max-slider');
            const maxDelayValue = document.getElementById('reply-delay-max-value');

            window.switchCsTab = function switchCsTab(btn) {
                document.querySelectorAll('.cs-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.cs-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = document.getElementById(btn.dataset.panel);
                if (panel) panel.classList.add('active');
            };

            function updateDelayUI() {
                minDelaySlider.value = settings.replyDelayMin;
                const minSec = settings.replyDelayMin / 1000;
                minDelayValue.textContent = minSec >= 60 ? `${(minSec/60).toFixed(1)}分钟` : `${minSec.toFixed(0)}s`;
                maxDelaySlider.value = settings.replyDelayMax;
                const maxSec = settings.replyDelayMax / 1000;
                maxDelayValue.textContent = maxSec >= 60 ? `${(maxSec/60).toFixed(1)}分钟` : `${maxSec.toFixed(0)}s`;
                maxDelaySlider.min = settings.replyDelayMin; 
            }
            updateDelayUI();

            minDelaySlider.addEventListener('input', (e) => {
                settings.replyDelayMin = parseInt(e.target.value, 10);
                if (settings.replyDelayMin > settings.replyDelayMax) {
                    settings.replyDelayMax = settings.replyDelayMin;
                }
                updateDelayUI();
            });
            minDelaySlider.addEventListener('change', throttledSaveData);

            maxDelaySlider.addEventListener('input', (e) => {
                settings.replyDelayMax = parseInt(e.target.value, 10);
                 if (settings.replyDelayMax < settings.replyDelayMin) {
                    settings.replyDelayMin = settings.replyDelayMax;
                }
                updateDelayUI();
            });
            maxDelaySlider.addEventListener('change', throttledSaveData);

            const settingToggles = {
                '#reply-toggle': {
                    prop: 'replyEnabled', name: '引用回复'
                },
                '#sound-toggle': {
                    prop: 'soundEnabled', name: '音效'
                },
                '#read-receipts-toggle': {
                    prop: 'readReceiptsEnabled', name: '已读回执'
                },
                '#typing-indicator-toggle': {
                    prop: 'typingIndicatorEnabled', name: '正在输入'},
                    '#read-no-reply-toggle': { prop: 'allowReadNoReply', name: '已读不回' },
                    '#emoji-mix-toggle': { prop: 'emojiMixEnabled', name: '表情混入消息' }
};

            for (const [selector, {
                prop, name
            }] of Object.entries(settingToggles)) {
                const element = document.querySelector(selector);
                if (!element) continue;

                const _initVal = prop === 'emojiMixEnabled' ? (settings[prop] !== false) : !!settings[prop];
                element.classList.toggle('active', _initVal);

                element.addEventListener('click', () => {
                    if (prop === 'emojiMixEnabled' && settings[prop] === undefined) settings[prop] = true;
                    settings[prop] = !settings[prop];
                    throttledSaveData();
                    updateUI();
                    element.classList.toggle('active', !!settings[prop]);
                    if (prop !== 'soundEnabled') renderMessages(true);
                    showNotification(`${name}已${settings[prop] ? '开启': '关闭'}`, 'success');
                });
            }

            const soundVolSlider = document.getElementById('sound-volume-slider');
            const soundVolVal = document.getElementById('sound-volume-value');
            if (soundVolSlider) {
                soundVolSlider.value = Math.round((settings.soundVolume || 0.15) * 100);
                if (soundVolVal) soundVolVal.textContent = soundVolSlider.value + '%';
                soundVolSlider.addEventListener('input', (e) => {
                    settings.soundVolume = parseInt(e.target.value) / 100;
                    if (soundVolVal) soundVolVal.textContent = e.target.value + '%';
                });
                soundVolSlider.addEventListener('change', throttledSaveData);
            }

            const bindPresetSelect = (selectId, settingsKey) => {
                const el = document.getElementById(selectId);
                if (!el) return;
                el.value = settings[settingsKey] || 'tone_default';
                el.addEventListener('change', () => {
                    settings[settingsKey] = el.value || 'tone_default';
                    throttledSaveData();
                });
            };

            bindPresetSelect('sound-my-send-preset', 'mySendSoundPreset');
            bindPresetSelect('sound-partner-message-preset', 'partnerMessageSoundPreset');
            bindPresetSelect('sound-my-poke-preset', 'myPokeSoundPreset');
            bindPresetSelect('sound-partner-poke-preset', 'partnerPokeSoundPreset');

            const bindCustomUrlInput = (inputId, settingsKey) => {
                const el = document.getElementById(inputId);
                if (!el) return;
                el.addEventListener('change', () => {
                    const val = el.value.trim();
                    // 如果是本地文件占位文字，不覆盖 settings（保留 base64）
                    if (val === '[本地文件（已上传）]') return;
                    // 如果清空了，同时清除可能存在的 base64
                    settings[settingsKey] = val;
                    throttledSaveData();
                });
            };

            bindCustomUrlInput('sound-my-send-custom-url', 'mySendCustomSoundUrl');
            bindCustomUrlInput('sound-partner-message-custom-url', 'partnerMessageCustomSoundUrl');
            bindCustomUrlInput('sound-my-poke-custom-url', 'myPokeCustomSoundUrl');
            bindCustomUrlInput('sound-partner-poke-custom-url', 'partnerPokeCustomSoundUrl');

            // 本地音频文件上传
            const bindAudioUpload = (btnId, fileInputId, urlInputId, settingsKey, presetSelectId) => {
                const btn = document.getElementById(btnId);
                const fileInput = document.getElementById(fileInputId);
                const urlInput = document.getElementById(urlInputId);
                if (!btn || !fileInput) return;
                btn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', () => {
                    const file = fileInput.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const base64 = e.target.result;
                        settings[settingsKey] = base64;
                        if (urlInput) urlInput.value = '[本地文件: ' + file.name + ']';
                        // 将 preset 切换到 custom（如果当前是 mute 则保持，否则不强制切换）
                        const sel = document.getElementById(presetSelectId);
                        if (sel && sel.value === 'mute') {
                            // 保持 mute，用户可手动切换
                        }
                        throttledSaveData();
                    };
                    reader.readAsDataURL(file);
                    fileInput.value = ''; // 允许重复选同一文件
                });
            };

            bindAudioUpload('upload-sound-my-send-btn', 'upload-sound-my-send-file', 'sound-my-send-custom-url', 'mySendCustomSoundUrl', 'sound-my-send-preset');
            bindAudioUpload('upload-sound-partner-message-btn', 'upload-sound-partner-message-file', 'sound-partner-message-custom-url', 'partnerMessageCustomSoundUrl', 'sound-partner-message-preset');
            bindAudioUpload('upload-sound-my-poke-btn', 'upload-sound-my-poke-file', 'sound-my-poke-custom-url', 'myPokeCustomSoundUrl', 'sound-my-poke-preset');
            bindAudioUpload('upload-sound-partner-poke-btn', 'upload-sound-partner-poke-file', 'sound-partner-poke-custom-url', 'partnerPokeCustomSoundUrl', 'sound-partner-poke-preset');

            const btnMySend = document.getElementById('test-sound-my-send-btn');
            if (btnMySend) btnMySend.addEventListener('click', () => playSound('my_send'));

            const btnPartnerMsg = document.getElementById('test-sound-partner-message-btn');
            if (btnPartnerMsg) btnPartnerMsg.addEventListener('click', () => playSound('partner_message'));

            const btnMyPoke = document.getElementById('test-sound-my-poke-btn');
            if (btnMyPoke) btnMyPoke.addEventListener('click', () => playSound('my_poke'));

            const btnPartnerPoke = document.getElementById('test-sound-partner-poke-btn');
            if (btnPartnerPoke) btnPartnerPoke.addEventListener('click', () => playSound('partner_poke'));

            document.querySelectorAll('.time-fmt-opt').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.fmt === (settings.timeFormat || 'HH:mm'));
                opt.addEventListener('click', () => {
                    document.querySelectorAll('.time-fmt-opt').forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                    settings.timeFormat = opt.dataset.fmt;
                    throttledSaveData();
                    renderMessages(true);
                    showNotification('时间格式已更新', 'success');
                });
            });


            const _appearanceEl = document.getElementById('appearance-settings');
            if (_appearanceEl) _appearanceEl.addEventListener('click', () => {
                hideModal(DOMElements.settingsModal.modal);
                window.hideAppearancePanel && window.hideAppearancePanel();
                renderBackgroundGallery();
                renderThemeSchemesList();
                
                const fontSizeSliderEl = document.getElementById('font-size-slider');
                const fontSizeValueEl = document.getElementById('font-size-value');
                if (fontSizeSliderEl) {
                    fontSizeSliderEl.value = settings.fontSize;
                    if (fontSizeValueEl) fontSizeValueEl.textContent = `${settings.fontSize}px`;
                }
                const fontUrlInputEl = document.getElementById('custom-font-url');
                if (fontUrlInputEl) fontUrlInputEl.value = settings.customFontUrl || '';
                const cssTextareaEl = document.getElementById('custom-bubble-css');
                if (cssTextareaEl) cssTextareaEl.value = settings.customBubbleCss || '';
                const globalCssTextareaEl = document.getElementById('custom-global-css');
                if (globalCssTextareaEl) globalCssTextareaEl.value = settings.customGlobalCss || '';
                
                document.querySelectorAll('[data-bubble-style]').forEach(item => {
                    item.classList.toggle('active', item.dataset.bubbleStyle === settings.bubbleStyle);
                });
                
                document.querySelectorAll('.theme-color-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.theme === settings.colorTheme);
                });
                
                showModal(DOMElements.appearanceModal.modal);
                setTimeout(() => { 
                    updateAvatarSettingsUI && updateAvatarSettingsUI(); 
                    setupAppearancePanelFrameSettings && setupAppearancePanelFrameSettings();
                }, 100);
            });
            DOMElements.appearanceModal.closeBtn.addEventListener('click', () => {
                    hideModal(DOMElements.appearanceModal.modal);
                });

            const bgInput = document.getElementById('bg-gallery-input');
            if (bgInput) {
                bgInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) {
                        showNotification('背景图片不能超过10MB', 'error');
                        return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                        showNotification('文件较大，正在处理中...', 'info', 2000);
                    }
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const base64 = event.target.result;
                        savedBackgrounds.push({
                            id: `user-${Date.now()}`,
                            type: file.type === 'image/gif' ? 'gif' : 'image',
                            value: base64
                        });
                        saveBackgroundGallery();
                        renderBackgroundGallery();
                        applyBackground(base64);
                        localforage.setItem(getStorageKey('chatBackground'), base64);
                        showNotification('新背景已添加并应用', 'success');
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                });
            }

const autoSendToggle = document.getElementById('auto-send-toggle');
const autoSendControl = document.getElementById('auto-send-control');
const autoSendSlider = document.getElementById('auto-send-slider');
const autoSendValue = document.getElementById('auto-send-value');

const updateAutoSendUI = () => {
    autoSendToggle.classList.toggle('active', !!settings.autoSendEnabled);
    autoSendControl.style.display = settings.autoSendEnabled ? "flex" : "none";
    const currentVal = settings.autoSendInterval || 5;
    autoSendSlider.value = currentVal;
    autoSendValue.textContent = `${currentVal}分钟`;
};

updateAutoSendUI();

autoSendToggle.addEventListener('click', () => {
    settings.autoSendEnabled = !settings.autoSendEnabled;
    updateAutoSendUI();
    manageAutoSendTimer(); 
    throttledSaveData();
    showNotification(`主动发送已${settings.autoSendEnabled ? '开启' : '关闭'}`, 'success');
});

autoSendSlider.value = settings.autoSendInterval || 5;
autoSendValue.textContent = `${settings.autoSendInterval || 5}分钟`;

autoSendSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    settings.autoSendInterval = val;
    autoSendValue.textContent = `${val}分钟`;
});

autoSendSlider.addEventListener('change', () => {
    manageAutoSendTimer(); 
    throttledSaveData();
});

            const resetBgBtn = document.getElementById('reset-default-bg');
            if (resetBgBtn) {
                resetBgBtn.addEventListener('click', () => {
                    removeBackground();
                    renderBackgroundGallery();
                    showNotification('已移除背景图', 'success');
                });
            }
        }



        function initNewFeatureListeners() {
            const flEntry = document.getElementById('fortune-lenormand-function');
            if (flEntry) {
                flEntry.addEventListener('click', () => {
                    hideModal(DOMElements.advancedModal.modal);
                    generateFortune();
                    switchFLTab('fortune');
                    showModal(document.getElementById('fortune-lenormand-modal'));
                });
            }

            const _closeLenormandEl = document.getElementById('close-lenormand');
            if (_closeLenormandEl) _closeLenormandEl.addEventListener('click', () => {
                hideModal(document.getElementById('fortune-lenormand-modal'));
            });
           
// 🔥 新增：朋友圈功能入口
const momentsEntry = document.getElementById('moments-function');
if (momentsEntry) {
    momentsEntry.addEventListener('click', () => {
        // 关闭高级功能模态框
        hideModal(DOMElements.advancedModal.modal);
        // 打开朋友圈模态框
        const modal = document.getElementById('moments-modal');
        if (modal) {
            showModal(modal);
            // 渲染朋友圈列表
            if (window.Moments) {
                const mode = window.Moments.getMode() || 'partner';
                window.Moments.render('moments-list', mode);
                // 更新 Tab 激活状态
                document.querySelectorAll('.moments-tab').forEach(t => t.classList.remove('active'));
                const tab = document.getElementById('moments-tab-' + mode);
                if (tab) tab.classList.add('active');
            }
            // 🔥 新增：加载头像预览
            loadAvatarPreviews();
        }
    });
}
// 我的头像上传
const myAvatarInput = document.getElementById('moment-my-avatar-input');
if (myAvatarInput) {
    myAvatarInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            const base64 = ev.target.result;
            if (typeof settings !== 'undefined') {
                settings.myAvatar = base64;
                if (typeof throttledSaveData === 'function') throttledSaveData();
                const preview = document.getElementById('moment-my-avatar-preview');
                if (preview) {
                    preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;">`;
                }
                if (window.Moments) {
                    window.Moments.render('moments-list', window.Moments.getMode());
                }
                showNotification('✅ 我的头像已更新', 'success');
            }
        };
        reader.readAsDataURL(file);
        this.value = '';
    });
}

// 梦角头像上传
const partnerAvatarInput = document.getElementById('moment-partner-avatar-input');
if (partnerAvatarInput) {
    partnerAvatarInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            const base64 = ev.target.result;
            if (typeof settings !== 'undefined') {
                settings.partnerAvatar = base64;
                if (typeof throttledSaveData === 'function') throttledSaveData();
                const preview = document.getElementById('moment-partner-avatar-preview');
                if (preview) {
                    preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;">`;
                }
                if (window.Moments) {
                    window.Moments.render('moments-list', window.Moments.getMode());
                }
                showNotification('✅ 梦角头像已更新', 'success');
            }
        };
        reader.readAsDataURL(file);
        this.value = '';
    });
}

// 点击按钮触发文件选择
const myAvatarBtn = document.getElementById('moment-set-my-avatar');
if (myAvatarBtn) {
    myAvatarBtn.addEventListener('click', function() {
        document.getElementById('moment-my-avatar-input').click();
    });
}

const partnerAvatarBtn = document.getElementById('moment-set-partner-avatar');
if (partnerAvatarBtn) {
    partnerAvatarBtn.addEventListener('click', function() {
        document.getElementById('moment-partner-avatar-input').click();
    });
}

// 清除头像
const clearAvatarBtn = document.getElementById('moment-avatar-clear-btn');
if (clearAvatarBtn) {
    clearAvatarBtn.addEventListener('click', function() {
        if (!confirm('确定清除所有头像吗？')) return;
        if (typeof settings !== 'undefined') {
            settings.myAvatar = '';
            settings.partnerAvatar = '';
            if (typeof throttledSaveData === 'function') throttledSaveData();
            const myPreview = document.getElementById('moment-my-avatar-preview');
            if (myPreview) {
                myPreview.innerHTML = '<i class="fas fa-user" style="font-size:14px; color:var(--text-secondary);"></i>';
            }
            const partnerPreview = document.getElementById('moment-partner-avatar-preview');
            if (partnerPreview) {
                partnerPreview.innerHTML = '<i class="fas fa-user" style="font-size:14px; color:var(--text-secondary);"></i>';
            }
            if (window.Moments) {
                window.Moments.render('moments-list', window.Moments.getMode());
            }
            showNotification('✅ 头像已清除', 'info');
        }
    });
}

// 加载头像预览
function loadAvatarPreviews() {
    if (typeof settings !== 'undefined') {
        const myPreview = document.getElementById('moment-my-avatar-preview');
        if (myPreview && settings.myAvatar) {
            myPreview.innerHTML = `<img src="${settings.myAvatar}" style="width:100%;height:100%;object-fit:cover;">`;
        }
        const partnerPreview = document.getElementById('moment-partner-avatar-preview');
        if (partnerPreview && settings.partnerAvatar) {
            partnerPreview.innerHTML = `<img src="${settings.partnerAvatar}" style="width:100%;height:100%;object-fit:cover;">`;
        }
    }
}

// 关闭朋友圈按钮
const closeMomentsBtn = document.getElementById('close-moments');
if (closeMomentsBtn) {
    closeMomentsBtn.addEventListener('click', () => {
        hideModal(document.getElementById('moments-modal'));
    });
}

// 发布朋友圈按钮
const submitMomentBtn = document.getElementById('moments-submit-btn');
if (submitMomentBtn) {
    submitMomentBtn.addEventListener('click', function() {
        const input = document.getElementById('moments-input');
        const text = input ? input.value.trim() : '';
        
        // 获取图片（从 file input 获取）
        const mediaInput = document.getElementById('moments-media-input');
        const file = mediaInput && mediaInput.files && mediaInput.files[0];
        
        // 获取预览图中的 base64（如果已有）
        const previewImg = document.getElementById('moments-media-preview-img');
        const previewSrc = previewImg ? previewImg.src : null;
        
        // 决定使用什么作为 media
        let media = null;
        if (file) {
            // 如果有文件对象，传递文件对象
            media = file;
            console.log('📸 发布时获取到文件:', file.name);
        } else if (previewSrc && previewSrc.startsWith('data:image')) {
            // 如果预览图是 base64，直接使用
            media = previewSrc;
            console.log('📸 发布时使用预览图 base64');
        } else {
            console.log('📸 没有图片');
        }
        
        if (window.Moments) {
            window.Moments.publishMoment(text, media);
        }
        
        // 关闭发布面板并清空（但保留 file input 中的文件？）
        const overlay = document.getElementById('moments-publish-overlay');
        if (overlay) overlay.style.display = 'none';
        if (input) input.value = '';
        
        // 清空图片预览
        const preview = document.getElementById('moments-media-preview');
        if (preview) preview.style.display = 'none';
        if (previewImg) previewImg.src = '';
        if (mediaInput) mediaInput.value = '';
    });
}

// 取消发布朋友圈（关闭发布面板）
const cancelPublishBtn = document.getElementById('moments-publish-overlay');
if (cancelPublishBtn) {
    // 点击背景关闭
    cancelPublishBtn.addEventListener('click', function(e) {
        if (e.target === this) {
            this.style.display = 'none';
            const input = document.getElementById('moments-input');
            if (input) input.value = '';
            const preview = document.getElementById('moments-media-preview');
            if (preview) preview.style.display = 'none';
        }
    });
}

// 朋友圈模式切换 - 我和TA
const tabPartner = document.getElementById('moments-tab-partner');
if (tabPartner) {
    tabPartner.addEventListener('click', function() {
        if (window.Moments) {
            window.Moments.setMode('partner');
            document.querySelectorAll('.moments-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            window.Moments.render('moments-list', 'partner');
            window.Moments.resetLoadMore && window.Moments.resetLoadMore();
        }
    });
}

// 朋友圈模式切换 - 群成员
const tabGroup = document.getElementById('moments-tab-group');
if (tabGroup) {
    tabGroup.addEventListener('click', function() {
        if (window.Moments) {
            window.Moments.setMode('group');
            document.querySelectorAll('.moments-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            window.Moments.render('moments-list', 'group');
            window.Moments.resetLoadMore && window.Moments.resetLoadMore();
        }
    });
}

// 召唤按钮 - 发朋友圈
const boostMomentBtn = document.getElementById('moments-boost-moment');
if (boostMomentBtn) {
    boostMomentBtn.addEventListener('click', function() {
        if (window.Moments) {
            window.Moments.boostMoment('moment');
        }
    });
}

// 召唤按钮 - 点赞
const boostLikeBtn = document.getElementById('moments-boost-like');
if (boostLikeBtn) {
    boostLikeBtn.addEventListener('click', function() {
        if (window.Moments) {
            window.Moments.boostMoment('like');
        }
    });
}

// 召唤按钮 - 评论
const boostCommentBtn = document.getElementById('moments-boost-comment');
if (boostCommentBtn) {
    boostCommentBtn.addEventListener('click', function() {
        if (window.Moments) {
            window.Moments.boostMoment('comment');
        }
    });
}


// 朋友圈图片上传（仅预览，不压缩）
const momentsMediaInputEl = document.getElementById('moments-media-input');
if (momentsMediaInputEl) {
    momentsMediaInputEl.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) {
            console.log('❌ 没有选择文件');
            return;
        }

        console.log('📸 选择文件:', file.name, (file.size / 1024 / 1024).toFixed(2), 'MB');

        if (file.size > 15 * 1024 * 1024) {
            showNotification('图片超过 15MB 限制', 'error');
            // 注意：这里不重置 value，保留文件
            return;
        }

        const reader = new FileReader();
        reader.onload = function(ev) {
            const dataUrl = ev.target.result;
            const img = document.getElementById('moments-media-preview-img');
            if (img) {
                img.src = dataUrl;
                const preview = document.getElementById('moments-media-preview');
                if (preview) preview.style.display = 'block';
                console.log('✅ 预览图已加载');
            }
        };
        reader.onerror = function(err) {
            console.error('❌ 图片读取失败:', err);
            showNotification('图片读取失败', 'error');
        };
        reader.readAsDataURL(file);
        // ✅ 删除 this.value = ''; 这行！
        // 保留文件在 input 中，供发布时使用
    });
}
// ============================================================
    const envelopeEntryBtn = document.getElementById('envelope-function');
    if (envelopeEntryBtn) {
        envelopeEntryBtn.addEventListener('click', async () => {
            hideModal(DOMElements.advancedModal.modal);
            await loadEnvelopeData();
            await checkEnvelopeStatus();
            currentEnvTab = 'outbox';
            document.getElementById('env-tab-outbox').classList.add('active');
            document.getElementById('env-tab-inbox').classList.remove('active');
            document.getElementById('env-outbox-section').style.display = 'block';
            document.getElementById('env-inbox-section').style.display = 'none';
            document.getElementById('env-compose-form').style.display = 'none';
            document.getElementById('env-main-close-btn').style.display = 'flex';
            renderEnvelopeLists();
            showModal(document.getElementById('envelope-modal'));
        });
    }
    const galleryBanner = document.getElementById('gallery-banner-entry');
    if (galleryBanner) {
        galleryBanner.addEventListener('click', () => {
            window.open('https://aielin17.github.io/-/', '_blank');
        });
        galleryBanner.addEventListener('mousedown', () => { galleryBanner.style.transform = 'scale(0.97)'; });
        galleryBanner.addEventListener('mouseup', () => { galleryBanner.style.transform = 'scale(1)'; });
        galleryBanner.addEventListener('mouseleave', () => { galleryBanner.style.transform = 'scale(1)'; });
    }
const _sendEnvEl = document.getElementById('send-envelope');
if (_sendEnvEl) _sendEnvEl.addEventListener('click', handleSendEnvelope);

const _cancelEnvEl = document.getElementById('cancel-envelope');
if (_cancelEnvEl) _cancelEnvEl.addEventListener('click', () => {
    hideModal(document.getElementById('envelope-modal'));
});
            const closeFortune = document.getElementById('close-fortune');
            if (closeFortune) {
                closeFortune.addEventListener('click', () => {
                    hideModal(document.getElementById('fortune-lenormand-modal'));
                });
            }


            const _batchFavEl = document.getElementById('batch-favorite-function');
            if (_batchFavEl) _batchFavEl.addEventListener('click', () => {
                hideModal(DOMElements.favoritesModal.modal);
                toggleBatchFavoriteMode();
            });

            initReplyLibraryListeners();


            
            DOMElements.anniversaryAnimation.closeBtn.addEventListener('click', () => {
                DOMElements.anniversaryAnimation.modal.classList.remove('active');
            });


            const _statsFuncEl = document.getElementById('stats-function');
            if (_statsFuncEl) _statsFuncEl.addEventListener('click', () => {
                hideModal(DOMElements.advancedModal.modal);
                renderStatsContent();
                showModal(DOMElements.statsModal.modal);
            });

            const coinFunctionBtn = document.getElementById('coin-function');
            if (coinFunctionBtn) {
                coinFunctionBtn.addEventListener('click', () => {
                    hideModal(DOMElements.advancedModal.modal);
                    handleCoinToss();
                });
            }
            const musicToggle = document.getElementById('music-player-toggle');
            musicToggle.addEventListener('click', () => {
                settings.musicPlayerEnabled = !settings.musicPlayerEnabled;
                throttledSaveData();

                const player = document.getElementById('player');
                if (settings.musicPlayerEnabled) {
                    player.classList.add('visible');
                    showNotification('音乐播放器已开启', 'success');
                } else {
                    player.classList.remove('visible');
                    document.getElementById('playlist').classList.remove('active');
                    const audio = document.getElementById('audio');
                    if (audio) audio.pause();
                    showNotification('音乐播放器已关闭', 'info');
                }
                hideModal(DOMElements.advancedModal.modal);
            });
        }
    const annToggleBtn = document.getElementById('ann-toggle-btn');
    const annFormWrapper = document.getElementById('ann-form-wrapper');

    if (annToggleBtn && annFormWrapper) {
        annToggleBtn.addEventListener('click', () => {
            const isActive = annFormWrapper.classList.contains('active');
            
            if (isActive) {
                annFormWrapper.classList.remove('active');
                annToggleBtn.classList.remove('active');
            } else {
                annFormWrapper.classList.add('active');
                annToggleBtn.classList.add('active');
                
                setTimeout(() => {
                    annFormWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 300);
            }
        });
    }

        function getBubbleStyleName(style) {
            const names = {
                'standard': '标准',
                'rounded': '圆角',
                'rounded-large': '大圆角',
                'square': '方形'
            };
            return names[style] || '标准';
        }


        function initDataManagementListeners() {

            const _clearStorageEl = document.getElementById('clear-storage');
            if (_clearStorageEl) _clearStorageEl.addEventListener('click', clearAllAppData);
            const creditsBtn = document.getElementById('open-credits-btn');
            if (creditsBtn) {
                creditsBtn.addEventListener('click', () => {

                    hideModal(DOMElements.dataModal.modal);


                    const disclaimerModal = document.getElementById('disclaimer-modal');


                    if (disclaimerModal) {
                        showModal(disclaimerModal);
                    }
                });
            }

        }



        DOMElements.sessionModal.managerBtn.addEventListener('click', () => {
            renderSessionList(); showModal(DOMElements.sessionModal.modal);
        });
        DOMElements.sessionModal.createBtn.addEventListener('click', async () => {
            await createNewSession(false);
            renderSessionList();
            showNotification('新会话已创建', 'success');
        });

        DOMElements.sessionModal.list.addEventListener('click', (e) => {
            const item = e.target.closest('.session-item');
            if (!item) return;
            const sessionId = item.dataset.id;

            if (e.target.closest('.rename')) {
                const session = sessionList.find(s => s.id === sessionId);
                const newName = prompt('输入新的会话名称:', session.name);
                if (newName && newName.trim()) {
                    session.name = newName.trim();
                    localforage.setItem(`${APP_PREFIX}sessionList`, sessionList); 
                    renderSessionList();
                    showNotification('会话已重命名', 'success');
                }
            } else if (e.target.closest('.delete')) {
                if (sessionList.length <= 1) {
                    showNotification('无法删除最后一个会话', 'warning');
                    return;
                }
                if (confirm('确定要删除此会话及其所有聊天记录吗？此操作不可恢复')) {

                    const currentSessionId = SESSION_ID;

                    sessionList = sessionList.filter(s => s.id !== sessionId);
localforage.setItem(`${APP_PREFIX}sessionList`, sessionList);

// 同时清除 localStorage 和 localforage 中该会话的所有键
Object.keys(localStorage).forEach(key => {
    if (key.startsWith(`${APP_PREFIX}${sessionId}_`)) safeRemoveItem(key);
});
localforage.keys().then(keys => {
    keys.forEach(key => {
        if (key.startsWith(`${APP_PREFIX}${sessionId}_`)) {
            localforage.removeItem(key).catch(() => {});
        }
    });
}).catch(() => {});

if (sessionId === currentSessionId) {
    const newCurrentId = sessionList[0].id;
    localforage.setItem(`${APP_PREFIX}customThemes`, customThemes);
    window.location.hash = newCurrentId;
    window.location.reload();
} else {
    renderSessionList();
    showNotification('会话已删除', 'success');
}
                }
            } else {

                if (sessionId !== SESSION_ID) {
                    if (confirm('切换会话将刷新页面，确定要继续吗？')) {
                        window.location.hash = sessionId;
                        window.location.reload();
                    }
                }
            }
        });

        // ============================================
        // 决策功能事件绑定（适配项目现有结构）
        // ============================================

        // 1. 高级功能 → 打开决策模态框
        document.getElementById('decision-function')?.addEventListener('click', function() {
            var advancedModal = document.getElementById('advanced-modal');
            if (advancedModal && typeof hideModal === 'function') hideModal(advancedModal);
            var decisionModal = document.getElementById('decision-modal');
            if (decisionModal && typeof showModal === 'function') showModal(decisionModal);
            loadGcDecisionMembers();
        });
// 2. 新增：帮我决定独立入口
document.getElementById('decision-new-function')?.addEventListener('click', function() {
    var advancedModal = document.getElementById('advanced-modal');
    if (advancedModal && typeof hideModal === 'function') hideModal(advancedModal);
    var decisionModal = document.getElementById('decision-modal');
    if (decisionModal && typeof showModal === 'function') showModal(decisionModal);
    loadGcDecisionMembers();
});

        // 2. 关闭决策模态框
        document.getElementById('close-decision-modal')?.addEventListener('click', function() {
            var modal = document.getElementById('decision-modal');
            if (modal && typeof hideModal === 'function') hideModal(modal);
        });

        // 3. 单聊/群聊 模式切换
        document.querySelectorAll('.decision-mode-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.decision-mode-tab').forEach(function(t) {
                    t.classList.remove('active');
                });
                this.classList.add('active');
                var mode = this.dataset.mode;
                document.getElementById('decision-single-panel').style.display = mode === 'single' ? 'block' : 'none';
                document.getElementById('decision-group-panel').style.display = mode === 'group' ? 'block' : 'none';
                if (mode === 'group') loadGcDecisionMembers();
            });
        });

        // 4. 单聊 - 是/否/半对
document.getElementById('decide-yn-btn')?.addEventListener('click', function() {
    var input = document.getElementById('decide-yn-input');
    var q = input.value.trim();
    if (!q) {
        if (typeof showNotification === 'function') showNotification('请输入你的问题', 'warning');
        return;
    }
    input.value = '';
    
    // ★ 先发送用户的问题
    if (typeof addMessage === 'function') {
        addMessage({
            id: Date.now(),
            sender: 'user',
            text: q,
            timestamp: new Date(),
            status: 'sent',
            type: 'normal'
        });
    }

    if (typeof window.singleDecideYesNo === 'function') {
        window.singleDecideYesNo(q, function(reply) {
            if (typeof addMessage === 'function') {
                addMessage({
                    id: Date.now() + 1,
                    sender: settings.partnerName || '梦角',
                    text: reply,
                    timestamp: new Date(),
                    status: 'received',
                    type: 'normal'
                });
                if (typeof throttledSaveData === 'function') throttledSaveData();
            }
        });
    }
});

        // 5. 单聊 - 自定义选项
document.getElementById('decide-custom-btn')?.addEventListener('click', function() {
    var textarea = document.getElementById('decide-options-input');
    var raw = textarea.value.trim();
    if (!raw) {
        if (typeof showNotification === 'function') showNotification('请输入选项（每行一个）', 'warning');
        return;
    }
    var opts = raw.split(/\r?\n/).filter(function(s) { return s.trim(); });
    if (opts.length < 2) {
        if (typeof showNotification === 'function') showNotification('至少需要2个选项', 'warning');
        return;
    }
    var maxPick = parseInt(document.getElementById('decide-maxpick').value) || 1;
    textarea.value = '';

    // ★ 获取用户自定义问题
    var questionInput = document.getElementById('decide-custom-question');
    var question = questionInput ? questionInput.value.trim() : '';
    questionInput.value = '';

    // ★ 构建更自然的问题消息
    var optionList = opts.map(function(opt, idx) {
        return (idx + 1) + '. ' + opt;
    }).join('\n');
    
    var questionText;
    if (question) {
        questionText = '关于“' + question + '”，请告诉我你的决定是：\n' + optionList;
    } else {
        questionText = '请从以下选项中选择：\n' + optionList;
    }

    // ★ 先发送用户的问题
    if (typeof addMessage === 'function') {
        addMessage({
            id: Date.now(),
            sender: 'user',
            text: questionText,
            timestamp: new Date(),
            status: 'sent',
            type: 'normal'
        });
    }

    if (typeof window.singleDecideCustom === 'function') {
        window.singleDecideCustom(opts, maxPick, function(reply) {
            if (typeof addMessage === 'function') {
                // ★ 梦角的回复也格式化为更自然的表达
                var answerText = reply.startsWith('我选') ? reply : '我的决定是：' + reply;
                addMessage({
                    id: Date.now() + 1,
                    sender: settings.partnerName || '梦角',
                    text: answerText,
                    timestamp: new Date(),
                    status: 'received',
                    type: 'normal'
                });
                if (typeof throttledSaveData === 'function') throttledSaveData();
            }
        });
    }
});

        // 6. 群聊 - 是/否/半对（适配 groupChatSettings）
        document.getElementById('gc-decide-yn-btn')?.addEventListener('click', function() {
            var input = document.getElementById('gc-decide-yn-input');
            var q = input.value.trim();
            if (!q) {
                if (typeof showNotification === 'function') showNotification('请输入你的问题', 'warning');
                return;
            }
            var checked = document.querySelectorAll('#gc-decision-member-list input:checked');
            if (checked.length === 0) {
                if (typeof showNotification === 'function') showNotification('请至少选择一个群成员', 'warning');
                return;
            }
            var memberIds = [];
            checked.forEach(function(cb) {
                memberIds.push(cb.value);
            });
            input.value = '';

            if (typeof window.gcAskYesNo === 'function') {
                window.gcAskYesNo(q, memberIds, function(results) {
                    // 结果由函数内部通过 addMessage 发送，无需额外操作
                    if (typeof showNotification === 'function') showNotification('群成员已做出决定', 'success');
                });
            }
        });

        // 7. 群聊 - 自定义选项（适配 groupChatSettings）
        document.getElementById('gc-decide-custom-btn')?.addEventListener('click', function() {
            var textarea = document.getElementById('gc-decide-options-input');
            var raw = textarea.value.trim();
            if (!raw) {
                if (typeof showNotification === 'function') showNotification('请输入选项（每行一个）', 'warning');
                return;
            }
            var opts = raw.split(/\r?\n/).filter(function(s) { return s.trim(); });
            if (opts.length < 2) {
                if (typeof showNotification === 'function') showNotification('至少需要2个选项', 'warning');
                return;
            }
            var checked = document.querySelectorAll('#gc-decision-member-list input:checked');
            if (checked.length === 0) {
                if (typeof showNotification === 'function') showNotification('请至少选择一个群成员', 'warning');
                return;
            }
            var memberIds = [];
            checked.forEach(function(cb) {
                memberIds.push(cb.value);
            });
            var maxPick = parseInt(document.getElementById('gc-decide-maxpick').value) || 1;
            textarea.value = '';

            if (typeof window.gcAskCustom === 'function') {
                window.gcAskCustom(opts, maxPick, memberIds, function(results) {
                    if (typeof showNotification === 'function') showNotification('群成员已做出选择', 'success');
                });
            }
        });

        // 8. 反向提问增强
       document.getElementById('boost-askme-btn')?.addEventListener('click', function() {
    if (typeof window.addAskMeBoost === 'function') {
        window.addAskMeBoost('partner');
        var hint = document.getElementById('askme-boost-hint');
        if (hint) {
            hint.style.display = 'block';
            hint.textContent = '🌸 已邀请梦角～ 接下来一小时内提问概率提升！';
        }
    }
});

        // 9. 工具函数：从 groupChatSettings 加载成员到复选框
        function loadGcDecisionMembers() {
            var container = document.getElementById('gc-decision-member-list');
            if (!container) return;
            var members = window.groupChatSettings?.members || [];
            if (members.length === 0) {
                container.innerHTML = '<div style="color:#aaa;font-size:12px;padding:8px;">暂无群成员，请先到「群聊设置」中添加</div>';
                return;
            }
            container.innerHTML = members.map(function(m) {
                var id = m.id || 'gcm_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
                if (!m.id) m.id = id;
                return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 0;">' +
                    '<input type="checkbox" value="' + id + '" checked> ' + m.name +
                    '</label>';
            }).join('');
        }

        // 10. 首次加载时预加载群成员（在 DOM 就绪后执行）
        setTimeout(loadGcDecisionMembers, 500);

        // 暴露 loadGcDecisionMembers 到全局，便于其他模块调用
// ============================================
// 反向提问问题库管理
// ============================================

// 渲染问题列表
function renderReverseQuestionsUI() {
    var container = document.getElementById('reverse-question-list');
    if (!container) return;
    
    // 强制从 core.js 同步
    if (window.customReverseQuestions !== customReverseQuestions) {
        window.customReverseQuestions = customReverseQuestions;
    }
    var list = window.customReverseQuestions || [];
    if (list.length === 0) {
        container.innerHTML = '<div style="font-size:12px; color:var(--text-secondary); padding:8px 0; text-align:center;">暂无自定义问题，将使用内置默认问题</div>';
        return;
    }
    container.innerHTML = list.map(function(q, index) {
        return '<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid var(--border-color); font-size:13px;">' +
            '<span style="flex:1; word-break:break-word;">' + q + '</span>' +
            '<button data-index="' + index + '" class="reverse-question-del-btn" style="background:none; border:none; color:#ff6b6b; cursor:pointer; font-size:14px; padding:0 4px;">✕</button>' +
            '</div>';
    }).join('');
    // 绑定删除事件
    container.querySelectorAll('.reverse-question-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.index);
            if (window.customReverseQuestions && window.customReverseQuestions.length > idx) {
                window.customReverseQuestions.splice(idx, 1);
                if (typeof throttledSaveData === 'function') throttledSaveData();
                renderReverseQuestionsUI();
                showNotification('问题已删除', 'success');
            }
        });
    });
}

// 展开/收起管理面板
document.getElementById('toggle-reverse-manager')?.addEventListener('click', function() {
    var panel = document.getElementById('reverse-manager-panel');
    if (panel) {
        var isHidden = panel.style.display === 'none' || panel.style.display === '';
        panel.style.display = isHidden ? 'block' : 'none';
        if (isHidden) renderReverseQuestionsUI();
    }
});

// 添加新问题
document.getElementById('reverse-question-add-btn')?.addEventListener('click', function() {
    var input = document.getElementById('reverse-question-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) {
        showNotification('请输入问题内容', 'warning');
        return;
    }
    if (!window.customReverseQuestions) window.customReverseQuestions = [];
    window.customReverseQuestions.push(text);
    input.value = '';
    if (typeof throttledSaveData === 'function') throttledSaveData();
    renderReverseQuestionsUI();
    showNotification('问题已添加', 'success');
});

// 按回车键添加
document.getElementById('reverse-question-input')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('reverse-question-add-btn')?.click();
    }
});

// 初始加载时同步 window 引用（与 core.js 共享）
// 页面加载完成后同步
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        window.customReverseQuestions = customReverseQuestions;
        // 如果管理面板已打开，刷新列表
        var panel = document.getElementById('reverse-manager-panel');
        if (panel && panel.style.display !== 'none') {
            renderReverseQuestionsUI();
        }
    }, 500);
});
        window.loadGcDecisionMembers = loadGcDecisionMembers;