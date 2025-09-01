import os
import tempfile
import requests
import time
import json
from flask import Flask, render_template, request, jsonify, send_file, url_for
from werkzeug.utils import secure_filename
import uuid
from urllib.parse import urlparse

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['OUTPUT_FOLDER'] = 'outputs'

# 确保上传和输出文件夹存在
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

# 允许的文件扩展名
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def upload_to_transfer_sh(file_path):
    """上传文件到transfer.sh获取直接链接"""
    try:
        with open(file_path, 'rb') as f:
            response = requests.post(
                'https://transfer.sh/',
                files={'file': f},
                timeout=30
            )
        if response.status_code == 200:
            return response.text.strip()
    except Exception as e:
        print(f"Transfer.sh upload failed: {e}")
    return None

def upload_to_catbox(file_path):
    """上传文件到catbox.moe获取直接链接"""
    try:
        with open(file_path, 'rb') as f:
            response = requests.post(
                'https://catbox.moe/user/api.php',
                data={'reqtype': 'fileupload'},
                files={'fileToUpload': f},
                timeout=30
            )
        if response.status_code == 200:
            return response.text.strip()
    except Exception as e:
        print(f"Catbox upload failed: {e}")
    return None

def rehost_image(file_path):
    """将本地图片重新托管到公共服务获取直接链接"""
    # 尝试transfer.sh
    url = upload_to_transfer_sh(file_path)
    if url:
        return url
    
    # 尝试catbox.moe
    url = upload_to_catbox(file_path)
    if url:
        return url
    
    return None

def create_video_task(api_key, model_name, image_urls, **kwargs):
    """创建视频生成任务"""
    url = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
    
    # 构建请求数据
    req_data = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": kwargs.get('prompt', 'Generate a video based on the provided images')
                    }
                ]
            }
        ],
        "extra_body": {
            "req_type": "video_generation",
            "image_urls": image_urls,
            "ratio": kwargs.get('ratio', '1092x1080'),
            "duration": kwargs.get('duration', 5),
            "fps": kwargs.get('fps', 24),
            "watermark": kwargs.get('watermark', False)
        }
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, json=req_data, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": str(e)}

def poll_task_status(api_key, task_id, max_wait_time=300):
    """轮询任务状态"""
    url = f"https://ark.cn-beijing.volces.com/api/v3/chat/completions/{task_id}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    start_time = time.time()
    while time.time() - start_time < max_wait_time:
        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            result = response.json()
            
            status = result.get('status', 'unknown')
            if status == 'completed':
                return result
            elif status == 'failed':
                return {"error": "Task failed", "details": result}
            
            time.sleep(5)  # 等待5秒后再次检查
        except Exception as e:
            return {"error": f"Polling error: {str(e)}"}
    
    return {"error": "Task timeout"}

def download_video(video_url, output_path):
    """下载生成的视频"""
    try:
        response = requests.get(video_url, timeout=60)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            f.write(response.content)
        
        return True
    except Exception as e:
        print(f"Video download failed: {e}")
        return False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_files():
    """处理文件上传 - 支持首帧、尾帧和参考帧"""
    uploaded_files = []
    image_urls = []
    
    # 处理首帧
    if 'start_frame' in request.files:
        start_file = request.files['start_frame']
        if start_file and start_file.filename and allowed_file(start_file.filename):
            filename = secure_filename(start_file.filename)
            filename = f"start_{uuid.uuid4().hex}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            start_file.save(file_path)
            
            # 重新托管图片获取直接链接
            rehosted_url = rehost_image(file_path)
            if rehosted_url:
                image_urls.append(rehosted_url)
                uploaded_files.append({
                    'type': 'start_frame',
                    'filename': filename,
                    'path': file_path,
                    'url': rehosted_url
                })
    
    # 处理尾帧
    if 'end_frame' in request.files:
        end_file = request.files['end_frame']
        if end_file and end_file.filename and allowed_file(end_file.filename):
            filename = secure_filename(end_file.filename)
            filename = f"end_{uuid.uuid4().hex}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            end_file.save(file_path)
            
            # 重新托管图片获取直接链接
            rehosted_url = rehost_image(file_path)
            if rehosted_url:
                image_urls.append(rehosted_url)
                uploaded_files.append({
                    'type': 'end_frame',
                    'filename': filename,
                    'path': file_path,
                    'url': rehosted_url
                })
    
    # 处理参考帧
    if 'reference_frames' in request.files:
        reference_files = request.files.getlist('reference_frames')
        for i, ref_file in enumerate(reference_files):
            if ref_file and ref_file.filename and allowed_file(ref_file.filename):
                filename = secure_filename(ref_file.filename)
                filename = f"ref_{i}_{uuid.uuid4().hex}_{filename}"
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                ref_file.save(file_path)
                
                # 重新托管图片获取直接链接
                rehosted_url = rehost_image(file_path)
                if rehosted_url:
                    image_urls.append(rehosted_url)
                    uploaded_files.append({
                        'type': 'reference_frame',
                        'filename': filename,
                        'path': file_path,
                        'url': rehosted_url
                    })
    
    if not uploaded_files:
        return jsonify({'error': 'No valid images uploaded'}), 400
    
    return jsonify({
        'success': True,
        'files': uploaded_files,
        'image_urls': image_urls,
        'count': len(uploaded_files)
    })

