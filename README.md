# 菜单精简器

选择性隐藏 / 排序酒馆里你永远不会点的菜单按钮 —— 覆盖**左下菜单、魔棒、扩展面板、顶部导航、预设**五大菜单。

## 安装

> 这是一个**酒馆助手脚本**，前置需先安装「酒馆助手 / JS-Slash-Runner」扩展。

**方式一 · 导入 loader（推荐）**

1. 下载 [`dist/酒馆助手脚本-菜单精简器.json`](dist/酒馆助手脚本-菜单精简器.json)
2. 酒馆助手 → 脚本库 → 导入 → 选该文件
3. 启用脚本

代码托管在 jsDelivr，loader 只有一行 import，体积极小、随发布自动更新。

**方式二 · 手动新建脚本**

在酒馆助手新建一个脚本，内容只填这一行：

```js
import 'https://cdn.jsdelivr.net/gh/Harrishao/Fvck-the-useless-DOMs@0621/dist/menu-cleaner.js'
```

**方式三 · 离线内嵌**

不便联网 jsDelivr 时，导入 `主版本/酒馆助手脚本-菜单精简器-0621.json`（代码已内嵌，无需 CDN）。

## 使用

- 在左下**魔棒菜单**找到「菜单精简器」，或聊天框输入 `/menucleaner`，打开操作面板
- 👁 显隐条目 · ⠿ 拖拽排序 · ◧◨ 扩展面板切换单/双栏 · 一键恢复原始
- 大家一起和平地玩吧！！

## 更新

每个稳定版对应一个**不可变的发布 tag**（当前 `@0621`），发布后不再改动。出新版时会发布一个新 tag；更新即把导入地址里的 `@0621` 换成新 tag（或重新导入新版 loader）。调试都在 `main` 分支进行，**不会影响已发布用户**。

## 构建（开发者）

`主版本/` 下运行 `python build.py`，产出：

| 文件 | 用途 |
|---|---|
| `dist/menu-cleaner.js` | jsDelivr 托管的代码（ASCII 路径） |
| `dist/酒馆助手脚本-菜单精简器.json` | loader（content 为一行 import） |
| `主版本/酒馆助手脚本-菜单精简器-0621.json` | 内嵌全部代码的离线版（gitignore，不入库） |

发新稳定版（不可变 tag 模型，避免半成品泄漏给用户）：

1. 在 `主版本/build.py` 把 `TAG` 改成一个**新的、永不复用**的 tag（如 `0622`）
2. 重跑 `python build.py` → `git add` → `commit`
3. `git tag 0622 && git push origin main 0622`
4. （可选）GitHub 上基于该 tag「Create release」写发布说明
5. 更新 README / loader 里的版本号到新 tag

> ⚠ **切勿移动已发布的 tag**（如把 `0621` force 到新提交）——调试请只在 `main` 上做、不打 tag，用户只会拿到你专门发布的不可变 tag。
