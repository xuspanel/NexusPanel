let bkTaskId = null;
let bkPollInterval = null;
let bkDefs = [];
let bkSelected = new Set();
let bkStartTime = null;
let bkItemStartTime = null;
let bkCurrentPage = 1;
let bkTotalPages = 1;
let bkCurrentSort = 'createdAt';
let bkSortDir = 'desc';
let bkSearch = '';
let bkTypeFilter = '';
let bkDeleteTarget = null;

function escHtml(s) {
  if (typeof s !== 'string') return s;
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let s = bytes;
  while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
  return s.toFixed(i > 0 ? 1 : 0) + ' ' + u[i];
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return h + 'h ' + (m % 60) + 'm ' + (s % 60) + 's';
  if (m > 0) return m + 'm ' + (s % 60) + 's';
  return s + 's';
}

window.initBackups = async function () {
  try {
    const me = await API.me();
    if (me.role !== 'admin') {
      document.getElementById('bkContent').innerHTML = '<div class="db-error" style="display:flex">⛔ Admin access required</div>';
      return;
    }
    bindBackupEvents();
    await loadDefs();
    switchBkTab('wizard');

    const storedTaskId = localStorage.getItem('bkTaskId');
    if (storedTaskId) {
      try {
        const status = await API.backups.status(storedTaskId);
        if (status.status === 'running') {
          bkTaskId = storedTaskId;
          bkStartTime = Date.now();
          bkItemStartTime = Date.now();
          showBkProgressPanel();
          showBkToast('Reconnected to running backup', 'success');
          bkPollInterval = setInterval(pollBkTask, 1000);
          pollBkTask();
          return;
        }
      } catch (_) {}
      localStorage.removeItem('bkTaskId');
    }

    try {
      const current = await API.backups.current();
      if (current && current.status === 'running') {
        bkTaskId = current.taskId;
        localStorage.setItem('bkTaskId', current.taskId);
        bkStartTime = Date.now();
        bkItemStartTime = Date.now();
        showBkProgressPanel();
        showBkToast('Reconnected to running backup', 'success');
        bkPollInterval = setInterval(pollBkTask, 1000);
        pollBkTask();
      }
    } catch (_) {}
  } catch (e) {
    document.getElementById('bkContent').innerHTML = '<div class="db-error" style="display:flex">' + escHtml(e.message) + '</div>';
  }
};

function bindBackupEvents() {
  document.querySelectorAll('.bk-tab').forEach(tab => {
    if (!tab.dataset.bound) {
      tab.dataset.bound = '1';
      tab.addEventListener('click', () => switchBkTab(tab.dataset.tab));
    }
  });

  document.getElementById('bkProgressCancel')?.addEventListener('click', cancelBk);

  const searchEl = document.getElementById('bkSearch');
  if (searchEl && !searchEl.dataset.bound) {
    searchEl.dataset.bound = '1';
    searchEl.addEventListener('input', (e) => {
      bkSearch = e.target.value.trim();
      bkCurrentPage = 1;
      loadBackupList();
    });
  }

  const typeFilter = document.getElementById('bkTypeFilter');
  if (typeFilter && !typeFilter.dataset.bound) {
    typeFilter.dataset.bound = '1';
    typeFilter.addEventListener('change', (e) => {
      bkTypeFilter = e.target.value;
      bkCurrentPage = 1;
      loadBackupList();
    });
  }

  document.querySelectorAll('[data-bk-sort]').forEach(el => {
    if (!el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('click', () => {
        const field = el.dataset.bkSort;
        if (bkCurrentSort === field) bkSortDir = bkSortDir === 'asc' ? 'desc' : 'asc';
        else { bkCurrentSort = field; bkSortDir = 'desc'; }
        bkCurrentPage = 1;
        loadBackupList();
      });
    }
  });

  document.getElementById('bkDeleteClose')?.addEventListener('click', closeBkDeleteModal);
  document.getElementById('bkDeleteCancel')?.addEventListener('click', closeBkDeleteModal);
  document.getElementById('bkDeleteConfirm')?.addEventListener('click', confirmDeleteBk);
  document.querySelectorAll('.bk-delete-modal').forEach(el => {
    el.addEventListener('click', (e) => { if (e.target === el) closeBkDeleteModal(); });
  });
}

