// ==UserScript==
// @name         QR 面板测试按钮注入器 (QR Panel Test Injector)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  向酒馆 QR 面板 (#qr--bar) 注入自定义占位测试按钮，用于测试菜单精简器等插件。
// @author       Catgirl Assistant
// @match        *://*/*
// @grant        none
// ==UserScript==

/*
 * =========================================================================
 * 🛠️ 增删与修改测试按钮的方法说明 (How to Add/Remove Test Buttons):
 * 
 * 1. 【增加按钮】：
 *    在下方的 `TEST_BUTTONS` 数组中添加一个新对象：
 *    { id: 'qr-test-custom', label: '自定义按钮', icon: '⚡' },
 * 
 * 2. 【删除按钮】：
 *    从数组中删除对应的对象，或直接在行首加上 `//` 注释掉该行即可。
 * 
 * 3. 【配置参数说明】：
 *    - `id`    : 按钮在 DOM 中的唯一 ID（建议保持唯一，便于菜单精简器绑定识别）
 *    - `label` : 按钮上显示的文字
 *    - `icon`  : 按钮前的图标或 Emoji（选填，写 '' 则不显示图标）
 * =========================================================================
 */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // 📋 测试按钮配置数组（直接在此处增删改即可喵~）
  // -------------------------------------------------------------------------
  const TEST_BUTTONS = [
    { id: 'qr-test-btn-1', label: '测试按钮 1', icon: '🧪' },
    { id: 'qr-test-btn-2', label: '测试按钮 2', icon: '⭐' },
    { id: 'qr-test-btn-3', label: '占位功能 A', icon: '📌' },
    { id: 'qr-test-btn-4', label: '占位功能 B', icon: '🚀' },
    { id: 'qr-test-btn-5', label: '长文本测试条目', icon: '📝' },
  ];

  // -------------------------------------------------------------------------
  // ⚙️ 注入逻辑核心（支持跨 iframe 与 DOM 动态重构）
  // -------------------------------------------------------------------------
  const doc = window.frameElement ? window.parent.document : document;

  // 创建单按钮 DOM 元素
  function createQrButton(config) {
    const btn = doc.createElement('div');
    btn.id = config.id;
    btn.className = 'qr--button menu_button interactable';
    btn.title = config.label;
    btn.style.userSelect = 'none';

    let innerHTML = '';
    if (config.icon) {
      innerHTML += `<span class="qr--button-icon" style="margin-right: 4px;">${config.icon}</span>`;
    }
    innerHTML += `<span class="qr--button-label">${config.label}</span>`;
    btn.innerHTML = innerHTML;

    // 点击占位反馈（会在控制台打印 log）
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log(`[QR 测试按钮] 点击了占位按钮: ${config.label} (#${config.id})`);
    });

    return btn;
  }

  // 执行按钮注入
  function injectButtons() {
    const bar = doc.querySelector('#qr--bar');
    if (!bar) return;

    TEST_BUTTONS.forEach((config) => {
      // 检查避免重复注入
      if (doc.getElementById(config.id)) return;
      const btn = createQrButton(config);
      bar.appendChild(btn);
    });
  }

  // 初始化与变化监听
  function init() {
    injectButtons();

    // 监听 DOM 变化以应对酒馆界面重新渲染或切换
    const observer = new MutationObserver(() => {
      injectButtons();
    });

    const targetNode = doc.querySelector('#qr--bar') || doc.body;
    if (targetNode) {
      observer.observe(targetNode, { childList: true, subtree: true });
    }
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();