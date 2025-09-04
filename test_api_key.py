#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试方舟API key的有效性
"""

import os
from dotenv import load_dotenv
from volcenginesdkarkruntime import Ark
import json

# 加载环境变量
load_dotenv()

def test_api_key():
    """测试API key的有效性"""
    api_key = os.environ.get('ARK_API_KEY', '').strip()
    
    if not api_key:
        print("❌ API key not found in environment variables")
        return False
    
    print(f"✅ API key found: {api_key[:8]}...{api_key[-8:]}")
    
    # 测试不同的base_url
    base_urls = [
        "https://ark.ap-southeast.bytepluses.com/api/v3",
        "https://ark.cn-beijing.volces.com/api/v3",
    ]
    
    for base_url in base_urls:
        print(f"\n🔍 Testing base_url: {base_url}")
        try:
            client = Ark(api_key=api_key, base_url=base_url)
            
            # 尝试创建一个简单的任务来测试认证
            test_content = [
                {
                    "type": "text",
                    "text": "Generate a simple test video --ratio 16:9 --dur 3 --fps 8 --wm false"
                }
            ]
            
            result = client.content_generation.tasks.create(
                model="seedance-1-0-lite-t2v-250428",
                content=test_content,
            )
            
            print(f"✅ Authentication successful with {base_url}")
            print(f"📋 Task created: {result}")
            
            # 提取task_id
            task_id = None
            if isinstance(result, dict):
                task_id = result.get('id') or result.get('task_id')
            else:
                try:
                    data = json.loads(result.model_dump_json())
                    task_id = data.get('id') or data.get('task_id')
                except Exception:
                    task_id = getattr(result, 'id', None)
            
            if task_id:
                print(f"📝 Task ID: {task_id}")
                
                # 测试任务状态查询
                try:
                    status_result = client.content_generation.tasks.get(task_id=task_id)
                    print(f"✅ Task status query successful: {status_result}")
                except Exception as e:
                    print(f"❌ Task status query failed: {e}")
            
            return True
            
        except Exception as e:
            print(f"❌ Authentication failed with {base_url}: {e}")
            if "401" in str(e) or "Unauthorized" in str(e):
                print("   🔑 This indicates an API key authentication issue")
            elif "404" in str(e):
                print("   🌐 This indicates a URL or endpoint issue")
            continue
    
    print("\n❌ All base URLs failed")
    return False

if __name__ == "__main__":
    print("🧪 Testing Ark API Key Authentication...\n")
    success = test_api_key()
    
    if success:
        print("\n🎉 API key is valid and working!")
    else:
        print("\n💥 API key validation failed. Please check:")
        print("   1. API key format and validity")
        print("   2. Account permissions and quotas")
        print("   3. Network connectivity")
        print("   4. Base URL configuration")