let domainsData = [];
let domainsNginxContent = '';
let domainsEditing = null;
let domainsCurrentSort = 'domain';
let domainsSortDir = 'asc';
let domainsCurrentPage = 1;
let domainsTotalPages = 1;
let domainsSearch = '';
let domainsSelected = new Set();
let domainsDeleteTarget = null;
let domainsKnownNames = new Set();

window.initDomains = async function () {
  try {
    const u = await API.me();
    if (u.role !== 'admin') {
      document.getElementById('domainsContent').innerHTML = '<div class="db-error"><span class="db-error-icon">⚠️</span><span>Admin access required</span></div>';
      return;
    }
    document.getElementById('domainsSearchBar').style.display = 'block';
    bindDomainsEvents();
    await loadDomains();
  } catch (err) {
    document.getElementById('domainsContent').innerHTML = '<div class="db-error"><span class="db-error-icon">⚠️</span><span>' + escHtml(err.message) + '</span></div>';
  }
};

function bindDomainsEvents() {
  const searchBar = document.getElementById('domainsSearchBar');
  if (searchBar && !searchBar.dataset.bound) {
    searchBar.dataset.bound = '1';
    document.getElementById('domainsSearch').addEventListener('input', (e) => {
      domainsSearch = e.target.value.trim();
      domainsCurrentPage = 1;
      loadDomains();
    });
  }

  const selectAll = document.getElementById('domainsSelectAll');
  if (selectAll && !selectAll.dataset.bound) {
    selectAll.dataset.bound = '1';
    selectAll.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.domains-cb');
      const selectable = [];
      checkboxes.forEach(cb => { selectable.push(cb); cb.checked = e.target.checked; });
      domainsSelected.clear();
      if (e.target.checked) selectable.forEach(cb => domainsSelected.add(cb.dataset.dm));
      updateBulkBar();
    });
  }

  document.getElementById('domainsBulkDelete')?.addEventListener('click', bulkDeleteDomains);
  document.getElementById('domainsBulkClear')?.addEventListener('click', () => {
    domainsSelected.clear();
    document.querySelectorAll('.domains-cb').forEach(cb => cb.checked = false);
    document.getElementById('domainsSelectAll').checked = false;
    updateBulkBar();
  });

  document.querySelectorAll('[data-dm-sort]').forEach(el => {
    el.addEventListener('click', () => {
      const field = el.dataset.dmSort;
      if (domainsCurrentSort === field) {
        domainsSortDir = domainsSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        domainsCurrentSort = field;
        domainsSortDir = 'asc';
      }
      domainsCurrentPage = 1;
      loadDomains();
    });
  });

  const nameInput = document.getElementById('domainFormName');
  if (nameInput && !nameInput.dataset.bound) {
    nameInput.dataset.bound = '1';
    nameInput.addEventListener('input', updateRootPlaceholder);
  }

  document.getElementById('domainDeleteClose')?.addEventListener('click', closeDomainDeleteModal);
  document.getElementById('domainDeleteCancel')?.addEventListener('click', closeDomainDeleteModal);
  document.getElementById('domainDeleteConfirm')?.addEventListener('click', confirmDeleteDomain);
  document.querySelectorAll('.domain-delete-modal').forEach(el => {
    el.addEventListener('click', (e) => { if (e.target === el) closeDomainDeleteModal(); });
  });
}

