import os
import json
import re

# 主版本v2 构建脚本 —— 产出两份制品（互不覆盖）：
#   ① dist/menu-cleaner.js                —— content.js 原样，jsDelivr @v0 自动更新通道的代码本体。
#   ② 主版本v2/酒馆助手脚本-菜单精简器.json —— 自包含脚本（content 字段内联整份 content.js），
#                                            供直接导入酒馆助手做本地验收/分发，无需先发布 jsDelivr。
# 不触碰 dist/酒馆助手脚本-菜单精简器.json（那是 @v0 loader，一行 import，正常无需改动；
# 本脚本只【读】它作为元数据模板，复用同一 UUID/name/info → 已安装用户处表现为更新而非新脚本）。
#
# 发布步骤（@v0 通道）：改 content.js（同步更新抬头版本与 VERSION） → 跑本脚本 → git commit → git tag v0.0.N → git push origin main v0.0.N
#                     → 访问 https://purge.jsdelivr.net/ 对应链接强制刷新 CDN 缓存。

script_dir = os.path.dirname(os.path.abspath(__file__))          # 主版本v2/
root_dir = os.path.dirname(script_dir)
dist_dir = os.path.join(root_dir, "dist")
os.makedirs(dist_dir, exist_ok=True)

with open(os.path.join(script_dir, "content.js"), "r", encoding="utf-8") as f:
    content_js = f.read()

# 校验抬头版本与代码中 VERSION 常量一致性
# header_match = re.search(r"^//\s*version\s+([^\r\n]+)", content_js, re.M)
# const_match = re.search(r"const\s+VERSION\s*=\s*['\"]([^'\"]+)['\"]", content_js)
# if header_match and const_match:
#     h_ver = header_match.group(1).strip()
#     c_ver = const_match.group(1).strip()
#     if h_ver != c_ver:
#         raise ValueError(f"版本号不一致！content.js 抬头为 '{h_ver}'，而 const VERSION 为 '{c_ver}'，请保持一致！")
#     print(f"Building Version: {h_ver}")

# ① dist/menu-cleaner.js（content.js 原样）
dist_js = os.path.join(dist_dir, "menu-cleaner.js")
with open(dist_js, "w", encoding="utf-8", newline="\n") as f:
    f.write(content_js)
print("Generated:", dist_js)

# ② 主版本v2/酒馆助手脚本-菜单精简器.json（自包含）
# 元数据模板优先取 dist loader，缺失则回退到旧主版本自包含 json，再退到最小骨架。
template = None
for tpl_path in (
    os.path.join(dist_dir, "酒馆助手脚本-菜单精简器.json"),
    os.path.join(root_dir, "主版本", "酒馆助手脚本-菜单精简器.json"),
):
    if os.path.exists(tpl_path):
        with open(tpl_path, "r", encoding="utf-8") as f:
            template = json.load(f)
        break
if template is None:
    template = {
        "type": "script", "enabled": True, "name": "菜单精简器",
        "id": "3f5dba4b-ffdf-4569-89f3-639c684f0288", "content": "",
        "info": "", "button": {"enabled": True, "buttons": []}, "data": {},
    }

template["content"] = content_js   # 仅替换 content：内联整份 content.js
out_path = os.path.join(script_dir, "酒馆助手脚本-菜单精简器.json")
with open(out_path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(template, f, ensure_ascii=False, indent=2)
print("Generated:", out_path)
