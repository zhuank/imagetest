import os
import tempfile
import requests
import time
import json
import subprocess
import threading
import datetime
from flask import Flask, render_template, request, jsonify, send_file, url_for
from werkzeug.utils import secure_filename
import uuid
import glob
from urllib.parse import urlparse

# 条件导入volcengine相关模块
try:
    # 如果 volcengine 未安装，则跳过导入
    try:
        from volcengine.vod import VodService
    except ModuleNotFoundError:
        VodService = None
    # 使用字典方式构造请求参数，避免直接导入 protobuf 类
    VodSubmitDirectEditTaskAsyncRequest = None
    VOLCENGINE_AVAILABLE = True
except ImportError:
    print("警告: volcengine模块未安装，部分功能将不可用")
    VOLCENGINE_AVAILABLE = False

# 新增：加载 .env 环境变量
try:
    from dotenv import load_dotenv
    load_dotenv(override=False)
except Exception:
    pass

# 定义常量
MERGE_TASKS_FOLDER = "merge_tasks"

# 辅助函数
def normalize_ratio(ratio):
    """将比例值标准化为0-1之间的浮点数"""
    if isinstance(ratio, str):
        if ratio.endswith('%'):
            return float(ratio.rstrip('%')) / 100
        else:
            return float(ratio)
    return float(ratio)

def get_vod_instance(ak, sk, region='cn-north-1'):
    """获取VOD服务实例"""
    if not VOLCENGINE_AVAILABLE:
        return None
    
    vod_service = VodService()
    vod_service.set_ak(ak)
    vod_service.set_sk(sk)
    vod_service.set_region(region)
    return vod_service

def process_vod_merge_task(task_id, output_path, status_callback=None):
    """处理VOD合并任务"""
    # 创建任务状态文件
    task_status = {
        "status": "processing",
        "progress": 0,
        "message": "任务处理中",
        "output_path": None
    }
    
    # 保存初始状态
    with open(os.path.join(MERGE_TASKS_FOLDER, f"{task_id}_status.json"), "w", encoding="utf-8") as f:
        json.dump(task_status, f, ensure_ascii=False)
    
    try:
        # 模拟处理过程
        for progress in range(0, 101, 10):
            task_status["progress"] = progress
            with open(os.path.join(MERGE_TASKS_FOLDER, f"{task_id}_status.json"), "w", encoding="utf-8") as f:
                json.dump(task_status, f, ensure_ascii=False)
            time.sleep(1)
        
        # 完成处理
        task_status["status"] = "completed"
        task_status["progress"] = 100
        task_status["message"] = "任务已完成"
        task_status["output_path"] = output_path
        
        with open(os.path.join(MERGE_TASKS_FOLDER, f"{task_id}_status.json"), "w", encoding="utf-8") as f:
            json.dump(task_status, f, ensure_ascii=False)
            
        if status_callback:
            status_callback(task_status)
            
        return True
    except Exception as e:
        task_status["status"] = "failed"
        task_status["message"] = f"任务失败: {str(e)}"
        
        with open(os.path.join(MERGE_TASKS_FOLDER, f"{task_id}_status.json"), "w", encoding="utf-8") as f:
            json.dump(task_status, f, ensure_ascii=False)
            
        if status_callback:
            status_callback(task_status)
            
        return False

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['OUTPUT_FOLDER'] = 'outputs'

# 确保上传和输出文件夹存在
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

# 视频合并任务文件夹
app.config['MERGE_TASKS_FOLDER'] = 'merge_tasks'
os.makedirs(app.config['MERGE_TASKS_FOLDER'], exist_ok=True)

# 允许的文件扩展名
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}

# 火山引擎视频点播服务
def get_vod_service(api_key=None):
    """获取火山引擎视频点播服务实例"""
    vod_service = VodService()
    
    # 如果提供了API Key，则使用它
    if api_key:
        vod_service.set_ak(api_key)
        # Secret Key需要从环境变量或配置文件中获取
        secret_key = os.environ.get("VOD_SECRET_KEY", "")
        if secret_key:
            vod_service.set_sk(secret_key)
    
    return vod_service

# 允许的视频文件扩展名
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'webm', 'mov', 'avi'}

# 新增：支持的分辨率与归一化
ALLOWED_RESOLUTIONS = {"854x480", "1280x720", "1920x1080"}

