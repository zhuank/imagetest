import os
import json
import requests
from PIL import Image

BASE_URL = "http://127.0.0.1:5000"


def create_png(path: str, color=(255, 0, 0, 255), size=(8, 8)):
    img = Image.new("RGBA", size, color)
    img.save(path, format="PNG")


def assert_generate(endpoint: str, payload: dict):
    url = f"{BASE_URL}/{endpoint}"
    r = requests.post(url, json=payload)
    print(f"/{endpoint}:", r.status_code)
    print(r.text)

    # 分三种情况断言：
    # 1) 没有配置 API Key -> 400 且包含 "API key required"
    # 2) 配置了无效的 API Key -> 后端会尝试创建任务，最终返回 500，包含 401/AuthenticationError 提示
    # 3) 配置了有效 API Key -> 200/201/202，返回 JSON，包含 task_id 或 success
    if r.status_code == 400:
        assert "API key required" in r.text, "缺少 API Key 时应返回 400 并提示 API key required"
    elif r.status_code in (200, 201, 202):
        data = r.json()
        assert isinstance(data, dict)
        assert data.get("success") is True or data.get("task_id"), "当 API Key 有效时，应返回 success 或 task_id"
    elif r.status_code == 500:
        # 无效 Key 时，Ark 返回 401，后端聚合为 500 错误，包含 AuthenticationError / doesn't exist
        assert ("AuthenticationError" in r.text) or ("doesn't exist" in r.text) or ("Error code: 401" in r.text), \
            "无效 API Key 时应返回 500，并包含 401/AuthenticationError 提示"
    else:
        raise AssertionError(f"未预期的状态码: {r.status_code}")


def main():
    # 1) 准备测试图片
    img1 = "test_first.png"
    img2 = "test_ref.png"
    create_png(img1)
    create_png(img2, color=(0, 255, 0, 255))

    # 2) 上传首尾帧（只上传首帧即可）
    with open(img1, "rb") as f1:
        files = {"first_frame": (img1, f1, "image/png")}
        r = requests.post(f"{BASE_URL}/upload_firstlast", files=files)
    print("/upload_firstlast status:", r.status_code)
    print(r.text)
    assert r.status_code == 200, "upload_firstlast 应返回 200"
    data = r.json()
    assert data.get("success") is True, "upload_firstlast 返回应包含 success=true"

    # 3) 检查后端是否检测到已上传的首尾帧
    r = requests.get(f"{BASE_URL}/check_firstlast_files")
    print("/check_firstlast_files:", r.status_code, r.text)
    assert r.status_code == 200
    info = r.json()
    assert info.get("success") is True
    assert info.get("has_first_frame") is True, "应检测到已上传首帧"

    # 4) 上传参考图（两张）
    with open(img1, "rb") as fa, open(img2, "rb") as fb:
        files = [
            ("reference_images", (img1, fa, "image/png")),
            ("reference_images", (img2, fb, "image/png")),
        ]
        r = requests.post(f"{BASE_URL}/upload_reference", files=files)
    print("/upload_reference status:", r.status_code)
    print(r.text)
    assert r.status_code == 200, "upload_reference 应返回 200"
    data = r.json()
    assert data.get("success") is True, "upload_reference 返回应包含 success=true"
    assert data.get("count", 0) >= 2, "应至少上传两张参考图"

    # 5) 检查参考图计数
    r = requests.get(f"{BASE_URL}/check_reference_files")
    print("/check_reference_files:", r.status_code, r.text)
    assert r.status_code == 200
    info = r.json()
    assert info.get("success") is True
    assert info.get("reference_count", 0) >= 2, "应检测到已上传参考图"

    payload = {
        "model_name": "seedance-1-0-lite-i2v-250428",
        "seed": -1,
        "temperature": 0.7,
        "prompt": "test",
        "ratio": "1080x1080",
        "duration": 2,
        "fps": 24,
    }

    # 6) 尝试创建任务（根据 API Key 是否配置，断言不同返回）
    assert_generate("generate_firstlast", payload)
    assert_generate("generate_reference", payload)

    print("本地 API 冒烟测试通过（上传/检查接口正常，生成接口根据 API Key 情况返回符合预期）")


if __name__ == "__main__":
    main()