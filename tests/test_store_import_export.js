const assert = require('assert');
const fs = require('fs');
const path = require('path');

const contentJs = fs.readFileSync(path.join(__dirname, '../主版本v2/content.js'), 'utf8');

// 模拟运行上下文
const mockWin = {
  document: {
    createElement: (tag) => ({
      tagName: tag,
      style: {},
      click() { this.clicked = true; }
    }),
    body: {
      appendChild: () => {},
      removeChild: () => {}
    }
  },
  URL: {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {}
  }
};

const sandbox = { win: mockWin, doc: mockWin.document, saved: false, applied: false, rendered: false };
const fn = new Function('sandbox', `
  const win = sandbox.win;
  const doc = sandbox.doc;
  const ManagedDom = {
    toggle: (el, cls, on) => {
      if (sandbox.ManagedDom && sandbox.ManagedDom.toggle) {
        return sandbox.ManagedDom.toggle(el, cls, on);
      }
      if (el && el.classList) el.classList.toggle(cls, !!on);
    }
  };
  const isValidCssSelector = (sel) => {
    if (sandbox.isValidCssSelector) return sandbox.isValidCssSelector(sel);
    return typeof sel === 'string' && sel.length > 0;
  };
  const isSelf = (el) => {
    if (sandbox.isSelf) return sandbox.isSelf(el);
    return false;
  };
  const GROUPS = [{ id: 'options' }];
  const SUBGROUP_GROUP_IDS = ['options'];
  const getUserSettingsGroups = () => [];
  const getUserDrawerKey = (def) => 'userSettings|' + def.label;
  const saveSettings = () => { sandbox.saved = true; };
  const applyAll = () => { sandbox.applied = true; };
  const renderPopup = () => { sandbox.rendered = true; };

  const defaultSettings = {
    enabled: true, hidden: {}, order: {}, column: {}, nativeColumn: {}, nativeOrder: {},
    columnMode: 'dual', subgroups: {}, excludedSelectors: [], customSelectors: [],
    groupCollapsed: {}, userDrawerCollapsed: {}, qrPanelCollapsed: false,
    enableQrFold: true, enableUserFold: true, isolateCustomCss: false,
    customFontColorEnabled: false, customFontColor: null, activeTab: 'sort'
  };
  let settings = JSON.parse(JSON.stringify(defaultSettings));

  ${contentJs.substring(contentJs.indexOf('const Store = {'), contentJs.indexOf('const saveSettings'))}

  sandbox.Store = Store;
  sandbox.getSettings = () => settings;
  sandbox.setSettings = (s) => { settings = s; };
`);
fn(sandbox);
const { Store, getSettings, setSettings } = sandbox;

assert.strictEqual(typeof Store.exportJSON, 'function', 'Store.exportJSON 应该存在');
assert.strictEqual(typeof Store.importJSON, 'function', 'Store.importJSON 应该存在');

// 1. 导出测试
const exportedStr = Store.exportJSON({ returnString: true });
assert.strictEqual(typeof exportedStr, 'string', 'exportJSON 在 returnString 时应返回字符串');
const parsedExport = JSON.parse(exportedStr);
assert.strictEqual(parsedExport.enabled, true);

// 2. 覆盖导入测试（验证覆盖而非合并）
setSettings({
  enabled: true,
  hidden: { '#old_item': true },
  customSelectors: [{ id: 'old_cs', selector: '.old', label: '旧规则' }],
  activeTab: 'settings'
});

const newConfigToImport = JSON.stringify({
  enabled: false,
  hidden: { '#new_item': true },
  customSelectors: [{ id: 'new_cs', selector: '.new', label: '新规则' }],
  activeTab: 'sort' // 导入数据虽然是 sort，但应保留当前用户界面的 settings 页签
});

Store.importJSON(newConfigToImport);
const current = getSettings();

// 验证完全覆盖
assert.strictEqual(current.enabled, false, 'enabled 应该被覆盖为 false');
assert.strictEqual(current.hidden['#old_item'], undefined, '旧的 hidden 规则必须被彻底覆盖清除');
assert.strictEqual(current.hidden['#new_item'], true, '新的 hidden 规则应该生效');
assert.strictEqual(current.customSelectors.length, 1, '旧 customSelectors 必须被覆盖');
assert.strictEqual(current.customSelectors[0].id, 'new_cs');
assert.strictEqual(current.activeTab, 'settings', '当前用户的 activeTab 应保留维持');

// 3. 非法 JSON 导入报错测试
assert.throws(() => Store.importJSON('{ broken json'), /JSON 解析失败/);
assert.throws(() => Store.importJSON('[]'), /必须为一个 JSON 对象/);

// 4. 回调函数触发验证
assert.strictEqual(sandbox.saved, true, '导入后应调用 saveSettings');
assert.strictEqual(sandbox.applied, true, '导入后应调用 applyAll');
assert.strictEqual(sandbox.rendered, true, '导入后应调用 renderPopup');

// 5. win.__mc3 暴露接口与功能验证
assert.ok(contentJs.includes('exportConfig: (opts) => Store.exportJSON(opts)'), 'win.__mc3 应包含 exportConfig');
assert.ok(contentJs.includes('importConfig: (jsonOrObj) =>'), 'win.__mc3 应包含 importConfig');
assert.ok(contentJs.includes('validateConfig: (obj) => Store.validate(obj)'), 'win.__mc3 应包含 validateConfig');

