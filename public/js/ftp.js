/* ─── FTP Management Module ─── */
var ftpState = { accounts: [], total: 0, offset: 0, limit: 50, search: '', selected: {} };

window.initFTP = async function () {
  try {
    var u = await API.me();
    if (u.role !== 'admin') {
      document.getElementById('ftpContent').innerHTML = '<div class="db-error"><span class="db-error-icon">⚠️</span><span>Admin access required</span></div>';
      return;
    }
    bindFTPEvents();
    await loadFTP();
  } catch (err) {
    document.getElementById('ftpContent').innerHTML = '<div class="db-error"><span class="db-error-icon">⚠️</span><span>' + escHtml(err.message) + '</span></div>';
  }
};

/* ─── Event Delegation ─── */
function bindFTPEvents() {
  var table = document.getElementById('ftpTableBody');
  if (table && !table._ftpBound) {
    table._ftpBound = true;
    table.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-ftp-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-ftp-action');
      var username = btn.getAttribute('data-ftp-username');
      if (action === 'edit') openEditFTP(username);
      else if (action === 'toggle') toggleFTP(username, btn.getAttribute('data-ftp-enable') === 'true');
      else if (action === 'delete') deleteFTPUser(username);
      else if (action === 'select') toggleSelect(username);
    });
  }

  var ftpContent = document.getElementById('ftpContent');
  if (ftpContent && !ftpContent._ftpBound) {
    ftpContent._ftpBound = true;
    ftpContent.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-ftp-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-ftp-action');
      if (action === 'selectAll') toggleSelectAll();
      else if (action === 'bulkEnable') bulkEnable();
      else if (action === 'bulkDisable') bulkDisable();
      else if (action === 'bulkDelete') bulkDelete();
      else if (action === 'clearSelection') clearSelection();
      else if (action === 'prevPage') ftpPrevPage();
      else if (action === 'nextPage') ftpNextPage();
    });
  }

  document.getElementById('ftpSearchInput').addEventListener('input', function (e) {
    ftpState.search = e.target.value;
    ftpState.offset = 0;
    loadFTP();
  });
}

/* ─── Load Data ─── */
async function loadFTP() {
  try {
    document.getElementById('ftpLoading').style.display = 'flex';
    document.getElementById('ftpContent').style.display = 'none';
    document.getElementById('ftpError').style.display = 'none';

    var params = { offset: ftpState.offset, limit: ftpState.limit };
    if (ftpState.search) params.search = ftpState.search;

    var [status, result] = await Promise.all([
      API.ftp.status(),
      API.ftp.accounts(params),
    ]);

    renderFTPStatus(status);
    ftpState.accounts = result.accounts;
    ftpState.total = result.total;
    renderFTPTable(result.accounts);
    renderFTPPagination();
    updateBulkBar();

    document.getElementById('ftpLoading').style.display = 'none';
    document.getElementById('ftpContent').style.display = 'block';
  } catch (err) {
    document.getElementById('ftpLoading').style.display = 'none';
    document.getElementById('ftpError').style.display = 'flex';
    document.getElementById('ftpErrorText').textContent = err.message;
  }
}

