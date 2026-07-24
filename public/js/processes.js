(function () {
  var SEARCH_DEBOUNCE = 300;
  var PER_PAGE = 50;
  var REFRESH_INTERVALS = [5000, 10000, 30000, 0];
  var REFRESH_LABELS = ['5s', '10s', '30s', 'Off'];

  var state = {
    procs: [],
    tree: null,
    filter: '',
    page: 0,
    sort: 'cpu',
    sortDir: 'desc',
    view: 'list',
    refreshIdx: 0,
    refreshTimer: null,
    _debounceTimer: null,
    _loading: false,
    _toastTimer: null,
  };

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }

  function formatBytes(kb) {
    if (!kb || kb <= 0) return '0K';
    if (kb > 1048576) return (kb / 1048576).toFixed(2) + 'G';
    if (kb > 1024) return (kb / 1024).toFixed(1) + 'M';
    return kb + 'K';
  }

  function showLoading() {
    var el = document.getElementById('procList');
    if (el) el.innerHTML = '<div class="proc-loading"><div class="proc-loading-row"></div><div class="proc-loading-row short"></div><div class="proc-loading-row"></div><div class="proc-loading-row short"></div><div class="proc-loading-row"></div><div class="proc-loading-row short"></div></div>';
  }

  function showError(msg) {
    var el = document.getElementById('procList');
    if (el) el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(msg) + '</span><button class="db-btn db-btn-sm" data-action="retry" style="margin-left:12px">Retry</button></div>';
  }

  function showToast(msg, type) {
    var el = document.getElementById('procToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'proc-toast ' + (type || 'info');
    el.style.display = 'block';
    if (state._toastTimer) clearTimeout(state._toastTimer);
    state._toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function getFiltered() {
    var f = state.filter.toLowerCase();
    var filtered = state.procs.filter(function (p) {
      return !f || String(p.pid).indexOf(f) !== -1 || p.user.toLowerCase().indexOf(f) !== -1 || p.command.toLowerCase().indexOf(f) !== -1;
    });
    var sf = state.sort;
    var sd = state.sortDir === 'asc' ? 1 : -1;
    filtered.sort(function (a, b) {
      var av, bv;
      if (sf === 'pid') { av = a.pid; bv = b.pid; }
      else if (sf === 'user') { av = a.user; bv = b.user; }
      else if (sf === 'cpu') { av = a.cpu; bv = b.cpu; }
      else if (sf === 'mem') { av = a.mem; bv = b.mem; }
      else if (sf === 'rss') { av = a.rss; bv = b.rss; }
      else if (sf === 'command') { av = a.command; bv = b.command; }
      else { av = a.cpu; bv = b.cpu; }
      if (typeof av === 'string') return av.localeCompare(bv) * sd;
      return (av - bv) * sd;
    });
    return filtered;
  }

  function cpuBarColor(val) {
    if (val > 70) return '#ef4444';
    if (val > 30) return '#f59e0b';
    return '#22c55e';
  }

  function memBarColor(val) {
    if (val > 70) return '#ef4444';
    if (val > 30) return '#f59e0b';
    return '#3b82f6';
  }

  function renderStats() {
    var el = document.getElementById('procStats');
    if (!el) return;
    var totalCpu = 0, totalMem = 0, topCpu = '', topMem = '';
    var topCpuVal = 0, topMemVal = 0;
    state.procs.forEach(function (p) {
      totalCpu += p.cpu;
      totalMem += p.mem;
      if (p.cpu > topCpuVal) { topCpuVal = p.cpu; topCpu = p.command.split(/\s+/)[0].split('/').pop(); }
      if (p.mem > topMemVal) { topMemVal = p.mem; topMem = p.command.split(/\s+/)[0].split('/').pop(); }
    });
    el.innerHTML = '<span class="proc-stat"><strong>' + state.procs.length + '</strong> total</span>'
      + '<span class="proc-stat-sep">|</span>'
      + '<span class="proc-stat"><strong>' + totalCpu.toFixed(1) + '%</strong> CPU</span>'
      + '<span class="proc-stat-sep">|</span>'
      + '<span class="proc-stat"><strong>' + totalMem.toFixed(1) + '%</strong> MEM</span>'
      + (topCpu ? '<span class="proc-stat-sep">|</span><span class="proc-stat">Top CPU: <strong>' + esc(topCpu) + '</strong> (' + topCpuVal.toFixed(1) + '%)</span>' : '')
      + (topMem ? '<span class="proc-stat-sep">|</span><span class="proc-stat">Top MEM: <strong>' + esc(topMem) + '</strong> (' + topMemVal.toFixed(1) + '%)</span>' : '');
  }

  function renderSortBar() {
    var el = document.getElementById('procSortBar');
    if (!el) return;
    var cols = [
      { key: 'pid', label: 'PID' },
      { key: 'user', label: 'User' },
      { key: 'cpu', label: 'CPU%' },
      { key: 'mem', label: 'MEM%' },
      { key: 'rss', label: 'RSS' },
      { key: 'command', label: 'Command' },
    ];
    el.innerHTML = '<span class="proc-sort-label">Sort:</span>' + cols.map(function (c) {
      var active = state.sort === c.key;
      var arrow = active ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
      return '<button class="proc-sort-btn' + (active ? ' active' : '') + '" data-action="sort" data-sort="' + c.key + '">' + esc(c.label) + arrow + '</button>';
    }).join('');
  }

  function renderList() {
    var el = document.getElementById('procList');
    if (!el) return;
    var filtered = getFiltered();
    var pages = Math.ceil(filtered.length / PER_PAGE);
    if (state.page >= pages) state.page = Math.max(0, pages - 1);
    var start = state.page * PER_PAGE;
    var pageItems = filtered.slice(start, start + PER_PAGE);

    var html = '<div class="proc-header-row"><span class="proc-col pid">PID</span><span class="proc-col user">User</span><span class="proc-col cpu">CPU%</span><span class="proc-col mem">MEM%</span><span class="proc-col rss">RSS</span><span class="proc-col cmd">Command</span><span class="proc-col act"></span></div>';
    html += pageItems.map(function (p) {
      var cpuW = Math.min(p.cpu, 100);
      var memW = Math.min(p.mem, 100);
      var cmdShort = p.command.length > 80 ? p.command.substring(0, 80) + '…' : p.command;
      var cmdName = p.command.split(/\s+/)[0].split('/').pop();
      return '<div class="proc-row" data-pid="' + p.pid + '">'
        + '<span class="proc-col pid" data-action="details" data-pid="' + p.pid + '">' + p.pid + '</span>'
        + '<span class="proc-col user">' + esc(p.user) + '</span>'
        + '<span class="proc-col cpu"><span class="proc-bar-wrap"><span class="proc-bar" style="width:' + cpuW + '%;background:' + cpuBarColor(p.cpu) + '"></span></span><span class="proc-val">' + p.cpu.toFixed(1) + '</span></span>'
        + '<span class="proc-col mem"><span class="proc-bar-wrap"><span class="proc-bar" style="width:' + memW + '%;background:' + memBarColor(p.mem) + '"></span></span><span class="proc-val">' + p.mem.toFixed(1) + '</span></span>'
        + '<span class="proc-col rss">' + formatBytes(p.rss) + '</span>'
        + '<span class="proc-col cmd" title="' + esc(p.command) + '">' + esc(cmdShort) + '</span>'
        + '<span class="proc-col act"><button class="db-btn db-btn-sm db-btn-danger" data-action="kill" data-pid="' + p.pid + '" data-cmd="' + esc(cmdName) + '" title="Kill process">✕</button></span>'
        + '</div>';
    }).join('');
    if (pageItems.length === 0) {
      html += '<div class="proc-empty">No processes found' + (state.filter ? ' matching "' + esc(state.filter) + '"' : '') + '</div>';
    }
    el.innerHTML = html;

    var pagEl = document.getElementById('procPagination');
    if (pagEl) {
      var from = filtered.length > 0 ? start + 1 : 0;
      var to = Math.min(start + PER_PAGE, filtered.length);
      pagEl.innerHTML = '<span class="proc-page-info">Showing ' + from + '-' + to + ' of ' + filtered.length + '</span>'
        + '<div class="proc-page-btns">'
        + '<button class="db-btn db-btn-sm" data-action="page" data-page="prev"' + (state.page <= 0 ? ' disabled' : '') + '>‹ Prev</button>'
        + '<span class="proc-page-num">Page ' + (state.page + 1) + ' / ' + Math.max(1, pages) + '</span>'
        + '<button class="db-btn db-btn-sm" data-action="page" data-page="next"' + (state.page >= pages - 1 ? ' disabled' : '') + '>Next ›</button>'
        + '</div>';
    }
  }

  function renderTree() {
    var el = document.getElementById('procList');
    if (!el) return;
    if (!state.tree) {
      el.innerHTML = '<div class="proc-loading"><div class="proc-loading-row"></div><div class="proc-loading-row short"></div></div>';
      return;
    }
    el.innerHTML = '<pre class="proc-tree">' + esc(state.tree.raw) + '</pre>';
    var pagEl = document.getElementById('procPagination');
    if (pagEl) pagEl.innerHTML = '';
  }

  function render() {
    if (state.view === 'tree') { renderTree(); return; }
    renderSortBar();
    renderList();
    renderStats();
  }

  function renderRefreshBtn() {
    var btn = document.getElementById('procRefreshBtn');
    if (!btn) return;
    btn.title = 'Auto-refresh: ' + REFRESH_LABELS[state.refreshIdx];
    var span = document.getElementById('procRefreshLabel');
    if (span) span.textContent = REFRESH_LABELS[state.refreshIdx];
  }

  function startRefresh() {
    stopRefresh();
    var ms = REFRESH_INTERVALS[state.refreshIdx];
    if (ms > 0) state.refreshTimer = setInterval(loadProcesses, ms);
  }

  function stopRefresh() {
    if (state.refreshTimer) { clearInterval(state.refreshTimer); state.refreshTimer = null; }
  }

  async function loadProcesses() {
    if (state._loading) return;
    state._loading = true;
    if (state.view === 'list' && state.procs.length === 0) showLoading();
    try {
      state.procs = await API.processes.list();
      render();
    } catch (e) {
      if (state.procs.length === 0) showError(e.message || 'Failed to load processes');
      else showToast('Refresh failed: ' + (e.message || 'Unknown error'), 'error');
    }
    state._loading = false;
  }

  async function loadTree() {
    try {
      state.tree = await API.processes.tree();
      renderTree();
    } catch (e) {
      var el = document.getElementById('procList');
      if (el) el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(e.message || 'Failed to load tree') + '</span></div>';
    }
  }

  function isVisible() {
    var el = document.getElementById('viewProcesses');
    return el && el.style.display !== 'none';
  }

  window.initProcesses = async function () {
    state.filter = '';
    state.page = 0;
    state.sort = 'cpu';
    state.sortDir = 'desc';
    state.view = 'list';
    state.procs = [];
    state.tree = null;

    var searchEl = document.getElementById('procSearchInput');
    if (searchEl) {
      searchEl.value = '';
      searchEl.addEventListener('input', function () {
        var v = this.value;
        if (state._debounceTimer) clearTimeout(state._debounceTimer);
        state._debounceTimer = setTimeout(function () {
          state.filter = v;
          state.page = 0;
          render();
        }, SEARCH_DEBOUNCE);
      });
    }

    startRefresh();
    renderRefreshBtn();
    await loadProcesses();
  };

  window.procCleanup = function () {
    stopRefresh();
  };

  function openKillModal(pid, cmdName) {
    var proc = state.procs.find(function (p) { return p.pid === pid; });
    if (!proc) return;
    var modal = document.getElementById('procKillModal');
    if (!modal) return;
    var infoEl = document.getElementById('procKillInfo');
    if (infoEl) {
      infoEl.innerHTML = '<div class="proc-kill-detail"><span class="proc-kill-label">PID:</span> <strong>' + proc.pid + '</strong></div>'
        + '<div class="proc-kill-detail"><span class="proc-kill-label">User:</span> ' + esc(proc.user) + '</div>'
        + '<div class="proc-kill-detail"><span class="proc-kill-label">CPU:</span> ' + proc.cpu.toFixed(1) + '%</div>'
        + '<div class="proc-kill-detail"><span class="proc-kill-label">MEM:</span> ' + proc.mem.toFixed(1) + '%</div>'
        + '<div class="proc-kill-detail"><span class="proc-kill-label">Command:</span> <span class="proc-kill-cmd" title="' + esc(proc.command) + '">' + esc(proc.command.substring(0, 100)) + '</span></div>';
    }
    var sel = document.getElementById('procKillSignal');
    if (sel) sel.value = 'SIGTERM';
    modal.dataset.pid = pid;
    modal.style.display = 'flex';
  }

  function closeKillModal() {
    var modal = document.getElementById('procKillModal');
    if (modal) modal.style.display = 'none';
  }

  function openDetailModal(pid) {
    var proc = state.procs.find(function (p) { return p.pid === pid; });
    if (!proc) return;
    var modal = document.getElementById('procDetailModal');
    if (!modal) return;
    var bodyEl = document.getElementById('procDetailBody');
    if (bodyEl) {
      bodyEl.innerHTML = '<div class="proc-detail-loading">Loading details...</div>';
      modal.style.display = 'flex';
    }
    API.processes.details(pid).then(function (info) {
      if (!bodyEl) return;
      bodyEl.innerHTML = '<div class="proc-detail-grid">'
        + '<div class="proc-detail-row"><span class="proc-detail-label">PID</span><span class="proc-detail-value">' + info.pid + '</span></div>'
        + '<div class="proc-detail-row"><span class="proc-detail-label">PPID</span><span class="proc-detail-value">' + info.ppid + '</span></div>'
        + '<div class="proc-detail-row"><span class="proc-detail-label">Name</span><span class="proc-detail-value">' + esc(info.name) + '</span></div>'
        + '<div class="proc-detail-row"><span class="proc-detail-label">State</span><span class="proc-detail-value">' + esc(info.state) + '</span></div>'
        + '<div class="proc-detail-row"><span class="proc-detail-label">User (UID)</span><span class="proc-detail-value">' + esc(info.uid) + '</span></div>'
        + '<div class="proc-detail-row"><span class="proc-detail-label">Group (GID)</span><span class="proc-detail-value">' + esc(info.gid) + '</span></div>'
        + '<div class="proc-detail-row"><span class="proc-detail-label">Threads</span><span class="proc-detail-value">' + info.threads + '</span></div>'
        + '<div class="proc-detail-row"><span class="proc-detail-label">RSS</span><span class="proc-detail-value">' + esc(info.vmRSS) + '</span></div>'
        + '<div class="proc-detail-row"><span class="proc-detail-label">Virtual Size</span><span class="proc-detail-value">' + esc(info.vmSize) + '</span></div>'
        + '<div class="proc-detail-row"><span class="proc-detail-label">Open FDs</span><span class="proc-detail-value">' + info.openFds + '</span></div>'
        + '<div class="proc-detail-row proc-detail-full"><span class="proc-detail-label">Command</span><span class="proc-detail-value proc-detail-cmd" title="' + esc(info.fullCommand) + '">' + esc(info.fullCommand) + '</span></div>'
        + '</div>';
    }).catch(function (e) {
      if (bodyEl) bodyEl.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(e.message || 'Failed to load details') + '</span></div>';
    });
  }

  function closeDetailModal() {
    var modal = document.getElementById('procDetailModal');
    if (modal) modal.style.display = 'none';
  }

  document.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var action = target.dataset.action;

    if (action === 'retry') {
      loadProcesses();
      return;
    }

    if (action === 'sort') {
      var col = target.dataset.sort;
      if (state.sort === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = col;
        state.sortDir = col === 'pid' || col === 'user' || col === 'command' ? 'asc' : 'desc';
      }
      state.page = 0;
      render();
      return;
    }

    if (action === 'page') {
      var pg = target.dataset.page;
      var filtered = getFiltered();
      var pages = Math.ceil(filtered.length / PER_PAGE);
      if (pg === 'prev' && state.page > 0) state.page--;
      else if (pg === 'next' && state.page < pages - 1) state.page++;
      render();
      return;
    }

    if (action === 'refresh') {
      loadProcesses();
      return;
    }

    if (action === 'cycle-refresh') {
      state.refreshIdx = (state.refreshIdx + 1) % REFRESH_INTERVALS.length;
      startRefresh();
      renderRefreshBtn();
      return;
    }

    if (action === 'view-list') {
      state.view = 'list';
      var listBtn = document.getElementById('procViewList');
      var treeBtn = document.getElementById('procViewTree');
      if (listBtn) listBtn.classList.add('active');
      if (treeBtn) treeBtn.classList.remove('active');
      render();
      return;
    }

    if (action === 'view-tree') {
      state.view = 'tree';
      var listBtn2 = document.getElementById('procViewList');
      var treeBtn2 = document.getElementById('procViewTree');
      if (listBtn2) listBtn2.classList.remove('active');
      if (treeBtn2) treeBtn2.classList.add('active');
      if (!state.tree) loadTree();
      else renderTree();
      return;
    }

    if (action === 'details') {
      var pid = parseInt(target.dataset.pid);
      if (pid) openDetailModal(pid);
      return;
    }

    if (action === 'kill') {
      var pid = parseInt(target.dataset.pid);
      var cmd = target.dataset.cmd || '';
      if (pid) openKillModal(pid, cmd);
      return;
    }

    if (action === 'confirm-kill') {
      var modal = document.getElementById('procKillModal');
      if (!modal) return;
      var pid = parseInt(modal.dataset.pid);
      var sel = document.getElementById('procKillSignal');
      var signal = sel ? sel.value : 'SIGTERM';
      closeKillModal();
      if (!pid) return;
      showToast('Sending ' + signal + ' to PID ' + pid + '...', 'info');
      API.processes.signal(pid, signal).then(function () {
        showToast(signal + ' sent to PID ' + pid, 'success');
        loadProcesses();
      }).catch(function (e) {
        showToast('Failed: ' + (e.message || 'Unknown error'), 'error');
      });
      return;
    }

    if (action === 'cancel-kill') {
      closeKillModal();
      return;
    }

    if (action === 'cancel-detail') {
      closeDetailModal();
      return;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeKillModal();
      closeDetailModal();
    }
  });

})();
