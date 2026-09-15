(function () {
  'use strict';

  // version 915.0.0

  // iframe穿透
  var doc = window.frameElement ? window.parent.document : document;
  var win = window.frameElement ? window.parent : window;



  // 这部分用于避免版本污染（以及一些历史残留问题？）
  const STORAGE_KEY = 'menu_cleaner3_settings'; 
  const EXT_KEY = 'menu_cleaner3';              
  const OWN_PREFIX = 'mc3-';   // 用于区分此插件注入元素的前缀

  // id 是否「稳定、可用作 key」：排除空、本版自身、以及旧版方案2 残留的 menu-cleaner-auto-* 自增 id
  function isStableId(id) {
    return !!id && id.indexOf(OWN_PREFIX) !== 0 && id.indexOf('menu-cleaner-auto-') !== 0 && /^[A-Za-z][\w:-]*$/.test(id);
  }

  // 扫描器
  // 分组定义
  const GROUPS = [
    {
      id: 'options', name: '左下菜单',
      button: '#options_button',
      containers: ['#options .options-content'],
      forceFlex: true,                 
      mode: 'children', itemFilter: 'a', label: 'text',
    },
    {
      id: 'extensionsMenu', name: '魔棒',
      button: '#extensionsMenuButton',
      containers: ['#extensionsMenu'],
      forceFlex: true,
      mode: 'listItems', itemMatch: '.list-group-item', label: 'span',
    },
    {
      id: 'extensionsSettings', name: '扩展菜单',
      button: '#extensions-settings-button',
      containers: ['#extensions_settings', '#extensions_settings2'],  
      mode: 'drawers', header: '.inline-drawer-header', label: 'header',
    },
    {
      id: 'qrPanel', name: 'QR面板',
      containers: ['#qr--bar'],
      observe: ['#send_form'],
      mode: 'qrItems', label: 'span',
    },
    {
      id: 'topSettings', name: '顶部导航栏',
      containers: ['#top-settings-holder'],
      mode: 'children', itemFilter: '.drawer', label: 'attrTitle',
    },
    {
      id: 'presetSettings', name: '预设菜单',
      button: '#ai-config-button',
      curated: true,                   
      observe: ['#left-nav-panel'],    
    },
    {
      id: 'userSettings', name: '用户设置',
      button: '#user-settings-button',
      curated: true,                   
    },
    {
      id: 'mesButtons', name: '消息操作',
      containers: ['#message_template .mes_buttons'],
      observe: ['#chat', '#message_template'],
      mode: 'mesButtons',
    },
  ];

  // 内置消息按钮友好标签映射
  const MES_BUTTON_DEFAULT_LABELS = {
    '.mes_edit': '编辑',
    '.mes_bookmark': '书签/检查点',
    '.mes_copy': '复制',
    '.mes_translate': '翻译',
    '.sd_message_gen': '生成图片',
    '.mes_narrate': '朗读',
    '.mes_prompt': '提示词',
    '.mes_hide': '排除提示词',
    '.mes_unhide': '包含提示词',
    '.mes_media_gallery': '媒体画廊',
    '.mes_media_list': '媒体列表',
    '.mes_embed': '嵌入文件/图片',
    '.mes_create_bookmark': '创建检查点',
    '.mes_create_branch': '创建分支',
  };

  // 支持子分组的分组
  const SUBGROUP_GROUP_IDS = ['options', 'extensionsMenu', 'extensionsSettings', 'qrPanel'];

  // 预设面板，分组打包，不支持排序
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

  // 用户设置面板
  const USER_SETTINGS_GROUPS = [
    {
      label: 'UI主题', selectors: ['#UI-Theme-Block'],
      drawerHeader: '#UI-presets-block > h4',
      drawerTargets: ['#UI-Theme-Block > :not(#UI-presets-block)', '#UI-presets-block > :not(h4)'],
    },
    {
      label: '角色处理', selectors: ['div[name="CharacterHandlingToggles"]'],
      drawerHeader: 'div[name="CharacterHandlingToggles"] > h4',
      drawerTargets: ['div[name="CharacterHandlingToggles"] > :not(h4)'],
    },
    {
      label: '杂项', selectors: ['div[name="MiscellaneousToggles"]', '#CustomCSS-block'],
      drawerHeader: 'div[name="MiscellaneousToggles"] > h4',
      drawerTargets: ['div[name="MiscellaneousToggles"] > :not(h4)'],
    },
    {
      label: '自定义CSS',
      noCuratedRecord: true,
      drawerHeader: '#CustomCSS-block > h4',
      drawerTargets: ['#CustomCSS-block > :not(h4)'],
    },
    {
      label: '聊天/消息处理', selectors: [
        'div[name="ChatMessageHandlingToggles"]',
        'div[name="AutoCompleteToggle"]',
      ],
      drawerHeader: 'div[name="ChatMessageHandlingToggles"] > h4',
      drawerTargets: [
        'div[name="ChatMessageHandlingToggles"] > :not(h4)',
        'div[name="AutoCompleteToggle"]',
      ],
    },
    {
      label: 'ST Script设置', selectors: ['div[name="STscriptToggles"]'],
      drawerHeader: 'div[name="STscriptToggles"] > h4',
      drawerTargets: ['div[name="STscriptToggles"] > :not(h4)'],
    },
  ];

  const CURATED_GROUPS = {
    presetSettings: PRESET_GROUPS,
    userSettings: USER_SETTINGS_GROUPS,
  };

  // 默认隐藏的元素
  const ALWAYS_HIDDEN = [
    '#rm_api_block > div.flex-container.flexFlowColumn > #openai_api > div.flex-container.flex > #test_api_button',
    '#rm_extensions_block > div > div.alignitemsflexstart.flex-container.wide100p',
    '#rm_extensions_block > div > div.alignitemscenter.flex-container.justifyCenter.wide100p',
  ];

  function getGroup(id) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === id) return GROUPS[i];
    return null;
  }

  function getUserDrawerKey(definition) { return 'userSettings|' + definition.label; }

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
    customSelectors: [], // [{ id, selector, label }]      — 用户自定义 Selector
    groupCollapsed: {}, // { groupId: boolean } —— 管理面板父分组折叠；缺省一律收起
    userDrawerCollapsed: {}, // { 'userSettings|标签': boolean } —— 实际用户设置伪抽屉；缺省全收起
    qrPanelCollapsed: false, // QR 面板折叠状态
    enableQrFold: true,     // 启用 QR 面板折叠
    enableUserFold: true,   // 启用用户条目折叠
    activeTab: 'sort',      // 激活页签 'sort' | 'settings'
  };
  let settings = {};


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
    if (!settings.customSelectors || !Array.isArray(settings.customSelectors)) settings.customSelectors = [];
    if (!settings.groupCollapsed) settings.groupCollapsed = {};
    if (!settings.userDrawerCollapsed) settings.userDrawerCollapsed = {};
    if (settings.qrPanelCollapsed === undefined) settings.qrPanelCollapsed = false;
    if (settings.enableQrFold === undefined) settings.enableQrFold = true;
    if (settings.enableUserFold === undefined) settings.enableUserFold = true;
    if (!settings.activeTab) settings.activeTab = 'sort';
    // 新旧用户都以「未声明即收起」处理；之后每次切换均随 settings 持久化。
    for (var g = 0; g < GROUPS.length; g++) {
      if (settings.groupCollapsed[GROUPS[g].id] === undefined) settings.groupCollapsed[GROUPS[g].id] = true;
    }
    if (settings.groupCollapsed['customSelectors'] === undefined) settings.groupCollapsed['customSelectors'] = true;
    for (var u = 0; u < USER_SETTINGS_GROUPS.length; u++) {
      if (settings.userDrawerCollapsed[getUserDrawerKey(USER_SETTINGS_GROUPS[u])] === undefined) {
        settings.userDrawerCollapsed[getUserDrawerKey(USER_SETTINGS_GROUPS[u])] = true;
      }
    }
    // 确保所有有子分组能力的 groupId 在 subgroups 里有初始空数组
    for (var sgIndex = 0; sgIndex < SUBGROUP_GROUP_IDS.length; sgIndex++) {
      if (!settings.subgroups[SUBGROUP_GROUP_IDS[sgIndex]]) settings.subgroups[SUBGROUP_GROUP_IDS[sgIndex]] = [];
    }
  }

  function saveSettings() {
    var ctx = getCtx();
    if (ctx && ctx.extensionSettings && ctx.saveSettingsDebounced) {
      try { ctx.extensionSettings[EXT_KEY] = settings; ctx.saveSettingsDebounced(); return; }
      catch (e) { console.warn('[菜单精简器] 保存到 extension_settings 失败，降级 localStorage', e); }
    }
    // 本地存储不可用时尝试寻找浏览器缓存
    try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
    catch (e) { console.warn('[菜单精简器] 保存设置失败', e); }
  }

  // 子分组
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
    var sg = { id: genSubgroupId(), name: '新建分组', memberKeys: [], collapsed: false, popupPosition: 0 };
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

  // 供用户自行输入selector
  function genCustomSelectorId() { return 'cs_' + Math.random().toString(36).slice(2, 10); }

  function isValidCssSelector(selector) {
    if (!selector || typeof selector !== 'string') return false;
    try {
      doc.querySelector(selector);
      return true;
    } catch (e) {
      return false;
    }
  }

  function addCustomSelector(selector, label) {
    var sel = (selector || '').trim();
    if (!sel) return { success: false, error: '选择器不能为空喵！' };
    if (!isValidCssSelector(sel)) return { success: false, error: '选择器格式不合法喵，请输入有效的 CSS Selector！' };
    if (!settings.customSelectors) settings.customSelectors = [];
    for (var i = 0; i < settings.customSelectors.length; i++) {
      if (settings.customSelectors[i].selector === sel) {
        return { success: false, error: '该选择器已经存在了喵！' };
      }
    }
    var id = genCustomSelectorId();
    var item = {
      id: id,
      selector: sel,
      label: (label || '').trim() || sel,
    };
    settings.customSelectors.push(item);
    saveSettings();
    applyAll();
    return { success: true, item: item };
  }

  function deleteCustomSelector(id) {
    if (!settings.customSelectors) return;
    var targetItem = null;
    for (var i = 0; i < settings.customSelectors.length; i++) {
      if (settings.customSelectors[i].id === id) {
        targetItem = settings.customSelectors[i];
        break;
      }
    }
    if (targetItem && isValidCssSelector(targetItem.selector)) {
      try {
        var els = doc.querySelectorAll(targetItem.selector);
        for (var e = 0; e < els.length; e++) {
          if (!isSelf(els[e])) els[e].classList.remove('mc3-hidden');
        }
      } catch (_) {}
    }
    settings.customSelectors = settings.customSelectors.filter(function (item) { return item.id !== id; });
    if (settings.hidden && settings.hidden[id]) {
      delete settings.hidden[id];
    }
    saveSettings();
    applyAll();
  }

  // 取头尾丢中间的html标签
  function renderSelectorLabelHtml(selectorText, count) {
    var text = selectorText || '';
    var countBadge = count !== undefined ? '<span class="mc3-match-badge"></span>' : '';
    if (text.length <= 16) {
      return '<span class="mc3-mid-start">' + escHtml(text) + '</span>' + countBadge;
    }
    var tailLen = Math.min(22, Math.max(8, Math.floor(text.length * 0.35)));
    var startStr = text.slice(0, text.length - tailLen);
    var endStr = text.slice(text.length - tailLen);
    return '<span class="mc3-mid-start">' + escHtml(startStr) + '</span>' +
           '<span class="mc3-mid-end">' + escHtml(endStr) + '</span>' +
           countBadge;
  }

  // ── 工具 ───────────────────────────────────────────────────────────────────
  function normLabel(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  // 用于识别带标签的按钮
  function hasDirectText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.textContent.trim()) return true;
    }
    return false;
  }

  // 跳过本版自绘元素，但「入口」(mc3-launcher-*) 例外 —— 它们作为普通条目参与扫描/排序/隐藏（#1）
  function isSelf(el) { return el.id && el.id.indexOf(OWN_PREFIX) === 0 && el.id.indexOf('mc3-launcher') !== 0; }


  function unitOf(el, container) {
    var u = el;
    while (u && u.parentNode !== container) u = u.parentNode;
    return u || el;
  }


  function isOwnVisible(el) {
    if (!el) return false;
    if (el.classList.contains('displayNone') || el.hidden || el.style.display === 'none') return false;
    if (el.classList.contains('mc3-hidden')) {
      el.classList.remove('mc3-hidden');
      var vis = win.getComputedStyle(el).display !== 'none';
      el.classList.add('mc3-hidden');
      return vis;
    }
    return win.getComputedStyle(el).display !== 'none';
  }

  // 标签提取
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
        // 过滤多余内容，实际上不太好用但我不打算动了
        var t = '';
        for (var i = 0; i < el.childNodes.length; i++) if (el.childNodes[i].nodeType === 3) t += el.childNodes[i].textContent;
        t = normLabel(t);
        return t || normLabel(el.textContent);
      }
      case 'span': {
        
        var sps = el.querySelectorAll('span, .qr--button-label, [data-i18n]');
        for (var si = 0; si < sps.length; si++) { var st = normLabel(sps[si].textContent); if (st) return st; }
        
        var dt = '';
        for (var di = 0; di < el.childNodes.length; di++) if (el.childNodes[di].nodeType === 3) dt += el.childNodes[di].textContent;
        return normLabel(dt) || normLabel(el.textContent) || normLabel(el.getAttribute('title'));
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

  // 收集候选元素
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
      // 这部分用于适配不同插件在魔棒菜单中挂载按钮的方式
      for (var w = 0; w < children.length; w++) {
        var c = children[w];
        if (isSelf(c)) continue;
        var isWrapper = c.classList.contains('extension_container') && !c.matches(group.itemMatch);
        if (!isWrapper) { out.push({ el: c, label: labelOf(c, group) }); continue; }

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

    if (group.mode === 'qrItems') {
      var visited = new Set();
      function scanQrNode(node) {
        if (!node || visited.has(node) || isSelf(node)) return;
        visited.add(node);
        if (node.id === 'qr--popoutTrigger' || node.id === 'mc3-qr-toggle-btn') return;
        if (node.classList.contains('qr--buttons')) {
          for (var b = 0; b < node.children.length; b++) {
            scanQrNode(node.children[b]);
          }
          return;
        }
        if (node.matches('.qr--button, .menu_button, button, a') || node.querySelector('.qr--button-label, span, [data-i18n]') || hasDirectText(node)) {
          var lbl = labelOf(node, group);
          if (lbl) out.push({ el: node, label: lbl });
        }
      }
      for (var q = 0; q < children.length; q++) {
        scanQrNode(children[q]);
      }
      return out;
    }

    // mode === 'drawers'
    for (var k = 0; k < children.length; k++) {
      var ch = children[k];
      if (isSelf(ch)) continue;
      // 用于适应.extension_container 是 wrapper的情况，穿透扫其直接子抽屉
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

  // 扫描器总结阶段，用于记录，去重与避免歧义
  function scanGroup(group) {
    var records = [];
    var byKey = Object.create(null);        
    var derivedCount = Object.create(null); 
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


        var unit = unitOf(el, container);

        var key;
        if (isStableId(el.id)) {

          key = '#' + el.id;
          if (byKey[key]) {
            byKey[key].els.push(el);
            if (byKey[key].units && unit) byKey[key].units.push(unit);
            if (!isOwnVisible(byKey[key].el) && isOwnVisible(el)) { byKey[key].el = el; byKey[key].unit = unit; }
            continue;
          }
        } else {
          var anchor = (unit && isStableId(unit.id)) ? '#' + unit.id : group.id;
          var base = group.id + '|' + anchor + '|' + label;
          var cnt = derivedCount[base] || 0; derivedCount[base] = cnt + 1;
          key = cnt === 0 ? base : base + '|' + cnt;
        }

        var rec = { key: key, el: el, els: [el], unit: unit, units: unit ? [unit] : [], groupId: group.id, container: containerSel, label: label };
        if (column !== undefined) rec.column = column;
        records.push(rec);
        byKey[key] = rec;
      }
    }
    return records;
  }

  // curated 面板扫描
  function scanCurated(group) {
    var records = [];
    var definitions = CURATED_GROUPS[group.id] || [];
    for (var i = 0; i < definitions.length; i++) {
      var pg = definitions[i];
      if (pg.noCuratedRecord || !pg.selectors) continue;
      var els = [];
      for (var s = 0; s < pg.selectors.length; s++) {
        var found = doc.querySelectorAll(pg.selectors[s]);
        for (var f = 0; f < found.length; f++) if (els.indexOf(found[f]) === -1 && !isSelf(found[f])) els.push(found[f]);
      }
      if (!els.length) continue;
      records.push({ key: group.id + '|' + pg.label, el: els[0], els: els, unit: null, units: [], groupId: group.id, label: pg.label, curated: true });
    }
    return records;
  }

  // 消息操作按钮语义选择器提取
  function getMesButtonSelector(el) {
    if (isStableId(el.id)) return '#' + el.id;
    var ignoredClasses = ['mes_button', 'interactable', 'menu_button', 'displayNone', 'mc3-hidden', 'visible', 'fa-solid', 'fa-regular'];
    var cl = [];
    var len = el.classList ? el.classList.length : 0;
    for (var i = 0; i < len; i++) {
      var c = el.classList.item ? el.classList.item(i) : el.classList[i];
      if (!c || typeof c !== 'string') continue;
      if (ignoredClasses.indexOf(c) === -1 && c.indexOf('fa-') !== 0 && c.indexOf(OWN_PREFIX) !== 0) {
        cl.push(c);
      }
    }
    if (cl.length > 0) return '.' + cl[0];
    var title = el.getAttribute('title') || el.getAttribute('data-tooltip') || el.getAttribute('data-i18n');
    if (title) return '[title="' + title.replace(/"/g, '\\"') + '"]';
    for (var j = 0; j < len; j++) {
      var fc = el.classList.item ? el.classList.item(j) : el.classList[j];
      if (!fc || typeof fc !== 'string') continue;
      if (fc.indexOf('fa-') === 0 && fc !== 'fa-solid' && fc !== 'fa-regular') return '.' + fc;
    }
    return null;
  }

  // 消息操作按钮标签提取
  function getMesButtonLabel(el, selector) {
    if (selector && MES_BUTTON_DEFAULT_LABELS[selector]) {
      return MES_BUTTON_DEFAULT_LABELS[selector];
    }
    var title = el.getAttribute('title') || el.getAttribute('data-tooltip');
    if (title) {
      var trimmed = normLabel(title);
      if (trimmed) return trimmed;
    }
    var i18n = el.getAttribute('data-i18n');
    if (i18n) {
      var cleanI18n = i18n.replace(/^\[.*?\]/, '');
      if (cleanI18n) return normLabel(cleanI18n);
    }
    var dt = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) dt += el.childNodes[i].textContent;
    }
    dt = normLabel(dt);
    if (dt) return dt;
    return selector ? selector.replace(/^[.#]/, '') : '未知按钮';
  }

  // "消息操作"扫描器，用于处理楼层中小铅笔及省略号区域
  function scanMesButtons(group) {
    var containers = doc.querySelectorAll('#message_template .mes_buttons, #chat .mes_buttons');
    if (!containers.length) containers = doc.querySelectorAll('.mes_buttons');
    var records = [];
    var seenKeys = new Set();

    for (var ci = 0; ci < containers.length; ci++) {
      var container = containers[ci];
      var extraBox = container.querySelector('.extraMesButtons');
      var allButtons = [];

      // 被收纳
      if (extraBox) {
        for (var eb = 0; eb < extraBox.children.length; eb++) {
          var eBtn = extraBox.children[eb];
          if (isSelf(eBtn)) continue;
          allButtons.push({ el: eBtn, nativeCol: 0 });
        }
      }

      // 外显
      for (var cb = 0; cb < container.children.length; cb++) {
        var cBtn = container.children[cb];
        if (isSelf(cBtn) || cBtn === extraBox || cBtn.classList.contains('extraMesButtonsHint') || cBtn.classList.contains('extraMesButtons')) {
          continue;
        }
        allButtons.push({ el: cBtn, nativeCol: 1 });
      }

      for (var bi = 0; bi < allButtons.length; bi++) {
        var item = allButtons[bi];
        var btnEl = item.el;
        var sel = getMesButtonSelector(btnEl);
        if (!sel) continue;
        var key = 'mesButtons|' + sel;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        var lbl = getMesButtonLabel(btnEl, sel);
        if (settings.nativeColumn[key] === undefined) {
          settings.nativeColumn[key] = item.nativeCol;
        }
        var curCol = settings.column[key] !== undefined ? settings.column[key] : settings.nativeColumn[key];

        records.push({
          key: key,
          selector: sel,
          el: btnEl,
          els: [btnEl],
          unit: btnEl,
          units: [btnEl],
          groupId: group.id,
          label: lbl,
          column: curCol,
          nativeColumn: settings.nativeColumn[key],
        });
      }
    }
    return records;
  }

  function scanAll() {
    var all = {};
    for (var i = 0; i < GROUPS.length; i++) {
      var g = GROUPS[i];
      if (g.curated) all[g.id] = scanCurated(g);
      else if (g.mode === 'mesButtons') all[g.id] = scanMesButtons(g);
      else all[g.id] = scanGroup(g);
    }
    return all;
  }

  // 重排序

  var suppressObserver = false;   // 程序性 DOM 搬运期间抑制 observer，防回环
  var applyTimer = null;

  function injectStyle() {
    if (doc.getElementById('mc3-style')) return;
    var rules = [
      '.mc3-hidden{display:none !important;}',
      'button.mc3-native-subgroup-header{width:100%;display:flex;align-items:center;gap:6px;padding:6px 10px;margin:2px 0;background:var(--black20a,rgba(255,255,255,.02));color:inherit;border:0;border-top:1px solid var(--SmartThemeBorderColor,#555);font:inherit;font-weight:600;text-align:left;cursor:pointer;user-select:none;}',
      'button.mc3-native-subgroup-header:hover{background:var(--black30a,rgba(128,128,128,.12));}',
      'button.mc3-native-subgroup-header:focus-visible{outline:2px solid var(--SmartThemeQuoteColor,#3a6);outline-offset:-2px;}',
      '.mc3-native-subgroup-arrow{width:12px;flex:0 0 12px;font-size:10px;opacity:.72;text-align:center;}',
      '.mc3-native-subgroup-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.mc3-user-drawer-collapsed{display:none !important;}',
      '.mc3-qr-toggle-btn{display:inline-flex;align-items:center;justify-content:center;padding:2px 6px;font-size:10px;line-height:1;border-radius:4px;cursor:pointer;user-select:none;background:var(--black30a,rgba(0,0,0,.25));color:inherit;border:1px solid var(--SmartThemeBorderColor,#555);margin-right:4px;flex-shrink:0;order:-999999;}',
      '.mc3-qr-toggle-btn:hover{background:var(--black50a,rgba(128,128,128,.3));}',
      '.mc3-qr-toggle-btn .mc3-qr-arrow{font-size:10px;opacity:.85;}',
      '.mc3-qr-content-collapsed{display:none !important;}',
      '#qr--bar.mc3-qr-bar-collapsed{display:flex !important;justify-content:center !important;align-items:center !important;width:100% !important;margin:0 auto !important;}',
      '#qr--bar.mc3-qr-bar-collapsed > .mc3-qr-toggle-btn{margin-right:0 !important;}',
      '@media screen and (max-width:800px){#qr--bar.mc3-qr-bar-collapsed{padding-left:0 !important;padding-right:0 !important;}}',
      '.mc3-user-drawer-header{cursor:pointer;user-select:none;}',
      '#UI-presets-block > h4.mc3-user-drawer-header, #CustomCSS-block > h4.mc3-user-drawer-header{position:relative;}',
      '#UI-presets-block > h4.mc3-user-drawer-header > button.mc3-user-drawer-arrow, #CustomCSS-block > h4.mc3-user-drawer-header > button.mc3-user-drawer-arrow{position:absolute;left:5px;top:50%;transform:translateY(-50%);}',
      '#UI-presets-block > h4.mc3-user-drawer-header > span:first-of-type, #CustomCSS-block > h4.mc3-user-drawer-header > span:first-of-type{padding-left:18px;}',
      'button.mc3-user-drawer-arrow{display:inline-block;width:14px;margin:0 4px 0 0;padding:0;border:0;background:none;color:inherit;font:inherit;font-size:10px;line-height:1;opacity:.72;cursor:pointer;vertical-align:middle;}',
      'button.mc3-user-drawer-arrow:hover{opacity:1;}',
      'button.mc3-user-drawer-arrow:focus-visible{outline:2px solid var(--SmartThemeQuoteColor,#3a6);outline-offset:1px;}',
    ];
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

  // 依据key分配槽位，新元素追加至末尾
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

  // 对这部分的一些解释：
  // 因为部分第三方扩展把自己的 wand 容器设成 display:contents，
  // 此时真正参与 flex 的是里面的 .list-group-item(=rec.el)，order 必须落在 el 上才生效；
  // 所以插件同时写顶层单元与 rec.el。
  // ...应该没有副作用？
  function supportsPseudoSubgroups(group) {
    return group.id === 'options' || group.id === 'extensionsMenu' || group.id === 'extensionsSettings' || group.id === 'qrPanel';
  }

  function applyOrder(group, records) {
    var map = ensureSlots(group, records);
    var hasPseudoHeaders = supportsPseudoSubgroups(group);
    var unitSlot = new Map();
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var slot = map[r.key];
      if (slot === undefined) continue;
      var displaySlot = hasPseudoHeaders ? slot * 2 + 1 : slot;
      for (var e = 0; e < r.els.length; e++) {
        var el = r.els[e];
        var u = (r.units && r.units[e]) ? r.units[e] : (r.unit || el);
        if (u && (!unitSlot.has(u) || displaySlot < unitSlot.get(u))) unitSlot.set(u, displaySlot);
        if (el && el !== u) el.style.order = String(displaySlot);
      }
    }
    unitSlot.forEach(function (slot, unit) { if (unit) unit.style.order = String(slot); });
  }

  // 此部分用于隐藏元素
  function isRecordEffectivelyHidden(group, record) {
    if (settings.hidden[record.key]) return true;
    if (!supportsPseudoSubgroups(group)) return false;
    var subgroup = getSubgroupForKey(group.id, record.key);
    return !!(subgroup && subgroup.collapsed);
  }

  function applyHides(group, records) {
    var byUnit = new Map();
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var hidden = isRecordEffectivelyHidden(group, r);
      for (var e = 0; e < r.els.length; e++) {
        var el = r.els[e];
        el.classList.toggle('mc3-hidden', hidden); // packed：按组隐藏全部元素
        var u = (r.units && r.units[e]) ? r.units[e] : (r.unit || el);
        if (u) {
          if (!byUnit.has(u)) byUnit.set(u, []);
          byUnit.get(u).push(r);
        }
      }
    }
    byUnit.forEach(function (recs, unit) {
      var allHidden = recs.every(function (r) { return isRecordEffectivelyHidden(group, r); });
      unit.classList.toggle('mc3-hidden', allHidden);
    });
  }

  // 扩展面板单双栏
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
      var unitsToMove = (r.units && r.units.length) ? r.units : (r.unit ? [r.unit] : []);
      for (var ui = 0; ui < unitsToMove.length; ui++) {
        var un = unitsToMove[ui];
        if (un && un.parentNode !== tc) { suppressObserver = true; tc.appendChild(un); moved = true; }
      }
    }
    col1.style.display = single ? 'none' : '';   // 单栏时右栏收起，左栏占满
    if (moved) win.setTimeout(function () { suppressObserver = false; }, 0);
  }

  // 转换至单栏时把全部 extensionsSettings 归属左栏
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

  function clearPseudoSubgroups(group) {
    if (!supportsPseudoSubgroups(group)) return;
    for (var ci = 0; ci < group.containers.length; ci++) {
      var container = doc.querySelector(group.containers[ci]);
      if (!container) continue;
      var headers = container.querySelectorAll('.mc3-native-subgroup-header[data-gid="' + group.id + '"]');
      for (var hi = 0; hi < headers.length; hi++) headers[hi].remove();
      var oldSeps = container.querySelectorAll('.mc3-subgroup-sep');
      for (var si = 0; si < oldSeps.length; si++) oldSeps[si].remove();
    }
  }

  // 左下菜单、魔棒与扩展面板保持扁平 DOM，只插入可清理的标题按钮并用 order 放到首个成员之前。
  // 扩展面板的标题与成员共同跟随子分组栏位；不包裹也不改动成员的原生抽屉结构。
  function applyPseudoSubgroups(group, records) {
    if (!supportsPseudoSubgroups(group)) return;
    var defaultContainer = doc.querySelector(group.containers[0]);
    if (!defaultContainer) return;
    for (var ci = 0; ci < group.containers.length; ci++) {
      var cleanupContainer = doc.querySelector(group.containers[ci]);
      if (!cleanupContainer) continue;
      var oldSeps = cleanupContainer.querySelectorAll('.mc3-subgroup-sep');
      for (var oldIndex = 0; oldIndex < oldSeps.length; oldIndex++) oldSeps[oldIndex].remove();
    }
    var sgList = settings.subgroups[group.id] || [];
    var map = settings.order[group.id] || {};
    var byKey = {};
    for (var ri = 0; ri < records.length; ri++) byKey[records[ri].key] = records[ri];
    var desiredIds = {};

    for (var s = 0; s < sgList.length; s++) {
      var sg = sgList[s];
      var present = sg.memberKeys.filter(function (key) { return !!byKey[key]; });
      if (!present.length) continue;
      present.sort(function (a, b) { return (map[a] || 0) - (map[b] || 0); });

      var targetContainer = defaultContainer;
      if (group.id === 'extensionsSettings') {
        var targetColumn = settings.columnMode === 'single' ? 0 : (sg.column === 1 ? 1 : 0);
        targetContainer = doc.querySelector(group.containers[targetColumn]);
        if (!targetContainer) continue;
      }

      var headerId = 'mc3-native-subgroup-' + group.id + '-' + sg.id;
      desiredIds[headerId] = true;
      var header = doc.getElementById(headerId);
      if (!header) {
        header = doc.createElement('button');
        header.type = 'button';
        header.id = headerId;
        header.className = 'mc3-native-subgroup-header';
        header.setAttribute('data-action', 'toggle-native-subgroup');
        header.setAttribute('data-gid', group.id);
        header.setAttribute('data-sgid', sg.id);
        header.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopImmediatePropagation();
          var target = e.currentTarget;
          var targetSg = getSubgroupById(target.getAttribute('data-gid'), target.getAttribute('data-sgid'));
          if (!targetSg) return;
          targetSg.collapsed = !targetSg.collapsed;
          saveSettings();
          applyAll();
          var overlay = doc.getElementById('mc3-overlay');
          if (overlay && win.getComputedStyle(overlay).display !== 'none') renderPopup();
        });
      }
      var headerHtml = '<span class="mc3-native-subgroup-arrow" aria-hidden="true">' + (sg.collapsed ? '▶' : '▼') + '</span>' +
        '<span class="mc3-native-subgroup-name">' + escHtml(sg.name) + '</span>';
      if (header.innerHTML !== headerHtml) header.innerHTML = headerHtml;
      var expanded = sg.collapsed ? 'false' : 'true';
      if (header.getAttribute('aria-expanded') !== expanded) header.setAttribute('aria-expanded', expanded);
      if (header.parentNode !== targetContainer) targetContainer.appendChild(header);
      header.style.order = String((map[present[0]] || 0) * 2);
    }

    for (var containerIndex = 0; containerIndex < group.containers.length; containerIndex++) {
      var container = doc.querySelector(group.containers[containerIndex]);
      if (!container) continue;
      var existing = container.querySelectorAll('.mc3-native-subgroup-header[data-gid="' + group.id + '"]');
      for (var ei = 0; ei < existing.length; ei++) {
        if (!desiredIds[existing[ei].id]) existing[ei].remove();
      }
    }
  }

  // 用伪抽屉实现子分组，实际还是隐藏元素的小把戏
  // 优势是可以维护原本魔棒和左下菜单的扁平结构
  function applyUserSettingsDrawers() {
    if (!settings.enabled || settings.enableUserFold === false) {
      clearUserSettingsDrawers();
      return;
    }
    if (!settings.userDrawerCollapsed) settings.userDrawerCollapsed = {};
    for (var i = 0; i < USER_SETTINGS_GROUPS.length; i++) {
      var definition = USER_SETTINGS_GROUPS[i];
      var key = getUserDrawerKey(definition);
      if (settings.userDrawerCollapsed[key] === undefined) settings.userDrawerCollapsed[key] = true;
      var collapsed = !!settings.userDrawerCollapsed[key];
      var header = doc.querySelector(definition.drawerHeader);

      if (header) {
        if (!header.classList.contains('mc3-user-drawer-header')) header.classList.add('mc3-user-drawer-header');
        var expanded = collapsed ? 'false' : 'true';
        if (header.getAttribute('aria-expanded') !== expanded) header.setAttribute('aria-expanded', expanded);
        var arrowText = collapsed ? '▶' : '▼';
        var arrowLabel = (collapsed ? '展开' : '收起') + definition.label;
        var arrow = header.querySelector(':scope > .mc3-user-drawer-arrow');
        if (!arrow) {
          arrow = doc.createElement('button');
          arrow.type = 'button';
          arrow.className = 'mc3-user-drawer-arrow';
          arrow.title = '折叠或展开' + definition.label;
          header.insertBefore(arrow, header.firstChild);
        }
        if (arrow.textContent !== arrowText) arrow.textContent = arrowText;
        if (arrow.getAttribute('aria-label') !== arrowLabel) arrow.setAttribute('aria-label', arrowLabel);

        if (!header.__mc3UserDrawerHandler) {
          header.__mc3UserDrawerHandler = function (e) {
            var interactive = e.target.closest('button,input,select,textarea,a,label,.menu_button,.right_menu_button,.editor_maximize');
            if (interactive && !interactive.classList.contains('mc3-user-drawer-arrow')) return;
            e.preventDefault();
            var currentHeader = e.currentTarget;
            var currentKey = currentHeader.__mc3UserDrawerKey;
            settings.userDrawerCollapsed[currentKey] = !settings.userDrawerCollapsed[currentKey];
            saveSettings();
            applyUserSettingsDrawers();
          };
          header.addEventListener('click', header.__mc3UserDrawerHandler);
        }
        header.__mc3UserDrawerKey = key;
      }

      for (var t = 0; t < definition.drawerTargets.length; t++) {
        var targets = doc.querySelectorAll(definition.drawerTargets[t]);
        for (var n = 0; n < targets.length; n++) targets[n].classList.toggle('mc3-user-drawer-collapsed', collapsed);
      }
    }
  }

  function clearUserSettingsDrawers() {
    for (var i = 0; i < USER_SETTINGS_GROUPS.length; i++) {
      var definition = USER_SETTINGS_GROUPS[i];
      var header = doc.querySelector(definition.drawerHeader);
      if (header) {
        if (header.__mc3UserDrawerHandler) header.removeEventListener('click', header.__mc3UserDrawerHandler);
        delete header.__mc3UserDrawerHandler;
        delete header.__mc3UserDrawerKey;
        header.classList.remove('mc3-user-drawer-header');
        header.removeAttribute('aria-expanded');
        var arrows = header.querySelectorAll(':scope > .mc3-user-drawer-arrow');
        for (var a = 0; a < arrows.length; a++) arrows[a].remove();
      }
      for (var t = 0; t < definition.drawerTargets.length; t++) {
        var targets = doc.querySelectorAll(definition.drawerTargets[t]);
        for (var n = 0; n < targets.length; n++) targets[n].classList.remove('mc3-user-drawer-collapsed');
      }
    }
  }

  // 应用消息操作栏配置：双栏包含关系、显隐与排序，保证省略号始终处于不被收纳项左侧
  function applyMesButtons(records) {
    var group = getGroup('mesButtons');
    var map = group ? ensureSlots(group, records) : (settings.order['mesButtons'] || {});
    var containers = doc.querySelectorAll('#message_template .mes_buttons, #chat .mes_buttons, .mes_buttons');
    if (!containers.length) return;
    var seenContainers = new Set();
    var moved = false;

    for (var ci = 0; ci < containers.length; ci++) {
      var container = containers[ci];
      if (seenContainers.has(container) || isSelf(container)) continue;
      seenContainers.add(container);

      var hint = container.querySelector('.extraMesButtonsHint');
      var extra = container.querySelector('.extraMesButtons');
      if (!hint || !extra) continue;

      // 1. 省略号与折叠容器永远赋予更小 order，确保始终处于不被收纳项左侧
      hint.style.order = '-2';
      extra.style.order = '-1';

      // 确保 hint 和 extra 在 DOM 物理层级上也居于最前部
      if (hint.parentNode === container && container.firstChild !== hint) {
        suppressObserver = true;
        container.insertBefore(hint, container.firstChild);
        moved = true;
      }
      if (extra.parentNode === container && hint.nextSibling !== extra) {
        suppressObserver = true;
        container.insertBefore(extra, hint.nextSibling);
        moved = true;
      }

      var visibleExtraChildrenCount = 0;

      // 2. 遍历 records，按 column 和 order 调整每个按钮
      // 此部分用来防御其他插件重复注入元素
      for (var ri = 0; ri < records.length; ri++) {
        var rec = records[ri];
        var matchedBtns = [];
        var allFound = container.querySelectorAll(rec.selector);
        for (var fi = 0; fi < allFound.length; fi++) {
          var fb = allFound[fi];
          if (fb !== hint && fb !== extra && !isSelf(fb)) {
            matchedBtns.push(fb);
          }
        }
        if (!matchedBtns.length) continue;

        var isHidden = !!settings.hidden[rec.key];
        var slot = map[rec.key] !== undefined ? map[rec.key] : (ri + 1);
        var targetCol = settings.column[rec.key] !== undefined ? settings.column[rec.key] : rec.nativeColumn;

        // 此部分用来处理被重新注入后出现多个按钮的情况
        if (targetCol === 0) {
          var inExtraBtn = null;
          for (var bi = 0; bi < matchedBtns.length; bi++) {
            if (matchedBtns[bi].parentNode === extra) {
              inExtraBtn = matchedBtns[bi];
              break;
            }
          }
          if (!inExtraBtn) inExtraBtn = matchedBtns[0];

          if (inExtraBtn.parentNode !== extra) {
            suppressObserver = true;
            extra.appendChild(inExtraBtn);
            moved = true;
          }
          inExtraBtn.classList.toggle('mc3-hidden', isHidden);
          inExtraBtn.style.order = String(slot);
          if (!isHidden && inExtraBtn.style.display !== 'none') {
            visibleExtraChildrenCount++;
          }

          // 当元素复位时取消原本元素隐藏，并清理多余副本，以达成伪装移动的效果
          for (var mi = 0; mi < matchedBtns.length; mi++) {
            var b = matchedBtns[mi];
            if (b !== inExtraBtn) {
              suppressObserver = true;
              b.remove();
              moved = true;
            }
          }
        } else {
          var outerBtn = null;
          for (var bo = 0; bo < matchedBtns.length; bo++) {
            if (matchedBtns[bo].parentNode === container) {
              outerBtn = matchedBtns[bo];
              break;
            }
          }
          if (!outerBtn) outerBtn = matchedBtns[0];

          if (outerBtn.parentNode !== container) {
            suppressObserver = true;
            container.appendChild(outerBtn);
            moved = true;
          }
          outerBtn.classList.toggle('mc3-hidden', isHidden);
          outerBtn.style.order = String(slot);

          // 这部分是防御重复注入的核心逻辑
          // 在元素被重新注入后，隐藏被重注入的元素，避免再次触发observer
          for (var mo = 0; mo < matchedBtns.length; mo++) {
            var ob = matchedBtns[mo];
            if (ob === outerBtn) continue;
            if (ob.parentNode === extra) {
              ob.classList.add('mc3-hidden');
            } else {
              suppressObserver = true;
              ob.remove();
              moved = true;
            }
          }
        }
      }

      // 3. 若 extra 内部没有任何可见子项，联动隐藏 hint；否则恢复显示
      if (!extra.classList.contains('visible')) {
        hint.classList.toggle('mc3-hidden', visibleExtraChildrenCount === 0);
      }
    }

    if (moved) {
      win.setTimeout(function () { suppressObserver = false; }, 0);
    }
  }

  function clearMesButtons(records) {
    var containers = doc.querySelectorAll('#message_template .mes_buttons, #chat .mes_buttons, .mes_buttons');
    for (var ci = 0; ci < containers.length; ci++) {
      var container = containers[ci];
      var hint = container.querySelector('.extraMesButtonsHint');
      var extra = container.querySelector('.extraMesButtons');
      if (hint) { hint.style.order = ''; hint.classList.remove('mc3-hidden'); }
      if (extra) { extra.style.order = ''; }

      for (var ri = 0; ri < records.length; ri++) {
        var rec = records[ri];
        var matchedBtns = [];
        var allFound = container.querySelectorAll(rec.selector);
        for (var fi = 0; fi < allFound.length; fi++) {
          var fb = allFound[fi];
          if (fb !== hint && fb !== extra && !isSelf(fb)) {
            matchedBtns.push(fb);
          }
        }
        if (!matchedBtns.length) continue;

        var nativeCol = settings.nativeColumn[rec.key] !== undefined ? settings.nativeColumn[rec.key] : rec.nativeColumn;
        var mainBtn = null;
        if (nativeCol === 0) {
          for (var bi = 0; bi < matchedBtns.length; bi++) {
            if (matchedBtns[bi].parentNode === extra) {
              mainBtn = matchedBtns[bi];
              break;
            }
          }
        } else {
          for (var bo = 0; bo < matchedBtns.length; bo++) {
            if (matchedBtns[bo].parentNode === container) {
              mainBtn = matchedBtns[bo];
              break;
            }
          }
        }
        if (!mainBtn) mainBtn = matchedBtns[0];

        mainBtn.classList.remove('mc3-hidden');
        mainBtn.style.order = '';
        if (nativeCol === 0 && extra && mainBtn.parentNode !== extra) {
          extra.appendChild(mainBtn);
        } else if (nativeCol === 1 && mainBtn.parentNode !== container) {
          container.appendChild(mainBtn);
        }

        // 清理其余多余副本
        for (var mi = 0; mi < matchedBtns.length; mi++) {
          if (matchedBtns[mi] !== mainBtn) {
            matchedBtns[mi].remove();
          }
        }
      }
    }
  }

  function applyGroup(group, records) {
    if (group.id === 'mesButtons') {
      applyMesButtons(records);
      return;
    }
    if (group.id === 'extensionsSettings') applyColumns(records); // 先定栏（唯一搬 DOM 处）
    if (!group.curated) applyOrder(group, records);                // curated 跨原生容器，仅做显隐
    applyHides(group, records);                                   // 再可见性
    applyPseudoSubgroups(group, records);                         // 最后同步原地伪抽屉标题
    if (group.id === 'userSettings') applyUserSettingsDrawers();  // 原生用户设置标题伪抽屉
  }

  function clearGroup(group, records) {
    if (group.id === 'mesButtons') {
      clearMesButtons(records);
      return;
    }
    var seen = new Set();
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      for (var e = 0; e < r.els.length; e++) {
        var el = r.els[e];
        el.classList.remove('mc3-hidden');
        el.style.order = '';
        var u = (r.units && r.units[e]) ? r.units[e] : (r.unit || el);
        if (u && !seen.has(u)) {
          seen.add(u);
          u.style.order = '';
          u.classList.remove('mc3-hidden');
          if (u.style.display === 'contents') u.style.display = '';
        }
      }
    }
    if (group.id === 'userSettings') clearUserSettingsDrawers();
  }

  // 无用元素默认隐藏
  function applyAlwaysHidden(on) {
    for (var i = 0; i < ALWAYS_HIDDEN.length; i++) {
      var els = doc.querySelectorAll(ALWAYS_HIDDEN[i]);
      for (var j = 0; j < els.length; j++) els[j].classList.toggle('mc3-hidden', on);
    }
  }

  // 移除原生分隔线
  function applySeparatorHides(on) {
    var sels = ['#options .options-content > hr', '#extensionsMenu > hr'];
    for (var i = 0; i < sels.length; i++) {
      var hrs = doc.querySelectorAll(sels[i]);
      for (var j = 0; j < hrs.length; j++) hrs[j].classList.toggle('mc3-hidden', on);
    }
  }

  // 自定义 Selector显隐应用
  function applyCustomSelectors(on) {
    var list = settings.customSelectors || [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!isValidCssSelector(item.selector)) continue;
      try {
        var els = doc.querySelectorAll(item.selector);
        var hidden = on && !!settings.hidden[item.id];
        for (var j = 0; j < els.length; j++) {
          var el = els[j];
          if (isSelf(el) || el.closest('#mc3-overlay') || el.closest('#mc3-popup')) continue;
          el.classList.toggle('mc3-hidden', hidden);
        }
      } catch (_) {}
    }
  }

  // 这部分是qr面板折叠
  function applyQrPanelFold() {
    var bar = doc.querySelector('#qr--bar');
    if (!bar) return;

    var toggleBtn = doc.getElementById('mc3-qr-toggle-btn');
    if (!settings.enabled || settings.enableQrFold === false) {
      if (toggleBtn) toggleBtn.style.display = 'none';
      bar.classList.remove('mc3-qr-bar-collapsed');
      for (var i = 0; i < bar.children.length; i++) {
        bar.children[i].classList.remove('mc3-qr-content-collapsed');
      }
      return;
    }

    var contents = [];
    for (var c = 0; c < bar.children.length; c++) {
      var ch = bar.children[c];
      if (ch.id === 'mc3-qr-toggle-btn' || ch.id === 'qr--popoutTrigger') continue;
      if (!ch.classList.contains('mc3-hidden')) {
        contents.push(ch);
      }
    }

    if (contents.length === 0) {
      if (toggleBtn) toggleBtn.style.display = 'none';
      bar.classList.remove('mc3-qr-bar-collapsed');
      for (var k = 0; k < bar.children.length; k++) {
        bar.children[k].classList.remove('mc3-qr-content-collapsed');
      }
      return;
    }

    if (!toggleBtn) {
      toggleBtn = doc.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.id = 'mc3-qr-toggle-btn';
      toggleBtn.className = 'mc3-qr-toggle-btn';
      toggleBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        settings.qrPanelCollapsed = !settings.qrPanelCollapsed;
        saveSettings();
        applyAll();
      });
      suppressObserver = true;
      bar.insertBefore(toggleBtn, bar.firstChild);
      win.setTimeout(function () { suppressObserver = false; }, 0);
    }

    toggleBtn.style.display = 'inline-flex';
    var isCollapsed = !!settings.qrPanelCollapsed;
    bar.classList.toggle('mc3-qr-bar-collapsed', isCollapsed);
    var arrow = isCollapsed ? '▲' : '▼';
    var arrowHtml = '<span class="mc3-qr-arrow">' + arrow + '</span>';
    if (toggleBtn.innerHTML !== arrowHtml) {
      toggleBtn.innerHTML = arrowHtml;
    }
    var titleText = isCollapsed ? '展开QR面板 (' + contents.length + '个条目)' : '折叠QR面板';
    if (toggleBtn.title !== titleText) {
      toggleBtn.title = titleText;
    }

    for (var j = 0; j < bar.children.length; j++) {
      var child = bar.children[j];
      if (child.id === 'mc3-qr-toggle-btn' || child.id === 'qr--popoutTrigger') continue;
      child.classList.toggle('mc3-qr-content-collapsed', isCollapsed);
    }
  }

  function applyAll() {
    injectStyle();
    setupLaunchers();   // 幂等：先补回入口，使其作为普通条目被随后的 scanAll 扫描/排序/隐藏（#1）
    applyAlwaysHidden(settings.enabled);
    applySeparatorHides(settings.enabled);
    applyCustomSelectors(settings.enabled);
    var all = scanAll();
    for (var i = 0; i < GROUPS.length; i++) {
      var recs = all[GROUPS[i].id] || [];
      if (settings.enabled) applyGroup(GROUPS[i], recs);
      else { clearGroup(GROUPS[i], recs); clearPseudoSubgroups(GROUPS[i]); }
    }
    applyQrPanelFold();
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
      var conts = (GROUPS[g].containers || []).concat(GROUPS[g].observe || []);
      for (var c = 0; c < conts.length; c++) {
        var el = doc.querySelector(conts[c]);
        if (el && !seen.has(el)) { seen.add(el); obs.observe(el, { childList: true, subtree: true }); watched.push(el); }
      }
    }

    // 这部分用于适应一些vue异步加载的组件
    // 部分插件先注入空标签外壳，后续加载时才真正填入内容，原扫描器在扫到空标签时会跳过
    // 具体分析和解决方案见工作日志0623
    var cdObs = new win.MutationObserver(function () { if (!suppressObserver) scheduleApply(); });
    for (var w = 0; w < watched.length; w++) cdObs.observe(watched[w], { characterData: true, subtree: true });
    win.setTimeout(function () { cdObs.disconnect(); }, 20000);
    try {
      if (win.eventSource && win.event_types && win.event_types.CHAT_CHANGED) {
        win.eventSource.on(win.event_types.CHAT_CHANGED, scheduleApply);
      }
    } catch (e) {}
  }

  // 插件操作面板
  function escHtml(s) { return (s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // 依据条目数非线性计算展开/折叠过渡时长（<=4 项兜底 0.22s，>4 项对数递增，上限 0.55s）
  function calcCollapseDuration(itemCount) {
    var count = Number(itemCount) || 0;
    if (count <= 4) return 0.22;
    var dur = 0.22 + 0.08 * (Math.log(count / 4) / Math.LN2);
    return Math.min(0.50, Math.round(dur * 1000) / 1000);
  }

  var POPUP_CSS =
    '#mc3-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;width:100dvw;height:100dvh;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.5);}' +
    '#mc3-popup{display:flex;flex-direction:column;width:min(600px,94vw);max-height:86vh;background:var(--SmartThemeBlurTintColor,#1e1e1e);color:var(--SmartThemeBodyColor,#eee);border:1px solid var(--SmartThemeBorderColor,#555);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);overflow:hidden;}' +
    '#mc3-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--SmartThemeBorderColor,#555);font-weight:bold;}' +
    '#mc3-head .mc3-head-title{display:flex;align-items:center;gap:12px;}' +
    '#mc3-head .mc3-x{cursor:pointer;background:none;border:none;color:inherit;font-size:18px;}' +
    '#mc3-tabs{display:flex;gap:4px;}' +
    '.mc3-tab{cursor:pointer;background:transparent;border:1px solid transparent;color:inherit;opacity:.6;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:normal;transition:all .15s;}' +
    '.mc3-tab:hover{opacity:.9;background:var(--black20a,rgba(255,255,255,.05));}' +
    '.mc3-tab.active{opacity:1;font-weight:bold;background:var(--black30a,rgba(0,0,0,.3));border-color:var(--SmartThemeBorderColor,#555);color:var(--SmartThemeQuoteColor,#3a6);}' +
    '#mc3-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--SmartThemeBorderColor,#555);}' +
    '#mc3-tools .mc3-tip{opacity:.6;font-size:11px;margin-left:auto;}' +
    '#mc3-body{overflow-y:auto;padding:6px 10px 12px;}' +
    // 设置界面样式
    '.mc3-settings-panel{padding:12px 16px;display:flex;flex-direction:column;gap:12px;}' +
    '.mc3-setting-row{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--black20a,rgba(255,255,255,.02));border:1px solid var(--SmartThemeBorderColor,#444);border-radius:8px;font-size:13px;}' +
    '.mc3-setting-row .mc3-setting-label{font-weight:500;display:flex;align-items:center;gap:8px;cursor:pointer;}' +
    '.mc3-checkbox{width:28px;height:28px;cursor:pointer;accent-color:var(--SmartThemeQuoteColor,#3a6);}' +
    '.mc3-segment-switch{display:flex;background:var(--black30a,rgba(0,0,0,.3));border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;padding:2px;gap:2px;}' +
    '.mc3-segment-btn{cursor:pointer;background:transparent;border:none;color:inherit;padding:3px 12px;border-radius:4px;font-size:12px;opacity:.7;transition:all .15s;}' +
    '.mc3-segment-btn.active{background:var(--SmartThemeQuoteColor,#3a6);color:#fff;opacity:1;font-weight:bold;}' +
    '.mc3-danger-btn{cursor:pointer;background:rgba(220,53,69,.15);color:#ff6b6b;border:1px solid rgba(220,53,69,.4);border-radius:6px;padding:6px 14px;font-size:12px;font-weight:bold;transition:all .15s;}' +
    '.mc3-danger-btn:hover{background:rgba(220,53,69,.3);border-color:#dc3545;color:#fff;}' +
    // 折叠箭头与动画
    '.mc3-chevron{display:inline-block;transition:transform var(--mc3-dur,.25s) cubic-bezier(.4,0,.2,1);transform:rotate(0deg);line-height:1;font-size:28px;}' +
    // 卡片样式
    '.mc3-card{background:var(--black20a,rgba(255,255,255,.02));border:1px solid var(--SmartThemeBorderColor,#444);border-radius:10px;margin:8px 4px;overflow:hidden;}' +
    '.mc3-card-header{display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--black30a,rgba(0,0,0,.2));font-weight:bold;font-size:13px;border-bottom:1px solid var(--SmartThemeBorderColor,#444);transition:border-bottom-color var(--mc3-dur,.25s) ease;}' +
    '.mc3-card.mc3-collapsed .mc3-card-header{border-bottom-color:transparent;}' +
    '.mc3-card-header small{opacity:.5;font-weight:normal;margin-right:auto;}' +
    '.mc3-card-collapse,.mc3-subgroup-collapse{cursor:pointer;background:none;border:0;color:inherit;padding:0;line-height:1;opacity:.7;flex-shrink:0;width:18px;height:18px;text-align:center;display:inline-flex;align-items:center;justify-content:center;}' +
    '.mc3-card-collapse:hover,.mc3-subgroup-collapse:hover{opacity:1;}' +
    '.mc3-card-title{opacity:.9;cursor:pointer;}' +
    '.mc3-card-body{display:grid;grid-template-rows:1fr;opacity:1;transition:grid-template-rows var(--mc3-dur,.25s) ease,opacity calc(var(--mc3-dur,.25s) * .8) ease;}' +
    '.mc3-card-body-inner{min-height:0;overflow:hidden;}' +
    '.mc3-card.mc3-collapsed .mc3-card-body{grid-template-rows:0fr;opacity:0;}' +
    '.mc3-card.mc3-collapsed .mc3-card-collapse .mc3-chevron{transform:rotate(-90deg);}' +
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
    '.mc3-subgroup-name{font-weight:bold;font-size:12px;opacity:.85;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;}' +
    '.mc3-subgroup-body{display:grid;grid-template-rows:1fr;opacity:1;transition:grid-template-rows var(--mc3-dur,.25s) ease,opacity calc(var(--mc3-dur,.25s) * .8) ease;}' +
    '.mc3-subgroup-body-inner{min-height:0;overflow:hidden;}' +
    '.mc3-subgroup.mc3-collapsed .mc3-subgroup-body{grid-template-rows:0fr;opacity:0;}' +
    '.mc3-subgroup.mc3-collapsed .mc3-subgroup-collapse .mc3-chevron{transform:rotate(-90deg);}' +
    '.mc3-subgroup-items{padding:0;}' +
    '.mc3-subgroup-items .mc3-row{padding-left:18px;}' +
    // 重命名输入框
    '.mc3-rename-input{background:var(--black30a,rgba(0,0,0,.3));color:inherit;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:4px;padding:2px 6px;font-size:12px;width:120px;flex:1;}' +
    // 子分组拖入高亮
    '.mc3-subgroup.mc3-drop-target{border-color:var(--SmartThemeQuoteColor,#3a6);border-style:solid;background:rgba(58,170,102,.08);}' +
    // 自定义 Selector样式
    '.mc3-custom-add-row{display:flex;gap:6px;align-items:center;margin-bottom:8px;}' +
    '.mc3-custom-input{flex:1;background:var(--black30a,rgba(0,0,0,.3));color:inherit;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;padding:4px 8px;font-size:12px;outline:none;}' +
    '.mc3-custom-input:focus{border-color:var(--SmartThemeQuoteColor,#3a6);}' +
    // 自定义 Selector 中段省略样式
    '.mc3-mid-truncate{display:flex !important;align-items:center;min-width:0;overflow:hidden;font-family:monospace;font-size:12px;}' +
    '.mc3-mid-start{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;min-width:0;}' +
    '.mc3-mid-end{flex:0 0 auto;white-space:nowrap;}' +
    '.mc3-match-badge{flex:0 0 auto;opacity:.5;font-size:11px;margin-left:6px;white-space:nowrap;}' +
    // 消息操作双栏样式
    '.mc3-mes-columns{display:flex;gap:8px;padding:8px 6px;}' +
    '.mc3-mes-column{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--black20a,rgba(255,255,255,.015));border:1px solid var(--SmartThemeBorderColor,#444);border-radius:8px;overflow:hidden;}' +
    '.mc3-mes-col-header{display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--black30a,rgba(0,0,0,.2));border-bottom:1px solid var(--SmartThemeBorderColor,#444);font-size:12px;font-weight:600;}' +
    '.mc3-mes-col-title{opacity:.9;}' +
    '.mc3-mes-col-count{opacity:.5;font-size:11px;margin-left:auto;}' +
    '.mc3-mes-list{min-height:56px;padding:4px 0;flex:1;transition:background .15s;}' +
    '.mc3-mes-list.mc3-drop-target{background:rgba(58,170,102,.12);border-radius:4px;}' +
    '@media screen and (max-width:480px){.mc3-mes-columns{flex-direction:column;}}';

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
        // 子分组打包：从 orderedKeys 中按出现顺序提取本组成员（保持拖拽后的新顺序），
        // 不在 orderedKeys 中的成员（如子分组折叠时不可见）按旧 map 顺序追加
        var memberSet = {};
        for (var mi2 = 0; mi2 < sgMembers[sgId].length; mi2++) memberSet[sgMembers[sgId][mi2]] = 1;
        var members = [];
        var seen = {};
        for (var oi = 0; oi < orderedKeys.length; oi++) {
          if (memberSet[orderedKeys[oi]] && !seen[orderedKeys[oi]]) {
            members.push(orderedKeys[oi]);
            seen[orderedKeys[oi]] = 1;
          }
        }
        var rest = sgMembers[sgId].filter(function (k) { return !seen[k]; });
        rest.sort(function (a, b) { return (map[a] || 0) - (map[b] || 0); });
        members = members.concat(rest);
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

  // 重置所有设置为默认值
  function resetAll() {
    settings.enabled = true;
    settings.hidden = {};
    settings.order = JSON.parse(JSON.stringify(settings.nativeOrder || {}));
    settings.column = Object.assign({}, settings.nativeColumn || {});
    settings.columnMode = 'dual';
    settings.enableQrFold = true;
    settings.enableUserFold = true;
    settings.subgroups = {};
    for (var g = 0; g < SUBGROUP_GROUP_IDS.length; g++) {
      settings.subgroups[SUBGROUP_GROUP_IDS[g]] = [];
    }
    // 清空自定义 Selector
    if (settings.customSelectors && settings.customSelectors.length > 0) {
      for (var cs = 0; cs < settings.customSelectors.length; cs++) {
        var item = settings.customSelectors[cs];
        if (isValidCssSelector(item.selector)) {
          try {
            var els = doc.querySelectorAll(item.selector);
            for (var e = 0; e < els.length; e++) els[e].classList.remove('mc3-hidden');
          } catch (_) {}
        }
      }
    }
    settings.customSelectors = [];
    settings.groupCollapsed = {};
    for (var gi = 0; gi < GROUPS.length; gi++) settings.groupCollapsed[GROUPS[gi].id] = true;
    settings.groupCollapsed['customSelectors'] = true;
    settings.userDrawerCollapsed = {};
    for (var ui = 0; ui < USER_SETTINGS_GROUPS.length; ui++) {
      settings.userDrawerCollapsed[getUserDrawerKey(USER_SETTINGS_GROUPS[ui])] = true;
    }
    settings.qrPanelCollapsed = false;
    saveSettings(); applyAll(); renderPopup();
  }

  // ── Popup 渲染 ──────────────────────────────────────────────────────────────

  // 渲染子分组标题栏
  // 左侧：拖拽手柄 + 折叠三角 + 标题 + 重命名 ｜ 右侧：分栏(可选) + 显隐 + 删除
  function renderSubgroupHeader(sg, group, recs, map) {
    var allHidden = recs.length > 0 && recs.every(function (r) { return !!settings.hidden[r.key]; });
    var hideLabel = allHidden ? '隐藏' : '显示';
    var html = '<div class="mc3-subgroup-header">';
    // 左侧组
    html += '<span class="mc3-handle mc3-sg-handle" title="拖动子分组排序">⠿</span>';
    html += '<button type="button" class="mc3-subgroup-collapse" data-action="toggle-subgroup" data-sgid="' + sg.id + '" data-gid="' + group.id + '" title="折叠或展开子分组"><span class="mc3-chevron">▾</span></button>';
    html += '<span class="mc3-subgroup-name" data-action="toggle-subgroup" data-sgid="' + sg.id + '" data-gid="' + group.id + '" title="折叠或展开子分组">' + escHtml(sg.name) + '</span>';
    html += '<button class="mc3-icon-btn" data-action="start-rename-sg" data-sgid="' + sg.id + '" data-gid="' + group.id + '" title="重命名">✎</button>';
    // 右侧组
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

    // 拖动手柄
    if (r.curated) {
      html += '<span style="visibility:hidden;width:16px;flex-shrink:0"></span>';
    } else {
      html += '<span class="mc3-handle" title="拖动排序">⠿</span>';
    }

    html += '<span class="mc3-label">' + escHtml(r.label) + '</span>';

    // 扩展面板分栏切换
    if (r.column !== undefined && group.id === 'extensionsSettings' && !inSubgroup) {
      var colLabel = col === 1 ? '右' : '左';
      html += '<button class="mc3-toggle" data-action="toggle-col" data-key="' + escHtml(r.key) + '" data-col="' + col + '">' + colLabel + '</button>';
    }

    // 显隐 Toggle
    html += '<button class="mc3-toggle' + (hidden ? '' : ' on') + '" data-action="toggle-hide" data-key="' + escHtml(r.key) + '">' + (hidden ? '隐藏' : '显示') + '</button>';

    html += '</div>';
    return html;
  }

  // 渲染消息操作单行条目
  function renderMesRow(r) {
    var hidden = !!settings.hidden[r.key];
    var col = (settings.column[r.key] !== undefined ? settings.column[r.key] : r.nativeColumn);
    var html = '<div class="mc3-row' + (hidden ? ' mc3-off' : '') + '" data-key="' + escHtml(r.key) + '" data-gid="mesButtons" data-col="' + col + '">';
    html += '<span class="mc3-handle" title="拖动排序或跨栏拖动">⠿</span>';
    html += '<span class="mc3-label">' + escHtml(r.label) + '</span>';
    html += '<button class="mc3-toggle' + (hidden ? '' : ' on') + '" data-action="toggle-hide" data-key="' + escHtml(r.key) + '">' + (hidden ? '隐藏' : '显示') + '</button>';
    html += '</div>';
    return html;
  }

  // 渲染消息操作专属双栏卡片
  function renderMesButtonsCard(group, recs, map) {
    var isCollapsed = !!settings.groupCollapsed[group.id];
    var cardDur = calcCollapseDuration(recs.length);

    var col0Recs = [];
    var col1Recs = [];
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      var col = settings.column[r.key] !== undefined ? settings.column[r.key] : r.nativeColumn;
      if (col === 0) col0Recs.push(r);
      else col1Recs.push(r);
    }
    col0Recs.sort(function (a, b) { return (map[a.key] || 0) - (map[b.key] || 0); });
    col1Recs.sort(function (a, b) { return (map[a.key] || 0) - (map[b.key] || 0); });

    var html = '<div class="mc3-card' + (isCollapsed ? ' mc3-collapsed' : '') + '" style="--mc3-dur:' + cardDur + 's;">';
    // 卡片标题
    html += '<div class="mc3-card-header">';
    html += '<button type="button" class="mc3-card-collapse" data-action="toggle-group" data-gid="' + group.id + '" title="折叠或展开父分组"><span class="mc3-chevron">▾</span></button>';
    html += '<span class="mc3-card-title" data-action="toggle-group" data-gid="' + group.id + '" title="折叠或展开父分组">' + escHtml(group.name) + '</span>';
    html += '<small>(' + recs.length + ')</small>';
    html += '</div>';

    // 双栏列表区
    html += '<div class="mc3-card-body"><div class="mc3-card-body-inner">';
    html += '<div class="mc3-mes-columns" data-gid="' + group.id + '">';

    // 这部分是消息操作
    // 栏0：被省略号收纳
    html += '<div class="mc3-mes-column" data-col="0">';
    html += '<div class="mc3-mes-col-header"><span class="mc3-mes-col-title">收纳至...内</span><span class="mc3-mes-col-count">(' + col0Recs.length + ')</span></div>';
    html += '<div class="mc3-list mc3-mes-list" data-gid="' + group.id + '" data-col="0">';
    if (col0Recs.length === 0) {
      html += '<div class="mc3-row mc3-empty-tip" style="opacity:.25;font-style:italic;justify-content:center;padding:12px;font-size:12px">拖动元素到此处收纳</div>';
    } else {
      for (var j0 = 0; j0 < col0Recs.length; j0++) html += renderMesRow(col0Recs[j0]);
    }
    html += '</div></div>';

    // 栏1：不被省略号收纳
    html += '<div class="mc3-mes-column" data-col="1">';
    html += '<div class="mc3-mes-col-header"><span class="mc3-mes-col-title">始终外显</span><span class="mc3-mes-col-count">(' + col1Recs.length + ')</span></div>';
    html += '<div class="mc3-list mc3-mes-list" data-gid="' + group.id + '" data-col="1">';
    if (col1Recs.length === 0) {
      html += '<div class="mc3-row mc3-empty-tip" style="opacity:.25;font-style:italic;justify-content:center;padding:12px;font-size:12px">拖动元素到此处外显</div>';
    } else {
      for (var j1 = 0; j1 < col1Recs.length; j1++) html += renderMesRow(col1Recs[j1]);
    }
    html += '</div></div>';

    html += '</div>'; // .mc3-mes-columns
    html += '</div></div>'; // .mc3-card-body-inner, .mc3-card-body
    html += '</div>'; // .mc3-card
    return html;
  }

  // 有成员的子分组仍由首个成员的 order 定位；空子分组没有 key 锚点，
  // 因此按单独持久化的 popupPosition 插回顶层单元列表。
  function insertEmptySubgroupUnits(units, sgList, sgData) {
    var emptyUnits = [];
    for (var i = 0; i < sgList.length; i++) {
      var sg = sgList[i];
      if (sgData[sg.id] && sgData[sg.id].records.length > 0) continue;
      var requested = Number(sg.popupPosition);
      if (!isFinite(requested) || requested < 0) requested = 0;
      emptyUnits.push({ requested: Math.floor(requested), sourceIndex: i, unit: { type: 'subgroup', data: sgData[sg.id] } });
    }
    emptyUnits.sort(function (a, b) { return a.requested - b.requested || a.sourceIndex - b.sourceIndex; });

    var previousRequested = -1;
    var samePositionOffset = 0;
    for (var e = 0; e < emptyUnits.length; e++) {
      var entry = emptyUnits[e];
      if (entry.requested === previousRequested) samePositionOffset++;
      else samePositionOffset = 0;
      previousRequested = entry.requested;
      var insertionIndex = Math.min(entry.requested + samePositionOffset, units.length);
      units.splice(insertionIndex, 0, entry.unit);
    }
    return units;
  }

  function persistSubgroupPositions(list, groupId) {
    var position = 0;
    for (var i = 0; i < list.children.length; i++) {
      var child = list.children[i];
      if (!child.classList.contains('mc3-row') && !child.classList.contains('mc3-subgroup')) continue;
      if (child.classList.contains('mc3-subgroup')) {
        var sg = getSubgroupById(groupId, child.getAttribute('data-sgid'));
        if (sg) sg.popupPosition = position;
      }
      position++;
    }
  }

  function renderSettingsPanel() {
    var html = '<div class="mc3-settings-panel">';

    // 1. 启用插件（复选框）
    html += '<div class="mc3-setting-row">' +
      '<label class="mc3-setting-label" for="mc3-set-enabled"><span>启用插件</span></label>' +
      '<input type="checkbox" id="mc3-set-enabled" class="mc3-checkbox" data-action="set-enabled"' + (settings.enabled ? ' checked' : '') + '>' +
      '</div>';

    // 2. 扩展面板状态（单栏/双栏拨块）
    html += '<div class="mc3-setting-row">' +
      '<span class="mc3-setting-label">扩展面板状态</span>' +
      '<div class="mc3-segment-switch">' +
        '<button class="mc3-segment-btn' + (settings.columnMode === 'single' ? ' active' : '') + '" data-action="set-colmode" data-val="single">单栏</button>' +
        '<button class="mc3-segment-btn' + (settings.columnMode === 'dual' ? ' active' : '') + '" data-action="set-colmode" data-val="dual">双栏</button>' +
      '</div>' +
      '</div>';

    // 3. 启用QR面板折叠（复选框）
    html += '<div class="mc3-setting-row">' +
      '<label class="mc3-setting-label" for="mc3-set-qrfold"><span>启用QR面板折叠</span></label>' +
      '<input type="checkbox" id="mc3-set-qrfold" class="mc3-checkbox" data-action="set-qrfold"' + (settings.enableQrFold !== false ? ' checked' : '') + '>' +
      '</div>';

    // 4. 启用用户条目折叠（复选框）
    html += '<div class="mc3-setting-row">' +
      '<label class="mc3-setting-label" for="mc3-set-userfold"><span>启用用户条目折叠</span></label>' +
      '<input type="checkbox" id="mc3-set-userfold" class="mc3-checkbox" data-action="set-userfold"' + (settings.enableUserFold !== false ? ' checked' : '') + '>' +
      '</div>';

    // 5. 清除插件数据（按钮）
    html += '<div class="mc3-setting-row">' +
      '<span class="mc3-setting-label">恢复配置初始状态</span>' +
      '<button class="mc3-danger-btn" data-action="clear-data">清除插件数据</button>' +
      '</div>';

    html += '</div>';
    return html;
  }

  function renderSortPanel() {
    var all = scanAll();

    // 确保 subgroups 初始化
    if (!settings.subgroups) settings.subgroups = {};
    if (!settings.groupCollapsed) settings.groupCollapsed = {};
    for (var g = 0; g < SUBGROUP_GROUP_IDS.length; g++) {
      if (!settings.subgroups[SUBGROUP_GROUP_IDS[g]]) settings.subgroups[SUBGROUP_GROUP_IDS[g]] = [];
    }
    for (var gc = 0; gc < GROUPS.length; gc++) {
      if (settings.groupCollapsed[GROUPS[gc].id] === undefined) settings.groupCollapsed[GROUPS[gc].id] = true;
    }

    var html = '<div id="mc3-tools"><span class="mc3-tip">点击 + 号新建一个子分组</span></div>';

    for (var gi = 0; gi < GROUPS.length; gi++) {
      var group = GROUPS[gi];
      var recs = (all[group.id] || []).slice();
      var map = settings.order[group.id] || {};

      if (group.id === 'mesButtons') {
        html += renderMesButtonsCard(group, recs, map);
        continue;
      }

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
      insertEmptySubgroupUnits(units, sgList, sgData);

      // === 渲染卡片 ===
      var isCollapsed = !!settings.groupCollapsed[group.id];
      var cardDur = calcCollapseDuration(recs.length);
      html += '<div class="mc3-card' + (isCollapsed ? ' mc3-collapsed' : '') + '" style="--mc3-dur:' + cardDur + 's;">';
      // 卡片标题
      html += '<div class="mc3-card-header">';
      html += '<button type="button" class="mc3-card-collapse" data-action="toggle-group" data-gid="' + group.id + '" title="折叠或展开父分组"><span class="mc3-chevron">▾</span></button>';
      html += '<span class="mc3-card-title" data-action="toggle-group" data-gid="' + group.id + '" title="折叠或展开父分组">' + escHtml(group.name) + '</span>';
      html += '<small>(' + recs.length + ')</small>';
      if (supportsSg) {
        html += '<button class="mc3-icon-btn" data-action="add-subgroup" data-gid="' + group.id + '" title="新建子分组" style="font-size:18px;font-weight:bold">+</button>';
      }
      html += '</div>';

      // 列表区
      html += '<div class="mc3-card-body"><div class="mc3-card-body-inner">';
      html += '<div class="mc3-list" data-gid="' + group.id + '">';

      for (var ui = 0; ui < units.length; ui++) {
        var unit = units[ui];
        if (unit.type === 'item') {
          html += renderItemRow(unit.record, group, false);
        } else {
          // 子分组（包含按 popupPosition 插回的空分组）
          var sg = unit.data.subgroup;
          var sgRecs = unit.data.records;
          sgRecs.sort(function (a, b) { return (map[a.key] || 0) - (map[b.key] || 0); });
          var isSgCollapsed = !!sg.collapsed;
          var sgDur = calcCollapseDuration(sgRecs.length);

          html += '<div class="mc3-subgroup' + (isSgCollapsed ? ' mc3-collapsed' : '') + '" data-sgid="' + sg.id + '" data-gid="' + group.id + '" style="--mc3-dur:' + sgDur + 's;">';
          html += renderSubgroupHeader(sg, group, sgRecs, map);

          html += '<div class="mc3-subgroup-body"><div class="mc3-subgroup-body-inner">';
          html += '<div class="mc3-subgroup-items" data-sgid="' + sg.id + '" data-gid="' + group.id + '">';
          if (sgRecs.length === 0) {
            html += '<div class="mc3-row" style="opacity:.25;font-style:italic;justify-content:center;padding:10px;font-size:12px">拖动条目到此处加入分组</div>';
          } else {
            for (var sri = 0; sri < sgRecs.length; sri++) {
              html += renderItemRow(sgRecs[sri], group, true);
            }
          }
          html += '</div>'; // .mc3-subgroup-items
          html += '</div></div>'; // .mc3-subgroup-body-inner, .mc3-subgroup-body
          html += '</div>'; // .mc3-subgroup
        }
      }

      html += '</div>'; // .mc3-list
      html += '</div></div>'; // .mc3-card-body-inner, .mc3-card-body
      html += '</div>'; // .mc3-card
    }

    // === 自定义 Selector卡片 ===
    var customList = settings.customSelectors || [];
    var customCollapsed = settings.groupCollapsed['customSelectors'] !== false;
    var customDur = calcCollapseDuration(customList.length);

    html += '<div class="mc3-card' + (customCollapsed ? ' mc3-collapsed' : '') + '" style="--mc3-dur:' + customDur + 's;">';
    // 卡片标题
    html += '<div class="mc3-card-header">';
    html += '<button type="button" class="mc3-card-collapse" data-action="toggle-group" data-gid="customSelectors" title="折叠或展开自定义 Selector"><span class="mc3-chevron">▾</span></button>';
    html += '<span class="mc3-card-title" data-action="toggle-group" data-gid="customSelectors" title="折叠或展开自定义 Selector">指哪消哪</span>';
    html += '<small>(' + customList.length + ')</small>';
    html += '</div>';

    html += '<div class="mc3-card-body"><div class="mc3-card-body-inner">';
    html += '<div style="padding:8px 10px;">';
    // 新增输入区
    html += '<div class="mc3-custom-add-row">' +
      '<input type="text" id="mc3-custom-selector-input" class="mc3-custom-input" placeholder="输入 CSS Selector，然后将它们送入虚空">' +
      '<button type="button" class="mc3-toggle on" data-action="add-custom-selector" style="padding:4px 12px;font-size:12px;cursor:pointer;">+ 添加</button>' +
      '</div>';

    // 列表区
    html += '<div class="mc3-list">';
    if (customList.length === 0) {
      html += '<div class="mc3-row" style="opacity:.35;font-style:italic;justify-content:center;padding:10px;font-size:12px">暂无自定义 Selector，在上方输入后点击添加喵～</div>';
    } else {
      for (var ci = 0; ci < customList.length; ci++) {
        var cItem = customList[ci];
        var cHidden = !!settings.hidden[cItem.id];
        var matchedCount = 0;
        if (isValidCssSelector(cItem.selector)) {
          try {
            var matches = doc.querySelectorAll(cItem.selector);
            for (var mi = 0; mi < matches.length; mi++) {
              if (!isSelf(matches[mi]) && !matches[mi].closest('#mc3-overlay') && !matches[mi].closest('#mc3-popup')) matchedCount++;
            }
          } catch (_) {}
        }
        html += '<div class="mc3-row' + (cHidden ? ' mc3-off' : '') + '" data-custom-id="' + escHtml(cItem.id) + '">';
        html += '<span class="mc3-label mc3-mid-truncate" title="' + escHtml(cItem.selector) + '">' +
                renderSelectorLabelHtml(cItem.label || cItem.selector, matchedCount) +
                '</span>';
        html += '<button class="mc3-toggle' + (cHidden ? '' : ' on') + '" data-action="toggle-custom-hide" data-custom-id="' + escHtml(cItem.id) + '">' + (cHidden ? '隐藏' : '显示') + '</button>';
        html += '<button class="mc3-icon-btn" data-action="delete-custom-selector" data-custom-id="' + escHtml(cItem.id) + '" title="删除此选择器" style="font-size:14px;padding:2px 6px;margin-left:4px;">✕</button>';
        html += '</div>';
      }
    }
    html += '</div>'; // .mc3-list
    html += '</div>'; // padding wrapper
    html += '</div></div>'; // .mc3-card-body-inner, .mc3-card-body

    html += '</div>'; // .mc3-card
    return html;
  }

  function renderPopup() {
    var body = doc.getElementById('mc3-body'); if (!body) return;

    // 更新 Tab 高亮
    var tabs = doc.querySelectorAll('#mc3-head .mc3-tab');
    var activeTab = settings.activeTab || 'sort';
    for (var t = 0; t < tabs.length; t++) {
      var tabName = tabs[t].getAttribute('data-tab');
      tabs[t].classList.toggle('active', tabName === activeTab);
    }

    if (activeTab === 'settings') {
      body.innerHTML = renderSettingsPanel();
    } else {
      body.innerHTML = renderSortPanel();
    }
  }

  // ── Popup 事件处理 ──────────────────────────────────────────────────────────

  function onPopupClick(e) {
    var t = e.target.closest('[data-action]'); if (!t) return;
    var a = t.getAttribute('data-action');

    if (a === 'close') { closePopup(); }
    else if (a === 'switch-tab') {
      var tab = t.getAttribute('data-tab');
      settings.activeTab = tab;
      saveSettings();
      renderPopup();
    }
    else if (a === 'set-enabled') {
      settings.enabled = t.checked;
      saveSettings(); applyAll(); renderPopup();
    }
    else if (a === 'set-colmode') {
      var val = t.getAttribute('data-val');
      setColumnMode(val);
      renderPopup();
    }
    else if (a === 'set-qrfold') {
      settings.enableQrFold = t.checked;
      saveSettings(); applyAll(); renderPopup();
    }
    else if (a === 'set-userfold') {
      settings.enableUserFold = t.checked;
      saveSettings(); applyAll(); renderPopup();
    }
    else if (a === 'clear-data') {
      if (confirm('确定要清除所有插件数据并恢复原始状态吗？')) {
        resetAll();
      }
    }
    else if (a === 'toggle-group') {
      var groupId = t.getAttribute('data-gid');
      var card = t.closest('.mc3-card');
      var willCollapse = card ? !card.classList.contains('mc3-collapsed') : !settings.groupCollapsed[groupId];
      settings.groupCollapsed[groupId] = willCollapse;
      if (card) {
        var rowCount = card.querySelectorAll('.mc3-row').length;
        card.style.setProperty('--mc3-dur', calcCollapseDuration(rowCount) + 's');
        card.classList.toggle('mc3-collapsed', willCollapse);
      }
      saveSettings();
    }
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
      var sgEl = t.closest('.mc3-subgroup');
      if (tgSg) {
        tgSg.collapsed = sgEl ? !sgEl.classList.contains('mc3-collapsed') : !tgSg.collapsed;
        if (sgEl) {
          var sgRowCount = sgEl.querySelectorAll('.mc3-row').length;
          sgEl.style.setProperty('--mc3-dur', calcCollapseDuration(sgRowCount) + 's');
          sgEl.classList.toggle('mc3-collapsed', tgSg.collapsed);
        }
        saveSettings();
        applyAll();
      }
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
        applyAll(); renderPopup();
      };
      input.addEventListener('blur', finishRename);
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { input.blur(); }
        if (ev.key === 'Escape') { renderPopup(); }
      });
    }
    // 自定义 Selector操作
    else if (a === 'add-custom-selector') {
      var customInput = doc.getElementById('mc3-custom-selector-input');
      var customVal = customInput ? customInput.value.trim() : '';
      var addRes = addCustomSelector(customVal);
      if (!addRes.success) {
        alert(addRes.error);
        if (customInput) customInput.focus();
      } else {
        renderPopup();
      }
    }
    else if (a === 'delete-custom-selector') {
      var delCId = t.getAttribute('data-custom-id');
      deleteCustomSelector(delCId);
      renderPopup();
    }
    else if (a === 'toggle-custom-hide') {
      var chId = t.getAttribute('data-custom-id');
      if (settings.hidden[chId]) delete settings.hidden[chId]; else settings.hidden[chId] = true;
      saveSettings(); applyAll(); renderPopup();
    }
  }



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
      if (child.classList.contains('mc3-empty-tip')) continue;
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
      if (gid === 'mesButtons') {
        var elAtPoint = doc.elementFromPoint(ev.clientX, ev.clientY);
        var mesList = elAtPoint ? elAtPoint.closest('.mc3-mes-list') : null;
        var allMesLists = doc.querySelectorAll('.mc3-mes-list');
        for (var mi = 0; mi < allMesLists.length; mi++) allMesLists[mi].classList.remove('mc3-drop-target');

        if (mesList) {
          mesList.classList.add('mc3-drop-target');
          if (dragEl.parentNode !== mesList) {
            mesList.appendChild(dragEl);
          }
          findInsertAfter(mesList, dragEl, ev.clientY);
        }
        dragMeta._lastX = ev.clientX;
        dragMeta._lastY = ev.clientY;
        return;
      }

      if (isSgHandle) {
        // 子分组拖拽
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

    function up(ev) {
      if (gid === 'mesButtons') {
        doc.removeEventListener('pointermove', move);
        doc.removeEventListener('pointerup', up);
        try { dragEl.releasePointerCapture(ev ? ev.pointerId : 0); } catch (_) {}

        dragEl.classList.remove('mc3-drag');
        var allMesLists = doc.querySelectorAll('.mc3-mes-list');
        for (var mi = 0; mi < allMesLists.length; mi++) allMesLists[mi].classList.remove('mc3-drop-target');

        var finalColList = dragEl.closest('.mc3-mes-list');
        if (!finalColList) {
          var elAtPoint = doc.elementFromPoint((ev && ev.clientX !== undefined) ? ev.clientX : (dragMeta._lastX || 0), (ev && ev.clientY !== undefined) ? ev.clientY : (dragMeta._lastY || 0));
          finalColList = elAtPoint ? elAtPoint.closest('.mc3-mes-list') : null;
        }

        if (finalColList) {
          var targetCol = Number(finalColList.getAttribute('data-col'));
          settings.column[dragMeta.key] = targetCol;
        }

        var col0List = doc.querySelector('.mc3-mes-list[data-col="0"]');
        var col1List = doc.querySelector('.mc3-mes-list[data-col="1"]');
        var orderedKeys = [];
        if (col0List) {
          var rows0 = col0List.querySelectorAll('.mc3-row[data-key]');
          for (var r0 = 0; r0 < rows0.length; r0++) {
            var k0 = rows0[r0].getAttribute('data-key');
            if (k0 && orderedKeys.indexOf(k0) === -1) orderedKeys.push(k0);
          }
        }
        if (col1List) {
          var rows1 = col1List.querySelectorAll('.mc3-row[data-key]');
          for (var r1 = 0; r1 < rows1.length; r1++) {
            var k1 = rows1[r1].getAttribute('data-key');
            if (k1 && orderedKeys.indexOf(k1) === -1) orderedKeys.push(k1);
          }
        }

        commitReorder('mesButtons', orderedKeys);
        saveSettings();
        applyAll();
        renderPopup();
        dragMeta = null;
        return;
      }
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);
      try { dragEl.releasePointerCapture(ev ? ev.pointerId : 0); } catch (_) {}

      dragEl.classList.remove('mc3-drag');
      for (var s = 0; s < allSubgroups.length; s++) allSubgroups[s].classList.remove('mc3-drop-target');

      if (!isSgHandle) {
        // 条目拖拽：从 DOM 位置推断最终归属的子分组
        var finalTarget = findDropTarget({ clientX: (ev && ev.clientX !== undefined) ? ev.clientX : (dragMeta._lastX || 0), clientY: (ev && ev.clientY !== undefined) ? ev.clientY : (dragMeta._lastY || 0) });
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

      // 提交排序：按视觉顺序深度遍历（展开折叠的子分组），确保正确收集 orderedKeys
      var orderedKeys = [];
      function collectKeys(el) {
        if (el.classList.contains('mc3-row')) {
          var rk = el.getAttribute('data-key');
          if (rk) orderedKeys.push(rk);
        } else if (el.classList.contains('mc3-subgroup')) {
          var sgId = el.getAttribute('data-sgid');
          var sg = getSubgroupById(dragMeta.gid, sgId);
          if (sg && sg.collapsed) {
            var oldMap = settings.order[dragMeta.gid] || {};
            var members = sg.memberKeys.slice();
            members.sort(function(a, b) { return (oldMap[a] || 0) - (oldMap[b] || 0); });
            for (var m = 0; m < members.length; m++) orderedKeys.push(members[m]);
          } else {
            for (var i = 0; i < el.children.length; i++) collectKeys(el.children[i]);
          }
        } else {
          for (var i = 0; i < el.children.length; i++) collectKeys(el.children[i]);
        }
      }
      collectKeys(list);
      persistSubgroupPositions(list, dragMeta.gid);
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
      '<div id="mc3-head">' +
        '<div class="mc3-head-title">' +
          '<span>菜单精简器</span>' +
          '<div class="mc3-tabs">' +
            '<button type="button" class="mc3-tab" data-action="switch-tab" data-tab="sort">菜单排序</button>' +
            '<button type="button" class="mc3-tab" data-action="switch-tab" data-tab="settings">插件设置</button>' +
          '</div>' +
        '</div>' +
        '<button class="mc3-x" data-action="close">✕</button>' +
      '</div>' +
      '<div id="mc3-body"></div></div>';
    (doc.documentElement || doc.body).appendChild(ov);   // 挂到 html，规避主题祖先 transform/filter 致 fixed 偏移
    ov.addEventListener('click', function (e) { if (e.target === ov) closePopup(); });
    var popup = ov.querySelector('#mc3-popup');
    popup.addEventListener('click', onPopupClick);
    popup.addEventListener('pointerdown', onPopupPointerDown);
    popup.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.id === 'mc3-custom-selector-input') {
        e.preventDefault();
        var val = e.target.value.trim();
        var res = addCustomSelector(val);
        if (!res.success) {
          alert(res.error);
          e.target.focus();
        } else {
          renderPopup();
        }
      }
    });
  }

  function openPopup() { buildPopup(); renderPopup(); doc.getElementById('mc3-overlay').style.display = 'flex'; }
  function closePopup() { var o = doc.getElementById('mc3-overlay'); if (o) o.style.display = 'none'; }

  // 插件在魔棒的入口
  function makeWandLauncher() {
    var el = doc.createElement('div');
    el.id = 'mc3-launcher-wand';
    el.className = 'list-group-item flex-container flexGap5 interactable';
    el.style.cursor = 'pointer';
    el.innerHTML = '<i class="fa-solid fa-bars-staggered"></i><span>菜单精简器</span>';
    el.addEventListener('click', openPopup);
    return el;
  }

  // 插件在扩展面板的入口
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

  // 插件启动部分
  function init() {
    loadSettings();
    var records = applyAll();
    setupObserver();
    setupLaunchers();
  // 下面的数字是延迟扫描的时间
    [600, 1800, 4000, 8000].forEach(function (d) {
      win.setTimeout(function () { if (!suppressObserver) applyAll(); }, d);
    });
    win.__mc3 = {
      version: 'M14',
      settings: settings,
      groups: GROUPS,
      getGroup: getGroup,
      scanGroup: scanGroup,
      scanMesButtons: scanMesButtons,
      scanCurated: scanCurated,
      scanAll: scanAll,
      applyAll: applyAll,
      applyMesButtons: applyMesButtons,
      clearMesButtons: clearMesButtons,
      renderMesButtonsCard: renderMesButtonsCard,
      applyPseudoSubgroups: applyPseudoSubgroups,
      applyCustomSelectors: applyCustomSelectors,
      addCustomSelector: addCustomSelector,
      deleteCustomSelector: deleteCustomSelector,
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
