// 全局变量
let uploadedImages = {
    firstlast: {
        startFrame: null,
        endFrame: null
    },
    reference: {
        ref1: null,
        ref2: null,
        ref3: null,
        ref4: null
    }
};

let currentTaskId = null;
let progressInterval = null;
let completionToastShown = false;

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // 初始化模式选择按钮
    initializeModeSelection();
    
    // 初始化首尾帧模式
    initializeFirstLastMode();
    
    // 初始化参考图模式
    initializeReferenceMode();
    
    // 显示模式选择界面
    showModeSelection();
}

// 模式选择相关函数
function initializeModeSelection() {
    const modeButtons = document.querySelectorAll('.mode-button');
    modeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const mode = this.getAttribute('data-mode');
            showGenerationPage(mode);
        });
    });
}

function showModeSelection() {
    // 隐藏所有生成页面
    document.getElementById('firstlast-page').style.display = 'none';
    document.getElementById('reference-page').style.display = 'none';
    
    // 显示模式选择界面
    document.getElementById('mode-selection').style.display = 'block';
}

function showGenerationPage(mode) {
    // 隐藏模式选择界面
    document.getElementById('mode-selection').style.display = 'none';
    
    // 显示对应的生成页面
    if (mode === 'firstlast') {
        document.getElementById('firstlast-page').style.display = 'block';
        document.getElementById('reference-page').style.display = 'none';
        // 检查后端是否有已上传的首尾帧文件
        checkExistingFiles('firstlast');
    } else if (mode === 'reference') {
        document.getElementById('firstlast-page').style.display = 'none';
        document.getElementById('reference-page').style.display = 'block';
        // 检查后端是否有已上传的参考图文件
        checkExistingFiles('reference');
    }
}

// 首尾帧模式初始化
function initializeFirstLastMode() {
    // 首帧上传
    setupImageUpload('startFrameUploadArea', 'startFrameInput', 'startFramePreview', 'firstlast', 'startFrame');
    
    // 尾帧上传
    setupImageUpload('endFrameUploadArea', 'endFrameInput', 'endFramePreview', 'firstlast', 'endFrame');
    
    // 按钮事件
    document.getElementById('clearFirstLastImages').addEventListener('click', () => clearImages('firstlast'));
    document.getElementById('generateFirstLastVideo').addEventListener('click', () => generateVideo('firstlast'));
}

// 检查后端已存在的文件
async function checkExistingFiles(mode) {
    try {
        const endpoint = mode === 'firstlast' ? '/check_firstlast_files' : '/check_reference_files';
        const response = await fetch(endpoint);
        const result = await response.json();
        
        if (result.success) {
            if (mode === 'firstlast') {
                // 更新首尾帧状态
                if (result.has_first_frame) {
                    uploadedImages.firstlast.startFrame = { name: 'existing_file' };
                }
                if (result.has_last_frame) {
                    uploadedImages.firstlast.endFrame = { name: 'existing_file' };
                }
            } else if (mode === 'reference') {
                // 更新参考图状态
                if (result.reference_count > 0) {
                    for (let i = 1; i <= Math.min(result.reference_count, 4); i++) {
                        uploadedImages.reference[`ref${i}`] = { name: 'existing_file' };
                    }
                }
            }
            // 更新按钮状态
            updateButtonStates(mode);
        }
    } catch (error) {
        console.error('Error checking existing files:', error);
    }
}

// 参考图模式初始化
function initializeReferenceMode() {
    // 四个参考图上传区域
    for (let i = 1; i <= 4; i++) {
        setupImageUpload(`ref${i}UploadArea`, `ref${i}Input`, `ref${i}Preview`, 'reference', `ref${i}`);
    }
    
    // 按钮事件
    document.getElementById('clearReferenceImages').addEventListener('click', () => clearImages('reference'));
    document.getElementById('generateReferenceVideo').addEventListener('click', () => generateVideo('reference'));
}

