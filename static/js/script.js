// 显示模式选择页面
function showModeSelection() {
    // 隐藏所有生成页面
    document.querySelectorAll('.generation-page').forEach(page => {
        page.style.display = 'none';
    });
    
    // 显示模式选择页面
    document.getElementById('mode-selection').style.display = 'block';
}

// 显示特定生成页面
function showGenerationPage(mode) {
    // 隐藏模式选择页面
    document.getElementById('mode-selection').style.display = 'none';
    
    // 隐藏所有生成页面
    document.querySelectorAll('.generation-page').forEach(page => {
        page.style.display = 'none';
    });
    
    // 显示选定的生成页面
    document.getElementById(`${mode}-page`).style.display = 'block';
    
    // 如果是合并模式，加载可用视频
    if (mode === 'merge') {
        loadAvailableVideos();
    }
}

// 初始化视频合并模式
function initializeMergeMode() {
    // 添加视频节点按钮
    document.getElementById('addVideoNode').addEventListener('click', addVideoNode);
    
    // 清空节点按钮
    document.getElementById('clearVideoNodes').addEventListener('click', clearVideoNodes);
    
    // 合并视频按钮
    document.getElementById('mergeVideos').addEventListener('click', mergeVideos);
    
    // 创建新合并按钮
    document.getElementById('createNewMerge').addEventListener('click', resetMergeMode);
}

// 加载可用视频列表
async function loadAvailableVideos() {
    try {
        const response = await fetch('/list_merge_videos');
        const data = await response.json();
        
        if (data.success) {
            // 存储可用视频列表
            window.availableVideos = data.videos;
            
            // 如果有视频节点，更新它们的选择列表
            updateAllVideoSelects();
            
            // 更新合并按钮状态
            updateMergeButtonState();
        } else {
            showToast('加载视频列表失败: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error loading videos:', error);
        showToast('加载视频列表失败，请检查网络连接', 'error');
    }
}

// 全局变量
let videoNodes = []; // 存储视频节点
let nextNodeId = 1; // 下一个节点ID

// 初始化可用视频列表
if (!window.availableVideos) {
    window.availableVideos = []; // 可用视频列表
}

// 节点类型选择器相关变量
let selectedNodeType = 'video';

// 初始化节点类型选择器
function initNodeTypeSelector() {
    const typeOptions = document.querySelectorAll('.type-option');
    const addNodeBtn = document.querySelector('.btn-add-node');
    const selectedTypeIndicator = document.querySelector('.selected-type-indicator');
    
    typeOptions.forEach(option => {
        option.addEventListener('click', () => {
            // 移除所有选中状态
            typeOptions.forEach(opt => opt.classList.remove('selected'));
            // 添加选中状态
            option.classList.add('selected');
            
            // 更新选中的节点类型
            selectedNodeType = option.dataset.type;
            
            // 更新指示器
            updateSelectedTypeIndicator();
            
            // 启用添加按钮
            addNodeBtn.disabled = false;
        });
    });
    
    // 默认选择视频类型
    const defaultOption = document.querySelector('.type-option[data-type="video"]');
    if (defaultOption) {
        defaultOption.click();
    }
}

// 更新选中类型指示器
function updateSelectedTypeIndicator() {
    const indicator = document.querySelector('.selected-type-indicator');
    const typeIcon = indicator.querySelector('.type-icon');
    const typeText = indicator.querySelector('.type-text');
    
    if (selectedNodeType === 'video') {
        typeIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
        typeText.textContent = '视频节点';
    } else {
        typeIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
        typeText.textContent = '音频节点';
    }
}

// 添加视频节点
function addVideoNode() {
    if (!selectedNodeType) {
        alert('请先选择节点类型');
        return;
    }
    
    const nodeId = `node_${nextNodeId++}`;
    const nodeNumber = videoNodes.length + 1;
    
    // 从模板创建节点
    const template = document.getElementById('videoNodeTemplate').innerHTML;
    const nodeHtml = template
        .replace(/{nodeId}/g, nodeId)
        .replace(/{nodeNumber}/g, nodeNumber);
    
    // 创建节点元素
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = nodeHtml;
    const nodeElement = tempDiv.firstElementChild;
    
    // 设置节点类型和状态
    nodeElement.dataset.nodeType = selectedNodeType;
    nodeElement.dataset.status = 'idle';
    
    // 设置节点标题
    const nodeTitle = nodeElement.querySelector('.node-title');
    if (nodeTitle) {
        nodeTitle.textContent = `${selectedNodeType === 'video' ? '视频' : '音频'}节点 ${nodeNumber}`;
    }
    
    // 设置节点类型图标
    const typeIcon = nodeElement.querySelector('.node-type-icon');
    if (typeIcon) {
        if (selectedNodeType === 'video') {
            typeIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
        } else {
            typeIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
        }
    }
    
    // 设置上传区域文本
    const uploadText = nodeElement.querySelector('.upload-text');
    const uploadHint = nodeElement.querySelector('.upload-hint');
    if (uploadText && uploadHint) {
        if (selectedNodeType === 'video') {
            uploadText.textContent = '点击或拖拽上传视频文件';
            uploadHint.textContent = '支持 MP4, AVI, MOV 等格式';
        } else {
            uploadText.textContent = '点击或拖拽上传音频文件';
            uploadHint.textContent = '支持 MP3, WAV, AAC 等格式';
        }
    }
    
    // 添加到节点列表
    const nodesList = document.getElementById('videoNodesList');
    
    // 如果是第一个节点，清除空消息
    if (videoNodes.length === 0) {
        nodesList.innerHTML = '';
    }
    
    nodesList.appendChild(nodeElement);
    
    // 存储节点信息
    const nodeInfo = {
        id: nodeId,
        element: nodeElement,
        file: null,
        type: selectedNodeType,
        url: null,
        status: 'idle',
        progress: 0
    };
    
    videoNodes.push(nodeInfo);
    
    // 绑定事件处理
    bindNodeEvents(nodeInfo);
    
    // 更新节点编号
    updateNodeNumbers();
    
    // 更新合并按钮状态
    updateMergeButtonState();
    
    // 根据当前合并类型更新节点显示
    updateNodesByMergeType();
    
    // 添加动画效果
    nodeElement.style.opacity = '0';
    nodeElement.style.transform = 'translateY(20px)';
    setTimeout(() => {
        nodeElement.style.transition = 'all 0.3s ease';
        nodeElement.style.opacity = '1';
        nodeElement.style.transform = 'translateY(0)';
    }, 10);
    
    return nodeInfo;
}

// 绑定节点事件
function bindNodeEvents(nodeInfo) {
    const nodeId = nodeInfo.id;
    const nodeElement = nodeInfo.element;
    
    if (!nodeInfo) return;
    
    // 上传区域拖拽和点击事件
    const uploadArea = nodeElement.querySelector('.upload-area');
    const fileInput = nodeElement.querySelector('.file-input');
    const changeFileBtn = nodeElement.querySelector('.btn-change-file');
    
    if (uploadArea && fileInput) {
        // 点击上传区域
        uploadArea.addEventListener('click', () => {
            if (!nodeInfo.file) {
                fileInput.click();
            }
        });
        
        // 拖拽事件
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        
        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileUpload(nodeElement, files[0]);
            }
        });
        
        // 文件选择事件
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFileUpload(nodeElement, file);
            }
        });
    }
    
    // 更换文件按钮
    if (changeFileBtn) {
        changeFileBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }
    
    // 移动和删除按钮
    const moveUpBtn = nodeElement.querySelector('.btn-move-up');
    const moveDownBtn = nodeElement.querySelector('.btn-move-down');
    const removeBtn = nodeElement.querySelector('.btn-remove');
    
    if (moveUpBtn) {
        moveUpBtn.addEventListener('click', () => moveNodeUp(nodeId));
    }
    
    if (moveDownBtn) {
        moveDownBtn.addEventListener('click', () => moveNodeDown(nodeId));
    }
    
    if (removeBtn) {
        removeBtn.addEventListener('click', () => removeVideoNode(nodeId));
    }
    
    // 节点拖拽排序功能
    const nodeCard = nodeElement.querySelector('.node-card');
    if (nodeCard) {
        nodeCard.draggable = true;
        
        nodeCard.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', nodeId);
            nodeElement.classList.add('dragging');
        });
        
        nodeCard.addEventListener('dragend', (e) => {
            nodeElement.classList.remove('dragging');
        });
        
        nodeCard.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingElement = document.querySelector('.dragging');
            if (draggingElement && draggingElement !== nodeElement) {
                const container = document.getElementById('videoNodesList');
                const afterElement = getDragAfterElement(container, e.clientY);
                if (afterElement == null) {
                    container.appendChild(draggingElement);
                } else {
                    container.insertBefore(draggingElement, afterElement);
                }
            }
        });
        
        nodeCard.addEventListener('drop', (e) => {
            e.preventDefault();
            updateNodeOrder();
        });
    }
}

