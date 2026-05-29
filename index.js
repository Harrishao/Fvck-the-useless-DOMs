import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";
import { registerSlashCommand } from "../../../slash-commands.js";

const STORAGE_KEY = "menu_cleaner";
let autoIdSeq = 0;
let activeTab = "hide"; // "hide" or "reorder"
let showSettingsPanel = false;
let rescanTimer = null;
let suppressObserver = false;

// ── Hardcoded native elements (MVP1) ──────────────────────────────
// Each group maps to a panel. Only native SillyTavern elements are listed.
// Third-party extensions will be handled in MVP2 (dynamic scanning).
const PANEL_GROUPS = [
  {
    id: "options",
    name: "左下菜单",
    buttonId: "#options_button",
    reorder: { container: "#options" },
    items: [
      { selector: "#option_toggle_AN",           label: "作者注释" },
      { selector: "#option_toggle_CFG",          label: "CFG缩放" },
      { selector: "#option_toggle_logprobs",     label: "词符概率" },
      { selector: "#option_new_bookmark",        label: "保存检查点" },
      { selector: "#option_convert_to_group",    label: "转换为群聊" },
      { selector: "#option_start_new_chat",      label: "开始新聊天" },
      { selector: "#option_close_chat",          label: "关闭聊天" },
      { selector: "#option_select_chat",         label: "管理聊天文件" },
      { selector: "#option_delete_mes",          label: "删除消息" },
      { selector: "#option_regenerate",          label: "重新生成" },
      { selector: "#option_impersonate",         label: "AI帮答" },
      { selector: "#option_continue",            label: "继续" }
    ]
  },
  {
    id: "extensionsMenu",
    name: "魔棒",
    buttonId: "#extensionsMenuButton",
    reorder: { container: "#extensionsMenu" },
    discovery: {
      containers: ["#extensionsMenu"],
      itemMatch: ".list-group-item",
      labelIn: "span",
      exclude: ["#menu-cleaner-btn"],
      alsoMatchChildren: true
    },
    items: [
      { selector: "#manageAttachments",          label: "打开数据库" },
      { selector: "#attachFile",                 label: "附加文件" },
      { selector: "#sd_gen",                     label: "生成图片" },
      { selector: "#send_picture",               label: "Generate Caption" },
      { selector: "#ttsExtensionNarrateAll",     label: "Narrate All Chat" },
      { selector: "#token_counter",              label: "词符计数器" },
      { selector: "#translate_chat",             label: "翻译聊天" },
      { selector: "#translate_input_message",    label: "翻译输入" }
    ]
  },
  {
    id: "extensionsSettings",
    name: "扩展菜单",
    buttonId: "#extensions-settings-button",
    reorder: { container: "#extensions_settings" },
    discovery: {
      containers: ["#extensions_settings", "#extensions_settings2"],
      hasHeader: ".inline-drawer-header",
      labelInHeader: "b, [data-i18n]"
    },
    items: [
      { selector: "#assets_container",           label: "下载扩展和资源菜单" },
      { selector: "#expressions_container",      label: "角色表情" },
      { selector: "#sd_container",               label: "图像生成" },
      { selector: "#tts_container",              label: "TTS" },
      { selector: "#qr_container",               label: "快速回复" },
      { selector: "#translation_container",      label: "聊天翻译" },
      { selector: "#caption_container",          label: "图像描述" },
      { selector: "#summarize_container",        label: "总结" },
      { selector: "#regex_container",            label: "正则" },
      { selector: "#vectors_container",          label: "向量存储" }
    ]
  },
  {
    id: "topSettings",
    name: "顶部导航栏",
    // No buttonId — this panel is always visible
    items: [
      { selector: "#ai-config-button",           label: "预设" },
      { selector: "#sys-settings-button",        label: "插头" },
      { selector: "#advanced-formatting-button", label: "AI回复格式化" },
      { selector: "#WI-SP-button",               label: "世界书" },
      { selector: "#user-settings-button",       label: "用户设置" },
      { selector: "#backgrounds-button",         label: "背景" },
      { selector: "#extensions-settings-button", label: "扩展" },
      { selector: "#persona-management-button",  label: "USER设置" },
      { selector: "#rightNavHolder",             label: "角色卡" }
    ]
  },
  {
    id: "presetSettings",
    name: "预设菜单",
    buttonId: "#ai-config-button",
    items: [
      { selector: "#range_block_openai > div:nth-child(1), #range_block_openai > div:nth-child(2), #range_block_openai > div:nth-child(3), #range_block_openai > div:nth-child(4)", label: "上下文长度及备选回复" },
      { selector: "#range_block_openai > div:nth-child(11), #range_block_openai > div:nth-child(12), #range_block_openai > div:nth-child(13), #range_block_openai > div:nth-child(14), #range_block_openai > div:nth-child(15), #range_block_openai > div:nth-child(16), #range_block_openai > div:nth-child(17), #range_block_openai > div:nth-child(18)", label: "可调参数" },
      { selector: "#range_block_openai > div.inline-drawer.m-t-1.wide100p, #range_block_openai > div:nth-child(20), #range_block_openai > div:nth-child(21), #openai_settings > div:nth-child(1) > div:nth-child(1), #openai_settings > div:nth-child(1) > div.inline-drawer.wide100p.flexFlowColumn.marginBot10", label: "提示词格式相关" },
      { selector: "#openai_settings > div:nth-child(1) > div:nth-child(3), #openai_settings > div:nth-child(1) > div:nth-child(4), #openai_settings > div:nth-child(1) > div:nth-child(5), #openai_settings > div:nth-child(1) > div:nth-child(6), #openai_settings > div:nth-child(1) > div:nth-child(7), #openai_settings > div:nth-child(1) > div:nth-child(8), #openai_settings > div:nth-child(1) > div:nth-child(9), #openai_settings > div:nth-child(1) > div:nth-child(10), #openai_settings > div:nth-child(1) > div:nth-child(11), #openai_settings > div:nth-child(1) > div:nth-child(12), #openai_settings > div:nth-child(1) > div:nth-child(13), #openai_settings > div.range-block.m-t-1", label: "复选框和下拉菜单" },
      { selector: "#openai_settings > div.range-block.m-b-1", label: "预设条目" }
    ]
  }
];

