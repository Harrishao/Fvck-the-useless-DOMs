import os
import json

# build-mes-buttons.py 产出一份制品：
#   测试用脚本/mes-buttons-test.json —— 自包含脚本（content 字段内联整份 mes-buttons-test.js），
#                                   供直接导入酒馆助手做本地验收/分发。

script_dir = os.path.dirname(os.path.abspath(__file__))  # 测试用脚本/

with open(os.path.join(script_dir, "mes-buttons-test.js"), "r", encoding="utf-8") as f:
    js_content = f.read()

# 元数据模板优先取 script_dir 下已有的 json（复用同一 UUID/name/info），
# 缺失则回退到最小骨架。
loader_path = os.path.join(script_dir, "mes-buttons-test.json")
template = None
if os.path.exists(loader_path):
    try:
        with open(loader_path, "r", encoding="utf-8") as f:
            template = json.load(f)
    except Exception:
        template = None

if template is None:
    template = {
        "type": "script",
        "enabled": True,
        "name": "mes-buttons-test",
        "id": "5c95186c-f1e0-4cd5-bde6-f77f8ed46f61",
        "content": "",
        "info": "消息操作区域占位测试按钮注入器（用于测试菜单精简器 mesButtons 分组）",
        "button": {"enabled": True, "buttons": []},
        "data": {},
    }

template["content"] = js_content
self_contained = os.path.join(script_dir, "mes-buttons-test.json")
with open(self_contained, "w", encoding="utf-8", newline="\n") as f:
    json.dump(template, f, ensure_ascii=False, indent=2)
print("Generated:", self_contained)
