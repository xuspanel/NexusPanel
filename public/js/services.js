(function () {
  var SEARCH_DEBOUNCE = 300;
  var PER_PAGE = 50;

  var state = {
    services: [],
    filter: '',
    page: 0,
    sort: 'name',
    sortDir: 'asc',
    selected: new Set(),
    _debounceTimer: null,
    _loading: false,
  };

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }

  function showLoading() {
    var el = document.getElementById('svcList');
    if (el) el.innerHTML = '<div class="svc-loading"><div class="svc-loading-row"></div><div class="svc-loading-row short"></div><div class="svc-loading-row"></div><div class="svc-loading-row short"></div><div class="svc-loading-row"></div></div>';
  }

  function showError(msg) {
    var el = document.getElementById('svcList');
    if (el) el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(msg) + '</span></div>';
  }

  function showToast(msg, type) {
    var el = document.getElementById('svcToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'svc-toast ' + (type || 'info');
    el.style.display = 'block';
    if (state._toastTimer) clearTimeout(state._toastTimer);
    state._toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function getStateClass(svc) {
    if (svc.active === 'active') return 'running';
    if (svc.active === 'failed') return 'stopped';
    return 'paused';
  }

  function stateLabel(svc) {
    if (svc.sub && svc.sub !== svc.active) return svc.sub;
    return svc.active || 'unknown';
  }

  function getFiltered() {
    var f = state.filter.toLowerCase();
    var filtered = state.services.filter(function (s) {
      return !f || s.name.toLowerCase().indexOf(f) !== -1 || s.description.toLowerCase().indexOf(f) !== -1;
    });
    var sf = state.sort;
    var sd = state.sortDir === 'asc' ? 1 : -1;
    filtered.sort(function (a, b) {
      var av, bv;
      if (sf === 'name') { av = a.name; bv = b.name; }
      else if (sf === 'state') { av = a.active; bv = b.active; }
      else { av = a.description; bv = b.description; }
      return av.localeCompare(bv) * sd;
    });
    return filtered;
  }

  function renderStats() {
    var el = document.getElementById('svcStats');
    if (!el) return;
    var running = 0, stopped = 0, failed = 0;
    state.services.forEach(function (s) {
      if (s.active === 'active') running++;
      else if (s.active === 'failed') failed++;
      else stopped++;
    });
    el.innerHTML = '<span class="svc-stat"><strong>' + state.services.length + '</strong> total</span>'
      + '<span class="svc-stat-sep">|</span>'
      + '<span class="svc-stat svc-stat-running"><strong>' + running + '</strong> running</span>'
      + '<span class="svc-stat-sep">|</span>'
      + '<span class="svc-stat svc-stat-stopped"><strong>' + stopped + '</strong> stopped</span>'
      + (failed > 0 ? '<span class="svc-stat-sep">|</span><span class="svc-stat svc-stat-failed"><strong>' + failed + '</strong> failed</span>' : '');
  }

  function renderServices() {
    var el = document.getElementById('svcList');
    if (!el) return;
    var filtered = getFiltered();
    if (filtered.length === 0) {
      el.innerHTML = '<div class="svc-empty">No services found</div>';
      renderPagination(0);
      return;
    }
    var total = filtered.length;
    var pages = Math.ceil(total / PER_PAGE);
    if (state.page >= pages) state.page = pages - 1;
    if (state.page < 0) state.page = 0;
    var start = state.page * PER_PAGE;
    var pageItems = filtered.slice(start, start + PER_PAGE);

    var sortIndicator = function (field) {
      if (state.sort !== field) return '';
      return state.sortDir === 'asc' ? ' &#9650;' : ' &#9660;';
    };

    var html = '<div class="svc-sort-bar">'
      + '<span class="svc-sort-btn" data-svc-action="sort" data-svc-sort="name">Service' + sortIndicator('name') + '</span>'
      + '<span class="svc-sort-btn" data-svc-action="sort" data-svc-sort="state">State' + sortIndicator('state') + '</span>'
      + '<span class="svc-sort-btn" data-svc-action="sort" data-svc-sort="desc">Description' + sortIndicator('desc') + '</span>'
      + '</div>';

    for (var i = 0; i < pageItems.length; i++) {
      var s = pageItems[i];
      var cls = getStateClass(s);
      var checked = state.selected.has(s.name) ? 'checked' : '';
      html += '<div class="svc-row' + (checked ? ' selected' : '') + '" data-svc-name="' + esc(s.name) + '">'
        + '<input type="checkbox" class="svc-check" data-svc-action="toggle-select" data-svc-name="' + esc(s.name) + '" ' + checked + '>'
        + '<span class="svc-dot ' + cls + '"></span>'
        + '<div class="svc-info">'
        + '<span class="svc-name">' + esc(s.name) + '</span>'
        + '<span class="svc-desc">' + esc(s.description) + '</span>'
        + '</div>'
        + '<span class="svc-state ' + cls + '">' + esc(stateLabel(s)) + '</span>'
        + '<div class="svc-actions">';
      if (s.active === 'active') {
        html += '<button class="fm-btn fm-btn-sm" data-svc-action="svc-action" data-svc-name="' + esc(s.name) + '" data-svc-act="stop" title="Stop">&#9724;</button>';
        html += '<button class="fm-btn fm-btn-sm" data-svc-action="svc-action" data-svc-name="' + esc(s.name) + '" data-svc-act="restart" title="Restart">&#x21BB;</button>';
      } else {
        html += '<button class="fm-btn fm-btn-sm" data-svc-action="svc-action" data-svc-name="' + esc(s.name) + '" data-svc-act="start" title="Start">&#9654;</button>';
      }
      if (s.active !== 'active' && s.active !== 'failed') {
        html += '<button class="fm-btn fm-btn-sm" data-svc-action="svc-action" data-svc-name="' + esc(s.name) + '" data-svc-act="enable" title="Enable">&#x2713;</button>';
      }
      if (s.active === 'active') {
        html += '<button class="fm-btn fm-btn-sm" data-svc-action="svc-action" data-svc-name="' + esc(s.name) + '" data-svc-act="disable" title="Disable">&#x2717;</button>';
      }
      html += '<button class="fm-btn fm-btn-sm" data-svc-action="show-status" data-svc-name="' + esc(s.name) + '" title="Status">&#x1F4CB;</button>'
        + '</div></div>';
    }

    if (state.selected.size > 0) {
      var selHtml = '<div class="svc-bulk-bar">'
        + '<span>' + state.selected.size + ' selected</span>'
        + '<button class="fm-btn fm-btn-sm" data-svc-action="bulk-act" data-svc-act="start">Start All</button>'
        + '<button class="fm-btn fm-btn-sm" data-svc-action="bulk-act" data-svc-act="stop">Stop All</button>'
        + '<button class="fm-btn fm-btn-sm" data-svc-action="bulk-act" data-svc-act="restart">Restart All</button>'
        + '<button class="fm-btn fm-btn-sm" data-svc-action="bulk-deselect">Deselect</button>'
        + '</div>';
      el.innerHTML = selHtml + html;
    } else {
      el.innerHTML = html;
    }

    renderPagination(total);
  }

  function renderPagination(total) {
    var pagEl = document.getElementById('svcPagination');
    if (!pagEl) return;
    var pages = Math.ceil(total / PER_PAGE);
    if (pages <= 1) { pagEl.innerHTML = ''; return; }
    pagEl.innerHTML = '<button class="db-btn db-btn-sm" data-svc-action="prev-page" ' + (state.page === 0 ? 'disabled' : '') + '>&#8592; Prev</button>'
      + '<span class="svc-page-info">Page ' + (state.page + 1) + ' of ' + pages + '</span>'
      + '<button class="db-btn db-btn-sm" data-svc-action="next-page" ' + (state.page >= pages - 1 ? 'disabled' : '') + '>Next &#8594;</button>';
  }

  async function loadServices() {
    if (state._loading) return;
    state._loading = true;
    showLoading();
    try {
      state.services = await API.services.list();
      state.selected.clear();
      renderStats();
      renderServices();
    } catch (e) {
      showError(e.message || 'Failed to load services');
    }
    state._loading = false;
  }

  function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.dataset.svcOrigText = btn.textContent;
      btn.textContent = '...';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.svcOrigText || btn.textContent;
    }
  }

  async function doAction(name, act, btn) {
    setButtonLoading(btn, true);
    try {
      await API.services.action(name, act);
      var svc = state.services.find(function (s) { return s.name === name; });
      if (svc) {
        if (act === 'start' || act === 'enable') { svc.active = 'active'; svc.sub = act === 'enable' ? 'enabled' : 'running'; }
        else if (act === 'stop' || act === 'disable') { svc.active = 'inactive'; svc.sub = act === 'disable' ? 'disabled' : 'dead'; }
        else if (act === 'restart' || act === 'reload') { svc.active = 'active'; svc.sub = 'running'; }
      }
      renderStats();
      renderServices();
      showToast(name + ': ' + act + ' OK', 'success');
    } catch (e) {
      showToast(e.message || act + ' failed', 'error');
    }
    setButtonLoading(btn, false);
  }

  async function doBulkAction(act) {
    var names = Array.from(state.selected);
    if (names.length === 0) return;
    try {
      await API.services.bulkAction(names, act);
      showToast(names.length + ' services ' + act + 'ed', 'success');
      await loadServices();
    } catch (e) {
      showToast(e.message || 'Bulk action failed', 'error');
    }
  }

  async function showStatus(name) {
    var modal = document.getElementById('svcStatusModal');
    var body = document.getElementById('svcStatusBody');
    var title = document.getElementById('svcStatusTitle');
    if (!modal || !body) return;
    title.textContent = 'Status: ' + name;
    body.innerHTML = '<div class="svc-loading"><div class="svc-loading-row"></div><div class="svc-loading-row short"></div></div>';
    modal.style.display = 'flex';
    try {
      var data = await API.services.status(name);
      body.innerHTML = '<pre class="svc-status-pre">' + esc(data.output || 'No status output') + '</pre>';
    } catch (e) {
      body.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(e.message) + '</span></div>';
    }
  }

  window.initServices = async function () {
    try {
      var me = await API.me();
      if (me.role !== 'admin') {
        document.getElementById('svcList').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">Admin access required</span></div>';
        return;
      }
      showLoading();
      await loadServices();
    } catch {
      document.getElementById('svcList').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">Failed to load services</span></div>';
    }
  };

  document.addEventListener('input', function (e) {
    if (e.target.id === 'svcFilter') {
      if (state._debounceTimer) clearTimeout(state._debounceTimer);
      state._debounceTimer = setTimeout(function () {
        state.filter = e.target.value;
        state.page = 0;
        renderServices();
      }, SEARCH_DEBOUNCE);
    }
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-svc-action]');
    if (!btn) return;
    var action = btn.dataset.svcAction;

    switch (action) {
      case 'refresh':
        e.preventDefault();
        loadServices();
        break;
      case 'svc-action':
        e.preventDefault();
        doAction(btn.dataset.svcName, btn.dataset.svcAct, btn);
        break;
      case 'show-status':
        e.preventDefault();
        showStatus(btn.dataset.svcName);
        break;
      case 'toggle-select': {
        var n = btn.dataset.svcName;
        if (btn.checked) state.selected.add(n);
        else state.selected.delete(n);
        renderServices();
        break;
      }
      case 'bulk-act':
        e.preventDefault();
        doBulkAction(btn.dataset.svcAct);
        break;
      case 'bulk-deselect':
        e.preventDefault();
        state.selected.clear();
        renderServices();
        break;
      case 'sort': {
        e.preventDefault();
        var field = btn.dataset.svcSort;
        if (state.sort === field) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sort = field; state.sortDir = 'asc'; }
        renderServices();
        break;
      }
      case 'prev-page':
        e.preventDefault();
        if (state.page > 0) { state.page--; renderServices(); }
        break;
      case 'next-page':
        e.preventDefault();
        state.page++;
        renderServices();
        break;
      case 'close-status':
        e.preventDefault();
        document.getElementById('svcStatusModal').style.display = 'none';
        break;
    }
  });

  document.addEventListener('click', function (e) {
    var modal = document.getElementById('svcStatusModal');
    if (modal && e.target === modal) modal.style.display = 'none';
  });
})();
