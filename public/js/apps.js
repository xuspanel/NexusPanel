/* One-Click App Installer screen */
(function () {
  var pollTimer = null;
  var pollAppId = null;
  var catalog = [];
  var currentInstalls = [];

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return '&#' + c.charCodeAt(0) + ';';
    });
  }

  function toast(msg, isError) {
    var el = document.getElementById('fmToast');
    var icon = document.getElementById('fmToastIcon');
    var text = document.getElementById('fmToastMsg');
    if (!el) { alert(msg); return; }
    text.textContent = msg;
    icon.textContent = isError ? '⚠️' : '✅';
    el.className = 'fm-toast fm-toast-' + (isError ? 'error' : 'success') + ' fm-toast-show';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () {
      el.className = 'fm-toast fm-toast-' + (isError ? 'error' : 'success');
    }, 3000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    pollAppId = null;
  }

  function openModal(id) { document.getElementById(id).style.display = 'flex'; }
  function closeModal(id) { document.getElementById(id).style.display = 'none'; }

  function statusPill(status) {
    var labels = {
      running: 'Running',
      installing: 'Installing…',
      pending: 'Queued',
      failed: 'Failed',
      removed: 'Removed',
    };
    return '<span class="apps-status-pill apps-status-' + esc(status) + '">' + esc(labels[status] || status) + '</span>';
  }

  function appMeta(type) {
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i].app_type === type) return catalog[i];
    }
    return { name: type, icon: '📦', runtime: '', db: '', desc: '' };
  }

  function renderCatalogGrid() {
    var grid = document.getElementById('appCatalogGrid');
    if (!grid) return;
    if (!catalog.length) {
      grid.innerHTML = '<div class="db-error"><span class="db-error-icon">⚠️</span><span>Catalog unavailable</span></div>';
      return;
    }
    grid.innerHTML = catalog.map(function (app) {
      return '<div class="app-card" data-app-type="' + esc(app.app_type) + '" role="button" tabindex="0">' +
        '<div class="app-card-head">' +
        '<span class="app-card-icon">' + esc(app.icon) + '</span>' +
        '<div class="app-card-title">' + esc(app.name) + '</div>' +
        '</div>' +
        '<p class="app-card-desc">' + esc(app.desc) + '</p>' +
        '<div class="app-card-badges">' +
        '<span class="app-badge">' + esc(app.runtime) + '</span>' +
        '<span class="app-badge">' + esc(app.db) + '</span>' +
        '</div>' +
        '<button class="db-btn db-btn-primary app-card-btn" data-app-install="' + esc(app.app_type) + '">Install</button>' +
        '</div>';
    }).join('');
  }

  function renderInstalledTable() {
    var tbody = document.getElementById('appsTableBody');
    if (!tbody) return;
    if (!currentInstalls.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="apps-empty-row">No applications installed yet. Pick one from the catalog above.</td></tr>';
      return;
    }
    tbody.innerHTML = currentInstalls.map(function (a) {
      var meta = appMeta(a.app_type);
      var actions =
        '<button class="fm-btn fm-btn-secondary fm-btn-sm apps-act-open" data-id="' + esc(a.id) + '">Open</button> ' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm apps-act-logs" data-id="' + esc(a.id) + '">Logs</button> ' +
        '<button class="fm-btn fm-btn-danger fm-btn-sm apps-act-uninstall" data-id="' + esc(a.id) + '"' +
        (a.status === 'installing' || a.status === 'pending' ? ' disabled title="Wait for install to finish"' : '') + '>Uninstall</button>';
      return '<tr>' +
        '<td><span class="app-table-icon">' + esc(meta.icon) + '</span> ' + esc(meta.name) + '</td>' +
        '<td>' + esc(a.domain) + '</td>' +
        '<td>' + esc(a.user_id) + '</td>' +
        '<td class="apps-path-cell" title="' + esc(a.install_path) + '">' + esc(a.install_path) + '</td>' +
        '<td>' + statusPill(a.status) + (a.error ? '<div class="apps-error-hint" title="' + esc(a.error) + '">' + esc(a.error.slice(0, 60)) + '</div>' : '') + '</td>' +
        '<td>' + esc((a.created_at || '').slice(0, 16).replace('T', ' ')) + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  async function loadAll() {
    try {
      var cat = await API.request('GET', '/apps/catalog');
      catalog = cat.apps || [];
      var list = await API.request('GET', '/apps/list');
      currentInstalls = list.apps || [];
      document.getElementById('appsLoading').style.display = 'none';
      document.getElementById('appsError').style.display = 'none';
      document.getElementById('appsContent').style.display = 'block';
      renderCatalogGrid();
      renderInstalledTable();
    } catch (e) {
      document.getElementById('appsLoading').style.display = 'none';
      document.getElementById('appsContent').style.display = 'none';
      document.getElementById('appsError').style.display = 'block';
      document.getElementById('appsErrorText').textContent = e.message;
    }
  }

  /* ── Install modal ── */

  async function openInstallModal(appType) {
    var meta = appMeta(appType);
    var users = [];
    var targets = [];
    try {
      var uRes = await API.request('GET', '/apps/system-users');
      users = uRes.users || [];
      var tRes = await API.request('GET', '/apps/targets');
      targets = tRes.domains || [];
    } catch (e) {
      toast(e.message, true);
      return;
    }

    var body = document.getElementById('appsInstallBody');
    body.innerHTML =
      '<div class="apps-install-appinfo"><span>' + esc(meta.icon) + '</span> <b>' + esc(meta.name) + '</b> <span class="app-badge">' + esc(meta.runtime) + '</span>' +
      (meta.needsDb ? ' <span class="app-badge">Database: ' + esc(meta.db) + '</span>' : '') + '</div>' +
      '<div class="form-group" style="margin-top:16px;">' +
      '<label class="form-label">System User (app owner) *</label>' +
      '<select class="form-input" id="appsFUser">' +
      (users.length ? users.map(function (u) { return '<option value="' + esc(u.username) + '">' + esc(u.username) + ' (' + esc(u.home) + ')</option>'; }).join('') : '<option value="">No system users found</option>') +
      '</select>' +
      '</div>' +
      '<div class="form-group">' +
      '<label class="form-label">Domain (no existing install) *</label>' +
      '<select class="form-input" id="appsFDomain">' +
      (targets.length ? targets.map(function (d) { return '<option value="' + esc(d.domain) + '">' + esc(d.domain) + ' — ' + esc(d.url) + '</option>'; }).join('') : '<option value="">No domains available</option>') +
      '</select>' +
      '</div>' +
      '<div class="form-group">' +
      '<label class="form-label">Site / App Title</label>' +
      '<input type="text" class="form-input" id="appsFTitle" value="' + esc((meta.name || '').split(' ')[0]) + ' Site" placeholder="My Awesome Site">' +
      '</div>' +
      (appType === 'wordpress' ? '<div class="form-group">' +
        '<label class="form-label">Admin Email *</label>' +
        '<input type="email" class="form-input" id="appsFEmail" placeholder="you@example.com">' +
        '</div>' : '') +
      '<p class="apps-form-note">All installation steps run as <code>sudo -u &lt;system_user&gt;</code>. Files are placed in <code>/home/&lt;user&gt;/domains/&lt;domain&gt;/public_html</code>.</p>';

    document.getElementById('appsInstallIcon').textContent = meta.icon;
    document.getElementById('appsInstallTitle').textContent = 'Install ' + meta.name;
    document.getElementById('appsInstallSubmit').dataset.appType = appType;
    openModal('appsInstallModal');
  }

  function submitInstall() {
    var appType = document.getElementById('appsInstallSubmit').dataset.appType;
    var user = document.getElementById('appsFUser').value;
    var domain = document.getElementById('appsFDomain').value;
    var title = document.getElementById('appsFTitle').value.trim();
    var email = document.getElementById('appsFEmail') ? document.getElementById('appsFEmail').value.trim() : '';

    if (!user) return toast('Select a system user', true);
    if (!domain) return toast('Select a domain to install on', true);
    if (appType === 'wordpress' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('A valid admin email is required for WordPress', true);

    closeModal('appsInstallModal');
    document.getElementById('appsProgressStatus').textContent = 'Starting…';
    document.getElementById('appsProgressFill').style.width = '8%';
    document.getElementById('appsProgressLog').textContent = 'Starting installation…';
    openModal('appsProgressModal');

    API.request('POST', '/apps/install', { app_type: appType, system_user: user, domain: domain, title: title, admin_email: email })
      .then(function (res) {
        startPolling(res.id);
      })
      .catch(function (e) {
        stopPolling();
        closeModal('appsProgressModal');
        toast(e.message, true);
      });
  }

  function startPolling(id) {
    stopPolling();
    pollAppId = id;
    document.getElementById('appsProgressStatus').textContent = 'Installing…';
    pollTick();
    pollTimer = setInterval(pollTick, 2000);
  }

  async function pollTick() {
    if (!pollAppId) return;
    try {
      var [logRes, appRes] = await Promise.all([
        API.request('GET', '/apps/' + pollAppId + '/log?lines=50'),
        API.request('GET', '/apps/' + pollAppId),
      ]);
      var lines = logRes.lines || [];
      var box = document.getElementById('appsProgressLog');
      box.textContent = lines.length ? lines.join('\n') : 'Working…';
      box.scrollTop = box.scrollHeight;

      var status = appRes.app.status;
      document.getElementById('appsProgressStatus').textContent = status === 'installing' || status === 'pending' ? 'Installing…' : status;
      document.getElementById('appsProgressFill').style.width = status === 'installing' || status === 'pending' ? '55%' : '100%';

      if (status === 'running') {
        stopPolling();
        closeModal('appsProgressModal');
        showSuccess(appRes.app);
        loadAll();
      } else if (status === 'failed') {
        stopPolling();
        closeModal('appsProgressModal');
        toast('Install failed: ' + (appRes.app.error || 'unknown error'), true);
        loadAll();
      }
    } catch (e) {
      stopPolling();
      closeModal('appsProgressModal');
      toast(e.message, true);
      loadAll();
    }
  }

  function showSuccess(app) {
    var copyBtn = function (label, value) {
      return '<button type="button" class="fm-btn fm-btn-secondary fm-btn-sm apps-copy-btn" data-copy="' + esc(value) + '">Copy</button>';
    };
    var body = document.getElementById('appsSuccessBody');
    body.innerHTML =
      '<div class="apps-success-head">' + esc(appMeta(app.app_type).icon) + ' ' + esc(appMeta(app.app_type).name) + ' is live!</div>' +
      '<div class="apps-cred-row"><span class="apps-cred-label">URL</span><span class="apps-cred-val">' + esc(app.url) + '</span>' + copyBtn('url', app.url) + '</div>' +
      (app.login_url ? '<div class="apps-cred-row"><span class="apps-cred-label">Login URL</span><span class="apps-cred-val">' + esc(app.login_url) + '</span>' + copyBtn('login', app.login_url) + '</div>' : '') +
      '<div class="apps-cred-row"><span class="apps-cred-label">Username</span><span class="apps-cred-val">' + esc(app.admin_username || 'admin') + '</span>' + copyBtn('user', app.admin_username || 'admin') + '</div>' +
      '<div class="apps-cred-row"><span class="apps-cred-label">Password</span><span class="apps-cred-val apps-cred-secret">' + esc(app.admin_password || '') + '</span>' + copyBtn('pass', app.admin_password || '') + '</div>' +
      (app.db_name ? '<div class="apps-cred-row"><span class="apps-cred-label">Database</span><span class="apps-cred-val">' + esc(app.db_name) + ' / ' + esc(app.db_user) + '</span>' + copyBtn('db', app.db_user) + '</div>' : '');
    openModal('appsSuccessModal');
  }

  function copyText(value) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () { toast('Copied to clipboard'); }).catch(fallback);
    } else {
      fallback();
      toast('Copied to clipboard');
    }
  }

  /* ── Logs drawer ── */

  async function openLogs(id) {
    var rec = currentInstalls.find(function (a) { return a.id === id; });
    document.getElementById('appsLogsDomain').textContent = rec ? rec.domain : '';
    document.getElementById('appsLogsBody').textContent = 'Loading logs…';
    document.getElementById('appsLogsDrawer').style.display = 'flex';
    document.getElementById('appsLogsDrawer').dataset.appId = id;
    await refreshLogs();
  }

  async function refreshLogs() {
    var id = document.getElementById('appsLogsDrawer').dataset.appId;
    if (!id) return;
    try {
      var res = await API.request('GET', '/apps/' + id + '/log?lines=50');
      var box = document.getElementById('appsLogsBody');
      box.textContent = (res.lines || []).join('\n') || 'No log output yet.';
      box.scrollTop = box.scrollHeight;
    } catch (e) {
      document.getElementById('appsLogsBody').textContent = 'Failed to load logs: ' + e.message;
    }
  }

  /* ── Uninstall ── */

  function openUninstall(id) {
    var rec = currentInstalls.find(function (a) { return a.id === id; });
    if (!rec) return;
    document.getElementById('appsUninstallBody').innerHTML =
      '<p>Uninstall <b>' + esc(appMeta(rec.app_type).name) + '</b> from <b>' + esc(rec.domain) + '</b>?</p>' +
      '<p class="apps-form-note">This will remove the install directory, stop any PM2 process, drop the database, and revert the domain nginx config.</p>';
    document.getElementById('appsUninstallConfirm').dataset.id = id;
    openModal('appsUninstallModal');
  }

  function confirmUninstall() {
    var id = document.getElementById('appsUninstallConfirm').dataset.id;
    closeModal('appsUninstallModal');
    API.request('POST', '/apps/' + id + '/uninstall')
      .then(function () {
        toast('Uninstall started');
        setTimeout(loadAll, 800);
      })
      .catch(function (e) { toast(e.message, true); });
  }

  /* ── Events ── */

  function wireEvents() {
    var tabBar = document.querySelector('.apps-tabs');
    if (tabBar) {
      tabBar.addEventListener('click', function (e) {
        var tab = e.target.closest('.apps-tab');
        if (!tab) return;
        var target = tab.getAttribute('data-tab');
        var tabs = document.querySelectorAll('.apps-tab');
        tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
        document.getElementById('tabQuickApps').style.display = target === 'quick-apps' ? '' : 'none';
        document.getElementById('tabGitDeploy').style.display = target === 'git-deploy' ? '' : 'none';

        if (target === 'quick-apps') {
          if (catalog.length === 0) loadAll();
          else { renderCatalogGrid(); renderInstalledTable(); }
        } else if (target === 'git-deploy') {
          stopPolling();
          if (window.initDeploy) window.initDeploy();
        }
      });
    }
    var grid = document.getElementById('appCatalogGrid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-app-install]');
        if (btn) { openInstallModal(btn.getAttribute('data-app-install')); return; }
        var card = e.target.closest('.app-card');
        if (card && card.dataset.appType) openInstallModal(card.dataset.appType);
      });
      grid.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.classList.contains('app-card')) {
          openInstallModal(e.target.dataset.appType);
        }
      });
    }

    var tbody = document.getElementById('appsTableBody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var openBtn = e.target.closest('.apps-act-open');
        if (openBtn) {
          var rec = currentInstalls.find(function (a) { return a.id === openBtn.getAttribute('data-id'); });
          if (rec && rec.url) window.open(rec.url, '_blank');
          return;
        }
        var logsBtn = e.target.closest('.apps-act-logs');
        if (logsBtn) { openLogs(logsBtn.getAttribute('data-id')); return; }
        var unBtn = e.target.closest('.apps-act-uninstall');
        if (unBtn) openUninstall(unBtn.getAttribute('data-id'));
      });
    }

    document.getElementById('appsRefreshBtn').addEventListener('click', loadAll);
    document.getElementById('appsRetryBtn').addEventListener('click', loadAll);
    document.getElementById('appsInstallClose').addEventListener('click', function () { closeModal('appsInstallModal'); });
    document.getElementById('appsInstallCancel').addEventListener('click', function () { closeModal('appsInstallModal'); });
    document.getElementById('appsInstallSubmit').addEventListener('click', submitInstall);
    document.getElementById('appsProgressClose').addEventListener('click', function () { stopPolling(); closeModal('appsProgressModal'); });
    document.getElementById('appsSuccessClose').addEventListener('click', function () { closeModal('appsSuccessModal'); });
    document.getElementById('appsSuccessDone').addEventListener('click', function () { closeModal('appsSuccessModal'); });
    document.getElementById('appsLogsClose').addEventListener('click', function () { document.getElementById('appsLogsDrawer').style.display = 'none'; });
    document.getElementById('appsLogsRefresh').addEventListener('click', refreshLogs);
    document.getElementById('appsUninstallClose').addEventListener('click', function () { closeModal('appsUninstallModal'); });
    document.getElementById('appsUninstallCancel').addEventListener('click', function () { closeModal('appsUninstallModal'); });
    document.getElementById('appsUninstallConfirm').addEventListener('click', confirmUninstall);

    document.getElementById('appsSuccessBody').addEventListener('click', function (e) {
      var btn = e.target.closest('.apps-copy-btn');
      if (btn) copyText(btn.getAttribute('data-copy'));
    });
  }

  window.initApps = function () {
    stopPolling();
    if (!document.getElementById('appsContent').dataset.wired) {
      wireEvents();
      document.getElementById('appsContent').dataset.wired = '1';
    }
    loadAll();
  };
})();
