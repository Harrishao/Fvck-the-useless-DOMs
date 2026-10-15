import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const contentPath = path.resolve('主版本v2/content.js');
const code = fs.readFileSync(contentPath, 'utf8');

test('content.js 包含 ensureExtensionsHydrated 水合同步函数', () => {
  assert.match(code, /function ensureExtensionsHydrated\s*\(/);
});

test('ensureExtensionsHydrated 能安全识别 __TAURITAVERN_PANEL_RUNTIME__ 并调用 setVisible/reconcile', () => {
  assert.match(code, /__TAURITAVERN_PANEL_RUNTIME__/);
  assert.match(code, /tt:gate:rm_extensions_block:extension_containers/);
});

test('openPopup 与 scanGroup 在执行时调用了 ensureExtensionsHydrated', () => {
  assert.match(code, /function openPopup[\s\S]*?ensureExtensionsHydrated\(\)/);
  assert.match(code, /function scanGroup[\s\S]*?extensionsSettings[\s\S]*?ensureExtensionsHydrated\(\)/);
});

test('ensureExtensionsHydrated 运行时行为测试（挂载与未挂载 PanelRuntime）', () => {
  // 提取 ensureExtensionsHydrated 的源码在沙箱环境中验证
  const fnMatch = code.match(/function ensureExtensionsHydrated\s*\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(fnMatch, '应能匹配到 ensureExtensionsHydrated 函数定义');

  const fnSource = fnMatch[0];

  // 1. 未挂载 __TAURITAVERN_PANEL_RUNTIME__（如纯网页版 SillyTavern）
  {
    const sandbox = {
      win: {},
      console: { warn: () => {} }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${fnSource}; result = ensureExtensionsHydrated();`, sandbox);
    assert.strictEqual(sandbox.result, false, '未挂载 PanelRuntime 时应返回 false 且不报错');
  }

  // 2. 正常挂载 TauriTavern 2.3.0 SubtreeGate
  {
    const calls = [];
    const sandbox = {
      win: {
        __TAURITAVERN_PANEL_RUNTIME__: {
          setVisible: (id, visible) => { calls.push(['setVisible', id, visible]); },
          reconcile: () => { calls.push(['reconcile']); }
        }
      },
      console: { warn: () => {} }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${fnSource}; result = ensureExtensionsHydrated();`, sandbox);
    assert.strictEqual(sandbox.result, true, '正常水合应返回 true');
    assert.deepStrictEqual(calls, [
      ['setVisible', 'tt:gate:rm_extensions_block:extension_containers', true],
      ['reconcile']
    ], '应按顺序调用 setVisible 与 reconcile');
  }

  // 3. 异常防御性测试（如 reconcile 抛出异常）
  {
    let warned = false;
    const sandbox = {
      win: {
        __TAURITAVERN_PANEL_RUNTIME__: {
          setVisible: () => {},
          reconcile: () => { throw new Error('reconcile failed'); }
        }
      },
      console: { warn: () => { warned = true; } }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${fnSource}; result = ensureExtensionsHydrated();`, sandbox);
    assert.strictEqual(sandbox.result, false, '抛出异常时应被捕获并返回 false');
    assert.strictEqual(warned, true, '应打印 warning 日志');
  }
});
