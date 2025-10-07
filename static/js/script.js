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

// 全局变量
let videoNodes = []; // 存储视频节点
let nextNodeId = 1; // 下一个节点ID
let selectedNodeType = 'video';

// 初始化可用视频列表
if (!window.availableVideos) {
    window.availableVideos = []; // 可用视频列表
}

// 初始化视频合并模式
function initializeMergeMode() {
    // 清空节点按钮
    document.getElementById('clearVideoNodes').addEventListener('click', clearVideoNodes);
    
    // 合并视频按钮
    document.getElementById('mergeVideos').addEventListener('click', mergeVideos);
    
    // 创建新合并按钮
    document.getElementById('createNewMerge').addEventListener('click', resetMergeMode);
    
    // 初始渲染节点工作流程
    renderVideoNodesWithInsertionPoints();
}

// 加载可用视频列表
async function loadAvailableVideos() {
    try {
        const response = await fetch('/list_merge_videos');
        const data = await response.json();
        
        if (data.success) {
            // 存储可用视频列表
            window.availableVideos = data.videos;
            
            // 更新合并按钮状态
            updateMergeButtonState();
        } else {
            showToast('加载视频列表失败: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error loading videos:', error);
        showToast('加载视频列表时发生错误', 'error');
    }
}

// 添加视频节点
function addVideoNode(insertAfterNodeId = null) {
    const nodeId = nextNodeId++;
    const nodeElement = createNodeElement(nodeId, 'video');
    
    const nodeInfo = {
        id: nodeId,
        type: 'video',
        element: nodeElement,
        file: null,
        progress: 0,
        status: 'empty'
    };
    
    if (insertAfterNodeId) {
        const targetNodeIndex = videoNodes.findIndex(node => node.id === insertAfterNodeId);
        if (targetNodeIndex !== -1) {
            videoNodes.splice(targetNodeIndex + 1, 0, nodeInfo);
        } else {
            videoNodes.push(nodeInfo);
        }
    } else {
        videoNodes.push(nodeInfo);
    }
    
    bindNodeEvents(nodeInfo);
    renderVideoNodesWithInsertionPoints();
    updateMergeButtonState();
    
    return nodeInfo;
}

// 添加音频节点
function addAudioNode(insertAfterNodeId = null) {
    const nodeId = nextNodeId++;
    const nodeElement = createNodeElement(nodeId, 'audio');
    
    const nodeInfo = {
        id: nodeId,
        type: 'audio',
        element: nodeElement,
        file: null,
        progress: 0,
        status: 'empty'
    };
    
    if (insertAfterNodeId) {
        const targetNodeIndex = videoNodes.findIndex(node => node.id === insertAfterNodeId);
        if (targetNodeIndex !== -1) {
            videoNodes.splice(targetNodeIndex + 1, 0, nodeInfo);
        } else {
            videoNodes.push(nodeInfo);
        }
    } else {
        videoNodes.push(nodeInfo);
    }
    
    bindNodeEvents(nodeInfo);
    renderVideoNodesWithInsertionPoints();
    updateMergeButtonState();
    
    return nodeInfo;
}

// 绑定节点事件
function bindNodeEvents(nodeInfo) {
    const nodeElement = nodeInfo.element;
    const uploadArea = nodeElement.querySelector('.upload-area');
    const fileInput = nodeElement.querySelector('.file-input');
    const removeBtn = nodeElement.querySelector('.remove-node');
    
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => {
            if (!nodeInfo.file) {
                fileInput.click();
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFileUpload(nodeElement, file, nodeInfo);
            }
        });
    }
    
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            removeNode(nodeInfo.id);
        });
    }
}

// 处理文件上传
async function handleFileUpload(nodeElement, file, nodeInfo) {
    try {
        // 验证文件
        if (!validateFile(file, nodeInfo.type)) {
            return;
        }
        
        nodeInfo.file = file;
        nodeInfo.status = 'uploaded';
        
        updateNodeFileDisplay(nodeElement, file);
        updateMergeButtonState();
        
        showToast(`文件 ${file.name} 上传成功`, 'success');
    } catch (error) {
        console.error('File upload error:', error);
        showToast('文件上传失败', 'error');
    }
}

