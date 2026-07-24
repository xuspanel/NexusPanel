(function () {
  var PAGE_SIZE = 50;
  var SEARCH_DEBOUNCE = 300;

  var state = {
    entries: [],
    total: 0,
    page: 0,
    search: '',
    action: '',
    user: '',
    startDate: '',
    endDate: '',
    _debounceTimer: null,
  };

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }

  function showLoading() {
    var el = document.getElementById('auditList');
    if (el) el.innerHTML = '<div class="audit-loading"><div class="audit-loading-row"></div><div class="audit-loading-row short"></div><div class="audit-loading-row"></div><div class="audit-loading-row short"></div><div class="audit-loading-row"></div></div>';
    var pag = document.getElementById('auditPagination');
    if (pag) pag.innerHTML = '';
  }

  function showError(msg) {
    var el = document.getElementById('auditList');
    if (el) el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(msg) + '</span></div>';
  }

  function showToast(msg, type) {
    var el = document.getElementById('auditToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'audit-toast ' + (type || 'info');
    el.style.display = 'block';
    if (state._toastTimer) clearTimeout(state._toastTimer);
    state._toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    var da = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');
    var s = String(d.getSeconds()).padStart(2, '0');
    return mo + '/' + da + ' ' + h + ':' + mi + ':' + s;
  }

  function badgeClass(method) {
    if (method === 'POST') return 'audit-badge-create';
    if (method === 'PUT') return 'audit-badge-update';
    if (method === 'DELETE') return 'audit-badge-delete';
    return 'audit-badge-default';
  }

  function actionIcon(action) {
    if (!action) return '';
    if (action.indexOf(':create') !== -1) return '<span class="audit-icon audit-icon-create">+</span>';
    if (action.indexOf(':update') !== -1) return '<span class="audit-icon audit-icon-update">&#9998;</span>';
    if (action.indexOf(':delete') !== -1) return '<span class="audit-icon audit-icon-delete">&times;</span>';
    return '<span class="audit-icon audit-icon-other">&#8226;</span>';
  }

  async function loadActions() {
    try {
      var actions = await API.audit.actions();
      var sel = document.getElementById('auditActionFilter');
      if (!sel) return;
      sel.innerHTML = '<option value="">All Actions</option>' + actions.map(function (a) {
        return '<option value="' + esc(a) + '">' + esc(a) + '</option>';
      }).join('');
      if (state.action) sel.value = state.action;
    } catch {}
  }

  async function loadUsers() {
    try {
      var users = await API.audit.users();
      var sel = document.getElementById('auditUserFilter');
      if (!sel) return;
      sel.innerHTML = '<option value="">All Users</option>' + users.map(function (u) {
        return '<option value="' + esc(u) + '">' + esc(u) + '</option>';
      }).join('');
      if (state.user) sel.value = state.user;
    } catch {}
  }

  async function loadStats() {
    try {
      var stats = await API.audit.stats();
      var el = document.getElementById('auditStats');
      if (!el) return;
      el.innerHTML = '<span class="audit-stat"><strong>' + stats.total + '</strong> total</span>'
        + '<span class="audit-stat-sep">|</span>'
        + '<span class="audit-stat"><strong>' + Object.keys(stats.users).length + '</strong> users</span>'
        + '<span class="audit-stat-sep">|</span>'
        + '<span class="audit-stat"><strong>' + Object.keys(stats.actions).length + '</strong> action types</span>';
    } catch {}
  }

  async function loadAudit() {
    showLoading();
    try {
      var data = await API.audit.list({
        user: state.user || undefined,
        action: state.action || undefined,
        search: state.search || undefined,
        startDate: state.startDate || undefined,
        endDate: state.endDate || undefined,
        limit: PAGE_SIZE,
        offset: state.page * PAGE_SIZE,
      });
      state.entries = data.entries || [];
      state.total = data.total || 0;
      renderEntries();
      renderPagination();
      loadStats();
    } catch (e) {
      showError(e.message || 'Failed to load audit entries');
    }
  }

  function renderEntries() {
    var el = document.getElementById('auditList');
    if (!el) return;
    if (state.entries.length === 0) {
      el.innerHTML = '<div class="audit-empty">No audit entries found</div>';
      return;
    }
    el.innerHTML = state.entries.map(function (e) {
      var details = '';
      if (e.details) {
        var d = typeof e.details === 'string' ? e.details : JSON.stringify(e.details);
        if (d.length > 120) d = d.substring(0, 120) + '...';
        details = '<span class="audit-details">' + esc(d) + '</span>';
      }
      return '<div class="audit-entry">'
        + actionIcon(e.action)
        + '<span class="audit-badge ' + badgeClass(e.method) + '">' + esc(e.method) + '</span>'
        + '<div class="audit-info">'
        + '<span class="audit-action">' + esc(e.action) + '</span>'
        + '<span class="audit-path">' + esc(e.path) + '</span>'
        + details
        + '</div>'
        + '<div class="audit-meta">'
        + '<span class="audit-user">' + esc(e.user) + '</span>'
        + '<span class="audit-ip">' + esc(e.ip) + '</span>'
        + '<span class="audit-time" title="' + esc(e.timestamp) + '">' + formatTime(e.timestamp) + '</span>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  function renderPagination() {
    var pagEl = document.getElementById('auditPagination');
    if (!pagEl) return;
    var totalPages = Math.ceil(state.total / PAGE_SIZE);
    if (totalPages <= 1) { pagEl.innerHTML = ''; return; }
    pagEl.innerHTML = '<button class="db-btn db-btn-sm" data-audit-action="prev-page" ' + (state.page === 0 ? 'disabled' : '') + '>&#8592; Prev</button>'
      + '<span class="audit-page-info">Page ' + (state.page + 1) + ' of ' + totalPages + ' (' + state.total + ' entries)</span>'
      + '<button class="db-btn db-btn-sm" data-audit-action="next-page" ' + (state.page >= totalPages - 1 ? 'disabled' : '') + '>Next &#8594;</button>';
  }

  function resetAndLoad() {
    state.page = 0;
    loadAudit();
  }

  window.initAudit = async function () {
    try {
      var me = await API.me();
      if (me.role !== 'admin') {
        document.getElementById('auditContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">Admin access required</span></div>';
        return;
      }
      showLoading();
      await Promise.all([loadActions(), loadUsers()]);
      await loadAudit();
    } catch {
      document.getElementById('auditContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">Failed to load audit trail</span></div>';
    }
  };

  document.addEventListener('input', function (e) {
    if (e.target.id === 'auditSearchInput') {
      if (state._debounceTimer) clearTimeout(state._debounceTimer);
      state._debounceTimer = setTimeout(function () {
        state.search = e.target.value;
        resetAndLoad();
      }, SEARCH_DEBOUNCE);
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'auditActionFilter') {
      state.action = e.target.value;
      resetAndLoad();
    }
    if (e.target.id === 'auditUserFilter') {
      state.user = e.target.value;
      resetAndLoad();
    }
    if (e.target.id === 'auditStartDate') {
      state.startDate = e.target.value;
      resetAndLoad();
    }
    if (e.target.id === 'auditEndDate') {
      state.endDate = e.target.value;
      resetAndLoad();
    }
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-audit-action]');
    if (!btn) return;
    var action = btn.dataset.auditAction;

    switch (action) {
      case 'refresh':
        e.preventDefault();
        loadAudit();
        break;
      case 'prev-page':
        e.preventDefault();
        if (state.page > 0) { state.page--; loadAudit(); }
        break;
      case 'next-page':
        e.preventDefault();
        state.page++;
        loadAudit();
        break;
      case 'export':
        e.preventDefault();
        doExport();
        break;
      case 'clear':
        e.preventDefault();
        showClearModal();
        break;
      case 'confirm-clear':
        e.preventDefault();
        doClear();
        break;
      case 'cancel-clear':
        e.preventDefault();
        hideClearModal();
        break;
    }
  });

  async function doExport() {
    try {
      var entries = await API.audit.exportLog();
      var blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'audit-log-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Exported ' + entries.length + ' entries', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  }

  function showClearModal() {
    var modal = document.getElementById('auditClearModal');
    if (modal) modal.style.display = 'flex';
  }

  function hideClearModal() {
    var modal = document.getElementById('auditClearModal');
    if (modal) modal.style.display = 'none';
  }

  async function doClear() {
    try {
      var result = await API.audit.clear();
      hideClearModal();
      showToast('Audit log cleared. Backup saved.', 'success');
      state.entries = [];
      state.total = 0;
      state.page = 0;
      renderEntries();
      renderPagination();
      loadStats();
    } catch (err) {
      showToast('Clear failed: ' + err.message, 'error');
    }
  }
})();