function showBkProgressPanel() {
  const progress = document.getElementById('bkProgress');
  progress.style.display = 'block';
  document.getElementById('bkProgressCancel').style.display = 'inline-block';
  setBkProgressInfo('Reconnecting...', '--', '--', '--');
}

async function loadDefs() {
  try {
    bkDefs = await API.backups.defs();
    renderWizard();
  } catch (_) { bkDefs = []; }
}

function switchBkTab(tab) {
  document.querySelectorAll('.bk-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('bkWizard').style.display = tab === 'wizard' ? 'block' : 'none';
  document.getElementById('bkList').style.display = tab === 'list' ? 'block' : 'none';
  document.getElementById('bkSchedules').style.display = tab === 'schedules' ? 'block' : 'none';
  if (tab === 'list') loadBackupList();
  if (tab === 'schedules') loadBkSchedules();
}

function renderWizard() {
  const fullCard = document.getElementById('bkFullCard');
  fullCard.innerHTML =
    '<div class="bk-card-icon">📦</div>' +
    '<div class="bk-card-body">' +
      '<div class="bk-card-title">Full Backup</div>' +
      '<div class="bk-card-desc">Create a complete backup of all system data — directories, databases, FTP, emails, users, and panel configuration. All items below will be included.</div>' +
      '<div class="bk-card-items">' +
        bkDefs.map(d => '<span class="bk-chip">' + d.icon + ' ' + escHtml(d.label) + '</span>').join('') +
      '</div>' +
      '<button class="db-btn db-btn-primary" data-bk-action="start-full">' +
        '🚀 Start Full Backup' +
      '</button>' +
    '</div>';

  const selCard = document.getElementById('bkSelCard');
  bkSelected = new Set(bkDefs.filter(d => d.id === 'root' || d.id === 'etc' || d.id === 'postgres' || d.id === 'users').map(d => d.id));
  selCard.innerHTML =
    '<div class="bk-card-icon">🎯</div>' +
    '<div class="bk-card-body">' +
      '<div class="bk-card-title">Selected Backup</div>' +
      '<div class="bk-card-desc">Choose specific items to back up.</div>' +
      '<div class="bk-check-grid">' +
        bkDefs.map(d =>
          '<label class="bk-check-item' + (bkSelected.has(d.id) ? ' checked' : '') + '">' +
            '<input type="checkbox" value="' + d.id + '"' + (bkSelected.has(d.id) ? ' checked' : '') + ' data-bk-action="toggle-item">' +
            '<span class="bk-check-icon">' + d.icon + '</span>' +
            '<span class="bk-check-label">' + escHtml(d.label) + '</span>' +
          '</label>'
        ).join('') +
      '</div>' +
      '<div class="bk-sel-actions">' +
        '<button class="db-btn db-btn-sm" data-bk-action="select-all">Select All</button>' +
        '<button class="db-btn db-btn-sm" data-bk-action="deselect-all">Deselect All</button>' +
      '</div>' +
      '<button class="db-btn db-btn-primary" data-bk-action="start-selected">' +
        '🚀 Start Selected Backup' +
      '</button>' +
    '</div>';

  fullCard.querySelectorAll('[data-bk-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.bkAction;
      if (action === 'start-full') startBk('full');
    });
  });

  selCard.querySelectorAll('[data-bk-action]').forEach(el => {
    const action = el.dataset.bkAction;
    if (action === 'start-selected') el.addEventListener('click', () => startBk('selected'));
    else if (action === 'select-all') el.addEventListener('click', () => selectAllBkItems(true));
    else if (action === 'deselect-all') el.addEventListener('click', () => selectAllBkItems(false));
  });

  selCard.querySelectorAll('[data-bk-action="toggle-item"]').forEach(cb => {
    cb.addEventListener('change', () => toggleBkItem(cb.value, cb.checked));
  });
}

function toggleBkItem(id, checked) {
  if (checked) bkSelected.add(id);
  else bkSelected.delete(id);
  document.querySelectorAll('.bk-check-item').forEach(el => {
    const cb = el.querySelector('input');
    if (cb && cb.value === id) el.classList.toggle('checked', checked);
  });
}

function selectAllBkItems(val) {
  document.querySelectorAll('.bk-check-item input').forEach(cb => {
    cb.checked = val;
    if (val) bkSelected.add(cb.value);
    else bkSelected.delete(cb.value);
    cb.closest('.bk-check-item').classList.toggle('checked', val);
  });
}