// 模拟 win.__mc3 绑定
mockWin.__mc3 = {
  settings: getSettings(),
  exportConfig: (opts) => Store.exportJSON(opts),
  importConfig: (jsonOrObj) => {
    const text = typeof jsonOrObj === 'string' ? jsonOrObj : JSON.stringify(jsonOrObj);
    return Store.importJSON(text);
  },
  validateConfig: (obj) => Store.validate(obj),
};

// 验证 win.__mc3.exportConfig
const mc3Export = mockWin.__mc3.exportConfig({ returnString: true });
assert.strictEqual(typeof mc3Export, 'string');

// 验证 win.__mc3.validateConfig
assert.strictEqual(mockWin.__mc3.validateConfig({ enabled: true }).valid, true);
assert.strictEqual(mockWin.__mc3.validateConfig(null).valid, false);

// 验证 win.__mc3.importConfig 接收对象并同步 win.__mc3.settings
const objConfig = {
  enabled: true,
  columnMode: 'single',
  hidden: { '#mc3_imported': true }
};
const importRes = mockWin.__mc3.importConfig(objConfig);
assert.strictEqual(importRes.success, true);
assert.strictEqual(mockWin.__mc3.settings.columnMode, 'single');
assert.strictEqual(mockWin.__mc3.settings.hidden['#mc3_imported'], true);
assert.strictEqual(getSettings().columnMode, 'single');

// 6. 导出文件触发验证 (无 returnString 参数时触发下载)
let downloadClicked = false;
let appendedElement = null;
mockWin.document.createElement = (tag) => {
  const el = {
    tagName: tag,
    style: {},
    click() { downloadClicked = true; }
  };
  return el;
};
mockWin.document.body.appendChild = (el) => { appendedElement = el; };
mockWin.document.body.removeChild = (el) => {
  assert.strictEqual(el, appendedElement);
  appendedElement = null;
};

Store.exportJSON();
assert.strictEqual(downloadClicked, true, '无 returnString 时应触发模拟下载点击');

// 7. 旧 customSelectors 清理验证（防止旧规则在 DOM 中残留）
const oldDomElement = {
  classList: {
    classes: new Set(['mc3-hidden']),
    contains(cls) { return this.classes.has(cls); },
    remove(cls) { this.classes.delete(cls); },
    toggle(cls, on) { if (on) this.classes.add(cls); else this.classes.delete(cls); }
  }
};
let managedDomToggled = false;
sandbox.ManagedDom = {
  toggle: (el, cls, on) => {
    managedDomToggled = true;
    el.classList.toggle(cls, on);
  }
};
sandbox.doc.querySelectorAll = (selector) => {
  if (selector === '.old-remnant') {
    return [oldDomElement];
  }
  return [];
};
setSettings({
  enabled: true,
  customSelectors: [{ id: 'cs_old_remnant', selector: '.old-remnant', label: '残留选择器' }],
  hidden: { cs_old_remnant: true },
  activeTab: 'settings'
});

assert.strictEqual(oldDomElement.classList.contains('mc3-hidden'), true, '导入前元素包含 mc3-hidden');

Store.importJSON(JSON.stringify({
  enabled: true,
  customSelectors: [{ id: 'cs_new', selector: '.new-rule', label: '新规则' }],
}));

assert.strictEqual(oldDomElement.classList.contains('mc3-hidden'), false, '导入后旧选择器对应元素的 mc3-hidden 必须被清除');
assert.strictEqual(managedDomToggled, true, '应通过 ManagedDom.toggle 移除 mc3-hidden');

// 8. 原子化设置替换验证 (导入失败时不破坏原 settings)
const originalSettings = {
  enabled: true,
  hidden: { '#protected_item': true },
  customSelectors: [{ id: 'cs_stay', selector: '.stay', label: '保留' }],
  activeTab: 'settings'
};
setSettings(JSON.parse(JSON.stringify(originalSettings)));

// 8.1 格式校验失败时，原 settings 不变
assert.throws(() => Store.importJSON(JSON.stringify({ order: 'invalid-non-object' })), /order 字段格式不正确/);
assert.deepStrictEqual(getSettings().hidden, originalSettings.hidden, '校验失败时 hidden 不应被修改');
assert.strictEqual(getSettings().customSelectors[0].id, 'cs_stay', '校验失败时 customSelectors 不应被修改');

// 8.2 JSON 解析失败时，原 settings 不变
assert.throws(() => Store.importJSON('{ invalid-json-syntax }'), /JSON 解析失败/);
assert.deepStrictEqual(getSettings().hidden, originalSettings.hidden, 'JSON 解析失败时 hidden 不应被修改');

// 8.3 normalize 抛出异常时，原 settings 不变且不触发旧 customSelectors 清理
let unapplyAttemptedOnNormalizeFail = false;
sandbox.doc.querySelectorAll = (selector) => {
  unapplyAttemptedOnNormalizeFail = true;
  return [];
};
const realNormalize = Store.normalize;
Store.normalize = () => { throw new Error('normalize 模拟异常'); };
assert.throws(() => Store.importJSON(JSON.stringify({ enabled: false })), /normalize 模拟异常/);
assert.strictEqual(getSettings().enabled, true, 'normalize 异常时 settings 不应被替换');
assert.strictEqual(unapplyAttemptedOnNormalizeFail, false, 'normalize 异常时不应执行旧选择器清理');
Store.normalize = realNormalize;

console.log('Task 2 测试全部通过！');