// 处理文件上传
function handleFileUpload(nodeElement, file) {
    const nodeId = nodeElement.id;
    const nodeInfo = videoNodes.find(node => node.id === nodeId);
    
    if (!nodeInfo) return;
    
    // 验证文件类型
    const fileType = file.type;
    const isVideo = fileType.startsWith('video/');
    const isAudio = fileType.startsWith('audio/');
    
    if (nodeInfo.type === 'video' && !isVideo) {
        alert('请选择视频文件');
        return;
    }
    
    if (nodeInfo.type === 'audio' && !isAudio) {
        alert('请选择音频文件');
        return;
    }
    
    // 更新节点信息
    nodeInfo.file = file;
    nodeInfo.status = 'idle';
    
    // 更新UI显示
    updateNodeFileDisplay(nodeElement, file);
    updateNodeStatus(nodeElement, 'idle');
    updateMergeButtonState();
}

// 更新节点文件显示
function updateNodeFileDisplay(nodeElement, file) {
    const uploadArea = nodeElement.querySelector('.upload-area');
    const fileInfo = nodeElement.querySelector('.file-info');
    const fileName = nodeElement.querySelector('.file-name');
    const fileSize = nodeElement.querySelector('.file-size');
    const previewSection = nodeElement.querySelector('.node-preview-section');
    
    if (file) {
        // 隐藏上传区域，显示文件信息
        if (uploadArea) uploadArea.style.display = 'none';
        if (fileInfo) fileInfo.style.display = 'flex';
        
        // 更新文件信息
        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = formatFileSize(file.size);
        
        // 更新预览
        const nodeInfo = videoNodes.find(node => node.element === nodeElement);
        if (nodeInfo) {
            nodeInfo.file = file;
            updateFilePreview(nodeInfo);
        }
        if (previewSection) previewSection.style.display = 'block';
    } else {
        // 显示上传区域，隐藏文件信息
        if (uploadArea) uploadArea.style.display = 'block';
        if (fileInfo) fileInfo.style.display = 'none';
        if (previewSection) previewSection.style.display = 'none';
    }
}

// 更新节点状态
function updateNodeStatus(nodeElement, status) {
    const nodeId = nodeElement.id;
    const nodeInfo = videoNodes.find(node => node.id === nodeId);
    
    if (nodeInfo) {
        nodeInfo.status = status;
        nodeElement.dataset.status = status;
        
        const statusIndicator = nodeElement.querySelector('.node-status-indicator');
        if (statusIndicator) {
            statusIndicator.dataset.status = status;
        }
    }
}

