// 选项卡切换功能
function showTab(tabName) {
    // 隐藏所有选项卡内容
    document.getElementById('firstlast-tab').style.display = 'none';
    document.getElementById('reference-tab').style.display = 'none';
    document.getElementById('firstlast-upload').style.display = 'none';
    document.getElementById('reference-upload').style.display = 'none';
    document.getElementById('firstlast-generation').style.display = 'none';
    document.getElementById('reference-generation').style.display = 'none';
    
    // 移除所有选项卡的激活状态
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 显示选中的选项卡内容
    if (tabName === 'firstlast') {
        document.getElementById('firstlast-tab').style.display = 'block';
        document.getElementById('firstlast-upload').style.display = 'block';
        document.getElementById('firstlast-generation').style.display = 'block';
        document.querySelector('[onclick="showTab(\'firstlast\')"]').classList.add('active');
    } else if (tabName === 'reference') {
        document.getElementById('reference-tab').style.display = 'block';
        document.getElementById('reference-upload').style.display = 'block';
        document.getElementById('reference-generation').style.display = 'block';
        document.querySelector('[onclick="showTab(\'reference\')"]').classList.add('active');
    }
}

// 页面加载时默认显示首尾帧选项卡
document.addEventListener('DOMContentLoaded', function() {
    showTab('firstlast');
});

// 图片上传相关变量
let firstFrameFile = null;
let lastFrameFile = null;
let referenceFiles = [];

// 首尾帧模式的图片上传处理
function setupFirstLastUpload() {
    const firstFrameArea = document.getElementById('startFrameUploadArea');
    const lastFrameArea = document.getElementById('endFrameUploadArea');
    const firstFrameInput = document.getElementById('startFrameInput');
    const lastFrameInput = document.getElementById('endFrameInput');
    
    // 首帧上传
    firstFrameArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        firstFrameArea.classList.add('dragover');
    });
    
    firstFrameArea.addEventListener('dragleave', () => {
        firstFrameArea.classList.remove('dragover');
    });
    
    firstFrameArea.addEventListener('drop', (e) => {
        e.preventDefault();
        firstFrameArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFirstFrameUpload(files[0]);
        }
    });
    
    firstFrameArea.addEventListener('click', () => {
        firstFrameInput.click();
    });
    
    firstFrameInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFirstFrameUpload(e.target.files[0]);
        }
    });
    
    // 尾帧上传（类似逻辑）
    lastFrameArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        lastFrameArea.classList.add('dragover');
    });
    
    lastFrameArea.addEventListener('dragleave', () => {
        lastFrameArea.classList.remove('dragover');
    });
    
    lastFrameArea.addEventListener('drop', (e) => {
        e.preventDefault();
        lastFrameArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleLastFrameUpload(files[0]);
        }
    });
    
    lastFrameArea.addEventListener('click', () => {
        lastFrameInput.click();
    });
    
    lastFrameInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleLastFrameUpload(e.target.files[0]);
        }
    });
}

// 参考图模式的图片上传处理
function setupReferenceUpload() {
    const referenceArea = document.getElementById('referenceFramesUploadArea');
    const referenceInput = document.getElementById('referenceFramesInput');
    
    referenceArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        referenceArea.classList.add('dragover');
    });
    
    referenceArea.addEventListener('dragleave', () => {
        referenceArea.classList.remove('dragover');
    });
    
    referenceArea.addEventListener('drop', (e) => {
        e.preventDefault();
        referenceArea.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        handleReferenceUpload(files);
    });
    
    referenceArea.addEventListener('click', () => {
        referenceInput.click();
    });
    
    referenceInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        handleReferenceUpload(files);
    });
}

// 处理首帧上传
function handleFirstFrameUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
    }
    
    firstFrameFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('startFramePreview');
        preview.innerHTML = `<img src="${e.target.result}" alt="首帧预览">`;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
    
    updateFirstLastUploadButton();
}

// 处理尾帧上传
function handleLastFrameUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
    }
    
    lastFrameFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('endFramePreview');
        preview.innerHTML = `<img src="${e.target.result}" alt="尾帧预览">`;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
    
    updateFirstLastUploadButton();
}

// 处理参考图上传
function handleReferenceUpload(files) {
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
        alert('请选择图片文件');
        return;
    }
    
    if (validFiles.length > 4) {
        alert('最多只能上传4张参考图');
        return;
    }
    
    referenceFiles = validFiles;
    const preview = document.getElementById('referenceFramesPreview');
    preview.innerHTML = '';
    
    validFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = `参考图${index + 1}`;
            preview.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
    
    preview.style.display = 'block';
    updateReferenceUploadButton();
}