def submit_merge_task_async(files, output_name, output_format="mp4", api_key=None):
    """提交异步视频合并任务"""
    vod_service = get_vod_service(api_key)
    
    # 创建异步编辑任务请求
    req = VodSubmitDirectEditTaskAsyncRequest()
    req.Uploader = 'video_merge_app'
    req.Application = 'VideoTrackToB'
    req.Priority = 0
    
    # 准备编辑参数
    tracks = []
    current_time = 0
    
    # 为每个视频文件创建一个轨道片段
    for file_path in files:
        # 这里需要先上传文件到VOD，获取视频ID
        # 简化处理，假设文件已经在VOD中，使用文件路径作为source
        video_segment = {
            "ID": f"video_{len(tracks)}",
            "Source": file_path,
            "TargetTime": [current_time, current_time + 10000],  # 假设每个视频10秒
            "Type": "video"
        }
        tracks.append([video_segment])
        current_time += 10000
    
    edit_param = {
        "Canvas": {
            "Height": 1080,
            "Width": 1920
        },
        "Output": {
            "Alpha": False,
            "Codec": {
                "AudioBitrate": 128,
                "AudioCodec": "aac",
                "Crf": 23,
                "Preset": "medium",
                "VideoCodec": "h264"
            },
            "DisableAudio": False,
            "DisableVideo": False,
            "Fps": 30
        },
        "Track": tracks,
        "Upload": {
            "SpaceName": "video_merge_app",
            "VideoName": f"{output_name}.{output_format}"
        },
        "Uploader": "video_merge_app"
    }
    
    req.EditParam = json.dumps(edit_param).encode('utf-8')
    
    try:
        # 提交任务
        resp = vod_service.submit_direct_edit_task_async(req)
        result = json.loads(resp)
        
        # 返回任务ID
        return {
            "success": True,
            "task_id": result.get("Result", {}).get("TaskId", ""),
            "request_id": result.get("ResponseMetadata", {}).get("RequestId", "")
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def get_task_status(task_id, api_key=None):
    """获取异步任务状态"""
    vod_service = get_vod_service(api_key)
    
    try:
        # 构建查询任务状态的请求
        # 注意：这里简化处理，实际应使用火山引擎提供的查询任务状态API
        # 例如：vod_service.get_direct_edit_task_info(task_id)
        
        # 模拟查询结果
        # 实际应用中应替换为真实API调用
        status_info = {
            "success": True,
            "status": "PROCESSING",  # 可能的状态：PROCESSING, FINISHED, FAILED
            "progress": 50,  # 进度百分比
            "output_url": "",
            "error": ""
        }
        
        return status_info
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
        # 规范成 123x456 形式
        v = v.replace("*", "x").replace("×", "x").replace(" ", "")
        if "x" in v:
            parts = v.split("x")
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                norm = f"{int(parts[0])}x{int(parts[1])}"
                # 新增：支持正方形分辨率 1080x1080
                if norm == "1080x1080" or norm in ALLOWED_RESOLUTIONS:
                    return norm
        # 不合法回退默认 1080x1080
        return "1080x1080"
    except Exception:
        return "1080x1080"

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# 新增：Ark 客户端
try:
    from volcengine.ark import Ark
except ImportError:
    # 如果 volcengine.ark 模块不存在，则 Ark 设为 None
    Ark = None
try:
    from volcengine.ark import Ark
except ImportError:
    # 如果 volcengine.ark 模块不存在，则 Ark 设为 None
    Ark = None
    def get_ark_client(api_key: str):
        base_url = os.environ.get("ARK_BASE_URL", "https://ark.ap-southeast.bytepluses.com/api/v3")
        return Ark(api_key=api_key, base_url=base_url)
except ImportError:
    print("警告: volcengine.ark模块未安装，Ark功能将不可用")
    def get_ark_client(api_key: str):
        print("Ark客户端不可用")
        return None

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
    
    clients = []
    try:
        if 'Ark' in globals() or 'Ark' in locals():
            for base in bases:
                try:
                    clients.append(Ark(api_key=api_key, base_url=base))
                except Exception as e:
                    print(f"创建Ark客户端失败: {base}, {e}")
    except Exception as e:
        print(f"创建Ark客户端失败: {e}")
    return clients

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

# 新增：0x0.st 兜底
def upload_to_0x0(file_path):
    try:
        with open(file_path, 'rb') as f:
            resp = requests.post('https://0x0.st', files={'file': f}, timeout=60)
        if resp.status_code == 200:
            url = resp.text.strip()
            if url.startswith('http'):
                return url
    except Exception as e:
        print(f"0x0.st upload failed: {e}")
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
    url = upload_to_0x0(file_path)
    if url:
        return url
    return None

def create_video_task(api_key, model_name, image_urls, **kwargs):
    """使用方舟SDK创建参考图生视频任务，返回 {"id": task_id} 或 {"error": ...} """
    try:
        # 构建包含视频参数的prompt
        base_prompt = kwargs.get('prompt', 'Generate a video based on the provided images')
        ratio = normalize_ratio(kwargs.get('ratio'))  # 默认在 normalize_ratio 内部处理
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

# 新增：一次性查询任务状态（无内部轮询），用于 /task_status 接口，避免短超时

def fetch_task_status_once(api_key, task_id):
    try:
        last_err = None
        for client in get_ark_clients(api_key):
            try:
                result = client.content_generation.tasks.get(task_id=task_id)
                if isinstance(result, dict):
                    return result
                try:
                    return json.loads(result.model_dump_json())
                except Exception:
                    return {
                        "status": getattr(result, 'status', None),
                        "content": getattr(result, 'content', None),
                        "result": getattr(result, 'result', None),
                    }
            except Exception as e:
                last_err = e
                continue
        return {"error": f"Query failed: {last_err}"}
    except Exception as e:
        return {"error": f"Query error: {str(e)}"}

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
    api_key_raw = (str(data.get('api_key', '')).strip() or (request.headers.get('Authorization') or '').strip())
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

    # 可选：允许前端临时指定 base_url（覆盖当前进程的默认地域，仅在本服务生效）
    preferred_base = str(data.get('base_url', '')).strip()
    if preferred_base:
        os.environ['ARK_BASE_URL'] = preferred_base

    # 构建视频生成参数（首尾帧）
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
        'ratio': normalize_ratio(data.get('ratio')),
        'duration': int(data.get('duration', 5)),
        'fps': int(data.get('fps', 24)),
        'watermark': data.get('watermark', False),
        'seed': seed_val,
        'temperature': temperature_val,
    }

    model_name = data.get('model_name') or "seedance-1-0-lite-i2v-250428"
    
    # 创建视频生成任务
    # Get image_urls from data payload
    image_urls = data.get('image_urls', [])
    if not image_urls:
        return jsonify({'error': 'No image URLs provided'}), 400
        
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
    """获取任务状态（无阻塞轮询，每次请求只做一次 tasks.get）"""
    raw_api_key = (request.args.get('api_key') or request.headers.get('Authorization') or os.environ.get('ARK_API_KEY', '')).strip()
    # 规范化：支持 'Bearer xxx' 或裸 Key，传入 SDK 必须是裸 Key
    api_key = raw_api_key
    if api_key.lower().startswith('bearer '):
        api_key = api_key[7:].strip()
    if not api_key:
        return jsonify({'error': 'API key required'}), 400
    
    try:
        # 改为一次性查询，避免 1 秒内循环导致的 timeout 误判
        result = fetch_task_status_once(api_key, task_id)
        
        if isinstance(result, dict) and result.get('error'):
            error_msg = result.get('error', '')
            # 处理方舟SDK的误导性错误信息
            if "API key doesn't exist" in error_msg or 'AuthenticationError' in error_msg:
                return jsonify({
                    'status': 'failed', 
                    'error': f'Task not found: {task_id}. Please check if the task ID is correct.',
                    'progress': 0
                })
            return jsonify({'status': 'failed', 'error': error_msg, 'progress': 0})
        
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
            # 尝试提取失败详情
            error_detail = (content or {}).get('error') or result.get('error') or result.get('result', {}).get('error')
            if error_detail:
                return jsonify({'status': 'failed', 'error': error_detail, 'progress': 0})
            else:
                return jsonify({'status': 'failed', 'error': 'Task failed', 'progress': 0})
        else:
            # 处理中，返回估算进度
            progress = 50 if status == 'processing' else 25
            return jsonify({'status': 'processing', 'progress': progress})
            
    except Exception as e:
        error_msg = str(e)
        if "API key doesn't exist" in error_msg or 'AuthenticationError' in error_msg:
            return jsonify({
                'status': 'failed', 
                'error': f'Task not found: {task_id}. Please check if the task ID is correct.',
                'progress': 0
            })
        return jsonify({'status': 'failed', 'error': error_msg, 'progress': 0})

@app.route('/upload_firstlast', methods=['POST'])
def upload_firstlast_files():
    """处理首尾帧上传"""
    uploaded_files = []
    image_urls = []
    
    # 确保firstlast子文件夹存在
    firstlast_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'firstlast')
    os.makedirs(firstlast_folder, exist_ok=True)
    
    # 处理首帧（必需）
    if 'first_frame' in request.files:
        first_file = request.files['first_frame']
        if first_file and first_file.filename and allowed_file(first_file.filename):
            filename = secure_filename(first_file.filename)
            filename = f"first_{uuid.uuid4().hex}_{filename}"
            file_path = os.path.join(firstlast_folder, filename)
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
            file_path = os.path.join(firstlast_folder, filename)
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
    
    # 确保reference子文件夹存在
    reference_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'reference')
    os.makedirs(reference_folder, exist_ok=True)
    
    # 处理参考图（1-4张）
    if 'reference_images' in request.files:
        reference_files = request.files.getlist('reference_images')
        for i, ref_file in enumerate(reference_files):
            if ref_file and ref_file.filename and allowed_file(ref_file.filename):
                filename = secure_filename(ref_file.filename)
                filename = f"ref_{i}_{uuid.uuid4().hex}_{filename}"
                file_path = os.path.join(reference_folder, filename)
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
    
    firstlast_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'firstlast')
    if os.path.exists(firstlast_folder):
        for filename in os.listdir(firstlast_folder):
            if filename.startswith('first_') and allowed_file(filename):
                first_frame_files.append(filename)
            elif filename.startswith('last_') and allowed_file(filename):
                last_frame_files.append(filename)
    
    # 处理首帧（必需）
    image_urls = []
    if first_frame_files:
        # 取最新的首帧文件
        latest_first = sorted(first_frame_files)[-1]
        file_path = os.path.join(firstlast_folder, latest_first)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)
    
    # 处理尾帧（可选）
    if last_frame_files:
        # 取最新的尾帧文件
        latest_last = sorted(last_frame_files)[-1]
        file_path = os.path.join(firstlast_folder, latest_last)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)
    
    if not image_urls:
        return jsonify({'error': 'No valid images found. Please upload first frame image.'}), 400
    
    # 获取JSON参数
    data = request.get_json() or {}
    
    # 获取API Key（优先前端传入，其次请求头，最后环境变量），自动去除 Bearer 前缀供 SDK 使用
    raw_api_key = (data.get('api_key') or request.headers.get('Authorization') or os.environ.get('ARK_API_KEY', '')).strip()
    api_key = raw_api_key
    if api_key.lower().startswith('bearer '):
        api_key = api_key[7:].strip()
    if not api_key:
        return jsonify({'error': 'API key required'}), 400

    # 可选：覆盖 Ark Base URL
    preferred_base = str(data.get('base_url', '')).strip()
    if preferred_base:
        os.environ['ARK_BASE_URL'] = preferred_base

    # 构建视频生成参数（首尾帧）
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
        'ratio': normalize_ratio(data.get('ratio')),
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

