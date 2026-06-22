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

发布钉在 `@0621` tag。用 loader 的用户在 jsDelivr 缓存刷新后即自动拿到新版；如需指定版本，把导入地址里的 `@0621` 换成对应 tag 即可。

## 构建（开发者）

`主版本/` 下运行 `python build.py`，产出：

| 文件 | 用途 |
|---|---|
| `dist/menu-cleaner.js` | jsDelivr 托管的代码（ASCII 路径） |
| `dist/酒馆助手脚本-菜单精简器.json` | loader（content 为一行 import） |
| `主版本/酒馆助手脚本-菜单精简器-0621.json` | 内嵌全部代码的离线版（gitignore，不入库） |

发新补丁：覆盖 `dist/menu-cleaner.js` → commit → 移动 `0621` tag（`git tag -f 0621 && git push -f origin 0621`）→ 刷 jsDelivr 缓存：
`https://purge.jsdelivr.net/gh/Harrishao/Fvck-the-useless-DOMs@0621/dist/menu-cleaner.js`
