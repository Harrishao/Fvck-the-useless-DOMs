const assert = require('assert');
const fs = require('fs');
const path = require('path');

const contentJs = fs.readFileSync(path.join(__dirname, '../主版本v2/content.js'), 'utf8');

// 1. 验证 POPUP_CSS 包含 .mc3-btn
assert(contentJs.includes('.mc3-btn{'), 'POPUP_CSS 应包含 .mc3-btn 样式');

// 2. 验证 renderSettingsPanel 包含配置备份与迁移行及按钮
assert(contentJs.includes('data-action="export-config"'), 'renderSettingsPanel 应包含 export-config 按钮');
assert(contentJs.includes('data-action="import-config"'), 'renderSettingsPanel 应包含 import-config 按钮');
assert(contentJs.includes('配置备份与迁移'), 'renderSettingsPanel 应包含“配置备份与迁移”文案');

// 3. 验证 ACTIONS 包含对应事件处理
assert(contentJs.includes("'export-config':"), "ACTIONS 应注册 'export-config' 处理函数");
assert(contentJs.includes("'import-config':"), "ACTIONS 应注册 'import-config' 处理函数");

console.log('Task 3 静态结构测试全部通过！');
