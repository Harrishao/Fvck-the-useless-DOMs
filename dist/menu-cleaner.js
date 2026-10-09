// version 1003.0.0

(function () {
  'use strict';

 

  // iframe 穿透，适配酒馆助手
  const doc = window.frameElement ? window.parent.document : document;
  const win = window.frameElement ? window.parent : window;

  const STORAGE_KEY = 'menu_cleaner3_settings'; 
  const EXT_KEY = 'menu_cleaner3';              
  const OWN_PREFIX = 'mc3-';                    // 本插件注入元素 id 前缀

  // id 是否「稳定、可用作 key」：排除空、本版自身、旧版方案2 残留的 menu-cleaner-auto-* 自增 id。
  function isStableId(id) {
    return !!id
      && id.indexOf(OWN_PREFIX) !== 0
      && id.indexOf('menu-cleaner-auto-') !== 0
      && /^[A-Za-z][\w:-]*$/.test(id);
  }

  // 跳过本版自绘元素，但「入口」(mc3-launcher-*) 例外 —— 它们作为普通条目参与扫描/排序/隐藏。
  function isSelf(el) {
    return el.id && el.id.indexOf(OWN_PREFIX) === 0 && el.id.indexOf('mc3-launcher') !== 0;
  }

  // ─── §1  REGISTRY ────────────────────────────────────────────────────────────

  const GROUPS = [
    {
      id: 'options', name: '左下菜单',
      button: '#options_button',
      containers: ['#options .options-content'],
      forceFlex: true,
      mode: 'children', itemFilter: 'a', label: 'text',
      supportsPseudoSubgroups: true,
    },
    {
      id: 'extensionsMenu', name: '魔棒',
      button: '#extensionsMenuButton',
      containers: ['#extensionsMenu'],
      forceFlex: true,
      mode: 'listItems', itemMatch: '.list-group-item', label: 'span',
      supportsPseudoSubgroups: true,
    },
    {
      id: 'extensionsSettings', name: '扩展菜单',
      button: '#extensions-settings-button',
      containers: ['#extensions_settings', '#extensions_settings2'],
      mode: 'drawers', header: '.inline-drawer-header', label: 'header',
      supportsColumns: true,
      supportsPseudoSubgroups: true,
    },
    {
      id: 'qrPanel', name: 'QR面板',
      containers: ['#qr--bar'],
      observe: ['#send_form'],
      mode: 'qrItems', label: 'span',
      supportsPseudoSubgroups: true,
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
      hasUserDrawers: true,
    },
    {
      id: 'mesButtons', name: '消息操作',
      containers: ['#message_template .mes_buttons'],
      observe: ['#chat', '#message_template'],
      mode: 'mesButtons', customApply: true,
    },
  ];

  // 支持子分组的分组
  const SUBGROUP_GROUP_IDS = ['options', 'extensionsMenu', 'extensionsSettings', 'qrPanel'];

  // 楼层消息右上角
  const MES_CONTAINER_SEL = '#message_template .mes_buttons, #chat .mes_buttons, .mes_buttons';

  // 原生分隔线
  const SEPARATOR_SELECTORS = ['#options .options-content > hr', '#extensionsMenu > hr'];

  // 内置消息按钮友好标签映射（真的需要这部分吗？我认为扫描器本身已经能正确提取元素的title，有点想删掉这部分）
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

  // 预设面板，打包隐藏
  function presetRange(prefix, a, b, suffix) {
    const out = [];
    for (let n = a; n <= b; n++) out.push(prefix + n + suffix);
    return out;
  }
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

  // 用户设置伪抽屉，现在用精确语义进行匹配而不是nth-child
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
      noCuratedRecord: true, // 把自定义CSS块独立出来，不随杂项显隐
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

  function getUserSettingsGroups() {
    if (settings && settings.isolateCustomCss) {
      return [
        {
          label: 'UI主题', selectors: ['#UI-Theme-Block'],
          drawerHeader: '#UI-presets-block > h4',
          drawerTargets: ['#UI-Theme-Block > :not(#UI-presets-block)', '#UI-presets-block > :not(h4)'],
        },
        {
          label: '自定义CSS', selectors: ['#CustomCSS-block'],
          drawerHeader: '#CustomCSS-block > h4',
          drawerTargets: ['#CustomCSS-block > :not(h4)'],
        },
        {
          label: '角色处理', selectors: ['div[name="CharacterHandlingToggles"]'],
          drawerHeader: 'div[name="CharacterHandlingToggles"] > h4',
          drawerTargets: ['div[name="CharacterHandlingToggles"] > :not(h4)'],
        },
        {
          label: '杂项', selectors: ['div[name="MiscellaneousToggles"]'],
          drawerHeader: 'div[name="MiscellaneousToggles"] > h4',
          drawerTargets: ['div[name="MiscellaneousToggles"] > :not(h4)'],
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
    }
    return USER_SETTINGS_GROUPS;
  }

  const CURATED_GROUPS = {
    presetSettings: PRESET_GROUPS,
    userSettings: USER_SETTINGS_GROUPS,
  };

  // 默认隐藏的垃圾元素
  const ALWAYS_HIDDEN = [
    '#rm_api_block > div.flex-container.flexFlowColumn > #openai_api > div.flex-container.flex > #test_api_button',
    '#rm_extensions_block > div > div.alignitemsflexstart.flex-container.wide100p',
    '#rm_extensions_block > div > div.alignitemscenter.flex-container.justifyCenter.wide100p',
  ];

  const getGroup = (id) => GROUPS.find((g) => g.id === id) || null;
  const supportsPseudoSubgroups = (group) => SUBGROUP_GROUP_IDS.indexOf(group.id) !== -1;
  const getUserDrawerKey = (definition) => 'userSettings|' + definition.label;

  // ─── §2  SETTINGS STORE ──────────────────────────────────────────────────────

  function clampRgb(v, fallback) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return fallback !== undefined ? fallback : 0;
    return Math.min(255, Math.max(0, n));
  }

  function rgbToHex(r, g, b) {
    const toHex = (c) => ('0' + Math.min(255, Math.max(0, parseInt(c, 10) || 0)).toString(16)).slice(-2).toUpperCase();
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  const defaultSettings = {
    enabled: true,
    hidden: {},          // { key: true }                   — 可见性，无任何预设
    order: {},           // { groupId: { key: slot:int } }  — 全局总序，跨情境一致
    column: {},          // { key: 0|1 }                    — 用户当前栏位（扩展面板/消息操作）
    nativeColumn: {},    // { key: 0|1 }                    — 首次扫描捕获的原生归属（供「恢复原始」）
    nativeOrder: {},     // { groupId: { key: slot } }      — 首次扫描捕获的原生顺序（供「恢复原始」）
    columnMode: 'dual',  // 'single' | 'dual'
    subgroups: {},       // { groupId: [{ id, name, memberKeys[], collapsed?, column?, popupPosition? }] }
    customSelectors: [], // [{ id, selector, label }]       — 用户自定义 Selector
    groupCollapsed: {},  // { groupId: boolean }            — 管理面板父分组折叠；缺省一律收起
    userDrawerCollapsed: {}, // { 'userSettings|标签': boolean } — 用户设置伪抽屉；缺省全收起
    qrPanelCollapsed: false, // QR 面板折叠状态
    enableQrFold: true,      // 启用 QR 面板折叠
    enableUserFold: true,    // 启用用户条目折叠
    isolateCustomCss: false, // 独立"自定义CSS"块
    customFontColorEnabled: false, // 是否指定字体颜色（默认关闭，关闭时继承酒馆字体属性）
    customFontColor: null,   // 自定义 RGB 颜色 { r, g, b }；null 表示未指定，首次开启自动抓取
    activeTab: 'sort',       // 激活页签 'sort' | 'settings'
  };

  let settings = {};

  const Store = {
    getCtx() {
      try { return win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null; }
      catch (e) { return null; }
    },

    // 深拷贝一份全新默认值
    freshDefaults() { return JSON.parse(JSON.stringify(defaultSettings)); },

    // 一些规范：刻意「不」清理当前不在场的 key —— 晚加载元素靠留存的 order/column/hidden 归位。
    normalize(s) {
      const d = defaultSettings;
      for (const k in d) {
        if (s[k] === undefined) s[k] = (typeof d[k] === 'object' && d[k] !== null)
          ? JSON.parse(JSON.stringify(d[k])) : d[k];
      }
      if (!Array.isArray(s.customSelectors)) s.customSelectors = [];
      if (typeof s.customFontColorEnabled !== 'boolean') s.customFontColorEnabled = false;
      if (s.customFontColor && typeof s.customFontColor === 'object') {
        s.customFontColor = {
          r: clampRgb(s.customFontColor.r, 238),
          g: clampRgb(s.customFontColor.g, 238),
          b: clampRgb(s.customFontColor.b, 238),
        };
      } else {
        s.customFontColor = null;
      }
      // 默认收起，随后对展开/收起状态持久化
      for (const g of GROUPS) {
        if (s.groupCollapsed[g.id] === undefined) s.groupCollapsed[g.id] = true;
      }
      if (s.groupCollapsed['customSelectors'] === undefined) s.groupCollapsed['customSelectors'] = true;
      for (const def of getUserSettingsGroups()) {
        const key = getUserDrawerKey(def);
        if (s.userDrawerCollapsed[key] === undefined) s.userDrawerCollapsed[key] = true;
      }
      // 确保所有有子分组能力的 groupId 在 subgroups 里有初始空数组
      for (const gid of SUBGROUP_GROUP_IDS) {
        if (!s.subgroups[gid]) s.subgroups[gid] = [];
      }
      return s;
    },

    load() {
      const ctx = Store.getCtx();
      const ext = ctx && ctx.extensionSettings ? ctx.extensionSettings[EXT_KEY] : null;
      if (ext && typeof ext === 'object') {
        settings = Object.assign({}, defaultSettings, ext);
      } else {
        // 这部分用来从浏览器缓存中迁移数据至配置文件，但由于插件持久化存储已经推送很久，所以可以考虑移除
        try {
          const raw = win.localStorage.getItem(STORAGE_KEY);
          if (raw) {
            settings = Object.assign({}, defaultSettings, JSON.parse(raw));
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
      Store.normalize(settings);
      return settings;
    },

    // 持久化失败时用浏览器缓存兜底
    save() {
      const ctx = Store.getCtx();
      if (ctx && ctx.extensionSettings && ctx.saveSettingsDebounced) {
        try { ctx.extensionSettings[EXT_KEY] = settings; ctx.saveSettingsDebounced(); return; }
        catch (e) { console.warn('[菜单精简器] 保存到 extension_settings 失败，降级 localStorage', e); }
      }
      try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
      catch (e) { console.warn('[菜单精简器] 保存设置失败', e); }
    },
  };
  const saveSettings = () => Store.save();

  // ─── §3  STATE MODELS ────────────────────────────────────────────────────────

  const Subgroups = {
    genId: () => 'sg_' + Math.random().toString(36).slice(2, 10),

    list: (groupId) => settings.subgroups[groupId] || [],

    getForKey(groupId, key) {
      return Subgroups.list(groupId).find((sg) => sg.memberKeys.indexOf(key) !== -1) || null;
    },

    getById(groupId, sgId) {
      return Subgroups.list(groupId).find((sg) => sg.id === sgId) || null;
    },

    add(groupId) {
      if (SUBGROUP_GROUP_IDS.indexOf(groupId) === -1) return null;
      const list = settings.subgroups[groupId] || (settings.subgroups[groupId] = []);
      const sg = { id: Subgroups.genId(), name: '新建分组', memberKeys: [], collapsed: false, popupPosition: 0 };
      if (groupId === 'extensionsSettings') sg.column = 0;
      list.push(sg);
      saveSettings();
      return sg;
    },

    remove(groupId, sgId) {
      settings.subgroups[groupId] = Subgroups.list(groupId).filter((sg) => sg.id !== sgId);
      saveSettings();
    },

    rename(groupId, sgId, newName) {
      const sg = Subgroups.getById(groupId, sgId);
      if (sg) { sg.name = newName; saveSettings(); }
    },

    addKey(groupId, sgId, key) {
      Subgroups.removeKey(groupId, key);
      const sg = Subgroups.getById(groupId, sgId);
      if (sg && sg.memberKeys.indexOf(key) === -1) {
        sg.memberKeys.push(key);
        saveSettings();
      }
    },

    removeKey(groupId, key) {
      let changed = false;
      for (const sg of Subgroups.list(groupId)) {
        const idx = sg.memberKeys.indexOf(key);
        if (idx !== -1) { sg.memberKeys.splice(idx, 1); changed = true; }
      }
      if (changed) saveSettings();
    },

    // groupId 下 key→sgId 快速查找表
    keyToSgMap(groupId) {
      const map = {};
      for (const sg of Subgroups.list(groupId)) {
        for (const mk of sg.memberKeys) map[mk] = sg.id;
      }
      return map;
    },
  };

  const CustomSelectors = {
    genId: () => 'cs_' + Math.random().toString(36).slice(2, 10),

    add(selector, label) {
      const sel = (selector || '').trim();
      if (!sel) return { success: false, error: '选择器不能为空喵！' };
      if (!isValidCssSelector(sel)) return { success: false, error: '选择器格式不合法喵，请输入有效的 CSS Selector！' };
      if (!settings.customSelectors) settings.customSelectors = [];
      if (settings.customSelectors.some((it) => it.selector === sel)) {
        return { success: false, error: '该选择器已经存在了喵！' };
      }
      const item = { id: CustomSelectors.genId(), selector: sel, label: (label || '').trim() || sel };
      settings.customSelectors.push(item);
      saveSettings();
      applyAll();
      return { success: true, item };
    },

    remove(id) {
      if (!settings.customSelectors) return;
      const target = settings.customSelectors.find((it) => it.id === id);
      if (target && isValidCssSelector(target.selector)) {
        try {
          for (const el of doc.querySelectorAll(target.selector)) {
            if (!isSelf(el)) el.classList.remove('mc3-hidden');
          }
        } catch (_) {}
      }
      settings.customSelectors = settings.customSelectors.filter((it) => it.id !== id);
      if (settings.hidden && settings.hidden[id]) delete settings.hidden[id];
      saveSettings();
      applyAll();
    },
  };

  // ─── §4  DOM UTIL ────────────────────────────────────────────────────────────

  const normLabel = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const escHtml = (s) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 识别带直接文本的按钮（无 span 文本的裸按钮）
  function hasDirectText(el) {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim()) return true;
    }
    return false;
  }

  // 元素相对 container 的顶层单元（普通容器整块移动的粒度）
  function unitOf(el, container) {
    let u = el;
    while (u && u.parentNode !== container) u = u.parentNode;
    return u || el;
  }

  // 保留: 计算样式时临时摘掉自身 .mc3-hidden，消除「隐藏后重扫描→误判不可见」（0831）
  function isOwnVisible(el) {
    if (!el) return false;
    if (el.classList.contains('displayNone') || el.hidden || el.style.display === 'none') return false;
    if (el.classList.contains('mc3-hidden')) {
      el.classList.remove('mc3-hidden');
      const vis = win.getComputedStyle(el).display !== 'none';
      el.classList.add('mc3-hidden');
      return vis;
    }
    return win.getComputedStyle(el).display !== 'none';
  }

  // 抽屉标题标签多级 fallback 提取
  function extractHeaderLabel(header) {
    if (!header) return '';
    for (const ch of header.children) {
      if (ch.tagName === 'B' || ch.hasAttribute('data-i18n')) {
        const text = (ch.textContent || '').trim();
        if (text) return text;
      }
    }
    const nested = header.querySelector('b, [data-i18n]');
    if (nested) {
      const nt = (nested.textContent || '').trim();
      if (nt && nt.length <= 40) return nt;
    }
    let direct = '';
    for (const n of header.childNodes) if (n.nodeType === 3) direct += n.textContent;
    direct = direct.trim();
    if (direct) return direct;
    const icon = header.querySelector('.inline-drawer-icon');
    const iconText = icon ? icon.textContent.trim() : '';
    let full = (header.textContent || '').trim();
    if (iconText && full.slice(-iconText.length) === iconText) full = full.slice(0, -iconText.length).trim();
    return full || '';
  }

  // 按分组策略取候选元素标签
  function labelOf(el, group) {
    switch (group.label) {
      case 'text': {
        let t = '';
        for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
        t = normLabel(t);
        return t || normLabel(el.textContent);
      }
      case 'span': {
        // 保留: 取首个「非空」span，防止空图标 span 致标签空被丢弃（0623）
        const sps = el.querySelectorAll('span, .qr--button-label, [data-i18n]');
        for (const sp of sps) { const st = normLabel(sp.textContent); if (st) return st; }
        let dt = '';
        for (const n of el.childNodes) if (n.nodeType === 3) dt += n.textContent;
        return normLabel(dt) || normLabel(el.textContent) || normLabel(el.getAttribute('title'));
      }
      case 'attrTitle': {
        const withTitle = el.matches('[title]') ? el : el.querySelector('[title]');
        if (withTitle) return normLabel(withTitle.getAttribute('title'));
        const i18n = el.querySelector('[data-i18n]');
        return normLabel(i18n ? i18n.textContent : '');
      }
      case 'header':
      default:
        return normLabel(extractHeaderLabel(el.querySelector(group.header) || el));
    }
  }

  function isValidCssSelector(selector) {
    if (!selector || typeof selector !== 'string') return false;
    try { doc.querySelector(selector); return true; }
    catch (e) { return false; }
  }

  // CSS动画相关参数计算
  // 依条目数非线性计算展开/折叠过渡时长（<=4 项兜底 0.22s，>4 项对数递增，上限 0.50s）
  function calcCollapseDuration(itemCount) {
    const count = Number(itemCount) || 0;
    if (count <= 4) return 0.22;
    const dur = 0.22 + 0.08 * (Math.log(count / 4) / Math.LN2);
    return Math.min(0.50, Math.round(dur * 1000) / 1000);
  }

  // selector过长时取头尾舍中间
  function renderSelectorLabelHtml(selectorText, count) {
    const text = selectorText || '';
    const countBadge = count !== undefined ? '<span class="mc3-match-badge"></span>' : '';
    if (text.length <= 16) {
      return '<span class="mc3-mid-start">' + escHtml(text) + '</span>' + countBadge;
    }
    const tailLen = Math.min(22, Math.max(8, Math.floor(text.length * 0.35)));
    const startStr = text.slice(0, text.length - tailLen);
    const endStr = text.slice(text.length - tailLen);
    return '<span class="mc3-mid-start">' + escHtml(startStr) + '</span>' +
           '<span class="mc3-mid-end">' + escHtml(endStr) + '</span>' +
           countBadge;
  }

  // ─── §5  SCANNER ─────────────────────────────────────────────────────────────

  // 是否为「display:contents 包裹层」：本身不是目标条目，但其直接子里挂着真正的条目。
  // 保留: 第三方扩展把 wand/extension 容器设为 display:contents，需穿透一层（0622）。
  function isContentsWrapper(el, group) {
    if (!el || !(el instanceof win.HTMLElement || (el.classList && el.matches))) return false;
    if (el.classList.contains('extension_container')) {
      if (group.mode === 'listItems') return !el.matches(group.itemMatch);
      if (group.mode === 'drawers') return !el.classList.contains('inline-drawer');
      return false;
    }
    // 兼容可能未带 extension_container 类的第三方包裹层（如自定义挂载点或快捷方式容器）
    if (group.mode === 'listItems' && !el.matches(group.itemMatch) && el.querySelector(group.itemMatch)) {
      return true;
    }
    if (group.mode === 'drawers' && !el.classList.contains('inline-drawer') && el.querySelector(group.header)) {
      return true;
    }
    return false;
  }

  // 「看起来像一个带标签的按钮/条目」
  // labelQuery 默认仅 'span'（与 v1 listItems 一致）；qrItems 传更宽的查询以覆盖 QR 按钮标签变体。
  function looksLikeButton(el, matchSel, labelQuery) {
    if (matchSel && el.matches(matchSel)) return true;
    return !!el.querySelector(labelQuery || 'span') || hasDirectText(el);
  }

  // 收集候选元素（按 mode 派发）
  function collectCandidates(group, container) {
    const out = [];
    const children = container.children;

    if (group.mode === 'children') {
      for (const c of children) {
        if (isSelf(c)) continue;
        if (group.itemFilter && !c.matches(group.itemFilter)) continue;
        out.push({ el: c, label: labelOf(c, group) });
      }
      return out;
    }

    if (group.mode === 'listItems') {
      // 适配不同插件在魔棒菜单中挂载按钮的方式（LGI / 非 LGI 并列，穿透 display:contents 包裹层与快捷方式容器）
      const scanItemNode = (node) => {
        if (!node || isSelf(node)) return;
        if (isContentsWrapper(node, group)) {
          for (const sub of node.children) scanItemNode(sub);
        } else if (looksLikeButton(node, group.itemMatch)) {
          out.push({ el: node, label: labelOf(node, group) });
        }
      };
      for (const c of children) scanItemNode(c);
      return out;
    }

    if (group.mode === 'qrItems') {
      const visited = new Set();
      const scanQrNode = (node) => {
        if (!node || visited.has(node) || isSelf(node)) return;
        visited.add(node);
        if (node.id === 'qr--popoutTrigger' || node.id === 'mc3-qr-toggle-btn') return;
        if (node.classList.contains('qr--buttons')) {
          for (const b of node.children) scanQrNode(b);
          return;
        }
        if (node.matches('.qr--button, .menu_button, button, a') || looksLikeButton(node, null, '.qr--button-label, span, [data-i18n]')) {
          const lbl = labelOf(node, group);
          if (lbl) out.push({ el: node, label: lbl });
        }
      };
      for (const c of children) scanQrNode(c);
      return out;
    }

    // mode === 'drawers'
    for (const ch of children) {
      if (isSelf(ch)) continue;
      if (isContentsWrapper(ch, group)) {
        for (const gchild of ch.children) {
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

  // 扫描器总结阶段：记录、去重、消歧。产出统一 record { key, el, els, unit, units, groupId, label, column? }。
  function scanGroup(group) {
    const records = [];
    const byKey = Object.create(null);
    const derivedCount = Object.create(null);
    const seenEls = new Set();

    const multi = group.containers.length > 1;
    for (let ci = 0; ci < group.containers.length; ci++) {
      const containerSel = group.containers[ci];
      const container = doc.querySelector(containerSel);
      if (!container) continue;
      const column = multi ? ci : undefined;

      const cands = collectCandidates(group, container);
      for (const cand of cands) {
        const el = cand.el;
        const label = normLabel(cand.label);
        if (!label) continue;
        if (seenEls.has(el)) continue;
        seenEls.add(el);

        const unit = unitOf(el, container);

        let key;
        if (isStableId(el.id)) {
          key = '#' + el.id;
          if (byKey[key]) {
            // 保留: T2 重复 id 收集全副本入 els/units，解析取可见副本（#option_close_chat #5，0831）
            byKey[key].els.push(el);
            if (byKey[key].units && unit) byKey[key].units.push(unit);
            if (!isOwnVisible(byKey[key].el) && isOwnVisible(el)) { byKey[key].el = el; byKey[key].unit = unit; }
            continue;
          }
        } else {
          // T3: 无 id → groupId|稳定容器锚点|label 确定性派生（column 无关，reload 可复现）
          const anchor = (unit && isStableId(unit.id)) ? '#' + unit.id : group.id;
          const base = group.id + '|' + anchor + '|' + label;
          const cnt = derivedCount[base] || 0; derivedCount[base] = cnt + 1;
          key = cnt === 0 ? base : base + '|' + cnt;
        }

        const rec = { key, el, els: [el], unit, units: unit ? [unit] : [], groupId: group.id, container: containerSel, label };
        if (column !== undefined) rec.column = column;
        records.push(rec);
        byKey[key] = rec;
      }
    }
    return records;
  }

  // curated 面板扫描（预设/用户设置，按组打包隐藏，不排序）
  function scanCurated(group) {
    const records = [];
    const definitions = group.id === 'userSettings' ? getUserSettingsGroups() : (CURATED_GROUPS[group.id] || []);
    for (const pg of definitions) {
      if (pg.noCuratedRecord || !pg.selectors) continue;
      const els = [];
      for (const sel of pg.selectors) {
        for (const found of doc.querySelectorAll(sel)) {
          if (els.indexOf(found) === -1 && !isSelf(found)) els.push(found);
        }
      }
      if (!els.length) continue;
      records.push({ key: group.id + '|' + pg.label, el: els[0], els, unit: null, units: [], groupId: group.id, label: pg.label, curated: true });
    }
    return records;
  }

  // 消息操作按钮语义选择器提取。保留: 优先 #id；本版加固为复合 class（拼所有非忽略 class）降低碰撞。
  function getMesButtonSelector(el) {
    if (isStableId(el.id)) return '#' + el.id;
    const ignoredClasses = ['mes_button', 'interactable', 'menu_button', 'mes_btn', 'displayNone', 'mc3-hidden', 'visible', 'fa-solid', 'fa-regular'];
    const cl = [];
    const len = el.classList ? el.classList.length : 0;
    for (let i = 0; i < len; i++) {
      const c = el.classList.item ? el.classList.item(i) : el.classList[i];
      if (!c || typeof c !== 'string') continue;
      if (ignoredClasses.indexOf(c) === -1 && c.indexOf('fa-') !== 0 && c.indexOf(OWN_PREFIX) !== 0) {
        cl.push(c);
      }
    }
    // 保留: 取首个非忽略 class（keys 如 mesButtons|.mes_edit 已持久化，改复合会破坏老用户 key 兼容）
    if (cl.length > 0) return '.' + cl[0];
    const title = el.getAttribute('title') || el.getAttribute('data-tooltip') || el.getAttribute('data-i18n');
    if (title) return '[title="' + title.replace(/"/g, '\\"') + '"]';
    for (let j = 0; j < len; j++) {
      const fc = el.classList.item ? el.classList.item(j) : el.classList[j];
      if (!fc || typeof fc !== 'string') continue;
      if (fc.indexOf('fa-') === 0 && fc !== 'fa-solid' && fc !== 'fa-regular') return '.' + fc;
    }
    return null;
  }

  // 消息操作按钮标签提取
  function getMesButtonLabel(el, selector) {
    if (selector && MES_BUTTON_DEFAULT_LABELS[selector]) return MES_BUTTON_DEFAULT_LABELS[selector];
    const title = el.getAttribute('title') || el.getAttribute('data-tooltip');
    if (title) { const trimmed = normLabel(title); if (trimmed) return trimmed; }
    const i18n = el.getAttribute('data-i18n');
    if (i18n) { const cleanI18n = i18n.replace(/^\[.*?\]/, ''); if (cleanI18n) return normLabel(cleanI18n); }
    let dt = '';
    for (const n of el.childNodes) if (n.nodeType === 3) dt += n.textContent;
    dt = normLabel(dt);
    if (dt) return dt;
    return selector ? selector.replace(/^[.#]/, '') : '未知按钮';
  }

  // 「消息操作」扫描器：处理楼层小铅笔与省略号（.extraMesButtons）收纳区
  function scanMesButtons(group) {
    let containers = doc.querySelectorAll('#message_template .mes_buttons, #chat .mes_buttons');
    if (!containers.length) containers = doc.querySelectorAll('.mes_buttons');
    const records = [];
    const seenKeys = new Set();

    for (const container of containers) {
      const extraBox = container.querySelector('.extraMesButtons');
      const allButtons = [];

      // 被收纳（col 0）
      if (extraBox) {
        for (const eBtn of extraBox.children) {
          if (isSelf(eBtn)) continue;
          allButtons.push({ el: eBtn, nativeCol: 0 });
        }
      }
      // 外显（col 1）
      for (const cBtn of container.children) {
        if (isSelf(cBtn) || cBtn === extraBox ||
            cBtn.classList.contains('extraMesButtonsHint') || cBtn.classList.contains('extraMesButtons')) {
          continue;
        }
        allButtons.push({ el: cBtn, nativeCol: 1 });
      }

      for (const item of allButtons) {
        const btnEl = item.el;
        const sel = getMesButtonSelector(btnEl);
        if (!sel) continue;
        const key = 'mesButtons|' + sel;
        if (seenKeys.has(key)) continue; // 选择器碰撞去重
        seenKeys.add(key);

        const lbl = getMesButtonLabel(btnEl, sel);
        if (settings.nativeColumn[key] === undefined) settings.nativeColumn[key] = item.nativeCol;
        const curCol = settings.column[key] !== undefined ? settings.column[key] : settings.nativeColumn[key];

        records.push({
          key, selector: sel, el: btnEl, els: [btnEl], unit: btnEl, units: [btnEl],
          groupId: group.id, label: lbl, column: curCol, nativeColumn: settings.nativeColumn[key],
        });
      }
    }
    return records;
  }

  function scanAll() {
    const all = {};
    for (const g of GROUPS) {
      if (g.curated) all[g.id] = scanCurated(g);
      else if (g.mode === 'mesButtons') all[g.id] = scanMesButtons(g);
      else all[g.id] = scanGroup(g);
    }
    return all;
  }

  // ─── §6  APPLIERS ────────────────────────────────────────────────────────────

  let suppressObserver = false; // 程序性 DOM 搬运期间抑制 observer，防回环
  let applyTimer = null;

  // 对每个 record 的全副本做 (el, unit, rec) 遍历（applyOrder/applyHides/clearGroup 共用）
  function forEachElUnit(records, fn) {
    for (const r of records) {
      for (let e = 0; e < r.els.length; e++) {
        const el = r.els[e];
        const unit = (r.units && r.units[e]) ? r.units[e] : (r.unit || el);
        fn(el, unit, r);
      }
    }
  }

  function injectStyle() {
    if (doc.getElementById('mc3-style')) return;
    const rules = [
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
    // forceFlex：非 flex 容器强制 flex-direction:column，使 CSS order 生效
    for (const g of GROUPS) {
      if (!g.forceFlex) continue;
      for (const c of g.containers) rules.push(c + '{display:flex;flex-direction:column;}');
    }
    rules.push('#extensionsMenu > .extension_container{display:contents !important;}');
    const st = doc.createElement('style');
    st.id = 'mc3-style';
    st.textContent = rules.join('\n');
    (doc.head || doc.documentElement).appendChild(st);
  }

  // 修复 mesButtons 幽灵按钮 bug：
  // 不变量：任何 targetCol===1（外显）记录的按钮，永远不得在 .extraMesButtons 抽屉内渲染。
  // 后代作用域 `.extraMesButtons SELECTOR` 仅命中抽屉内副本；外显直接子级不受影响。
  // 第三方重注入进抽屉的副本一被解析即隐藏——不依赖 JS、不受防抖影响、我们不写节点属性 → 无 observer 乒乓。
  function buildMesSuppressCSS(records) {
    let style = doc.getElementById('mc3-mes-suppress');
    if (!settings.enabled) { if (style) style.textContent = ''; return; }
    const selectors = [];
    const seen = new Set();
    for (const rec of records) {
      const targetCol = settings.column[rec.key] !== undefined ? settings.column[rec.key] : rec.nativeColumn;
      if (targetCol !== 1 || !rec.selector || seen.has(rec.selector)) continue;
      seen.add(rec.selector);
      selectors.push('.extraMesButtons ' + rec.selector);
    }
    const css = selectors.length ? selectors.join(',\n') + '{display:none !important;}' : '';
    if (!style) {
      style = doc.createElement('style');
      style.id = 'mc3-mes-suppress';
      (doc.head || doc.documentElement).appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
  }

  // 依 key 分配槽位，新元素追加末尾；首次分配同时写 nativeOrder 快照
  function ensureSlots(group, records) {
    const map = settings.order[group.id] || (settings.order[group.id] = {});
    const nat = settings.nativeOrder[group.id] || (settings.nativeOrder[group.id] = {});
    let maxSlot = -1;
    for (const k in map) if (map[k] > maxSlot) maxSlot = map[k];
    let changed = false;
    for (const r of records) {
      if (!(r.key in map)) { map[r.key] = ++maxSlot; if (!(r.key in nat)) nat[r.key] = map[r.key]; changed = true; }
    }
    if (changed) saveSettings();
    return map;
  }

  // 排序。保留: 同时写顶层 unit 与 rec.el —— display:contents 容器内真正参与 flex 的是 el（0622）。
  // 伪抽屉组的 slot 乘 2 留出奇数位给标题按钮。
  function applyOrder(group, records) {
    const map = ensureSlots(group, records);
    const hasPseudoHeaders = supportsPseudoSubgroups(group);
    const unitSlot = new Map();
    forEachElUnit(records, (el, unit, r) => {
      const slot = map[r.key];
      if (slot === undefined) return;
      const displaySlot = hasPseudoHeaders ? slot * 2 + 1 : slot;
      if (unit && (!unitSlot.has(unit) || displaySlot < unitSlot.get(unit))) unitSlot.set(unit, displaySlot);
      if (el && el !== unit) el.style.order = String(displaySlot);
    });
    unitSlot.forEach((slot, unit) => { if (unit) unit.style.order = String(slot); });
  }

  function isRecordEffectivelyHidden(group, record) {
    if (settings.hidden[record.key]) return true;
    if (!supportsPseudoSubgroups(group)) return false;
    const subgroup = Subgroups.getForKey(group.id, record.key);
    return !!(subgroup && subgroup.collapsed);
  }

  // 可见性。某 unit 成员全隐藏时容器自动收起。保留: 遍历全副本（0831）。
  function applyHides(group, records) {
    const byUnit = new Map();
    forEachElUnit(records, (el, unit, r) => {
      el.classList.toggle('mc3-hidden', isRecordEffectivelyHidden(group, r));
      if (unit) {
        if (!byUnit.has(unit)) byUnit.set(unit, []);
        byUnit.get(unit).push(r);
      }
    });
    byUnit.forEach((recs, unit) => {
      const allHidden = recs.every((r) => isRecordEffectivelyHidden(group, r));
      unit.classList.toggle('mc3-hidden', allHidden);
    });
  }

  // 扩展面板单双栏。保留: 搬整个 .extension_container，原本是走歪路做自绘面板时的修复方案，现在不知道还有没有用，总之先留着
  function applyColumns(records) {
    const col0 = doc.querySelector('#extensions_settings');
    const col1 = doc.querySelector('#extensions_settings2');
    if (!col0 || !col1) return;
    const single = settings.columnMode === 'single';

    // 子分组分栏约束：extensionsSettings 子分组内条目遵循子分组的 column
    const keyToSgCol = {};
    for (const sg of Subgroups.list('extensionsSettings')) {
      const sgCol = sg.column !== undefined ? sg.column : 0;
      for (const mk of sg.memberKeys) keyToSgCol[mk] = sgCol;
    }

    let moved = false;
    for (const r of records) {
      if (r.column === undefined) continue;
      if (settings.nativeColumn[r.key] === undefined) settings.nativeColumn[r.key] = r.column; // 首次=原生
      let target;
      if (keyToSgCol[r.key] !== undefined) {
        target = single ? 0 : keyToSgCol[r.key]; // 子分组栏位覆盖个体设置
      } else {
        target = single ? 0 : (settings.column[r.key] !== undefined ? settings.column[r.key] : r.column);
      }
      const tc = target === 1 ? col1 : col0;
      const unitsToMove = (r.units && r.units.length) ? r.units : (r.unit ? [r.unit] : []);
      for (const un of unitsToMove) {
        if (un && un.parentNode !== tc) { suppressObserver = true; tc.appendChild(un); moved = true; }
      }
    }
    col1.style.display = single ? 'none' : ''; // 单栏时右栏收起，左栏占满
    if (moved) win.setTimeout(() => { suppressObserver = false; }, 0);
  }

  // 转换至单栏时把全部 extensionsSettings 归属左栏
  function setColumnMode(mode) {
    if (mode === 'single') {
      const recs = scanGroup(getGroup('extensionsSettings'));
      for (const r of recs) settings.column[r.key] = 0;
      for (const sg of Subgroups.list('extensionsSettings')) sg.column = 0;
    }
    settings.columnMode = mode;
    saveSettings();
    applyAll();
  }

  function clearPseudoSubgroups(group) {
    if (!supportsPseudoSubgroups(group)) return;
    for (const containerSel of group.containers) {
      const container = doc.querySelector(containerSel);
      if (!container) continue;
      for (const h of container.querySelectorAll('.mc3-native-subgroup-header[data-gid="' + group.id + '"]')) h.remove();
      for (const s of container.querySelectorAll('.mc3-subgroup-sep')) s.remove();
    }
  }

  // 即用显示状态伪装抽屉的收起/展开，保持原生扁平 DOM
  // 扩展面板的标题与成员共同跟随子分组栏位；不包裹也不改动成员的原生抽屉结构。
  function applyPseudoSubgroups(group, records) {
    if (!supportsPseudoSubgroups(group)) return;
    const defaultContainer = doc.querySelector(group.containers[0]);
    if (!defaultContainer) return;
    // 清理原生分隔线
    for (const containerSel of group.containers) {
      const c = doc.querySelector(containerSel);
      if (c) for (const s of c.querySelectorAll('.mc3-subgroup-sep')) s.remove();
    }
    const sgList = Subgroups.list(group.id);
    const map = settings.order[group.id] || {};
    const byKey = {};
    for (const r of records) byKey[r.key] = r;
    const desiredIds = {};

    for (const sg of sgList) {
      const present = sg.memberKeys.filter((key) => !!byKey[key]);
      if (!present.length) continue;
      present.sort((a, b) => (map[a] || 0) - (map[b] || 0));

      let targetContainer = defaultContainer;
      if (group.id === 'extensionsSettings') {
        const targetColumn = settings.columnMode === 'single' ? 0 : (sg.column === 1 ? 1 : 0);
        targetContainer = doc.querySelector(group.containers[targetColumn]);
        if (!targetContainer) continue;
      }

      const headerId = 'mc3-native-subgroup-' + group.id + '-' + sg.id;
      desiredIds[headerId] = true;
      let header = doc.getElementById(headerId);
      if (!header) {
        header = doc.createElement('button');
        header.type = 'button';
        header.id = headerId;
        header.className = 'mc3-native-subgroup-header';
        header.setAttribute('data-action', 'toggle-native-subgroup');
        header.setAttribute('data-gid', group.id);
        header.setAttribute('data-sgid', sg.id);
        header.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          const target = e.currentTarget;
          const targetSg = Subgroups.getById(target.getAttribute('data-gid'), target.getAttribute('data-sgid'));
          if (!targetSg) return;
          targetSg.collapsed = !targetSg.collapsed;
          saveSettings();
          applyAll();
          const overlay = doc.getElementById('mc3-overlay');
          if (overlay && win.getComputedStyle(overlay).display !== 'none') renderPopup();
        });
      }
      const headerHtml = '<span class="mc3-native-subgroup-arrow" aria-hidden="true">' + (sg.collapsed ? '▶' : '▼') + '</span>' +
        '<span class="mc3-native-subgroup-name">' + escHtml(sg.name) + '</span>';
      if (header.innerHTML !== headerHtml) header.innerHTML = headerHtml;
      const expanded = sg.collapsed ? 'false' : 'true';
      if (header.getAttribute('aria-expanded') !== expanded) header.setAttribute('aria-expanded', expanded);
      if (header.parentNode !== targetContainer) targetContainer.appendChild(header);
      header.style.order = String((map[present[0]] || 0) * 2);
    }

    // 清理不再需要的标题按钮
    for (const containerSel of group.containers) {
      const container = doc.querySelector(containerSel);
      if (!container) continue;
      for (const ex of container.querySelectorAll('.mc3-native-subgroup-header[data-gid="' + group.id + '"]')) {
        if (!desiredIds[ex.id]) ex.remove();
      }
    }
  }

  // 自定义CSS块原位重排：根据 settings.isolateCustomCss 决定在 DOM 中置于角色处理之前还是杂项之后
  // 这是干嘛的？为什么要有这一块？
  function applyCustomCssPosition() {
    const cssBlock = doc.querySelector('#CustomCSS-block');
    if (!cssBlock) return;
    if (settings.enabled && settings.isolateCustomCss) {
      const charBlock = doc.querySelector('div[name="CharacterHandlingToggles"]');
      if (charBlock && charBlock.parentNode && cssBlock.nextElementSibling !== charBlock) {
        suppressObserver = true;
        charBlock.parentNode.insertBefore(cssBlock, charBlock);
        win.setTimeout(() => { suppressObserver = false; }, 0);
      }
    } else {
      const miscBlock = doc.querySelector('div[name="MiscellaneousToggles"]');
      if (miscBlock && miscBlock.parentNode && cssBlock.previousElementSibling !== miscBlock) {
        suppressObserver = true;
        miscBlock.parentNode.insertBefore(cssBlock, miscBlock.nextSibling);
        win.setTimeout(() => { suppressObserver = false; }, 0);
      }
    }
  }

  // 用户设置原位伪抽屉：点击 h4 标题折叠/展开其内容目标。
  function applyUserSettingsDrawers() {
    applyCustomCssPosition();
    if (!settings.enabled || settings.enableUserFold === false) {
      clearUserSettingsDrawers();
      return;
    }
    if (!settings.userDrawerCollapsed) settings.userDrawerCollapsed = {};
    for (const definition of getUserSettingsGroups()) {
      const key = getUserDrawerKey(definition);
      if (settings.userDrawerCollapsed[key] === undefined) settings.userDrawerCollapsed[key] = true;
      const collapsed = !!settings.userDrawerCollapsed[key];
      const header = doc.querySelector(definition.drawerHeader);

      if (header) {
        if (!header.classList.contains('mc3-user-drawer-header')) header.classList.add('mc3-user-drawer-header');
        const expanded = collapsed ? 'false' : 'true';
        if (header.getAttribute('aria-expanded') !== expanded) header.setAttribute('aria-expanded', expanded);
        const arrowText = collapsed ? '▶' : '▼';
        const arrowLabel = (collapsed ? '展开' : '收起') + definition.label;
        let arrow = header.querySelector(':scope > .mc3-user-drawer-arrow');
        if (!arrow) {
          arrow = doc.createElement('button');
          arrow.type = 'button';
          arrow.className = 'mc3-user-drawer-arrow';
          arrow.title = '折叠或展开' + definition.label;
          header.insertBefore(arrow, header.firstChild);
        }
        // 保留: 仅在状态真正变化时改写 DOM（避免打断原生交互）
        if (arrow.textContent !== arrowText) arrow.textContent = arrowText;
        if (arrow.getAttribute('aria-label') !== arrowLabel) arrow.setAttribute('aria-label', arrowLabel);

        if (!header.__mc3UserDrawerHandler) {
          header.__mc3UserDrawerHandler = (e) => {
            const interactive = e.target.closest('button,input,select,textarea,a,label,.menu_button,.right_menu_button,.editor_maximize');
            if (interactive && !interactive.classList.contains('mc3-user-drawer-arrow')) return;
            e.preventDefault();
            const currentHeader = e.currentTarget;
            const currentKey = currentHeader.__mc3UserDrawerKey;
            settings.userDrawerCollapsed[currentKey] = !settings.userDrawerCollapsed[currentKey];
            saveSettings();
            applyUserSettingsDrawers();
          };
          header.addEventListener('click', header.__mc3UserDrawerHandler);
        }
        header.__mc3UserDrawerKey = key;
      }

      for (const targetSel of definition.drawerTargets) {
        for (const el of doc.querySelectorAll(targetSel)) el.classList.toggle('mc3-user-drawer-collapsed', collapsed);
      }
    }
  }

  function clearUserSettingsDrawers() {
    applyCustomCssPosition();
    for (const definition of getUserSettingsGroups()) {
      const header = doc.querySelector(definition.drawerHeader);
      if (header) {
        if (header.__mc3UserDrawerHandler) header.removeEventListener('click', header.__mc3UserDrawerHandler);
        delete header.__mc3UserDrawerHandler;
        delete header.__mc3UserDrawerKey;
        header.classList.remove('mc3-user-drawer-header');
        header.removeAttribute('aria-expanded');
        for (const a of header.querySelectorAll(':scope > .mc3-user-drawer-arrow')) a.remove();
      }
      for (const targetSel of definition.drawerTargets) {
        for (const el of doc.querySelectorAll(targetSel)) el.classList.remove('mc3-user-drawer-collapsed');
      }
    }
  }

  // 在 container 内收集匹配 rec.selector 的按钮（排除 hint/extra/self）—— apply/clear 共用
  // function collectMesMatches(container, rec, hint, extra) {
  //   const matched = [];
  //   for (const fb of container.querySelectorAll(rec.selector)) {
  //     if (fb !== hint && fb !== extra && !isSelf(fb)) matched.push(fb);
  //   }
  //   return matched;
  // }

  // 这部分和上面注释掉的内容不同的点在于，限制精简器本身只操作mes_button和深一层的extraMesButtons的内容，避免误杀由其他插件引入，且点了会有弹窗的元素
  // 如果效果不对再换回上面的
  function collectMesMatches(container, rec, hint, extra) {
  const matched = [];
  for (const fb of container.querySelectorAll(rec.selector)) {
    if (fb === hint || fb === extra || isSelf(fb)) continue;
    if (fb.parentNode !== container && fb.parentNode !== extra) continue;
    matched.push(fb);
  }
  return matched;
}

  // 应用消息操作栏配置：双栏包含关系、显隐与排序，保证省略号始终处于外显项左侧。
  // restore=true 时为「清理」模式：回归原生栏位、取消隐藏与 order。
  function syncMesButtons(records, restore) {
    const group = getGroup('mesButtons');
    const map = (!restore && group) ? ensureSlots(group, records) : (settings.order['mesButtons'] || {});
    const containers = doc.querySelectorAll(MES_CONTAINER_SEL);
    if (!containers.length) return;
    const seenContainers = new Set();
    let moved = false;

    for (const container of containers) {
      if (seenContainers.has(container) || isSelf(container)) continue;
      seenContainers.add(container);

      const hint = container.querySelector('.extraMesButtonsHint');
      const extra = container.querySelector('.extraMesButtons');
      // 应用模式必须有 hint+extra 才能收纳/外显；清理模式即使缺失也要逐条复位（与 v1 clearMesButtons 一致）
      if (!restore && (!hint || !extra)) continue;

      if (restore) {
        if (hint) { hint.style.order = ''; hint.classList.remove('mc3-hidden'); }
        if (extra) extra.style.order = '';
      } else {
        // 保留: 省略号(-2) 与折叠容器(-1) 永远赋予更小 order，确保始终处于外显项左侧（0909）
        hint.style.order = '-2';
        extra.style.order = '-1';
        if (hint.parentNode === container && container.firstChild !== hint) {
          suppressObserver = true; container.insertBefore(hint, container.firstChild); moved = true;
        }
        if (extra.parentNode === container && hint.nextSibling !== extra) {
          suppressObserver = true; container.insertBefore(extra, hint.nextSibling); moved = true;
        }
      }

      let visibleExtraChildrenCount = 0;

      for (const rec of records) {
        const matchedBtns = collectMesMatches(container, rec, hint, extra);
        if (!matchedBtns.length) continue;

        const isHidden = restore ? false : !!settings.hidden[rec.key];
        const slot = map[rec.key];
        const targetCol = restore
          ? (settings.nativeColumn[rec.key] !== undefined ? settings.nativeColumn[rec.key] : rec.nativeColumn)
          : (settings.column[rec.key] !== undefined ? settings.column[rec.key] : rec.nativeColumn);

        if (targetCol === 0) {
          // 收纳：置于 extra 内。保留一份主副本，其余多余副本 remove（对重复注入元素的防御）。
          // extra 可能在清理模式下缺失（无收纳区）→ 与 v1 一致：仅在 extra 存在时搬入。
          let mainBtn = (extra && matchedBtns.find((b) => b.parentNode === extra)) || matchedBtns[0];
          if (extra && mainBtn.parentNode !== extra) { suppressObserver = true; extra.appendChild(mainBtn); moved = true; }
          mainBtn.classList.toggle('mc3-hidden', isHidden);
          mainBtn.style.order = restore ? '' : (slot !== undefined ? String(slot) : '');
          if (!isHidden && mainBtn.style.display !== 'none') visibleExtraChildrenCount++;
          for (const b of matchedBtns) {
            if (b !== mainBtn) { suppressObserver = true; b.remove(); moved = true; }
          }
        } else {
          // 外显：置于 container 直接子级。抽屉内的重注入副本交给 CSS 抑制规则处理（无需写节点）。
          let mainBtn = matchedBtns.find((b) => b.parentNode === container) || matchedBtns[0];
          if (mainBtn.parentNode !== container) { suppressObserver = true; container.appendChild(mainBtn); moved = true; }
          mainBtn.classList.remove('mc3-hidden');
          mainBtn.style.order = restore ? '' : (slot !== undefined ? String(slot) : '');
          for (const b of matchedBtns) {
            if (b === mainBtn) continue;
            if (b.parentNode === extra) {
              // 抽屉内副本：由 mc3-mes-suppress CSS 隐藏，不动其属性 → 不触发第三方 observer 乒乓
              if (restore) { suppressObserver = true; b.remove(); moved = true; }
            } else {
              suppressObserver = true; b.remove(); moved = true;
            }
          }
        }
      }

      // extra 内无可见子项时联动隐藏 hint；restore 模式已重置 hint
      if (!restore && !extra.classList.contains('visible')) {
        hint.classList.toggle('mc3-hidden', visibleExtraChildrenCount === 0);
      }
    }

    if (!restore) buildMesSuppressCSS(records);
    else { const s = doc.getElementById('mc3-mes-suppress'); if (s) s.textContent = ''; }
    if (moved) win.setTimeout(() => { suppressObserver = false; }, 0);
  }

  const applyMesButtons = (records) => syncMesButtons(records, false);
  const clearMesButtons = (records) => syncMesButtons(records, true);

  // 无用元素默认隐藏（不提供滑块）
  function applyAlwaysHidden(on) {
    for (const sel of ALWAYS_HIDDEN) {
      for (const el of doc.querySelectorAll(sel)) el.classList.toggle('mc3-hidden', on);
    }
  }

  // 移除左下菜单/魔棒的原生分隔线
  function applySeparatorHides(on) {
    for (const sel of SEPARATOR_SELECTORS) {
      for (const hr of doc.querySelectorAll(sel)) hr.classList.toggle('mc3-hidden', on);
    }
  }

  // 自定义 Selector 显隐应用（跳过自建弹窗与启动入口）
  function applyCustomSelectors(on) {
    for (const item of settings.customSelectors || []) {
      if (!isValidCssSelector(item.selector)) continue;
      try {
        const hidden = on && !!settings.hidden[item.id];
        for (const el of doc.querySelectorAll(item.selector)) {
          if (isSelf(el) || el.closest('#mc3-overlay') || el.closest('#mc3-popup')) continue;
          el.classList.toggle('mc3-hidden', hidden);
        }
      } catch (_) {}
    }
  }

  // QR 面板原生折叠：内容非空时原位注入极简箭头折叠按钮
  function applyQrPanelFold() {
    const bar = doc.querySelector('#qr--bar');
    if (!bar) return;

    let toggleBtn = doc.getElementById('mc3-qr-toggle-btn');
    const clearFold = () => {
      if (toggleBtn) toggleBtn.style.display = 'none';
      bar.classList.remove('mc3-qr-bar-collapsed');
      for (const ch of bar.children) ch.classList.remove('mc3-qr-content-collapsed');
    };

    if (!settings.enabled || settings.enableQrFold === false) { clearFold(); return; }

    const contents = [];
    for (const ch of bar.children) {
      if (ch.id === 'mc3-qr-toggle-btn' || ch.id === 'qr--popoutTrigger') continue;
      if (!ch.classList.contains('mc3-hidden')) contents.push(ch);
    }
    if (contents.length === 0) { clearFold(); return; }

    if (!toggleBtn) {
      toggleBtn = doc.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.id = 'mc3-qr-toggle-btn';
      toggleBtn.className = 'mc3-qr-toggle-btn';
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        settings.qrPanelCollapsed = !settings.qrPanelCollapsed;
        saveSettings();
        applyAll();
      });
      suppressObserver = true;
      bar.insertBefore(toggleBtn, bar.firstChild);
      win.setTimeout(() => { suppressObserver = false; }, 0);
    }

    toggleBtn.style.display = 'inline-flex';
    const isCollapsed = !!settings.qrPanelCollapsed;
    bar.classList.toggle('mc3-qr-bar-collapsed', isCollapsed);
    const arrowHtml = '<span class="mc3-qr-arrow">' + (isCollapsed ? '▲' : '▼') + '</span>';
    if (toggleBtn.innerHTML !== arrowHtml) toggleBtn.innerHTML = arrowHtml;
    const titleText = isCollapsed ? '展开QR面板 (' + contents.length + '个条目)' : '折叠QR面板';
    if (toggleBtn.title !== titleText) toggleBtn.title = titleText;

    for (const child of bar.children) {
      if (child.id === 'mc3-qr-toggle-btn' || child.id === 'qr--popoutTrigger') continue;
      child.classList.toggle('mc3-qr-content-collapsed', isCollapsed);
    }
  }

  // 单组应用/清理派发（依 GROUPS 能力标志，取代散落的 id 字面量分支）
  function applyGroup(group, records) {
    if (group.customApply) { applyMesButtons(records); return; }
    if (group.supportsColumns) applyColumns(records); // 先定栏（唯一搬 DOM 处）
    if (!group.curated) applyOrder(group, records);   // curated 跨原生容器，仅做显隐
    applyHides(group, records);                       // 再可见性
    applyPseudoSubgroups(group, records);             // 最后同步原地伪抽屉标题
    if (group.hasUserDrawers) applyUserSettingsDrawers();
  }

  function clearGroup(group, records) {
    if (group.customApply) { clearMesButtons(records); return; }
    const seen = new Set();
    forEachElUnit(records, (el, unit) => {
      el.classList.remove('mc3-hidden');
      el.style.order = '';
      if (unit && !seen.has(unit)) {
        seen.add(unit);
        unit.style.order = '';
        unit.classList.remove('mc3-hidden');
        if (unit.style.display === 'contents') unit.style.display = '';
      }
    });
    if (group.hasUserDrawers) clearUserSettingsDrawers();
  }

  function applyAll() {
    ensureContainersObserved();
    injectStyle();
    setupLaunchers(); // 幂等：先补回入口，使其作为普通条目被随后的 scanAll 扫描/排序/隐藏
    applyAlwaysHidden(settings.enabled);
    applySeparatorHides(settings.enabled);
    applyCustomSelectors(settings.enabled);
    const all = scanAll();
    for (const group of GROUPS) {
      const recs = all[group.id] || [];
      if (settings.enabled) applyGroup(group, recs);
      else { clearGroup(group, recs); clearPseudoSubgroups(group); }
    }
    applyQrPanelFold();
    return all;
  }

  // ─── §7  OBSERVER ────────────────────────────────────────────────────────────

  let mainObs = null;
  const observedContainers = new Set();
  let cdObs = null;
  let cdActive = true;

  function ensureContainersObserved() {
    if (!mainObs) return;
    for (const g of GROUPS) {
      const conts = (g.containers || []).concat(g.observe || []);
      for (const sel of conts) {
        const el = doc.querySelector(sel);
        if (el && !observedContainers.has(el)) {
          observedContainers.add(el);
          mainObs.observe(el, { childList: true, subtree: true });
          if (cdActive && cdObs) cdObs.observe(el, { characterData: true, subtree: true });
        }
      }
    }
  }

  // 幂等 observer：容器子树有增删就防抖重应用，取代旧版多重兜底重扫描。
  function scheduleApply() {
    if (suppressObserver) return;
    ensureContainersObserved();
    if (applyTimer) win.clearTimeout(applyTimer);
    applyTimer = win.setTimeout(() => {
      applyTimer = null;
      if (!suppressObserver) applyAll();
    }, 300);
  }

  function setupObserver() {
    mainObs = new win.MutationObserver((muts) => {
      if (suppressObserver) return;
      for (const m of muts) {
        if (m.addedNodes.length || m.removedNodes.length) { scheduleApply(); return; }
      }
    });

    // 保留: 启动 20s 内临时加挂 characterData 监听，覆盖 Vue 异步组件先插空标签后补文本的时序（0623）。
    // 到点断开避免稳态开销——勿改为常驻。
    cdObs = new win.MutationObserver(() => { if (!suppressObserver) scheduleApply(); });
    win.setTimeout(() => {
      cdActive = false;
      if (cdObs) { cdObs.disconnect(); cdObs = null; }
    }, 20000);

    ensureContainersObserved();

    // 浅层监听 doc.body，捕获延迟追加的原生容器（如 #extensionsMenu / 魔棒菜单）
    const bodyObs = new win.MutationObserver((muts) => {
      if (suppressObserver) return;
      for (const m of muts) {
        if (m.addedNodes.length || m.removedNodes.length) {
          ensureContainersObserved();
          scheduleApply();
          return;
        }
      }
    });
    if (doc.body) {
      bodyObs.observe(doc.body, { childList: true });
    } else if (doc.documentElement) {
      bodyObs.observe(doc.documentElement, { childList: true });
    }

    // 捕获打开菜单按钮点击：确保即使在特殊时序下展开菜单，也能瞬时挂载监听并重应用
    doc.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('#extensionsMenuButton, #options_button, #extensions-settings-button')) {
        ensureContainersObserved();
        scheduleApply();
      }
    }, { capture: true, passive: true });

    try {
      if (win.eventSource && win.event_types) {
        if (win.event_types.CHAT_CHANGED) win.eventSource.on(win.event_types.CHAT_CHANGED, scheduleApply);
        if (win.event_types.APP_READY) win.eventSource.on(win.event_types.APP_READY, () => { ensureContainersObserved(); scheduleApply(); });
        if (win.event_types.EXTENSIONS_FIRST_LOAD) win.eventSource.on(win.event_types.EXTENSIONS_FIRST_LOAD, () => { ensureContainersObserved(); scheduleApply(); });
      }
    } catch (e) {}
  }

  // ─── §8  REORDER ENGINE ──────────────────────────────────────────────────────

  // 提交重排序：在场 key 按新顺序取 0..N-1，缺席 key 按旧槽位顺序沉底（无碰撞、可预期）。
  // 子分组打包：同子分组的所有 memberKeys 取连续槽位，整体跟随第一个被拖动的成员。
  function commitReorder(groupId, orderedKeys) {
    const map = settings.order[groupId] || (settings.order[groupId] = {});
    const sgList = Subgroups.list(groupId);

    const keyToSg = {};
    const sgMembers = {}; // sgId -> memberKeys[]
    for (const sg of sgList) {
      sgMembers[sg.id] = sg.memberKeys.slice();
      for (const mk of sg.memberKeys) keyToSg[mk] = sg.id;
    }

    const newMap = {};
    let slot = 0;
    const processedSg = {};
    const present = {};

    for (const key of orderedKeys) {
      const sgId = keyToSg[key];
      if (sgId && !processedSg[sgId]) {
        // 子分组打包：按 orderedKeys 出现顺序提取本组成员（保持拖后新序），
        // 不在 orderedKeys 中的成员（如折叠时不可见）按旧 map 顺序追加。
        const memberSet = {};
        for (const mk of sgMembers[sgId]) memberSet[mk] = 1;
        const members = [];
        const seen = {};
        for (const ok of orderedKeys) {
          if (memberSet[ok] && !seen[ok]) { members.push(ok); seen[ok] = 1; }
        }
        const rest = sgMembers[sgId].filter((k) => !seen[k]).sort((a, b) => (map[a] || 0) - (map[b] || 0));
        const allMembers = members.concat(rest);
        for (const m of allMembers) { newMap[m] = slot++; present[m] = 1; }
        processedSg[sgId] = true;
      } else if (!sgId) {
        newMap[key] = slot++;
        present[key] = 1;
      }
      // sgId && processedSg[sgId] → 同组后续成员，已打包，跳过
    }

    // 缺席 key 沉底
    const absent = Object.keys(map).filter((k) => !present[k]).sort((a, b) => map[a] - map[b]);
    for (const k of absent) newMap[k] = slot++;
    settings.order[groupId] = newMap;
  }

  // 有成员的子分组由首个成员 order 定位；空子分组按单独持久化的 popupPosition 插回顶层单元列表。
  function insertEmptySubgroupUnits(units, sgList, sgData) {
    const emptyUnits = [];
    for (let i = 0; i < sgList.length; i++) {
      const sg = sgList[i];
      if (sgData[sg.id] && sgData[sg.id].records.length > 0) continue;
      let requested = Number(sg.popupPosition);
      if (!isFinite(requested) || requested < 0) requested = 0;
      emptyUnits.push({ requested: Math.floor(requested), sourceIndex: i, unit: { type: 'subgroup', data: sgData[sg.id] } });
    }
    emptyUnits.sort((a, b) => a.requested - b.requested || a.sourceIndex - b.sourceIndex);

    let previousRequested = -1;
    let samePositionOffset = 0;
    for (const entry of emptyUnits) {
      if (entry.requested === previousRequested) samePositionOffset++;
      else samePositionOffset = 0;
      previousRequested = entry.requested;
      const insertionIndex = Math.min(entry.requested + samePositionOffset, units.length);
      units.splice(insertionIndex, 0, entry.unit);
    }
    return units;
  }

  function persistSubgroupPositions(list, groupId) {
    let position = 0;
    for (const child of list.children) {
      if (!child.classList.contains('mc3-row') && !child.classList.contains('mc3-subgroup')) continue;
      if (child.classList.contains('mc3-subgroup')) {
        const sg = Subgroups.getById(groupId, child.getAttribute('data-sgid'));
        if (sg) sg.popupPosition = position;
      }
      position++;
    }
  }

  // 重置所有设置为默认值（保留 native 快照供恢复原始）
  function resetAll() {
    // 先清除自定义 Selector 施加的隐藏
    for (const item of settings.customSelectors || []) {
      if (isValidCssSelector(item.selector)) {
        try { for (const el of doc.querySelectorAll(item.selector)) el.classList.remove('mc3-hidden'); }
        catch (_) {}
      }
    }
    const nativeOrder = settings.nativeOrder || {};
    const nativeColumn = settings.nativeColumn || {};
    const activeTab = settings.activeTab; // 保留: 与 v1 一致，重置不切走当前页签
    settings = Store.freshDefaults();
    settings.order = JSON.parse(JSON.stringify(nativeOrder));
    settings.column = Object.assign({}, nativeColumn);
    settings.nativeOrder = JSON.parse(JSON.stringify(nativeOrder));
    settings.nativeColumn = Object.assign({}, nativeColumn);
    if (activeTab) settings.activeTab = activeTab;
    Store.normalize(settings);
    // resetAll 重新绑定了 settings，同步刷新 __mc3.settings 引用（否则调试面板读到旧对象）
    if (win.__mc3) win.__mc3.settings = settings;
    saveSettings(); applyAll(); renderPopup();
  }

  // ─── §9  UI — STYLE ──────────────────────────────────────────────────────────

  const POPUP_CSS =
    '#mc3-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;width:100dvw;height:100dvh;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.5);}' +
    '#mc3-popup{display:flex;flex-direction:column;width:min(600px,94vw);max-height:86vh;background:var(--SmartThemeBlurTintColor,#1e1e1e);color:var(--mc3-font-color,var(--SmartThemeBodyColor,#eee));border:1px solid var(--SmartThemeBorderColor,#555);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);overflow:hidden;}' +
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
    // RGB 拾色器样式
    '.mc3-color-picker-box{display:flex;flex-direction:column;gap:10px;margin-top:10px;padding:12px;background:var(--black30a,rgba(0,0,0,.25));border:1px solid var(--SmartThemeBorderColor,#444);border-radius:8px;box-sizing:border-box;}' +
    '.mc3-rgb-row{display:flex;align-items:center;gap:10px;}' +
    '.mc3-rgb-badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px;font-size:11px;font-weight:bold;color:#fff;flex-shrink:0;user-select:none;}' +
    '.mc3-rgb-badge.r{background:#e74c3c;}' +
    '.mc3-rgb-badge.g{background:#2ecc71;}' +
    '.mc3-rgb-badge.b{background:#3498db;}' +
    '.mc3-rgb-slider{flex:1;-webkit-appearance:none;appearance:none;height:8px;border-radius:4px;outline:none;cursor:pointer;margin:0;border:1px solid rgba(255,255,255,.15);}' +
    '.mc3-rgb-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:1px solid rgba(0,0,0,.3);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.5);}' +
    '.mc3-rgb-slider::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:1px solid rgba(0,0,0,.3);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.5);}' +
    '.mc3-rgb-val{width:32px;text-align:right;font-size:12px;font-family:monospace;font-weight:600;opacity:.85;flex-shrink:0;}' +
    '.mc3-color-preview-row{display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--SmartThemeBorderColor,#444);gap:8px;}' +
    '.mc3-color-preview-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1;}' +
    '.mc3-color-swatch{width:22px;height:22px;border-radius:4px;border:1px solid rgba(255,255,255,.25);box-shadow:0 1px 3px rgba(0,0,0,.3);flex-shrink:0;}' +
    '.mc3-color-preview-text{font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.mc3-color-preview-right{display:flex;align-items:center;gap:8px;flex-shrink:0;}' +
    '.mc3-color-code{font-family:monospace;font-size:11px;opacity:.7;}' +
    '.mc3-reset-color-btn{cursor:pointer;background:var(--black30a,rgba(0,0,0,.3));color:inherit;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:4px;padding:2px 8px;font-size:11px;opacity:.8;transition:all .15s;}' +
    '.mc3-reset-color-btn:hover{opacity:1;background:var(--black50a,rgba(128,128,128,.3));}' +
    // 折叠箭头与动画
    '.mc3-chevron{display:inline-block;transition:transform var(--mc3-dur,.25s) cubic-bezier(.4,0,.2,1);transform:rotate(0deg);line-height:1;font-size:28px;}' +
    // 卡片样式
    '.mc3-card{background:var(--black20a,rgba(255,255,255,.02));border:1px solid var(--SmartThemeBorderColor,#444);border-radius:10px;margin:8px 4px;overflow:hidden;}' +
    '.mc3-card-header{display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--black30a,rgba(0,0,0,.2));font-weight:bold;font-size:13px;border-bottom:1px solid var(--SmartThemeBorderColor,#444);transition:border-bottom-color var(--mc3-dur,.25s) ease;cursor:pointer;user-select:none;}' +
    '.mc3-card.mc3-collapsed .mc3-card-header{border-bottom-color:transparent;}' +
    '.mc3-card-header small{opacity:.5;font-weight:normal;margin-right:auto;cursor:pointer;}' +
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
    '.mc3-subgroup-header{display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--black20a,rgba(255,255,255,.02));cursor:pointer;user-select:none;}' +
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
    const st = doc.createElement('style'); st.id = 'mc3-popup-style'; st.textContent = POPUP_CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  function detectInitialRgb(popup) {
    try {
      if (popup && popup.style) {
        const prev = popup.style.getPropertyValue('--mc3-font-color');
        popup.style.removeProperty('--mc3-font-color');
        const col = win.getComputedStyle(popup).color;
        if (prev) popup.style.setProperty('--mc3-font-color', prev);
        const m = col && col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (m) {
          return {
            r: clampRgb(m[1], 238),
            g: clampRgb(m[2], 238),
            b: clampRgb(m[3], 238),
          };
        }
      }
      if (doc.body && win.getComputedStyle) {
        const col = win.getComputedStyle(doc.body).color;
        const m = col && col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (m) {
          return {
            r: clampRgb(m[1], 238),
            g: clampRgb(m[2], 238),
            b: clampRgb(m[3], 238),
          };
        }
      }
    } catch (_) {}
    return { r: 238, g: 238, b: 238 };
  }

  function applyFontColor() {
    const popup = doc.getElementById('mc3-popup');
    if (!popup) return;
    if (settings.customFontColorEnabled && settings.customFontColor) {
      const { r, g, b } = settings.customFontColor;
      popup.style.setProperty('--mc3-font-color', 'rgb(' + r + ',' + g + ',' + b + ')');
    } else {
      popup.style.removeProperty('--mc3-font-color');
    }
  }

  // ─── §10  UI — RENDER ────────────────────────────────────────────────────────

  // 共享卡片壳：折叠标题 + body 容器。headerExtra 放在标题右侧（如「+」新建子分组）。
  function renderCard(gid, titleText, count, collapsed, dur, bodyHtml, headerExtra) {
    return '<div class="mc3-card' + (collapsed ? ' mc3-collapsed' : '') + '" style="--mc3-dur:' + dur + 's;">' +
      '<div class="mc3-card-header" data-action="toggle-group" data-gid="' + gid + '" title="折叠或展开父分组">' +
        '<button type="button" class="mc3-card-collapse" title="折叠或展开父分组"><span class="mc3-chevron">▾</span></button>' +
        '<span class="mc3-card-title">' + escHtml(titleText) + '</span>' +
        '<small>(' + count + ')</small>' +
        (headerExtra || '') +
      '</div>' +
      '<div class="mc3-card-body"><div class="mc3-card-body-inner">' + bodyHtml + '</div></div>' +
    '</div>';
  }

  // 渲染子分组标题栏。左：手柄+折叠三角+标题+重命名 ｜ 右：分栏(可选)+显隐+删除
  function renderSubgroupHeader(sg, group, recs) {
    const allHidden = recs.length > 0 && recs.every((r) => !!settings.hidden[r.key]);
    const hideLabel = allHidden ? '隐藏' : '显示';
    let html = '<div class="mc3-subgroup-header" data-action="toggle-subgroup" data-sgid="' + sg.id + '" data-gid="' + group.id + '" title="折叠或展开子分组">';
    html += '<span class="mc3-handle mc3-sg-handle" title="拖动子分组排序">⠿</span>';
    html += '<button type="button" class="mc3-subgroup-collapse" title="折叠或展开子分组"><span class="mc3-chevron">▾</span></button>';
    html += '<span class="mc3-subgroup-name" data-sgid="' + sg.id + '" data-gid="' + group.id + '">' + escHtml(sg.name) + '</span>';
    html += '<button class="mc3-icon-btn" data-action="start-rename-sg" data-sgid="' + sg.id + '" data-gid="' + group.id + '" title="重命名">✎</button>';
    if (group.id === 'extensionsSettings') {
      const sgCol = sg.column !== undefined ? sg.column : 0;
      const colTitle = sgCol === 1 ? '点击移至左栏' : '点击移至右栏';
      html += '<button class="mc3-toggle' + (sgCol === 1 ? ' on' : '') + '" data-action="toggle-sg-col" data-sgid="' + sg.id + '" data-gid="' + group.id + '" data-col="' + sgCol + '" title="' + colTitle + '">' + (sgCol === 1 ? '右' : '左') + '</button>';
    }
    html += '<button class="mc3-toggle' + (allHidden ? '' : ' on') + '" data-action="toggle-sg-hide" data-sgid="' + sg.id + '" data-gid="' + group.id + '">' + hideLabel + '</button>';
    html += '<button class="mc3-icon-btn" data-action="delete-subgroup" data-sgid="' + sg.id + '" data-gid="' + group.id + '" title="删除分组">✕</button>';
    html += '</div>';
    return html;
  }

  // 渲染单行条目
  function renderItemRow(r, group, inSubgroup) {
    const hidden = !!settings.hidden[r.key];
    const col = (settings.column[r.key] !== undefined ? settings.column[r.key] : r.column);
    let html = '<div class="mc3-row' + (hidden ? ' mc3-off' : '') + '" data-key="' + escHtml(r.key) + '" data-gid="' + group.id + '">';
    if (r.curated) {
      html += '<span style="visibility:hidden;width:16px;flex-shrink:0"></span>';
    } else {
      html += '<span class="mc3-handle" title="拖动排序">⠿</span>';
    }
    html += '<span class="mc3-label">' + escHtml(r.label) + '</span>';
    if (r.column !== undefined && group.id === 'extensionsSettings' && !inSubgroup) {
      const colLabel = col === 1 ? '右' : '左';
      const colTitle = col === 1 ? '点击移至左栏' : '点击移至右栏';
      html += '<button class="mc3-toggle' + (col === 1 ? ' on' : '') + '" data-action="toggle-col" data-key="' + escHtml(r.key) + '" data-col="' + col + '" title="' + colTitle + '">' + colLabel + '</button>';
    }
    html += '<button class="mc3-toggle' + (hidden ? '' : ' on') + '" data-action="toggle-hide" data-key="' + escHtml(r.key) + '">' + (hidden ? '隐藏' : '显示') + '</button>';
    html += '</div>';
    return html;
  }

  // 渲染消息操作单行条目
  function renderMesRow(r) {
    const hidden = !!settings.hidden[r.key];
    const col = (settings.column[r.key] !== undefined ? settings.column[r.key] : r.nativeColumn);
    let html = '<div class="mc3-row' + (hidden ? ' mc3-off' : '') + '" data-key="' + escHtml(r.key) + '" data-gid="mesButtons" data-col="' + col + '">';
    html += '<span class="mc3-handle" title="拖动排序或跨栏拖动">⠿</span>';
    html += '<span class="mc3-label">' + escHtml(r.label) + '</span>';
    const colLabel = col === 1 ? '外显' : '收纳';
    const colTitle = col === 1 ? '点击收纳至...内' : '点击移至始终外显';
    html += '<button class="mc3-toggle' + (col === 1 ? ' on' : '') + '" data-action="toggle-col" data-key="' + escHtml(r.key) + '" data-col="' + col + '" title="' + colTitle + '">' + colLabel + '</button>';
    html += '<button class="mc3-toggle' + (hidden ? '' : ' on') + '" data-action="toggle-hide" data-key="' + escHtml(r.key) + '">' + (hidden ? '隐藏' : '显示') + '</button>';
    html += '</div>';
    return html;
  }

  // 渲染扩展菜单专属双栏卡片
  function renderExtensionsSettingsCard(group, recs, map) {
    const isCollapsed = !!settings.groupCollapsed[group.id];
    const cardDur = calcCollapseDuration(recs.length);
    const sgList = Subgroups.list(group.id);

    const keyToSg = {};
    const sgData = {}; // sgId -> { subgroup, records[], minSlot }
    for (const sg of sgList) {
      sgData[sg.id] = { subgroup: sg, records: [], minSlot: Infinity };
      for (const mk of sg.memberKeys) keyToSg[mk] = sg.id;
    }

    recs.sort((a, b) => (map[a.key] || 0) - (map[b.key] || 0));

    const col0Units = [];
    const col1Units = [];
    let col0Count = 0;
    let col1Count = 0;

    for (const r of recs) {
      const sgId = keyToSg[r.key];
      if (sgId && sgData[sgId]) {
        sgData[sgId].records.push(r);
        const slot = map[r.key] || 0;
        if (slot < sgData[sgId].minSlot) sgData[sgId].minSlot = slot;
      } else {
        const col = settings.column[r.key] !== undefined ? settings.column[r.key] : (r.column !== undefined ? r.column : 0);
        const unit = { type: 'item', record: r, slot: map[r.key] || 0 };
        if (col === 1) { col1Units.push(unit); col1Count++; }
        else { col0Units.push(unit); col0Count++; }
      }
    }

    for (const sid in sgData) {
      const data = sgData[sid];
      const sgCol = data.subgroup.column !== undefined ? data.subgroup.column : 0;
      if (data.records.length > 0) {
        const unit = { type: 'subgroup', data: data, slot: data.minSlot };
        if (sgCol === 1) { col1Units.push(unit); col1Count += data.records.length; }
        else { col0Units.push(unit); col0Count += data.records.length; }
      }
    }

    col0Units.sort((a, b) => a.slot - b.slot);
    col1Units.sort((a, b) => a.slot - b.slot);

    // 插回空子分组
    const col0SgList = sgList.filter((s) => (s.column !== 1));
    const col1SgList = sgList.filter((s) => (s.column === 1));
    insertEmptySubgroupUnits(col0Units, col0SgList, sgData);
    insertEmptySubgroupUnits(col1Units, col1SgList, sgData);

    const renderUnit = (unit) => {
      if (unit.type === 'item') {
        return renderItemRow(unit.record, group, false);
      } else {
        const sg = unit.data.subgroup;
        const sgRecs = unit.data.records;
        sgRecs.sort((a, b) => (map[a.key] || 0) - (map[b.key] || 0));
        const isSgCollapsed = !!sg.collapsed;
        const sgDur = calcCollapseDuration(sgRecs.length);

        let html = '<div class="mc3-subgroup' + (isSgCollapsed ? ' mc3-collapsed' : '') + '" data-sgid="' + sg.id + '" data-gid="' + group.id + '" style="--mc3-dur:' + sgDur + 's;">';
        html += renderSubgroupHeader(sg, group, sgRecs);
        html += '<div class="mc3-subgroup-body"><div class="mc3-subgroup-body-inner">';
        html += '<div class="mc3-subgroup-items" data-sgid="' + sg.id + '" data-gid="' + group.id + '">';
        if (sgRecs.length === 0) {
          html += '<div class="mc3-row" style="opacity:.25;font-style:italic;justify-content:center;padding:10px;font-size:12px">拖动条目到此处加入分组</div>';
        } else {
          for (const sr of sgRecs) html += renderItemRow(sr, group, true);
        }
        html += '</div></div></div></div>';
        return html;
      }
    };

    const emptyTip = (txt) => '<div class="mc3-row mc3-empty-tip" style="opacity:.25;font-style:italic;justify-content:center;padding:12px;font-size:12px">' + txt + '</div>';

    let cols = '<div class="mc3-mes-columns" data-gid="' + group.id + '">';
    // 栏0：左栏
    cols += '<div class="mc3-mes-column" data-col="0">';
    cols += '<div class="mc3-mes-col-header"><span class="mc3-mes-col-title">左栏</span><span class="mc3-mes-col-count">(' + col0Count + ')</span></div>';
    cols += '<div class="mc3-list mc3-mes-list" data-gid="' + group.id + '" data-col="0">';
    cols += col0Units.length === 0 ? emptyTip('拖动条目到此处 (左栏)') : col0Units.map(renderUnit).join('');
    cols += '</div></div>';
    // 栏1：右栏
    cols += '<div class="mc3-mes-column" data-col="1">';
    cols += '<div class="mc3-mes-col-header"><span class="mc3-mes-col-title">右栏</span><span class="mc3-mes-col-count">(' + col1Count + ')</span></div>';
    cols += '<div class="mc3-list mc3-mes-list" data-gid="' + group.id + '" data-col="1">';
    cols += col1Units.length === 0 ? emptyTip('拖动条目到此处 (右栏)') : col1Units.map(renderUnit).join('');
    cols += '</div></div>';
    cols += '</div>';

    const headerExtra = '<button class="mc3-icon-btn" data-action="add-subgroup" data-gid="' + group.id + '" title="新建子分组" style="font-size:18px;font-weight:bold">+</button>';

    return renderCard(group.id, group.name, recs.length, isCollapsed, cardDur, cols, headerExtra);
  }

  // 渲染消息操作专属双栏卡片
  function renderMesButtonsCard(group, recs, map) {
    const isCollapsed = !!settings.groupCollapsed[group.id];
    const cardDur = calcCollapseDuration(recs.length);

    const col0Recs = [];
    const col1Recs = [];
    for (const r of recs) {
      const col = settings.column[r.key] !== undefined ? settings.column[r.key] : r.nativeColumn;
      if (col === 0) col0Recs.push(r); else col1Recs.push(r);
    }
    col0Recs.sort((a, b) => (map[a.key] || 0) - (map[b.key] || 0));
    col1Recs.sort((a, b) => (map[a.key] || 0) - (map[b.key] || 0));

    const emptyTip = (txt) => '<div class="mc3-row mc3-empty-tip" style="opacity:.25;font-style:italic;justify-content:center;padding:12px;font-size:12px">' + txt + '</div>';
    let cols = '<div class="mc3-mes-columns" data-gid="' + group.id + '">';
    // 栏0：被省略号收纳
    cols += '<div class="mc3-mes-column" data-col="0">';
    cols += '<div class="mc3-mes-col-header"><span class="mc3-mes-col-title">收纳至...内</span><span class="mc3-mes-col-count">(' + col0Recs.length + ')</span></div>';
    cols += '<div class="mc3-list mc3-mes-list" data-gid="' + group.id + '" data-col="0">';
    cols += col0Recs.length === 0 ? emptyTip('拖动元素到此处收纳') : col0Recs.map(renderMesRow).join('');
    cols += '</div></div>';
    // 栏1：不被省略号收纳
    cols += '<div class="mc3-mes-column" data-col="1">';
    cols += '<div class="mc3-mes-col-header"><span class="mc3-mes-col-title">始终外显</span><span class="mc3-mes-col-count">(' + col1Recs.length + ')</span></div>';
    cols += '<div class="mc3-list mc3-mes-list" data-gid="' + group.id + '" data-col="1">';
    cols += col1Recs.length === 0 ? emptyTip('拖动元素到此处外显') : col1Recs.map(renderMesRow).join('');
    cols += '</div></div>';
    cols += '</div>';

    return renderCard(group.id, group.name, recs.length, isCollapsed, cardDur, cols);
  }

  function renderSettingsPanel() {
    let html = '<div class="mc3-settings-panel">';
    html += '<div class="mc3-setting-row">' +
      '<label class="mc3-setting-label" for="mc3-set-enabled"><span>启用插件</span></label>' +
      '<input type="checkbox" id="mc3-set-enabled" class="mc3-checkbox" data-action="set-enabled"' + (settings.enabled ? ' checked' : '') + '>' +
      '</div>';
    html += '<div class="mc3-setting-row">' +
      '<span class="mc3-setting-label">扩展面板状态</span>' +
      '<div class="mc3-segment-switch">' +
        '<button class="mc3-segment-btn' + (settings.columnMode === 'single' ? ' active' : '') + '" data-action="set-colmode" data-val="single">单栏</button>' +
        '<button class="mc3-segment-btn' + (settings.columnMode === 'dual' ? ' active' : '') + '" data-action="set-colmode" data-val="dual">双栏</button>' +
      '</div>' +
      '</div>';
    html += '<div class="mc3-setting-row">' +
      '<label class="mc3-setting-label" for="mc3-set-qrfold"><span>启用QR面板折叠</span></label>' +
      '<input type="checkbox" id="mc3-set-qrfold" class="mc3-checkbox" data-action="set-qrfold"' + (settings.enableQrFold !== false ? ' checked' : '') + '>' +
      '</div>';
    html += '<div class="mc3-setting-row">' +
      '<label class="mc3-setting-label" for="mc3-set-userfold"><span>启用用户设置条目折叠</span></label>' +
      '<input type="checkbox" id="mc3-set-userfold" class="mc3-checkbox" data-action="set-userfold"' + (settings.enableUserFold !== false ? ' checked' : '') + '>' +
      '</div>';
    html += '<div class="mc3-setting-row">' +
      '<label class="mc3-setting-label" for="mc3-set-customcss"><span>将自定义CSS块从杂项中独立出来</span></label>' +
      '<input type="checkbox" id="mc3-set-customcss" class="mc3-checkbox" data-action="set-customcss"' + (settings.isolateCustomCss ? ' checked' : '') + '>' +
      '</div>';
    html += '<div class="mc3-setting-row" style="flex-direction:column;align-items:stretch;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;">' +
        '<label class="mc3-setting-label" for="mc3-set-custom-color"><span>指定字体颜色</span></label>' +
        '<input type="checkbox" id="mc3-set-custom-color" class="mc3-checkbox" data-action="set-custom-color"' + (settings.customFontColorEnabled ? ' checked' : '') + '>' +
      '</div>';
    if (settings.customFontColorEnabled) {
      const c = settings.customFontColor || { r: 238, g: 238, b: 238 };
      const r = c.r, g = c.g, b = c.b;
      const hex = rgbToHex(r, g, b);
      const gradR = 'linear-gradient(to right, rgb(0,' + g + ',' + b + '), rgb(255,' + g + ',' + b + '))';
      const gradG = 'linear-gradient(to right, rgb(' + r + ',0,' + b + '), rgb(' + r + ',255,' + b + '))';
      const gradB = 'linear-gradient(to right, rgb(' + r + ',' + g + ',0), rgb(' + r + ',' + g + ',255))';
      html += '<div class="mc3-color-picker-box">' +
        '<div class="mc3-rgb-row">' +
          '<span class="mc3-rgb-badge r">R</span>' +
          '<input type="range" class="mc3-rgb-slider" data-channel="r" min="0" max="255" value="' + r + '" style="background:' + gradR + ';">' +
          '<span class="mc3-rgb-val" id="mc3-rgb-val-r">' + r + '</span>' +
        '</div>' +
        '<div class="mc3-rgb-row">' +
          '<span class="mc3-rgb-badge g">G</span>' +
          '<input type="range" class="mc3-rgb-slider" data-channel="g" min="0" max="255" value="' + g + '" style="background:' + gradG + ';">' +
          '<span class="mc3-rgb-val" id="mc3-rgb-val-g">' + g + '</span>' +
        '</div>' +
        '<div class="mc3-rgb-row">' +
          '<span class="mc3-rgb-badge b">B</span>' +
          '<input type="range" class="mc3-rgb-slider" data-channel="b" min="0" max="255" value="' + b + '" style="background:' + gradB + ';">' +
          '<span class="mc3-rgb-val" id="mc3-rgb-val-b">' + b + '</span>' +
        '</div>' +
        '<div class="mc3-color-preview-row">' +
          '<div class="mc3-color-preview-left">' +
            '<div class="mc3-color-swatch" id="mc3-color-swatch" style="background-color:rgb(' + r + ',' + g + ',' + b + ');"></div>' +
            '<span class="mc3-color-preview-text" id="mc3-color-preview-text" style="color:rgb(' + r + ',' + g + ',' + b + ');">示例文本 Preview</span>' +
          '</div>' +
          '<div class="mc3-color-preview-right">' +
            '<span class="mc3-color-code" id="mc3-color-code">' + hex + '</span>' +
            '<button type="button" class="mc3-reset-color-btn" data-action="reset-custom-color" title="重新从酒馆抓取字体颜色">重置</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }
    html += '</div>';
    html += '<div class="mc3-setting-row">' +
      '<span class="mc3-setting-label">恢复配置初始状态</span>' +
      '<button class="mc3-danger-btn" data-action="clear-data">清除插件数据</button>' +
      '</div>';
    html += '</div>';
    return html;
  }

  function renderSortPanel() {
    const all = scanAll();
    let html = '<div id="mc3-tools"><span class="mc3-tip">点击 + 号新建一个子分组</span></div>';

    for (const group of GROUPS) {
      const recs = (all[group.id] || []).slice();
      const map = settings.order[group.id] || {};

      if (group.customApply) { html += renderMesButtonsCard(group, recs, map); continue; }
      if (group.id === 'extensionsSettings') { html += renderExtensionsSettingsCard(group, recs, map); continue; }

      const supportsSg = supportsPseudoSubgroups(group);
      const sgList = supportsSg ? Subgroups.list(group.id) : [];

      recs.sort((a, b) => (map[a.key] || 0) - (map[b.key] || 0));

      // key→sg 映射 & sg 数据
      const keyToSg = {};
      const sgData = {}; // sgId -> { subgroup, records[], minSlot }
      for (const sg of sgList) {
        sgData[sg.id] = { subgroup: sg, records: [], minSlot: Infinity };
        for (const mk of sg.memberKeys) keyToSg[mk] = sg.id;
      }

      // 构建展示单元
      const units = [];
      for (const r of recs) {
        const sgId = keyToSg[r.key];
        if (sgId && sgData[sgId]) {
          sgData[sgId].records.push(r);
          const slot = map[r.key] || 0;
          if (slot < sgData[sgId].minSlot) sgData[sgId].minSlot = slot;
        } else {
          units.push({ type: 'item', record: r, slot: map[r.key] || 0 });
        }
      }
      for (const sid in sgData) {
        if (sgData[sid].records.length > 0) units.push({ type: 'subgroup', data: sgData[sid], slot: sgData[sid].minSlot });
      }
      units.sort((a, b) => a.slot - b.slot);
      insertEmptySubgroupUnits(units, sgList, sgData);

      // 卡片 body
      let body = '<div class="mc3-list" data-gid="' + group.id + '">';
      for (const unit of units) {
        if (unit.type === 'item') {
          body += renderItemRow(unit.record, group, false);
        } else {
          const sg = unit.data.subgroup;
          const sgRecs = unit.data.records;
          sgRecs.sort((a, b) => (map[a.key] || 0) - (map[b.key] || 0));
          const isSgCollapsed = !!sg.collapsed;
          const sgDur = calcCollapseDuration(sgRecs.length);

          body += '<div class="mc3-subgroup' + (isSgCollapsed ? ' mc3-collapsed' : '') + '" data-sgid="' + sg.id + '" data-gid="' + group.id + '" style="--mc3-dur:' + sgDur + 's;">';
          body += renderSubgroupHeader(sg, group, sgRecs);
          body += '<div class="mc3-subgroup-body"><div class="mc3-subgroup-body-inner">';
          body += '<div class="mc3-subgroup-items" data-sgid="' + sg.id + '" data-gid="' + group.id + '">';
          if (sgRecs.length === 0) {
            body += '<div class="mc3-row" style="opacity:.25;font-style:italic;justify-content:center;padding:10px;font-size:12px">拖动条目到此处加入分组</div>';
          } else {
            for (const sr of sgRecs) body += renderItemRow(sr, group, true);
          }
          body += '</div></div></div></div>';
        }
      }
      body += '</div>';

      const headerExtra = supportsSg
        ? '<button class="mc3-icon-btn" data-action="add-subgroup" data-gid="' + group.id + '" title="新建子分组" style="font-size:18px;font-weight:bold">+</button>'
        : '';
      html += renderCard(group.id, group.name, recs.length, !!settings.groupCollapsed[group.id], calcCollapseDuration(recs.length), body, headerExtra);
    }

    // 自定义 Selector 卡片
    const customList = settings.customSelectors || [];
    const customCollapsed = settings.groupCollapsed['customSelectors'] !== false;
    let cbody = '<div style="padding:8px 10px;">';
    cbody += '<div class="mc3-custom-add-row">' +
      '<input type="text" id="mc3-custom-selector-input" class="mc3-custom-input" placeholder="输入 CSS Selector，然后将它们送入虚空">' +
      '<button type="button" class="mc3-toggle on" data-action="add-custom-selector" style="padding:4px 12px;font-size:12px;cursor:pointer;">+ 添加</button>' +
      '</div>';
    cbody += '<div class="mc3-list">';
    if (customList.length === 0) {
      cbody += '<div class="mc3-row" style="opacity:.35;font-style:italic;justify-content:center;padding:10px;font-size:12px">暂无自定义 Selector，在上方输入后点击添加喵～</div>';
    } else {
      for (const cItem of customList) {
        const cHidden = !!settings.hidden[cItem.id];
        let matchedCount = 0;
        if (isValidCssSelector(cItem.selector)) {
          try {
            for (const m of doc.querySelectorAll(cItem.selector)) {
              if (!isSelf(m) && !m.closest('#mc3-overlay') && !m.closest('#mc3-popup')) matchedCount++;
            }
          } catch (_) {}
        }
        cbody += '<div class="mc3-row' + (cHidden ? ' mc3-off' : '') + '" data-custom-id="' + escHtml(cItem.id) + '">';
        cbody += '<span class="mc3-label mc3-mid-truncate" title="' + escHtml(cItem.selector) + '">' +
                renderSelectorLabelHtml(cItem.label || cItem.selector, matchedCount) + '</span>';
        cbody += '<button class="mc3-toggle' + (cHidden ? '' : ' on') + '" data-action="toggle-custom-hide" data-custom-id="' + escHtml(cItem.id) + '">' + (cHidden ? '隐藏' : '显示') + '</button>';
        cbody += '<button class="mc3-icon-btn" data-action="delete-custom-selector" data-custom-id="' + escHtml(cItem.id) + '" title="删除此选择器" style="font-size:14px;padding:2px 6px;margin-left:4px;">✕</button>';
        cbody += '</div>';
      }
    }
    cbody += '</div></div>';
    html += renderCard('customSelectors', '指哪消哪', customList.length, customCollapsed, calcCollapseDuration(customList.length), cbody);

    return html;
  }

  function renderPopup() {
    const body = doc.getElementById('mc3-body'); if (!body) return;
    applyFontColor();
    const activeTab = settings.activeTab || 'sort';
    for (const tab of doc.querySelectorAll('#mc3-head .mc3-tab')) {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === activeTab);
    }
    body.innerHTML = activeTab === 'settings' ? renderSettingsPanel() : renderSortPanel();
  }

  function buildPopup() {
    if (doc.getElementById('mc3-overlay')) return;
    injectPopupCSS();
    const ov = doc.createElement('div'); ov.id = 'mc3-overlay';
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
    (doc.documentElement || doc.body).appendChild(ov); // 挂到 html，规避主题祖先 transform/filter 致 fixed 偏移
    ov.addEventListener('click', (e) => { if (e.target === ov) closePopup(); });
    const popup = ov.querySelector('#mc3-popup');
    popup.addEventListener('click', onPopupClick);
    popup.addEventListener('pointerdown', onPopupPointerDown);
    popup.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target && e.target.id === 'mc3-custom-selector-input') {
        e.preventDefault();
        const res = CustomSelectors.add(e.target.value.trim());
        if (!res.success) { alert(res.error); e.target.focus(); } else { renderPopup(); }
      }
    });
    popup.addEventListener('input', (e) => {
      const slider = e.target.closest('.mc3-rgb-slider');
      if (!slider) return;
      const channel = slider.getAttribute('data-channel');
      const val = clampRgb(slider.value, 0);
      if (!settings.customFontColor) settings.customFontColor = { r: 238, g: 238, b: 238 };
      settings.customFontColor[channel] = val;
      const { r, g, b } = settings.customFontColor;

      const valEl = doc.getElementById('mc3-rgb-val-' + channel);
      if (valEl) valEl.textContent = String(val);

      applyFontColor();

      const swatch = doc.getElementById('mc3-color-swatch');
      if (swatch) swatch.style.backgroundColor = 'rgb(' + r + ',' + g + ',' + b + ')';
      const previewText = doc.getElementById('mc3-color-preview-text');
      if (previewText) previewText.style.color = 'rgb(' + r + ',' + g + ',' + b + ')';
      const codeEl = doc.getElementById('mc3-color-code');
      if (codeEl) codeEl.textContent = rgbToHex(r, g, b);

      const rSlider = popup.querySelector('.mc3-rgb-slider[data-channel="r"]');
      if (rSlider) rSlider.style.background = 'linear-gradient(to right, rgb(0,' + g + ',' + b + '), rgb(255,' + g + ',' + b + '))';
      const gSlider = popup.querySelector('.mc3-rgb-slider[data-channel="g"]');
      if (gSlider) gSlider.style.background = 'linear-gradient(to right, rgb(' + r + ',0,' + b + '), rgb(' + r + ',255,' + b + '))';
      const bSlider = popup.querySelector('.mc3-rgb-slider[data-channel="b"]');
      if (bSlider) bSlider.style.background = 'linear-gradient(to right, rgb(' + r + ',' + g + ',0), rgb(' + r + ',' + g + ',255))';
    });
    popup.addEventListener('change', (e) => {
      if (e.target && e.target.classList.contains('mc3-rgb-slider')) {
        saveSettings();
      }
    });
  }

  function openPopup() { buildPopup(); renderPopup(); doc.getElementById('mc3-overlay').style.display = 'flex'; }
  function closePopup() { const o = doc.getElementById('mc3-overlay'); if (o) o.style.display = 'none'; }

  // ─── §11  UI — INTERACT ──────────────────────────────────────────────────────

  // data-action → 处理器映射，取代旧版 20 分支 else-if 链
  const POPUP_ACTIONS = {
    'close': () => closePopup(),

    'switch-tab': (t) => {
      settings.activeTab = t.getAttribute('data-tab');
      saveSettings(); renderPopup();
    },

    'set-enabled': (t) => {
      settings.enabled = t.checked; saveSettings(); applyAll(); renderPopup();
    },

    'set-colmode': (t) => { setColumnMode(t.getAttribute('data-val')); renderPopup(); },

    'set-qrfold': (t) => { settings.enableQrFold = t.checked; saveSettings(); applyAll(); renderPopup(); },

    'set-userfold': (t) => { settings.enableUserFold = t.checked; saveSettings(); applyAll(); renderPopup(); },

    'set-customcss': (t) => { settings.isolateCustomCss = t.checked; saveSettings(); applyAll(); renderPopup(); },

    'set-custom-color': (t) => {
      settings.customFontColorEnabled = !!t.checked;
      if (settings.customFontColorEnabled) {
        if (!settings.customFontColor) {
          settings.customFontColor = detectInitialRgb(doc.getElementById('mc3-popup'));
        }
      }
      saveSettings();
      applyFontColor();
      renderPopup();
    },

    'reset-custom-color': () => {
      settings.customFontColor = detectInitialRgb(doc.getElementById('mc3-popup'));
      saveSettings();
      applyFontColor();
      renderPopup();
    },

    'clear-data': () => { if (confirm('确定要清除所有插件数据并恢复原始状态吗？')) resetAll(); },

    'toggle-group': (t, e) => {
      if (e && e.target && e.target.closest('.mc3-icon-btn, .mc3-toggle, input')) return;
      const groupId = t.getAttribute('data-gid');
      const card = t.closest('.mc3-card');
      const willCollapse = card ? !card.classList.contains('mc3-collapsed') : !settings.groupCollapsed[groupId];
      settings.groupCollapsed[groupId] = willCollapse;
      if (card) {
        const rowCount = card.querySelectorAll('.mc3-row').length;
        card.style.setProperty('--mc3-dur', calcCollapseDuration(rowCount) + 's');
        card.classList.toggle('mc3-collapsed', willCollapse);
      }
      saveSettings();
    },

    'toggle-hide': (t) => {
      const k = t.getAttribute('data-key');
      if (settings.hidden[k]) delete settings.hidden[k]; else settings.hidden[k] = true;
      saveSettings(); applyAll(); renderPopup();
    },

    'toggle-col': (t) => {
      const k = t.getAttribute('data-key');
      const newCol = Number(t.getAttribute('data-col')) === 1 ? 0 : 1;
      settings.column[k] = newCol;
      if (newCol === 1 && settings.columnMode === 'single') settings.columnMode = 'dual';
      saveSettings(); applyAll(); renderPopup();
    },

    'add-subgroup': (t) => { Subgroups.add(t.getAttribute('data-gid')); renderPopup(); },

    'delete-subgroup': (t) => {
      const gid = t.getAttribute('data-gid');
      const sgId = t.getAttribute('data-sgid');
      const sg = Subgroups.getById(gid, sgId);
      const name = sg ? sg.name : '未知分组';
      if (!confirm('确定要删除子分组"' + name + '"吗？\n分组内所有条目将按当前顺序回到列表中。')) return;
      Subgroups.remove(gid, sgId);
      applyAll(); renderPopup();
    },

    'toggle-subgroup': (t, e) => {
      if (e && e.target && e.target.closest('.mc3-handle, .mc3-icon-btn, .mc3-toggle, input')) return;
      const gid = t.getAttribute('data-gid');
      const sgId = t.getAttribute('data-sgid');
      const sg = Subgroups.getById(gid, sgId);
      const sgEl = t.closest('.mc3-subgroup');
      if (!sg) return;
      sg.collapsed = sgEl ? !sgEl.classList.contains('mc3-collapsed') : !sg.collapsed;
      if (sgEl) {
        const sgRowCount = sgEl.querySelectorAll('.mc3-row').length;
        sgEl.style.setProperty('--mc3-dur', calcCollapseDuration(sgRowCount) + 's');
        sgEl.classList.toggle('mc3-collapsed', sg.collapsed);
      }
      saveSettings(); applyAll();
    },

    'toggle-sg-hide': (t) => {
      const sg = Subgroups.getById(t.getAttribute('data-gid'), t.getAttribute('data-sgid'));
      if (!sg) return;
      const allHidden = sg.memberKeys.length > 0 && sg.memberKeys.every((k) => !!settings.hidden[k]);
      for (const k of sg.memberKeys) {
        if (allHidden) delete settings.hidden[k]; else settings.hidden[k] = true;
      }
      saveSettings(); applyAll(); renderPopup();
    },

    'toggle-sg-col': (t) => {
      const sg = Subgroups.getById(t.getAttribute('data-gid'), t.getAttribute('data-sgid'));
      if (sg) {
        sg.column = sg.column === 1 ? 0 : 1;
        if (sg.column === 1 && settings.columnMode === 'single') settings.columnMode = 'dual';
        saveSettings(); applyAll(); renderPopup();
      }
    },

    'start-rename-sg': (t) => {
      const gid = t.getAttribute('data-gid');
      const sgId = t.getAttribute('data-sgid');
      const header = t.closest('.mc3-subgroup-header');
      const nameSpan = (header && header.querySelector('.mc3-subgroup-name')) ||
        doc.querySelector('.mc3-subgroup-name[data-sgid="' + sgId + '"][data-gid="' + gid + '"]');
      const sg = Subgroups.getById(gid, sgId);
      if (!nameSpan || !sg) return;
      const input = doc.createElement('input');
      input.type = 'text';
      input.className = 'mc3-rename-input';
      input.value = sg.name;
      nameSpan.replaceWith(input);
      input.focus();
      input.select();
      input.addEventListener('click', (ev) => ev.stopPropagation());
      input.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      let done = false;
      const finishRename = () => {
        if (done) return;
        done = true;
        Subgroups.rename(gid, sgId, input.value.trim() || '新建分组');
        applyAll(); renderPopup();
      };
      input.addEventListener('blur', finishRename);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { ev.preventDefault(); done = true; renderPopup(); }
      });
    },

    'add-custom-selector': () => {
      const input = doc.getElementById('mc3-custom-selector-input');
      const res = CustomSelectors.add(input ? input.value.trim() : '');
      if (!res.success) { alert(res.error); if (input) input.focus(); } else { renderPopup(); }
    },

    'delete-custom-selector': (t) => { CustomSelectors.remove(t.getAttribute('data-custom-id')); renderPopup(); },

    'toggle-custom-hide': (t) => {
      const id = t.getAttribute('data-custom-id');
      if (settings.hidden[id]) delete settings.hidden[id]; else settings.hidden[id] = true;
      saveSettings(); applyAll(); renderPopup();
    },
  };

  function onPopupClick(e) {
    const t = e.target.closest('[data-action]'); if (!t) return;
    const handler = POPUP_ACTIONS[t.getAttribute('data-action')];
    if (handler) handler(t, e);
  }

  // ── 拖拽 ──
  let dragMeta = null; // { row, list, gid, key, startSgId, isSg }

  // 在拖拽位置找到 .mc3-subgroup-items 容器（或穿透子分组 header 取其内部 items）
  function findDropTarget(ev) {
    const el = doc.elementFromPoint(ev.clientX, ev.clientY);
    if (!el) return null;
    const items = el.closest('.mc3-subgroup-items');
    if (items) return items;
    const sg = el.closest('.mc3-subgroup');
    if (sg) { const sgItems = sg.querySelector('.mc3-subgroup-items'); if (sgItems) return sgItems; }
    return null;
  }

  // 在指定容器中按 clientY 找 row 的视觉插入位置
  function findInsertAfter(container, row, clientY) {
    let after = null;
    for (const child of container.children) {
      if (child === row) continue;
      if (!child.classList.contains('mc3-row') && !child.classList.contains('mc3-subgroup')) continue;
      if (child.classList.contains('mc3-empty-tip')) continue;
      const rc = child.getBoundingClientRect();
      if (clientY < rc.top + rc.height / 2) { after = child; break; }
    }
    if (after) container.insertBefore(row, after);
    else container.appendChild(row);
  }

  function onPopupPointerDown(e) {
    const handle = e.target.closest('.mc3-handle'); if (!handle) return;
    const isSgHandle = handle.classList.contains('mc3-sg-handle');
    let dragEl, list;
    if (isSgHandle) {
      dragEl = handle.closest('.mc3-subgroup'); if (!dragEl) return;
      list = dragEl.closest('.mc3-list'); if (!list) return;
    } else {
      dragEl = handle.closest('.mc3-row'); if (!dragEl) return;
      list = dragEl.closest('.mc3-list'); if (!list) return;
    }
    e.preventDefault();

    const gid = list.getAttribute('data-gid');
    const key = isSgHandle ? null : dragEl.getAttribute('data-key');
    const startSg = key ? Subgroups.getForKey(gid, key) : null;
    const startSgId = startSg ? startSg.id : null;

    dragEl.classList.add('mc3-drag');
    try { dragEl.setPointerCapture(e.pointerId); } catch (_) {}

    dragMeta = { row: dragEl, list, gid, key, startSgId, isSg: isSgHandle };
    const allSubgroups = list.querySelectorAll('.mc3-subgroup');

    const move = (ev) => {
      if (gid === 'mesButtons') {
        const elAtPoint = doc.elementFromPoint(ev.clientX, ev.clientY);
        const mesList = elAtPoint ? elAtPoint.closest('.mc3-mes-list[data-gid="mesButtons"]') : null;
        for (const ml of doc.querySelectorAll('.mc3-mes-list[data-gid="mesButtons"]')) ml.classList.remove('mc3-drop-target');
        if (mesList) {
          mesList.classList.add('mc3-drop-target');
          if (dragEl.parentNode !== mesList) mesList.appendChild(dragEl);
          findInsertAfter(mesList, dragEl, ev.clientY);
        }
        dragMeta._lastX = ev.clientX; dragMeta._lastY = ev.clientY;
        return;
      }

      if (gid === 'extensionsSettings') {
        const elAtPoint = doc.elementFromPoint(ev.clientX, ev.clientY);
        for (const ml of doc.querySelectorAll('.mc3-mes-list[data-gid="extensionsSettings"]')) ml.classList.remove('mc3-drop-target');
        for (const s of doc.querySelectorAll('.mc3-subgroup[data-gid="extensionsSettings"]')) s.classList.remove('mc3-drop-target');

        if (isSgHandle) {
          const extList = elAtPoint ? elAtPoint.closest('.mc3-mes-list[data-gid="extensionsSettings"]') : null;
          if (extList) {
            extList.classList.add('mc3-drop-target');
            if (dragEl.parentNode !== extList) extList.appendChild(dragEl);
            findInsertAfter(extList, dragEl, ev.clientY);
          }
        } else {
          const dropTarget = findDropTarget(ev);
          if (dropTarget) {
            const parentSg = dropTarget.closest('.mc3-subgroup');
            if (parentSg) parentSg.classList.add('mc3-drop-target');
            findInsertAfter(dropTarget, dragEl, ev.clientY);
          } else {
            const extList = elAtPoint ? elAtPoint.closest('.mc3-mes-list[data-gid="extensionsSettings"]') : null;
            if (extList) {
              extList.classList.add('mc3-drop-target');
              if (dragEl.parentNode !== extList) extList.appendChild(dragEl);
              findInsertAfter(extList, dragEl, ev.clientY);
            }
          }
        }
        dragMeta._lastX = ev.clientX; dragMeta._lastY = ev.clientY;
        return;
      }

      if (isSgHandle) {
        findInsertAfter(list, dragEl, ev.clientY);
      } else {
        const dropTarget = findDropTarget(ev);
        for (const s of allSubgroups) s.classList.remove('mc3-drop-target');
        if (dropTarget) {
          const parentSg = dropTarget.closest('.mc3-subgroup');
          if (parentSg) parentSg.classList.add('mc3-drop-target');
          findInsertAfter(dropTarget, dragEl, ev.clientY);
        } else {
          if (dragEl.parentNode !== list) list.appendChild(dragEl);
          findInsertAfter(list, dragEl, ev.clientY);
        }
      }
      dragMeta._lastX = ev.clientX; dragMeta._lastY = ev.clientY;
    };

    const up = (ev) => {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);
      try { dragEl.releasePointerCapture(ev ? ev.pointerId : 0); } catch (_) {}
      dragEl.classList.remove('mc3-drag');

      const lastX = (ev && ev.clientX !== undefined) ? ev.clientX : (dragMeta._lastX || 0);
      const lastY = (ev && ev.clientY !== undefined) ? ev.clientY : (dragMeta._lastY || 0);

      if (gid === 'mesButtons') {
        for (const ml of doc.querySelectorAll('.mc3-mes-list[data-gid="mesButtons"]')) ml.classList.remove('mc3-drop-target');
        let finalColList = dragEl.closest('.mc3-mes-list');
        if (!finalColList) {
          const elAtPoint = doc.elementFromPoint(lastX, lastY);
          finalColList = elAtPoint ? elAtPoint.closest('.mc3-mes-list[data-gid="mesButtons"]') : null;
        }
        if (finalColList) settings.column[dragMeta.key] = Number(finalColList.getAttribute('data-col'));

        const orderedKeys = [];
        for (const colSel of ['.mc3-mes-list[data-gid="mesButtons"][data-col="0"]', '.mc3-mes-list[data-gid="mesButtons"][data-col="1"]']) {
          const colList = doc.querySelector(colSel);
          if (!colList) continue;
          for (const row of colList.querySelectorAll('.mc3-row[data-key]')) {
            const k = row.getAttribute('data-key');
            if (k && orderedKeys.indexOf(k) === -1) orderedKeys.push(k);
          }
        }
        commitReorder('mesButtons', orderedKeys);
        saveSettings(); applyAll(); renderPopup();
        dragMeta = null;
        return;
      }

      if (gid === 'extensionsSettings') {
        for (const ml of doc.querySelectorAll('.mc3-mes-list[data-gid="extensionsSettings"], .mc3-subgroup[data-gid="extensionsSettings"]')) {
          ml.classList.remove('mc3-drop-target');
        }

        if (isSgHandle) {
          let finalColList = dragEl.closest('.mc3-mes-list[data-col]');
          if (!finalColList) {
            const elAtPoint = doc.elementFromPoint(lastX, lastY);
            finalColList = elAtPoint ? elAtPoint.closest('.mc3-mes-list[data-col]') : null;
          }
          if (finalColList) {
            const colNum = Number(finalColList.getAttribute('data-col'));
            const sgId = dragEl.getAttribute('data-sgid');
            const sg = Subgroups.getById('extensionsSettings', sgId);
            if (sg) {
              sg.column = colNum;
              if (colNum === 1 && settings.columnMode === 'single') settings.columnMode = 'dual';
            }
          }
        } else {
          const finalTarget = findDropTarget({ clientX: lastX, clientY: lastY }) || dragEl.closest('.mc3-subgroup-items');
          const targetSgId = finalTarget ? finalTarget.getAttribute('data-sgid') : null;
          if (targetSgId && targetSgId !== dragMeta.startSgId) {
            Subgroups.addKey(gid, targetSgId, dragMeta.key);
            const targetSg = Subgroups.getById(gid, targetSgId);
            if (targetSg && targetSg.column !== undefined) {
              settings.column[dragMeta.key] = targetSg.column;
              if (targetSg.column === 1 && settings.columnMode === 'single') settings.columnMode = 'dual';
            }
          } else if (!targetSgId && dragMeta.startSgId) {
            Subgroups.removeKey(gid, dragMeta.key);
            let finalColList = dragEl.closest('.mc3-mes-list[data-col]');
            if (!finalColList) {
              const elAtPoint = doc.elementFromPoint(lastX, lastY);
              finalColList = elAtPoint ? elAtPoint.closest('.mc3-mes-list[data-col]') : null;
            }
            if (finalColList) {
              const colNum = Number(finalColList.getAttribute('data-col'));
              settings.column[dragMeta.key] = colNum;
              if (colNum === 1 && settings.columnMode === 'single') settings.columnMode = 'dual';
            }
          } else if (!targetSgId && !dragMeta.startSgId) {
            let finalColList = dragEl.closest('.mc3-mes-list[data-col]');
            if (!finalColList) {
              const elAtPoint = doc.elementFromPoint(lastX, lastY);
              finalColList = elAtPoint ? elAtPoint.closest('.mc3-mes-list[data-col]') : null;
            }
            if (finalColList) {
              const colNum = Number(finalColList.getAttribute('data-col'));
              settings.column[dragMeta.key] = colNum;
              if (colNum === 1 && settings.columnMode === 'single') settings.columnMode = 'dual';
            }
          }
        }

        const orderedKeys = [];
        const collectKeys = (el) => {
          if (el.classList.contains('mc3-row')) {
            const rk = el.getAttribute('data-key');
            if (rk && orderedKeys.indexOf(rk) === -1) orderedKeys.push(rk);
          } else if (el.classList.contains('mc3-subgroup')) {
            const sg = Subgroups.getById('extensionsSettings', el.getAttribute('data-sgid'));
            if (sg && sg.collapsed) {
              const oldMap = settings.order['extensionsSettings'] || {};
              const members = sg.memberKeys.slice().sort((a, b) => (oldMap[a] || 0) - (oldMap[b] || 0));
              for (const m of members) if (orderedKeys.indexOf(m) === -1) orderedKeys.push(m);
            } else {
              for (const child of el.children) collectKeys(child);
            }
          } else {
            for (const child of el.children) collectKeys(child);
          }
        };

        for (const colSel of ['.mc3-mes-list[data-gid="extensionsSettings"][data-col="0"]', '.mc3-mes-list[data-gid="extensionsSettings"][data-col="1"]']) {
          const colList = doc.querySelector(colSel);
          if (colList) {
            persistSubgroupPositions(colList, 'extensionsSettings');
            for (const child of colList.children) collectKeys(child);
          }
        }

        commitReorder('extensionsSettings', orderedKeys);
        saveSettings(); applyAll(); renderPopup();
        dragMeta = null;
        return;
      }

      for (const s of allSubgroups) s.classList.remove('mc3-drop-target');

      if (!isSgHandle) {
        const finalTarget = findDropTarget({ clientX: lastX, clientY: lastY });
        const targetSgId = finalTarget ? finalTarget.getAttribute('data-sgid') : null;
        if (targetSgId && targetSgId !== dragMeta.startSgId) {
          Subgroups.addKey(dragMeta.gid, targetSgId, dragMeta.key);
        } else if (!targetSgId && dragMeta.startSgId) {
          Subgroups.removeKey(dragMeta.gid, dragMeta.key);
        }
      }

      // 按视觉顺序深度收集 orderedKeys（折叠子分组按旧序展开成员）
      const orderedKeys = [];
      const collectKeys = (el) => {
        if (el.classList.contains('mc3-row')) {
          const rk = el.getAttribute('data-key');
          if (rk) orderedKeys.push(rk);
        } else if (el.classList.contains('mc3-subgroup')) {
          const sg = Subgroups.getById(dragMeta.gid, el.getAttribute('data-sgid'));
          if (sg && sg.collapsed) {
            const oldMap = settings.order[dragMeta.gid] || {};
            const members = sg.memberKeys.slice().sort((a, b) => (oldMap[a] || 0) - (oldMap[b] || 0));
            for (const m of members) orderedKeys.push(m);
          } else {
            for (const child of el.children) collectKeys(child);
          }
        } else {
          for (const child of el.children) collectKeys(child);
        }
      };
      collectKeys(list);
      persistSubgroupPositions(list, dragMeta.gid);
      commitReorder(dragMeta.gid, orderedKeys);
      saveSettings(); applyAll(); renderPopup();
      dragMeta = null;
    };

    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', up);
  }

  // ─── §12  LAUNCHERS ──────────────────────────────────────────────────────────

  // 魔棒入口（作为普通 .list-group-item 参与扫描/排序/隐藏）
  function makeWandLauncher() {
    const el = doc.createElement('div');
    el.id = 'mc3-launcher-wand';
    el.className = 'list-group-item flex-container flexGap5 interactable';
    el.style.cursor = 'pointer';
    el.innerHTML = '<i class="fa-solid fa-bars-staggered"></i><span>菜单精简器</span>';
    el.addEventListener('click', openPopup);
    return el;
  }

  // 扩展面板入口（.inline-drawer：启用复选框 + 打开按钮）
  function makePanelLauncher() {
    const d = doc.createElement('div');
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
    const content = d.querySelector('.inline-drawer-content');
    const icon = d.querySelector('.inline-drawer-icon');
    d.querySelector('.inline-drawer-header').addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      const openNow = content.style.display !== 'none';
      content.style.display = openNow ? 'none' : 'block';
      icon.classList.toggle('up', !openNow); icon.classList.toggle('down', openNow);
    });
    d.querySelector('#mc3-enable-cb').addEventListener('change', (e) => { settings.enabled = e.target.checked; saveSettings(); applyAll(); });
    d.querySelector('#mc3-open-btn').addEventListener('click', (e) => { e.stopPropagation(); openPopup(); });
    return d;
  }

  let slashRegistered = false;
  function setupLaunchers() {
    const wand = doc.getElementById('extensionsMenu');
    if (wand && !doc.getElementById('mc3-launcher-wand')) wand.appendChild(makeWandLauncher());
    const panel = doc.getElementById('extensions_settings');
    if (panel && !doc.getElementById('mc3-launcher-panel')) panel.insertBefore(makePanelLauncher(), panel.firstChild);
    const cb = doc.getElementById('mc3-enable-cb'); if (cb) cb.checked = !!settings.enabled;
    if (!slashRegistered) {
      try {
        const ctx = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
        if (ctx && typeof ctx.registerSlashCommand === 'function') {
          ctx.registerSlashCommand('menucleaner', () => { openPopup(); return ''; }, [], '打开菜单精简器', true, true);
          slashRegistered = true;
        }
      } catch (e) {}
    }
  }

  // ─── §13  BOOTSTRAP ──────────────────────────────────────────────────────────

  function init() {
    Store.load();
    setupObserver();
    const records = applyAll();
    setupLaunchers();
    // 保留: 递进补跑 applyAll()，等价手动「关掉再开启插件」，兜底晚到时序（0623/M8）
    [600, 1800, 4000, 8000, 12000, 16000].forEach((d) => {
      win.setTimeout(() => {
        if (!suppressObserver) {
          ensureContainersObserved();
          applyAll();
        }
      }, d);
    });
    win.__mc3 = {
      version: 'M17',
      settings,
      groups: GROUPS,
      getGroup,
      scanGroup, scanMesButtons, scanCurated, scanAll,
      applyAll, applyMesButtons, clearMesButtons,
      ensureContainersObserved,
      renderMesButtonsCard, applyPseudoSubgroups, applyCustomSelectors,
      addCustomSelector: (sel, label) => CustomSelectors.add(sel, label),
      deleteCustomSelector: (id) => CustomSelectors.remove(id),
      setColumnMode,
      openPopup, closePopup, resetAll, applyFontColor,
      save: saveSettings,
      addSubgroup: (gid) => Subgroups.add(gid),
      deleteSubgroup: (gid, sgId) => Subgroups.remove(gid, sgId),
      renameSubgroup: (gid, sgId, name) => Subgroups.rename(gid, sgId, name),
      getSubgroupForKey: (gid, key) => Subgroups.getForKey(gid, key),
      records,
    };
    console.log('[菜单精简器] 初始化完成：管理 UI 就绪（魔棒"菜单精简器"或 /menucleaner 打开）');
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