// 设置图片上传功能
function setupImageUpload(uploadAreaId, inputId, previewId, mode, imageKey) {
    const uploadArea = document.getElementById(uploadAreaId);
    const fileInput = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    
    if (!uploadArea || !fileInput || !preview) {
        console.warn(`Upload elements not found: ${uploadAreaId}, ${inputId}, ${previewId}`);
        return;
    }
    
    // 点击上传区域触发文件选择
    uploadArea.addEventListener('click', () => fileInput.click());
    
    // 文件选择事件
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            handleImageFile(file, mode, imageKey, preview);
        }
    });
    
    // 拖拽上传
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleImageFile(files[0], mode, imageKey, preview);
        }
    });
}

// 处理图片文件
function handleImageFile(file, mode, imageKey, previewElement) {
    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件', 'error');
        return;
    }
    
    // 存储文件
    uploadedImages[mode][imageKey] = file;
    
    // 显示预览
    const reader = new FileReader();
    reader.onload = function(e) {
        previewElement.innerHTML = `
            <img src="${e.target.result}" alt="预览图片">
            <div class="preview-info">${file.name} (${formatFileSize(file.size)})</div>
        `;
    };
    reader.readAsDataURL(file);
    
    // 更新按钮状态
    updateButtonStates(mode);
}

// 清空图片
function clearImages(mode) {
    if (mode === 'firstlast') {
        uploadedImages.firstlast.startFrame = null;
        uploadedImages.firstlast.endFrame = null;
        
        document.getElementById('startFramePreview').innerHTML = '';
        document.getElementById('endFramePreview').innerHTML = '';
        document.getElementById('startFrameInput').value = '';
        document.getElementById('endFrameInput').value = '';
    } else if (mode === 'reference') {
        for (let i = 1; i <= 4; i++) {
            uploadedImages.reference[`ref${i}`] = null;
            document.getElementById(`ref${i}Preview`).innerHTML = '';
            document.getElementById(`ref${i}Input`).value = '';
        }
    }
    
    updateButtonStates(mode);
    showToast('图片已清空', 'success');
}

// 上传图片到服务器
async function uploadImages(mode) {
    const formData = new FormData();
    let hasImages = false;
    
    if (mode === 'firstlast') {
        if (uploadedImages.firstlast.startFrame) {
            formData.append('first_frame', uploadedImages.firstlast.startFrame);
            hasImages = true;
        }
        if (uploadedImages.firstlast.endFrame) {
            formData.append('last_frame', uploadedImages.firstlast.endFrame);
        }
    } else if (mode === 'reference') {
        for (let i = 1; i <= 4; i++) {
            const refImage = uploadedImages.reference[`ref${i}`];
            if (refImage) {
                formData.append('reference_images', refImage);
                hasImages = true;
            }
        }
    }
    
    if (!hasImages) {
        showToast('请先选择图片', 'error');
        return { success: false, error: 'no_images' };
    }
    
    try {
        const endpoint = mode === 'firstlast' ? '/upload_firstlast' : '/upload_reference';
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('图片上传成功', 'success');
            updateButtonStates(mode);
            return result;
        } else {
            showToast(`上传失败: ${result.error}`, 'error');
            return result;
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('上传失败，请重试', 'error');
        return { success: false, error: 'network_error' };
    }
}