// 验证文件
function validateFile(file, nodeType) {
    const maxSize = 500 * 1024 * 1024; // 500MB
    
    if (file.size > maxSize) {
        showToast('文件大小超过限制 (500MB)', 'error');
        return false;
    }
    
    const videoFormats = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm'];
    const audioFormats = ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'];
    
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (nodeType === 'video' && !videoFormats.includes(extension)) {
        showToast('不支持的视频格式', 'error');
        return false;
    }
    
    if (nodeType === 'audio' && !audioFormats.includes(extension)) {
        showToast('不支持的音频格式', 'error');
        return false;
    }
    
    return true;
}

// 更新节点文件显示
function updateNodeFileDisplay(nodeElement, file) {
    const fileInfo = nodeElement.querySelector('.file-info');
    const fileName = nodeElement.querySelector('.file-name');
    const fileSize = nodeElement.querySelector('.file-size');
    const uploadArea = nodeElement.querySelector('.upload-area');
    
    if (file) {
        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = formatFileSize(file.size);
        if (fileInfo) fileInfo.style.display = 'block';
        if (uploadArea) uploadArea.style.display = 'none';
    } else {
        if (fileInfo) fileInfo.style.display = 'none';
        if (uploadArea) uploadArea.style.display = 'block';
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

// 创建节点元素
function createNodeElement(nodeId, nodeType) {
    const template = document.getElementById('videoNodeTemplate');
    if (!template) {
        console.error('Node template not found');
        return null;
    }
    
    const nodeElement = template.cloneNode(true);
    nodeElement.id = `node-${nodeId}`;
    nodeElement.style.display = 'block';
    nodeElement.setAttribute('data-node-id', nodeId);
    
    // 设置节点标题和图标
    const nodeTitle = nodeElement.querySelector('.node-title');
    const typeIcon = nodeElement.querySelector('.type-icon');
    
    if (nodeTitle) {
        nodeTitle.textContent = nodeType === 'video' ? `视频节点 ${nodeId}` : `音频节点 ${nodeId}`;
    }
    
    if (typeIcon) {
        typeIcon.textContent = nodeType === 'video' ? '🎬' : '🎵';
    }
    
    return nodeElement;
}

// 渲染视频节点
function renderVideoNodesWithInsertionPoints() {
    const container = document.getElementById('videoNodesList');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (videoNodes.length === 0) {
        container.innerHTML = '<div class="empty-state">点击下方按钮添加视频或音频节点</div>';
        return;
    }
    
    videoNodes.forEach((nodeInfo, index) => {
        if (nodeInfo.element) {
            container.appendChild(nodeInfo.element);
        }
    });
}

// 移除节点
function removeNode(nodeId) {
    const nodeIndex = videoNodes.findIndex(node => node.id === nodeId);
    if (nodeIndex !== -1) {
        videoNodes.splice(nodeIndex, 1);
        renderVideoNodesWithInsertionPoints();
        updateMergeButtonState();
    }
}

// 清空所有节点
function clearVideoNodes(showMessage = true) {
    videoNodes = [];
    renderVideoNodesWithInsertionPoints();
    updateMergeButtonState();
    
    if (showMessage) {
        showToast('已清空所有节点', 'info');
    }
}

// 更新合并按钮状态
function updateMergeButtonState() {
    const mergeButton = document.getElementById('mergeVideos');
    if (mergeButton) {
        const hasValidNodes = videoNodes.some(node => node.file);
        mergeButton.disabled = !hasValidNodes;
    }
}

// 合并视频
async function mergeVideos() {
    const validNodes = videoNodes.filter(node => node.file);
    
    if (validNodes.length === 0) {
        showToast('请至少添加一个文件', 'warning');
        return;
    }
    
    try {
        const formData = new FormData();
        
        // 添加文件
        validNodes.forEach((node, index) => {
            formData.append('files', node.file);
        });
        
        // 添加配置
        const config = {
            output_filename: document.getElementById('outputFilename')?.value || 'merged_video',
            output_format: document.getElementById('outputFormat')?.value || 'mp4'
        };
        
        formData.append('config', JSON.stringify(config));
        
        showToast('开始合并视频...', 'info');
        
        const response = await fetch('/merge_videos_upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMergeTaskProgress(result.task_id);
            pollMergeStatus(result.task_id);
        } else {
            showToast('合并失败: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Merge error:', error);
        showToast('合并过程中发生错误', 'error');
    }
}

// 轮询合并状态
async function pollMergeStatus(taskId) {
    updateMergeTaskStepStatus('merge-validate-status', '处理中');
    updateMergeTaskStepStatus('merge-process-status', '处理中');
    
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`/task_status/${taskId}`);
            const result = await response.json();
            
            if (result.status === 'completed') {
                clearInterval(pollInterval);
                updateMergeTaskStepStatus('merge-validate-status', '已完成');
                updateMergeTaskStepStatus('merge-process-status', '已完成');
                updateMergeTaskStepStatus('merge-complete-status', '已完成');
                showMergeResult(result.video_url, result.download_url);
                showToast('视频合并完成！', 'success');
            } else if (result.status === 'failed') {
                clearInterval(pollInterval);
                updateMergeTaskStepStatus('merge-validate-status', '失败');
                updateMergeTaskStepStatus('merge-process-status', '失败');
                updateMergeTaskStepStatus('merge-complete-status', '失败');
                showToast('合并失败: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Status polling error:', error);
            clearInterval(pollInterval);
            showToast('状态查询失败', 'error');
        }
    }, 2000);
}