// 更新节点进度
function updateNodeProgress(nodeElement, progress) {
    const nodeId = nodeElement.id;
    const nodeInfo = videoNodes.find(node => node.id === nodeId);
    
    if (nodeInfo) {
        nodeInfo.progress = progress;
        
        const progressFill = nodeElement.querySelector('.progress-fill');
        const progressText = nodeElement.querySelector('.progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${Math.round(progress)}%`;
        }
    }
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 删除旧版本的updateFilePreview函数，使用下面的新版本

// 更新合并按钮状态
function updateMergeButtonState() {
    const mergeBtn = document.getElementById('mergeVideosBtn');
    if (!mergeBtn) return;
    
    const hasFiles = videoNodes.some(node => node.file);
    mergeBtn.disabled = !hasFiles;
}

// 移动节点向上
function moveNodeUp(nodeId) {
    const nodeIndex = videoNodes.findIndex(node => node.id === nodeId);
    if (nodeIndex > 0) {
        // 交换数组中的位置
        [videoNodes[nodeIndex], videoNodes[nodeIndex - 1]] = [videoNodes[nodeIndex - 1], videoNodes[nodeIndex]];
        
        // 重新渲染节点列表
        renderVideoNodes();
    }
}

// 移动节点向下
function moveNodeDown(nodeId) {
    const nodeIndex = videoNodes.findIndex(node => node.id === nodeId);
    if (nodeIndex < videoNodes.length - 1) {
        // 交换数组中的位置
        [videoNodes[nodeIndex], videoNodes[nodeIndex + 1]] = [videoNodes[nodeIndex + 1], videoNodes[nodeIndex]];
        
        // 重新渲染节点列表
        renderVideoNodes();
    }
}

// 重新渲染所有节点
function renderVideoNodes() {
    const container = document.getElementById('videoNodesList');
    if (!container) return;
    
    // 清空容器
    container.innerHTML = '';
    
    // 重新添加所有节点
    videoNodes.forEach((nodeInfo, index) => {
        const nodeElement = createNodeElement(nodeInfo.id, nodeInfo.type);
        container.appendChild(nodeElement);
        
        // 恢复文件信息
        if (nodeInfo.file) {
            updateNodeFileDisplay(nodeElement, nodeInfo.file);
        }
        
        // 恢复状态
        updateNodeStatus(nodeElement, nodeInfo.status || 'empty');
        
        // 恢复进度
        if (nodeInfo.progress) {
            updateNodeProgress(nodeElement, nodeInfo.progress);
        }
        
        // 更新nodeInfo的element引用
        nodeInfo.element = nodeElement;
        
        // 重新绑定事件
        bindNodeEvents(nodeInfo);
    });
    
    // 更新空状态显示
    updateEmptyState();
}

// 获取拖拽后的插入位置
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.workflow-node:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// 更新节点顺序
function updateNodeOrder() {
    const container = document.getElementById('videoNodesList');
    if (!container) return;
    
    const nodeElements = [...container.querySelectorAll('.workflow-node')];
    const newOrder = [];
    
    nodeElements.forEach(element => {
        const nodeId = element.id;
        const nodeInfo = videoNodes.find(node => node.id === nodeId);
        if (nodeInfo) {
            newOrder.push(nodeInfo);
        }
    });
    
    // 更新videoNodes数组
    videoNodes.length = 0;
    videoNodes.push(...newOrder);
    
    // 更新节点编号
    updateNodeNumbers();
}

// 创建节点元素
function createNodeElement(nodeId, nodeType) {
    const template = document.getElementById('videoNodeTemplate');
    if (!template) return null;
    
    const nodeElement = template.cloneNode(true);
    nodeElement.id = nodeId;
    nodeElement.style.display = 'block';
    nodeElement.dataset.type = nodeType;
    nodeElement.dataset.status = 'empty';
    
    // 更新节点标题和图标
    const nodeTitle = nodeElement.querySelector('.node-title');
    const typeIcon = nodeElement.querySelector('.node-type-icon');
    const uploadText = nodeElement.querySelector('.upload-text');
    
    if (nodeTitle) {
        nodeTitle.textContent = nodeType === 'video' ? '视频节点' : '音频节点';
    }
    
    if (typeIcon) {
        typeIcon.textContent = nodeType === 'video' ? '🎬' : '🎵';
    }
    
    if (uploadText) {
        uploadText.textContent = nodeType === 'video' ? '点击或拖拽视频文件到此处' : '点击或拖拽音频文件到此处';
    }
    
    return nodeElement;
}

// 更新空状态显示
function updateEmptyState() {
    const container = document.getElementById('videoNodesList');
    const emptyState = document.querySelector('.empty-state');
    
    if (!container || !emptyState) return;
    
    if (videoNodes.length === 0) {
        emptyState.style.display = 'flex';
    } else {
        emptyState.style.display = 'none';
    }
}

// 更新文件预览
function updateFilePreview(nodeInfo) {
    const nodeId = nodeInfo.id;
    const file = nodeInfo.file;
    const nodeElement = nodeInfo.element;
    
    if (!file) return;
    
    const previewSection = nodeElement.querySelector('.node-preview-section');
    if (!previewSection) return;
    
    // 清除现有预览
    previewSection.innerHTML = '';
    
    // 创建预览容器
    const previewContainer = document.createElement('div');
    previewContainer.className = 'preview-container';
    
    // 创建媒体播放器
    let mediaElement;
    if (file.type.startsWith('video/')) {
        mediaElement = document.createElement('video');
        mediaElement.className = 'node-video-player';
        mediaElement.controls = true;
        mediaElement.preload = 'metadata';
    } else if (file.type.startsWith('audio/')) {
        mediaElement = document.createElement('audio');
        mediaElement.className = 'node-audio-player';
        mediaElement.controls = true;
        mediaElement.preload = 'metadata';
    }
    
    if (mediaElement) {
        const objectURL = URL.createObjectURL(file);
        mediaElement.src = objectURL;
        
        // 添加元数据加载事件
        mediaElement.addEventListener('loadedmetadata', () => {
            updateMediaMetadata(nodeElement, file, mediaElement);
        });
        
        previewContainer.appendChild(mediaElement);
    }
    
    // 创建文件信息区域
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    fileInfo.innerHTML = `
        <div class="file-basic-info">
            <span class="file-name" title="${file.name}">${file.name}</span>
            <span class="file-size">${formatFileSize(file.size)}</span>
            <span class="file-type">${file.type}</span>
        </div>
        <div class="file-metadata" id="metadata-${nodeId}">
            <span class="loading-metadata">正在加载媒体信息...</span>
        </div>
    `;
    
    previewContainer.appendChild(fileInfo);
    previewSection.appendChild(previewContainer);
}

// 更新媒体元数据信息
function updateMediaMetadata(nodeElement, file, mediaElement) {
    const nodeId = nodeElement.id;
    const metadataContainer = document.getElementById(`metadata-${nodeId}`);
    
    if (!metadataContainer) return;
    
    let metadataHTML = '';
    
    if (file.type.startsWith('video/')) {
        const duration = formatDuration(mediaElement.duration);
        const resolution = `${mediaElement.videoWidth} × ${mediaElement.videoHeight}`;
        
        metadataHTML = `
            <div class="metadata-item">
                <span class="metadata-label">时长:</span>
                <span class="metadata-value">${duration}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">分辨率:</span>
                <span class="metadata-value">${resolution}</span>
            </div>
        `;
    } else if (file.type.startsWith('audio/')) {
        const duration = formatDuration(mediaElement.duration);
        
        metadataHTML = `
            <div class="metadata-item">
                <span class="metadata-label">时长:</span>
                <span class="metadata-value">${duration}</span>
            </div>
        `;
    }
    
    metadataContainer.innerHTML = metadataHTML;
}

// 格式化时长
function formatDuration(seconds) {
    if (isNaN(seconds) || seconds < 0) return '未知';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

// 根据合并类型更新节点显示
function updateNodesByMergeType() {
    const mergeType = document.getElementById('mergeType').value;
    
    // 获取添加节点按钮
    const addNodeBtn = document.getElementById('addVideoNodeBtn');
    
    // 根据合并类型设置节点限制和显示
    switch (mergeType) {
        case 'video_only':
            // 仅视频合并模式 - 允许多个视频节点
            addNodeBtn.style.display = 'block';
            
            // 所有节点都是视频类型
            videoNodes.forEach(node => {
                const nodeTypeSelect = node.element.querySelector('.node-type-select');
                if (nodeTypeSelect) {
                    nodeTypeSelect.value = 'video';
                    nodeTypeSelect.disabled = true;
                    node.type = 'video';
                }
                updateNodeDisplay(node);
            });
            break;
            
        case 'audio_video':
            // 音频与视频合并模式 - 限制为一个音频和一个视频
            if (videoNodes.length >= 2) {
                addNodeBtn.style.display = 'none';
            } else {
                addNodeBtn.style.display = 'block';
            }
            
            // 如果有两个节点，确保一个是音频一个是视频
            if (videoNodes.length === 2) {
                const firstNodeTypeSelect = videoNodes[0].element.querySelector('.node-type-select');
                const secondNodeTypeSelect = videoNodes[1].element.querySelector('.node-type-select');
                
                if (firstNodeTypeSelect && secondNodeTypeSelect) {
                    if (firstNodeTypeSelect.value === secondNodeTypeSelect.value) {
                        // 如果两个节点类型相同，将第二个节点设置为不同类型
                        secondNodeTypeSelect.value = firstNodeTypeSelect.value === 'video' ? 'audio' : 'video';
                        videoNodes[1].type = secondNodeTypeSelect.value;
                    }
                }
            }
            
            // 启用节点类型选择
            videoNodes.forEach(node => {
                const nodeTypeSelect = node.element.querySelector('.node-type-select');
                if (nodeTypeSelect) {
                    nodeTypeSelect.disabled = false;
                }
                updateNodeDisplay(node);
            });
            break;
            
        case 'multiple_videos':
            // 多个视频合并模式 - 允许多个视频节点
            addNodeBtn.style.display = 'block';
            
            // 所有节点都是视频类型
            videoNodes.forEach(node => {
                const nodeTypeSelect = node.element.querySelector('.node-type-select');
                if (nodeTypeSelect) {
                    nodeTypeSelect.value = 'video';
                    nodeTypeSelect.disabled = true;
                    node.type = 'video';
                }
                updateNodeDisplay(node);
            });
            break;
    }
    
    // 更新合并按钮状态
    updateMergeButtonState();
}

// 更新节点显示
function updateNodeDisplay(nodeInfo) {
    const nodeElement = nodeInfo.element;
    const videoPlayer = nodeElement.querySelector('.node-video-player');
    const audioPlayer = nodeElement.querySelector('.node-audio-player');
    
    if (nodeInfo.type === 'audio') {
        // 音频模式
        if (audioPlayer) audioPlayer.style.display = nodeInfo.file ? 'block' : 'none';
        if (videoPlayer) videoPlayer.style.display = 'none';
    } else {
        // 视频模式
        if (videoPlayer) videoPlayer.style.display = nodeInfo.file ? 'block' : 'none';
        if (audioPlayer) audioPlayer.style.display = 'none';
    }
}

// 更新节点编号
function updateNodeNumbers() {
    videoNodes.forEach((node, index) => {
        const titleElement = node.element.querySelector('.node-title');
        if (titleElement) {
            titleElement.textContent = `节点 #${index + 1}`;
        }
    });
}

// 删除节点
function removeNode(nodeId) {
    const nodeIndex = videoNodes.findIndex(node => node.id === nodeId);
    if (nodeIndex === -1) return;
    
    // 从DOM中移除
    const nodeElement = videoNodes[nodeIndex].element;
    nodeElement.parentNode.removeChild(nodeElement);
    
    // 从数组中移除
    videoNodes.splice(nodeIndex, 1);
    
    // 更新节点编号
    updateNodeNumbers();
    
    // 如果没有节点了，显示空消息
    if (videoNodes.length === 0) {
        document.getElementById('videoNodesList').innerHTML = `
            <div class="empty-nodes-message">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="12" cy="12" r="4"></circle>
                    <line x1="12" y1="8" x2="12" y2="16"></line>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
                <p>暂无视频节点，请点击"添加视频节点"按钮</p>
            </div>
        `;
    }
    
    // 更新合并按钮状态
    updateMergeButtonState();
}

// 清空所有节点
function clearVideoNodes() {
    // 清空DOM
    document.getElementById('videoNodesList').innerHTML = `
        <div class="empty-nodes-message">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="12" cy="12" r="4"></circle>
                <line x1="12" y1="8" x2="12" y2="16"></line>
                <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            <p>暂无视频节点，请点击"添加视频节点"按钮</p>
        </div>
    `;
    
    // 清空数组
    videoNodes = [];
    
    // 更新合并按钮状态
    updateMergeButtonState();
}

// 更新合并按钮状态
function updateMergeButtonState() {
    const mergeButton = document.getElementById('mergeVideos');
    
    // 检查是否有至少两个节点且都选择了视频或上传了文件
    const validNodes = videoNodes.filter(node => node.file || node.videoId);
    const canMerge = validNodes.length >= 2;
    
    mergeButton.disabled = !canMerge;
}

// 合并视频
async function mergeVideos() {
    // 隐藏结果区域
    document.getElementById('mergeResultSection').style.display = 'none';
    
    // 显示进度区域
    const progressSection = document.getElementById('mergeTaskProgress');
    progressSection.style.display = 'block';
    
    // 更新进度状态
    updateMergeStepStatus('merge-validate-status', '处理中');
    updateMergeStepStatus('merge-process-status', '待处理');
    updateMergeStepStatus('merge-complete-status', '待处理');
    
    // 初始化所有节点状态为处理中
    videoNodes.forEach(node => {
        const nodeElement = document.getElementById(node.id);
        if (nodeElement && node.file) {
            updateNodeStatus(nodeElement, 'processing');
            updateNodeProgress(nodeElement, 0);
        }
    });
    
    // 准备请求数据
    const formData = new FormData();
    
    // 添加配置信息
    const configForm = document.getElementById('mergeConfigForm');
    const outputName = configForm.elements['outputName'].value || 'merged_video';
    const outputFormat = configForm.elements['outputFormat'].value || 'mp4';
    const apiKey = configForm.elements['apiKey'].value || '';
    
    formData.append('output_name', outputName);
    formData.append('output_format', outputFormat);
    formData.append('api_key', apiKey);
    
    // 添加合并引擎选择（火山引擎集成）
    const mergeEngine = configForm.elements['mergeEngine'] ? 
        configForm.elements['mergeEngine'].value : 'default';
    formData.append('engine', mergeEngine);
    
    // 添加视频文件
    let hasFiles = false;
    videoNodes.forEach((node, index) => {
        if (node.file) {
            formData.append(`video_${index}`, node.file);
            hasFiles = true;
        } else if (node.videoId) {
            formData.append(`video_id_${index}`, node.videoId);
        }
    });
    
    try {
        // 发送合并请求
        let response;
        if (hasFiles) {
            // 如果有文件，使用FormData
            response = await fetch('/merge_videos_upload', {
                method: 'POST',
                body: formData
            });
        } else {
            // 否则使用JSON
            const videoIds = videoNodes
                .filter(node => node.videoId)
                .map(node => node.videoId);
                
            response = await fetch('/merge_videos_task', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    video_ids: videoIds,
                    output_name: outputName,
                    output_format: outputFormat,
                    api_key: apiKey,
                    engine: mergeEngine
                })
            });
        }
        
        const result = await response.json();
        
        if (result.success) {
            // 更新验证状态
            updateMergeStepStatus('merge-validate-status', '完成');
            updateMergeStepStatus('merge-process-status', '处理中');
            
            // 开始轮询合并状态
            pollMergeStatus(result.task_id);
        } else {
            updateMergeStepStatus('merge-validate-status', '失败');
            showToast('视频合并请求失败: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error merging videos:', error);
        updateMergeStepStatus('merge-validate-status', '失败');
        showToast('视频合并请求失败，请检查网络连接', 'error');
    }
}

