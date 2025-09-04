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
        # 构建包含视频参数的prompt
        base_prompt = kwargs.get('prompt', 'Generate a video based on the provided images')
        ratio = kwargs.get('ratio', '1092x1080')
        duration = int(kwargs.get('duration', 5))
        fps = int(kwargs.get('fps', 24))
        watermark = 'false' if not kwargs.get('watermark', False) else 'true'
        seed = int(kwargs.get('seed', -1))
        temperature = float(kwargs.get('temperature', 0.7))
        
        # 按照方舟API格式添加参数到prompt
        full_prompt = f"{base_prompt} --ratio {ratio} --dur {duration} --fps {fps} --wm {watermark}"
        if seed != -1:
            full_prompt += f" --seed {seed}"
        if temperature != 0.7:
            full_prompt += f" --temperature {temperature}"
        
        content = [
            {
                "type": "text",
                "text": full_prompt
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
    
    # 构建视频生成参数（含 seed / temperature）
    # seed：-1 表示随机；0 或正整数表示固定种子
    try:
        seed_val = int(data.get('seed', -1))
    except Exception:
        seed_val = -1
    if seed_val < -1:
        seed_val = -1
    try:
        temperature_val = float(data.get('temperature', 0.7))
    except Exception:
        temperature_val = 0.7
    if temperature_val < 0:
        temperature_val = 0.0
    if temperature_val > 1:
        temperature_val = 1.0

    video_params = {
        'prompt': data.get('prompt', 'Generate a video based on the provided images'),
        'ratio': data.get('ratio', '1092x1080'),
        'duration': int(data.get('duration', 5)),
        'fps': int(data.get('fps', 24)),
        'watermark': data.get('watermark', False),
        'seed': seed_val,
        'temperature': temperature_val,
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
    
    # 注意：部分 SDK/服务返回体可能包含 error: null（或 None），不能仅以存在键名判断为错误
    if isinstance(result, dict) and result.get('error'):
        return jsonify({'error': f'Task polling failed: {result.get("error")}'}), 500
    
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

    # 注意：同上，避免把 error: null 误判为错误
    if isinstance(result, dict) and result.get('error'):
        return jsonify({'error': result.get('error')}), 500

    # 兼容不同SDK返回结构
    status = result.get('status') or result.get('result', {}).get('status')
    content = result.get('content') or result.get('result', {}).get('content') or {}
    video_url = (content or {}).get('video_url') or result.get('video_url') or result.get('result', {}).get('video_url')

    # 若成功，直接返回 200 和视频URL；若失败，返回 200 并给出状态由前端决定文案
    if status == 'succeeded' and video_url:
        # 优先返回本地代理下载地址，避免跨域或直链被浏览器拦截
        output_filename = f"{task_id}.mp4"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)
        local_url = url_for('download_video_file', filename=output_filename, _external=True)
        try:
            if not (os.path.exists(output_path) and os.path.getsize(output_path) > 0):
                # 若文件不存在或为空，则尝试拉取一次
                download_video(video_url, output_path)
        except Exception:
            pass
        # 若已成功落地，则返回本地URL；否则继续返回远端URL作兜底
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            return jsonify({'status': 'succeeded', 'video_url': local_url, 'remote_url': video_url})
        else:
            return jsonify({'status': 'succeeded', 'video_url': video_url})
    elif status == 'failed':
        return jsonify({'status': 'failed', 'error': 'Task failed'})
    else:
        # 处理中或未知
        return jsonify({'status': status or 'processing'})

    if status == 'failed':
        return jsonify({'status': 'failed', 'message': 'Task failed'}), 200

    return jsonify({
        'status': status or 'unknown',
        'message': 'Task is still processing'
    })

@app.route('/task_status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """获取任务状态"""
    api_key = os.environ.get('ARK_API_KEY', '').strip()
    if not api_key:
        return jsonify({'error': 'API key required'}), 400
    
    try:
        result = poll_task_status(api_key, task_id, max_wait_time=1)
        
        if isinstance(result, dict) and result.get('error'):
            return jsonify({'status': 'failed', 'error': result.get('error')})
        
        # 兼容不同SDK返回结构
        status = result.get('status') or result.get('result', {}).get('status')
        content = result.get('content') or result.get('result', {}).get('content') or {}
        video_url = (content or {}).get('video_url') or result.get('video_url') or result.get('result', {}).get('video_url')
        
        if status == 'succeeded' and video_url:
            # 返回本地代理下载地址
            output_filename = f"{task_id}.mp4"
            output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)
            local_url = url_for('download_video_file', filename=output_filename, _external=True)
            
            try:
                if not (os.path.exists(output_path) and os.path.getsize(output_path) > 0):
                    download_video(video_url, output_path)
            except Exception:
                pass
                
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                return jsonify({'status': 'completed', 'video_url': local_url, 'progress': 100})
            else:
                return jsonify({'status': 'completed', 'video_url': video_url, 'progress': 100})
        elif status == 'failed':
            return jsonify({'status': 'failed', 'error': 'Task failed', 'progress': 0})
        else:
            # 处理中，返回估算进度
            progress = 50 if status == 'processing' else 25
            return jsonify({'status': 'processing', 'progress': progress})
            
    except Exception as e:
        return jsonify({'status': 'failed', 'error': str(e), 'progress': 0})

@app.route('/upload_firstlast', methods=['POST'])
def upload_firstlast_files():
    """处理首尾帧上传"""
    uploaded_files = []
    image_urls = []
    
    # 处理首帧（必需）
    if 'first_frame' in request.files:
        first_file = request.files['first_frame']
        if first_file and first_file.filename and allowed_file(first_file.filename):
            filename = secure_filename(first_file.filename)
            filename = f"first_{uuid.uuid4().hex}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            first_file.save(file_path)
            
            # 重新托管图片获取直接链接
            rehosted_url = rehost_image(file_path)
            if rehosted_url:
                image_urls.append(rehosted_url)
                uploaded_files.append({
                    'type': 'first_frame',
                    'filename': filename,
                    'path': file_path,
                    'url': rehosted_url
                })
    
    # 处理尾帧（可选）
    if 'last_frame' in request.files:
        last_file = request.files['last_frame']
        if last_file and last_file.filename and allowed_file(last_file.filename):
            filename = secure_filename(last_file.filename)
            filename = f"last_{uuid.uuid4().hex}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            last_file.save(file_path)
            
            # 重新托管图片获取直接链接
            rehosted_url = rehost_image(file_path)
            if rehosted_url:
                image_urls.append(rehosted_url)
                uploaded_files.append({
                    'type': 'last_frame',
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

@app.route('/upload_reference', methods=['POST'])
def upload_reference_files():
    """处理参考图上传"""
    uploaded_files = []
    image_urls = []
    
    # 处理参考图（1-4张）
    if 'reference_images' in request.files:
        reference_files = request.files.getlist('reference_images')
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
                        'type': 'reference_image',
                        'filename': filename,
                        'path': file_path,
                        'url': rehosted_url
                    })
    
    if not uploaded_files:
        return jsonify({'error': 'No valid reference images uploaded'}), 400
    
    if len(uploaded_files) > 4:
        return jsonify({'error': 'Maximum 4 reference images allowed'}), 400
    
    return jsonify({
        'success': True,
        'files': uploaded_files,
        'image_urls': image_urls,
        'count': len(uploaded_files)
    })

@app.route('/generate_firstlast', methods=['POST'])
def generate_firstlast_video():
    """生成首尾帧视频"""
    # 检查是否有已上传的首尾帧图片
    first_frame_files = []
    last_frame_files = []
    
    for filename in os.listdir(app.config['UPLOAD_FOLDER']):
        if filename.startswith('first_') and allowed_file(filename):
            first_frame_files.append(filename)
        elif filename.startswith('last_') and allowed_file(filename):
            last_frame_files.append(filename)
    
    # 处理首帧（必需）
    image_urls = []
    if first_frame_files:
        # 取最新的首帧文件
        latest_first = sorted(first_frame_files)[-1]
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], latest_first)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)
    
    # 处理尾帧（可选）
    if last_frame_files:
        # 取最新的尾帧文件
        latest_last = sorted(last_frame_files)[-1]
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], latest_last)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)
    
    if not image_urls:
        return jsonify({'error': 'No valid images found. Please upload first frame image.'}), 400
    
    # 获取API Key
    api_key = os.environ.get('ARK_API_KEY', '').strip()
    if not api_key:
        return jsonify({'error': 'API key required'}), 400
    
    # 获取JSON参数
    data = request.get_json() or {}
    
    # 构建视频生成参数
    try:
        seed_val = int(data.get('seed', -1))
    except Exception:
        seed_val = -1
    if seed_val < -1:
        seed_val = -1
        
    try:
        temperature_val = float(data.get('temperature', 0.7))
    except Exception:
        temperature_val = 0.7
    if temperature_val < 0:
        temperature_val = 0.0
    if temperature_val > 1:
        temperature_val = 1.0
    
    video_params = {
        'prompt': data.get('prompt', 'Generate a video from first frame to last frame'),
        'ratio': data.get('ratio', '1092x1080'),
        'duration': int(data.get('duration', 5)),
        'fps': int(data.get('fps', 24)),
        'watermark': data.get('watermark', False),
        'seed': seed_val,
        'temperature': temperature_val,
    }
    
    model_name = data.get('model_name') or "seedance-1-0-lite-i2v-250428"
    
    # 创建视频生成任务
    task_result = create_video_task(api_key, model_name, image_urls, **video_params)
    
    if 'error' in task_result:
        return jsonify({'error': f'Task creation failed: {task_result["error"]}'}), 500
    
    task_id = task_result.get('id')
    if not task_id:
        return jsonify({'error': 'No task ID returned'}), 500
    
    return jsonify({
        'success': True,
        'task_id': task_id,
        'message': 'First-last frame video generation started'
    })

