(function () {
  var mimeState = {
    system: null,
    user: [],
    filter: '',
    editingId: null,
    userSearch: '',
    userSort: 'mimeType',
    userSortDir: 'asc',
    userPage: 1,
    selectedIds: new Set(),
    deleteModalData: null,
  };

  var USER_PER_PAGE = 20;

  var CATEGORY_ICONS = {
    application: '\u{1F4E6}', text: '\u{1F4DD}', image: '\u{1F5BC}',
    audio: '\u{1F3B5}', video: '\u{1F3AC}', font: '\u{1F524}',
    message: '\u{2709}', model: '\u{1F3D7}', multipart: '\u{1F4CE}',
  };

  var DEFAULT_COLORS = {
    application: '#06b6d4', text: '#10b981', image: '#ec4899',
    audio: '#f59e0b', video: '#8b5cf6', font: '#3b82f6',
    message: '#14b8a6', model: '#f97316', multipart: '#64748b',
  };

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return '&#' + c.charCodeAt(0) + ';';
    });
  }

  function showToast(msg, type) {
    var el = document.getElementById('mimeToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'mime-toast ' + (type || 'info');
    el.style.display = 'block';
    if (mimeState._toastTimer) clearTimeout(mimeState._toastTimer);
    mimeState._toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function setButtonLoading(btn, loading, originalText) {
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.dataset.mtOriginalText = btn.textContent;
      btn.textContent = originalText || 'Loading...';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.mtOriginalText || originalText || btn.textContent;
    }
  }

  window.initMimetypes = async function () {
    try {
      var me = await API.me();
      if (me.role !== 'admin') {
        document.getElementById('mimeContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">Admin access required</span></div>';
        return;
      }
      showLoading();
      await loadAll();
    } catch {
      document.getElementById('mimeContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">Failed to load MIME types</span></div>';
    }
  };

  function showLoading() {
    var el = document.getElementById('mimeContent');
    if (el) el.innerHTML = '<div class="mime-loading"><div class="mime-loading-bar"></div><div class="mime-loading-bar short"></div><div class="mime-loading-bar"></div></div>';
  }

  async function loadAll() {
    try {
      var results = await Promise.all([API.mimetypes.getSystem(), API.mimetypes.list()]);
      mimeState.system = results[0];
      mimeState.user = results[1];
      var el = document.getElementById('mimeContent');
      if (el) {
        el.innerHTML = '<div class="mime-section"><div class="mime-section-header"><span class="mime-section-title">System MIME Types</span><span class="mime-section-desc">Read-only definitions from /etc/mime.types</span></div><div id="mimeSystemTypes" class="mime-system-types"></div></div>'
          + '<div class="mime-section"><div class="mime-section-header"><span class="mime-section-title">User-Defined MIME Types</span></div><div id="mimeUserTypes" class="mime-user-types"></div></div>';
      }
      render();
    } catch (err) {
      document.getElementById('mimeContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">Error loading data: ' + esc(err.message) + '</span></div>';
    }
  }

  function render() {
    renderHeader();
    renderSystem();
    renderUser();
  }

  function renderHeader() {
    if (!mimeState.system) return;
    var el = document.getElementById('mimeStats');
    var userCount = mimeState.user ? mimeState.user.length : 0;
    el.innerHTML = '<span class="mime-stat"><strong>' + mimeState.system.total + '</strong> system</span>'
      + '<span class="mime-stat-sep">|</span>'
      + '<span class="mime-stat"><strong>' + userCount + '</strong> custom</span>';
  }

  function renderSystem() {
    var el = document.getElementById('mimeSystemTypes');
    if (!mimeState.system || !mimeState.system.categories) {
      el.innerHTML = '<div class="mime-empty">No system MIME types found</div>';
      return;
    }
    var cats = mimeState.system.categories;
    var colors = mimeState.system.colors || DEFAULT_COLORS;
    var total = mimeState.system.total || 1;
    var catEntries = Object.entries(cats).sort(function (a, b) { return b[1].length - a[1].length; });

    var html = '<div class="mime-distribution">';
    for (var ci = 0; ci < catEntries.length; ci++) {
      var cat = catEntries[ci][0];
      var entries = catEntries[ci][1];
      var pct = Math.round((entries.length / total) * 100);
      var color = colors[cat] || '#64748b';
      html += '<div class="mime-dist-item">'
        + '<span class="mime-dist-label">' + esc(CATEGORY_ICONS[cat] || '\u{1F4C4}') + ' ' + esc(cat) + '</span>'
        + '<div class="mime-dist-bar-wrap"><div class="mime-dist-bar" style="width:' + pct + '%;background:' + color + '"></div></div>'
        + '<span class="mime-dist-pct">' + pct + '%</span>'
        + '<span class="mime-dist-count">' + entries.length + '</span>'
        + '</div>';
    }
    html += '</div>';

    var filter = mimeState.filter.toLowerCase();

    for (var ci2 = 0; ci2 < catEntries.length; ci2++) {
      var cat2 = catEntries[ci2][0];
      var entries2 = catEntries[ci2][1];
      var color2 = colors[cat2] || '#64748b';
      var filtered = filter ? entries2.filter(function (e) {
        return e.mimeType.toLowerCase().indexOf(filter) !== -1
          || e.extensions.some(function (ext) { return ext.toLowerCase().indexOf(filter) !== -1; });
      }) : entries2;
      if (filter && filtered.length === 0) continue;

      html += '<div class="mime-category">'
        + '<div class="mime-category-header" data-mt-action="toggle-cat">'
        + '<span class="mime-cat-toggle">\u25BC</span>'
        + '<span class="mime-cat-icon">' + esc(CATEGORY_ICONS[cat2] || '\u{1F4C4}') + '</span>'
        + '<span class="mime-cat-name" style="color:' + color2 + '">' + esc(cat2) + '</span>'
        + '<span class="mime-cat-count">' + filtered.length + (filter && filtered.length !== entries2.length ? '/' + entries2.length : '') + '</span>'
        + '</div>'
        + '<div class="mime-category-body">';

      var visible = filtered.slice(0, filter ? 500 : 150);
      for (var vi = 0; vi < visible.length; vi++) {
        var entry = visible[vi];
        html += '<div class="mime-entry">'
          + '<span class="mime-entry-type">' + esc(entry.mimeType) + '</span>'
          + '<span class="mime-entry-exts">';
        if (entry.extensions.length > 0) {
          for (var ei = 0; ei < Math.min(entry.extensions.length, 4); ei++) {
            html += '<code class="mime-ext">' + esc(entry.extensions[ei]) + '</code>';
          }
          if (entry.extensions.length > 4) {
            html += '<span class="mime-ext-more">+' + (entry.extensions.length - 4) + '</span>';
          }
        } else {
          html += '<span class="mime-no-ext">\u2014</span>';
        }
        html += '</span></div>';
      }
      if (!filter && entries2.length > 150) {
        html += '<div class="mime-more">+' + (entries2.length - 150) + ' more...</div>';
      }

      html += '</div></div>';
    }

    el.innerHTML = html;
  }

  function renderUser() {
    var el = document.getElementById('mimeUserTypes');
    var types = mimeState.user || [];

    var filtered = types;
    if (mimeState.userSearch) {
      var q = mimeState.userSearch.toLowerCase();
      filtered = types.filter(function (t) {
        return t.mimeType.toLowerCase().indexOf(q) !== -1
          || t.extensions.some(function (e) { return e.toLowerCase().indexOf(q) !== -1; })
          || (t.description && t.description.toLowerCase().indexOf(q) !== -1);
      });
    }

    var sortField = mimeState.userSort;
    var sortDir = mimeState.userSortDir === 'asc' ? 1 : -1;
    filtered.sort(function (a, b) {
      var av = a[sortField] || '';
      var bv = b[sortField] || '';
      if (sortField === 'extensions') { av = a.extensions.length; bv = b.extensions.length; }
      if (sortField === 'createdAt') { av = a.createdAt || ''; bv = b.createdAt || ''; }
      if (typeof av === 'string') return av.localeCompare(bv) * sortDir;
      return (av - bv) * sortDir;
    });

    var total = filtered.length;
    var page = mimeState.userPage;
    var pages = Math.ceil(total / USER_PER_PAGE);
    if (page > pages) page = pages || 1;
    mimeState.userPage = page;
    var start = (page - 1) * USER_PER_PAGE;
    var pageItems = filtered.slice(start, start + USER_PER_PAGE);

    var selectedCount = mimeState.selectedIds.size;

    var html = '';

    if (types.length > 0) {
      html += '<div class="mime-toolbar">';
      html += '<input type="text" id="mimeUserSearch" class="db-search-input" placeholder="Search custom types..." value="' + esc(mimeState.userSearch) + '" data-mt-action="user-search" style="width:200px">';
      html += '<div class="mime-toolbar-actions">';
      html += '<button class="db-btn" data-mt-action="export-types">Export</button>';
      html += '<button class="db-btn" data-mt-action="import-types">Import</button>';
      html += '<button class="db-btn db-btn-primary" data-mt-action="open-add">+ Add Custom</button>';
      html += '</div>';
      html += '</div>';
    }

    if (selectedCount > 0) {
      html += '<div class="mime-bulk-bar">';
      html += '<span>' + selectedCount + ' selected</span>';
      html += '<button class="db-btn db-btn-danger db-btn-sm" data-mt-action="bulk-delete">Delete Selected</button>';
      html += '<button class="db-btn db-btn-sm" data-mt-action="bulk-deselect">Deselect All</button>';
      html += '</div>';
    }

    if (types.length === 0) {
      html += '<div class="mime-empty">No custom MIME types yet. Click "+ Add Custom" to create one.</div>';
      el.innerHTML = html;
      return;
    }

    if (total === 0) {
      html += '<div class="mime-empty">No types match your search.</div>';
      el.innerHTML = html;
      return;
    }

    var sortIndicator = function (field) {
      if (mimeState.userSort !== field) return '';
      return mimeState.userSortDir === 'asc' ? ' \u25B2' : ' \u25BC';
    };

    html += '<div class="mime-user-sort-bar">';
    html += '<span class="mime-sort-btn" data-mt-action="sort" data-mt-sort="mimeType">Type' + sortIndicator('mimeType') + '</span>';
    html += '<span class="mime-sort-btn" data-mt-action="sort" data-mt-sort="extensions">Exts' + sortIndicator('extensions') + '</span>';
    html += '<span class="mime-sort-btn" data-mt-action="sort" data-mt-sort="createdAt">Date' + sortIndicator('createdAt') + '</span>';
    html += '</div>';

    for (var i = 0; i < pageItems.length; i++) {
      var t = pageItems[i];
      var color = DEFAULT_COLORS[t.mimeType.split('/')[0]] || '#06b6d4';
      var checked = mimeState.selectedIds.has(t.id) ? 'checked' : '';
      html += '<div class="mime-user-card' + (checked ? ' selected' : '') + '" data-id="' + esc(t.id) + '">'
        + '<div class="mime-user-check">'
        + '<input type="checkbox" ' + checked + ' data-mt-action="toggle-select" data-mt-id="' + esc(t.id) + '">'
        + '</div>'
        + '<div class="mime-user-info">'
        + '<div class="mime-user-type" style="--mime-color:' + color + '">' + esc(t.mimeType) + '</div>'
        + '<div class="mime-user-exts">';
      for (var j = 0; j < t.extensions.length; j++) {
        html += '<code class="mime-ext">' + esc(t.extensions[j]) + '</code>';
      }
      html += '</div>';
      if (t.description) {
        html += '<div class="mime-user-desc">' + esc(t.description) + '</div>';
      }
      html += '</div>'
        + '<div class="mime-user-actions">'
        + '<button class="mime-btn mime-btn-icon" data-mt-action="edit" data-mt-id="' + esc(t.id) + '" title="Edit">\u270E</button>'
        + '<button class="mime-btn mime-btn-icon mime-btn-danger" data-mt-action="delete-single" data-mt-id="' + esc(t.id) + '" title="Delete">\u{1F5D1}</button>'
        + '</div>'
        + '</div>';
    }

    if (pages > 1) {
      html += '<div class="mime-pagination">';
      html += '<button class="db-btn db-btn-sm" data-mt-action="user-prev-page" ' + (page <= 1 ? 'disabled' : '') + '>Prev</button>';
      html += '<span class="mime-pagination-info">Page ' + page + ' of ' + pages + '</span>';
      html += '<button class="db-btn db-btn-sm" data-mt-action="user-next-page" ' + (page >= pages ? 'disabled' : '') + '>Next</button>';
      html += '</div>';
    }

    el.innerHTML = html;

    var searchInput = document.getElementById('mimeUserSearch');
    if (searchInput) {
      searchInput.value = mimeState.userSearch;
      searchInput.focus();
    }
  }

  function openAddMime() {
    mimeState.editingId = null;
    document.getElementById('mimeModalTitle').textContent = 'Add Custom MIME Type';
    document.getElementById('mimeModalType').value = '';
    document.getElementById('mimeModalExts').value = '';
    document.getElementById('mimeModalDesc').value = '';
    document.getElementById('mimeModalError').textContent = '';
    document.getElementById('mimeModalError').style.display = 'none';
    document.getElementById('mimeModalOverlap').innerHTML = '';
    document.getElementById('mimeModalOverlap').style.display = 'none';
    document.getElementById('mimeModalOverlay').style.display = 'flex';
  }

  function openEditMime(id) {
    var t = mimeState.user.find(function (x) { return x.id === id; });
    if (!t) return;
    mimeState.editingId = id;
    document.getElementById('mimeModalTitle').textContent = 'Edit MIME Type';
    document.getElementById('mimeModalType').value = t.mimeType;
    document.getElementById('mimeModalExts').value = t.extensions.join(', ');
    document.getElementById('mimeModalDesc').value = t.description || '';
    document.getElementById('mimeModalError').textContent = '';
    document.getElementById('mimeModalError').style.display = 'none';
    document.getElementById('mimeModalOverlap').innerHTML = '';
    document.getElementById('mimeModalOverlap').style.display = 'none';
    document.getElementById('mimeModalOverlay').style.display = 'flex';
  }

  function closeMimeModal() {
    document.getElementById('mimeModalOverlay').style.display = 'none';
  }

  function showDeleteModal(id) {
    var t = mimeState.user.find(function (x) { return x.id === id; });
    if (!t) return;
    mimeState.deleteModalData = { type: 'single', id: id, mimeType: t.mimeType };
    var modal = document.getElementById('mimeDeleteModal');
    document.getElementById('mimeDeleteModalTitle').textContent = 'Delete MIME Type';
    document.getElementById('mimeDeleteModalBody').innerHTML = '<p>Are you sure you want to delete <strong>' + esc(t.mimeType) + '</strong>?</p><p class="mime-delete-modal-warning">This action cannot be undone.</p>';
    modal.style.display = 'flex';
  }

  function showBulkDeleteModal() {
    var count = mimeState.selectedIds.size;
    mimeState.deleteModalData = { type: 'bulk' };
    var modal = document.getElementById('mimeDeleteModal');
    document.getElementById('mimeDeleteModalTitle').textContent = 'Delete ' + count + ' MIME Types';
    document.getElementById('mimeDeleteModalBody').innerHTML = '<p>Are you sure you want to delete <strong>' + count + ' MIME types</strong>?</p><p class="mime-delete-modal-warning">This action cannot be undone.</p>';
    modal.style.display = 'flex';
  }

  function hideDeleteModal() {
    mimeState.deleteModalData = null;
    var modal = document.getElementById('mimeDeleteModal');
    if (modal) modal.style.display = 'none';
  }

  async function confirmDeleteModalAction() {
    var d = mimeState.deleteModalData;
    if (!d) return;
    if (d.type === 'single') {
      try {
        await API.mimetypes.del(d.id);
        showToast('MIME type deleted', 'success');
        mimeState.selectedIds.delete(d.id);
        await loadAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    } else if (d.type === 'bulk') {
      try {
        var ids = Array.from(mimeState.selectedIds);
        await API.mimetypes.bulkDelete(ids);
        showToast(ids.length + ' MIME types deleted', 'success');
        mimeState.selectedIds.clear();
        await loadAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
    hideDeleteModal();
  }

  async function saveMime() {
    var type = document.getElementById('mimeModalType').value.trim();
    var extsRaw = document.getElementById('mimeModalExts').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var desc = document.getElementById('mimeModalDesc').value.trim();
    var errEl = document.getElementById('mimeModalError');
    var overlapEl = document.getElementById('mimeModalOverlap');
    var btn = document.querySelector('[data-mt-action="save-mime"]');

    if (!type) { errEl.textContent = 'MIME type is required'; errEl.style.display = 'block'; return; }
    if (extsRaw.length === 0) { errEl.textContent = 'At least one extension is required'; errEl.style.display = 'block'; return; }

    setButtonLoading(btn, true, 'Saving...');
    errEl.style.display = 'none';
    overlapEl.style.display = 'none';

    try {
      if (mimeState.editingId) {
        await API.mimetypes.update(mimeState.editingId, { mimeType: type, extensions: extsRaw, description: desc });
      } else {
        await API.mimetypes.create({ mimeType: type, extensions: extsRaw, description: desc });
      }
      closeMimeModal();
      showToast(mimeState.editingId ? 'MIME type updated' : 'MIME type created', 'success');
      await loadAll();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      setButtonLoading(btn, false, 'Save');
    }
  }

  function openImportModal() {
    document.getElementById('mimeImportOverlay').style.display = 'flex';
    document.getElementById('mimeImportData').value = '';
    document.getElementById('mimeImportError').style.display = 'none';
  }

  function closeImportModal() {
    document.getElementById('mimeImportOverlay').style.display = 'none';
  }

  async function doImport() {
    var raw = document.getElementById('mimeImportData').value.trim();
    var errEl = document.getElementById('mimeImportError');
    var btn = document.querySelector('[data-mt-action="do-import"]');

    if (!raw) { errEl.textContent = 'Paste JSON data to import'; errEl.style.display = 'block'; return; }

    var data;
    try { data = JSON.parse(raw); } catch { errEl.textContent = 'Invalid JSON'; errEl.style.display = 'block'; return; }
    if (!Array.isArray(data)) { errEl.textContent = 'Data must be a JSON array'; errEl.style.display = 'block'; return; }

    setButtonLoading(btn, true, 'Importing...');
    try {
      var result = await API.mimetypes.importTypes(data);
      closeImportModal();
      showToast('Imported: ' + result.imported + ', Skipped: ' + result.skipped, 'success');
      await loadAll();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      setButtonLoading(btn, false, 'Import');
    }
  }

  async function doExport() {
    try {
      var types = await API.mimetypes.list();
      var blob = new Blob([JSON.stringify(types, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'mime-types-export.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Exported ' + types.length + ' types', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-mt-action]');
    if (!btn) return;
    var action = btn.dataset.mtAction;

    switch (action) {
      case 'toggle-cat': {
        e.preventDefault();
        var body = btn.nextElementSibling;
        var toggle = btn.querySelector('.mime-cat-toggle');
        if (body.style.display === 'none') {
          body.style.display = 'block';
          toggle.textContent = '\u25BC';
        } else {
          body.style.display = 'none';
          toggle.textContent = '\u25B6';
        }
        break;
      }
      case 'open-add':
        e.preventDefault();
        openAddMime();
        break;
      case 'save-mime':
        e.preventDefault();
        saveMime();
        break;
      case 'close-modal':
        e.preventDefault();
        closeMimeModal();
        break;
      case 'edit':
        e.preventDefault();
        openEditMime(btn.dataset.mtId);
        break;
      case 'delete-single':
        e.preventDefault();
        showDeleteModal(btn.dataset.mtId);
        break;
      case 'confirm-delete':
        e.preventDefault();
        confirmDeleteModalAction();
        break;
      case 'cancel-delete':
        e.preventDefault();
        hideDeleteModal();
        break;
      case 'toggle-select': {
        var id = btn.dataset.mtId;
        if (btn.checked) {
          mimeState.selectedIds.add(id);
        } else {
          mimeState.selectedIds.delete(id);
        }
        renderUser();
        break;
      }
      case 'bulk-delete':
        e.preventDefault();
        showBulkDeleteModal();
        break;
      case 'bulk-deselect':
        e.preventDefault();
        mimeState.selectedIds.clear();
        renderUser();
        break;
      case 'sort': {
        e.preventDefault();
        var field = btn.dataset.mtSort;
        if (mimeState.userSort === field) {
          mimeState.userSortDir = mimeState.userSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          mimeState.userSort = field;
          mimeState.userSortDir = 'asc';
        }
        renderUser();
        break;
      }
      case 'user-prev-page':
        e.preventDefault();
        if (mimeState.userPage > 1) { mimeState.userPage--; renderUser(); }
        break;
      case 'user-next-page':
        e.preventDefault();
        mimeState.userPage++;
        renderUser();
        break;
      case 'export-types':
        e.preventDefault();
        doExport();
        break;
      case 'import-types':
        e.preventDefault();
        openImportModal();
        break;
      case 'do-import':
        e.preventDefault();
        doImport();
        break;
      case 'close-import':
        e.preventDefault();
        closeImportModal();
        break;
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'mimeSystemSearch') {
      mimeState.filter = e.target.value;
      renderSystem();
    }
    if (e.target.dataset.mtAction === 'user-search') {
      mimeState.userSearch = e.target.value;
      mimeState.userPage = 1;
      renderUser();
    }
  });

  document.addEventListener('click', function (e) {
    var overlay = document.getElementById('mimeModalOverlay');
    if (overlay && e.target === overlay) closeMimeModal();
    var deleteOverlay = document.getElementById('mimeDeleteModal');
    if (deleteOverlay && e.target === deleteOverlay) hideDeleteModal();
    var importOverlay = document.getElementById('mimeImportOverlay');
    if (importOverlay && e.target === importOverlay) closeImportModal();
  });
})();
