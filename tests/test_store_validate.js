const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 从 content.js 中提取 Store 对象进行测试
const contentJs = fs.readFileSync(path.join(__dirname, '../主版本v2/content.js'), 'utf8');

// 构造一个隔离环境加载 Store.validate
const sandbox = {};
const fn = new Function('sandbox', `
  const defaultSettings = {
    enabled: true, hidden: {}, order: {}, column: {}, nativeColumn: {}, nativeOrder: {},
    columnMode: 'dual', subgroups: {}, excludedSelectors: [], customSelectors: [],
    groupCollapsed: {}, userDrawerCollapsed: {}, qrPanelCollapsed: false,
    enableQrFold: true, enableUserFold: true, isolateCustomCss: false,
    customFontColorEnabled: false, customFontColor: null, activeTab: 'sort'
  };
  ${contentJs.substring(contentJs.indexOf('const Store = {'), contentJs.indexOf('// ─── §3'))}
  sandbox.Store = Store;
`);
fn(sandbox);
const { Store } = sandbox;

assert.strictEqual(typeof Store.validate, 'function', 'Store.validate 应该是一个函数');

// 1. 正常配置校验
const validConfig = {
  enabled: true,
  order: { options: { '#opt1': 0 } },
  hidden: { '#opt1': true },
  column: { '#opt1': 0 },
  subgroups: { options: [{ id: 'sg1', name: '分组1', memberKeys: ['#opt1'] }] },
  customSelectors: [{ id: 'cs1', selector: '.test', label: '测试' }],
  excludedSelectors: [{ id: 'es1', selector: '.exclude', label: '排除' }],
  columnMode: 'dual'
};
assert.deepStrictEqual(Store.validate(validConfig), { valid: true }, '合法的配置对象应返回 { valid: true }');

// 2. 非对象校验
assert.strictEqual(Store.validate(null).valid, false, 'null 应校验失败');
assert.strictEqual(Store.validate([]).valid, false, '数组 应校验失败');
assert.strictEqual(Store.validate('string').valid, false, '字符串 应校验失败');

// 3. order 格式校验失败
assert.strictEqual(Store.validate({ order: 'not an object' }).valid, false, 'order 非对象应失败');
assert.strictEqual(Store.validate({ order: { options: 'not an object' } }).valid, false, 'order 组非对象应失败');

// 4. subgroups 格式校验失败
assert.strictEqual(Store.validate({ subgroups: 'not an object' }).valid, false, 'subgroups 非对象应失败');
assert.strictEqual(Store.validate({ subgroups: { options: 'not an array' } }).valid, false, 'subgroups 分组成员非数组应失败');
assert.strictEqual(Store.validate({ subgroups: { options: [{ id: '1' }] } }).valid, false, 'subgroup 缺少 name/memberKeys 应失败');

// 5. customSelectors / excludedSelectors 格式校验失败
assert.strictEqual(Store.validate({ customSelectors: 'not array' }).valid, false, 'customSelectors 非数组应失败');
assert.strictEqual(Store.validate({ customSelectors: [{ id: '1' }] }).valid, false, 'customSelectors 缺少 selector 应失败');
assert.strictEqual(Store.validate({ excludedSelectors: [{ id: '1', selector: '.a' }] }).valid, false, 'excludedSelectors 缺少 label 应失败');

// 6. columnMode 格式校验
assert.strictEqual(Store.validate({ columnMode: 'invalid' }).valid, false, '非法 columnMode 应失败');

// 7. nativeOrder / nativeColumn / groupCollapsed / userDrawerCollapsed 对象格式校验
assert.strictEqual(Store.validate({ nativeOrder: 'not an object' }).valid, false, 'nativeOrder 非对象应失败');
assert.strictEqual(Store.validate({ nativeOrder: null }).valid, false, 'nativeOrder 为 null 应失败');
assert.strictEqual(Store.validate({ nativeOrder: [] }).valid, false, 'nativeOrder 为数组应失败');
assert.strictEqual(Store.validate({ nativeOrder: { options: { '#opt1': 0 } } }).valid, true, '合法 nativeOrder 应通过');

assert.strictEqual(Store.validate({ nativeColumn: 'not an object' }).valid, false, 'nativeColumn 非对象应失败');
assert.strictEqual(Store.validate({ nativeColumn: null }).valid, false, 'nativeColumn 为 null 应失败');
assert.strictEqual(Store.validate({ nativeColumn: [] }).valid, false, 'nativeColumn 为数组应失败');
assert.strictEqual(Store.validate({ nativeColumn: { '#opt1': 0 } }).valid, true, '合法 nativeColumn 应通过');

assert.strictEqual(Store.validate({ groupCollapsed: 'not an object' }).valid, false, 'groupCollapsed 非对象应失败');
assert.strictEqual(Store.validate({ groupCollapsed: null }).valid, false, 'groupCollapsed 为 null 应失败');
assert.strictEqual(Store.validate({ groupCollapsed: [] }).valid, false, 'groupCollapsed 为数组应失败');
assert.strictEqual(Store.validate({ groupCollapsed: { options: true } }).valid, true, '合法 groupCollapsed 应通过');

assert.strictEqual(Store.validate({ userDrawerCollapsed: 'not an object' }).valid, false, 'userDrawerCollapsed 非对象应失败');
assert.strictEqual(Store.validate({ userDrawerCollapsed: null }).valid, false, 'userDrawerCollapsed 为 null 应失败');
assert.strictEqual(Store.validate({ userDrawerCollapsed: [] }).valid, false, 'userDrawerCollapsed 为数组应失败');
assert.strictEqual(Store.validate({ userDrawerCollapsed: { 'userSettings|UI主题': true } }).valid, true, '合法 userDrawerCollapsed 应通过');

console.log('Task 1 测试全部通过！');
