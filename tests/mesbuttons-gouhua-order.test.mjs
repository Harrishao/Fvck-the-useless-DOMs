import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const contentPath = path.resolve('主版本v2/content.js');
const code = fs.readFileSync(contentPath, 'utf8');

test('scanMesButtons 标签遇到未映射选择器回退至选择器名称', () => {
  assert.match(code, /const lbl = MES_BUTTON_DEFAULT_LABELS\[sel\] \|\| sel\.replace\(\/\^\[\.#\]\/, ''\);/);
});

test('scanMesButtons 补全已知持久化但瞬时缺席的虚拟记录', () => {
  assert.match(code, /const savedOrder = settings\.order && settings\.order\[group\.id\];/);
  assert.match(code, /if \(!sel \|\| !isValidCssSelector\(sel\)\) continue;/);
  assert.match(code, /records\.push\(\{[\s\S]*?key,[\s\S]*?selector:\s*sel,[\s\S]*?el:\s*null/);
});

test('setupObserver 支持 getCtx().eventSource 并监听楼层渲染/更新事件', () => {
  assert.match(code, /getCtx\(\)\?\.eventSource|const ctx = getCtx\(\);[\s\S]*?\(ctx && ctx\.eventSource\)/);
  assert.match(code, /event_types\.CHARACTER_MESSAGE_RENDERED[\s\S]*?onFloorRendered/);
  assert.match(code, /event_types\.USER_MESSAGE_RENDERED[\s\S]*?onFloorRendered/);
  assert.match(code, /event_types\.MESSAGE_SWIPED[\s\S]*?onFloorRendered/);
  assert.match(code, /event_types\.MESSAGE_UPDATED[\s\S]*?onFloorRendered/);
});

test('setupObserver 捕获 extraMesButtonsHint 点击并即时同步', () => {
  assert.match(code, /e\.target\.closest\('\.extraMesButtonsHint'\)[\s\S]*?applyAll\(\)/);
});

test('scheduleApply 保证防抖调度不被 suppressObserver 早期吞没', () => {
  // scheduleApply 入口不直接 return
  const fnMatch = code.match(/function scheduleApply\(\)\s*\{([\s\S]*?applyTimer = win\.setTimeout)/);
  assert.ok(fnMatch, 'scheduleApply function found');
  assert.doesNotMatch(fnMatch[1], /if\s*\(suppressObserver\)\s*return;/, 'scheduleApply 不应因 suppressObserver 直接丢弃调度');
});