// These are always hidden when the extension is enabled — no toggle offered.
const ALWAYS_HIDDEN_SELECTORS = [
  "#rm_api_block > div.flex-container.flexFlowColumn > #openai_api > div.flex-container.flex > #test_api_button",
  "#rm_extensions_block > div > div.alignitemsflexstart.flex-container.wide100p",
  "#rm_extensions_block > div > div.alignitemscenter.flex-container.justifyCenter.wide100p"
];

// ── Settings ────────────────────────────────────────────────────────
const defaultSettings = {
  enabled: true,
  hiddenSelectors: {},
  discoveryCache: {},  // { groupId: [{selector, label, column?}, ...] }
  reorder: {},          // { groupId: [selector, ...] }
  columnMode: "single", // "single" | "dual"
  rescanToast: false
};

let settings = {};

function loadSettings() {
  const saved = extension_settings[STORAGE_KEY] || {};
  // saved overrides defaults — preserves user's hiddenSelectors across refreshes
  extension_settings[STORAGE_KEY] = Object.assign({}, defaultSettings, saved);
  settings = extension_settings[STORAGE_KEY];

  // 清理DOM中已不存在的失效条目（插件被卸载等情况）
  for (const key of Object.keys(settings.hiddenSelectors)) {
    if (!document.querySelector(key)) delete settings.hiddenSelectors[key];
  }
  for (const groupId of Object.keys(settings.discoveryCache)) {
    settings.discoveryCache[groupId] = settings.discoveryCache[groupId].filter(
      c => document.querySelector(c.selector)
    );
  }
  for (const groupId of Object.keys(settings.reorder)) {
    settings.reorder[groupId] = settings.reorder[groupId].filter(
      s => document.querySelector(s)
    );
  }
}

function saveSettings() {
  extension_settings[STORAGE_KEY] = settings;
  saveSettingsDebounced();
}

// ── CSS injection ───────────────────────────────────────────────────
function applyHides() {
  let styleEl = document.getElementById("menu-cleaner-hides");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "menu-cleaner-hides";
    document.head.appendChild(styleEl);
  }

  const rules = [];

  // Always-hidden items
  if (settings.enabled) {
    for (const sel of ALWAYS_HIDDEN_SELECTORS) {
      rules.push(`${sel} { display: none !important; }`);
    }
  }

  // User-toggled items
  for (const [selector, hidden] of Object.entries(settings.hiddenSelectors)) {
    if (hidden) {
      rules.push(`${selector} { display: none !important; }`);
    }
  }

  styleEl.textContent = rules.join("\n");
}

function clearAllHides() {
  const styleEl = document.getElementById("menu-cleaner-hides");
  if (styleEl) styleEl.textContent = "";
}

// ── Reorder helpers ─────────────────────────────────────────────────
function getReorderItems(groupId) {
  const group = PANEL_GROUPS.find(g => g.id === groupId);
  if (!group) return [];

  let order = settings.reorder[groupId];
  if (!order || order.length === 0) {
    order = group.items.map(i => i.selector);
    const cached = settings.discoveryCache[groupId] || [];
    for (const c of cached) order.push(c.selector);
  }

  const labelMap = {};
  for (const item of group.items) labelMap[item.selector] = item.label;
  const cached = settings.discoveryCache[groupId] || [];
  for (const item of cached) labelMap[item.selector] = item.label;

  const result = [];
  const seen = new Set();
  for (const selector of order) {
    if (seen.has(selector)) continue;
    seen.add(selector);
    if (settings.hiddenSelectors[selector]) continue;
    result.push({ selector, label: labelMap[selector] || selector });
  }

  for (const item of group.items) {
    if (!seen.has(item.selector) && !settings.hiddenSelectors[item.selector]) {
      seen.add(item.selector);
      result.push({ selector: item.selector, label: item.label });
    }
  }
  for (const item of cached) {
    if (!seen.has(item.selector) && !settings.hiddenSelectors[item.selector]) {
      seen.add(item.selector);
      result.push({ selector: item.selector, label: item.label });
    }
  }

  return result;
}

function applyReorder(groupId) {
  var order = settings.reorder[groupId];
  if (!order || order.length === 0) return;

  if (settings.columnMode === "dual" && groupId === "extensionsSettings") {
    applyDualColumnReorder(groupId);
    return;
  }

  applySingleColumnReorder(groupId);
}

function applySingleColumnReorder(groupId) {
  var order = settings.reorder[groupId];
  if (!order || order.length === 0) return;

  // Collect all visible elements for this group
  var els = [];
  for (var i = 0; i < order.length; i++) {
    if (settings.hiddenSelectors[order[i]]) continue;
    var el = document.querySelector(order[i]);
    if (el) els.push(el);
  }

  if (els.length < 2) return;

  // Find the deepest common ancestor that contains all elements
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

  // Walk each element up to its direct child of the container (= reorder unit)
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

  // Move each unit to the end in desired order
  for (var m = 0; m < units.length; m++) {
    container.appendChild(units[m]);
  }
}

function applyDualColumnReorder(groupId) {
  var order = settings.reorder[groupId];
  if (!order || order.length === 0) return;

  var col1 = document.querySelector('#extensions_settings');
  var col2 = document.querySelector('#extensions_settings2');
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

  // Reorder within column 1
  reorderWithinContainer(col1, col1Order);
  // Reorder within column 2 (if it exists)
  if (col2) reorderWithinContainer(col2, col2Order);
}

function reorderWithinContainer(container, order) {
  if (order.length < 2) return;
  var els = [];
  for (var i = 0; i < order.length; i++) {
    var el = document.querySelector(order[i]);
    if (el && container.contains(el)) els.push(el);
  }
  if (els.length < 2) return;

  // Walk to direct children of the container
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
  if (settings.columnMode === "dual") return; // preserve both columns in dual mode
  const col1 = document.querySelector('#extensions_settings');
  const col2 = document.querySelector('#extensions_settings2');
  if (!col1 || !col2) return;
  while (col2.firstChild) {
    col1.appendChild(col2.firstChild);
  }
  col2.style.display = 'none';
}

