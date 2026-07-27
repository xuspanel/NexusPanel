(function () {
  var state = { pools: [], status: null, version: null, opcache: null, modules: [], tab: 'pools', loading: false, error: null, _toastTimer: null };

  function esc(s) { if (!s) return ''; return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

  function showLoading() {
    var el = document.getElementById('fpmContent');
    if (el) el.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div><div class="db-loading-text">Loading PHP-FPM data...</div></div>';
  }

  function showError(msg) {
    var el = document.getElementById('fpmContent');
    if (el) el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(msg) + '</span></div>';
  }

  function showToast(msg, type) {
    var el = document.getElementById('fpmToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'fpm-toast ' + (type || 'info');
    el.style.display = 'block';
    if (state._toastTimer) clearTimeout(state._toastTimer);
    state._toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function showConfirm(msg, onConfirm) {
    var overlay = document.getElementById('fpmConfirmOverlay');
    var msgEl = document.getElementById('fpmConfirmMsg');
    if (!overlay || !msgEl) { onConfirm(); return; }
    msgEl.textContent = msg;
    overlay.style.display = 'flex';
    var yesBtn = document.getElementById('fpmConfirmYes');
    var noBtn = document.getElementById('fpmConfirmNo');
    function close() { overlay.style.display = 'none'; yesBtn.onclick = null; noBtn.onclick = null; }
    yesBtn.onclick = function () { close(); onConfirm(); };
    noBtn.onclick = close;
  }

  function renderSummary() {
    var html = '<div class="fpm-summary">';
    var ver = state.version;
    html += '<div class="fpm-stat-badge"><span class="fpm-stat-value">' + (ver ? esc(ver.version) : '?') + '</span><span class="fpm-stat-label">PHP Version</span></div>';
    var st = state.status;
    var isActive = st && st.active;
    html += '<div class="fpm-stat-badge"><div class="fpm-dot ' + (isActive ? 'active' : 'inactive') + '"></div><span class="fpm-stat-label">' + (isActive ? 'Running' : 'Stopped') + '</span></div>';
    var totalPools = state.pools.length;
    var totalMax = 0;
    for (var i = 0; i < state.pools.length; i++) totalMax += state.pools[i].maxChildren || 0;
    html += '<div class="fpm-stat-badge"><span class="fpm-stat-value">' + totalPools + '</span><span class="fpm-stat-label">Pools</span></div>';
    html += '<div class="fpm-stat-badge"><span class="fpm-stat-value">' + totalMax + '</span><span class="fpm-stat-label">Max Workers</span></div>';
    if (st && st.processesActive !== undefined) {
      html += '<div class="fpm-stat-badge"><span class="fpm-stat-value">' + st.processesActive + '/' + (st.processesActive + st.processesIdle) + '</span><span class="fpm-stat-label">Active/Total</span></div>';
      html += '<div class="fpm-stat-badge"><span class="fpm-stat-value">' + (st.requests || 0) + '</span><span class="fpm-stat-label">Requests</span></div>';
    }
    html += '</div>';
    return html;
  }

  function renderTabs() {
    var tabs = [['pools', 'Pools'], ['status', 'Status'], ['opcache', 'OPcache'], ['modules', 'Modules'], ['logs', 'Logs']];
    var html = '<div class="fpm-tabs">';
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var active = state.tab === t[0] ? ' active' : '';
      html += '<button class="fpm-tab' + active + '" data-fpm-action="tab" data-fpm-tab="' + t[0] + '">' + t[1] + '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderPools() {
    var pools = state.pools;
    if (pools.length === 0) return '<div class="db-empty">No PHP-FPM pools found</div>';
    var html = '<div class="fpm-pool-list">';
    for (var i = 0; i < pools.length; i++) {
      var p = pools[i];
      var pmBadge = p.pm === 'dynamic' ? 'fpm-pm-dynamic' : p.pm === 'static' ? 'fpm-pm-static' : 'fpm-pm-ondemand';
      html += '<div class="fpm-card">';
      html += '<div class="fpm-card-header">';
      html += '<div class="fpm-card-left">';
      html += '<span class="fpm-pool-name">' + esc(p.name) + '</span>';
      html += '<span class="fpm-badge ' + pmBadge + '">' + esc(p.pm) + '</span>';
      html += '</div>';
      html += '<div class="fpm-card-actions">';
      html += '<button class="fm-btn fm-btn-sm" data-fpm-action="config" data-fpm-pool="' + esc(p.name) + '">Config</button>';
      html += '<button class="fm-btn fm-btn-sm" data-fpm-action="logs" data-fpm-pool="' + esc(p.name) + '">Logs</button>';
      html += '<button class="fm-btn fm-btn-sm fm-btn-primary" data-fpm-action="edit" data-fpm-pool="' + esc(p.name) + '">Edit</button>';
      html += '</div></div>';
      html += '<div class="fpm-card-grid">';
      html += '<div class="fpm-card-field"><span class="fpm-field-label">Max Children</span><span class="fpm-field-value">' + p.maxChildren + '</span></div>';
      html += '<div class="fpm-card-field"><span class="fpm-field-label">Start Servers</span><span class="fpm-field-value">' + p.startServers + '</span></div>';
      html += '<div class="fpm-card-field"><span class="fpm-field-label">Min Spare</span><span class="fpm-field-value">' + p.minSpareServers + '</span></div>';
      html += '<div class="fpm-card-field"><span class="fpm-field-label">Max Spare</span><span class="fpm-field-value">' + p.maxSpareServers + '</span></div>';
      html += '<div class="fpm-card-field"><span class="fpm-field-label">User</span><span class="fpm-field-value">' + esc(p.user || '—') + '</span></div>';
      html += '<div class="fpm-card-field"><span class="fpm-field-label">Group</span><span class="fpm-field-value">' + esc(p.group || '—') + '</span></div>';
      html += '<div class="fpm-card-field fpm-card-field-wide"><span class="fpm-field-label">Listen</span><span class="fpm-field-value fpm-mono">' + esc(p.listen || '—') + '</span></div>';
      if (p.slowlog) html += '<div class="fpm-card-field fpm-card-field-wide"><span class="fpm-field-label">Slowlog</span><span class="fpm-field-value fpm-mono">' + esc(p.slowlog) + '</span></div>';
      if (p.requestTerminateTimeout) html += '<div class="fpm-card-field"><span class="fpm-field-label">Request Timeout</span><span class="fpm-field-value">' + esc(p.requestTerminateTimeout) + '</span></div>';
      if (p.requestSlowlogTimeout) html += '<div class="fpm-card-field"><span class="fpm-field-label">Slowlog Timeout</span><span class="fpm-field-value">' + esc(p.requestSlowlogTimeout) + '</span></div>';
      html += '</div></div>';
    }
    html += '</div>';
    return html;
  }

  function renderStatus() {
    var st = state.status;
    if (!st) return '<div class="db-empty">Status data unavailable</div>';
    var html = '<div class="fpm-status-grid">';
    html += '<div class="fpm-status-block"><div class="fpm-status-label">State</div><div class="fpm-status-value"><div class="fpm-dot ' + (st.active ? 'active' : 'inactive') + '"></div> ' + esc(st.sub || (st.active ? 'running' : 'stopped')) + '</div></div>';
    html += '<div class="fpm-status-block"><div class="fpm-status-label">Master PID</div><div class="fpm-status-value">' + (st.pid || '—') + '</div></div>';
    html += '<div class="fpm-status-block"><div class="fpm-status-label">Memory</div><div class="fpm-status-value">' + esc(st.mem || '—') + '</div></div>';
    html += '<div class="fpm-status-block"><div class="fpm-status-label">Uptime</div><div class="fpm-status-value">' + esc(st.uptime || '—') + '</div></div>';
    html += '<div class="fpm-status-block"><div class="fpm-status-label">Active Processes</div><div class="fpm-status-value">' + (st.processesActive || 0) + '</div></div>';
    html += '<div class="fpm-status-block"><div class="fpm-status-label">Idle Processes</div><div class="fpm-status-value">' + (st.processesIdle || 0) + '</div></div>';
    html += '<div class="fpm-status-block"><div class="fpm-status-label">Total Requests</div><div class="fpm-status-value">' + (st.requests || 0) + '</div></div>';
    html += '<div class="fpm-status-block"><div class="fpm-status-label">Slow Requests</div><div class="fpm-status-value">' + (st.slowRequests || 0) + '</div></div>';
    html += '<div class="fpm-status-block"><div class="fpm-status-label">Traffic</div><div class="fpm-status-value">' + esc(st.traffic || '0') + ' req/sec</div></div>';
    html += '</div>';
    return html;
  }

  function renderOpcache() {
    var oc = state.opcache;
    if (!oc) return '<div class="db-empty">OPcache data unavailable</div>';
    var mem = oc.memory_usage || {};
    var stats = oc.opcache_statistics || {};
    var totalMem = (mem.used_memory || 0) + (mem.free_memory || 0);
    var usedPct = totalMem > 0 ? ((mem.used_memory || 0) / totalMem * 100).toFixed(1) : 0;
    var hits = stats.hits || 0;
    var misses = stats.misses || 0;
    var total = hits + misses;
    var hitRate = total > 0 ? (hits / total * 100).toFixed(1) : 0;
    var html = '<div class="fpm-opcache">';
    html += '<div class="fpm-opcache-section">';
    html += '<div class="fpm-opcache-title">Memory Usage</div>';
    html += '<div class="fpm-bar"><div class="fpm-bar-fill" style="width:' + usedPct + '%"></div></div>';
    html += '<div class="fpm-bar-label">' + usedPct + '% used (' + formatBytes(mem.used_memory || 0) + ' / ' + formatBytes(totalMem) + ')</div>';
    html += '</div>';
    html += '<div class="fpm-opcache-section">';
    html += '<div class="fpm-opcache-title">Hit Rate</div>';
    html += '<div class="fpm-bar"><div class="fpm-bar-fill fpm-bar-hit" style="width:' + hitRate + '%"></div></div>';
    html += '<div class="fpm-bar-label">' + hitRate + '% (' + hits + ' hits, ' + misses + ' misses)</div>';
    html += '</div>';
    html += '<div class="fpm-opcache-grid">';
    html += '<div class="fpm-opcache-stat"><span class="fpm-oc-label">Cached Scripts</span><span class="fpm-oc-value">' + (stats.num_cached_scripts || 0) + '</span></div>';
    html += '<div class="fpm-opcache-stat"><span class="fpm-oc-label">Max Cached Keys</span><span class="fpm-oc-value">' + (stats.max_cached_keys || 0) + '</span></div>';
    html += '<div class="fpm-opcache-stat"><span class="fpm-oc-label">OOM Restarts</span><span class="fpm-oc-value">' + (stats.oom_restarts || 0) + '</span></div>';
    html += '<div class="fpm-opcache-stat"><span class="fpm-oc-label">Manual Restarts</span><span class="fpm-oc-value">' + (stats.manual_restarts || 0) + '</span></div>';
    var iss = oc.interned_strings_usage || {};
    html += '<div class="fpm-opcache-stat"><span class="fpm-oc-label">Interned Strings</span><span class="fpm-oc-value">' + formatBytes(iss.used_memory || 0) + ' / ' + formatBytes(iss.buffer_size || 0) + '</span></div>';
    html += '<div class="fpm-opcache-stat"><span class="fpm-oc-label">Number of Strings</span><span class="fpm-oc-value">' + (iss.number_of_strings || 0) + '</span></div>';
    html += '</div></div>';
    return html;
  }

  function renderModules() {
    var mods = state.modules;
    if (!mods || mods.length === 0) return '<div class="db-empty">Module data unavailable</div>';
    var html = '<div class="fpm-modules-grid">';
    for (var i = 0; i < mods.length; i++) {
      html += '<div class="fpm-module-chip">' + esc(mods[i]) + '</div>';
    }
    html += '</div>';
    html += '<div class="fpm-modules-count">' + mods.length + ' modules</div>';
    return html;
  }

  function renderLogsTab() {
    return '<div class="fpm-logs-section">'
      + '<div class="fpm-logs-header"><span class="fpm-logs-title">Select a pool from the Pools tab to view logs</span></div>'
      + '<div id="fpmLogContent" class="fpm-log-box"></div>'
      + '</div>';
  }

  function renderAll() {
    var el = document.getElementById('fpmContent');
    if (!el) return;
    var html = renderSummary();
    html += renderTabs();
    html += '<div id="fpmTabContent">';
    if (state.tab === 'pools') html += renderPools();
    else if (state.tab === 'status') html += renderStatus();
    else if (state.tab === 'opcache') html += renderOpcache();
    else if (state.tab === 'modules') html += renderModules();
    else if (state.tab === 'logs') html += renderLogsTab();
    html += '</div>';
    html += '<div id="fpmToast" class="fpm-toast" style="display:none;"></div>';
    el.innerHTML = html;
  }

  function formatBytes(n) {
    if (!n || n <= 0) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  window.initPhpFPM = async function () {
    var me = await API.me();
    if (me.role !== 'admin') return;
    bindEvents();
    loadData();
  };

  function bindEvents() {
    var content = document.getElementById('fpmContent');
    if (content && !content._fpmBound) {
      content._fpmBound = true;
      content.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-fpm-action]');
        if (!btn) return;
        var action = btn.dataset.fpmAction;
        if (action === 'tab') { state.tab = btn.dataset.fpmTab; renderAll(); }
        else if (action === 'config') fpmPoolConfig(btn.dataset.fpmPool);
        else if (action === 'logs') fpmPoolLogs(btn.dataset.fpmPool);
        else if (action === 'edit') fpmEditPool(btn.dataset.fpmPool);
      });
    }
    var restartBtn = document.getElementById('fpmRestartBtn');
    if (restartBtn && !restartBtn._fpmBound) {
      restartBtn._fpmBound = true;
      restartBtn.addEventListener('click', function () {
        showConfirm('Restart PHP-FPM? This will briefly interrupt all PHP processes.', async function () {
          try {
            showToast('Restarting PHP-FPM...', 'info');
            var r = await API.phpfpm.restart();
            if (r.success) { showToast('PHP-FPM restarted', 'success'); loadData(); }
            else showToast('Restart failed: ' + (r.error || r.output || ''), 'error');
          } catch (e) { showToast('Error: ' + e.message, 'error'); }
        });
      });
    }
    var reloadBtn = document.getElementById('fpmReloadBtn');
    if (reloadBtn && !reloadBtn._fpmBound) {
      reloadBtn._fpmBound = true;
      reloadBtn.addEventListener('click', function () {
        showConfirm('Gracefully reload PHP-FPM? No downtime.', async function () {
          try {
            var r = await API.phpfpm.reload();
            if (r.success) showToast('PHP-FPM reloaded', 'success');
            else showToast('Reload failed: ' + (r.error || r.output || ''), 'error');
          } catch (e) { showToast('Error: ' + e.message, 'error'); }
        });
      });
    }
    var testBtn = document.getElementById('fpmTestBtn');
    if (testBtn && !testBtn._fpmBound) {
      testBtn._fpmBound = true;
      testBtn.addEventListener('click', async function () {
        try {
          var r = await API.phpfpm.configTest();
          if (r.success) showToast('Config test passed', 'success');
          else showToast('Config test failed: ' + (r.output || ''), 'error');
        } catch (e) { showToast('Error: ' + e.message, 'error'); }
      });
    }
    var refreshBtn = document.getElementById('fpmRefreshBtn');
    if (refreshBtn && !refreshBtn._fpmBound) {
      refreshBtn._fpmBound = true;
      refreshBtn.addEventListener('click', loadData);
    }
    var editOverlay = document.getElementById('fpmEditOverlay');
    if (editOverlay && !editOverlay._fpmBound) {
      editOverlay._fpmBound = true;
      editOverlay.addEventListener('click', function (e) { if (e.target === this) this.style.display = 'none'; });
    }
    var editClose = document.getElementById('fpmEditClose');
    if (editClose) editClose.addEventListener('click', function () { document.getElementById('fpmEditOverlay').style.display = 'none'; });
    var editSave = document.getElementById('fpmEditSave');
    if (editSave) editSave.addEventListener('click', fpmSaveEdit);
    var editCancel = document.getElementById('fpmEditCancel');
    if (editCancel) editCancel.addEventListener('click', function () { document.getElementById('fpmEditOverlay').style.display = 'none'; });
    var configOverlay = document.getElementById('fpmConfigOverlay');
    if (configOverlay && !configOverlay._fpmBound) {
      configOverlay._fpmBound = true;
      configOverlay.addEventListener('click', function (e) { if (e.target === this) this.style.display = 'none'; });
    }
    var configClose = document.getElementById('fpmConfigClose');
    if (configClose) configClose.addEventListener('click', function () { document.getElementById('fpmConfigOverlay').style.display = 'none'; });
  }

  async function loadData() {
    state.loading = true;
    showLoading();
    try {
      var results = await Promise.all([API.phpfpm.list(), API.phpfpm.status(), API.phpfpm.version(), API.phpfpm.opcache(), API.phpfpm.modules()]);
      state.pools = results[0] || [];
      state.status = results[1] || null;
      state.version = results[2] || null;
      state.opcache = results[3] || null;
      state.modules = results[4] || [];
      state.loading = false;
      renderAll();
    } catch (e) {
      state.loading = false;
      showError('Failed to load PHP-FPM data: ' + e.message);
    }
  }

  async function fpmPoolConfig(poolName) {
    var el = document.getElementById('fpmConfigContent');
    var overlay = document.getElementById('fpmConfigOverlay');
    if (!el || !overlay) return;
    el.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div></div>';
    document.getElementById('fpmConfigTitle').textContent = 'Config: ' + poolName;
    overlay.style.display = 'flex';
    try {
      var r = await API.phpfpm.pool(poolName);
      el.innerHTML = '<pre class="fpm-config-raw">' + esc(r.raw || '') + '</pre>';
    } catch (e) {
      el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(e.message) + '</span></div>';
    }
  }

  async function fpmPoolLogs(poolName) {
    state.tab = 'logs';
    renderAll();
    var el = document.getElementById('fpmLogContent');
    if (!el) return;
    el.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div></div>';
    try {
      var r = await API.phpfpm.poolLogs(poolName, 100);
      var html = '<div class="fpm-log-title">Error Log: ' + esc(r.file || 'not found') + '</div>';
      if (r.lines && r.lines.length > 0) {
        html += '<pre class="fpm-log-pre">';
        for (var i = 0; i < r.lines.length; i++) html += esc(r.lines[i]) + '\n';
        html += '</pre>';
      } else {
        html += '<div class="db-empty">No log entries found</div>';
      }
      try {
        var sr = await API.phpfpm.slowLogs(poolName, 20);
        if (sr.lines && sr.lines.length > 0) {
          html += '<div class="fpm-log-title fpm-log-title-margin">Slow Log: ' + esc(sr.file || 'not found') + '</div>';
          html += '<pre class="fpm-log-pre fpm-log-slow">';
          for (var j = 0; j < sr.lines.length; j++) html += esc(sr.lines[j]) + '\n';
          html += '</pre>';
        }
      } catch (_) {}
      el.innerHTML = html;
    } catch (e) {
      el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(e.message) + '</span></div>';
    }
  }

  var _editingPool = null;
  function fpmEditPool(poolName) {
    _editingPool = poolName;
    var pool = null;
    for (var i = 0; i < state.pools.length; i++) {
      if (state.pools[i].name === poolName) { pool = state.pools[i]; break; }
    }
    if (!pool) return;
    document.getElementById('fpmEditPoolName').textContent = poolName;
    var sel = document.getElementById('fpmEditDirective');
    var directives = ['pm', 'pm.max_children', 'pm.start_servers', 'pm.min_spare_servers', 'pm.max_spare_servers', 'pm.max_requests', 'pm.process_idle_timeout', 'request_terminate_timeout', 'request_slowlog_timeout', 'rlimit_files', 'catch_workers_output'];
    sel.innerHTML = '';
    for (var j = 0; j < directives.length; j++) {
      var opt = document.createElement('option');
      opt.value = directives[j];
      opt.textContent = directives[j];
      sel.appendChild(opt);
    }
    var valEl = document.getElementById('fpmEditValue');
    valEl.value = pool.maxChildren || '';
    document.getElementById('fpmEditError').style.display = 'none';
    document.getElementById('fpmEditOverlay').style.display = 'flex';
  }

  async function fpmSaveEdit() {
    if (!_editingPool) return;
    var directive = document.getElementById('fpmEditDirective').value;
    var value = document.getElementById('fpmEditValue').value.trim();
    var errEl = document.getElementById('fpmEditError');
    if (!value) { errEl.textContent = 'Value required'; errEl.style.display = 'block'; return; }
    var btn = document.getElementById('fpmEditSave');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      var r = await API.phpfpm.editPool(_editingPool, directive, value);
      if (r.success) {
        showToast('Updated ' + directive + ' = ' + value, 'success');
        document.getElementById('fpmEditOverlay').style.display = 'none';
        loadData();
      }
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
    btn.disabled = false;
    btn.textContent = 'Save';
  }
})();