// 轮询合并状态
async function pollMergeStatus(taskId) {
    try {
        const response = await fetch(`/merge_task_status/${taskId}`);
        const result = await response.json();
        
        // 更新进度条（如果有进度信息）
        if (result.progress !== undefined) {
            const progressPercent = Math.min(Math.max(result.progress, 0), 100);
            updateMergeProgress(progressPercent);
            
            // 更新节点进度
            updateNodesProgress(progressPercent);
        }
        
        // 更新节点状态（如果有节点级别的状态信息）
        if (result.node_status) {
            updateNodesStatus(result.node_status);
        }
        
        if (result.status === 'completed') {
            // 更新状态
            updateMergeStepStatus('merge-process-status', '完成');
            updateMergeStepStatus('merge-complete-status', '完成');
            
            // 将所有节点标记为完成
            videoNodes.forEach(node => {
                const nodeElement = document.getElementById(node.id);
                if (nodeElement && node.file) {
                    updateNodeStatus(nodeElement, 'completed');
                    updateNodeProgress(nodeElement, 100);
                }
            });
            
            // 显示结果
            showMergeResult(result.output_url || result.video_url, result.output_url || result.download_url);
        } else if (result.status === 'failed') {
            updateMergeStepStatus('merge-process-status', '失败');
            
            // 将所有节点标记为错误
            videoNodes.forEach(node => {
                const nodeElement = document.getElementById(node.id);
                if (nodeElement && node.file) {
                    updateNodeStatus(nodeElement, 'error');
                }
            });
            
            showToast('视频合并失败: ' + (result.error || '未知错误'), 'error');
        } else {
            // 继续轮询
            setTimeout(() => pollMergeStatus(taskId), 2000);
        }
    } catch (error) {
        console.error('Error polling merge status:', error);
        updateMergeStepStatus('merge-process-status', '失败');
        
        // 将所有节点标记为错误
        videoNodes.forEach(node => {
            const nodeElement = document.getElementById(node.id);
            if (nodeElement && node.file) {
                updateNodeStatus(nodeElement, 'error');
            }
        });
        
        showToast('检查合并状态失败，请检查网络连接', 'error');
    }
}