async function startBk(type) {
  if (bkTaskId) return showBkToast('A backup is already running', 'error');
  const items = type === 'full' ? bkDefs.map(d => d.id) : [...bkSelected];
  if (items.length === 0) return showBkToast('No items selected', 'error');

  const progress = document.getElementById('bkProgress');
  progress.style.display = 'block';
  progress.querySelector('.bk-progress-fill').style.width = '0%';
  progress.querySelector('.bk-progress-percent').textContent = '0%';
  document.getElementById('bkProgressCancel').style.display = 'inline-block';
  setBkProgressInfo('Starting backup...', '0 / ' + items.length + ' items', '--', '--');

  try {
    const result = await API.backups.start({ items, type });
    bkTaskId = result.taskId;
    localStorage.setItem('bkTaskId', result.taskId);
    bkStartTime = Date.now();
    bkItemStartTime = Date.now();
    showBkToast('Backup started', 'success');
    bkPollInterval = setInterval(pollBkTask, 1000);
    pollBkTask();
  } catch (e) {
    progress.style.display = 'none';
    showBkToast(e.message, 'error');
  }
}

function setBkProgressInfo(current, itemsStr, elapsedStr, etaStr) {
  document.getElementById('bkProgressCurrent').textContent = current;
  document.getElementById('bkProgressItems').textContent = itemsStr;
  document.getElementById('bkProgressElapsed').textContent = elapsedStr;
  document.getElementById('bkProgressEta').textContent = etaStr;
}

async function pollBkTask() {
  if (!bkTaskId) return;
  try {
    const status = await API.backups.status(bkTaskId);
    const progress = document.getElementById('bkProgress');
    const fill = progress.querySelector('.bk-progress-fill');
    const pctEl = progress.querySelector('.bk-progress-percent');

    if (status.status === 'running') {
      const done = status.results ? status.results.length : 0;
      const total = status.items.length;
      const pct = status.progress;
      fill.style.width = pct + '%';
      pctEl.textContent = pct + '%';

      const elapsed = Date.now() - bkStartTime;
      const elapsedStr = fmtDuration(elapsed);
      let etaStr = '--';
      if (done > 0) {
        const avgPerItem = elapsed / done;
        const remaining = total - done;
        const eta = Math.round(avgPerItem * remaining);
        etaStr = fmtDuration(eta);
      }
      setBkProgressInfo(status.currentItem || 'Processing...', done + ' / ' + total + ' items', elapsedStr, etaStr);
    } else if (status.status === 'complete' || status.status === 'failed' || status.status === 'cancelled') {
      clearInterval(bkPollInterval);
      bkPollInterval = null;
      bkTaskId = null;
      localStorage.removeItem('bkTaskId');
      fill.style.width = '100%';
      pctEl.textContent = '100%';
      const elapsed = fmtDuration(Date.now() - (bkStartTime || Date.now()));
      setBkProgressInfo('', status.results.length + ' / ' + status.items.length + ' items', elapsed, '--');
      document.getElementById('bkProgressCancel').style.display = 'none';
      setTimeout(() => { progress.style.display = 'none'; }, 6000);
      if (status.status === 'complete') showBkToast('Backup Completed Successfully', 'success');
      else if (status.status === 'cancelled') showBkToast('Backup Cancelled', 'warning');
      else showBkToast('Backup completed with errors', 'error');
      loadBackupList();
    } else if (status.status === 'not_found' || status.status === 'expired') {
      clearInterval(bkPollInterval);
      bkPollInterval = null;
      bkTaskId = null;
      progress.style.display = 'none';
    }
  } catch (e) {
    clearInterval(bkPollInterval);
    bkPollInterval = null;
    bkTaskId = null;
    document.getElementById('bkProgress').style.display = 'none';
  }
}

async function cancelBk() {
  if (!bkTaskId) return;
  try {
    await API.backups.cancel(bkTaskId);
    showBkToast('Cancelling backup...', 'warning');
  } catch (_) {
    clearInterval(bkPollInterval);
    bkPollInterval = null;
    bkTaskId = null;
    localStorage.removeItem('bkTaskId');
    document.getElementById('bkProgress').style.display = 'none';
  }
}