async function loadDomains() {
  try {
    document.getElementById('domainsLoading').style.display = 'flex';
    document.getElementById('domainsContent').style.display = 'none';
    document.getElementById('domainsError').style.display = 'none';

    const result = await API.domains.list({
      search: domainsSearch || undefined,
      sort: domainsCurrentSort,
      dir: domainsSortDir,
      page: domainsCurrentPage,
      limit: 50,
    });

    domainsData = result.domains;
    domainsTotalPages = result.pages || 1;
    domainsCurrentPage = result.page || 1;
    domainsSelected.clear();
    document.getElementById('domainsSelectAll').checked = false;
    updateBulkBar();

    renderDomainsTable(domainsData);
    renderSortIcons();
    renderPagination(result.total || 0);

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
  if (!domains || domains.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="users-empty">No domains found</td></tr>';
    return;
  }
  tbody.innerHTML = domains.map(d => {
    const typeBadge = d.type === 'subdomain'
      ? '<span class="domain-type-badge domain-type-sub">SUB</span>'
      : '<span class="domain-type-badge domain-type-main">DOMAIN</span>';
    const sslBadge = d.sslEnabled
      ? '<span class="domain-ssl-badge on">🔒 SSL</span>'
      : '<span class="domain-ssl-badge off">⚠ No SSL</span>';
    const sslExpiry = d.sslInfo
      ? '<span class="domain-ssl-expiry' + (d.sslInfo.isExpiringSoon ? ' expiring' : '') + (d.sslInfo.isExpired ? ' expired' : '') + '">' +
        (d.sslInfo.isExpired ? 'Expired' : d.sslInfo.daysLeft + 'd left') + '</span>'
      : '';
    const syncBadge = d.syncedFromNginx
      ? '<span class="domain-sync-badge">🔄 Synced</span>'
      : '';
    const checked = domainsSelected.has(d.domain) ? ' checked' : '';
    return '<tr>' +
      '<td><input type="checkbox" class="domains-cb" data-dm="' + escHtml(d.domain) + '"' + checked + '></td>' +
      '<td>' + typeBadge + '</td>' +
      '<td><span class="domain-name-cell">' + escHtml(d.domain) + '</span> ' + syncBadge + '</td>' +
      '<td><span class="domain-port-badge">' + d.port + '</span></td>' +
      '<td>' + sslBadge + ' ' + sslExpiry + '</td>' +
      '<td class="domain-root-cell" title="' + escHtml(d.root) + '">' + escHtml(d.root) + '</td>' +
      '<td class="domain-date-cell">' + (d.createdAt ? formatDate(d.createdAt) : '—') + '</td>' +
      '<td class="domain-actions">' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-dm-action="visit" data-dm-domain="' + escHtml(d.domain) + '" data-dm-port="' + d.port + '" data-dm-ssl="' + d.sslEnabled + '" title="Open site in new tab">🔗</button>' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-dm-action="dns" data-dm-domain="' + escHtml(d.domain) + '" title="DNS Authentication Records (DKIM, SPF, DMARC)">🔑</button>' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-dm-action="nginx" data-dm-domain="' + escHtml(d.domain) + '" title="View/Edit nginx config">⚙</button>' +
        (!d.sslEnabled ? '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-dm-action="ssl" data-dm-domain="' + escHtml(d.domain) + '" title="Install SSL">🔒</button>' : '') +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-dm-action="edit" data-dm-domain="' + escHtml(d.domain) + '" title="Edit">✎</button>' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm domain-delete-btn" data-dm-action="delete" data-dm-domain="' + escHtml(d.domain) + '" title="Delete">🗑</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('.domains-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) domainsSelected.add(cb.dataset.dm);
      else domainsSelected.delete(cb.dataset.dm);
      updateBulkBar();
    });
  });

  tbody.querySelectorAll('[data-dm-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.dmAction;
      const name = btn.dataset.dmDomain;
      if (action === 'visit') openVisitDomain(name, parseInt(btn.dataset.dmPort), btn.dataset.dmSsl === 'true');
      else if (action === 'dns') {
        if (typeof window.openDnsModal === 'function') window.openDnsModal(name);
      }
      else if (action === 'nginx') openDomainNginx(name);
      else if (action === 'ssl') installDomainSSL(name);
      else if (action === 'edit') openEditDomain(name);
      else if (action === 'delete') openDeleteDomainModal(name);
    });
  });
}

function renderSortIcons() {
  document.querySelectorAll('.sort-icon').forEach(el => {
    const field = el.dataset.dmSort;
    if (field === domainsCurrentSort) {
      el.textContent = domainsSortDir === 'asc' ? '▲' : '▼';
    } else {
      el.textContent = '';
    }
  });
}

