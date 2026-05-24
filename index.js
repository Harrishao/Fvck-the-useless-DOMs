import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const STORAGE_KEY = "menu_cleaner";
let autoIdSeq = 0;

// ── Hardcoded native elements (MVP1) ──────────────────────────────
// Each group maps to a panel. Only native SillyTavern elements are listed.
// Third-party extensions will be handled in MVP2 (dynamic scanning).
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
    ]
  },
  {
    id: "extensionsSettings",
    name: "扩展设置",
    buttonId: "#extensions-settings-button",
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
  }
];

// These are always hidden when the extension is enabled — no toggle offered.
const ALWAYS_HIDDEN_SELECTORS = [
  "#rm_api_block > div.flex-container.flexFlowColumn > #openai_api > div.flex-container.flex > #test_api_button",
  "#rm_extensions_block > div > div.alignitemsflexstart.flex-container.wide100p",
  "#rm_extensions_block > div > div.alignitemscenter.flex-container.justifyCenter.wide100p",
  "#rm_extensions_block > div > hr"
];

// ── Settings ────────────────────────────────────────────────────────
const defaultSettings = {
  enabled: true,
  hiddenSelectors: {},
  discoveryCache: {}  // { groupId: [{selector, label}, ...] }
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

// ── Dynamic discovery ──────────────────────────────────────────────
function discoverItems(group) {
  if (!group.discovery) return [];
  const discovered = [];
  const seen = new Set();

  for (const containerSel of group.discovery.containers) {
    const container = document.querySelector(containerSel);
    if (!container) continue;

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
      <span>原生菜单精简器</span>
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
        <b>原生菜单精简器</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down interactable"></div>
      </div>
      <div class="inline-drawer-content">
        <div style="padding:8px 0;">
          <label class="checkbox_label">
            <input id="menu-cleaner-enable" type="checkbox" ${settings.enabled ? "checked" : ""}>
            <span>启用扩展</span>
          </label>
          <p style="color:var(--muted);font-size:0.85em;margin:4px 0;">
            点击魔棒菜单中的 <b>原生菜单精简器</b> 打开操作面板，选择要隐藏的原生菜单项。
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
        <h2>原生菜单精简器</h2>
        <div class="menu-cleaner-popup-actions">
          <button id="menu-cleaner-rescan" class="menu_button">🔄 重新扫描</button>
          <button id="menu-cleaner-close" class="menu_button">✕ 关闭</button>
        </div>
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
      html += `<div class="menu-cleaner-separator">── 扩展注入 ──</div>`;
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

  if (settings.enabled) {
    applyHides();
  }
}

init();
