import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const STORAGE_KEY = "menu_cleaner";

const defaultSettings = {
  enabled: true,
  hiddenSelectors: {}  // { "#option_toggle_AN": true, "#data_bank_wand_container": true, ... }
};

let settings = {};

// ── Panel scanner configs ───────────────────────────────────────────
const PANEL_CONFIGS = [
  {
    buttonId: "#options_button",
    name: "选项菜单",
    containerSelector: "#options .options-content",
    itemSelector: ":scope > *",
    getItemInfo(el) {
      if (el.tagName === "HR") return { type: "separator" };
      const span = el.querySelector("span");
      return {
        type: "item",
        id: el.id || "",
        label: span?.textContent?.trim() || el.textContent?.trim() || "(unnamed)",
        selector: el.id ? `#${el.id}` : buildFallbackSelector(el),
        currentlyHidden: isElementHidden(el)
      };
    }
  },
  {
    buttonId: "#extensionsMenuButton",
    name: "扩展菜单",
    containerSelector: "#extensionsMenu",
    itemSelector: ":scope > .extension_container",
    getItemInfo(el) {
      const listItem = el.querySelector(".list-group-item");
      const span = listItem?.querySelector("span");
      const isEmpty = !listItem;
      const rawLabel = span?.textContent?.trim() || listItem?.textContent?.trim() || "";
      return {
        type: isEmpty ? "empty" : "item",
        id: el.id || "",
        label: rawLabel || el.id?.replace(/_wand_container$/, "").replace(/_/g, " ") || "(empty slot)",
        selector: el.id ? `#${el.id}` : buildFallbackSelector(el),
        currentlyHidden: isElementHidden(el),
        isEmpty
      };
    }
  },
  {
    buttonId: "#extensions-settings-button",
    name: "扩展设置",
    containerSelector: "#extensions_settings",
    itemSelector: ":scope > *",
    getItemInfo(el) {
      if (el.tagName === "HR") return { type: "separator" };
      const label = extractFirstText(el);
      return {
        type: "item",
        id: el.id || "",
        label: label || el.id?.replace(/_container$/, "").replace(/_/g, " ") || "(unnamed)",
        selector: el.id ? `#${el.id}` : buildFallbackSelector(el),
        currentlyHidden: isElementHidden(el)
      };
    }
  },
  {
    buttonId: "#sys-settings-button",
    name: "系统设置",
    containerSelector: "#top-settings-holder",
    itemSelector: ":scope > *",
    getItemInfo(el) {
      if (el.tagName === "HR") return { type: "separator" };
      const label = extractFirstText(el);
      return {
        type: "item",
        id: el.id || "",
        label: label || el.id || "(unnamed)",
        selector: el.id ? `#${el.id}` : buildFallbackSelector(el),
        currentlyHidden: isElementHidden(el)
      };
    }
  }
];

// ── Helpers ─────────────────────────────────────────────────────────
function isElementHidden(el) {
  const style = window.getComputedStyle(el);
  return style.display === "none" || el.classList.contains("displayNone") || el.style.display === "none";
}

function buildFallbackSelector(el) {
  const parent = el.parentElement;
  if (!parent) return null;
  const index = [...parent.children].indexOf(el) + 1;
  const tag = el.tagName.toLowerCase();
  const classes = el.className ? "." + el.className.split(" ").filter(c => c).join(".") : "";
  const parentSel = parent.id ? `#${parent.id}` : parent.className ? `.${parent.className.split(" ")[0]}` : parent.tagName.toLowerCase();
  return `${parentSel} > ${tag}${classes}:nth-child(${index})`;
}

function extractFirstText(el) {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent.trim();
      if (t) return t;
    }
  }
  const h3 = el.querySelector("h3, h4, .drawer-header, .inline-drawer-toggle, b, strong");
  if (h3) return h3.textContent.trim().substring(0, 50);
  const text = el.textContent.trim();
  return text.substring(0, 60) || "";
}

function escapeCSS(sel) {
  return sel.replace(/:/g, "\\:");
}

// ── Settings ────────────────────────────────────────────────────────
function loadSettings() {
  extension_settings[STORAGE_KEY] = extension_settings[STORAGE_KEY] || {};
  Object.assign(extension_settings[STORAGE_KEY], defaultSettings, extension_settings[STORAGE_KEY]);
  settings = extension_settings[STORAGE_KEY];
}

function saveSettings() {
  extension_settings[STORAGE_KEY] = settings;
  saveSettingsDebounced();
}