function renderPagination(total) {
  const el = document.getElementById('domainsPagination');
  if (!el) return;
  if (domainsTotalPages <= 1) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  let html = '<button class="pg-btn" data-dm-pg="prev"' + (domainsCurrentPage <= 1 ? ' disabled' : '') + '>‹</button>';
  const start = Math.max(1, domainsCurrentPage - 2);
  const end = Math.min(domainsTotalPages, domainsCurrentPage + 2);
  if (start > 1) html += '<button class="pg-btn" data-dm-pg="1">1</button>';
  if (start > 2) html += '<span class="pg-ellipsis">…</span>';
  for (let i = start; i <= end; i++) {
    html += '<button class="pg-btn' + (i === domainsCurrentPage ? ' pg-active' : '') + '" data-dm-pg="' + i + '">' + i + '</button>';
  }
  if (end < domainsTotalPages - 1) html += '<span class="pg-ellipsis">…</span>';
  if (end < domainsTotalPages) html += '<button class="pg-btn" data-dm-pg="' + domainsTotalPages + '">' + domainsTotalPages + '</button>';
  html += '<button class="pg-btn" data-dm-pg="next"' + (domainsCurrentPage >= domainsTotalPages ? ' disabled' : '') + '>›</button>';
  html += '<span class="pg-info">' + total + ' domains</span>';
  el.innerHTML = html;
  el.querySelectorAll('[data-dm-pg]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const pg = btn.dataset.dmPg;
      if (pg === 'prev') domainsCurrentPage = Math.max(1, domainsCurrentPage - 1);
      else if (pg === 'next') domainsCurrentPage = Math.min(domainsTotalPages, domainsCurrentPage + 1);
      else domainsCurrentPage = parseInt(pg, 10);
      loadDomains();
    });
  });
}

function updateBulkBar() {
  const bar = document.getElementById('domainsBulkBar');
  const count = document.getElementById('domainsBulkCount');
  if (domainsSelected.size > 0) {
    bar.style.display = 'flex';
    count.textContent = domainsSelected.size + ' selected';
  } else {
    bar.style.display = 'none';
  }
}

async function bulkDeleteDomains() {
  if (domainsSelected.size === 0) return;
  openDeleteDomainModal(Array.from(domainsSelected));
}

/* ── Delete Confirmation Modal ── */

function openDeleteDomainModal(target) {
  domainsDeleteTarget = target;
  const names = Array.isArray(target) ? target : [target];
  const msg = names.length === 1
    ? 'Delete domain "' + names[0] + '"?'
    : 'Delete ' + names.length + ' domains?';
  document.getElementById('domainDeleteMsg').textContent = msg;
  document.getElementById('domainDeleteModal').style.display = 'flex';
}

function closeDomainDeleteModal() {
  document.getElementById('domainDeleteModal').style.display = 'none';
  domainsDeleteTarget = null;
}

async function confirmDeleteDomain() {
  const target = domainsDeleteTarget;
  if (!target) return;
  const names = Array.isArray(target) ? target : [target];
  closeDomainDeleteModal();
  try {
    if (names.length === 1) {
      await API.domains.del(names[0]);
    } else {
      await API.domains.bulkDelete(names);
    }
    fmShowToast(names.length === 1 ? 'Deleted ' + names[0] : 'Deleted ' + names.length + ' domains', 'success');
    domainsSelected.clear();
    await loadDomains();
    refreshKnownNames();
  } catch (e) { fmShowToast(e.message, 'error'); }
}

/* ── Add/Edit Domain Modal ── */

async function refreshKnownNames() {
  try {
    const r = await API.domains.list({ page: 1, limit: 1000 });
    domainsKnownNames = new Set((r.domains || []).map(d => d.domain.toLowerCase()));
  } catch (_) {
    domainsKnownNames = new Set();
  }
}

function openAddDomain() {
  domainsEditing = null;
  refreshKnownNames();
  document.getElementById('domainFormTitle').textContent = 'Add Domain';
  document.getElementById('domainFormSubmit').textContent = 'Create Domain';
  document.getElementById('domainFormName').value = '';
  document.getElementById('domainFormName').disabled = false;
  document.getElementById('domainFormPort').value = '';
  document.getElementById('domainFormPort').placeholder = 'Auto-assign (8000-9000)';
  document.getElementById('domainFormRoot').value = '';
  updateRootPlaceholder();
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

function updateRootPlaceholder() {
  const name = document.getElementById('domainFormName').value.trim().toLowerCase();
  const root = document.getElementById('domainFormRoot');
  const hint = document.getElementById('domainFormRootHint');
  if (!root) return;
  if (name && /^[a-z0-9.-]+$/.test(name)) {
    root.placeholder = '/var/www/' + name;
    if (hint) hint.textContent = 'Leave empty to auto-create at /var/www/' + name;
  } else {
    root.placeholder = '/var/www/[domain]';
    if (hint) hint.textContent = 'Leave empty to auto-create at /var/www/[domain]';
  }
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
    document.getElementById('domainFormRoot').value = d.root || '';
    updateRootPlaceholder();
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
    await populateParentDropdown();
    if (d.parentDomain) {
      const sel = document.getElementById('domainFormParent');
      sel.value = d.parentDomain;
    }
  } catch (e) { fmShowToast(e.message, 'error'); }
}

