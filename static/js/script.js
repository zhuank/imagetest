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
    } else if (mode === 'reference') {
        document.getElementById('firstlast-page').style.display = 'none';
        document.getElementById('reference-page').style.display = 'block';
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
    document.getElementById('uploadFirstLastImages').addEventListener('click', () => uploadImages('firstlast'));
    document.getElementById('generateFirstLastVideo').addEventListener('click', () => generateVideo('firstlast'));
}

// 参考图模式初始化
function initializeReferenceMode() {
    // 四个参考图上传区域
    for (let i = 1; i <= 4; i++) {
        setupImageUpload(`ref${i}UploadArea`, `ref${i}Input`, `ref${i}Preview`, 'reference', `ref${i}`);
    }
    
    // 按钮事件
    document.getElementById('clearReferenceImages').addEventListener('click', () => clearImages('reference'));
    document.getElementById('uploadReferenceImages').addEventListener('click', () => uploadImages('reference'));
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
            formData.append('start_frame', uploadedImages.firstlast.startFrame);
            hasImages = true;
        }
        if (uploadedImages.firstlast.endFrame) {
            formData.append('end_frame', uploadedImages.firstlast.endFrame);
        }
    } else if (mode === 'reference') {
        for (let i = 1; i <= 4; i++) {
            const refImage = uploadedImages.reference[`ref${i}`];
            if (refImage) {
                formData.append('reference_frames', refImage);
                hasImages = true;
            }
        }
    }
    
    if (!hasImages) {
        showToast('请先选择图片', 'error');
        return;
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
        } else {
            showToast(`上传失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('上传失败，请重试', 'error');
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
    
    try {
        const endpoint = mode === 'firstlast' ? '/generate_firstlast' : '/generate_reference';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentTaskId = result.task_id;
            showToast('视频生成任务已启动', 'success');
            
            // 显示进度条并开始轮询
            showProgress(mode);
            startProgressPolling(mode);
        } else {
            showToast(`生成失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Generation error:', error);
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
    
    if (!modelName || !prompt || !duration || !fps) {
        return null;
    }
    
    return {
        model_name: modelName,
        seed: seed,
        temperature: temperature,
        prompt: prompt,
        ratio: ratio,
        duration: duration,
        fps: fps
    };
}

// 显示进度条
function showProgress(mode) {
    const progressSection = document.getElementById(`${mode}ProgressSection`);
    const resultSection = document.getElementById(`${mode}ResultSection`);
    
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
            const response = await fetch(`/task_status/${currentTaskId}`);
            const result = await response.json();
            
            updateProgress(mode, result.progress, result.status);
            
            if (result.status === 'completed') {
                clearInterval(progressInterval);
                showResult(mode, result.video_url);
            } else if (result.status === 'failed') {
                clearInterval(progressInterval);
                showToast(`生成失败: ${result.error}`, 'error');
                hideProgress(mode);
            }
        } catch (error) {
            console.error('Progress polling error:', error);
        }
    }, 2000);
}

// 更新进度
function updateProgress(mode, progress, status) {
    const progressFill = document.getElementById(`${mode}ProgressFill`);
    const progressText = document.getElementById(`${mode}ProgressText`);
    
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
    const progressSection = document.getElementById(`${mode}ProgressSection`);
    if (progressSection) {
        progressSection.style.display = 'none';
    }
}

// 显示结果
function showResult(mode, videoUrl) {
    hideProgress(mode);
    
    const resultSection = document.getElementById(`${mode}ResultSection`);
    const resultVideo = document.getElementById(`${mode}ResultVideo`);
    const downloadLink = document.getElementById(`${mode}DownloadLink`);
    
    if (resultSection) {
        resultSection.style.display = 'block';
    }
    
    if (resultVideo && videoUrl) {
        resultVideo.src = videoUrl;
        resultVideo.style.display = 'block';
    }
    
    if (downloadLink && videoUrl) {
        downloadLink.href = videoUrl;
        downloadLink.style.display = 'inline-flex';
    }
    
    showToast('视频生成完成！', 'success');
}

// 更新按钮状态
function updateButtonStates(mode) {
    if (mode === 'firstlast') {
        const hasStartFrame = uploadedImages.firstlast.startFrame !== null;
        const uploadBtn = document.getElementById('uploadFirstLastImages');
        const generateBtn = document.getElementById('generateFirstLastVideo');
        
        if (uploadBtn) {
            uploadBtn.disabled = !hasStartFrame;
        }
        if (generateBtn) {
            generateBtn.disabled = !hasStartFrame;
        }
    } else if (mode === 'reference') {
        const hasAnyRef = Object.values(uploadedImages.reference).some(img => img !== null);
        const uploadBtn = document.getElementById('uploadReferenceImages');
        const generateBtn = document.getElementById('generateReferenceVideo');
        
        if (uploadBtn) {
            uploadBtn.disabled = !hasAnyRef;
        }
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

// 全局函数（供HTML调用）
window.showModeSelection = showModeSelection;
window.showGenerationPage = showGenerationPage;