(function () {
  'use strict';

  // 酒馆助手在 iframe 中执行脚本，需要操作父页面的 document
  var doc = window.frameElement ? window.parent.document : document;
  var win = window.frameElement ? window.parent : window;



  // 独立 localStorage key，避免与主版本/旧版本互相污染
  const STORAGE_KEY = 'menu_cleaner3_settings'; // 保留：迁移源 + ctx 不可用时降级兜底
  const EXT_KEY = 'menu_cleaner3';              // 新：extension_settings 里的 key（与旧版残留 menu_cleaner 不冲突）
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
      // itemFilter 取结构化的 'a'（菜单项都是 <a>，自动排除 <hr> 分隔线），不再假设
      // id 以 option_ 开头 —— 第三方注入项（如世界书 #wb-menu-btn-v6）不守该命名约定。
      mode: 'children', itemFilter: 'a', label: 'text',
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

  // 支持子分组的三组（待办：仅左下/魔棒/扩展菜单）
  const SUBGROUP_GROUP_IDS = ['options', 'extensionsMenu', 'extensionsSettings'];

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
    subgroups: {},     // { groupId: [{ id, name, memberKeys[], collapsed?, column? }] }
                       // column 仅 extensionsSettings 子分组有效，决定组内条目归属栏位
  };
  let settings = {};

  // 实测：window.extension_settings 全局不可用，必须走 SillyTavern.getContext()。
  // init 时 extension_settings 天然就绪（酒馆助手脚本仓库本身就在 extension_settings.tavern_helper 里，
  // iframe 创建必然在其加载之后），无需等 APP_READY。
  function getCtx() {
    try { return win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null; }
    catch (e) { return null; }
  }

  function loadSettings() {
    var ctx = getCtx();
    var ext = ctx && ctx.extensionSettings ? ctx.extensionSettings[EXT_KEY] : null;
    if (ext && typeof ext === 'object') {
      settings = Object.assign({}, defaultSettings, ext);
    } else {
      // 新存储为空 → 检查 localStorage 迁移源
      try {
        var raw = win.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          settings = Object.assign({}, defaultSettings, JSON.parse(raw));
          // 迁移：写入 extension_settings，成功后清掉 localStorage
          if (ctx && ctx.extensionSettings && ctx.saveSettingsDebounced) {
            ctx.extensionSettings[EXT_KEY] = settings;
            ctx.saveSettingsDebounced();
            win.localStorage.removeItem(STORAGE_KEY);
            console.log('[菜单精简器] 已从 localStorage 迁移至 extension_settings');
          }
        } else {
          settings = Object.assign({}, defaultSettings);
        }
      } catch (e) {
        console.warn('[菜单精简器] 读取设置失败，用默认值', e);
        settings = Object.assign({}, defaultSettings);
      }
    }
    // 注意：刻意「不」清理当前不在场的 key —— 后加载元素要靠留存的 order/column/hidden 归位。
    if (!settings.hidden) settings.hidden = {};
    if (!settings.order) settings.order = {};
    if (!settings.column) settings.column = {};
    if (!settings.nativeColumn) settings.nativeColumn = {};
    if (!settings.nativeOrder) settings.nativeOrder = {};
    if (!settings.subgroups) settings.subgroups = {};
    // 确保所有有子分组能力的 groupId 在 subgroups 里有初始空数组
    for (var g = 0; g < SUBGROUP_GROUP_IDS.length; g++) {
      if (!settings.subgroups[SUBGROUP_GROUP_IDS[g]]) settings.subgroups[SUBGROUP_GROUP_IDS[g]] = [];
    }
  }

  function saveSettings() {
    var ctx = getCtx();
    if (ctx && ctx.extensionSettings && ctx.saveSettingsDebounced) {
      try { ctx.extensionSettings[EXT_KEY] = settings; ctx.saveSettingsDebounced(); return; }
      catch (e) { console.warn('[菜单精简器] 保存到 extension_settings 失败，降级 localStorage', e); }
    }
    // 降级：ctx 不可用时退回 localStorage
    try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
    catch (e) { console.warn('[菜单精简器] 保存设置失败', e); }
  }

  // ── 子分组工具 ─────────────────────────────────────────────────────────────
  function genSubgroupId() { return 'sg_' + Math.random().toString(36).slice(2, 10); }

  function getSubgroupForKey(groupId, key) {
    var list = settings.subgroups[groupId] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].memberKeys.indexOf(key) !== -1) return list[i];
    }
    return null;
  }

  function getSubgroupById(groupId, sgId) {
    var list = settings.subgroups[groupId] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === sgId) return list[i];
    }
    return null;
  }

  function addSubgroup(groupId) {
    if (SUBGROUP_GROUP_IDS.indexOf(groupId) === -1) return null;
    var list = settings.subgroups[groupId] || (settings.subgroups[groupId] = []);
    var sg = { id: genSubgroupId(), name: '新建分组', memberKeys: [], collapsed: false };
    if (groupId === 'extensionsSettings') sg.column = 0;
    list.push(sg);
    saveSettings();
    return sg;
  }

  function deleteSubgroup(groupId, sgId) {
    var list = settings.subgroups[groupId] || [];
    settings.subgroups[groupId] = list.filter(function (sg) { return sg.id !== sgId; });
    saveSettings();
  }

  function renameSubgroup(groupId, sgId, newName) {
    var sg = getSubgroupById(groupId, sgId);
    if (sg) { sg.name = newName; saveSettings(); }
  }

  function addKeyToSubgroup(groupId, sgId, key) {
    // 先从其他子分组中移除
    removeKeyFromAnySubgroup(groupId, key);
    var sg = getSubgroupById(groupId, sgId);
    if (sg && sg.memberKeys.indexOf(key) === -1) {
      sg.memberKeys.push(key);
      saveSettings();
    }
  }

  function removeKeyFromAnySubgroup(groupId, key) {
    var list = settings.subgroups[groupId] || [];
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      var idx = list[i].memberKeys.indexOf(key);
      if (idx !== -1) { list[i].memberKeys.splice(idx, 1); changed = true; }
    }
    if (changed) saveSettings();
  }

  // 构建 groupId 下 key→sgId 的快速查找表
  function buildKeyToSgMap(groupId) {
    var map = {};
    var list = settings.subgroups[groupId] || [];
    for (var i = 0; i < list.length; i++) {
      for (var j = 0; j < list[i].memberKeys.length; j++) {
        map[list[i].memberKeys[j]] = list[i].id;
      }
    }
    return map;
  }

  // ── 工具 ───────────────────────────────────────────────────────────────────
  function normLabel(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  // 元素是否带自身的直接文本节点（用于在 wrapper 内识别「带标签的按钮」，
  // 排除纯图标 <i>/结构 div。如 #ttsExtensionMenuItem 文本直挂、无 span）。
  function hasDirectText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.textContent.trim()) return true;
    }
    return false;
  }

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
        // 取第一个「非空」span：有些按钮把图标也包进 <span>（如 #favorites_button：
        // <span><i.fa-star></span><span>收藏</span>），首个 span 是空图标壳，旧逻辑
        // 直接取首个 span 会得空标签 → 整条被 scanGroup 丢弃。
        var sps = el.querySelectorAll('span');
        for (var si = 0; si < sps.length; si++) { var st = normLabel(sps[si].textContent); if (st) return st; }
        // 无非空 span：退回元素自身的直接文本节点（排除内部 <button>/徽标），再退回整体文本
        var dt = '';
        for (var di = 0; di < el.childNodes.length; di++) if (el.childNodes[di].nodeType === 3) dt += el.childNodes[di].textContent;
        return normLabel(dt) || normLabel(el.textContent);
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
      // 魔棒按钮的两种形态：
      //   ① #extensionsMenu 的直接 .list-group-item 子（无 wrapper，如本版入口 #mc3-launcher-wand）
      //   ② 被 ST 包进一层 *_wand_container(.extension_container, display:contents) —— 每个扩展的挂载点。
      // **同一挂载点内可并列多个按钮**（如 #sd_wand_container 有生成图片+停止生成），且不保证都带
      // .list-group-item 类：「隐藏助手」#hide-helper-wand-button 就是裸 div+<i>+<span>，与同容器的
      // #manageAttachments(LGI) 并列。旧逻辑「querySelectorAll(LGI) 一把抓 + 含 LGI 的 wrapper 整个跳过」
      // 会漏掉这类非 LGI 兄弟（待办 #1）。改为逐直接子：是挂载点则下潜一层逐按钮收，否则 c 本身即按钮。
      for (var w = 0; w < children.length; w++) {
        var c = children[w];
        if (isSelf(c)) continue;
        var isWrapper = c.classList.contains('extension_container') && !c.matches(group.itemMatch);
        if (!isWrapper) { out.push({ el: c, label: labelOf(c, group) }); continue; }
        // 挂载点：下潜一层，每个「带标签」的直接子即一个按钮（图标/文字在更深层，不会被误收）
        for (var x = 0; x < c.children.length; x++) {
          var gc = c.children[x];
          if (isSelf(gc)) continue;
          if (gc.matches(group.itemMatch) || gc.querySelector('span') || hasDirectText(gc)) {
            out.push({ el: gc, label: labelOf(gc, group) });
          }
        }
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

  // ── 应用层：原地排序(M2) + 可见性(M3) + 单双栏(M4) + 幂等observer(M5) + 子分组分隔线 ──────────
  // 全程不动源 DOM（除 M4 跨栏搬「顶层单元」这一处，用户显式触发 + observer 抑制）。

  var suppressObserver = false;   // 程序性 DOM 搬运期间抑制 observer，防回环
  var applyTimer = null;

  function injectStyle() {
    if (doc.getElementById('mc3-style')) return;
    var rules = ['.mc3-hidden{display:none !important;}', '.mc3-subgroup-sep{height:1px;border:none;background:var(--SmartThemeBorderColor,#555);margin:4px 8px;}'];
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

    // 子分组分栏约束：extensionsSettings 子分组内的条目遵循子分组的 column
    var keyToSgCol = {};
    var sgList = settings.subgroups['extensionsSettings'] || [];
    for (var si = 0; si < sgList.length; si++) {
      var sgCol = sgList[si].column !== undefined ? sgList[si].column : 0;
      for (var mi = 0; mi < sgList[si].memberKeys.length; mi++) {
        keyToSgCol[sgList[si].memberKeys[mi]] = sgCol;
      }
    }

    var moved = false;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.column === undefined) continue;
      if (settings.nativeColumn[r.key] === undefined) settings.nativeColumn[r.key] = r.column; // 首次=原生
      var target;
      if (keyToSgCol[r.key] !== undefined) {
        target = single ? 0 : keyToSgCol[r.key]; // 子分组栏位覆盖个体设置
      } else {
        target = single ? 0 : (settings.column[r.key] !== undefined ? settings.column[r.key] : r.column);
      }
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
      // 子分组的 column 也归零
      var sgList = settings.subgroups['extensionsSettings'] || [];
      for (var s = 0; s < sgList.length; s++) sgList[s].column = 0;
    }
    settings.columnMode = mode;
    saveSettings();
    applyAll();
  }

  // 子分组分隔线：仅在左下菜单(options)和魔棒(extensionsMenu)注入真实 <hr>
  function applySubgroupSeparators(group, records) {
    if (group.id !== 'options' && group.id !== 'extensionsMenu') return;

    // 先清除旧的子分组分隔线
    var containers = group.containers;
    for (var ci = 0; ci < containers.length; ci++) {
      var container = doc.querySelector(containers[ci]);
      if (!container) continue;
      var oldSeps = container.querySelectorAll('.mc3-subgroup-sep');
      for (var s = 0; s < oldSeps.length; s++) oldSeps[s].remove();
    }

    if (!settings.enabled) return;

    var sgList = settings.subgroups[group.id] || [];
    if (!sgList.length) return;

    // 构建 key→sgId 映射
    var keyToSg = buildKeyToSgMap(group.id);
    // 按 order 排序
    var map = settings.order[group.id] || {};
    var sorted = records.slice().sort(function (a, b) { return (map[a.key] || 0) - (map[b.key] || 0); });

    // 扫描排序后的条目序列，在子分组边界注入 <hr>
    // 逻辑：相邻两条目分别属于不同子分组/非子分组 → 中间插分隔线
    for (var i = 0; i < sorted.length - 1; i++) {
      var sgA = keyToSg[sorted[i].key] || null;
      var sgB = keyToSg[sorted[i + 1].key] || null;
      if (sgA !== sgB) {
        // 边界：在 sorted[i] 的 unit 之后插入分隔线
        var unit = sorted[i].unit;
        if (unit && unit.parentNode) {
          var hr = doc.createElement('hr');
          hr.className = 'mc3-subgroup-sep';
          unit.parentNode.insertBefore(hr, unit.nextSibling);
        }
      }
    }
  }

  function applyGroup(group, records) {
    if (group.id === 'extensionsSettings') applyColumns(records); // 先定栏（唯一搬 DOM 处）
    applyOrder(group, records);                                   // 再排序（CSS order）
    applyHides(group, records);                                   // 再可见性
    applySubgroupSeparators(group, records);                      // 子分组分隔线（options/魔棒）
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

  // 隐藏左下菜单和魔棒菜单中的原生 <hr> 分隔线：排序/隐藏条目后原生分隔线失去语义，全部收起。
  function applySeparatorHides(on) {
    var sels = ['#options .options-content > hr:not(.mc3-subgroup-sep)', '#extensionsMenu > hr:not(.mc3-subgroup-sep)'];
    for (var i = 0; i < sels.length; i++) {
      var hrs = doc.querySelectorAll(sels[i]);
      for (var j = 0; j < hrs.length; j++) hrs[j].classList.toggle('mc3-hidden', on);
    }
  }

  function applyAll() {
    injectStyle();
    setupLaunchers();   // 幂等：先补回入口，使其作为普通条目被随后的 scanAll 扫描/排序/隐藏（#1）
    applyAlwaysHidden(settings.enabled);
    applySeparatorHides(settings.enabled);
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
    var watched = [];
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
        if (el && !seen.has(el)) { seen.add(el); obs.observe(el, { childList: true, subtree: true }); watched.push(el); }
      }
    }
    // 启动期临时加挂 characterData 监听：部分扩展（保活/输入助手等 Vue 组件）先插入「空标签」外壳
    // —— childList 触发一次 applyAll，但此刻 <b> 标签为空 → 条目被 scanGroup 的 if(!label) 跳过 ——
    // 稍后才用 characterData 补填 <b> 文本。主 observer 只监听 childList 对此盲，导致该条目永久漏隐藏/
    // 漏排序，直到用户手动重开插件（0623 根因，已 Playwright 合成复现）。仅在启动窗口监听 characterData，
    // 规避稳态下面板内 live 文本（计数器/状态）频繁触发扫描（实测稳态 idle 的 characterData 为 0）。
    var cdObs = new win.MutationObserver(function () { if (!suppressObserver) scheduleApply(); });
    for (var w = 0; w < watched.length; w++) cdObs.observe(watched[w], { characterData: true, subtree: true });
    win.setTimeout(function () { cdObs.disconnect(); }, 20000);
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
    '#mc3-popup{display:flex;flex-direction:column;width:min(600px,94vw);max-height:86vh;background:var(--SmartThemeBlurTintColor,#1e1e1e);color:var(--SmartThemeBodyColor,#eee);border:1px solid var(--SmartThemeBorderColor,#555);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);overflow:hidden;}' +
    '#mc3-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--SmartThemeBorderColor,#555);font-weight:bold;}' +
    '#mc3-head .mc3-x{cursor:pointer;background:none;border:none;color:inherit;font-size:18px;}' +
    '#mc3-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--SmartThemeBorderColor,#555);}' +
    '#mc3-tools .mc3-btn{cursor:pointer;background:var(--black30a,rgba(0,0,0,.3));color:inherit;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;padding:4px 10px;}' +
    '#mc3-tools .mc3-tip{opacity:.6;font-size:11px;margin-left:auto;}' +
    '#mc3-body{overflow-y:auto;padding:6px 10px 12px;}' +
    // 卡片样式
    '.mc3-card{background:var(--black20a,rgba(255,255,255,.02));border:1px solid var(--SmartThemeBorderColor,#444);border-radius:10px;margin:8px 4px;overflow:hidden;}' +
    '.mc3-card-header{display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--black30a,rgba(0,0,0,.2));font-weight:bold;font-size:13px;border-bottom:1px solid var(--SmartThemeBorderColor,#444);}' +
    '.mc3-card-header small{opacity:.5;font-weight:normal;margin-right:auto;}' +
    '.mc3-card-title{opacity:.9;}' +
    // 图标按钮（+ ✎ ✕）
    '.mc3-icon-btn{cursor:pointer;background:none;border:none;color:inherit;opacity:.6;font-size:14px;padding:0 4px;line-height:1;transition:opacity .15s;}' +
    '.mc3-icon-btn:hover{opacity:1;}' +
    // 列表（卡片内）
    '.mc3-list{padding:2px 0;}' +
    // 行样式 — 无边框
    '.mc3-row{display:flex;align-items:center;gap:8px;padding:5px 10px;margin:0;border:none;border-radius:0;background:transparent;}' +
    '.mc3-row:hover{background:var(--black20a,rgba(255,255,255,.03));}' +
    '.mc3-row.mc3-off{opacity:.4;}' +
    '.mc3-row.mc3-drag{background:var(--SmartThemeQuoteColor,#3a6);opacity:.9;border-radius:6px;}' +
    '.mc3-handle{cursor:grab;touch-action:none;opacity:.5;user-select:none;font-size:14px;flex-shrink:0;}' +
    '.mc3-handle:hover{opacity:.9;}' +
    '.mc3-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;}' +
    // Toggle 按钮（显隐 / 左右栏）
    '.mc3-toggle{cursor:pointer;background:var(--black30a,rgba(0,0,0,.25));color:inherit;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:5px;padding:2px 10px;font-size:11px;white-space:nowrap;flex-shrink:0;min-width:34px;text-align:center;transition:background .15s;}' +
    '.mc3-toggle:hover{background:var(--black50a,rgba(128,128,128,.3));}' +
    '.mc3-toggle.on{background:var(--SmartThemeQuoteColor,#3a6);border-color:transparent;color:#fff;}' +
    // 子分组
    '.mc3-subgroup{margin:2px 6px;border:1px dashed var(--SmartThemeBorderColor,#444);border-radius:8px;overflow:hidden;}' +
    '.mc3-subgroup-header{display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--black20a,rgba(255,255,255,.02));cursor:default;}' +
    '.mc3-subgroup-header .mc3-sg-handle{cursor:grab;touch-action:none;opacity:.5;user-select:none;font-size:14px;flex-shrink:0;}' +
    '.mc3-subgroup-header .mc3-sg-handle:hover{opacity:.9;}' +
    '.mc3-subgroup-collapse{cursor:pointer;font-size:10px;opacity:.7;flex-shrink:0;width:14px;text-align:center;}' +
    '.mc3-subgroup-name{font-weight:bold;font-size:12px;opacity:.85;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.mc3-subgroup-items{padding:0;}' +
    '.mc3-subgroup-items .mc3-row{padding-left:18px;}' +
    // 重命名输入框
    '.mc3-rename-input{background:var(--black30a,rgba(0,0,0,.3));color:inherit;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:4px;padding:2px 6px;font-size:12px;width:120px;flex:1;}' +
    // 子分组拖入高亮
    '.mc3-subgroup.mc3-drop-target{border-color:var(--SmartThemeQuoteColor,#3a6);border-style:solid;background:rgba(58,170,102,.08);}';

  function injectPopupCSS() {
    if (doc.getElementById('mc3-popup-style')) return;
    var st = doc.createElement('style'); st.id = 'mc3-popup-style'; st.textContent = POPUP_CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  // 提交重排序：在场 key 按新顺序取 0..N-1，缺席 key 按旧槽位顺序沉到末尾（无碰撞、可预期）。
  // 子分组打包：同子分组的所有 memberKeys 取连续槽位，整体跟随第一个被拖动的成员。
  function commitReorder(groupId, orderedKeys) {
    var map = settings.order[groupId] || (settings.order[groupId] = {});
    var sgList = settings.subgroups[groupId] || [];

    // 构建 key→sg 的查找
    var keyToSg = {};
    var sgMembers = {}; // sgId -> memberKeys[]
    for (var si = 0; si < sgList.length; si++) {
      var sg = sgList[si];
      sgMembers[sg.id] = sg.memberKeys.slice();
      for (var mi = 0; mi < sg.memberKeys.length; mi++) {
        keyToSg[sg.memberKeys[mi]] = sg.id;
      }
    }

    var newMap = {};
    var slot = 0;
    var processedSg = {};
    var present = {};

    for (var i = 0; i < orderedKeys.length; i++) {
      var key = orderedKeys[i];
      var sgId = keyToSg[key];
      if (sgId && !processedSg[sgId]) {
        // 子分组打包：所有成员取连续槽位，组内按原有顺序排列
        var members = sgMembers[sgId].slice();
        members.sort(function (a, b) { return (map[a] || 0) - (map[b] || 0); });
        for (var j = 0; j < members.length; j++) {
          newMap[members[j]] = slot++;
          present[members[j]] = 1;
        }
        processedSg[sgId] = true;
      } else if (!sgId) {
        newMap[key] = slot++;
        present[key] = 1;
      }
      // sgId && processedSg[sgId] → 同组后续成员，已在前面打包时一起分配，跳过
    }

    // 缺席 key：不在任何已处理子分组中，也不在 orderedKeys 里 → 沉底
    var absent = Object.keys(map).filter(function (k) { return !present[k]; }).sort(function (a, b) { return map[a] - map[b]; });
    for (var a = 0; a < absent.length; a++) { newMap[absent[a]] = slot++; }
    settings.order[groupId] = newMap;
  }

  function resetAll() {
    settings.hidden = {};
    settings.order = JSON.parse(JSON.stringify(settings.nativeOrder || {}));
    settings.column = Object.assign({}, settings.nativeColumn || {});
    settings.columnMode = 'dual';
    // 清空全部子分组（不保留——恢复原始就是回到最初状态）
    settings.subgroups = {};
    for (var g = 0; g < SUBGROUP_GROUP_IDS.length; g++) {
      settings.subgroups[SUBGROUP_GROUP_IDS[g]] = [];
    }
    saveSettings(); applyAll(); renderPopup();
  }

  // ── Popup 渲染 ──────────────────────────────────────────────────────────────

  // 渲染子分组标题栏
  // 左侧：拖拽手柄 + 标题 + 重命名 ｜ 右侧（视觉从左到右）：折叠三角 + 显隐 + 分栏(可选) + 删除
  function renderSubgroupHeader(sg, group, recs, map) {
    var allHidden = recs.length > 0 && recs.every(function (r) { return !!settings.hidden[r.key]; });
    var hideLabel = allHidden ? '隐藏' : '显示';
    var html = '<div class="mc3-subgroup-header">';
    // 左侧组
    html += '<span class="mc3-handle mc3-sg-handle" title="拖动子分组排序">⠿</span>';
    html += '<span class="mc3-subgroup-name" data-sgid="' + sg.id + '" data-gid="' + group.id + '">' + escHtml(sg.name) + '</span>';
    html += '<button class="mc3-icon-btn" data-action="start-rename-sg" data-sgid="' + sg.id + '" data-gid="' + group.id + '" title="重命名">✎</button>';
    // 右侧组（用 margin-left:auto 推到右边），toggle 顺序与条目行一致：分栏 → 显隐
    html += '<span class="mc3-subgroup-collapse" data-action="toggle-subgroup" data-sgid="' + sg.id + '" data-gid="' + group.id + '" style="margin-left:auto">' + (sg.collapsed ? '▶' : '▼') + '</span>';
    if (group.id === 'extensionsSettings') {
      var sgCol = sg.column !== undefined ? sg.column : 0;
      html += '<button class="mc3-toggle" data-action="toggle-sg-col" data-sgid="' + sg.id + '" data-gid="' + group.id + '" data-col="' + sgCol + '">' + (sgCol === 1 ? '右' : '左') + '</button>';
    }
    html += '<button class="mc3-toggle' + (allHidden ? '' : ' on') + '" data-action="toggle-sg-hide" data-sgid="' + sg.id + '" data-gid="' + group.id + '">' + hideLabel + '</button>';
    html += '<button class="mc3-icon-btn" data-action="delete-subgroup" data-sgid="' + sg.id + '" data-gid="' + group.id + '" title="删除分组">✕</button>';
    html += '</div>';
    return html;
  }

  // 渲染单行条目
  function renderItemRow(r, group, inSubgroup) {
    var hidden = !!settings.hidden[r.key];
    var col = (settings.column[r.key] !== undefined ? settings.column[r.key] : r.column);
    var html = '<div class="mc3-row' + (hidden ? ' mc3-off' : '') + '" data-key="' + escHtml(r.key) + '" data-gid="' + group.id + '">';

    // 拖动手柄（preset curated 不可拖）
    if (r.curated) {
      html += '<span style="visibility:hidden;width:16px;flex-shrink:0"></span>';
    } else {
      html += '<span class="mc3-handle" title="拖动排序">⠿</span>';
    }

    html += '<span class="mc3-label">' + escHtml(r.label) + '</span>';

    // 分栏切换 —— 仅扩展面板非子分组内条目（子分组内条目由子分组的栏位统一控制）
    if (r.column !== undefined && group.id === 'extensionsSettings' && !inSubgroup) {
      var colLabel = col === 1 ? '右' : '左';
      html += '<button class="mc3-toggle" data-action="toggle-col" data-key="' + escHtml(r.key) + '" data-col="' + col + '">' + colLabel + '</button>';
    }

    // 显隐 Toggle
    html += '<button class="mc3-toggle' + (hidden ? '' : ' on') + '" data-action="toggle-hide" data-key="' + escHtml(r.key) + '">' + (hidden ? '隐藏' : '显示') + '</button>';

    html += '</div>';
    return html;
  }

  function renderPopup() {
    var body = doc.getElementById('mc3-body'); if (!body) return;
    var setBtn = function (action, text) { var b = doc.querySelector('#mc3-tools [data-action="' + action + '"]'); if (b) b.textContent = text; };
    setBtn('enable', '启用: ' + (settings.enabled ? '开' : '关'));
    setBtn('colmode', '单双栏: ' + (settings.columnMode === 'single' ? '单' : '双'));
    var all = scanAll();

    // 确保 subgroups 初始化
    if (!settings.subgroups) settings.subgroups = {};
    for (var g = 0; g < SUBGROUP_GROUP_IDS.length; g++) {
      if (!settings.subgroups[SUBGROUP_GROUP_IDS[g]]) settings.subgroups[SUBGROUP_GROUP_IDS[g]] = [];
    }

    var html = '';
    for (var gi = 0; gi < GROUPS.length; gi++) {
      var group = GROUPS[gi];
      var recs = (all[group.id] || []).slice();
      var map = settings.order[group.id] || {};
      var supportsSg = SUBGROUP_GROUP_IDS.indexOf(group.id) !== -1;
      var sgList = supportsSg ? (settings.subgroups[group.id] || []) : [];

      // 排序
      recs.sort(function (a, b) { return (map[a.key] || 0) - (map[b.key] || 0); });

      // 构建 key→sg 映射 & sg 数据
      var keyToSg = {};
      var sgData = {}; // sgId -> { subgroup, records[], minSlot }
      for (var si = 0; si < sgList.length; si++) {
        var sg = sgList[si];
        sgData[sg.id] = { subgroup: sg, records: [], minSlot: Infinity };
        for (var mi = 0; mi < sg.memberKeys.length; mi++) {
          keyToSg[sg.memberKeys[mi]] = sg.id;
        }
      }

      // 构建展示单元列表
      var units = [];
      for (var ri = 0; ri < recs.length; ri++) {
        var r = recs[ri];
        var sgId = keyToSg[r.key];
        if (sgId && sgData[sgId]) {
          sgData[sgId].records.push(r);
          var slot = map[r.key] || 0;
          if (slot < sgData[sgId].minSlot) sgData[sgId].minSlot = slot;
        } else {
          units.push({ type: 'item', record: r, slot: map[r.key] || 0 });
        }
      }
      // 把有成员的子分组也加入单元列表
      for (var sid in sgData) {
        if (sgData[sid].records.length > 0) {
          units.push({ type: 'subgroup', data: sgData[sid], slot: sgData[sid].minSlot });
        }
      }
      // 排序单元
      units.sort(function (a, b) { return a.slot - b.slot; });

      // === 渲染卡片 ===
      html += '<div class="mc3-card">';
      // 卡片标题
      html += '<div class="mc3-card-header">';
      html += '<span class="mc3-card-title">' + escHtml(group.name) + '</span>';
      html += '<small>(' + recs.length + ')</small>';
      if (supportsSg) {
        html += '<button class="mc3-icon-btn" data-action="add-subgroup" data-gid="' + group.id + '" title="新建子分组" style="font-size:18px;font-weight:bold">+</button>';
      }
      html += '</div>';

      // 列表区
      html += '<div class="mc3-list" data-gid="' + group.id + '">';

      // 空子分组（无成员）始终出现在父分组顶部，方便用户看到新建的分组
      for (var esi = 0; esi < sgList.length; esi++) {
        var emptySg = sgList[esi];
        if (sgData[emptySg.id] && sgData[emptySg.id].records.length > 0) continue; // 有成员，走下方 units 渲染
        html += '<div class="mc3-subgroup" data-sgid="' + emptySg.id + '" data-gid="' + group.id + '">';
        html += renderSubgroupHeader(emptySg, group, [], map);
        if (!emptySg.collapsed) {
          html += '<div class="mc3-subgroup-items" data-sgid="' + emptySg.id + '" data-gid="' + group.id + '">';
          html += '<div class="mc3-row" style="opacity:.25;font-style:italic;justify-content:center;padding:10px;font-size:12px">拖动条目到此处加入分组</div>';
          html += '</div>';
        }
        html += '</div>';
      }

      for (var ui = 0; ui < units.length; ui++) {
        var unit = units[ui];
        if (unit.type === 'item') {
          html += renderItemRow(unit.record, group, false);
        } else {
          // 子分组（有成员）
          var sg = unit.data.subgroup;
          var sgRecs = unit.data.records;
          sgRecs.sort(function (a, b) { return (map[a.key] || 0) - (map[b.key] || 0); });

          html += '<div class="mc3-subgroup" data-sgid="' + sg.id + '" data-gid="' + group.id + '">';
          html += renderSubgroupHeader(sg, group, sgRecs, map);

          if (!sg.collapsed) {
            html += '<div class="mc3-subgroup-items" data-sgid="' + sg.id + '" data-gid="' + group.id + '">';
            for (var sri = 0; sri < sgRecs.length; sri++) {
              html += renderItemRow(sgRecs[sri], group, true);
            }
            html += '</div>';
          }
          html += '</div>';
        }
      }

      html += '</div></div>'; // .mc3-list, .mc3-card
    }
    body.innerHTML = html;
  }

  // ── Popup 事件处理 ──────────────────────────────────────────────────────────

  function onPopupClick(e) {
    var t = e.target.closest('[data-action]'); if (!t) return;
    var a = t.getAttribute('data-action');

    if (a === 'close') { closePopup(); }
    else if (a === 'enable') { settings.enabled = !settings.enabled; saveSettings(); applyAll(); renderPopup(); }
    else if (a === 'colmode') { setColumnMode(settings.columnMode === 'dual' ? 'single' : 'dual'); renderPopup(); }
    else if (a === 'reset') { resetAll(); }
    else if (a === 'toggle-hide') {
      var k = t.getAttribute('data-key');
      if (settings.hidden[k]) delete settings.hidden[k]; else settings.hidden[k] = true;
      saveSettings(); applyAll(); renderPopup();
    }
    else if (a === 'toggle-col') {
      var k2 = t.getAttribute('data-key');
      settings.column[k2] = Number(t.getAttribute('data-col')) === 1 ? 0 : 1;
      saveSettings(); applyAll(); renderPopup();
    }
    // 子分组操作
    else if (a === 'add-subgroup') {
      var gid = t.getAttribute('data-gid');
      addSubgroup(gid);
      renderPopup();
    }
    else if (a === 'delete-subgroup') {
      var delGid = t.getAttribute('data-gid');
      var delSgId = t.getAttribute('data-sgid');
      var delSg = getSubgroupById(delGid, delSgId);
      var delName = delSg ? delSg.name : '未知分组';
      if (!confirm('确定要删除子分组"' + delName + '"吗？\n分组内所有条目将按当前顺序回到列表中。')) return;
      deleteSubgroup(delGid, delSgId);
      applyAll();
      renderPopup();
    }
    else if (a === 'toggle-subgroup') {
      var tgGid = t.getAttribute('data-gid');
      var tgSgId = t.getAttribute('data-sgid');
      var tgSg = getSubgroupById(tgGid, tgSgId);
      if (tgSg) { tgSg.collapsed = !tgSg.collapsed; saveSettings(); renderPopup(); }
    }
    else if (a === 'toggle-sg-hide') {
      var thGid = t.getAttribute('data-gid');
      var thSgId = t.getAttribute('data-sgid');
      var thSg = getSubgroupById(thGid, thSgId);
      if (!thSg) return;
      // 判断当前状态：全员隐藏 → 全部显示；否则 → 全部隐藏
      var allHidden = thSg.memberKeys.length > 0 && thSg.memberKeys.every(function (k) { return !!settings.hidden[k]; });
      for (var mi = 0; mi < thSg.memberKeys.length; mi++) {
        if (allHidden) delete settings.hidden[thSg.memberKeys[mi]];
        else settings.hidden[thSg.memberKeys[mi]] = true;
      }
      saveSettings(); applyAll(); renderPopup();
    }
    else if (a === 'toggle-sg-col') {
      var tcGid = t.getAttribute('data-gid');
      var tcSgId = t.getAttribute('data-sgid');
      var tcSg = getSubgroupById(tcGid, tcSgId);
      if (tcSg) { tcSg.column = tcSg.column === 1 ? 0 : 1; saveSettings(); applyAll(); renderPopup(); }
    }
    else if (a === 'start-rename-sg') {
      var rnGid = t.getAttribute('data-gid');
      var rnSgId = t.getAttribute('data-sgid');
      // 找到对应的 .mc3-subgroup-name span 并替换为输入框
      var nameSpan = doc.querySelector('.mc3-subgroup-name[data-sgid="' + rnSgId + '"][data-gid="' + rnGid + '"]');
      if (!nameSpan) return;
      var sg = getSubgroupById(rnGid, rnSgId);
      if (!sg) return;
      var input = doc.createElement('input');
      input.type = 'text';
      input.className = 'mc3-rename-input';
      input.value = sg.name;
      nameSpan.replaceWith(input);
      input.focus();
      input.select();
      var finishRename = function () {
        var newName = input.value.trim() || '新建分组';
        renameSubgroup(rnGid, rnSgId, newName);
        renderPopup();
      };
      input.addEventListener('blur', finishRename);
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { input.blur(); }
        if (ev.key === 'Escape') { renderPopup(); }
      });
    }
  }

  // ── Pointer 拖拽重排（鼠标 + 触摸 + 笔统一）─────────────────────────────────
  // 支持：
  //   - 普通条目在列表内排序（子分组内条目打包移动）
  //   - 条目拖入子分组区域 → 吸入子分组
  //   - 条目拖出子分组 → 移出子分组

  var dragMeta = null; // { row, list, gid, key, startSgId }

  // 在拖拽位置找到 .mc3-subgroup-items 容器（或穿透到子分组 header 取其内部 items）
  function findDropTarget(ev) {
    var el = doc.elementFromPoint(ev.clientX, ev.clientY);
    if (!el) return null;
    var items = el.closest('.mc3-subgroup-items');
    if (items) return items;
    // 也可能悬停在子分组 header 上 → 取其内部的 items
    var sg = el.closest('.mc3-subgroup');
    if (sg) {
      var sgItems = sg.querySelector('.mc3-subgroup-items');
      if (sgItems) return sgItems;
    }
    return null;
  }

  // 在指定容器中找到 row 的视觉插入位置
  function findInsertAfter(container, row, clientY) {
    var children = container.children;
    var after = null;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child === row) continue;
      if (!child.classList.contains('mc3-row') && !child.classList.contains('mc3-subgroup')) continue;
      var rc = child.getBoundingClientRect();
      if (clientY < rc.top + rc.height / 2) { after = child; break; }
    }
    if (after) {
      container.insertBefore(row, after);
    } else {
      container.appendChild(row);
    }
  }

  function onPopupPointerDown(e) {
    var handle = e.target.closest('.mc3-handle'); if (!handle) return;
    var isSgHandle = handle.classList.contains('mc3-sg-handle');
    var dragEl, list;
    if (isSgHandle) {
      dragEl = handle.closest('.mc3-subgroup'); if (!dragEl) return;
      list = dragEl.closest('.mc3-list'); if (!list) return;
    } else {
      dragEl = handle.closest('.mc3-row'); if (!dragEl) return;
      list = dragEl.closest('.mc3-list'); if (!list) return;
    }
    e.preventDefault();

    var gid = list.getAttribute('data-gid');
    var key = isSgHandle ? null : dragEl.getAttribute('data-key');
    var startSg = key ? getSubgroupForKey(gid, key) : null;
    var startSgId = startSg ? startSg.id : null;

    dragEl.classList.add('mc3-drag');
    try { dragEl.setPointerCapture(e.pointerId); } catch (_) {}

    dragMeta = { row: dragEl, list: list, gid: gid, key: key, startSgId: startSgId, isSg: isSgHandle };

    var allSubgroups = list.querySelectorAll('.mc3-subgroup');

    function move(ev) {
      if (isSgHandle) {
        // 子分组拖拽：只在 list 层级移动，不进入其它子分组
        findInsertAfter(list, dragEl, ev.clientY);
      } else {
        var dropTarget = findDropTarget(ev);

        // 更新子分组高亮
        for (var s = 0; s < allSubgroups.length; s++) allSubgroups[s].classList.remove('mc3-drop-target');
        if (dropTarget) {
          var parentSg = dropTarget.closest('.mc3-subgroup');
          if (parentSg) parentSg.classList.add('mc3-drop-target');
          // 将 dragEl 移入 dropTarget 并找插入位置
          findInsertAfter(dropTarget, dragEl, ev.clientY);
        } else {
          // dragEl 不在任何子分组上 → 确保它在 list 层级，再找列表级插入位置
          if (dragEl.parentNode !== list) { list.appendChild(dragEl); }
          findInsertAfter(list, dragEl, ev.clientY);
        }
      }

      // 记录最后坐标供 up 使用
      dragMeta._lastX = ev.clientX;
      dragMeta._lastY = ev.clientY;
    }

    function up() {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);

      dragEl.classList.remove('mc3-drag');
      for (var s = 0; s < allSubgroups.length; s++) allSubgroups[s].classList.remove('mc3-drop-target');

      if (!isSgHandle) {
        // 条目拖拽：从 DOM 位置推断最终归属的子分组
        var finalTarget = findDropTarget({ clientX: dragMeta._lastX || 0, clientY: dragMeta._lastY || 0 });
        var targetSgId = finalTarget ? finalTarget.getAttribute('data-sgid') : null;

        // 更新子分组成员关系
        if (targetSgId && targetSgId !== dragMeta.startSgId) {
          // 拖入了（新的）子分组
          addKeyToSubgroup(dragMeta.gid, targetSgId, dragMeta.key);
        } else if (!targetSgId && dragMeta.startSgId) {
          // 从子分组拖出到外部
          removeKeyFromAnySubgroup(dragMeta.gid, dragMeta.key);
        }
      }

      // 提交排序：收集 list 下所有 .mc3-row（含嵌套在子分组内的），
      // 按 DOM 序 = 视觉序，commitReorder 负责子分组打包
      var orderedKeys = [];
      var allRows = list.querySelectorAll('.mc3-row');
      for (var r = 0; r < allRows.length; r++) {
        orderedKeys.push(allRows[r].getAttribute('data-key'));
      }
      commitReorder(dragMeta.gid, orderedKeys);
      saveSettings();
      applyAll();
      renderPopup();
      dragMeta = null;
    }

    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', up);
  }

  function buildPopup() {
    if (doc.getElementById('mc3-overlay')) return;
    injectPopupCSS();
    var ov = doc.createElement('div'); ov.id = 'mc3-overlay';
    ov.innerHTML = '<div id="mc3-popup">' +
      '<div id="mc3-head"><span>菜单精简器</span><button class="mc3-x" data-action="close">✕</button></div>' +
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
      '<div class="inline-drawer-toggle inline-drawer-header">' +
        '<b>菜单精简器</b>' +
        '<div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>' +
      '</div>' +
      '<div class="inline-drawer-content" style="display:none">' +
        '<label class="checkbox_label" style="display:flex;gap:6px;align-items:center;margin:4px 2px"><input type="checkbox" id="mc3-enable-cb"><span>启用插件</span></label>' +
        '<div id="mc3-open-btn" class="menu_button" style="cursor:pointer;width:fit-content">打开操作面板</div>' +
      '</div>';
    var content = d.querySelector('.inline-drawer-content');
    var icon = d.querySelector('.inline-drawer-icon');
    // header 用原生 `inline-drawer-toggle inline-drawer-header` 类获得与其它扩展完全一致的样式；
    // 自行处理展开并 stopImmediatePropagation 阻断 ST 的委托 toggle，避免双重切换。
    d.querySelector('.inline-drawer-header').addEventListener('click', function (e) {
      e.stopImmediatePropagation();
      var openNow = content.style.display !== 'none';
      content.style.display = openNow ? 'none' : 'block';
      icon.classList.toggle('up', !openNow); icon.classList.toggle('down', openNow);
    });
    d.querySelector('#mc3-enable-cb').addEventListener('change', function (e) { settings.enabled = e.target.checked; saveSettings(); applyAll(); });
    d.querySelector('#mc3-open-btn').addEventListener('click', function (e) { e.stopPropagation(); openPopup(); });
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
          ctx.registerSlashCommand('menucleaner', function () { openPopup(); return ''; }, [], '打开菜单精简器', true, true);
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
    // 启动补扫：异步/Vue 扩展的条目可能在初次 applyAll 之后才挂载或补标签（慢设备尤甚）。
    // 在启动后几个递增时点重跑 applyAll，覆盖各种晚到时序，等价于用户「关掉再开启插件」的手动补救；
    // 仅启动时一次性，稳态零开销。与 setupObserver 的 characterData 启动监听互为冗余兜底。
    [600, 1800, 4000, 8000].forEach(function (d) {
      win.setTimeout(function () { if (!suppressObserver) applyAll(); }, d);
    });
    win.__mc3 = {
      version: 'M9',
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
      addSubgroup: addSubgroup,
      deleteSubgroup: deleteSubgroup,
      renameSubgroup: renameSubgroup,
      getSubgroupForKey: getSubgroupForKey,
      records: records,
    };
    console.log('[菜单精简器] 初始化完成：管理 UI 就绪（魔棒"菜单精简器"或 /menucleaner 打开）');
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