async function loadBackupList() {
  const tbody = document.getElementById('bkListBody');
  const loading = document.getElementById('bkListLoading');
  const empty = document.getElementById('bkListEmpty');
  tbody.innerHTML = '';
  loading.style.display = 'block';
  empty.style.display = 'none';
  try {
    const result = await API.backups.list({
      search: bkSearch || undefined,
      sort: bkCurrentSort,
      dir: bkSortDir,
      page: bkCurrentPage,
      limit: 50,
      type: bkTypeFilter || undefined,
    });
    loading.style.display = 'none';
    bkTotalPages = result.pages || 1;
    bkCurrentPage = result.page || 1;

    if (!result.backups || result.backups.length === 0) {
      empty.style.display = 'block';
      renderBkSortIcons();
      renderBkPagination(result.total || 0);
      return;
    }

    result.backups.forEach((bk, i) => {
      const failed = bk.failedItems || 0;
      const ok = bk.totalItems - failed;
      const row = document.createElement('tr');
      row.className = 'bk-row';
      row.innerHTML =
        '<td class="bk-row-num">' + ((bkCurrentPage - 1) * 50 + i + 1) + '</td>' +
        '<td class="bk-row-date">' + formatDate(bk.createdAt) + '</td>' +
        '<td class="bk-row-type"><span class="bk-type-badge ' + escHtml(bk.type) + '">' + (bk.type === 'full' ? 'Full' : 'Selected') + '</span></td>' +
        '<td class="bk-row-items">' +
          '<span class="bk-item-dots" data-bk-action="toggle-items" data-bk-target="bkItems_' + bk.timestamp + '">' +
            bk.items.map(it => it.icon).join(' ') +
            '<span class="bk-dot-count">' + bk.totalItems + ' items</span>' +
          '</span>' +
          '<div class="bk-items-detail" id="bkItems_' + bk.timestamp + '" style="display:none">' +
            bk.items.map(it =>
              '<div class="bk-item-detail-row' + (it.error ? ' has-error' : '') + '">' +
                '<span class="bk-item-detail-icon">' + it.icon + '</span>' +
                '<span class="bk-item-detail-label">' + escHtml(it.label) + '</span>' +
                '<span class="bk-item-detail-size">' + formatSize(it.size) + '</span>' +
                (it.file ? '<a class="bk-item-download" href="' + API.backups.downloadFileUrl(bk.timestamp, it.file) + '" target="_blank" title="Download">⬇</a>' : '') +
                (it.error ? '<span class="bk-item-error" title="' + escHtml(it.error) + '">⚠️</span>' : '<span class="bk-item-ok">✅</span>') +
              '</div>'
            ).join('') +
          '</div>' +
        '</td>' +
        '<td class="bk-row-size">' + formatSize(bk.totalSize) + '</td>' +
        '<td class="bk-row-status">' +
          (failed > 0 ? '<span class="bk-status-warn" title="' + failed + ' items failed">⚠️ ' + ok + '/' + bk.totalItems + '</span>' : '<span class="bk-status-ok">✅ ' + bk.totalItems + '/' + bk.totalItems + '</span>') +
        '</td>' +
        '<td class="bk-row-actions">' +
          '<a class="db-btn db-btn-sm" href="' + API.backups.downloadUrl(bk.timestamp) + '" target="_blank" title="Download all">⬇</a>' +
          '<button class="db-btn db-btn-sm db-btn-danger" data-bk-action="delete" data-bk-target="' + bk.timestamp + '" title="Delete">🗑</button>' +
        '</td>';
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-bk-action="toggle-items"]').forEach(el => {
      el.addEventListener('click', () => {
        const target = document.getElementById(el.dataset.bkTarget);
        if (target) target.style.display = target.style.display === 'none' ? 'block' : 'none';
      });
    });

    tbody.querySelectorAll('[data-bk-action="delete"]').forEach(el => {
      el.addEventListener('click', () => openBkDeleteModal(el.dataset.bkTarget));
    });

    renderBkSortIcons();
    renderBkPagination(result.total || 0);
  } catch (e) {
    loading.style.display = 'none';
    empty.style.display = 'block';
    empty.textContent = '❌ ' + e.message;
  }
}

function renderBkSortIcons() {
  document.querySelectorAll('[data-bk-sort]').forEach(el => {
    const field = el.dataset.bkSort;
    const icon = el.querySelector('.sort-icon');
    if (!icon) return;
    if (field === bkCurrentSort) icon.textContent = bkSortDir === 'asc' ? '▲' : '▼';
    else icon.textContent = '';
  });
}

