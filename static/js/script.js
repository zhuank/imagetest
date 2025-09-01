// 全局变量
let startFrameFile = null;
let endFrameFile = null;
let referenceFrameFiles = [];
let currentTaskId = null;
let statusCheckInterval = null;

// DOM 元素
const startFrameUploadArea = document.getElementById('startFrameUploadArea');
const startFrameInput = document.getElementById('startFrameInput');
const startFramePreview = document.getElementById('startFramePreview');

const endFrameUploadArea = document.getElementById('endFrameUploadArea');
const endFrameInput = document.getElementById('endFrameInput');
const endFramePreview = document.getElementById('endFramePreview');

const referenceFramesUploadArea = document.getElementById('referenceFramesUploadArea');
const referenceFramesInput = document.getElementById('referenceFramesInput');
const referenceFramesPreview = document.getElementById('referenceFramesPreview');

const clearImagesBtn = document.getElementById('clearImages');
const uploadImagesBtn = document.getElementById('uploadImages');
const generateVideoBtn = document.getElementById('generateVideo');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultSection = document.getElementById('resultSection');
const resultVideo = document.getElementById('resultVideo');
const downloadLink = document.getElementById('downloadLink');
const toast = document.getElementById('toast');

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
});

// 初始化事件监听器
function initializeEventListeners() {
    // 首帧上传区域事件
    startFrameUploadArea.addEventListener('click', () => {
        startFrameInput.click();
    });
    startFrameInput.addEventListener('change', (e) => handleSingleFileSelect(e, 'start'));
    setupDragAndDrop(startFrameUploadArea, 'start');

    // 尾帧上传区域事件
    endFrameUploadArea.addEventListener('click', () => {
        endFrameInput.click();
    });
    endFrameInput.addEventListener('change', (e) => handleSingleFileSelect(e, 'end'));
    setupDragAndDrop(endFrameUploadArea, 'end');

    // 参考帧上传区域事件
    referenceFramesUploadArea.addEventListener('click', () => {
        referenceFramesInput.click();
    });
    referenceFramesInput.addEventListener('change', (e) => handleMultipleFileSelect(e));
    setupDragAndDrop(referenceFramesUploadArea, 'reference');

    // 按钮事件
    clearImagesBtn.addEventListener('click', clearAllImages);
    uploadImagesBtn.addEventListener('click', uploadImages);
    generateVideoBtn.addEventListener('click', generateVideo);

    // 阻止默认拖拽行为
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => e.preventDefault());
}

// 设置拖拽功能
function setupDragAndDrop(uploadArea, type) {
    uploadArea.addEventListener('dragover', (e) => handleDragOver(e, uploadArea));
    uploadArea.addEventListener('dragleave', (e) => handleDragLeave(e, uploadArea));
    uploadArea.addEventListener('drop', (e) => handleDrop(e, uploadArea, type));
}

// 处理单个文件选择（首帧/尾帧）
function handleSingleFileSelect(event, type) {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
        const file = files[0];
        const validation = isValidImageFile(file);
        if (validation.valid) {
            if (type === 'start') {
                startFrameFile = file;
                createSingleImagePreview(file, startFramePreview, type);
            } else if (type === 'end') {
                endFrameFile = file;
                createSingleImagePreview(file, endFramePreview, type);
            }
            updateButtonStates();
        } else {
            showToast(validation.error, 'error');
        }
    }
    event.target.value = ''; // 清空input
}

// 处理多个文件选择（参考帧）
function handleMultipleFileSelect(event) {
    const files = Array.from(event.target.files);
    addReferenceFrames(files);
    event.target.value = ''; // 清空input
}

// 处理拖拽悬停
function handleDragOver(event, uploadArea) {
    event.preventDefault();
    uploadArea.classList.add('dragover');
}

// 处理拖拽离开
function handleDragLeave(event, uploadArea) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
}

// 处理文件拖拽放置
function handleDrop(event, uploadArea, type) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = Array.from(event.dataTransfer.files);
    
    if (type === 'start' || type === 'end') {
        if (files.length > 0) {
            const file = files[0];
            const validation = isValidImageFile(file);
            if (validation.valid) {
                if (type === 'start') {
                    startFrameFile = file;
                    createSingleImagePreview(file, startFramePreview, type);
                } else if (type === 'end') {
                    endFrameFile = file;
                    createSingleImagePreview(file, endFramePreview, type);
                }
                updateButtonStates();
            } else {
                showToast(validation.error, 'error');
            }
        }
    } else if (type === 'reference') {
        addReferenceFrames(files);
    }
}

