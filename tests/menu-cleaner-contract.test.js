const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(__dirname, '..', '主版本', 'content.js');
const source = fs.readFileSync(sourcePath, 'utf8');

test('调试版本标识已更新为 M12', () => {
  assert.match(source, /version:\s*'M12'/);
});

test('用户设置以五个 curated 条目纳入管理范围', () => {
  assert.match(source, /id:\s*'userSettings'[\s\S]*?button:\s*'#user-settings-button'[\s\S]*?observe:\s*\['#user-settings-block'\]/);
  for (const label of ['UI主题', '角色处理', '杂项', '聊天/消息处理', 'ST Script设置']) {
    assert.match(source, new RegExp(`label:\\s*'${label}'`));
  }
  assert.match(source, /'#UI-Theme-Block'/);
  assert.match(source, /'#UI-Customization > div:nth-child\(1\)'/);
  assert.match(source, /'#UI-Customization > div:nth-child\(2\)'/);
  assert.match(source, /'#power-user-option-checkboxes > div:nth-child\(1\)'/);
  assert.match(source, /'#power-user-option-checkboxes > div\.inline-drawer\.wide100p\.flexFlowColumn'/);
  assert.match(source, /'#power-user-option-checkboxes > div:nth-child\(3\)'/);

  const definitions = source.slice(
    source.indexOf('const USER_SETTINGS_GROUPS'),
    source.indexOf('const CURATED_GROUPS'),
  );
  const chatDefinition = definitions.slice(
    definitions.indexOf("label: '聊天/消息处理'"),
    definitions.indexOf("label: 'ST Script设置'"),
  );
  assert.doesNotMatch(chatDefinition, /div:nth-child\(3\)/, 'ST Script 不应再属于聊天/消息处理');
});

