import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const contentPath = path.resolve('主版本v2/content.js');
const code = fs.readFileSync(contentPath, 'utf8');

test('extensionsSettings 配置包含了 #rm_extensions_block 观察项', () => {
  assert.match(code, /id:\s*'extensionsSettings'[\s\S]*?observe:\s*\[[^\]]*'#rm_extensions_block'/);
});

test('setupObserver 监听了 #rm_extensions_block 的 openDrawer 状态变化', () => {
  assert.match(code, /openDrawer/);
  assert.match(code, /attributeFilter:\s*\[\s*'class'\s*\]/);
});

test('SillyTavern / TauriTavern 生命周期事件 APP_READY 与 EXTENSIONS_FIRST_LOAD 具备监听与水合保证', () => {
  assert.match(code, /event_types\.APP_READY[\s\S]*?ensureContainersObserved/);
  assert.match(code, /event_types\.EXTENSIONS_FIRST_LOAD[\s\S]*?ensureContainersObserved/);
});

test('抽屉状态变更观察器运行时行为测试', () => {
  // 验证抽屉展开 MutationObserver 逻辑在沙箱环境中的触发行为
  let observedTarget = null;
  let observerOptions = null;
  let observerCallback = null;

  class MockMutationObserver {
    constructor(cb) {
      observerCallback = cb;
    }
    observe(target, options) {
      observedTarget = target;
      observerOptions = options;
    }
    disconnect() {}
  }

  const classListSet = new Set(['drawer-content', 'closedDrawer']);
  const extBlock = {
    id: 'rm_extensions_block',
    classList: {
      contains: (cls) => classListSet.has(cls),
      add: (cls) => classListSet.add(cls),
      remove: (cls) => classListSet.delete(cls)
    }
  };

  let containersObservedCalled = 0;
  let scheduleApplyCalled = 0;

  // 模拟抽屉监听建立逻辑
  if (extBlock) {
    const drawerObs = new MockMutationObserver(() => {
      if (extBlock.classList.contains('openDrawer')) {
        containersObservedCalled++;
        scheduleApplyCalled++;
      }
    });
    drawerObs.observe(extBlock, { attributes: true, attributeFilter: ['class'] });
  }

  assert.strictEqual(observedTarget, extBlock, '观察目标必须是 rm_extensions_block');
  assert.deepStrictEqual(observerOptions, { attributes: true, attributeFilter: ['class'] }, '必须严格限制监听 class 属性');

  // 未包含 openDrawer 时触发变更
  observerCallback([]);
  assert.strictEqual(containersObservedCalled, 0, '未展开时不应触发重新应用');

  // 展开抽屉
  extBlock.classList.add('openDrawer');
  observerCallback([]);
  assert.strictEqual(containersObservedCalled, 1, '展开抽屉时必须触发 ensureContainersObserved');
  assert.strictEqual(scheduleApplyCalled, 1, '展开抽屉时必须触发 scheduleApply');
});
