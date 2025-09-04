#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试重现401 API key不存在的错误
"""

import requests
import json
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

def test_different_scenarios():
    """测试不同场景下的API key验证"""
    base_url = "http://127.0.0.1:5000"
    
    print("🧪 Testing different API key scenarios...\n")
    
    # 场景1: 正常的任务状态查询
    print("📋 Scenario 1: Normal task status query")
    try:
        response = requests.get(f"{base_url}/task_status/cgt-20250904150953-qhzkh")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")
    
    # 场景2: 不存在的任务ID
    print("\n📋 Scenario 2: Non-existent task ID")
    try:
        response = requests.get(f"{base_url}/task_status/invalid-task-id")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")
    
    # 场景3: 带API key参数的请求
    print("\n📋 Scenario 3: With API key parameter")
    try:
        api_key = os.environ.get('ARK_API_KEY', '')
        response = requests.get(f"{base_url}/task_status/cgt-20250904150953-qhzkh?api_key={api_key}")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")
    
    # 场景4: 错误的API key参数
    print("\n📋 Scenario 4: With invalid API key parameter")
    try:
        response = requests.get(f"{base_url}/task_status/cgt-20250904150953-qhzkh?api_key=invalid-key")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")
    
    # 场景5: 空的API key参数
    print("\n📋 Scenario 5: With empty API key parameter")
    try:
        response = requests.get(f"{base_url}/task_status/cgt-20250904150953-qhzkh?api_key=")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")
    
    # 场景6: 测试环境变量被清空的情况
    print("\n📋 Scenario 6: Testing with cleared environment variable")
    original_key = os.environ.get('ARK_API_KEY')
    try:
        # 临时清空环境变量
        if 'ARK_API_KEY' in os.environ:
            del os.environ['ARK_API_KEY']
        
        response = requests.get(f"{base_url}/task_status/cgt-20250904150953-qhzkh")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")
    finally:
        # 恢复环境变量
        if original_key:
            os.environ['ARK_API_KEY'] = original_key
    
    # 场景7: POST请求而不是GET请求
    print("\n📋 Scenario 7: POST request instead of GET")
    try:
        response = requests.post(f"{base_url}/task_status/cgt-20250904150953-qhzkh")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")

if __name__ == "__main__":
    test_different_scenarios()
    print("\n✅ Test completed!")