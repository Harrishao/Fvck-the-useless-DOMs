(function () {
  'use strict';

  // 酒馆助手在 iframe 中执行脚本，需要操作父页面的 document
  var doc = window.frameElement ? window.parent.document : document;
  var win = window.frameElement ? window.parent : window;

  const STORAGE_KEY = 'menu_cleaner_settings';
  let autoIdSeq = 0;
  let activeTab = 'hide';
  let showSettingsPanel = false;
  let extPanelVisible = false;
  let rescanTimer = null;
  let dragActive = false; // set while user is dragging a reorder item

  // ── Hardcoded native elements ─────────────────────────────────
  const PANEL_GROUPS = [
    {
      id: 'options',
      name: '左下菜单',
      buttonId: '#options_button',
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
      items: [
        { selector: '#manageAttachments',          label: '打开数据库' },
        { selector: '#attachFile',                 label: '附加文件' },
        { selector: '#sd_gen',                     label: '生成图片' },
        { selector: '#send_picture',               label: 'Generate Caption' },
        { selector: '#ttsExtensionNarrateAll',     label: 'Narrate All Chat' },
        { selector: '#token_counter',              label: '词符计数器' },
        { selector: '#translate_chat',             label: '翻译聊天' },
        { selector: '#translate_input_message',    label: '翻译输入' }
      ],
      discovery: {
        containers: ['#extensionsMenu'],
        itemMatch: '.list-group-item',
        labelIn: 'span',
        alsoMatchChildren: true
      }
    },
    {
      id: 'extensionsSettings',
      name: '扩展菜单',
      buttonId: '#extensions-settings-button',
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
      ],
      discovery: {
        containers: ['#extensions_settings', '#extensions_settings2'],
        hasHeader: '.inline-drawer-header',
        labelInHeader: 'b, [data-i18n]'
      }
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

  // Groups that support reordering
  const REORDER_GROUP_IDS = ['extensionsSettings', 'extensionsMenu', 'options'];

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
    initialSnapshot: null, // set once on first init, cleared by "清除插件数据"
    rescanToast: false,
    columnMode: 'dual'   // 'single' | 'dual'
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

      // Selectors injected by this plugin — don't clean them up even if not yet in DOM
      var SELF_INJECTED = ['#menu-cleaner-settings', '#menu-cleaner-btn'];
      // Clean up stale entries
      var hiddenKeys = Object.keys(settings.hiddenSelectors);
      for (var hk = 0; hk < hiddenKeys.length; hk++) {
        if (!doc.querySelector(hiddenKeys[hk]) && SELF_INJECTED.indexOf(hiddenKeys[hk]) === -1) delete settings.hiddenSelectors[hiddenKeys[hk]];
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

#menu-cleaner-open-popup,
#menu-cleaner-close,
#menu-cleaner-rescan,
#menu-cleaner-reset-order,
#menu-cleaner-settings-btn {
  white-space: nowrap !important;
  flex-shrink: 0;
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

.menu-cleaner-popup-header h2 { margin: 0; font-size: 18px; }

.menu-cleaner-popup-actions { display: flex; gap: 8px; }

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

.menu-cleaner-category-header:hover { background: rgba(255, 255, 255, 0.04); }

.menu-cleaner-category-arrow { font-size: 10px; width: 14px; transition: transform 0.15s; }

.menu-cleaner-category-count {
  font-size: 0.8em;
  color: var(--SmartThemeBodyColor, #888);
  margin-left: auto;
}

.menu-cleaner-category-body { padding: 0 0 6px 0; }
.menu-cleaner-category-body.collapsed { display: none; }

/* ── Items ───────────────────────────────────────── */
.menu-cleaner-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 18px 6px 36px;
  gap: 12px;
}

.menu-cleaner-item:hover { background: rgba(255, 255, 255, 0.03); }

.menu-cleaner-item > span:first-child {
  flex: 1;
  font-size: 0.92em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-cleaner-separator {
  opacity: 0.45;
  font-size: 0.78em;
  padding: 6px 18px 2px 36px;
  color: var(--SmartThemeBodyColor, #888);
}

.menu-cleaner-item-discovered > span:first-child::before {
  content: "[扩展] ";
  font-size: 0.78em;
  opacity: 0.55;
}

/* ── Toggle Slider ───────────────────────────────── */
.menu-cleaner-toggle {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}

.menu-cleaner-toggle input { opacity: 0; width: 0; height: 0; }

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
  height: 16px; width: 16px;
  left: 3px; bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.25s;
}

.menu-cleaner-toggle input:checked + .menu-cleaner-slider { background: #7c5cff; }

.menu-cleaner-toggle input:checked + .menu-cleaner-slider::before { transform: translateX(18px); }

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

.menu-cleaner-tab:hover { color: #ccc; background: rgba(255, 255, 255, 0.03); }
.menu-cleaner-tab.active { color: #fff; border-bottom-color: #7c5cff; }

/* ── Reorder Items ───────────────────────────────── */
.menu-cleaner-reorder-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 18px 7px 28px;
  cursor: grab;
  transition: background 0.15s;
  border-left: 3px solid transparent;
}

.menu-cleaner-reorder-item:hover { background: rgba(255, 255, 255, 0.03); }

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
  flex-shrink: 0;
  transition: color 0.15s;
}

.menu-cleaner-drag-handle:hover { color: #aaa; }
.menu-cleaner-drag-handle:active { cursor: grabbing; }

/* ── Drag States ─────────────────────────────────── */
.menu-cleaner-reorder-item.dragging { opacity: 0.4; background: rgba(124, 92, 255, 0.1); }
.menu-cleaner-reorder-item.drag-over {
  border-left-color: #7c5cff;
  background: rgba(124, 92, 255, 0.08);
}

.menu-cleaner-reorder-column-section.drag-over-section {
  outline: 2px dashed #7c5cff;
  outline-offset: -2px;
  border-radius: 4px;
  background: rgba(124, 92, 255, 0.05);
}

/* ── Settings Panel ──────────────────────────────── */
.menu-cleaner-settings-panel { padding: 12px 18px; }

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

button.menu-cleaner-settings-btn-full:last-child { border-bottom: none; }
button.menu-cleaner-settings-btn-full:hover { background: rgba(255, 255, 255, 0.06); }
button.menu-cleaner-settings-btn-full:active { background: rgba(255, 255, 255, 0.1); }

.menu-cleaner-colmode-option {
  cursor: pointer;
  border-radius: 4px;
  padding: 10px 12px !important;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}
.menu-cleaner-colmode-option:hover { background: rgba(255, 255, 255, 0.06); }
.menu-cleaner-colmode-active {
  background: rgba(100, 150, 255, 0.15) !important;
  border-color: rgba(100, 150, 255, 0.4) !important;
}

.menu-cleaner-settings-divider {
  text-align: center;
  color: var(--SmartThemeBodyColor, #888);
  font-size: 0.8em;
  padding: 14px 0 10px 0;
  opacity: 0.7;
}

.menu-cleaner-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 0.92em;
}

/* ── Dual-Column Reorder ─────────────────────────── */
.menu-cleaner-reorder-column-section { margin-bottom: 6px; }

.menu-cleaner-reorder-column-label {
  font-size: 0.82em;
  color: var(--SmartThemeBodyColor, #888);
  padding: 8px 18px 4px 36px;
  opacity: 0.75;
}

/* ── Extensions Panel ────────────────────────────── */
.menu-cleaner-ext-panel {
  display: none;
  height: auto;
  visibility: visible; /* override ST .closedDrawer */
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  z-index: 3000;
  transition: none !important;
  animation: none !important;
}

.menu-cleaner-ext-col {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 100px;
}

/* Replicate native header styling for elements in our columns */
#menu-cleaner-ext-col1 .inline-drawer-toggle.inline-drawer-header,
#menu-cleaner-ext-col2 .inline-drawer-toggle.inline-drawer-header {
  background-image: linear-gradient(348deg, var(--white30a)2%, var(--grey30a)10%, var(--black70a)95%, var(--SmartThemeQuoteColor)100%);
  margin-bottom: 5px;
  border-radius: 10px;
  padding: 2px 5px;
  border: 1px solid var(--SmartThemeBorderColor);
}

#menu-cleaner-ext-col1 .inline-drawer-toggle.inline-drawer-header:hover,
#menu-cleaner-ext-col2 .inline-drawer-toggle.inline-drawer-header:hover {
  filter: brightness(150%);
}

@media screen and (max-width: 1000px) {
  #menu-cleaner-ext-col1,
  #menu-cleaner-ext-col2 {
    width: 100% !important;
    min-width: 100% !important;
  }
}

/* ── Animations ──────────────────────────────────── */
@keyframes menu-cleaner-fadein {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes menu-cleaner-scalein {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
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
      // Hide the native extensions block — our panel replaces it
      rules.push('#rm_extensions_block { display: none !important; }');
    }

    var hiddenSelKeys = Object.keys(settings.hiddenSelectors);
    for (var hk = 0; hk < hiddenSelKeys.length; hk++) {
      if (settings.hiddenSelectors[hiddenSelKeys[hk]]) {
        rules.push(hiddenSelKeys[hk] + ' { display: none !important; }');
      }
    }

    styleEl.textContent = rules.join('\n');
  }

  function clearAllHides() {
    const styleEl = doc.getElementById('menu-cleaner-hides');
    if (styleEl) styleEl.textContent = '';
  }

  // ── Snapshot system ─────────────────────────────────────────────
  function extractHeaderLabel(header) {
    if (!header) return '';
    // 1. Prefer DIRECT child b/[data-i18n] — avoids nested matches in subcontent
    for (var ci = 0; ci < header.children.length; ci++) {
      var ch = header.children[ci];
      if (ch.tagName === 'B' || ch.hasAttribute('data-i18n')) {
        var text = (ch.textContent || '').trim();
        if (text) return text;
      }
    }
    // 2. Fall back to first descendant b/[data-i18n], but only if its text is short enough to be a label
    var nested = header.querySelector('b, [data-i18n]');
    if (nested) {
      var nt = (nested.textContent || '').trim();
      if (nt && nt.length <= 40) return nt;
    }
    // 3. Direct text nodes only — avoid pulling in version strings / taglines from nested elements
    var direct = '';
    for (var ni = 0; ni < header.childNodes.length; ni++) {
      var n = header.childNodes[ni];
      if (n.nodeType === 3) direct += n.textContent;
    }
    direct = direct.trim();
    if (direct) return direct;
    // 4. Last resort: full textContent minus icon text (handles <span>-wrapped labels)
    var icon = header.querySelector('.inline-drawer-icon');
    var iconText = icon ? icon.textContent.trim() : '';
    var full = (header.textContent || '').trim();
    if (iconText && full.slice(-iconText.length) === iconText) {
      full = full.slice(0, -iconText.length).trim();
    }
    if (full) return full;
    return '';
  }

  function captureInitialSnapshot() {
    if (settings.initialSnapshot) return; // already captured

    var snapshot = {};
    for (var g = 0; g < PANEL_GROUPS.length; g++) {
      var group = PANEL_GROUPS[g];
      if (!group.discovery) continue;
      var entries = [];
      var seen = new Set();

      for (var ci = 0; ci < group.discovery.containers.length; ci++) {
        var container = doc.querySelector(group.discovery.containers[ci]);
        if (!container) continue;
        var idx = 0;
        var children = container.children;
        for (var c = 0; c < children.length; c++) {
          var child = children[c];
          if (win.getComputedStyle(child).display === 'none') continue;
          if (!child.id) { child.id = 'menu-cleaner-auto-' + (autoIdSeq++); }

          var header = child.querySelector(group.discovery.hasHeader);
          if (!header) continue;
          var label = extractHeaderLabel(header);
          if (!label) continue;

          var selector = '#' + child.id;
          if (seen.has(selector)) continue;
          seen.add(selector);

          entries.push({ selector: selector, label: label, column: ci, index: idx++ });
        }
      }
      // Fallback: include hardcoded group items that may lack .inline-drawer-header
      for (var hi = 0; hi < group.items.length; hi++) {
        var item = group.items[hi];
        if (seen.has(item.selector)) continue;
        var el = doc.querySelector(item.selector);
        if (!el) continue;
        var itemCol = 0;
        for (var cci = 0; cci < group.discovery.containers.length; cci++) {
          var cc = doc.querySelector(group.discovery.containers[cci]);
          if (cc && cc.contains(el)) { itemCol = cci; break; }
        }
        entries.push({ selector: item.selector, label: item.label, column: itemCol, index: entries.length });
      }
      if (entries.length > 0) snapshot[group.id] = entries;
    }

    settings.initialSnapshot = snapshot;
    saveSettings();
  }

  // ── Dynamic discovery ──────────────────────────────────────────
  function discoverItems(group) {
    if (!group.discovery) return [];
    var discovered = [];
    var seen = new Set();
    var excludeSet = new Set(group.discovery.exclude || []);
    var multiContainer = group.discovery.containers.length > 1;

    for (var ci = 0; ci < group.discovery.containers.length; ci++) {
      var container = doc.querySelector(group.discovery.containers[ci]);
      if (!container) continue;
      var columnIndex = multiContainer ? ci : undefined;

      if (group.discovery.itemMatch) {
        var children = container.children;
        for (var c = 0; c < children.length; c++) {
          var child = children[c];
          if (win.getComputedStyle(child).display === 'none') continue;
          var matchedElements = new Set();
          var items = child.querySelectorAll(group.discovery.itemMatch);
          for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.style.display === 'none') continue;
            if (!item.id) { item.id = 'menu-cleaner-auto-' + (autoIdSeq++); }
            var selector = '#' + item.id;
            if (seen.has(selector) || excludeSet.has(selector)) continue;
            seen.add(selector);
            matchedElements.add(item);

            var labelEl = item.querySelector(group.discovery.labelIn);
            var label = labelEl ? labelEl.textContent.trim() : item.textContent.trim();
            if (!label) continue;

            var entry = { selector: selector, label: label };
            if (columnIndex !== undefined) entry.column = columnIndex;
            discovered.push(entry);
          }

          if (group.discovery.alsoMatchChildren) {
            var directChildren = child.children;
            for (var dc = 0; dc < directChildren.length; dc++) {
              var directChild = directChildren[dc];
              if (matchedElements.has(directChild)) continue;
              if (directChild.style.display === 'none') continue;
              var isHardcodedDescendant = false;
              for (var hi = 0; hi < group.items.length; hi++) {
                var hcEl = doc.querySelector(group.items[hi].selector);
                if (hcEl && hcEl.contains(directChild)) { isHardcodedDescendant = true; break; }
              }
              if (isHardcodedDescendant) continue;
              var span = directChild.querySelector('span');
              if (!span) continue;
              var labelText = span.textContent.trim();
              if (!labelText) continue;
              if (!directChild.id) { directChild.id = 'menu-cleaner-auto-' + (autoIdSeq++); }
              var ds = '#' + directChild.id;
              if (seen.has(ds) || excludeSet.has(ds)) continue;
              seen.add(ds);
              var de = { selector: ds, label: labelText };
              if (columnIndex !== undefined) de.column = columnIndex;
              discovered.push(de);
            }
          }
        }
      } else {
        // Mode: match container children that have a specific header element
        var headerChildren = container.children;
        for (var hc = 0; hc < headerChildren.length; hc++) {
          var hcChild = headerChildren[hc];
          var header = hcChild.querySelector(group.discovery.hasHeader);
          if (!header) continue;

          var label2 = extractHeaderLabel(header);
          if (!label2) continue;

          if (!hcChild.id) { hcChild.id = 'menu-cleaner-auto-' + (autoIdSeq++); }
          var hcSelector = '#' + hcChild.id;
          if (seen.has(hcSelector)) continue;
          seen.add(hcSelector);

          var hcEntry = { selector: hcSelector, label: label2 };
          if (columnIndex !== undefined) hcEntry.column = columnIndex;
          discovered.push(hcEntry);
        }
      }
    }
    return discovered;
  }

  function refreshDiscoveryCache() {
    for (var g = 0; g < PANEL_GROUPS.length; g++) {
      var group = PANEL_GROUPS[g];
      if (!group.discovery) continue;
      var allDiscovered = discoverItems(group);
      var hardcodedSet = new Set();
      for (var hi = 0; hi < group.items.length; hi++) hardcodedSet.add(group.items[hi].selector);

      // Filter: exclude hardcoded items and their descendants
      var newItems = allDiscovered.filter(function(d) {
        if (hardcodedSet.has(d.selector)) return false;
        var el = doc.querySelector(d.selector);
        if (el) {
          for (var hsi = 0; hsi < group.items.length; hsi++) {
            var hcEl = doc.querySelector(group.items[hsi].selector);
            if (hcEl && hcEl.contains(el)) return false;
          }
        }
        return true;
      });

      // Preserve column origin from old cache (user's prior cross-column moves win over physical scan)
      var oldCache = settings.discoveryCache[group.id] || [];
      var oldColMap = {};
      for (var oc = 0; oc < oldCache.length; oc++) {
        if (oldCache[oc].column !== undefined) oldColMap[oldCache[oc].selector] = oldCache[oc].column;
      }
      for (var ni = 0; ni < newItems.length; ni++) {
        if (oldColMap[newItems[ni].selector] !== undefined) {
          newItems[ni].column = oldColMap[newItems[ni].selector];
        }
      }

      // Preserve hardcoded items' column info (created by cross-column moves)
      for (var oi = 0; oi < oldCache.length; oi++) {
        var old = oldCache[oi];
        if (hardcodedSet.has(old.selector) && old.column !== undefined) {
          var found = false;
          for (var fi = 0; fi < newItems.length; fi++) {
            if (newItems[fi].selector === old.selector) { found = true; break; }
          }
          if (!found) {
            newItems.push({ selector: old.selector, label: old.label, column: old.column });
          }
        }
      }

      // Safety net: carry over non-hardcoded entries still in DOM but missed by current scan
      for (var si = 0; si < oldCache.length; si++) {
        var oldEntry = oldCache[si];
        if (hardcodedSet.has(oldEntry.selector)) continue;
        var alreadyInNew = false;
        for (var nj = 0; nj < newItems.length; nj++) {
          if (newItems[nj].selector === oldEntry.selector) { alreadyInNew = true; break; }
        }
        if (alreadyInNew) continue;
        if (!doc.querySelector(oldEntry.selector)) continue;
        newItems.push({ selector: oldEntry.selector, label: oldEntry.label, column: oldEntry.column });
      }

      settings.discoveryCache[group.id] = newItems;

      // Append newly discovered selectors to reorder list
      if (REORDER_GROUP_IDS.indexOf(group.id) !== -1 && newItems.length > 0) {
        if (!settings.reorder[group.id]) settings.reorder[group.id] = [];
        var existing = new Set(settings.reorder[group.id]);
        for (var ai = 0; ai < newItems.length; ai++) {
          if (!existing.has(newItems[ai].selector)) {
            settings.reorder[group.id].push(newItems[ai].selector);
          }
        }
      }
    }
    saveSettings();
  }

  // ── Column cache helper ─────────────────────────────────────────
  function setColumnInCache(selector, groupId, columnIndex) {
    if (!settings.discoveryCache[groupId]) settings.discoveryCache[groupId] = [];
    var cached = settings.discoveryCache[groupId];
    var entry = null;
    for (var c = 0; c < cached.length; c++) {
      if (cached[c].selector === selector) { entry = cached[c]; break; }
    }
    if (entry) {
      entry.column = columnIndex;
    } else {
      // Try to source a clean label: hardcoded list first, then header extraction
      var label = '';
      for (var pg = 0; pg < PANEL_GROUPS.length; pg++) {
        if (PANEL_GROUPS[pg].id !== groupId) continue;
        for (var pi = 0; pi < PANEL_GROUPS[pg].items.length; pi++) {
          if (PANEL_GROUPS[pg].items[pi].selector === selector) {
            label = PANEL_GROUPS[pg].items[pi].label;
            break;
          }
        }
        break;
      }
      if (!label) {
        var el = doc.querySelector(selector);
        if (el) {
          var hd = el.querySelector('.inline-drawer-header');
          if (hd) label = extractHeaderLabel(hd);
          if (!label) label = (el.textContent || '').trim().substring(0, 40);
        }
      }
      if (!label) label = selector;
      cached.push({ selector: selector, label: label, column: columnIndex });
    }
  }

  // ── Reorder helpers ─────────────────────────────────────────────
  function getReorderItems(groupId) {
    var group = null;
    for (var g = 0; g < PANEL_GROUPS.length; g++) {
      if (PANEL_GROUPS[g].id === groupId) { group = PANEL_GROUPS[g]; break; }
    }
    if (!group) return [];

    var order = settings.reorder[groupId];
    if (!order || order.length === 0) {
      order = group.items.map(function (i) { return i.selector; });
      var cached0 = settings.discoveryCache[groupId] || [];
      for (var ci = 0; ci < cached0.length; ci++) order.push(cached0[ci].selector);
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

  function getColumnIndex(selector, groupId) {
    var cached = settings.discoveryCache[groupId] || [];
    for (var c = 0; c < cached.length; c++) {
      if (cached[c].selector === selector) return cached[c].column || 0;
    }
    return 0;
  }

  // ── Extensions panel ────────────────────────────────────────────
  function createExtensionsPanelDOM() {
    if (doc.getElementById('menu-cleaner-ext-panel')) return;

    var html =
      '<div id="menu-cleaner-ext-panel" class="drawer-content menu-cleaner-ext-panel">' +
        '<div class="extensions_block flex-container">' +
          '<div id="menu-cleaner-ext-topbar" class="alignitemscenter flex-container wide100p">' +
            '<h3 class="margin0 flex1">扩展</h3>' +
          '</div>' +
          '<div id="menu-cleaner-ext-col1" class="flex1 wide50p menu-cleaner-ext-col"></div>' +
          '<div id="menu-cleaner-ext-col2" class="flex1 wide50p menu-cleaner-ext-col"></div>' +
          '<hr class="wide100p margin0">' +
        '</div>' +
      '</div>';

    doc.body.insertAdjacentHTML('beforeend', html);
  }

  function renderExtensionsPanel() {
    var col1 = doc.getElementById('menu-cleaner-ext-col1');
    var col2 = doc.getElementById('menu-cleaner-ext-col2');
    if (!col1 || !col2) return;

    var groupId = 'extensionsSettings';
    var order = settings.reorder[groupId] || [];
    var group = null;
    for (var g = 0; g < PANEL_GROUPS.length; g++) {
      if (PANEL_GROUPS[g].id === groupId) { group = PANEL_GROUPS[g]; break; }
    }
    if (!group) return;

    if (order.length === 0) {
      var defaults = group.items.map(function(i) { return i.selector; });
      var cached0 = settings.discoveryCache[groupId] || [];
      for (var ci = 0; ci < cached0.length; ci++) defaults.push(cached0[ci].selector);
      settings.reorder[groupId] = defaults;
    }

    var actualOrder = settings.reorder[groupId] || [];
    // Safety net: ensure hardcoded group items that exist in DOM are never missing
    var hardcodedAdded = false;
    for (var hi = 0; hi < group.items.length; hi++) {
      var hardSel = group.items[hi].selector;
      if (actualOrder.indexOf(hardSel) === -1 && doc.querySelector(hardSel)) {
        actualOrder.push(hardSel);
        hardcodedAdded = true;
      }
    }
    if (hardcodedAdded) { settings.reorder[groupId] = actualOrder; saveSettings(); }

    var colMap = {};
    var cached = settings.discoveryCache[groupId] || [];
    for (var c = 0; c < cached.length; c++) {
      colMap[cached[c].selector] = cached[c].column !== undefined ? cached[c].column : 0;
    }

    // Move native topbar elements into our panel's top bar
    var topbar = doc.getElementById('menu-cleaner-ext-topbar');
    if (topbar) {
      var nativeDetails = doc.getElementById('extensions_details');
      var nativeThirdParty = doc.getElementById('third_party_extension_button');
      if (nativeDetails && nativeDetails.parentNode !== topbar) topbar.appendChild(nativeDetails);
      if (nativeThirdParty && nativeThirdParty.parentNode !== topbar) topbar.appendChild(nativeThirdParty);
      var notifyLabel = doc.querySelector('#rm_extensions_block .checkbox_label.flexNoGap');
      if (notifyLabel && notifyLabel.parentNode !== topbar) topbar.appendChild(notifyLabel);
    }

    // Return elements from previous render back to native containers
    returnElementsToNative();

    // Clear columns
    col1.innerHTML = '';
    col2.innerHTML = '';

    if (settings.columnMode === 'single') {
      // Single column: follow reorder array order exactly, ignore column origin
      var placedSingle = new Set();
      for (var si = 0; si < actualOrder.length; si++) {
        var sel = actualOrder[si];
        if (settings.hiddenSelectors[sel]) continue;
        var elSingle = doc.querySelector(sel);
        if (!elSingle) continue;
        placedSingle.add(sel);
        col1.appendChild(elSingle);
      }
      // Append any newly discovered elements not in order
      for (var di = 0; di < cached.length; di++) {
        var dc = cached[di];
        if (placedSingle.has(dc.selector)) continue;
        if (settings.hiddenSelectors[dc.selector]) continue;
        var elDisc = doc.querySelector(dc.selector);
        if (elDisc) col1.appendChild(elDisc);
      }
      col2.style.display = 'none';
    } else {
      // Dual column: collect by column, then split
      var col1Els = [];
      var col2Els = [];
      var placed = new Set();

      for (var o = 0; o < actualOrder.length; o++) {
        var selector = actualOrder[o];
        if (settings.hiddenSelectors[selector]) continue;
        var el = doc.querySelector(selector);
        if (!el) continue;
        placed.add(selector);
        var col = colMap[selector] === 1 ? 1 : 0;
        if (col === 1) col2Els.push(el);
        else col1Els.push(el);
      }
      for (var d = 0; d < cached.length; d++) {
        if (placed.has(cached[d].selector)) continue;
        if (settings.hiddenSelectors[cached[d].selector]) continue;
        var el2 = doc.querySelector(cached[d].selector);
        if (!el2) continue;
        placed.add(cached[d].selector);
        var col2 = cached[d].column === 1 ? 1 : 0;
        if (col2 === 1) col2Els.push(el2);
        else col1Els.push(el2);
      }

      col2.style.display = '';
      for (var ei = 0; ei < col1Els.length; ei++) col1.appendChild(col1Els[ei]);
      for (var ei = 0; ei < col2Els.length; ei++) col2.appendChild(col2Els[ei]);
    }
  }

  function toggleExtensionsPanel() {
    extPanelVisible = !extPanelVisible;
    var panel = doc.getElementById('menu-cleaner-ext-panel');
    if (!panel) {
      createExtensionsPanelDOM();
      toggleExtensionsPanel();
      return;
    }

    if (extPanelVisible) {
      renderExtensionsPanel();
      panel.style.display = 'block';
      panel.style.visibility = 'visible';
      panel.style.height = 'auto';
      panel.classList.remove('closedDrawer');
      positionExtensionsPanel();
    } else {
      panel.style.display = 'none';
    }
  }

  function isPanelOpen() {
    return extPanelVisible;
  }

  function positionExtensionsPanel() {
    var panel = doc.getElementById('menu-cleaner-ext-panel');
    if (!panel) return;
    panel.style.maxHeight = '80vh';
    panel.style.overflow = 'auto';
  }

  // ── Panel intercept ─────────────────────────────────────────────
  function setupPanelIntercept() {
    var drawerToggle = doc.querySelector('#extensions-settings-button > .drawer-toggle');
    if (!drawerToggle) {
      setTimeout(setupPanelIntercept, 500);
      return;
    }
    drawerToggle.addEventListener('click', function(e) {
      e.stopImmediatePropagation();
      e.preventDefault();
      toggleExtensionsPanel();
    }, true);
  }

  // ── Return elements to native on disable ────────────────────────
  function returnElementsToNative() {
    var col1 = doc.getElementById('menu-cleaner-ext-col1');
    var col2 = doc.getElementById('menu-cleaner-ext-col2');
    var nativeCol1 = doc.getElementById('extensions_settings');
    var nativeCol2 = doc.getElementById('extensions_settings2');

    if (col1 && nativeCol1) {
      while (col1.firstChild) nativeCol1.appendChild(col1.firstChild);
    }
    if (col2 && nativeCol2) {
      while (col2.firstChild) nativeCol2.appendChild(col2.firstChild);
    }
  }

  // ── UI: Entry in extensionsMenu ─────────────────────────────────
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

  // ── UI: Settings drawer in extensions_settings ──────────────────
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
      if (e.target.checked) {
        applyHides();
        setupPanelIntercept();
      } else {
        clearAllHides();
        var panel = doc.getElementById('menu-cleaner-ext-panel');
        if (panel) panel.style.display = 'none';
        extPanelVisible = false;
        returnElementsToNative();
      }
    });

    var openBtn = doc.getElementById('menu-cleaner-open-popup');
    openBtn && openBtn.addEventListener('click', function () { openPopup(); });
  }

  // ── Popup ───────────────────────────────────────────────────────
  function createPopupDOM() {
    if (doc.getElementById('menu-cleaner-popup')) return;

    var html =
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

    var closeBtn = doc.getElementById('menu-cleaner-close');
    var backdrop = doc.getElementById('menu-cleaner-backdrop');
    closeBtn && closeBtn.addEventListener('click', closePopup);
    backdrop && backdrop.addEventListener('click', closePopup);
    var settingsBtn = doc.getElementById('menu-cleaner-settings-btn');
    settingsBtn && settingsBtn.addEventListener('click', toggleSettingsPanel);

    var tabs = doc.querySelectorAll('.menu-cleaner-tab');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener('click', function() { switchTab(this.dataset.tab); });
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
    var backdrop = doc.getElementById('menu-cleaner-backdrop');
    var popup = doc.getElementById('menu-cleaner-popup');
    if (backdrop) backdrop.style.display = 'none';
    if (popup) popup.style.display = 'none';
    showSettingsPanel = false;
    // Refresh extension panel to reflect any reorder changes made in popup
    if (extPanelVisible) renderExtensionsPanel();
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
    for (var t = 0; t < tabs.length; t++) {
      if (tabs[t].dataset.tab === tabName) {
        tabs[t].classList.add('active');
      } else {
        tabs[t].classList.remove('active');
      }
    }
    refreshPopup();
  }

  // ── Column mode ──────────────────────────────────────────────────
  function applyColumnMode(mode) {
    if (settings.columnMode === mode) return;
    settings.columnMode = mode;

    // When switching to single, move all extensionsSettings items to left column
    if (mode === 'single') {
      var cache = settings.discoveryCache['extensionsSettings'] || [];
      for (var ci = 0; ci < cache.length; ci++) cache[ci].column = 0;
    }

    saveSettings();

    if (isPanelOpen()) renderExtensionsPanel();

    if (!showSettingsPanel && activeTab === 'reorder') renderReorderView();

    if (showSettingsPanel) renderSettingsView();
  }

  // ── Settings panel view ─────────────────────────────────────────
  function renderSettingsView() {
    var body = doc.getElementById('menu-cleaner-popup-body');
    if (!body) return;

    var html =
      '<div class="menu-cleaner-settings-panel">' +
        '<button id="menu-cleaner-rescan" class="menu_button menu-cleaner-settings-btn-full">手动重新扫描</button>' +
        '<button id="menu-cleaner-reset-order" class="menu_button menu-cleaner-settings-btn-full">恢复原始排序</button>' +
        '<button id="menu-cleaner-clear-data" class="menu_button menu-cleaner-settings-btn-full">清除插件数据</button>' +
        '<div class="menu-cleaner-settings-divider">—————— 扩展面板分栏 ——————</div>' +
        '<div id="menu-cleaner-colmode-dual" class="menu-cleaner-settings-row menu-cleaner-colmode-option' + (settings.columnMode === 'dual' ? ' menu-cleaner-colmode-active' : '') + '">' +
          '<span>双栏</span>' +
        '</div>' +
        '<div id="menu-cleaner-colmode-single" class="menu-cleaner-settings-row menu-cleaner-colmode-option' + (settings.columnMode === 'single' ? ' menu-cleaner-colmode-active' : '') + '">' +
          '<span>单栏</span>' +
        '</div>' +
        '<div class="menu-cleaner-settings-divider">—————— 调试用内容 ——————</div>' +
        '<div class="menu-cleaner-settings-row">' +
          '<span>重扫描消息toast</span>' +
          '<label class="menu-cleaner-toggle">' +
            '<input type="checkbox" id="menu-cleaner-rescan-toast"' + (settings.rescanToast ? ' checked' : '') + '>' +
            '<span class="menu-cleaner-slider"></span>' +
          '</label>' +
        '</div>' +
      '</div>';

    body.innerHTML = html;

    var rescanBtn = doc.getElementById('menu-cleaner-rescan');
    rescanBtn && rescanBtn.addEventListener('click', function() { doRescan(); });
    var resetBtn = doc.getElementById('menu-cleaner-reset-order');
    resetBtn && resetBtn.addEventListener('click', function() { resetAllReorders(); });

    var clearBtn = doc.getElementById('menu-cleaner-clear-data');
    clearBtn && clearBtn.addEventListener('click', function() {
      if (!win.confirm('确定要清除所有插件配置数据吗？此操作不可撤销。')) return;
      settings = Object.assign({}, defaultSettings);
      saveSettings();
      clearAllHides();
      showSettingsPanel = false;
      activeTab = 'hide';
      updatePopupView();
      captureInitialSnapshot();
      refreshDiscoveryCache();
      applyHides();
      createExtensionsPanelDOM();
      setupPanelIntercept();
      renderExtensionsPanel();
    });

    var toastCb = doc.getElementById('menu-cleaner-rescan-toast');
    toastCb && toastCb.addEventListener('change', function(e) {
      settings.rescanToast = e.target.checked;
      saveSettings();
    });

    var dualBtn = doc.getElementById('menu-cleaner-colmode-dual');
    dualBtn && dualBtn.addEventListener('click', function() { applyColumnMode('dual'); });
    var singleBtn = doc.getElementById('menu-cleaner-colmode-single');
    singleBtn && singleBtn.addEventListener('click', function() { applyColumnMode('single'); });

    positionPopup();
  }

  // ── Reorder view ────────────────────────────────────────────────
  function renderReorderView() {
    var body = doc.getElementById('menu-cleaner-popup-body');
    if (!body) return;

    var expanded = new Set();
    var catBodies = doc.querySelectorAll('.menu-cleaner-category-body:not(.collapsed)');
    for (var eb = 0; eb < catBodies.length; eb++) {
      expanded.add(catBodies[eb].dataset.group);
    }

    var reorderGroups = [];
    for (var rg = 0; rg < PANEL_GROUPS.length; rg++) {
      if (REORDER_GROUP_IDS.indexOf(PANEL_GROUPS[rg].id) !== -1) {
        reorderGroups.push(PANEL_GROUPS[rg]);
      }
    }
    var html = '';

    for (var g = 0; g < reorderGroups.length; g++) {
      var group = reorderGroups[g];
      var items = getReorderItems(group.id);
      var isExpanded = expanded.has(group.id);
      var isDualCol = group.id === 'extensionsSettings' && settings.columnMode !== 'single';

      html += '<div class="menu-cleaner-category">';
      html += '<div class="menu-cleaner-category-header" data-group="' + escHtml(group.id) + '">' +
                '<span class="menu-cleaner-category-arrow">' + (isExpanded ? '▼' : '▶') + '</span>' +
                '<strong>' + escHtml(group.name) + '</strong>' +
                '<span class="menu-cleaner-category-count">' + items.length + ' 项</span>' +
              '</div>';
      html += '<div class="menu-cleaner-category-body' + (isExpanded ? '' : ' collapsed') + '" data-group="' + escHtml(group.id) + '">';

      if (isDualCol) {
        var flatIndexMap = {};
        for (var fi = 0; fi < items.length; fi++) flatIndexMap[items[fi].selector] = fi;
        var col0Items = items.filter(function(it) { return getColumnIndex(it.selector, group.id) === 0; });
        var col1Items = items.filter(function(it) { return getColumnIndex(it.selector, group.id) === 1; });
        html += renderColumnSection(group, col0Items, 0, '左栏', flatIndexMap);
        html += renderColumnSection(group, col1Items, 1, '右栏', flatIndexMap);
      } else {
        if (items.length === 0) {
          html += '<div class="menu-cleaner-reorder-empty">没有可见元素</div>';
        } else {
          for (var i = 0; i < items.length; i++) {
            html += buildReorderItemHTML(items[i], group.id, i, -1);
          }
        }
      }

      html += '</div></div>';
    }

    body.innerHTML = html;

    // Bind category collapse
    var headers = doc.querySelectorAll('.menu-cleaner-category-header');
    for (var h = 0; h < headers.length; h++) {
      headers[h].addEventListener('click', function() {
        var groupId = this.dataset.group;
        var catBody = doc.querySelector('.menu-cleaner-category-body[data-group="' + groupId + '"]');
        var arrow = this.querySelector('.menu-cleaner-category-arrow');
        if (catBody) {
          catBody.classList.toggle('collapsed');
          if (arrow) arrow.textContent = catBody.classList.contains('collapsed') ? '▶' : '▼';
          positionPopup();
        }
      });
    }

    bindReorderDragEvents();
    positionPopup();
  }

  function renderColumnSection(group, items, colIndex, label, flatIndexMap) {
    var h = '<div class="menu-cleaner-reorder-column-section" data-column="' + colIndex + '">';
    h += '<div class="menu-cleaner-reorder-column-label">' + label + ' (' + items.length + ' 项)</div>';
    if (items.length === 0) {
      h += '<div class="menu-cleaner-reorder-empty">没有可见元素</div>';
    } else {
      for (var i = 0; i < items.length; i++) {
        var flatIdx = flatIndexMap ? flatIndexMap[items[i].selector] : i;
        h += buildReorderItemHTML(items[i], group.id, flatIdx, colIndex);
      }
    }
    h += '</div>';
    return h;
  }

  function buildReorderItemHTML(item, groupId, index, colIndex) {
    return '<div class="menu-cleaner-reorder-item" data-selector="' + escHtml(item.selector) + '" data-group="' + groupId + '" data-index="' + index + '" data-column="' + colIndex + '">' +
             '<span class="menu-cleaner-drag-handle" title="拖动排序">⋮⋮</span>' +
             '<span title="' + escHtml(item.selector) + '">' + escHtml(item.label) + '</span>' +
           '</div>';
  }

  // ── Drag events ─────────────────────────────────────────────────
  function bindReorderDragEvents() {
    var draggedItem = null;
    var draggedGroup = null;
    var draggedIndex = -1;
    var touchGhost = null;
    var touchStartX = 0;
    var touchStartY = 0;
    var touchMoved = false;
    var dropTargetColumn = undefined;

    function doReorder(fromIndex, toIndex, groupId) {
      var fromCol = draggedItem ? draggedItem.dataset.column : '-1';
      var toCol = dropTargetColumn;

      if (fromCol !== '-1' && toCol !== undefined && toCol !== '-1' && fromCol !== toCol) {
        // Cross-column move
        var selector = draggedItem.dataset.selector;
        var items = getReorderItems(groupId);
        var movedItem = null;
        for (var mi = 0; mi < items.length; mi++) {
          if (items[mi].selector === selector) { movedItem = items[mi]; break; }
        }
        if (!movedItem) return;

        setColumnInCache(selector, groupId, parseInt(toCol));

        var remaining = items.filter(function(it) { return it.selector !== selector; });

        var targetItem = null;
        for (var ti = 0; ti < items.length; ti++) {
          if (ti === toIndex) { targetItem = items[ti]; break; }
        }
        if (targetItem) {
          var insertIdx = -1;
          for (var ri = 0; ri < remaining.length; ri++) {
            if (remaining[ri].selector === targetItem.selector) { insertIdx = ri; break; }
          }
          remaining.splice(insertIdx + 1, 0, movedItem);
        } else {
          remaining.push(movedItem);
        }

        settings.reorder[groupId] = remaining.map(function(i) { return i.selector; });
        saveSettings();
        // Defer panel refresh to avoid DOM conflicts during drag event
        if (isPanelOpen() && groupId === 'extensionsSettings') win.setTimeout(function() { renderExtensionsPanel(); }, 0);
        renderReorderView();
        return;
      }

      // Same-column reorder
      var sitems = getReorderItems(groupId);
      if (fromIndex < 0 || fromIndex >= sitems.length || toIndex < 0 || toIndex >= sitems.length) return;

      var moved = sitems.splice(fromIndex, 1)[0];
      sitems.splice(toIndex, 0, moved);

      settings.reorder[groupId] = sitems.map(function(i) { return i.selector; });
      saveSettings();
      // Defer panel refresh to avoid DOM conflicts during drag event
      if (isPanelOpen() && groupId === 'extensionsSettings') win.setTimeout(function() { renderExtensionsPanel(); }, 0);
      renderReorderView();
    }

    function cleanupDrag() {
      dragActive = false;
      if (draggedItem) draggedItem.classList.remove('dragging');
      var items = doc.querySelectorAll('.menu-cleaner-reorder-item');
      for (var i = 0; i < items.length; i++) items[i].classList.remove('drag-over');
      var dragSections = doc.querySelectorAll('.menu-cleaner-reorder-column-section');
      for (var ds = 0; ds < dragSections.length; ds++) dragSections[ds].classList.remove('drag-over-section');
      if (touchGhost) {
        touchGhost.remove();
        touchGhost = null;
      }
      draggedItem = null;
      draggedGroup = null;
      draggedIndex = -1;
      touchMoved = false;
      dropTargetColumn = undefined;
    }

    var reorderItems = doc.querySelectorAll('.menu-cleaner-reorder-item');
    for (var r = 0; r < reorderItems.length; r++) {
      var item = reorderItems[r];

      // ── Desktop pointer drag ─────────────────────────
      item.addEventListener('pointerdown', function(e) {
        if (e.button !== 0) return; // left button only
        e.preventDefault(); // prevent text selection during drag
        dragActive = true;
        draggedItem = this;
        draggedGroup = this.dataset.group;
        draggedIndex = parseInt(this.dataset.index);
        this.classList.add('dragging');
        this.setPointerCapture(e.pointerId);

        touchGhost = this.cloneNode(true);
        touchGhost.style.position = 'fixed';
        touchGhost.style.zIndex = '100001';
        touchGhost.style.pointerEvents = 'none';
        touchGhost.style.opacity = '0.85';
        touchGhost.style.width = this.offsetWidth + 'px';
        touchGhost.style.left = (e.clientX - this.offsetWidth / 2) + 'px';
        touchGhost.style.top = (e.clientY - 20) + 'px';
        touchGhost.classList.add('dragging');
        doc.body.appendChild(touchGhost);
      });

      item.addEventListener('pointermove', function(e) {
        if (!draggedItem) return;
        if (touchGhost) {
          touchGhost.style.left = (e.clientX - touchGhost.offsetWidth / 2) + 'px';
          touchGhost.style.top = (e.clientY - 20) + 'px';
        }

        if (touchGhost) touchGhost.style.display = 'none';
        var target = doc.elementFromPoint(e.clientX, e.clientY);
        if (touchGhost) touchGhost.style.display = '';

        var targetItem = target ? target.closest('.menu-cleaner-reorder-item') : null;
        var allItems = doc.querySelectorAll('.menu-cleaner-reorder-item');
        for (var ai = 0; ai < allItems.length; ai++) {
          if (allItems[ai] === targetItem && allItems[ai] !== draggedItem && allItems[ai].dataset.group === draggedGroup) {
            allItems[ai].classList.add('drag-over');
          } else {
            allItems[ai].classList.remove('drag-over');
          }
        }
        // Highlight empty column sections
        var allSections = doc.querySelectorAll('.menu-cleaner-reorder-column-section');
        var targetSection = target ? target.closest('.menu-cleaner-reorder-column-section') : null;
        for (var asi = 0; asi < allSections.length; asi++) {
          if (allSections[asi] === targetSection && draggedItem && draggedItem.dataset.column !== allSections[asi].dataset.column) {
            allSections[asi].classList.add('drag-over-section');
          } else {
            allSections[asi].classList.remove('drag-over-section');
          }
        }
      });

      item.addEventListener('pointerup', function(e) {
        if (!draggedItem) return;

        if (touchGhost) touchGhost.style.display = 'none';
        var target = doc.elementFromPoint(e.clientX, e.clientY);
        if (touchGhost) touchGhost.style.display = '';

        var targetItem = target ? target.closest('.menu-cleaner-reorder-item') : null;
        if (targetItem && targetItem !== draggedItem && targetItem.dataset.group === draggedGroup) {
          targetItem.classList.remove('drag-over');
          dropTargetColumn = targetItem.dataset.column;
          doReorder(draggedIndex, parseInt(targetItem.dataset.index), draggedGroup);
        } else {
          // Check for cross-column drop into an empty section
          var targetSection = target ? target.closest('.menu-cleaner-reorder-column-section') : null;
          if (targetSection && draggedItem) {
            var targetCol = -1;
            var label = targetSection.querySelector('.menu-cleaner-reorder-column-label');
            if (label) {
              if (label.textContent.indexOf('右栏') !== -1) targetCol = 1;
              else if (label.textContent.indexOf('左栏') !== -1) targetCol = 0;
            }
            if (targetCol >= 0 && draggedItem.dataset.column !== String(targetCol)) {
              var sel = draggedItem.dataset.selector;
              var gid = draggedGroup;
              setColumnInCache(sel, gid, targetCol);
              var itemsArr = getReorderItems(gid);
              var moved = null;
              for (var mi2 = 0; mi2 < itemsArr.length; mi2++) {
                if (itemsArr[mi2].selector === sel) { moved = itemsArr[mi2]; break; }
              }
              if (moved) {
                var remainder = itemsArr.filter(function(it) { return it.selector !== sel; });
                remainder.push(moved);
                settings.reorder[gid] = remainder.map(function(i) { return i.selector; });
                saveSettings();
                if (isPanelOpen() && gid === 'extensionsSettings') win.setTimeout(function() { renderExtensionsPanel(); }, 0);
                renderReorderView();
              }
            }
          }
        }

        cleanupDrag();
      });

      item.addEventListener('pointercancel', function() { cleanupDrag(); });

      // ── Mobile touch ─────────────────────────────────
      var supportsTouch = 'ontouchstart' in win || (win.navigator && win.navigator.maxTouchPoints > 0);
      if (supportsTouch) {
        item.addEventListener('touchstart', function(e) {
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

        item.addEventListener('touchmove', function(e) {
          if (!draggedItem) return;
          e.preventDefault();
          touchMoved = true;
          var touch = e.touches[0];

          if (touchGhost) {
            touchGhost.style.left = (touch.clientX - touchGhost.offsetWidth / 2) + 'px';
            touchGhost.style.top = (touch.clientY - 20) + 'px';
          }

          if (touchGhost) touchGhost.style.display = 'none';
          var target = doc.elementFromPoint(touch.clientX, touch.clientY);
          if (touchGhost) touchGhost.style.display = '';

          var targetItem = target ? target.closest('.menu-cleaner-reorder-item') : null;

          var allItems = doc.querySelectorAll('.menu-cleaner-reorder-item');
          for (var ai = 0; ai < allItems.length; ai++) {
            if (allItems[ai] === targetItem && allItems[ai] !== draggedItem && allItems[ai].dataset.group === draggedGroup) {
              allItems[ai].classList.add('drag-over');
            } else {
              allItems[ai].classList.remove('drag-over');
            }
          }
        });

        item.addEventListener('touchend', function(e) {
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
              dropTargetColumn = targetItem.dataset.column;
              doReorder(draggedIndex, parseInt(targetItem.dataset.index), draggedGroup);
            }
          }

          cleanupDrag();
        });

        item.addEventListener('touchcancel', function() { cleanupDrag(); });
      }
    }

    // Column-section drop targets for cross-column drag (pointer-based)
    var sections = doc.querySelectorAll('.menu-cleaner-reorder-column-section');
    for (var s = 0; s < sections.length; s++) {
      var section = sections[s];

      section.addEventListener('pointerenter', function() {
        if (draggedItem) this.classList.add('drag-over-section');
      });

      section.addEventListener('pointerleave', function() {
        this.classList.remove('drag-over-section');
      });
    }
  }

  // ── Popup positioning ───────────────────────────────────────────
  function positionPopup() {
    var popup = doc.getElementById('menu-cleaner-popup');
    if (!popup) return;
    var vh = win.innerHeight;
    var vw = win.innerWidth;
    var margin = 10;

    popup.style.maxHeight = '90vh';
    popup.style.maxWidth = Math.min(560, vw - margin * 2) + 'px';

    popup.style.top = '0';
    popup.style.left = '0';
    popup.style.transform = 'none';

    var popupHeight = popup.offsetHeight;
    var popupWidth = popup.offsetWidth;

    var top = Math.max(margin, (vh - popupHeight) / 2.5);
    var left = Math.max(margin, (vw - popupWidth) / 2);

    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  }

  // ── Build popup content ─────────────────────────────────────────
  function refreshPopup() {
    if (showSettingsPanel) return;
    if (activeTab === 'reorder') {
      renderReorderView();
      return;
    }
    renderHideView();
  }

  function renderHideView() {
    var body = doc.getElementById('menu-cleaner-popup-body');
    if (!body) return;

    // Save expanded category state before rebuilding
    var expandedGroups = {};
    var existingBodies = doc.querySelectorAll('.menu-cleaner-category-body');
    for (var eb = 0; eb < existingBodies.length; eb++) {
      if (!existingBodies[eb].classList.contains('collapsed')) {
        expandedGroups[existingBodies[eb].dataset.group] = true;
      }
    }

    var html = '';

    for (var g = 0; g < PANEL_GROUPS.length; g++) {
      var group = PANEL_GROUPS[g];
      var hcSelectors = new Set();
      for (var hi = 0; hi < group.items.length; hi++) hcSelectors.add(group.items[hi].selector);
      var cached = (settings.discoveryCache[group.id] || []).filter(function(c) { return !hcSelectors.has(c.selector); });
      var totalCount = group.items.length + cached.length;

      html += '<div class="menu-cleaner-category">';
      html += '<div class="menu-cleaner-category-header" data-group="' + escHtml(group.id) + '">' +
                '<span class="menu-cleaner-category-arrow">▶</span>' +
                '<strong>' + escHtml(group.name) + '</strong>' +
                '<span class="menu-cleaner-category-count">' + totalCount + ' 项</span>' +
              '</div>';
      html += '<div class="menu-cleaner-category-body collapsed" data-group="' + escHtml(group.id) + '">';

      for (var i = 0; i < group.items.length; i++) {
        var item = group.items[i];
        var isHidden = settings.hiddenSelectors[item.selector] === true;
        html += '<div class="menu-cleaner-item" data-selector="' + escHtml(item.selector) + '">' +
                  '<span title="' + escHtml(item.selector) + '">' + escHtml(item.label) + '</span>' +
                  '<label class="menu-cleaner-toggle">' +
                    '<input type="checkbox" class="menu-cleaner-checkbox" data-selector="' + escHtml(item.selector) + '"' + (isHidden ? '' : ' checked') + '>' +
                    '<span class="menu-cleaner-slider"></span>' +
                  '</label>' +
                '</div>';
      }

      if (cached.length > 0) {
        html += '<div class="menu-cleaner-separator">————由插件引入————</div>';
        for (var ci = 0; ci < cached.length; ci++) {
          var citem = cached[ci];
          var cHidden = settings.hiddenSelectors[citem.selector] === true;
          html += '<div class="menu-cleaner-item menu-cleaner-item-discovered" data-selector="' + escHtml(citem.selector) + '">' +
                    '<span title="' + escHtml(citem.selector) + '">' + escHtml(citem.label) + '</span>' +
                    '<label class="menu-cleaner-toggle">' +
                      '<input type="checkbox" class="menu-cleaner-checkbox" data-selector="' + escHtml(citem.selector) + '"' + (cHidden ? '' : ' checked') + '>' +
                      '<span class="menu-cleaner-slider"></span>' +
                    '</label>' +
                  '</div>';
        }
      }

      html += '</div></div>';
    }

    body.innerHTML = html;
    // Restore expanded category state
    for (var eg in expandedGroups) {
      var catBody = doc.querySelector('.menu-cleaner-category-body[data-group="' + eg + '"]');
      if (catBody) {
        catBody.classList.remove('collapsed');
        var catArrow = catBody.parentElement.querySelector('.menu-cleaner-category-arrow');
        if (catArrow) catArrow.textContent = '▼';
      }
    }
    bindPopupEvents();
    positionPopup();
  }

  function bindPopupEvents() {
    var headers = doc.querySelectorAll('.menu-cleaner-category-header');
    for (var h = 0; h < headers.length; h++) {
      headers[h].addEventListener('click', function() {
        var groupId = this.dataset.group;
        var body = doc.querySelector('.menu-cleaner-category-body[data-group="' + groupId + '"]');
        var arrow = this.querySelector('.menu-cleaner-category-arrow');
        if (body) {
          body.classList.toggle('collapsed');
          if (arrow) arrow.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
          positionPopup();
        }
      });
    }

    var cbs = doc.querySelectorAll('.menu-cleaner-checkbox');
    for (var c = 0; c < cbs.length; c++) {
      cbs[c].addEventListener('change', function(e) {
        var selector = e.target.dataset.selector;
        if (!selector) return;
        settings.hiddenSelectors[selector] = !e.target.checked;
        saveSettings();
        applyHides();
        if (isPanelOpen()) renderExtensionsPanel();
      });
    }
  }

  function escHtml(str) {
    var div = doc.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Reset ───────────────────────────────────────────────────────
  function resetAllReorders() {
    var snap = settings.initialSnapshot;
    if (!snap) {
      captureInitialSnapshot();
    }

    for (var g = 0; g < PANEL_GROUPS.length; g++) {
      var group = PANEL_GROUPS[g];
      if (REORDER_GROUP_IDS.indexOf(group.id) === -1) continue;

      if (settings.initialSnapshot && settings.initialSnapshot[group.id]) {
        var snapEntries = settings.initialSnapshot[group.id];
        settings.reorder[group.id] = snapEntries.map(function(s) { return s.selector; });

        var existingCache = settings.discoveryCache[group.id] || [];
        for (var s = 0; s < snapEntries.length; s++) {
          if (snapEntries[s].column !== undefined) {
            var existing = null;
            for (var e = 0; e < existingCache.length; e++) {
              if (existingCache[e].selector === snapEntries[s].selector) { existing = existingCache[e]; break; }
            }
            if (existing) {
              existing.column = snapEntries[s].column;
            } else {
              existingCache.push({ selector: snapEntries[s].selector, label: snapEntries[s].label, column: snapEntries[s].column });
            }
          }
        }
        settings.discoveryCache[group.id] = existingCache;
      } else {
        var defaultOrder = group.items.map(function(i) { return i.selector; });
        var cached = settings.discoveryCache[group.id] || [];
        for (var c = 0; c < cached.length; c++) defaultOrder.push(cached[c].selector);
        settings.reorder[group.id] = defaultOrder;
      }
    }

    saveSettings();

    showSettingsPanel = false;
    activeTab = 'reorder';
    var tabs = doc.querySelectorAll('.menu-cleaner-tab');
    for (var t = 0; t < tabs.length; t++) {
      if (tabs[t].dataset.tab === 'reorder') {
        tabs[t].classList.add('active');
      } else {
        tabs[t].classList.remove('active');
      }
    }
    updatePopupView();
    renderReorderView();

    if (isPanelOpen()) renderExtensionsPanel();
  }

  // ── Rescan ───────────────────────────────────────────────────────
  function doRescan() {
    if (rescanTimer) { clearTimeout(rescanTimer); rescanTimer = null; }

    refreshDiscoveryCache();
    if (isPanelOpen()) renderExtensionsPanel();
    if (!dragActive) refreshPopup();

    if (settings.rescanToast) {
      var count = 0;
      var dcKeys = Object.keys(settings.discoveryCache);
      for (var dk = 0; dk < dcKeys.length; dk++) {
        count += settings.discoveryCache[dcKeys[dk]].length;
      }
      if (win.toastr) win.toastr.info('已重新扫描，发现 ' + count + ' 个扩展元素');
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────
  function setupKeyboard() {
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var popup = doc.getElementById('menu-cleaner-popup');
        if (popup && popup.style.display !== 'none') {
          closePopup();
          return;
        }
        if (extPanelVisible) {
          toggleExtensionsPanel();
        }
      }
    });

    win.addEventListener('resize', function () {
      var popup = doc.getElementById('menu-cleaner-popup');
      if (popup && popup.style.display !== 'none') {
        positionPopup();
      }
      if (extPanelVisible) {
        positionExtensionsPanel();
      }
    });
  }

  // ── Slash commands ────────────────────────────────────────────
  function registerSlashCmd() {
    try {
      var script = doc.createElement('script');
      script.type = 'module';
      script.textContent =
        "import { registerSlashCommand } from '/scripts/slash-commands.js';\n" +
        // /menucleaner — open the panel
        "registerSlashCommand('menucleaner', function () {\n" +
        "  var popup = document.getElementById('menu-cleaner-popup');\n" +
        "  var backdrop = document.getElementById('menu-cleaner-backdrop');\n" +
        "  if (popup && backdrop) {\n" +
        "    backdrop.style.display = 'block';\n" +
        "    popup.style.display = 'flex';\n" +
        "  } else {\n" +
        "    var btn = document.getElementById('menu-cleaner-btn');\n" +
        "    if (btn && btn.offsetParent) { btn.click(); return ''; }\n" +
        "    var settingsBtn = document.getElementById('menu-cleaner-open-popup');\n" +
        "    if (settingsBtn) { settingsBtn.click(); }\n" +
        "  }\n" +
        "  return '';\n" +
        "}, [], '打开酒馆菜单精简器操作面板');\n" +
        // /menucleanerdisable — disable the extension
        "registerSlashCommand('menucleanerdisable', function () {\n" +
        "  try {\n" +
        "    var raw = localStorage.getItem('menu_cleaner_settings');\n" +
        "    var settings = raw ? JSON.parse(raw) : {};\n" +
        "    settings.enabled = false;\n" +
        "    localStorage.setItem('menu_cleaner_settings', JSON.stringify(settings));\n" +
        "    // Remove injected style elements\n" +
        "    var ids = ['menu-cleaner-styles', 'menu-cleaner-hides'];\n" +
        "    ids.forEach(function(id) { var el = document.getElementById(id); if (el) el.remove(); });\n" +
        "    // Hide our panel\n" +
        "    var panel = document.getElementById('menu-cleaner-ext-panel');\n" +
        "    if (panel) panel.style.display = 'none';\n" +
        "    var backdrop = document.getElementById('menu-cleaner-backdrop');\n" +
        "    if (backdrop) backdrop.style.display = 'none';\n" +
        "    // Restore native block visibility\n" +
        "    var nativeBlock = document.getElementById('rm_extensions_block');\n" +
        "    if (nativeBlock) nativeBlock.style.display = '';\n" +
        "    alert('酒馆菜单精简器已禁用，请刷新页面。');\n" +
        "  } catch(e) { alert('禁用失败: ' + e.message); }\n" +
        "  return '';\n" +
        "}, [], '禁用酒馆菜单精简器');\n";
      doc.head.appendChild(script);
      console.debug('[MenuCleaner] 已注册 /menucleaner 和 /menucleanerdisable 命令');
    } catch (e) {
      console.debug('[MenuCleaner] 斜杠命令注册失败', e);
    }
  }

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

    // MutationObserver: watch for new elements
    var observeContainers = function () {
      var targets = ['#extensions_settings', '#extensions_settings2'];
      for (var t = 0; t < targets.length; t++) {
        (function(sel) {
          var el = doc.querySelector(sel);
          if (!el) return;
          var observer = new win.MutationObserver(function (mutations) {
            for (var m = 0; m < mutations.length; m++) {
              if (mutations[m].addedNodes.length > 0) {
                scheduleAutoRescan();
                return;
              }
            }
          });
          observer.observe(el, { childList: true, subtree: false });
        })(targets[t]);
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

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    loadSettings();
    injectStyle();

    // Step 1: Capture initial snapshot (only on first run)
    captureInitialSnapshot();

    // Step 2: Scan to build discovery cache
    refreshDiscoveryCache();

    // Step 3: Inject UI elements
    injectMenuEntry();
    injectSettingsEntry();

    // Step 4: Create our extensions panel and intercept the native button
    if (settings.enabled) {
      applyHides();
      createExtensionsPanelDOM();
      setupPanelIntercept();
    }

    // Step 5: Setup other systems
    setupKeyboard();
    registerSlashCmd();
    setupAutoRescan();

    // Delayed re-scan catches extensions that inject buttons after init
    setTimeout(function () {
      refreshDiscoveryCache();
      if (settings.enabled && isPanelOpen()) renderExtensionsPanel();
    }, 3000);
  }

  // Start when DOM is ready (parent page's DOM)
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