@app.route('/generate_reference', methods=['POST'])
def generate_reference_video():
    """生成参考图视频"""
    # 检查是否有已上传的参考图
    reference_image_files = []
    for filename in os.listdir(app.config['UPLOAD_FOLDER']):
        if filename.startswith('ref_') and allowed_file(filename):
            reference_image_files.append(filename)
    
    if not reference_image_files:
        return jsonify({'error': 'No valid reference images found. Please upload images first.'}), 400
    
    # 重新托管最新的参考图
    image_urls = []
    for filename in sorted(reference_image_files)[-4:]:  # 取最新的4张图
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)
    
    if not image_urls:
        return jsonify({'error': 'No valid reference images could be processed'}), 400
    
    # 获取API Key
    api_key = os.environ.get('ARK_API_KEY', '').strip()
    if not api_key:
        return jsonify({'error': 'API key required'}), 400
    
    # 获取JSON参数
    data = request.get_json() or {}
    
    # 构建视频生成参数
    try:
        seed_val = int(data.get('seed', -1))
    except Exception:
        seed_val = -1
    if seed_val < -1:
        seed_val = -1
        
    try:
        temperature_val = float(data.get('temperature', 0.7))
    except Exception:
        temperature_val = 0.7
    if temperature_val < 0:
        temperature_val = 0.0
    if temperature_val > 1:
        temperature_val = 1.0
    
    video_params = {
        'prompt': data.get('prompt', 'Generate a video based on the provided reference images'),
        'ratio': data.get('ratio', '1092x1080'),
        'duration': int(data.get('duration', 5)),
        'fps': int(data.get('fps', 24)),
        'watermark': data.get('watermark', False),
        'seed': seed_val,
        'temperature': temperature_val,
    }
    
    model_name = data.get('model_name') or "seedance-1-0-lite-i2v-250428"
    
    # 创建视频生成任务
    task_result = create_video_task(api_key, model_name, image_urls, **video_params)
    
    if 'error' in task_result:
        return jsonify({'error': f'Task creation failed: {task_result["error"]}'}), 500
    
    task_id = task_result.get('id')
    if not task_id:
        return jsonify({'error': 'No task ID returned'}), 500
    
    return jsonify({
        'success': True,
        'task_id': task_id,
        'message': 'Reference image video generation started'
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