/* ─── Status Cards ─── */
function renderFTPStatus(status) {
  var el = document.getElementById('ftpStatusCards');
  el.innerHTML = ''
    + '<div class="ftp-stat-card ' + (status.isActive ? 'online' : 'offline') + '">'
    + '<div class="ftp-stat-label">Server</div>'
    + '<div class="ftp-stat-value">' + (status.isActive ? '🟢 Online' : '🔴 Offline') + '</div>'
    + '</div>'
    + '<div class="ftp-stat-card">'
    + '<div class="ftp-stat-label">Sessions</div>'
    + '<div class="ftp-stat-value">' + (status.activeSessions || 0) + '</div>'
    + '</div>'
    + '<div class="ftp-stat-card">'
    + '<div class="ftp-stat-label">Users</div>'
    + '<div class="ftp-stat-value">' + status.allowedUsers + ' <span class="ftp-stat-sub">allowed</span></div>'
    + '</div>'
    + '<div class="ftp-stat-card">'
    + '<div class="ftp-stat-label">Max Clients</div>'
    + '<div class="ftp-stat-value">' + status.maxClients + '</div>'
    + '</div>'
    + '<div class="ftp-stat-card">'
    + '<div class="ftp-stat-label">Passive Ports</div>'
    + '<div class="ftp-stat-value ftp-stat-small">' + escHtml(status.passiveRange) + '</div>'
    + '</div>'
    + '<div class="ftp-stat-card">'
    + '<div class="ftp-stat-label">Chroot</div>'
    + '<div class="ftp-stat-value">' + (status.chrootEnabled ? '✅' : '❌') + '</div>'
    + '</div>'
    + '<div class="ftp-stat-card">'
    + '<div class="ftp-stat-label">SSL</div>'
    + '<div class="ftp-stat-value">' + (status.sslEnabled ? '🔒' : '🔓') + '</div>'
    + '</div>'
    + '<div class="ftp-stat-card">'
    + '<div class="ftp-stat-label">Version</div>'
    + '<div class="ftp-stat-value ftp-stat-small">' + escHtml(status.version || '?') + '</div>'
    + '</div>';

  /* Server control buttons */
  var ctrl = document.getElementById('ftpServiceCtrl');
  if (ctrl) {
    ctrl.innerHTML = status.isActive
      ? '<button class="fm-btn fm-btn-sm" data-ftp-service="stop">⏹ Stop</button><button class="fm-btn fm-btn-sm" data-ftp-service="restart">🔄 Restart</button>'
      : '<button class="fm-btn fm-btn-sm fm-btn-primary" data-ftp-service="start">▶ Start</button>';
  }
}

/* ─── Table Rendering ─── */
function renderFTPTable(accounts) {
  var tbody = document.getElementById('ftpTableBody');
  if (accounts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-tertiary)">No FTP accounts found</td></tr>';
    return;
  }
  var html = '';
  for (var i = 0; i < accounts.length; i++) {
    var a = accounts[i];
    var rateStr = a.maxRate > 0 ? formatBytes(a.maxRate) + '/s' : 'Unlimited';
    var checked = ftpState.selected[a.username] ? ' checked' : '';
    html += '<tr class="' + (ftpState.selected[a.username] ? 'ftp-row-selected' : '') + '">'
      + '<td><label class="form-checkbox ftp-select-check"><input type="checkbox" data-ftp-action="select" data-ftp-username="' + escAttr(a.username) + '"' + checked + '><span class="form-checkbox-mark"></span></label></td>'
      + '<td><span class="ftp-user-name">' + escHtml(a.username) + '</span>'
      + (a.isSystemUser ? ' <span class="ftp-badge ftp-badge-sys">System</span>' : '')
      + (a.uid === 0 ? ' <span class="ftp-badge ftp-badge-root">Root</span>' : '') + '</td>'
      + '<td class="ftp-home-cell" title="' + escAttr(a.localRoot || a.home) + '">' + escHtml(a.localRoot || a.home) + '</td>'
      + '<td>' + formatBytes(a.quotaUsed) + '</td>'
      + '<td>' + rateStr + '</td>'
      + '<td>' + a.maxClients + ' / ' + a.maxPerIP + ' ip</td>'
      + '<td><span class="ftp-status-dot ' + (a.enabled ? 'on' : 'off') + '"></span>' + (a.enabled ? 'Enabled' : 'Disabled') + '</td>'
      + '<td class="ftp-actions">'
      + '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-ftp-action="edit" data-ftp-username="' + escAttr(a.username) + '" title="Edit">⚙</button> '
      + (a.enabled
        ? '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-ftp-action="toggle" data-ftp-username="' + escAttr(a.username) + '" data-ftp-enable="false" title="Disable">🔒</button> '
        : '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-ftp-action="toggle" data-ftp-username="' + escAttr(a.username) + '" data-ftp-enable="true" title="Enable">🔓</button> ')
      + (a.uid !== 0 ? '<button class="fm-btn fm-btn-secondary fm-btn-sm ftp-delete-btn" data-ftp-action="delete" data-ftp-username="' + escAttr(a.username) + '" title="Delete">🗑</button>' : '')
      + '</td></tr>';
  }
  tbody.innerHTML = html;
}

