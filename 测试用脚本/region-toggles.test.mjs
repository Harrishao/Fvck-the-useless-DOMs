import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, '主版本v2', 'content.js'), 'utf8');
let browser;
before(async () => { browser = await chromium.launch({ channel: 'msedge', headless: true }); });
after(async () => { await browser?.close(); });
const markup = `<!doctype html><html><head><style>
body { margin:0; background:#202020; color:#eee; font:14px sans-serif; }
#options .options-content, #extensionsMenu { display:block; }
#extensionsMenu > .extension_container { display:block; }
#extensions_settings2 { display:flex; }
</style></head><body>
<div id="options"><div class="options-content"><a id="option-a" style="order:27 !important">Option A</a><a id="option-b">Option B</a><hr id="option-sep"></div></div>
<div id="extensionsMenu"><div id="wand-wrapper" class="extension_container"><div id="wand-a" class="list-group-item"><span>Wand A</span></div></div><hr id="wand-sep"></div>
<div id="extensions_settings"></div><div id="extensions_settings2" style="display:flex !important"><div id="extension-a" class="extension_container" style="order:31 !important"><div class="inline-drawer"><div class="inline-drawer-header"><b>Extension A</b></div></div></div></div>
<div id="top-settings-holder"><div id="nav-a" class="drawer" title="Navigation A" style="order:19 !important"></div></div>
<div id="left-nav-panel"><div id="range_block_openai"><div id="preset-a">Preset A</div></div></div>
<div id="user-settings-block"><div id="UI-Theme-Block"><div id="UI-presets-block"><h4><span>Theme</span></h4><div id="theme-content">Theme content</div></div></div><div name="CharacterHandlingToggles"><h4>Character</h4><div>Content</div></div><div name="MiscellaneousToggles"><h4>Misc</h4><div>Content</div></div><div id="CustomCSS-block"><h4>CSS</h4><textarea></textarea></div></div>
<div id="send_form"><div id="qr--bar"><div class="qr--buttons"><button id="qr-a" style="order:11 !important">QR A</button></div></div></div>
<div id="chat"><div class="mes_buttons"><span class="extraMesButtonsHint">More</span><div class="extraMesButtons"><button class="mes_button mes-a" title="Message A" style="order:41 !important">Message A</button><button class="mes_button mes-b" title="Message B">Message B</button></div></div></div>
<div id="leftSendForm"><button id="send-a" title="Send A" style="order:17 !important">Send A</button><button id="send-b" title="Send B">Send B</button></div><div id="rightSendForm"></div>
<div id="external" style="order:44 !important">External</div>
</body></html>`;

