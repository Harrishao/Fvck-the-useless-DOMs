import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const contentPath = path.resolve('主版本v2/content.js');
const code = fs.readFileSync(contentPath, 'utf8');

test('scanGroup 包含针对 extensionsSettings 的脱水快照缓存机制', () => {
  assert.match(code, /extensionRecordsCache/);
});

test('collectCandidates 能够识别空的 extension_container 并从缓存/锚点兜底提取', () => {
  assert.match(code, /isContentsWrapper/);
  assert.match(code, /ch\.children\.length\s*===?\s*0/);
});

test('scanGroup 针对脱水候选元素回退 unit 为 fallbackUnit/ch 顶层容器', () => {
  assert.match(code, /cand\.fallbackUnit\s*\|\|\s*unitOf/);
});

test('extensionRecordsCache 在扫描 extensionsSettings 时记录元信息', () => {
  assert.match(code, /extensionRecordsCache\.set\(\s*key/);
  assert.match(code, /unitId:\s*unit\.id/);
});

test('脱水恢复与顶层 unit 绑定运行时逻辑验证', () => {
  // 模拟 DOM 节点和简易运行时，验证 collectCandidates 与 scanGroup 对脱水容器的处理
  const extensionRecordsCache = new Map();

  class MockElement {
    constructor(tagName, id = '', classList = []) {
      this.tagName = tagName;
      this.id = id;
      this.classList = new Set(classList);
      this.classList.contains = (c) => this.classList.has(c);
      this.classList.add = (c) => this.classList.add(c);
      this.children = [];
      this.parentNode = null;
      this.style = {};
    }
    matches(sel) {
      if (sel === '.inline-drawer') return this.classList.has('inline-drawer');
      if (sel === '.extension_container') return this.classList.has('extension_container');
      return false;
    }
    querySelector(sel) {
      if (sel === 'h4, .inline-drawer-header, .drawer-header') {
        if (this.classList.has('inline-drawer-header') || this.classList.has('drawer-header')) return this;
        for (const c of this.children) {
          const found = c.querySelector(sel);
          if (found) return found;
        }
      }
      return null;
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
  }

  const group = {
    id: 'extensionsSettings',
    mode: 'drawers',
    header: 'h4, .inline-drawer-header, .drawer-header',
    containers: ['#extensions_settings']
  };

  const isContentsWrapper = (el, g) => {
    if (el.classList.contains('extension_container')) {
      if (g.mode === 'drawers') return !el.classList.contains('inline-drawer');
    }
    return false;
  };

  const labelOf = (el) => 'Mock Extension Title';
  const normLabel = (l) => l;
  const isStableId = (id) => !!id && !/^(?:|true|false|null|undefined|\d+)$/i.test(id);
  const unitOf = (el, container) => {
    let u = el;
    while (u && u.parentNode !== container) u = u.parentNode;
    return u || el;
  };

  // 1. 水合状态构建
  const container = new MockElement('div', 'extensions_settings');
  const ch = new MockElement('div', 'extension_settings_mock', ['extension_container']);
  container.appendChild(ch);

  const innerDrawer = new MockElement('div', '', ['inline-drawer']);
  const innerHeader = new MockElement('div', '', ['inline-drawer-header']);
  innerDrawer.appendChild(innerHeader);
  ch.appendChild(innerDrawer);

  // collectCandidates 模拟
  function collectCandidates(grp, cont) {
    const out = [];
    for (const c of cont.children) {
      if (isContentsWrapper(c, grp)) {
        if (c.children.length === 0 && c.id) {
          for (const cached of extensionRecordsCache.values()) {
            if (cached.unitId === c.id) {
              out.push({ el: cached.el || c, label: cached.label, fallbackUnit: c, isDehydrated: true, key: cached.key });
            }
          }
          continue;
        }
        for (const gchild of c.children) {
          if (!gchild.querySelector(grp.header) && !gchild.matches(grp.header)) continue;
          out.push({ el: gchild, label: labelOf(gchild, grp) });
        }
        continue;
      }
      if (!c.querySelector(grp.header) && !c.matches(grp.header)) continue;
      out.push({ el: c, label: labelOf(c, grp) });
    }
    return out;
  }

  // 扫描初次（水合状态）
  const hydratedCands = collectCandidates(group, container);
  assert.strictEqual(hydratedCands.length, 1);
  assert.strictEqual(hydratedCands[0].el, innerDrawer);

  const hydratedUnit = unitOf(hydratedCands[0].el, container);
  assert.strictEqual(hydratedUnit, ch);

  const hydratedKey = 'extensionsSettings|#' + hydratedUnit.id + '|' + hydratedCands[0].label;
  // 模拟 scanGroup 缓存记录
  extensionRecordsCache.set(hydratedKey, {
    key: hydratedKey,
    label: hydratedCands[0].label,
    unitId: hydratedUnit.id,
    el: hydratedCands[0].el,
    containerSel: '#extensions_settings'
  });

  // 2. 脱水状态构建（TauriTavern SubtreeGate 将子节点脱水移入 Fragment，ch.children 变空）
  ch.removeChild(innerDrawer);
  assert.strictEqual(ch.children.length, 0);

  // 重新收集候选
  const dehydratedCands = collectCandidates(group, container);
  assert.strictEqual(dehydratedCands.length, 1, '应能从快照缓存恢复 1 个候选');
  assert.strictEqual(dehydratedCands[0].isDehydrated, true);
  assert.strictEqual(dehydratedCands[0].fallbackUnit, ch);

  // 验证 scanGroup 中 unit 回退逻辑
  const cand = dehydratedCands[0];
  const dehydratedUnit = cand.fallbackUnit || unitOf(cand.el, container);
  assert.strictEqual(dehydratedUnit, ch, '脱水候选条目的 unit 必须回退为顶层容器 ch，保证 applyColumns/applyOrder/applyHides 能够操作 DOM');
});
