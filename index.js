import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const STORAGE_KEY = "menu_cleaner";
let autoIdSeq = 0;
let activeTab = "hide"; // "hide" or "reorder"

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
    name: "扩展设置",
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
    name: "预设设置",
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
  discoveryCache: {},  // { groupId: [{selector, label}, ...] }
  reorder: {}          // { groupId: [selector, ...] }
};

let settings = {};

function loadSettings() {
  const saved = extension_settings[STORAGE_KEY] || {};
  // saved overrides defaults — preserves user's hiddenSelectors across refreshes
  extension_settings[STORAGE_KEY] = Object.assign({}, defaultSettings, saved);
  settings = extension_settings[STORAGE_KEY];
}

function saveSettings() {
  extension_settings[STORAGE_KEY] = settings;
  saveSettingsDebounced();
}

// ── CSS injection ───────────────────────────────────────────────────
function applyHides() {
  let styleEl = document.getElementById("menu-cleaner-styles");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "menu-cleaner-styles";
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
  const styleEl = document.getElementById("menu-cleaner-styles");
  if (styleEl) styleEl.textContent = "";
}

// ── Reorder helpers ─────────────────────────────────────────────────
function findReorderUnit(el, container) {
  if (!el || el === container) return null;
  let unit = el;
  while (unit && unit.parentNode !== container) {
    unit = unit.parentNode;
  }
  return unit && unit.parentNode === container ? unit : null;
}

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
  const order = settings.reorder[groupId];
  if (!order || order.length === 0) return;

  const group = PANEL_GROUPS.find(g => g.id === groupId);
  if (!group || !group.reorder) return;

  const container = document.querySelector(group.reorder.container);
  if (!container) return;

  for (const selector of order) {
    if (settings.hiddenSelectors[selector]) continue;
    const el = document.querySelector(selector);
    if (!el) continue;
    const unit = findReorderUnit(el, container);
    if (unit) {
      container.appendChild(unit);
    }
  }
}

function applyAllReorders() {
  for (const group of PANEL_GROUPS) {
    if (group.reorder) {
      applyReorder(group.id);
    }
  }
}

// ── Dynamic discovery ──────────────────────────────────────────────
function discoverItems(group) {
  if (!group.discovery) return [];
  const discovered = [];
  const seen = new Set();
  const excludeSet = new Set(group.discovery.exclude || []);

  for (const containerSel of group.discovery.containers) {
    const container = document.querySelector(containerSel);
    if (!container) continue;

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

          discovered.push({ selector, label });
        }

        if (group.discovery.alsoMatchChildren) {
          for (const directChild of child.children) {
            if (matchedElements.has(directChild)) continue;
            if (directChild.style.display === "none") continue;
            const span = directChild.querySelector("span");
            if (!span) continue;
            const labelText = span.textContent.trim();
            if (!labelText) continue;
            if (!directChild.id) { directChild.id = "menu-cleaner-auto-" + (autoIdSeq++); }
            const selector = "#" + directChild.id;
            if (seen.has(selector) || excludeSet.has(selector)) continue;
            seen.add(selector);
            discovered.push({ selector, label: labelText });
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

        discovered.push({ selector, label });
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
    settings.discoveryCache[group.id] = allDiscovered.filter(d => !hardcodedSet.has(d.selector));
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
          <p style="color:var(--muted);font-size:0.85em;margin:4px 0;">
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
          <button id="menu-cleaner-rescan" class="menu_button">重新扫描</button>
          <button id="menu-cleaner-close" class="menu_button">✕ 关闭</button>
        </div>
      </div>
      <div class="menu-cleaner-tabs">
        <div class="menu-cleaner-tab active" data-tab="hide">隐藏元素</div>
        <div class="menu-cleaner-tab" data-tab="reorder">重排序</div>
      </div>
      <div id="menu-cleaner-popup-body" class="menu-cleaner-popup-body"></div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);

  document.getElementById("menu-cleaner-close")?.addEventListener("click", closePopup);
  document.getElementById("menu-cleaner-backdrop")?.addEventListener("click", closePopup);
  document.getElementById("menu-cleaner-rescan")?.addEventListener("click", () => {
    refreshDiscoveryCache();
    refreshPopup();
  });

  // Tab switching
  document.querySelectorAll(".menu-cleaner-tab").forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

function openPopup() {
  createPopupDOM();
  document.getElementById("menu-cleaner-backdrop").style.display = "block";
  document.getElementById("menu-cleaner-popup").style.display = "flex";
  refreshPopup();
  positionPopup();
}

function closePopup() {
  const backdrop = document.getElementById("menu-cleaner-backdrop");
  const popup = document.getElementById("menu-cleaner-popup");
  if (backdrop) backdrop.style.display = "none";
  if (popup) popup.style.display = "none";
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
    html += `<div class="menu-cleaner-category">`;
    html += `<div class="menu-cleaner-category-header" data-group="${group.id}">
               <span class="menu-cleaner-category-arrow">${isExpanded ? "▼" : "▶"}</span>
               <strong>${group.name}</strong>
               <span class="menu-cleaner-category-count">${items.length} 项</span>
             </div>`;
    html += `<div class="menu-cleaner-category-body${isExpanded ? "" : " collapsed"}" data-group="${group.id}">`;

    if (items.length === 0) {
      html += `<div class="menu-cleaner-reorder-empty">没有可见元素</div>`;
    } else {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        html += `<div class="menu-cleaner-reorder-item" draggable="true" data-selector="${escHtml(item.selector)}" data-group="${group.id}" data-index="${i}">
                   <span class="menu-cleaner-drag-handle" title="拖动排序">⋮⋮</span>
                   <span title="${escHtml(item.selector)}">${escHtml(item.label)}</span>
                 </div>`;
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

function bindReorderDragEvents() {
  let draggedItem = null;
  let draggedGroup = null;
  let draggedIndex = -1;

  document.querySelectorAll(".menu-cleaner-reorder-item").forEach(item => {
    item.addEventListener("dragstart", (e) => {
      draggedItem = item;
      draggedGroup = item.dataset.group;
      draggedIndex = parseInt(item.dataset.index);
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.dataset.selector);
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      document.querySelectorAll(".menu-cleaner-reorder-item").forEach(el => {
        el.classList.remove("drag-over");
      });
      draggedItem = null;
      draggedGroup = null;
      draggedIndex = -1;
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (item !== draggedItem && item.dataset.group === draggedGroup) {
        item.classList.add("drag-over");
      }
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over");
      if (!draggedItem || item === draggedItem) return;
      if (item.dataset.group !== draggedGroup) return;

      const groupId = draggedGroup;
      const items = getReorderItems(groupId);
      const fromIndex = draggedIndex;
      const toIndex = parseInt(item.dataset.index);

      if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;

      // Reorder
      const moved = items.splice(fromIndex, 1)[0];
      items.splice(toIndex, 0, moved);

      // Save new order
      settings.reorder[groupId] = items.map(i => i.selector);
      saveSettings();

      // Apply to DOM
      applyReorder(groupId);

      // Refresh view
      renderReorderView();
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

// ── Init ────────────────────────────────────────────────────────────
function init() {
  loadSettings();
  injectMenuEntry();
  injectSettingsEntry();
  setupKeyboard();
  refreshDiscoveryCache();

  // Delayed re-scan catches extensions that inject buttons after init
  setTimeout(() => {
    refreshDiscoveryCache();
    applyAllReorders();
  }, 3000);

  if (settings.enabled) {
    applyHides();
    setTimeout(() => applyAllReorders(), 500);
  }
}

init();
