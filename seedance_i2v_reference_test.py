#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BytePlus ModelArk Seedance 参考图生视频 测试脚本
- 创建任务 (reference image to video)
- 轮询查询任务状态，直到成功/失败
- 成功后下载视频到本地

用法：
  1) 安装依赖：pip install -r requirements.txt
  2) 设置环境变量：PowerShell 中执行 $env:ARK_API_KEY='YOUR_API_KEY'
  3) 运行（传入1~2张图片URL）：
     - 第一张：主图（主体）
     - 第二张（可选）：参考图-物品
     示例：
       python seedance_i2v_reference_test.py https://main-subject.jpg https://item-ref.jpg

说明：
  - 若仅传入1张，则只作为主体参考图，仍会生成“缓慢弯腰捡起地上物品”的动作（未绑定特定物品）。
  - 若传入2张，动作为“主体缓慢弯腰，捡起参考图2中的物品”。
  - 参数固定为：--ratio 1092x1080 --dur 5 --fps 24 --wm false。

注意：不要把真实的长期密钥硬编码在代码中。此脚本仅用于本地测试演示。
"""
import os
import time
import json
import sys
from typing import List, Optional

import requests
import argparse
import tempfile
import shutil
from urllib.parse import urlparse, urlunparse, urlencode, parse_qsl

BASE_URL = os.environ.get("ARK_BASE_URL", "https://ark.ap-southeast.bytepluses.com/api/v3")
CREATE_TASK_URL = f"{BASE_URL}/contents/generations/tasks"
GET_TASK_URL_TMPL = f"{BASE_URL}/contents/generations/tasks/{{task_id}}"

# API Key 从环境变量注入，避免硬编码
DEFAULT_API_KEY = os.environ.get("ARK_API_KEY", "")

# 示例参考图 URL（可替换为你自己的1~2张参考图）
DEFAULT_REFERENCE_IMAGES = [
    "https://ark-project.tos-cn-beijing.volces.com/doc_image/i2v_foxrgirl.png"
]

# 输出目录
OUTPUT_DIR = os.path.abspath(os.path.join(os.getcwd(), "outputs"))


def create_reference_i2v_task(
    api_key: str,
    model: str = "seedance-1-0-lite-i2v-250428",
    prompt: str = "主体缓慢弯下腰，捡起地上的物品 --ratio 1092x1080 --dur 5 --fps 24 --wm false",
    reference_image_urls: Optional[List[str]] = None,
    callback_url: Optional[str] = None,
) -> str:
    """创建参考图生视频任务，返回 task id。"""
    if not reference_image_urls:
        raise ValueError("reference_image_urls 不能为空，至少提供 1 张图片 URL（第一张为主图，第二张可选为物品参考图）")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    content: List[dict] = []

    # 1) 文本提示 + 参数（固定）
    content.append({
        "type": "text",
        "text": prompt,
    })

    # 2) 第一张：主图（主体参考）
    # 3) 第二张（可选）：物品参考
    for idx, url in enumerate(reference_image_urls, start=1):
        content.append({
            "type": "image_url",
            "image_url": {"url": url},
            # API 当前统一使用 reference_image 角色；
            # 第1张作为主体参考；第2张若提供，作为物品参考（通过文本提示指定用途）。
            "role": "reference_image",
        })

    payload = {
        "model": model,
        "content": content,
    }
    if callback_url:
        payload["callback_url"] = callback_url

    resp = requests.post(CREATE_TASK_URL, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"创建任务失败: HTTP {resp.status_code} {resp.text}")

    data = resp.json()
    task_id = data.get("id") or data.get("task_id") or data.get("result", {}).get("id")
    if not task_id:
        raise RuntimeError(f"未获取到任务ID，返回: {json.dumps(data, ensure_ascii=False)}")

    print(f"已创建任务: {task_id}")
    return task_id


def get_task(api_key: str, task_id: str) -> dict:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    url = GET_TASK_URL_TMPL.format(task_id=task_id)
    resp = requests.get(url, headers=headers, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"查询任务失败: HTTP {resp.status_code} {resp.text}")
    return resp.json()


def poll_task_until_done(api_key: str, task_id: str, interval: int = 8, timeout_sec: int = 30 * 60) -> dict:
    """轮询任务状态直到 succeeded/failed 或超时，返回最终响应 JSON。"""
    t0 = time.time()
    last_status = None
    while True:
        data = get_task(api_key, task_id)
        status = data.get("status") or data.get("result", {}).get("status")
        if status != last_status:
            print(f"任务状态: {status}")
            last_status = status

        if status in {"succeeded", "failed"}:
            return data

        if time.time() - t0 > timeout_sec:
            raise TimeoutError("轮询超时")

        time.sleep(interval)


def ensure_dir(path: str):
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)


def download_file(url: str, filepath: str):
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(filepath, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)


def _is_url(s: str) -> bool:
    try:
        u = urlparse(s)
        return u.scheme in {"http", "https"} and bool(u.netloc)
    except Exception:
        return False


def _onedrive_force_download(url: str) -> str:
    """如果是 OneDrive/1drv.ms 链接，尝试追加 download=1 以获得直链下载。"""
    try:
        u = urlparse(url)
        host = (u.netloc or "").lower()
        if ("1drv.ms" in host or "onedrive.live.com" in host):
            q = dict(parse_qsl(u.query, keep_blank_values=True))
            if "download" not in q:
                q["download"] = "1"
                new_query = urlencode(q)
                return urlunparse((u.scheme, u.netloc, u.path, u.params, new_query, u.fragment))
    except Exception:
        pass
    return url


def _filename_from_response(resp: requests.Response, fallback: str) -> str:
    cd = resp.headers.get("Content-Disposition", "")
    # very simple parse
    if "filename=" in cd:
        name = cd.split("filename=")[-1].strip('"; ')
        if name:
            return name
    return fallback


def download_url_to_temp(url: str, temp_dir: str) -> str:
    url = _onedrive_force_download(url)
    with requests.get(url, stream=True, timeout=120, allow_redirects=True) as r:
        r.raise_for_status()
        # guess filename
        parsed = urlparse(r.url)
        fallback = os.path.basename(parsed.path) or f"image_{int(time.time()*1000)}"
        filename = _filename_from_response(r, fallback)
        # ensure extension reasonable
        if not os.path.splitext(filename)[1]:
            # try from content-type
            ct = r.headers.get("Content-Type", "").lower()
            if "jpeg" in ct:
                filename += ".jpg"
            elif "png" in ct:
                filename += ".png"
            elif "webp" in ct:
                filename += ".webp"
            else:
                filename += ".bin"
        out_path = os.path.join(temp_dir, filename)
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
    return out_path


def upload_to_transfersh(file_path: str) -> str:
    filename = os.path.basename(file_path)
    url = f"https://transfer.sh/{filename}"
    with open(file_path, "rb") as f:
        resp = requests.put(url, data=f, timeout=180)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"transfer.sh 上传失败: HTTP {resp.status_code} {resp.text}")
    uploaded = resp.text.strip()
    if not uploaded.startswith("http"):
        raise RuntimeError(f"transfer.sh 返回异常: {uploaded}")
    return uploaded


def upload_to_catbox(file_path: str) -> str:
    api = "https://catbox.moe/user/api.php"
    files = {"fileToUpload": open(file_path, "rb")}
    data = {"reqtype": "fileupload"}
    try:
        resp = requests.post(api, data=data, files=files, timeout=180)
    finally:
        try:
            files["fileToUpload"].close()
        except Exception:
            pass
    if resp.status_code != 200:
        raise RuntimeError(f"catbox.moe 上传失败: HTTP {resp.status_code} {resp.text}")
    url = resp.text.strip()
    if not url.startswith("http"):
        raise RuntimeError(f"catbox.moe 返回异常: {url}")
    return url


def upload_to_0x0(file_path: str) -> str:
    api = "https://0x0.st"
    files = {"file": open(file_path, "rb")}
    try:
        resp = requests.post(api, files=files, timeout=180)
    finally:
        try:
            files["file"].close()
        except Exception:
            pass
    if resp.status_code != 200:
        raise RuntimeError(f"0x0.st 上传失败: HTTP {resp.status_code} {resp.text}")
    url = resp.text.strip()
    if not url.startswith("http"):
        raise RuntimeError(f"0x0.st 返回异常: {url}")
    return url


def rehost_images(images: List[str], method: str) -> List[str]:
    """将本地路径或非直链 URL 统一处理为可直连的 image/* 链接。
    method: "transfer.sh" | "catbox" | "0x0" | "auto"
    """
    if method in {"none", None}:  # 不处理
        return images

    temp_dir = tempfile.mkdtemp(prefix="i2v_")
    output_urls: List[str] = []
    try:
        for item in images:
            local_path = item
            if _is_url(item):
                try:
                    local_path = download_url_to_temp(item, temp_dir)
                except Exception as e:
                    raise RuntimeError(f"下载 URL 失败: {item} -> {e}")
            else:
                if not os.path.isfile(local_path):
                    raise FileNotFoundError(f"本地文件不存在: {local_path}")

            last_err = None
            if method in {"transfer.sh", "auto"}:
                try:
                    url = upload_to_transfersh(local_path)
                    output_urls.append(url)
                    continue
                except Exception as e:
                    last_err = e
                    if method == "transfer.sh":
                        raise RuntimeError(f"上传到 transfer.sh 失败: {local_path} -> {e}")
            if method in {"catbox", "auto"}:
                try:
                    url = upload_to_catbox(local_path)
                    output_urls.append(url)
                    continue
                except Exception as e:
                    last_err = e
                    if method == "catbox":
                        raise RuntimeError(f"上传到 catbox.moe 失败: {local_path} -> {e}")
            if method in {"0x0", "auto"}:
                try:
                    url = upload_to_0x0(local_path)
                    output_urls.append(url)
                    continue
                except Exception as e:
                    last_err = e
                    raise RuntimeError(f"上传到 0x0.st 失败: {local_path} -> {e}")
            if last_err is not None:
                raise last_err
    finally:
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass
    return output_urls


def main():
    api_key = DEFAULT_API_KEY

    if not api_key:
        print("未检测到环境变量 ARK_API_KEY。请在当前 PowerShell 终端执行：\n  $env:ARK_API_KEY='YOUR_API_KEY'\n然后重新运行脚本。")
        sys.exit(1)

    parser = argparse.ArgumentParser(
        description="BytePlus ModelArk Seedance 参考图生视频：第1张为主图，第2张(可选)为物品参考；支持 --ratio/--dur/--fps/--wm 配置。"
    )
    parser.add_argument(
        "images",
        nargs='*',
        default=DEFAULT_REFERENCE_IMAGES,
        help="1~2 个图片URL或本地路径，顺序为：主图[必选]、物品参考图[可选]"
    )
    parser.add_argument("--ratio", default="1092x1080", help="画面宽高比，例如 1092x1080")
    parser.add_argument("--dur", type=int, default=5, help="视频时长（秒）")
    parser.add_argument("--fps", type=int, default=24, help="视频帧率")
    parser.add_argument("--wm", choices=["true", "false"], default="false", help="是否加水印：true/false，默认 false")
    parser.add_argument(
        "--rehost",
        choices=["none", "transfer.sh", "catbox", "0x0", "auto"],
        default="none",
        help="输入为本地或非直链时，是否转存获取直链：none(默认)/transfer.sh/catbox/0x0/auto(自动降级)"
    )
    args = parser.parse_args()

    refs = args.images
    if not (1 <= len(refs) <= 2):
        parser.error("请提供 1~2 个图片路径或URL：第一张主图，第二张（可选）物品参考图。示例：python seedance_i2v_reference_test.py C:/img/main.jpg C:/img/item.jpg 或 https://... https://...")

    if args.rehost != "none":
        print(f"启用临时托管: {args.rehost}，开始处理输入文件...")
        try:
            refs = rehost_images(refs, method=args.rehost)
        except Exception as e:
            print(f"临时托管处理失败: {e}")
            sys.exit(1)
        print("临时托管完成。")

    base_prompt = (
        "主体缓慢弯下腰，捡起来自参考图2中的物品" if len(refs) >= 2 else "主体缓慢弯下腰，捡起地上的物品"
    )
    prompt_text = f"{base_prompt} --ratio {args.ratio} --dur {args.dur} --fps {args.fps} --wm {args.wm}"

    print("创建参考图生视频任务...")
    try:
        task_id = create_reference_i2v_task(
            api_key=api_key,
            reference_image_urls=refs,
            prompt=prompt_text,
        )
    except Exception as e:
        print(f"创建任务失败: {e}")
        sys.exit(2)

    print("开始轮询任务进度...")
    try:
        final_data = poll_task_until_done(api_key, task_id)
    except Exception as e:
        print(f"轮询失败: {e}")
        sys.exit(3)

    status = final_data.get("status") or final_data.get("result", {}).get("status")
    content = final_data.get("content") or final_data.get("result", {}).get("content") or {}
    video_url = content.get("video_url")

    print(f"最终状态: {status}")
    if status != "succeeded":
        print(json.dumps(final_data, ensure_ascii=False, indent=2))
        sys.exit(4)

    if not video_url:
        print("未返回视频下载地址。完整返回如下：")
        print(json.dumps(final_data, ensure_ascii=False, indent=2))
        sys.exit(5)

    ensure_dir(OUTPUT_DIR)
    out_path = os.path.join(OUTPUT_DIR, f"{task_id}.mp4")
    print(f"下载视频到: {out_path}")
    try:
        download_file(video_url, out_path)
        print("下载完成。")
    except Exception as e:
        print(f"下载失败: {e}")
        sys.exit(6)


if __name__ == "__main__":
    main()