/* ─── Pagination ─── */
function renderFTPPagination() {
  var el = document.getElementById('ftpPagination');
  if (!el) return;
  var totalPages = Math.ceil(ftpState.total / ftpState.limit);
  var currentPage = Math.floor(ftpState.offset / ftpState.limit) + 1;
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = '<button class="fm-btn fm-btn-sm" data-ftp-action="prevPage"' + (currentPage <= 1 ? ' disabled' : '') + '>← Prev</button>'
    + '<span class="ftp-page-info">Page ' + currentPage + ' of ' + totalPages + ' (' + ftpState.total + ' users)</span>'
    + '<button class="fm-btn fm-btn-sm" data-ftp-action="nextPage"' + (currentPage >= totalPages ? ' disabled' : '') + '>Next →</button>';
}

function ftpPrevPage() {
  ftpState.offset = Math.max(0, ftpState.offset - ftpState.limit);
  loadFTP();
}

function ftpNextPage() {
  ftpState.offset += ftpState.limit;
  loadFTP();
}

/* ─── Selection / Bulk ─── */
function toggleSelect(username) {
  if (ftpState.selected[username]) delete ftpState.selected[username];
  else ftpState.selected[username] = true;
  renderFTPTable(ftpState.accounts);
  updateBulkBar();
}

function toggleSelectAll() {
  var allSelected = ftpState.accounts.every(function (a) { return ftpState.selected[a.username]; });
  ftpState.accounts.forEach(function (a) {
    if (allSelected) delete ftpState.selected[a.username];
    else ftpState.selected[a.username] = true;
  });
  renderFTPTable(ftpState.accounts);
  updateBulkBar();
}

function clearSelection() {
  ftpState.selected = {};
  renderFTPTable(ftpState.accounts);
  updateBulkBar();
}

function updateBulkBar() {
  var bar = document.getElementById('ftpBulkBar');
  var count = Object.keys(ftpState.selected).length;
  if (bar) bar.style.display = count > 0 ? 'flex' : 'none';
  var countEl = document.getElementById('ftpBulkCount');
  if (countEl) countEl.textContent = count + ' selected';
}

function getSelectedUsernames() {
  return Object.keys(ftpState.selected);
}

async function bulkEnable() {
  var usernames = getSelectedUsernames();
  if (!usernames.length) return;
  try {
    await API.ftp.bulkEnable(usernames);
    showToast('Enabled ' + usernames.length + ' users', 'success');
    clearSelection();
    await loadFTP();
  } catch (e) { showToast(e.message, 'error'); }
}

async function bulkDisable() {
  var usernames = getSelectedUsernames();
  if (!usernames.length) return;
  try {
    await API.ftp.bulkDisable(usernames);
    showToast('Disabled ' + usernames.length + ' users', 'success');
    clearSelection();
    await loadFTP();
  } catch (e) { showToast(e.message, 'error'); }
}

async function bulkDelete() {
  var usernames = getSelectedUsernames();
  if (!usernames.length) return;
  if (!confirm('Delete ' + usernames.length + ' FTP users? This removes their system accounts and home directories.')) return;
  try {
    await API.ftp.bulkDelete(usernames);
    showToast('Deleted ' + usernames.length + ' users', 'success');
    clearSelection();
    await loadFTP();
  } catch (e) { showToast(e.message, 'error'); }
}