// ── Scanning ────────────────────────────────────────────────────────
function scanAllPanels() {
  const results = [];
  for (const config of PANEL_CONFIGS) {
    const container = document.querySelector(config.containerSelector);
    if (!container) {
      results.push({ config, items: [], error: "panel not found" });
      continue;
    }
    const rawItems = container.querySelectorAll(config.itemSelector);
    const items = [];
    rawItems.forEach(el => {
      const info = config.getItemInfo(el);
      if (info.selector) {
        const savedHidden = settings.hiddenSelectors[info.selector];
        info.isHidden = savedHidden !== undefined ? savedHidden : info.currentlyHidden;
      }
      items.push(info);
    });
    results.push({ config, items, error: null });
  }
  return results;
}

// ── Apply hiding ────────────────────────────────────────────────────
function applyHides() {
  let styleEl = document.getElementById("menu-cleaner-styles");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "menu-cleaner-styles";
    document.head.appendChild(styleEl);
  }

  const rules = [];
  for (const [selector, hidden] of Object.entries(settings.hiddenSelectors)) {
    if (hidden) {
      rules.push(`${escapeCSS(selector)} { display: none !important; }`);
    }
  }
  styleEl.textContent = rules.join("\n");
}

// ── UI: Entry in extensionsMenu ─────────────────────────────────────
function injectMenuEntry() {
  const menu = document.querySelector("#extensionsMenu");
  if (!menu) {
    console.log("[菜单清理者] #extensionsMenu 尚未生成，500ms后重试...");
    return setTimeout(injectMenuEntry, 500);
  }

  if (document.getElementById("menu-cleaner-wand-container")) return;

  const container = document.createElement("div");
  container.id = "menu-cleaner-wand-container";
  container.className = "extension_container interactable";
  container.tabIndex = 0;
  container.innerHTML = `
    <div id="menu-cleaner-btn" class="list-group-item flex-container flexGap5 interactable" tabindex="0" role="listitem">
      <div class="fa-solid fa-broom extensionsMenuExtensionButton"></div>
      <span>菜单清理者</span>
    </div>
  `;
  menu.appendChild(container);

  container.addEventListener("click", () => openPopup());
}

