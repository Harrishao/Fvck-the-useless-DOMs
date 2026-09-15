// ==UserScript==
// @name         消息操作区域测试按钮注入器 (mesButtons Test Injector)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  向酒馆消息操作栏 (.mes_buttons) 注入自定义占位测试按钮，用于测试菜单精简器等插件。
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
 *    { selectorClass: 'mes_test_btn_custom', title: '自定义按钮', iconClass: 'fa-cube', inExtra: true },
 * 
 * 2. 【删除按钮】：
 *    从数组中删除对应的对象，或直接在行首加上 `//` 注释掉该行即可。
 * 
 * 3. 【配置参数说明】：
 *    - `selectorClass`: 语义标识 class（建议唯一，避免与系统或其他扩展冲突；菜单精简器以此识别条目）
 *    - `title`        : 按钮鼠标悬停时显示的提示文本（菜单精简器以此提取中文名称）
 *    - `iconClass`    : FontAwesome 图标类名（如 'fa-flask', 'fa-star', 'fa-tag', 'fa-heart', 'fa-gear' 等）
 *    - `inExtra`      : true 表示初始置于收纳抽屉 (.extraMesButtons) 内，false 表示初始置于外显区域 (.mes_buttons 直属)
 * =========================================================================
 */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // 📋 测试按钮配置数组（直接在此处增删改即可喵~）
  // -------------------------------------------------------------------------
  const TEST_BUTTONS = [
    {
      selectorClass: 'mes_test_btn_extra',
      title: '测试按钮(默认收纳)',
      iconClass: 'fa-flask',
      inExtra: true,
    },
    {
      selectorClass: 'mes_test_btn_outer',
      title: '测试按钮(默认外显)',
      iconClass: 'fa-star',
      inExtra: false,
    },
    {
      selectorClass: 'mes_test_btn_tag',
      title: '测试按钮(占位标签)',
      iconClass: 'fa-tag',
      inExtra: true,
    },
  ];

  // -------------------------------------------------------------------------
  // ⚙️ 注入逻辑核心（支持跨 iframe 与 DOM 动态重构）
  // -------------------------------------------------------------------------
  const doc = window.frameElement ? window.parent.document : document;
  const win = window.frameElement ? window.parent : window;

  // 创建单按钮 DOM 元素
  function createMesButton(config) {
    const btn = doc.createElement('div');
    btn.className = `mes_button fa-solid ${config.iconClass} ${config.selectorClass} interactable`;
    btn.title = config.title;
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');

    // 点击占位反馈（控制台 log + Toast 提示）
    const activate = (e) => {
      if (e) e.stopPropagation();
      console.log(`[mesButtons 测试] 点击了占位按钮: ${config.title} (.${config.selectorClass})`);
      if (win.toastr && typeof win.toastr.info === 'function') {
        win.toastr.info(`点击了占位按钮：${config.title}`, 'mesButtons 测试');
      }
    };

    btn.addEventListener('click', activate);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(e);
      }
    });

    return btn;
  }

  // 向指定的 .mes_buttons 容器中注入配置的测试按钮
  function injectIntoContainer(container) {
    if (!container) return;
    const extra = container.querySelector('.extraMesButtons');

    TEST_BUTTONS.forEach((config) => {
      // 关键对账：在整个 container（含 extra 和外显）内检查，防止被菜单精简器移出后重复生成
      if (container.querySelector(`.${config.selectorClass}`)) return;

      const btn = createMesButton(config);
      if (config.inExtra && extra) {
        extra.appendChild(btn);
      } else {
        container.appendChild(btn);
      }
    });
  }

  // 扫描所有消息模板和楼层中的 .mes_buttons 容器
  function injectAll() {
    const containers = doc.querySelectorAll('#message_template .mes_buttons, #chat .mes_buttons, .mes_buttons');
    containers.forEach((container) => {
      injectIntoContainer(container);
    });
  }

  // 初始化与监听
  function init() {
    injectAll();

    // 监听 DOM 变化以应对新楼层渲染、聊天切换、swipe 切换等
    const chatObserver = new MutationObserver(() => {
      injectAll();
    });

    const targetNode = doc.querySelector('#chat') || doc.body;
    if (targetNode) {
      chatObserver.observe(targetNode, { childList: true, subtree: true });
    }

    // 额外监听 #message_template（确保模板始终带测试按钮）
    const templateNode = doc.querySelector('#message_template');
    if (templateNode) {
      const templateObserver = new MutationObserver(() => {
        injectAll();
      });
      templateObserver.observe(templateNode, { childList: true, subtree: true });
    }

    // 若页面已经运行了菜单精简器，通知其触发全量重新扫描与应用
    if (win.__mc3 && typeof win.__mc3.applyAll === 'function') {
      setTimeout(() => {
        try { win.__mc3.applyAll(); } catch (_) {}
      }, 50);
    }
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
