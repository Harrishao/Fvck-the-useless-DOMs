import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const STORAGE_KEY = "menu_cleaner";
const MC_ATTR = "data-mc-id";

const defaultSettings = {
  enabled: true,
  hiddenSelectors: {}  // { "[data-mc-id=\"xxx\"]": true, "#someId": true, ... }
};

let settings = {};

// ── Panel scanner configs ───────────────────────────────────────────
const PANEL_CONFIGS = [
  {
    buttonId: "#options_button",
    name: "选项菜单",
    panelPrefix: "opt",
    containers: [
      { selector: "#options .options-content", itemSelector: ":scope > *" }
    ],
    extractItems(el, _containerIdx) {
      if (el.tagName === "HR") return [{ type: "separator" }];
      const span = el.querySelector("span");
      const label = span?.textContent?.trim() || el.textContent?.trim() || "(unnamed)";
      const nativeId = el.id || "";
      return [{
        type: "item",
        nativeId,
        label,
        element: el,
        currentlyHidden: isElementHidden(el)
      }];
    }
  },
  {
    buttonId: "#extensionsMenuButton",
    name: "扩展菜单",
    panelPrefix: "extm",
    containers: [
      // Match .extension_container AND [id$=_wand_container] to catch all container patterns.
      // Also match plain divs that contain .list-group-item children.
      { selector: "#extensionsMenu", itemSelector: ":scope > .extension_container, :scope > [id$='_wand_container']" }
    ],
    extractItems(container, _containerIdx) {
      const results = [];
      // Get ALL .list-group-item children
      const listItems = container.querySelectorAll(":scope > .list-group-item");
      listItems.forEach(li => {
        const span = li.querySelector("span");
        const label = span?.textContent?.trim() || li.textContent?.replace(/\s+/g, " ").trim() || "";
        results.push({
          type: "item",
          nativeId: li.id || container.id || "",
          label: label || container.id?.replace(/_wand_container$/, "").replace(/_/g, " ") || "(unnamed)",
          element: li,
          currentlyHidden: isElementHidden(li)
        });
      });
      // Scan recursively for wand-buttons that may be nested inside wrappers
      const customBtns = container.querySelectorAll("[id$='-wand-button'], [id*='wand-button']");
      customBtns.forEach(btn => {
        if (btn.classList.contains("list-group-item")) return;
        // Only pick up direct wand buttons, not ones already inside a captured .list-group-item
        if (btn.closest(".list-group-item")) return;
        results.push({
          type: "item",
          nativeId: btn.id || "",
          label: btn.textContent?.trim() || btn.id || "(custom button)",
          element: btn,
          currentlyHidden: isElementHidden(btn)
        });
      });
      // Also scan top-level items that are direct children of #extensionsMenu but not .extension_container
      // (e.g., plain div containers added by other extensions)
      if (results.length === 0 && !container.classList.contains("extension_container")) {
        // This might be a plain div container — check its direct children
        const directItems = container.querySelectorAll(":scope > .list-group-item, :scope > [id$='-wand-button']");
        directItems.forEach(item => {
          const span = item.querySelector("span");
          const label = span?.textContent?.trim() || item.textContent?.replace(/\s+/g, " ").trim() || "";
          results.push({
            type: "item",
            nativeId: item.id || "",
            label: label || item.id || "(unnamed)",
            element: item,
            currentlyHidden: isElementHidden(item)
          });
        });
      }
      // If no items found at all, mark as empty
      if (results.length === 0) {
        results.push({
          type: "empty",
          nativeId: container.id || "",
          label: container.id?.replace(/_wand_container$/, "").replace(/_/g, " ") || "(empty slot)",
          element: container,
          currentlyHidden: false
        });
      }
      return results;
    }
  },
  {
    buttonId: "#extensions-settings-button",
    name: "扩展设置",
    panelPrefix: "exts",
    containers: [
      { selector: "#extensions_settings", itemSelector: ":scope > *" },
      { selector: "#extensions_settings2", itemSelector: ":scope > *" }
    ],
    extractItems(el, _containerIdx) {
      if (el.tagName === "HR") return [{ type: "separator" }];
      // Some items are containers with nested children (e.g. #translation_container > div)
      // Check if this element has sub-items that should be scanned individually
      const nestedItems = el.querySelectorAll(":scope > .list-group-item, :scope > [id$='-wand-button']");
      if (nestedItems.length > 0) {
        const results = [];
        nestedItems.forEach(child => {
          const label = extractLabel(child);
          results.push({
            type: "item",
            nativeId: child.id || "",
            label: label || "(unnamed)",
            element: child,
            currentlyHidden: isElementHidden(child)
          });
        });
        return results;
      }
      const label = extractLabel(el);
      return [{
        type: "item",
        nativeId: el.id || "",
        label,
        element: el,
        currentlyHidden: isElementHidden(el)
      }];
    }
  },
  {
    buttonId: "#sys-settings-button",
    name: "系统设置",
    panelPrefix: "sys",
    containers: [
      { selector: "#top-settings-holder", itemSelector: ":scope > *" }
    ],
    extractItems(el, _containerIdx) {
      if (el.tagName === "HR") return [{ type: "separator" }];
      const label = extractLabel(el);
      return [{
        type: "item",
        nativeId: el.id || "",
        label,
        element: el,
        currentlyHidden: isElementHidden(el)
      }];
    }
  }
];