function restoreExtensionSettingsColumns() {
  const col1 = document.querySelector('#extensions_settings');
  const col2 = document.querySelector('#extensions_settings2');
  if (!col1 || !col2) return;
  col2.style.display = '';
  const originMap = {};
  const cached = settings.discoveryCache["extensionsSettings"] || [];
  for (const item of cached) {
    if (item.column === 1) originMap[item.selector] = true;
  }
  // Move items that originated from col2 back to col2
  const toMove = [];
  for (const child of col1.children) {
    if (child.id && originMap["#" + child.id]) {
      toMove.push(child);
    }
  }
  for (const child of toMove) {
    col2.appendChild(child);
  }
}

function applyAllReorders() {
  mergeExtensionSettingsColumns();
  for (const group of PANEL_GROUPS) {
    if (group.reorder) {
      applyReorder(group.id);
    }
  }
}

function doRescan() {
  if (rescanTimer) { clearTimeout(rescanTimer); rescanTimer = null; }
  suppressObserver = true;

  if (settings.columnMode === "single") {
    mergeExtensionSettingsColumns();
  } else {
    restoreExtensionSettingsColumns();
  }
  refreshDiscoveryCache();
  applyAllReorders();

  setTimeout(() => { suppressObserver = false; }, 0);

  refreshPopup();
  if (settings.rescanToast) {
    const count = Object.values(settings.discoveryCache).reduce((s, arr) => s + arr.length, 0);
    if (typeof toastr !== "undefined") toastr.info("已重新扫描，发现 " + count + " 个扩展元素");
  }
}

function resetAllReorders() {
  suppressObserver = true;
  if (settings.columnMode === "single") {
    mergeExtensionSettingsColumns();
  } else {
    restoreExtensionSettingsColumns();
  }

  // Reset column origins for extensionsSettings: re-discover to get fresh column info,
  // then move hardcoded items back to col1 and discovered items back to their origin columns.
  const extGroup = PANEL_GROUPS.find(g => g.id === "extensionsSettings");
  if (extGroup && extGroup.discovery) {
    const freshDiscovered = discoverItems(extGroup);
    const hcSet = new Set(extGroup.items.map(i => i.selector));
    // Remove entries for hardcoded items; keep only truly discovered items with fresh column
    settings.discoveryCache["extensionsSettings"] = freshDiscovered.filter(d => !hcSet.has(d.selector));
    // Move DOM elements: hardcoded → col1, discovered → their original column
    const col1 = document.querySelector('#extensions_settings');
    const col2 = document.querySelector('#extensions_settings2');
    for (const item of extGroup.items) {
      const el = document.querySelector(item.selector);
      if (el && el.parentNode && col1 && el.parentNode !== col1) {
        col1.appendChild(el);
      }
    }
    for (const cached of settings.discoveryCache["extensionsSettings"]) {
      const el = document.querySelector(cached.selector);
      if (!el) continue;
      const targetCol = cached.column === 1 ? col2 : col1;
      if (targetCol && el.parentNode !== targetCol) {
        targetCol.appendChild(el);
      }
    }
  }

  for (const group of PANEL_GROUPS) {
    if (!group.reorder) continue;
    const defaultOrder = group.items.map(i => i.selector);
    const cached = settings.discoveryCache[group.id] || [];
    for (const c of cached) defaultOrder.push(c.selector);
    settings.reorder[group.id] = defaultOrder;
    applyReorder(group.id);
  }
  saveSettings();
  setTimeout(() => { suppressObserver = false; }, 0);
  // 退出设置页面，回到重排序视图
  showSettingsPanel = false;
  activeTab = "reorder";
  document.querySelectorAll(".menu-cleaner-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === "reorder");
  });
  updatePopupView();
  renderReorderView();
}

function applyColumnMode() {
  suppressObserver = true;
  if (settings.columnMode === "single") {
    mergeExtensionSettingsColumns();
  } else {
    restoreExtensionSettingsColumns();
  }
  refreshDiscoveryCache();
  applyAllReorders();
  saveSettings();
  setTimeout(() => { suppressObserver = false; }, 0);
}

// ── Settings panel view ───────────────────────────────────────────────
function renderSettingsView() {
  const body = document.getElementById("menu-cleaner-popup-body");
  if (!body) return;

  let html = `
    <div class="menu-cleaner-settings-panel">
      <button id="menu-cleaner-rescan" class="menu_button menu-cleaner-settings-btn-full">手动重新扫描</button>
      <button id="menu-cleaner-reset-order" class="menu_button menu-cleaner-settings-btn-full">恢复原始排序</button>
      <button id="menu-cleaner-clear-data" class="menu_button menu-cleaner-settings-btn-full">清除插件数据</button>

      <div class="menu-cleaner-settings-divider">—————— 扩展菜单分栏选项 ——————</div>
      <div class="menu-cleaner-settings-radio-group">
        <label class="menu-cleaner-settings-radio">
          <input type="radio" name="menu-cleaner-column-mode" value="single" ${settings.columnMode === "single" ? "checked" : ""}>
          <span>单栏</span>
        </label>
        <label class="menu-cleaner-settings-radio">
          <input type="radio" name="menu-cleaner-column-mode" value="dual" ${settings.columnMode === "dual" ? "checked" : ""}>
          <span>双栏</span>
        </label>
      </div>

      <div class="menu-cleaner-settings-divider">—————— 调试用内容 ——————</div>
      <div class="menu-cleaner-settings-row">
        <span>重扫描消息toast</span>
        <label class="menu-cleaner-toggle">
          <input type="checkbox" id="menu-cleaner-rescan-toast" ${settings.rescanToast ? "checked" : ""}>
          <span class="menu-cleaner-slider"></span>
        </label>
      </div>
    </div>
  `;

  body.innerHTML = html;

  document.getElementById("menu-cleaner-rescan")?.addEventListener("click", () => doRescan());
  document.getElementById("menu-cleaner-reset-order")?.addEventListener("click", () => resetAllReorders());

  document.getElementById("menu-cleaner-clear-data")?.addEventListener("click", () => {
    if (!confirm("确定要清除所有插件配置数据吗？此操作不可撤销。")) return;
    settings = Object.assign({}, defaultSettings);
    extension_settings[STORAGE_KEY] = settings;
    saveSettingsDebounced();
    clearAllHides();
    showSettingsPanel = false;
    activeTab = "hide";
    updatePopupView();
    doRescan();
  });

  document.querySelectorAll("input[name='menu-cleaner-column-mode']").forEach(radio => {
    radio.addEventListener("change", (e) => {
      settings.columnMode = e.target.value;
      applyColumnMode();
      saveSettings();
    });
  });

  document.getElementById("menu-cleaner-rescan-toast")?.addEventListener("change", (e) => {
    settings.rescanToast = e.target.checked;
    saveSettings();
  });

  positionPopup();
}

