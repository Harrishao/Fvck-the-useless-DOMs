# 输入框区域（#nonQRFormItems）菜单精简设计规范

- **日期**：2026-10-29
- **状态**：已批准（Approved）
- **目标**：将酒馆 `#nonQRFormItems` 下的 `#leftSendForm`（左侧操作区）与 `#rightSendForm`（右侧操作区）所有控制按钮纳入菜单精简器的作用区域，采用类似扩展面板与消息操作的双栏架构，支持条目跨栏拖拽、栏内排序与显隐切换。

---

## 1. 背景与目标

酒馆底部发送区域包含两大部分：
1. `#qr--bar`：快捷回复条目面板（已有 `qrPanel` 分组管理）；
2. `#nonQRFormItems`：核心输入栏容器，包含：
   - `#leftSendForm`：左侧按钮（默认含 `#options_button` 选项菜单图标、动态注入的 `#extensionsMenuButton` 扩展魔棒图标等）；
   - `#send_textarea`：主消息输入框；
   - `#rightSendForm`：右侧按钮（默认含 `#stscript_continue` / `#stscript_pause` / `#stscript_stop` 脚本控制按钮、`#mes_stop` 中止按钮、`#mes_impersonate` AI代写、`#mes_continue` 继续、`#send_but` 发送消息等）。

用户希望在菜单精简器中增加新分组「输入框区域」，将 `#leftSendForm` 和 `#rightSendForm` 内的按钮统一管理，实现：
- 双栏可视化管理（左栏对应左侧按钮，右栏对应右侧按钮）；
- 跨栏拖拽（例如将右侧按钮移到左侧，或将左侧按钮移到右侧）；
- 栏内拖拽自定义顺序（通过 Flexbox `order` 原生生效）；
- 小眼睛一键隐藏无用按钮（通过 `.mc3-hidden` 生效）；
- 一键恢复原始默认布局。

---

## 2. 详细设计

### 2.1 分组注册（`GROUPS`）
在 `主版本v2/content.js` 的 `GROUPS` 数组中新增：
```javascript
{
  id: 'sendForm',
  name: '输入框区域',
  containers: ['#leftSendForm', '#rightSendForm'],
  observe: ['#send_form', '#nonQRFormItems'],
  mode: 'children',
  supportsColumns: true,
  label: 'attrTitle',
}
```
- `containers[0]` 映射至 `#leftSendForm`（栏 0）；
- `containers[1]` 映射至 `#rightSendForm`（栏 1）；
- `mode: 'children'` 仅扫描容器直接子元素，排除自绘元素（`isSelf(el)`），保证 `#send_textarea` 不受任何影响；
- `observe` 监听 `#send_form` 和 `#nonQRFormItems`，确保动态挂载脚本或插件注入按钮出现时自动纳入管线。

### 2.2 友好标签提取策略
工具栏按钮通常为纯图标（部分元素缺少 `title` 或为动态 i18n 属性）。新增 `SEND_FORM_DEFAULT_LABELS` 映射表：
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
在扫描或标签提取时：
1. 优先读取 `SEND_FORM_DEFAULT_LABELS['#' + el.id]`；
2. 其次读取 `el.getAttribute('title')`；
3. 再次读取 `el.getAttribute('data-i18n')` 中的 title 声明；
4. 再次读取直接子节点文本（`textContent`）；
5. 兜底使用元素 `id` 或语义描述。

### 2.3 状态持久化（`settings`）
复用统一的持久化模型：
- `settings.order.sendForm = { [key: string]: number }`：栏内排序槽位；
- `settings.column[key] = 0 | 1`：当前归属栏位（0: `#leftSendForm`, 1: `#rightSendForm`）；
- `settings.nativeColumn[key] = 0 | 1`：首次扫描捕获的原生归属；
- `settings.hidden[key] = boolean`：隐藏状态标记。