// 更新合并步骤状态
function updateMergeStepStatus(statusId, status) {
    const statusElement = document.getElementById(statusId);
    if (statusElement) {
        statusElement.textContent = status;
        statusElement.className = 'step-status ' + status.toLowerCase();
    }
}

// 更新所有节点进度
function updateNodesProgress(overallProgress) {
    videoNodes.forEach((node, index) => {
        const nodeElement = document.getElementById(node.id);
        if (nodeElement && node.file) {
            // 为每个节点分配进度（简单平均分配）
            const nodeProgress = Math.min(overallProgress, 100);
            updateNodeProgress(nodeElement, nodeProgress);
        }
    });
}

// 更新节点状态（基于服务器返回的节点状态）
function updateNodesStatus(nodeStatusData) {
    if (!nodeStatusData || typeof nodeStatusData !== 'object') return;
    
    videoNodes.forEach((node, index) => {
        const nodeElement = document.getElementById(node.id);
        if (nodeElement && node.file) {
            const nodeStatus = nodeStatusData[index] || nodeStatusData[node.id];
            if (nodeStatus) {
                updateNodeStatus(nodeElement, nodeStatus.status || 'processing');
                if (nodeStatus.progress !== undefined) {
                    updateNodeProgress(nodeElement, nodeStatus.progress);
                }
            }
        }
    });
}

// 更新整体合并进度
function updateMergeProgress(progress) {
    const progressBar = document.querySelector('.task-progress-bar .progress-fill');
    const progressText = document.querySelector('.task-progress-text');
    
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
    
    if (progressText) {
        progressText.textContent = `${Math.round(progress)}%`;
    }
}

// 显示合并结果
function showMergeResult(videoUrl, downloadUrl) {
    const resultSection = document.getElementById('mergeResultSection');
    resultSection.style.display = 'block';
    
    // 设置视频播放器
    const videoPlayer = document.getElementById('mergeResultVideo');
    videoPlayer.src = videoUrl;
    videoPlayer.style.display = 'block';
    
    // 设置下载链接
    const downloadLink = document.getElementById('mergeDownloadLink');
    downloadLink.href = downloadUrl;
    downloadLink.style.display = 'inline-block';
    
    // 显示创建新合并按钮
    document.getElementById('createNewMerge').style.display = 'inline-block';
    
    // 显示成功提示
    showToast('视频合并完成！', 'success');
}

