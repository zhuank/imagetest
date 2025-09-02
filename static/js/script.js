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

// 已上传文件的服务端信息与可用直链
window.uploadedImageUrls = [];
window.uploadedFileInfo = [];

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

    // 清理已上传缓存并禁用生成按钮
    window.uploadedImageUrls = [];
    window.uploadedFileInfo = [];
    generateVideoBtn.disabled = true;
    
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

    // 只要选择了图片或已有已上传直链，就允许生成
    const hasUploaded = window.uploadedImageUrls && window.uploadedImageUrls.length > 0;
    generateVideoBtn.disabled = !(hasAnyImages || hasUploaded);
    
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
            // 缓存服务端返回的直链和文件信息，并启用“生成视频”按钮
            window.uploadedImageUrls = result.image_urls;
            window.uploadedFileInfo = result.files || [];
            generateVideoBtn.disabled = false;
            showToast(`上传成功，共${result.count || result.image_urls.length}张`, 'success');
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

    // 若尚未完成服务端上传，则先自动上传
    if (!window.uploadedImageUrls || window.uploadedImageUrls.length === 0) {
        try {
            progressSection.style.display = 'block';
            resultSection.style.display = 'none';
            updateProgress(5, '正在上传图片...');
            await uploadImages();
        } catch (e) {
            showToast('上传失败，请重试', 'error');
            return;
        }
    }

    // 获取表单数据并组织请求体
    const payload = {
        // 不再从前端收集 api_key，改由后端环境变量提供
        model_name: document.getElementById('modelName').value.trim(),
        image_urls: window.uploadedImageUrls,
        prompt: document.getElementById('prompt').value.trim(),
        ratio: document.getElementById('ratio').value,
        duration: parseInt(document.getElementById('duration').value),
        fps: parseInt(document.getElementById('fps').value),
        watermark: document.getElementById('watermark').value === 'true'
    };

    // 验证必填字段（只校验模型ID）
    if (!payload.model_name) {
        showToast('请填写模型ID', 'error');
        return;
    }

    try {
        updateProgress(15, '正在创建任务...');
        const response = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || '创建任务失败');
        }

        currentTaskId = result.task_id;
        updateProgress(30, '任务已创建，开始处理...');
        startStatusCheck();
    } catch (error) {
        console.error('生成任务失败:', error);
        showToast(`生成任务失败：${error.message}`, 'error');
        progressSection.style.display = 'none';
    }
}

// 定时轮询任务状态
async function checkStatusOnce() {
    if (!currentTaskId) return;
    try {
        const response = await fetch(`/status/${currentTaskId}`); // 不再携带 api_key 查询参数
        const data = await response.json();

        if (response.ok) {
            const status = data.status;
            if (status === 'succeeded' && data.video_url) {
                updateProgress(100, '生成完成！');
                showResult(data.video_url);
                stopStatusCheck();
            } else if (status === 'failed') {
                stopStatusCheck();
                showToast('任务失败，请重试', 'error');
                progressSection.style.display = 'none';
            } else {
                // 处理中
                updateProgress(Math.min(getCurrentProgress() + 5, 95), '任务进行中...');
            }
        } else {
            throw new Error(data.error || '查询状态失败');
        }
    } catch (error) {
        console.error('状态查询失败:', error);
        showToast(`状态查询失败：${error.message}`, 'error');
    }
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