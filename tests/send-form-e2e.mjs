import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'dist', 'menu-cleaner.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

async function runE2ETest() {
  console.log('[E2E] 正在启动无头浏览器连接酒馆 (http://127.0.0.1:8000/) ...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#send_form', { timeout: 10000 });
    // 等待扩展系统注入扩展魔棒按钮（若已安装扩展）
    await page.waitForSelector('#extensionsMenuButton', { timeout: 5000 }).catch(() => {});
    console.log('[E2E] 酒馆页面加载成功！标题:', await page.title());

    // 注入 dist/menu-cleaner.js
    console.log('[E2E] 正在注入 dist/menu-cleaner.js ...');
    await page.evaluate((code) => {
      const s = document.createElement('script');
      s.textContent = code;
      document.head.appendChild(s);
    }, scriptContent);

    // 验证 __mc3 与 sendForm 分组
    const initData = await page.evaluate(() => {
      return {
        hasMc3: typeof window.__mc3 !== 'undefined',
        version: window.__mc3?.version,
        records: window.__mc3?.records?.sendForm?.map((r) => ({
          key: r.key,
          label: r.label,
          column: r.column,
        })),
      };
    });

    assert.equal(initData.hasMc3, true, 'window.__mc3 应已挂载');
    console.log(`[E2E] 菜单精简器已就绪，版本: ${initData.version}`);

    assert.ok(initData.records && initData.records.length >= 7, '应扫描到至少 7 个输入栏按钮');
    console.log(`[E2E] 输入框区域扫描到 ${initData.records.length} 个条目:`);
    for (const r of initData.records) {
      console.log(`      - [栏${r.column}] ${r.key}: ${r.label}`);
    }

    const optionsRec = initData.records.find((r) => r.key === '#options_button');
    assert.ok(optionsRec, '必须包含 #options_button');
    assert.equal(optionsRec.label, '左下选项菜单', 'options_button 标签应为友好中文');
    assert.equal(optionsRec.column, 0, 'options_button 应初始归属栏0');

    const sendButRec = initData.records.find((r) => r.key === '#send_but');
    assert.ok(sendButRec, '必须包含 #send_but');
    assert.equal(sendButRec.label, '发送消息', 'send_but 标签应为友好中文');
    assert.equal(sendButRec.column, 1, 'send_but 应初始归属栏1');

    // 测试弹窗 UI 渲染
    console.log('[E2E] 测试打开管理面板与双栏渲染 ...');
    const uiData = await page.evaluate(() => {
      window.__mc3.openPopup();
      // 切换到菜单排序页签
      const tabBtn = document.querySelector('.mc3-tab[data-tab="sort"]');
      if (tabBtn) tabBtn.click();

      const col0List = document.querySelector('.mc3-mes-list[data-gid="sendForm"][data-col="0"]');
      const col1List = document.querySelector('.mc3-mes-list[data-gid="sendForm"][data-col="1"]');
      return {
        hasCol0: !!col0List,
        hasCol1: !!col1List,
        col0Count: col0List?.querySelectorAll('.mc3-row')?.length,
        col1Count: col1List?.querySelectorAll('.mc3-row')?.length,
      };
    });

    assert.equal(uiData.hasCol0, true, '左栏容器应存在');
    assert.equal(uiData.hasCol1, true, '右栏容器应存在');
    assert.ok(uiData.col0Count >= 1, '左栏应至少有 1 个按钮');
    assert.ok(uiData.col1Count >= 5, '右栏应至少有 5 个按钮');
    console.log(`[E2E] 双栏卡片渲染成功！左栏条目: ${uiData.col0Count}, 右栏条目: ${uiData.col1Count}`);

    // 测试跨栏功能
    console.log('[E2E] 测试跨栏搬运: 将 #send_but 移入左栏 ...');
    const moveData = await page.evaluate(() => {
      window.__mc3.settings.column['#send_but'] = 0;
      window.__mc3.applyAll();
      const sendBut = document.querySelector('#send_but');
      return {
        parent: sendBut?.parentElement?.id,
      };
    });
    assert.equal(moveData.parent, 'leftSendForm', '#send_but 应已成功移入 leftSendForm');
    console.log('[E2E] 跨栏移动验证成功！');

    // 测试显隐功能
    console.log('[E2E] 测试显隐切换: 隐藏 #options_button ...');
    const hideData = await page.evaluate(() => {
      window.__mc3.settings.hidden['#options_button'] = true;
      window.__mc3.applyAll();
      const opt = document.querySelector('#options_button');
      return {
        hasHiddenClass: opt?.classList.contains('mc3-hidden'),
      };
    });
    assert.equal(hideData.hasHiddenClass, true, '#options_button 应带有 mc3-hidden 类');
    console.log('[E2E] 显隐功能验证成功！');

    // 测试重置功能
    console.log('[E2E] 测试恢复默认重置按钮 ...');
    const resetData = await page.evaluate(() => {
      const resetBtn = document.querySelector('[data-action="reset-sendform"]');
      if (resetBtn) resetBtn.click();
      const sendBut = document.querySelector('#send_but');
      const opt = document.querySelector('#options_button');
      return {
        sendButParent: sendBut?.parentElement?.id,
        optHidden: opt?.classList.contains('mc3-hidden'),
      };
    });
    assert.equal(resetData.sendButParent, 'rightSendForm', '重置后 send_but 应回归 rightSendForm');
    assert.equal(resetData.optHidden, false, '重置后 options_button 不应再隐藏');
    console.log('[E2E] 恢复默认重置验证成功！');

    console.log('\n[E2E] 🎉 全部端到端验收测试通过！');
  } finally {
    await browser.close();
  }
}

runE2ETest().catch((err) => {
  console.error('[E2E FAIL]', err);
  process.exit(1);
});
