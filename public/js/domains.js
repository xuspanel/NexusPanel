let domainsData = [];
let domainsNginxContent = '';
let domainsEditing = null;

window.initDomains = async function () {
  try {
    const u = await API.me();
    if (u.role !== 'admin') {
      document.getElementById('domainsContent').innerHTML = '<div class="db-error"><span class="db-error-icon">\u26A0\uFE0F</span><span>Admin access required</span></div>';
      return;
    }
    await loadDomains();
  } catch (err) {
    document.getElementById('domainsContent').innerHTML = '<div class="db-error"><span class="db-error-icon">\u26A0\uFE0F</span><span>' + err.message + '</span></div>';
  }
};

async function loadDomains() {
  try {
    document.getElementById('domainsLoading').style.display = 'flex';
    document.getElementById('domainsContent').style.display = 'none';

    const list = await API.domains.list();
    domainsData = list;
    renderDomainsTable(list);
    document.getElementById('domainsLoading').style.display = 'none';
    document.getElementById('domainsContent').style.display = 'block';
  } catch (err) {
    document.getElementById('domainsLoading').style.display = 'none';
    document.getElementById('domainsError').style.display = 'flex';
    document.getElementById('domainsErrorText').textContent = err.message;
  }
}

function renderDomainsTable(domains) {
  const tbody = document.getElementById('domainsTableBody');
  tbody.innerHTML = domains.map(d => {
    const typeBadge = d.type === 'subdomain'
      ? '<span class="domain-type-badge domain-type-sub">SUB</span>'
      : '<span class="domain-type-badge domain-type-main">DOMAIN</span>';
    const sslBadge = d.sslEnabled
      ? '<span class="domain-ssl-badge on">\uD83D\uDD12 SSL</span>'
      : '<span class="domain-ssl-badge off">\u26A0 No SSL</span>';
    const syncBadge = d.syncedFromNginx
      ? '<span class="domain-sync-badge">\uD83D\uDD04 Synced</span>'
      : '';
    return '<tr>' +
      '<td>' + typeBadge + '</td>' +
      '<td><span class="domain-name-cell">' + escHtml(d.domain) + '</span> ' + syncBadge + '</td>' +
      '<td><span class="domain-port-badge">' + d.port + '</span></td>' +
      '<td>' + sslBadge + '</td>' +
      '<td class="domain-root-cell" title="' + escHtml(d.root) + '">' + escHtml(d.root) + '</td>' +
      '<td class="domain-date-cell">' + (d.createdAt ? formatDate(d.createdAt) : '—') + '</td>' +
      '<td class="domain-actions">' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm" onclick="openVisitDomain(\'' + escHtml(d.domain) + '\', ' + d.port + ', ' + d.sslEnabled + ')" title="Open site in new tab">\uD83D\uDD17</button>' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm" onclick="openDomainNginx(\'' + escHtml(d.domain) + '\')" title="View/Edit nginx config">\u2699</button>' +
        (d.sslEnabled ? '' : '<button class="fm-btn fm-btn-secondary fm-btn-sm" onclick="installDomainSSL(\'' + escHtml(d.domain) + '\')" title="Install SSL">\uD83D\uDD12</button>') +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm" onclick="openEditDomain(\'' + escHtml(d.domain) + '\')" title="Edit">\u2692\uFE0F</button>' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm domain-delete-btn" onclick="deleteDomain(\'' + escHtml(d.domain) + '\')" title="Delete">\uD83D\uDDD1</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

/* ── Add/Edit Domain Modal ── */

function openAddDomain() {
  domainsEditing = null;
  document.getElementById('domainFormTitle').textContent = 'Add Domain';
  document.getElementById('domainFormSubmit').textContent = 'Create Domain';
  document.getElementById('domainFormName').value = '';
  document.getElementById('domainFormName').disabled = false;
  document.getElementById('domainFormPort').value = '';
  document.getElementById('domainFormPort').placeholder = 'Auto-assign (8000-9000)';
  document.getElementById('domainFormSSL').checked = true;
  document.getElementById('domainFormTypeDomain').checked = true;
  document.getElementById('domainFormTypeSub').checked = false;
  document.getElementById('domainFormParentRow').style.display = 'none';
  document.getElementById('domainFormError').style.display = 'none';
  document.getElementById('domainFormSuccess').style.display = 'none';
  document.getElementById('domainFormModal').style.display = 'flex';
  document.getElementById('domainFormName').focus();
  populateParentDropdown();
}

async function openEditDomain(name) {
  try {
    const d = await API.domains.get(name);
    domainsEditing = name;
    document.getElementById('domainFormTitle').textContent = 'Edit: ' + name;
    document.getElementById('domainFormSubmit').textContent = 'Save Changes';
    document.getElementById('domainFormName').value = name;
    document.getElementById('domainFormName').disabled = true;
    document.getElementById('domainFormPort').value = d.port || '';
    document.getElementById('domainFormPort').placeholder = 'Port number';
    document.getElementById('domainFormSSL').checked = d.sslEnabled;
    if (d.type === 'subdomain') {
      document.getElementById('domainFormTypeSub').checked = true;
      document.getElementById('domainFormTypeDomain').checked = false;
      document.getElementById('domainFormParentRow').style.display = 'flex';
    } else {
      document.getElementById('domainFormTypeDomain').checked = true;
      document.getElementById('domainFormTypeSub').checked = false;
      document.getElementById('domainFormParentRow').style.display = 'none';
    }
    document.getElementById('domainFormError').style.display = 'none';
    document.getElementById('domainFormSuccess').style.display = 'none';
    document.getElementById('domainFormModal').style.display = 'flex';
    populateParentDropdown();
  } catch (e) { fmShowToast(e.message, 'error'); }
}

function closeDomainForm() {
  document.getElementById('domainFormModal').style.display = 'none';
}

function toggleDomainType() {
  const isSub = document.getElementById('domainFormTypeSub').checked;
  document.getElementById('domainFormParentRow').style.display = isSub ? 'flex' : 'none';
}

async function populateParentDropdown() {
  try {
    const parents = await API.domains.parents();
    const sel = document.getElementById('domainFormParent');
    sel.innerHTML = '<option value="">Select parent domain...</option>' +
      parents.map(p => '<option value="' + escHtml(p) + '">' + escHtml(p) + '</option>').join('');
  } catch (_) {}
}

/* ── Nginx Config Preview/Edit Modal ── */

async function openDomainNginx(name) {
  try {
    const d = await API.domains.get(name);
    const nginx = await API.domains.nginx(name);
    domainsNginxContent = nginx.content;

    document.getElementById('nginxPreviewTitle').textContent = 'nginx Config: ' + name;
    document.getElementById('nginxPreviewDomain').textContent = name;
    document.getElementById('nginxPreviewType').textContent = d.type === 'subdomain' ? 'Subdomain' : 'Domain';
    document.getElementById('nginxPreviewPort').textContent = d.port;
    document.getElementById('nginxPreviewRoot').textContent = d.root;
    document.getElementById('nginxPreviewSSL').textContent = d.sslEnabled ? 'Enabled' : 'Not installed';
    document.getElementById('nginxPreviewSSL').className = 'domain-info-value ' + (d.sslEnabled ? 'text-green' : 'text-muted');

    renderNginxPreview(nginx.content);

    document.getElementById('nginxEditBtn').style.display = 'inline-flex';
    document.getElementById('nginxSaveBtn').style.display = 'none';
    document.getElementById('nginxCancelBtn').style.display = 'none';
    document.getElementById('nginxTextarea').style.display = 'none';
    document.getElementById('nginxPreviewBlock').style.display = 'block';
    document.getElementById('nginxEditStatus').textContent = '';

    document.getElementById('nginxPreviewModal').style.display = 'flex';
  } catch (e) { fmShowToast(e.message, 'error'); }
}

function renderNginxPreview(content) {
  const el = document.getElementById('nginxPreviewBlock');
  const highlighted = content.split('\n').map(line => {
    let cls = '';
    if (/^\s*server\s*\{/.test(line)) cls = 'dnl-server';
    else if (/^\s*server_name\s/.test(line)) cls = 'dnl-server-name';
    else if (/^\s*listen\s/.test(line)) cls = 'dnl-listen';
    else if (/^\s*root\s/.test(line)) cls = 'dnl-root';
    else if (/^\s*location\s/.test(line)) cls = 'dnl-location';
    else if (/^\s*ssl_/.test(line)) cls = 'dnl-ssl';
    else if (/^\s*return\s/.test(line)) cls = 'dnl-return';
    else if (/^\s*access_log|^\s*error_log/.test(line)) cls = 'dnl-log';
    else if (/^\s*include\s/.test(line)) cls = 'dnl-include';
    else if (/^\s*index\s/.test(line)) cls = 'dnl-index';
    if (cls) return '<span class="' + cls + '">' + escHtml(line) + '</span>';
    return escHtml(line);
  }).join('\n');
  el.innerHTML = highlighted;
}

function toggleNginxEdit() {
  const preview = document.getElementById('nginxPreviewBlock');
  const textarea = document.getElementById('nginxTextarea');
  const isEditing = textarea.style.display === 'block';

  if (!isEditing) {
    textarea.value = domainsNginxContent;
    preview.style.display = 'none';
    textarea.style.display = 'block';
    document.getElementById('nginxEditBtn').style.display = 'none';
    document.getElementById('nginxSaveBtn').style.display = 'inline-flex';
    document.getElementById('nginxCancelBtn').style.display = 'inline-flex';
    document.getElementById('nginxEditStatus').textContent = 'Editing — make your changes and click Save';
    textarea.focus();
  }
}

function cancelNginxEdit() {
  document.getElementById('nginxTextarea').style.display = 'none';
  document.getElementById('nginxPreviewBlock').style.display = 'block';
  document.getElementById('nginxEditBtn').style.display = 'inline-flex';
  document.getElementById('nginxSaveBtn').style.display = 'none';
  document.getElementById('nginxCancelBtn').style.display = 'none';
  document.getElementById('nginxEditStatus').textContent = '';
  renderNginxPreview(domainsNginxContent);
}

async function saveNginxConfig() {
  const name = document.getElementById('nginxPreviewDomain').textContent;
  const content = document.getElementById('nginxTextarea').value;
  try {
    await API.domains.saveNginx(name, content);
    domainsNginxContent = content;
    fmShowToast('nginx config saved and reloaded', 'success');
    cancelNginxEdit();
    renderNginxPreview(content);
  } catch (e) { fmShowToast(e.message, 'error'); }
}

function closeNginxPreview() {
  document.getElementById('nginxPreviewModal').style.display = 'none';
}

/* ── Actions ── */

function openVisitDomain(name, port, ssl) {
  const protocol = ssl ? 'https' : 'http';
  const defaultPort = ssl ? 443 : 80;
  const url = protocol + '://' + name + (Number(port) === defaultPort ? '' : ':' + port);
  window.open(url, '_blank');
}

async function installDomainSSL(name) {
  try {
    fmShowToast('Installing SSL for ' + name + '...', 'success');
    const result = await API.domains.ssl(name);
    if (result.success) {
      fmShowToast('SSL installed successfully for ' + name, 'success');
    } else {
      fmShowToast('SSL install had issues: ' + (result.output || '').substring(0, 200), 'error');
    }
    await loadDomains();
  } catch (e) { fmShowToast(e.message, 'error'); }
}

async function deleteDomain(name) {
  if (!confirm('Delete domain "' + name + '"?\n\nThis will:\n- Remove the nginx config file\n- Delete the /var/www/' + name + ' folder\n- Remove the SSL certificate (if any)\n\nThis action cannot be undone.')) return;
  try {
    await API.domains.del(name);
    fmShowToast('Deleted ' + name, 'success');
    await loadDomains();
  } catch (e) { fmShowToast(e.message, 'error'); }
}

/* ── Form Submit ── */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('domainForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = !!domainsEditing;
    const name = document.getElementById('domainFormName').value.trim().toLowerCase();
    const port = parseInt(document.getElementById('domainFormPort').value) || 0;
    const ssl = document.getElementById('domainFormSSL').checked;
    const type = document.getElementById('domainFormTypeSub').checked ? 'subdomain' : 'domain';
    const errEl = document.getElementById('domainFormError');
    const succEl = document.getElementById('domainFormSuccess');
    errEl.style.display = 'none';
    succEl.style.display = 'none';

    const btn = document.getElementById('domainFormSubmit');
    btn.disabled = true;
    btn.textContent = 'Processing...';
    try {
      if (isEdit) {
        await API.domains.update(domainsEditing, { port, sslEnabled: ssl, type });
        succEl.textContent = 'Domain updated';
      } else {
        await API.domains.create({ domain: name, port: port || undefined, ssl, type });
        succEl.textContent = 'Domain created';
      }
      succEl.style.display = 'block';
      setTimeout(() => { closeDomainForm(); loadDomains(); }, 800);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = isEdit ? 'Save Changes' : 'Create Domain';
    }
  });

  document.getElementById('domainFormCancel').addEventListener('click', closeDomainForm);
  document.getElementById('domainFormClose').addEventListener('click', closeDomainForm);

  document.querySelectorAll('.domain-form-modal').forEach(el => {
    el.addEventListener('click', (e) => { if (e.target === el) closeDomainForm(); });
  });

  document.getElementById('domainsAddBtn').addEventListener('click', openAddDomain);
  document.getElementById('domainsRefreshBtn').addEventListener('click', loadDomains);
  document.getElementById('domainsRetryBtn').addEventListener('click', loadDomains);

  document.getElementById('nginxEditBtn').addEventListener('click', toggleNginxEdit);
  document.getElementById('nginxSaveBtn').addEventListener('click', saveNginxConfig);
  document.getElementById('nginxCancelBtn').addEventListener('click', cancelNginxEdit);
  document.getElementById('nginxPreviewClose').addEventListener('click', closeNginxPreview);
  document.querySelectorAll('.domain-nginx-modal').forEach(el => {
    el.addEventListener('click', (e) => { if (e.target === el) closeNginxPreview(); });
  });

  document.querySelectorAll('input[name="domainType"]').forEach(r => {
    r.addEventListener('change', toggleDomainType);
  });
});

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (_) { return iso; }
}

function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmShowToast(msg, type) {
  const el = document.getElementById('fmToast');
  const icon = document.getElementById('fmToastIcon');
  const text = document.getElementById('fmToastMsg');
  if (!el) return;
  text.textContent = msg;
  icon.textContent = type === 'error' ? '\u26A0\uFE0F' : '\u2705';
  el.className = 'fm-toast fm-toast-' + (type || 'success') + ' fm-toast-show';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.className = 'fm-toast fm-toast-' + (type || 'success');
  }, 3000);
}
