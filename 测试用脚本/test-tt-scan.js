// 测试 TauriTavern v2.3.0 注入元素识别及生命周期监听
const assert = require('assert');

// 简易 DOM 模拟
class MockElement {
  constructor(tag, id = '', className = '') {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = className;
    this.children = [];
    this.childNodes = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = {};
    this.classList = {
      contains: (c) => this.className.split(/\s+/).filter(Boolean).includes(c),
      add: (c) => { if (!this.classList.contains(c)) this.className = (this.className + ' ' + c).trim(); },
      remove: (c) => { this.className = this.className.split(/\s+/).filter(x => x && x !== c).join(' '); },
      toggle: (c, val) => { if (val) this.classList.add(c); else this.classList.remove(c); }
    };
  }
  getAttribute(name) { return this.attributes[name] || null; }
  setAttribute(name, val) { this.attributes[name] = val; }
  hasAttribute(name) { return name in this.attributes; }
  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    this.childNodes.push(node);
    if (this.ownerDoc) this.ownerDoc._notifyMutation(this, [node], []);
  }
  prepend(node) {
    node.parentNode = this;
    this.children.unshift(node);
    this.childNodes.unshift(node);
    if (this.ownerDoc) this.ownerDoc._notifyMutation(this, [node], []);
  }
  replaceChildren(...nodes) {
    const oldNodes = this.children.slice();
    this.children = [];
    this.childNodes = [];
    nodes.forEach(n => {
      n.parentNode = this;
      this.children.push(n);
      this.childNodes.push(n);
    });
    if (this.ownerDoc) this.ownerDoc._notifyMutation(this, nodes, oldNodes);
  }
  matches(sel) {
    if (!sel) return false;
    const parts = sel.split(/([.#][\w-]+)/).filter(Boolean);
    for (const part of parts) {
      if (part.startsWith('.')) {
        if (!this.classList.contains(part.slice(1))) return false;
      } else if (part.startsWith('#')) {
        if (this.id !== part.slice(1)) return false;
      } else if (/^[A-Za-z]+$/.test(part)) {
        if (this.tagName.toLowerCase() !== part.toLowerCase()) return false;
      }
    }
    return true;
  }
  querySelector(sel) {
    for (const child of this.children) {
      if (child.matches && child.matches(sel)) return child;
      const found = child.querySelector ? child.querySelector(sel) : null;
      if (found) return found;
    }
    return null;
  }
  querySelectorAll(sel) {
    let res = [];
    for (const child of this.children) {
      if (child.matches && child.matches(sel)) res.push(child);
      if (child.querySelectorAll) res.push(...child.querySelectorAll(sel));
    }
    return res;
  }
  get textContent() {
    let txt = '';
    for (const n of this.childNodes) {
      if (n.nodeType === 3) txt += n.textContent;
      else if (n.nodeType === 1) txt += n.textContent;
    }
    return txt;
  }
  set textContent(val) {
    this.children = [];
    this.childNodes = [{ nodeType: 3, textContent: String(val) }];
  }
}

class MockDocument extends MockElement {
  constructor() {
    super('html');
    this.observers = [];
    this.ownerDoc = this;
    this.documentElement = this;
    this.head = new MockElement('head');
    this.body = new MockElement('body');
    this.head.ownerDoc = this;
    this.body.ownerDoc = this;
    this.appendChild(this.head);
    this.appendChild(this.body);
  }
  createElement(tag) {
    const el = new MockElement(tag);
    el.ownerDoc = this;
    return el;
  }
  getElementById(id) {
    return this.querySelector('#' + id);
  }
  _notifyMutation(target, added, removed) {
    for (const obs of this.observers) {
      obs._check(target, added, removed);
    }
  }
}

class MockMutationObserver {
  constructor(cb) {
    this.cb = cb;
    this.targets = [];
  }
  observe(target, options) {
    this.targets.push({ target, options });
    if (target.ownerDoc && !target.ownerDoc.observers.includes(this)) {
      target.ownerDoc.observers.push(this);
    }
  }
  disconnect() {
    this.targets = [];
  }
  _check(target, added, removed) {
    for (const { target: watched, options } of this.targets) {
      let match = false;
      if (watched === target) match = true;
      else if (options.subtree) {
        let p = target;
        while (p) {
          if (p === watched) { match = true; break; }
          p = p.parentNode;
        }
      }
      if (match) {
        this.cb([{ target, addedNodes: added, removedNodes: removed }]);
        return;
      }
    }
  }
}

console.log('--- Test 1: Simulating TauriTavern extensionsMenu shortcuts ---');
const doc = new MockDocument();
const win = { MutationObserver: MockMutationObserver, setTimeout: (fn, d) => setTimeout(fn, d), clearTimeout: (t) => clearTimeout(t) };

// Test candidate collection & wrapper penetration
function isContentsWrapper(el, group) {
  if (el.classList.contains('extension_container')) {
    if (group.mode === 'listItems') return !el.matches(group.itemMatch);
    if (group.mode === 'drawers') return !el.classList.contains('inline-drawer');
    return false;
  }
  if (group.mode === 'listItems' && !el.matches(group.itemMatch) && el.querySelector(group.itemMatch)) {
    return true;
  }
  if (group.mode === 'drawers' && !el.classList.contains('inline-drawer') && el.querySelector(group.header)) {
    return true;
  }
  return false;
}

function looksLikeButton(el, matchSel) {
  if (matchSel && el.matches(matchSel)) return true;
  return !!el.querySelector('span');
}

function labelOf(el) {
  const sp = el.querySelector('span');
  return sp ? sp.textContent.trim() : '';
}

const groupWand = {
  id: 'extensionsMenu',
  mode: 'listItems',
  itemMatch: '.list-group-item',
  label: 'span'
};

// Create extensionsMenu
const menu = doc.createElement('div');
menu.id = 'extensionsMenu';
menu.className = 'options-content';
doc.body.appendChild(menu);

// TauriTavern creates shortcuts container
const ttShortcutsContainer = doc.createElement('div');
ttShortcutsContainer.id = 'tauritavern_extensions_menu_shortcuts';
ttShortcutsContainer.className = 'extension_container';
menu.prepend(ttShortcutsContainer);

// Add shortcuts
const shortcuts = [
  { id: 'sync', label: '同步面板' },
  { id: 'frontend-logs', label: '前端日志' },
  { id: 'backend-logs', label: '后端日志' },
  { id: 'llm-api-logs', label: 'LLM API 日志' },
  { id: 'reload-frontend', label: '重新加载前端' },
];

const items = shortcuts.map(sc => {
  const item = doc.createElement('div');
  item.id = `tauritavern_shortcut_${sc.id}`;
  item.className = 'list-group-item flex-container flexGap5';
  const sp = doc.createElement('span');
  sp.textContent = sc.label;
  item.appendChild(sp);
  return item;
});

ttShortcutsContainer.replaceChildren(...items);

// Scan items
const out = [];
const scanItemNode = (node) => {
  if (!node) return;
  if (isContentsWrapper(node, groupWand)) {
    for (const sub of node.children) scanItemNode(sub);
  } else if (looksLikeButton(node, groupWand.itemMatch)) {
    out.push({ el: node, label: labelOf(node) });
  }
};
for (const c of menu.children) scanItemNode(c);

console.log('Discovered items count:', out.length);
assert.strictEqual(out.length, 5);
assert.strictEqual(out[0].el.id, 'tauritavern_shortcut_sync');
assert.strictEqual(out[0].label, '同步面板');
assert.strictEqual(out[4].el.id, 'tauritavern_shortcut_reload-frontend');
assert.strictEqual(out[4].label, '重新加载前端');
console.log('PASS: Discovered all TauriTavern shortcuts accurately!');

console.log('\n--- Test 2: Lifecycle & Dynamic MutationObserver on doc.body ---');
const doc2 = new MockDocument();
let appliedCount = 0;
let observedContainers = new Set();
let mainObserver = null;

const GROUPS = [
  { id: 'extensionsMenu', containers: ['#extensionsMenu'], mode: 'listItems', itemMatch: '.list-group-item' },
  { id: 'extensionsSettings', containers: ['#extensions_settings', '#extensions_settings2'], mode: 'drawers', header: '.inline-drawer-header' }
];

function ensureContainersObserved() {
  if (!mainObserver) return;
  for (const g of GROUPS) {
    for (const sel of g.containers) {
      const el = doc2.querySelector(sel);
      if (el && !observedContainers.has(el)) {
        observedContainers.add(el);
        mainObserver.observe(el, { childList: true, subtree: true });
      }
    }
  }
}

function applyAll() {
  ensureContainersObserved();
  appliedCount++;
}

mainObserver = new MockMutationObserver((muts) => {
  for (const m of muts) {
    if (m.addedNodes.length || m.removedNodes.length) {
      applyAll();
      return;
    }
  }
});

// Setup body observer for top-level mounts
const bodyObs = new MockMutationObserver((muts) => {
  for (const m of muts) {
    if (m.addedNodes.length || m.removedNodes.length) {
      ensureContainersObserved();
      applyAll();
      return;
    }
  }
});
bodyObs.observe(doc2.body, { childList: true });

// Initial run at page load (extensionsMenu NOT yet in DOM)
ensureContainersObserved();
applyAll();
assert.strictEqual(appliedCount, 1);
assert.strictEqual(observedContainers.has(doc2.querySelector('#extensionsMenu')), false);

// Now SillyTavern appends #extensionsMenu to body later
const lateMenu = doc2.createElement('div');
lateMenu.id = 'extensionsMenu';
lateMenu.className = 'options-content';
doc2.body.appendChild(lateMenu);

// bodyObs should have triggered ensureContainersObserved and applyAll!
assert.strictEqual(appliedCount, 2);
assert.strictEqual(observedContainers.has(lateMenu), true);
console.log('PASS: Late-mounted #extensionsMenu automatically observed by mainObserver!');

// Now TauriTavern injects shortcuts
const lateShortcuts = doc2.createElement('div');
lateShortcuts.id = 'tauritavern_extensions_menu_shortcuts';
lateShortcuts.className = 'extension_container';
lateMenu.prepend(lateShortcuts);

// mainObserver on #extensionsMenu should have caught this!
assert.strictEqual(appliedCount, 3);
console.log('PASS: Shortcuts container insertion caught by mainObserver!');

// TauriTavern replaces children with shortcut items
lateShortcuts.replaceChildren(...items);
assert.strictEqual(appliedCount, 4);
console.log('PASS: Shortcut items replaceChildren caught by mainObserver!');

console.log('\n--- Test 3: Drawer candidates in extensions_settings2 (MCP Manager & Skill Manager) ---');
const extCol2 = doc2.createElement('div');
extCol2.id = 'extensions_settings2';
doc2.body.appendChild(extCol2);

// MCP Manager (React 18 section inside extension_container)
const mcpContainer = doc2.createElement('div');
mcpContainer.id = 'mcp_manager_container';
mcpContainer.className = 'extension_container';
extCol2.appendChild(mcpContainer);

const mcpSection = doc2.createElement('section');
mcpSection.id = 'mcp_manager_settings';
mcpSection.className = 'tt-mcp-root';
mcpContainer.appendChild(mcpSection);

const mcpDrawer = doc2.createElement('div');
mcpDrawer.className = 'inline-drawer';
mcpSection.appendChild(mcpDrawer);

const mcpHeader = doc2.createElement('div');
mcpHeader.className = 'inline-drawer-toggle inline-drawer-header tt-mcp-drawer-header';
mcpDrawer.appendChild(mcpHeader);

const mcpTitle = doc2.createElement('span');
mcpTitle.className = 'tt-mcp-title';
const mcpB = doc2.createElement('b');
mcpB.textContent = 'MCP';
mcpTitle.appendChild(mcpB);
mcpHeader.appendChild(mcpTitle);

// Skill Manager (React 18 mount inside skill_manager_container)
const skillContainer = doc2.createElement('div');
skillContainer.id = 'skill_manager_container';
skillContainer.className = 'extension_container';
extCol2.appendChild(skillContainer);

const skillMount = doc2.createElement('div');
skillMount.id = 'skill_manager_settings_mount';
skillContainer.appendChild(skillMount);

const skillSection = doc2.createElement('div');
skillSection.id = 'skill_manager_settings';
skillSection.className = 'ttas-root ttas-skill-manager-settings';
skillMount.appendChild(skillSection);

const skillDrawer = doc2.createElement('div');
skillDrawer.className = 'inline-drawer';
skillSection.appendChild(skillDrawer);

const skillHeader = doc2.createElement('div');
skillHeader.className = 'inline-drawer-toggle inline-drawer-header';
const skillB = doc2.createElement('b');
skillB.textContent = '技能 (Skill)';
skillHeader.appendChild(skillB);
skillDrawer.appendChild(skillHeader);

// Collect drawer candidates
const groupDrawers = {
  id: 'extensionsSettings',
  mode: 'drawers',
  header: '.inline-drawer-header'
};

const drawerOut = [];
for (const ch of extCol2.children) {
  if (isContentsWrapper(ch, groupDrawers)) {
    for (const gchild of ch.children) {
      if (!gchild.querySelector(groupDrawers.header) && !gchild.matches(groupDrawers.header)) continue;
      drawerOut.push({ el: gchild, label: gchild.querySelector('b') ? gchild.querySelector('b').textContent : '' });
    }
  }
}

console.log('Discovered drawers count:', drawerOut.length);
assert.strictEqual(drawerOut.length, 2);
assert.strictEqual(drawerOut[0].el.id, 'mcp_manager_settings');
assert.strictEqual(drawerOut[0].label, 'MCP');
assert.strictEqual(drawerOut[1].el.id, 'skill_manager_settings_mount');
assert.strictEqual(drawerOut[1].label, '技能 (Skill)');
console.log('PASS: Both MCP Manager and Skill Manager identified correctly!');