@app.route('/generate', methods=['POST'])
def generate_video():
    """生成视频"""
    data = request.get_json()
    
    # 验证必需参数
    required_fields = ['api_key', 'image_urls']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    api_key = data['api_key']
    image_urls = data['image_urls']
    
    if not image_urls or len(image_urls) == 0:
        return jsonify({'error': 'No image URLs provided'}), 400
    
    # 构建视频生成参数
    video_params = {
        'prompt': data.get('prompt', 'Generate a video based on the provided images'),
        'ratio': data.get('ratio', '1092x1080'),
        'duration': int(data.get('duration', 5)),
        'fps': int(data.get('fps', 24)),
        'watermark': data.get('watermark', False)
    }
    
    # 使用固定的模型名称
    model_name = "Seedance-I2V-Reference"
    
    # 创建视频生成任务
    task_result = create_video_task(api_key, model_name, image_urls, **video_params)
    
    if 'error' in task_result:
        return jsonify({'error': f'Task creation failed: {task_result["error"]}'}), 500
    
    task_id = task_result.get('id')
    if not task_id:
        return jsonify({'error': 'No task ID returned'}), 500
    
    # 轮询任务状态直到完成
    result = poll_task_status(api_key, task_id, max_wait_time=300)
    
    if 'error' in result:
        return jsonify({'error': f'Task polling failed: {result["error"]}'}), 500
    
    # 如果任务完成，下载视频
    if result.get('status') == 'completed':
        video_url = result.get('video_url')
        if video_url:
            # 生成唯一的输出文件名
            output_filename = f"{task_id}.mp4"
            output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)
            
            if download_video(video_url, output_path):
                return jsonify({
                    'success': True,
                    'task_id': task_id,
                    'video_url': url_for('download_video_file', filename=output_filename, _external=True),
                    'message': 'Video generation completed successfully'
                })
            else:
                return jsonify({'error': 'Failed to download video'}), 500
        else:
            return jsonify({'error': 'No video URL in completed task'}), 500
    else:
        return jsonify({'error': f'Task failed with status: {result.get("status", "unknown")}'}), 500

@app.route('/status/<task_id>')
def check_status(task_id):
    """检查任务状态"""
    api_key = request.args.get('api_key')
    if not api_key:
        return jsonify({'error': 'API key required'}), 400
    
    # 轮询任务状态
    result = poll_task_status(api_key, task_id, max_wait_time=60)  # 限制为60秒
    
    if 'error' in result:
        return jsonify({'error': result['error']}), 500
    
    # 如果任务完成，下载视频
    if result.get('status') == 'completed':
        video_url = result.get('video_url')
        if video_url:
            # 生成唯一的输出文件名
            output_filename = f"{task_id}.mp4"
            output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)
            
            if download_video(video_url, output_path):
                return jsonify({
                    'status': 'completed',
                    'video_url': url_for('download_video', filename=output_filename),
                    'local_path': output_path
                })
            else:
                return jsonify({'error': 'Failed to download video'}), 500
    
    return jsonify({
        'status': result.get('status', 'unknown'),
        'message': 'Task is still processing'
    })

@app.route('/download/<filename>')
def download_video_file(filename):
    """下载生成的视频文件"""
    file_path = os.path.join(app.config['OUTPUT_FOLDER'], filename)
    if os.path.exists(file_path):
        return send_file(file_path, as_attachment=True)
    else:
        return jsonify({'error': 'File not found'}), 404

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)