// ── Dynamic discovery ──────────────────────────────────────────────
function discoverItems(group) {
  if (!group.discovery) return [];
  const discovered = [];
  const seen = new Set();
  const excludeSet = new Set(group.discovery.exclude || []);
  const multiContainer = group.discovery.containers.length > 1;

  for (let ci = 0; ci < group.discovery.containers.length; ci++) {
    const containerSel = group.discovery.containers[ci];
    const container = document.querySelector(containerSel);
    if (!container) continue;
    const columnIndex = multiContainer ? ci : undefined;

    if (group.discovery.itemMatch) {
      // Mode: find individual items matching a selector within visible children
      for (const child of container.children) {
        if (getComputedStyle(child).display === "none") continue;
        const matchedElements = new Set();
        const items = child.querySelectorAll(group.discovery.itemMatch);
        for (const item of items) {
          if (item.style.display === "none") continue;
          if (!item.id) { item.id = "menu-cleaner-auto-" + (autoIdSeq++); }
          const selector = "#" + item.id;
          if (seen.has(selector) || excludeSet.has(selector)) continue;
          seen.add(selector);
          matchedElements.add(item);

          const labelEl = item.querySelector(group.discovery.labelIn);
          const label = labelEl ? labelEl.textContent.trim() : item.textContent.trim();
          if (!label) continue;

          const entry = { selector, label };
          if (columnIndex !== undefined) entry.column = columnIndex;
          discovered.push(entry);
        }

        if (group.discovery.alsoMatchChildren) {
          for (const directChild of child.children) {
            if (matchedElements.has(directChild)) continue;
            if (directChild.style.display === "none") continue;
            // Skip descendants of hardcoded items to avoid re-discovering them as third-party
            let isHardcodedDescendant = false;
            for (const hc of group.items) {
              const hcEl = document.querySelector(hc.selector);
              if (hcEl && hcEl.contains(directChild)) { isHardcodedDescendant = true; break; }
            }
            if (isHardcodedDescendant) continue;
            const span = directChild.querySelector("span");
            if (!span) continue;
            const labelText = span.textContent.trim();
            if (!labelText) continue;
            if (!directChild.id) { directChild.id = "menu-cleaner-auto-" + (autoIdSeq++); }
            const selector = "#" + directChild.id;
            if (seen.has(selector) || excludeSet.has(selector)) continue;
            seen.add(selector);
            const entry = { selector, label: labelText };
            if (columnIndex !== undefined) entry.column = columnIndex;
            discovered.push(entry);
          }
        }
      }
    } else {
      // Mode: match container children that have a specific header element
      for (const child of container.children) {
        const header = child.querySelector(group.discovery.hasHeader);
        if (!header) continue;

        const labelEl = header.querySelector(group.discovery.labelInHeader);
        const label = labelEl?.textContent?.trim();
        if (!label) continue;

        if (!child.id) { child.id = "menu-cleaner-auto-" + (autoIdSeq++); }
        const selector = "#" + child.id;
        if (seen.has(selector)) continue;
        seen.add(selector);

        const entry = { selector, label };
        if (columnIndex !== undefined) entry.column = columnIndex;
        discovered.push(entry);
      }
    }
  }
  return discovered;
}

function refreshDiscoveryCache() {
  for (const group of PANEL_GROUPS) {
    if (!group.discovery) continue;
    const allDiscovered = discoverItems(group);
    const hardcodedSet = new Set(group.items.map(i => i.selector));
    const newItems = allDiscovered.filter(d => {
      if (hardcodedSet.has(d.selector)) return false;
      // Also skip descendants of hardcoded items (alsoMatchChildren may pick up sub-elements)
      const el = document.querySelector(d.selector);
      if (el) {
        for (const hcSel of group.items.map(i => i.selector)) {
          const hcEl = document.querySelector(hcSel);
          if (hcEl && hcEl.contains(el)) return false;
        }
      }
      return true;
    });

    // Preserve column origin from the previous cache for items that have it
    const oldCache = settings.discoveryCache[group.id] || [];
    const oldColMap = {};
    for (const old of oldCache) {
      if (old.column !== undefined) oldColMap[old.selector] = old.column;
    }
    for (const item of newItems) {
      if (item.column === undefined && oldColMap[item.selector] !== undefined) {
        item.column = oldColMap[item.selector];
      }
    }

    settings.discoveryCache[group.id] = newItems;

    // Append newly discovered selectors to the reorder list
    if (group.reorder && newItems.length > 0) {
      if (!settings.reorder[group.id]) settings.reorder[group.id] = [];
      const existing = new Set(settings.reorder[group.id]);
      for (const item of newItems) {
        if (!existing.has(item.selector)) {
          settings.reorder[group.id].push(item.selector);
        }
      }
    }
  }
  saveSettings();
}

// ── UI: Entry in extensionsMenu ─────────────────────────────────────
function injectMenuEntry() {
  const menu = document.querySelector("#extensionsMenu");
  if (!menu) {
    setTimeout(injectMenuEntry, 500);
    return;
  }
  if (document.getElementById("menu-cleaner-wand-container")) return;

  const container = document.createElement("div");
  container.id = "menu-cleaner-wand-container";
  container.className = "extension_container interactable";
  container.innerHTML = `
    <div id="menu-cleaner-btn" class="list-group-item flex-container flexGap5 interactable">
      <div class="fa-solid fa-broom extensionsMenuExtensionButton"></div>
      <span>酒馆菜单精简器</span>
    </div>
  `;
  menu.appendChild(container);
  container.addEventListener("click", () => openPopup());
}