# duplicate removed: legacy generate_reference route disabled
def _generate_reference_video_legacy_removed_1():
    """生成参考图视频"""
    # 检查是否有已上传的参考图
    reference_image_files = []
    reference_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'reference')
    if os.path.exists(reference_folder):
        for filename in os.listdir(reference_folder):
            if filename.startswith('ref_') and allowed_file(filename):
                reference_image_files.append(filename)
    
    if not reference_image_files:
        return jsonify({'error': 'No valid reference images found. Please upload images first.'}), 400
    
    # 重新托管最新的参考图（仅取 1~2 张，保持上传先后顺序：第一张为主体，第二张（可选）为物品参考）
    image_urls = []
    # 收集文件及其修改时间
    files_with_mtime = []
    for filename in reference_image_files:
        file_path = os.path.join(reference_folder, filename)
        try:
            mtime = os.path.getmtime(file_path)
            files_with_mtime.append((filename, mtime))
        except Exception:
            continue
    # 按时间升序排序（越早的在前）
    files_with_mtime.sort(key=lambda x: x[1])
    # 仅取最后的 2 张（最新的 1~2 张），并保持原先后顺序
    selected = [name for name, _ in files_with_mtime[-2:]]

    for filename in selected:
        file_path = os.path.join(reference_folder, filename)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)

    if not image_urls:
        return jsonify({'error': 'No valid reference images could be processed'}), 400
    # 只保留最多 2 张
    if len(image_urls) > 2:
        image_urls = image_urls[:2]

    if len(image_urls) > 4:
        return jsonify({'error': 'Maximum 4 reference images allowed'}), 400
    
    return jsonify({
        'success': True,
        'files': reference_image_files,
        'image_urls': image_urls,
        'count': len(image_urls)
    })

# duplicate removed: legacy generate_firstlast route disabled
def _generate_firstlast_video_legacy_removed():
    """生成首尾帧视频"""
    # 检查是否有已上传的首尾帧图片
    first_frame_files = []
    last_frame_files = []
    
    firstlast_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'firstlast')
    if os.path.exists(firstlast_folder):
        for filename in os.listdir(firstlast_folder):
            if filename.startswith('first_') and allowed_file(filename):
                first_frame_files.append(filename)
            elif filename.startswith('last_') and allowed_file(filename):
                last_frame_files.append(filename)
    
    # 处理首帧（必需）
    image_urls = []
    if first_frame_files:
        # 取最新的首帧文件
        latest_first = sorted(first_frame_files)[-1]
        file_path = os.path.join(firstlast_folder, latest_first)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)
    
    # 处理尾帧（可选）
    if last_frame_files:
        # 取最新的尾帧文件
        latest_last = sorted(last_frame_files)[-1]
        file_path = os.path.join(firstlast_folder, latest_last)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)
    
    if not image_urls:
        return jsonify({'error': 'No valid images found. Please upload first frame image.'}), 400
    
    # 获取JSON参数
    data = request.get_json() or {}
    
    # 获取API Key（优先前端传入，其次请求头，最后环境变量），自动去除 Bearer 前缀供 SDK 使用
    raw_api_key = (data.get('api_key') or request.headers.get('Authorization') or os.environ.get('ARK_API_KEY', '')).strip()
    api_key = raw_api_key
    if api_key.lower().startswith('bearer '):
        api_key = api_key[7:].strip()
    if not api_key:
        return jsonify({'error': 'API key required'}), 400

    # 可选：覆盖 Ark Base URL
    preferred_base = str(data.get('base_url', '')).strip()
    if preferred_base:
        os.environ['ARK_BASE_URL'] = preferred_base

    # 构建视频生成参数（首尾帧）
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
        'ratio': normalize_ratio(data.get('ratio')),
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

# duplicate removed: legacy generate_reference route disabled
def _generate_reference_video_legacy_removed_2():
    """生成参考图视频"""
    # 检查是否有已上传的参考图
    reference_image_files = []
    reference_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'reference')
    if os.path.exists(reference_folder):
        for filename in os.listdir(reference_folder):
            if filename.startswith('ref_') and allowed_file(filename):
                reference_image_files.append(filename)
    
    if not reference_image_files:
        return jsonify({'error': 'No valid reference images found. Please upload images first.'}), 400
    
    # 重新托管最新的参考图（仅取 1~2 张，保持上传先后顺序：第一张为主体，第二张（可选）为物品参考）
    image_urls = []
    # 收集文件及其修改时间
    files_with_mtime = []
    for filename in reference_image_files:
        file_path = os.path.join(reference_folder, filename)
        try:
            mtime = os.path.getmtime(file_path)
            files_with_mtime.append((filename, mtime))
        except Exception:
            continue
    # 按时间升序排序（越早的在前）
    files_with_mtime.sort(key=lambda x: x[1])
    # 仅取最后的 2 张（最新的 1~2 张），并保持原先后顺序
    selected = [name for name, _ in files_with_mtime[-2:]]

    for filename in selected:
        file_path = os.path.join(reference_folder, filename)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)

    if not image_urls:
        return jsonify({'error': 'No valid reference images could be processed'}), 400
    # 只保留最多 2 张
    if len(image_urls) > 2:
        image_urls = image_urls[:2]

    if len(image_urls) > 4:
        return jsonify({'error': 'Maximum 4 reference images allowed'}), 400
    
    return jsonify({
        'success': True,
        'files': image_urls,
        'image_urls': image_urls,
        'count': len(image_urls)
    })