// 添加参考帧文件
function addReferenceFrames(files) {
    const validFiles = files.filter(file => {
        const validation = isValidImageFile(file);
        if (!validation.valid) {
            showToast(`${file.name}: ${validation.error}`, 'error');
            return false;
        }
        return true;
    });

    if (validFiles.length === 0) {
        showToast('请选择有效的图片文件', 'error');
        return;
    }

    validFiles.forEach(file => {
        if (!referenceFrameFiles.find(f => f.name === file.name && f.size === file.size)) {
            referenceFrameFiles.push(file);
            createReferenceImagePreview(file);
        }
    });

    updateButtonStates();
}

// 创建单个图片预览（首帧/尾帧）
function createSingleImagePreview(file, previewContainer, type) {
    const reader = new FileReader();
    reader.onload = function(e) {
        previewContainer.innerHTML = `
            <div class="image-item fade-in">
                <img src="${e.target.result}" alt="${file.name}">
                <button class="remove-btn" onclick="removeSingleImage('${type}')">&times;</button>
                <div class="image-name">${file.name}</div>
            </div>
        `;
    };
    reader.readAsDataURL(file);
}

// 创建参考帧图片预览
function createReferenceImagePreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const imageItem = document.createElement('div');
        imageItem.className = 'image-item fade-in';
        imageItem.innerHTML = `
            <img src="${e.target.result}" alt="${file.name}">
            <button class="remove-btn" onclick="removeReferenceImage('${file.name}', ${file.size})">&times;</button>
            <div class="image-name">${file.name}</div>
        `;
        referenceFramesPreview.appendChild(imageItem);
    };
    reader.readAsDataURL(file);
}

// 移除单个图片（首帧/尾帧）
function removeSingleImage(type) {
    if (type === 'start') {
        startFrameFile = null;
        startFramePreview.innerHTML = '';
    } else if (type === 'end') {
        endFrameFile = null;
        endFramePreview.innerHTML = '';
    }
    updateButtonStates();
}

// 移除参考帧图片
function removeReferenceImage(fileName, fileSize) {
    referenceFrameFiles = referenceFrameFiles.filter(file => !(file.name === fileName && file.size === fileSize));
    
    // 移除预览元素
    const imageItems = referenceFramesPreview.querySelectorAll('.image-item');
    imageItems.forEach(item => {
        const name = item.querySelector('.image-name').textContent;
        if (name === fileName) {
            item.remove();
        }
    });
    
    updateButtonStates();
}

// 清空所有图片
function clearAllImages() {
    startFrameFile = null;
    endFrameFile = null;
    referenceFrameFiles = [];
    
    startFramePreview.innerHTML = '';
    endFramePreview.innerHTML = '';
    referenceFramesPreview.innerHTML = '';
    
    updateButtonStates();
    showToast('已清空所有图片', 'info');
}

// 文件验证函数
function isValidImageFile(file) {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (!validTypes.includes(file.type)) {
        return { valid: false, error: '不支持的文件格式' };
    }
    
    if (file.size > maxSize) {
        return { valid: false, error: '文件大小超过10MB限制' };
    }
    
    return { valid: true };
}

// 更新按钮状态
function updateButtonStates() {
    const hasStartFrame = startFrameFile !== null;
    const hasEndFrame = endFrameFile !== null;
    const hasReferenceFrames = referenceFrameFiles.length > 0;
    const hasAnyImages = hasStartFrame || hasEndFrame || hasReferenceFrames;
    
    clearImagesBtn.disabled = !hasAnyImages;
    uploadImagesBtn.disabled = !hasAnyImages;
    
    // 更新各个上传区域的显示状态
    updateUploadAreaDisplay('start', hasStartFrame);
    updateUploadAreaDisplay('end', hasEndFrame);
    updateUploadAreaDisplay('reference', hasReferenceFrames);
}

// 更新上传区域显示状态
function updateUploadAreaDisplay(type, hasFiles) {
    let uploadArea, preview;
    
    switch(type) {
        case 'start':
            uploadArea = startFrameUploadArea;
            preview = startFramePreview;
            break;
        case 'end':
            uploadArea = endFrameUploadArea;
            preview = endFramePreview;
            break;
        case 'reference':
            uploadArea = referenceFramesUploadArea;
            preview = referenceFramesPreview;
            break;
    }
    
    if (hasFiles) {
        uploadArea.classList.add('has-files');
        preview.style.display = type === 'reference' ? 'grid' : 'block';
    } else {
        uploadArea.classList.remove('has-files');
        preview.style.display = 'none';
    }
}

// 上传图片到服务器
async function uploadImages() {
    const formData = new FormData();
    let hasFiles = false;
    
    // 添加首帧
    if (startFrameFile) {
        formData.append('start_frame', startFrameFile);
        hasFiles = true;
    }
    
    // 添加尾帧
    if (endFrameFile) {
        formData.append('end_frame', endFrameFile);
        hasFiles = true;
    }
    
    // 添加参考帧
    if (referenceFrameFiles.length > 0) {
        referenceFrameFiles.forEach((file, index) => {
            formData.append('reference_frames', file);
        });
        hasFiles = true;
    }
    
    if (!hasFiles) {
        throw new Error('没有图片需要上传');
    }

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || '上传失败');
        }

        if (result.success && result.image_urls) {
            return result.image_urls;
        } else {
            throw new Error('上传响应格式错误');
        }
        
    } catch (error) {
        console.error('上传图片时出错:', error);
        throw error;
    }
}

