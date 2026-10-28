# 输入框区域（#nonQRFormItems）菜单精简实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将酒馆 `#nonQRFormItems` 下的 `#leftSendForm`（左侧操作区）与 `#rightSendForm`（右侧操作区）所有控制按钮纳入菜单精简器的「输入框区域」新分组，实现类似扩展面板和消息操作的双栏跨栏拖拽、栏内排序、小眼睛显隐及一键重置。

**Architecture:** 在 `GROUPS` 注册 `sendForm`（双栏模式，直接操作 `#leftSendForm` 与 `#rightSendForm`）；通用化 `applyColumns(group, records)` 支持跨栏 DOM 原地搬运（`appendChild`）；复用 Flexbox `style.order` 原生排序与 `.mc3-hidden` 显隐；弹窗中提供专属双栏卡片（`.mc3-mes-columns`），无损对接现有拖拽管线。

**Tech Stack:** 原生 JavaScript (ES6+ IIFE), DOM API (appendChild, style.order), CSS Flexbox, Node.js `node:test`, Chrome DevTools MCP / Playwright.

## Global Constraints

- 源码单文件维护：唯一需要修改的源码是 `主版本v2/content.js`；
- 原地无损（In-place）：DOM 节点移动使用 `appendChild` 搬移真实节点，严禁 cloneNode 或 innerHTML 重建，保留所有事件监听与第三方插件句柄；
- 隔离 `#send_textarea`：严禁扫描或改动输入框本身；
- 避免 Observer 回环：在任何主动操作 DOM 节点前后使用 `suppressObserver` 守卫；
- 产物构建同步：每次代码修改后需运行 `python build.py` 同步生成 `dist/menu-cleaner.js` 与自包含 JSON。

---

### Task 1: 注册 `sendForm` 分组与友好标签映射

**Files:**
- Modify: `主版本v2/content.js:31-115, 514-540`
- Create: `tests/send-form.test.mjs`

**Interfaces:**
- Produces:
  - `GROUPS` entry with `id: 'sendForm'`, `containers: ['#leftSendForm', '#rightSendForm']`, `supportsColumns: true`
  - `SEND_FORM_DEFAULT_LABELS`: mapping from `#id` to friendly Chinese label string
  - Updated `labelOf(el, group)` that checks `SEND_FORM_DEFAULT_LABELS['#' + el.id]` for `sendForm` group

- [ ] **Step 1: 编写失败测试**

创建 `tests/send-form.test.mjs`，验证 `sendForm` 分组定义与标签解析：

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, '..', '主版本v2', 'content.js');
const source = fs.readFileSync(sourcePath, 'utf8');

test('GROUPS 包含 sendForm 输入框区域定义', () => {
  assert.match(source, /id:\s*'sendForm'/);
  assert.match(source, /name:\s*'输入框区域'/);
  assert.match(source, /containers:\s*\[\s*'#leftSendForm'\s*,\s*'#rightSendForm'\s*\]/);
  assert.match(source, /supportsColumns:\s*true/);
});