// 更新首尾帧上传按钮状态
function updateFirstLastUploadButton() {
    const uploadBtn = document.getElementById('uploadFirstLastImages');
    const generateBtn = document.getElementById('generateFirstLastVideo');
    
    if (firstFrameFile) {
        uploadBtn.disabled = false;
        generateBtn.disabled = false;
    } else {
        uploadBtn.disabled = true;
        generateBtn.disabled = true;
    }
}

// 更新参考图上传按钮状态
function updateReferenceUploadButton() {
    const uploadBtn = document.getElementById('uploadReferenceImages');
    const generateBtn = document.getElementById('generateReferenceVideo');
    
    if (referenceFiles.length > 0) {
        uploadBtn.disabled = false;
        generateBtn.disabled = false;
    } else {
        uploadBtn.disabled = true;
        generateBtn.disabled = true;
    }
}

// 清空首尾帧图片
function clearFirstLastImages() {
    firstFrameFile = null;
    lastFrameFile = null;
    document.getElementById('startFramePreview').style.display = 'none';
    document.getElementById('endFramePreview').style.display = 'none';
    document.getElementById('startFrameInput').value = '';
    document.getElementById('endFrameInput').value = '';
    updateFirstLastUploadButton();
}

// 清空参考图
function clearReferenceImages() {
    referenceFiles = [];
    document.getElementById('referenceFramesPreview').style.display = 'none';
    document.getElementById('referenceFramesInput').value = '';
    updateReferenceUploadButton();
}

