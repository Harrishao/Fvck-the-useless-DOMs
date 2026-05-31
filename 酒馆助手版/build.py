import json
import uuid
import os

script_dir = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(script_dir, "content.js"), "r", encoding="utf-8") as f:
    content_js = f.read()

with open(os.path.join(script_dir, "info.html"), "r", encoding="utf-8") as f:
    info_html = f.read()

output_path = os.path.join(script_dir, "酒馆助手脚本-酒馆菜单精简器.json")

# Preserve existing UUID if the file already exists
existing_id = None
if os.path.exists(output_path):
    with open(output_path, "r", encoding="utf-8") as f:
        existing = json.load(f)
        existing_id = existing.get("id")

result = {
    "type": "script",
    "enabled": True,
    "name": "酒馆菜单精简器",
    "id": existing_id or str(uuid.uuid4()),
    "content": content_js,
    "info": info_html,
    "button": {
        "enabled": True,
        "buttons": []
    },
    "data": {}
}

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"Generated: {output_path}")
print(f"UUID: {result['id']}")
