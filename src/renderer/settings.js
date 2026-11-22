'use strict';

(() => {
  const { icon } = window.GlassIcons;
  const api = window.paperdeck;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const TABS = [
    { id: 'welcome', label: '总览', icon: 'sparkles', title: '总览', subtitle: '查看副屏状态和常用设置' },
    { id: 'display', label: '显示与副屏', icon: 'monitor', title: '显示与副屏', subtitle: '目标屏幕、显示模式和屏幕安全区' },
    { id: 'widgets', label: '小组件', icon: 'layout', title: '小组件', subtitle: '启用、排列和调整组件' },
    { id: 'appearance', label: '外观', icon: 'palette', title: '外观', subtitle: '主题、背景与材质' },
    { id: 'media', label: '媒体与歌词', icon: 'music', title: '媒体与歌词', subtitle: '播放器、歌词和封面' },
    { id: 'quick', label: '控制中心', icon: 'sliders', title: '控制中心', subtitle: '系统开关、媒体控制和应用捷径' },
    { id: 'system', label: '系统', icon: 'gear', title: '系统', subtitle: '截图、数据目录与诊断' },
    { id: 'about', label: '关于', icon: 'info', title: '关于 PaperDeck', subtitle: '版本与项目信息' },
  ];

  const BACKGROUNDS = [
    { id: 'aurora', label: '极光' },
    { id: 'ocean', label: '海盐' },
    { id: 'sakura', label: '樱花' },
    { id: 'mist', label: '晨雾' },
    { id: 'album', label: '专辑' },
  ];

  const ACCENTS = ['#1687ff', '#5b6cff', '#8a5cff', '#db67c9', '#ec7a55', '#16a6ad', '#35a76b', '#3d5069'];

  const S = {
    api,
    boot: null,
    config: null,
    catalog: [],
    quickCatalog: [],
    providers: [],
    displays: null,
    metrics: null,
    media: null,
    lyrics: null,
    tab: 'welcome',
    saving: 0,
    saveTimer: null,
    saveLabelTimer: null,
    pendingPatch: null,
    pendingTimer: null,
    previewFrames: [],
    previewObserver: null,
    maxed: false,
  };

  function init() {
    if (!api) {
      document.body.innerHTML = '<div class="empty-state">此页面需要在 PaperDeck 桌面端中打开。</div>';
      return;
    }
    bindWindowChrome();
    bindViewEvents();
    api.bootstrap().then(start).catch((error) => {
      $('#view').innerHTML = `<div class="panel"><div class="panel-title">启动失败</div><div class="panel-desc">${escapeHtml(error.message)}</div></div>`;
    });
  }

  function start(data) {
    S.boot = data;
    S.config = data.config;
    S.catalog = data.catalog || [];
    S.quickCatalog = data.quickActions || [];
    S.providers = data.providers || [];
    S.displays = data.displays || null;
    S.metrics = data.metrics;
    S.media = data.media;
    S.lyrics = data.lyrics;
    renderNav();
    $('#sidebarVersion').textContent = `v${data.version}`;
    updateWindowControls();
    updateSidebar();
    navigate(new URLSearchParams(location.search).get('tab') || 'welcome');
    bindSubscriptions();
    updateLive();
  }

  function bindSubscriptions() {
    api.onConfig((config) => {
      S.config = config;
      updateSidebar();
      updateLive();
      postPreview();
    });
    api.onMedia((media) => {
      S.media = { ...(S.media || {}), ...media };
      updateLive();
      updateCurrentMediaCard();
    });
    api.onMetrics((metrics) => {
      S.metrics = metrics;
      updateLive();
    });
    api.onLyrics((lyrics) => {
      S.lyrics = lyrics;
      updateLive();
    });
    api.onDisplay((display) => {
      S.displays = display;
      updateSidebar();
    });
    api.onSettingsTab((tab) => navigate(tab));
  }

  function bindWindowChrome() {
    $('#minimizeButton').innerHTML = icon('minus');
    $('#maximizeButton').innerHTML = icon('maximize');
    $('#closeButton').innerHTML = icon('x');
    $('#refreshIcon').innerHTML = icon('refresh');
    $('#nav').addEventListener('click', (event) => {
      const item = event.target.closest('[data-nav]');
      if (item) navigate(item.dataset.nav);
    });
    $('#minimizeButton').addEventListener('click', () => api.minimizeSettings());
    $('#maximizeButton').addEventListener('click', toggleMaximize);
    $('#closeButton').addEventListener('click', () => api.closeSettings());
    $('#previewRefresh').addEventListener('click', refreshPreviews);
    $('.window-drag').addEventListener('dblclick', toggleMaximize);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const modal = $('.modal');
        if (modal) {
          modal._close?.();
          event.preventDefault();
        }
      }
    });
  }

  async function toggleMaximize() {
    S.maxed = await api.toggleMaximize();
    updateWindowControls();
  }

  function updateWindowControls() {
    const maximize = $('#maximizeButton');
    if (maximize) maximize.innerHTML = icon(S.maxed ? 'restore' : 'maximize');
  }

  function renderNav() {
    const nav = $('#nav');
    nav.innerHTML = TABS.map((tab) => `
      <button class="nav-item" data-nav="${tab.id}">
        ${icon(tab.icon)}
        <span>${tab.label}</span>
      </button>
    `).join('');
  }

  function navigate(tab) {
    const target = TABS.find((item) => item.id === tab) || TABS[0];
    S.tab = target.id;
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.nav === S.tab));
    $('#pageTitle').textContent = target.title;
    $('#pageSubtitle').textContent = target.subtitle;
    const renderers = {
      welcome: renderWelcome,
      display: renderDisplay,
      widgets: renderWidgets,
      appearance: renderAppearance,
      media: renderMedia,
      quick: renderQuick,
      system: renderSystem,
      about: renderAbout,
    };
    $('#view').innerHTML = renderers[S.tab]();
    $('#view').scrollTop = 0;
    setupPreviews();
    updateLive();
  }

  function rerender() {
    navigate(S.tab);
  }

  /* ---------------- view event delegation ---------------- */

  function bindViewEvents() {
    const view = $('#view');
    view.addEventListener('click', async (event) => {
      const nav = event.target.closest('[data-nav]');
      if (nav) {
        navigate(nav.dataset.nav);
        return;
      }
      const widgetToggle = event.target.closest('[data-widget-toggle]');
      if (widgetToggle) {
        await toggleWidget(widgetToggle.dataset.widgetToggle);
        return;
      }
      const theme = event.target.closest('[data-theme-value]');
      if (theme) {
        await chooseTheme(theme.dataset.themeValue);
        return;
      }
      const background = event.target.closest('[data-background-value]');
      if (background) {
        await chooseBackground(background.dataset.backgroundValue);
        return;
      }
      const accent = event.target.closest('[data-accent-value]');
      if (accent) {
        await chooseAccent(accent.dataset.accentValue);
        return;
      }
      const mode = event.target.closest('[data-mode-value]');
      if (mode) {
        await chooseMode(mode.dataset.modeValue);
        return;
      }
      const providerToggle = event.target.closest('[data-provider-toggle]');
      if (providerToggle) {
        await toggleProvider(providerToggle.dataset.providerToggle);
        return;
      }
      const providerMove = event.target.closest('[data-provider-move]');
      if (providerMove) {
        await moveProvider(providerMove.dataset.providerMove, Number(providerMove.dataset.direction));
        return;
      }
      const sw = event.target.closest('[data-switch]');
      if (sw) {
        await toggleSwitch(sw);
        return;
      }
      const action = event.target.closest('[data-action]');
      if (action) {
        await handleAction(action.dataset.action, action);
      }
    });

    view.addEventListener('input', (event) => {
      const range = event.target.closest('[data-range]');
      if (range) {
        handleRangeInput(range);
        return;
      }
      const color = event.target.closest('[data-color-path]');
      if (color) {
        setPath(S.config, color.dataset.colorPath, color.value);
        const label = color.closest('.custom-color-field')?.querySelector('[data-color-label]');
        if (label) label.textContent = color.value;
        queuePatch(buildPatch(color.dataset.colorPath, color.value), 80);
        postPreview();
      }
    });

    view.addEventListener('change', async (event) => {
      const select = event.target.closest('[data-select]');
      if (select) {
        let value = select.value;
        if (select.dataset.type === 'number') value = Number(value);
        else if (select.dataset.type === 'display') value = value === 'auto' ? null : Number(value);
        setPath(S.config, select.dataset.select, value);
        await save(buildPatch(select.dataset.select, value));
        S.displays = await api.getDisplays();
        updateSidebar();
        if (S.tab === 'display' || S.tab === 'media') updateLive();
        return;
      }
      const field = event.target.closest('[data-shortcut-field]');
      if (field) {
        updateShortcutField(field.dataset.shortcutId, field.dataset.shortcutField, field.value);
        return;
      }
      const range = event.target.closest('[data-range]');
      if (range) flushPendingPatch();
    });
  }

  async function handleAction(action, target) {
    switch (action) {
      case 'edit-layout':
        await api.systemAction('edit-layout');
        toast('已进入副屏布局编辑模式', { icon: 'layout' });
        break;
      case 'display-settings-windows':
        await api.systemAction('display-settings');
        break;
      case 'apply-display':
        await api.applyDisplay();
        S.displays = await api.getDisplays();
        updateSidebar();
        toast('显示设置已应用', { icon: 'check', type: 'success' });
        break;
      case 'recreate-display':
        await api.recreateDisplay();
        S.displays = await api.getDisplays();
        updateSidebar();
        toast('副屏窗口已重建', { icon: 'monitor' });
        break;
      case 'reset-layout':
        confirmModal({
          title: '恢复默认组件布局？',
          copy: '位置和尺寸会恢复默认，组件开关与外观设置保持不变。',
          confirmLabel: '恢复布局',
          onConfirm: async () => {
            await save({ layout: { widgets: S.boot.defaultLayout || [] } });
            rerender();
            toast('布局已恢复', { icon: 'check', type: 'success' });
          },
        });
        break;
      case 'refresh-lyrics':
        await api.refreshLyrics();
        toast('正在重新匹配歌词', { icon: 'refresh' });
        break;
      case 'browse-screenshot-dir':
        await api.systemAction('browse-screenshot-dir');
        S.config = await api.getConfig();
        rerender();
        break;
      case 'browse-lyrics-dir':
        await api.systemAction('browse-lyrics-dir');
        S.config = await api.getConfig();
        rerender();
        break;
      case 'open-data-folder':
        await api.systemAction('open-config');
        break;
      case 'diagnostics':
        await showDiagnostics();
        break;
      case 'reset-config':
        confirmModal({
          title: '恢复所有默认设置？',
          copy: '显示、外观、小组件布局、歌词源和快捷操作都会恢复默认。这个操作不可撤销。',
          confirmLabel: '全部恢复',
          danger: true,
          onConfirm: async () => {
            S.config = await api.resetConfig();
            S.displays = await api.getDisplays();
            updateSidebar();
            rerender();
            postPreview();
            toast('已恢复默认设置', { icon: 'check', type: 'success' });
          },
        });
        break;
      case 'relaunch-app':
        await api.relaunch();
        break;
      case 'quit-app':
        confirmModal({
          title: '退出 PaperDeck？',
          copy: '副屏仪表盘会被关闭，设置窗口中未保存的调整将丢失。',
          confirmLabel: '退出',
          danger: true,
          onConfirm: () => api.quit(),
        });
        break;
      case 'add-shortcut':
        await addShortcut();
        break;
      case 'remove-shortcut':
        await removeShortcut(target.dataset.shortcutId);
        break;
      case 'toggle-quick':
        await toggleQuickAction(target.dataset.quickId);
        break;
      case 'open-lyrics-settings':
        navigate('media');
        break;
      case 'refresh-previews':
        refreshPreviews();
        break;
      case 'close-modal': {
        const modal = $('.modal');
        modal?._close?.();
        break;
      }
      default:
        break;
    }
  }

  /* ---------------- generic controls ---------------- */

  async function toggleSwitch(button) {
    const path = button.dataset.switch;
    const value = !Boolean(getPath(S.config, path));
    setPath(S.config, path, value);
    button.classList.toggle('on', value);
    button.setAttribute('aria-checked', String(value));
    updateLive();
    await save(buildPatch(path, value));
  }

  function handleRangeInput(range) {
    const path = range.dataset.range;
    const min = Number(range.min);
    const max = Number(range.max);
    const value = Number(range.value);
    setPath(S.config, path, value);
    range.style.setProperty('--value', `${((value - min) / (max - min)) * 100}%`);
    const label = range.closest('.range-field')?.querySelector('[data-range-value]');
    if (label) label.textContent = formatRangeValue(value, range.dataset.format);
    postPreview();
    queuePatch(buildPatch(path, value), 140);
  }

  function formatRangeValue(value, format) {
    if (format === 'percent') return `${Math.round(value * 100)}%`;
    if (format === 'scale') return `${Math.round(value * 100)}%`;
    if (format === 'seconds') return `${value > 0 ? '+' : ''}${(value / 1000).toFixed(1)} s`;
    if (format === 'px') return `${Math.round(value)} px`;
    if (format === 'ms') return `${Math.round(value)} ms`;
    if (format === 'deg') return `${Math.round(value)}°`;
    return String(value);
  }

  function rangeMarkup({ path, value, min, max, step = 1, format = 'px', label, hint = '' }) {
    const percent = ((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100;
    return `
      <div class="range-field">
        <div class="range-top"><span>${escapeHtml(label)}</span><b data-range-value>${escapeHtml(formatRangeValue(Number(value), format))}</b></div>
        <input class="settings-range" type="range" data-range="${path}" min="${min}" max="${max}" step="${step}" value="${value}" style="--value:${percent}%">
        ${hint ? `<div class="panel-caption" style="margin-top:3px">${escapeHtml(hint)}</div>` : ''}
      </div>
    `;
  }

  function switchMarkup(path, label, description) {
    const on = Boolean(getPath(S.config, path));
    return `
      <div class="setting-row">
        <div class="setting-copy"><b>${escapeHtml(label)}</b>${description ? `<span>${escapeHtml(description)}</span>` : ''}</div>
        <button class="switch ${on ? 'on' : ''}" data-switch="${path}" role="switch" aria-checked="${on}" aria-label="${escapeHtml(label)}"></button>
      </div>
    `;
  }

  function selectMarkup(path, options, label, description, type = 'string') {
    const current = String(getPath(S.config, path));
    return `
      <div class="setting-row">
        <div class="setting-copy"><b>${escapeHtml(label)}</b>${description ? `<span>${escapeHtml(description)}</span>` : ''}</div>
        <select class="select" data-select="${path}" data-type="${type}">
          ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === current ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  function toggleRowMarkup(target, label, description, on) {
    return `
      <div class="setting-row">
        <div class="setting-copy"><b>${escapeHtml(label)}</b>${description ? `<span>${escapeHtml(description)}</span>` : ''}</div>
        <button class="switch ${on ? 'on' : ''}" data-toggle="${target}" role="switch" aria-checked="${on}"></button>
      </div>
    `;
  }

  /* ---------------- overview ---------------- */

  function renderWelcome() {
    const displayed = getTargetDisplay();
    const enabled = (S.config.layout.widgets || []).filter((widget) => widget.enabled);
    const media = S.media || {};
    const lyricsSource = S.lyrics?.source || '待匹配';
    return `
      <section class="hero panel">
        <div class="hero-copy">
          <div class="eyebrow">SECONDARY DISPLAY · ${displayed ? `${displayed.bounds.width} × ${displayed.bounds.height}` : '未检测到副屏'}</div>
          <h2>副屏仪表盘<br><em>状态与设置</em></h2>
          <p>这里负责设置，副屏负责显示。组件可在主屏开关，也能在副屏直接拖动和缩放。</p>
          <div class="hero-actions">
            <button class="primary-button" data-action="edit-layout">${icon('layout')}编辑副屏布局</button>
            <button class="secondary-button" data-nav="widgets">${icon('grid')}管理小组件</button>
          </div>
          <div class="hero-stats">
            <div class="hero-stat"><b data-live="display-size">${displayed ? `${displayed.bounds.width}×${displayed.bounds.height}` : '--'}</b><span>目标副屏</span></div>
            <div class="hero-stat"><b data-live="widget-count">${enabled.length}</b><span>已启用小组件</span></div>
            <div class="hero-stat"><b data-live="player-short">${media.hasSession ? media.playerName : '等待播放'}</b><span>当前播放器</span></div>
          </div>
        </div>
        <div class="preview-panel">
          <div class="preview-head"><span>LIQUID GLASS · PREVIEW</span><span class="preview-badge">示例数据 · 实时外观</span></div>
          <div class="preview-viewport" data-preview>
            <iframe class="preview-frame" src="display.html?preview=1&amp;embedded=1" title="PaperDeck 外观预览"></iframe>
          </div>
          <div class="preview-foot"><span>设置只显示在主屏</span><span class="live">副屏同步更新</span></div>
        </div>
      </section>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-icon">${icon('monitor')}</div>
          <b data-live="mode-label">${S.config.display.mode === 'workarea' ? '保留任务栏' : '全屏沉浸'}</b>
          <span>副屏显示模式</span>
        </div>
        <div class="stat-card">
          <div class="stat-icon">${icon('music')}</div>
          <b data-live="track">${media.hasSession ? media.title : '暂无正在播放'}</b>
          <span data-live="artist">${media.hasSession ? media.artist : '在播放器中开始播放'}</span>
        </div>
        <div class="stat-card">
          <div class="stat-icon">${icon('lyrics')}</div>
          <b data-live="lyrics-source">${escapeHtml(lyricsSource)}</b>
          <span>当前歌词源</span>
        </div>
        <div class="stat-card">
          <div class="stat-icon">${icon('wifi')}</div>
          <b data-live="network">${escapeHtml(networkLabel(S.metrics?.network || {}))}</b>
          <span data-live="network-ip">${escapeHtml(S.metrics?.network?.ip || '等待网络')}</span>
        </div>
      </div>

      <div class="two-column">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title"><span class="title-icon">${icon('sparkles')}</span>使用提示</div>
              <p class="panel-desc">设置窗口固定在主屏；副屏独立显示。</p>
            </div>
          </div>
          <div class="tip-list">
            <div class="tip">${icon('layout')}<div><b>在副屏直接拖动</b><span>点击顶部布局按钮，或在这里进入编辑模式，自由调整每块卡片的位置与尺寸。</span></div></div>
            <div class="tip">${icon('music')}<div><b>播放器打开即用</b><span>Apple Music、网易云、QQ 音乐、酷狗的播放状态都通过系统媒体会话读取。</span></div></div>
            <div class="tip">${icon('sliders')}<div><b>控制中心常驻</b><span>音量和亮度点击打开滑杆，Wi-Fi、蓝牙、静音点击直接切换；长按或右键打开系统设置。</span></div></div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title"><span class="title-icon">${icon('activity')}</span>运行状态</div>
              <p class="panel-desc">实时读取本机与媒体会话状态。</p>
            </div>
            <span class="panel-caption">${S.boot.isPackaged ? '已打包' : '开发模式'}</span>
          </div>
          <div class="info-table">
            <div class="info-cell"><span>当前播放器</span><b data-live="player">${escapeHtml(media.playerName || '无')}</b></div>
            <div class="info-cell"><span>进程</span><b>${S.metrics?.cpu?.load !== undefined ? `${Math.round(S.metrics.cpu.load)}% CPU` : '—'}</b></div>
            <div class="info-cell"><span>歌词源</span><b data-live="lyrics-source-inline">${escapeHtml(lyricsSource)}</b></div>
            <div class="info-cell"><span>副屏状态</span><b data-live="display-status">${displayed ? '在线' : '等待连接'}</b></div>
          </div>
          <div class="button-row" style="margin-top:12px">
            <button class="secondary-button" data-nav="media">${icon('music')}媒体设置</button>
            <button class="secondary-button" data-action="diagnostics">${icon('info')}运行诊断</button>
          </div>
        </section>
      </div>
    `;
  }

  /* ---------------- display ---------------- */

  function renderDisplay() {
    const displays = S.displays?.displays || [];
    const target = getTargetDisplay();
    const work = target?.workArea;
    const autoScaleFactor = target ? Math.min(4, Math.min(target.bounds.width / 798, target.bounds.height / 480)) : 1;
    const options = [
      { value: 'auto', label: '自动（优先 798 × 480 副屏）' },
      ...displays.map((display) => ({ value: String(display.id), label: display.label })),
    ];
    return `
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('monitor')}</span>目标显示器</div>
            <p class="panel-desc">默认会自动寻找非主屏的 798 × 480 屏幕，也可以手动指定。</p>
          </div>
          <span class="panel-caption">${target ? `当前 ${target.bounds.width} × ${target.bounds.height}` : '未检测到副屏'}</span>
        </div>
        <div class="setting-row">
          <div class="setting-copy"><b>输出到哪块屏幕</b><span>自动模式会优先选择 798 × 480 的非主屏显示器。</span></div>
          <select class="select" data-select="display.targetId" data-type="display">
            ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(S.config.display.targetId ?? 'auto') ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
          </select>
        </div>
        <div class="info-strip">${icon('info')}检测到 ${displays.length} 块显示器${work ? `；副屏工作区为 ${work.width} × ${work.height}` : ''}。${S.config.display.autoScale !== false ? `当前分辨率自动缩放约 ${autoScaleFactor.toFixed(2)}×。` : '自动缩放已关闭。'}</div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('layout')}</span>显示模式</div>
            <p class="panel-desc">全屏会盖住 Windows 任务栏；保留任务栏会使用工作区高度。</p>
          </div>
        </div>
        <div class="mode-grid">
          <button class="mode-card ${S.config.display.mode === 'fullscreen' ? 'on' : ''}" data-mode-value="fullscreen">
            <span class="mode-badge">${icon('check')}</span>
            <div class="mode-visual"></div>
            <b>全屏沉浸</b>
            <span>铺满整块 798 × 480 副屏，没有任务栏打断。</span>
          </button>
          <button class="mode-card ${S.config.display.mode === 'workarea' ? 'on' : ''}" data-mode-value="workarea">
            <span class="mode-badge">${icon('check')}</span>
            <div class="mode-visual"></div>
            <b>保留任务栏</b>
            <span>使用工作区（${work ? `${work.width} × ${work.height}` : '自动'}），任务栏依旧可用。</span>
          </button>
        </div>
        <div class="button-row" style="margin-top:12px">
          <button class="secondary-button" data-action="display-settings-windows">${icon('monitor')}Windows 显示设置</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('sparkles')}</span>显示行为</div>
            <p class="panel-desc">这些设置会立即写入配置，下次启动自动恢复。</p>
          </div>
        </div>
        ${switchMarkup('display.autoScale', '自动适配屏幕分辨率', '以 798×480 为基准等比缩放整个界面；1080P 约 2.25×，720P 约 1.5×。')}
        ${switchMarkup('display.alwaysOnTop', '始终置顶', '避免副屏被其他窗口遮挡。')}
        ${switchMarkup('display.preventSleep', '阻止屏幕休眠', '在 PaperDeck 运行时保持副屏常亮。')}
        ${switchMarkup('display.hideCursor', '自动隐藏鼠标', '静止 2.8 秒后隐藏鼠标指针，移动即恢复。')}
        ${switchMarkup('display.launchAtLogin', '开机启动', '登录 Windows 后自动启动 PaperDeck（安装版）。')}
        ${selectMarkup('display.refreshMs', [
          { value: '500', label: '0.5 秒 · 更灵敏' },
          { value: '1000', label: '1 秒 · 推荐' },
          { value: '2000', label: '2 秒 · 省电' },
          { value: '3000', label: '3 秒 · 更省电' },
          { value: '5000', label: '5 秒 · 低占用' },
          { value: '10000', label: '10 秒 · 最低占用' },
        ], '数据刷新间隔', '同时控制 CPU/GPU 功耗温度采样；媒体封面和播放状态独立更新。', 'number')}
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('monitor')}</span>屏幕安全区</div>
            <p class="panel-desc">为曲边或圆角屏幕增加四边留白，避免内容贴近屏幕边缘。</p>
          </div>
        </div>
        <div class="range-grid">
          ${rangeMarkup({ path: 'appearance.safeTop', value: S.config.appearance.safeTop || 0, min: 0, max: 40, step: 1, format: 'px', label: '上边距' })}
          ${rangeMarkup({ path: 'appearance.safeRight', value: S.config.appearance.safeRight || 0, min: 0, max: 40, step: 1, format: 'px', label: '右边距' })}
          ${rangeMarkup({ path: 'appearance.safeBottom', value: S.config.appearance.safeBottom || 0, min: 0, max: 40, step: 1, format: 'px', label: '下边距' })}
          ${rangeMarkup({ path: 'appearance.safeLeft', value: S.config.appearance.safeLeft || 0, min: 0, max: 40, step: 1, format: 'px', label: '左边距' })}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('layout')}</span>副屏窗口</div>
            <p class="panel-desc">如果移动了显示器或分辨率发生变化，可以手动重建窗口。</p>
          </div>
        </div>
        <div class="button-row">
          <button class="primary-button" data-action="edit-layout">${icon('layout')}在副屏编辑布局</button>
          <button class="secondary-button" data-action="apply-display">${icon('check')}重新应用</button>
          <button class="secondary-button" data-action="recreate-display">${icon('refresh')}重建副屏窗口</button>
        </div>
      </section>
    `;
  }

  /* ---------------- widgets ---------------- */

  function renderWidgets() {
    const widgets = S.config.layout.widgets || [];
    const enabled = widgets.filter((widget) => widget.enabled);
    return `
      <div class="hint-banner">
        <div class="hint-icon">${icon('layout')}</div>
        <div><b>每块信息都是独立小组件</b><span>开关组件、选择布局，然后在副屏直接拖动和缩放。位置与尺寸会保存在配置中。</span></div>
      </div>
      <section class="panel">
        <div class="library-head">
          <div><div class="panel-title"><span class="title-icon">${icon('grid')}</span>小组件库</div><div class="library-count"><b>${enabled.length}</b> 个已启用 · 共 ${S.catalog.length} 种</div></div>
          <div class="button-row" style="margin:0">
            <button class="secondary-button" data-action="reset-layout">${icon('refresh')}恢复默认布局</button>
            <button class="primary-button" data-action="edit-layout">${icon('layout')}编辑布局</button>
          </div>
        </div>
        <div class="widget-library">
          ${S.catalog.map((catalog) => {
            const active = widgets.find((widget) => widget.kind === catalog.kind && widget.enabled);
            return `
              <div class="widget-lib-card ${active ? 'enabled' : ''}">
                <div class="widget-lib-head">
                  <div class="widget-orb">${icon(catalog.icon)}</div>
                  <button class="switch ${active ? 'on' : ''}" data-widget-toggle="${catalog.kind}" role="switch" aria-checked="${Boolean(active)}" aria-label="${escapeHtml(catalog.name)}"></button>
                </div>
                <h3>${escapeHtml(catalog.name)}</h3>
                <p>${escapeHtml(catalog.description)}</p>
                <div class="widget-lib-foot">
                  <span class="widget-position">${active ? `${active.w}×${active.h} · x ${active.x} / y ${active.y}` : '未启用'}</span>
                  <span class="panel-caption">${escapeHtml(catalog.category)}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  async function toggleWidget(kind) {
    const catalog = S.catalog.find((item) => item.kind === kind);
    if (!catalog) return;
    const widgets = (S.config.layout.widgets || []).map((widget) => ({ ...widget }));
    const active = widgets.find((widget) => widget.kind === kind && widget.enabled);
    if (active) {
      active.enabled = false;
    } else {
      const existing = widgets.find((widget) => widget.kind === kind);
      let candidate = existing ? { ...existing } : null;
      const width = catalog.defaultW || 3;
      const height = catalog.defaultH || 2;
      if (!candidate) {
        const slot = findFreeSlot(width, height);
        if (!slot) {
          toast('副屏没有足够空间，请先移除或缩小其他组件', { icon: 'layout', type: 'error' });
          return;
        }
        candidate = {
          id: `${kind}-${Date.now()}`,
          kind,
          enabled: true,
          x: slot.x,
          y: slot.y,
          w: width,
          h: height,
        };
      } else {
        if (hasOverlap({ ...candidate, enabled: true }, candidate.id)) {
          const slot = findFreeSlot(candidate.w, candidate.h);
          if (!slot) {
            toast('副屏没有足够空间恢复这个组件', { icon: 'layout', type: 'error' });
            return;
          }
          candidate.x = slot.x;
          candidate.y = slot.y;
        }
        candidate.enabled = true;
      }
      const index = widgets.findIndex((widget) => widget.id === candidate.id);
      if (index >= 0) widgets[index] = candidate;
      else widgets.push(candidate);
    }
    await save({ layout: { widgets } });
    rerender();
  }

  function findFreeSlot(width, height) {
    const cols = S.config.layout.cols || 12;
    const rows = S.config.layout.rows || 8;
    const occupied = (S.config.layout.widgets || []).filter((widget) => widget.enabled);
    for (let y = 0; y <= rows - height; y += 1) {
      for (let x = 0; x <= cols - width; x += 1) {
        const candidate = { x, y, w: width, h: height };
        const overlaps = occupied.some((widget) => (
          candidate.x < widget.x + widget.w && candidate.x + candidate.w > widget.x &&
          candidate.y < widget.y + widget.h && candidate.y + candidate.h > widget.y
        ));
        if (!overlaps) return { x, y };
      }
    }
    return null;
  }

  function hasOverlap(candidate, ignoreId) {
    return (S.config.layout.widgets || []).some((widget) => (
      widget.enabled && widget.id !== ignoreId &&
      candidate.x < widget.x + widget.w && candidate.x + candidate.w > widget.x &&
      candidate.y < widget.y + widget.h && candidate.y + candidate.h > widget.y
    ));
  }

  /* ---------------- appearance ---------------- */

  function renderAppearance() {
    const appearance = S.config.appearance;
    const preview = `
      <section class="panel appearance-preview">
        <div class="appearance-caption">
          <div class="panel-title"><span class="title-icon">${icon('palette')}</span>实时外观预览</div>
          <span class="panel-caption">示例数据 · 调整后立即生效</span>
        </div>
        <div class="preview-viewport large" data-preview>
          <iframe class="preview-frame" src="display.html?preview=1&amp;embedded=1" title="PaperDeck 外观预览"></iframe>
        </div>
      </section>
    `;
    return `${preview}
      <section class="panel" style="margin-top:14px">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('palette')}</span>颜色与材质</div>
            <p class="panel-desc">调整主题、背景、字体和玻璃材质。</p>
          </div>
        </div>
        <div class="setting-row" style="display:block">
          <div class="setting-copy" style="margin-bottom:9px"><b>主题</b><span>自动模式会跟随 Windows 浅色 / 深色设置。</span></div>
          <div class="theme-grid">
            <button class="theme-option ${appearance.theme === 'light' ? 'on' : ''}" data-theme-value="light">
              <div class="theme-preview"></div><b>清透</b><span>浅色界面</span>
            </button>
            <button class="theme-option ${appearance.theme === 'dark' ? 'on' : ''}" data-theme-value="dark">
              <div class="theme-preview dark"></div><b>深色玻璃</b><span>适合夜间</span>
            </button>
            <button class="theme-option ${appearance.theme === 'auto' ? 'on' : ''}" data-theme-value="auto">
              <div class="theme-preview auto"></div><b>自动</b><span>跟随系统</span>
            </button>
          </div>
        </div>
        <div class="setting-row" style="display:block">
          <div class="setting-copy" style="margin-bottom:7px"><b>背景</b><span>选择预设氛围，或用纯色、渐变和纯黑自定义画布。</span></div>
          <div class="bg-options">
            ${BACKGROUNDS.map((bg) => `
              <button class="bg-swatch ${appearance.background === bg.id ? 'on' : ''}" data-background-value="${bg.id}">
                <span class="bg-thumb bg-${bg.id}"></span><span>${bg.label}</span>
              </button>
            `).join('')}
            <button class="bg-swatch ${appearance.background === 'solid' ? 'on' : ''}" data-background-value="solid">
              <span class="bg-thumb" style="background:${escapeHtml(appearance.backgroundSolid || '#eaf3ff')}"></span><span>纯色</span>
            </button>
            <button class="bg-swatch ${appearance.background === 'gradient' ? 'on' : ''}" data-background-value="gradient">
              <span class="bg-thumb" style="background:linear-gradient(135deg, ${escapeHtml(appearance.gradientFrom || '#e8f4ff')}, ${escapeHtml(appearance.gradientTo || '#f7ecff')})"></span><span>渐变</span>
            </button>
            <button class="bg-swatch ${appearance.background === 'black' ? 'on' : ''}" data-background-value="black">
              <span class="bg-thumb bg-solid-black"></span><span>纯黑</span>
            </button>
          </div>
          ${customBackgroundMarkup(appearance)}
        </div>
        <div class="setting-row" style="display:block">
          <div class="setting-copy" style="margin-bottom:8px"><b>强调色</b><span>用于图标、进度条和选中状态。</span></div>
          <div class="accent-options">
            ${ACCENTS.map((color) => `<button class="accent-swatch ${appearance.accent.toLowerCase() === color ? 'on' : ''}" style="background:${color}" data-accent-value="${color}" aria-label="${color}"></button>`).join('')}
            <input class="custom-color" type="color" data-color-path="appearance.accent" value="${appearance.accent}" title="自定义强调色">
          </div>
        </div>
        <div class="setting-row" style="display:block">
          <div class="setting-copy" style="margin-bottom:8px"><b>材质</b><span>模糊越强，背景越像被磨砂玻璃隔开。</span></div>
          <div class="range-grid">
            ${rangeMarkup({ path: 'appearance.blur', value: appearance.blur, min: 8, max: 44, step: 1, format: 'px', label: '背景模糊' })}
            ${rangeMarkup({ path: 'appearance.opacity', value: appearance.opacity, min: 0.2, max: 0.92, step: 0.01, format: 'percent', label: '玻璃通透度' })}
            ${rangeMarkup({ path: 'appearance.radius', value: appearance.radius, min: 8, max: 34, step: 1, format: 'px', label: '圆角' })}
            ${rangeMarkup({ path: 'appearance.gap', value: appearance.gap, min: 4, max: 18, step: 1, format: 'px', label: '卡片间距' })}
            ${rangeMarkup({ path: 'appearance.fontScale', value: appearance.fontScale, min: 0.8, max: 1.6, step: 0.01, format: 'scale', label: '界面字体缩放', hint: '通过副屏页面缩放生效，预览框只模拟布局。' })}
            ${rangeMarkup({ path: 'appearance.touchScale', value: appearance.touchScale ?? 1.12, min: 1, max: 1.5, step: 0.01, format: 'scale', label: '触控按钮缩放', hint: '放大顶部按钮、快捷按钮和媒体控制。' })}
            ${rangeMarkup({ path: 'appearance.padding', value: appearance.padding, min: 6, max: 24, step: 1, format: 'px', label: '屏幕内边距' })}
          </div>
        </div>
        <div class="setting-row" style="display:block;border-bottom:0">
          <div class="toggle-list">
            ${switchMarkup('appearance.albumTint', '专辑色彩氛围', '用当前封面为背景染色。')}
            ${switchMarkup('appearance.animations', '动态光斑与过渡', '关闭后减少动态效果和资源占用。')}
            ${switchMarkup('appearance.noise', '玻璃噪点', '增加一点点真实磨砂质感。')}
            ${switchMarkup('appearance.showHeader', '顶部状态条', '显示音量、网络、电池与设置入口。')}
          </div>
        </div>
      </section>
    `;
  }

  function customBackgroundMarkup(appearance) {
    if (appearance.background === 'solid') {
      return `
        <div class="background-custom">
          <div class="custom-color-field">
            <span class="custom-color-label">画布颜色</span>
            <input class="custom-color large" type="color" data-color-path="appearance.backgroundSolid" value="${escapeHtml(appearance.backgroundSolid || '#eaf3ff')}" title="纯色背景">
            <code class="hex-value" data-color-label>${escapeHtml(appearance.backgroundSolid || '#eaf3ff')}</code>
          </div>
          <span class="custom-bg-hint">纯色模式会隐藏动态光斑，让背景保持干净。</span>
        </div>
      `;
    }
    if (appearance.background === 'gradient') {
      return `
        <div class="background-custom gradient-custom">
          <div class="gradient-colors">
            <label class="custom-color-field">
              <span class="custom-color-label">起始色</span>
              <input class="custom-color large" type="color" data-color-path="appearance.gradientFrom" value="${escapeHtml(appearance.gradientFrom || '#e8f4ff')}">
              <code class="hex-value" data-color-label>${escapeHtml(appearance.gradientFrom || '#e8f4ff')}</code>
            </label>
            <span class="gradient-arrow">→</span>
            <label class="custom-color-field">
              <span class="custom-color-label">结束色</span>
              <input class="custom-color large" type="color" data-color-path="appearance.gradientTo" value="${escapeHtml(appearance.gradientTo || '#f7ecff')}">
              <code class="hex-value" data-color-label>${escapeHtml(appearance.gradientTo || '#f7ecff')}</code>
            </label>
          </div>
          <div class="gradient-angle">
            ${rangeMarkup({ path: 'appearance.gradientAngle', value: appearance.gradientAngle ?? 135, min: 0, max: 360, step: 1, format: 'deg', label: '渐变角度' })}
          </div>
        </div>
      `;
    }
    if (appearance.background === 'black') {
      return `
        <div class="background-custom black-hint">
          ${icon('moon')}
          <span>纯黑画布会自动使用深色玻璃，并关闭光斑、噪点和专辑染色，保持真正的黑色背景。</span>
        </div>
      `;
    }
    return '';
  }

  async function chooseTheme(theme) {
    S.config.appearance.theme = theme;
    $$('[data-theme-value]').forEach((node) => node.classList.toggle('on', node.dataset.themeValue === theme));
    await save({ appearance: { theme } });
    postPreview();
  }

  async function chooseBackground(background) {
    S.config.appearance.background = background;
    $$('[data-background-value]').forEach((node) => node.classList.toggle('on', node.dataset.backgroundValue === background));
    await save({ appearance: { background } });
    postPreview();
    rerender();
  }

  async function chooseAccent(accent) {
    S.config.appearance.accent = accent;
    $$('[data-accent-value]').forEach((node) => node.classList.toggle('on', node.dataset.accentValue === accent));
    await save({ appearance: { accent } });
    postPreview();
  }

  async function chooseMode(mode) {
    S.config.display.mode = mode;
    $$('[data-mode-value]').forEach((node) => node.classList.toggle('on', node.dataset.modeValue === mode));
    await save({ display: { mode } });
    updateLive();
  }

  /* ---------------- media ---------------- */

  function renderMedia() {
    const media = S.media || { hasSession: false };
    const providers = orderedProviders();
    const offset = S.config.media.offsetMs || 0;
    return `
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('music')}</span>当前媒体会话</div>
            <p class="panel-desc">来自 Windows 系统媒体会话，兼容 Apple Music、网易云、QQ 音乐、酷狗等播放器。</p>
          </div>
          <span class="panel-caption">${hasSession(media) ? '已连接' : '等待播放'}</span>
        </div>
        <div class="current-media" data-current-media>
          <div class="current-cover">
            <div class="placeholder">${icon('music')}</div>
            ${media.cover ? `<img src="${media.cover}" alt="">` : ''}
          </div>
          <div class="current-copy">
            <div class="source-line">${escapeHtml(media.playerName || '系统媒体会话')}</div>
            <h3>${escapeHtml(media.hasSession ? media.title : '暂无正在播放')}</h3>
            <p>${escapeHtml(media.hasSession ? `${media.artist || ''}${media.album ? ` · ${media.album}` : ''}` : '打开任意播放器并开始播放，这里会自动出现')}</p>
          </div>
          <span class="current-state">${escapeHtml(media.status || 'Closed')}</span>
        </div>
        ${selectMarkup('media.preferredPlayer', [
          { value: 'auto', label: '自动 · 优先正在播放' },
          { value: 'applemusic', label: 'Apple Music' },
          { value: 'cloudmusic', label: '网易云音乐' },
          { value: 'qqmusic', label: 'QQ 音乐' },
          { value: 'kugou', label: '酷狗音乐' },
          { value: 'spotify', label: 'Spotify' },
        ], '优先媒体来源', '当多个播放器同时存在会话时，优先选择指定播放器。')}
        ${switchMarkup('media.autoHide', '媒体退出后自动隐藏', '媒体会话结束 3 秒后隐藏媒体与歌词，其余小组件自动扩展铺满副屏。')}
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('lyrics')}</span>歌词匹配</div>
            <p class="panel-desc">优先读取本地 .lrc（包括播放器缓存和自定义目录）；没有本地歌词时再使用在线歌词源。</p>
          </div>
          <button class="secondary-button" data-action="refresh-lyrics" style="height:28px">${icon('refresh')}重新匹配</button>
        </div>
        ${switchMarkup('media.lyricsEnabled', '启用歌词', '关闭后媒体卡仍会显示，但歌词卡会保持空白。')}
        ${switchMarkup('media.preferLocalLyrics', '优先使用本地歌词', '扫描常见播放器缓存目录和下方自定义目录中的 .lrc 文件。')}
        <div class="setting-row">
          <div class="setting-copy"><b>本地歌词目录</b><span>可以把 LRC 文件按歌名命名后放在这里。</span></div>
          <div class="path-field">
            <input class="text-input" readonly value="${escapeHtml(S.config.media.localLyricsDir || '自动扫描常见播放器目录')}">
            <button class="secondary-button" data-action="browse-lyrics-dir" style="height:31px">选择</button>
          </div>
        </div>
        ${switchMarkup('media.showTranslation', '显示翻译歌词', '网易云与部分歌词源提供翻译时显示在原文下方。')}
        <div class="setting-row" style="display:block">
          <div class="setting-copy" style="margin-bottom:8px"><b>歌词字体大小</b><span>只影响副屏歌词，独立于整体界面缩放。</span></div>
          <div class="range-grid">
            ${rangeMarkup({ path: 'media.lyricFontScale', value: S.config.media.lyricFontScale || 1, min: 0.8, max: 3, step: 0.01, format: 'scale', label: '歌词字号' })}
          </div>
        </div>
        <div class="setting-row" style="display:block">
          <div class="setting-copy" style="margin-bottom:8px"><b>歌词源优先级</b><span>从上到下尝试，勾选启用。不同曲库的中文歌曲覆盖不同。</span></div>
          <div class="provider-list">
            ${providers.map((provider, index) => `
              <div class="provider-row ${provider.enabled ? 'enabled' : 'disabled'}">
                <div class="provider-icon">${icon(provider.icon || 'cloud')}</div>
                <div class="provider-copy">
                  <b>${escapeHtml(provider.name)}</b>
                  <span>${escapeHtml(provider.description)}</span>
                </div>
                <div class="provider-actions">
                  ${provider.enabled ? `
                    <button class="icon-button" data-provider-move="${provider.id}" data-direction="-1" ${index === 0 ? 'disabled' : ''} title="上移">${icon('arrowUp')}</button>
                    <button class="icon-button" data-provider-move="${provider.id}" data-direction="1" ${index === enabledProviders().length - 1 ? 'disabled' : ''} title="下移">${icon('arrowDown')}</button>
                  ` : ''}
                  <button class="provider-check ${provider.enabled ? 'on' : ''}" data-provider-toggle="${provider.id}" title="${provider.enabled ? '停用' : '启用'}">${icon('check')}</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="setting-row" style="display:block;border-bottom:0">
          <div class="range-top"><span>歌词时间偏移</span><b data-range-value>${formatRangeValue(offset, 'seconds')}</b></div>
          <input class="settings-range offset-slider" type="range" data-range="media.offsetMs" min="-5000" max="5000" step="100" value="${offset}" style="--value:${((offset + 5000) / 10000) * 100}%">
          <div class="panel-caption" style="margin-top:4px">如果歌词比声音快，向左调；慢则向右。每格 100 ms。</div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('info')}</span>说明</div>
          </div>
        </div>
        <div class="tip-list">
          <div class="tip">${icon('music')}<div><b>歌词来源</b><span>Windows 系统媒体会话不提供歌词，只提供标题、歌手、封面和播放状态。PaperDeck 会优先搜索播放器缓存和本地 LRC，再使用在线源。</span></div></div>
          <div class="tip">${icon('cloud')}<div><b>在线歌词</b><span>网易云、QQ 音乐、酷狗使用公开搜索接口；当匹配失败时可以调整偏移或更换优先级。</span></div></div>
        </div>
      </section>
    `;
  }

  function hasSession(media) {
    return Boolean(media && media.hasSession);
  }

  function enabledProviders() {
    return (S.config.media.providers || []).filter((id) => S.providers.some((provider) => provider.id === id));
  }

  function orderedProviders() {
    const selected = S.config.media.providers || [];
    const ordered = selected
      .map((id) => S.providers.find((provider) => provider.id === id))
      .filter(Boolean)
      .map((provider) => ({ ...provider, enabled: true }));
    for (const provider of S.providers) {
      if (!selected.includes(provider.id)) ordered.push({ ...provider, enabled: false });
    }
    return ordered;
  }

  async function toggleProvider(id) {
    const selected = [...(S.config.media.providers || [])];
    const index = selected.indexOf(id);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(id);
    S.config.media.providers = selected;
    await save({ media: { providers: selected } });
    rerender();
  }

  async function moveProvider(id, direction) {
    const selected = [...(S.config.media.providers || [])];
    const index = selected.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= selected.length) return;
    [selected[index], selected[next]] = [selected[next], selected[index]];
    S.config.media.providers = selected;
    await save({ media: { providers: selected } });
    rerender();
  }

  function updateCurrentMediaCard() {
    const wrapper = $('[data-current-media]');
    if (!wrapper) return;
    const media = S.media || {};
    const cover = wrapper.querySelector('.current-cover img');
    if (media.cover) {
      if (cover) cover.src = media.cover;
      else {
        const placeholder = wrapper.querySelector('.current-cover .placeholder');
        const img = document.createElement('img');
        img.src = media.cover;
        img.alt = '';
        placeholder?.replaceWith(img);
      }
    }
    const source = wrapper.querySelector('.source-line');
    if (source) source.textContent = media.playerName || '系统媒体会话';
    const title = wrapper.querySelector('h3');
    if (title) title.textContent = media.hasSession ? media.title : '暂无正在播放';
    const meta = wrapper.querySelector('.current-copy p');
    if (meta) meta.textContent = media.hasSession ? `${media.artist || ''}${media.album ? ` · ${media.album}` : ''}` : '打开任意播放器并开始播放，这里会自动出现';
    const state = wrapper.querySelector('.current-state');
    if (state) state.textContent = media.status || 'Closed';
  }

  /* ---------------- quick ---------------- */

  function renderQuick() {
    const selected = S.config.quick.actions || [];
    return `
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('sliders')}</span>控制中心</div>
            <p class="panel-desc">勾选后会出现在副屏的控制中心小组件中。点击切换 Wi-Fi、蓝牙和静音，长按或右键打开对应系统设置。</p>
          </div>
          <span class="panel-caption">${selected.length} 个已启用</span>
        </div>
        <div class="quick-choice-grid">
          ${S.quickCatalog.map((action) => `
            <button class="quick-choice ${selected.includes(action.id) ? 'on' : ''}" data-action="toggle-quick" data-quick-id="${action.id}">
              <span class="q-icon">${icon(action.icon)}</span>
              <div class="q-copy"><b>${escapeHtml(action.label)}</b><span>${escapeHtml(action.description)}</span></div>
              ${selected.includes(action.id) ? `<span class="q-check">${icon('check')}</span>` : ''}
            </button>
          `).join('')}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('grid')}</span>应用捷径</div>
            <p class="panel-desc">在副屏的“应用捷径”小组件里显示，可一键启动程序和系统页面。</p>
          </div>
          <button class="secondary-button" data-action="add-shortcut" style="height:28px">${icon('plus')}添加捷径</button>
        </div>
        <div class="shortcut-list">
          ${(S.config.shortcuts || []).map((shortcut) => `
            <div class="shortcut-row">
              <span class="s-icon">${icon(shortcut.icon || 'grid')}</span>
              <input class="text-input" data-shortcut-id="${escapeHtml(shortcut.id)}" data-shortcut-field="label" value="${escapeHtml(shortcut.label)}" placeholder="显示名称">
              <input class="text-input" data-shortcut-id="${escapeHtml(shortcut.id)}" data-shortcut-field="target" value="${escapeHtml(shortcut.target)}" placeholder="程序路径或 URL">
              <button class="icon-button shortcut-remove" data-action="remove-shortcut" data-shortcut-id="${escapeHtml(shortcut.id)}" title="移除">${icon('x')}</button>
            </div>
          `).join('') || '<div class="empty-state">还没有应用捷径</div>'}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="title-icon">${icon('info')}</span>快捷操作的小提示</div>
        </div>
        <div class="tip-list">
          <div class="tip">${icon('sun')}<div><b>亮度</b><span>外接显示器需要支持 DDC/CI；不支持时 PaperDeck 会回退到笔记本内置屏。</span></div></div>
          <div class="tip">${icon('camera')}<div><b>截图</b><span>截图会保存到指定目录，并可在副屏的通知中直接打开所在文件夹。</span></div></div>
          <div class="tip">${icon('lock')}<div><b>睡眠与锁屏</b><span>睡眠会先询问确认；锁屏立即执行。</span></div></div>
        </div>
      </section>
    `;
  }

  async function toggleQuickAction(id) {
    const selected = [...(S.config.quick.actions || [])];
    const index = selected.indexOf(id);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(id);
    S.config.quick.actions = selected;
    await save({ quick: { actions: selected } });
    rerender();
  }

  function updateShortcutField(id, field, value) {
    const shortcuts = (S.config.shortcuts || []).map((shortcut) => (
      shortcut.id === id ? { ...shortcut, [field]: value } : shortcut
    ));
    S.config.shortcuts = shortcuts;
    queuePatch({ shortcuts }, 220);
  }

  async function addShortcut() {
    const shortcuts = [...(S.config.shortcuts || []), {
      id: `shortcut-${Date.now()}`,
      label: '新捷径',
      icon: 'grid',
      target: 'explorer.exe',
      args: '',
    }];
    S.config.shortcuts = shortcuts;
    await save({ shortcuts });
    rerender();
  }

  async function removeShortcut(id) {
    const shortcuts = (S.config.shortcuts || []).filter((shortcut) => shortcut.id !== id);
    S.config.shortcuts = shortcuts;
    await save({ shortcuts });
    rerender();
  }

  /* ---------------- system ---------------- */

  function renderSystem() {
    const data = S.boot;
    const target = getTargetDisplay();
    return `
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('info')}</span>运行信息</div>
            <p class="panel-desc">诊断信息不包含账号密码，仅包含版本、显示器与配置。</p>
          </div>
        </div>
        <div class="info-table">
          <div class="info-cell"><span>PaperDeck 版本</span><b>v${escapeHtml(data.version)}</b></div>
          <div class="info-cell"><span>Electron</span><b>${escapeHtml(data.electron || api.versions?.electron || '—')}</b></div>
          <div class="info-cell"><span>目标副屏</span><b>${target ? `${target.bounds.width} × ${target.bounds.height}` : '未连接'}</b></div>
          <div class="info-cell"><span>配置目录</span><b title="${escapeHtml(data.userData || '')}">${escapeHtml(data.userData || '—')}</b></div>
        </div>
        <div class="button-row" style="margin-top:12px">
          <button class="secondary-button" data-action="diagnostics">${icon('activity')}查看诊断</button>
          <button class="secondary-button" data-action="open-data-folder">${icon('folder')}打开配置目录</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('camera')}</span>截图与显示</div>
            <p class="panel-desc">截图文件按时间命名，默认保存在图片文件夹。</p>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-copy"><b>截图保存目录</b><span>点击右侧按钮选择，目录不存在时会自动创建。</span></div>
          <div class="path-field">
            <input class="text-input" readonly value="${escapeHtml(S.config.system.screenshotDir || S.boot.screenshotDir || '默认：图片 / PaperDeck Screenshots')}">
            <button class="secondary-button" data-action="browse-screenshot-dir" style="height:31px">选择</button>
          </div>
        </div>
        ${selectMarkup('system.temperatureUnit', [
          { value: 'C', label: '摄氏度 °C' },
          { value: 'F', label: '华氏度 °F' },
        ], '温度单位', '同时影响 CPU、GPU 卡片与悬浮面板。')}
        ${switchMarkup('system.showSeconds', '时钟显示秒', '在时钟小组件中显示秒数，会略微加宽数字。')}
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('gpu')}</span>性能与解码</div>
            <p class="panel-desc">默认使用 GPU 硬件加速（硬解），修改后需要重启 PaperDeck。</p>
          </div>
          <span class="panel-caption">${S.config.system.hardwareAcceleration === false ? 'CPU 软解' : 'GPU 硬解'}</span>
        </div>
        ${switchMarkup('system.hardwareAcceleration', 'GPU 硬件加速（硬解）', '关闭后改用 CPU 软件渲染。外部播放器的视频解码方式仍需在播放器里单独设置。')}
        <div class="button-row" style="margin-top:10px">
          <button class="secondary-button" data-action="relaunch-app">${icon('refresh')}重启 PaperDeck</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('monitor')}</span>副屏与组件</div>
            <p class="panel-desc">重新打开窗口或直接进入布局编辑。</p>
          </div>
        </div>
        <div class="button-row">
          <button class="primary-button" data-action="edit-layout">${icon('layout')}编辑副屏布局</button>
          <button class="secondary-button" data-action="recreate-display">${icon('refresh')}重建副屏窗口</button>
          <button class="secondary-button" data-action="open-lyrics-settings">${icon('lyrics')}歌词设置</button>
        </div>
      </section>

      <section class="panel danger-zone">
        <div class="panel-head">
          <div>
            <div class="panel-title"><span class="title-icon">${icon('shield')}</span>重置与退出</div>
            <p class="panel-desc">恢复设置会覆盖当前全部自定义内容。</p>
          </div>
        </div>
        <div class="button-row">
          <button class="danger-button" data-action="reset-config">${icon('refresh')}恢复默认设置</button>
          <button class="danger-button" data-action="quit-app">${icon('power')}退出 PaperDeck</button>
        </div>
      </section>
    `;
  }

  /* ---------------- about ---------------- */

  function renderAbout() {
    return `
      <section class="panel about-hero">
        <div class="about-orb">
          ${icon('logo')}
        </div>
        <div class="about-copy">
          <h2>PaperDeck</h2>
          <p>为 798 × 480 副屏设计的液态玻璃系统仪表盘。<br>所有信息以独立小组件呈现，可拖动、缩放、增删。</p>
          <span class="about-version">v${escapeHtml(S.boot.version)} · ${S.boot.isPackaged ? 'Installed' : 'Development'} · Paperpiece</span>
        </div>
      </section>

      <div class="two-column">
        <section class="panel">
          <div class="panel-head"><div class="panel-title"><span class="title-icon">${icon('sparkles')}</span>包含的功能</div></div>
          <div class="feature-list">
            <div class="feature-item"><b>${icon('cpu')}性能小组件</b><span>CPU / GPU / 内存 / 功率 / 网络 / 存储</span></div>
            <div class="feature-item"><b>${icon('music')}媒体与封面</b><span>系统媒体会话、封面、播放控制与进度</span></div>
            <div class="feature-item"><b>${icon('lyrics')}沉浸歌词</b><span>苹果音乐风格逐行歌词、翻译与聚焦模式</span></div>
            <div class="feature-item"><b>${icon('sliders')}控制中心</b><span>Wi-Fi、蓝牙、音量、亮度、截图与捷径</span></div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><div class="panel-title"><span class="title-icon">${icon('shield')}</span>数据与隐私</div></div>
          <div class="tip-list">
            <div class="tip">${icon('folder')}<div><b>本地优先</b><span>配置、歌词缓存和截图都保存在本机，不需要登录账户。</span></div></div>
            <div class="tip">${icon('cloud')}<div><b>歌词查询</b><span>只把歌曲名、歌手和专辑发送到歌词服务，用于匹配歌词。</span></div></div>
            <div class="tip">${icon('info')}<div><b>系统权限</b><span>不安装驱动，不修改系统文件；读不到的传感器会显示为 —。</span></div></div>
          </div>
        </section>
      </div>

      <section class="panel" style="margin-top:14px">
        <div class="panel-head"><div class="panel-title"><span class="title-icon">${icon('gear')}</span>快捷入口</div></div>
        <div class="button-row">
          <button class="secondary-button" data-action="diagnostics">${icon('activity')}运行诊断</button>
          <button class="secondary-button" data-action="open-data-folder">${icon('folder')}打开配置目录</button>
          <button class="secondary-button" data-action="refresh-previews">${icon('refresh')}刷新预览</button>
        </div>
        <p class="panel-desc" style="margin-top:14px">开发者：Paperpiece。PaperDeck 与 Apple、网易云音乐、腾讯音乐、酷狗音乐无隶属关系。播放器名称与商标归各自所有者所有。</p>
      </section>
    `;
  }

  /* ---------------- saving / preview / helpers ---------------- */

  function buildPatch(path, value) {
    const parts = path.split('.');
    const root = {};
    let cursor = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      cursor[parts[index]] = {};
      cursor = cursor[parts[index]];
    }
    cursor[parts[parts.length - 1]] = value;
    return root;
  }

  function getPath(object, path) {
    return path.split('.').reduce((value, part) => (value === null || value === undefined ? undefined : value[part]), object);
  }

  function setPath(object, path, value) {
    const parts = path.split('.');
    let cursor = object;
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!cursor[parts[index]] || typeof cursor[parts[index]] !== 'object') cursor[parts[index]] = {};
      cursor = cursor[parts[index]];
    }
    cursor[parts[parts.length - 1]] = value;
  }

  function mergePatch(base, patch) {
    const result = { ...(base || {}) };
    for (const [key, value] of Object.entries(patch || {})) {
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = mergePatch(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  function queuePatch(patch, delay = 140) {
    S.pendingPatch = mergePatch(S.pendingPatch || {}, patch);
    clearTimeout(S.pendingTimer);
    S.pendingTimer = setTimeout(flushPendingPatch, delay);
  }

  async function flushPendingPatch() {
    if (!S.pendingPatch) return;
    const patch = S.pendingPatch;
    S.pendingPatch = null;
    clearTimeout(S.pendingTimer);
    await save(patch);
  }

  async function save(patch) {
    S.saving += 1;
    setSaveState('saving');
    try {
      const config = await api.updateConfig(patch);
      S.config = config;
      updateSidebar();
      updateLive();
      postPreview();
      S.saving = Math.max(0, S.saving - 1);
      if (S.saving === 0) setSaveState('saved');
      return config;
    } catch (error) {
      S.saving = Math.max(0, S.saving - 1);
      setSaveState('error');
      toast(`保存失败：${error.message}`, { icon: 'info', type: 'error' });
      return S.config;
    }
  }

  function setSaveState(state) {
    const node = $('#saveState');
    if (!node) return;
    clearTimeout(S.saveLabelTimer);
    node.className = `save-state ${state}`;
    if (state === 'saving') {
      node.innerHTML = `${icon('refresh')}<span>保存中</span>`;
    } else if (state === 'saved') {
      node.innerHTML = `${icon('check')}<span>已保存</span>`;
      S.saveLabelTimer = setTimeout(() => {
        if (node.classList.contains('saved')) {
          node.className = 'save-state';
          node.innerHTML = '';
        }
      }, 1800);
    } else if (state === 'error') {
      node.innerHTML = `${icon('info')}<span>保存失败</span>`;
    } else {
      node.innerHTML = '';
    }
  }

  function getTargetDisplay() {
    const displays = S.displays?.displays || [];
    const preferred = S.config.display.targetId;
    if (preferred !== null && preferred !== undefined) {
      const match = displays.find((display) => String(display.id) === String(preferred));
      if (match) return match;
    }
    const secondary = displays.filter((display) => !display.primary);
    return secondary.find((display) => display.bounds.width === 798 && display.bounds.height === 480)
      || secondary[0]
      || displays[0]
      || null;
  }

  function updateSidebar() {
    const target = getTargetDisplay();
    const sidebar = $('#sidebarDisplay');
    if (sidebar) {
      const title = sidebar.querySelector('b');
      const meta = sidebar.querySelector('span:last-child');
      if (title) title.textContent = target ? (target.primary ? '主屏 · 预览模式' : '副屏已连接') : '未检测到副屏';
      if (meta) meta.textContent = target ? `${target.bounds.width} × ${target.bounds.height} · ${S.config.display.mode === 'workarea' ? '工作区' : '全屏'}` : '等待显示器';
      sidebar.querySelector('.display-dot')?.classList.toggle('offline', !target);
    }
    const displaySize = $('[data-live="display-size"]');
    if (displaySize) displaySize.textContent = target ? `${target.bounds.width}×${target.bounds.height}` : '--';
  }

  function updateLive() {
    const media = S.media || {};
    const set = (key, value) => {
      $$(`[data-live="${key}"]`).forEach((node) => { if (node.textContent !== String(value)) node.textContent = value; });
    };
    set('widget-count', (S.config.layout.widgets || []).filter((widget) => widget.enabled).length);
    set('player', media.hasSession ? media.playerName : '无');
    set('player-short', media.hasSession ? media.playerName : '等待播放');
    set('track', media.hasSession ? media.title : '暂无正在播放');
    set('artist', media.hasSession ? media.artist : '在播放器中开始播放');
    set('lyrics-source', S.lyrics?.source || (S.lyrics?.pending ? '匹配中…' : '待匹配'));
    set('lyrics-source-inline', S.lyrics?.source || (S.lyrics?.pending ? '匹配中…' : '待匹配'));
    set('network', networkLabel(S.metrics?.network || {}));
    set('network-ip', S.metrics?.network?.ip || '等待网络');
    set('mode-label', S.config.display.mode === 'workarea' ? '保留任务栏' : '全屏沉浸');
    set('display-status', getTargetDisplay() ? '在线' : '等待连接');
    updateCurrentMediaCard();
  }

  function networkLabel(network) {
    if (network?.ssid) return network.ssid;
    if (/wlan|wi-?fi|无线/i.test(network?.iface || '')) return 'Wi-Fi';
    if (/ethernet|以太网/i.test(network?.iface || '')) return '有线网络';
    return network?.iface || '网络';
  }

  function setupPreviews() {
    S.previewObserver?.disconnect();
    S.previewFrames = [];
    const frames = $$('.preview-frame');
    for (const frame of frames) {
      const viewport = frame.closest('.preview-viewport');
      if (!viewport) continue;
      const resize = () => {
        const scale = viewport.clientWidth / 798;
        frame.style.setProperty('--preview-scale', String(scale));
      };
      resize();
      frame.addEventListener('load', () => postPreview(frame));
      S.previewFrames.push(frame);
    }
    if ('ResizeObserver' in window) {
      S.previewObserver = new ResizeObserver(() => {
        for (const frame of S.previewFrames) {
          const viewport = frame.closest('.preview-viewport');
          if (viewport) frame.style.setProperty('--preview-scale', String(viewport.clientWidth / 798));
        }
      });
      $$('.preview-viewport').forEach((viewport) => S.previewObserver.observe(viewport));
    }
    setTimeout(() => postPreview(), 120);
  }

  function postPreview(specificFrame) {
    const frames = specificFrame ? [specificFrame] : S.previewFrames;
    for (const frame of frames) {
      try {
        frame.contentWindow?.postMessage({ type: 'paperdeck-preview-config', config: S.config }, '*');
      } catch { /* frame may not be ready */ }
    }
  }

  function refreshPreviews() {
    for (const frame of S.previewFrames) {
      try {
        frame.contentWindow?.location.reload();
      } catch {
        frame.src = frame.src;
      }
    }
    toast('预览已刷新', { icon: 'refresh' });
  }

  function toast(message, options = {}) {
    const root = $('#toastRoot');
    if (!root) return;
    while (root.children.length >= 3) root.firstElementChild.remove();
    const node = document.createElement('div');
    node.className = `toast ${options.type || ''}`;
    node.innerHTML = `${icon(options.icon || 'info')}<span>${escapeHtml(message)}</span>`;
    root.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(4px)';
      node.style.transition = 'opacity .2s ease, transform .2s ease';
      setTimeout(() => node.remove(), 220);
    }, options.duration || 2600);
  }

  function confirmModal({ title, copy, confirmLabel, danger = false, onConfirm }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal';
    wrapper.innerHTML = `
      <div class="modal-card">
        <div class="modal-title">${escapeHtml(title)}</div>
        <div class="modal-copy">${escapeHtml(copy)}</div>
        <div class="modal-actions">
          <button class="secondary-button" data-role="cancel">取消</button>
          <button class="${danger ? 'danger-button' : 'primary-button'}" data-role="ok">${escapeHtml(confirmLabel || '确定')}</button>
        </div>
      </div>
    `;
    $('#modalRoot').appendChild(wrapper);
    const close = () => { wrapper.remove(); };
    wrapper._close = close;
    wrapper.querySelector('[data-role="cancel"]').addEventListener('click', close);
    wrapper.querySelector('[data-role="ok"]').addEventListener('click', () => {
      close();
      onConfirm?.();
    });
    wrapper.addEventListener('click', (event) => {
      if (event.target === wrapper) close();
    });
  }

  async function showDiagnostics() {
    try {
      const data = await api.getDiagnostics();
      const wrapper = document.createElement('div');
      wrapper.className = 'modal';
      wrapper.innerHTML = `
        <div class="modal-card wide">
          <div class="modal-title">运行诊断</div>
          <div class="modal-copy">如果遇到问题，可以把这段信息发给开发者。内容不包含密码或账号。</div>
          <pre class="diagnostics-output"></pre>
          <div class="modal-actions"><button class="primary-button" data-role="close">关闭</button></div>
        </div>
      `;
      $('#modalRoot').appendChild(wrapper);
      wrapper.querySelector('.diagnostics-output').textContent = JSON.stringify(data, null, 2);
      const close = () => wrapper.remove();
      wrapper._close = close;
      wrapper.querySelector('[data-role="close"]').addEventListener('click', close);
      wrapper.addEventListener('click', (event) => { if (event.target === wrapper) close(); });
    } catch (error) {
      toast(`读取诊断失败：${error.message}`, { icon: 'info', type: 'error' });
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  // Quick action cards are rendered by the settings view; their clicks are
  // handled by the delegated view listener above.

  init();
})();
