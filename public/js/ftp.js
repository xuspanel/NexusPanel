let ftpData = [];

window.initFTP = async function () {
  try {
    const u = await API.me();
    if (u.role !== 'admin') {
      document.getElementById('ftpContent').innerHTML = '<div class="db-error"><span class="db-error-icon">⚠️</span><span>Admin access required</span></div>';
      return;
    }
    await loadFTP();
  } catch (err) {
    document.getElementById('ftpContent').innerHTML = '<div class="db-error"><span class="db-error-icon">⚠️</span><span>' + err.message + '</span></div>';
  }
};

async function loadFTP() {
  try {
    document.getElementById('ftpLoading').style.display = 'flex';
    document.getElementById('ftpContent').style.display = 'none';

    const [status, accounts] = await Promise.all([
      API.ftp.status(),
      API.ftp.accounts(),
    ]);

    renderFTPStatus(status);
    ftpData = accounts;
    renderFTPTable(accounts);
    document.getElementById('ftpLoading').style.display = 'none';
    document.getElementById('ftpContent').style.display = 'block';
  } catch (err) {
    document.getElementById('ftpLoading').style.display = 'none';
    document.getElementById('ftpError').style.display = 'flex';
    document.getElementById('ftpErrorText').textContent = err.message;
  }
}

function renderFTPStatus(status) {
  const el = document.getElementById('ftpStatusCards');
  el.innerHTML = [
    { label: 'Server', value: status.isActive ? '🟢 Online' : '🔴 Offline', cls: status.isActive ? 'online' : 'offline' },
    { label: 'Allowed Users', value: status.allowedUsers },
    { label: 'Max Clients', value: status.maxClients },
    { label: 'Passive Ports', value: status.passiveRange, small: true },
    { label: 'Chroot', value: status.chrootEnabled ? '✅' : '❌', small: true },
    { label: 'Version', value: escHtml(status.version || '3.0.5'), small: true },
  ].map(c => `<div class="ftp-stat-card ${c.cls || ''}"><div class="ftp-stat-label">${c.label}</div><div class="ftp-stat-value ${c.small ? 'ftp-stat-small' : ''}">${c.value}</div></div>`).join('');
}

function renderFTPTable(accounts) {
  const tbody = document.getElementById('ftpTableBody');
  tbody.innerHTML = accounts.map(a => {
    const rateStr = a.maxRate > 0 ? formatSize(a.maxRate) + '/s' : 'Unlimited';
    return `<tr>
      <td>
        <span class="ftp-user-name">${escHtml(a.username)}</span>
        ${a.isSystemUser ? '<span class="ftp-badge ftp-badge-sys">System</span>' : ''}
        ${a.uid === 0 ? '<span class="ftp-badge ftp-badge-root">Root</span>' : ''}
      </td>
      <td class="ftp-home-cell" title="${escHtml(a.localRoot || a.home)}">${escHtml(a.localRoot || a.home)}</td>
      <td>${formatSize(a.quotaUsed) || '0 B'}</td>
      <td>${rateStr}</td>
      <td>${a.maxClients} / ${a.maxPerIP} ip</td>
      <td>
        <span class="ftp-status-dot ${a.enabled ? 'on' : 'off'}"></span>
        ${a.enabled ? 'Enabled' : 'Disabled'}
      </td>
      <td class="ftp-actions">
        <button class="fm-btn fm-btn-secondary fm-btn-sm" onclick="openEditFTP('${a.username}')" title="Edit">⚙</button>
        ${a.enabled
          ? `<button class="fm-btn fm-btn-secondary fm-btn-sm" onclick="toggleFTP('${a.username}', false)">🔒</button>`
          : `<button class="fm-btn fm-btn-secondary fm-btn-sm" onclick="toggleFTP('${a.username}', true)">🔓</button>`
        }
        ${a.uid !== 0 ? `<button class="fm-btn fm-btn-secondary fm-btn-sm ftp-delete-btn" onclick="deleteFTPUser('${a.username}')">🗑</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

async function toggleFTP(username, enable) {
  try {
    if (enable) { await API.ftp.enable(username); fmShowToast(`FTP enabled for ${username}`, 'success'); }
    else { await API.ftp.disable(username); fmShowToast(`FTP disabled for ${username}`, 'success'); }
    await loadFTP();
  } catch (e) { fmShowToast(e.message, 'error'); }
}

async function deleteFTPUser(username) {
  if (!confirm('Delete FTP user "' + username + '"? This removes their system account, home directory, and FTP access permanently.')) return;
  try {
    await API.ftp.del(username);
    fmShowToast(`Deleted ${username}`, 'success');
    await loadFTP();
  } catch (e) { fmShowToast(e.message, 'error'); }
}

/* ── Add/Edit Modal ── */
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
  document.getElementById('ftpFormError').style.display = 'none';
  document.getElementById('ftpFormSuccess').style.display = 'none';
  document.getElementById('ftpFormModal').style.display = 'flex';
  document.getElementById('ftpFormUsername').focus();
  document._editingFTP = null;
}

async function openEditFTP(username) {
  try {
    const cfg = await API.ftp.get(username);
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
  document.getElementById('ftpFormEnabled').checked = cfg.enabled;
  document.getElementById('ftpFormEnabled').parentElement.parentElement.parentElement.style.display = 'flex';
  document.getElementById('ftpFormError').style.display = 'none';
    document.getElementById('ftpFormSuccess').style.display = 'none';
    document.getElementById('ftpFormModal').style.display = 'flex';
    document._editingFTP = username;
  } catch (e) { fmShowToast(e.message, 'error'); }
}

function closeFTPForm() {
  document.getElementById('ftpFormModal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ftpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = !!document._editingFTP;
    const username = document.getElementById('ftpFormUsername').value.trim();
    const password = document.getElementById('ftpFormPassword').value;
    const home = document.getElementById('ftpFormHome').value.trim();
    const maxRate = parseInt(document.getElementById('ftpFormMaxRate').value) || 0;
    const maxClients = parseInt(document.getElementById('ftpFormMaxClients').value) || 5;
    const maxPerIP = parseInt(document.getElementById('ftpFormMaxPerIP').value) || 2;
    const errEl = document.getElementById('ftpFormError');
    const succEl = document.getElementById('ftpFormSuccess');
    errEl.style.display = 'none';
    succEl.style.display = 'none';

    try {
      if (isEdit) {
        const body = { home, maxRate, maxClients, maxPerIP, localRoot: home };
        if (password) body.password = password;
        body.enabled = document.getElementById('ftpFormEnabled').checked;
        await API.ftp.update(username, body);
      } else {
        if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
        await API.ftp.create({ username, password, home: home || '/home/' + username, maxRate, maxClients, maxPerIP });
      }
      succEl.textContent = isEdit ? 'User updated' : 'User created';
      succEl.style.display = 'block';
      setTimeout(() => { closeFTPForm(); loadFTP(); }, 800);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  });

  document.getElementById('ftpFormCancel').addEventListener('click', closeFTPForm);
  document.getElementById('ftpFormClose').addEventListener('click', closeFTPForm);

  document.getElementById('ftpAddBtn').addEventListener('click', openAddFTP);
  document.getElementById('ftpRefreshBtn').addEventListener('click', loadFTP);
  document.getElementById('ftpRetryBtn').addEventListener('click', loadFTP);

  document.querySelectorAll('.ftp-form-modal').forEach(el => {
    el.addEventListener('click', (e) => { if (e.target === el) closeFTPForm(); });
  });
});

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