// ── UI: Settings drawer in extensions_settings ──────────────────────
function injectSettingsEntry() {
  const target = document.querySelector("#extensions_settings");
  if (!target) {
    setTimeout(injectSettingsEntry, 500);
    return;
  }
  if (document.getElementById("menu-cleaner-settings")) return;

  const html = `
    <div id="menu-cleaner-settings" class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>酒馆菜单精简器</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down interactable"></div>
      </div>
      <div class="inline-drawer-content">
        <div style="padding:8px 0;">
          <label class="checkbox_label">
            <input id="menu-cleaner-enable" type="checkbox" ${settings.enabled ? "checked" : ""}>
            <span>启用扩展</span>
          </label>
          <p style="color:#888;font-size:0.85em;margin:4px 0;">
            点击魔棒菜单中的 <b>酒馆菜单精简器</b> 打开操作面板，选择要隐藏的原生菜单项。
          </p>
          <button id="menu-cleaner-open-popup" class="menu_button">打开操作面板</button>
        </div>
      </div>
    </div>
  `;
  target.insertAdjacentHTML("beforeend", html);

  const toggleEl = target.querySelector("#menu-cleaner-settings .inline-drawer-toggle");
  const contentEl = target.querySelector("#menu-cleaner-settings .inline-drawer-content");
  toggleEl?.addEventListener("click", () => contentEl?.classList.toggle("closedDrawer"));

  document.getElementById("menu-cleaner-enable")?.addEventListener("change", (e) => {
    settings.enabled = e.target.checked;
    saveSettings();
    e.target.checked ? applyHides() : clearAllHides();
  });

  document.getElementById("menu-cleaner-open-popup")?.addEventListener("click", () => openPopup());
}

