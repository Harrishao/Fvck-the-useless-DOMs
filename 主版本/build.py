import os

# build.py 只产出 jsDelivr 托管的代码本体：dist/menu-cleaner.js（content.js 原样）。
# 发布走「双通道 SemVer tag」模型（详见 待办事项.md / README）：
#   · 自动更新通道：稳定版打 tag v0.0.1 / v0.0.2 / …，用户用 @v0 取最新。
#     loader（dist/酒馆助手脚本-菜单精简器.json）钉死 @v0，故【不】由本脚本生成，避免每次 build 改动它。
#   · 指定版本通道：用 @v0.0.N 精确钉。
# ⚠ tag 必须是合法 SemVer：主/次/修订号【不能有前导零】。
#   实测：v621.0.0 ✓（@v621 → 621.0.0）；v0621.0.0 ✗（"0621" 前导零，jsDelivr 解析不到）。
# 发布步骤：改 content.js → 跑本脚本 → git commit → git tag v0.0.N → git push origin main v0.0.N。

script_dir = os.path.dirname(os.path.abspath(__file__))
dist_dir = os.path.join(os.path.dirname(script_dir), "dist")
os.makedirs(dist_dir, exist_ok=True)

with open(os.path.join(script_dir, "content.js"), "r", encoding="utf-8") as f:
    content_js = f.read()

dist_js = os.path.join(dist_dir, "menu-cleaner.js")
with open(dist_js, "w", encoding="utf-8", newline="\n") as f:
    f.write(content_js)

print("Generated:", dist_js)
