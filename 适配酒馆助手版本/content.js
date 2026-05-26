(function () {
  'use strict';

  // 酒馆助手在 iframe 中执行脚本，需要操作父页面的 document
  var doc = window.frameElement ? window.parent.document : document;
  var win = window.frameElement ? window.parent : window;

  const STORAGE_KEY = 'menu_cleaner_settings';
  let autoIdSeq = 0;
  let activeTab = 'hide';

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
        exclude: [],
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
      name: '扩展设置',
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
      name: '预设设置',
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
    discoveryCache: {},
    reorder: {}
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
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.menu-cleaner-reorder-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.menu-cleaner-reorder-item > span:last-child {
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
#menu-cleaner-reset-order {
  white-space: nowrap !important;
  flex-shrink: 0;
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

    // Collect all visible elements for this group
    var els = [];
    for (var ri = 0; ri < order.length; ri++) {
      var selector = order[ri];
      if (settings.hiddenSelectors[selector]) continue;
      var el = doc.querySelector(selector);
      if (el) els.push(el);
    }

    if (els.length < 2) return;

    // Find the deepest common ancestor that contains all elements
    var container = els[0].parentNode;
    while (container) {
      var ok = true;
      for (var ci = 0; ci < els.length; ci++) {
        if (!container.contains(els[ci])) { ok = false; break; }
      }
      if (ok) break;
      container = container.parentNode;
    }
    if (!container) return;

    // Walk each element up to its direct child of the container (= reorder unit)
    var units = [];
    var seen = new Set();
    for (var ui = 0; ui < els.length; ui++) {
      var unit = els[ui];
      while (unit.parentNode && unit.parentNode !== container) {
        unit = unit.parentNode;
      }
      if (unit.parentNode === container && !seen.has(unit)) {
        seen.add(unit);
        units.push(unit);
      }
    }

    // Move each unit to the end in desired order
    for (var mi = 0; mi < units.length; mi++) {
      container.appendChild(units[mi]);
    }
  }

  function mergeExtensionSettingsColumns() {
    var col1 = doc.querySelector('#extensions_settings');
    var col2 = doc.querySelector('#extensions_settings2');
    if (!col1 || !col2) return;
    while (col2.firstChild) {
      col1.appendChild(col2.firstChild);
    }
    col2.style.display = 'none';
  }

  function applyAllReorders() {
    mergeExtensionSettingsColumns();
    for (var gi = 0; gi < PANEL_GROUPS.length; gi++) {
      if (PANEL_GROUPS[gi].reorder) {
        applyReorder(PANEL_GROUPS[gi].id);
      }
    }
  }

  function resetAllReorders() {
    mergeExtensionSettingsColumns();
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
    renderReorderView();
  }

  // ── Dynamic discovery ────────────────────────────────────────
  function discoverItems(group) {
    if (!group.discovery) return [];
    const discovered = [];
    const seen = new Set();
    const excludeSet = new Set(group.discovery.exclude || []);

    for (const containerSel of group.discovery.containers) {
      const container = doc.querySelector(containerSel);
      if (!container) continue;

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

            discovered.push({ selector: selector, label: label });
          }

          if (group.discovery.alsoMatchChildren) {
            for (const directChild of child.children) {
              if (matchedElements.has(directChild)) continue;
              if (directChild.style.display === 'none') continue;
              const span = directChild.querySelector('span');
              if (!span) continue;
              const labelText = span.textContent.trim();
              if (!labelText) continue;
              if (!directChild.id) { directChild.id = 'menu-cleaner-auto-' + (autoIdSeq++); }
              const selector = '#' + directChild.id;
              if (seen.has(selector) || excludeSet.has(selector)) continue;
              seen.add(selector);
              discovered.push({ selector: selector, label: labelText });
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

          discovered.push({ selector: selector, label: label });
        }
      }
    }
    return discovered;
  }

  function refreshDiscoveryCache() {
    for (const group of PANEL_GROUPS) {
      if (!group.discovery) continue;
      const allDiscovered = discoverItems(group);
      const hardcodedSet = new Set((group.items || []).map(function (i) { return i.selector; }));
      settings.discoveryCache[group.id] = allDiscovered.filter(function (d) { return !hardcodedSet.has(d.selector); });
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
            '<button id="menu-cleaner-rescan" class="menu_button">重新扫描</button>' +
            '<button id="menu-cleaner-reset-order" class="menu_button" style="display:none">恢复原始排序</button>' +
            '<button id="menu-cleaner-close" class="menu_button">✕ 关闭</button>' +
          '</div>' +
        '</div>' +
        '<div class="menu-cleaner-tabs">' +
          '<div class="menu-cleaner-tab active" data-tab="hide">隐藏元素</div>' +
          '<div class="menu-cleaner-tab" data-tab="reorder">重排序</div>' +
        '</div>' +
        '<div id="menu-cleaner-popup-body" class="menu-cleaner-popup-body"></div>' +
      '</div>';
    doc.body.insertAdjacentHTML('beforeend', html);

    doc.getElementById('menu-cleaner-close').addEventListener('click', closePopup);
    doc.getElementById('menu-cleaner-backdrop').addEventListener('click', closePopup);
    doc.getElementById('menu-cleaner-rescan').addEventListener('click', function () {
      refreshDiscoveryCache();
      refreshPopup();
    });
    doc.getElementById('menu-cleaner-reset-order').addEventListener('click', function () { resetAllReorders(); });

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
    refreshPopup();
    positionPopup();
  }

  function closePopup() {
    const backdrop = doc.getElementById('menu-cleaner-backdrop');
    const popup = doc.getElementById('menu-cleaner-popup');
    if (backdrop) backdrop.style.display = 'none';
    if (popup) popup.style.display = 'none';
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
    var resetBtn = doc.getElementById('menu-cleaner-reset-order');
    if (resetBtn) resetBtn.style.display = tabName === 'reorder' ? '' : 'none';
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
      html += '<div class="menu-cleaner-category">';
      html += '<div class="menu-cleaner-category-header" data-group="' + group.id + '">';
      html += '<span class="menu-cleaner-category-arrow">' + (isExpanded ? '▼' : '▶') + '</span>';
      html += '<strong>' + escHtml(group.name) + '</strong>';
      html += '<span class="menu-cleaner-category-count">' + items.length + ' 项</span>';
      html += '</div>';
      html += '<div class="menu-cleaner-category-body' + (isExpanded ? '' : ' collapsed') + '" data-group="' + group.id + '">';

      if (items.length === 0) {
        html += '<div class="menu-cleaner-reorder-empty">没有可见元素</div>';
      } else {
        for (var ii = 0; ii < items.length; ii++) {
          var item = items[ii];
          html += '<div class="menu-cleaner-reorder-item" draggable="true" data-selector="' + escHtml(item.selector) + '" data-group="' + group.id + '" data-index="' + ii + '">';
          html += '<span class="menu-cleaner-drag-handle" title="拖动排序">⋮⋮</span>';
          html += '<span title="' + escHtml(item.selector) + '">' + escHtml(item.label) + '</span>';
          html += '</div>';
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

  function bindReorderDragEvents() {
    var draggedItem = null;
    var draggedGroup = null;
    var draggedIndex = -1;

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
        this.classList.remove('dragging');
        var allItems = doc.querySelectorAll('.menu-cleaner-reorder-item');
        for (var ai = 0; ai < allItems.length; ai++) {
          allItems[ai].classList.remove('drag-over');
        }
        draggedItem = null;
        draggedGroup = null;
        draggedIndex = -1;
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

        var groupId = draggedGroup;
        var reorderItems = getReorderItems(groupId);
        var fromIndex = draggedIndex;
        var toIndex = parseInt(this.dataset.index);

        if (fromIndex < 0 || fromIndex >= reorderItems.length || toIndex < 0 || toIndex >= reorderItems.length) return;

        var moved = reorderItems.splice(fromIndex, 1)[0];
        reorderItems.splice(toIndex, 0, moved);

        settings.reorder[groupId] = reorderItems.map(function (ri) { return ri.selector; });
        saveSettings();
        applyReorder(groupId);
        renderReorderView();
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

  function refreshPopup() {
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
  function init() {
    loadSettings();
    injectStyle();
    mergeExtensionSettingsColumns();
    injectMenuEntry();
    injectSettingsEntry();
    setupKeyboard();
    refreshDiscoveryCache();
    registerSlashCmd();

    setTimeout(function () {
      refreshDiscoveryCache();
      applyAllReorders();
    }, 3000);

    if (settings.enabled) {
      applyHides();
      setTimeout(function () {
        mergeExtensionSettingsColumns();
        applyAllReorders();
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