// ── UI: Settings in extensions_settings ─────────────────────────────
function injectSettingsEntry() {
  const target = document.querySelector("#extensions_settings");
  if (!target) {
    console.log("[菜单清理者] #extensions_settings 尚未生成，500ms后重试...");
    return setTimeout(injectSettingsEntry, 500);
  }

  if (document.getElementById("menu-cleaner-settings")) return;

  const html = `
    <div id="menu-cleaner-settings" class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>🧹 菜单清理者</b>
        <span style="font-size:0.8em;color:var(--muted);margin-left:8px">v1.0.0</span>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down interactable"></div>
      </div>
      <div class="inline-drawer-content">
        <div style="padding:8px 0;">
          <label class="checkbox_label">
            <input id="menu-cleaner-enable" type="checkbox" ${settings.enabled ? "checked" : ""}>
            <span>启用扩展</span>
          </label>
          <p style="color:var(--muted);font-size:0.85em;margin:4px 0;">
            点击扩展菜单中的 <b>🧹 菜单清理者</b> 按钮打开操作面板，动态扫描并选择性隐藏菜单项。
          </p>
          <button id="menu-cleaner-open-popup" class="menu_button">打开操作面板</button>
        </div>
      </div>
    </div>
  `;
  target.insertAdjacentHTML("beforeend", html);

  // bind events
  const toggleEl = target.querySelector("#menu-cleaner-settings .inline-drawer-toggle");
  const contentEl = target.querySelector("#menu-cleaner-settings .inline-drawer-content");
  toggleEl?.addEventListener("click", () => {
    contentEl?.classList.toggle("closedDrawer");
  });

  document.getElementById("menu-cleaner-enable")?.addEventListener("change", (e) => {
    settings.enabled = e.target.checked;
    saveSettings();
    if (!e.target.checked) {
      clearAllHides();
    } else {
      applyHides();
    }
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
        <h2>🧹 菜单清理者</h2>
        <div class="menu-cleaner-popup-actions">
          <button id="menu-cleaner-rescan" class="menu_button">🔄 刷新扫描</button>
          <button id="menu-cleaner-close" class="menu_button">✕ 关闭</button>
        </div>
      </div>
      <div id="menu-cleaner-popup-body" class="menu-cleaner-popup-body">
        <p style="color:var(--muted);text-align:center;padding:20px;">点击「刷新扫描」读取各个按钮展开面板中的元素...</p>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", html);

  document.getElementById("menu-cleaner-close")?.addEventListener("click", closePopup);
  document.getElementById("menu-cleaner-backdrop")?.addEventListener("click", closePopup);
  document.getElementById("menu-cleaner-rescan")?.addEventListener("click", refreshPopup);
}

function openPopup() {
  if (!settings.enabled) {
    // Could show a toast, but just enable silently
  }
  createPopupDOM();
  document.getElementById("menu-cleaner-backdrop").style.display = "flex";
  document.getElementById("menu-cleaner-popup").style.display = "flex";
  refreshPopup();
}

function closePopup() {
  const backdrop = document.getElementById("menu-cleaner-backdrop");
  const popup = document.getElementById("menu-cleaner-popup");
  if (backdrop) backdrop.style.display = "none";
  if (popup) popup.style.display = "none";
}

function refreshPopup() {
  const body = document.getElementById("menu-cleaner-popup-body");
  if (!body) return;

  const scanResults = scanAllPanels();
  body.innerHTML = buildCategoryHTML(scanResults);
  bindToggleEvents();
}

// ── Build category UI ───────────────────────────────────────────────
function buildCategoryHTML(scanResults) {
  let html = "";

  for (const { config, items, error } of scanResults) {
    html += `<div class="menu-cleaner-category">`;
    html += `<div class="menu-cleaner-category-header" data-category="${config.buttonId}">
               <span class="menu-cleaner-category-arrow">▶</span>
               <strong>${config.name}</strong>
               <span class="menu-cleaner-category-count">${items.filter(i => i.type !== "separator").length} 项</span>
             </div>`;
    html += `<div class="menu-cleaner-category-body" data-category="${config.buttonId}">`;

    if (error) {
      html += `<p style="color:var(--warn);padding:8px 16px;">⚠ 面板未找到，请先点击一次对应按钮让面板生成。</p>`;
    } else if (items.length === 0) {
      html += `<p style="color:var(--muted);padding:8px 16px;">（无项目）</p>`;
    } else {
      for (const item of items) {
        if (item.type === "separator") {
          html += `<div class="menu-cleaner-item menu-cleaner-separator"><span>── 分隔线 ──</span><label class="menu-cleaner-toggle"></label></div>`;
        } else if (item.type === "empty") {
          html += `<div class="menu-cleaner-item menu-cleaner-empty" style="opacity:0.5;">
                     <span>${escHtml(item.label)}</span>
                     <span style="font-size:0.75em;color:var(--muted);">(未加载)</span>
                   </div>`;
        } else {
          const hidden = settings.hiddenSelectors[item.selector] ?? item.currentlyHidden;
          html += `<div class="menu-cleaner-item" data-selector="${escHtml(item.selector)}">
                     <span title="${escHtml(item.selector)}">${escHtml(item.label)}</span>
                     <label class="menu-cleaner-toggle">
                       <input type="checkbox" class="menu-cleaner-checkbox" data-selector="${escHtml(item.selector)}" ${hidden ? "" : "checked"}>
                       <span class="menu-cleaner-slider"></span>
                     </label>
                   </div>`;
        }
      }
    }

    html += `</div></div>`;
  }

  return html;
}

function escHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Toggle events ───────────────────────────────────────────────────
function bindToggleEvents() {
  // Category collapse/expand
  document.querySelectorAll(".menu-cleaner-category-header").forEach(header => {
    header.addEventListener("click", () => {
      const categoryId = header.dataset.category;
      const body = document.querySelector(`.menu-cleaner-category-body[data-category="${categoryId}"]`);
      const arrow = header.querySelector(".menu-cleaner-category-arrow");
      if (body) {
        body.classList.toggle("collapsed");
        arrow.textContent = body.classList.contains("collapsed") ? "▶" : "▼";
      }
    });
  });

  // Checkbox toggles
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

function clearAllHides() {
  let styleEl = document.getElementById("menu-cleaner-styles");
  if (styleEl) styleEl.textContent = "";
}

// ── Keyboard shortcut ───────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const popup = document.getElementById("menu-cleaner-popup");
      if (popup && popup.style.display !== "none") {
        closePopup();
      }
    }
  });
}

// ── Init ────────────────────────────────────────────────────────────
function init() {
  loadSettings();
  injectMenuEntry();
  injectSettingsEntry();
  setupKeyboard();

  if (settings.enabled) {
    applyHides();
  }
}

// Run when SillyTavern loads this module
init();
