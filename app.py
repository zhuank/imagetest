import os
import tempfile
import requests
import time
import json
from flask import Flask, render_template, request, jsonify, send_file, url_for
from werkzeug.utils import secure_filename
import uuid
from urllib.parse import urlparse
from volcenginesdkarkruntime import Ark

# 新增：加载 .env 环境变量
try:
    from dotenv import load_dotenv
    load_dotenv(override=False)
except Exception:
    pass

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

# 新增：Ark 客户端
def get_ark_client(api_key: str) -> Ark:
    base_url = os.environ.get("ARK_BASE_URL", "https://ark.ap-southeast.bytepluses.com/api/v3")
    return Ark(api_key=api_key, base_url=base_url)

# 新增：多地域客户端候选（自动回退）
def get_ark_clients(api_key: str):
    prefer = os.environ.get("ARK_BASE_URL")
    if prefer:
        bases = [prefer]
    else:
        bases = [
            "https://ark.ap-southeast.bytepluses.com/api/v3",
            "https://ark.cn-beijing.volces.com/api/v3",
        ]
    return [Ark(api_key=api_key, base_url=b) for b in bases]

def upload_to_transfer_sh(file_path):
    """上传文件到 transfer.sh 获取直接链接（使用 PUT 并带文件名）。"""
    try:
        filename = os.path.basename(file_path)
        url = f"https://transfer.sh/{filename}"
        with open(file_path, 'rb') as f:
            resp = requests.put(url, data=f, timeout=180)
        if resp.status_code in (200, 201):
            link = resp.text.strip()
            if link.startswith("http"):
                return link
            else:
                print(f"Transfer.sh unexpected response: {link}")
        else:
            print(f"Transfer.sh upload failed: HTTP {resp.status_code} {resp.text}")
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
    """将本地图片重新托管到公共服务获取直接链接（优先 catbox，其次 transfer.sh，再次 0x0.st）"""
    # 优先 catbox（在国内网络更稳定）
    url = upload_to_catbox(file_path)
    if url:
        return url
    # 尝试 transfer.sh（PUT）
    url = upload_to_transfer_sh(file_path)
    if url:
        return url
    # 尝试 0x0.st 兜底
    url = upload_to_0x0(file_path) # type: ignore
    if url:
        return url
    return None

def create_video_task(api_key, model_name, image_urls, **kwargs):
    """使用方舟SDK创建参考图生视频任务，返回 {"id": task_id} 或 {"error": ...} """
    try:
        content = [
            {
                "type": "text",
                "text": kwargs.get('prompt', 'Generate a video based on the provided images')
            }
        ]
        for url in image_urls:
            content.append({
                "type": "image_url",
                "image_url": {"url": url},
                "role": "reference_image",
            })
        model_id = model_name or "seedance-1-0-lite-i2v-250428"

        last_err = None
        for client in get_ark_clients(api_key):
            try:
                create_result = client.content_generation.tasks.create(
                    model=model_id,
                    content=content,
                )
                task_id = None
                if isinstance(create_result, dict):
                    task_id = create_result.get('id') or create_result.get('task_id') or create_result.get('result', {}).get('id')
                else:
                    try:
                        data = json.loads(create_result.model_dump_json())
                        task_id = data.get('id') or data.get('task_id') or data.get('result', {}).get('id')
                    except Exception:
                        task_id = getattr(create_result, 'id', None)
                if task_id:
                    return {"id": task_id}
            except Exception as e:
                last_err = e
                continue
        return {"error": f"Create task failed on all base_urls: {last_err}"}
    except Exception as e:
        return {"error": str(e)}

