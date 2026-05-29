(function () {
  'use strict';

  // 酒馆助手在 iframe 中执行脚本，需要操作父页面的 document
  var doc = window.frameElement ? window.parent.document : document;
  var win = window.frameElement ? window.parent : window;

  const STORAGE_KEY = 'menu_cleaner_settings';
  let autoIdSeq = 0;
  let activeTab = 'hide';
  let showSettingsPanel = false;
  let rescanTimer = null;
  let suppressObserver = false;    // 程序化DOM操作时临时屏蔽MutationObserver

  // ── Hardcoded native elements ─────────────────────────────────
  const PANEL_GROUPS = [
    {
      id: 'options',
      name: '左下菜单',
      buttonId: '#options_button',
      reorder: { container: '#options' },
      items: [
        { selector: '#option_toggle_AN',           label: '作者注释' },
        { selector: '#option_toggle_CFG',          label: 'CFG缩放' },
        { selector: '#option_toggle_logprobs',     label: '词符概率' },
        { selector: '#option_new_bookmark',        label: '保存检查点' },
        { selector: '#option_convert_to_group',    label: '转换为群聊' },
        { selector: '#option_start_new_chat',      label: '开始新聊天' },
        { selector: '#option_close_chat',          label: '关闭聊天' },
        { selector: '#option_select_chat',         label: '管理聊天文件' },
        { selector: '#option_delete_mes',          label: '删除消息' },
        { selector: '#option_regenerate',          label: '重新生成' },
        { selector: '#option_impersonate',         label: 'AI帮答' },
        { selector: '#option_continue',            label: '继续' }
      ]
    },
    {
      id: 'extensionsMenu',
      name: '魔棒',
      buttonId: '#extensionsMenuButton',
      reorder: { container: '#extensionsMenu' },
      discovery: {
        containers: ['#extensionsMenu'],
        itemMatch: '.list-group-item',
        labelIn: 'span',
        exclude: ['#menu-cleaner-btn'],
        alsoMatchChildren: true
      },
      items: [
        { selector: '#manageAttachments',          label: '打开数据库' },
        { selector: '#attachFile',                 label: '附加文件' },
        { selector: '#sd_gen',                     label: '生成图片' },
        { selector: '#send_picture',               label: 'Generate Caption' },
        { selector: '#ttsExtensionNarrateAll',     label: 'Narrate All Chat' },
        { selector: '#token_counter',              label: '词符计数器' },
        { selector: '#translate_chat',             label: '翻译聊天' },
        { selector: '#translate_input_message',    label: '翻译输入' }
      ]
    },
    {
      id: 'extensionsSettings',
      name: '扩展菜单',
      buttonId: '#extensions-settings-button',
      reorder: { container: '#extensions_settings' },
      discovery: {
        containers: ['#extensions_settings', '#extensions_settings2'],
        hasHeader: '.inline-drawer-header',
        labelInHeader: 'b, [data-i18n]'
      },
      items: [
        { selector: '#assets_container',           label: '下载扩展和资源菜单' },
        { selector: '#expressions_container',      label: '角色表情' },
        { selector: '#sd_container',               label: '图像生成' },
        { selector: '#tts_container',              label: 'TTS' },
        { selector: '#qr_container',               label: '快速回复' },
        { selector: '#translation_container',      label: '聊天翻译' },
        { selector: '#caption_container',          label: '图像描述' },
        { selector: '#summarize_container',        label: '总结' },
        { selector: '#regex_container',            label: '正则' },
        { selector: '#vectors_container',          label: '向量存储' }
      ]
    },
    {
      id: 'topSettings',
      name: '顶部导航栏',
      items: [
        { selector: '#ai-config-button',           label: '预设' },
        { selector: '#sys-settings-button',        label: '插头' },
        { selector: '#advanced-formatting-button', label: 'AI回复格式化' },
        { selector: '#WI-SP-button',               label: '世界书' },
        { selector: '#user-settings-button',       label: '用户设置' },
        { selector: '#backgrounds-button',         label: '背景' },
        { selector: '#extensions-settings-button', label: '扩展' },
        { selector: '#persona-management-button',  label: 'USER设置' },
        { selector: '#rightNavHolder',             label: '角色卡' }
      ]
    },
    {
      id: 'presetSettings',
      name: '预设菜单',
      buttonId: '#ai-config-button',
      items: [
        { selector: '#range_block_openai > div:nth-child(1), #range_block_openai > div:nth-child(2), #range_block_openai > div:nth-child(3), #range_block_openai > div:nth-child(4)', label: '上下文长度及备选回复' },
        { selector: '#range_block_openai > div:nth-child(11), #range_block_openai > div:nth-child(12), #range_block_openai > div:nth-child(13), #range_block_openai > div:nth-child(14), #range_block_openai > div:nth-child(15), #range_block_openai > div:nth-child(16), #range_block_openai > div:nth-child(17), #range_block_openai > div:nth-child(18)', label: '可调参数' },
        { selector: '#range_block_openai > div.inline-drawer.m-t-1.wide100p, #range_block_openai > div:nth-child(20), #range_block_openai > div:nth-child(21), #openai_settings > div:nth-child(1) > div:nth-child(1), #openai_settings > div:nth-child(1) > div.inline-drawer.wide100p.flexFlowColumn.marginBot10', label: '提示词格式相关' },
        { selector: '#openai_settings > div:nth-child(1) > div:nth-child(3), #openai_settings > div:nth-child(1) > div:nth-child(4), #openai_settings > div:nth-child(1) > div:nth-child(5), #openai_settings > div:nth-child(1) > div:nth-child(6), #openai_settings > div:nth-child(1) > div:nth-child(7), #openai_settings > div:nth-child(1) > div:nth-child(8), #openai_settings > div:nth-child(1) > div:nth-child(9), #openai_settings > div:nth-child(1) > div:nth-child(10), #openai_settings > div:nth-child(1) > div:nth-child(11), #openai_settings > div:nth-child(1) > div:nth-child(12), #openai_settings > div:nth-child(1) > div:nth-child(13), #openai_settings > div.range-block.m-t-1', label: '复选框和下拉菜单' },
        { selector: '#openai_settings > div.range-block.m-b-1', label: '预设条目' }
      ]
    }
  ];

  const ALWAYS_HIDDEN_SELECTORS = [
    '#rm_api_block > div.flex-container.flexFlowColumn > #openai_api > div.flex-container.flex > #test_api_button',
    '#rm_extensions_block > div > div.alignitemsflexstart.flex-container.wide100p',
    '#rm_extensions_block > div > div.alignitemscenter.flex-container.justifyCenter.wide100p'
  ];

  // ── Settings persistence via localStorage ─────────────────────
  const defaultSettings = {
    enabled: true,
    hiddenSelectors: {},
    discoveryCache: {},  // { groupId: [{selector, label, column?}, ...] }
    reorder: {},          // { groupId: [selector, ...] }
    columnMode: 'single', // 'single' | 'dual'
    rescanToast: false
  };

  let settings = {};

  function loadSettings() {
    try {
      const raw = win.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        settings = Object.assign({}, defaultSettings, saved);
      } else {
        settings = Object.assign({}, defaultSettings);
      }

      // 清理DOM中已不存在的失效条目（插件被卸载等情况）
      var hiddenKeys = Object.keys(settings.hiddenSelectors);
      for (var hk = 0; hk < hiddenKeys.length; hk++) {
        if (!doc.querySelector(hiddenKeys[hk])) delete settings.hiddenSelectors[hiddenKeys[hk]];
      }
      var dcGroups = Object.keys(settings.discoveryCache);
      for (var dg = 0; dg < dcGroups.length; dg++) {
        settings.discoveryCache[dcGroups[dg]] = settings.discoveryCache[dcGroups[dg]].filter(function (c) {
          return doc.querySelector(c.selector);
        });
      }
      var roGroups = Object.keys(settings.reorder);
      for (var rg = 0; rg < roGroups.length; rg++) {
        settings.reorder[roGroups[rg]] = settings.reorder[roGroups[rg]].filter(function (s) {
          return doc.querySelector(s);
        });
      }
    } catch (e) {
      console.warn('[酒馆菜单精简器] 读取设置失败，使用默认值', e);
      settings = Object.assign({}, defaultSettings);
    }
  }

  function saveSettings() {
    try {
      win.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('[酒馆菜单精简器] 保存设置失败', e);
    }
  }

  // ── CSS injection ─────────────────────────────────────────────
  const STYLE_TEXT = `
/* ── Backdrop ─────────────────────────────────────── */
.menu-cleaner-backdrop {
  display: none;
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  z-index: 99999;
  animation: menu-cleaner-fadein 0.2s ease;
}

/* ── Force horizontal text ───────────────────────── */
#menu-cleaner-popup,
#menu-cleaner-popup *,
#menu-cleaner-settings,
#menu-cleaner-settings *,
#menu-cleaner-open-popup,
#menu-cleaner-wand-container,
#menu-cleaner-wand-container *,
.menu-cleaner-popup,
.menu-cleaner-popup *,
.menu-cleaner-backdrop {
  writing-mode: horizontal-tb !important;
  text-orientation: mixed !important;
  white-space: normal !important;
}

/* ── Popup ───────────────────────────────────────── */
.menu-cleaner-popup {
  display: none;
  position: fixed;
  width: 560px;
  max-width: 90%;
  max-height: 90vh;
  background: var(--SmartThemeBlurTintColor, #1a1b22);
  border: 1px solid var(--SmartThemeBorderColor, #333);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  z-index: 100000;
  flex-direction: column;
  overflow: hidden;
}

.menu-cleaner-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--SmartThemeBorderColor, #333);
  flex-shrink: 0;
}

.menu-cleaner-popup-header h2 {
  margin: 0;
  font-size: 18px;
}

.menu-cleaner-popup-actions {
  display: flex;
  gap: 8px;
}

.menu-cleaner-popup-body {
  overflow-y: auto;
  padding: 8px 0;
  flex: 1;
}

/* ── Category Sections ───────────────────────────── */
.menu-cleaner-category {
  border-bottom: 1px solid var(--SmartThemeBorderColor, #2a2b33);
}

.menu-cleaner-category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.menu-cleaner-category-header:hover {
  background: rgba(255, 255, 255, 0.04);
}

.menu-cleaner-category-arrow {
  font-size: 10px;
  width: 14px;
  transition: transform 0.15s;
}

.menu-cleaner-category-count {
  font-size: 0.8em;
  color: var(--SmartThemeBodyColor, #888);
  margin-left: auto;
}

.menu-cleaner-category-body.collapsed {
  display: none;
}

/* ── Separator ──────────────────────────────────── */
.menu-cleaner-separator {
  text-align: center;
  font-size: 0.78em;
  color: var(--SmartThemeBodyColor, #888);
  padding: 6px 0 2px;
  opacity: 0.7;
}

/* ── Items ───────────────────────────────────────── */
.menu-cleaner-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 18px 6px 36px;
  gap: 12px;
}

.menu-cleaner-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.menu-cleaner-item > span:first-child {
  flex: 1;
  font-size: 0.92em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Toggle Slider ───────────────────────────────── */
.menu-cleaner-toggle {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}

.menu-cleaner-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.menu-cleaner-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #555;
  border-radius: 22px;
  transition: background 0.25s;
}

.menu-cleaner-slider::before {
  content: "";
  position: absolute;
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.25s;
}

.menu-cleaner-toggle input:checked + .menu-cleaner-slider {
  background: #7c5cff;
}

.menu-cleaner-toggle input:checked + .menu-cleaner-slider::before {
  transform: translateX(18px);
}

/* ── Animations ──────────────────────────────────── */
@keyframes menu-cleaner-fadein {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes menu-cleaner-scalein {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* ── Tab Navigation ──────────────────────────────── */
.menu-cleaner-tabs {
  display: flex;
  border-bottom: 1px solid var(--SmartThemeBorderColor, #333);
  flex-shrink: 0;
}

.menu-cleaner-tab {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  cursor: pointer;
  font-size: 0.92em;
  color: var(--SmartThemeBodyColor, #888);
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s, background 0.15s;
  user-select: none;
}

.menu-cleaner-tab:hover {
  color: #ccc;
  background: rgba(255, 255, 255, 0.03);
}

.menu-cleaner-tab.active {
  color: #fff;
  border-bottom-color: #7c5cff;
}

/* ── Reorder Items ───────────────────────────────── */
.menu-cleaner-reorder-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 18px 7px 28px;
  cursor: default;
  transition: background 0.15s;
  border-left: 3px solid transparent;
}

.menu-cleaner-reorder-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.menu-cleaner-reorder-item > span:not(.menu-cleaner-drag-handle) {
  flex: 1;
  font-size: 0.92em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-cleaner-reorder-empty {
  padding: 12px 18px 12px 36px;
  font-size: 0.85em;
  color: var(--SmartThemeBodyColor, #888);
  opacity: 0.6;
}

/* ── Drag Handle ─────────────────────────────────── */
.menu-cleaner-drag-handle {
  cursor: grab;
  color: #666;
  font-size: 1.1em;
  letter-spacing: -2px;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  flex-shrink: 0;
  transition: color 0.15s;
}

.menu-cleaner-drag-handle:hover {
  color: #aaa;
}

.menu-cleaner-drag-handle:active {
  cursor: grabbing;
}


/* ── Drag States ─────────────────────────────────── */
.menu-cleaner-reorder-item.dragging {
  opacity: 0.4;
  background: rgba(124, 92, 255, 0.1);
}

.menu-cleaner-reorder-item.drag-over {
  border-left-color: #7c5cff;
  background: rgba(124, 92, 255, 0.08);
}

/* ── Animations ──────────────────────────────────── */
@keyframes menu-cleaner-fadein {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes menu-cleaner-scalein {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* ── Buttons: prevent text from wrapping vertically ──
   Must come last and use high-specificity selectors to beat
   #menu-cleaner-popup * { white-space: normal !important } */
#menu-cleaner-open-popup,
#menu-cleaner-close,
#menu-cleaner-rescan,
#menu-cleaner-reset-order,
#menu-cleaner-settings-btn {
  white-space: nowrap !important;
  flex-shrink: 0;
}

/* ── Settings Panel ─────────────────────────────── */
.menu-cleaner-settings-panel {
  padding: 12px 18px;
}

button.menu-cleaner-settings-btn-full {
  display: block;
  width: 100%;
  padding: 10px 8px;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: 0.92em;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

button.menu-cleaner-settings-btn-full:last-child {
  border-bottom: none;
}

button.menu-cleaner-settings-btn-full:hover {
  background: rgba(255, 255, 255, 0.06);
}

button.menu-cleaner-settings-btn-full:active {
  background: rgba(255, 255, 255, 0.1);
}

.menu-cleaner-settings-divider {
  text-align: center;
  color: var(--SmartThemeBodyColor, #888);
  font-size: 0.8em;
  padding: 14px 0 10px 0;
  opacity: 0.7;
}

.menu-cleaner-settings-radio-group {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}

.menu-cleaner-settings-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  cursor: pointer;
  font-size: 0.92em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  transition: background 0.15s;
}

.menu-cleaner-settings-radio:last-child {
  border-bottom: none;
}

.menu-cleaner-settings-radio:hover {
  background: rgba(255, 255, 255, 0.06);
}

.menu-cleaner-settings-radio input[type="radio"] {
  accent-color: #7c5cff;
}

.menu-cleaner-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 0.92em;
}

/* ── Dual-Column Reorder ──────────────────────── */
.menu-cleaner-reorder-column-section {
  margin-bottom: 6px;
}

.menu-cleaner-reorder-column-label {
  font-size: 0.82em;
  color: var(--SmartThemeBodyColor, #888);
  padding: 8px 18px 4px 36px;
  opacity: 0.75;
}

.menu-cleaner-reorder-column-section.drag-over-section {
  outline: 2px dashed #7c5cff;
  outline-offset: -2px;
  border-radius: 4px;
  background: rgba(124, 92, 255, 0.05);
}`;

  function injectStyle() {
    if (doc.getElementById('menu-cleaner-styles')) return;
    const styleEl = doc.createElement('style');
    styleEl.id = 'menu-cleaner-styles';
    styleEl.textContent = STYLE_TEXT;
    doc.head.appendChild(styleEl);
  }

  function applyHides() {
    let styleEl = doc.getElementById('menu-cleaner-hides');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'menu-cleaner-hides';
      doc.head.appendChild(styleEl);
    }

    const rules = [];

    if (settings.enabled) {
      for (const sel of ALWAYS_HIDDEN_SELECTORS) {
        rules.push(sel + ' { display: none !important; }');
      }
    }

    for (const [selector, hidden] of Object.entries(settings.hiddenSelectors)) {
      if (hidden) {
        rules.push(selector + ' { display: none !important; }');
      }
    }

    styleEl.textContent = rules.join('\n');
  }

  function clearAllHides() {
    const styleEl = doc.getElementById('menu-cleaner-hides');
    if (styleEl) styleEl.textContent = '';
  }

  // ── Reorder helpers ────────────────────────────────────────
  function getReorderItems(groupId) {
    var group = PANEL_GROUPS.find(function (g) { return g.id === groupId; });
    if (!group) return [];

    var order = settings.reorder[groupId];
    if (!order || order.length === 0) {
      order = group.items.map(function (i) { return i.selector; });
      var cached = settings.discoveryCache[groupId] || [];
      for (var ci = 0; ci < cached.length; ci++) order.push(cached[ci].selector);
    }

    var labelMap = {};
    for (var hi = 0; hi < group.items.length; hi++) {
      labelMap[group.items[hi].selector] = group.items[hi].label;
    }
    var cachedLabels = settings.discoveryCache[groupId] || [];
    for (var cl = 0; cl < cachedLabels.length; cl++) {
      labelMap[cachedLabels[cl].selector] = cachedLabels[cl].label;
    }

    var result = [];
    var seen = new Set();
    for (var oi = 0; oi < order.length; oi++) {
      var selector = order[oi];
      if (seen.has(selector)) continue;
      seen.add(selector);
      if (settings.hiddenSelectors[selector]) continue;
      result.push({ selector: selector, label: labelMap[selector] || selector });
    }

    for (var hi2 = 0; hi2 < group.items.length; hi2++) {
      var item = group.items[hi2];
      if (!seen.has(item.selector) && !settings.hiddenSelectors[item.selector]) {
        seen.add(item.selector);
        result.push({ selector: item.selector, label: item.label });
      }
    }
    var cachedItems = settings.discoveryCache[groupId] || [];
    for (var ci2 = 0; ci2 < cachedItems.length; ci2++) {
      var ditem = cachedItems[ci2];
      if (!seen.has(ditem.selector) && !settings.hiddenSelectors[ditem.selector]) {
        seen.add(ditem.selector);
        result.push({ selector: ditem.selector, label: ditem.label });
      }
    }

    return result;
  }

  function applyReorder(groupId) {
    var order = settings.reorder[groupId];
    if (!order || order.length === 0) return;

    if (settings.columnMode === 'dual' && groupId === 'extensionsSettings') {
      applyDualColumnReorder(groupId);
      return;
    }

    applySingleColumnReorder(groupId);
  }

  function applySingleColumnReorder(groupId) {
    var order = settings.reorder[groupId];
    if (!order || order.length === 0) return;

    var els = [];
    for (var i = 0; i < order.length; i++) {
      if (settings.hiddenSelectors[order[i]]) continue;
      var el = doc.querySelector(order[i]);
      if (el) els.push(el);
    }

    if (els.length < 2) return;

    var container = els[0].parentNode;
    while (container) {
      var ok = true;
      for (var j = 0; j < els.length; j++) {
        if (!container.contains(els[j])) { ok = false; break; }
      }
      if (ok) break;
      container = container.parentNode;
    }
    if (!container) return;

    var units = [];
    var seen = new Set();
    for (var k = 0; k < els.length; k++) {
      var unit = els[k];
      while (unit.parentNode && unit.parentNode !== container) {
        unit = unit.parentNode;
      }
      if (unit.parentNode === container && !seen.has(unit)) {
        seen.add(unit);
        units.push(unit);
      }
    }

    for (var m = 0; m < units.length; m++) {
      container.appendChild(units[m]);
    }
  }

  function applyDualColumnReorder(groupId) {
    var order = settings.reorder[groupId];
    if (!order || order.length === 0) return;

    var col1 = doc.querySelector('#extensions_settings');
    var col2 = doc.querySelector('#extensions_settings2');
    if (!col1) return;

    // Collect which items originated from col2 (column index === 1)
    var col2Origin = {};
    var cached = settings.discoveryCache[groupId] || [];
    for (var c = 0; c < cached.length; c++) {
      if (cached[c].column === 1) col2Origin[cached[c].selector] = true;
    }

    // Split order by column
    var col1Order = [];
    var col2Order = [];
    for (var o = 0; o < order.length; o++) {
      if (settings.hiddenSelectors[order[o]]) continue;
      if (col2Origin[order[o]]) {
        col2Order.push(order[o]);
      } else {
        col1Order.push(order[o]);
      }
    }

    reorderWithinContainer(col1, col1Order);
    if (col2) reorderWithinContainer(col2, col2Order);
  }

  function reorderWithinContainer(container, order) {
    if (order.length < 2) return;
    var els = [];
    for (var i = 0; i < order.length; i++) {
      var el = doc.querySelector(order[i]);
      if (el && container.contains(el)) els.push(el);
    }
    if (els.length < 2) return;

    var units = [];
    var seen = new Set();
    for (var k = 0; k < els.length; k++) {
      var unit = els[k];
      while (unit.parentNode && unit.parentNode !== container) {
        unit = unit.parentNode;
      }
      if (unit.parentNode === container && !seen.has(unit)) {
        seen.add(unit);
        units.push(unit);
      }
    }

    for (var m = 0; m < units.length; m++) {
      container.appendChild(units[m]);
    }
  }

  function mergeExtensionSettingsColumns() {
    if (settings.columnMode === 'dual') return;
    var col1 = doc.querySelector('#extensions_settings');
    var col2 = doc.querySelector('#extensions_settings2');
    if (!col1 || !col2) return;
    while (col2.firstChild) {
      col1.appendChild(col2.firstChild);
    }
    col2.style.display = 'none';
  }

  function restoreExtensionSettingsColumns() {
    var col1 = doc.querySelector('#extensions_settings');
    var col2 = doc.querySelector('#extensions_settings2');
    if (!col1 || !col2) return;
    col2.style.display = '';
    var originMap = {};
    var cached = settings.discoveryCache['extensionsSettings'] || [];
    for (var i = 0; i < cached.length; i++) {
      if (cached[i].column === 1) originMap[cached[i].selector] = true;
    }
    // Move items that originated from col2 back to col2
    var toMove = [];
    for (var j = 0; j < col1.children.length; j++) {
      var child = col1.children[j];
      if (child.id && originMap['#' + child.id]) {
        toMove.push(child);
      }
    }
    for (var k = 0; k < toMove.length; k++) {
      col2.appendChild(toMove[k]);
    }
  }

  function applyAllReorders() {
    mergeExtensionSettingsColumns();
    for (var gi = 0; gi < PANEL_GROUPS.length; gi++) {
      if (PANEL_GROUPS[gi].reorder) {
        applyReorder(PANEL_GROUPS[gi].id);
      }
    }
  }

  function doRescan() {
    if (rescanTimer) { clearTimeout(rescanTimer); rescanTimer = null; }
    suppressObserver = true;

    if (settings.columnMode === 'single') {
      mergeExtensionSettingsColumns();
    } else {
      restoreExtensionSettingsColumns();
    }
    refreshDiscoveryCache();
    applyAllReorders();

    setTimeout(function() { suppressObserver = false; }, 0);

    refreshPopup();
    if (settings.rescanToast) {
      var count = 0;
      var keys = Object.keys(settings.discoveryCache);
      for (var ci = 0; ci < keys.length; ci++) {
        count += settings.discoveryCache[keys[ci]].length;
      }
      if (typeof win.toastr !== 'undefined') win.toastr.info('已重新扫描，发现 ' + count + ' 个扩展元素');
    }
  }

  function resetAllReorders() {
    suppressObserver = true;
    if (settings.columnMode === 'single') {
      mergeExtensionSettingsColumns();
    } else {
      restoreExtensionSettingsColumns();
    }

    // Reset column origins for extensionsSettings: re-discover to get fresh column info,
    // then move hardcoded items back to col1 and discovered items back to their origin columns.
    var extGroup = PANEL_GROUPS.find(function (g) { return g.id === 'extensionsSettings'; });
    if (extGroup && extGroup.discovery) {
      var freshDiscovered = discoverItems(extGroup);
      var hcSet = new Set(extGroup.items.map(function (i) { return i.selector; }));
      settings.discoveryCache['extensionsSettings'] = freshDiscovered.filter(function (d) { return !hcSet.has(d.selector); });
      var col1 = doc.querySelector('#extensions_settings');
      var col2 = doc.querySelector('#extensions_settings2');
      for (var hi3 = 0; hi3 < extGroup.items.length; hi3++) {
        var el = doc.querySelector(extGroup.items[hi3].selector);
        if (el && el.parentNode && col1 && el.parentNode !== col1) {
          col1.appendChild(el);
        }
      }
      var resetCache = settings.discoveryCache['extensionsSettings'] || [];
      for (var ri = 0; ri < resetCache.length; ri++) {
        var rel = doc.querySelector(resetCache[ri].selector);
        if (!rel) continue;
        var targetCol = resetCache[ri].column === 1 ? col2 : col1;
        if (targetCol && rel.parentNode !== targetCol) {
          targetCol.appendChild(rel);
        }
      }
    }

    for (var gi = 0; gi < PANEL_GROUPS.length; gi++) {
      var group = PANEL_GROUPS[gi];
      if (!group.reorder) continue;
      var defaultOrder = group.items.map(function (i) { return i.selector; });
      var cached = settings.discoveryCache[group.id] || [];
      for (var ci = 0; ci < cached.length; ci++) defaultOrder.push(cached[ci].selector);
      settings.reorder[group.id] = defaultOrder;
      applyReorder(group.id);
    }
    saveSettings();
    // 退出设置页面，回到重排序视图
    showSettingsPanel = false;
    activeTab = 'reorder';
    doc.querySelectorAll('.menu-cleaner-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === 'reorder');
    });
    updatePopupView();
    renderReorderView();
    setTimeout(function() { suppressObserver = false; }, 0);
  }

  function applyColumnMode() {
    suppressObserver = true;
    if (settings.columnMode === 'single') {
      mergeExtensionSettingsColumns();
    } else {
      restoreExtensionSettingsColumns();
    }
    refreshDiscoveryCache();
    applyAllReorders();
    saveSettings();
    setTimeout(function() { suppressObserver = false; }, 0);
  }

  // ── Dynamic discovery ────────────────────────────────────────
  function discoverItems(group) {
    if (!group.discovery) return [];
    const discovered = [];
    const seen = new Set();
    const excludeSet = new Set(group.discovery.exclude || []);
    const multiContainer = group.discovery.containers.length > 1;

    for (var ci = 0; ci < group.discovery.containers.length; ci++) {
      const containerSel = group.discovery.containers[ci];
      const container = doc.querySelector(containerSel);
      if (!container) continue;
      const columnIndex = multiContainer ? ci : undefined;

      if (group.discovery.itemMatch) {
        for (const child of container.children) {
          if (getComputedStyle(child).display === 'none') continue;
          const matchedElements = new Set();
          const items = child.querySelectorAll(group.discovery.itemMatch);
          for (const item of items) {
            if (item.style.display === 'none') continue;
            if (!item.id) { item.id = 'menu-cleaner-auto-' + (autoIdSeq++); }
            const selector = '#' + item.id;
            if (seen.has(selector) || excludeSet.has(selector)) continue;
            seen.add(selector);
            matchedElements.add(item);

            const labelEl = item.querySelector(group.discovery.labelIn);
            const label = labelEl ? labelEl.textContent.trim() : item.textContent.trim();
            if (!label) continue;

            const entry = { selector: selector, label: label };
            if (columnIndex !== undefined) entry.column = columnIndex;
            discovered.push(entry);
          }

          if (group.discovery.alsoMatchChildren) {
            for (const directChild of child.children) {
              if (matchedElements.has(directChild)) continue;
              if (directChild.style.display === 'none') continue;
              // Skip descendants of hardcoded items to avoid re-discovering them as third-party
              var isHardcodedDescendant = false;
              for (var hi = 0; hi < (group.items || []).length; hi++) {
                var hcEl = doc.querySelector(group.items[hi].selector);
                if (hcEl && hcEl.contains(directChild)) { isHardcodedDescendant = true; break; }
              }
              if (isHardcodedDescendant) continue;
              const span = directChild.querySelector('span');
              if (!span) continue;
              const labelText = span.textContent.trim();
              if (!labelText) continue;
              if (!directChild.id) { directChild.id = 'menu-cleaner-auto-' + (autoIdSeq++); }
              const selector = '#' + directChild.id;
              if (seen.has(selector) || excludeSet.has(selector)) continue;
              seen.add(selector);
              const entry = { selector: selector, label: labelText };
              if (columnIndex !== undefined) entry.column = columnIndex;
              discovered.push(entry);
            }
          }
        }
      } else {
        for (const child of container.children) {
          const header = child.querySelector(group.discovery.hasHeader);
          if (!header) continue;

          const labelEl = header.querySelector(group.discovery.labelInHeader);
          const label = labelEl ? labelEl.textContent.trim() : '';
          if (!label) continue;

          if (!child.id) { child.id = 'menu-cleaner-auto-' + (autoIdSeq++); }
          const selector = '#' + child.id;
          if (seen.has(selector)) continue;
          seen.add(selector);

          const entry = { selector: selector, label: label };
          if (columnIndex !== undefined) entry.column = columnIndex;
          discovered.push(entry);
        }
      }
    }
    return discovered;
  }

  function refreshDiscoveryCache() {
    for (var gi = 0; gi < PANEL_GROUPS.length; gi++) {
      var group = PANEL_GROUPS[gi];
      if (!group.discovery) continue;
      var allDiscovered = discoverItems(group);
      var hardcodedSet = new Set((group.items || []).map(function (i) { return i.selector; }));
      var newItems = allDiscovered.filter(function (d) {
        if (hardcodedSet.has(d.selector)) return false;
        // Also skip descendants of hardcoded items (alsoMatchChildren may pick up sub-elements)
        var el = doc.querySelector(d.selector);
        if (el) {
          for (var hi2 = 0; hi2 < (group.items || []).length; hi2++) {
            var hcEl = doc.querySelector(group.items[hi2].selector);
            if (hcEl && hcEl.contains(el)) return false;
          }
        }
        return true;
      });

      // Preserve column origin from the previous cache
      var oldCache = settings.discoveryCache[group.id] || [];
      var oldColMap = {};
      for (var oi = 0; oi < oldCache.length; oi++) {
        if (oldCache[oi].column !== undefined) oldColMap[oldCache[oi].selector] = oldCache[oi].column;
      }
      for (var ni2 = 0; ni2 < newItems.length; ni2++) {
        if (newItems[ni2].column === undefined && oldColMap[newItems[ni2].selector] !== undefined) {
          newItems[ni2].column = oldColMap[newItems[ni2].selector];
        }
      }

      // 保留硬编码元素被拖动到另一栏后的分栏信息
      var hardcodedWithCol = oldCache.filter(function (c) {
        return hardcodedSet.has(c.selector) && c.column !== undefined;
      });

      settings.discoveryCache[group.id] = newItems.concat(hardcodedWithCol);

      // Append newly discovered selectors to the reorder list
      if (group.reorder && newItems.length > 0) {
        if (!settings.reorder[group.id]) settings.reorder[group.id] = [];
        var existing = {};
        for (var ri = 0; ri < settings.reorder[group.id].length; ri++) {
          existing[settings.reorder[group.id][ri]] = true;
        }
        for (var ni = 0; ni < newItems.length; ni++) {
          if (!existing[newItems[ni].selector]) {
            settings.reorder[group.id].push(newItems[ni].selector);
          }
        }
      }
    }
    saveSettings();
  }

  // ── Escaping helper ───────────────────────────────────────────
  function escHtml(str) {
    const div = doc.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Popup ─────────────────────────────────────────────────────
  function createPopupDOM() {
    if (doc.getElementById('menu-cleaner-popup')) return;

    const html =
      '<div id="menu-cleaner-backdrop" class="menu-cleaner-backdrop"></div>' +
      '<div id="menu-cleaner-popup" class="menu-cleaner-popup">' +
        '<div class="menu-cleaner-popup-header">' +
          '<h2>酒馆菜单精简器</h2>' +
          '<div class="menu-cleaner-popup-actions">' +
            '<button id="menu-cleaner-settings-btn" class="menu_button">设置</button>' +
            '<button id="menu-cleaner-close" class="menu_button">✕ 关闭</button>' +
          '</div>' +
        '</div>' +
        '<div class="menu-cleaner-tabs" id="menu-cleaner-tabs">' +
          '<div class="menu-cleaner-tab active" data-tab="hide">隐藏元素</div>' +
          '<div class="menu-cleaner-tab" data-tab="reorder">重排序</div>' +
        '</div>' +
        '<div id="menu-cleaner-popup-body" class="menu-cleaner-popup-body"></div>' +
      '</div>';
    doc.body.insertAdjacentHTML('beforeend', html);

    doc.getElementById('menu-cleaner-close').addEventListener('click', closePopup);
    doc.getElementById('menu-cleaner-backdrop').addEventListener('click', closePopup);
    doc.getElementById('menu-cleaner-settings-btn').addEventListener('click', toggleSettingsPanel);

    // Tab switching
    var tabs = doc.querySelectorAll('.menu-cleaner-tab');
    for (var ti = 0; ti < tabs.length; ti++) {
      tabs[ti].addEventListener('click', function () {
        switchTab(this.dataset.tab);
      });
    }
  }

  function openPopup() {
    createPopupDOM();
    doc.getElementById('menu-cleaner-backdrop').style.display = 'block';
    doc.getElementById('menu-cleaner-popup').style.display = 'flex';
    showSettingsPanel = false;
    updatePopupView();
    refreshPopup();
    positionPopup();
  }

  function closePopup() {
    const backdrop = doc.getElementById('menu-cleaner-backdrop');
    const popup = doc.getElementById('menu-cleaner-popup');
    if (backdrop) backdrop.style.display = 'none';
    if (popup) popup.style.display = 'none';
    showSettingsPanel = false;
  }

  function toggleSettingsPanel() {
    showSettingsPanel = !showSettingsPanel;
    updatePopupView();
    if (!showSettingsPanel) refreshPopup();
  }

  function updatePopupView() {
    var tabsEl = doc.getElementById('menu-cleaner-tabs');
    var settingsBtn = doc.getElementById('menu-cleaner-settings-btn');
    if (showSettingsPanel) {
      if (tabsEl) tabsEl.style.display = 'none';
      if (settingsBtn) settingsBtn.textContent = '返回';
      renderSettingsView();
    } else {
      if (tabsEl) tabsEl.style.display = '';
      if (settingsBtn) settingsBtn.textContent = '设置';
    }
  }

  function switchTab(tabName) {
    activeTab = tabName;
    var tabs = doc.querySelectorAll('.menu-cleaner-tab');
    for (var ti = 0; ti < tabs.length; ti++) {
      if (tabs[ti].dataset.tab === tabName) {
        tabs[ti].classList.add('active');
      } else {
        tabs[ti].classList.remove('active');
      }
    }
    refreshPopup();
  }

  function renderReorderView() {
    var body = doc.getElementById('menu-cleaner-popup-body');
    if (!body) return;

    // Save which groups are currently expanded
    var expanded = {};
    var currentBodies = doc.querySelectorAll('.menu-cleaner-category-body:not(.collapsed)');
    for (var ei = 0; ei < currentBodies.length; ei++) {
      expanded[currentBodies[ei].dataset.group] = true;
    }

    var reorderGroups = PANEL_GROUPS.filter(function (g) { return g.reorder; });
    var html = '';

    for (var gi = 0; gi < reorderGroups.length; gi++) {
      var group = reorderGroups[gi];
      var items = getReorderItems(group.id);
      var isExpanded = expanded[group.id];
      var isDualCol = settings.columnMode === 'dual' && group.id === 'extensionsSettings';

      html += '<div class="menu-cleaner-category">';
      html += '<div class="menu-cleaner-category-header" data-group="' + group.id + '">';
      html += '<span class="menu-cleaner-category-arrow">' + (isExpanded ? '▼' : '▶') + '</span>';
      html += '<strong>' + escHtml(group.name) + '</strong>';
      html += '<span class="menu-cleaner-category-count">' + items.length + ' 项</span>';
      html += '</div>';
      html += '<div class="menu-cleaner-category-body' + (isExpanded ? '' : ' collapsed') + '" data-group="' + group.id + '">';

      if (isDualCol) {
        var col0Items = items.filter(function (it) {
          var cached = (settings.discoveryCache[group.id] || []).find(function (c) { return c.selector === it.selector; });
          return !cached || cached.column !== 1;
        });
        var col1Items = items.filter(function (it) {
          var cached = (settings.discoveryCache[group.id] || []).find(function (c) { return c.selector === it.selector; });
          return cached && cached.column === 1;
        });
        html += renderColumnSection(group, col0Items, 0, '左栏');
        html += renderColumnSection(group, col1Items, 1, '右栏');
      } else {
        if (items.length === 0) {
          html += '<div class="menu-cleaner-reorder-empty">没有可见元素</div>';
        } else {
          for (var ii = 0; ii < items.length; ii++) {
            html += buildReorderItemHTML(items[ii], group.id, ii, -1);
          }
        }
      }

      html += '</div></div>';
    }

    body.innerHTML = html;

    // Bind category collapse
    var headers = doc.querySelectorAll('.menu-cleaner-category-header');
    for (var hi = 0; hi < headers.length; hi++) {
      headers[hi].addEventListener('click', function () {
        var groupId = this.dataset.group;
        var catBody = doc.querySelector('.menu-cleaner-category-body[data-group="' + groupId + '"]');
        var arrow = this.querySelector('.menu-cleaner-category-arrow');
        if (catBody) {
          catBody.classList.toggle('collapsed');
          arrow.textContent = catBody.classList.contains('collapsed') ? '▶' : '▼';
          positionPopup();
        }
      });
    }

    bindReorderDragEvents();
    positionPopup();
  }

  function renderColumnSection(group, items, colIndex, label) {
    var h = '<div class="menu-cleaner-reorder-column-section">';
    h += '<div class="menu-cleaner-reorder-column-label">' + label + ' (' + items.length + ' 项)</div>';
    if (items.length === 0) {
      h += '<div class="menu-cleaner-reorder-empty">没有可见元素</div>';
    } else {
      for (var i = 0; i < items.length; i++) {
        h += buildReorderItemHTML(items[i], group.id, i, colIndex);
      }
    }
    h += '</div>';
    return h;
  }

  function buildReorderItemHTML(item, groupId, index, colIndex) {
    var h = '<div class="menu-cleaner-reorder-item" draggable="true" data-selector="' + escHtml(item.selector) + '" data-group="' + groupId + '" data-index="' + index + '" data-column="' + colIndex + '">';
    h += '<span class="menu-cleaner-drag-handle" title="拖动排序">⋮⋮</span>';
    h += '<span title="' + escHtml(item.selector) + '">' + escHtml(item.label) + '</span>';
    h += '</div>';
    return h;
  }

  function moveElementToColumn(selector, groupId, targetColumn) {
    // Update or create discoveryCache column origin
    if (!settings.discoveryCache[groupId]) settings.discoveryCache[groupId] = [];
    var cached = settings.discoveryCache[groupId];
    var entry = cached.find(function (c) { return c.selector === selector; });
    if (entry) {
      entry.column = targetColumn;
    } else {
      var elForLabel = doc.querySelector(selector);
      var label = elForLabel ? (elForLabel.textContent || '').trim().substring(0, 40) : selector;
      cached.push({ selector: selector, label: label, column: targetColumn });
    }

    // Move DOM element to the appropriate container
    var el = doc.querySelector(selector);
    if (el) {
      var containers = [];
      for (var gi2 = 0; gi2 < PANEL_GROUPS.length; gi2++) {
        if (PANEL_GROUPS[gi2].id === groupId && PANEL_GROUPS[gi2].discovery) {
          containers = PANEL_GROUPS[gi2].discovery.containers;
        }
      }
      if (containers.length > targetColumn) {
        var targetContainer = doc.querySelector(containers[targetColumn]);
        if (targetContainer && el.parentNode !== targetContainer) {
          targetContainer.appendChild(el);
        }
      }
    }
  }

  function bindReorderDragEvents() {
    var draggedItem = null;
    var draggedGroup = null;
    var draggedIndex = -1;
    var touchGhost = null;
    var touchStartX = 0;
    var touchStartY = 0;
    var touchMoved = false;

    function cleanupDrag() {
      if (draggedItem) draggedItem.classList.remove('dragging');
      var allItems = doc.querySelectorAll('.menu-cleaner-reorder-item');
      for (var ai = 0; ai < allItems.length; ai++) {
        allItems[ai].classList.remove('drag-over');
      }
      var sections = doc.querySelectorAll('.menu-cleaner-reorder-column-section');
      for (var si = 0; si < sections.length; si++) {
        sections[si].classList.remove('drag-over-section');
      }
      if (touchGhost) {
        touchGhost.remove();
        touchGhost = null;
      }
      draggedItem = null;
      draggedGroup = null;
      draggedIndex = -1;
      touchMoved = false;
    }

    function doReorder(fromIndex, toIndex, groupId) {
      var fromCol = draggedItem ? draggedItem.dataset.column : '-1';
      var toCol = doReorder._dropTargetColumn;

      if (fromCol !== '-1' && toCol !== undefined && toCol !== '-1' && fromCol !== toCol) {
        // Cross-column move
        var selector = draggedItem.dataset.selector;
        var reorderItems = getReorderItems(groupId);
        var movedItem = reorderItems.find(function (it) { return it.selector === selector; });
        if (!movedItem) return;

        var remaining = reorderItems.filter(function (it) { return it.selector !== selector; });
        var targetItem = reorderItems.find(function (it, idx) { return idx === toIndex; });
        if (targetItem) {
          var insertIdx = remaining.findIndex(function (it) { return it.selector === targetItem.selector; });
          remaining.splice(insertIdx + 1, 0, movedItem);
        } else {
          remaining.push(movedItem);
        }

        settings.reorder[groupId] = remaining.map(function (ri) { return ri.selector; });
        moveElementToColumn(selector, groupId, parseInt(toCol));
        saveSettings();
        applyReorder(groupId);
        renderReorderView();
        return;
      }

      // Same-column reorder
      var items = getReorderItems(groupId);
      if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;

      var moved = items.splice(fromIndex, 1)[0];
      items.splice(toIndex, 0, moved);

      settings.reorder[groupId] = items.map(function (ri) { return ri.selector; });
      saveSettings();
      applyReorder(groupId);
      renderReorderView();
    }

    var items = doc.querySelectorAll('.menu-cleaner-reorder-item');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];

      item.addEventListener('dragstart', function (e) {
        draggedItem = this;
        draggedGroup = this.dataset.group;
        draggedIndex = parseInt(this.dataset.index);
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.selector);
      });

      item.addEventListener('dragend', function () {
        cleanupDrag();
      });

      item.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this !== draggedItem && this.dataset.group === draggedGroup) {
          this.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', function () {
        this.classList.remove('drag-over');
      });

      item.addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        if (!draggedItem || this === draggedItem) return;
        if (this.dataset.group !== draggedGroup) return;

        doReorder._dropTargetColumn = this.dataset.column;
        doReorder(draggedIndex, parseInt(this.dataset.index), draggedGroup);
        doReorder._dropTargetColumn = undefined;
        cleanupDrag();
      });

      // ── Touch polyfill (mobile) ─────────────────────────
      item.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        var touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchMoved = false;

        draggedItem = this;
        draggedGroup = this.dataset.group;
        draggedIndex = parseInt(this.dataset.index);
        this.classList.add('dragging');

        // Create ghost element that follows the finger
        touchGhost = this.cloneNode(true);
        touchGhost.style.position = 'fixed';
        touchGhost.style.zIndex = '100001';
        touchGhost.style.pointerEvents = 'none';
        touchGhost.style.opacity = '0.85';
        touchGhost.style.width = this.offsetWidth + 'px';
        touchGhost.style.left = (touch.clientX - this.offsetWidth / 2) + 'px';
        touchGhost.style.top = (touch.clientY - 20) + 'px';
        touchGhost.classList.add('dragging');
        doc.body.appendChild(touchGhost);
      });

      item.addEventListener('touchmove', function (e) {
        if (!draggedItem) return;
        e.preventDefault();
        touchMoved = true;
        var touch = e.touches[0];

        // Move ghost
        if (touchGhost) {
          touchGhost.style.left = (touch.clientX - touchGhost.offsetWidth / 2) + 'px';
          touchGhost.style.top = (touch.clientY - 20) + 'px';
        }

        // Hide ghost briefly so it doesn't block elementFromPoint
        if (touchGhost) touchGhost.style.display = 'none';
        var target = doc.elementFromPoint(touch.clientX, touch.clientY);
        if (touchGhost) touchGhost.style.display = '';

        var targetItem = target ? target.closest('.menu-cleaner-reorder-item') : null;

        // Manage drag-over classes
        var allItems = doc.querySelectorAll('.menu-cleaner-reorder-item');
        for (var ti = 0; ti < allItems.length; ti++) {
          if (allItems[ti] === targetItem && allItems[ti] !== draggedItem && allItems[ti].dataset.group === draggedGroup) {
            allItems[ti].classList.add('drag-over');
          } else {
            allItems[ti].classList.remove('drag-over');
          }
        }
      });

      item.addEventListener('touchend', function (e) {
        if (!draggedItem) return;
        e.preventDefault();

        if (touchMoved) {
          var touch = e.changedTouches[0];
          if (touchGhost) touchGhost.style.display = 'none';
          var target = doc.elementFromPoint(touch.clientX, touch.clientY);
          if (touchGhost) touchGhost.style.display = '';

          var targetItem = target ? target.closest('.menu-cleaner-reorder-item') : null;
          if (targetItem && targetItem !== draggedItem && targetItem.dataset.group === draggedGroup) {
            targetItem.classList.remove('drag-over');
            doReorder._dropTargetColumn = targetItem.dataset.column;
            doReorder(draggedIndex, parseInt(targetItem.dataset.index), draggedGroup);
            doReorder._dropTargetColumn = undefined;
          }
        }

        cleanupDrag();
      });

      item.addEventListener('touchcancel', function () {
        cleanupDrag();
      });
    }

    // Bind column-section drop (for cross-column drag into empty columns)
    var sections = doc.querySelectorAll('.menu-cleaner-reorder-column-section');
    for (var si2 = 0; si2 < sections.length; si2++) {
      var section = sections[si2];
      section.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over-section');
      });

      section.addEventListener('dragleave', function (e) {
        if (!this.contains(e.relatedTarget)) {
          this.classList.remove('drag-over-section');
        }
      });

      section.addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('drag-over-section');
        if (!draggedItem) return;

        var firstItem = this.querySelector('.menu-cleaner-reorder-item');
        if (!firstItem) {
          // Empty column: append dragged item to this column
          var targetCol = -1;
          var label = this.querySelector('.menu-cleaner-reorder-column-label');
          if (label) {
            if (label.textContent.indexOf('右栏') !== -1) targetCol = 1;
            else if (label.textContent.indexOf('左栏') !== -1) targetCol = 0;
          }
          if (targetCol >= 0 && draggedItem.dataset.column !== String(targetCol)) {
            var selector = draggedItem.dataset.selector;
            var groupId = draggedGroup;
            var reorderItems = getReorderItems(groupId);
            var movedItem = reorderItems.find(function (it) { return it.selector === selector; });
            if (movedItem) {
              var remaining = reorderItems.filter(function (it) { return it.selector !== selector; });
              remaining.push(movedItem);
              settings.reorder[groupId] = remaining.map(function (ri) { return ri.selector; });
              moveElementToColumn(selector, groupId, targetCol);
              saveSettings();
              applyReorder(groupId);
              renderReorderView();
            }
          }
          cleanupDrag();
        }
      });
    }
  }

  function positionPopup() {
    const popup = doc.getElementById('menu-cleaner-popup');
    if (!popup) return;
    const vh = win.innerHeight;
    const vw = win.innerWidth;
    const margin = 10;

    popup.style.maxHeight = '90vh';
    popup.style.maxWidth = Math.min(560, vw - margin * 2) + 'px';
    popup.style.top = '0';
    popup.style.left = '0';
    popup.style.transform = 'none';

    const popupHeight = popup.offsetHeight;
    const popupWidth = popup.offsetWidth;

    const top = Math.max(margin, (vh - popupHeight) / 2);
    const left = Math.max(margin, (vw - popupWidth) / 2);

    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  }

  // ── Settings panel view ──────────────────────────────────────
  function renderSettingsView() {
    var body = doc.getElementById('menu-cleaner-popup-body');
    if (!body) return;

    var html = '';
    html += '<div class="menu-cleaner-settings-panel">';
    html += '<button id="menu-cleaner-rescan" class="menu_button menu-cleaner-settings-btn-full">手动重新扫描</button>';
    html += '<button id="menu-cleaner-reset-order" class="menu_button menu-cleaner-settings-btn-full">恢复原始排序</button>';
    html += '<button id="menu-cleaner-clear-data" class="menu_button menu-cleaner-settings-btn-full">清除插件数据</button>';
    html += '<div class="menu-cleaner-settings-divider">—————— 扩展菜单分栏选项 ——————</div>';
    html += '<div class="menu-cleaner-settings-radio-group">';
    html += '<label class="menu-cleaner-settings-radio">';
    html += '<input type="radio" name="menu-cleaner-column-mode" value="single" ' + (settings.columnMode === 'single' ? 'checked' : '') + '>';
    html += '<span>单栏</span>';
    html += '</label>';
    html += '<label class="menu-cleaner-settings-radio">';
    html += '<input type="radio" name="menu-cleaner-column-mode" value="dual" ' + (settings.columnMode === 'dual' ? 'checked' : '') + '>';
    html += '<span>双栏</span>';
    html += '</label>';
    html += '</div>';
    html += '<div class="menu-cleaner-settings-divider">—————— 调试用内容 ——————</div>';
    html += '<div class="menu-cleaner-settings-row">';
    html += '<span>重扫描消息toast</span>';
    html += '<label class="menu-cleaner-toggle">';
    html += '<input type="checkbox" id="menu-cleaner-rescan-toast" ' + (settings.rescanToast ? 'checked' : '') + '>';
    html += '<span class="menu-cleaner-slider"></span>';
    html += '</label>';
    html += '</div>';
    html += '</div>';

    body.innerHTML = html;

    doc.getElementById('menu-cleaner-rescan').addEventListener('click', function () { doRescan(); });
    doc.getElementById('menu-cleaner-reset-order').addEventListener('click', function () { resetAllReorders(); });

    doc.getElementById('menu-cleaner-clear-data').addEventListener('click', function () {
      if (!confirm('确定要清除所有插件配置数据吗？此操作不可撤销。')) return;
      settings = Object.assign({}, defaultSettings);
      win.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      clearAllHides();
      showSettingsPanel = false;
      activeTab = 'hide';
      updatePopupView();
      doRescan();
    });

    var radios = doc.querySelectorAll('input[name="menu-cleaner-column-mode"]');
    for (var ri = 0; ri < radios.length; ri++) {
      radios[ri].addEventListener('change', function (e) {
        settings.columnMode = e.target.value;
        applyColumnMode();
        saveSettings();
      });
    }

    doc.getElementById('menu-cleaner-rescan-toast').addEventListener('change', function (e) {
      settings.rescanToast = e.target.checked;
      saveSettings();
    });

    positionPopup();
  }

  function refreshPopup() {
    if (showSettingsPanel) return;
    if (activeTab === 'reorder') {
      renderReorderView();
      return;
    }
    renderHideView();
  }

  // ── Build popup content ───────────────────────────────────────
  function renderHideView() {
    const body = doc.getElementById('menu-cleaner-popup-body');
    if (!body) return;

    let html = '';

    for (const group of PANEL_GROUPS) {
      const cached = settings.discoveryCache[group.id] || [];
      const totalCount = (group.items || []).length + cached.length;

      html += '<div class="menu-cleaner-category">';
      html += '<div class="menu-cleaner-category-header" data-group="' + group.id + '">';
      html += '<span class="menu-cleaner-category-arrow">▶</span>';
      html += '<strong>' + escHtml(group.name) + '</strong>';
      html += '<span class="menu-cleaner-category-count">' + totalCount + ' 项</span>';
      html += '</div>';
      html += '<div class="menu-cleaner-category-body collapsed" data-group="' + group.id + '">';

      for (const item of (group.items || [])) {
        const isHidden = settings.hiddenSelectors[item.selector] === true;
        html += '<div class="menu-cleaner-item" data-selector="' + escHtml(item.selector) + '">';
        html += '<span title="' + escHtml(item.selector) + '">' + escHtml(item.label) + '</span>';
        html += '<label class="menu-cleaner-toggle">';
        html += '<input type="checkbox" class="menu-cleaner-checkbox" data-selector="' + escHtml(item.selector) + '"' + (isHidden ? '' : ' checked') + '>';
        html += '<span class="menu-cleaner-slider"></span>';
        html += '</label>';
        html += '</div>';
      }

      if (cached.length > 0) {
        html += '<div class="menu-cleaner-separator">由插件引入</div>';
        for (const item of cached) {
          const isHidden = settings.hiddenSelectors[item.selector] === true;
          html += '<div class="menu-cleaner-item menu-cleaner-item-discovered" data-selector="' + escHtml(item.selector) + '">';
          html += '<span title="' + escHtml(item.selector) + '">' + escHtml(item.label) + '</span>';
          html += '<label class="menu-cleaner-toggle">';
          html += '<input type="checkbox" class="menu-cleaner-checkbox" data-selector="' + escHtml(item.selector) + '"' + (isHidden ? '' : ' checked') + '>';
          html += '<span class="menu-cleaner-slider"></span>';
          html += '</label>';
          html += '</div>';
        }
      }

      html += '</div></div>';
    }

    body.innerHTML = html;
    bindPopupEvents();
    positionPopup();
  }

  // ── Popup event bindings ──────────────────────────────────────
  function bindPopupEvents() {
    var headers = doc.querySelectorAll('.menu-cleaner-category-header');
    for (var i = 0; i < headers.length; i++) {
      headers[i].addEventListener('click', function () {
        var groupId = this.dataset.group;
        var categoryBody = doc.querySelector('.menu-cleaner-category-body[data-group="' + groupId + '"]');
        var arrow = this.querySelector('.menu-cleaner-category-arrow');
        if (categoryBody) {
          categoryBody.classList.toggle('collapsed');
          arrow.textContent = categoryBody.classList.contains('collapsed') ? '▶' : '▼';
        }
        positionPopup();
      });
    }

    var checkboxes = doc.querySelectorAll('.menu-cleaner-checkbox');
    for (var j = 0; j < checkboxes.length; j++) {
      checkboxes[j].addEventListener('change', function () {
        var selector = this.dataset.selector;
        if (!selector) return;
        settings.hiddenSelectors[selector] = !this.checked;
        saveSettings();
        applyHides();
      });
    }
  }

  // ── UI: Entry in extensionsMenu (魔棒) ────────────────────────
  function injectMenuEntry() {
    var menu = doc.querySelector('#extensionsMenu');
    if (!menu) {
      setTimeout(injectMenuEntry, 500);
      return;
    }
    if (doc.getElementById('menu-cleaner-wand-container')) return;

    var container = doc.createElement('div');
    container.id = 'menu-cleaner-wand-container';
    container.className = 'extension_container interactable';
    container.innerHTML =
      '<div id="menu-cleaner-btn" class="list-group-item flex-container flexGap5 interactable">' +
        '<div class="fa-solid fa-broom extensionsMenuExtensionButton"></div>' +
        '<span>酒馆菜单精简器</span>' +
      '</div>';
    menu.appendChild(container);
    container.addEventListener('click', function () { openPopup(); });
  }

  // ── UI: Settings drawer in extensions_settings ──────────────
  function injectSettingsEntry() {
    var target = doc.querySelector('#extensions_settings');
    if (!target) {
      setTimeout(injectSettingsEntry, 500);
      return;
    }
    if (doc.getElementById('menu-cleaner-settings')) return;

    var html =
      '<div id="menu-cleaner-settings" class="inline-drawer">' +
        '<div class="inline-drawer-toggle inline-drawer-header">' +
          '<b>酒馆菜单精简器</b>' +
          '<div class="inline-drawer-icon fa-solid fa-circle-chevron-down down interactable"></div>' +
        '</div>' +
        '<div class="inline-drawer-content">' +
          '<div style="padding:8px 0;">' +
            '<label class="checkbox_label">' +
              '<input id="menu-cleaner-enable" type="checkbox"' + (settings.enabled ? ' checked' : '') + '>' +
              '<span>启用扩展</span>' +
            '</label>' +
            '<p style="color:#888;font-size:0.85em;margin:4px 0;">' +
              '点击魔棒菜单中的 <b>酒馆菜单精简器</b> 打开操作面板，选择要隐藏的原生菜单项。' +
            '</p>' +
            '<button id="menu-cleaner-open-popup" class="menu_button">打开操作面板</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    target.insertAdjacentHTML('beforeend', html);

    var toggleEl = target.querySelector('#menu-cleaner-settings .inline-drawer-toggle');
    var contentEl = target.querySelector('#menu-cleaner-settings .inline-drawer-content');
    toggleEl && toggleEl.addEventListener('click', function () {
      contentEl && contentEl.classList.toggle('closedDrawer');
    });

    var enableCb = doc.getElementById('menu-cleaner-enable');
    enableCb && enableCb.addEventListener('change', function (e) {
      settings.enabled = e.target.checked;
      saveSettings();
      e.target.checked ? applyHides() : clearAllHides();
    });

    var openBtn = doc.getElementById('menu-cleaner-open-popup');
    openBtn && openBtn.addEventListener('click', function () { openPopup(); });
  }

  // ── Keyboard ──────────────────────────────────────────────────
  function setupKeyboard() {
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var popup = doc.getElementById('menu-cleaner-popup');
        if (popup && popup.style.display !== 'none') {
          closePopup();
        }
      }
    });

    win.addEventListener('resize', function () {
      var popup = doc.getElementById('menu-cleaner-popup');
      if (popup && popup.style.display !== 'none') {
        positionPopup();
      }
    });
  }

  // ── Slash command ─────────────────────────────────────────────
  // 酒馆助手运行在 iframe 中，SlashCommandParser 是父页面 ES module 作用域内的对象，
  // 无法通过 window 直接访问，需要向父文档注入 <script type="module"> 来注册命令。
  function registerSlashCmd() {
    try {
      var script = doc.createElement('script');
      script.type = 'module';
      script.textContent =
        "import { registerSlashCommand } from '/scripts/slash-commands.js';\n" +
        "registerSlashCommand('menucleaner', function () {\n" +
        "  var popup = document.getElementById('menu-cleaner-popup');\n" +
        "  var backdrop = document.getElementById('menu-cleaner-backdrop');\n" +
        "  if (popup && backdrop) {\n" +
        "    backdrop.style.display = 'block';\n" +
        "    popup.style.display = 'flex';\n" +
        "  } else {\n" +
        "    // 弹窗 DOM 尚未创建(从未打开过面板)，尝试点击触发按钮\n" +
        "    var btn = document.getElementById('menu-cleaner-btn');\n" +
        "    if (btn && btn.offsetParent) { btn.click(); return ''; }\n" +
        "    var settingsBtn = document.getElementById('menu-cleaner-open-popup');\n" +
        "    if (settingsBtn) { settingsBtn.click(); }\n" +
        "  }\n" +
        "  return '';\n" +
        "}, [], '打开酒馆菜单精简器操作面板');\n";
      doc.head.appendChild(script);
      console.debug('[MenuCleaner] 已注册 /menucleaner 命令');
    } catch (e) {
      console.debug('[MenuCleaner] 斜杠命令注册失败', e);
    }
  }

  // ── Init ──────────────────────────────────────────────────────
  // ── Auto-rescan ──────────────────────────────────────────────
  function scheduleAutoRescan() {
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(function () {
      doRescan();
      rescanTimer = null;
    }, 800);
  }

  function setupAutoRescan() {
    // SillyTavern event: chat/character changed
    try {
      if (win.eventSource && win.event_types && win.event_types.CHAT_CHANGED) {
        win.eventSource.on(win.event_types.CHAT_CHANGED, function () {
          scheduleAutoRescan();
        });
        console.debug('[酒馆菜单精简器] 已注册 CHAT_CHANGED 自动重扫描');
      }
    } catch (e) {
      console.debug('[酒馆菜单精简器] 事件监听注册失败', e);
    }

    // MutationObserver: watch for new elements injected into extension containers
    var observeContainers = function () {
      var targets = ['#extensions_settings', '#extensions_settings2'];
      for (var t = 0; t < targets.length; t++) {
        var el = doc.querySelector(targets[t]);
        if (!el) continue;
        var observer = new win.MutationObserver(function (mutations) {
          if (suppressObserver) return;
          for (var m = 0; m < mutations.length; m++) {
            if (mutations[m].addedNodes.length > 0) {
              scheduleAutoRescan();
              return;
            }
          }
        });
        observer.observe(el, { childList: true, subtree: false });
      }
    };

    var retries = 0;
    var tryObserve = function () {
      if (doc.querySelector('#extensions_settings')) {
        observeContainers();
      } else if (retries < 20) {
        retries++;
        setTimeout(tryObserve, 500);
      }
    };
    setTimeout(tryObserve, 1000);
  }

  function init() {
    loadSettings();
    injectStyle();

    // Scan first to capture column origins from the natural DOM state
    refreshDiscoveryCache();

    // Then apply column mode (merge or restore)
    if (settings.columnMode === 'dual') {
      restoreExtensionSettingsColumns();
    } else {
      mergeExtensionSettingsColumns();
    }

    injectMenuEntry();
    injectSettingsEntry();
    setupKeyboard();
    registerSlashCmd();
    setupAutoRescan();

    // Delayed re-scan catches extensions that inject buttons after init
    setTimeout(function () {
      suppressObserver = true;
      if (settings.columnMode === 'single') {
        mergeExtensionSettingsColumns();
      } else {
        restoreExtensionSettingsColumns();
      }
      refreshDiscoveryCache();
      applyAllReorders();
      setTimeout(function() { suppressObserver = false; }, 0);
    }, 3000);

    if (settings.enabled) {
      applyHides();
      setTimeout(function () {
        suppressObserver = true;
        if (settings.columnMode === 'single') {
          mergeExtensionSettingsColumns();
        } else {
          restoreExtensionSettingsColumns();
        }
        applyAllReorders();
        setTimeout(function() { suppressObserver = false; }, 0);
      }, 500);
    }
  }

  // Start when DOM is ready (parent page's DOM)
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
