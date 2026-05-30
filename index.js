import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";
import { registerSlashCommand } from "../../../slash-commands.js";

const STORAGE_KEY = "menu_cleaner";
let autoIdSeq = 0;
let activeTab = "hide"; // "hide" or "reorder"
let showSettingsPanel = false;
let extPanelVisible = false;
let rescanTimer = null;

// ── Hardcoded native elements ─────────────────────────────────────
const PANEL_GROUPS = [
  {
    id: "options",
    name: "左下菜单",
    buttonId: "#options_button",
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
    items: [
      { selector: "#manageAttachments",          label: "打开数据库" },
      { selector: "#attachFile",                 label: "附加文件" },
      { selector: "#sd_gen",                     label: "生成图片" },
      { selector: "#send_picture",               label: "Generate Caption" },
      { selector: "#ttsExtensionNarrateAll",     label: "Narrate All Chat" },
      { selector: "#token_counter",              label: "词符计数器" },
      { selector: "#translate_chat",             label: "翻译聊天" },
      { selector: "#translate_input_message",    label: "翻译输入" }
    ],
    discovery: {
      containers: ["#extensionsMenu"],
      itemMatch: ".list-group-item",
      labelIn: "span",
      exclude: ["#menu-cleaner-btn"],
      alsoMatchChildren: true
    }
  },
  {
    id: "extensionsSettings",
    name: "扩展菜单",
    buttonId: "#extensions-settings-button",
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
    ],
    discovery: {
      containers: ["#extensions_settings", "#extensions_settings2"],
      hasHeader: ".inline-drawer-header",
      labelInHeader: "b, [data-i18n]"
    }
  },
  {
    id: "topSettings",
    name: "顶部导航栏",
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

// Groups that support reordering
const REORDER_GROUP_IDS = ["extensionsSettings", "extensionsMenu", "options"];

// Always hidden — no toggle offered
const ALWAYS_HIDDEN_SELECTORS = [
  "#rm_api_block > div.flex-container.flexFlowColumn > #openai_api > div.flex-container.flex > #test_api_button",
  "#rm_extensions_block > div > div.alignitemsflexstart.flex-container.wide100p",
  "#rm_extensions_block > div > div.alignitemscenter.flex-container.justifyCenter.wide100p"
];

// ── Settings ────────────────────────────────────────────────────
const defaultSettings = {
  enabled: true,
  hiddenSelectors: {},
  discoveryCache: {},  // { groupId: [{selector, label, column?}, ...] }
  reorder: {},          // { groupId: [selector, ...] }
  initialSnapshot: null, // set once on first init, cleared by "清除插件数据"
  rescanToast: false
};

let settings = {};

function loadSettings() {
  const saved = extension_settings[STORAGE_KEY] || {};
  extension_settings[STORAGE_KEY] = Object.assign({}, defaultSettings, saved);
  settings = extension_settings[STORAGE_KEY];

  // Clean up stale entries (elements that no longer exist in DOM)
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

// ── CSS injection ───────────────────────────────────────────────
function applyHides() {
  let styleEl = document.getElementById("menu-cleaner-hides");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "menu-cleaner-hides";
    document.head.appendChild(styleEl);
  }

  const rules = [];

  if (settings.enabled) {
    for (const sel of ALWAYS_HIDDEN_SELECTORS) {
      rules.push(`${sel} { display: none !important; }`);
    }
    // Hide the native extensions block — our panel replaces it
    rules.push(`#rm_extensions_block { display: none !important; }`);
  }

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

// ── Snapshot system ─────────────────────────────────────────────
function extractHeaderLabel(header) {
  if (!header) return "";
  // 1. Prefer DIRECT child b/[data-i18n] — avoids nested matches in subcontent
  for (const ch of header.children) {
    if (ch.tagName === "B" || ch.hasAttribute("data-i18n")) {
      const t = (ch.textContent || "").trim();
      if (t) return t;
    }
  }
  // 2. Fall back to first descendant b/[data-i18n], but only if its text is short enough to be a label
  const nested = header.querySelector("b, [data-i18n]");
  if (nested) {
    const nt = (nested.textContent || "").trim();
    if (nt && nt.length <= 40) return nt;
  }
  // 3. Direct text nodes only — avoid pulling in version strings / taglines from nested elements
  let direct = "";
  for (const n of header.childNodes) {
    if (n.nodeType === 3) direct += n.textContent;
  }
  direct = direct.trim();
  if (direct) return direct;
  // 4. Last resort: full textContent minus icon text (handles <span>-wrapped labels)
  const icon = header.querySelector(".inline-drawer-icon");
  const iconText = icon ? icon.textContent.trim() : "";
  let full = (header.textContent || "").trim();
  if (iconText && full.endsWith(iconText)) {
    full = full.slice(0, -iconText.length).trim();
  }
  if (full) return full;
  return "";
}

function captureInitialSnapshot() {
  if (settings.initialSnapshot) return; // already captured

  const snapshot = {};
  for (const group of PANEL_GROUPS) {
    if (!group.discovery) continue;
    const entries = [];
    const seen = new Set();

    for (let ci = 0; ci < group.discovery.containers.length; ci++) {
      const container = document.querySelector(group.discovery.containers[ci]);
      if (!container) continue;
      let idx = 0;
      for (const child of container.children) {
        if (getComputedStyle(child).display === "none") continue;
        if (!child.id) { child.id = "menu-cleaner-auto-" + (autoIdSeq++); }

        const header = child.querySelector(group.discovery.hasHeader);
        if (!header) continue;
        const label = extractHeaderLabel(header);
        if (!label) continue;

        const selector = "#" + child.id;
        if (seen.has(selector)) continue;
        seen.add(selector);

        entries.push({ selector, label, column: ci, index: idx++ });
      }
    }
    if (entries.length > 0) snapshot[group.id] = entries;
  }

  settings.initialSnapshot = snapshot;
  saveSettings();
}

// ── Dynamic discovery ──────────────────────────────────────────
function discoverItems(group) {
  if (!group.discovery) return [];
  const discovered = [];
  const seen = new Set();
  const excludeSet = new Set(group.discovery.exclude || []);
  const multiContainer = group.discovery.containers.length > 1;

  for (let ci = 0; ci < group.discovery.containers.length; ci++) {
    const container = document.querySelector(group.discovery.containers[ci]);
    if (!container) continue;
    const columnIndex = multiContainer ? ci : undefined;

    if (group.discovery.itemMatch) {
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
            // Skip descendants of hardcoded items
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

        const label = extractHeaderLabel(header);
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

    // Filter: exclude hardcoded items and their descendants
    const newItems = allDiscovered.filter(d => {
      if (hardcodedSet.has(d.selector)) return false;
      const el = document.querySelector(d.selector);
      if (el) {
        for (const hcSel of group.items.map(i => i.selector)) {
          const hcEl = document.querySelector(hcSel);
          if (hcEl && hcEl.contains(el)) return false;
        }
      }
      return true;
    });

    // Preserve column origin from old cache (user's prior cross-column moves win over physical scan)
    const oldCache = settings.discoveryCache[group.id] || [];
    const oldColMap = {};
    for (const old of oldCache) {
      if (old.column !== undefined) oldColMap[old.selector] = old.column;
    }
    for (const item of newItems) {
      if (oldColMap[item.selector] !== undefined) {
        item.column = oldColMap[item.selector];
      }
    }

    // Preserve hardcoded items' column info (created by cross-column moves)
    for (const old of oldCache) {
      if (hardcodedSet.has(old.selector) && old.column !== undefined) {
        if (!newItems.find(n => n.selector === old.selector)) {
          newItems.push({ selector: old.selector, label: old.label, column: old.column });
        }
      }
    }

    // Safety net: carry over non-hardcoded entries still in DOM but missed by current scan
    for (const old of oldCache) {
      if (hardcodedSet.has(old.selector)) continue;
      if (newItems.find(n => n.selector === old.selector)) continue;
      if (!document.querySelector(old.selector)) continue;
      newItems.push({ selector: old.selector, label: old.label, column: old.column });
    }

    settings.discoveryCache[group.id] = newItems;

    // Append newly discovered selectors to reorder list
    if (REORDER_GROUP_IDS.indexOf(group.id) !== -1 && newItems.length > 0) {
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

// ── Column cache helper ─────────────────────────────────────────
function setColumnInCache(selector, groupId, columnIndex) {
  if (!settings.discoveryCache[groupId]) settings.discoveryCache[groupId] = [];
  const entry = settings.discoveryCache[groupId].find(c => c.selector === selector);
  if (entry) {
    entry.column = columnIndex;
  } else {
    // Try to source a clean label: hardcoded list first, then header extraction
    let label = "";
    const grp = PANEL_GROUPS.find(g => g.id === groupId);
    if (grp) {
      const hc = grp.items.find(i => i.selector === selector);
      if (hc) label = hc.label;
    }
    if (!label) {
      const el = document.querySelector(selector);
      if (el) {
        const hd = el.querySelector(".inline-drawer-header");
        if (hd) label = extractHeaderLabel(hd);
        if (!label) label = (el.textContent || "").trim().substring(0, 40);
      }
    }
    if (!label) label = selector;
    settings.discoveryCache[groupId].push({ selector, label, column: columnIndex });
  }
}

// ── Reorder helpers ─────────────────────────────────────────────
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

  // Append items not yet in order
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

function getColumnIndex(selector, groupId) {
  const cached = settings.discoveryCache[groupId] || [];
  const entry = cached.find(c => c.selector === selector);
  return entry ? (entry.column || 0) : 0;
}

// ── Extensions panel ────────────────────────────────────────────
function createExtensionsPanelDOM() {
  if (document.getElementById("menu-cleaner-ext-panel")) return;

  const html = `
    <div id="menu-cleaner-ext-panel" class="drawer-content menu-cleaner-ext-panel">
      <div class="extensions_block flex-container">
        <div id="menu-cleaner-ext-topbar" class="alignitemscenter flex-container wide100p">
          <h3 class="margin0 flex1">扩展</h3>
        </div>
        <div id="menu-cleaner-ext-col1" class="flex1 wide50p menu-cleaner-ext-col"></div>
        <div id="menu-cleaner-ext-col2" class="flex1 wide50p menu-cleaner-ext-col"></div>
        <hr class="wide100p margin0">
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", html);
}

function renderExtensionsPanel() {
  const col1 = document.getElementById("menu-cleaner-ext-col1");
  const col2 = document.getElementById("menu-cleaner-ext-col2");
  if (!col1 || !col2) return;

  const groupId = "extensionsSettings";
  const order = settings.reorder[groupId] || [];
  const group = PANEL_GROUPS.find(g => g.id === groupId);
  if (!group) return;

  // Build default order if none saved
  if (order.length === 0) {
    const defaults = group.items.map(i => i.selector);
    const cached = settings.discoveryCache[groupId] || [];
    for (const c of cached) defaults.push(c.selector);
    settings.reorder[groupId] = defaults;
  }

  const actualOrder = settings.reorder[groupId] || [];
  const colMap = {};
  const cached = settings.discoveryCache[groupId] || [];
  for (const c of cached) {
    colMap[c.selector] = c.column !== undefined ? c.column : 0;
  }

  // Collect elements by column in order
  const col1Els = [];
  const col2Els = [];
  const placed = new Set();

  for (const selector of actualOrder) {
    if (settings.hiddenSelectors[selector]) continue;
    const el = document.querySelector(selector);
    if (!el) continue;
    placed.add(selector);
    const col = colMap[selector] === 1 ? 1 : 0;
    if (col === 1) col2Els.push(el);
    else col1Els.push(el);
  }

  // Append elements not in order (newly discovered, etc.)
  for (const c of (settings.discoveryCache[groupId] || [])) {
    if (placed.has(c.selector)) continue;
    if (settings.hiddenSelectors[c.selector]) continue;
    const el = document.querySelector(c.selector);
    if (!el) continue;
    placed.add(c.selector);
    const col = c.column === 1 ? 1 : 0;
    if (col === 1) col2Els.push(el);
    else col1Els.push(el);
  }

  // Move native topbar elements into our panel's top bar
  const topbar = document.getElementById("menu-cleaner-ext-topbar");
  if (topbar) {
    // Ensure native topbar elements are in our panel
    const nativeDetails = document.getElementById("extensions_details");
    const nativeThirdParty = document.getElementById("third_party_extension_button");
    if (nativeDetails && nativeDetails.parentNode !== topbar) topbar.appendChild(nativeDetails);
    if (nativeThirdParty && nativeThirdParty.parentNode !== topbar) topbar.appendChild(nativeThirdParty);
    // Move the "notify on update" checkbox label if it exists
    const notifyLabel = document.querySelector("#rm_extensions_block .checkbox_label.flexNoGap");
    if (notifyLabel && notifyLabel.parentNode !== topbar) topbar.appendChild(notifyLabel);
  }

  // Render elements in order — clear and append
  col1.innerHTML = "";
  col2.innerHTML = "";
  for (const el of col1Els) col1.appendChild(el);
  for (const el of col2Els) col2.appendChild(el);
}

function toggleExtensionsPanel() {
  extPanelVisible = !extPanelVisible;
  const panel = document.getElementById("menu-cleaner-ext-panel");
  if (!panel) {
    createExtensionsPanelDOM();
    return toggleExtensionsPanel();
  }

  if (extPanelVisible) {
    renderExtensionsPanel();
    panel.style.display = "block";
    panel.style.visibility = "visible";
    panel.style.height = "auto";
    panel.classList.remove("closedDrawer");
    positionExtensionsPanel();
  } else {
    panel.style.display = "none";
  }
}

function isPanelOpen() {
  return extPanelVisible;
}

function positionExtensionsPanel() {
  const panel = document.getElementById("menu-cleaner-ext-panel");
  if (!panel) return;
  // The .drawer-content base class already handles positioning via CSS
  // (position:absolute, top:var(--topBarBlockSize), left:0, right:0, margin:0 auto)
  // We only adjust height to prevent overflow
  panel.style.maxHeight = "80vh";
  panel.style.overflow = "auto";
}

// ── Panel intercept ─────────────────────────────────────────────
function setupPanelIntercept() {
  // #extensions-settings-button is a .drawer container that holds
  // both the .drawer-toggle icon AND #rm_extensions_block content.
  // We intercept clicks on the toggle in capture phase so our handler
  // runs before SillyTavern's jQuery bubble-phase handler.
  const drawerToggle = document.querySelector("#extensions-settings-button > .drawer-toggle");
  if (!drawerToggle) {
    setTimeout(setupPanelIntercept, 500);
    return;
  }
  drawerToggle.addEventListener("click", function(e) {
    e.stopImmediatePropagation();
    e.preventDefault();
    toggleExtensionsPanel();
  }, true);
}

// ── UI: Entry in extensionsMenu ─────────────────────────────────
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

// ── UI: Settings drawer in extensions_settings ──────────────────
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
    if (e.target.checked) {
      applyHides();
      // Switch back to our panel
      setupPanelIntercept();
    } else {
      clearAllHides();
      // Show native panel again, move elements back
      const panel = document.getElementById("menu-cleaner-ext-panel");
      if (panel) panel.style.display = "none";
      extPanelVisible = false;
      // Move elements back to native containers
      returnElementsToNative();
    }
  });

  document.getElementById("menu-cleaner-open-popup")?.addEventListener("click", () => openPopup());
}

function returnElementsToNative() {
  const col1 = document.getElementById("menu-cleaner-ext-col1");
  const col2 = document.getElementById("menu-cleaner-ext-col2");
  const nativeCol1 = document.getElementById("extensions_settings");
  const nativeCol2 = document.getElementById("extensions_settings2");

  if (col1 && nativeCol1) {
    while (col1.firstChild) nativeCol1.appendChild(col1.firstChild);
  }
  if (col2 && nativeCol2) {
    while (col2.firstChild) nativeCol2.appendChild(col2.firstChild);
  }
}

// ── Popup ───────────────────────────────────────────────────────
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

// ── Settings panel view ─────────────────────────────────────────
function renderSettingsView() {
  const body = document.getElementById("menu-cleaner-popup-body");
  if (!body) return;

  let html = `
    <div class="menu-cleaner-settings-panel">
      <button id="menu-cleaner-rescan" class="menu_button menu-cleaner-settings-btn-full">手动重新扫描</button>
      <button id="menu-cleaner-reset-order" class="menu_button menu-cleaner-settings-btn-full">恢复原始排序</button>
      <button id="menu-cleaner-clear-data" class="menu_button menu-cleaner-settings-btn-full">清除插件数据</button>

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
    // Re-run init sequence
    captureInitialSnapshot();
    refreshDiscoveryCache();
    applyHides();
    createExtensionsPanelDOM();
    setupPanelIntercept();
    renderExtensionsPanel();
  });

  document.getElementById("menu-cleaner-rescan-toast")?.addEventListener("change", (e) => {
    settings.rescanToast = e.target.checked;
    saveSettings();
  });

  positionPopup();
}

// ── Reorder view ────────────────────────────────────────────────
function renderReorderView() {
  const body = document.getElementById("menu-cleaner-popup-body");
  if (!body) return;

  const expanded = new Set();
  document.querySelectorAll(".menu-cleaner-category-body:not(.collapsed)").forEach(b => {
    expanded.add(b.dataset.group);
  });

  const reorderGroups = PANEL_GROUPS.filter(g => REORDER_GROUP_IDS.indexOf(g.id) !== -1);
  let html = "";

  for (const group of reorderGroups) {
    const items = getReorderItems(group.id);
    const isExpanded = expanded.has(group.id);
    const isDualCol = group.id === "extensionsSettings";

    html += `<div class="menu-cleaner-category">`;
    html += `<div class="menu-cleaner-category-header" data-group="${group.id}">
               <span class="menu-cleaner-category-arrow">${isExpanded ? "▼" : "▶"}</span>
               <strong>${group.name}</strong>
               <span class="menu-cleaner-category-count">${items.length} 项</span>
             </div>`;
    html += `<div class="menu-cleaner-category-body${isExpanded ? "" : " collapsed"}" data-group="${group.id}">`;

    if (isDualCol) {
      // Split into left/right column
      const flatIndexMap = {};
      for (let fi = 0; fi < items.length; fi++) flatIndexMap[items[fi].selector] = fi;
      const col0Items = items.filter(function(it) {
        return getColumnIndex(it.selector, group.id) === 0;
      });
      const col1Items = items.filter(function(it) {
        return getColumnIndex(it.selector, group.id) === 1;
      });

      html += renderColumnSection(group, col0Items, 0, "左栏", flatIndexMap);
      html += renderColumnSection(group, col1Items, 1, "右栏", flatIndexMap);
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

function renderColumnSection(group, items, colIndex, label, flatIndexMap) {
  let h = `<div class="menu-cleaner-reorder-column-section" data-column="${colIndex}">`;
  h += `<div class="menu-cleaner-reorder-column-label">${label} (${items.length} 项)</div>`;
  if (items.length === 0) {
    h += `<div class="menu-cleaner-reorder-empty">没有可见元素</div>`;
  } else {
    for (let i = 0; i < items.length; i++) {
      const flatIdx = flatIndexMap ? flatIndexMap[items[i].selector] : i;
      h += buildReorderItemHTML(items[i], group.id, flatIdx, colIndex);
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

// ── Drag events ─────────────────────────────────────────────────
function bindReorderDragEvents() {
  let draggedItem = null;
  let draggedGroup = null;
  let draggedIndex = -1;
  let touchGhost = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoved = false;

  function doReorder(fromIndex, toIndex, groupId) {
    const fromCol = draggedItem ? draggedItem.dataset.column : "-1";
    const toCol = doReorder._dropTargetColumn;

    if (fromCol !== "-1" && toCol !== undefined && toCol !== "-1" && fromCol !== toCol) {
      // Cross-column move: update column in cache, then re-sort the order array
      const selector = draggedItem.dataset.selector;
      const items = getReorderItems(groupId);
      const movedItem = items.find(function(it) { return it.selector === selector; });
      if (!movedItem) return;

      // Update column in discovery cache
      setColumnInCache(selector, groupId, parseInt(toCol));

      // Rebuild order: all items in their new column-aware order
      const remaining = items.filter(function(it) { return it.selector !== selector; });

      // Find insertion point: after the target item
      const targetItem = items.find(function(it, idx) { return idx === toIndex; });
      if (targetItem) {
        const insertIdx = remaining.findIndex(function(it) { return it.selector === targetItem.selector; });
        remaining.splice(insertIdx + 1, 0, movedItem);
      } else {
        remaining.push(movedItem);
      }

      settings.reorder[groupId] = remaining.map(function(i) { return i.selector; });
      saveSettings();
      // Refresh extension panel if open
      if (isPanelOpen() && groupId === "extensionsSettings") renderExtensionsPanel();
      renderReorderView();
      return;
    }

    // Same-column reorder: pure array splice
    const items = getReorderItems(groupId);
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;

    const moved = items.splice(fromIndex, 1)[0];
    items.splice(toIndex, 0, moved);

    settings.reorder[groupId] = items.map(function(i) { return i.selector; });
    saveSettings();
    // Refresh extension panel if open
    if (isPanelOpen() && groupId === "extensionsSettings") renderExtensionsPanel();
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
    // ── Native HTML5 DnD (desktop) ────────────────────────
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
      doReorder._dropTargetColumn = item.dataset.column;
      doReorder(draggedIndex, parseInt(item.dataset.index), draggedGroup);
      doReorder._dropTargetColumn = undefined;
      cleanupDrag();
    });

    // ── Touch polyfill (mobile) ───────────────────────────
    item.addEventListener("touchstart", function(e) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchMoved = false;

      draggedItem = item;
      draggedGroup = item.dataset.group;
      draggedIndex = parseInt(item.dataset.index);
      item.classList.add("dragging");

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
      const touch = e.touches[0];

      if (touchGhost) {
        touchGhost.style.left = (touch.clientX - touchGhost.offsetWidth / 2) + "px";
        touchGhost.style.top = (touch.clientY - 20) + "px";
      }

      if (touchGhost) touchGhost.style.display = "none";
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (touchGhost) touchGhost.style.display = "";

      const targetItem = target ? target.closest(".menu-cleaner-reorder-item") : null;

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
        const touch = e.changedTouches[0];
        if (touchGhost) touchGhost.style.display = "none";
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (touchGhost) touchGhost.style.display = "";

        const targetItem = target ? target.closest(".menu-cleaner-reorder-item") : null;
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

  // Column-section drop targets for cross-column drag
  document.querySelectorAll(".menu-cleaner-reorder-column-section").forEach(function(section) {
    section.addEventListener("dragover", function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      section.classList.add("drag-over-section");
    });

    section.addEventListener("dragleave", function(e) {
      if (!section.contains(e.relatedTarget)) {
        section.classList.remove("drag-over-section");
      }
    });

    section.addEventListener("drop", function(e) {
      e.preventDefault();
      section.classList.remove("drag-over-section");
      if (!draggedItem) return;

      const firstItem = section.querySelector(".menu-cleaner-reorder-item");
      if (!firstItem) {
        // Empty column: move item to this column
        let targetCol = -1;
        const label = section.querySelector(".menu-cleaner-reorder-column-label");
        if (label) {
          if (label.textContent.indexOf("右栏") !== -1) targetCol = 1;
          else if (label.textContent.indexOf("左栏") !== -1) targetCol = 0;
        }
        if (targetCol >= 0 && draggedItem.dataset.column !== String(targetCol)) {
          const selector = draggedItem.dataset.selector;
          const groupId = draggedGroup;
          const items = getReorderItems(groupId);
          const movedItem = items.find(function(it) { return it.selector === selector; });
          if (movedItem) {
            setColumnInCache(selector, groupId, targetCol);
            const remaining = items.filter(function(it) { return it.selector !== selector; });
            remaining.push(movedItem);
            settings.reorder[groupId] = remaining.map(function(i) { return i.selector; });
            saveSettings();
            if (isPanelOpen() && groupId === "extensionsSettings") renderExtensionsPanel();
            renderReorderView();
          }
        }
        cleanupDrag();
      }
    });
  });
}

// ── Popup positioning ───────────────────────────────────────────
function positionPopup() {
  const popup = document.getElementById("menu-cleaner-popup");
  if (!popup) return;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const margin = 10;

  popup.style.maxHeight = "90vh";
  popup.style.maxWidth = Math.min(560, vw - margin * 2) + "px";

  popup.style.top = "0";
  popup.style.left = "0";
  popup.style.transform = "none";

  const popupHeight = popup.offsetHeight;
  const popupWidth = popup.offsetWidth;

  const top = Math.max(margin, (vh - popupHeight) / 2.5);
  const left = Math.max(margin, (vw - popupWidth) / 2);

  popup.style.top = top + "px";
  popup.style.left = left + "px";
}

// ── Build popup content from hardcoded data ─────────────────────
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
    const hcSelectors = new Set(group.items.map(i => i.selector));
    const cached = (settings.discoveryCache[group.id] || []).filter(c => !hcSelectors.has(c.selector));
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

function bindPopupEvents() {
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

  document.querySelectorAll(".menu-cleaner-checkbox").forEach(cb => {
    cb.addEventListener("change", (e) => {
      const selector = e.target.dataset.selector;
      if (!selector) return;
      settings.hiddenSelectors[selector] = !e.target.checked;
      saveSettings();
      applyHides();
      // If extension panel is open, re-render to reflect hide changes
      if (isPanelOpen()) renderExtensionsPanel();
    });
  });
}

function escHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Reset ───────────────────────────────────────────────────
function resetAllReorders() {
  const snap = settings.initialSnapshot;
  if (!snap) {
    // No snapshot — rebuild from current DOM state
    captureInitialSnapshot();
  }

  for (const group of PANEL_GROUPS) {
    if (REORDER_GROUP_IDS.indexOf(group.id) === -1) continue;

    if (settings.initialSnapshot && settings.initialSnapshot[group.id]) {
      const snapEntries = settings.initialSnapshot[group.id];
      // Restore reorder from snapshot
      settings.reorder[group.id] = snapEntries.map(s => s.selector);

      // Restore discovery cache column info from snapshot
      const existingCache = settings.discoveryCache[group.id] || [];
      for (const s of snapEntries) {
        if (s.column !== undefined) {
          const existing = existingCache.find(c => c.selector === s.selector);
          if (existing) {
            existing.column = s.column;
          } else {
            existingCache.push({ selector: s.selector, label: s.label, column: s.column });
          }
        }
      }
      settings.discoveryCache[group.id] = existingCache;
    } else {
      // Fallback: use hardcoded items order
      const defaultOrder = group.items.map(i => i.selector);
      const cached = settings.discoveryCache[group.id] || [];
      for (const c of cached) defaultOrder.push(c.selector);
      settings.reorder[group.id] = defaultOrder;
    }
  }

  saveSettings();

  // Refresh UI
  showSettingsPanel = false;
  activeTab = "reorder";
  document.querySelectorAll(".menu-cleaner-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === "reorder");
  });
  updatePopupView();
  renderReorderView();

  // Refresh extension panel if open
  if (isPanelOpen()) renderExtensionsPanel();
}

// ── Rescan ───────────────────────────────────────────────────
function doRescan() {
  if (rescanTimer) { clearTimeout(rescanTimer); rescanTimer = null; }

  refreshDiscoveryCache();
  // If extension panel is open, re-render it to reflect new discoveries
  if (isPanelOpen()) renderExtensionsPanel();
  refreshPopup();

  if (settings.rescanToast) {
    const count = Object.values(settings.discoveryCache).reduce((s, arr) => s + arr.length, 0);
    if (typeof toastr !== "undefined") toastr.info("已重新扫描，发现 " + count + " 个扩展元素");
  }
}

// ── Keyboard ──────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const popup = document.getElementById("menu-cleaner-popup");
      if (popup && popup.style.display !== "none") {
        closePopup();
        return;
      }
      // Also close extension panel on escape
      if (extPanelVisible) {
        toggleExtensionsPanel();
      }
    }
  });

  window.addEventListener("resize", () => {
    const popup = document.getElementById("menu-cleaner-popup");
    if (popup && popup.style.display !== "none") {
      positionPopup();
    }
    if (extPanelVisible) {
      positionExtensionsPanel();
    }
  });
}

// ── Disable extension ─────────────────────────────────────────
function disableExtension() {
  settings.enabled = false;
  saveSettings();
  clearAllHides();
  if (extPanelVisible) {
    toggleExtensionsPanel();
  }
  const panel = document.getElementById("menu-cleaner-ext-panel");
  if (panel) panel.style.display = "none";
  extPanelVisible = false;
  returnElementsToNative();
  // Remove our click interceptor from the drawer toggle
  // (it was added in capture phase, so we just rely on enabled check in init)
  if (typeof toastr !== "undefined") toastr.info("酒馆菜单精简器已禁用，刷新页面后生效");
}

// ── Slash commands ────────────────────────────────────────────
function registerSlashCmd() {
  try {
    registerSlashCommand(
      "menucleaner",
      () => { openPopup(); return ""; },
      [],
      "打开酒馆菜单精简器操作面板"
    );
    registerSlashCommand(
      "menucleanerdisable",
      () => { disableExtension(); return ""; },
      [],
      "禁用酒馆菜单精简器（关闭面板并恢复原生扩展面板）"
    );
    console.debug("[MenuCleaner] 已注册 /menucleaner 和 /menucleanerdisable 命令");
  } catch (e) {
    console.debug("[MenuCleaner] 斜杠命令注册失败", e);
  }
}

// ── Auto-rescan ──────────────────────────────────────────────
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

// ── Init ──────────────────────────────────────────────────────
function init() {
  loadSettings();

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
  setTimeout(() => {
    refreshDiscoveryCache();
    if (settings.enabled && isPanelOpen()) renderExtensionsPanel();
  }, 3000);
}

init();