/* ─── Toggle / Delete ─── */
async function toggleFTP(username, enable) {
  try {
    if (enable) { await API.ftp.enable(username); showToast('Enabled ' + username, 'success'); }
    else { await API.ftp.disable(username); showToast('Disabled ' + username, 'success'); }
    await loadFTP();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteFTPUser(username) {
  if (!confirm('Delete FTP user "' + username + '"? This removes their system account, home directory, and FTP access permanently.')) return;
  try {
    await API.ftp.del(username);
    showToast('Deleted ' + username, 'success');
    await loadFTP();
  } catch (e) { showToast(e.message, 'error'); }
}

/* ─── Service Control ─── */
async function ftpServiceAction(action) {
  try {
    await API.ftp.serviceAction(action);
    showToast('vsftpd ' + action + 'ed', 'success');
    await loadFTP();
  } catch (e) { showToast(e.message, 'error'); }
}

/* ─── Connection Test ─── */
function openTestModal() {
  document.getElementById('ftpTestResult').style.display = 'none';
  document.getElementById('ftpTestHost').value = '127.0.0.1';
  document.getElementById('ftpTestPort').value = '21';
  document.getElementById('ftpTestUser').value = '';
  document.getElementById('ftpTestPass').value = '';
  document.getElementById('ftpTestModal').style.display = 'flex';
}

async function runConnectionTest() {
  var result = document.getElementById('ftpTestResult');
  result.style.display = 'block';
  result.className = 'ftp-test-result';
  result.textContent = 'Testing...';
  try {
    var r = await API.ftp.testConnection({
      host: document.getElementById('ftpTestHost').value,
      port: parseInt(document.getElementById('ftpTestPort').value) || 21,
      username: document.getElementById('ftpTestUser').value,
      password: document.getElementById('ftpTestPass').value,
    });
    result.className = 'ftp-test-result ' + (r.ok ? 'success' : 'error');
    result.textContent = r.ok ? '✅ ' + (r.greeting || 'Connection successful') : '❌ ' + (r.error || 'Connection failed');
  } catch (e) {
    result.className = 'ftp-test-result error';
    result.textContent = '❌ ' + e.message;
  }
}

/* ─── Add/Edit Modal ─── */
function openAddFTP() {
  document.getElementById('ftpFormTitle').textContent = 'Create FTP User';
  document.getElementById('ftpFormUsername').value = '';
  document.getElementById('ftpFormUsername').disabled = false;
  document.getElementById('ftpFormPassword').value = '';
  document.getElementById('ftpFormPassword').required = true;
  document.getElementById('ftpFormPassword').placeholder = 'Min 6 characters';
  document.getElementById('ftpFormHome').value = '/home/';
  document.getElementById('ftpFormMaxRate').value = '0';
  document.getElementById('ftpFormMaxClients').value = '5';
  document.getElementById('ftpFormMaxPerIP').value = '2';
  document.getElementById('ftpFormWriteEnable').checked = true;
  document.getElementById('ftpFormDownloadEnable').checked = true;
  document.getElementById('ftpFormEnabled').checked = true;
  var enabledRow = document.getElementById('ftpEnabledRow');
  if (enabledRow) enabledRow.style.display = 'none';
  document.getElementById('ftpFormError').style.display = 'none';
  document.getElementById('ftpFormSuccess').style.display = 'none';
  document.getElementById('ftpFormModal').style.display = 'flex';
  document.getElementById('ftpFormUsername').focus();
  document._editingFTP = null;
}

async function openEditFTP(username) {
  try {
    var cfg = await API.ftp.get(username);
    document.getElementById('ftpFormTitle').textContent = 'Edit: ' + username;
    document.getElementById('ftpFormUsername').value = username;
    document.getElementById('ftpFormUsername').disabled = true;
    document.getElementById('ftpFormPassword').value = '';
    document.getElementById('ftpFormPassword').required = false;
    document.getElementById('ftpFormPassword').placeholder = 'Leave blank to keep';
    document.getElementById('ftpFormHome').value = cfg.localRoot || cfg.home;
    document.getElementById('ftpFormMaxRate').value = cfg.maxRate || 0;
    document.getElementById('ftpFormMaxClients').value = cfg.maxClients || 5;
    document.getElementById('ftpFormMaxPerIP').value = cfg.maxPerIP || 2;
    document.getElementById('ftpFormWriteEnable').checked = cfg.writeEnable !== false;
    document.getElementById('ftpFormDownloadEnable').checked = cfg.downloadEnable !== false;
    document.getElementById('ftpFormEnabled').checked = cfg.enabled;
    var enabledRow = document.getElementById('ftpEnabledRow');
    if (enabledRow) enabledRow.style.display = 'flex';
    document.getElementById('ftpFormError').style.display = 'none';
    document.getElementById('ftpFormSuccess').style.display = 'none';
    document.getElementById('ftpFormModal').style.display = 'flex';
    document._editingFTP = username;
  } catch (e) { showToast(e.message, 'error'); }
}

function closeFTPForm() {
  document.getElementById('ftpFormModal').style.display = 'none';
}

/* ─── Config Editor ─── */
async function openConfigEditor() {
  document.getElementById('ftpConfigModal').style.display = 'flex';
  var editor = document.getElementById('ftpConfigEditor');
  editor.value = 'Loading...';
  try {
    var r = await API.ftp.getConfig();
    editor.value = r.content;
  } catch (e) { editor.value = 'Error: ' + e.message; }
}

async function saveConfigEditor() {
  var content = document.getElementById('ftpConfigEditor').value;
  try {
    await API.ftp.saveConfig(content);
    showToast('Config saved. Restart vsftpd to apply.', 'success');
    document.getElementById('ftpConfigModal').style.display = 'none';
    await loadFTP();
  } catch (e) { showToast(e.message, 'error'); }
}

/* ─── SSL Modal ─── */
async function openSSLModal() {
  document.getElementById('ftpSSLModal').style.display = 'flex';
  var info = document.getElementById('ftpSSLInfo');
  info.innerHTML = '<div class="ftp-loading-inline">Loading...</div>';
  try {
    var r = await API.ftp.getSSL();
    if (r.exists) {
      info.innerHTML = '<div class="ftp-ssl-info">'
        + '<div class="ftp-ssl-row"><span class="ftp-ssl-label">Subject:</span> ' + escHtml(r.subject || 'N/A') + '</div>'
        + '<div class="ftp-ssl-row"><span class="ftp-ssl-label">Issuer:</span> ' + escHtml(r.issuer || 'N/A') + '</div>'
        + '<div class="ftp-ssl-row"><span class="ftp-ssl-label">Valid From:</span> ' + escHtml(r.notBefore || 'N/A') + '</div>'
        + '<div class="ftp-ssl-row"><span class="ftp-ssl-label">Valid Until:</span> ' + escHtml(r.notAfter || 'N/A') + '</div>'
        + '</div>';
    } else {
      info.innerHTML = '<div class="ftp-empty">No SSL certificate found</div>';
    }
  } catch (e) { info.innerHTML = '<div class="ftp-error-text">' + escHtml(e.message) + '</div>'; }
}

async function generateSSL() {
  var domain = document.getElementById('ftpSSLDomain').value.trim() || 'localhost';
  try {
    await API.ftp.generateSSL(domain);
    showToast('SSL certificate generated', 'success');
    await openSSLModal();
  } catch (e) { showToast(e.message, 'error'); }
}

/* ─── Passive Ports Modal ─── */
function openPassiveModal() {
  document.getElementById('ftpPassiveModal').style.display = 'flex';
}

async function savePassivePorts() {
  var minPort = parseInt(document.getElementById('ftpPassiveMin').value) || 40000;
  var maxPort = parseInt(document.getElementById('ftpPassiveMax').value) || 40010;
  try {
    await API.ftp.setPassivePorts(minPort, maxPort);
    showToast('Passive ports updated. Restart vsftpd to apply.', 'success');
    document.getElementById('ftpPassiveModal').style.display = 'none';
    await loadFTP();
  } catch (e) { showToast(e.message, 'error'); }
}

/* ─── Bandwidth Modal ─── */
async function openBandwidthModal() {
  document.getElementById('ftpBandwidthModal').style.display = 'flex';
  var body = document.getElementById('ftpBandwidthBody');
  body.innerHTML = '<div class="ftp-loading-inline">Loading...</div>';
  try {
    var r = await API.ftp.bandwidth();
    var html = '<div class="ftp-bw-stats">'
      + '<div class="ftp-bw-stat"><span class="ftp-bw-label">Total In</span><span class="ftp-bw-value">' + formatBytes(r.totalIn) + '</span></div>'
      + '<div class="ftp-bw-stat"><span class="ftp-bw-label">Total Out</span><span class="ftp-bw-value">' + formatBytes(r.totalOut) + '</span></div>'
      + '<div class="ftp-bw-stat"><span class="ftp-bw-label">Transfers</span><span class="ftp-bw-value">' + r.transferCount + '</span></div>'
      + '</div>';
    if (r.recentTransfers && r.recentTransfers.length) {
      html += '<div class="ftp-bw-recent"><div class="ftp-bw-recent-title">Recent Transfers</div>';
      for (var i = 0; i < r.recentTransfers.length; i++) {
        var t = r.recentTransfers[i];
        html += '<div class="ftp-bw-transfer">'
          + '<span class="ftp-bw-transfer-icon">' + (t.type === 'i' ? '⬇' : '⬆') + '</span>'
          + '<span class="ftp-bw-transfer-name">' + escHtml(t.fileName || '?') + '</span>'
          + '<span class="ftp-bw-transfer-size">' + formatBytes(t.size) + '</span>'
          + '<span class="ftp-bw-transfer-time">' + escHtml(t.timestamp || '') + '</span>'
          + '</div>';
      }
      html += '</div>';
    }
    body.innerHTML = html;
  } catch (e) { body.innerHTML = '<div class="ftp-error-text">' + escHtml(e.message) + '</div>'; }
}

/* ─── Activity Logs Modal ─── */
async function openLogsModal() {
  document.getElementById('ftpLogsModal').style.display = 'flex';
  await loadLogs();
}

async function loadLogs() {
  var body = document.getElementById('ftpLogsBody');
  body.innerHTML = '<div class="ftp-loading-inline">Loading...</div>';
  try {
    var search = document.getElementById('ftpLogsSearch') ? document.getElementById('ftpLogsSearch').value : '';
    var r = await API.ftp.activity({ limit: 100, search: search });
    if (r.logs.length === 0) {
      body.innerHTML = '<div class="ftp-empty">No logs found</div>';
      return;
    }
    var html = '<div class="ftp-log-list">';
    for (var i = 0; i < r.logs.length; i++) {
      var log = r.logs[i];
      var username = log.username || '';
      var ip = log.ip || '';
      var msg = log.message || log.fileName || log.raw || '';
      html += '<div class="ftp-log-entry">'
        + '<span class="ftp-log-time">' + escHtml(log.timestamp || '') + '</span>'
        + (username ? '<span class="ftp-log-user">' + escHtml(username) + '</span>' : '')
        + (ip ? '<span class="ftp-log-ip">' + escHtml(ip) + '</span>' : '')
        + '<span class="ftp-log-msg">' + escHtml(msg) + '</span>'
        + '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
  } catch (e) { body.innerHTML = '<div class="ftp-error-text">' + escHtml(e.message) + '</div>'; }
}

/* ─── Initialization ─── */
document.addEventListener('DOMContentLoaded', function () {
  /* Form submit */
  document.getElementById('ftpForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var isEdit = !!document._editingFTP;
    var username = document.getElementById('ftpFormUsername').value.trim();
    var password = document.getElementById('ftpFormPassword').value;
    var home = document.getElementById('ftpFormHome').value.trim();
    var maxRate = parseInt(document.getElementById('ftpFormMaxRate').value) || 0;
    var maxClients = parseInt(document.getElementById('ftpFormMaxClients').value) || 5;
    var maxPerIP = parseInt(document.getElementById('ftpFormMaxPerIP').value) || 2;
    var writeEnable = document.getElementById('ftpFormWriteEnable').checked;
    var downloadEnable = document.getElementById('ftpFormDownloadEnable').checked;
    var errEl = document.getElementById('ftpFormError');
    var succEl = document.getElementById('ftpFormSuccess');
    errEl.style.display = 'none';
    succEl.style.display = 'none';

    try {
      if (isEdit) {
        var body = { home: home, maxRate: maxRate, maxClients: maxClients, maxPerIP: maxPerIP, localRoot: home, writeEnable: writeEnable, downloadEnable: downloadEnable };
        if (password) body.password = password;
        body.enabled = document.getElementById('ftpFormEnabled').checked;
        await API.ftp.update(username, body);
      } else {
        if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
        await API.ftp.create({ username: username, password: password, home: home || '/home/' + username, maxRate: maxRate, maxClients: maxClients, maxPerIP: maxPerIP });
      }
      succEl.textContent = isEdit ? 'User updated' : 'User created';
      succEl.style.display = 'block';
      setTimeout(function () { closeFTPForm(); loadFTP(); }, 800);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  });

  /* Button bindings */
  var ftpAddBtn = document.getElementById('ftpAddBtn');
  if (ftpAddBtn) ftpAddBtn.addEventListener('click', openAddFTP);

  var ftpRefreshBtn = document.getElementById('ftpRefreshBtn');
  if (ftpRefreshBtn) ftpRefreshBtn.addEventListener('click', loadFTP);

  var ftpRetryBtn = document.getElementById('ftpRetryBtn');
  if (ftpRetryBtn) ftpRetryBtn.addEventListener('click', loadFTP);

  var ftpConfigBtn = document.getElementById('ftpConfigBtn');
  if (ftpConfigBtn) ftpConfigBtn.addEventListener('click', openConfigEditor);

  var ftpSSLBtn = document.getElementById('ftpSSLBtn');
  if (ftpSSLBtn) ftpSSLBtn.addEventListener('click', openSSLModal);

  var ftpTestBtn = document.getElementById('ftpTestBtn');
  if (ftpTestBtn) ftpTestBtn.addEventListener('click', openTestModal);

  var ftpLogsBtn = document.getElementById('ftpLogsBtn');
  if (ftpLogsBtn) ftpLogsBtn.addEventListener('click', openLogsModal);

  var ftpBwBtn = document.getElementById('ftpBwBtn');
  if (ftpBwBtn) ftpBwBtn.addEventListener('click', openBandwidthModal);

  var ftpPassiveBtn = document.getElementById('ftpPassiveBtn');
  if (ftpPassiveBtn) ftpPassiveBtn.addEventListener('click', openPassiveModal);

  /* Service control delegation */
  var ftpServiceCtrl = document.getElementById('ftpServiceCtrl');
  if (ftpServiceCtrl) {
    ftpServiceCtrl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-ftp-service]');
      if (btn) ftpServiceAction(btn.getAttribute('data-ftp-service'));
    });
  }

  /* Modal close buttons */
  ['ftpFormClose', 'ftpFormCancel'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', closeFTPForm);
  });

  var ftpConfigClose = document.getElementById('ftpConfigClose');
  if (ftpConfigClose) ftpConfigClose.addEventListener('click', function () { document.getElementById('ftpConfigModal').style.display = 'none'; });

  var ftpSSLClose = document.getElementById('ftpSSLClose');
  if (ftpSSLClose) ftpSSLClose.addEventListener('click', function () { document.getElementById('ftpSSLModal').style.display = 'none'; });

  var ftpTestClose = document.getElementById('ftpTestClose');
  if (ftpTestClose) ftpTestClose.addEventListener('click', function () { document.getElementById('ftpTestModal').style.display = 'none'; });

  var ftpPassiveClose = document.getElementById('ftpPassiveClose');
  if (ftpPassiveClose) ftpPassiveClose.addEventListener('click', function () { document.getElementById('ftpPassiveModal').style.display = 'none'; });

  var ftpBwClose = document.getElementById('ftpBwClose');
  if (ftpBwClose) ftpBwClose.addEventListener('click', function () { document.getElementById('ftpBandwidthModal').style.display = 'none'; });

  var ftpLogsClose = document.getElementById('ftpLogsClose');
  if (ftpLogsClose) ftpLogsClose.addEventListener('click', function () { document.getElementById('ftpLogsModal').style.display = 'none'; });

  var ftpConfigSave = document.getElementById('ftpConfigSave');
  if (ftpConfigSave) ftpConfigSave.addEventListener('click', saveConfigEditor);

  var ftpSSLGenerate = document.getElementById('ftpSSLGenerate');
  if (ftpSSLGenerate) ftpSSLGenerate.addEventListener('click', generateSSL);

  var ftpTestRun = document.getElementById('ftpTestRun');
  if (ftpTestRun) ftpTestRun.addEventListener('click', runConnectionTest);

  var ftpPassiveSave = document.getElementById('ftpPassiveSave');
  if (ftpPassiveSave) ftpPassiveSave.addEventListener('click', savePassivePorts);

  /* Backdrop click-to-close */
  document.querySelectorAll('.ftp-modal-overlay').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (e.target === el) el.style.display = 'none';
    });
  });

  /* Logs search */
  var ftpLogsSearch = document.getElementById('ftpLogsSearch');
  if (ftpLogsSearch) {
    var logSearchTimer;
    ftpLogsSearch.addEventListener('input', function () {
      clearTimeout(logSearchTimer);
      logSearchTimer = setTimeout(loadLogs, 400);
    });
  }
});

/* ─── Helpers ─── */
function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