async function fixture(t, initial = {}, viewport = { width: 980, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(3000);
  t.after(() => page.close());
  await page.setContent(markup);
  await page.evaluate(initial => {
    const timeout = window.setTimeout.bind(window);
    window.setTimeout = (fn, delay, ...args) => delay >= 600 ? 0 : timeout(fn, delay, ...args);
    window.__saved = 0;
    window.__hydrationCalls = 0;
    if (initial.__testPanelRuntime) window.__TAURITAVERN_PANEL_RUNTIME__ = { setVisible() { window.__hydrationCalls++; }, reconcile() {} };
    window.__context = { extensionSettings: { menu_cleaner3: initial }, saveSettingsDebounced() { window.__saved++; }, registerSlashCommand() {} };
    window.SillyTavern = { getContext: () => window.__context };
  }, initial);
  await page.addScriptTag({ content: source });
  await page.evaluate(() => __mc3.openPopup());
  return page;
}
const switchFor = (page, gid) => page.locator('[data-action="set-group-enabled"][data-gid="' + gid + '"]');
async function toggle(page, gid, enabled) { await switchFor(page, gid).setChecked(enabled); }
async function state(page, selector) {
  return page.evaluate(selector => {
    const el = document.querySelector(selector);
    return { order: el.style.order, priority: el.style.getPropertyPriority('order'), parent: el.parentElement.id,
      hidden: el.classList.contains('mc3-hidden'), display: getComputedStyle(el).display };
  }, selector);
}

// This commit has eleven cards, including the two selector-rule cards.
test('each sort card has one accessible switch at the right edge, independent of collapse', async t => {
  const page = await fixture(t);
  const cards = page.locator('.mc3-card');
  assert.equal(await cards.count(), 11);
  assert.equal(await page.locator('[data-action="set-group-enabled"]').count(), 11);
  for (const card of await cards.all()) {
    assert.equal(await card.locator('.mc3-card-header input[role="switch"]').count(), 1);
    const input = card.locator('.mc3-card-header input');
    assert.ok(await input.getAttribute('aria-label'));
  }
  await toggle(page, 'options', false);
  assert.equal(await page.locator('.mc3-card-header[data-gid="options"]').evaluate(el => el.parentElement.classList.contains('mc3-collapsed')), true);
  assert.equal(await switchFor(page, 'extensionsMenu').isChecked(), true);
  await page.locator('[data-action="switch-tab"][data-tab="settings"]').click();
  assert.equal(await page.locator('[data-action="set-qrfold"], [data-action="set-userfold"], [data-action="set-customcss"]').count(), 0);
});

test('legacy folding settings migrate once; explicit region values win and malformed maps normalize', async t => {
  const page = await fixture(t, { enableQrFold: false, enableUserFold: false });
  assert.equal(await switchFor(page, 'qrPanel').isChecked(), false);
  assert.equal(await switchFor(page, 'userSettings').isChecked(), false);
  assert.deepEqual(await page.evaluate(() => [__mc3.settings.enableQrFold, __mc3.settings.enableUserFold]), [undefined, undefined]);
  const explicit = await fixture(t, { enableQrFold: false, groupEnabled: { qrPanel: true } });
  assert.equal(await switchFor(explicit, 'qrPanel').isChecked(), true);
  const invalid = await fixture(t, { groupEnabled: null });
  assert.equal(await switchFor(invalid, 'options').isChecked(), true);
});

test('all nine disabled regions ignore stored hide and order while keeping their records editable', async t => {
  const cases = [
    ['options', '#option-a'], ['extensionsMenu', '#wand-a'], ['extensionsSettings', '#extension-a'],
    ['qrPanel', '#qr-a'], ['topSettings', '#nav-a'], ['presetSettings', '#preset-a'],
    ['userSettings', '#UI-Theme-Block'], ['mesButtons', '.mes-a'], ['sendForm', '#send-a'],
  ];
  for (const [gid, selector] of cases) {
    const page = await fixture(t);
    await page.evaluate(({ gid, selector }) => {
      const record = __mc3.scanAll()[gid].find(r => r.els.some(el => el.matches(selector)) || r.unit?.matches(selector));
      if (!record) throw new Error('Missing record: ' + gid);
      __mc3.settings.hidden[record.key] = true;
      (__mc3.settings.order[gid] ||= {})[record.key] = 80;
      __mc3.applyAll();
    }, { gid, selector });
    assert.equal((await state(page, selector)).hidden, true, gid + ' enabled hide');
    await toggle(page, gid, false);
    assert.equal((await state(page, selector)).hidden, false, gid + ' disabled hide');
    assert.ok(await page.evaluate(gid => __mc3.scanAll()[gid].length, gid), gid + ' remains editable');
    assert.equal(await page.evaluate(() => __mc3.settings.enabled), true);
  }
});

test('send-form off restores native order, important, column and sibling position; on reapplies saved config', async t => {
  const page = await fixture(t, { order: { sendForm: { '#send-a': 8 } }, column: { '#send-a': 1 }, hidden: { '#send-a': true } });
  assert.equal((await state(page, '#send-a')).parent, 'rightSendForm');
  await toggle(page, 'sendForm', false);
  assert.deepEqual(await state(page, '#send-a'), { order: '17', priority: 'important', parent: 'leftSendForm', hidden: false, display: 'inline-block' });
  assert.equal(await page.evaluate(() => document.querySelector('#send-a').nextElementSibling.id), 'send-b');
  await page.evaluate(() => __mc3.applyAll());
  assert.equal((await state(page, '#send-a')).order, '17');
  assert.equal(await page.evaluate(() => __mc3.settings.column['#send-a']), 1);
  await toggle(page, 'sendForm', true);
  assert.equal((await state(page, '#send-a')).parent, 'rightSendForm');
  assert.equal((await state(page, '#send-a')).hidden, true);
});

test('extension off restores native columns, wrapper styles and right-column display', async t => {
  const page = await fixture(t, { columnMode: 'single' });
  assert.equal((await state(page, '#extension-a')).parent, 'extensions_settings');
  await toggle(page, 'extensionsSettings', false);
  const restored = await state(page, '#extension-a');
  assert.equal(restored.parent, 'extensions_settings2');
  assert.equal(restored.order, '31');
  assert.equal(restored.priority, 'important');
  assert.equal(await page.locator('#extensions_settings2').evaluate(el => el.style.getPropertyValue('display')), 'flex');
  assert.equal(await page.locator('#extensions_settings2').evaluate(el => el.style.getPropertyPriority('display')), 'important');
});

test('left-menu and wand switches remove forced layout, separator hiding and injected subgroup headers', async t => {
  const page = await fixture(t);
  for (const [gid, container, item, separator] of [['options', '#options .options-content', '#option-a', '#option-sep'], ['extensionsMenu', '#extensionsMenu', '#wand-a', '#wand-sep']]) {
    await page.evaluate(({ gid, item }) => {
      const rec = __mc3.scanAll()[gid].find(r => r.el.matches(item));
      const sg = __mc3.addSubgroup(gid);
      sg.memberKeys.push(rec.key);
      __mc3.applyAll();
    }, { gid, item });
    assert.equal(await page.locator(container).evaluate(el => getComputedStyle(el).display), 'flex');
    await toggle(page, gid, false);
    assert.equal(await page.locator(container).evaluate(el => getComputedStyle(el).display), 'block');
    assert.equal((await state(page, separator)).hidden, false);
    assert.equal(await page.locator(container + ' .mc3-native-subgroup-header, ' + container + ' .mc3-subgroup-sep').count(), 0);
  }
  assert.equal(await page.locator('#wand-wrapper').evaluate(el => getComputedStyle(el).display), 'block');
});

test('QR off removes folding and restores explicit native order, on restores fold preference', async t => {
  const page = await fixture(t, { qrPanelCollapsed: true });
  assert.equal(await page.locator('#mc3-qr-toggle-btn').count(), 1);
  await toggle(page, 'qrPanel', false);
  assert.equal(await page.locator('#mc3-qr-toggle-btn').count(), 0);
  assert.equal(await page.locator('#qr--bar').evaluate(el => el.classList.contains('mc3-qr-bar-collapsed')), false);
  assert.equal((await state(page, '#qr-a')).order, '11');
  await toggle(page, 'qrPanel', true);
  assert.equal(await page.locator('#qr--bar').evaluate(el => el.classList.contains('mc3-qr-bar-collapsed')), true);
});

test('custom-CSS option lives in user-settings body and respects its region switch', async t => {
  const page = await fixture(t, { groupCollapsed: { userSettings: false } });
  const css = page.locator('[data-action="set-customcss"]');
  assert.equal(await css.count(), 1);
  assert.equal(await css.evaluate(el => el.closest('.mc3-card').querySelector('.mc3-card-header').dataset.gid), 'userSettings');
  await css.check();
  assert.equal(await page.locator('#CustomCSS-block').evaluate(el => el.nextElementSibling.getAttribute('name')), 'CharacterHandlingToggles');
  assert.equal(await page.locator('#CustomCSS-block > h4 .mc3-user-drawer-arrow').count(), 1);
  await toggle(page, 'userSettings', false);
  assert.equal(await page.locator('.mc3-user-drawer-arrow').count(), 0);
  assert.equal(await page.locator('#CustomCSS-block').evaluate(el => el.previousElementSibling.getAttribute('name')), 'MiscellaneousToggles');
  assert.equal(await page.locator('.mc3-user-drawer-collapsed').count(), 0);
  assert.equal(await page.evaluate(() => __mc3.settings.isolateCustomCss), true);
  await toggle(page, 'userSettings', true);
  assert.equal(await page.locator('#CustomCSS-block').evaluate(el => el.nextElementSibling.getAttribute('name')), 'CharacterHandlingToggles');
});

test('selector cards switch independently and custom hiding cannot intervene in disabled regions', async t => {
  const page = await fixture(t, { customSelectors: [{ id: 'cs_a', selector: '#external, #send-a', label: 'Custom' }], hidden: { cs_a: true },
    excludedSelectors: [{ id: 'ex_a', selector: '#option-a', label: 'Protected' }], order: { options: { '#option-a': 8 } } });
  assert.equal((await state(page, '#external')).hidden, true);
  await toggle(page, 'sendForm', false);
  assert.equal((await state(page, '#send-a')).hidden, false);
  assert.equal((await state(page, '#external')).hidden, true);
  await toggle(page, 'customSelectors', false);
  assert.equal((await state(page, '#external')).hidden, false);
  assert.equal((await state(page, '#option-a')).order, '27');
  await toggle(page, 'excludedSelectors', false);
  assert.equal((await state(page, '#option-a')).order, '17'); // pseudo-header groups use slot * 2 + 1
  await toggle(page, 'excludedSelectors', true);
  assert.equal((await state(page, '#option-a')).order, '27');
  assert.equal(await page.evaluate(() => __mc3.settings.excludedSelectors.length), 1);
});

test('disabled region remains untouched after late injection and settings reload, including master switch cycling', async t => {
  const page = await fixture(t, { groupEnabled: { sendForm: false }, hidden: { '#late-send': true }, order: { sendForm: { '#late-send': 99 } }, column: { '#late-send': 1 } });
  await page.evaluate(() => {
    document.querySelector('#leftSendForm').insertAdjacentHTML('beforeend', '<button id="late-send" style="order:33 !important">Late send</button>');
  });
  await page.waitForTimeout(450);
  assert.equal((await state(page, '#late-send')).order, '33');
  assert.equal((await state(page, '#late-send')).hidden, false);
  assert.equal((await state(page, '#late-send')).parent, 'leftSendForm');
  await page.evaluate(() => { __mc3.settings.enabled = false; __mc3.applyAll(); __mc3.settings.enabled = true; __mc3.applyAll(); __mc3.save(); });
  const stored = await page.evaluate(() => JSON.parse(JSON.stringify(__context.extensionSettings.menu_cleaner3)));
  const reloaded = await fixture(t, stored);
  assert.equal(await switchFor(reloaded, 'sendForm').isChecked(), false);
  assert.equal((await state(reloaded, '#send-a')).order, '17');
});

test('switches and the relocated CSS setting fit desktop and narrow layouts', async t => {
  for (const width of [980, 390]) {
    const page = await fixture(t, { groupCollapsed: { userSettings: false } }, { width, height: 900 });
    assert.equal(await page.locator('#mc3-popup').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    const bounds = await switchFor(page, 'userSettings').boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
    await toggle(page, 'userSettings', false);
    await toggle(page, 'userSettings', true);
    if (process.env.MC_SCREENSHOTS) {
      fs.mkdirSync(path.join(root, 'tests', 'artifacts'), { recursive: true });
      await page.screenshot({ path: path.join(root, 'tests', 'artifacts', 'region-toggles-' + width + '.png') });
    }
  }
});

test('message switch removes duplicate-suppression CSS and restores original overflow position', async t => {
  const page = await fixture(t, { column: { 'mesButtons|.mes-a': 1 }, order: { mesButtons: { 'mesButtons|.mes-a': 7 } } });
  assert.equal(await page.locator('.mes-a').evaluate(el => el.parentElement.className), 'mes_buttons');
  assert.ok(await page.locator('#mc3-mes-suppress').textContent());
  await toggle(page, 'mesButtons', false);
  assert.equal(await page.locator('.mes-a').evaluate(el => el.parentElement.className), 'extraMesButtons');
  assert.equal((await state(page, '.mes-a')).order, '41');
  assert.equal((await state(page, '.mes-a')).priority, 'important');
  assert.equal(await page.locator('#mc3-mes-suppress').textContent(), '');
  await page.evaluate(() => document.querySelector('.extraMesButtons').insertAdjacentHTML('beforeend', '<button class="mes_button mes-a" title="Message A" style="order:55 !important">Duplicate</button>'));
  await page.waitForTimeout(450);
  assert.equal(await page.locator('.extraMesButtons .mes-a').last().evaluate(el => getComputedStyle(el).display), 'inline-block');
  await toggle(page, 'mesButtons', true);
  assert.ok(await page.locator('#mc3-mes-suppress').textContent());
});

test('disabling preserves user style changes made after plugin management', async t => {
  const page = await fixture(t, { column: { '#send-a': 1 } });
  await page.evaluate(() => document.querySelector('#send-a').style.setProperty('order', '123', 'important'));
  await toggle(page, 'sendForm', false);
  assert.equal((await state(page, '#send-a')).order, '123');
  assert.equal((await state(page, '#send-a')).priority, 'important');
});

test('native user-setting header clicks are not intercepted after region shutdown', async t => {
  const page = await fixture(t);
  await toggle(page, 'userSettings', false);
  const result = await page.locator('#UI-presets-block > h4').evaluate(el => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return { intercepted: event.defaultPrevented, handler: !!el.__mc3UserDrawerHandler, aria: el.getAttribute('aria-expanded') };
  });
  assert.deepEqual(result, { intercepted: false, handler: false, aria: null });
});

test('master switch removes force-flex and preserves the per-card choices on reenable', async t => {
  const page = await fixture(t);
  await toggle(page, 'extensionsMenu', false);
  await page.evaluate(() => { __mc3.settings.enabled = false; __mc3.applyAll(); });
  assert.equal(await page.locator('#options .options-content').evaluate(el => getComputedStyle(el).display), 'block');
  assert.equal((await state(page, '#option-a')).order, '27');
  await page.evaluate(() => { __mc3.settings.enabled = true; __mc3.applyAll(); });
  assert.equal(await page.locator('#options .options-content').evaluate(el => getComputedStyle(el).display), 'flex');
  assert.equal(await page.locator('#extensionsMenu').evaluate(el => getComputedStyle(el).display), 'block');
});

test('label and keyboard activation toggle only the card switch without folding it', async t => {
  const page = await fixture(t);
  await switchFor(page, 'options').focus();
  await page.keyboard.press('Space');
  assert.equal(await switchFor(page, 'options').isChecked(), false);
  assert.equal(await page.locator('.mc3-card-header[data-gid="options"]').evaluate(el => el.parentElement.classList.contains('mc3-collapsed')), true);
  await page.locator('.mc3-card-header[data-gid="options"] .mc3-group-switch-track').click({ force: true });
  assert.equal(await switchFor(page, 'options').isChecked(), true);
  assert.equal(await page.locator('.mc3-card-header[data-gid="options"]').evaluate(el => el.parentElement.classList.contains('mc3-collapsed')), true);
});

test('reset removes per-card preferences and retains a working settings reference', async t => {
  const page = await fixture(t, { groupEnabled: { options: false, userSettings: false } });
  await page.evaluate(() => __mc3.resetAll());
  assert.equal(await switchFor(page, 'options').isChecked(), true);
  assert.equal(await switchFor(page, 'userSettings').isChecked(), true);
  assert.equal(await page.evaluate(() => __context.extensionSettings.menu_cleaner3 === __mc3.settings), true);
});


test('disabled extension region does not force TauriTavern subtree hydration during scan or popup rendering', async t => {
  const disabled = await fixture(t, { __testPanelRuntime: true, groupEnabled: { extensionsSettings: false } });
  await disabled.evaluate(() => { __mc3.scanAll(); __mc3.applyAll(); __mc3.openPopup(); });
  assert.equal(await disabled.evaluate(() => __hydrationCalls), 0);
  const enabled = await fixture(t, { __testPanelRuntime: true });
  assert.ok(await enabled.evaluate(() => __hydrationCalls) > 0);
});

test('built-in default hides obey their owning region switches', async t => {
  const page = await fixture(t);
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<div id="rm_api_block"><div class="flex-container flexFlowColumn"><div id="openai_api"><div class="flex-container flex"><button id="test_api_button">Test API</button></div></div></div></div><div id="rm_extensions_block"><div><div id="default-ext-a" class="alignitemsflexstart flex-container wide100p">Extension controls</div></div></div>');
    __mc3.applyAll();
  });
  assert.equal((await state(page, '#test_api_button')).hidden, true);
  assert.equal((await state(page, '#default-ext-a')).hidden, true);
  await toggle(page, 'presetSettings', false);
  assert.equal((await state(page, '#test_api_button')).hidden, false);
  assert.equal((await state(page, '#default-ext-a')).hidden, true);
  await toggle(page, 'extensionsSettings', false);
  assert.equal((await state(page, '#default-ext-a')).hidden, false);
});