def poll_task_status(api_key, task_id, max_wait_time=300):
    """使用方舟SDK轮询任务状态，返回最终结果。成功时 status == 'succeeded' 且 content.video_url 可用。"""
    try:
        start_time = time.time()
        last_err = None
        clients = get_ark_clients(api_key)
        while time.time() - start_time < max_wait_time:
            for client in clients:
                try:
                    result = client.content_generation.tasks.get(task_id=task_id)
                    if isinstance(result, dict):
                        data = result
                    else:
                        try:
                            data = json.loads(result.model_dump_json())
                        except Exception:
                            data = {
                                "status": getattr(result, 'status', None),
                                "content": getattr(result, 'content', None),
                                "result": getattr(result, 'result', None),
                            }
                    status = (data or {}).get('status') or (data or {}).get('result', {}).get('status')
                    if status == 'succeeded':
                        return data
                    if status == 'failed':
                        return {"error": "Task failed", "details": data}
                except Exception as e:
                    last_err = e
                    continue
            time.sleep(2)
        return {"error": f"Task timeout. last_error={last_err}"}
    except Exception as e:
        return {"error": f"Polling error: {str(e)}"}

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
    
    # 验证必需参数（image_urls 必需；api_key 可从请求或环境变量获取）
    required_fields = ['image_urls']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400

    # 处理 API Key：去除空白、去除可能的 Bearer 前缀；若未提供则尝试环境变量
    api_key_raw = str(data.get('api_key', '')).strip()
    if api_key_raw.lower().startswith('bearer '):
        api_key_raw = api_key_raw[7:].strip()
    if not api_key_raw:
        env_key = os.environ.get('ARK_API_KEY', '').strip()
        if env_key:
            api_key = env_key
        else:
            return jsonify({'error': 'API key required'}), 400
    else:
        api_key = api_key_raw

    # 可选：允许前端临时指定 base_url（覆盖当前进程的默认地域，仅对本服务生效）
    preferred_base = str(data.get('base_url', '')).strip()
    if preferred_base:
        os.environ['ARK_BASE_URL'] = preferred_base
    
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
    
    # 使用前端传入模型或默认 Seedance 模型ID（支持环境变量覆盖）
    model_name = data.get('model_name') or os.environ.get('ARK_DEFAULT_MODEL') or "seedance-1-0-lite-t2v-250428"
    
    # 创建视频生成任务（SDK）
    task_result = create_video_task(api_key, model_name, image_urls, **video_params)
    
    if 'error' in task_result:
        # 若明确鉴权失败，返回 401，便于前端提示更准确
        err_text = str(task_result['error'])
        status_code = 401 if ('401' in err_text or 'Unauthorized' in err_text or 'AuthenticationError' in err_text) else 500
        return jsonify({'error': f'Task creation failed: {task_result["error"]}'}), status_code
    
    task_id = task_result.get('id')
    if not task_id:
        return jsonify({'error': 'No task ID returned'}), 500
    
    # 轮询任务状态直到完成（SDK）
    result = poll_task_status(api_key, task_id, max_wait_time=300)
    
    if 'error' in result:
        return jsonify({'error': f'Task polling failed: {result["error"]}'}), 500
    
    status = result.get('status') or result.get('result', {}).get('status')
    content = result.get('content') or result.get('result', {}).get('content') or {}
    video_url = (content or {}).get('video_url') or result.get('video_url') or result.get('result', {}).get('video_url')
    if status == 'succeeded' and video_url:
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
        return jsonify({'error': f'Task failed with status: {status or "unknown"}'}), 500

@app.route('/status/<task_id>')
def check_status(task_id):
    """检查任务状态"""
    # 兼容前端不再传递 api_key：优先 query，其次环境变量
    api_key = (request.args.get('api_key') or os.environ.get('ARK_API_KEY', '')).strip()
    if not api_key:
        return jsonify({'error': 'API key required (server is missing ARK_API_KEY)'}), 400

    result = poll_task_status(api_key, task_id, max_wait_time=60)  # 限制为60秒

    if 'error' in result:
        return jsonify({'error': result['error']}), 500

    # 兼容不同SDK返回结构
    status = result.get('status') or result.get('result', {}).get('status')
    content = result.get('content') or result.get('result', {}).get('content') or {}
    video_url = (content or {}).get('video_url') or result.get('video_url') or result.get('result', {}).get('video_url')

    if status == 'succeeded' and video_url:
        output_filename = f"{task_id}.mp4"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)
        if download_video(video_url, output_path):
            return jsonify({
                'status': 'succeeded',
                'video_url': url_for('download_video_file', filename=output_filename, _external=True),
                'local_path': output_path
            })
        else:
            return jsonify({'error': 'Failed to download video'}), 500

    if status == 'failed':
        return jsonify({'status': 'failed', 'message': 'Task failed'}), 200

    return jsonify({
        'status': status or 'unknown',
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