### 2.4 通用化分栏搬运（`applyColumns`）
重构 `applyColumns(group, records)`，使支持多栏的分组均可使用：
```javascript
function applyColumns(group, records) {
  if (!group || !group.containers || group.containers.length < 2) return;
  const col0 = doc.querySelector(group.containers[0]);
  const col1 = doc.querySelector(group.containers[1]);
  if (!col0 || !col1) return;

  const isExt = group.id === 'extensionsSettings';
  const single = isExt && settings.columnMode === 'single';

  // extensionsSettings 子分组覆盖检查
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
    const unitsToMove = (r.units && r.units.length) ? r.units : (r.unit ? [r.unit] : [r.el]);
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

### 2.5 排序与显隐应用
- **排序**：酒馆原生样式中 `#leftSendForm` 和 `#rightSendForm` 为 Flex 容器。`applyOrder(group, records)` 直接给元素设置 `el.style.order = String(slot)`，原生即时响应。
- **显隐**：`applyHides(group, records)` 为隐藏条目添加 `.mc3-hidden` 类，`display: none !important;` 保证绝不占用空间。

### 2.6 管理面板专属双栏卡片（`renderSendFormCard`）
- 结构采用专属的双栏卡片：
  - 左栏：`左侧按钮 (#leftSendForm)`，挂载 `.mc3-mes-list[data-gid="sendForm"][data-col="0"]`；
  - 右栏：`右侧按钮 (#rightSendForm)`，挂载 `.mc3-mes-list[data-gid="sendForm"][data-col="1"]`；
- 每个条目行包含拖拽手柄、图标/中文标签、右侧显隐小眼睛；
- 拖拽逻辑天然兼容现有指针拖拽处理（自动识别 `[data-col]` 并更新 `settings.column` 与 `settings.order`）；
- 卡片头部提供「恢复默认」快捷按钮，重置栏位与排序并调用 `applyAll()`。

---

## 3. 边界与特殊情况处理

1. **DOM 事件与 Popper 定位保护**：使用 `appendChild` 原地移动 DOM 节点，不重绘 HTML，完整保留原生事件监听（如 `#send_but` 的点击触发发送、`#extensionsMenuButton` 的下拉菜单关联）；
2. **防回环 MutationObserver**：在搬运节点前设置 `suppressObserver = true`，并在下一个宏任务清空，避免触发自身回调风暴；
3. **输入框隔离**：`#send_textarea` 位于 `#nonQRFormItems` 直属子层，不属于 `#leftSendForm` 或 `#rightSendForm`，不被扫描，完全不受任何排版或排序影响；
4. **空栏位兜底**：当用户将某一侧按钮全部移空或全部隐藏时，容器保持空状态，不破坏整体 flex 布局。

---

## 4. 验证计划

1. **单元/脚本热运行验收**：
   - 通过 Chrome DevTools MCP 向酒馆注入编译后的 `content.js`；
   - 打开 `/menucleaner` 或魔棒「菜单精简器」，验证「输入框区域」双栏卡片是否正常渲染，按钮与友好标签是否准确呈现；
2. **功能验收**：
   - 跨栏拖拽：将「让AI为您撰写消息」从右栏拖到左栏，验证 DOM 中元素是否实时移动到 `#leftSendForm`，且在输入框左侧正常显示；
   - 栏内重排：调整「发送消息」按钮在右栏中的排序，验证 `style.order` 是否按预期改变；
   - 显隐测试：点击关闭某些 ST-Script 按钮的小眼睛，验证按钮是否立即在界面消失；再次点亮是否正常恢复；
   - 点击功能验证：测试移动后的「发送消息」按钮与「选项菜单」按钮，确保原业务点击响应依然有效；
   - 恢复原始：点击重置按钮，验证所有按钮是否准确回到原生所属容器和初始排序；
3. **持久化验收**：
   - 刷新页面（F5 / reload），验证重载后配置是否正确从 `extension_settings` 恢复。