// 显示合并结果
function showMergeResult(videoUrl, downloadUrl) {
    const resultSection = document.getElementById('mergeResultSection');
    const resultVideo = document.getElementById('mergeResultVideo');
    const downloadLink = document.getElementById('mergeDownloadLink');
    
    if (resultSection && resultVideo && downloadLink) {
        resultVideo.src = videoUrl;
        downloadLink.href = downloadUrl;
        resultSection.style.display = 'block';
        
        // 显示视频和下载链接
        resultVideo.style.display = 'block';
        downloadLink.style.display = 'inline-block';
        
        // 显示创建新合并按钮
        const createNewButton = document.getElementById('createNewMerge');
        if (createNewButton) {
            createNewButton.style.display = 'inline-block';
        }
    }
}

// 重置合并模式
function resetMergeMode() {
    clearVideoNodes(false);
    
    const resultSection = document.getElementById('mergeResultSection');
    const taskProgress = document.getElementById('mergeTaskProgress');
    
    if (resultSection) {
        resultSection.style.display = 'none';
    }
    
    if (taskProgress) {
        taskProgress.style.display = 'none';
    }
    
    showToast('已重置合并模式', 'info');
}

// 显示提示消息
function showToast(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // 简单的提示实现
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 4px;
        color: white;
        z-index: 10000;
        max-width: 300px;
    `;
    
    switch (type) {
        case 'success':
            toast.style.backgroundColor = '#4CAF50';
            break;
        case 'error':
            toast.style.backgroundColor = '#f44336';
            break;
        case 'warning':
            toast.style.backgroundColor = '#ff9800';
            break;
        default:
            toast.style.backgroundColor = '#2196F3';
    }
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3000);
}

// 首尾帧生成模块
function initializeFirstLastUpload() {
    const startFrameUploadArea = document.getElementById('startFrameUploadArea');
    const startFrameInput = document.getElementById('startFrameInput');
    const endFrameUploadArea = document.getElementById('endFrameUploadArea');
    const endFrameInput = document.getElementById('endFrameInput');
    const clearButton = document.getElementById('clearFirstLastImages');
    const generateButton = document.getElementById('generateFirstLastVideo');
    
    // 开始帧上传
    if (startFrameUploadArea && startFrameInput) {
        startFrameUploadArea.addEventListener('click', () => startFrameInput.click());
        
        startFrameInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                handleImagePreview(this.files[0], document.getElementById('startFramePreview'), 'start');
                updateFirstLastButtonState();
            }
        });
    }
    
    // 结束帧上传
    if (endFrameUploadArea && endFrameInput) {
        endFrameUploadArea.addEventListener('click', () => endFrameInput.click());
        
        endFrameInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                handleImagePreview(this.files[0], document.getElementById('endFramePreview'), 'end');
                updateFirstLastButtonState();
            }
        });
    }
    
    // 清空按钮
    if (clearButton) {
        clearButton.addEventListener('click', function() {
            if (startFrameInput) startFrameInput.value = '';
            if (endFrameInput) endFrameInput.value = '';
            
            const startPreview = document.getElementById('startFramePreview');
            const endPreview = document.getElementById('endFramePreview');
            if (startPreview) startPreview.innerHTML = '';
            if (endPreview) endPreview.innerHTML = '';
            
            updateFirstLastButtonState();
        });
    }
    
    // 生成按钮
    if (generateButton) {
        generateButton.addEventListener('click', generateFirstLastVideo);
    }
    
    // 生成新视频按钮
    const generateAnotherButton = document.getElementById('generateAnotherVideo');
    if (generateAnotherButton) {
        generateAnotherButton.addEventListener('click', function() {
            // 隐藏结果区域
            const resultSection = document.getElementById('firstLastResultSection');
            const taskProgress = document.getElementById('firstLastTaskProgress');
            if (resultSection) resultSection.style.display = 'none';
            if (taskProgress) taskProgress.style.display = 'none';
            
            // 清空表单
            if (startFrameInput) startFrameInput.value = '';
            if (endFrameInput) endFrameInput.value = '';
            
            const startPreview = document.getElementById('startFramePreview');
            const endPreview = document.getElementById('endFramePreview');
            if (startPreview) startPreview.innerHTML = '';
            if (endPreview) endPreview.innerHTML = '';
            
            updateFirstLastButtonState();
        });
    }
}

// 处理图片预览
function handleImagePreview(file, previewElement, type) {
    if (!previewElement) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        previewElement.innerHTML = `<img src="${e.target.result}" alt="${type} frame" style="max-width: 100%; height: auto;">`;
    };
    reader.readAsDataURL(file);
}

// 更新首尾帧按钮状态
function updateFirstLastButtonState() {
    const generateButton = document.getElementById('generateFirstLastVideo');
    const startFrameInput = document.getElementById('startFrameInput');
    
    if (generateButton && startFrameInput) {
        generateButton.disabled = !startFrameInput.files || startFrameInput.files.length === 0;
    }
}

// 生成首尾帧视频
async function generateFirstLastVideo() {
    const startFrameInput = document.getElementById('startFrameInput');
    const endFrameInput = document.getElementById('endFrameInput');
    
    if (!startFrameInput || !startFrameInput.files || startFrameInput.files.length === 0) {
        showToast('请选择开始帧图片', 'warning');
        return;
    }
    
    try {
        showToast('正在上传图片...', 'info');
        
        // 先上传图片
        const uploadFormData = new FormData();
        uploadFormData.append('start_frame', startFrameInput.files[0]);
        
        if (endFrameInput && endFrameInput.files && endFrameInput.files.length > 0) {
            uploadFormData.append('end_frame', endFrameInput.files[0]);
        }
        
        const uploadResponse = await fetch('/upload_firstlast', {
            method: 'POST',
            body: uploadFormData
        });
        
        const uploadResult = await uploadResponse.json();
        
        if (!uploadResult.success) {
            showToast('图片上传失败: ' + uploadResult.error, 'error');
            return;
        }
        
        showToast('开始生成视频...', 'info');
        
        // 获取配置参数
        const modelId = document.getElementById('firstLastModelName')?.value || 'seedance-1-0-lite-i2v-250428';
        const apiKey = document.getElementById('firstLastApiKey')?.value || '';
        const prompt = document.getElementById('firstLastPrompt')?.value || 'Generate a video from first frame to last frame';
        const seed = document.getElementById('firstLastSeed')?.value || '-1';
        const temperature = document.getElementById('firstLastTemperature')?.value || '0.7';
        const resolution = document.getElementById('firstLastRatio')?.value || '1080x1080';
        const duration = document.getElementById('firstLastDuration')?.value || '5';
        const fps = document.getElementById('firstLastFps')?.value || '24';
        
        if (!apiKey) {
            showToast('请输入API密钥', 'warning');
            return;
        }
        
        // 发送生成请求
        const generateData = {
            model_name: modelId,
            api_key: apiKey,
            prompt: prompt,
            seed: parseInt(seed),
            temperature: parseFloat(temperature),
            ratio: resolution,
            duration: parseInt(duration),
            fps: parseInt(fps),
            watermark: false
        };
        
        const generateResponse = await fetch('/generate_firstlast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(generateData)
        });
        
        const generateResult = await generateResponse.json();
        
        if (generateResult.success) {
            // 显示任务进度
            showFirstLastTaskProgress(generateResult.task_id);
            pollFirstLastTaskStatus(generateResult.task_id);
        } else {
            showToast('生成失败: ' + generateResult.error, 'error');
        }
    } catch (error) {
        console.error('Generation error:', error);
        showToast('生成过程中发生错误', 'error');
    }
}

// 轮询首尾帧任务状态
function pollFirstLastTaskStatus(taskId) {
    // 开始时更新生成状态
    updateTaskStepStatus('generating-status', '处理中');
    
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`/task_status/${taskId}`);
            const result = await response.json();
            
            if (result.status === 'completed') {
                clearInterval(pollInterval);
                // 更新所有步骤为完成状态
                updateTaskStepStatus('generating-status', '已完成');
                updateTaskStepStatus('complete-status', '已完成');
                showFirstLastResult(result.video_url, result.download_url);
                showToast('视频生成完成！', 'success');
            } else if (result.status === 'failed') {
                clearInterval(pollInterval);
                updateTaskStepStatus('generating-status', '失败');
                updateTaskStepStatus('complete-status', '失败');
                showToast('生成失败: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Status polling error:', error);
            clearInterval(pollInterval);
            updateTaskStepStatus('generating-status', '失败');
            showToast('状态查询失败', 'error');
        }
    }, 2000);
}

// 显示首尾帧任务进度
function showFirstLastTaskProgress(taskId) {
    const taskProgress = document.getElementById('firstLastTaskProgress');
    const taskIdDisplay = document.getElementById('task-id-display');
    
    if (taskProgress) {
        taskProgress.style.display = 'block';
    }
    
    if (taskIdDisplay) {
        taskIdDisplay.textContent = `任务ID: ${taskId}`;
    }
    
    // 更新步骤状态
    updateTaskStepStatus('upload-status', '已完成');
    updateTaskStepStatus('task-status', '处理中');
}

// 更新任务步骤状态
function updateTaskStepStatus(stepId, status) {
    const stepElement = document.getElementById(stepId);
    if (stepElement) {
        stepElement.textContent = status;
        stepElement.className = 'step-status ' + (status === '已完成' ? 'completed' : status === '处理中' ? 'processing' : 'pending');
    }
}

// 显示首尾帧结果
function showFirstLastResult(videoUrl, downloadUrl) {
    const resultSection = document.getElementById('firstLastResultSection');
    const resultVideo = document.getElementById('firstLastResultVideo');
    const downloadLink = document.getElementById('firstLastDownloadLink');
    
    if (resultSection && resultVideo && downloadLink) {
        resultVideo.src = videoUrl;
        resultVideo.style.display = 'block';
        downloadLink.href = downloadUrl;
        downloadLink.style.display = 'inline-block';
        resultSection.style.display = 'block';
        
        // 显示生成新视频按钮
        const generateAnotherButton = document.getElementById('generateAnotherVideo');
        if (generateAnotherButton) {
            generateAnotherButton.style.display = 'inline-block';
        }
    }
}

// 参考图生成模块
function initializeReferenceUpload() {
    const referenceUploads = [
        { input: 'ref1Input', preview: 'ref1Preview', area: 'ref1UploadArea' },
        { input: 'ref2Input', preview: 'ref2Preview', area: 'ref2UploadArea' },
        { input: 'ref3Input', preview: 'ref3Preview', area: 'ref3UploadArea' },
        { input: 'ref4Input', preview: 'ref4Preview', area: 'ref4UploadArea' }
    ];
    
    referenceUploads.forEach(upload => {
        const uploadArea = document.getElementById(upload.area);
        const fileInput = document.getElementById(upload.input);
        const previewElement = document.getElementById(upload.preview);
        
        if (uploadArea && fileInput) {
            uploadArea.addEventListener('click', () => fileInput.click());
            
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    handleReferenceImagePreview(file, previewElement, upload.area);
                    updateReferenceButtonState();
                }
            });
        }
    });
    
    // 清空按钮
    const clearButton = document.getElementById('clearReferenceImages');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            referenceUploads.forEach(upload => {
                const input = document.getElementById(upload.input);
                const preview = document.getElementById(upload.preview);
                if (input) input.value = '';
                if (preview) preview.innerHTML = '';
            });
            updateReferenceButtonState();
        });
    }
    
    // 生成按钮
    const generateButton = document.getElementById('generateReferenceVideo');
    if (generateButton) {
        generateButton.addEventListener('click', generateReferenceVideo);
    }
}

// 处理参考图片预览
function handleReferenceImagePreview(file, previewElement, uploadAreaId) {
    if (!previewElement) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        previewElement.innerHTML = `<img src="${e.target.result}" alt="Reference image" style="max-width: 100%; height: auto;">`;
        
        const uploadArea = document.getElementById(uploadAreaId);
        if (uploadArea) {
            uploadArea.style.display = 'none';
        }
    };
    reader.readAsDataURL(file);
}

// 更新参考图按钮状态
function updateReferenceButtonState() {
    const generateButton = document.getElementById('generateReferenceVideo');
    const hasImages = ['ref1Input', 'ref2Input', 'ref3Input', 'ref4Input'].some(id => {
        const input = document.getElementById(id);
        return input && input.files && input.files.length > 0;
    });
    
    if (generateButton) {
        generateButton.disabled = !hasImages;
    }
}

// 生成参考图视频
async function generateReferenceVideo() {
    const formData = new FormData();
    let hasFiles = false;
    
    ['ref1Input', 'ref2Input', 'ref3Input', 'ref4Input'].forEach((id, index) => {
        const input = document.getElementById(id);
        if (input && input.files && input.files.length > 0) {
            formData.append(`reference_${index + 1}`, input.files[0]);
            hasFiles = true;
        }
    });
    
    if (!hasFiles) {
        showToast('请至少选择一张参考图片', 'warning');
        return;
    }
    
    try {
        showToast('正在上传图片...', 'info');
        
        // 先上传图片
        const uploadResponse = await fetch('/upload_reference', {
            method: 'POST',
            body: formData
        });
        
        const uploadResult = await uploadResponse.json();
        
        if (!uploadResult.success) {
            showToast('图片上传失败: ' + uploadResult.error, 'error');
            return;
        }
        
        showToast('开始生成视频...', 'info');
        
        // 获取配置参数
        const modelId = document.getElementById('referenceModelName')?.value || 'seedance-1-0-lite-i2v-250428';
        const apiKey = document.getElementById('referenceApiKey')?.value || '';
        const prompt = document.getElementById('referencePrompt')?.value || 'Generate a video based on the provided reference images';
        const seed = document.getElementById('referenceSeed')?.value || '-1';
        const temperature = document.getElementById('referenceTemperature')?.value || '0.7';
        const resolution = document.getElementById('referenceRatio')?.value || '1080x1080';
        const duration = document.getElementById('referenceDuration')?.value || '5';
        const fps = document.getElementById('referenceFps')?.value || '24';
        
        if (!apiKey) {
            showToast('请输入API密钥', 'warning');
            return;
        }
        
        // 发送生成请求
        const generateData = {
            model_name: modelId,
            api_key: apiKey,
            prompt: prompt,
            seed: parseInt(seed),
            temperature: parseFloat(temperature),
            ratio: resolution,
            duration: parseInt(duration),
            fps: parseInt(fps),
            watermark: false
        };
        
        const generateResponse = await fetch('/generate_reference', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(generateData)
        });
        
        const generateResult = await generateResponse.json();
        
        if (generateResult.success) {
            showReferenceTaskProgress(generateResult.task_id);
            pollReferenceTaskStatus(generateResult.task_id);
        } else {
            showToast('生成失败: ' + generateResult.error, 'error');
        }
    } catch (error) {
        console.error('Generation error:', error);
        showToast('生成过程中发生错误', 'error');
    }
}

// 轮询参考图任务状态
function pollReferenceTaskStatus(taskId) {
    updateReferenceTaskStepStatus('reference-step-generating', '处理中');
    
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`/task_status/${taskId}`);
            const result = await response.json();
            
            if (result.status === 'completed') {
                clearInterval(pollInterval);
                updateReferenceTaskStepStatus('reference-step-generating', '已完成');
                updateReferenceTaskStepStatus('reference-step-completed', '已完成');
                showReferenceResult(result.video_url, result.download_url);
                showToast('视频生成完成！', 'success');
            } else if (result.status === 'failed') {
                clearInterval(pollInterval);
                updateReferenceTaskStepStatus('reference-step-generating', '失败');
                updateReferenceTaskStepStatus('reference-step-completed', '失败');
                showToast('生成失败: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Status polling error:', error);
            clearInterval(pollInterval);
            showToast('状态查询失败', 'error');
        }
    }, 2000);
}

// 显示参考图结果
function showReferenceResult(videoUrl, downloadUrl) {
    const resultSection = document.getElementById('referenceResultSection');
    const resultVideo = document.getElementById('referenceResultVideo');
    const downloadLink = document.getElementById('referenceDownloadLink');
    
    if (resultSection && resultVideo && downloadLink) {
        resultVideo.src = videoUrl;
        downloadLink.href = downloadUrl;
        resultSection.style.display = 'block';
        
        // 显示视频和下载链接
        resultVideo.style.display = 'block';
        downloadLink.style.display = 'inline-block';
    }
}

// 选择节点类型
function selectNodeType(type) {
    selectedNodeType = type;
    
    // 更新UI状态
    const nodeTypeCards = document.querySelectorAll('.node-type-card');
    nodeTypeCards.forEach(card => {
        card.classList.remove('active');
        if (card.dataset.type === type) {
            card.classList.add('active');
        }
    });
    
    // 更新指示器
    const indicator = document.getElementById('selectedTypeIndicator');
    if (indicator) {
        indicator.textContent = type === 'video' ? '已选择：视频节点' : '已选择：音频节点';
    }
    
    // 启用添加节点按钮
    const addNodeButton = document.getElementById('addNodeButton');
    if (addNodeButton) {
        addNodeButton.disabled = false;
    }
    
    console.log('Selected node type:', type);
}

// 显示合并任务进度
function showMergeTaskProgress(taskId) {
    const taskProgress = document.getElementById('mergeTaskProgress');
    
    if (taskProgress) {
        taskProgress.style.display = 'block';
    }
    
    // 更新步骤状态
    updateMergeTaskStepStatus('merge-validate-status', '已完成');
}

// 更新合并任务步骤状态
function updateMergeTaskStepStatus(stepId, status) {
    const statusElement = document.getElementById(stepId);
    if (statusElement) {
        statusElement.textContent = status;
        
        // 更新样式
        const step = statusElement.closest('.task-step');
        if (step) {
            step.classList.remove('pending', 'processing', 'completed', 'failed');
            if (status === '已完成') {
                step.classList.add('completed');
            } else if (status === '处理中') {
                step.classList.add('processing');
            } else if (status === '失败') {
                step.classList.add('failed');
            } else {
                step.classList.add('pending');
            }
        }
    }
}

// 显示参考图任务进度
function showReferenceTaskProgress(taskId) {
    const taskProgress = document.getElementById('referenceTaskProgress');
    const taskIdDisplay = document.getElementById('reference-task-id-display');
    
    if (taskProgress) {
        taskProgress.style.display = 'block';
    }
    
    if (taskIdDisplay) {
        taskIdDisplay.textContent = `任务ID: ${taskId}`;
    }
    
    // 更新步骤状态
    updateReferenceTaskStepStatus('reference-step-upload', '已完成');
    updateReferenceTaskStepStatus('reference-step-task', '已完成');
}

// 更新参考图任务步骤状态
function updateReferenceTaskStepStatus(stepId, status) {
    const step = document.getElementById(stepId);
    if (step) {
        const statusElement = step.querySelector('.step-status');
        if (statusElement) {
            statusElement.textContent = status;
            
            // 更新样式
            step.classList.remove('pending', 'processing', 'completed', 'failed');
            if (status === '已完成') {
                step.classList.add('completed');
            } else if (status === '处理中') {
                step.classList.add('processing');
            } else if (status === '失败') {
                step.classList.add('failed');
            } else {
                step.classList.add('pending');
            }
        }
    }
}

// 生成新视频（通用函数）
function generateNewVideo(type) {
    if (type === 'reference') {
        // 隐藏结果和进度区域
        const resultSection = document.getElementById('referenceResultSection');
        const taskProgress = document.getElementById('referenceTaskProgress');
        
        if (resultSection) resultSection.style.display = 'none';
        if (taskProgress) taskProgress.style.display = 'none';
        
        // 清空输入字段
        ['ref1Input', 'ref2Input', 'ref3Input', 'ref4Input'].forEach(id => {
            const input = document.getElementById(id);
            const preview = document.getElementById(id.replace('Input', 'Preview'));
            const uploadArea = document.getElementById(id.replace('Input', 'UploadArea'));
            
            if (input) input.value = '';
            if (preview) preview.innerHTML = '';
            if (uploadArea) uploadArea.style.display = 'flex';
        });
        
        // 更新按钮状态
        updateReferenceButtonState();
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化模式选择按钮事件
    const modeButtons = document.querySelectorAll('.mode-button');
    console.log('Found mode buttons:', modeButtons.length);
    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const mode = button.getAttribute('data-mode');
            console.log('Mode button clicked:', mode);
            if (mode) {
                showGenerationPage(mode);
                console.log('Switching to page:', mode + '-page');
            }
        });
    });
    
    // 初始化各个模块
    initializeMergeMode();
    initializeFirstLastUpload();
    initializeReferenceUpload();
    
    // 初始化参考图生成按钮事件
    const generateReferenceBtn = document.getElementById('generateReferenceVideo');
    if (generateReferenceBtn) {
        generateReferenceBtn.addEventListener('click', generateReferenceVideo);
    }
    
    const clearReferenceBtn = document.getElementById('clearReferenceImages');
    if (clearReferenceBtn) {
        clearReferenceBtn.addEventListener('click', () => {
            ['ref1Input', 'ref2Input', 'ref3Input', 'ref4Input'].forEach(id => {
                const input = document.getElementById(id);
                const preview = document.getElementById(id.replace('Input', 'Preview'));
                const uploadArea = document.getElementById(id.replace('Input', 'UploadArea'));
                
                if (input) input.value = '';
                if (preview) preview.innerHTML = '';
                if (uploadArea) uploadArea.style.display = 'flex';
            });
            updateReferenceButtonState();
        });
    }
    
    // 初始化节点类型选择器
    const nodeTypeCards = document.querySelectorAll('.node-type-card');
    nodeTypeCards.forEach(card => {
        card.addEventListener('click', () => {
            selectNodeType(card.dataset.type);
        });
    });
    
    // 默认选择视频节点
    selectNodeType('video');
    
    // 添加节点按钮
    const addNodeBtn = document.getElementById('addNodeButton');
    if (addNodeBtn) {
        addNodeBtn.addEventListener('click', () => {
            if (selectedNodeType === 'video') {
                addVideoNode();
            } else if (selectedNodeType === 'audio') {
                addAudioNode();
            }
        });
    }
    
    // 创建新合并按钮
    const createNewMergeBtn = document.getElementById('createNewMerge');
    if (createNewMergeBtn) {
        createNewMergeBtn.addEventListener('click', () => {
            // 隐藏结果和进度区域
            const resultSection = document.getElementById('mergeResultSection');
            const taskProgress = document.getElementById('mergeTaskProgress');
            
            if (resultSection) resultSection.style.display = 'none';
            if (taskProgress) taskProgress.style.display = 'none';
            
            // 清空节点
            clearVideoNodes(false);
            
            showToast('已重置，可以创建新的合并任务', 'info');
        });
    }
    
    console.log('Application initialized successfully');
});