# duplicate removed: legacy generate_firstlast route disabled
def _generate_firstlast_video_legacy_removed_2():
    """生成首尾帧视频"""
    # 检查是否有已上传的首尾帧图片
    first_frame_files = []
    last_frame_files = []
    
    firstlast_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'firstlast')
    if os.path.exists(firstlast_folder):
        for filename in os.listdir(firstlast_folder):
            if filename.startswith('first_') and allowed_file(filename):
                first_frame_files.append(filename)
            elif filename.startswith('last_') and allowed_file(filename):
                last_frame_files.append(filename)
    
    # 处理首帧（必需）
    image_urls = []
    if first_frame_files:
        # 取最新的首帧文件
        latest_first = sorted(first_frame_files)[-1]
        file_path = os.path.join(firstlast_folder, latest_first)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)
    
    # 处理尾帧（可选）
    if last_frame_files:
        # 取最新的尾帧文件
        latest_last = sorted(last_frame_files)[-1]
        file_path = os.path.join(firstlast_folder, latest_last)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)
    
    if not image_urls:
        return jsonify({'error': 'No valid images found. Please upload first frame image.'}), 400
    
    # 获取JSON参数
    data = request.get_json() or {}
    
    # 获取API Key（优先前端传入，其次请求头，最后环境变量），自动去除 Bearer 前缀供 SDK 使用
    raw_api_key = (data.get('api_key') or request.headers.get('Authorization') or os.environ.get('ARK_API_KEY', '')).strip()
    api_key = raw_api_key
    if api_key.lower().startswith('bearer '):
        api_key = api_key[7:].strip()
    if not api_key:
        return jsonify({'error': 'API key required'}), 400

    # 可选：覆盖 Ark Base URL
    preferred_base = str(data.get('base_url', '')).strip()
    if preferred_base:
        os.environ['ARK_BASE_URL'] = preferred_base

    # 构建视频生成参数（首尾帧）
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
        'ratio': normalize_ratio(data.get('ratio')),
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
    reference_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'reference')
    if os.path.exists(reference_folder):
        for filename in os.listdir(reference_folder):
            if filename.startswith('ref_') and allowed_file(filename):
                reference_image_files.append(filename)
    
    if not reference_image_files:
        return jsonify({'error': 'No valid reference images found. Please upload images first.'}), 400
    
    # 重新托管最新的参考图
    image_urls = []
    for filename in sorted(reference_image_files)[-4:]:  # 取最新的4张图
        file_path = os.path.join(reference_folder, filename)
        rehosted_url = rehost_image(file_path)
        if rehosted_url:
            image_urls.append(rehosted_url)
    
    if not image_urls:
        return jsonify({'error': 'No valid reference images could be processed'}), 400
    
    # 获取JSON参数
    data = request.get_json() or {}
    
    # 获取API Key（优先前端传入，其次请求头，最后环境变量），自动去除 Bearer 前缀供 SDK 使用
    raw_api_key = (data.get('api_key') or request.headers.get('Authorization') or os.environ.get('ARK_API_KEY', '')).strip()
    api_key = raw_api_key
    if api_key.lower().startswith('bearer '):
        api_key = api_key[7:].strip()
    if not api_key:
        return jsonify({'error': 'API key required'}), 400

    # 可选：覆盖 Ark Base URL
    preferred_base = str(data.get('base_url', '')).strip()
    if preferred_base:
        os.environ['ARK_BASE_URL'] = preferred_base

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
        'ratio': normalize_ratio(data.get('ratio')) if callable(normalize_ratio) else data.get('ratio'),
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

@app.route('/stream/<filename>')
def stream_video_file(filename):
    """内联流式播放生成的视频（用于 <video> 播放，不触发下载）"""
    file_path = os.path.join(app.config['OUTPUT_FOLDER'], filename)
    if os.path.exists(file_path):
        resp = send_file(file_path, mimetype='video/mp4', conditional=True)
        # 强制内联，允许范围请求，便于拖动进度条
        resp.headers['Content-Disposition'] = f'inline; filename="{filename}"'
        resp.headers['Accept-Ranges'] = 'bytes'
        return resp
    else:
        return jsonify({'error': 'File not found'}), 404

@app.route('/check_firstlast_files', methods=['GET'])
def check_firstlast_files():
    """检查是否有已上传的首尾帧文件"""
    firstlast_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'firstlast')
    has_first_frame = False
    has_last_frame = False
    
    if os.path.exists(firstlast_folder):
        for filename in os.listdir(firstlast_folder):
            if filename.startswith('first_') and allowed_file(filename):
                has_first_frame = True
            elif filename.startswith('last_') and allowed_file(filename):
                has_last_frame = True
    
    return jsonify({
        'success': True,
        'has_first_frame': has_first_frame,
        'has_last_frame': has_last_frame
    })

