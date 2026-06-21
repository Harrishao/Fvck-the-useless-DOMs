(function () {
  'use strict';

  // 酒馆助手在 iframe 中执行脚本，需要操作父页面的 document
  var doc = window.frameElement ? window.parent.document : document;
  var win = window.frameElement ? window.parent : window;

  // ============================================================================
  // 方案3 · 原地排序版
  // 架构四支柱：① 元素留在原生容器（不搬进自绘面板） ② 排序 = CSS `order`（不动 DOM）
  //            ③ 稳定 key + order map（后加载/跨情境天然归位） ④ 幂等 observer
  // 详见同目录 PLAN.md
  // ============================================================================

  // 独立 localStorage key，避免与主版本/旧版本互相污染
  const STORAGE_KEY = 'menu_cleaner3_settings';
  const OWN_PREFIX = 'mc3-';   // 本版自身注入元素 id 前缀（扫描时跳过）

  // id 是否「稳定、可用作 key」：排除空、本版自身、以及旧版方案2 残留的 menu-cleaner-auto-* 自增 id
  function isStableId(id) {
    return !!id && id.indexOf(OWN_PREFIX) !== 0 && id.indexOf('menu-cleaner-auto-') !== 0 && /^[A-Za-z][\w:-]*$/.test(id);
  }

  // ── 纯发现配置（零硬编码 items / 零 ALWAYS_HIDDEN）──────────────────────────
  // 每组只描述「在哪扫、怎么认条目、标签从哪取」，不预判任何元素的用途/可见性。
  //   mode:
  //     'children'  — 直接子元素即条目（可用 itemFilter 限定）
  //     'listItems' — 后代 .list-group-item 即条目（穿透 wrapper）
  //     'drawers'   — 子元素中带 header 者即条目（穿透 .extension_container）
  //   label: 'text' | 'span' | 'attrTitle' | 'header'
  const GROUPS = [
    {
      id: 'options', name: '左下菜单',
      button: '#options_button',
      containers: ['#options .options-content'],
      forceFlex: true,                 // 实测此容器 display:block，需 flex 覆盖才能用 order
      mode: 'children', itemFilter: '[id^="option_"]', label: 'text',
    },
    {
      id: 'extensionsMenu', name: '魔棒',
      button: '#extensionsMenuButton',
      containers: ['#extensionsMenu'],
      forceFlex: true,                 // 实测 #extensionsMenu 也是 options-content(block)，需 flex 才能用 order
      mode: 'listItems', itemMatch: '.list-group-item', label: 'span',
    },
    {
      id: 'extensionsSettings', name: '扩展菜单',
      button: '#extensions-settings-button',
      containers: ['#extensions_settings', '#extensions_settings2'],  // 双栏
      mode: 'drawers', header: '.inline-drawer-header', label: 'header',
    },
    {
      id: 'topSettings', name: '顶部导航栏',
      containers: ['#top-settings-holder'],
      mode: 'children', itemFilter: '.drawer', label: 'attrTitle',
    },
    {
      id: 'presetSettings', name: '预设菜单',
      button: '#ai-config-button',
      curated: true,                   // 预设条目是裸 div 跨两容器，需按 PRESET_GROUPS 人工打包（见 可展开列表.md）
      observe: ['#left-nav-panel'],    // curated 无 containers，单独给 observer 监听目标
    },
  ];

  // 预设面板：裸 div 无 id、跨 #range_block_openai/#openai_settings 两容器，必须人工打包成命名分组，
  // 按组隐藏（可见性同时作用于组内每个元素）。标题含括号部分，依 可展开列表.md。
  function presetRange(prefix, a, b, suffix) { var out = []; for (var n = a; n <= b; n++) out.push(prefix + n + suffix); return out; }
  const PRESET_GROUPS = [
    { label: '上下文长度及备选回复', selectors: presetRange('#range_block_openai > div:nth-child(', 1, 4, ')') },
    { label: '可调参数', selectors: presetRange('#range_block_openai > div:nth-child(', 11, 18, ')') },
    { label: '提示词格式相关', selectors: [
      '#range_block_openai > div.inline-drawer.m-t-1.wide100p',
      '#range_block_openai > div:nth-child(20)', '#range_block_openai > div:nth-child(21)',
      '#openai_settings > div:nth-child(1) > div:nth-child(1)',
      '#openai_settings > div:nth-child(1) > div.inline-drawer.wide100p.flexFlowColumn.marginBot10',
    ] },
    { label: '复选框和下拉菜单', selectors: presetRange('#openai_settings > div:nth-child(1) > div:nth-child(', 3, 13, ')').concat(['#openai_settings > div.range-block.m-t-1']) },
    { label: '预设条目(你不会连这个都要隐藏吧？)', selectors: ['#openai_settings > div.range-block.m-b-1'] },
  ];

  // 「无论如何都不需要」的元素：默认隐藏、不在 UI 提供滑块（依 可展开列表.md）。
  const ALWAYS_HIDDEN = [
    '#rm_api_block > div.flex-container.flexFlowColumn > #openai_api > div.flex-container.flex > #test_api_button',
    '#rm_extensions_block > div > div.alignitemsflexstart.flex-container.wide100p',
    '#rm_extensions_block > div > div.alignitemscenter.flex-container.justifyCenter.wide100p',
  ];

  function getGroup(id) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === id) return GROUPS[i];
    return null;
  }

  // ── 设置模型 ───────────────────────────────────────────────────────────────
  const defaultSettings = {
    enabled: true,
    hidden: {},        // { key: true }                  — 可见性，无任何预设
    order: {},         // { groupId: { key: slot:int } }  — 全局总序，跨情境一致
    column: {},        // { key: 0|1 }                    — 仅扩展面板双栏（用户当前归属）
    nativeColumn: {},  // { key: 0|1 }                    — 首次扫描捕获的原生归属（供"恢复原始"）
    nativeOrder: {},   // { groupId: { key: slot } }       — 首次扫描捕获的原生顺序（供"恢复原始"）
    columnMode: 'dual', // 'single' | 'dual'
  };
  let settings = {};

  function loadSettings() {
    try {
      var raw = win.localStorage.getItem(STORAGE_KEY);
      settings = raw ? Object.assign({}, defaultSettings, JSON.parse(raw)) : Object.assign({}, defaultSettings);
    } catch (e) {
      console.warn('[菜单精简器3] 读取设置失败，用默认值', e);
      settings = Object.assign({}, defaultSettings);
    }
    // 注意：刻意「不」清理当前不在场的 key —— 后加载元素要靠留存的 order/column/hidden 归位。
    if (!settings.hidden) settings.hidden = {};
    if (!settings.order) settings.order = {};
    if (!settings.column) settings.column = {};
    if (!settings.nativeColumn) settings.nativeColumn = {};
    if (!settings.nativeOrder) settings.nativeOrder = {};
  }

  function saveSettings() {
    try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
    catch (e) { console.warn('[菜单精简器3] 保存设置失败', e); }
  }

  // ── 工具 ───────────────────────────────────────────────────────────────────
  function normLabel(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  // 跳过本版自绘元素，但「入口」(mc3-launcher-*) 例外 —— 它们作为普通条目参与扫描/排序/隐藏（#1）
  function isSelf(el) { return el.id && el.id.indexOf(OWN_PREFIX) === 0 && el.id.indexOf('mc3-launcher') !== 0; }

  // 元素在某容器内的「顶层单元」= 该容器的直接子节点祖先（扩展面板里通常是 .extension_container，
  // 第三方则是抽屉本身）。带稳定 id 时用作 column-无关 的 key 锚点；也是 M4 跨栏搬运的对象。
  function unitOf(el, container) {
    var u = el;
    while (u && u.parentNode !== container) u = u.parentNode;
    return u || el;
  }

  // 元素「本身」是否被显式隐藏（不依赖菜单是否展开：computed display 是元素自身的，
  // 不受祖先 display:none 影响）。用于在重复副本中挑出可见的那一个 —— 直接修 #5。
  function isOwnVisible(el) { return win.getComputedStyle(el).display !== 'none'; }

  // 标签提取（自旧版移植，多级 fallback 已成熟）
  function extractHeaderLabel(header) {
    if (!header) return '';
    for (var ci = 0; ci < header.children.length; ci++) {
      var ch = header.children[ci];
      if (ch.tagName === 'B' || ch.hasAttribute('data-i18n')) {
        var text = (ch.textContent || '').trim();
        if (text) return text;
      }
    }
    var nested = header.querySelector('b, [data-i18n]');
    if (nested) {
      var nt = (nested.textContent || '').trim();
      if (nt && nt.length <= 40) return nt;
    }
    var direct = '';
    for (var ni = 0; ni < header.childNodes.length; ni++) {
      var n = header.childNodes[ni];
      if (n.nodeType === 3) direct += n.textContent;
    }
    direct = direct.trim();
    if (direct) return direct;
    var icon = header.querySelector('.inline-drawer-icon');
    var iconText = icon ? icon.textContent.trim() : '';
    var full = (header.textContent || '').trim();
    if (iconText && full.slice(-iconText.length) === iconText) full = full.slice(0, -iconText.length).trim();
    return full || '';
  }

  // 取某候选元素的标签
  function labelOf(el, group) {
    switch (group.label) {
      case 'text': {
        // 直接文本节点优先，避免把内部图标/计数吞进来
        var t = '';
        for (var i = 0; i < el.childNodes.length; i++) if (el.childNodes[i].nodeType === 3) t += el.childNodes[i].textContent;
        t = normLabel(t);
        return t || normLabel(el.textContent);
      }
      case 'span': {
        var sp = el.querySelector('span');
        return normLabel(sp ? sp.textContent : el.textContent);
      }
      case 'attrTitle': {
        var withTitle = el.matches('[title]') ? el : el.querySelector('[title]');
        if (withTitle) return normLabel(withTitle.getAttribute('title'));
        var i18n = el.querySelector('[data-i18n]');
        return normLabel(i18n ? i18n.textContent : '');
      }
      case 'header':
      default:
        return normLabel(extractHeaderLabel(el.querySelector(group.header) || el));
    }
  }

  // ── 候选收集（按 mode 各异，只产出 {el, label}，去重/定 key 由 scanGroup 统一处理）──
  function collectCandidates(group, container) {
    var out = [];
    var children = container.children;

    if (group.mode === 'children') {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (isSelf(c)) continue;
        if (group.itemFilter && !c.matches(group.itemFilter)) continue;
        out.push({ el: c, label: labelOf(c, group) });
      }
      return out;
    }

    if (group.mode === 'listItems') {
      var items = container.querySelectorAll(group.itemMatch);
      var matched = new Set();
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (isSelf(it)) continue;
        matched.add(it);
        out.push({ el: it, label: labelOf(it, group) });
      }
      // 穿透：wrapper 下未被 itemMatch 命中、但自带 span 的直接子（兼容第三方按钮）
      for (var w = 0; w < children.length; w++) {
        var wc = children[w];
        if (matched.has(wc) || isSelf(wc)) continue;
        if (!wc.querySelector('span')) continue;
        if (wc.querySelector(group.itemMatch)) continue; // 内部已有命中项，交给上面
        out.push({ el: wc, label: labelOf(wc, group) });
      }
      return out;
    }

    // mode === 'drawers'
    for (var k = 0; k < children.length; k++) {
      var ch = children[k];
      if (isSelf(ch)) continue;
      // .extension_container 是 wrapper（如 #qr_container），穿透扫其直接子抽屉
      if (ch.classList.contains('extension_container') && !ch.classList.contains('inline-drawer')) {
        for (var x = 0; x < ch.children.length; x++) {
          var gchild = ch.children[x];
          if (isSelf(gchild)) continue;
          if (!gchild.querySelector(group.header) && !gchild.matches(group.header)) continue;
          out.push({ el: gchild, label: labelOf(gchild, group) });
        }
        continue;
      }
      if (!ch.querySelector(group.header) && !ch.matches(group.header)) continue;
      out.push({ el: ch, label: labelOf(ch, group) });
    }
    return out;
  }

  // ── 统一扫描：产出归一 record，并据此派生稳定 key ────────────────────────────
  // record: { key, el, groupId, container, label, column? }
  function scanGroup(group) {
    var records = [];
    var byKey = Object.create(null);        // key -> record（用于重复 id 去重）
    var derivedCount = Object.create(null); // base -> 已出现次数（派生 key 消歧）
    var seenEls = new Set();

    var multi = group.containers.length > 1;
    for (var ci = 0; ci < group.containers.length; ci++) {
      var containerSel = group.containers[ci];
      var container = doc.querySelector(containerSel);
      if (!container) continue;
      var column = multi ? ci : undefined;

      var cands = collectCandidates(group, container);
      for (var n = 0; n < cands.length; n++) {
        var el = cands[n].el;
        var label = normLabel(cands[n].label);
        if (!label) continue;
        if (seenEls.has(el)) continue;
        seenEls.add(el);

        // 顶层单元 = 该列容器的直接子（扩展面板里是 .extension_container；其它组通常即元素本身）。
        // order/hide 写在单元上（它才是 flex 容器的直接子）；也是 M4 跨栏搬运的对象。
        var unit = unitOf(el, container);

        var key;
        if (isStableId(el.id)) {
          // T1/T2：元素自带稳定 id。重复 id（#option_close_chat ×2）共享同一 key，保留可见副本。
          key = '#' + el.id;
          if (byKey[key]) {
            if (!isOwnVisible(byKey[key].el) && isOwnVisible(el)) { byKey[key].el = el; byKey[key].unit = unit; }
            continue;
          }
        } else {
          // T3：派生 key。锚点取「顶层单元」的稳定 id（column-无关，跨栏搬运后不变），
          //     无稳定单元 id 时退回 group.id。同名再加序号消歧。reload 可复现，无自增计数器。
          var anchor = (unit && isStableId(unit.id)) ? '#' + unit.id : group.id;
          var base = group.id + '|' + anchor + '|' + label;
          var cnt = derivedCount[base] || 0; derivedCount[base] = cnt + 1;
          key = cnt === 0 ? base : base + '|' + cnt;
        }

        var rec = { key: key, el: el, els: [el], unit: unit, groupId: group.id, container: containerSel, label: label };
        if (column !== undefined) rec.column = column;
        records.push(rec);
        byKey[key] = rec;
      }
    }
    return records;
  }

  // 预设面板 curated 扫描：每个 PRESET_GROUP → 一条 packed record（els 多元素，按组隐藏）。
  function scanPreset() {
    var records = [];
    for (var i = 0; i < PRESET_GROUPS.length; i++) {
      var pg = PRESET_GROUPS[i];
      var els = [];
      for (var s = 0; s < pg.selectors.length; s++) {
        var found = doc.querySelectorAll(pg.selectors[s]);
        for (var f = 0; f < found.length; f++) if (els.indexOf(found[f]) === -1 && !isSelf(found[f])) els.push(found[f]);
      }
      if (!els.length) continue;
      records.push({ key: 'presetSettings|' + pg.label, el: els[0], els: els, unit: null, groupId: 'presetSettings', label: pg.label, curated: true });
    }
    return records;
  }

  function scanAll() {
    var all = {};
    for (var i = 0; i < GROUPS.length; i++) {
      var g = GROUPS[i];
      all[g.id] = g.curated ? scanPreset() : scanGroup(g);
    }
    return all;
  }

  // ── 应用层：原地排序(M2) + 可见性(M3) + 单双栏(M4) + 幂等observer(M5) ──────────
  // 全程不动源 DOM（除 M4 跨栏搬「顶层单元」这一处，用户显式触发 + observer 抑制）。

  var suppressObserver = false;   // 程序性 DOM 搬运期间抑制 observer，防回环
  var applyTimer = null;

  function injectStyle() {
    if (doc.getElementById('mc3-style')) return;
    var rules = ['.mc3-hidden{display:none !important;}'];
    for (var i = 0; i < GROUPS.length; i++) {
      if (!GROUPS[i].forceFlex) continue;
      for (var c = 0; c < GROUPS[i].containers.length; c++) {
        rules.push(GROUPS[i].containers[c] + '{display:flex;flex-direction:column;}');
      }
    }
    var st = doc.createElement('style');
    st.id = 'mc3-style';
    st.textContent = rules.join('\n');
    (doc.head || doc.documentElement).appendChild(st);
  }

  // M2：确保每个 key 有槽位；初次按扫描序(=原生序)分配 → 未排序前零视觉变化；新元素追加末尾。
  function ensureSlots(group, records) {
    var map = settings.order[group.id] || (settings.order[group.id] = {});
    var nat = settings.nativeOrder[group.id] || (settings.nativeOrder[group.id] = {});
    var maxSlot = -1, k;
    for (k in map) if (map[k] > maxSlot) maxSlot = map[k];
    var changed = false;
    for (var i = 0; i < records.length; i++) {
      var key = records[i].key;
      if (!(key in map)) { map[key] = ++maxSlot; if (!(key in nat)) nat[key] = map[key]; changed = true; }
    }
    if (changed) saveSettings();
    return map;
  }

  // M2：order 两手都设 —— 既写「顶层单元」(普通容器整块移动，取最小槽位)，也写 rec.el。
  // 因为部分第三方扩展(柏宝箱/SP数据库/提示词查看器)把自己的 wand 容器设成 display:contents，
  // 此时真正参与 flex 的是里面的 .list-group-item(=rec.el)，order 必须落在 el 上才生效；
  // 同一 contents 容器内多条目还能各自独立排序。普通容器里 el 的 order 无副作用(块上下文不响应)。
  function applyOrder(group, records) {
    var map = ensureSlots(group, records);
    var unitSlot = new Map();
    for (var i = 0; i < records.length; i++) {
      var slot = map[records[i].key];
      if (slot === undefined) continue;
      var u = records[i].unit;
      if (u && (!unitSlot.has(u) || slot < unitSlot.get(u))) unitSlot.set(u, slot);
      if (records[i].el && records[i].el !== u) records[i].el.style.order = String(slot);
    }
    unitSlot.forEach(function (slot, unit) { if (unit) unit.style.order = String(slot); });
  }

  // M3：可见性。用 .mc3-hidden 类（不碰 inline display，避免覆盖原生/他插件的隐藏）。
  // 隐藏作用在「元素本身」（精确，兼容多抽屉容器）；某容器成员全隐藏时连容器一并收起。
  function applyHides(group, records) {
    var byUnit = new Map();
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var hidden = !!settings.hidden[r.key];
      for (var e = 0; e < r.els.length; e++) r.els[e].classList.toggle('mc3-hidden', hidden); // packed：按组隐藏全部元素
      if (r.unit) { if (!byUnit.has(r.unit)) byUnit.set(r.unit, []); byUnit.get(r.unit).push(r); }
    }
    byUnit.forEach(function (recs, unit) {
      var allHidden = recs.every(function (r) { return !!settings.hidden[r.key]; });
      unit.classList.toggle('mc3-hidden', allHidden);
    });
  }

  // M4：单双栏（仅 extensionsSettings）。搬整个「顶层单元」（.extension_container/第三方抽屉），
  // 不搬内部内容 → 插件后续 append 仍命中容器内部（修柏宝箱 #3）。首次捕获 nativeColumn 快照。
  function applyColumns(records) {
    var col0 = doc.querySelector('#extensions_settings');
    var col1 = doc.querySelector('#extensions_settings2');
    if (!col0 || !col1) return;
    var single = settings.columnMode === 'single';
    var moved = false;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.column === undefined) continue;
      if (settings.nativeColumn[r.key] === undefined) settings.nativeColumn[r.key] = r.column; // 首次=原生
      var target = single ? 0 : (settings.column[r.key] !== undefined ? settings.column[r.key] : r.column);
      var tc = target === 1 ? col1 : col0;
      if (r.unit && r.unit.parentNode !== tc) { suppressObserver = true; tc.appendChild(r.unit); moved = true; }
    }
    col1.style.display = single ? 'none' : '';   // 单栏时右栏收起，左栏占满
    if (moved) win.setTimeout(function () { suppressObserver = false; }, 0);
  }

  // 切换单双栏：→单栏时把全部 extensionsSettings 归属左栏（符合「右栏留空」规格）
  function setColumnMode(mode) {
    if (mode === 'single') {
      var recs = scanGroup(getGroup('extensionsSettings'));
      for (var i = 0; i < recs.length; i++) settings.column[recs[i].key] = 0;
    }
    settings.columnMode = mode;
    saveSettings();
    applyAll();
  }

  function applyGroup(group, records) {
    if (group.id === 'extensionsSettings') applyColumns(records); // 先定栏（唯一搬 DOM 处）
    applyOrder(group, records);                                   // 再排序（CSS order）
    applyHides(group, records);                                   // 再可见性
  }

  function clearGroup(records) {
    var seen = new Set();
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      for (var e = 0; e < r.els.length; e++) { r.els[e].classList.remove('mc3-hidden'); r.els[e].style.order = ''; }
      if (r.unit && !seen.has(r.unit)) {
        seen.add(r.unit);
        r.unit.style.order = '';
        r.unit.classList.remove('mc3-hidden');
        if (r.unit.style.display === 'contents') r.unit.style.display = '';
      }
    }
  }

  // 「无论如何不需要」的元素：默认隐藏、不入扫描/不进 UI（依 可展开列表.md）。
  function applyAlwaysHidden(on) {
    for (var i = 0; i < ALWAYS_HIDDEN.length; i++) {
      var els = doc.querySelectorAll(ALWAYS_HIDDEN[i]);
      for (var j = 0; j < els.length; j++) els[j].classList.toggle('mc3-hidden', on);
    }
  }

  function applyAll() {
    injectStyle();
    setupLaunchers();   // 幂等：先补回入口，使其作为普通条目被随后的 scanAll 扫描/排序/隐藏（#1）
    applyAlwaysHidden(settings.enabled);
    var all = scanAll();
    for (var i = 0; i < GROUPS.length; i++) {
      var recs = all[GROUPS[i].id] || [];
      if (settings.enabled) applyGroup(GROUPS[i], recs);
      else clearGroup(recs);
    }
    return all;
  }

  // M5：幂等 observer —— 容器子树有增删就防抖重应用，取代旧版多重兜底重扫描。
  function scheduleApply() {
    if (suppressObserver) return;
    if (applyTimer) win.clearTimeout(applyTimer);
    applyTimer = win.setTimeout(function () { applyTimer = null; if (!suppressObserver) applyAll(); }, 300);
  }

  function setupObserver() {
    var seen = new Set();
    var obs = new win.MutationObserver(function (muts) {
      if (suppressObserver) return;
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes.length || muts[i].removedNodes.length) { scheduleApply(); return; }
      }
    });
    for (var g = 0; g < GROUPS.length; g++) {
      var conts = GROUPS[g].containers || GROUPS[g].observe || [];
      for (var c = 0; c < conts.length; c++) {
        var el = doc.querySelector(conts[c]);
        if (el && !seen.has(el)) { seen.add(el); obs.observe(el, { childList: true, subtree: true }); }
      }
    }
    try {
      if (win.eventSource && win.event_types && win.event_types.CHAT_CHANGED) {
        win.eventSource.on(win.event_types.CHAT_CHANGED, scheduleApply);
      }
    } catch (e) {}
  }

  // ── M6：管理 UI（popup）──────────────────────────────────────────────────────
  function escHtml(s) { return (s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var POPUP_CSS =
    '#mc3-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;width:100dvw;height:100dvh;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.5);}' +
    '#mc3-popup{display:flex;flex-direction:column;width:min(560px,92vw);max-height:86vh;background:var(--SmartThemeBlurTintColor,#1e1e1e);color:var(--SmartThemeBodyColor,#eee);border:1px solid var(--SmartThemeBorderColor,#555);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);overflow:hidden;}' +
    '#mc3-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--SmartThemeBorderColor,#555);font-weight:bold;}' +
    '#mc3-head .mc3-x{cursor:pointer;background:none;border:none;color:inherit;font-size:18px;}' +
    '#mc3-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--SmartThemeBorderColor,#555);}' +
    '#mc3-tools .mc3-btn{cursor:pointer;background:var(--black30a,rgba(0,0,0,.3));color:inherit;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;padding:4px 10px;}' +
    '#mc3-tools .mc3-tip{opacity:.6;font-size:11px;margin-left:auto;}' +
    '#mc3-body{overflow-y:auto;padding:6px 10px 12px;}' +
    '.mc3-gname{margin:10px 4px 4px;font-weight:bold;opacity:.85;}' +
    '.mc3-gname small{opacity:.5;font-weight:normal;}' +
    '.mc3-row{display:flex;align-items:center;gap:8px;padding:6px 8px;margin:3px 0;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;background:var(--black30a,rgba(255,255,255,.03));}' +
    '.mc3-row.mc3-off{opacity:.45;}' +
    '.mc3-row.mc3-drag{background:var(--SmartThemeQuoteColor,#3a6);opacity:.9;}' +
    '.mc3-handle{cursor:grab;touch-action:none;opacity:.6;user-select:none;}' +
    '.mc3-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.mc3-row button{cursor:pointer;background:none;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:5px;color:inherit;padding:2px 8px;font-size:12px;}';

  function injectPopupCSS() {
    if (doc.getElementById('mc3-popup-style')) return;
    var st = doc.createElement('style'); st.id = 'mc3-popup-style'; st.textContent = POPUP_CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  // 提交重排序：在场 key 按新顺序取 0..N-1，缺席 key 按旧槽位顺序沉到末尾（无碰撞、可预期）。
  function commitReorder(groupId, orderedKeys) {
    var map = settings.order[groupId] || (settings.order[groupId] = {});
    var present = {}, newMap = {};
    orderedKeys.forEach(function (k, i) { newMap[k] = i; present[k] = 1; });
    var absent = Object.keys(map).filter(function (k) { return !present[k]; }).sort(function (a, b) { return map[a] - map[b]; });
    absent.forEach(function (k, i) { newMap[k] = orderedKeys.length + i; });
    settings.order[groupId] = newMap;
  }

  function resetAll() {
    settings.hidden = {};
    settings.order = JSON.parse(JSON.stringify(settings.nativeOrder || {}));
    settings.column = Object.assign({}, settings.nativeColumn || {});
    settings.columnMode = 'dual';
    saveSettings(); applyAll(); renderPopup();
  }

  function renderPopup() {
    var body = doc.getElementById('mc3-body'); if (!body) return;
    var setBtn = function (action, text) { var b = doc.querySelector('#mc3-tools [data-action="' + action + '"]'); if (b) b.textContent = text; };
    setBtn('enable', '启用: ' + (settings.enabled ? '开' : '关'));
    setBtn('colmode', '单双栏: ' + (settings.columnMode === 'single' ? '单' : '双'));
    var all = scanAll();
    var html = '';
    for (var gi = 0; gi < GROUPS.length; gi++) {
      var group = GROUPS[gi];
      var recs = (all[group.id] || []).slice();
      var map = settings.order[group.id] || {};
      recs.sort(function (a, b) { return (map[a.key] || 0) - (map[b.key] || 0); });
      html += '<div class="mc3-group"><div class="mc3-gname">' + escHtml(group.name) + ' <small>(' + recs.length + ')</small></div><div class="mc3-list" data-gid="' + group.id + '">';
      for (var ri = 0; ri < recs.length; ri++) {
        var r = recs[ri];
        var hidden = !!settings.hidden[r.key];
        var handle = '<span class="mc3-handle"' + (r.curated ? ' style="visibility:hidden"' : ' title="拖动排序"') + '>⠿</span>';
        var col = (settings.column[r.key] !== undefined ? settings.column[r.key] : r.column);
        var colBtn = (r.column !== undefined) ? '<button data-action="toggle-col" data-key="' + escHtml(r.key) + '" data-col="' + col + '" title="' + (col === 1 ? '当前右栏，点击移到左栏' : '当前左栏，点击移到右栏') + '">' + (col === 1 ? '◨' : '◧') + '</button>' : '';
        html += '<div class="mc3-row' + (hidden ? ' mc3-off' : '') + '" data-key="' + escHtml(r.key) + '">' +
          handle +
          '<span class="mc3-label">' + escHtml(r.label) + '</span>' + colBtn +
          '<button data-action="toggle-hide" data-key="' + escHtml(r.key) + '">' + (hidden ? '🚫' : '👁') + '</button>' +
          '</div>';
      }
      html += '</div></div>';
    }
    body.innerHTML = html;
  }

  function onPopupClick(e) {
    var t = e.target.closest('[data-action]'); if (!t) return;
    var a = t.getAttribute('data-action');
    if (a === 'close') { closePopup(); }
    else if (a === 'enable') { settings.enabled = !settings.enabled; saveSettings(); applyAll(); renderPopup(); }
    else if (a === 'colmode') { setColumnMode(settings.columnMode === 'dual' ? 'single' : 'dual'); renderPopup(); }
    else if (a === 'reset') { resetAll(); }
    else if (a === 'toggle-hide') { var k = t.getAttribute('data-key'); if (settings.hidden[k]) delete settings.hidden[k]; else settings.hidden[k] = true; saveSettings(); applyAll(); renderPopup(); }
    else if (a === 'toggle-col') { var k2 = t.getAttribute('data-key'); settings.column[k2] = Number(t.getAttribute('data-col')) === 1 ? 0 : 1; saveSettings(); applyAll(); renderPopup(); }
  }

  // Pointer 拖拽重排（鼠标 + 触摸 + 笔统一），提交到 order map
  function onPopupPointerDown(e) {
    var handle = e.target.closest('.mc3-handle'); if (!handle) return;
    var row = handle.closest('.mc3-row'); var list = handle.closest('.mc3-list'); if (!row || !list) return;
    e.preventDefault();
    var gid = list.getAttribute('data-gid');
    row.classList.add('mc3-drag');
    try { row.setPointerCapture(e.pointerId); } catch (_) {}
    function move(ev) {
      var rows = [].slice.call(list.querySelectorAll('.mc3-row:not(.mc3-drag)'));
      var after = null;
      for (var i = 0; i < rows.length; i++) { var rc = rows[i].getBoundingClientRect(); if (ev.clientY < rc.top + rc.height / 2) { after = rows[i]; break; } }
      if (after) list.insertBefore(row, after); else list.appendChild(row);
    }
    function up() {
      doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up);
      row.classList.remove('mc3-drag');
      var keys = [].slice.call(list.querySelectorAll('.mc3-row')).map(function (r) { return r.getAttribute('data-key'); });
      commitReorder(gid, keys); saveSettings(); applyAll();
    }
    doc.addEventListener('pointermove', move); doc.addEventListener('pointerup', up);
  }

  function buildPopup() {
    if (doc.getElementById('mc3-overlay')) return;
    injectPopupCSS();
    var ov = doc.createElement('div'); ov.id = 'mc3-overlay';
    ov.innerHTML = '<div id="mc3-popup">' +
      '<div id="mc3-head"><span>菜单精简器 · 方案3</span><button class="mc3-x" data-action="close">✕</button></div>' +
      '<div id="mc3-tools">' +
        '<button class="mc3-btn" data-action="enable">启用: 开</button>' +
        '<button class="mc3-btn" data-action="colmode">单双栏: 双</button>' +
        '<button class="mc3-btn" data-action="reset">恢复原始</button>' +
        '<span class="mc3-tip">⠿排序 · 👁显隐 · ◧◨切栏</span>' +
      '</div><div id="mc3-body"></div></div>';
    (doc.documentElement || doc.body).appendChild(ov);   // 挂到 html，规避主题祖先 transform/filter 致 fixed 偏移（#3）
    ov.addEventListener('click', function (e) { if (e.target === ov) closePopup(); });
    var popup = ov.querySelector('#mc3-popup');
    popup.addEventListener('click', onPopupClick);
    popup.addEventListener('pointerdown', onPopupPointerDown);
  }

  function openPopup() { buildPopup(); renderPopup(); doc.getElementById('mc3-overlay').style.display = 'flex'; }
  function closePopup() { var o = doc.getElementById('mc3-overlay'); if (o) o.style.display = 'none'; }

  // 魔棒入口：list-group-item（与魔棒其它项一致），点击打开操作面板
  function makeWandLauncher() {
    var el = doc.createElement('div');
    el.id = 'mc3-launcher-wand';
    el.className = 'list-group-item flex-container flexGap5 interactable';
    el.style.cursor = 'pointer';
    el.innerHTML = '<i class="fa-solid fa-bars-staggered"></i><span>菜单精简器</span>';
    el.addEventListener('click', openPopup);
    return el;
  }

  // 扩展面板入口：做成与其它扩展一致的 inline-drawer（点击展开），内含「启用」复选框 + 「打开操作面板」按钮（#2）
  function makePanelLauncher() {
    var d = doc.createElement('div');
    d.id = 'mc3-launcher-panel';
    d.className = 'inline-drawer';
    d.innerHTML =
      '<div class="inline-drawer-header" style="cursor:pointer">' +
        '<b>菜单精简器</b>' +
        '<div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>' +
      '</div>' +
      '<div class="inline-drawer-content" style="display:none">' +
        '<label class="checkbox_label" style="display:flex;gap:6px;align-items:center;margin:4px 2px"><input type="checkbox" id="mc3-enable-cb"><span>启用插件</span></label>' +
        '<div id="mc3-open-btn" class="menu_button" style="cursor:pointer;width:fit-content">打开操作面板</div>' +
      '</div>';
    var header = d.querySelector('.inline-drawer-header');
    var content = d.querySelector('.inline-drawer-content');
    var icon = d.querySelector('.inline-drawer-icon');
    header.addEventListener('click', function () {
      var openNow = content.style.display !== 'none';
      content.style.display = openNow ? 'none' : 'block';
      icon.classList.toggle('up', !openNow); icon.classList.toggle('down', openNow);
    });
    d.querySelector('#mc3-enable-cb').addEventListener('change', function (e) { settings.enabled = e.target.checked; saveSettings(); applyAll(); });
    d.querySelector('#mc3-open-btn').addEventListener('click', openPopup);
    return d;
  }

  var slashRegistered = false;
  // 两个入口都作为「普通条目」存在：可见性走 settings.hidden(小眼睛)、顺序走 order map(拖动手柄)（#1）。
  // 这里只负责「存在性」幂等补回 + 同步启用复选框，不再单独控制开闭。
  function setupLaunchers() {
    var wand = doc.getElementById('extensionsMenu');
    if (wand && !doc.getElementById('mc3-launcher-wand')) wand.appendChild(makeWandLauncher());
    var panel = doc.getElementById('extensions_settings');
    if (panel && !doc.getElementById('mc3-launcher-panel')) panel.insertBefore(makePanelLauncher(), panel.firstChild);
    var cb = doc.getElementById('mc3-enable-cb'); if (cb) cb.checked = !!settings.enabled;
    if (!slashRegistered) {
      try {
        var ctx = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
        if (ctx && typeof ctx.registerSlashCommand === 'function') {
          ctx.registerSlashCommand('menucleaner', function () { openPopup(); return ''; }, [], '打开菜单精简器·方案3', true, true);
          slashRegistered = true;
        }
      } catch (e) {}
    }
  }

  // ── 引导 ────────────────────────────────────────────────────────────────────
  function init() {
    loadSettings();
    var records = applyAll();
    setupObserver();
    setupLaunchers();
    win.__mc3 = {
      version: 'M7',
      settings: settings,
      groups: GROUPS,
      getGroup: getGroup,
      scanGroup: scanGroup,
      scanAll: scanAll,
      applyAll: applyAll,
      setColumnMode: setColumnMode,
      openPopup: openPopup,
      closePopup: closePopup,
      resetAll: resetAll,
      save: saveSettings,
      records: records,
    };
    console.log('[菜单精简器3] M6 初始化完成：管理 UI 就绪（魔棒"菜单精简器"或 /menucleaner 打开）');
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
