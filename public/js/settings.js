(function () {
  var state = {
    settings: {},
    systemInfo: null,
    health: null,
    tokens: [],
    activeTab: 'overview',
    loading: true,
    error: null,
    _toastTimer: null,
    _dirty: false,
  };

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $(id) { return document.getElementById(id); }

  function showToast(msg, type) {
    var el = $('setToast');
    if (!el) return;
    if (state._toastTimer) clearTimeout(state._toastTimer);
    el.textContent = msg;
    el.className = 'set-toast ' + (type || 'ok');
    el.style.display = 'block';
    state._toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function showLoading() {
    var el = $('settingsContent');
    if (el) el.innerHTML = '<div class="db-loading">Loading settings...</div>';
  }

  function showError(msg) {
    var el = $('settingsContent');
    if (el) el.innerHTML = '<div class="db-error">' + esc(msg) + '</div>';
  }

  function formatBytes(b) {
    if (!b) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(i > 0 ? 1 : 0) + ' ' + u[i];
  }

  function formatPercent(used, total) {
    if (!total) return '0%';
    return Math.round(used / total * 100) + '%';
  }

  function getTerminalVersion() {
    return localStorage.getItem('nexus-terminal-version') || 'pro';
  }

  var TABS = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'panel', label: 'Panel', icon: '🖥️' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
  ];

  function renderTabBar() {
    var h = '<div class="set-tab-bar">';
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      h += '<div class="set-tab-item' + (state.activeTab === t.id ? ' active' : '') + '" data-action="switchTab" data-tab="' + t.id + '">' + esc(t.icon) + ' ' + esc(t.label) + '</div>';
    }
    h += '</div>';
    return h;
  }

  function renderOverview() {
    var s = state.settings;
    var info = state.systemInfo || {};
    var hp = state.health || {};
    var memPct = hp.memory ? hp.memory.percent : 0;
    var diskPct = hp.disk ? hp.disk.percent : 0;
    var h = '';
    h += '<div class="set-overview-grid">';
    h += '<div class="set-info-card"><div class="set-info-card-icon">💾</div><div class="set-info-card-value">' + esc(info.hostname || '—') + '</div><div class="set-info-card-label">Hostname</div></div>';
    h += '<div class="set-info-card"><div class="set-info-card-icon">⏱️</div><div class="set-info-card-value">' + esc(info.uptime || '—') + '</div><div class="set-info-card-label">Uptime</div></div>';
    h += '<div class="set-info-card"><div class="set-info-card-icon">🧠</div><div class="set-info-card-value">' + memPct + '%</div><div class="set-info-card-label">Memory (' + formatBytes(hp.memory ? hp.memory.used : 0) + ' / ' + formatBytes(hp.memory ? hp.memory.total : 0) + ')</div></div>';
    h += '<div class="set-info-card"><div class="set-info-card-icon">💿</div><div class="set-info-card-value">' + diskPct + '%</div><div class="set-info-card-label">Disk (' + formatBytes(hp.disk ? hp.disk.used : 0) + ' / ' + formatBytes(hp.disk ? hp.disk.total : 0) + ')</div></div>';
    h += '<div class="set-info-card"><div class="set-info-card-icon">🖥️</div><div class="set-info-card-value">' + (info.cpuCores || '—') + ' cores</div><div class="set-info-card-label">CPU (' + (info.loadAverage ? info.loadAverage[0].toFixed(2) : '—') + ' load)</div></div>';
    h += '<div class="set-info-card"><div class="set-info-card-icon">🐧</div><div class="set-info-card-value">' + esc(info.osName || '—') + '</div><div class="set-info-card-label">Operating System</div></div>';
    h += '</div>';

    h += '<div class="set-section"><div class="set-section-title">System Versions</div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Node.js</div></div><div style="font-size:13px;color:var(--text-secondary);">' + esc(info.nodeVersion || '—') + '</div></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">PHP</div></div><div style="font-size:13px;color:var(--text-secondary);">' + esc(info.phpVersion || '—') + '</div></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Nginx</div></div><div style="font-size:13px;color:var(--text-secondary);">' + esc(info.nginxVersion || '—') + '</div></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Panel Version</div></div><div style="font-size:13px;color:var(--text-secondary);">' + esc(s.panelName || 'NexusPanel') + '</div></div>';
    h += '</div>';

    if (hp.services) {
      h += '<div class="set-section"><div class="set-section-title">Service Health</div>';
      h += '<div class="set-health-grid">';
      var svcKeys = Object.keys(hp.services);
      for (var i = 0; i < svcKeys.length; i++) {
        var k = svcKeys[i];
        var st = hp.services[k];
        h += '<div class="set-health-item"><span class="set-health-dot ' + esc(st) + '"></span>' + esc(k) + '</div>';
      }
      h += '</div></div>';
    }

    h += '<div class="set-section"><div class="set-section-title">Terminal</div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Default Terminal</div><div class="set-row-desc">Choose which terminal experience opens by default</div></div>';
    h += '<select class="settings-select" data-action="setTerminalVersion"><option value="classic"' + (getTerminalVersion() === 'classic' ? ' selected' : '') + '>Classic</option><option value="pro"' + (getTerminalVersion() === 'pro' ? ' selected' : '') + '>PRO</option></select></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Reset Terminal Choice</div><div class="set-row-desc">Clear saved preference so the chooser appears again</div></div>';
    h += '<button class="db-btn" data-action="resetTerminal">Reset</button></div>';
    h += '</div>';

    return h;
  }

  function renderPanel() {
    var s = state.settings;
    var h = '';
    h += '<div class="set-section"><div class="set-section-title">General</div><div class="set-section-desc">Basic panel configuration settings</div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Panel Name</div><div class="set-row-desc">Display name shown in the header and browser tab</div></div>';
    h += '<input type="text" class="set-input" data-field="panelName" value="' + esc(s.panelName || 'NexusPanel') + '" maxlength="64"></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Server Location</div><div class="set-row-desc">Descriptive location (shown in system info)</div></div>';
    h += '<input type="text" class="set-input" data-field="serverLocation" value="' + esc(s.serverLocation || '') + '" maxlength="128" placeholder="e.g. Amsterdam, NL"></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Default Landing Page</div><div class="set-row-desc">Page shown after login</div></div>';
    h += '<select class="settings-select" data-field="defaultPage">';
    var pages = [['dashboard', 'Dashboard'], ['domains', 'Domains'], ['databases', 'Databases'], ['files', 'Files'], ['users', 'Users'], ['services', 'Services']];
    for (var i = 0; i < pages.length; i++) {
      h += '<option value="' + pages[i][0] + '"' + (s.defaultPage === pages[i][0] ? ' selected' : '') + '>' + pages[i][1] + '</option>';
    }
    h += '</select></div>';
    h += '</div>';

    h += '<div class="set-section"><div class="set-section-title">Session</div><div class="set-section-desc">Control session behavior and timeouts</div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Session Timeout</div><div class="set-row-desc">Minutes before inactive sessions expire</div></div>';
    h += '<div class="set-range-wrap"><input type="range" class="set-range" data-field="sessionTimeout" min="5" max="1440" step="5" value="' + (s.sessionTimeout || 60) + '"><span class="set-range-val">' + (s.sessionTimeout || 60) + ' min</span></div></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Idle Timeout</div><div class="set-row-desc">Minutes before idle users are logged out (0 = disabled)</div></div>';
    h += '<div class="set-range-wrap"><input type="range" class="set-range" data-field="idleTimeout" min="0" max="1440" step="5" value="' + (s.idleTimeout != null ? s.idleTimeout : 30) + '"><span class="set-range-val">' + (s.idleTimeout != null ? s.idleTimeout : 30) + ' min</span></div></div>';
    h += '</div>';

    h += '<div class="set-section"><div class="set-section-title">Updates</div><div class="set-section-desc">Configure automatic update behavior</div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Automatic Updates</div><div class="set-row-desc">Automatically install NexusPanel updates when available</div></div>';
    h += '<label class="settings-toggle"><input type="checkbox" data-field="autoUpdate"' + (s.autoUpdate ? ' checked' : '') + '><span class="settings-toggle-slider"></span></label></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Update Channel</div><div class="set-row-desc">Release channel for updates</div></div>';
    h += '<select class="settings-select" data-field="updateChannel"><option value="stable"' + (s.updateChannel === 'stable' ? ' selected' : '') + '>Stable</option><option value="beta"' + (s.updateChannel === 'beta' ? ' selected' : '') + '>Beta</option></select></div>';
    if (s.lastUpdateCheck) {
      h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Last Update Check</div><div class="set-row-desc">' + esc(new Date(s.lastUpdateCheck).toLocaleString()) + '</div></div></div>';
    }
    h += '</div>';

    h += '<div class="set-section"><div class="set-section-title">Language & Region</div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Language</div><div class="set-row-desc">Interface language</div></div>';
    h += '<select class="settings-select" data-field="language">';
    var langs = [['en', 'English'], ['nl', 'Nederlands'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['pt', 'Português'], ['ru', 'Русский'], ['zh', '中文'], ['ja', '日本語']];
    for (var i = 0; i < langs.length; i++) {
      h += '<option value="' + langs[i][0] + '"' + (s.language === langs[i][0] ? ' selected' : '') + '>' + langs[i][1] + '</option>';
    }
    h += '</select></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Timezone</div><div class="set-row-desc">Server timezone for timestamps</div></div>';
    h += '<select class="settings-select" data-field="timezone">';
    var tzs = ['UTC', 'Europe/Amsterdam', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'];
    for (var i = 0; i < tzs.length; i++) {
      h += '<option value="' + tzs[i] + '"' + (s.timezone === tzs[i] ? ' selected' : '') + '>' + tzs[i] + '</option>';
    }
    h += '</select></div>';
    h += '</div>';

    h += renderSaveActions();
    return h;
  }

  function renderSecurity() {
    var s = state.settings;
    var h = '';
    h += '<div class="set-section"><div class="set-section-title">Authentication</div><div class="set-section-desc">Control login security settings</div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Two-Factor Authentication</div><div class="set-row-desc">Require 2FA for admin login</div></div>';
    h += '<label class="settings-toggle"><input type="checkbox" data-field="enable2FA"' + (s.enable2FA ? ' checked' : '') + '><span class="settings-toggle-slider"></span></label></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Login Notifications</div><div class="set-row-desc">Notify on successful admin login</div></div>';
    h += '<label class="settings-toggle"><input type="checkbox" data-field="loginNotifications"' + (s.loginNotifications !== false ? ' checked' : '') + '><span class="settings-toggle-slider"></span></label></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">IP Whitelist</div><div class="set-row-desc">Restrict admin access to specific IPs (one per line, CIDR supported)</div></div>';
    h += '<textarea class="set-textarea" data-field="ipWhitelist" placeholder="192.168.1.0/24\n10.0.0.1">' + esc((s.ipWhitelist || []).join('\n')) + '</textarea></div>';
    h += '</div>';

    h += '<div class="set-section"><div class="set-section-title">API Tokens</div><div class="set-section-desc">Manage API access tokens for integrations</div>';
    h += '<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="db-btn db-btn-primary" data-action="showCreateToken">+ Create Token</button></div>';
    if (state.tokens.length === 0) {
      h += '<div class="set-empty">No API tokens created yet</div>';
    } else {
      h += '<table class="set-token-table"><thead><tr><th>Name</th><th>Scope</th><th>Created</th><th></th></tr></thead><tbody>';
      for (var i = 0; i < state.tokens.length; i++) {
        var tok = state.tokens[i];
        var scopeClass = tok.scope === 'admin' ? 'set-token-badge-admin' : 'set-token-badge-read';
        h += '<tr' + (tok.revoked ? ' class="set-token-revoked"' : '') + '>';
        h += '<td>' + esc(tok.name) + '</td>';
        h += '<td><span class="set-token-badge ' + scopeClass + '">' + esc(tok.scope) + '</span></td>';
        h += '<td style="font-size:12px;color:var(--text-tertiary)">' + esc(new Date(tok.createdAt).toLocaleDateString()) + '</td>';
        h += '<td>' + (tok.revoked ? '<span style="font-size:12px;color:var(--text-tertiary)">Revoked</span>' : '<button class="db-btn db-btn-sm" data-action="revokeToken" data-token-id="' + esc(tok.id) + '">Revoke</button>') + '</td>';
        h += '</tr>';
      }
      h += '</tbody></table>';
    }
    h += '</div>';

    h += renderSaveActions();
    return h;
  }

  function renderAppearance() {
    var s = state.settings;
    var h = '';
    h += '<div class="set-section"><div class="set-section-title">Theme</div><div class="set-section-desc">Choose your preferred color theme</div>';
    h += '<div class="set-theme-grid">';
    var themes = [
      { id: 'dark', label: 'Dark', bg: '#1a1a2e', fg: '#e0e0e0' },
      { id: 'light', label: 'Light', bg: '#f5f7fa', fg: '#333' },
      { id: 'auto', label: 'Auto', bg: 'linear-gradient(135deg, #1a1a2e 50%, #f5f7fa 50%)', fg: '#888' },
    ];
    for (var i = 0; i < themes.length; i++) {
      var th = themes[i];
      h += '<div class="set-theme-card' + (s.theme === th.id ? ' active' : '') + '" data-action="setTheme" data-theme="' + th.id + '">';
      h += '<div class="set-theme-preview" style="background:' + th.bg + '"></div>';
      h += '<div class="set-theme-label">' + esc(th.label) + '</div></div>';
    }
    h += '</div></div>';

    h += '<div class="set-section"><div class="set-section-title">Layout</div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Sidebar Position</div><div class="set-row-desc">Place navigation on left or right side</div></div>';
    h += '<select class="settings-select" data-field="sidebarPosition"><option value="left"' + (s.sidebarPosition === 'left' ? ' selected' : '') + '>Left</option><option value="right"' + (s.sidebarPosition === 'right' ? ' selected' : '') + '>Right</option></select></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Font Size</div><div class="set-row-desc">Adjust text size across the interface</div></div>';
    h += '<div class="set-font-grid">';
    var fonts = [['small', 'Small', 'set-font-sm'], ['medium', 'Medium', 'set-font-md'], ['large', 'Large', 'set-font-lg']];
    for (var i = 0; i < fonts.length; i++) {
      h += '<div class="set-font-card' + (s.fontSize === fonts[i][0] ? ' active' : '') + '" data-action="setFontSize" data-fontsize="' + fonts[i][0] + '"><span class="' + fonts[i][2] + '">Aa</span><br><span style="font-size:11px;color:var(--text-tertiary)">' + fonts[i][1] + '</span></div>';
    }
    h += '</div></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Accent Color</div><div class="set-row-desc">Primary accent color throughout the interface</div></div>';
    h += '<input type="color" data-field="accentColor" value="' + esc(s.accentColor || '#10b981') + '" style="width:36px;height:36px;border:none;cursor:pointer;background:transparent;"></div>';
    h += '</div>';

    h += renderSaveActions();
    return h;
  }

  function renderNotifications() {
    var s = state.settings;
    var n = s.notifyOn || {};
    var h = '';
    h += '<div class="set-section"><div class="set-section-title">Delivery</div><div class="set-section-desc">How and where you receive notifications</div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Desktop Notifications</div><div class="set-row-desc">Show browser push notifications</div></div>';
    h += '<label class="settings-toggle"><input type="checkbox" data-field="desktopNotifications"' + (s.desktopNotifications ? ' checked' : '') + '><span class="settings-toggle-slider"></span></label></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Update Alerts</div><div class="set-row-desc">Notify when NexusPanel updates are available</div></div>';
    h += '<label class="settings-toggle"><input type="checkbox" data-field="updateAlerts"' + (s.updateAlerts !== false ? ' checked' : '') + '><span class="settings-toggle-slider"></span></label></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Email Notifications</div><div class="set-row-desc">Send notifications via email (requires email configuration)</div></div>';
    h += '<label class="settings-toggle"><input type="checkbox" data-field="emailNotifications"' + (s.emailNotifications ? ' checked' : '') + '><span class="settings-toggle-slider"></span></label></div>';
    h += '</div>';

    h += '<div class="set-section"><div class="set-section-title">Categories</div><div class="set-section-desc">Choose which types of events trigger notifications</div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Updates</div><div class="set-row-desc">System updates and patches</div></div>';
    h += '<label class="settings-toggle"><input type="checkbox" data-notify="updates"' + (n.updates !== false ? ' checked' : '') + '><span class="settings-toggle-slider"></span></label></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Security</div><div class="set-row-desc">Security events and alerts</div></div>';
    h += '<label class="settings-toggle"><input type="checkbox" data-notify="security"' + (n.security !== false ? ' checked' : '') + '><span class="settings-toggle-slider"></span></label></div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Errors</div><div class="set-row-desc">Service failures and errors</div></div>';
    h += '<label class="settings-toggle"><input type="checkbox" data-notify="errors"' + (n.errors !== false ? ' checked' : '') + '><span class="settings-toggle-slider"></span></label></div>';
    h += '</div>';

    h += renderSaveActions();
    return h;
  }

  function renderMaintenance() {
    var s = state.settings;
    var h = '';
    h += '<div class="set-section"><div class="set-section-title">System Maintenance</div><div class="set-section-desc">Perform maintenance operations on the panel</div>';
    h += '<div class="set-maint-grid">';
    h += '<div class="set-maint-card"><div class="set-maint-icon">🗑️</div><div class="set-maint-title">Clear Cache</div><div class="set-maint-desc">Remove cached files and temporary data</div><button class="db-btn set-maint-btn" data-action="clearCache">Clear Cache</button></div>';
    h += '<div class="set-maint-card"><div class="set-maint-icon">📜</div><div class="set-maint-title">Rotate Logs</div><div class="set-maint-desc">Force log rotation for nginx</div><button class="db-btn set-maint-btn" data-action="rotateLogs">Rotate Logs</button></div>';
    h += '<div class="set-maint-card"><div class="set-maint-icon">🔄</div><div class="set-maint-title">Restart Panel</div><div class="set-maint-desc">Restart the NexusPanel service</div><button class="db-btn set-maint-btn" data-action="restartService">Restart</button></div>';
    h += '<div class="set-maint-card"><div class="set-maint-icon">🐛</div><div class="set-maint-title">Debug Mode</div><div class="set-maint-desc">Enable verbose logging</div><label class="settings-toggle" style="margin:0 auto"><input type="checkbox" data-field="debugMode"' + (s.debugMode ? ' checked' : '') + '><span class="settings-toggle-slider"></span></label></div>';
    h += '</div></div>';

    h += '<div class="set-section"><div class="set-section-title">Log Management</div>';
    h += '<div class="set-row"><div class="set-row-info"><div class="set-row-label">Log Retention</div><div class="set-row-desc">Number of days to keep log files</div></div>';
    h += '<div class="set-range-wrap"><input type="range" class="set-range" data-field="logRetentionDays" min="7" max="365" step="1" value="' + (s.logRetentionDays || 30) + '"><span class="set-range-val">' + (s.logRetentionDays || 30) + ' days</span></div></div>';
    h += '</div>';

    h += renderSaveActions();
    return h;
  }

  function renderSaveActions() {
    return '<div class="set-actions"><button class="db-btn db-btn-primary" data-action="saveSettings">Save Settings</button><span id="setSaveMsg" class="set-save-msg" style="display:none"></span></div>';
  }

  function renderActiveTab() {
    var el = $('settingsContent');
    if (!el) return;
    var h = renderTabBar();
    h += '<div class="set-tab-content">';
    switch (state.activeTab) {
      case 'overview': h += renderOverview(); break;
      case 'panel': h += renderPanel(); break;
      case 'security': h += renderSecurity(); break;
      case 'appearance': h += renderAppearance(); break;
      case 'notifications': h += renderNotifications(); break;
      case 'maintenance': h += renderMaintenance(); break;
    }
    h += '</div>';
    el.innerHTML = h;
  }

  function collectSettings() {
    var s = Object.assign({}, state.settings);
    var fields = document.querySelectorAll('[data-field]');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var key = f.getAttribute('data-field');
      if (f.type === 'checkbox') {
        s[key] = f.checked;
      } else if (f.type === 'range') {
        s[key] = parseInt(f.value) || 0;
      } else if (f.type === 'color') {
        s[key] = f.value;
      } else if (f.tagName === 'TEXTAREA' && key === 'ipWhitelist') {
        s[key] = f.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      } else {
        s[key] = f.value;
      }
    }
    var notifyCheckboxes = document.querySelectorAll('[data-notify]');
    var notifyOn = s.notifyOn || {};
    for (var i = 0; i < notifyCheckboxes.length; i++) {
      var nkey = notifyCheckboxes[i].getAttribute('data-notify');
      notifyOn[nkey] = notifyCheckboxes[i].checked;
    }
    s.notifyOn = notifyOn;
    return s;
  }

  function collectDirty() {
    var current = collectSettings();
    return JSON.stringify(current) !== JSON.stringify(state.settings);
  }

  function updateDirtyIndicator() {
    var btn = document.querySelector('[data-action="saveSettings"]');
    if (!btn) return;
    if (collectDirty()) {
      btn.textContent = 'Save Settings *';
    } else {
      btn.textContent = 'Save Settings';
    }
  }

  async function loadInitial() {
    state.loading = true;
    state.error = null;
    showLoading();
    try {
      var results = await Promise.all([
        API.settings.get(),
        API.settings.systemInfo(),
        API.settings.health(),
        API.settings.tokens(),
      ]);
      state.settings = results[0];
      state.systemInfo = results[1];
      state.health = results[2];
      state.tokens = results[3];
    } catch (e) {
      state.settings = { autoUpdate: false, updateChannel: 'stable', panelName: 'NexusPanel' };
      state.systemInfo = {};
      state.health = {};
      state.tokens = [];
      state.error = e.message;
    }
    state.loading = false;
    renderActiveTab();
  }

  async function handleSave() {
    var btn = document.querySelector('[data-action="saveSettings"]');
    var msg = $('setSaveMsg');
    if (btn) btn.disabled = true;
    if (msg) msg.style.display = 'none';
    try {
      var newSettings = collectSettings();
      var result = await API.settings.save(newSettings);
      state.settings = result;
      showToast('Settings saved', 'ok');
      if (msg) {
        msg.textContent = '✓ Saved';
        msg.className = 'set-save-msg set-save-ok';
        msg.style.display = 'inline';
        setTimeout(function () { msg.style.display = 'none'; }, 3000);
      }
      updateDirtyIndicator();
    } catch (e) {
      showToast('Failed to save: ' + (e.message || 'Unknown error'), 'err');
      if (msg) {
        msg.textContent = '✖ ' + (e.message || 'Failed');
        msg.className = 'set-save-msg set-save-err';
        msg.style.display = 'inline';
      }
    }
    if (btn) btn.disabled = false;
  }

  function handleClick(action, el) {
    switch (action) {
      case 'switchTab':
        state.activeTab = el.getAttribute('data-tab');
        renderActiveTab();
        break;
      case 'saveSettings':
        handleSave();
        break;
      case 'setTheme':
        state.settings.theme = el.getAttribute('data-theme');
        renderActiveTab();
        break;
      case 'setFontSize':
        state.settings.fontSize = el.getAttribute('data-fontsize');
        renderActiveTab();
        break;
      case 'resetTerminal':
        localStorage.removeItem('nexus-terminal-version');
        showToast('Terminal choice reset', 'ok');
        break;
      case 'setTerminalVersion':
        break;
      case 'showCreateToken':
        var overlay = $('setTokenOverlay');
        if (overlay) {
          overlay.style.display = 'flex';
          var nameInput = $('setTokenName');
          if (nameInput) { nameInput.value = ''; nameInput.focus(); }
        }
        break;
      case 'closeTokenModal':
        var overlay = $('setTokenOverlay');
        if (overlay) overlay.style.display = 'none';
        break;
      case 'createTokenConfirm':
        createToken();
        break;
      case 'closeTokenSecretModal':
        var overlay = $('setTokenSecretOverlay');
        if (overlay) overlay.style.display = 'none';
        break;
      case 'copyTokenSecret':
        var secretEl = $('setTokenSecretValue');
        if (secretEl) {
          navigator.clipboard.writeText(secretEl.textContent).then(function () {
            showToast('Token copied to clipboard', 'ok');
          }).catch(function () {
            showToast('Failed to copy', 'err');
          });
        }
        break;
      case 'revokeToken':
        var tokenId = el.getAttribute('data-token-id');
        if (tokenId) revokeToken(tokenId);
        break;
      case 'clearCache':
        if (confirm('Clear all cached files?')) doMaintenance('clearCache', 'Cache cleared');
        break;
      case 'rotateLogs':
        if (confirm('Force log rotation?')) doMaintenance('rotateLogs', 'Logs rotated');
        break;
      case 'restartService':
        if (confirm('Restart NexusPanel service? The panel will be briefly unavailable.')) doMaintenance('restart', 'Service restarting...');
        break;
    }
  }

  function handleChange(el) {
    var field = el.getAttribute('data-field');
    if (field) {
      updateDirtyIndicator();
      var rangeVal = el.closest('.set-range-wrap');
      if (rangeVal) {
        var valSpan = rangeVal.querySelector('.set-range-val');
        if (valSpan) valSpan.textContent = el.value + (field === 'logRetentionDays' ? ' days' : ' min');
      }
    }
    var notify = el.getAttribute('data-notify');
    if (notify) updateDirtyIndicator();
  }

  async function createToken() {
    var nameInput = $('setTokenName');
    var scopeInput = $('setTokenScope');
    var name = nameInput ? nameInput.value.trim() : '';
    var scope = scopeInput ? scopeInput.value : 'read';
    if (!name || name.length < 2) { showToast('Token name is required (min 2 chars)', 'err'); return; }
    if (name.includes('..') || name.includes('/') || name.includes('\\')) { showToast('Invalid token name', 'err'); return; }
    try {
      var token = await API.settings.createToken({ name: name, scope: scope });
      var overlay = $('setTokenOverlay');
      if (overlay) overlay.style.display = 'none';
      state.tokens = await API.settings.tokens();
      renderActiveTab();
      var secretOverlay = $('setTokenSecretOverlay');
      var secretEl = $('setTokenSecretValue');
      if (secretOverlay && secretEl) {
        secretEl.textContent = token.secret;
        secretOverlay.style.display = 'flex';
      }
      showToast('Token created', 'ok');
    } catch (e) {
      showToast('Failed to create token: ' + (e.message || 'Unknown error'), 'err');
    }
  }

  async function revokeToken(id) {
    if (!confirm('Revoke this token? This cannot be undone.')) return;
    try {
      await API.settings.revokeToken(id);
      state.tokens = await API.settings.tokens();
      renderActiveTab();
      showToast('Token revoked', 'ok');
    } catch (e) {
      showToast('Failed to revoke: ' + (e.message || 'Unknown error'), 'err');
    }
  }

  async function doMaintenance(action, successMsg) {
    try {
      await API.settings[action]();
      showToast(successMsg, 'ok');
    } catch (e) {
      showToast('Failed: ' + (e.message || 'Unknown error'), 'err');
    }
  }

  window.initSettings = async function () {
    var container = $('settingsContent');
    if (container) {
      container.addEventListener('click', function (e) {
        var el = e.target.closest('[data-action]');
        if (el) {
          e.preventDefault();
          handleClick(el.getAttribute('data-action'), el);
        }
      });
      container.addEventListener('change', function (e) {
        handleChange(e.target);
      });
    }
    await loadInitial();
  };
})();
