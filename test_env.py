import os
try:
    from dotenv import load_dotenv
    load_dotenv(override=False)
    print("dotenv loaded successfully")
except Exception as e:
    print(f"dotenv load failed: {e}")

api_key = os.environ.get('ARK_API_KEY', '').strip()
print(f"API Key found: {bool(api_key)}")
print(f"API Key length: {len(api_key) if api_key else 0}")
if api_key:
    print(f"API Key starts with: {api_key[:8]}...")
else:
    print("No API Key found in environment")

# 检查所有环境变量
ark_vars = {k: v for k, v in os.environ.items() if 'ARK' in k}
print(f"All ARK environment variables: {ark_vars}")