// 重置合并模式
function resetMergeMode() {
    // 清空节点
    clearVideoNodes();
    
    // 隐藏进度和结果区域
    document.getElementById('mergeTaskProgress').style.display = 'none';
    document.getElementById('mergeResultSection').style.display = 'none';
    
    // 重置表单
    document.getElementById('mergeConfigForm').reset();
}

// 更新所有视频选择下拉框
function updateAllVideoSelects() {
    // 这个函数用于更新视频节点中的选择列表
    // 目前为空实现，可以根据需要添加功能
}

// 显示Toast消息
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 初始化首尾帧上传功能
function initializeFirstLastUpload() {
    // 首帧上传
    const startFrameUploadArea = document.getElementById('startFrameUploadArea');
    const startFrameInput = document.getElementById('startFrameInput');
    const startFramePreview = document.getElementById('startFramePreview');
    
    // 尾帧上传
    const endFrameUploadArea = document.getElementById('endFrameUploadArea');
    const endFrameInput = document.getElementById('endFrameInput');
    const endFramePreview = document.getElementById('endFramePreview');
    
    // 生成按钮和清空按钮
    const generateButton = document.getElementById('generateFirstLastVideo');
    const clearButton = document.getElementById('clearFirstLastImages');
    
    if (startFrameUploadArea && startFrameInput) {
        // 首帧上传区域点击事件
        startFrameUploadArea.addEventListener('click', function() {
            startFrameInput.click();
        });
        
        // 首帧文件选择事件
        startFrameInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                const file = this.files[0];
                handleImagePreview(file, startFramePreview, 'start');
                updateFirstLastButtonState();
            }
        });
        
        // 首帧拖拽上传
        startFrameUploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('drag-over');
        });
        
        startFrameUploadArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
        });
        
        startFrameUploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.startsWith('image/')) {
                startFrameInput.files = files;
                handleImagePreview(files[0], startFramePreview, 'start');
                updateFirstLastButtonState();
            }
        });
    }
    
    if (endFrameUploadArea && endFrameInput) {
        // 尾帧上传区域点击事件
        endFrameUploadArea.addEventListener('click', function() {
            endFrameInput.click();
        });
        
        // 尾帧文件选择事件
        endFrameInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                const file = this.files[0];
                handleImagePreview(file, endFramePreview, 'end');
                updateFirstLastButtonState();
            }
        });
        
        // 尾帧拖拽上传
        endFrameUploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('drag-over');
        });
        
        endFrameUploadArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
        });
        
        endFrameUploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.startsWith('image/')) {
                endFrameInput.files = files;
                handleImagePreview(files[0], endFramePreview, 'end');
                updateFirstLastButtonState();
            }
        });
    }
    
    // 清空图片按钮
    if (clearButton) {
        clearButton.addEventListener('click', function() {
            // 清空文件输入
            if (startFrameInput) startFrameInput.value = '';
            if (endFrameInput) endFrameInput.value = '';
            
            // 清空预览
            if (startFramePreview) startFramePreview.innerHTML = '';
            if (endFramePreview) endFramePreview.innerHTML = '';
            
            // 更新按钮状态
            updateFirstLastButtonState();
            
            showToast('图片已清空', 'info');
        });
    }
    
    // 生成视频按钮
    if (generateButton) {
        generateButton.addEventListener('click', function() {
            generateFirstLastVideo();
        });
    }
}

// 处理图片预览
function handleImagePreview(file, previewElement, type) {
    if (!file || !previewElement) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        previewElement.innerHTML = `
            <img src="${e.target.result}" alt="${type} frame preview" style="max-width: 100%; max-height: 200px; border-radius: 4px;">
            <p class="file-name">${file.name}</p>
        `;
    };
    reader.readAsDataURL(file);
}

// 更新首尾帧生成按钮状态
function updateFirstLastButtonState() {
    const generateButton = document.getElementById('generateFirstLastVideo');
    const startFrameInput = document.getElementById('startFrameInput');
    
    if (generateButton && startFrameInput) {
        // 至少需要首帧才能生成
        const hasStartFrame = startFrameInput.files && startFrameInput.files.length > 0;
        generateButton.disabled = !hasStartFrame;
    }
}

// 生成首尾帧视频
async function generateFirstLastVideo() {
    const startFrameInput = document.getElementById('startFrameInput');
    const endFrameInput = document.getElementById('endFrameInput');
    const form = document.getElementById('firstLastConfigForm');
    
    if (!startFrameInput || !startFrameInput.files || startFrameInput.files.length === 0) {
        showToast('请先上传首帧图片', 'error');
        return;
    }
    
    try {
        // 显示进度
        const progressSection = document.getElementById('firstLastTaskProgress');
        if (progressSection) {
            progressSection.style.display = 'block';
        }
        
        // 1. 先上传图片
        const formData = new FormData();
        formData.append('first_frame', startFrameInput.files[0]);
        
        if (endFrameInput && endFrameInput.files && endFrameInput.files.length > 0) {
            formData.append('last_frame', endFrameInput.files[0]);
        }
        
        showToast('正在上传图片...', 'info');
        
        const uploadResponse = await fetch('/upload_firstlast', {
            method: 'POST',
            body: formData
        });
        
        if (!uploadResponse.ok) {
            throw new Error('图片上传失败');
        }
        
        const uploadResult = await uploadResponse.json();
        if (!uploadResult.success) {
            throw new Error(uploadResult.error || '图片上传失败');
        }
        
        showToast('图片上传成功，开始生成视频...', 'success');
        
        // 2. 生成视频
        const formData2 = new FormData(form);
        
        // 将FormData转换为JSON对象
        const jsonData = {};
        for (let [key, value] of formData2.entries()) {
            jsonData[key] = value;
        }
        
        const generateResponse = await fetch('/generate_firstlast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(jsonData)
        });
        
        if (!generateResponse.ok) {
            throw new Error('视频生成请求失败');
        }
        
        const generateResult = await generateResponse.json();
        if (!generateResult.success) {
            throw new Error(generateResult.error || '视频生成失败');
        }
        
        showToast('视频生成任务已提交，请等待处理完成...', 'success');
        
        // 3. 轮询任务状态
        if (generateResult.task_id) {
            pollFirstLastTaskStatus(generateResult.task_id);
        }
        
    } catch (error) {
        console.error('生成视频失败:', error);
        showToast('生成视频失败: ' + error.message, 'error');
    }
}

