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
    searchSelected: {},
    selected: {},
    selectAll: false,
    panel: { localVersion: '—', remoteVersion: '—', updateAvailable: false, changelog: [], checking: false },
    security: { advisories: [], supported: true, loading: false },
    history: { entries: [], loading: false },
    streaming: false,
    streamOutput: ''
  };

  var searchTimer = null;
  var modalConfirmHandler = null;
  var modalListenerAttached = false;

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
    el.addEventListener('change', handleChange);
    var searchInput = document.getElementById('updSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        var val = searchInput.value.trim();
        searchTimer = setTimeout(function () { doSearch(val); }, 300);
      });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') clearSearch();
      });
    }
  }

  function handleClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var action = btn.getAttribute('data-action');
    switch (action) {
      case 'refresh-updates': loadAll(); break;
      case 'refresh-panel': loadPanel(true); break;
      case 'apply-panel': confirmPanelUpdate(); break;
      case 'apply-all': confirmApplyAll(); break;
      case 'select-all': toggleSelectAll(); break;
      case 'select-all-search': toggleSearchSelectAll(); break;
      case 'apply-single': applySingle(btn.getAttribute('data-name')); break;
      case 'apply-search-single': applySearchSingle(btn.getAttribute('data-name')); break;
      case 'apply-search-selected': confirmApplySearchSelected(); break;
      case 'view-package': viewPackage(btn.getAttribute('data-name')); break;
      case 'view-search-package': viewPackage(btn.getAttribute('data-name')); break;
      case 'check-security': loadSecurity(); break;
      case 'check-history': loadHistory(); break;
      case 'close-modal': closeModal(); break;
      case 'confirm-apply': executeApplyAll(); break;
      case 'confirm-apply-search': executeApplySearchSelected(); break;
      case 'confirm-panel-apply': executePanelUpdate(); break;
      case 'clear-search': clearSearch(); break;
    }
  }

  function handleChange(e) {
    var el = e.target;
    if (!el.hasAttribute('data-action')) return;
    var action = el.getAttribute('data-action');
    var name = el.getAttribute('data-name');
    if (action === 'select-pkg') {
      if (el.checked) state.selected[name] = true;
      else delete state.selected[name];
      renderUpdates();
    } else if (action === 'select-search-pkg') {
      if (el.checked) state.searchSelected[name] = true;
      else delete state.searchSelected[name];
      renderSearchResults();
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
      versionHtml += ' <span class="upd-arrow">\u2192</span> <span class="upd-avail">v' + esc(state.panel.remoteVersion) + '</span>';
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
        '<div class="upd-panel-icon">\ud83d\udce6</div>' +
        '<div class="upd-panel-info"><div class="upd-panel-title">NexusPanel</div><div class="upd-panel-ver">' + versionHtml + '</div></div>' +
        '<div class="upd-panel-btns">' +
          '<button class="db-btn" data-action="refresh-panel" title="Check for updates">\u21bb Check</button>' +
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
        (latest.changes || []).slice(0, 5).map(function (c) { return '\u2022 ' + c; }).join('\n');
    }
    showModal('Apply Panel Update',
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
      toast('Connection lost \u2014 panel may be restarting', 'info');
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
    showModal('Apply System Updates',
      '<p>This will update <strong>' + names.length + '</strong> package' + (names.length > 1 ? 's' : '') + ':</p>' +
      '<div class="modal-pkg-list">' + names.slice(0, 30).map(function (n) { return '<span class="modal-pkg-tag">' + esc(n) + '</span>'; }).join('') +
      (names.length > 30 ? '<span class="modal-pkg-more">+' + (names.length - 30) + ' more</span>' : '') + '</div>',
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
          if (r.ok) {
            results.success++;
            appendProgressOutput('\u2713 ' + name + ' \u2014 updated to latest');
          } else {
            results.failed++;
            results.errors.push(name + ': ' + (r.error || 'failed'));
            appendProgressOutput('\u2717 ' + name + ' \u2014 ' + (r.error || 'failed'));
          }
        }).catch(function (e) {
          results.failed++;
          results.errors.push(name + ': ' + e.message);
          appendProgressOutput('\u2717 ' + name + ' \u2014 ' + e.message);
        });
      });
    });

    chain.then(function () {
      setProgressDone(results.failed === 0,
        results.success + ' package' + (results.success !== 1 ? 's' : '') + ' updated' + (results.failed > 0 ? ', ' + results.failed + ' failed' : ''));
      toast(results.failed === 0
        ? 'All ' + results.success + ' updates applied successfully'
        : results.success + ' updated, ' + results.failed + ' failed',
        results.failed === 0 ? 'success' : 'error');
      loadUpdates();
    });
  }

  /* ─── Single Package ─── */

  function applySingle(name) {
    if (!name) return;
    showProgressModal('Updating Package', 'Updating ' + name + '...');
    API.updates.applySingle(name).then(function (r) {
      if (r.ok) {
        appendProgressOutput('\u2713 ' + name + ' updated successfully');
        if (r.output) appendProgressOutput('\n' + r.output);
        setProgressDone(true, name + ' updated successfully');
        toast(name + ' updated successfully', 'success');
        loadUpdates();
      } else {
        appendProgressOutput('\u2717 ' + name + ' failed');
        if (r.error) appendProgressOutput(r.error);
        if (r.output) appendProgressOutput('\n' + r.output);
        setProgressDone(false, name + ': ' + (r.error || 'Update failed'));
        toast(name + ': ' + (r.error || 'Failed'), 'error');
      }
    }).catch(function (e) {
      appendProgressOutput('\u2717 ' + name + ' \u2014 ' + e.message);
      setProgressDone(false, e.message);
      toast(name + ': ' + e.message, 'error');
    });
  }

  function viewPackage(name) {
    if (!name) return;
    var overlay = getOrCreateModal();
    var bodyHtml = '<div class="upd-loading"><div class="upd-spinner"></div>Loading details for ' + esc(name) + '...</div>';
    setModalContent('Package Details \u2014 ' + name, bodyHtml, null, null);
    overlay.style.display = 'flex';

    API.updates.info(name).then(function (d) {
      if (d.error) {
        updateModalBody('<div class="upd-error">' + esc(d.error) + (d.name ? ' (' + esc(d.name) + ')' : '') + '</div>');
        return;
      }
      var info = d.info || {};
      var rows = '';
      var keys = Object.keys(info);
      if (!keys.length) {
        updateModalBody('<div class="upd-empty">No details available for this package</div>');
        return;
      }
      var important = ['name', 'version', 'release', 'arch', 'summary', 'description', 'size', 'license', 'url', 'repo'];
      var importantRows = '';
      var otherRows = '';
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = info[k];
        var row = '<div class="modal-info-row"><span class="modal-info-key">' + esc(k) + '</span><span class="modal-info-val">' + esc(v) + '</span></div>';
        if (important.indexOf(k) !== -1) importantRows += row;
        else otherRows += row;
      }
      var html = '<div class="modal-info-grid">' + importantRows + (otherRows ? '<div class="upd-info-divider">Additional Details</div>' + otherRows : '') + '</div>';
      html += '<div class="modal-footer"><button class="db-btn db-btn-primary" data-action="close-modal">Close</button></div>';
      updateModalBody(html);
    }).catch(function (e) {
      updateModalBody('<div class="upd-error">Failed to load package details: ' + esc(e.message) + '</div>');
    });
  }

  /* ─── Search ─── */

  function doSearch(query) {
    state.searchQuery = query;
    state.searchSelected = {};
    renderUpdates();
    if (query.length < 2) {
      state.searchResults = [];
      renderSearchResults();
      return;
    }
    state.searching = true;
    renderSearchResults();
    API.updates.search(query).then(function (d) {
      state.searchResults = d.results || [];
      state.searching = false;
      state.searchSelected = {};
      renderSearchResults();
    }).catch(function () {
      state.searching = false;
      renderSearchResults();
    });
  }

  function clearSearch() {
    state.searchQuery = '';
    state.searchResults = [];
    state.searchSelected = {};
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
      el.innerHTML = '<div class="upd-loading"><div class="upd-spinner"></div>Searching packages...</div>';
      return;
    }
    if (!state.searchQuery || state.searchQuery.length < 2) {
      el.innerHTML = '';
      return;
    }
    if (!state.searchResults.length) {
      el.innerHTML = '<div class="upd-search-empty">No packages found matching "' + esc(state.searchQuery) + '"</div>';
      return;
    }

    var selectedCount = Object.keys(state.searchSelected).length;
    var html = '<div class="upd-search-panel">' +
      '<div class="upd-search-toolbar">' +
        '<div class="upd-toolbar-left">' +
          '<label class="upd-checkbox-wrap"><input type="checkbox" data-action="select-all-search" ' + (selectedCount === state.searchResults.length && state.searchResults.length > 0 ? 'checked' : '') + '><span class="upd-checkmark"></span></label>' +
          '<span class="upd-count-label">' + state.searchResults.length + ' result' + (state.searchResults.length !== 1 ? 's' : '') + '</span>' +
          (selectedCount > 0 ? '<span class="upd-selected-count">' + selectedCount + ' selected</span>' : '') +
        '</div>' +
        '<div class="upd-toolbar-right">' +
          (selectedCount > 0 ? '<button class="db-btn db-btn-primary" data-action="apply-search-selected">Update Selected (' + selectedCount + ')</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="upd-search-items">';

    for (var i = 0; i < state.searchResults.length; i++) {
      var r = state.searchResults[i];
      var checked = state.searchSelected[r.name];
      html += '<div class="upd-search-item' + (checked ? ' upd-item-selected' : '') + '">' +
        '<label class="upd-checkbox-wrap"><input type="checkbox" data-action="select-search-pkg" data-name="' + esc(r.name) + '"' + (checked ? ' checked' : '') + '><span class="upd-checkmark"></span></label>' +
        '<div class="upd-search-item-main">' +
          '<span class="upd-search-name" data-action="view-search-package" data-name="' + esc(r.name) + '" title="View details">' + esc(r.name) + '</span>' +
          (r.version ? '<span class="upd-search-ver">' + esc(r.version) + '</span>' : '') +
        '</div>' +
        (r.description ? '<div class="upd-search-desc">' + esc(r.description) + '</div>' : '') +
        '<div class="upd-search-actions">' +
          '<button class="db-btn db-btn-sm" data-action="view-search-package" data-name="' + esc(r.name) + '" title="View details">Info</button>' +
          '<button class="db-btn db-btn-sm db-btn-primary" data-action="apply-search-single" data-name="' + esc(r.name) + '">Update</button>' +
        '</div>' +
      '</div>';
    }
    html += '</div></div>';
    el.innerHTML = html;
  }

  function toggleSearchSelectAll() {
    var allSelected = Object.keys(state.searchSelected).length === state.searchResults.length && state.searchResults.length > 0;
    if (allSelected) {
      state.searchSelected = {};
    } else {
      for (var i = 0; i < state.searchResults.length; i++) {
        state.searchSelected[state.searchResults[i].name] = true;
      }
    }
    renderSearchResults();
  }

  function confirmApplySearchSelected() {
    var names = Object.keys(state.searchSelected);
    if (!names.length) return;
    showModal('Update Selected Packages',
      '<p>This will update <strong>' + names.length + '</strong> package' + (names.length > 1 ? 's' : '') + ':</p>' +
      '<div class="modal-pkg-list">' + names.slice(0, 30).map(function (n) { return '<span class="modal-pkg-tag">' + esc(n) + '</span>'; }).join('') +
      (names.length > 30 ? '<span class="modal-pkg-more">+' + (names.length - 30) + ' more</span>' : '') + '</div>',
      'Update Packages', 'confirm-apply-search');
  }

  function executeApplySearchSelected() {
    closeModal();
    var names = Object.keys(state.searchSelected);
    if (!names.length) return;
    showProgressModal('Updating Packages', 'Updating ' + names.length + ' package(s)...');

    var chain = Promise.resolve();
    var results = { success: 0, failed: 0 };

    names.forEach(function (name) {
      chain = chain.then(function () {
        return API.updates.applySingle(name).then(function (r) {
          if (r.ok) {
            results.success++;
            appendProgressOutput('\u2713 ' + name + ' \u2014 updated');
          } else {
            results.failed++;
            appendProgressOutput('\u2717 ' + name + ' \u2014 ' + (r.error || 'failed'));
          }
        }).catch(function (e) {
          results.failed++;
          appendProgressOutput('\u2717 ' + name + ' \u2014 ' + e.message);
        });
      });
    });

    chain.then(function () {
      setProgressDone(results.failed === 0,
        results.success + ' package' + (results.success !== 1 ? 's' : '') + ' updated' + (results.failed > 0 ? ', ' + results.failed + ' failed' : ''));
      toast(results.failed === 0
        ? 'All ' + results.success + ' updates applied'
        : results.success + ' updated, ' + results.failed + ' failed',
        results.failed === 0 ? 'success' : 'error');
      state.searchSelected = {};
      loadUpdates();
      if (state.searchQuery) doSearch(state.searchQuery);
    });
  }

  function applySearchSingle(name) {
    if (!name) return;
    showProgressModal('Updating Package', 'Updating ' + name + '...');
    API.updates.applySingle(name).then(function (r) {
      if (r.ok) {
        appendProgressOutput('\u2713 ' + name + ' updated successfully');
        if (r.output) appendProgressOutput('\n' + r.output);
        setProgressDone(true, name + ' updated successfully');
        toast(name + ' updated successfully', 'success');
        loadUpdates();
        if (state.searchQuery) doSearch(state.searchQuery);
      } else {
        appendProgressOutput('\u2717 ' + name + ' failed');
        if (r.error) appendProgressOutput(r.error);
        if (r.output) appendProgressOutput('\n' + r.output);
        setProgressDone(false, name + ': ' + (r.error || 'Update failed'));
        toast(name + ': ' + (r.error || 'Failed'), 'error');
      }
    }).catch(function (e) {
      appendProgressOutput('\u2717 ' + e.message);
      setProgressDone(false, e.message);
      toast(name + ': ' + e.message, 'error');
    });
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
      try { date = new Date(h.timestamp).toLocaleString(); } catch (err) { date = h.timestamp; }
      var icon = h.success ? '\u2713' : '\u2717';
      var cls = h.success ? 'upd-hist-ok' : 'upd-hist-fail';
      var detail = '';
      if (h.type === 'panel') detail = 'Panel update';
      else if (h.type === 'single') detail = 'Package: ' + (h.package || '');
      else detail = 'All packages';
      if (h.error) detail += ' \u2014 ' + h.error;
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

    el.innerHTML =
      '<div class="upd-stat-card">' +
        '<div class="upd-stat-icon">\ud83d\udce6</div>' +
        '<div class="upd-stat-info"><div class="upd-stat-val">' + state.count + '</div><div class="upd-stat-label">Updates</div></div>' +
      '</div>' +
      '<div class="upd-stat-card">' +
        '<div class="upd-stat-icon">\ud83d\udee1\ufe0f</div>' +
        '<div class="upd-stat-info"><div class="upd-stat-val">' + securityCount + '</div><div class="upd-stat-label">Security</div></div>' +
      '</div>' +
      '<div class="upd-stat-card">' +
        '<div class="upd-stat-icon">\ud83d\udccb</div>' +
        '<div class="upd-stat-info"><div class="upd-stat-val">' + (state.history.entries ? state.history.entries.length : 0) + '</div><div class="upd-stat-label">History</div></div>' +
      '</div>' +
      '<div class="upd-stat-card">' +
        '<div class="upd-stat-icon">\ud83c\udff7\ufe0f</div>' +
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
        badge.textContent = '\u25cf';
        item.appendChild(badge);
      }
    } else {
      if (existing) existing.remove();
    }
  }

  /* ─── Modals ─── */

  function getOrCreateModal() {
    var overlay = document.getElementById('updModalOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'updModalOverlay';
    overlay.className = 'fm-modal-overlay';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);

    if (!modalListenerAttached) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) { closeModal(); return; }
        var actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;
        var act = actionBtn.getAttribute('data-action');
        if (act === 'close-modal') { closeModal(); return; }
        if (modalConfirmHandler && act === overlay.getAttribute('data-confirm-action')) {
          modalConfirmHandler();
        }
      });
      modalListenerAttached = true;
    }
    return overlay;
  }

  function setModalContent(title, bodyHtml, confirmText, confirmAction) {
    var overlay = document.getElementById('updModalOverlay');
    if (!overlay) return;
    var actionsHtml = '';
    if (confirmText) {
      actionsHtml = '<div class="fm-modal-actions">' +
        '<button class="fm-btn" data-action="close-modal">Cancel</button>' +
        '<button class="fm-btn fm-btn-primary" data-action="' + esc(confirmAction) + '">' + esc(confirmText) + '</button>' +
      '</div>';
    }
    overlay.setAttribute('data-confirm-action', confirmAction || '');
    overlay.innerHTML =
      '<div class="fm-modal" style="width:440px;">' +
        '<div class="fm-modal-header">' +
          '<span class="fm-modal-title">' + esc(title) + '</span>' +
          '<button class="fm-modal-close" data-action="close-modal">&times;</button>' +
        '</div>' +
        '<div class="fm-modal-body" id="updModalBody">' + bodyHtml + '</div>' +
        actionsHtml +
      '</div>';
    modalConfirmHandler = function () {
      if (confirmAction === 'confirm-apply') executeApplyAll();
      else if (confirmAction === 'confirm-apply-search') executeApplySearchSelected();
      else if (confirmAction === 'confirm-panel-apply') executePanelUpdate();
    };
  }

  function updateModalBody(html) {
    var body = document.getElementById('updModalBody');
    if (body) body.innerHTML = html;
  }

  function showModal(title, bodyHtml, confirmText, confirmAction) {
    var overlay = getOrCreateModal();
    setModalContent(title, bodyHtml, confirmText, confirmAction);
    overlay.style.display = 'flex';
  }

  function showProgressModal(title, initialMsg) {
    var overlay = getOrCreateModal();
    overlay.setAttribute('data-confirm-action', '');
    overlay.innerHTML =
      '<div class="fm-modal" style="width:480px;">' +
        '<div class="fm-modal-header">' +
          '<span class="fm-modal-title">' + esc(title) + '</span>' +
        '</div>' +
        '<div class="fm-modal-body"><div class="upd-progress">' +
          '<div class="upd-progress-status" id="updProgressStatus">' + esc(initialMsg) + '</div>' +
          '<div class="upd-progress-output" id="updProgressOutput"></div>' +
        '</div></div>' +
      '</div>';
    overlay.style.display = 'flex';
  }

  function appendProgressOutput(text) {
    var el = document.getElementById('updProgressOutput');
    if (el) {
      el.textContent += text + '\n';
      el.scrollTop = el.scrollHeight;
    }
  }

  function setProgressDone(success, message) {
    var status = document.getElementById('updProgressStatus');
    if (status) {
      status.className = 'upd-progress-status ' + (success ? 'upd-progress-ok' : 'upd-progress-fail');
      status.textContent = message;
    }
    var existingFooter = document.querySelector('#updModalOverlay .fm-modal-actions');
    if (existingFooter) existingFooter.remove();
    var footer = document.createElement('div');
    footer.className = 'fm-modal-actions';
    footer.innerHTML = '<button class="fm-btn fm-btn-primary" data-action="close-modal">Done</button>';
    var modal = document.querySelector('#updModalOverlay .fm-modal');
    if (modal) modal.appendChild(footer);
  }

  function closeModal() {
    var overlay = document.getElementById('updModalOverlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
    }
    modalConfirmHandler = null;
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
    }, 3500);
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