test('rollback removes only duplicates reinjected while a message button was managed, not late unmanaged injections', async t => {
  for (const master of [false, true]) {
    const page = await fixture(t, { column: { 'mesButtons|.mes-a': 1 } });
    await page.evaluate(() => document.querySelector('.extraMesButtons').insertAdjacentHTML('beforeend', '<button class="mes_button mes-a" title="Message A">Managed-period duplicate</button>'));
    await page.waitForTimeout(450);
    assert.equal(await page.locator('.mes-a').count(), 2);
    if (master) await page.evaluate(() => { __mc3.settings.enabled = false; __mc3.applyAll(); });
    else await toggle(page, 'mesButtons', false);
    assert.equal(await page.locator('.mes-a').count(), 1);
    assert.equal(await page.locator('.mes-a').evaluate(el => el.parentElement.className), 'extraMesButtons');
    assert.equal((await state(page, '.mes-a')).order, '41');
    await page.evaluate(() => __mc3.applyAll());
    assert.equal(await page.locator('.mes-a').count(), 1);
  }
});

test('custom selectors cannot re-hide native extension controls after their region is disabled', async t => {
  const page = await fixture(t, { customSelectors: [{ id: 'cs_ext', selector: '#default-ext-a', label: 'Ext' }], hidden: { cs_ext: true } });
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<div id="rm_extensions_block"><div><div id="default-ext-a" class="alignitemsflexstart flex-container wide100p">Extension controls</div></div></div>');
    __mc3.applyAll();
  });
  assert.equal((await state(page, '#default-ext-a')).hidden, true);
  await toggle(page, 'extensionsSettings', false);
  assert.equal((await state(page, '#default-ext-a')).hidden, false);
});

test('custom selectors cannot indirectly hide a disabled region through its ancestor', async t => {
  const page = await fixture(t, { customSelectors: [{ id: 'cs_parent', selector: '#send_form', label: 'Parent' }], hidden: { cs_parent: true } });
  assert.equal((await state(page, '#send_form')).hidden, true);
  await toggle(page, 'qrPanel', false);
  assert.equal((await state(page, '#send_form')).hidden, false);
  await toggle(page, 'qrPanel', true);
  assert.equal((await state(page, '#send_form')).hidden, true);
});