// 轮询首尾帧任务状态
function pollFirstLastTaskStatus(taskId) {
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`/task_status/${taskId}`);
            if (!response.ok) {
                throw new Error('获取任务状态失败');
            }
            
            const result = await response.json();
            
            if (result.status === 'completed') {
                clearInterval(pollInterval);
                showToast('视频生成完成！', 'success');
                
                // 显示结果
                const resultSection = document.getElementById('firstLastResultSection');
                const resultVideo = document.getElementById('firstLastResultVideo');
                const downloadLink = document.getElementById('firstLastDownloadLink');
                
                if (result.video_url && resultSection && resultVideo && downloadLink) {
                    resultVideo.src = result.video_url;
                    resultVideo.style.display = 'block';
                    downloadLink.href = result.video_url;
                    downloadLink.style.display = 'inline-block';
                    resultSection.style.display = 'block';
                }
                
            } else if (result.status === 'failed') {
                clearInterval(pollInterval);
                showToast('视频生成失败: ' + (result.error || '未知错误'), 'error');
            } else {
                // 任务仍在进行中
                showToast(`任务进行中: ${result.status}`, 'info');
            }
            
        } catch (error) {
            console.error('轮询任务状态失败:', error);
            clearInterval(pollInterval);
            showToast('获取任务状态失败', 'error');
        }
    }, 3000); // 每3秒轮询一次
}

// ... existing code ...

// 初始化参考图上传功能
function initializeReferenceUpload() {
    // 参考图上传区域和输入框
    const referenceUploads = [
        { area: 'ref1UploadArea', input: 'ref1Input', preview: 'ref1Preview' },
        { area: 'ref2UploadArea', input: 'ref2Input', preview: 'ref2Preview' },
        { area: 'ref3UploadArea', input: 'ref3Input', preview: 'ref3Preview' },
        { area: 'ref4UploadArea', input: 'ref4Input', preview: 'ref4Preview' }
    ];

    // 为每个参考图上传区域绑定事件
    referenceUploads.forEach(upload => {
        const uploadArea = document.getElementById(upload.area);
        const fileInput = document.getElementById(upload.input);
        const previewElement = document.getElementById(upload.preview);

        if (!uploadArea || !fileInput || !previewElement) return;

        // 点击上传区域触发文件选择
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        // 拖拽上传
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.startsWith('image/')) {
                fileInput.files = files;
                handleReferenceImagePreview(files[0], previewElement, upload.area);
                updateReferenceButtonState();
            }
        });

        // 文件选择变化事件
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleReferenceImagePreview(file, previewElement, upload.area);
                updateReferenceButtonState();
            }
        });
    });

    // 清空参考图按钮
    const clearButton = document.getElementById('clearReferenceImages');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            referenceUploads.forEach(upload => {
                const fileInput = document.getElementById(upload.input);
                const previewElement = document.getElementById(upload.preview);
                const uploadArea = document.getElementById(upload.area);
                
                if (fileInput) fileInput.value = '';
                if (previewElement) previewElement.innerHTML = '';
                if (uploadArea) uploadArea.classList.remove('has-file');
            });
            updateReferenceButtonState();
        });
    }

    // 生成参考图视频按钮
    const generateButton = document.getElementById('generateReferenceVideo');
    if (generateButton) {
        generateButton.addEventListener('click', generateReferenceVideo);
    }
}

// 处理参考图预览
function handleReferenceImagePreview(file, previewElement, uploadAreaId) {
    const reader = new FileReader();
    reader.onload = function(e) {
        previewElement.innerHTML = `
            <img src="${e.target.result}" alt="参考图预览" style="max-width: 100%; max-height: 200px; border-radius: 8px;">
        `;
        
        // 添加已上传样式
        const uploadArea = document.getElementById(uploadAreaId);
        if (uploadArea) {
            uploadArea.classList.add('has-file');
        }
    };
    reader.readAsDataURL(file);
}

// 更新参考图生成按钮状态
function updateReferenceButtonState() {
    const generateButton = document.getElementById('generateReferenceVideo');
    if (!generateButton) return;

    // 检查是否至少有一张参考图
    const hasAnyImage = ['ref1Input', 'ref2Input', 'ref3Input', 'ref4Input'].some(inputId => {
        const input = document.getElementById(inputId);
        return input && input.files && input.files.length > 0;
    });

    generateButton.disabled = !hasAnyImage;
}

// 生成参考图视频
async function generateReferenceVideo() {
    try {
        // 显示进度区域
        const progressSection = document.getElementById('referenceTaskProgress');
        if (progressSection) {
            progressSection.style.display = 'block';
        }

        // 更新步骤状态
        updateReferenceStepStatus('reference-step-upload', 'processing');

        // 收集参考图文件
        const formData = new FormData();
        const referenceInputs = ['ref1Input', 'ref2Input', 'ref3Input', 'ref4Input'];
        let uploadedCount = 0;

        referenceInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input && input.files && input.files.length > 0) {
                formData.append('reference_images', input.files[0]);
                uploadedCount++;
            }
        });

        if (uploadedCount === 0) {
            showToast('请至少上传一张参考图', 'error');
            return;
        }

        // 上传参考图
        const uploadResponse = await fetch('/upload_reference', {
            method: 'POST',
            body: formData
        });

        const uploadData = await uploadResponse.json();
        if (!uploadData.success) {
            throw new Error(uploadData.error || '上传参考图失败');
        }

        updateReferenceStepStatus('reference-step-upload', 'completed');
        updateReferenceStepStatus('reference-step-task', 'processing');

        // 获取配置参数
        const configForm = document.getElementById('referenceConfigForm');
        const formDataConfig = new FormData(configForm);
        const config = Object.fromEntries(formDataConfig.entries());

        // 生成视频
        const generateResponse = await fetch('/generate_reference', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const generateData = await generateResponse.json();
        if (!generateData.success) {
            throw new Error(generateData.error || '生成视频失败');
        }

        updateReferenceStepStatus('reference-step-task', 'completed');
        updateReferenceStepStatus('reference-step-generating', 'processing');

        // 显示任务ID
        const taskIdDisplay = document.getElementById('reference-task-id-display');
        if (taskIdDisplay) {
            taskIdDisplay.textContent = `任务ID: ${generateData.task_id}`;
        }

        // 开始轮询任务状态
        pollReferenceTaskStatus(generateData.task_id);

    } catch (error) {
        console.error('生成参考图视频失败:', error);
        showToast('生成视频失败: ' + error.message, 'error');
        
        // 重置步骤状态
        updateReferenceStepStatus('reference-step-upload', 'error');
        updateReferenceStepStatus('reference-step-task', 'pending');
        updateReferenceStepStatus('reference-step-generating', 'pending');
    }
}

