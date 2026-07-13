let updState = { updates: [], count: 0, checking: false };
let panelState = { localVersion: '—', remoteVersion: '—', updateAvailable: false, changelog: [], checking: false };

window.initUpdates = async function () {
  var me;
  try { me = await API.me(); } catch(e) {}
  if (!me || me.role !== 'admin') return;
  checkUpdates();
  checkPanelUpdate();
};

async function checkPanelUpdate(force) {
  panelState.checking = true;
  renderPanelUpdate();
  try {
    var d = await API.updates.panelCheck(!!force);
    panelState.localVersion = d.localVersion || '—';
    panelState.remoteVersion = d.remoteVersion || '—';
    panelState.updateAvailable = !!d.updateAvailable;
    panelState.changelog = d.changelog || [];
    panelState.checking = false;
    renderPanelUpdate();
    updateSidebarBadge(panelState.updateAvailable);
  } catch { panelState.checking = false; renderPanelUpdate(); }
}

function renderPanelUpdate() {
  var el = document.getElementById('panelUpdateInfo');
  if (!el) return;
  if (panelState.checking) {
    el.innerHTML = '<div class="db-loading" style="padding:16px">Checking for panel updates...</div>';
    return;
  }
  var versionInfo = 'v' + panelState.localVersion;
  if (panelState.updateAvailable) versionInfo += ' → <span class="upd-avail">v' + panelState.remoteVersion + ' available</span>';
  else versionInfo += ' → <span style="color:var(--accent-green)">Up to date</span>';

  var changelogHtml = '';
  if (panelState.changelog.length) {
    changelogHtml = panelState.changelog.map(function (e) {
      return '<div class="upd-cl-entry"><div class="upd-cl-version">[' + esc(e.version) + '] ' + esc(e.date) + '</div>' +
        (e.changes && e.changes.length ? '<ul class="upd-cl-list">' + e.changes.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '') +
        '</div>';
    }).join('');

    var statusHtml = '';
    if (panelState.updateAvailable) statusHtml = '<div class="upd-status upd-status-avail">A newer version of NexusPanel is available</div>';
    else statusHtml = '<div class="upd-status upd-status-ok">NexusPanel is up to date</div>';

    el.innerHTML =
      '<div class="panel-update-card">' +
      '<div class="panel-update-header">' +
      '<span class="panel-update-icon">🔄</span>' +
      '<div class="panel-update-info"><div class="panel-update-title">NexusPanel</div><div class="panel-update-version">' + versionInfo + '</div></div>' +
      '<div class="panel-update-actions">' +
      '<button class="db-btn" onclick="checkPanelUpdate(true)" title="Check for updates">↻ Check</button>' +
      '<button class="db-btn db-btn-primary" id="panelApplyBtn" onclick="applyPanelUpdate()" ' + (!panelState.updateAvailable ? 'disabled' : '') + '>' +
      (panelState.updateAvailable ? 'Apply Update' : 'Up to Date') +
      '</button>' +
      '</div>' +
      '</div>' +
      statusHtml +
      (changelogHtml ? '<div class="upd-changelog">' + changelogHtml + '</div>' : '') +
      '</div>';
  }
}

async function applyPanelUpdate() {
  if (!confirm('Apply NexusPanel update? This will restart the panel.')) return;
  try {
    var r = await API.updates.panelApply();
    if (r.error) alert(r.error);
    else alert('Update started. Panel will restart shortly.');
  } catch (e) { alert(e.message); }
}

/* ─── DNF System Updates ─── */

async function checkUpdates() {
  updState.checking = true;
  renderUpdates();
  try {
    var d = await API.updates.check();
    updState.updates = d.updates || [];
    updState.count = d.count || 0;
    updState.error = d.error;
    updState.checking = false;
    renderUpdates();
  } catch { updState.checking = false; renderUpdates(); }
}

function esc(s) { if (!s) return ''; return String(s).replace(/[&<>]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

function renderUpdates() {
  var el = document.getElementById('updList');
  if (updState.checking) { el.innerHTML = '<div class="db-loading">Checking for system updates...</div>'; return; }
  if (updState.error) { el.innerHTML = '<div class="db-error">' + esc(updState.error) + '</div>'; return; }
  if (!updState.count) { el.innerHTML = '<div class="upd-clean">✅ System packages are up to date</div>'; return; }
  el.innerHTML = '<div class="upd-header">' + updState.count + ' package update' + (updState.count > 1 ? 's' : '') + ' available <button class="db-btn db-btn-primary" onclick="applyUpdates()">Apply All</button></div>'
    + updState.updates.map(function (u, i) {
      return '<div class="upd-item"><span class="upd-name">📦 ' + esc(u.name) + '</span><span class="upd-ver">' + esc(u.version) + '</span><span class="upd-repo">' + esc(u.repo) + '</span><button class="db-btn" data-idx="' + i + '" onclick="applySingleUpdate(this)" title="Update this package">Update</button></div>';
    }).join('');
}

async function applyUpdates() {
  if (!confirm('Apply all system updates? This may take a while.')) return;
  updState.checking = true;
  renderUpdates();
  try {
    var r = await API.updates.apply();
    if (r.error) alert(r.error);
    else alert('Updates applied\n\n' + (r.output || 'Done'));
    checkUpdates();
  } catch (e) { alert(e.message); updState.checking = false; renderUpdates(); }
}

async function applySingleUpdate(btn) {
  var idx = parseInt(btn.getAttribute('data-idx'), 10);
  var pkg = updState.updates[idx];
  if (!pkg || !confirm('Update ' + pkg.name + '?')) return;
  btn.disabled = true;
  btn.textContent = '...';
  try {
    var r = await API.updates.applySingle(pkg.name);
    if (r.error) alert(r.error);
    else alert('Updated ' + pkg.name + '\n\n' + (r.output || 'Done'));
    checkUpdates();
  } catch (e) { alert(e.message); btn.disabled = false; btn.textContent = 'Update'; }
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
      badge.textContent = '●';
      item.appendChild(badge);
    }
  } else {
    if (existing) existing.remove();
  }
}