// ── Helpers ─────────────────────────────────────────────────────────
function isElementHidden(el) {
  const style = window.getComputedStyle(el);
  return style.display === "none" || el.classList.contains("displayNone") || el.style.display === "none";
}

function extractLabel(el) {
  // Try text nodes directly
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent.trim();
      if (t && t.length < 80) return t;
    }
  }
  // Try headings
  const heading = el.querySelector("h3, h4, .drawer-header, .inline-drawer-toggle, b, strong, [data-i18n]");
  if (heading) {
    const t = heading.textContent.trim();
    if (t && t.length < 80) return t;
  }
  // Fallback: first meaningful text
  const text = el.textContent.trim().replace(/\s+/g, " ");
  if (text.length <= 60) return text;
  return text.substring(0, 60) + "...";
}

function sanitizeForId(str) {
  // Generate a stable, CSS-safe identifier from label text
  return str
    .replace(/[^a-zA-Z0-9一-鿿㐀-䶿_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 40);
}

// ── mc-id system ────────────────────────────────────────────────────
function generateMcId(panelPrefix, label, seenLabels) {
  const base = sanitizeForId(label) || "unnamed";
  let key = base;
  let counter = 1;
  while (seenLabels.has(key)) {
    counter++;
    key = `${base}_${counter}`;
  }
  seenLabels.add(key);
  return `mc-${panelPrefix}-${key}`;
}

function mcSelector(mcId) {
  return `[${MC_ATTR}="${mcId}"]`;
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
    const allItems = [];
    const seenLabels = new Set();
    let anyContainerFound = false;

    for (let ci = 0; ci < config.containers.length; ci++) {
      const containerDef = config.containers[ci];
      const container = document.querySelector(containerDef.selector);
      if (!container) continue;
      anyContainerFound = true;

      const rawElements = container.querySelectorAll(containerDef.itemSelector);
      rawElements.forEach(el => {
        const extracted = config.extractItems(el, ci);
        extracted.forEach(item => {
          if (item.type === "separator") {
            allItems.push(item);
          } else if (item.type === "item" || item.type === "empty") {
            // Generate mc-id and tag the element
            const mcId = generateMcId(config.panelPrefix, item.label, seenLabels);
            item.mcId = mcId;
            item.selector = mcSelector(mcId);
            if (item.element) {
              item.element.setAttribute(MC_ATTR, mcId);
            }
            // Merge with saved settings
            const savedHidden = settings.hiddenSelectors[item.selector];
            item.isHidden = savedHidden !== undefined ? savedHidden : item.currentlyHidden;
            allItems.push(item);
          }
        });
      });
    }

    results.push({
      config,
      items: allItems,
      error: anyContainerFound ? null : "panel not found"
    });
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
      rules.push(`${selector} { display: none !important; }`);
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
  createPopupDOM();
  document.getElementById("menu-cleaner-backdrop").style.display = "block";
  document.getElementById("menu-cleaner-popup").style.display = "flex";
  refreshPopup();
  positionPopup();
}

function positionPopup() {
  const popup = document.getElementById("menu-cleaner-popup");
  if (!popup) return;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const popupHeight = popup.scrollHeight;
  const margin = Math.max(20, vh * 0.05);
  const availableHeight = vh - margin * 2;

  if (popupHeight > availableHeight) {
    popup.style.top = margin + "px";
    popup.style.transform = "translate(-50%, 0)";
    popup.style.maxHeight = availableHeight + "px";
  } else {
    popup.style.top = "50%";
    popup.style.transform = "translate(-50%, -50%)";
    popup.style.maxHeight = "85vh";
  }
  popup.style.maxWidth = Math.min(560, vw - 20) + "px";
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
  positionPopup();
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
          html += `<div class="menu-cleaner-item menu-cleaner-separator"><span>── 分隔线 ──</span><span></span></div>`;
        } else if (item.type === "empty") {
          html += `<div class="menu-cleaner-item menu-cleaner-empty" style="opacity:0.5;">
                     <span>${escHtml(item.label)}</span>
                     <span style="font-size:0.75em;color:var(--muted);">(扩展未安装)</span>
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
  const styleEl = document.getElementById("menu-cleaner-styles");
  if (styleEl) styleEl.textContent = "";
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

// ── Panel button hooks ──────────────────────────────────────────────
// When user clicks a panel button, the panel may be created/revealed.
// We re-scan to tag new elements with data-mc-id, then re-apply hides.
function hookPanelButtons() {
  for (const config of PANEL_CONFIGS) {
    const btn = document.querySelector(config.buttonId);
    if (!btn || btn._mcHooked) continue;
    btn._mcHooked = true;
    btn.addEventListener("click", () => {
      setTimeout(() => {
        if (!settings.enabled) return;
        scanAllPanels();
        applyHides();
      }, 350);
    });
  }
}

// ── MutationObserver ────────────────────────────────────────────────
// Watches for panel containers being added to the DOM so we can tag
// them with data-mc-id and re-apply hiding rules.
let _observer = null;
function setupObserver() {
  if (_observer) return;
  _observer = new MutationObserver((mutations) => {
    let shouldRefresh = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        // Check if any added node is or contains one of our panel containers
        for (const config of PANEL_CONFIGS) {
          for (const cdef of config.containers) {
            if (node.matches?.(cdef.selector) || node.querySelector?.(cdef.selector)) {
              shouldRefresh = true;
              break;
            }
          }
          if (shouldRefresh) break;
        }
        if (shouldRefresh) break;
      }
      if (shouldRefresh) break;
    }
    if (shouldRefresh && settings.enabled) {
      setTimeout(() => {
        scanAllPanels();
        applyHides();
      }, 400);
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });
}

// ── Init ────────────────────────────────────────────────────────────
function init() {
  loadSettings();
  injectMenuEntry();
  injectSettingsEntry();
  setupKeyboard();
  setupObserver();

  // Retry hooking panel buttons if they don't exist yet at init time
  let hookAttempts = 0;
  function tryHook() {
    hookPanelButtons();
    const allHooked = PANEL_CONFIGS.every(c => document.querySelector(c.buttonId)?._mcHooked);
    if (!allHooked && hookAttempts < 10) {
      hookAttempts++;
      setTimeout(tryHook, 800);
    }
  }

  if (settings.enabled) {
    setTimeout(() => {
      tryHook();
      scanAllPanels();
      applyHides();
    }, 1500);
  } else {
    setTimeout(tryHook, 2000);
  }
}

init();
