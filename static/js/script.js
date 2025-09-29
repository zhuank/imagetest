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

// 添加视频节点
function addVideoNode() {
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
        type: 'video', // 默认为视频类型
        url: null
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
    
    return nodeInfo;
}

function addVideoNode(nodeId) {
    const nodeElement = createNodeElement(nodeId);
    
    // 添加到节点列表
    videoNodes.push({
        id: nodeId,
        element: nodeElement,
        file: null
    });
    
    // 设置节点事件
    setupNodeEvents(nodeId, nodeElement);
    
    // 更新合并按钮状态
    updateMergeButtonState();
}

// 绑定节点事件
function bindNodeEvents(nodeInfo) {
    const nodeId = nodeInfo.id;
    const nodeElement = nodeInfo.element;
    
    // 文件上传事件
    const fileUpload = nodeElement.querySelector(`#videoUpload_${nodeId}`);
    const fileNameSpan = nodeElement.querySelector(`#fileName_${nodeId}`);
    const uploadButton = nodeElement.querySelector('.btn-upload');
    const nodeTypeSelect = nodeElement.querySelector(`.node-type-select`);
    
    // 点击按钮触发文件选择
    uploadButton.addEventListener('click', function() {
        fileUpload.click();
    });
    
    // 节点类型变更事件
    if (nodeTypeSelect) {
        nodeTypeSelect.addEventListener('change', function() {
            const nodeType = this.value;
            nodeInfo.type = nodeType;
            
            // 更新节点显示
            updateNodeDisplay(nodeInfo);
            
            // 更新合并按钮状态
            updateMergeButtonState();
        });
    }
    
    // 文件选择变化事件
    fileUpload.addEventListener('change', function() {
        if (this.files.length > 0) {
            const file = this.files[0];
            fileNameSpan.textContent = file.name;
            nodeInfo.file = file;
            
            // 根据文件类型自动设置节点类型
            if (file.type.startsWith('audio/') && nodeTypeSelect) {
                nodeTypeSelect.value = 'audio';
                nodeInfo.type = 'audio';
            } else if (file.type.startsWith('video/') && nodeTypeSelect) {
                nodeTypeSelect.value = 'video';
                nodeInfo.type = 'video';
            }
            
            // 更新文件预览
            updateFilePreview(nodeInfo);
            
            // 更新合并按钮状态
            updateMergeButtonState();
        }
    });
    
    // 上移按钮
    nodeElement.querySelector('.btn-move-up').addEventListener('click', function() {
        moveNode(nodeId, 'up');
    });
    
    // 下移按钮
    nodeElement.querySelector('.btn-move-down').addEventListener('click', function() {
        moveNode(nodeId, 'down');
    });
    
    // 删除按钮
    nodeElement.querySelector('.btn-remove').addEventListener('click', function() {
        removeNode(nodeId);
    });
}

// 更新文件预览
function updateFilePreview(nodeInfo) {
    const nodeId = nodeInfo.id;
    const file = nodeInfo.file;
    const nodeElement = nodeInfo.element;
    
    if (!file) return;
    
    const videoPlayer = nodeElement.querySelector('.node-video-player');
    const audioPlayer = nodeElement.querySelector('.node-audio-player');
    
    // 创建一个临时URL用于预览
    const objectURL = URL.createObjectURL(file);
    
    // 根据文件类型显示不同的预览
    if (file.type.startsWith('audio/')) {
        // 音频文件
        if (audioPlayer) {
            audioPlayer.src = objectURL;
            audioPlayer.style.display = 'block';
            if (videoPlayer) videoPlayer.style.display = 'none';
        }
    } else {
        // 视频文件
        if (videoPlayer) {
            videoPlayer.src = objectURL;
            videoPlayer.style.display = 'block';
            if (audioPlayer) audioPlayer.style.display = 'none';
        }
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
    
    // 交换DOM元素
    const nodesList = document.getElementById('videoNodesList');
    const currentNode = videoNodes[nodeIndex].element;
    const swapNode = videoNodes[swapIndex].element;
    
    if (direction === 'up') {
        nodesList.insertBefore(currentNode, swapNode);
    } else {
        nodesList.insertBefore(swapNode, currentNode);
    }
    
    // 交换数组中的位置
    [videoNodes[nodeIndex], videoNodes[swapIndex]] = [videoNodes[swapIndex], videoNodes[nodeIndex]];
    
    // 更新节点标题
    updateNodeNumbers();
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
        }
        
        if (result.status === 'completed') {
            // 更新状态
            updateMergeStepStatus('merge-process-status', '完成');
            updateMergeStepStatus('merge-complete-status', '完成');
            
            // 显示结果
            showMergeResult(result.output_url || result.video_url, result.output_url || result.download_url);
        } else if (result.status === 'failed') {
            updateMergeStepStatus('merge-process-status', '失败');
            showToast('视频合并失败: ' + (result.error || '未知错误'), 'error');
        } else {
            // 继续轮询
            setTimeout(() => pollMergeStatus(taskId), 2000);
        }
    } catch (error) {
        console.error('Error polling merge status:', error);
        updateMergeStepStatus('merge-process-status', '失败');
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

// 初始化应用
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
});