function renderBkPagination(total) {
  const el = document.getElementById('bkPagination');
  if (!el) return;
  if (bkTotalPages <= 1) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  let html = '<button class="pg-btn" data-bk-pg="prev"' + (bkCurrentPage <= 1 ? ' disabled' : '') + '>‹</button>';
  const start = Math.max(1, bkCurrentPage - 2);
  const end = Math.min(bkTotalPages, bkCurrentPage + 2);
  if (start > 1) html += '<button class="pg-btn" data-bk-pg="1">1</button>';
  if (start > 2) html += '<span class="pg-ellipsis">…</span>';
  for (let i = start; i <= end; i++) {
    html += '<button class="pg-btn' + (i === bkCurrentPage ? ' pg-active' : '') + '" data-bk-pg="' + i + '">' + i + '</button>';
  }
  if (end < bkTotalPages - 1) html += '<span class="pg-ellipsis">…</span>';
  if (end < bkTotalPages) html += '<button class="pg-btn" data-bk-pg="' + bkTotalPages + '">' + bkTotalPages + '</button>';
  html += '<button class="pg-btn" data-bk-pg="next"' + (bkCurrentPage >= bkTotalPages ? ' disabled' : '') + '>›</button>';
  html += '<span class="pg-info">' + total + ' backups</span>';
  el.innerHTML = html;
  el.querySelectorAll('[data-bk-pg]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const pg = btn.dataset.bkPg;
      if (pg === 'prev') bkCurrentPage = Math.max(1, bkCurrentPage - 1);
      else if (pg === 'next') bkCurrentPage = Math.min(bkTotalPages, bkCurrentPage + 1);
      else bkCurrentPage = parseInt(pg, 10);
      loadBackupList();
    });
  });
}

function openBkDeleteModal(timestamp) {
  bkDeleteTarget = timestamp;
  document.getElementById('bkDeleteMsg').textContent = 'Delete backup "' + timestamp + '" permanently?';
  document.getElementById('bkDeleteModal').style.display = 'flex';
}

function closeBkDeleteModal() {
  document.getElementById('bkDeleteModal').style.display = 'none';
  bkDeleteTarget = null;
}

async function confirmDeleteBk() {
  const timestamp = bkDeleteTarget;
  if (!timestamp) return;
  closeBkDeleteModal();
  try {
    await API.backups.del(timestamp);
    showBkToast('Backup deleted', 'success');
    loadBackupList();
  } catch (e) {
    showBkToast(e.message, 'error');
  }
}

let bkToastTimer = null;

function showBkToast(msg, type) {
  const t = document.getElementById('bkToast');
  if (!t) return;
  t.textContent = (type === 'error' ? '❌ ' : type === 'warning' ? '⚠️ ' : '✅ ') + msg;
  t.className = 'bk-toast bk-toast-' + (type || 'success');
  t.style.display = 'block';
  if (bkToastTimer) clearTimeout(bkToastTimer);
  bkToastTimer = setTimeout(() => { t.style.display = 'none'; }, 4000);
}

/* ─── Backup Schedules ─── */
let bkSchEditing = null;

async function loadBkSchedules() {
  try {
    const schedules = await API.backups.schedules();
    renderBkSchedules(schedules);
  } catch (e) { document.getElementById('bkScheduleList').innerHTML = '<div class="db-error">Failed to load schedules</div>'; }
}