test('包含 SEND_FORM_DEFAULT_LABELS 友好标签映射表', () => {
  assert.match(source, /SEND_FORM_DEFAULT_LABELS\s*=/);
  assert.match(source, /'#options_button':\s*'左下选项菜单'/);
  assert.match(source, /'#send_but':\s*'发送消息'/);
  assert.match(source, /'#extensionsMenuButton':\s*'扩展魔棒'/);
  assert.match(source, /'#mes_impersonate':\s*'让AI为您撰写消息'/);
  assert.match(source, /'#mes_continue':\s*'继续上一条消息'/);
  assert.match(source, /'#mes_stop':\s*'中止请求'/);
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --test tests/send-form.test.mjs`
Expected: FAIL (assertion fails since `sendForm` is not in `content.js` yet)

- [ ] **Step 3: 实现 `sendForm` 分组注册与标签映射**

在 `主版本v2/content.js`：
1. 在 `GROUPS` 数组中添加：
```javascript
    {
      id: 'sendForm', name: '输入框区域',
      containers: ['#leftSendForm', '#rightSendForm'],
      observe: ['#send_form', '#nonQRFormItems'],
      mode: 'children',
      supportsColumns: true,
      label: 'attrTitle',
    },
```
2. 在 `MES_BUTTON_DEFAULT_LABELS` 旁边定义 `SEND_FORM_DEFAULT_LABELS`：
```javascript
  const SEND_FORM_DEFAULT_LABELS = {
    '#options_button': '左下选项菜单',
    '#extensionsMenuButton': '扩展魔棒',
    '#send_but': '发送消息',
    '#mes_impersonate': '让AI为您撰写消息',
    '#mes_continue': '继续上一条消息',
    '#mes_stop': '中止请求',
    '#stscript_continue': '继续执行脚本',
    '#stscript_pause': '暂停执行脚本',
    '#stscript_stop': '中止执行脚本',
  };
```
3. 在 `labelOf(el, group)` 头部增加优先读取映射：
```javascript
  function labelOf(el, group) {
    if (group.id === 'sendForm' && el.id && SEND_FORM_DEFAULT_LABELS['#' + el.id]) {
      return SEND_FORM_DEFAULT_LABELS['#' + el.id];
    }
    // ... 原有逻辑保持不变
```

- [ ] **Step 4: 运行测试验证通过**

Run: `node --test tests/send-form.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交 Task 1 产物**

```bash
git add 主版本v2/content.js tests/send-form.test.mjs
git commit -m "feat: register sendForm group with friendly labels mapping"
```

---

### Task 2: 通用化 `applyColumns` 并对接 `applyGroup`

**Files:**
- Modify: `主版本v2/content.js:1007-1045, 1420-1428`
- Modify: `tests/send-form.test.mjs`

**Interfaces:**
- Consumes:
  - `group.containers`: `string[]` (e.g. `['#leftSendForm', '#rightSendForm']`)
  - `records`: `Array<{ el: HTMLElement, key: string, column?: number, unit?: HTMLElement, units?: HTMLElement[] }>`
  - `settings.column`: `{ [key: string]: number }`
  - `settings.nativeColumn`: `{ [key: string]: number }`
- Produces:
  - General `applyColumns(group, records)` capable of moving elements between `group.containers[0]` and `group.containers[1]`
  - Updated `applyGroup(group, records)` passing `group` to `applyColumns`

- [ ] **Step 1: 编写失败测试**

在 `tests/send-form.test.mjs` 中添加针对通用 `applyColumns` 与 `applyGroup` 的静态断言测试：

```javascript
test('applyColumns 接收 (group, records) 并支持动态多栏容器', () => {
  assert.match(source, /function applyColumns\(\s*group\s*,\s*records\s*\)/);
  assert.match(source, /group\.containers/);
  assert.match(source, /doc\.querySelector\(\s*group\.containers\[0\]\s*\)/);
  assert.match(source, /doc\.querySelector\(\s*group\.containers\[1\]\s*\)/);
});

test('applyGroup 正确传入 group 至 applyColumns', () => {
  assert.match(source, /if\s*\(\s*group\.supportsColumns\s*\)\s*applyColumns\(\s*group\s*,\s*records\s*\)/);
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --test tests/send-form.test.mjs`
Expected: FAIL (assertion fails on `applyColumns(group, records)`)

- [ ] **Step 3: 实现通用化 `applyColumns`**

重构 `主版本v2/content.js` 中的 `applyColumns`：

```javascript
  function applyColumns(group, records) {
    if (!group || !group.containers || group.containers.length < 2) return;
    const col0 = doc.querySelector(group.containers[0]);
    const col1 = doc.querySelector(group.containers[1]);
    if (!col0 || !col1) return;

    const isExt = group.id === 'extensionsSettings';
    const single = isExt && settings.columnMode === 'single';

    // 仅 extensionsSettings 遵循子分组分栏约束
    const keyToSgCol = {};
    if (isExt) {
      for (const sg of Subgroups.list('extensionsSettings')) {
        const sgCol = sg.column !== undefined ? sg.column : 0;
        for (const mk of sg.memberKeys) keyToSgCol[mk] = sgCol;
      }
    }

    let moved = false;
    for (const r of records) {
      if (r.column === undefined) continue;
      if (settings.nativeColumn[r.key] === undefined) {
        settings.nativeColumn[r.key] = r.column;
      }
      let target;
      if (keyToSgCol[r.key] !== undefined) {
        target = single ? 0 : keyToSgCol[r.key];
      } else {
        target = single ? 0 : (settings.column[r.key] !== undefined ? settings.column[r.key] : r.column);
      }
      const tc = target === 1 ? col1 : col0;
      const unitsToMove = (r.units && r.units.length) ? r.units : (r.unit ? [r.unit] : (r.el ? [r.el] : []));
      for (const un of unitsToMove) {
        if (un && un.parentNode !== tc) {
          suppressObserver = true;
          tc.appendChild(un);
          moved = true;
        }
      }
    }
    if (isExt) {
      col1.style.display = single ? 'none' : '';
    }
    if (moved) win.setTimeout(() => { suppressObserver = false; }, 0);
  }
```

并在 `applyGroup` 中更新调用：
```javascript
  function applyGroup(group, records) {
    if (group.customApply) { applyMesButtons(records); return; }
    if (group.supportsColumns) applyColumns(group, records); // 先定栏（唯一搬 DOM 处）
    if (!group.curated) applyOrder(group, records);
    applyHides(group, records);
    applyPseudoSubgroups(group, records);
    if (group.hasUserDrawers) applyUserSettingsDrawers();
  }
```

- [ ] **Step 4: 运行测试验证通过**

Run: `node --test tests/send-form.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交 Task 2 产物**

```bash
git add 主版本v2/content.js tests/send-form.test.mjs
git commit -m "refactor: generalize applyColumns to support multi-column sendForm group"
```

---

### Task 3: 实现 `renderSendFormCard` 管理面板双栏 UI 与交互

**Files:**
- Modify: `主版本v2/content.js:2000-2130, 2630-2675`
- Modify: `tests/send-form.test.mjs`

**Interfaces:**
- Consumes:
  - `group`: `GROUPS.find(g => g.id === 'sendForm')`
  - `recs`: scanned records for `sendForm`
  - `map`: `settings.order.sendForm`
- Produces:
  - `renderSendFormCard(group, recs, map)` rendering `.mc3-mes-columns` with `data-col="0"` and `data-col="1"`
  - Integration into `renderBody()` dispatch
  - "恢复默认" group reset handler for `sendForm`
  - Drag and drop persistence integration for `data-gid="sendForm"`

- [ ] **Step 1: 编写失败测试**

在 `tests/send-form.test.mjs` 中添加针对 `renderSendFormCard` 的断言测试：

```javascript
test('renderBody 派发 sendForm 至 renderSendFormCard', () => {
  assert.match(source, /if\s*\(\s*group\.id\s*===\s*'sendForm'\s*\)\s*\{\s*html\s*\+=\s*renderSendFormCard\(/);
});

test('renderSendFormCard 渲染具有左右两栏的标准结构', () => {
  assert.match(source, /function renderSendFormCard\(\s*group\s*,\s*recs\s*,\s*map\s*\)/);
  assert.match(source, /data-col="0"/);
  assert.match(source, /data-col="1"/);
  assert.match(source, /左侧按钮/);
  assert.match(source, /右侧按钮/);
  assert.match(source, /mc3-mes-list/);
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --test tests/send-form.test.mjs`
Expected: FAIL (assertion fails because `renderSendFormCard` is not yet defined)

- [ ] **Step 3: 实现 `renderSendFormCard` 并集成**

在 `主版本v2/content.js`：
1. 实现 `renderSendFormCard(group, recs, map)`：
```javascript
  function renderSendFormCard(group, recs, map) {
    const isCollapsed = !!settings.groupCollapsed[group.id];
    const cardDur = calcCollapseDuration(recs.length);

    const col0Recs = [];
    const col1Recs = [];
    for (const r of recs) {
      const col = settings.column[r.key] !== undefined ? settings.column[r.key] : (r.column !== undefined ? r.column : 0);
      if (col === 0) col0Recs.push(r); else col1Recs.push(r);
    }
    col0Recs.sort((a, b) => (map[a.key] || 0) - (map[b.key] || 0));
    col1Recs.sort((a, b) => (map[a.key] || 0) - (map[b.key] || 0));

    const emptyTip = (txt) => '<div class="mc3-row mc3-empty-tip" style="opacity:.25;font-style:italic;justify-content:center;padding:12px;font-size:12px">' + txt + '</div>';
    let cols = '<div class="mc3-mes-columns" data-gid="' + group.id + '">';
    // 栏0：左栏 (#leftSendForm)
    cols += '<div class="mc3-mes-column" data-col="0">';
    cols += '<div class="mc3-mes-col-header"><span class="mc3-mes-col-title">左侧按钮 (#leftSendForm)</span><span class="mc3-mes-col-count">(' + col0Recs.length + ')</span></div>';
    cols += '<div class="mc3-list mc3-mes-list" data-gid="' + group.id + '" data-col="0">';
    cols += col0Recs.length === 0 ? emptyTip('拖动条目到此处 (左侧)') : col0Recs.map((r) => renderItemRow(r, group, false)).join('');
    cols += '</div></div>';
    // 栏1：右栏 (#rightSendForm)
    cols += '<div class="mc3-mes-column" data-col="1">';
    cols += '<div class="mc3-mes-col-header"><span class="mc3-mes-col-title">右侧按钮 (#rightSendForm)</span><span class="mc3-mes-col-count">(' + col1Recs.length + ')</span></div>';
    cols += '<div class="mc3-list mc3-mes-list" data-gid="' + group.id + '" data-col="1">';
    cols += col1Recs.length === 0 ? emptyTip('拖动条目到此处 (右侧)') : col1Recs.map((r) => renderItemRow(r, group, false)).join('');
    cols += '</div></div>';
    cols += '</div>';

    const headerExtra = '<button class="mc3-btn mc3-btn-subtle mc3-reset-group-btn" data-gid="' + group.id + '" title="恢复输入框区域原生排布">恢复默认</button>';
    return renderCard(group.id, group.name, recs.length, isCollapsed, cardDur, cols, headerExtra);
  }
```
2. 在 `renderBody()` 中加入派发：
```javascript
      if (group.customApply) { html += renderMesButtonsCard(group, recs, map); continue; }
      if (group.id === 'extensionsSettings') { html += renderExtensionsSettingsCard(group, recs, map); continue; }
      if (group.id === 'sendForm') { html += renderSendFormCard(group, recs, map); continue; }
```
3. 在重置按钮点击监听（`mc3-reset-group-btn`）中处理 `sendForm` 归位：
```javascript
        if (gid === 'sendForm') {
          const recs = records['sendForm'] || [];
          for (const r of recs) {
            if (settings.nativeColumn[r.key] !== undefined) {
              settings.column[r.key] = settings.nativeColumn[r.key];
            }
            delete settings.hidden[r.key];
          }
          delete settings.order['sendForm'];
          saveSettings();
          applyAll();
          renderBody();
          return;
        }
```

- [ ] **Step 4: 运行测试验证通过**

Run: `node --test tests/send-form.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交 Task 3 产物**

```bash
git add 主版本v2/content.js tests/send-form.test.mjs
git commit -m "feat: implement renderSendFormCard dual-column UI and reset behavior"
```

---

### Task 4: 构建与在运行中的酒馆（127.0.0.1:8000）上进行端到端验证

**Files:**
- Modify: `主版本v2/content.js`
- Generate: `dist/menu-cleaner.js`, `主版本v2/酒馆助手脚本-菜单精简器.json`
- Test: `tests/send-form-e2e.mjs`

- [ ] **Step 1: 执行构建脚本同步构建产物**

Run: `cd 主版本v2 && python build.py && cd ..`
Expected: 生成 `dist/menu-cleaner.js` 和 `主版本v2/酒馆助手脚本-菜单精简器.json`，无报错。

- [ ] **Step 2: 编写端到端自动化验证脚本 `tests/send-form-e2e.mjs`**

使用 Playwright 连接 Chrome DevTools 协议并验证：
1. 页面中注入最新编译的 `content.js`；
2. 检查 `__mc3.records.sendForm` 是否已扫描到全部按钮（含 `#options_button`、`#extensionsMenuButton`、`#send_but`、`#stscript_*` 等）；
3. 验证标签提取正确（如 `#options_button` 标签为「左下选项菜单」）；
4. 调用 `__mc3.openPopup()`，验证弹出面板中存在「输入框区域」双栏卡片；
5. 模拟跨栏：将 `#send_but` 的 column 改为 0，调用 `__mc3.applyAll()`，验证 DOM 中 `#send_but` 是否已进入 `#leftSendForm`；
6. 模拟显隐：将 `#send_but` 设置 hidden 为 true，调用 `__mc3.applyAll()`，验证其是否包含 `.mc3-hidden`；
7. 模拟重置：调用重置，验证 `#send_but` 是否恢复回到 `#rightSendForm` 且移除 `.mc3-hidden`。

- [ ] **Step 3: 运行端到端验证脚本**

Run: `node tests/send-form-e2e.mjs`
Expected: 全部测试用例 PASS。

- [ ] **Step 4: 浏览器交互真实验收（通过 Chrome DevTools MCP）**

在已连接的 SillyTavern 页面上执行实际 UI 检验，打开菜单精简器弹窗并截屏/检查 DOM，确认视觉与功能完好无损。

- [ ] **Step 5: 提交全部构建产物与测试脚本**

```bash
git add dist/menu-cleaner.js 主版本v2/酒馆助手脚本-菜单精简器.json tests/send-form-e2e.mjs
git commit -m "chore: build dist and add live e2e verification for sendForm group"
```

---

## Plan Self-Review Check

- **Spec Coverage:**
  - `GROUPS` registration: Covered in Task 1
  - Friendly labels mapping: Covered in Task 1
  - Generalizing `applyColumns`: Covered in Task 2
  - Dual-column card UI and drag integration: Covered in Task 3
  - Reset behavior: Covered in Task 3
  - Dynamic loading & live CDP verification: Covered in Task 4
- **No Placeholders:** All code snippets, functions, selectors, and test commands are explicitly specified.
- **Type & Interface Consistency:** Container names, property names (`supportsColumns`, `column`, `nativeColumn`), method names (`applyColumns`, `renderSendFormCard`) match across all tasks.
