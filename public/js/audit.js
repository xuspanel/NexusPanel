let auditState = { entries: [], total: 0, page: 0, user: '', action: '', search: '' };

window.initAudit = async function () {
  try {
    const me = await API.me();
    if (me.role !== 'admin') {
      document.getElementById('auditContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">⚠</span><span class="db-error-text">Admin access required</span></div>';
      return;
    }
    await loadActions();
    await loadAudit();
  } catch {
    document.getElementById('auditContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">⚠</span><span class="db-error-text">Session expired</span></div>';
  }
};

async function loadActions() {
  try {
    var actions = await API.audit.actions();
    var sel = document.getElementById('auditActionFilter');
    sel.innerHTML = '<option value="">All Actions</option>' + actions.map(function (a) {
      return '<option value="' + esc(a) + '">' + esc(a) + '</option>';
    }).join('');
    if (auditState.action) sel.value = auditState.action;
  } catch {}
}

async function loadAudit() {
  try {
    var data = await API.audit.list({
      user: auditState.user || undefined,
      action: auditState.action || undefined,
      search: auditState.search || undefined,
      limit: 50,
      offset: auditState.page * 50,
    });
    auditState.entries = data.entries || [];
    auditState.total = data.total || 0;
    renderAudit();
  } catch (e) {
    document.getElementById('auditList').innerHTML = '<div class="db-error">' + esc(e.message) + '</div>';
  }
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
}

function formatTime(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  var h = String(d.getHours()).padStart(2, '0');
  var m = String(d.getMinutes()).padStart(2, '0');
  var s = String(d.getSeconds()).padStart(2, '0');
  return month + '/' + day + ' ' + h + ':' + m + ':' + s;
}

function getMethodBadgeClass(method) {
  if (method === 'POST') return 'audit-badge-create';
  if (method === 'PUT') return 'audit-badge-update';
  if (method === 'DELETE') return 'audit-badge-delete';
  return 'audit-badge-default';
}

function renderAudit() {
  var el = document.getElementById('auditList');
  var pagEl = document.getElementById('auditPagination');

  if (auditState.entries.length === 0) {
    el.innerHTML = '<div class="db-empty">No audit entries found</div>';
    pagEl.innerHTML = '';
    return;
  }

  el.innerHTML = auditState.entries.map(function (e) {
    return '<div class="audit-entry">'
      + '<span class="audit-badge ' + getMethodBadgeClass(e.method) + '">' + esc(e.method) + '</span>'
      + '<div class="audit-info">'
      + '<span class="audit-action">' + esc(e.action) + '</span>'
      + '<span class="audit-path">' + esc(e.path) + '</span>'
      + '</div>'
      + '<div class="audit-meta">'
      + '<span class="audit-user">' + esc(e.user) + '</span>'
      + '<span class="audit-ip">' + esc(e.ip) + '</span>'
      + '<span class="audit-time">' + formatTime(e.timestamp) + '</span>'
      + '</div>'
      + '</div>';
  }).join('');

  var totalPages = Math.ceil(auditState.total / 50);
  if (totalPages <= 1) { pagEl.innerHTML = ''; return; }
  pagEl.innerHTML = '<button class="fm-btn fm-btn-sm" onclick="auditPage(' + Math.max(0, auditState.page - 1) + ')" ' + (auditState.page === 0 ? 'disabled' : '') + '>← Prev</button>'
    + '<span class="audit-page">' + (auditState.page + 1) + ' / ' + totalPages + '</span>'
    + '<button class="fm-btn fm-btn-sm" onclick="auditPage(' + (auditState.page + 1) + ')" ' + (auditState.page >= totalPages - 1 ? 'disabled' : '') + '>Next →</button>';
}

function auditPage(page) {
  auditState.page = page;
  loadAudit();
}

function auditFilter() {
  auditState.page = 0;
  auditState.search = document.getElementById('auditSearchInput').value;
  auditState.action = document.getElementById('auditActionFilter').value;
  loadAudit();
}

async function auditClear() {
  if (!confirm('Clear all audit logs?')) return;
  await API.audit.clear();
  auditState.entries = [];
  auditState.total = 0;
  auditState.page = 0;
  renderAudit();
}
