var apiBase = '';
var licenses = [];
var selectedKeys = {};

async function api(method, path, body) {
  var opts = { method: method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch(apiBase + path, opts);
  if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Session expired'); }
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function init() {
  try {
    var profile = await api('GET', '/api/auth/me');
    document.getElementById('headerUser').textContent = profile.username;
  } catch (e) {}
}

function esc(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, function(c){return '&#'+c.charCodeAt(0)+';';}); }

async function refreshAll() {
  try {
    licenses = await api('GET', '/api/licenses');
    var stats = await api('GET', '/api/stats');
    renderStats(stats);
    renderLicenses();
  } catch(e) { toast(e.message, 'error'); }
}

function renderStats(s) {
  document.getElementById('statsBar').innerHTML =
    '<span class="l-stat l-stat-act">' + (s.active||0) + ' active</span>' +
    '<span class="l-stat l-stat-sus">' + (s.suspended||0) + ' suspended</span>' +
    '<span class="l-stat l-stat-rev">' + (s.revoked||0) + ' revoked</span>' +
    '<span class="l-stat l-stat-exp">' + (s.expired||0) + ' expired</span>' +
    '<span class="l-stat l-stat-val">' + (s.validations_today||0) + ' checks today</span>' +
    '<span class="l-stat">' + (s.total||0) + ' total</span>';
}

function toggleSelect(key) {
  if (selectedKeys[key]) delete selectedKeys[key];
  else selectedKeys[key] = true;
  updateBulkBar();
}

function toggleSelectAll() {
  var search = (document.getElementById('licenseSearch')?.value || '').toLowerCase();
  var filtered = licenses.filter(function(l) {
    return !search || l.key.toLowerCase().includes(search) || (l.issued_to||'').toLowerCase().includes(search) || l.domains.join(',').toLowerCase().includes(search);
  });
  if (Object.keys(selectedKeys).length === filtered.length) {
    selectedKeys = {};
  } else {
    filtered.forEach(function(l) { selectedKeys[l.key] = true; });
  }
  renderLicenses();
}

function deselectAll() { selectedKeys = {}; renderLicenses(); }

function updateBulkBar() {
  var count = Object.keys(selectedKeys).length;
  var bar = document.getElementById('bulkBar');
  if (bar) {
    bar.style.display = count > 0 ? 'flex' : 'none';
    document.getElementById('bulkCount').textContent = count + ' selected';
  }
}

function renderLicenses() {
  var search = (document.getElementById('licenseSearch')?.value || '').toLowerCase();
  var filtered = licenses.filter(function(l) {
    return !search || l.key.toLowerCase().includes(search) || (l.issued_to||'').toLowerCase().includes(search) || l.domains.join(',').toLowerCase().includes(search);
  });

  var el = document.getElementById('licenseTable');
  if (!filtered.length) { el.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b">No licenses match</div>'; updateBulkBar(); return; }

  var allChecked = filtered.length > 0 && filtered.every(function(l) { return selectedKeys[l.key]; });

  el.innerHTML = '<div class="l-table"><div class="l-row l-row-head">' +
    '<label class="l-check"><input type="checkbox" onchange="toggleSelectAll()" ' + (allChecked ? 'checked' : '') + '><span class="l-checkmark"></span></label>' +
    '<span class="l-cell-key">License Key</span>' +
    '<span class="l-cell-status">Status</span>' +
    '<span class="l-cell-domain">Domains</span>' +
    '<span class="l-cell-info">Info</span>' +
    '<span class="l-cell-actions">Actions</span>' +
    '</div>' +
    filtered.map(function(l) {
    var statusCls = 's-' + l.status;
    var domains = l.domains.length > 0 ? l.domains.join(', ') : '—';
    var expires = l.expires_at ? new Date(l.expires_at).toLocaleDateString() : 'Never';
    var isChecked = !!selectedKeys[l.key];
    return '<div class="l-row ' + (isChecked ? 'l-row-sel' : '') + '">' +
      '<label class="l-check"><input type="checkbox" onchange="toggleSelect(\'' + esc(l.key) + '\')" ' + (isChecked ? 'checked' : '') + '><span class="l-checkmark"></span></label>' +
      '<span class="l-cell-key">' + esc(l.key) + '</span>' +
      '<span class="l-cell-status ' + statusCls + '">' + l.status + '</span>' +
      '<span class="l-cell-domain">' + esc(domains) + '</span>' +
      '<span class="l-cell-info">' + esc(l.issued_to||'—') + ' · Exp: ' + expires + '</span>' +
      '<div class="l-cell-actions">' +
      '<button class="l-btn l-btn-sm" onclick="showDetail(\'' + esc(l.key) + '\')">Details</button>' +
      (l.status === 'active' ? '<button class="l-btn l-btn-sm" onclick="suspendKey(\'' + esc(l.key) + '\')">Suspend</button>' : '') +
      (l.status === 'suspended' ? '<button class="l-btn l-btn-sm" onclick="activateKey(\'' + esc(l.key) + '\')">Activate</button>' : '') +
      (l.status !== 'revoked' ? '<button class="l-btn l-btn-sm l-btn-danger" onclick="revokeKey(\'' + esc(l.key) + '\')">Revoke</button>' : '') +
      '<button class="l-btn l-btn-sm l-btn-danger" onclick="deleteKey(\'' + esc(l.key) + '\')">🗑</button>' +
      '</div></div>';
  }).join('') + '</div>';
  updateBulkBar();
}

function showDetail(key) {
  var l = licenses.find(function(x) { return x.key === key; });
  if (!l) return;
  document.getElementById('detailBody').innerHTML =
    '<p><strong>Key:</strong> <code>' + esc(l.key) + '</code></p>' +
    '<p><strong>Status:</strong> ' + esc(l.status) + '</p>' +
    '<p><strong>Issued To:</strong> ' + esc(l.issued_to||'—') + '</p>' +
    '<p><strong>Notes:</strong> ' + esc(l.notes||'—') + '</p>' +
    '<p><strong>Max Domains:</strong> ' + l.max_domains + '</p>' +
    '<p><strong>Domains:</strong> ' + (l.domains.length ? l.domains.join(', ') : '—') + '</p>' +
    '<p><strong>Issued:</strong> ' + new Date(l.issued_at).toLocaleString() + '</p>' +
    '<p><strong>Expires:</strong> ' + (l.expires_at ? new Date(l.expires_at).toLocaleString() : 'Never') + '</p>' +
    '<p><strong>Last Check-in:</strong> ' + (l.last_check_in ? new Date(l.last_check_in).toLocaleString() : 'Never') + '</p>' +
    '<p><strong>Total Check-ins:</strong> ' + (l.check_in_count||0) + '</p>' +
    '<div style="margin-top:12px"><label>Extend by days <input type="number" id="extendDays" value="30" style="width:80px"></label>' +
    '<button class="l-btn l-btn-primary" onclick="extendKey(\'' + esc(l.key) + '\')">Extend</button></div>';
  document.getElementById('detailModalOverlay').style.display = 'flex';
}

function closeDetailModal() { document.getElementById('detailModalOverlay').style.display = 'none'; }

function generateKeys() { document.getElementById('genModalOverlay').style.display = 'flex'; }
function closeGenModal() { document.getElementById('genModalOverlay').style.display = 'none'; }

async function doGenerate() {
  var body = {
    count: parseInt(document.getElementById('genCount').value) || 1,
    max_domains: parseInt(document.getElementById('genMaxDomains').value) || 5,
    expires_in_months: document.getElementById('genExpiry').value ? parseInt(document.getElementById('genExpiry').value) : null,
    issued_to: document.getElementById('genIssuedTo').value.trim(),
    notes: document.getElementById('genNotes').value.trim(),
  };
  try {
    var keys = await api('POST', '/api/licenses/generate', body);
    document.getElementById('genResults').innerHTML = '<h4>Generated Keys</h4>' +
      keys.map(function(k) { return '<div class="l-gen-key">' + esc(k.key) + ' <button class="l-btn l-btn-sm" onclick="navigator.clipboard.writeText(\'' + esc(k.key) + '\')">Copy</button></div>'; }).join('');
    refreshAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function suspendKey(key) { if(!confirm('Suspend ' + key + '?')) return;
  try { await api('PUT', '/api/licenses/' + encodeURIComponent(key), { status: 'suspended' }); refreshAll(); } catch(e) { toast(e.message, 'error'); } }

async function activateKey(key) { try { await api('PUT', '/api/licenses/' + encodeURIComponent(key), { status: 'active' }); refreshAll(); } catch(e) { toast(e.message, 'error'); } }

async function revokeKey(key) { if(!confirm('Revoke ' + key + '? This is permanent.')) return;
  try { await api('PUT', '/api/licenses/' + encodeURIComponent(key), { status: 'revoked' }); refreshAll(); } catch(e) { toast(e.message, 'error'); } }

async function extendKey(key) {
  var days = parseInt(document.getElementById('extendDays').value) || 30;
  try { await api('PUT', '/api/licenses/' + encodeURIComponent(key), { extend_days: days, status: 'active' }); refreshAll(); closeDetailModal(); } catch(e) { toast(e.message, 'error'); }
}

async function deleteKey(key) { if(!confirm('PERMANENTLY delete ' + key + '?')) return;
  try { await api('DELETE', '/api/licenses/' + encodeURIComponent(key)); refreshAll(); } catch(e) { toast(e.message, 'error'); } }

/* Bulk actions */
async function bulkAction(action) {
  var keys = Object.keys(selectedKeys);
  if (!keys.length) return;
  var labels = { activate: 'Activate', suspend: 'Suspend', revoke: 'Revoke', delete: 'Delete' };
  var confirmMsg = action === 'delete'
    ? 'PERMANENTLY DELETE ' + keys.length + ' license(s)? This cannot be undone.'
    : labels[action] + ' ' + keys.length + ' license(s)?';
  if (!confirm(confirmMsg)) return;
  try {
    var result = await api('POST', '/api/licenses/bulk', { keys: keys, action: action });
    selectedKeys = {};
    refreshAll();
    toast(labels[action] + ': ' + result.succeeded + ' of ' + result.total + ' succeeded', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

function bulkExport() {
  var keys = Object.keys(selectedKeys);
  if (!keys.length) return;
  var selected = licenses.filter(function(l) { return selectedKeys[l.key]; });
  var csv = 'Key,Status,Domains,Max Domains,Issued To,Expires,Check-ins\n' +
    selected.map(function(l) {
      return [
        l.key, l.status, (l.domains||[]).join(';'), l.max_domains,
        (l.issued_to||'').replace(/,/g, ' '), l.expires_at || 'Never', l.check_in_count||0
      ].join(',');
    }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'licenses_export_' + new Date().toISOString().substring(0,10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
  toast('Exported ' + selected.length + ' licenses', 'success');
}

var toastTimer;
function toast(msg, type) {
  var el = document.getElementById('lToast');
  el.textContent = msg;
  el.className = 'l-toast ' + (type || '');
  el.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.style.display = 'none'; }, 4000);
}

init().then(function() { refreshAll(); });