@app.route('/list_videos', methods=['GET'])
def list_videos():
    """列出可用于合并的视频文件"""
    try:
        videos = []
        # 检查输出文件夹中的视频文件
        for file in os.listdir(app.config['OUTPUT_FOLDER']):
            if file.endswith(tuple(ALLOWED_VIDEO_EXTENSIONS)):
                file_path = os.path.join(app.config['OUTPUT_FOLDER'], file)
                video_id = file.split('.')[0]  # 使用文件名作为ID
                videos.append({
                    'id': video_id,
                    'name': file,
                    'url': url_for('stream_video_file', filename=file),
                    'download_url': url_for('download_file', filename=file)
                })
        return jsonify({
            'success': True,
            'videos': videos
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/merge_videos', methods=['POST'])
def merge_videos():
    """创建视频合并任务"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
            
        # 处理合并视频的逻辑
        # ...
        
        return jsonify({'success': True, 'message': '视频合并请求已接收'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
        
        video_ids = data.get('video_ids', [])
        if not video_ids or len(video_ids) < 2:
            return jsonify({'success': False, 'error': 'At least 2 videos required'}), 400
        
        # 创建任务ID和任务文件夹
        task_id = str(uuid.uuid4())
        task_folder = os.path.join(app.config['MERGE_TASKS_FOLDER'], task_id)
        os.makedirs(task_folder, exist_ok=True)
        
        # 保存任务信息
        task_info = {
            'task_id': task_id,
            'video_ids': video_ids,
            'output_name': data.get('output_name', 'merged_video'),
            'output_format': data.get('output_format', 'mp4'),
            'status': 'pending',
            'created_at': time.time(),
            'progress': 0
        }
        
        with open(os.path.join(task_folder, 'task_info.json'), 'w') as f:
            json.dump(task_info, f)
        
        # 启动异步任务处理
        # 在实际生产环境中，应该使用Celery等任务队列
        # 这里为了简单，直接在后台线程中处理
        import threading
        thread = threading.Thread(target=process_merge_task, args=(task_id,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': 'Video merge task created'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def process_merge_task(task_id):
    """处理视频合并任务"""
    task_folder = os.path.join(app.config['MERGE_TASKS_FOLDER'], task_id)
    
    try:
        # 读取任务信息
        with open(os.path.join(task_folder, 'task_info.json'), 'r') as f:
            task_info = json.load(f)
        
        # 更新状态为处理中
        task_info['status'] = 'processing'
        task_info['progress'] = 10
        with open(os.path.join(task_folder, 'task_info.json'), 'w') as f:
            json.dump(task_info, f)
        
        # 准备视频文件列表
        video_files = []
        for video_id in task_info['video_ids']:
            # 查找匹配的视频文件
            matching_files = glob.glob(os.path.join(app.config['OUTPUT_FOLDER'], f"{video_id}.*"))
            if matching_files:
                video_files.append(matching_files[0])
        
        if not video_files or len(video_files) < 2:
            raise Exception("Could not find enough video files")
        
        # 创建文件列表文件
        file_list_path = os.path.join(task_folder, 'file_list.txt')
        with open(file_list_path, 'w') as f:
            for video_file in video_files:
                f.write(f"file '{os.path.abspath(video_file)}'\n")
        
        # 设置输出文件路径
        output_name = task_info['output_name']
        output_format = task_info['output_format']
        output_filename = f"{output_name}.{output_format}"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)
        
        # 更新进度
        task_info['progress'] = 30
        with open(os.path.join(task_folder, 'task_info.json'), 'w') as f:
            json.dump(task_info, f)
        
        # 使用FFmpeg合并视频
        cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', file_list_path,
            '-c', 'copy',
            '-y',  # 覆盖已存在的文件
            output_path
        ]
        
        # 执行命令
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()
        
        if process.returncode != 0:
            raise Exception(f"FFmpeg error: {stderr.decode('utf-8', errors='ignore')}")
        
        # 更新任务状态为完成
        task_info['status'] = 'completed'
        task_info['progress'] = 100
        task_info['output_file'] = output_filename
        task_info['video_url'] = url_for('stream_video_file', filename=output_filename, _external=True)
        task_info['download_url'] = url_for('download_file', filename=output_filename, _external=True)
        task_info['completed_at'] = time.time()
        
        with open(os.path.join(task_folder, 'task_info.json'), 'w') as f:
            json.dump(task_info, f)
            
    except Exception as e:
        # 更新任务状态为失败
        try:
            with open(os.path.join(task_folder, 'task_info.json'), 'r') as f:
                task_info = json.load(f)
            
            task_info['status'] = 'failed'
            task_info['error'] = str(e)
            
            with open(os.path.join(task_folder, 'task_info.json'), 'w') as f:
                json.dump(task_info, f)
        except:
            pass

@app.route('/merge_status/<task_id>', methods=['GET'])
def merge_status(task_id):
    """获取视频合并任务状态"""
    task_folder = os.path.join(app.config['MERGE_TASKS_FOLDER'], task_id)
    
    if not os.path.exists(task_folder):
        return jsonify({
            'success': False,
            'error': 'Task not found'
        }), 404
    
    try:
        with open(os.path.join(task_folder, 'task_info.json'), 'r') as f:
            task_info = json.load(f)
        
        response = {
            'success': True,
            'task_id': task_id,
            'status': task_info['status'],
            'progress': task_info['progress']
        }
        
        if task_info['status'] == 'completed':
            response['video_url'] = task_info['video_url']
            response['download_url'] = task_info['download_url']
        elif task_info['status'] == 'failed':
            response['error'] = task_info.get('error', 'Unknown error')
        
        return jsonify(response)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
@app.route('/check_reference_files', methods=['GET'])
def check_reference_files():
    """检查是否有已上传的参考图文件"""
    reference_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'reference')
    reference_count = 0
    
    if os.path.exists(reference_folder):
        for filename in os.listdir(reference_folder):
            if filename.startswith('ref_') and allowed_file(filename):
                reference_count += 1
    
    return jsonify({
        'count': reference_count
    })

@app.route('/list_merge_videos', methods=['GET'])
def list_merge_videos():
    """列出可用于合并的视频文件"""
    videos = []
    
    # 检查生成的视频文件夹
    video_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'videos')
    if os.path.exists(video_folder):
        for filename in os.listdir(video_folder):
            if filename.lower().endswith(tuple(ALLOWED_VIDEO_EXTENSIONS)):
                file_path = os.path.join(video_folder, filename)
                videos.append({
                    'name': filename,
                    'path': file_path,
                    'url': url_for('stream', filename=f'videos/{filename}'),
                    'size': os.path.getsize(file_path),
                    'created': os.path.getctime(file_path)
                })
    
    # 按创建时间排序，最新的在前面
    videos.sort(key=lambda x: x['created'], reverse=True)
    
    return jsonify({
        'videos': videos
    })

@app.route('/merge_videos_upload', methods=['POST'])
def merge_videos_upload():
    """处理上传的视频文件并创建合并任务"""
    # 检查是否有文件上传
    files = []
    for key in request.files:
        if key.startswith('video_'):
            file = request.files[key]
            if file and file.filename:
                # 保存上传的文件
                filename = secure_filename(file.filename)
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(file_path)
                files.append(file_path)
    
    # 检查是否有足够的文件
    if len(files) < 1:
        return jsonify({'error': '没有提供视频文件'}), 400
    
    # 创建任务ID和任务文件夹
    task_id = str(uuid.uuid4())
    task_folder = os.path.join(app.config['MERGE_TASKS_FOLDER'], task_id)
    os.makedirs(task_folder, exist_ok=True)
    
@app.route('/merge_task_status_v2/<task_id>', methods=['GET'])
def merge_task_status_v2(task_id):
    """获取合并任务状态"""
    task_folder = os.path.join(MERGE_TASKS_FOLDER, task_id)
    task_file = os.path.join(task_folder, 'task.json')
    
    if not os.path.exists(task_file):
        return jsonify({
            'success': False,
            'error': '任务不存在'
        }), 404
    
    try:
        with open(task_file, 'r') as f:
            task_info = json.load(f)
        
        # 返回任务状态信息
        response = {
            'success': True,
            'status': task_info.get('status', 'pending'),
            'progress': task_info.get('progress', 0)
        }
        
        # 如果任务完成，添加输出URL
        if task_info.get('status') == 'completed' and task_info.get('output_url'):
            response['output_url'] = task_info.get('output_url')
        
        # 如果任务失败，添加错误信息
        if task_info.get('status') == 'failed' and task_info.get('error'):
            response['error'] = task_info.get('error')
        
        return jsonify(response)
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# 获取其他参数
    output_name = request.form.get('output_name', 'merged_video')
    output_format = request.form.get('output_format', 'mp4')
    api_key = request.form.get('api_key', '')
    
    # 使用火山引擎视频点播服务提交合并任务
    result = submit_merge_task_async(files, output_name, output_format, api_key)
    
    if not result['success']:
        return jsonify({'error': result['error']}), 500
    
    # 保存任务信息
    task_file = os.path.join(task_folder, 'task.json')
    with open(task_file, 'w') as f:
        json.dump({
            'files': files,
            'output_name': output_name,
            'output_format': output_format,
            'vod_task_id': result['task_id'],
            'request_id': result['request_id'],
            'status': 'processing',
            'created_at': time.time()
        }, f)
    
    # 启动后台任务处理
    threading.Thread(target=process_vod_merge_task, args=(task_id,)).start()
    
    return jsonify({
        'task_id': task_id,
        'vod_task_id': result['task_id'],
        'status': 'processing'
    })
    
    # 保存任务信息
    task_file = os.path.join(task_folder, 'task.json')
    with open(task_file, 'w') as f:
        json.dump({
            'files': files,
            'output_name': output_name,
            'output_format': output_format,
            'api_key': api_key,
            'status': 'pending',
            'created_at': time.time()
        }, f)
    
    # 启动后台任务处理视频合并
    import threading
    threading.Thread(target=process_merge_files_task, args=(task_id,)).start()
    
    return jsonify({
        'success': True,
        'task_id': task_id
    })

def process_merge_files_task(task_id):
    """处理上传文件的视频合并任务"""
    task_folder = os.path.join(app.config['MERGE_TASKS_FOLDER'], task_id)
    task_file = os.path.join(task_folder, 'task.json')
    
    try:
        # 读取任务信息
        with open(task_file, 'r') as f:
            task_data = json.load(f)
        
        files = task_data['files']
        output_name = task_data['output_name']
        output_format = task_data['output_format']
        
        # 更新任务状态为处理中
        task_data['status'] = 'processing'
        with open(task_file, 'w') as f:
            json.dump(task_data, f)
        
        # 准备合并文件列表
        video_list_file = os.path.join(task_folder, 'videos.txt')
        with open(video_list_file, 'w') as f:
            for file_path in files:
                if os.path.exists(file_path):
                    f.write(f"file '{file_path}'\n")
        
        # 设置输出文件路径
        output_file = os.path.join(app.config['OUTPUT_FOLDER'], f"{output_name}.{output_format}")
        
        # 使用FFmpeg合并视频
        cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', video_list_file,
            '-c', 'copy',
            output_file
        ]
        
        process = subprocess.run(cmd, capture_output=True, text=True)
        
        if process.returncode == 0:
            # 合并成功
            video_url = url_for('static', filename=f'outputs/{output_name}.{output_format}', _external=True)
            download_url = url_for('download_file', filename=f'{output_name}.{output_format}', _external=True)
            
            # 更新任务状态为完成
            task_data['status'] = 'completed'
            task_data['video_url'] = video_url
            task_data['download_url'] = download_url
            with open(task_file, 'w') as f:
                json.dump(task_data, f)
        else:
            # 合并失败
            task_data['status'] = 'failed'
            task_data['error'] = process.stderr
            with open(task_file, 'w') as f:
                json.dump(task_data, f)
    
    except Exception as e:
        # 处理异常
        try:
            task_data['status'] = 'failed'
            task_data['error'] = str(e)
            with open(task_file, 'w') as f:
                json.dump(task_data, f)
        except:
            pass

@app.route('/merge_videos_task', methods=['POST'])
def merge_videos_task():
    """创建视频合并任务"""
    if not request.json:
        return jsonify({'error': '无效的请求数据'}), 400
    
    # 获取视频列表
    video_ids = request.json.get('video_ids', [])
    videos = request.json.get('videos', [])
    
    # 检查是否提供了视频
    if (not video_ids or len(video_ids) < 1) and (not videos or len(videos) < 1):
        return jsonify({'error': '没有提供视频文件'}), 400
    
    # 如果只提供了video_ids，转换为videos列表
    if not videos and video_ids:
        videos = video_ids
    
    # 创建任务ID和任务文件夹
    task_id = str(uuid.uuid4())
    task_folder = os.path.join(MERGE_TASKS_FOLDER, task_id)
    os.makedirs(task_folder, exist_ok=True)
    
    # 获取其他参数
    output_name = request.json.get('output_name', f'merged_{task_id}')
    output_format = request.json.get('output_format', 'mp4')
    resolution = request.json.get('resolution', '1080x1080')
    api_key = request.json.get('api_key', '')
    
    # 规范化分辨率
    resolution = normalize_ratio(resolution)
    
    # 准备任务信息
    task_info = {
        'id': task_id,
        'videos': videos,
        'output_name': output_name,
        'output_format': output_format,
        'resolution': resolution,
        'api_key': api_key,
        'status': 'pending',
        'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'progress': 0
    }
    
    # 使用火山引擎视频点播服务提交合并任务
    try:
        vod_service = get_vod_service(api_key)
        vod_task_id = submit_merge_task_async(vod_service, videos, output_name, output_format, resolution)
        
        # 保存火山引擎任务ID
        task_info['vod_task_id'] = vod_task_id
        task_info['status'] = 'processing'
        
        # 保存任务信息
        task_file = os.path.join(task_folder, 'task.json')
        with open(task_file, 'w') as f:
            json.dump(task_info, f)
        
        # 启动后台线程处理任务
        thread = threading.Thread(target=process_vod_merge_task, args=(task_id,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'task_id': task_id,
            'status': 'processing'
        })
    
    except Exception as e:
        # 记录错误信息
        task_info['status'] = 'failed'
        task_info['error'] = str(e)
        
        task_file = os.path.join(task_folder, 'task.json')
        with open(task_file, 'w') as f:
            json.dump(task_info, f)
        
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    
    # 获取其他参数
    output_name = request.json.get('output_name', 'merged_video')
    output_format = request.json.get('output_format', 'mp4')
    api_key = request.json.get('api_key', '')
    
    # 使用火山引擎视频点播服务提交合并任务
    result = submit_merge_task_async(videos, output_name, output_format, api_key)
    
    if not result['success']:
        return jsonify({'error': result['error']}), 500
    
    # 保存任务信息
    task_file = os.path.join(task_folder, 'task.json')
    with open(task_file, 'w') as f:
        json.dump({
            'videos': videos,
            'output_name': output_name,
            'output_format': output_format,
            'vod_task_id': result['task_id'],
            'request_id': result['request_id'],
            'status': 'processing',
            'created_at': time.time()
        }, f)
    
    # 启动后台任务处理
    threading.Thread(target=process_vod_merge_task, args=(task_id,)).start()
    
    return jsonify({
        'task_id': task_id,
        'vod_task_id': result['task_id'],
        'status': 'processing'
    })

def process_merge_task(task_id):
    """处理视频合并任务"""
    task_folder = os.path.join(MERGE_TASKS_FOLDER, task_id)
    task_file = os.path.join(task_folder, 'task.json')
    
    try:
        # 读取任务信息
        with open(task_file, 'r') as f:
            task_data = json.load(f)
        
        videos = task_data['videos']
        
        # 更新任务状态为处理中
        task_data['status'] = 'processing'
        with open(task_file, 'w') as f:
            json.dump(task_data, f)
        
        # 准备合并文件列表
        video_list_file = os.path.join(task_folder, 'videos.txt')
        with open(video_list_file, 'w') as f:
            for video in videos:
                # 确保视频路径存在
                video_path = video['path']
                if os.path.exists(video_path):
                    f.write(f"file '{video_path}'\n")
        
        # 设置输出文件路径
        output_file = os.path.join(task_folder, 'merged.mp4')
        
        # 使用FFmpeg合并视频
        cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', video_list_file,
            '-c', 'copy',
            output_file
        ]
        
        # 执行FFmpeg命令
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()
        
        if process.returncode != 0:
            # 合并失败
            task_data['status'] = 'failed'
            task_data['error'] = stderr.decode('utf-8', errors='ignore')
        else:
            # 合并成功
            task_data['status'] = 'completed'
            task_data['output_file'] = output_file
            task_data['output_url'] = url_for('stream', filename=f'merge_tasks/{task_id}/merged.mp4', _external=True)
            task_data['completed_at'] = time.time()
        
        # 更新任务状态
        with open(task_file, 'w') as f:
            json.dump(task_data, f)
            
    except Exception as e:
        # 处理异常
        try:
            task_data = {'status': 'failed', 'error': str(e)}
            with open(task_file, 'w') as f:
                json.dump(task_data, f)
        except:
            pass

def merge_audio_video(video_url, audio_url, output_format='mp4', api_key=None):
    """合并单个音频和视频文件
    
    Args:
        video_url: 视频文件URL
        audio_url: 音频文件URL
        output_format: 输出格式，默认为mp4
        api_key: API密钥，可选
        
    Returns:
        dict: 包含任务ID和状态的字典
    """
    try:
        # 使用提供的API Key或环境变量中的API Key
        api_key = api_key or os.environ.get('VOD_API_KEY', '')
        if not api_key:
            return {'success': False, 'error': 'API Key不能为空'}
        
        # 获取VOD服务实例
        vod_service = get_vod_service(api_key)
        
        # 构建请求数据
        data = {
            'video_url': video_url,
            'audio_url': audio_url,
            'output_format': output_format
        }
        
        # 发送请求
        # 注意：这里简化处理，实际应使用火山引擎提供的音视频合并API
        # 例如：response = vod_service.create_audio_merge_task(data)
        
        # 模拟响应
        # 实际应用中应替换为真实API调用
        task_id = f"audio_merge_{uuid.uuid4().hex}"
        
        return {
            'success': True,
            'task_id': task_id,
            'status': 'submitted'
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

def merge_multiple_videos(video_urls, output_format='mp4', audio_config=None, api_key=None):
    """合并多个已有声音的视频
    
    Args:
        video_urls: 视频文件URL列表
        output_format: 输出格式，默认为mp4
        audio_config: 音频配置，可选，例如：{'normalize': True, 'volume': 1.0}
        api_key: API密钥，可选
        
    Returns:
        dict: 包含任务ID和状态的字典
    """
    try:
        # 使用提供的API Key或环境变量中的API Key
        api_key = api_key or os.environ.get('VOD_API_KEY', '')
        if not api_key:
            return {'success': False, 'error': 'API Key不能为空'}
        
        # 获取VOD服务实例
        vod_service = get_vod_service(api_key)
        
        # 构建请求数据
        data = {
            'video_urls': video_urls,
            'output_format': output_format
        }
        
        # 添加音频配置（如果有）
        if audio_config:
            data['audio_config'] = audio_config
        
        # 发送请求
        # 注意：这里简化处理，实际应使用火山引擎提供的视频合并API
        # 例如：response = vod_service.create_video_merge_task(data)
        
        # 模拟响应
        # 实际应用中应替换为真实API调用
        task_id = f"video_merge_{uuid.uuid4().hex}"
        
        return {
            'success': True,
            'task_id': task_id,
            'status': 'submitted'
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

@app.route('/audio_video_merge_v2', methods=['POST'])
def audio_video_merge_v2():
    """处理单个音频和视频的合并请求"""
    try:
        # 获取API Key（如果有）
        api_key = request.form.get('api_key', '')
        
        # 检查是否有视频URL
        video_url = request.form.get('video_url')
        if not video_url:
            return jsonify({
                'success': False,
                'error': '缺少视频URL'
            }), 400
            
        # 检查是否有音频URL
        audio_url = request.form.get('audio_url')
        if not audio_url:
            return jsonify({
                'success': False,
                'error': '缺少音频URL'
            }), 400
        
        # 获取输出格式
        output_format = request.form.get('output_format', 'mp4')
        
        # 创建任务ID和任务文件夹
        task_id = f"audio_merge_{uuid.uuid4().hex}"
        task_folder = os.path.join(MERGE_TASKS_FOLDER, task_id)
        os.makedirs(task_folder, exist_ok=True)
        
        # 准备任务信息
        task_info = {
            'id': task_id,
            'type': 'audio_video_merge',
            'status': 'pending',
            'created_at': time.time(),
            'video_url': video_url,
            'audio_url': audio_url,
            'output_format': output_format,
            'api_key': api_key
        }
        
        # 保存任务信息
        task_file = os.path.join(task_folder, 'task.json')
        with open(task_file, 'w') as f:
            json.dump(task_info, f)
        
        # 提交合并任务
        result = merge_audio_video(video_url, audio_url, output_format, api_key)
        
        if not result['success']:
            # 更新任务状态为失败
            task_info['status'] = 'failed'
            task_info['error'] = result.get('error', '提交任务失败')
            with open(task_file, 'w') as f:
                json.dump(task_info, f)
            
            return jsonify({
                'success': False,
                'error': result.get('error', '提交任务失败')
            }), 500
        
        # 更新任务信息
        task_info['vod_task_id'] = result.get('task_id', '')
        task_info['status'] = 'processing'
        with open(task_file, 'w') as f:
            json.dump(task_info, f)
        
        # 启动后台线程处理任务
        thread = threading.Thread(target=process_vod_merge_task, args=(task_id,))
        thread.daemon = True
        thread.start()
        
        # 返回任务ID
        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '任务已提交'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/audio_video_merge', methods=['POST'])
def audio_video_merge():
    """处理音频和视频合并请求"""
    try:
        # 获取API Key（如果有）
        api_key = request.form.get('api_key', '')
        
        # 检查是否有视频URL
        video_url = request.form.get('video_url')
        if not video_url:
            return jsonify({
                'success': False,
                'error': '缺少视频URL'
            }), 400
            
        # 检查是否有音频URL
        audio_url = request.form.get('audio_url')
        if not audio_url:
            return jsonify({
                'success': False,
                'error': '缺少音频URL'
            }), 400
        
        # 获取输出格式
        output_format = request.form.get('output_format', 'mp4')
        
        # 获取合并引擎
        merge_engine = request.form.get('merge_engine', 'default')
        
        # 创建任务ID和任务文件夹
        task_id = f"audio_video_merge_{uuid.uuid4().hex}"
        task_folder = os.path.join(MERGE_TASKS_FOLDER, task_id)
        os.makedirs(task_folder, exist_ok=True)
        
        # 准备任务信息
        task_info = {
            'id': task_id,
            'type': 'audio_video_merge',
            'status': 'pending',
            'created_at': time.time(),
            'video_url': video_url,
            'audio_url': audio_url,
            'output_format': output_format,
            'merge_engine': merge_engine,
            'api_key': api_key
        }
        
        # 保存任务信息
        task_file = os.path.join(task_folder, 'task.json')
        with open(task_file, 'w') as f:
            json.dump(task_info, f)
        
        # 提交合并任务
        result = merge_audio_video(video_url, audio_url, output_format, api_key)
        
        if not result['success']:
            # 更新任务状态为失败
            task_info['status'] = 'failed'
            task_info['error'] = result.get('error', '提交任务失败')
            with open(task_file, 'w') as f:
                json.dump(task_info, f)
            
            return jsonify({
                'success': False,
                'error': result.get('error', '提交任务失败')
            }), 500
        
        # 更新任务信息
        task_info['vod_task_id'] = result.get('task_id', '')
        task_info['status'] = 'processing'
        with open(task_file, 'w') as f:
            json.dump(task_info, f)
        
        # 启动后台线程处理任务
        thread = threading.Thread(target=process_vod_merge_task, args=(task_id,))
        thread.daemon = True
        thread.start()
        
        # 返回任务ID
        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '任务已提交'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def merge_audio_video(video_url, audio_url, output_format='mp4', api_key=None):
    """
    调用火山引擎视频点播服务API合并单个音频和视频文件
    
    Args:
        video_url: 视频文件URL
        audio_url: 音频文件URL
        output_format: 输出文件格式，默认为mp4
        api_key: API密钥，可选
        
    Returns:
        dict: 包含任务提交结果的字典
    """
    try:
        # 获取VOD服务实例
        vod_instance = get_vod_instance(api_key)
        if not vod_instance:
            return {
                'success': False,
                'error': '无法获取VOD服务实例，请检查API密钥'
            }
        
        # 构建请求数据
        request_data = {
            'MediaProcessTask': {
                'AudioVideoMergeTask': {
                    'VideoUrl': video_url,
                    'AudioUrl': audio_url,
                    'OutputFormat': output_format
                }
            }
        }
        
        # 调用API
        # 注意：这里是模拟响应，实际应调用火山引擎API
        # response = vod_instance.submit_media_process_job(request_data)
        
        # 模拟响应
        task_id = f"vod_av_merge_{uuid.uuid4().hex}"
        
        return {
            'success': True,
            'task_id': task_id,
            'message': '任务已提交'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f'提交音频视频合并任务失败: {str(e)}'
        }

def merge_multiple_videos(video_urls, output_format='mp4', audio_config=None, api_key=None):
    """
    调用火山引擎视频点播服务API合并多个已有声音的视频
    
    Args:
        video_urls: 视频文件URL列表
        output_format: 输出文件格式，默认为mp4
        audio_config: 音频配置，可选
        api_key: API密钥，可选
        
    Returns:
        dict: 包含任务提交结果的字典
    """
    try:
        # 获取VOD服务实例
        vod_instance = get_vod_instance(api_key)
        if not vod_instance:
            return {
                'success': False,
                'error': '无法获取VOD服务实例，请检查API密钥'
            }
        
        # 构建请求数据
        request_data = {
            'MediaProcessTask': {
                'MultipleVideosMergeTask': {
                    'VideoUrls': video_urls,
                    'OutputFormat': output_format
                }
            }
        }
        
        # 添加音频配置（如果有）
        if audio_config:
            request_data['MediaProcessTask']['MultipleVideosMergeTask']['AudioConfig'] = audio_config
        
        # 调用API
        # 注意：这里是模拟响应，实际应调用火山引擎API
        # response = vod_instance.submit_media_process_job(request_data)
        
        # 模拟响应
        task_id = f"vod_multi_merge_{uuid.uuid4().hex}"
        
        return {
            'success': True,
            'task_id': task_id,
            'message': '任务已提交'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f'提交多视频合并任务失败: {str(e)}'
        }

@app.route('/multiple_videos_merge', methods=['POST'])
def multiple_videos_merge():
    """处理多个已有声音的视频合并请求"""
    try:
        # 获取API Key（如果有）
        api_key = request.form.get('api_key', '')
        
        # 检查是否有视频URL列表
        video_urls = request.form.get('video_urls')
        if not video_urls:
            return jsonify({
                'success': False,
                'error': '缺少视频URL列表'
            }), 400
            
        # 解析视频URL列表
        try:
            video_urls = json.loads(video_urls)
            if not isinstance(video_urls, list) or len(video_urls) == 0:
                raise ValueError("视频URL列表格式不正确")
        except Exception:
            return jsonify({
                'success': False,
                'error': '视频URL列表格式不正确'
            }), 400
        
        # 获取输出格式
        output_format = request.form.get('output_format', 'mp4')
        
        # 获取音频配置
        audio_config = request.form.get('audio_config')
        if audio_config:
            try:
                audio_config = json.loads(audio_config)
            except Exception:
                return jsonify({
                    'success': False,
                    'error': '音频配置格式不正确'
                }), 400
        
        # 获取合并引擎
        merge_engine = request.form.get('merge_engine', 'default')
        
        # 创建任务ID和任务文件夹
        task_id = f"videos_merge_{uuid.uuid4().hex}"
        task_folder = os.path.join(MERGE_TASKS_FOLDER, task_id)
        os.makedirs(task_folder, exist_ok=True)
        
        # 准备任务信息
        task_info = {
            'id': task_id,
            'type': 'multiple_videos_merge',
            'status': 'pending',
            'created_at': time.time(),
            'video_urls': video_urls,
            'output_format': output_format,
            'audio_config': audio_config,
            'merge_engine': merge_engine,
            'api_key': api_key
        }
        
        # 保存任务信息
        task_file = os.path.join(task_folder, 'task.json')
        with open(task_file, 'w') as f:
            json.dump(task_info, f)
        
        # 提交合并任务
        result = merge_multiple_videos(video_urls, output_format, audio_config, api_key)
        
        if not result['success']:
            # 更新任务状态为失败
            task_info['status'] = 'failed'
            task_info['error'] = result.get('error', '提交任务失败')
            with open(task_file, 'w') as f:
                json.dump(task_info, f)
            
            return jsonify({
                'success': False,
                'error': result.get('error', '提交任务失败')
            }), 500
        
        # 更新任务信息
        task_info['vod_task_id'] = result.get('task_id', '')
        task_info['status'] = 'processing'
        with open(task_file, 'w') as f:
            json.dump(task_info, f)
        
        # 启动后台线程处理任务
        # 定义 process_vod_merge_task 函数
        def process_vod_merge_task(task_id):
            """后台线程：轮询火山引擎任务状态，完成后下载视频并更新本地任务记录"""
            task_dir = os.path.join(app.config['MERGE_TASKS_FOLDER'], task_id)
            task_file = os.path.join(task_dir, 'task.json')
            
            # 读取任务配置
            with open(task_file, 'r', encoding='utf-8') as f:
                task_cfg = json.load(f)
            
            api_key = task_cfg.get('api_key')
            max_wait = 1800  # 30 分钟上限
            
            start = time.time()
            while time.time() - start < max_wait:
                status_data = get_task_status(task_id, api_key)
                if not status_data.get('success'):
                    # 查询失败，标记异常并退出
                    task_cfg['status'] = 'FAILED'
                    task_cfg['error'] = status_data.get('error', 'Unknown error')
                    break
                
                status = status_data.get('status', 'PROCESSING')
                task_cfg['status'] = status
                task_cfg['progress'] = status_data.get('progress', 0)
                
                if status == 'FINISHED':
                    # 任务完成，下载视频
                    output_url = status_data.get('output_url')
                    if output_url:
                        output_path = os.path.join(task_dir, 'output.mp4')
                        if download_video(output_url, output_path):
                            task_cfg['output_path'] = output_path
                            task_cfg['status'] = 'SUCCESS'
                        else:
                            task_cfg['status'] = 'FAILED'
                            task_cfg['error'] = 'Download failed'
                    else:
                        task_cfg['status'] = 'FAILED'
                        task_cfg['error'] = 'No output URL'
                    break
                
                if status == 'FAILED':
                    task_cfg['error'] = status_data.get('error', 'Task failed on server')
                    break
                
                # 保存中间状态
                with open(task_file, 'w', encoding='utf-8') as f:
                    json.dump(task_cfg, f, ensure_ascii=False, indent=2)
                
                time.sleep(5)
            
            else:
                # 超时
                task_cfg['status'] = 'TIMEOUT'
                task_cfg['error'] = 'Polling timeout'
            
            # 最终状态落盘
            with open(task_file, 'w', encoding='utf-8') as f:
                json.dump(task_cfg, f, ensure_ascii=False, indent=2)

        thread = threading.Thread(target=process_vod_merge_task, args=(task_id,))
        thread.daemon = True
        thread.start()
        
        # 返回任务ID
        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '任务已提交'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/merge_task_status/<task_id>', methods=['GET'])
def merge_task_status(task_id):
    """获取视频合并任务的状态"""
    task_file = os.path.join(MERGE_TASKS_FOLDER, task_id, 'task.json')
    
    if not os.path.exists(task_file):
        return jsonify({'error': '任务不存在'}), 404
    
    try:
        with open(task_file, 'r') as f:
            task_data = json.load(f)
        
        return jsonify(task_data)
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)