function renderBkSchedules(schedules) {
  const el = document.getElementById('bkScheduleList');
  if (!schedules || !schedules.length) {
    el.innerHTML = '<div class="db-empty">No backup schedules configured. Create one to automate backups.</div>';
    return;
  }
  el.innerHTML = schedules.map(s => {
    const freq = s.frequency.charAt(0).toUpperCase() + s.frequency.slice(1);
    const nextRun = s.nextRun ? new Date(s.nextRun).toLocaleString() : 'Not set';
    const lastRun = s.lastRun ? new Date(s.lastRun).toLocaleString() : 'Never';
    return '<div class="bk-schedule-item">' +
      '<div class="bk-schedule-info">' +
        '<span class="bk-schedule-target">' + escHtml(s.target) + '</span>' +
        '<span class="bk-schedule-meta">' + freq + ' at ' + escHtml(s.time) + ' UTC · Keep ' + s.retention + ' · Next: ' + nextRun + '</span>' +
      '</div>' +
      '<div class="bk-schedule-actions">' +
        '<label class="bk-toggle"><input type="checkbox"' + (s.enabled ? ' checked' : '') + ' data-bk-action="toggle-schedule" data-bk-sid="' + s.id + '"><span></span></label>' +
        '<button class="db-btn db-btn-sm" data-bk-action="delete-schedule" data-bk-sid="' + s.id + '">🗑</button>' +
      '</div></div>';
  }).join('');

  el.querySelectorAll('[data-bk-action="toggle-schedule"]').forEach(cb => {
    cb.addEventListener('change', () => bkToggleSchedule(cb.dataset.bkSid, cb.checked));
  });
  el.querySelectorAll('[data-bk-action="delete-schedule"]').forEach(btn => {
    btn.addEventListener('click', () => bkDeleteSchedule(btn.dataset.bkSid));
  });
}

function bkShowScheduleForm() {
  bkSchEditing = null;
  document.getElementById('bkScheduleFormTitle').textContent = 'New Backup Schedule';
  document.getElementById('bkScheduleForm').style.display = 'block';
  const sel = document.getElementById('bkSchTarget');
  sel.innerHTML = bkDefs.map(d => '<option value="' + d.id + '">' + d.label + '</option>').join('');
  document.getElementById('bkSchFreq').value = 'daily';
  document.getElementById('bkSchTime').value = '02:00';
  document.getElementById('bkSchRetention').value = '7';
  bkSchFreqChange();
}

function bkSchFreqChange() {
  const freq = document.getElementById('bkSchFreq').value;
  const row = document.getElementById('bkSchDayRow');
  const lbl = document.getElementById('bkSchDayLabel');
  const sel = document.getElementById('bkSchDay');
  if (freq === 'daily') { row.style.display = 'none'; return; }
  row.style.display = 'block';
  sel.innerHTML = '';
  if (freq === 'weekly') {
    lbl.textContent = 'Day of Week';
    ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].forEach((d, i) => {
      sel.innerHTML += '<option value="' + i + '">' + d + '</option>';
    });
  } else {
    lbl.textContent = 'Day of Month';
    for (let i = 1; i <= 28; i++) { sel.innerHTML += '<option value="' + i + '">' + i + '</option>'; }
  }
}

async function bkSaveSchedule() {
  const data = {
    target: document.getElementById('bkSchTarget').value,
    frequency: document.getElementById('bkSchFreq').value,
    time: document.getElementById('bkSchTime').value,
    retention: parseInt(document.getElementById('bkSchRetention').value) || 7,
  };
  if (data.frequency === 'weekly') data.dayOfWeek = parseInt(document.getElementById('bkSchDay').value);
  if (data.frequency === 'monthly') data.dayOfMonth = parseInt(document.getElementById('bkSchDay').value);
  try {
    await API.backups.createSchedule(data);
    document.getElementById('bkScheduleForm').style.display = 'none';
    showBkToast('Schedule created', 'success');
    loadBkSchedules();
  } catch (e) { showBkToast(e.message, 'error'); }
}

async function bkToggleSchedule(id, enabled) {
  try { await API.backups.toggleSchedule(id, enabled); } catch (_) {}
}

async function bkDeleteSchedule(id) {
  if (!confirm('Delete this backup schedule?')) return;
  try { await API.backups.deleteSchedule(id); loadBkSchedules(); } catch (e) { showBkToast(e.message, 'error'); }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('bkScheduleSaveBtn')?.addEventListener('click', bkSaveSchedule);
  document.getElementById('bkScheduleCancelBtn')?.addEventListener('click', () => {
    document.getElementById('bkScheduleForm').style.display = 'none';
  });
  document.getElementById('bkNewScheduleBtn')?.addEventListener('click', bkShowScheduleForm);
  document.getElementById('bkSchFreq')?.addEventListener('change', bkSchFreqChange);
  document.getElementById('bkRefreshBtn')?.addEventListener('click', () => {
    const activeTab = document.querySelector('.bk-tab.active');
    if (activeTab) {
      const tab = activeTab.dataset.tab;
      if (tab === 'list') loadBackupList();
      else if (tab === 'schedules') loadBkSchedules();
    }
  });
});
