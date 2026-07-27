(function () {
  'use strict';

  var cronState = {
    owner: 'root',
    entries: [],
    filteredEntries: [],
    owners: [],
    loading: false,
    error: null,
    search: '',
    sort: { field: 'command', dir: 'asc' },
    page: 1,
    perPage: 50,
    confirmCb: null,
  };

  var PRESETS = {
    minute: { minute: '*', hour: '*', dom: '*', month: '*', dow: '*', label: 'Every minute' },
    hourly: { minute: '0', hour: '*', dom: '*', month: '*', dow: '*', label: 'Every hour' },
    daily: { minute: '0', hour: '0', dom: '*', month: '*', dow: '*', label: 'Every day at midnight' },
    weekly: { minute: '0', hour: '0', dom: '*', month: '*', dow: '0', label: 'Every Sunday at midnight' },
    monthly: { minute: '0', hour: '0', dom: '1', month: '*', dow: '*', label: '1st of every month' },
  };

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function $(id) { return document.getElementById(id); }

  function showLoading() {
    var loading = $('cronLoading');
    var content = $('cronContent');
    var error = $('cronError');
    var empty = $('cronEmpty');
    var stats = $('cronStats');
    if (loading) loading.style.display = 'block';
    if (content) content.style.display = 'none';
    if (error) error.style.display = 'none';
    if (empty) empty.style.display = 'none';
    if (stats) stats.style.display = 'none';
  }

  function showError(msg) {
    var loading = $('cronLoading');
    var content = $('cronContent');
    var error = $('cronError');
    var empty = $('cronEmpty');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'none';
    if (error) {
      error.style.display = 'block';
      error.innerHTML = '<div style="text-align:center;padding:20px;">' +
        '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:8px;">' + esc(msg) + '</div>' +
        '<button class="cron-btn" data-cron-action="retry" style="width:auto;height:auto;padding:6px 16px;font-size:13px;">Retry</button>' +
        '</div>';
    }
    if (empty) empty.style.display = 'none';
  }

  function showEmpty(msg) {
    var loading = $('cronLoading');
    var content = $('cronContent');
    var error = $('cronError');
    var empty = $('cronEmpty');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'none';
    if (error) error.style.display = 'none';
    if (empty) {
      empty.style.display = 'block';
      empty.innerHTML = '<div style="text-align:center;padding:30px;">' +
        '<div style="font-size:40px;margin-bottom:10px;">&#9200;</div>' +
        '<div style="font-size:14px;color:var(--text-secondary);">' + esc(msg) + '</div>' +
        '</div>';
    }
  }

  function showContent() {
    var loading = $('cronLoading');
    var content = $('cronContent');
    var error = $('cronError');
    var empty = $('cronEmpty');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
    if (error) error.style.display = 'none';
    if (empty) empty.style.display = 'none';
  }

  function showToast(msg, type) {
    var existing = document.querySelector('.cron-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'cron-toast';
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:10000;padding:10px 18px;border-radius:6px;font-size:13px;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.3);animation:cron-shimmer .3s;max-width:400px;';
    if (type === 'error') toast.style.background = '#ef4444';
    else if (type === 'warn') toast.style.background = '#f59e0b';
    else toast.style.background = '#22c55e';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3000);
  }

  function showConfirm(title, msg, cb) {
    cronState.confirmCb = cb;
    var overlay = $('cronConfirmOverlay');
    var titleEl = $('cronConfirmTitle');
    var msgEl = $('cronConfirmMsg');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = msg;
    if (overlay) overlay.style.display = 'flex';
  }

  function hideConfirm() {
    cronState.confirmCb = null;
    var overlay = $('cronConfirmOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function getFreqClass(entry) {
    if (entry.shorthand === '@reboot') return 'cron-freq-reboot';
    if (entry.shorthand) return 'cron-freq-yearly';
    if (entry.minute === '*' && entry.hour === '*') return 'cron-freq-every';
    if (entry.minute.includes('/') && entry.hour === '*') return 'cron-freq-minute';
    if (entry.hour === '*') return 'cron-freq-minute';
    if (entry.dom === '*' && entry.dow === '*') return 'cron-freq-daily';
    if (entry.dow !== '*' && entry.dom === '*') return 'cron-freq-weekly';
    if (entry.dom !== '*' || entry.month !== '*') return 'cron-freq-monthly';
    return 'cron-freq-other';
  }

  function getFreqLabel(entry) {
    if (entry.shorthand) return entry.shorthand;
    if (entry.minute === '*' && entry.hour === '*') return '* *';
    if (entry.hour === '*') return entry.minute + ' *';
    return entry.hour + ':' + (entry.minute === '*' ? '*' : entry.minute.padStart(2, '0'));
  }

  function filterEntries() {
    var q = cronState.search.toLowerCase();
    var entries = cronState.entries.slice();
    if (q) {
      entries = entries.filter(function (e) {
        return (e.command && e.command.toLowerCase().indexOf(q) !== -1) ||
          (e.description && e.description.toLowerCase().indexOf(q) !== -1) ||
          (e.shorthand && e.shorthand.toLowerCase().indexOf(q) !== -1);
      });
    }
    var s = cronState.sort;
    entries.sort(function (a, b) {
      var av, bv;
      if (s.field === 'command') { av = a.command || ''; bv = b.command || ''; }
      else if (s.field === 'schedule') { av = a.minute + ' ' + a.hour + ' ' + a.dom + ' ' + a.month + ' ' + a.dow; bv = b.minute + ' ' + b.hour + ' ' + b.dom + ' ' + b.month + ' ' + b.dow; }
      else if (s.field === 'nextRun') { av = a.nextRun || ''; bv = b.nextRun || ''; }
      else if (s.field === 'enabled') { av = a.enabled ? 1 : 0; bv = b.enabled ? 1 : 0; }
      else { av = ''; bv = ''; }
      if (typeof av === 'string') {
        var cmp = av.localeCompare(bv);
        return s.dir === 'asc' ? cmp : -cmp;
      }
      return s.dir === 'asc' ? av - bv : bv - av;
    });
    cronState.filteredEntries = entries;
    cronState.page = 1;
  }

  function renderStats() {
    var stats = $('cronStats');
    if (!stats) return;
    var total = cronState.entries.length;
    var enabled = cronState.entries.filter(function (e) { return e.enabled; }).length;
    var disabled = total - enabled;
    var owners = cronState.owners.length;
    stats.style.display = 'grid';
    stats.innerHTML =
      '<div class="cron-stat-card"><div class="cron-stat-value">' + total + '</div><div class="cron-stat-label">Total Jobs</div></div>' +
      '<div class="cron-stat-card"><div class="cron-stat-value" style="color:#22c55e;">' + enabled + '</div><div class="cron-stat-label">Active</div></div>' +
      '<div class="cron-stat-card"><div class="cron-stat-value" style="color:#f59e0b;">' + disabled + '</div><div class="cron-stat-label">Disabled</div></div>' +
      '<div class="cron-stat-card"><div class="cron-stat-value" style="color:var(--accent-cyan);">' + owners + '</div><div class="cron-stat-label">Owners</div></div>';
  }

  function renderList() {
    var el = $('cronList');
    if (!el) return;
    var entries = cronState.filteredEntries;
    var total = entries.length;
    var page = cronState.page;
    var perPage = cronState.perPage;
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    if (page > totalPages) page = totalPages;
    cronState.page = page;
    var start = (page - 1) * perPage;
    var pageEntries = entries.slice(start, start + perPage);

    if (!total) {
      showEmpty(cronState.search ? 'No matching cron jobs' : 'No cron jobs for ' + cronState.owner);
      return;
    }

    showContent();
    el.innerHTML = pageEntries.map(function (e) {
      var entryIdx = e.index;
      var freqClass = getFreqClass(e);
      var freqLabel = getFreqLabel(e);
      var scheduleText = e.shorthand || (e.minute + ' ' + e.hour + ' ' + e.dom + ' ' + e.month + ' ' + e.dow);
      var nextStr = '';
      if (e.nextRunFormatted && e.enabled) nextStr = '<div class="cron-next">in ' + esc(e.nextRunFormatted) + '</div>';
      var disabledCls = e.enabled ? '' : ' cron-disabled';
      return '<div class="cron-entry' + disabledCls + '">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<span class="cron-schedule-badge ' + freqClass + '">' + esc(freqLabel) + '</span>' +
            '<span class="cron-schedule-text">' + esc(scheduleText) + '</span>' +
            nextStr +
          '</div>' +
          '<div class="cron-cmd" title="' + esc(e.command) + '">' + esc(e.command) + '</div>' +
          '<div class="cron-desc">' + esc(e.description || '') + '</div>' +
        '</div>' +
        '<div class="cron-actions">' +
          '<button class="cron-btn" data-cron-action="detail" data-idx="' + entryIdx + '" title="View details">&#8505;</button>' +
          '<button class="cron-btn" data-cron-action="toggle" data-idx="' + entryIdx + '" title="' + (e.enabled ? 'Disable' : 'Enable') + '">' + (e.enabled ? '&#9646;&#9646;' : '&#9654;') + '</button>' +
          '<button class="cron-btn" data-cron-action="edit" data-idx="' + entryIdx + '" title="Edit">&#9998;</button>' +
          '<button class="cron-btn cron-btn-danger" data-cron-action="delete" data-idx="' + entryIdx + '" title="Delete">&#128465;</button>' +
        '</div>' +
        '</div>';
    }).join('');

    var pag = $('cronPagination');
    if (!pag) return;
    if (totalPages <= 1) { pag.style.display = 'none'; return; }
    pag.style.display = 'flex';
    var pagHtml = '';
    pagHtml += '<button class="cron-page-btn" data-cron-action="page" data-page="1" ' + (page === 1 ? 'disabled' : '') + '>&laquo;</button>';
    pagHtml += '<button class="cron-page-btn" data-cron-action="page" data-page="' + (page - 1) + '" ' + (page === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
    var range = 2;
    var startPage = Math.max(1, page - range);
    var endPage = Math.min(totalPages, page + range);
    if (startPage > 1) pagHtml += '<span class="cron-page-info">...</span>';
    for (var p = startPage; p <= endPage; p++) {
      pagHtml += '<button class="cron-page-btn' + (p === page ? ' active' : '') + '" data-cron-action="page" data-page="' + p + '">' + p + '</button>';
    }
    if (endPage < totalPages) pagHtml += '<span class="cron-page-info">...</span>';
    pagHtml += '<button class="cron-page-btn" data-cron-action="page" data-page="' + (page + 1) + '" ' + (page === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
    pagHtml += '<button class="cron-page-btn" data-cron-action="page" data-page="' + totalPages + '" ' + (page === totalPages ? 'disabled' : '') + '>&raquo;</button>';
    pagHtml += '<span class="cron-page-info">' + total + ' jobs, page ' + page + '/' + totalPages + '</span>';
    pag.innerHTML = pagHtml;
  }

  function renderOwners() {
    var sel = $('cronOwnerSel');
    if (!sel) return;
    sel.innerHTML = cronState.owners.map(function (o) {
      return '<option value="' + esc(o.name) + '"' + (o.name === cronState.owner ? ' selected' : '') + '>' + esc(o.name) + ' (' + o.entries + ')</option>';
    }).join('');
  }

  function render() {
    renderOwners();
    renderStats();
    filterEntries();
    renderList();
  }

  async function loadCron() {
    showLoading();
    cronState.loading = true;
    cronState.error = null;
    try {
      var me = await API.me();
      if (me.role !== 'admin') return;
      cronState.owners = await API.cron.getOwners();
      if (!cronState.owners.length) {
        cronState.owners = [{ name: 'root', entries: 0 }];
      }
      var ownerNames = cronState.owners.map(function (o) { return o.name; });
      if (ownerNames.indexOf(cronState.owner) === -1) {
        cronState.owner = cronState.owners[0].name;
      }
      cronState.entries = await API.cron.list(cronState.owner);
      render();
    } catch (e) {
      cronState.error = e.message || 'Failed to load cron jobs';
      showError(cronState.error);
    }
    cronState.loading = false;
  }

  function openAddModal() {
    var overlay = $('cronModalOverlay');
    var title = $('cronModalTitle');
    var idx = $('cronEditIndex');
    var minute = $('cronMinute');
    var hour = $('cronHour');
    var dom = $('cronDom');
    var month = $('cronMonth');
    var dow = $('cronDow');
    var cmd = $('cronCommand');
    var useShort = $('cronUseShorthand');
    var shortSel = $('cronShorthand');
    var schedFields = $('cronScheduleFields');
    var desc = $('cronDescription');
    if (title) title.textContent = 'Add Cron Job';
    if (idx) idx.value = '-1';
    if (minute) minute.value = '*';
    if (hour) hour.value = '*';
    if (dom) dom.value = '*';
    if (month) month.value = '*';
    if (dow) dow.value = '*';
    if (cmd) cmd.value = '';
    if (useShort) useShort.checked = false;
    if (shortSel) shortSel.style.display = 'none';
    if (schedFields) schedFields.style.display = 'grid';
    if (desc) desc.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';
  }

  function openEditModal(idx) {
    var e = cronState.entries[idx];
    if (!e) return;
    var overlay = $('cronModalOverlay');
    var title = $('cronModalTitle');
    var editIdx = $('cronEditIndex');
    var minute = $('cronMinute');
    var hour = $('cronHour');
    var dom = $('cronDom');
    var month = $('cronMonth');
    var dow = $('cronDow');
    var cmd = $('cronCommand');
    var useShort = $('cronUseShorthand');
    var shortSel = $('cronShorthand');
    var schedFields = $('cronScheduleFields');
    if (title) title.textContent = 'Edit Cron Job';
    if (editIdx) editIdx.value = idx;
    if (e.shorthand) {
      if (useShort) useShort.checked = true;
      if (shortSel) { shortSel.style.display = 'inline-block'; shortSel.value = e.shorthand; }
      if (schedFields) schedFields.style.display = 'none';
    } else {
      if (useShort) useShort.checked = false;
      if (shortSel) shortSel.style.display = 'none';
      if (schedFields) schedFields.style.display = 'grid';
    }
    if (minute) minute.value = e.minute;
    if (hour) hour.value = e.hour;
    if (dom) dom.value = e.dom;
    if (month) month.value = e.month;
    if (dow) dow.value = e.dow;
    if (cmd) cmd.value = e.command;
    updateDescription();
    if (overlay) overlay.style.display = 'flex';
  }

  function openDetailModal(idx) {
    var e = cronState.entries[idx];
    if (!e) return;
    var body = $('cronDetailBody');
    var overlay = $('cronDetailOverlay');
    if (!body) return;
    var schedule = e.shorthand || (e.minute + ' ' + e.hour + ' ' + e.dom + ' ' + e.month + ' ' + e.dow);
    var status = e.enabled ? '<span style="color:#22c55e;">Active</span>' : '<span style="color:#f59e0b;">Disabled</span>';
    body.innerHTML =
      '<div class="cron-detail-row"><span class="cron-detail-label">Status</span><span class="cron-detail-value">' + status + '</span></div>' +
      '<div class="cron-detail-row"><span class="cron-detail-label">Schedule</span><span class="cron-detail-value">' + esc(schedule) + '</span></div>' +
      '<div class="cron-detail-row"><span class="cron-detail-label">Description</span><span class="cron-detail-value">' + esc(e.description || '-') + '</span></div>' +
      '<div class="cron-detail-row"><span class="cron-detail-label">Command</span><span class="cron-detail-value" style="word-break:break-all;">' + esc(e.command) + '</span></div>' +
      '<div class="cron-detail-row"><span class="cron-detail-label">Minute</span><span class="cron-detail-value">' + esc(e.minute) + '</span></div>' +
      '<div class="cron-detail-row"><span class="cron-detail-label">Hour</span><span class="cron-detail-value">' + esc(e.hour) + '</span></div>' +
      '<div class="cron-detail-row"><span class="cron-detail-label">Day</span><span class="cron-detail-value">' + esc(e.dom) + '</span></div>' +
      '<div class="cron-detail-row"><span class="cron-detail-label">Month</span><span class="cron-detail-value">' + esc(e.month) + '</span></div>' +
      '<div class="cron-detail-row"><span class="cron-detail-label">Weekday</span><span class="cron-detail-value">' + esc(e.dow) + '</span></div>' +
      (e.nextRunFormatted ? '<div class="cron-detail-row"><span class="cron-detail-label">Next Run</span><span class="cron-detail-value">in ' + esc(e.nextRunFormatted) + '</span></div>' : '') +
      '<div style="margin-top:14px;display:flex;gap:8px;">' +
        '<button class="cron-btn" data-cron-action="edit" data-idx="' + idx + '" style="width:auto;height:auto;padding:6px 14px;font-size:13px;">Edit</button>' +
        '<button class="cron-btn cron-btn-success" data-cron-action="toggle" data-idx="' + idx + '" style="width:auto;height:auto;padding:6px 14px;font-size:13px;">' + (e.enabled ? 'Disable' : 'Enable') + '</button>' +
        '<button class="cron-btn cron-btn-danger" data-cron-action="delete" data-idx="' + idx + '" style="width:auto;height:auto;padding:6px 14px;font-size:13px;">Delete</button>' +
      '</div>';
    if (overlay) overlay.style.display = 'flex';
  }

  function updateDescription() {
    var desc = $('cronDescription');
    var useShort = $('cronUseShorthand');
    var shortSel = $('cronShorthand');
    if (!desc) return;
    if (useShort && useShort.checked && shortSel && shortSel.value) {
      var map = { '@reboot': 'At system startup', '@yearly': 'Once a year', '@annually': 'Once a year', '@monthly': 'Once a month', '@weekly': 'Once a week', '@daily': 'Once a day', '@hourly': 'Once an hour' };
      desc.textContent = map[shortSel.value] || shortSel.value;
      desc.style.display = 'block';
      return;
    }
    var m = $('cronMinute');
    var h = $('cronHour');
    var d = $('cronDom');
    var mo = $('cronMonth');
    var w = $('cronDow');
    if (!m || !h) { desc.style.display = 'none'; return; }
    var mv = m.value.trim() || '*';
    var hv = h.value.trim() || '*';
    var dv = d ? d.value.trim() || '*' : '*';
    var mov = mo ? mo.value.trim() || '*' : '*';
    var wv = w ? w.value.trim() || '*' : '*';
    if (mv === '*' && hv === '*' && dv === '*' && mov === '*' && wv === '*') {
      desc.textContent = 'Every minute';
    } else if (hv === '*' && dv === '*' && mov === '*' && wv === '*') {
      desc.textContent = mv === '*' ? 'Every minute' : 'Every hour at minute ' + mv;
    } else if (dv === '*' && mov === '*' && wv === '*') {
      desc.textContent = 'Daily at ' + hv.padStart(2, '0') + ':' + (mv === '*' ? '00' : mv.padStart(2, '0'));
    } else {
      desc.textContent = 'Schedule: ' + mv + ' ' + hv + ' ' + dv + ' ' + mov + ' ' + wv;
    }
    desc.style.display = 'block';
  }

  async function saveJob() {
    var idx = parseInt($('cronEditIndex').value);
    var useShort = $('cronUseShorthand');
    var shortSel = $('cronShorthand');
    var entry;
    if (useShort && useShort.checked && shortSel) {
      entry = { shorthand: shortSel.value, command: $('cronCommand').value.trim() };
    } else {
      entry = {
        minute: $('cronMinute').value.trim() || '*',
        hour: $('cronHour').value.trim() || '*',
        dom: $('cronDom').value.trim() || '*',
        month: $('cronMonth').value.trim() || '*',
        dow: $('cronDow').value.trim() || '*',
        command: $('cronCommand').value.trim(),
      };
    }
    try {
      if (idx < 0) {
        await API.cron.add(cronState.owner, entry);
        showToast('Cron job created', 'success');
      } else {
        await API.cron.update(cronState.owner, idx, entry);
        showToast('Cron job updated', 'success');
      }
      $('cronModalOverlay').style.display = 'none';
      await loadCron();
    } catch (e) {
      showToast(e.message || 'Failed to save', 'error');
    }
  }

  async function deleteJob(idx) {
    showConfirm('Delete Cron Job', 'Are you sure you want to delete this cron job?', async function () {
      try {
        await API.cron.del(cronState.owner, idx);
        showToast('Cron job deleted', 'success');
        hideConfirm();
        await loadCron();
      } catch (e) {
        showToast(e.message || 'Failed to delete', 'error');
      }
    });
  }

  async function toggleJob(idx) {
    try {
      await API.cron.toggle(cronState.owner, idx);
      showToast('Cron job ' + (cronState.entries[idx] && !cronState.entries[idx].enabled ? 'enabled' : 'disabled'), 'success');
      await loadCron();
    } catch (e) {
      showToast(e.message || 'Failed to toggle', 'error');
    }
  }

  async function loadSystemCronD() {
    var overlay = $('cronSystemOverlay');
    var list = $('cronSystemList');
    if (!list) return;
    list.innerHTML = '<div class="cron-loading-row"></div><div class="cron-loading-row"></div>';
    if (overlay) overlay.style.display = 'flex';
    try {
      var files = await API.cron.listCronD();
      if (!files.length) {
        list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);">No system cron.d files found</div>';
        return;
      }
      list.innerHTML = files.map(function (f) {
        var name = f.file || 'unknown';
        return '<div class="cron-system-file" data-cron-action="view-cron-d" data-file="' + esc(name) + '">' +
          '<span class="cron-system-name">' + esc(name) + '</span>' +
          '<span class="cron-system-count">' + (f.enabled !== false ? 'Active' : 'Disabled') + '</span>' +
          '<span style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono);">' + esc(f.command || '') + '</span>' +
          '</div>';
      }).join('');
    } catch (e) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:#ef4444;">Failed to load: ' + esc(e.message) + '</div>';
    }
  }

  function onAction(action, el) {
    var idx, page;
    switch (action) {
      case 'owner-change':
        cronState.owner = el.value;
        loadCron();
        break;
      case 'refresh':
        loadCron();
        break;
      case 'add':
        openAddModal();
        break;
      case 'search':
        cronState.search = el.value;
        filterEntries();
        renderList();
        break;
      case 'edit':
        idx = parseInt(el.dataset.idx);
        openEditModal(idx);
        break;
      case 'detail':
        idx = parseInt(el.dataset.idx);
        openDetailModal(idx);
        break;
      case 'delete':
        idx = parseInt(el.dataset.idx);
        deleteJob(idx);
        break;
      case 'toggle':
        idx = parseInt(el.dataset.idx);
        toggleJob(idx);
        break;
      case 'save':
        saveJob();
        break;
      case 'modal-close':
        $('cronModalOverlay').style.display = 'none';
        break;
      case 'modal-backdrop':
        if (el.target === el) el.target.style.display = 'none';
        break;
      case 'detail-close':
        $('cronDetailOverlay').style.display = 'none';
        break;
      case 'detail-backdrop':
        if (el.target === el) el.target.style.display = 'none';
        break;
      case 'confirm-cancel':
      case 'confirm-close':
        hideConfirm();
        break;
      case 'confirm-backdrop':
        if (el.target === el) el.target.style.display = 'none';
        break;
      case 'confirm-ok':
        if (cronState.confirmCb) cronState.confirmCb();
        break;
      case 'system-cron-d':
        loadSystemCronD();
        break;
      case 'system-close':
        $('cronSystemOverlay').style.display = 'none';
        break;
      case 'system-backdrop':
        if (el.target === el) el.target.style.display = 'none';
        break;
      case 'page':
        page = parseInt(el.dataset.page);
        if (page >= 1) { cronState.page = page; renderList(); }
        break;
      case 'retry':
        loadCron();
        break;
      case 'toggle-shorthand':
        var useShort = $('cronUseShorthand');
        var shortSel = $('cronShorthand');
        var schedFields = $('cronScheduleFields');
        if (useShort && shortSel && schedFields) {
          shortSel.style.display = useShort.checked ? 'inline-block' : 'none';
          schedFields.style.display = useShort.checked ? 'none' : 'grid';
        }
        updateDescription();
        break;
      case 'shorthand-select':
        updateDescription();
        break;
      case 'preset':
        var preset = el.dataset.preset;
        if (PRESETS[preset]) {
          var p = PRESETS[preset];
          $('cronMinute').value = p.minute;
          $('cronHour').value = p.hour;
          $('cronDom').value = p.dom;
          $('cronMonth').value = p.month;
          $('cronDow').value = p.dow;
          var useShort2 = $('cronUseShorthand');
          var shortSel2 = $('cronShorthand');
          var schedFields2 = $('cronScheduleFields');
          if (useShort2) useShort2.checked = false;
          if (shortSel2) shortSel2.style.display = 'none';
          if (schedFields2) schedFields2.style.display = 'grid';
          updateDescription();
        }
        break;
      case 'select':
        break;
      case 'sort':
        var field = el.dataset.sort;
        if (cronState.sort.field === field) {
          cronState.sort.dir = cronState.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          cronState.sort.field = field;
          cronState.sort.dir = 'asc';
        }
        filterEntries();
        renderList();
        break;
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-cron-action]');
    if (el) {
      e.preventDefault();
      onAction(el.dataset.cronAction, el);
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-cron-action]');
    if (el) {
      onAction(el.dataset.cronAction, el);
    }
  });

  var cronSearchTimeout;
  document.addEventListener('input', function (e) {
    if (e.target.id === 'cronSearch') {
      clearTimeout(cronSearchTimeout);
      cronSearchTimeout = setTimeout(function () {
        cronState.search = e.target.value;
        filterEntries();
        renderList();
      }, 250);
    }
    if (e.target.dataset.cronField) {
      updateDescription();
    }
  });

  window.initCron = async function () {
    await loadCron();
  };
})();