// 轮询参考图任务状态
function pollReferenceTaskStatus(taskId) {
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`/task_status/${taskId}`);
            const data = await response.json();
            
            if (data.status === 'completed') {
                clearInterval(pollInterval);
                updateReferenceStepStatus('reference-step-generating', 'completed');
                updateReferenceStepStatus('reference-step-completed', 'completed');
                
                // 显示结果
                showReferenceResult(data.video_url, data.download_url);
                
            } else if (data.status === 'failed') {
                clearInterval(pollInterval);
                updateReferenceStepStatus('reference-step-generating', 'error');
                showToast('视频生成失败: ' + (data.error || '未知错误'), 'error');
            }
            // 继续轮询其他状态
        } catch (error) {
            console.error('轮询任务状态失败:', error);
        }
    }, 3000); // 每3秒轮询一次
}

// 更新参考图步骤状态
function updateReferenceStepStatus(stepId, status) {
    const stepElement = document.getElementById(stepId);
    if (!stepElement) return;

    const statusElement = stepElement.querySelector('.step-status');
    if (!statusElement) return;

    // 移除所有状态类
    stepElement.classList.remove('pending', 'processing', 'completed', 'error');
    
    // 添加新状态类
    stepElement.classList.add(status);
    
    // 更新状态文本
    const statusTexts = {
        'pending': '待处理',
        'processing': '处理中...',
        'completed': '已完成',
        'error': '失败'
    };
    
    statusElement.textContent = statusTexts[status] || status;
}

// 显示参考图生成结果
function showReferenceResult(videoUrl, downloadUrl) {
    const resultSection = document.getElementById('referenceResultSection');
    const resultVideo = document.getElementById('referenceResultVideo');
    const downloadLink = document.getElementById('referenceDownloadLink');
    
    if (resultSection && resultVideo && downloadLink) {
        resultVideo.src = videoUrl;
        resultVideo.style.display = 'block';
        
        downloadLink.href = downloadUrl;
        downloadLink.style.display = 'inline-block';
        
        resultSection.style.display = 'block';
        
        showToast('视频生成成功！', 'success');
    }
}

// 生成新的参考图视频
function generateNewVideo(mode) {
    if (mode === 'reference') {
        // 隐藏结果和进度区域
        const resultSection = document.getElementById('referenceResultSection');
        const progressSection = document.getElementById('referenceTaskProgress');
        
        if (resultSection) resultSection.style.display = 'none';
        if (progressSection) progressSection.style.display = 'none';
        
        // 重置所有步骤状态
        ['reference-step-upload', 'reference-step-task', 'reference-step-generating', 'reference-step-completed'].forEach(stepId => {
            updateReferenceStepStatus(stepId, 'pending');
        });
        
        // 清空任务ID显示
        const taskIdDisplay = document.getElementById('reference-task-id-display');
        if (taskIdDisplay) {
            taskIdDisplay.textContent = '等待创建任务ID...';
        }
    }
}

// 切换帮助面板
function toggleHelpPanel() {
    const helpPanel = document.getElementById('helpPanel');
    if (helpPanel) {
        const isVisible = helpPanel.style.display !== 'none';
        helpPanel.style.display = isVisible ? 'none' : 'block';
        
        // 添加动画效果
        if (!isVisible) {
            helpPanel.style.opacity = '0';
            helpPanel.style.transform = 'translateX(100%)';
            setTimeout(() => {
                helpPanel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                helpPanel.style.opacity = '1';
                helpPanel.style.transform = 'translateX(0)';
            }, 10);
        }
    }
}

// 初始化工具提示
function initializeTooltips() {
    // 为所有带有 data-tooltip 属性的元素添加工具提示
    document.querySelectorAll('[data-tooltip]').forEach(element => {
        element.addEventListener('mouseenter', function(e) {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip-popup';
            tooltip.textContent = this.getAttribute('data-tooltip');
            
            // 设置位置
            const rect = this.getBoundingClientRect();
            tooltip.style.position = 'fixed';
            tooltip.style.left = rect.left + 'px';
            tooltip.style.top = (rect.top - 35) + 'px';
            tooltip.style.zIndex = '10000';
            
            document.body.appendChild(tooltip);
            
            // 存储引用以便清理
            this._tooltip = tooltip;
        });
        
        element.addEventListener('mouseleave', function() {
            if (this._tooltip) {
                document.body.removeChild(this._tooltip);
                this._tooltip = null;
            }
        });
    });
}

// 初始化节点状态工具提示
function initializeNodeStatusTooltips() {
    // 为节点状态指示器添加工具提示
    document.addEventListener('mouseenter', function(e) {
        if (e.target.classList.contains('node-status-indicator')) {
            const status = e.target.getAttribute('data-status');
            const tooltipTexts = {
                'idle': '空闲：节点已创建但未上传文件',
                'ready': '就绪：文件已上传，等待处理',
                'processing': '处理中：正在处理文件',
                'completed': '完成：处理完成',
                'error': '错误：处理过程中出现错误'
            };
            
            const tooltipText = tooltipTexts[status] || '未知状态';
            
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip-popup status-tooltip';
            tooltip.textContent = tooltipText;
            
            const rect = e.target.getBoundingClientRect();
            tooltip.style.position = 'fixed';
            tooltip.style.left = rect.left + 'px';
            tooltip.style.top = (rect.top - 35) + 'px';
            tooltip.style.zIndex = '10000';
            
            document.body.appendChild(tooltip);
            e.target._statusTooltip = tooltip;
        }
    }, true);
    
    document.addEventListener('mouseleave', function(e) {
        if (e.target.classList.contains('node-status-indicator') && e.target._statusTooltip) {
            document.body.removeChild(e.target._statusTooltip);
            e.target._statusTooltip = null;
        }
    }, true);
}

document.addEventListener('DOMContentLoaded', function() {
    // 初始化模式选择按钮
    document.querySelectorAll('.mode-button').forEach(button => {
        button.addEventListener('click', function() {
            const mode = this.getAttribute('data-mode');
            showGenerationPage(mode);
        });
    });
    
    // 初始化视频合并模式
    initializeMergeMode();
    
    // 初始化首尾帧上传功能
    initializeFirstLastUpload();
    
    // 初始化参考图上传功能
    initializeReferenceUpload();
    
    // 初始化工具提示
    initializeTooltips();
    
    // 初始化节点状态工具提示
    initializeNodeStatusTooltips();
});