// 生成视频
async function generateVideo(mode) {
    // 获取配置参数
    const config = getVideoConfig(mode);
    
    if (!config) {
        showToast('请填写完整的配置参数', 'error');
        return;
    }
    
    // 显示任务进度条
    showTaskProgress(mode);
    // 重置完成通知标志
    completionToastShown = false;
    
    // 步骤1: 上传图片并确认
    updateTaskStep('upload', 'active', '上传中...', mode);
    const uploadRes = await uploadImages(mode);
    if (!uploadRes || !uploadRes.success) {
        updateTaskStep('upload', 'error', '上传失败', mode);
        return;
    }
    updateTaskStep('upload', 'completed', '已完成', mode);
    
    try {
        // 步骤2: 创建任务
        updateTaskStep('task', 'active', '创建中...', mode);
        
        const endpoint = mode === 'firstlast' ? '/generate_firstlast' : '/generate_reference';
        
        // 如果用户填写了 API Key，优先通过 Authorization 头传递，避免出现在URL或日志中
        const camel = getCamelPrefix(mode);
        const apiKeyInput = document.getElementById(`${camel}ApiKey`);
        const apiKey = apiKeyInput && apiKeyInput.value ? apiKeyInput.value.trim() : '';
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
            headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentTaskId = result.task_id;
            
            // 更新任务ID显示
            const taskIdDisplay = document.getElementById(mode === 'reference' ? 'reference-task-id-display' : 'task-id-display');
            if (taskIdDisplay) {
                taskIdDisplay.textContent = `任务ID: ${currentTaskId}`;
            }
            updateTaskStep('task', 'completed', '已创建', mode);
            
            showToast('视频生成任务已启动', 'success');
            
            // 步骤3: 开始生成
            updateTaskStep('generating', 'active', '生成中...', mode);
            startProgressPolling(mode);
        } else {
            updateTaskStep('task', 'error', '创建失败', mode);
            showToast(`生成失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Generation error:', error);
        updateTaskStep('task', 'error', '网络错误', mode);
        showToast('生成失败，请重试', 'error');
    }
}

// 获取视频配置
function getVideoConfig(mode) {
    const prefix = mode === 'firstlast' ? 'firstLast' : 'reference';
    
    const modelName = document.getElementById(`${prefix}ModelName`).value;
    const seed = parseInt(document.getElementById(`${prefix}Seed`).value);
    const temperature = parseFloat(document.getElementById(`${prefix}Temperature`).value);
    const prompt = document.getElementById(`${prefix}Prompt`).value;
    const ratio = document.getElementById(`${prefix}Ratio`).value;
    const duration = parseInt(document.getElementById(`${prefix}Duration`).value);
    const fps = parseInt(document.getElementById(`${prefix}Fps`).value);

    // 新增：可选 API Key（仅用于本地调试，不会显示）
    const apiKeyInput = document.getElementById(`${prefix}ApiKey`);
    const apiKey = apiKeyInput && apiKeyInput.value ? apiKeyInput.value.trim() : undefined;
    
    if (!modelName || !prompt || !duration || !fps) {
        return null;
    }
    
    const payload = {
        model_name: modelName,
        seed: seed,
        temperature: temperature,
        prompt: prompt,
        ratio: ratio,
        duration: duration,
        fps: fps
    };

    // 仅当用户填写了 API Key 时才附加
    if (apiKey) {
        payload.api_key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    }

    return payload;
}

// 工具：根据模式获取不同的DOM前缀
function getCamelPrefix(mode) {
    return mode === 'firstlast' ? 'firstLast' : 'reference';
}

function getStepPrefix(mode) {
    return mode === 'reference' ? 'reference-step' : 'step';
}

function mapCompletedId(stepId, mode) {
    // 首尾帧模式HTML使用 step-complete，参考图使用 reference-step-completed
    if (stepId === 'completed' && mode === 'firstlast') return 'complete';
    return stepId;
}

// 显示任务进度条
function showTaskProgress(mode) {
    const containerId = mode === 'firstlast' ? 'firstLastTaskProgress' : 'referenceTaskProgress';
    const taskProgress = document.getElementById(containerId);
    if (taskProgress) {
        taskProgress.style.display = 'block';
        
        // 重置所有步骤状态
        resetTaskSteps(mode);
    }
}

// 重置任务步骤状态
function resetTaskSteps(mode) {
    const steps = ['upload', 'task', 'generating', 'completed'];
    const prefix = getStepPrefix(mode);
    
    steps.forEach(stepId => {
        const realId = mapCompletedId(stepId, mode);
        const stepElement = document.getElementById(`${prefix}-${realId}`);
        if (stepElement) {
            stepElement.className = 'task-step';
            const statusElement = stepElement.querySelector('.step-status');
            if (statusElement) {
                statusElement.textContent = '待处理';
            }
        }
    });
    
    // 清空任务ID显示
    const taskIdDisplay = document.getElementById(mode === 'reference' ? 'reference-task-id-display' : 'task-id-display');
    if (taskIdDisplay) {
        taskIdDisplay.textContent = '等待创建任务ID...';
    }
}

// 更新任务步骤状态
function updateTaskStep(stepId, status, statusText, mode = 'firstlast') {
    const prefix = getStepPrefix(mode);
    const realId = mapCompletedId(stepId, mode);
    const stepElement = document.getElementById(`${prefix}-${realId}`);
    if (stepElement) {
        // 移除所有状态类
        stepElement.classList.remove('active', 'completed', 'error');
        
        // 添加新状态类
        if (status !== 'pending') {
            stepElement.classList.add(status);
        }
        
        // 更新状态文本
        const statusElement = stepElement.querySelector('.step-status');
        if (statusElement && statusText) {
            statusElement.textContent = statusText;
        }
    }
}

// 显示进度条（保留原有功能用于兼容）
function showProgress(mode) {
    const camel = getCamelPrefix(mode);
    const progressSection = document.getElementById(`${camel}ProgressSection`);
    const resultSection = document.getElementById(`${camel}ResultSection`);
    
    if (progressSection) {
        progressSection.style.display = 'block';
    }
    if (resultSection) {
        resultSection.style.display = 'none';
    }
}

// 开始进度轮询
function startProgressPolling(mode) {
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    
    progressInterval = setInterval(async () => {
        try {
            const taskId = currentTaskId;
            if (!taskId) return;
            // 使用 Authorization 头传递 API Key，避免出现在URL或访问日志中
            const prefix = getCamelPrefix(mode);
            const apiKeyInput = document.getElementById(`${prefix}ApiKey`);
            const apiKey = apiKeyInput && apiKeyInput.value ? apiKeyInput.value.trim() : '';
            const headers = {};
            if (apiKey) {
                headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
            }

            const response = await fetch(`/task_status/${taskId}`, { headers });
            const result = await response.json();
            
            updateProgress(mode, result.progress, result.status);
            
            if (result.status === 'completed') {
                clearInterval(progressInterval);
                
                // 更新任务步骤状态
                updateTaskStep('generating', 'completed', '已完成', mode);
                updateTaskStep('completed', 'completed', '已完成', mode);
                
                // 显示视频链接（可选）
                const videoLinkElement = document.getElementById('video-link');
                if (videoLinkElement && result.video_url) {
                    videoLinkElement.href = result.video_url;
                    videoLinkElement.textContent = '点击查看生成的视频';
                    videoLinkElement.style.display = 'inline-block';
                }
                
                showResult(mode, result.video_url);
                if (!completionToastShown) {
                    completionToastShown = true;
                    showToast('视频生成完成！', 'success');
                }
            } else if (result.status === 'failed') {
                clearInterval(progressInterval);
                
                // 更新任务步骤状态为错误
                updateTaskStep('generating', 'error', '生成失败', mode);
                
                showToast(`生成失败: ${result.error}`, 'error');
                hideProgress(mode);
            }
        } catch (error) {
            console.error('Progress polling error:', error);
            updateTaskStep('generating', 'error', '网络错误', mode);
        }
    }, 2000);
}

// 更新进度
function updateProgress(mode, progress, status) {
    const camel = getCamelPrefix(mode);
    const progressFill = document.getElementById(`${camel}ProgressFill`);
    const progressText = document.getElementById(`${camel}ProgressText`);
    
    if (progressFill) {
        progressFill.style.width = `${progress}%`;
    }
    
    if (progressText) {
        const statusText = {
            'pending': '等待中...',
            'processing': '生成中...',
            'completed': '完成',
            'failed': '失败'
        };
        progressText.textContent = `${statusText[status] || status} (${progress}%)`;
    }
}

// 隐藏进度条
function hideProgress(mode) {
    const camel = getCamelPrefix(mode);
    const progressSection = document.getElementById(`${camel}ProgressSection`);
    if (progressSection) {
        progressSection.style.display = 'none';
    }
}

// 显示结果
function showResult(mode, videoUrl) {
    hideProgress(mode);
    
    const camel = getCamelPrefix(mode);
    const resultSection = document.getElementById(`${camel}ResultSection`);
    const resultVideo = document.getElementById(`${camel}ResultVideo`);
    const downloadLink = document.getElementById(`${camel}DownloadLink`);
    
    if (resultSection) {
        resultSection.style.display = 'block';
    }
    
    if (resultVideo && videoUrl) {
        let playbackUrl = videoUrl;
        try {
            const origin = window.location.origin;
            if (typeof videoUrl === 'string' && videoUrl.startsWith(origin + '/download/')) {
                playbackUrl = videoUrl.replace(origin + '/download/', origin + '/stream/');
            } else if (typeof videoUrl === 'string' && videoUrl.startsWith('/download/')) {
                playbackUrl = videoUrl.replace('/download/', '/stream/');
            }
        } catch (e) { /* no-op */ }
        resultVideo.src = playbackUrl;
        resultVideo.style.display = 'block';
    }
    
    if (downloadLink && videoUrl) {
        downloadLink.href = videoUrl;
        downloadLink.style.display = 'inline-flex';
    }
    
    // 移除重复 toast，避免与轮询完成分支重复弹出
}

// 更新按钮状态
function updateButtonStates(mode) {
    if (mode === 'firstlast') {
        const hasStartFrame = uploadedImages.firstlast.startFrame !== null;
        const generateBtn = document.getElementById('generateFirstLastVideo');
        
        if (generateBtn) {
            generateBtn.disabled = !hasStartFrame;
        }
    } else if (mode === 'reference') {
        const hasAnyRef = Object.values(uploadedImages.reference).some(img => img !== null);
        const generateBtn = document.getElementById('generateReferenceVideo');
        
        if (generateBtn) {
            generateBtn.disabled = !hasAnyRef;
        }
    }
}

// 工具函数
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Toast 通知
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 生成新视频（重置界面）
function generateNewVideo(mode) {
    const camel = getCamelPrefix(mode);
    // 隐藏进度条和结果区域
    const progressSection = document.getElementById(`${camel}ProgressSection`);
    const resultSection = document.getElementById(`${camel}ResultSection`);
    
    if (progressSection) {
        progressSection.style.display = 'none';
    }
    
    if (resultSection) {
        resultSection.style.display = 'none';
    }
    
    // 隐藏任务进度区域
    const taskProgressSection = document.getElementById(mode === 'firstlast' ? 'firstLastTaskProgress' : 'referenceTaskProgress');
    if (taskProgressSection) {
        taskProgressSection.style.display = 'none';
    }
    
    // 重置任务步骤
    resetTaskSteps(mode);
    
    // 重置任务ID
    currentTaskId = null;
    
    // 清除轮询
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    
    // 重置完成通知标志
    completionToastShown = false;
    
    // 重置视频链接
    const videoLinkElement = document.getElementById('video-link');
    if (videoLinkElement) {
        videoLinkElement.style.display = 'none';
        videoLinkElement.href = '#';
        videoLinkElement.textContent = '';
    }
    
    showToast('已重置，可以开始新的视频生成', 'info');
}

// 全局函数（供HTML调用）
window.showModeSelection = showModeSelection;
window.showGenerationPage = showGenerationPage;
window.generateNewVideo = generateNewVideo;