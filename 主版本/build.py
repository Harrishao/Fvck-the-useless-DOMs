import json
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
repo_root = os.path.dirname(script_dir)
dist_dir = os.path.join(repo_root, "dist")

# ── 发布配置 ─────────────────────────────────────────────────────────────────
# 稳定 UUID：与历史发布保持一致，使已安装用户表现为「更新」而非「新脚本」。请勿随意更改。
SCRIPT_ID = "3f5dba4b-ffdf-4569-89f3-639c684f0288"
SCRIPT_NAME = "酒馆菜单精简器-0621"
# jsDelivr 托管：代码放仓库 dist/menu-cleaner.js（ASCII 路径，避免中文路径编码），loader 钉到下面这个 tag。
# 发新补丁时：覆盖 dist/menu-cleaner.js → commit → 重新打 0621 tag（force）→ 刷 jsDelivr 缓存：
#   https://purge.jsdelivr.net/gh/Harrishao/Fvck-the-useless-DOMs@0621/dist/menu-cleaner.js
GH_REPO = "Harrishao/Fvck-the-useless-DOMs"
TAG = "0621"
DIST_JS = "menu-cleaner.js"
JSDELIVR_URL = "https://cdn.jsdelivr.net/gh/{}@{}/dist/{}".format(GH_REPO, TAG, DIST_JS)

with open(os.path.join(script_dir, "content.js"), "r", encoding="utf-8") as f:
    content_js = f.read()
with open(os.path.join(script_dir, "info.html"), "r", encoding="utf-8") as f:
    info_html = f.read()

os.makedirs(dist_dir, exist_ok=True)


def script_json(content):
    """酒馆助手脚本 JSON 骨架，仅 content 不同。"""
    return {
        "type": "script",
        "enabled": True,
        "name": SCRIPT_NAME,
        "id": SCRIPT_ID,
        "content": content,
        "info": info_html,
        "button": {"enabled": True, "buttons": []},
        "data": {},
    }


# 1) jsDelivr 托管的代码：内容＝content.js 原样（IIFE 当副作用模块被 import 即执行）
dist_js_path = os.path.join(dist_dir, DIST_JS)
with open(dist_js_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content_js)

# 2) loader JSON（主分发物）：content 仅一行 import，真代码从 jsDelivr 拉取
loader_path = os.path.join(dist_dir, "酒馆助手脚本-菜单精简器.json")
with open(loader_path, "w", encoding="utf-8") as f:
    json.dump(script_json("import '{}'".format(JSDELIVR_URL)), f, ensure_ascii=False, indent=2)

# 3) 内嵌 JSON（离线导入备用，不依赖网络）：content 直接内嵌全部代码
inline_path = os.path.join(script_dir, "酒馆助手脚本-菜单精简器-0621.json")
with open(inline_path, "w", encoding="utf-8") as f:
    json.dump(script_json(content_js), f, ensure_ascii=False, indent=2)

print("Generated:")
print("  dist JS :", dist_js_path)
print("  loader  :", loader_path, "(content = import jsDelivr)")
print("  inline  :", inline_path, "(content = 内嵌全部代码)")
print("  jsDelivr:", JSDELIVR_URL)
print("  UUID    :", SCRIPT_ID)