// 上传首尾帧图片到服务器
async function uploadFirstLastImages() {
    if (!firstFrameFile) {
        alert('请先选择首帧图片');
        return;
    }
    
    const formData = new FormData();
    formData.append('first_frame', firstFrameFile);
    if (lastFrameFile) {
        formData.append('last_frame', lastFrameFile);
    }
    
    try {
        const response = await fetch('/upload_firstlast', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (result.success) {
            alert('图片上传成功！');
        } else {
            alert('上传失败：' + result.error);
        }
    } catch (error) {
        alert('上传失败：' + error.message);
    }
}

// 上传参考图到服务器
async function uploadReferenceImages() {
    if (referenceFiles.length === 0) {
        alert('请先选择参考图片');
        return;
    }
    
    const formData = new FormData();
    referenceFiles.forEach((file, index) => {
        formData.append('reference_images', file);
    });
    
    try {
        const response = await fetch('/upload_reference', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (result.success) {
            alert('参考图上传成功！');
        } else {
            alert('上传失败：' + result.error);
        }
    } catch (error) {
        alert('上传失败：' + error.message);
    }
}

// 生成首尾帧视频
async function generateFirstLastVideo() {
    const formData = new FormData();
    
    // 获取表单数据
    formData.append('model_name', document.getElementById('firstLastModelName').value);
    formData.append('prompt', document.getElementById('firstLastPrompt').value);
    formData.append('ratio', document.getElementById('firstLastRatio').value);
    formData.append('duration', document.getElementById('firstLastDuration').value);
    formData.append('fps', document.getElementById('firstLastFps').value);
    formData.append('watermark', document.getElementById('firstLastWatermark').checked);
    
    // 添加随机种子和温度参数（如果启用）
    if (document.getElementById('firstLastEnableParams').checked) {
        formData.append('seed', document.getElementById('firstLastSeed').value);
        formData.append('temperature', document.getElementById('firstLastTemperature').value);
    }
    
    // 添加图片文件
    if (firstFrameFile) {
        formData.append('first_frame', firstFrameFile);
    }
    if (lastFrameFile) {
        formData.append('last_frame', lastFrameFile);
    }
    
    try {
        // 显示进度条
        document.getElementById('firstLastProgressSection').style.display = 'block';
        document.getElementById('firstLastProgressText').textContent = '开始生成视频...';
        
        const response = await fetch('/generate_firstlast', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 轮询任务状态
            pollFirstLastTaskStatus(result.task_id);
        } else {
            document.getElementById('firstLastProgressSection').style.display = 'none';
            alert('生成失败：' + result.error);
        }
    } catch (error) {
        document.getElementById('firstLastProgressSection').style.display = 'none';
        alert('生成失败：' + error.message);
    }
}

// 生成参考图视频
async function generateReferenceVideo() {
    const formData = new FormData();
    
    // 获取表单数据
    formData.append('model_name', document.getElementById('referenceModelName').value);
    formData.append('prompt', document.getElementById('referencePrompt').value);
    formData.append('ratio', document.getElementById('referenceRatio').value);
    formData.append('duration', document.getElementById('referenceDuration').value);
    formData.append('fps', document.getElementById('referenceFps').value);
    formData.append('watermark', document.getElementById('referenceWatermark').checked);
    
    // 添加随机种子和温度参数（如果启用）
    if (document.getElementById('referenceEnableParams').checked) {
        formData.append('seed', document.getElementById('referenceSeed').value);
        formData.append('temperature', document.getElementById('referenceTemperature').value);
    }
    
    // 添加参考图文件
    referenceFiles.forEach((file, index) => {
        formData.append('reference_images', file);
    });
    
    try {
        // 显示进度条
        document.getElementById('referenceProgressSection').style.display = 'block';
        document.getElementById('referenceProgressText').textContent = '开始生成视频...';
        
        const response = await fetch('/generate_reference', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 轮询任务状态
            pollReferenceTaskStatus(result.task_id);
        } else {
            document.getElementById('referenceProgressSection').style.display = 'none';
            alert('生成失败：' + result.error);
        }
    } catch (error) {
        document.getElementById('referenceProgressSection').style.display = 'none';
        alert('生成失败：' + error.message);
    }
}

// 轮询首尾帧任务状态
async function pollFirstLastTaskStatus(taskId) {
    try {
        const response = await fetch(`/status/${taskId}`);
        const result = await response.json();
        
        document.getElementById('firstLastProgressText').textContent = `任务状态: ${result.status}`;
        
        if (result.status === 'completed') {
            document.getElementById('firstLastProgressSection').style.display = 'none';
            document.getElementById('firstLastResultSection').style.display = 'block';
            
            const video = document.getElementById('firstLastResultVideo');
            const downloadLink = document.getElementById('firstLastDownloadLink');
            
            video.src = result.video_url;
            video.style.display = 'block';
            downloadLink.href = result.video_url;
            downloadLink.style.display = 'inline-block';
        } else if (result.status === 'failed') {
            document.getElementById('firstLastProgressSection').style.display = 'none';
            alert('视频生成失败：' + result.error);
        } else {
            // 继续轮询
            setTimeout(() => pollFirstLastTaskStatus(taskId), 2000);
        }
    } catch (error) {
        document.getElementById('firstLastProgressSection').style.display = 'none';
        alert('查询状态失败：' + error.message);
    }
}

// 轮询参考图任务状态
async function pollReferenceTaskStatus(taskId) {
    try {
        const response = await fetch(`/status/${taskId}`);
        const result = await response.json();
        
        document.getElementById('referenceProgressText').textContent = `任务状态: ${result.status}`;
        
        if (result.status === 'completed') {
            document.getElementById('referenceProgressSection').style.display = 'none';
            document.getElementById('referenceResultSection').style.display = 'block';
            
            const video = document.getElementById('referenceResultVideo');
            const downloadLink = document.getElementById('referenceDownloadLink');
            
            video.src = result.video_url;
            video.style.display = 'block';
            downloadLink.href = result.video_url;
            downloadLink.style.display = 'inline-block';
        } else if (result.status === 'failed') {
            document.getElementById('referenceProgressSection').style.display = 'none';
            alert('视频生成失败：' + result.error);
        } else {
            // 继续轮询
            setTimeout(() => pollReferenceTaskStatus(taskId), 2000);
        }
    } catch (error) {
        document.getElementById('referenceProgressSection').style.display = 'none';
        alert('查询状态失败：' + error.message);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    setupFirstLastUpload();
    setupReferenceUpload();
    
    // 绑定按钮事件
    document.getElementById('clearFirstLastImages').addEventListener('click', clearFirstLastImages);
    document.getElementById('uploadFirstLastImages').addEventListener('click', uploadFirstLastImages);
    document.getElementById('generateFirstLastVideo').addEventListener('click', generateFirstLastVideo);
    
    document.getElementById('clearReferenceImages').addEventListener('click', clearReferenceImages);
    document.getElementById('uploadReferenceImages').addEventListener('click', uploadReferenceImages);
    document.getElementById('generateReferenceVideo').addEventListener('click', generateReferenceVideo);
});