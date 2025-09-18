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
    videoNodes.push({
        id: nodeId,
        element: nodeElement,
        videoId: null
    });
    
    // 设置节点事件
    setupNodeEvents(nodeId, nodeElement);
    
    // 填充视频选择列表
    populateVideoSelect(nodeId);
    
    // 更新合并按钮状态
    updateMergeButtonState();
}

// 设置节点事件
function setupNodeEvents(nodeId, nodeElement) {
    // 视频选择事件
    const videoSelect = nodeElement.querySelector(`#videoSelect_${nodeId}`);
    videoSelect.addEventListener('change', function() {
        const selectedVideo = this.value;
        const nodeIndex = videoNodes.findIndex(node => node.id === nodeId);
        
        if (nodeIndex !== -1) {
            videoNodes[nodeIndex].videoId = selectedVideo;
            
            // 更新视频预览
            updateVideoPreview(nodeId, selectedVideo);
            
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

// 填充视频选择列表
function populateVideoSelect(nodeId) {
    if (!window.availableVideos) return;
    
    const videoSelect = document.querySelector(`#videoSelect_${nodeId}`);
    if (!videoSelect) return;
    
    // 保留第一个选项（请选择视频）
    videoSelect.innerHTML = '<option value="">-- 请选择视频 --</option>';
    
    // 添加可用视频
    window.availableVideos.forEach(video => {
        const option = document.createElement('option');
        option.value = video.id;
        option.textContent = video.name;
        videoSelect.appendChild(option);
    });
}

// 更新所有视频选择列表
function updateAllVideoSelects() {
    videoNodes.forEach(node => {
        populateVideoSelect(node.id);
    });
}

// 更新视频预览
function updateVideoPreview(nodeId, videoId) {
    if (!window.availableVideos) return;
    
    const video = window.availableVideos.find(v => v.id === videoId);
    if (!video) return;
    
    const nodeElement = document.querySelector(`.video-node[data-node-id="${nodeId}"]`);
    if (!nodeElement) return;
    
    const videoPlayer = nodeElement.querySelector('.node-video-player');
    if (videoPlayer) {
        videoPlayer.src = video.url;
        videoPlayer.style.display = 'block';
    }
}

// 移动节点
function moveNode(nodeId, direction) {
    const nodeIndex = videoNodes.findIndex(node => node.id === nodeId);
    if (nodeIndex === -1) return;
    
    let swapIndex;
    if (direction === 'up') {
        if (nodeIndex === 0) return; // 已经是第一个
        swapIndex = nodeIndex - 1;
    } else {
        if (nodeIndex === videoNodes.length - 1) return; // 已经是最后一个
        swapIndex = nodeIndex + 1;
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
    
    // 检查是否有至少两个节点且都选择了视频
    const validNodes = videoNodes.filter(node => node.videoId);
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
    const videoIds = videoNodes
        .filter(node => node.videoId)
        .map(node => node.videoId);
    
    const formData = new FormData(document.getElementById('mergeConfigForm'));
    const outputName = formData.get('outputName') || 'merged_video';
    const outputFormat = formData.get('outputFormat') || 'mp4';
    const apiKey = formData.get('apiKey') || '';
    
    try {
        // 发送合并请求
        const response = await fetch('/merge_videos_task', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                video_ids: videoIds,
                output_name: outputName,
                output_format: outputFormat,
                api_key: apiKey
            })
        });
        
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
        
        if (result.status === 'completed') {
            // 更新状态
            updateMergeStepStatus('merge-process-status', '完成');
            updateMergeStepStatus('merge-complete-status', '完成');
            
            // 显示结果
            showMergeResult(result.video_url, result.download_url);
        } else if (result.status === 'failed') {
            updateMergeStepStatus('merge-process-status', '失败');
            showToast('视频合并失败: ' + result.error, 'error');
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