function closeDomainForm() {
  document.getElementById('domainFormModal').style.display = 'none';
}

function toggleDomainType() {
  const isSub = document.getElementById('domainFormTypeSub').checked;
  document.getElementById('domainFormParentRow').style.display = isSub ? 'flex' : 'none';
  if (isSub) {
    const sel = document.getElementById('domainFormParent');
    const err = document.getElementById('domainFormError');
    if (sel && sel.options.length <= 1) {
      err.textContent = 'No parent domains available. Create a main domain first.';
      err.style.display = 'block';
    } else if (err) {
      err.style.display = 'none';
    }
  }
}

async function populateParentDropdown() {
  try {
    const parents = await API.domains.parents();
    const sel = document.getElementById('domainFormParent');
    const keep = sel.value;
    sel.innerHTML = '<option value="">Select parent domain...</option>' +
      parents.map(p => '<option value="' + escHtml(p) + '">' + escHtml(p) + '</option>').join('');
    if (keep && parents.includes(keep)) sel.value = keep;
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
  const protocol = ssl === 'true' || ssl === true ? 'https' : 'http';
  const defaultPort = protocol === 'https' ? 443 : 80;
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

/* ── Form Submit ── */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('domainForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = !!domainsEditing;
    const name = document.getElementById('domainFormName').value.trim().toLowerCase();
    const port = parseInt(document.getElementById('domainFormPort').value) || 0;
    const root = document.getElementById('domainFormRoot').value.trim() || undefined;
    const ssl = document.getElementById('domainFormSSL').checked;
    const type = document.getElementById('domainFormTypeSub').checked ? 'subdomain' : 'domain';
    const parentDomain = document.getElementById('domainFormParent').value || undefined;
    const errEl = document.getElementById('domainFormError');
    const succEl = document.getElementById('domainFormSuccess');
    errEl.style.display = 'none';
    succEl.style.display = 'none';

    if (!isEdit && (domainsData.some(d => d.domain.toLowerCase() === name) || domainsKnownNames.has(name))) {
      errEl.textContent = 'Domain "' + name + '" already exists in the panel. Delete it first or use a different name.';
      errEl.style.display = 'block';
      return;
    }

    if (type === 'subdomain' && !parentDomain) {
      errEl.textContent = 'Please select the associated parent domain for this subdomain';
      errEl.style.display = 'block';
      return;
    }

    const btn = document.getElementById('domainFormSubmit');
    btn.disabled = true;
    btn.textContent = 'Processing...';
    try {
      if (isEdit) {
        await API.domains.update(domainsEditing, { port, sslEnabled: ssl, type, root });
        succEl.textContent = 'Domain updated';
      } else {
        const result = await API.domains.create({ domain: name, port: port || undefined, ssl, type, root, parentDomain });
        let successText = 'Domain created';
        let successDelay = 800;
        if (result && result.domain && result.domain.liveCheck) {
          const d = result.domain;
          if (d.liveCheck.ok) {
            const proto = d.sslEnabled ? 'https' : 'http';
            const defaultP = d.sslEnabled ? 443 : 80;
            const visitUrl = proto + '://' + d.domain + (Number(d.port) === defaultP ? '' : ':' + d.port);
            successText = 'Domain created — LIVE (HTTP ' + d.liveCheck.status + ')\n' + visitUrl;
            if (d.liveCheck.previewUrl) successText += '\nPreview (works without DNS): ' + d.liveCheck.previewUrl;
            successDelay = 4000;
          } else {
            successText = 'Domain created — live check failed (HTTP ' + (d.liveCheck.status || 'n/a') + '). Check nginx config.';
            successDelay = 4000;
          }
        }
        succEl.textContent = successText;
        succEl.style.display = 'block';
        setTimeout(() => { closeDomainForm(); loadDomains(); }, successDelay);
        return;
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
  icon.textContent = type === 'error' ? '⚠️' : '✅';
  el.className = 'fm-toast fm-toast-' + (type || 'success') + ' fm-toast-show';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.className = 'fm-toast fm-toast-' + (type || 'success');
  }, 3000);
}
