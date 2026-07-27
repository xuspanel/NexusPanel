(function () {
  'use strict';

  var state = {
    updates: [],
    count: 0,
    pm: '',
    checking: false,
    error: null,
    searchQuery: '',
    searchResults: [],
    searching: false,
    selected: {},
    selectAll: false,
    panel: { localVersion: '—', remoteVersion: '—', updateAvailable: false, changelog: [], checking: false },
    security: { advisories: [], supported: true, loading: false },
    history: { entries: [], loading: false },
    streaming: false,
    streamOutput: ''
  };

  var searchTimer = null;

  window.initUpdates = function () {
    checkAuth().then(function (ok) {
      if (!ok) return;
      bindEvents();
      loadAll();
    });
  };

  function checkAuth() {
    return API.me().then(function (me) {
      if (!me || me.role !== 'admin') return false;
      return true;
    }).catch(function () { return false; });
  }

  function bindEvents() {
    var el = document.getElementById('updatesContent');
    if (!el) return;
    el.addEventListener('click', handleClick);
    var searchInput = document.getElementById('updSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        var val = searchInput.value.trim();
        searchTimer = setTimeout(function () { doSearch(val); }, 300);
      });
    }
  }

  function handleClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    switch (action) {
      case 'refresh-updates': loadAll(); break;
      case 'refresh-panel': loadPanel(true); break;
      case 'apply-panel': confirmPanelUpdate(); break;
      case 'apply-all': confirmApplyAll(); break;
      case 'select-all': toggleSelectAll(); break;
      case 'apply-single': applySingle(btn.getAttribute('data-name')); break;
      case 'view-package': viewPackage(btn.getAttribute('data-name')); break;
      case 'check-security': loadSecurity(); break;
      case 'check-history': loadHistory(); break;
      case 'close-modal': closeModal(); break;
      case 'confirm-apply': executeApplyAll(); break;
      case 'confirm-panel-apply': executePanelUpdate(); break;
      case 'clear-search': clearSearch(); break;
    }
  }

  function loadAll() {
    loadPanel(false);
    loadUpdates();
  }

  /* ─── Panel Update ─── */

  function loadPanel(force) {
    state.panel.checking = true;
    renderPanelCard();
    API.updates.panelCheck(!!force).then(function (d) {
      state.panel.localVersion = d.localVersion || '—';
      state.panel.remoteVersion = d.remoteVersion || '—';
      state.panel.updateAvailable = !!d.updateAvailable;
      state.panel.changelog = d.changelog || [];
      state.panel.checking = false;
      renderPanelCard();
      renderSummary();
      updateSidebarBadge(state.panel.updateAvailable);
    }).catch(function () {
      state.panel.checking = false;
      renderPanelCard();
    });
  }

  function renderPanelCard() {
    var el = document.getElementById('panelUpdateCard');
    if (!el) return;
    if (state.panel.checking) {
      el.innerHTML = '<div class="upd-panel-loading"><div class="upd-spinner"></div>Checking for panel updates...</div>';
      return;
    }
    var versionHtml = 'v' + esc(state.panel.localVersion);
    if (state.panel.updateAvailable) {
      versionHtml += ' <span class="upd-arrow">→</span> <span class="upd-avail">v' + esc(state.panel.remoteVersion) + '</span>';
    } else {
      versionHtml += ' <span class="upd-up-to-date">Up to date</span>';
    }

    var clHtml = '';
    if (state.panel.changelog && state.panel.changelog.length) {
      var entries = state.panel.changelog.slice(0, 5);
      clHtml = '<div class="upd-cl">' + entries.map(function (e) {
        return '<div class="upd-cl-entry"><div class="upd-cl-head">v' + esc(e.version) + ' <span class="upd-cl-date">' + esc(e.date) + '</span></div>' +
          (e.changes && e.changes.length ? '<ul class="upd-cl-list">' + e.changes.slice(0, 8).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '') +
          '</div>';
      }).join('') + '</div>';
    }

    el.innerHTML =
      '<div class="upd-panel-row">' +
        '<div class="upd-panel-icon">📦</div>' +
        '<div class="upd-panel-info"><div class="upd-panel-title">NexusPanel</div><div class="upd-panel-ver">' + versionHtml + '</div></div>' +
        '<div class="upd-panel-btns">' +
          '<button class="db-btn" data-action="refresh-panel" title="Check for updates">↻ Check</button>' +
          '<button class="db-btn db-btn-primary" data-action="apply-panel" ' + (!state.panel.updateAvailable ? 'disabled' : '') + '>' +
            (state.panel.updateAvailable ? 'Apply Update' : 'Up to Date') +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="upd-panel-status ' + (state.panel.updateAvailable ? 'upd-status-avail' : 'upd-status-ok') + '">' +
        (state.panel.updateAvailable ? 'Newer version available' : 'NexusPanel is up to date') +
      '</div>' +
      (state.streamOutput ? '<div class="upd-stream"><pre class="upd-stream-pre">' + esc(state.streamOutput) + '</pre></div>' : '') +
      clHtml;
  }

  function confirmPanelUpdate() {
    if (!state.panel.updateAvailable) return;
    var clText = '';
    if (state.panel.changelog && state.panel.changelog.length) {
      var latest = state.panel.changelog[0];
      clText = 'Latest: v' + latest.version + ' (' + latest.date + ')\n' +
        (latest.changes || []).slice(0, 5).map(function (c) { return '• ' + c; }).join('\n');
    }
    showModal('confirm', 'Apply Panel Update',
      '<p>This will update NexusPanel from <strong>v' + esc(state.panel.localVersion) + '</strong> to <strong>v' + esc(state.panel.remoteVersion) + '</strong>.</p>' +
      '<p>The panel will restart and you may be temporarily disconnected.</p>' +
      (clText ? '<div class="modal-changelog"><pre>' + esc(clText) + '</pre></div>' : ''),
      'Apply & Restart', 'confirm-panel-apply');
  }

  function executePanelUpdate() {
    closeModal();
    state.streaming = true;
    state.streamOutput = '';
    renderPanelCard();

    var evtSource = new EventSource('/updates/panel-update-stream');
    evtSource.onmessage = function (e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'progress') {
          state.streamOutput += data.output;
          if (state.streamOutput.length > 5000) state.streamOutput = state.streamOutput.substring(state.streamOutput.length - 5000);
          renderPanelCard();
          var pre = document.querySelector('.upd-stream-pre');
          if (pre) pre.scrollTop = pre.scrollHeight;
        } else if (data.type === 'done') {
          evtSource.close();
          state.streaming = false;
          if (data.success) {
            state.streamOutput += '\n\nUpdate completed successfully. Panel will restart...';
            toast('Panel updated successfully', 'success');
          } else {
            state.streamOutput += '\n\nUpdate failed (exit code ' + data.exitCode + ')';
            toast('Panel update failed', 'error');
          }
          renderPanelCard();
          updateSidebarBadge(false);
        }
      } catch {}
    };
    evtSource.onerror = function () {
      evtSource.close();
      state.streaming = false;
      state.streamOutput += '\n\nConnection lost. The panel may be restarting...';
      renderPanelCard();
      toast('Connection lost — panel may be restarting', 'info');
    };
  }

  /* ─── System Updates ─── */

  function loadUpdates() {
    state.checking = true;
    state.error = null;
    renderUpdates();
    renderSummary();
    API.updates.check().then(function (d) {
      state.updates = d.updates || [];
      state.count = d.count || 0;
      state.pm = d.pm || '';
      state.error = d.error;
      state.checking = false;
      state.selected = {};
      state.selectAll = false;
      renderUpdates();
      renderSummary();
    }).catch(function (e) {
      state.checking = false;
      state.error = e.message;
      renderUpdates();
      renderSummary();
    });
  }

  function renderUpdates() {
    var el = document.getElementById('updList');
    if (!el) return;
    if (state.checking) {
      el.innerHTML = '<div class="upd-loading"><div class="upd-spinner"></div>Checking for system updates...</div>';
      return;
    }
    if (state.error) {
      el.innerHTML = '<div class="upd-error">' + esc(state.error) + '</div>';
      return;
    }
    if (!state.count) {
      el.innerHTML = '<div class="upd-clean">System packages are up to date</div>';
      return;
    }

    var selectedCount = Object.keys(state.selected).length;
    var html = '<div class="upd-toolbar">' +
      '<div class="upd-toolbar-left">' +
        '<label class="upd-checkbox-wrap"><input type="checkbox" id="updSelectAll" data-action="select-all" ' + (state.selectAll ? 'checked' : '') + '><span class="upd-checkmark"></span></label>' +
        '<span class="upd-count-label">' + state.count + ' update' + (state.count > 1 ? 's' : '') + ' available</span>' +
        (selectedCount > 0 ? '<span class="upd-selected-count">' + selectedCount + ' selected</span>' : '') +
      '</div>' +
      '<div class="upd-toolbar-right">' +
        '<button class="db-btn db-btn-primary" data-action="apply-all"' + (selectedCount === 0 && !state.selectAll ? ' disabled' : '') + '>Apply' + (selectedCount > 0 ? ' ' + selectedCount : ' All') + '</button>' +
      '</div>' +
    '</div>';

    html += '<div class="upd-items">';
    var filtered = getFilteredUpdates();
    for (var i = 0; i < filtered.length; i++) {
      var u = filtered[i];
      var checked = state.selectAll || state.selected[u.name];
      html += '<div class="upd-item' + (checked ? ' upd-item-selected' : '') + '">' +
        '<label class="upd-checkbox-wrap"><input type="checkbox" data-action="select-pkg" data-name="' + esc(u.name) + '"' + (checked ? ' checked' : '') + '><span class="upd-checkmark"></span></label>' +
        '<span class="upd-item-name" data-action="view-package" data-name="' + esc(u.name) + '" title="View details">' + esc(u.name) + '</span>' +
        '<span class="upd-item-ver">' + esc(u.version) + '</span>' +
        '<span class="upd-item-repo">' + esc(u.repo) + '</span>' +
        '<button class="db-btn db-btn-sm" data-action="apply-single" data-name="' + esc(u.name) + '">Update</button>' +
      '</div>';
    }
    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll('[data-action="select-pkg"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var pkgName = cb.getAttribute('data-name');
        if (cb.checked) state.selected[pkgName] = true;
        else delete state.selected[pkgName];
        renderUpdates();
      });
    });
  }

  function getFilteredUpdates() {
    if (!state.searchQuery) return state.updates;
    var q = state.searchQuery.toLowerCase();
    return state.updates.filter(function (u) {
      return u.name.toLowerCase().indexOf(q) !== -1 || (u.repo && u.repo.toLowerCase().indexOf(q) !== -1);
    });
  }

  function toggleSelectAll() {
    state.selectAll = !state.selectAll;
    if (state.selectAll) {
      var filtered = getFilteredUpdates();
      for (var i = 0; i < filtered.length; i++) state.selected[filtered[i].name] = true;
    } else {
      state.selected = {};
    }
    renderUpdates();
  }

  function confirmApplyAll() {
    var names = state.selectAll ? state.updates.map(function (u) { return u.name; }) : Object.keys(state.selected);
    if (!names.length) return;
    showModal('confirm', 'Apply System Updates',
      '<p>This will update <strong>' + names.length + '</strong> package' + (names.length > 1 ? 's' : '') + ':</p>' +
      '<div class="modal-pkg-list">' + names.slice(0, 20).map(function (n) { return '<span class="modal-pkg-tag">' + esc(n) + '</span>'; }).join('') +
      (names.length > 20 ? '<span class="modal-pkg-more">+' + (names.length - 20) + ' more</span>' : '') + '</div>',
      'Apply Updates', 'confirm-apply');
  }

  function executeApplyAll() {
    closeModal();
    var names = state.selectAll ? state.updates.map(function (u) { return u.name; }) : Object.keys(state.selected);
    if (!names.length) return;
    showProgressModal('Applying Updates', 'Updating ' + names.length + ' package(s)...');

    var chain = Promise.resolve();
    var results = { success: 0, failed: 0, errors: [] };

    names.forEach(function (name) {
      chain = chain.then(function () {
        return API.updates.applySingle(name).then(function (r) {
          if (r.ok) results.success++;
          else { results.failed++; results.errors.push(name + ': ' + (r.error || 'failed')); }
          appendProgressOutput((r.ok ? '✓' : '✗') + ' ' + name + (r.ok ? '' : ' — ' + (r.error || 'failed')));
        }).catch(function (e) {
          results.failed++;
          results.errors.push(name + ': ' + e.message);
          appendProgressOutput('✗ ' + name + ' — ' + e.message);
        });
      });
    });

    chain.then(function () {
      setProgressDone(results.failed === 0,
        results.success + ' updated' + (results.failed > 0 ? ', ' + results.failed + ' failed' : ''));
      toast(results.failed === 0 ? 'All updates applied' : results.success + ' updated, ' + results.failed + ' failed',
        results.failed === 0 ? 'success' : 'error');
      loadUpdates();
    });
  }

  /* ─── Single Package ─── */

  function applySingle(name) {
    if (!name) return;
    toast('Updating ' + name + '...', 'info');
    API.updates.applySingle(name).then(function (r) {
      if (r.ok) {
        toast(name + ' updated successfully', 'success');
        loadUpdates();
      } else {
        toast(name + ': ' + (r.error || 'Failed'), 'error');
      }
    }).catch(function (e) {
      toast(name + ': ' + e.message, 'error');
    });
  }

  function viewPackage(name) {
    if (!name) return;
    showModal('info', 'Package Details', '<div class="upd-loading"><div class="upd-spinner"></div>Loading...</div>', null, null);
    API.updates.info(name).then(function (d) {
      var info = d.info || {};
      var rows = '';
      var keys = Object.keys(info);
      for (var i = 0; i < keys.length; i++) {
        rows += '<div class="modal-info-row"><span class="modal-info-key">' + esc(keys[i]) + '</span><span class="modal-info-val">' + esc(info[keys[i]]) + '</span></div>';
      }
      if (!rows) rows = '<div class="upd-empty">No details available</div>';
      var modalBody = document.querySelector('.modal-body');
      if (modalBody) modalBody.innerHTML = '<div class="modal-info-grid">' + rows + '</div>';
    }).catch(function (e) {
      var modalBody = document.querySelector('.modal-body');
      if (modalBody) modalBody.innerHTML = '<div class="upd-error">' + esc(e.message) + '</div>';
    });
  }

  /* ─── Search ─── */

  function doSearch(query) {
    state.searchQuery = query;
    renderUpdates();
    if (query.length < 2) return;
    state.searching = true;
    API.updates.search(query).then(function (d) {
      state.searchResults = d.results || [];
      state.searching = false;
      renderSearchResults();
    }).catch(function () {
      state.searching = false;
    });
  }

  function clearSearch() {
    state.searchQuery = '';
    state.searchResults = [];
    var input = document.getElementById('updSearchInput');
    if (input) input.value = '';
    renderUpdates();
    var el = document.getElementById('updSearchResults');
    if (el) el.innerHTML = '';
  }

  function renderSearchResults() {
    var el = document.getElementById('updSearchResults');
    if (!el) return;
    if (state.searching) {
      el.innerHTML = '<div class="upd-search-loading">Searching packages...</div>';
      return;
    }
    if (!state.searchResults.length) {
      el.innerHTML = '<div class="upd-search-empty">No packages found</div>';
      return;
    }
    el.innerHTML = '<div class="upd-search-header">Package Search Results</div>' +
      state.searchResults.map(function (r) {
        return '<div class="upd-search-item">' +
          '<span class="upd-search-name">' + esc(r.name) + '</span>' +
          (r.version ? '<span class="upd-search-ver">' + esc(r.version) + '</span>' : '') +
          (r.description ? '<span class="upd-search-desc">' + esc(r.description) + '</span>' : '') +
        '</div>';
      }).join('');
  }

  /* ─── Security Advisories ─── */

  function loadSecurity() {
    state.security.loading = true;
    renderSecurity();
    API.updates.security().then(function (d) {
      state.security.advisories = d.advisories || [];
      state.security.supported = d.supported !== false;
      state.security.error = d.error;
      state.security.loading = false;
      renderSecurity();
      renderSummary();
    }).catch(function (e) {
      state.security.loading = false;
      state.security.error = e.message;
      renderSecurity();
    });
  }

  function renderSecurity() {
    var el = document.getElementById('updSecuritySection');
    if (!el) return;
    if (state.security.loading) {
      el.innerHTML = '<div class="upd-loading"><div class="upd-spinner"></div>Checking security advisories...</div>';
      return;
    }
    if (!state.security.supported) {
      el.innerHTML = '<div class="upd-empty">Security advisories are only available on RHEL-based systems</div>';
      return;
    }
    if (state.security.error) {
      el.innerHTML = '<div class="upd-error">' + esc(state.security.error) + '</div>';
      return;
    }
    if (!state.security.advisories.length) {
      el.innerHTML = '<div class="upd-clean">No pending security advisories</div>';
      return;
    }
    el.innerHTML = state.security.advisories.map(function (a) {
      return '<div class="upd-sec-item upd-sec-' + esc(a.severity) + '">' +
        '<span class="upd-sec-id">' + esc(a.id) + '</span>' +
        '<span class="upd-sec-sev upd-sev-' + esc(a.severity) + '">' + esc(a.severity) + '</span>' +
        '<span class="upd-sec-type">' + esc(a.type) + '</span>' +
        '<span class="upd-sec-pkgs">' + esc(a.packages) + '</span>' +
      '</div>';
    }).join('');
  }

  /* ─── History ─── */

  function loadHistory() {
    state.history.loading = true;
    renderHistory();
    API.updates.history().then(function (d) {
      state.history.entries = d.history || [];
      state.history.loading = false;
      renderHistory();
    }).catch(function (e) {
      state.history.loading = false;
      state.history.error = e.message;
      renderHistory();
    });
  }

  function renderHistory() {
    var el = document.getElementById('updHistorySection');
    if (!el) return;
    if (state.history.loading) {
      el.innerHTML = '<div class="upd-loading"><div class="upd-spinner"></div>Loading history...</div>';
      return;
    }
    if (state.history.error) {
      el.innerHTML = '<div class="upd-error">' + esc(state.history.error) + '</div>';
      return;
    }
    if (!state.history.entries.length) {
      el.innerHTML = '<div class="upd-empty">No update history yet</div>';
      return;
    }
    el.innerHTML = state.history.entries.map(function (h) {
      var date = '';
      try { date = new Date(h.timestamp).toLocaleString(); } catch { date = h.timestamp; }
      var icon = h.success ? '✓' : '✗';
      var cls = h.success ? 'upd-hist-ok' : 'upd-hist-fail';
      var detail = '';
      if (h.type === 'panel') detail = 'Panel update';
      else if (h.type === 'single') detail = 'Package: ' + (h.package || '');
      else detail = 'All packages';
      if (h.error) detail += ' — ' + h.error;
      return '<div class="upd-hist-item ' + cls + '">' +
        '<span class="upd-hist-icon">' + icon + '</span>' +
        '<span class="upd-hist-detail">' + esc(detail) + '</span>' +
        '<span class="upd-hist-date">' + esc(date) + '</span>' +
      '</div>';
    }).join('');
  }

  /* ─── Summary Bar ─── */

  function renderSummary() {
    var el = document.getElementById('updSummaryBar');
    if (!el) return;
    var securityCount = state.security.advisories ? state.security.advisories.length : 0;
    var lastCheck = '';
    if (state.panel.checking) lastCheck = 'Checking...';
    else lastCheck = 'Up to date';

    el.innerHTML =
      '<div class="upd-stat-card">' +
        '<div class="upd-stat-icon">📦</div>' +
        '<div class="upd-stat-info"><div class="upd-stat-val">' + state.count + '</div><div class="upd-stat-label">Updates</div></div>' +
      '</div>' +
      '<div class="upd-stat-card">' +
        '<div class="upd-stat-icon">🛡️</div>' +
        '<div class="upd-stat-info"><div class="upd-stat-val">' + securityCount + '</div><div class="upd-stat-label">Security</div></div>' +
      '</div>' +
      '<div class="upd-stat-card">' +
        '<div class="upd-stat-icon">📋</div>' +
        '<div class="upd-stat-info"><div class="upd-stat-val">' + (state.history.entries ? state.history.entries.length : 0) + '</div><div class="upd-stat-label">History</div></div>' +
      '</div>' +
      '<div class="upd-stat-card">' +
        '<div class="upd-stat-icon">🏷️</div>' +
        '<div class="upd-stat-info"><div class="upd-stat-val">v' + esc(state.panel.localVersion) + '</div><div class="upd-stat-label">Panel</div></div>' +
      '</div>';
  }

  /* ─── Sidebar Badge ─── */

  function updateSidebarBadge(show) {
    var item = document.querySelector('.side-nav-item[data-view="updates"]');
    if (!item) return;
    var existing = item.querySelector('.side-nav-badge');
    if (show) {
      if (!existing) {
        var badge = document.createElement('span');
        badge.className = 'side-nav-badge';
        badge.textContent = '●';
        item.appendChild(badge);
      }
    } else {
      if (existing) existing.remove();
    }
  }

  /* ─── Modals ─── */

  function showModal(type, title, bodyHtml, confirmText, confirmAction) {
    var overlay = document.getElementById('updModalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'updModalOverlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }

    var footer = '';
    if (confirmText) {
      footer = '<div class="modal-footer">' +
        '<button class="db-btn" data-action="close-modal">Cancel</button>' +
        '<button class="db-btn db-btn-primary" data-action="' + esc(confirmAction) + '">' + esc(confirmText) + '</button>' +
      '</div>';
    } else {
      footer = '<div class="modal-footer"><button class="db-btn" data-action="close-modal">Close</button></div>';
    }

    overlay.innerHTML =
      '<div class="modal-dialog">' +
        '<div class="modal-header"><h3 class="modal-title">' + esc(title) + '</h3><button class="modal-close" data-action="close-modal">&times;</button></div>' +
        '<div class="modal-body">' + bodyHtml + '</div>' +
        footer +
      '</div>';
    overlay.style.display = 'flex';

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
      var actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        var act = actionBtn.getAttribute('data-action');
        if (act === 'close-modal') closeModal();
        else if (act === confirmAction) {
          var handler = window._updModalConfirm;
          if (handler) handler();
        }
      }
    });

    window._updModalConfirm = function () {
      if (confirmAction === 'confirm-apply') executeApplyAll();
      else if (confirmAction === 'confirm-panel-apply') executePanelUpdate();
    };
  }

  function showProgressModal(title, initialMsg) {
    var overlay = document.getElementById('updModalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'updModalOverlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML =
      '<div class="modal-dialog">' +
        '<div class="modal-header"><h3 class="modal-title">' + esc(title) + '</h3></div>' +
        '<div class="modal-body"><div class="upd-progress">' +
          '<div class="upd-progress-status">' + esc(initialMsg) + '</div>' +
          '<div class="upd-progress-output"></div>' +
        '</div></div>' +
      '</div>';
    overlay.style.display = 'flex';
  }

  function appendProgressOutput(text) {
    var el = document.querySelector('.upd-progress-output');
    if (el) {
      el.textContent += text + '\n';
      el.scrollTop = el.scrollHeight;
    }
  }

  function setProgressDone(success, message) {
    var status = document.querySelector('.upd-progress-status');
    if (status) {
      status.className = 'upd-progress-status ' + (success ? 'upd-progress-ok' : 'upd-progress-fail');
      status.textContent = message;
    }
    var footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.innerHTML = '<button class="db-btn db-btn-primary" data-action="close-modal">Done</button>';
    var dialog = document.querySelector('.modal-dialog');
    if (dialog) dialog.appendChild(footer);
  }

  function closeModal() {
    var overlay = document.getElementById('updModalOverlay');
    if (overlay) overlay.style.display = 'none';
    window._updModalConfirm = null;
  }

  /* ─── Toast ─── */

  function toast(msg, type) {
    var container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    var t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'info');
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(function () { t.classList.add('toast-show'); }, 10);
    setTimeout(function () {
      t.classList.remove('toast-show');
      setTimeout(function () { t.remove(); }, 300);
    }, 3000);
  }

  /* ─── Utilities ─── */

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[c] || c;
    });
  }

})();