test('实际用户设置使用原位伪抽屉，状态持久化且缺省全部收起', () => {
  assert.match(source, /userDrawerCollapsed:\s*\{\}/);
  assert.match(source, /settings\.userDrawerCollapsed\[getUserDrawerKey\(USER_SETTINGS_GROUPS\[u\]\)\]\s*===\s*undefined[\s\S]*?=\s*true/);
  assert.match(source, /function applyUserSettingsDrawers\(/);
  assert.match(source, /mc3-user-drawer-arrow/);
  assert.match(source, /drawerHeader:\s*'#UI-presets-block > h4'/);
  assert.match(source, /drawerTargets:/);
  assert.match(source, /saveSettings\(\);[\s\S]*?applyUserSettingsDrawers\(\)/);
});

test('UI主题三角退出原生 space-between 布局，标题保持左对齐', () => {
  assert.match(source, /#UI-presets-block > h4\.mc3-user-drawer-header\{position:relative;\}/);
  assert.match(source, /#UI-presets-block > h4\.mc3-user-drawer-header > button\.mc3-user-drawer-arrow\{position:absolute;left:5px;top:50%;transform:translateY\(-50%\);\}/);
  assert.match(source, /#UI-presets-block > h4\.mc3-user-drawer-header > span:first-of-type\{padding-left:18px;\}/);
});

test('用户设置三角仅在状态真正变化时改写 DOM', () => {
  assert.match(source, /if \(!header\.classList\.contains\('mc3-user-drawer-header'\)\) header\.classList\.add\('mc3-user-drawer-header'\)/);
  assert.match(source, /if \(header\.getAttribute\('aria-expanded'\) !== expanded\) header\.setAttribute\('aria-expanded', expanded\)/);
  assert.match(source, /if \(arrow\.textContent !== arrowText\) arrow\.textContent = arrowText/);
  assert.match(source, /if \(arrow\.getAttribute\('aria-label'\) !== arrowLabel\) arrow\.setAttribute\('aria-label', arrowLabel\)/);
  assert.doesNotMatch(source, /^\s*arrow\.textContent = collapsed \?/m);
});

test('父分组折叠状态持久化且缺省为收起', () => {
  assert.match(source, /groupCollapsed:\s*\{\}/);
  assert.match(source, /settings\.groupCollapsed\[GROUPS\[g\]\.id\]\s*===\s*undefined[\s\S]*?=\s*true/);
  assert.match(source, /data-action="toggle-group"/);
  assert.match(source, /mc3-card-collapse[\s\S]*?mc3-card-title/);
});

test('管理面板子分组三角位于标题左侧', () => {
  const start = source.indexOf('function renderSubgroupHeader');
  const end = source.indexOf('// 渲染单行条目', start);
  assert.ok(start !== -1 && end > start, '应存在 renderSubgroupHeader');
  const renderHeader = source.slice(start, end);
  assert.ok(
    renderHeader.indexOf('mc3-subgroup-collapse') < renderHeader.indexOf('mc3-subgroup-name'),
    '子分组三角应先于标题输出',
  );
});

test('管理面板父分组和子分组标题均可点击折叠', () => {
  assert.match(source, /class="mc3-card-title"\s+data-action="toggle-group"\s+data-gid="/);
  assert.match(source, /class="mc3-subgroup-name"\s+data-action="toggle-subgroup"\s+data-sgid="/);
});

test('空子分组的顶层拖拽位置会被单独保存并参与重绘', () => {
  assert.match(source, /popupPosition:\s*0/);
  assert.match(source, /function persistSubgroupPositions\(list, groupId\)/);
  assert.match(source, /sg\.popupPosition\s*=\s*position/);
  assert.match(source, /function insertEmptySubgroupUnits\(/);
  assert.match(source, /persistSubgroupPositions\(list, dragMeta\.gid\)[\s\S]*?commitReorder\(dragMeta\.gid, orderedKeys\)/);
});

test('左下菜单、魔棒和扩展面板使用原地伪抽屉', () => {
  assert.match(source, /function applyPseudoSubgroups\(/);
  assert.match(source, /mc3-native-subgroup-header/);
  assert.match(source, /setAttribute\('data-action', 'toggle-native-subgroup'\)/);
  assert.match(source, /return group\.id === 'options' \|\| group\.id === 'extensionsMenu' \|\| group\.id === 'extensionsSettings'/);
});

test('扩展面板子分组成员的栏位由子分组统一控制', () => {
  assert.match(source, /keyToSgCol\[sgList\[si\]\.memberKeys\[mi\]\]\s*=\s*sgCol/);
  assert.match(source, /target\s*=\s*single\s*\?\s*0\s*:\s*keyToSgCol\[r\.key\]/);
  assert.match(source, /group\.id === 'extensionsSettings' && !inSubgroup/);
  assert.match(source, /data-action="toggle-sg-col"/);
});

test('扩展面板使用随分组栏位迁移的原地伪抽屉', () => {
  assert.match(source, /function supportsPseudoSubgroups\(group\)/);
  assert.match(source, /group\.id === 'extensionsSettings'/);
  assert.match(source, /var hasPseudoHeaders = supportsPseudoSubgroups\(group\)/);
  assert.match(source, /var targetColumn = settings\.columnMode === 'single' \? 0 : \(sg\.column === 1 \? 1 : 0\)/);
  assert.match(source, /targetContainer = doc\.querySelector\(group\.containers\[targetColumn\]\)/);
  assert.match(source, /if \(header\.parentNode !== targetContainer\) targetContainer\.appendChild\(header\)/);
  assert.match(source, /if \(!supportsPseudoSubgroups\(group\)\) return false/);
  assert.doesNotMatch(source, /group\.id !== 'options' && group\.id !== 'extensionsMenu'\) return false/);
});

test('自定义选择器支持数据模型、展开卡片内添加与独立删除', () => {
  assert.match(source, /customSelectors:\s*\[\]/);
  assert.match(source, /settings\.groupCollapsed\['customSelectors'\]\s*===\s*undefined/);
  assert.match(source, /function addCustomSelector\(/);
  assert.match(source, /function deleteCustomSelector\(/);
  assert.match(source, /function applyCustomSelectors\(/);
  assert.match(source, /data-action="add-custom-selector"/);
  assert.match(source, /data-action="delete-custom-selector"/);
  assert.match(source, /data-action="toggle-custom-hide"/);
  assert.match(source, /data-gid="customSelectors"/);
  assert.match(source, /id="mc3-custom-selector-input"/);
});

test('长选择器采用显示头尾、省略中部的截断展示结构', () => {
  assert.match(source, /function renderSelectorLabelHtml\(/);
  assert.match(source, /mc3-mid-truncate/);
  assert.match(source, /mc3-mid-start/);
  assert.match(source, /mc3-mid-end/);
});


