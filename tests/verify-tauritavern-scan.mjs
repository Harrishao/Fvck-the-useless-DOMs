import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

async function main() {
  console.log(`${BOLD}${CYAN}====================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  TauriTavern 2.3.0 E2E CDP 集成验收测试套件        ${RESET}`);
  console.log(`${BOLD}${CYAN}====================================================${RESET}\n`);

  const cdpUrl = process.env.CDP_URL || 'http://127.0.0.1:9222';
  console.log(`[连接] 正在连接 CDP 调试端口: ${cdpUrl} ...`);

  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl);
  } catch (err) {
    console.error(`${RED}[ERROR] 无法连接到 CDP 端口 ${cdpUrl}，请确保 TauriTavern 2.3.0 带有 --remote-debugging-port 启动。${RESET}`);
    throw err;
  }

  try {
    // 查找 TauriTavern 页面
    let page = null;
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const url = p.url();
        if (url.includes(':1430') || url.includes('localhost') || url.includes('127.0.0.1')) {
          page = p;
          break;
        }
      }
      if (page) break;
    }
    if (!page) {
      page = browser.contexts()[0]?.pages()[0];
    }
    if (!page) {
      throw new Error('未找到可用的 TauriTavern 目标页面');
    }

    const pageUrl = page.url();
    const pageTitle = await page.title();
    console.log(`[目标] 成功锁定页面: ${pageTitle} (${pageUrl})\n`);

    // 关闭任何可能阻挡视口的弹窗 (如初始化欢迎框)
    await page.evaluate(() => {
      const okBtns = Array.from(document.querySelectorAll('dialog[open] button, dialog[open] .menu_button'))
        .filter(b => b.innerText?.includes('确定') || b.innerText?.includes('OK'));
      for (const btn of okBtns) btn.click();
    });
    await page.waitForTimeout(300);

    // 注入最新的 content.js
    const contentJsPath = path.resolve('主版本v2/content.js');
    console.log(`[注入] 正在将最新代码注入目标页面 (${contentJsPath}) ...`);
    const contentCode = fs.readFileSync(contentJsPath, 'utf8');
    await page.evaluate((src) => {
      const script = document.createElement('script');
      script.textContent = src;
      document.head.appendChild(script);
      script.remove();
    }, contentCode);

    const mc3Version = await page.evaluate(() => window.__mc3?.version);
    console.log(`[注入] 插件运行时就绪，版本标识: ${BOLD}${mc3Version}${RESET}\n`);

    // 初始状态重置: 关闭弹窗与抽屉
    await page.evaluate(() => {
      if (window.__mc3) window.__mc3.closePopup();
      const extBlock = document.querySelector('#rm_extensions_block');
      if (extBlock && extBlock.classList.contains('openDrawer')) {
        const toggle = document.querySelector('#extensions-settings-button .drawer-toggle') || document.querySelector('#extensions-settings-button');
        if (toggle) toggle.click();
      }
    });
    await page.waitForTimeout(400);

    let passedTests = 0;
    const totalTests = 5;

    // ─── 测试项 1: 冷启动常态扫描 ──────────────────────────────────────────
    {
      console.log(`${BOLD}测试项 1: 冷启动常态扫描 (抽屉关闭时)${RESET}`);
      const scanInfo = await page.evaluate(() => {
        const extBlock = document.querySelector('#rm_extensions_block');
        const isClosed = !extBlock || !extBlock.classList.contains('openDrawer');
        const group = window.__mc3.getGroup('extensionsSettings');
        const records = window.__mc3.scanGroup(group);

        const versionRecord = records.find(r => r.key === '#tauritavern_version_settings' || r.unit?.id === 'tauritavern_version_container');
        const migrationRecord = records.find(r => r.key === '#data_migration_settings' || r.unit?.id === 'data_migration_container');

        return {
          isClosed,
          count: records.length,
          hasVersion: !!versionRecord,
          versionKey: versionRecord?.key,
          versionLabel: versionRecord?.label,
          hasMigration: !!migrationRecord,
          migrationKey: migrationRecord?.key,
          migrationLabel: migrationRecord?.label,
        };
      });

      console.log(`  抽屉状态: ${scanInfo.isClosed ? '已关闭 (冷启动状态)' : '未关闭'}`);
      console.log(`  扫描条目总数: ${scanInfo.count} 项`);
      console.log(`  TauriTavern 版本: ${scanInfo.hasVersion ? `${GREEN}找到 (${scanInfo.versionLabel})${RESET}` : `${RED}未找到${RESET}`}`);
      console.log(`  数据迁移: ${scanInfo.hasMigration ? `${GREEN}找到 (${scanInfo.migrationLabel})${RESET}` : `${RED}未找到${RESET}`}`);

      assert.ok(scanInfo.isClosed, '测试项 1 预期在抽屉收起状态下执行');
      assert.ok(scanInfo.count >= 10, `扫描到的扩展条目数应当 >= 10，实际为 ${scanInfo.count}`);
      assert.ok(scanInfo.hasVersion, '必须扫描到 #tauritavern_version_settings');
      assert.ok(scanInfo.hasMigration, '必须扫描到 #data_migration_settings');

      console.log(`${GREEN}${BOLD}✔ [PASS] 测试项 1: 冷启动常态扫描验证通过${RESET}\n`);
      passedTests++;
    }

    // ─── 测试项 2: 操作弹窗完整展示 ────────────────────────────────────────
    {
      console.log(`${BOLD}测试项 2: 操作弹窗完整展示 (openPopup)${RESET}`);
      const popupInfo = await page.evaluate(async () => {
        window.__mc3.openPopup();
        await new Promise(r => setTimeout(r, 200));

        const popup = document.querySelector('#mc3-popup');
        if (!popup) return { popupFound: false };

        const rows = Array.from(popup.querySelectorAll('.mc3-row')).map(r => r.innerText.trim());
        const versionRow = rows.find(r => r.includes('TauriTavern 版本'));
        const migrationRow = rows.find(r => r.includes('数据迁移'));

        return {
          popupFound: true,
          rowCount: rows.length,
          hasVersionRow: !!versionRow,
          versionRowText: versionRow,
          hasMigrationRow: !!migrationRow,
          migrationRowText: migrationRow,
        };
      });

      console.log(`  弹窗 DOM (#mc3-popup): ${popupInfo.popupFound ? '已挂载' : '未找到'}`);
      console.log(`  列表渲染行数: ${popupInfo.rowCount} 行`);
      console.log(`  "TauriTavern 版本" 行: ${popupInfo.hasVersionRow ? `${GREEN}存在${RESET}` : `${RED}缺失${RESET}`}`);
      console.log(`  "数据迁移" 行: ${popupInfo.hasMigrationRow ? `${GREEN}存在${RESET}` : `${RED}缺失${RESET}`}`);

      assert.ok(popupInfo.popupFound, '调用 openPopup() 后 #mc3-popup 必须存在');
      assert.ok(popupInfo.hasVersionRow, '弹窗中必须渲染 "TauriTavern 版本" 行');
      assert.ok(popupInfo.hasMigrationRow, '弹窗中必须渲染 "数据迁移" 行');

      console.log(`${GREEN}${BOLD}✔ [PASS] 测试项 2: 操作弹窗完整展示验证通过${RESET}\n`);
      passedTests++;
    }

    // ─── 测试项 3: 分栏移动与脱水适配 ──────────────────────────────────────
    {
      console.log(`${BOLD}测试项 3: 分栏移动与脱水适配 (移动至右栏 extensions_settings2)${RESET}`);
      const colResult = await page.evaluate(() => {
        // 先确保切至 column 0，再切至 column 1，完整验证 DOM 节点在分栏容器间迁移
        window.__mc3.settings.column['#tauritavern_version_settings'] = 0;
        window.__mc3.applyAll();
        const container = document.querySelector('#tauritavern_version_container');
        const intermediateParent = container ? container.parentNode.id : null;

        // 切换到 column 1 (右栏)
        window.__mc3.settings.column['#tauritavern_version_settings'] = 1;
        window.__mc3.applyAll();

        const finalParent = container ? container.parentNode.id : null;
        const col1 = document.querySelector('#extensions_settings2');
        const inCol1 = col1 && container ? col1.contains(container) : false;

        return {
          intermediateParent,
          finalParent,
          inCol1,
        };
      });

      console.log(`  中间父容器 (Column 0): #${colResult.intermediateParent}`);
      console.log(`  最终父容器 (Column 1): #${colResult.finalParent}`);
      console.log(`  挂载容器是否位于 #extensions_settings2: ${colResult.inCol1 ? `${GREEN}是${RESET}` : `${RED}否${RESET}`}`);

      assert.strictEqual(colResult.intermediateParent, 'extensions_settings', '切到 Column 0 时必须挂载到 #extensions_settings');
      assert.strictEqual(colResult.finalParent, 'extensions_settings2', '切到 Column 1 时必须挂载到 #extensions_settings2');
      assert.ok(colResult.inCol1, '#tauritavern_version_container 必须真实存在于 #extensions_settings2 内部');

      console.log(`${GREEN}${BOLD}✔ [PASS] 测试项 3: 分栏移动与脱水适配验证通过${RESET}\n`);
      passedTests++;
    }

    // ─── 测试项 4: 抽屉展开与闭合水合 ──────────────────────────────────────
    {
      console.log(`${BOLD}测试项 4: 抽屉展开与闭合水合 (点击 #extensions-settings-button .drawer-toggle)${RESET}`);

      // 先关闭遮罩弹窗避免截获点击
      await page.evaluate(() => window.__mc3.closePopup());
      await page.waitForTimeout(200);

      // 点击展开抽屉
      console.log('  点击展开抽屉按钮...');
      await page.click('#extensions-settings-button .drawer-toggle');
      await page.waitForTimeout(600);

      const openState = await page.evaluate(() => {
        const extBlock = document.querySelector('#rm_extensions_block');
        const container = document.querySelector('#tauritavern_version_container');
        const child = document.querySelector('#tauritavern_version_settings');
        const col1 = document.querySelector('#extensions_settings2');

        return {
          isOpen: extBlock ? extBlock.classList.contains('openDrawer') : false,
          inCol1: col1 && container ? col1.contains(container) : false,
          hasChild: !!child,
          childInContainer: container && child ? container.contains(child) : false,
          childCount: container ? container.children.length : 0,
        };
      });

      console.log(`  抽屉展开状态: ${openState.isOpen ? '已展开 (openDrawer)' : '未展开'}`);
      console.log(`  容器仍处于右栏: ${openState.inCol1 ? '是' : '否'}`);
      console.log(`  容器子元素计数: ${openState.childCount}`);
      console.log(`  子元素 #tauritavern_version_settings 水合状态: ${openState.childInContainer ? `${GREEN}成功水合到容器内${RESET}` : `${RED}未水合${RESET}`}`);

      assert.ok(openState.isOpen, '抽屉必须成功展开 (包含 openDrawer 类)');
      assert.ok(openState.inCol1, '水合时容器必须依然保持在右栏 #extensions_settings2');
      assert.ok(openState.childInContainer, '展开抽屉后 #tauritavern_version_settings 必须正确水合为容器子节点');

      // 再次点击关闭抽屉
      console.log('  再次点击关闭抽屉按钮...');
      await page.click('#extensions-settings-button .drawer-toggle');
      await page.waitForTimeout(600);

      const closeState = await page.evaluate(() => {
        const extBlock = document.querySelector('#rm_extensions_block');
        return {
          isOpen: extBlock ? extBlock.classList.contains('openDrawer') : false,
        };
      });

      console.log(`  抽屉闭合状态: ${!closeState.isOpen ? '已闭合' : '未闭合'}`);
      assert.strictEqual(closeState.isOpen, false, '再次点击后抽屉必须成功闭合');

      console.log(`${GREEN}${BOLD}✔ [PASS] 测试项 4: 抽屉展开与闭合水合验证通过${RESET}\n`);
      passedTests++;
    }

    // ─── 测试项 5: 显隐切换 ────────────────────────────────────────────────
    {
      console.log(`${BOLD}测试项 5: 显隐切换与状态重置${RESET}`);
      const hideResult = await page.evaluate(() => {
        // 设置隐藏
        window.__mc3.settings.hidden['#tauritavern_version_settings'] = true;
        window.__mc3.applyAll();

        const container = document.querySelector('#tauritavern_version_container');
        const hasHiddenClass = container ? container.classList.contains('mc3-hidden') : false;

        // 清理与复原测试状态
        delete window.__mc3.settings.hidden['#tauritavern_version_settings'];
        delete window.__mc3.settings.column['#tauritavern_version_settings'];
        window.__mc3.save();
        window.__mc3.applyAll();
        window.__mc3.closePopup();

        const isRestored = container ? !container.classList.contains('mc3-hidden') : false;

        return {
          hasHiddenClass,
          isRestored,
        };
      });

      console.log(`  设置隐藏后容器是否获得 mc3-hidden 类: ${hideResult.hasHiddenClass ? `${GREEN}是${RESET}` : `${RED}否${RESET}`}`);
      console.log(`  测试结束清理后容器是否恢复正常显示: ${hideResult.isRestored ? `${GREEN}是${RESET}` : `${RED}否${RESET}`}`);

      assert.ok(hideResult.hasHiddenClass, '设置隐藏后容器必须包含 mc3-hidden 样式类');
      assert.ok(hideResult.isRestored, '清理后容器必须移除 mc3-hidden 类');

      console.log(`${GREEN}${BOLD}✔ [PASS] 测试项 5: 显隐切换验证通过${RESET}\n`);
      passedTests++;
    }

    // ─── 测试汇总报告 ──────────────────────────────────────────────────────
    console.log(`${BOLD}${GREEN}====================================================${RESET}`);
    console.log(`${BOLD}${GREEN}  全部 ${passedTests}/${totalTests} 项 E2E 验证测试全部通过 (ALL PASS)   ${RESET}`);
    console.log(`${BOLD}${GREEN}====================================================${RESET}`);

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch((err) => {
  console.error(`\n${RED}${BOLD}✖ [FAIL] E2E 集成测试未通过: ${err.message}${RESET}`);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