// ── Popup ───────────────────────────────────────────────────────────
function createPopupDOM() {
  if (document.getElementById("menu-cleaner-popup")) return;

  const html = `
    <div id="menu-cleaner-backdrop" class="menu-cleaner-backdrop"></div>
    <div id="menu-cleaner-popup" class="menu-cleaner-popup">
      <div class="menu-cleaner-popup-header">
        <h2>酒馆菜单精简器</h2>
        <div class="menu-cleaner-popup-actions">
          <button id="menu-cleaner-settings-btn" class="menu_button">设置</button>
          <button id="menu-cleaner-close" class="menu_button">✕ 关闭</button>
        </div>
      </div>
      <div class="menu-cleaner-tabs" id="menu-cleaner-tabs">
        <div class="menu-cleaner-tab active" data-tab="hide">隐藏元素</div>
        <div class="menu-cleaner-tab" data-tab="reorder">重排序</div>
      </div>
      <div id="menu-cleaner-popup-body" class="menu-cleaner-popup-body"></div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);

  document.getElementById("menu-cleaner-close")?.addEventListener("click", closePopup);
  document.getElementById("menu-cleaner-backdrop")?.addEventListener("click", closePopup);
  document.getElementById("menu-cleaner-settings-btn")?.addEventListener("click", toggleSettingsPanel);

  // Tab switching
  document.querySelectorAll(".menu-cleaner-tab").forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

function openPopup() {
  createPopupDOM();
  document.getElementById("menu-cleaner-backdrop").style.display = "block";
  document.getElementById("menu-cleaner-popup").style.display = "flex";
  showSettingsPanel = false;
  updatePopupView();
  refreshPopup();
  positionPopup();
}

function closePopup() {
  const backdrop = document.getElementById("menu-cleaner-backdrop");
  const popup = document.getElementById("menu-cleaner-popup");
  if (backdrop) backdrop.style.display = "none";
  if (popup) popup.style.display = "none";
  showSettingsPanel = false;
}

function toggleSettingsPanel() {
  showSettingsPanel = !showSettingsPanel;
  updatePopupView();
  if (!showSettingsPanel) refreshPopup();
}

function updatePopupView() {
  const tabsEl = document.getElementById("menu-cleaner-tabs");
  const body = document.getElementById("menu-cleaner-popup-body");
  const settingsBtn = document.getElementById("menu-cleaner-settings-btn");

  if (showSettingsPanel) {
    if (tabsEl) tabsEl.style.display = "none";
    if (settingsBtn) settingsBtn.textContent = "返回";
    renderSettingsView();
  } else {
    if (tabsEl) tabsEl.style.display = "";
    if (settingsBtn) settingsBtn.textContent = "设置";
  }
}

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll(".menu-cleaner-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  refreshPopup();
}

function renderReorderView() {
  const body = document.getElementById("menu-cleaner-popup-body");
  if (!body) return;

  // Save which groups are currently expanded
  const expanded = new Set();
  document.querySelectorAll(".menu-cleaner-category-body:not(.collapsed)").forEach(b => {
    expanded.add(b.dataset.group);
  });

  const reorderGroups = PANEL_GROUPS.filter(g => g.reorder);
  let html = "";

  for (const group of reorderGroups) {
    const items = getReorderItems(group.id);
    const isExpanded = expanded.has(group.id);
    const isDualCol = settings.columnMode === "dual" && group.id === "extensionsSettings";

    html += `<div class="menu-cleaner-category">`;
    html += `<div class="menu-cleaner-category-header" data-group="${group.id}">
               <span class="menu-cleaner-category-arrow">${isExpanded ? "▼" : "▶"}</span>
               <strong>${group.name}</strong>
               <span class="menu-cleaner-category-count">${items.length} 项</span>
             </div>`;
    html += `<div class="menu-cleaner-category-body${isExpanded ? "" : " collapsed"}" data-group="${group.id}">`;

    if (isDualCol) {
      const col0Items = items.filter(function(it) {
        var cached = (settings.discoveryCache[group.id] || []).find(function(c) { return c.selector === it.selector; });
        return !cached || cached.column !== 1;
      });
      const col1Items = items.filter(function(it) {
        var cached = (settings.discoveryCache[group.id] || []).find(function(c) { return c.selector === it.selector; });
        return cached && cached.column === 1;
      });

      html += renderColumnSection(group, col0Items, 0, "左栏");
      html += renderColumnSection(group, col1Items, 1, "右栏");
    } else {
      if (items.length === 0) {
        html += `<div class="menu-cleaner-reorder-empty">没有可见元素</div>`;
      } else {
        for (let i = 0; i < items.length; i++) {
          html += buildReorderItemHTML(items[i], group.id, i, -1);
        }
      }
    }

    html += `</div></div>`;
  }

  body.innerHTML = html;

  // Bind category collapse
  document.querySelectorAll(".menu-cleaner-category-header").forEach(header => {
    header.addEventListener("click", () => {
      const groupId = header.dataset.group;
      const catBody = document.querySelector(`.menu-cleaner-category-body[data-group="${groupId}"]`);
      const arrow = header.querySelector(".menu-cleaner-category-arrow");
      if (catBody) {
        catBody.classList.toggle("collapsed");
        arrow.textContent = catBody.classList.contains("collapsed") ? "▶" : "▼";
        positionPopup();
      }
    });
  });

  // Bind drag-and-drop
  bindReorderDragEvents();

  positionPopup();
}

function renderColumnSection(group, items, colIndex, label) {
  let h = `<div class="menu-cleaner-reorder-column-section">`;
  h += `<div class="menu-cleaner-reorder-column-label">${label} (${items.length} 项)</div>`;
  if (items.length === 0) {
    h += `<div class="menu-cleaner-reorder-empty">没有可见元素</div>`;
  } else {
    for (let i = 0; i < items.length; i++) {
      h += buildReorderItemHTML(items[i], group.id, i, colIndex);
    }
  }
  h += `</div>`;
  return h;
}

function buildReorderItemHTML(item, groupId, index, colIndex) {
  return `<div class="menu-cleaner-reorder-item" draggable="true" data-selector="${escHtml(item.selector)}" data-group="${groupId}" data-index="${index}" data-column="${colIndex}">
            <span class="menu-cleaner-drag-handle" title="拖动排序">⋮⋮</span>
            <span title="${escHtml(item.selector)}">${escHtml(item.label)}</span>
          </div>`;
}

function bindReorderDragEvents() {
  let draggedItem = null;
  let draggedGroup = null;
  let draggedIndex = -1;
  let touchGhost = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoved = false;

  function moveElementToColumn(selector, groupId, targetColumn) {
    // Update or create discoveryCache column origin
    if (!settings.discoveryCache[groupId]) settings.discoveryCache[groupId] = [];
    var cached = settings.discoveryCache[groupId];
    var entry = cached.find(function(c) { return c.selector === selector; });
    if (entry) {
      entry.column = targetColumn;
    } else {
      // Hardcoded item moved between columns: create a cache entry
      var elForLabel = document.querySelector(selector);
      var label = elForLabel ? (elForLabel.textContent || "").trim().substring(0, 40) : selector;
      cached.push({ selector: selector, label: label, column: targetColumn });
    }

    // Move DOM element to the appropriate container
    var el = document.querySelector(selector);
    if (el) {
      var containers = [];
      for (var _g of PANEL_GROUPS) {
        if (_g.id === groupId && _g.discovery) {
          containers = _g.discovery.containers;
        }
      }
      if (containers.length > targetColumn) {
        var targetContainer = document.querySelector(containers[targetColumn]);
        if (targetContainer && el.parentNode !== targetContainer) {
          targetContainer.appendChild(el);
        }
      }
    }
  }

  function doReorder(fromIndex, toIndex, groupId) {
    var fromCol = draggedItem ? draggedItem.dataset.column : "-1";
    var toCol = doReorder._dropTargetColumn;

    if (fromCol !== "-1" && toCol !== undefined && toCol !== "-1" && fromCol !== toCol) {
      // Cross-column move
      var selector = draggedItem.dataset.selector;
      var items = getReorderItems(groupId);
      var movedItem = items.find(function(it) { return it.selector === selector; });
      if (!movedItem) return;

      // Remove from current position in flat list
      var remaining = items.filter(function(it) { return it.selector !== selector; });

      // Find target item and insert after it
      var targetItem = items.find(function(it, idx) { return idx === toIndex; });
      if (targetItem) {
        var insertIdx = remaining.findIndex(function(it) { return it.selector === targetItem.selector; });
        remaining.splice(insertIdx + 1, 0, movedItem);
      } else {
        remaining.push(movedItem);
      }

      settings.reorder[groupId] = remaining.map(function(i) { return i.selector; });
      moveElementToColumn(selector, groupId, parseInt(toCol));
      saveSettings();
      applyReorder(groupId);
      renderReorderView();
      return;
    }

    // Same-column reorder
    const items = getReorderItems(groupId);
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;

    const moved = items.splice(fromIndex, 1)[0];
    items.splice(toIndex, 0, moved);

    settings.reorder[groupId] = items.map(function(i) { return i.selector; });
    saveSettings();
    applyReorder(groupId);
    renderReorderView();
  }

  function cleanupDrag() {
    if (draggedItem) draggedItem.classList.remove("dragging");
    document.querySelectorAll(".menu-cleaner-reorder-item").forEach(function(el) {
      el.classList.remove("drag-over");
    });
    if (touchGhost) {
      touchGhost.remove();
      touchGhost = null;
    }
    draggedItem = null;
    draggedGroup = null;
    draggedIndex = -1;
    touchMoved = false;
  }

  document.querySelectorAll(".menu-cleaner-reorder-item").forEach(function(item) {
    // ── Native HTML5 DnD (desktop) ──────────────────────────

    item.addEventListener("dragstart", function(e) {
      draggedItem = item;
      draggedGroup = item.dataset.group;
      draggedIndex = parseInt(item.dataset.index);
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.dataset.selector);
    });

    item.addEventListener("dragend", function() {
      cleanupDrag();
    });

    item.addEventListener("dragover", function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      // Allow cross-column drag within same group
      if (item !== draggedItem && item.dataset.group === draggedGroup) {
        item.classList.add("drag-over");
      }
    });

    item.addEventListener("dragleave", function() {
      item.classList.remove("drag-over");
    });

    item.addEventListener("drop", function(e) {
      e.preventDefault();
      item.classList.remove("drag-over");
      if (!draggedItem || item === draggedItem) return;
      if (item.dataset.group !== draggedGroup) return;
      // Store target column for doReorder
      doReorder._dropTargetColumn = item.dataset.column;
      doReorder(draggedIndex, parseInt(item.dataset.index), draggedGroup);
      doReorder._dropTargetColumn = undefined;
      cleanupDrag();
    });

    // ── Touch polyfill (mobile) ─────────────────────────────

    item.addEventListener("touchstart", function(e) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      var touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchMoved = false;

      draggedItem = item;
      draggedGroup = item.dataset.group;
      draggedIndex = parseInt(item.dataset.index);
      item.classList.add("dragging");

      // Create ghost element that follows the finger
      touchGhost = item.cloneNode(true);
      touchGhost.style.position = "fixed";
      touchGhost.style.zIndex = "100001";
      touchGhost.style.pointerEvents = "none";
      touchGhost.style.opacity = "0.85";
      touchGhost.style.width = item.offsetWidth + "px";
      touchGhost.style.left = (touch.clientX - item.offsetWidth / 2) + "px";
      touchGhost.style.top = (touch.clientY - 20) + "px";
      touchGhost.classList.add("dragging");
      document.body.appendChild(touchGhost);
    });

    item.addEventListener("touchmove", function(e) {
      if (!draggedItem) return;
      e.preventDefault();
      touchMoved = true;
      var touch = e.touches[0];

      // Move ghost
      if (touchGhost) {
        touchGhost.style.left = (touch.clientX - touchGhost.offsetWidth / 2) + "px";
        touchGhost.style.top = (touch.clientY - 20) + "px";
      }

      // Hide ghost briefly so it doesn't block elementFromPoint
      if (touchGhost) touchGhost.style.display = "none";
      var target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (touchGhost) touchGhost.style.display = "";

      var targetItem = target ? target.closest(".menu-cleaner-reorder-item") : null;

      // Manage drag-over classes
      document.querySelectorAll(".menu-cleaner-reorder-item").forEach(function(el) {
        if (el === targetItem && el !== draggedItem && el.dataset.group === draggedGroup) {
          el.classList.add("drag-over");
        } else {
          el.classList.remove("drag-over");
        }
      });
    });

    item.addEventListener("touchend", function(e) {
      if (!draggedItem) return;
      e.preventDefault();

      if (touchMoved) {
        var touch = e.changedTouches[0];
        if (touchGhost) touchGhost.style.display = "none";
        var target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (touchGhost) touchGhost.style.display = "";

        var targetItem = target ? target.closest(".menu-cleaner-reorder-item") : null;
        if (targetItem && targetItem !== draggedItem && targetItem.dataset.group === draggedGroup) {
          targetItem.classList.remove("drag-over");
          doReorder._dropTargetColumn = targetItem.dataset.column;
          doReorder(draggedIndex, parseInt(targetItem.dataset.index), draggedGroup);
          doReorder._dropTargetColumn = undefined;
        }
      }

      cleanupDrag();
    });

    item.addEventListener("touchcancel", function() {
      cleanupDrag();
    });
  });

  // Bind column-section drop (for cross-column drag into empty columns)
  document.querySelectorAll(".menu-cleaner-reorder-column-section").forEach(function(section) {
    section.addEventListener("dragover", function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      section.classList.add("drag-over-section");
    });

    section.addEventListener("dragleave", function(e) {
      // Only remove if leaving the section (not entering a child)
      if (!section.contains(e.relatedTarget)) {
        section.classList.remove("drag-over-section");
      }
    });

    section.addEventListener("drop", function(e) {
      e.preventDefault();
      section.classList.remove("drag-over-section");
      if (!draggedItem) return;

      // Determine target column from the section's items
      var firstItem = section.querySelector(".menu-cleaner-reorder-item");
      if (!firstItem) {
        // Empty column: append dragged item to this column
        var targetCol = -1;
        // Infer column from section label
        var label = section.querySelector(".menu-cleaner-reorder-column-label");
        if (label) {
          if (label.textContent.indexOf("右栏") !== -1) targetCol = 1;
          else if (label.textContent.indexOf("左栏") !== -1) targetCol = 0;
        }
        if (targetCol >= 0 && draggedItem.dataset.column !== String(targetCol)) {
          var selector = draggedItem.dataset.selector;
          var groupId = draggedGroup;
          var items = getReorderItems(groupId);
          var movedItem = items.find(function(it) { return it.selector === selector; });
          if (movedItem) {
            var remaining = items.filter(function(it) { return it.selector !== selector; });
            remaining.push(movedItem);
            settings.reorder[groupId] = remaining.map(function(i) { return i.selector; });
            moveElementToColumn(selector, groupId, targetCol);
            saveSettings();
            applyReorder(groupId);
            renderReorderView();
          }
        }
        cleanupDrag();
      }
    });
  });
}

function positionPopup() {
  const popup = document.getElementById("menu-cleaner-popup");
  if (!popup) return;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const margin = 10;

  // Apply size constraints first so we can measure the real dimensions
  popup.style.maxHeight = "90vh";
  popup.style.maxWidth = Math.min(560, vw - margin * 2) + "px";

  // Temporarily pin to origin to get an accurate measurement
  popup.style.top = "0";
  popup.style.left = "0";
  popup.style.transform = "none";

  const popupHeight = popup.offsetHeight;
  const popupWidth = popup.offsetWidth;

  // Center with safety margin (same approach as hide-helper)
  const top = Math.max(margin, (vh - popupHeight) / 2.5);
  const left = Math.max(margin, (vw - popupWidth) / 2);

  popup.style.top = top + "px";
  popup.style.left = left + "px";
}

// ── Build popup content from hardcoded data ─────────────────────────
function refreshPopup() {
  if (showSettingsPanel) return;
  if (activeTab === "reorder") {
    renderReorderView();
    return;
  }
  renderHideView();
}

function renderHideView() {
  const body = document.getElementById("menu-cleaner-popup-body");
  if (!body) return;

  let html = "";

  for (const group of PANEL_GROUPS) {
    const cached = settings.discoveryCache[group.id] || [];
    const totalCount = group.items.length + cached.length;

    html += `<div class="menu-cleaner-category">`;
    html += `<div class="menu-cleaner-category-header" data-group="${group.id}">
               <span class="menu-cleaner-category-arrow">▶</span>
               <strong>${group.name}</strong>
               <span class="menu-cleaner-category-count">${totalCount} 项</span>
             </div>`;
    html += `<div class="menu-cleaner-category-body collapsed" data-group="${group.id}">`;

    for (const item of group.items) {
      const isHidden = settings.hiddenSelectors[item.selector] === true;
      html += `<div class="menu-cleaner-item" data-selector="${escHtml(item.selector)}">
                 <span title="${escHtml(item.selector)}">${escHtml(item.label)}</span>
                 <label class="menu-cleaner-toggle">
                   <input type="checkbox" class="menu-cleaner-checkbox" data-selector="${escHtml(item.selector)}" ${isHidden ? "" : "checked"}>
                   <span class="menu-cleaner-slider"></span>
                 </label>
               </div>`;
    }

    if (cached.length > 0) {
      html += `<div class="menu-cleaner-separator">————由插件引入————</div>`;
      for (const item of cached) {
        const isHidden = settings.hiddenSelectors[item.selector] === true;
        html += `<div class="menu-cleaner-item menu-cleaner-item-discovered" data-selector="${escHtml(item.selector)}">
                   <span title="${escHtml(item.selector)}">${escHtml(item.label)}</span>
                   <label class="menu-cleaner-toggle">
                     <input type="checkbox" class="menu-cleaner-checkbox" data-selector="${escHtml(item.selector)}" ${isHidden ? "" : "checked"}>
                     <span class="menu-cleaner-slider"></span>
                   </label>
                 </div>`;
      }
    }

    html += `</div></div>`;
  }

  body.innerHTML = html;
  bindPopupEvents();
  positionPopup();
}

// ── Popup event bindings ────────────────────────────────────────────
function bindPopupEvents() {
  // Category collapse/expand
  document.querySelectorAll(".menu-cleaner-category-header").forEach(header => {
    header.addEventListener("click", () => {
      const groupId = header.dataset.group;
      const body = document.querySelector(`.menu-cleaner-category-body[data-group="${groupId}"]`);
      const arrow = header.querySelector(".menu-cleaner-category-arrow");
      if (body) {
        body.classList.toggle("collapsed");
        arrow.textContent = body.classList.contains("collapsed") ? "▶" : "▼";
        positionPopup();
      }
    });
  });

  // Toggle switches
  document.querySelectorAll(".menu-cleaner-checkbox").forEach(cb => {
    cb.addEventListener("change", (e) => {
      const selector = e.target.dataset.selector;
      if (!selector) return;
      settings.hiddenSelectors[selector] = !e.target.checked;
      saveSettings();
      applyHides();
    });
  });
}

function escHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Keyboard ────────────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const popup = document.getElementById("menu-cleaner-popup");
      if (popup && popup.style.display !== "none") {
        closePopup();
      }
    }
  });

  window.addEventListener("resize", () => {
    const popup = document.getElementById("menu-cleaner-popup");
    if (popup && popup.style.display !== "none") {
      positionPopup();
    }
  });
}

// ── Slash command ─────────────────────────────────────────────────
function registerSlashCmd() {
  try {
    registerSlashCommand(
      "menucleaner",
      () => { openPopup(); return ""; },
      [],
      "打开酒馆菜单精简器操作面板"
    );
    console.debug("[MenuCleaner] 已注册 /menucleaner 命令");
  } catch (e) {
    console.debug("[MenuCleaner] 斜杠命令注册失败", e);
  }
}

// ── Auto-rescan ──────────────────────────────────────────────────────
function scheduleAutoRescan() {
  if (rescanTimer) clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => {
    doRescan();
    rescanTimer = null;
  }, 800);
}

function setupAutoRescan() {
  // SillyTavern event: chat/character changed
  try {
    if (typeof eventSource !== "undefined" && typeof event_types !== "undefined") {
      eventSource.on(event_types.CHAT_CHANGED, () => {
        scheduleAutoRescan();
      });
      console.debug("[MenuCleaner] 已注册 CHAT_CHANGED 自动重扫描");
    }
  } catch (e) {
    console.debug("[MenuCleaner] 事件监听注册失败", e);
  }

  // MutationObserver: watch for new elements injected into extension containers
  const observeContainers = () => {
    const targets = ["#extensions_settings", "#extensions_settings2"];
    targets.forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      const observer = new MutationObserver((mutations) => {
        if (suppressObserver) return;
        for (const m of mutations) {
          if (m.addedNodes.length > 0) {
            scheduleAutoRescan();
            return;
          }
        }
      });
      observer.observe(el, { childList: true, subtree: false });
    });
  };

  // Retry until containers exist, then observe
  let retries = 0;
  const tryObserve = () => {
    if (document.querySelector("#extensions_settings")) {
      observeContainers();
    } else if (retries < 20) {
      retries++;
      setTimeout(tryObserve, 500);
    }
  };
  setTimeout(tryObserve, 1000);
}

// ── Init ────────────────────────────────────────────────────────────
function init() {
  loadSettings();

  // Scan first to capture column origins from the natural DOM state,
  // so dual mode can later restore items to their original columns.
  refreshDiscoveryCache();

  // Then apply column mode (merge or restore)
  if (settings.columnMode === "dual") {
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
  setTimeout(() => {
    suppressObserver = true;
    if (settings.columnMode === "single") {
      mergeExtensionSettingsColumns();
    } else {
      restoreExtensionSettingsColumns();
    }
    refreshDiscoveryCache();
    applyAllReorders();
    setTimeout(() => { suppressObserver = false; }, 0);
  }, 3000);

  if (settings.enabled) {
    applyHides();
    setTimeout(() => {
      suppressObserver = true;
      if (settings.columnMode === "single") {
        mergeExtensionSettingsColumns();
      } else {
        restoreExtensionSettingsColumns();
      }
      applyAllReorders();
      setTimeout(() => { suppressObserver = false; }, 0);
    }, 500);
  }
}

init();