// 生成视频
async function generateVideo() {
    // 检查是否有任何图片
    const hasAnyImages = startFrameFile || endFrameFile || referenceFrameFiles.length > 0;
    if (!hasAnyImages) {
        showToast('请至少上传一张图片', 'error');
        return;
    }

    // 获取表单数据
    const formData = {
        api_key: document.getElementById('apiKey').value.trim(),
        model_name: document.getElementById('modelName').value.trim(),
        files: window.uploadedFileInfo,
        prompt: document.getElementById('prompt').value.trim(),
        ratio: document.getElementById('ratio').value,
        duration: parseInt(document.getElementById('duration').value),
        fps: parseInt(document.getElementById('fps').value),
        watermark: document.getElementById('watermark').value === 'true'
    };

    // 验证必填字段
    if (!formData.api_key || !formData.model_name) {
        showToast('请填写API Key和模型名称', 'error');
        return;
    }

    try {
        generateVideoBtn.disabled = true;
        generateVideoBtn.textContent = '生成中...';
        
        // 显示进度区域
        progressSection.style.display = 'block';
        resultSection.style.display = 'none';
        updateProgress(0, '正在创建视频生成任务...');

        const response = await fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
            currentTaskId = result.task_id;
            showToast('视频生成任务已创建', 'success');
            updateProgress(20, '任务已创建，开始生成视频...');
            
            // 开始轮询任务状态
            startStatusPolling();
        } else {
            throw new Error(result.error || '任务创建失败');
        }
    } catch (error) {
        console.error('Generate error:', error);
        showToast('生成失败: ' + error.message, 'error');
        resetGenerationState();
    }
}

// 开始状态轮询
function startStatusPolling() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }

    let pollCount = 0;
    const maxPolls = 60; // 最多轮询5分钟 (60 * 5秒)
    
    statusCheckInterval = setInterval(async () => {
        pollCount++;
        
        try {
            const response = await fetch(`/status/${currentTaskId}?api_key=${encodeURIComponent(document.getElementById('apiKey').value)}`);
            const result = await response.json();

            if (result.status === 'completed') {
                clearInterval(statusCheckInterval);
                updateProgress(100, '视频生成完成！');
                showVideoResult(result.video_url);
                showToast('视频生成成功！', 'success');
                resetGenerationState();
            } else if (result.error) {
                clearInterval(statusCheckInterval);
                showToast('生成失败: ' + result.error, 'error');
                resetGenerationState();
            } else {
                // 更新进度
                const progress = Math.min(20 + (pollCount / maxPolls) * 60, 80);
                updateProgress(progress, result.message || '正在生成视频...');
            }
        } catch (error) {
            console.error('Status check error:', error);
            if (pollCount >= maxPolls) {
                clearInterval(statusCheckInterval);
                showToast('任务超时，请重试', 'error');
                resetGenerationState();
            }
        }
        
        if (pollCount >= maxPolls) {
            clearInterval(statusCheckInterval);
            showToast('任务超时，请重试', 'error');
            resetGenerationState();
        }
    }, 5000); // 每5秒检查一次
}

// 更新进度
function updateProgress(percentage, message) {
    progressFill.style.width = percentage + '%';
    progressText.textContent = message;
}

// 显示视频结果
function showVideoResult(videoUrl) {
    resultSection.style.display = 'block';
    resultVideo.src = videoUrl;
    resultVideo.style.display = 'block';
    downloadLink.href = videoUrl;
    downloadLink.style.display = 'inline-block';
    
    // 滚动到结果区域
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

// 重置生成状态
function resetGenerationState() {
    generateVideoBtn.disabled = false;
    generateVideoBtn.textContent = '开始生成视频';
    currentTaskId = null;
    
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
    }
}

// 显示Toast通知
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 工具函数：格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 工具函数：验证图片文件
function isValidImageFile(file) {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp'];
    const maxSize = 16 * 1024 * 1024; // 16MB
    
    if (!validTypes.includes(file.type)) {
        return { valid: false, error: '不支持的文件格式' };
    }
    
    if (file.size > maxSize) {
        return { valid: false, error: '文件大小超过16MB限制' };
    }
    
    return { valid: true };
}

// 错误处理
window.addEventListener('error', function(event) {
    console.error('JavaScript error:', event.error);
    showToast('发生未知错误，请刷新页面重试', 'error');
});

// 页面卸载时清理
window.addEventListener('beforeunload', function() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
});