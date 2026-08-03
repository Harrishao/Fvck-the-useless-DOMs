import os
import json

# build-qr-button.py 产出一份制品：
#   测试用脚本/qr-button.json —— 自包含脚本（content 字段内联整份 qr-button.js），
#                               供直接导入酒馆助手做本地验收/分发。

script_dir = os.path.dirname(os.path.abspath(__file__))  # 测试用脚本/

with open(os.path.join(script_dir, "qr-button.js"), "r", encoding="utf-8") as f:
    qr_button_js = f.read()

# 元数据模板优先取 script_dir 下已有的 json（复用同一 UUID/name/info），
# 缺失则回退到最小骨架。
loader_path = os.path.join(script_dir, "qr-button.json")
template = None
for tpl_path in (loader_path,):
    if os.path.exists(tpl_path):
        with open(tpl_path, "r", encoding="utf-8") as f:
            template = json.load(f)
        break
if template is None:
    template = {
        "type": "script", "enabled": True, "name": "qr-button",
        "id": "3f5dba4b-ffdf-4569-89f3-639c684f0288", "content": "",
        "info": "", "button": {"enabled": True, "buttons": []}, "data": {},
    }

template["content"] = qr_button_js   # 仅替换 content：内联整份 qr-button.js
self_contained = os.path.join(script_dir, "qr-button.json")
with open(self_contained, "w", encoding="utf-8", newline="\n") as f:
    json.dump(template, f, ensure_ascii=False, indent=2)
print("Generated:", self_contained)