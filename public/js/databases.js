var dbState = { databases: [], schemas: [], users: [], views: [], matViews: [], view: 'cards', selDb: null, selTable: null, tableEditor: { columns: [], original: [], changes: [] }, tableMode: 'data', dataPage: 1, dataPageSize: 25, dataSortBy: '', dataSortDir: '', dataSearch: '', pkColumns: [], selectedRows: [], foreignKeys: [], indexes: [], triggers: [], dbFilter: '', tableFilter: '', functionFilter: '' };
var dbInit = false;

/* URL-based routing */
function dbNavigate(subPath, opts) {
  opts = opts || {};
  var fullPath = '/databases/' + subPath;
  if (location.pathname === fullPath && !opts.replace) return;
  if (opts.replace) {
    history.replaceState({ view: 'databases', dbSub: subPath }, '', fullPath);
  } else {
    history.pushState({ view: 'databases', dbSub: subPath }, '', fullPath);
  }
}

window.dbApplyRoute = function(dbSub, opts) {
  opts = opts || {};
  if (!dbSub || dbSub === 'cards') { renderCards(); return; }
  var parts = dbSub.split('/').filter(function(p) { return p.length > 0; });
  if (!parts.length) { renderCards(); return; }
  if (parts[0] === 'manage') { showManage(); return; }
  if (parts[0] === 'query') { showQueryTerminal(); return; }
  if (parts[0] === 'search') { showSearchAll(); return; }
  if (parts[0] === 'functions' && parts[1]) {
    dbState.selDb = dbState.databases.find(function(d) { return d.name === decodeURIComponent(parts[1]); }) || null;
    if (dbState.selDb) showFunctionsView();
    return;
  }
  if (parts[0] === 'config' && parts[1]) {
    dbState.selDb = dbState.databases.find(function(d) { return d.name === decodeURIComponent(parts[1]); }) || null;
    if (dbState.selDb) renderConfView();
    return;
  }
  if (parts[0] === 'tables' && parts[1]) {
    dbState.selDb = dbState.databases.find(function(d) { return d.name === decodeURIComponent(parts[1]); }) || null;
    if (dbState.selDb) {
      if (parts[2] && parts[3]) {
        openTableEditor(decodeURIComponent(parts[2]), decodeURIComponent(parts[3]));
      } else {
        showTablesView();
      }
    }
    return;
  }
};

function dbShowView(viewId) {
  var ids = ['dbCardsView','dbManageList','dbConfView','dbTablesView','dbEditorView','dbQueryView','dbSearchView','dbFunctionsView'];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = (id === viewId) ? 'block' : 'none';
  });
  var subViews = ['dbManageList','dbConfView','dbTablesView','dbEditorView','dbQueryView','dbSearchView','dbFunctionsView'];
  document.getElementById('dbSubViews').style.display = subViews.indexOf(viewId) !== -1 ? 'block' : 'none';
  // Update nav rail active state
  document.querySelectorAll('.db-nav-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.target === viewId);
  });
}

window.initDatabases = async function () {
  if (!dbInit) {
    dbInit = true;
    document.getElementById('dbRefreshBtn')?.addEventListener('click', refreshDB);
    document.getElementById('dbRetryBtn')?.addEventListener('click', refreshDB);
  }
  await loadDatabases();
  var dbPath = location.pathname.replace(/^\/databases\//, '');
  if (dbPath && dbPath !== location.pathname && window.dbApplyRoute) {
    window.dbApplyRoute(dbPath, { replace: true });
  }
};

async function refreshDB() { await loadDatabases(); }
function esc(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, function(c) { return '&#'+c.charCodeAt(0)+';'; }); }
function isValidIdent(name) { return /^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(String(name || '')); }
function identError(name) { return '"' + esc(name) + '" is not a valid PostgreSQL identifier (must start with a letter or underscore, then letters/numbers/_/$).'; }

async function fetchJSON(url, opts) { var r = await fetch(url, { credentials: 'same-origin', ...opts }); var d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }

async function loadDatabases() {
  document.getElementById('dbContent').style.display = 'none';
  document.getElementById('dbLoading').style.display = 'flex';
  document.getElementById('dbError').style.display = 'none';
  try {
    var dbs = await API.databases.list();
    dbState.databases = dbs || [];
    try { dbState.users = await API.databases.users() || []; } catch(e) { dbState.users = []; }
    try { dbState.schemas = await API.databases.schemas('postgres') || []; } catch(e) { dbState.schemas = []; }
    dbState.view = 'cards';
    renderCards();
    document.getElementById('dbLoading').style.display = 'none';
    document.getElementById('dbContent').style.display = 'block';
  } catch (e) { showDBError(e.message); }
}

function showDBError(msg) {
  document.getElementById('dbLoading').style.display = 'none';
  document.getElementById('dbContent').style.display = 'none';
  document.getElementById('dbError').style.display = 'flex';
  document.getElementById('dbErrorText').textContent = msg;
}

/* ─── Top-Level Cards (Create / Manage / pgAdmin) ─── */
function renderCards() {
  dbShowView('dbCardsView');
  var cnt = dbState.databases.length;
  document.getElementById('dbTitle').textContent = 'Database Manager';
  document.getElementById('dbBreadcrumb').innerHTML = cnt + ' database' + (cnt !== 1 ? 's' : '') + ' found';
}

function showCreateForm() {
  var users = dbState.users.map(function(u) { return '<option value="' + esc(u.name) + '">' + esc(u.name) + (u.is_super==='t'?' (super)':'') + '</option>'; }).join('');
  document.getElementById('dbModalContent').innerHTML =
    '<h3>Create Database</h3>'
    + '<div class="n-form-group"><label>Database Name</label><input id="dbCreateName" class="db-form-input" placeholder="my_database"></div>'
    + '<div class="n-form-group"><label>Owner</label><select id="dbCreateOwner" class="db-form-input" onchange="dbOwnerChange()">' + users + '<option value="__new__">+ Create New Owner...</option></select></div>'
    + '<div id="dbNewOwnerFields" style="display:none">'
    + '<div class="n-form-group"><label>New Owner Username</label><input id="dbNewOwnerName" class="db-form-input" placeholder="role_name"></div>'
    + '<div class="n-form-group"><label>Password</label><input id="dbNewOwnerPass" class="db-form-input" type="password" placeholder="leave empty for no password"></div>'
    + '<div style="display:flex;gap:12px;margin-bottom:12px"><label style="font-size:12px;color:var(--text-secondary)"><input type="checkbox" id="dbNewOwnerSuper"> Superuser</label><label style="font-size:12px;color:var(--text-secondary)"><input type="checkbox" id="dbNewOwnerCreateDB" checked> Can Create DB</label><label style="font-size:12px;color:var(--text-secondary)"><input type="checkbox" id="dbNewOwnerLogin" checked> Can Login</label></div>'
    + '</div>'
    + '<div class="n-form-group"><label>Encoding</label><select id="dbCreateEnc" class="db-form-input"><option>UTF8</option><option>LATIN1</option><option>WIN1252</option><option>SQL_ASCII</option></select></div>'
    + '<div class="n-form-group"><label>Template</label><select id="dbCreateTpl" class="db-form-input"><option value="">None</option><option>template0</option><option>template1</option></select></div>'
    + '<div class="n-form-group"><label>Connection Limit (-1 = unlimited)</label><input id="dbCreateLimit" class="db-form-input" type="number" value="-1"></div>'
    + '<div class="n-form-group"><label>Comment</label><input id="dbCreateComment" class="db-form-input" placeholder="Optional description"></div>'
    + '<div class="db-form-error" id="dbModalError"></div>'
    + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button><button class="fm-btn fm-btn-primary" onclick="createDatabase()">Create Database</button></div>';
  document.getElementById('dbModal').style.display = 'flex';
}

function dbOwnerChange() {
  var sel = document.getElementById('dbCreateOwner');
  var fields = document.getElementById('dbNewOwnerFields');
  fields.style.display = sel.value === '__new__' ? 'block' : 'none';
}

async function createDatabase() {
  var owner = document.getElementById('dbCreateOwner').value;
  var data = { name: document.getElementById('dbCreateName').value.trim(), encoding: document.getElementById('dbCreateEnc').value, template: document.getElementById('dbCreateTpl').value, connLimit: parseInt(document.getElementById('dbCreateLimit').value), comment: document.getElementById('dbCreateComment').value.trim() };
  if (!data.name) return dbModalError('Database name required');
  if (!isValidIdent(data.name)) return dbModalError(identError(data.name));

  // Create new owner if selected
  if (owner === '__new__') {
    var newOwner = document.getElementById('dbNewOwnerName').value.trim();
    if (!newOwner) return dbModalError('Owner username required');
    try {
      await API.databases.createUser({
        username: newOwner,
        password: document.getElementById('dbNewOwnerPass').value,
        isSuperuser: document.getElementById('dbNewOwnerSuper').checked,
        canCreateDb: document.getElementById('dbNewOwnerCreateDB').checked,
        canLogin: document.getElementById('dbNewOwnerLogin').checked,
      });
      owner = newOwner;
      // Refresh users list
      var users = await API.databases.users();
      dbState.users = users || [];
    } catch (e) { return dbModalError('Failed to create owner: ' + e.message); }
  }
  data.owner = owner;

  try {
    await API.databases.create(data);
    closeDBModal();
    dbToast('Database "' + data.name + '" created');
    await loadDatabases();
  } catch (e) { dbModalError(e.message); }
}

function closeDBModal() {
  document.getElementById('dbModal').style.display = 'none';
  if (connectionsRefreshTimer) { clearInterval(connectionsRefreshTimer); connectionsRefreshTimer = null; }
}
function showDBModal(html) {
  document.getElementById('dbModalContent').innerHTML = html;
  document.getElementById('dbModal').style.display = 'flex';
}
function dbModalError(msg) { var el = document.getElementById('dbModalError'); el.textContent = msg; el.style.display = 'block'; }

function showConfirmModal(message, expected, onConfirm) {
  var html = '<h3>Confirm</h3>'
    + '<p style="color:var(--text-secondary);margin-bottom:12px">' + esc(message) + '</p>'
    + '<div class="n-form-group"><label>Type <strong>' + esc(expected) + '</strong> to confirm:</label>'
    + '<input id="confirmInput" class="db-form-input" placeholder="' + esc(expected) + '" autocomplete="off" spellcheck="false"></div>'
    + '<div class="db-form-error" id="dbModalError"></div>'
    + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button>'
    + '<button class="fm-btn fm-btn-danger" id="confirmBtn" disabled onclick="closeConfirmModal()">Delete</button></div>';
  document.getElementById('dbModalContent').innerHTML = html;
  document.getElementById('dbModal').style.display = 'flex';
  var input = document.getElementById('confirmInput');
  input.focus();
  input.addEventListener('input', function() {
    document.getElementById('confirmBtn').disabled = input.value !== expected;
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && input.value === expected) {
      closeDBModal();
      onConfirm();
    }
  });
  window.closeConfirmModal = function() {
    if (document.getElementById('confirmInput').value !== expected) return;
    closeDBModal();
    onConfirm();
  };
}

/* ─── Manage Databases ─── */
function showManage() {
  dbShowView('dbManageList');
  renderManageList();
  dbNavigate('manage');
}

function renderManageList() {
  dbShowView('dbManageList');
  var el = document.getElementById('dbManageList');
  var filter = (dbState.dbFilter || '').toLowerCase();
  var filtered = dbState.databases.filter(function(d) {
    if (!filter) return true;
    return (d.name || '').toLowerCase().indexOf(filter) !== -1 || (d.owner || '').toLowerCase().indexOf(filter) !== -1;
  });
  var html = '<div class="db-search-bar"><span class="db-data-search-icon">🔍</span>'
    + '<input type="text" class="db-form-input db-search-input" placeholder="Search databases..." value="' + esc(filter) + '" oninput="dbFilterManage(this.value)">'
    + '</div>';
  if (!filtered.length) { html += '<div class="db-empty">No databases match.</div>'; }
  else {
    html += '<div class="db-manage-grid">' + filtered.map(function(d) {
      return '<div class="db-manage-card">'
        + '<span class="db-manage-icon">🗄</span>'
        + '<div class="db-manage-info" onclick="selectDatabase(\'' + esc(d.name) + '\')" style="cursor:pointer;flex:1"><span class="db-manage-name">' + esc(d.name) + '</span>'
        + '<span class="db-manage-meta">' + (d.table_count||0) + ' tables · ' + (d.size_bytes ? formatBytes(d.size_bytes) : '—') + ' · ' + esc(d.owner||'') + '</span></div>'
        + '<div class="db-manage-actions" onclick="event.stopPropagation()">'
        + '<button class="db-btn db-btn-xs" onclick="openDatabaseConfig(\'' + esc(d.name) + '\')" title="Configuration">⚙</button>'
        + '<button class="db-btn db-btn-xs" onclick="selectDatabase(\'' + esc(d.name) + '\')" title="Tables">→</button>'
        + '</div></div>';
    }).join('') + '</div>';
  }
  el.innerHTML = html;
  document.getElementById('dbTitle').textContent = 'Manage Databases';
  document.getElementById('dbBreadcrumb').innerHTML = '<a href="#" onclick="renderCards()">Home</a> / ' + dbState.databases.length + ' databases';
}

window.dbFilterManage = function(value) {
  dbState.dbFilter = value;
  renderManageList();
};

function selectDatabase(name) {
  dbState.selDb = dbState.databases.find(function(d) { return d.name === name; });
  if (!dbState.selDb) return;
  showTablesView();
}

function openDatabaseConfig(name) {
  dbState.selDb = dbState.databases.find(function(d) { return d.name === name; });
  if (!dbState.selDb) return;
  renderConfView();
}

/* ─── Database Config View ─── */
async function renderConfView() {
  var d = dbState.selDb;
  if (!d) { dbToast('No database selected', 'error'); return; }
  dbShowView('dbConfView');
  var cfg = {};
  try { cfg = await API.databases.config(d.name); } catch(e) {}
  var users = dbState.users.map(function(u) { return '<option value="' + esc(u.name) + '" ' + (u.name === (cfg.owner || d.owner) ? 'selected' : '') + '>' + esc(u.name) + '</option>'; }).join('');
  var limitVal = cfg.conn_limit !== undefined && cfg.conn_limit !== null ? cfg.conn_limit : (cfg.connection_limit !== undefined ? cfg.connection_limit : -1);
  document.getElementById('dbConfContent').innerHTML =
    '<h3>Configuration: ' + esc(d.name) + '</h3>'
    + '<div class="db-conf-grid">'
    + '<div class="n-form-group"><label>Owner</label><select id="dbConfOwner" class="db-form-input">' + users + '</select></div>'
    + '<div class="n-form-group"><label>Connection Limit</label><input id="dbConfLimit" class="db-form-input" type="number" value="' + esc(String(limitVal)) + '"></div>'
    + '<div class="n-form-group"><label>Comment</label><input id="dbConfComment" class="db-form-input" placeholder="Database comment" value="' + esc(cfg.comment || '') + '"></div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap">'
    + '<button class="db-btn db-btn-primary" onclick="saveDBConfig()">💾 Save Configuration</button>'
    + '<button class="db-btn" onclick="showTablesView()">📋 View Tables</button>'
    + '<button class="db-btn" onclick="showFunctionsView()">📦 Functions</button>'
    + '<button class="db-btn" onclick="dumpDatabase()">🗄 Dump</button>'
    + '<button class="db-btn" onclick="showPrivilegeEditor()">🔐 Privileges</button>'
    + '<button class="db-btn" onclick="showFKRelationsModal()">🔗 Relations</button>'
    + '<button class="db-btn" onclick="showTriggersModal()">⚡ Triggers</button>'
    + '<button class="db-btn" onclick="showConnectionsMonitor()">📊 Connections</button>'
    + '<button class="db-btn db-btn-danger" onclick="dropDatabase()">🗑 Drop Database</button>'
    + '</div>'
    + '<div class="db-form-error" id="dbConfError"></div>'
    + '<div style="text-align:center;margin-top:8px"><a href="#" onclick="showTablesView()" style="color:var(--text3)">← Back to tables</a> · <a href="#" onclick="showManage()" style="color:var(--text3)">All databases</a></div>';
  document.getElementById('dbTitle').textContent = 'Database: ' + d.name;
  document.getElementById('dbBreadcrumb').innerHTML = '<a href="#" onclick="showManage()">Databases</a> / <a href="#" onclick="showTablesView()">' + esc(d.name) + '</a> / Config';
  dbNavigate('config/' + encodeURIComponent(d.name));
}

async function saveDBConfig() {
  try {
    await API.databases.updateConfig(dbState.selDb.name, {
      owner: document.getElementById('dbConfOwner').value,
      connLimit: parseInt(document.getElementById('dbConfLimit').value),
      comment: document.getElementById('dbConfComment').value.trim()
    });
    dbToast('Configuration saved');
  } catch (e) { document.getElementById('dbConfError').textContent = e.message; document.getElementById('dbConfError').style.display = 'block'; }
}

async function dropDatabase() {
  var name = dbState.selDb.name;
  showConfirmModal('Permanently delete database "' + name + '"? All data will be lost.', name, async function() {
    try { await API.databases.del(name, name); dbToast('Database "' + name + '" dropped'); await loadDatabases(); showManage(); }
    catch (e) { dbToast(e.message, 'error'); }
  });
}

/* ─── Tables View ─── */
async function showTablesView() {
  if (!dbState.selDb) { dbToast('No database selected', 'error'); return; }
  dbShowView('dbTablesView');
  document.getElementById('dbTitle').textContent = 'Database: ' + dbState.selDb.name;
  document.getElementById('dbBreadcrumb').innerHTML = '<a href="#" onclick="showManage()">Databases</a> / ' + esc(dbState.selDb.name) + ' <a href="#" onclick="renderConfView()" style="font-size:11px;color:var(--accent-cyan);margin-left:8px">⚙ Config</a>';
  document.getElementById('dbTablesContent').innerHTML = '<div class="db-loading">Loading tables...</div>';
  dbNavigate('tables/' + encodeURIComponent(dbState.selDb.name));
  try {
    var [tables, views, matviews] = await Promise.all([
      API.databases.tables(dbState.selDb.name),
      API.databases.views(dbState.selDb.name),
      API.databases.listMatViews(dbState.selDb.name),
    ]);
    dbState.views = views || [];
    dbState.matViews = matviews || [];
    renderTables(tables);
  } catch (e) { document.getElementById('dbTablesContent').innerHTML = '<div class="db-error">Failed to load tables: ' + esc(e.message) + ' <a href="#" onclick="showTablesView()">Retry</a></div>'; }
}

function renderViewsSection() {
  var views = dbState.views || [];
  var filter = (dbState.tableFilter || '').toLowerCase();
  var schemaFilter = dbState.tableSchemaFilter || '';
  var filtered = views.filter(function(v) {
    var name = (v.table_schema + '.' + v.view_name).toLowerCase();
    var matchesText = !filter || name.indexOf(filter) !== -1;
    var matchesSchema = !schemaFilter || v.table_schema === schemaFilter;
    return matchesText && matchesSchema;
  });
  if (!filtered.length) return '';
  var html = '<div class="db-views-section"><h4>👁 Views (' + filtered.length + ')</h4>'
    + '<div class="db-manage-grid">';
  filtered.forEach(function(v) {
    html += '<div class="db-manage-card">'
      + '<span class="db-manage-icon">👁</span>'
      + '<div class="db-manage-info" onclick="dbOpenView(\'' + esc(v.table_schema) + '\',\'' + esc(v.view_name) + '\')" style="cursor:pointer;flex:1"><span class="db-manage-name">' + esc(v.table_schema) + '.' + esc(v.view_name) + '</span>'
      + '<span class="db-manage-meta">VIEW</span></div>'
      + '<div class="db-manage-actions" onclick="event.stopPropagation()">'
      + '<button class="db-btn db-btn-xs db-btn-danger" onclick="dbDropView(\'' + esc(v.table_schema) + '\',\'' + esc(v.view_name) + '\')" title="Drop view">✕</button>'
      + '</div></div>';
  });
  html += '</div></div>';
  return html;
}

function renderMatViewsSection() {
  var matViews = dbState.matViews || [];
  var filter = (dbState.tableFilter || '').toLowerCase();
  var schemaFilter = dbState.tableSchemaFilter || '';
  var filtered = matViews.filter(function(v) {
    var name = (v.schema + '.' + v.matview_name).toLowerCase();
    var matchesText = !filter || name.indexOf(filter) !== -1;
    var matchesSchema = !schemaFilter || v.schema === schemaFilter;
    return matchesText && matchesSchema;
  });
  if (!filtered.length) return '';
  var html = '<div class="db-views-section"><h4>📦 Materialized Views (' + filtered.length + ')</h4>'
    + '<div class="db-manage-grid">';
  filtered.forEach(function(v) {
    var sizeStr = v.size || '—';
    html += '<div class="db-manage-card">'
      + '<span class="db-manage-icon">📦</span>'
      + '<div class="db-manage-info" onclick="dbOpenMatView(\'' + esc(v.schema) + '\',\'' + esc(v.matview_name) + '\')" style="cursor:pointer;flex:1"><span class="db-manage-name">' + esc(v.schema) + '.' + esc(v.matview_name) + '</span>'
      + '<span class="db-manage-meta">' + (v.estimated_rows||0) + ' rows · ' + sizeStr + '</span></div>'
      + '<div class="db-manage-actions" onclick="event.stopPropagation()">'
      + '<button class="db-btn db-btn-xs" onclick="dbRefreshMatView(\'' + esc(v.schema) + '\',\'' + esc(v.matview_name) + '\')" title="Refresh">🔄</button>'
      + '<button class="db-btn db-btn-xs db-btn-danger" onclick="dbDropMatView(\'' + esc(v.schema) + '\',\'' + esc(v.matview_name) + '\')" title="Drop mat view">✕</button>'
      + '</div></div>';
  });
  html += '</div></div>';
  return html;
}

function dbShowCreateView() {
  var html = '<h3>Create View in ' + esc(dbState.selDb.name) + '</h3>'
    + '<div class="n-form-group"><label>Schema</label><select id="cvSchema" class="db-form-input">'
    + dbState.schemas.map(function(s) { return '<option value="' + esc(s.name) + '" ' + (s.name==='public'?'selected':'') + '>' + esc(s.name) + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="n-form-group"><label>View Name</label><input id="cvName" class="db-form-input" placeholder="my_view"></div>'
    + '<div class="n-form-group"><label>SELECT Query</label><textarea id="cvQuery" class="db-form-input" style="min-height:120px;font-family:var(--font-mono);font-size:12px" placeholder="SELECT ... FROM ..."></textarea></div>'
    + '<div class="db-form-error" id="dbModalError"></div>'
    + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button><button class="fm-btn fm-btn-primary" onclick="doCreateView()">Create View</button></div>';
  document.getElementById('dbModalContent').innerHTML = html;
  document.getElementById('dbModal').style.display = 'flex';
  window.doCreateView = async function() {
    var schema = document.getElementById('cvSchema').value;
    var viewName = document.getElementById('cvName').value.trim();
    var query = document.getElementById('cvQuery').value.trim();
    if (!viewName) return dbModalError('View name required');
    if (!query) return dbModalError('SELECT query required');
    try {
      await API.databases.createView(dbState.selDb.name, { schema, viewName, query });
      closeDBModal();
      dbToast('View "' + viewName + '" created');
      await showTablesView();
    } catch (e) { dbModalError(e.message); }
  };
}

async function dbOpenView(schema, viewName) {
  openTableEditor(schema, viewName);
}

async function dbDropView(schema, viewName) {
  showConfirmModal('Drop view "' + schema + '.' + viewName + '"?', schema + '.' + viewName, async function() {
    try {
      await API.databases.dropView(dbState.selDb.name, schema, viewName);
      dbToast('View dropped');
      await showTablesView();
    } catch (e) { dbToast(e.message, 'error'); }
  });
}

async function dbRefreshMatView(schema, name) {
  try {
    await API.databases.refreshMatView(dbState.selDb.name, schema, name);
    dbToast('Materialized view refreshed');
    await showTablesView();
  } catch (e) { dbToast(e.message, 'error'); }
}

async function dbDropMatView(schema, name) {
  showConfirmModal('Drop materialized view "' + schema + '.' + name + '"?', schema + '.' + name, async function() {
    try {
      await API.databases.dropMatView(dbState.selDb.name, schema, name);
      dbToast('Materialized view dropped');
      await showTablesView();
    } catch (e) { dbToast(e.message, 'error'); }
  });
}

function dbShowCreateMatView() {
  var html = '<h3>Create Materialized View in ' + esc(dbState.selDb.name) + '</h3>'
    + '<div class="n-form-group"><label>Schema</label><select id="cmvSchema" class="db-form-input">'
    + dbState.schemas.map(function(s) { return '<option value="' + esc(s.name) + '" ' + (s.name==='public'?'selected':'') + '>' + esc(s.name) + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="n-form-group"><label>View Name</label><input id="cmvName" class="db-form-input" placeholder="my_mat_view"></div>'
    + '<div class="n-form-group"><label>SELECT Query</label><textarea id="cmvQuery" class="db-form-input" style="min-height:120px;font-family:var(--font-mono);font-size:12px" placeholder="SELECT ... FROM ..."></textarea></div>'
    + '<div style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary)"><input type="checkbox" id="cmvWithData" checked> Populate with data now</label></div>'
    + '<div class="db-form-error" id="dbModalError"></div>'
    + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button><button class="fm-btn fm-btn-primary" onclick="doCreateMatView()">Create Materialized View</button></div>';
  document.getElementById('dbModalContent').innerHTML = html;
  document.getElementById('dbModal').style.display = 'flex';
  window.doCreateMatView = async function() {
    var schema = document.getElementById('cmvSchema').value;
    var name = document.getElementById('cmvName').value.trim();
    var query = document.getElementById('cmvQuery').value.trim();
    var withData = document.getElementById('cmvWithData').checked;
    if (!name) return dbModalError('View name required');
    if (!query) return dbModalError('SELECT query required');
    try {
      await API.databases.createMatView(dbState.selDb.name, { schema, name, query, withData });
      closeDBModal();
      dbToast('Materialized view "' + name + '" created');
      await showTablesView();
    } catch (e) { dbModalError(e.message); }
  };
}

async function dbOpenMatView(schema, name) {
  openTableEditor(schema, name);
}

function renderTables(tables) {
  dbState.currentTables = tables || [];
  var el = document.getElementById('dbTablesContent');
  var filter = (dbState.tableFilter || '').toLowerCase();
  var schemaFilter = dbState.tableSchemaFilter || '';
  var filteredTables = dbState.currentTables.filter(function(t) {
    var name = (t.schemaname + '.' + t.tablename).toLowerCase();
    var matchesText = !filter || name.indexOf(filter) !== -1;
    var matchesSchema = !schemaFilter || t.schemaname === schemaFilter;
    return matchesText && matchesSchema;
  });
  var schemas = {};
  dbState.currentTables.forEach(function(t) { schemas[t.schemaname] = true; });
  var schemaOpts = '<option value="">All schemas</option>' + Object.keys(schemas).sort().map(function(s) { return '<option value="' + esc(s) + '" ' + (s === schemaFilter ? 'selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  var html = '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">'
    + '<button class="db-btn db-btn-primary" onclick="showCreateTable()">+ Create Table</button>'
    + '<button class="db-btn" onclick="dbShowCreateView()">👁 Create View</button>'
    + '<button class="db-btn" onclick="dbShowCreateMatView()">📦 Create Mat View</button>'
    + '<button class="db-btn" onclick="showFunctionsView()">📦 Functions</button>'
    + '<div class="db-search-bar" style="margin-left:auto"><span class="db-data-search-icon">🔍</span>'
    + '<input type="text" class="db-form-input db-search-input" placeholder="Filter tables, views, matviews..." value="' + esc(filter) + '" oninput="dbFilterTables(this.value)">'
    + '<select class="db-form-input" style="width:auto" onchange="dbFilterTablesSchema(this.value)">' + schemaOpts + '</select>'
    + '</div></div>';
  if (filteredTables.length) {
    html += '<h4 style="margin-bottom:8px">📄 Tables (' + filteredTables.length + ')</h4>'
      + '<div class="db-manage-grid">' + filteredTables.map(function(t) {
        return '<div class="db-manage-card" onclick="openTableEditor(\'' + esc(t.schemaname) + '\',\'' + esc(t.tablename) + '\')">'
          + '<span class="db-manage-icon">📄</span>'
          + '<div class="db-manage-info"><span class="db-manage-name">' + esc(t.schemaname) + '.' + esc(t.tablename) + '</span>'
          + '<span class="db-manage-meta">' + (t.row_count||0) + ' rows · ' + (t.size_formatted||'—') + '</span></div>'
          + '<span class="db-manage-arrow">→</span></div>';
      }).join('') + '</div>';
  } else {
    html += '<div class="db-empty">No tables match. <a href="#" onclick="showCreateTable()">Create a table</a></div>';
  }
  html += renderViewsSection();
  html += renderMatViewsSection();
  html += '<div style="text-align:center;margin-top:8px"><a href="#" onclick="showManage()" style="color:var(--text3)">← Back to databases</a></div>';
  el.innerHTML = html;
}

window.dbFilterTables = function(value) {
  dbState.tableFilter = value;
  renderTables(dbState.currentTables);
};
window.dbFilterTablesSchema = function(value) {
  dbState.tableSchemaFilter = value;
  renderTables(dbState.currentTables);
};

/* ─── Create Table Form ─── */
function showCreateTable() {
  document.getElementById('dbModalContent').innerHTML =
    '<h3>Create Table in ' + esc(dbState.selDb.name) + '</h3>'
    + '<div class="n-form-group"><label>Schema</label><select id="ctSchema" class="db-form-input">' + dbState.schemas.map(function(s) { return '<option value="' + esc(s.name) + '" ' + (s.name==='public'?'selected':'') + '>' + esc(s.name) + '</option>'; }).join('') + '</select></div>'
    + '<div class="n-form-group"><label>Table Name</label><input id="ctName" class="db-form-input" placeholder="my_table"></div>'
    + '<div id="ctColumns" style="margin-bottom:8px">'
    + '<div class="ct-col-row"><input placeholder="column_name" class="db-form-input ct-col-name"><select class="db-form-input ct-col-type">'
    + typeOptions() + '</select>'
    + '<label class="ct-col-null"><input type="checkbox" class="ct-col-check" checked> Null</label>'
    + '<label class="ct-col-pk" title="Primary Key"><input type="checkbox" class="ct-col-pk-check"> PK</label>'
    + '<input placeholder="default" class="db-form-input ct-col-default" title="Default value">'
    + '<button class="db-btn db-btn-sm" onclick="this.parentElement.remove()">✕</button></div></div>'
    + '<button class="db-btn" onclick="ctAddCol()">+ Add Column</button>'
    + '<div class="db-form-error" id="dbModalError"></div>'
    + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button><button class="fm-btn fm-btn-primary" onclick="doCreateTable()">Create Table</button></div>';
  document.getElementById('dbModal').style.display = 'flex';
}

function ctAddCol() {
  var d = document.createElement('div'); d.className = 'ct-col-row';
  d.innerHTML = '<input placeholder="column_name" class="db-form-input ct-col-name"><select class="db-form-input ct-col-type">' + typeOptions() + '</select>'
    + '<label class="ct-col-null"><input type="checkbox" class="ct-col-check" checked> Null</label>'
    + '<label class="ct-col-pk" title="Primary Key"><input type="checkbox" class="ct-col-pk-check"> PK</label>'
    + '<input placeholder="default" class="db-form-input ct-col-default" title="Default value">'
    + '<button class="db-btn db-btn-sm" onclick="this.parentElement.remove()">✕</button>';
  document.getElementById('ctColumns').appendChild(d);
}

async function doCreateTable() {
  var schema = document.getElementById('ctSchema').value;
  var name = document.getElementById('ctName').value.trim();
  if (!name) return dbModalError('Table name required');
  if (!isValidIdent(name)) return dbModalError(identError(name));
  var cols = [];
  var colError = '';
  document.querySelectorAll('.ct-col-row').forEach(function(r) {
    var cn = r.querySelector('.ct-col-name').value.trim();
    var ct = r.querySelector('.ct-col-type').value;
    var ck = r.querySelector('.ct-col-check').checked;
    var pk = r.querySelector('.ct-col-pk-check').checked;
    var def = r.querySelector('.ct-col-default').value.trim();
    if (cn) {
      if (!isValidIdent(cn) && !colError) colError = identError(cn);
      var col = { name: cn, type: ct, nullable: ck, primaryKey: pk };
      if (def) col.default = def;
      cols.push(col);
    }
  });
  if (colError) return dbModalError(colError);
  // If any column has PK, ensure all PK columns are NOT NULL
  var hasPk = cols.some(function(c) { return c.primaryKey; });
  if (hasPk) {
    cols.forEach(function(c) { if (c.primaryKey) c.nullable = false; });
  }
  if (!cols.length) return dbModalError('At least one column required');
  try {
    await API.databases.createTable(dbState.selDb.name, { schema, name: name, columns: cols });
    closeDBModal();
    dbToast('Table "' + name + '" created');
    await showTablesView();
  } catch (e) { dbModalError(e.message); }
}

function typeOptions() { return '<option>integer</option><option>bigint</option><option>smallint</option><option>serial</option><option>bigserial</option><option>varchar(255)</option><option>text</option><option>boolean</option><option>timestamptz</option><option>timestamp</option><option>date</option><option>numeric</option><option>real</option><option>jsonb</option><option>uuid</option>'; }

/* ─── Table Editor ─── */
async function openTableEditor(schema, table) {
  if (!dbState.selDb) { dbToast('No database selected', 'error'); return; }
  dbState.selTable = { schema: schema, name: table };
  dbState.tableMode = 'data';
  dbState.dataPage = 1;
  dbState.dataSortBy = '';
  dbState.dataSortDir = '';
  dbState.dataSearch = '';
  dbState.tableMetadata = null;
  try {
    var [info, data] = await Promise.all([
      API.databases.tableInfo(dbState.selDb.name, schema, table),
      API.databases.tableData(dbState.selDb.name, schema, table),
    ]);
    dbState.pkColumns = (info.columns || []).filter(function(c) { return c.is_primary_key; }).map(function(c) { return c.column_name; });
    dbState.tableEditor.original = info.columns || [];
    dbState.tableEditor.columns = (info.columns || []).map(function(c) { return { ...c, _action: null, _oldName: c.column_name, _comment: '' }; });
    dbState.tableEditor.changes = [];
    dbState.tableEditor.rowCount = info.row_count || 0;
    dbState.tableEditor.data = data;
    // Load metadata in background
    try { dbState.tableMetadata = await API.databases.tableMetadata(dbState.selDb.name, schema, table); } catch(e) {}
    renderTableEditor();
    dbNavigate('tables/' + encodeURIComponent(dbState.selDb.name) + '/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table));
  } catch (e) { dbToast(e.message, 'error'); }
}

function renderTableEditor() {
  dbShowView('dbEditorView');
  var mode = dbState.tableMode;
  var meta = dbState.tableMetadata;
  var metaHtml = '';
  if (meta) {
    var parts = [];
    if (meta.owner) parts.push('Owner: ' + esc(meta.owner));
    if (meta.total_size) parts.push('Size: ' + esc(meta.total_size));
    if (meta.estimated_rows !== undefined && meta.estimated_rows !== null) parts.push('Rows: ~' + meta.estimated_rows);
    if (meta.index_count !== undefined) parts.push('Indexes: ' + meta.index_count);
    if (meta.trigger_count !== undefined) parts.push('Triggers: ' + meta.trigger_count);
    if (meta.table_comment) parts.push('Comment: ' + esc(meta.table_comment));
    if (parts.length) metaHtml = '<div class="db-table-meta">' + parts.join(' · ') + '</div>';
  }
  var html = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:4px">'
    + '<h3 style="margin:0">' + esc(dbState.selDb.name) + '.' + esc(dbState.selTable.schema) + '.' + esc(dbState.selTable.name) + '</h3>'
    + '<div class="db-mode-tabs"><button class="db-mode-tab' + (mode==='data'?' active':'') + '" onclick="switchTableMode(\'data\')">📊 Data</button><button class="db-mode-tab' + (mode==='config'?' active':'') + '" onclick="switchTableMode(\'config\')">⚙ Config</button></div></div>';
  html += metaHtml;
  html += '<div id="dbEditorBody">';
  html += mode === 'data' ? renderTableData() : renderTableConfig();
  html += '</div>';
  html += '<div class="db-form-error" id="dbEditorError"></div>';
  document.getElementById('dbEditorContent').innerHTML = html;
}

function switchTableMode(mode) {
  dbState.tableMode = mode;
  if (mode === 'data') {
    loadTableData();
  } else {
    loadTableConfigData();
    renderTableEditor();
  }
}

async function loadTableConfigData() {
  try {
    var [fks, idxs, trigs] = await Promise.all([
      API.databases.foreignKeys(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name),
      API.databases.listIndexes(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name),
      API.databases.listTriggers(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name),
    ]);
    dbState.foreignKeys = fks || [];
    dbState.indexes = idxs || [];
    dbState.triggers = trigs || [];
  } catch(e) { dbState.foreignKeys = []; dbState.indexes = []; dbState.triggers = []; }
}

async function loadTableData() {
  var body = document.getElementById('dbEditorBody');
  if (body) body.innerHTML = '<div class="db-loading">Loading data...</div>';
  try {
    var params = {
      limit: dbState.dataPageSize,
      offset: (dbState.dataPage - 1) * dbState.dataPageSize,
    };
    if (dbState.dataSearch) params.q = dbState.dataSearch;
    if (dbState.dataSortBy) { params.sortBy = dbState.dataSortBy; params.sortDir = dbState.dataSortDir; }
    var data = await API.databases.tableData(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, params);
    dbState.tableEditor.data = data;
    renderTableEditor();
  } catch (e) {
    if (body) body.innerHTML = '<div class="db-error">Failed to load data: ' + esc(e.message) + '</div>';
  }
}

var dbSearchTimer;

function dbSearchInput() {
  clearTimeout(dbSearchTimer);
  dbSearchTimer = setTimeout(function() {
    dbState.dataSearch = document.getElementById('dbDataSearch').value.trim();
    dbState.dataPage = 1;
    loadTableData();
  }, 300);
}

function dbSortBy(col) {
  if (dbState.dataSortBy === col) {
    dbState.dataSortDir = dbState.dataSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    dbState.dataSortBy = col;
    dbState.dataSortDir = 'asc';
  }
  loadTableData();
}

function dbGoPage(n) {
  var total = dbState.tableEditor.data.total || 0;
  var maxPage = Math.max(1, Math.ceil(total / dbState.dataPageSize));
  dbState.dataPage = Math.max(1, Math.min(n, maxPage));
  loadTableData();
}

function renderTableData() {
  var data = dbState.tableEditor.data || { columns: [], rows: [], total: 0 };
  var total = data.total;
  if (!data.columns.length) return '<div class="db-empty">No data found.</div><div style="margin-top:12px;text-align:center"><button class="db-btn" onclick="switchTableMode(\'config\')">⚙ Config Mode</button> <button class="db-btn" onclick="showTablesView()">← Back to tables</button></div>';

  var hasPk = dbState.pkColumns.length > 0;
  var html = '<div class="db-data-toolbar">'
    + '<div class="db-data-search"><span class="db-data-search-icon">🔍</span><input id="dbDataSearch" class="db-form-input db-data-search-input" placeholder="Search data..." value="' + esc(dbState.dataSearch) + '" oninput="dbSearchInput()"></div>'
    + '<div class="db-data-toolbar-actions">'
    + '<span class="db-export-group"><button class="db-btn db-btn-sm" onclick="this.parentElement.querySelector(\'.db-export-dropdown\').classList.toggle(\'open\')" title="Export">⬇ Export</button>'
    + '<div class="db-export-dropdown"><a href="' + API.databases.exportTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, 'csv') + '" class="db-export-option">CSV</a>'
    + '<a href="' + API.databases.exportTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, 'json') + '" class="db-export-option">JSON</a>'
    + '<a href="' + API.databases.exportTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, 'sql') + '" class="db-export-option">SQL</a></div></span>'
    + '<button class="db-btn db-btn-sm" onclick="dbImportCSV()" title="Import CSV">⬆ Import</button>'
    + '<button class="db-btn db-btn-sm" onclick="dbAddRow()" title="Add Row">+ Row</button>'
    + (hasPk ? '<button class="db-btn db-btn-sm db-btn-danger" id="dbDeleteSelectedBtn" onclick="dbDeleteSelected()" disabled title="Delete selected rows">✕ Sel</button>' : '')
    + '<button class="db-btn db-btn-sm" onclick="switchTableMode(\'config\')">⚙ Config</button>'
    + '<button class="db-btn" onclick="showTablesView()">← Tables</button></div></div>';

  html += '<div class="db-data-table-wrap"><table class="db-data-table" id="dbDataTable"><thead><tr>';
  if (hasPk) html += '<th class="db-data-th-check"><input type="checkbox" id="dbSelectAll" onchange="dbToggleSelectAll(this.checked)"></th>';
  data.columns.forEach(function(col) {
    var sortArrow = '';
    if (dbState.dataSortBy === col) sortArrow = dbState.dataSortDir === 'asc' ? ' ▲' : ' ▼';
    html += '<th class="db-data-th" onclick="dbSortBy(\'' + esc(col) + '\')" title="Sort by ' + esc(col) + '">' + esc(col) + sortArrow + '</th>';
  });
  html += '<th class="db-data-th-actions" style="width:60px">Actions</th>';
  html += '</tr></thead><tbody>';
  if (!data.rows.length) {
    html += '<tr><td colspan="' + (data.columns.length + 1 + (hasPk ? 1 : 0)) + '" class="db-empty-row">' + (dbState.dataSearch ? 'No matching rows' : '0 rows') + '</td></tr>';
  } else {
    dbState.selectedRows = [];
    data.rows.forEach(function(row, ri) {
      html += '<tr class="db-data-row" data-idx="' + ri + '">';
      if (hasPk) {
        var pkVal = '';
        for (var i = 0; i < dbState.pkColumns.length; i++) {
          var pk = dbState.pkColumns[i];
          if (row[pk] !== undefined && row[pk] !== null) { pkVal = row[pk]; break; }
        }
        html += '<td class="db-data-cell-check"><input type="checkbox" class="db-row-check" data-pk="' + esc(String(pkVal)) + '" onchange="dbUpdateSelectAll()"></td>';
      }
      data.columns.forEach(function(col) {
        var val = row[col];
        var display = val === null || val === undefined ? '<span class="db-null">NULL</span>' : esc(String(val));
        var copyVal = val === null || val === undefined ? 'NULL' : String(val);
        html += '<td class="db-data-cell" onclick="dbStartEdit(' + ri + ',\'' + esc(col) + '\',this)" title="Click to edit">'
          + '<span class="db-cell-value">' + display + '</span>'
          + '<span class="db-cell-copy" onclick="dbCopyCellValue(event, \'' + esc(copyVal).replace(/'/g, "\\'") + '\')" title="Copy">📋</span>'
          + '</td>';
      });
      // Actions column
      var pkVal = '';
      for (var i = 0; i < dbState.pkColumns.length; i++) {
        var pk = dbState.pkColumns[i];
        if (row[pk] !== undefined && row[pk] !== null) {
          pkVal = row[pk];
          break;
        }
      }
      html += '<td class="db-data-cell-actions">';
      if (pkVal !== '' && dbState.pkColumns.length > 0) {
        html += '<button class="db-btn db-btn-sm db-btn-danger" onclick="dbDeleteRow(' + ri + ')" title="Delete row">✕</button>';
      }
      html += '</td></tr>';
    });
  }
  html += '</tbody></table></div>';

  // Pagination
  var totalPages = Math.max(1, Math.ceil(total / dbState.dataPageSize));
  html += '<div class="db-data-footer">'
    + '<span class="db-meta">' + data.rows.length + ' row' + (data.rows.length !== 1 ? 's' : '') + ' · ' + total + ' total</span>'
    + '<div class="db-data-pagination">'
    + '<button class="db-btn db-btn-sm" onclick="dbGoPage(1)" ' + (dbState.dataPage <= 1 ? 'disabled' : '') + '>⏮</button>'
    + '<button class="db-btn db-btn-sm" onclick="dbGoPage(' + (dbState.dataPage - 1) + ')" ' + (dbState.dataPage <= 1 ? 'disabled' : '') + '>◀</button>'
    + '<span class="db-data-page-info">Page ' + dbState.dataPage + ' of ' + totalPages + '</span>'
    + '<button class="db-btn db-btn-sm" onclick="dbGoPage(' + (dbState.dataPage + 1) + ')" ' + (dbState.dataPage >= totalPages ? 'disabled' : '') + '>▶</button>'
    + '<button class="db-btn db-btn-sm" onclick="dbGoPage(' + totalPages + ')" ' + (dbState.dataPage >= totalPages ? 'disabled' : '') + '>⏭</button>'
    + '<select class="db-form-input db-data-page-size" onchange="dbState.dataPageSize=parseInt(this.value);dbState.dataPage=1;loadTableData()">'
    + '<option value="10" ' + (dbState.dataPageSize === 10 ? 'selected' : '') + '>10</option>'
    + '<option value="25" ' + (dbState.dataPageSize === 25 ? 'selected' : '') + '>25</option>'
    + '<option value="50" ' + (dbState.dataPageSize === 50 ? 'selected' : '') + '>50</option>'
    + '<option value="100" ' + (dbState.dataPageSize === 100 ? 'selected' : '') + '>100</option>'
    + '</select></div></div>';
  return html;
}

/* ─── Inline Row CRUD ─── */

function dbCopyCellValue(e, value) {
  e.stopPropagation();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).then(function() { dbToast('Copied to clipboard'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    dbToast('Copied to clipboard');
  }
}

function dbStartEdit(rowIdx, colName, td) {
  if (td.querySelector('input')) return;
  var row = dbState.tableEditor.data.rows[rowIdx];
  if (!row) return;
  var val = row[colName];
  var isNull = val === null || val === undefined;
  var nullChecked = isNull ? ' checked' : '';
  td.innerHTML = '<div style="display:flex;align-items:center;gap:4px"><input class="db-inline-edit" type="text" value="' + esc(isNull ? '' : String(val)) + '" autocomplete="off" style="flex:1;min-width:60px">'
    + '<label class="db-inline-null-label" title="Set to NULL"><input type="checkbox" class="db-inline-null-cb"' + nullChecked + ' onchange="var inp=this.parentElement.parentElement.querySelector(\'input[type=text]\');inp.disabled=this.checked;if(this.checked)inp.value=\'\';else inp.focus()"> NULL</label>'
    + '<button class="db-btn db-btn-xs db-inline-save" onclick="dbSaveEdit(' + rowIdx + ',\'' + esc(colName) + '\',this.parentElement.parentElement)">✔</button>'
    + '<button class="db-btn db-btn-xs db-inline-cancel" onclick="dbCancelEdit(' + rowIdx + ',\'' + esc(colName) + '\',this.parentElement.parentElement)">✕</button></div>';
  var input = td.querySelector('input[type=text]');
  input.disabled = isNull;
  input.focus();
  if (!isNull) input.select();
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') dbSaveEdit(rowIdx, colName, td);
    if (e.key === 'Escape') dbCancelEdit(rowIdx, colName, td);
  });
}

function dbCancelEdit(rowIdx, colName, td) {
  var row = dbState.tableEditor.data.rows[rowIdx];
  if (!row) return;
  var val = row[colName];
  td.innerHTML = val === null || val === undefined ? '<span class="db-null">NULL</span>' : esc(String(val));
}

async function dbSaveEdit(rowIdx, colName, td) {
  var input = td.querySelector('input[type=text]');
  if (!input) return;
  var nullCb = td.querySelector('.db-inline-null-cb');
  var newVal = (nullCb && nullCb.checked) ? null : input.value;
  var row = dbState.tableEditor.data.rows[rowIdx];
  if (!row) return;
  var pkCol = dbState.pkColumns[0];
  var pkVal = pkCol ? row[pkCol] : null;
  if (!pkCol || pkVal === null || pkVal === undefined) {
    dbToast('Cannot edit: no primary key found on this table', 'error');
    dbCancelEdit(rowIdx, colName, td);
    return;
  }
  try {
    await API.databases.updateRow(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, pkCol, pkVal, { data: { [colName]: newVal } });
    row[colName] = newVal;
    td.innerHTML = newVal === null ? '<span class="db-null">NULL</span>' : esc(String(newVal));
    dbToast('Cell updated', 'success');
  } catch (e) {
    dbToast('Failed to update: ' + e.message, 'error');
    dbCancelEdit(rowIdx, colName, td);
  }
}

async function dbDeleteRow(rowIdx) {
  var row = dbState.tableEditor.data.rows[rowIdx];
  if (!row) return;
  var pkCol = dbState.pkColumns[0];
  var pkVal = pkCol ? row[pkCol] : null;
  if (!pkCol || pkVal === null || pkVal === undefined) {
    dbToast('Cannot delete: no primary key found on this table', 'error');
    return;
  }
  showConfirmModal('Delete this row? (PK: ' + pkCol + ' = ' + pkVal + ')', String(pkVal), async function() {
    try {
      await API.databases.deleteRow(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, pkCol, pkVal);
      dbToast('Row deleted');
      await loadTableData();
    } catch (e) { dbToast('Failed to delete: ' + e.message, 'error'); }
  });
}

async function dbAddRow() {
  // Build a form with all columns as inputs
  var cols = dbState.tableEditor.columns;
  var html = '<h3>Add Row to ' + esc(dbState.selTable.name) + '</h3>';
  cols.forEach(function(c) {
    if (c.column_default === 'auto_increment' || c.is_serial) {
      html += '<div class="n-form-group"><label>' + esc(c.column_name) + ' <span class="db-meta">(auto)</span></label><input class="db-form-input" disabled value="auto"></div>';
    } else {
      var def = c.column_default || '';
      html += '<div class="n-form-group"><label>' + esc(c.column_name) + ' <span class="db-meta">' + esc(c.data_type) + '</span></label>'
        + '<input id="dbAddRow_' + esc(c.column_name) + '" class="db-form-input" placeholder="' + esc(def) + '" value="' + esc(def) + '"></div>';
    }
  });
  html += '<div class="db-form-error" id="dbModalError"></div>';
  html += '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button><button class="fm-btn fm-btn-primary" onclick="doAddRow()">Add Row</button></div>';
  document.getElementById('dbModalContent').innerHTML = html;
  document.getElementById('dbModal').style.display = 'flex';
  window.doAddRow = async function() {
    var data = {};
    cols.forEach(function(c) {
      if (c.column_default === 'auto_increment' || c.is_serial) return;
      var el = document.getElementById('dbAddRow_' + c.column_name);
      if (el) {
        var val = el.value.trim();
        if (val !== '') data[c.column_name] = val;
      }
    });
    try {
      await API.databases.insertRow(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, { data: data });
      closeDBModal();
      dbToast('Row added');
      dbState.dataPage = 1;
      await loadTableData();
    } catch (e) { dbModalError(e.message); }
  };
}

function renderTableConfig() {
  var cols = dbState.tableEditor.columns;
  var changes = dbState.tableEditor.changes;
  var meta = dbState.tableMetadata;
  var fks = dbState.foreignKeys || [];
  var idxs = dbState.indexes || [];
  var html = '';

  // Table comment & table-level actions
  html += '<div class="db-editor-table-actions">';
  html += '<div class="n-form-group" style="flex:1;min-width:200px"><label>Table Comment</label><input id="dbTableCommentInput" class="db-form-input" value="' + esc((meta && meta.table_comment) || '') + '" placeholder="Optional description"></div>';
  html += '<div class="db-editor-toolbar"><button class="db-btn db-btn-sm" onclick="saveTableComment()">💬 Set Comment</button>';
  html += '<button class="db-btn db-btn-sm" onclick="showFKRelationsModal()" title="View all FK relations in database">🔗 Relations</button>';
  html += '<button class="db-btn db-btn-sm" onclick="dbDuplicateTable()" title="Create copy of this table">📋 Duplicate</button>';
  html += '<button class="db-btn db-btn-sm" onclick="dbRenameTable()" title="Rename table">✏️ Rename</button>';
  html += '<button class="db-btn db-btn-sm db-btn-warn" onclick="dbTruncateTable()" title="Remove all rows">🗑 Empty</button>';
  html += '<button class="db-btn db-btn-sm" onclick="dbVacuum()" title="VACUUM ANALYZE">🧹 Vacuum</button>';
  html += '<button class="db-btn db-btn-sm" onclick="dbAnalyze()" title="ANALYZE">📊 Analyze</button>';
  html += '</div></div>';

  // Column config grid
  html += '<div class="db-editor-grid"><div class="db-editor-header"><span>Column</span><span>Type</span><span>Null</span><span>Default</span><span>Comment</span><span></span></div>';
  cols.forEach(function(c, i) {
    var isNew = c._action === 'add';
    var isDeleted = c._action === 'drop';
    var colComment = c._comment || (meta && meta.column_comments && meta.column_comments[c.column_name]) || '';
    html += '<div class="db-editor-row' + (isNew ? ' db-editor-new' : '') + (isDeleted ? ' db-editor-deleted' : '') + '">'
      + '<input value="' + esc(c.column_name) + '" onchange="tedChangeCol(' + i + ',\'column_name\',this.value)" class="db-form-input">'
      + '<select class="db-form-input" onchange="tedChangeCol(' + i + ',\'data_type\',this.value)">' + typeOptionsSelected(c.data_type) + '</select>'
      + '<label><input type="checkbox" ' + (c.is_nullable === 'YES' ? 'checked' : '') + ' onchange="tedChangeCol(' + i + ',\'is_nullable\',this.checked ? \'YES\' : \'NO\')"> Null</label>'
      + '<input value="' + esc(c.column_default||'') + '" onchange="tedChangeCol(' + i + ',\'column_default\',this.value)" class="db-form-input" placeholder="default">'
      + '<input value="' + esc(colComment) + '" onchange="tedChangeColComment(' + i + ',this.value)" class="db-form-input" placeholder="column comment">'
      + '<button class="db-btn db-btn-sm ' + (isDeleted ? 'db-btn-danger' : '') + '" onclick="tedToggleDelete(' + i + ')">' + (isDeleted ? '↩' : '✕') + '</button>'
      + '</div>';
  });
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap">'
    + '<button class="db-btn" onclick="tedAddColumn()">+ Add Column</button>'
    + '<button class="db-btn db-btn-primary" onclick="tedSave()">💾 Save Changes</button>'
    + '<button class="db-btn" onclick="switchTableMode(\'data\')">📊 Data Mode</button>'
    + '<button class="db-btn" onclick="showTablesView()">← Back to tables</button>'
    + '<button class="db-btn db-btn-danger" onclick="dropTable()">🗑 Drop Table</button>'
    + '</div>';
  if (changes.length > 0) html += '<div class="db-editor-pending">' + changes.length + ' pending change(s)</div>';

  // Foreign Keys section
  html += '<div class="db-config-section"><h4>🔗 Foreign Keys</h4>';
  if (fks.length) {
    html += '<table class="db-fk-table"><thead><tr><th>Column</th><th>References</th><th>On Update</th><th>On Delete</th><th>Constraint</th></tr></thead><tbody>';
    fks.forEach(function(fk) {
      html += '<tr><td>' + esc(fk.column_name) + '</td><td>' + esc(fk.foreign_schema + '.' + fk.foreign_table + '(' + fk.foreign_column + ')') + '</td><td>' + esc(fk.update_rule) + '</td><td>' + esc(fk.delete_rule) + '</td><td>' + esc(fk.constraint_name) + '</td></tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div class="db-meta">No foreign keys defined.</div>';
  }
  html += '</div>';

  // Indexes section
  html += '<div class="db-config-section"><h4>📑 Indexes <button class="db-btn db-btn-xs" onclick="dbShowCreateIndex()" style="margin-left:8px">+ Add Index</button></h4>';
  if (idxs.length) {
    html += '<table class="db-fk-table"><thead><tr><th>Name</th><th>Definition</th><th></th></tr></thead><tbody>';
    idxs.forEach(function(idx) {
      html += '<tr><td>' + esc(idx.indexname) + '</td><td><code style="font-size:11px;color:var(--text-secondary)">' + esc(idx.indexdef) + '</code></td>'
        + '<td><button class="db-btn db-btn-xs db-btn-danger" onclick="dbDropIndex(\'' + esc(idx.indexname) + '\')" title="Drop index">✕</button></td></tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div class="db-meta">No indexes defined.</div>';
  }
  html += '</div>';

  // Triggers section
  var trigs = dbState.triggers || [];
  html += '<div class="db-config-section"><h4>⚡ Triggers <button class="db-btn db-btn-xs" onclick="dbShowCreateTrigger()" style="margin-left:8px">+ Add Trigger</button></h4>';
  if (trigs.length) {
    html += '<table class="db-fk-table"><thead><tr><th>Name</th><th>Status</th><th>Definition</th><th></th></tr></thead><tbody>';
    trigs.forEach(function(t) {
      html += '<tr><td>' + esc(t.trigger_name) + '</td><td>' + esc(t.status || 'ENABLED') + '</td>'
        + '<td><code style="font-size:11px;color:var(--text-secondary)">' + esc(t.trigger_def) + '</code></td>'
        + '<td><button class="db-btn db-btn-xs db-btn-danger" onclick="dbDropTrigger(\'' + esc(t.trigger_name) + '\')" title="Drop trigger">✕</button></td></tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div class="db-meta">No triggers defined.</div>';
  }
  html += '</div>';

  return html;
}

/* ─── Foreign Key / Index helpers ─── */
function dbShowCreateIndex() {
  var html = '<h3>Create Index on ' + esc(dbState.selTable.name) + '</h3>'
    + '<div class="n-form-group"><label>Column</label><select id="dbIdxColumn" class="db-form-input">'
    + dbState.tableEditor.columns.map(function(c) { return '<option value="' + esc(c.column_name) + '">' + esc(c.column_name) + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="n-form-group"><label>Index Name (optional)</label><input id="dbIdxName" class="db-form-input" placeholder="auto: table_col_idx"></div>'
    + '<div style="display:flex;gap:12px;margin-bottom:12px">'
    + '<label style="font-size:12px;color:var(--text-secondary)"><input type="checkbox" id="dbIdxUnique"> Unique</label>'
    + '<label style="font-size:12px;color:var(--text-secondary)">Method: <select id="dbIdxMethod" class="db-form-input" style="width:auto;display:inline-block;padding:3px 8px"><option value="">Default</option><option value="btree">B-tree</option><option value="hash">Hash</option><option value="gist">GiST</option><option value="gin">GIN</option><option value="brin">BRIN</option></select></label>'
    + '</div>'
    + '<div class="db-form-error" id="dbModalError"></div>'
    + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button><button class="fm-btn fm-btn-primary" onclick="doCreateIndex()">Create Index</button></div>';
  document.getElementById('dbModalContent').innerHTML = html;
  document.getElementById('dbModal').style.display = 'flex';
  window.doCreateIndex = async function() {
    var data = {
      column: document.getElementById('dbIdxColumn').value,
      indexName: document.getElementById('dbIdxName').value.trim() || undefined,
      unique: document.getElementById('dbIdxUnique').checked,
      method: document.getElementById('dbIdxMethod').value || undefined,
    };
    if (!data.column) return dbModalError('Column required');
    try {
      await API.databases.createIndex(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, data);
      closeDBModal();
      dbToast('Index created');
      await loadTableConfigData();
      renderTableEditor();
    } catch (e) { dbModalError(e.message); }
  };
}

async function dbDropIndex(indexName) {
  showConfirmModal('Drop index "' + indexName + '"?', indexName, async function() {
    try {
      await API.databases.dropIndex(dbState.selDb.name, dbState.selTable.schema, indexName);
      dbToast('Index dropped');
      await loadTableConfigData();
      renderTableEditor();
    } catch (e) { dbToast(e.message, 'error'); }
  });
}

/* ─── Trigger helpers ─── */
function dbShowCreateTrigger() {
  showDBModal('<h3>Create Trigger on ' + esc(dbState.selTable.name) + '</h3>'
    + '<div class="n-form-group"><label>Trigger Name</label><input id="dbTrigName" class="db-form-input" placeholder="e.g. before_insert_check"></div>'
    + '<div class="n-form-group"><label>Timing</label><select id="dbTrigTiming" class="db-form-input"><option value="BEFORE">BEFORE</option><option value="AFTER">AFTER</option><option value="INSTEAD OF">INSTEAD OF</option></select></div>'
    + '<div class="n-form-group"><label>Event</label><select id="dbTrigEvent" class="db-form-input"><option value="INSERT">INSERT</option><option value="UPDATE">UPDATE</option><option value="DELETE">DELETE</option><option value="TRUNCATE">TRUNCATE</option></select></div>'
    + '<div class="n-form-group"><label>For Each</label><select id="dbTrigForEach" class="db-form-input"><option value="ROW">ROW</option><option value="STATEMENT">STATEMENT</option></select></div>'
    + '<div class="n-form-group"><label>Function / Procedure</label><input id="dbTrigFunction" class="db-form-input" placeholder="e.g. public.my_trigger_func()"></div>'
    + '<div style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary)"><input type="checkbox" id="dbTrigCondition"> Add WHEN condition</label></div>'
    + '<div class="n-form-group" id="dbTrigConditionGroup" style="display:none"><label>WHEN clause (e.g. OLD.status <> NEW.status)</label><input id="dbTrigConditionVal" class="db-form-input" placeholder="condition"></div>'
    + '<div class="db-form-error" id="dbModalError"></div>'
    + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button><button class="fm-btn fm-btn-primary" onclick="doCreateTrigger()">Create Trigger</button></div>');
  document.getElementById('dbTrigCondition')?.addEventListener('change', function() {
    document.getElementById('dbTrigConditionGroup').style.display = this.checked ? 'block' : 'none';
  });
  window.doCreateTrigger = async function() {
    var name = document.getElementById('dbTrigName').value.trim();
    var timing = document.getElementById('dbTrigTiming').value;
    var event = document.getElementById('dbTrigEvent').value;
    var forEach = document.getElementById('dbTrigForEach').value;
    var func = document.getElementById('dbTrigFunction').value.trim();
    var wc = document.getElementById('dbTrigCondition').checked ? document.getElementById('dbTrigConditionVal').value.trim() : '';
    if (!name) return dbModalError('Trigger name required');
    if (!func) return dbModalError('Function/procedure required');
    var sql = 'CREATE TRIGGER ' + name + ' ' + timing + ' ' + event + ' ON ' + dbState.selTable.schema + '.' + dbState.selTable.name + ' FOR EACH ' + forEach;
    if (wc) sql += ' WHEN (' + wc + ')';
    sql += ' EXECUTE FUNCTION ' + func;
    try {
      await API.databases.createTrigger(dbState.selDb.name, sql);
      closeDBModal();
      dbToast('Trigger created');
      await loadTableConfigData();
      renderTableEditor();
    } catch (e) { dbModalError(e.message); }
  };
}

async function dbDropTrigger(triggerName) {
  showConfirmModal('Drop trigger "' + triggerName + '"?', triggerName, async function() {
    try {
      await API.databases.dropTrigger(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, triggerName);
      dbToast('Trigger dropped');
      await loadTableConfigData();
      renderTableEditor();
    } catch (e) { dbToast(e.message, 'error'); }
  });
}

/* ─── Activity Monitor ─── */
async function showTriggersModal() {
  var dbName = dbState.selDb ? dbState.selDb.name : '';
  if (!dbName) return dbToast('No database selected', 'warning');
  showDBModal('<h3>⚡ Triggers — ' + esc(dbName) + '</h3>'
    + '<div id="triggersContent"><div class="db-loading">Loading triggers...</div></div>'
    + '<div style="margin-top:8px;text-align:right"><button class="db-btn db-btn-sm" onclick="refreshTriggersModal()">🔄 Refresh</button></div>');
  await refreshTriggersModal();
}
window.refreshTriggersModal = async function() {
  var el = document.getElementById('triggersContent');
  if (!el) return;
  el.innerHTML = '<div class="db-loading">Refreshing...</div>';
  try {
    var dbName = document.querySelector('.fm-modal h3').textContent.split(' — ')[1];
    var triggers = await API.databases.listAllTriggers(dbName);
    if (!triggers || !triggers.length) {
      el.innerHTML = '<div class="db-meta">No triggers defined.</div>';
      return;
    }
    var html = '<table class="db-fk-table" style="font-size:11px"><thead><tr>'
      + '<th>Schema</th><th>Trigger</th><th>Table</th><th>Status</th><th></th></tr></thead><tbody>';
    triggers.forEach(function(t) {
      html += '<tr>'
        + '<td>' + esc(t.schema_name || '') + '</td>'
        + '<td>' + esc(t.trigger_name || '') + '</td>'
        + '<td>' + esc(t.table_name || '') + '</td>'
        + '<td>' + esc(t.status || 'ENABLED') + '</td>'
        + '<td style="white-space:nowrap">'
        + '<button class="db-btn db-btn-xs" onclick="showTriggerDefinition(\'' + esc(t.schema_name) + '\',\'' + esc(t.trigger_name) + '\')" title="Definition">📄</button>'
        + '<button class="db-btn db-btn-xs db-btn-danger" onclick="dropTriggerGlobal(\'' + esc(t.schema_name) + '\',\'' + esc(t.trigger_name) + '\')" title="Drop" style="margin-left:4px">✕</button>'
        + '</td>'
        + '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  } catch (e) { el.innerHTML = '<div class="db-error">' + esc(e.message) + '</div>'; }
};
window.showTriggerDefinition = async function(schema, triggerName) {
  try {
    var dbName = document.querySelector('.fm-modal h3').textContent.split(' — ')[1];
    var def = await API.databases.triggerDefinition(dbName, schema, triggerName);
    var html = '<div style="margin-bottom:8px"><strong>' + esc(def.schema_name + '.' + def.trigger_name) + '</strong> on ' + esc(def.table_name) + '</div>'
      + '<pre style="background:var(--bg3);padding:8px;border-radius:4px;overflow:auto;max-height:400px;font-size:11px">' + esc(def.trigger_def || '') + '</pre>';
    showDBModal(html);
  } catch (e) { dbToast(e.message, 'error'); }
};
window.dropTriggerGlobal = async function(schema, triggerName) {
  showConfirmModal('Drop trigger "' + triggerName + '"?', triggerName, async function() {
    try {
      var dbName = document.querySelector('.fm-modal h3').textContent.split(' — ')[1];
      await API.databases.dropTriggerGlobal(dbName, schema, triggerName);
      dbToast('Trigger "' + triggerName + '" dropped');
      refreshTriggersModal();
    } catch (e) { dbToast(e.message, 'error'); }
  });
};

var connectionsRefreshTimer = null;
async function showConnectionsMonitor() {
  var dbName = dbState.selDb ? dbState.selDb.name : dbState.queryDb;
  if (!dbName) return dbToast('No database selected', 'warning');
  showDBModal('<h3>📊 Connections — ' + esc(dbName) + '</h3>'
    + '<div id="connectionsContent"><div class="db-loading">Loading connections...</div></div>'
    + '<div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary)"><input type="checkbox" id="connectionsAutoRefresh" onchange="toggleConnectionsAutoRefresh()"> Auto-refresh every 5s</label>'
    + '<button class="db-btn db-btn-sm" onclick="refreshConnectionsMonitor()">🔄 Refresh</button></div>');
  await refreshConnectionsMonitor();
}
window.toggleConnectionsAutoRefresh = function() {
  if (connectionsRefreshTimer) { clearInterval(connectionsRefreshTimer); connectionsRefreshTimer = null; }
  var chk = document.getElementById('connectionsAutoRefresh');
  if (chk && chk.checked) {
    connectionsRefreshTimer = setInterval(refreshConnectionsMonitor, 5000);
  }
};
window.refreshConnectionsMonitor = async function() {
  var el = document.getElementById('connectionsContent');
  if (!el) return;
  el.innerHTML = '<div class="db-loading">Refreshing...</div>';
  try {
    var dbName = document.querySelector('.fm-modal h3').textContent.split(' — ')[1];
    var conns = await API.databases.connections(dbName);
    if (!conns || !conns.length) {
      el.innerHTML = '<div class="db-meta">No active connections.</div>';
      return;
    }
    var html = '<table class="db-fk-table" style="font-size:11px"><thead><tr>'
      + '<th>PID</th><th>User</th><th>State</th><th>Query</th><th>Duration</th><th></th></tr></thead><tbody>';
    conns.forEach(function(c) {
      var queryStr = (c.query || '').substring(0, 120);
      var dur = c.duration || '—';
      html += '<tr>'
        + '<td>' + c.pid + '</td>'
        + '<td>' + esc(c.user || '') + '</td>'
        + '<td>' + esc(c.state || '') + '</td>'
        + '<td><code style="font-size:10px;word-break:break-all">' + esc(queryStr) + (queryStr.length >= 120 ? '...' : '') + '</code></td>'
        + '<td style="white-space:nowrap;font-size:10px">' + esc(typeof dur === 'object' ? JSON.stringify(dur) : dur) + '</td>'
        + '<td style="white-space:nowrap">'
        + '<button class="db-btn db-btn-xs db-btn-danger" onclick="killConnection(' + c.pid + ')" title="Kill connection">✕</button>'
        + '</td>'
        + '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  } catch (e) { el.innerHTML = '<div class="db-error">' + esc(e.message) + '</div>'; }
};
window.killConnection = async function(pid) {
  showConfirmModal('Kill connection PID ' + pid + '?', String(pid), async function() {
    try {
      var dbName = document.querySelector('.fm-modal h3').textContent.split(' — ')[1];
      await API.databases.killConnection(dbName, pid);
      dbToast('Connection ' + pid + ' killed');
      refreshConnectionsMonitor();
    } catch(e) { dbToast(e.message, 'error'); }
  });
};

function typeOptionsSelected(current) {
  var types = ['integer','bigint','smallint','serial','bigserial','varchar(255)','text','boolean','timestamptz','timestamp','date','numeric','real','jsonb','uuid'];
  return types.map(function(t) { return '<option value="' + t + '" ' + (t === current ? 'selected' : '') + '>' + t + '</option>'; }).join('');
}

function tedChangeCol(i, key, val) {
  var c = dbState.tableEditor.columns[i];
  c[key] = val;
  if (!c._action && c._oldName) c._action = 'alter';
}

function tedAddColumn() {
  dbState.tableEditor.columns.push({ column_name: '', data_type: 'text', is_nullable: 'YES', column_default: '', _action: 'add', _oldName: '' });
  renderTableEditor();
}

function tedToggleDelete(i) {
  var c = dbState.tableEditor.columns[i];
  if (c._action === 'drop') { c._action = c._oldName ? null : null; } else { c._action = 'drop'; }
  renderTableEditor();
}

async function tedSave() {
  var changes = [];
  var cols = dbState.tableEditor.columns;
  var orig = dbState.tableEditor.original;
  cols.forEach(function(c) {
    if (c._action === 'add') changes.push({ action: 'add', name: c.column_name, type: c.data_type, nullable: c.is_nullable === 'YES', default: c.column_default });
    else if (c._action === 'drop') changes.push({ action: 'drop', name: c._oldName });
    else if (c._action === 'alter') changes.push({ action: 'alter', oldName: c._oldName, type: c.data_type, nullable: c.is_nullable === 'YES' });
  });
  // Detect renames
  for (var i = 0; i < cols.length; i++) {
    if (!cols[i]._action && cols[i].column_name !== cols[i]._oldName) {
      changes.push({ action: 'rename', oldName: cols[i]._oldName, newName: cols[i].column_name });
    }
  }
  dbState.tableEditor.changes = changes;
  if (!changes.length) return dbToast('No changes to save', 'warning');
  try {
    await API.databases.updateTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, { changes: changes });
    dbToast('Changes saved');
    await openTableEditor(dbState.selTable.schema, dbState.selTable.name);
  } catch (e) { document.getElementById('dbEditorError').textContent = e.message; document.getElementById('dbEditorError').style.display = 'block'; }
}

async function dropTable() {
  var fullName = dbState.selTable.schema + '.' + dbState.selTable.name;
  showConfirmModal('Permanently delete table "' + fullName + '"? All data and indexes will be lost.', fullName, async function() {
    try { await API.databases.dropTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, fullName); dbToast('Table "' + fullName + '" dropped'); await showTablesView(); }
    catch (e) { dbToast(e.message, 'error'); }
  });
}

/* ─── Table-Level Actions (Duplicate, Rename, Truncate, Vacuum, Analyze, Comment) ─── */

function tedChangeColComment(i, val) {
  dbState.tableEditor.columns[i]._comment = val;
}

async function saveTableComment() {
  var input = document.getElementById('dbTableCommentInput');
  if (!input) return;
  try {
    await API.databases.setTableComment(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, input.value);
    dbToast('Table comment saved');
  } catch (e) { dbToast(e.message, 'error'); }
}

async function dbDuplicateTable() {
  var name = prompt('New table name (schema.table):', dbState.selTable.schema + '.' + dbState.selTable.name + '_copy');
  if (!name || !name.trim()) return;
  name = name.trim();
  var parts = name.split('.');
  var targetName = parts.length > 1 ? parts[parts.length - 1] : name;
  if (!isValidIdent(targetName)) { dbToast(identError(targetName), 'error'); return; }
  try {
    await API.databases.duplicateTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, name);
    dbToast('Table duplicated as "' + name + '"');
    await showTablesView();
  } catch (e) { dbToast(e.message, 'error'); }
}

async function dbRenameTable() {
  var name = prompt('New table name (without schema):', dbState.selTable.name + '_new');
  if (!name || !name.trim()) return;
  name = name.trim();
  if (!isValidIdent(name)) { dbToast(identError(name), 'error'); return; }
  try {
    await API.databases.renameTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, name);
    dbToast('Table renamed to "' + name + '"');
    await showTablesView();
  } catch (e) { dbToast(e.message, 'error'); }
}

async function dbTruncateTable() {
  var fullName = dbState.selTable.schema + '.' + dbState.selTable.name;
  showConfirmModal('Remove ALL rows from "' + fullName + '"? This cannot be undone.', fullName, async function() {
    try { await API.databases.truncateTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name); dbToast('Table "' + fullName + '" truncated'); await showTablesView(); }
    catch (e) { dbToast(e.message, 'error'); }
  });
}

async function dbVacuum() {
  try {
    await API.databases.vacuumTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name);
    dbToast('VACUUM completed');
  } catch (e) { dbToast(e.message, 'error'); }
}

async function dbAnalyze() {
  try {
    await API.databases.analyzeTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name);
    dbToast('ANALYZE completed');
  } catch (e) { dbToast(e.message, 'error'); }
}

/* ─── Import CSV ─── */
async function dbImportCSV() {
  var html = '<h3>Import Data into ' + esc(dbState.selTable.name) + '</h3>'
    + '<div class="n-form-group"><label>Format</label><select id="dbImportFormat" class="db-form-input"><option value="csv">CSV</option><option value="sql">SQL INSERT</option></select></div>'
    + '<div class="n-form-group"><label>Upload File</label><input type="file" id="dbImportFile" class="db-form-input" accept=".csv,.sql" onchange="dbImportFileChanged(this)"></div>'
    + '<div class="n-form-group"><label>Content (paste CSV with header or SQL statements)</label><textarea id="dbImportContent" class="db-form-input" style="min-height:200px;font-family:var(--font-mono);font-size:12px" placeholder="Paste CSV or SQL here..."></textarea></div>'
    + '<div class="db-form-error" id="dbModalError"></div>'
    + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button><button class="fm-btn fm-btn-primary" onclick="doImportCSV()">Import</button></div>';
  document.getElementById('dbModalContent').innerHTML = html;
  document.getElementById('dbModal').style.display = 'flex';
  window.dbImportFileChanged = async function(input) {
    var file = input.files[0];
    if (!file) return;
    var ta = document.getElementById('dbImportContent');
    if (!ta) return;
    ta.value = 'Loading ' + file.name + '...';
    try {
      var content = await file.text();
      ta.value = content;
      var fmt = document.getElementById('dbImportFormat');
      if (fmt) {
        var ext = file.name.toLowerCase().split('.').pop();
        if (ext === 'csv') fmt.value = 'csv';
        else if (ext === 'sql') fmt.value = 'sql';
      }
    } catch (e) { ta.value = 'Error reading file: ' + e.message; }
  };
  window.doImportCSV = async function() {
    var format = document.getElementById('dbImportFormat').value;
    var content = document.getElementById('dbImportContent').value.trim();
    if (!content) return dbModalError('Paste content to import');
    try {
      var result = await API.databases.importTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, format, content);
      closeDBModal();
      dbToast(result.rowsImported !== undefined ? result.rowsImported + ' rows imported' : result.statementsExecuted + ' statements executed');
      await loadTableData();
    } catch (e) { dbModalError(e.message); }
  };
}

/* ─── Batch Delete ─── */
function dbToggleSelectAll(checked) {
  document.querySelectorAll('.db-row-check').forEach(function(cb) { cb.checked = checked; });
  dbUpdateSelectAll();
}

function dbUpdateSelectAll() {
  var checked = document.querySelectorAll('.db-row-check:checked');
  var btn = document.getElementById('dbDeleteSelectedBtn');
  if (btn) btn.disabled = checked.length === 0;
}

async function dbDeleteSelected() {
  var checked = document.querySelectorAll('.db-row-check:checked');
  if (!checked.length) return;
  var pkCol = dbState.pkColumns[0];
  if (!pkCol) { dbToast('No primary key found', 'error'); return; }
  var pkVals = [];
  checked.forEach(function(cb) { pkVals.push(cb.getAttribute('data-pk')); });
  showConfirmModal('Delete ' + pkVals.length + ' selected row(s)? This cannot be undone.', String(pkVals.length), async function() {
    try {
      var result = await API.databases.deleteRows(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, pkCol, pkVals);
      dbToast(result.rowCount + ' row(s) deleted');
      await loadTableData();
    } catch (e) { dbToast(e.message, 'error'); }
  });
}

/* ─── SQL Query Terminal ─── */
dbState.queryHistory = [];
dbState.queryHistoryIdx = -1;
dbState.queryPresets = [];
dbState.queryDb = '';
dbState.acIndex = -1;
dbState.schemaCache = [];
var queryRunTimer;

async function loadSchemaCache(db) {
  if (!db) return;
  try {
    var tables = await API.databases.tables(db);
    var cache = [];
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      cache.push(t.schemaname + '.' + t.tablename);
      try {
        var info = await API.databases.tableInfo(db, t.schemaname, t.tablename);
        (info.columns || []).forEach(function(c) { cache.push(c.column_name); });
      } catch(e) {}
    }
    dbState.schemaCache = cache;
  } catch(e) { dbState.schemaCache = []; }
}

var SQL_KEYWORDS = [
  'SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET','DELETE',
  'CREATE','ALTER','DROP','TABLE','INDEX','VIEW','TRIGGER','FUNCTION',
  'PROCEDURE','SCHEMA','DATABASE','ROLE','GRANT','REVOKE',
  'JOIN','LEFT','RIGHT','INNER','OUTER','CROSS','ON','AND','OR','NOT',
  'IN','LIKE','BETWEEN','IS','NULL','EXISTS','ANY','ALL','SOME',
  'AS','ORDER','BY','GROUP','HAVING','LIMIT','OFFSET','UNION','INTERSECT','EXCEPT',
  'DISTINCT','ASC','DESC','NULLS','FIRST','LAST',
  'COUNT','SUM','AVG','MIN','MAX','COALESCE','CAST',
  'CASE','WHEN','THEN','ELSE','END',
  'BEGIN','COMMIT','ROLLBACK','TRANSACTION',
  'PRIMARY','KEY','FOREIGN','REFERENCES','UNIQUE','CHECK','DEFAULT',
  'CASCADE','RESTRICT',
  'TEXT','VARCHAR','INTEGER','BIGINT','SMALLINT','SERIAL','BIGSERIAL',
  'BOOLEAN','TIMESTAMP','TIMESTAMPTZ','DATE','NUMERIC','REAL','JSONB','UUID',
  'TRUE','FALSE',
  'NOW','CURRENT_DATE','CURRENT_TIMESTAMP',
  'EXPLAIN','ANALYZE','VERBOSE',
  'SHOW','DESCRIBE',
  'WITH','RECURSIVE',
  'RETURNING','CONFLICT','DO','NOTHING',
  'FETCH','NEXT','ROWS','ONLY',
  'WINDOW','OVER','PARTITION','RANGE','UNBOUNDED','PRECEDING','FOLLOWING',
  'LATERAL','NATURAL','USING',
  'ILIKE','SIMILAR','TO','ESCAPE',
  'PUBLIC',
];

function showQueryTerminal() {
  dbShowView('dbQueryView');
  document.getElementById('dbTitle').textContent = 'SQL Query Terminal';
  document.getElementById('dbBreadcrumb').innerHTML = '<a href="#" onclick="renderCards()">Home</a> / SQL Query';
  dbNavigate('query');
  renderQueryTerminal();
}

async function renderQueryTerminal() {
  if (dbState.databases.length) {
    dbState.queryDb = dbState.queryDb || dbState.databases[0].name || '';
  }
  if (!dbState.queryPresets.length) {
    try { dbState.queryPresets = await API.databases.queryPresets(); } catch(e) {}
  }

  var dbOpts = dbState.databases.map(function(d) {
    return '<option value="' + esc(d.name) + '" ' + (d.name === dbState.queryDb ? 'selected' : '') + '>' + esc(d.name) + '</option>';
  }).join('');

  var html = '<div class="db-query-toolbar">'
    + '<div class="db-query-db-select"><label>Database:</label><select id="queryDbSelect" class="db-form-input" onchange="dbState.queryDb=this.value;loadSchemaCache(this.value)">' + dbOpts + '</select></div>'
    + '<div class="db-query-actions"><button class="db-btn db-btn-primary" id="queryRunBtn" onclick="executeQuery()">▶ Run</button><button class="db-btn" onclick="clearQuery()">Clear</button><button class="db-btn db-btn-icon" onclick="showQueryHistory()" title="History">📋</button><button class="db-btn db-btn-icon" onclick="saveBookmark()" title="Save as Bookmark">💾</button><button class="db-btn db-btn-icon" onclick="loadBookmarks()" title="Load Bookmarks">📑</button><button class="db-btn" onclick="showCSVImport()" title="Import CSV">📄 Import CSV</button><button class="db-btn" id="explainBtn" onclick="runExplainAnalyze()" title="EXPLAIN ANALYZE">🔍 Explain</button></div>'
    + '</div>'
    + '<div class="db-query-layout">'
    + '<div class="db-query-left-col">'
    + '<div class="db-query-editor-col" style="position:relative"><textarea id="queryInput" class="db-query-input" spellcheck="false" placeholder="Enter SQL query here..." onkeydown="queryInputKeydown(event)" oninput="queryAutocomplete(event)" onblur="setTimeout(function(){hideAutocomplete()},200)" onscroll="positionACDrop()">' + esc(dbState.queryHistory[0] || '') + '</textarea><div id="acDropdown" class="db-ac-dropdown" style="display:none"></div></div>'
    + '<div id="queryResultsArea" class="db-query-results"><div class="db-query-welcome">Run a query to see results here<br><span class="db-meta">Ctrl+Enter or click Run</span></div></div>'
    + '</div>'
    + '<div class="db-query-presets-col"><div class="db-query-presets-label">Quick Presets</div><div id="queryPresetsList" class="db-query-presets-list"></div><select id="queryPresetsSelect" class="db-query-presets-select" onchange="runPresetSelect(this)"></select></div>'
    + '</div>'
    + '<div class="db-form-error" id="queryError"></div>';

  document.getElementById('dbQueryContent').innerHTML = html;
  renderPresets();

  setTimeout(function() {
    var ta = document.getElementById('queryInput');
    if (ta && !ta.value) ta.value = '';
    if (ta) ta.focus();
  }, 100);
}

/* ── Presets ── */
function renderPresets() {
  dbState.queryPresets.forEach(function(p, i) { p._idx = i; });
  renderPresetsAccordion();
  renderPresetsSelect();
}

function renderPresetsAccordion() {
  var el = document.getElementById('queryPresetsList');
  if (!el) return;
  if (!dbState.queryPresets.length) { el.innerHTML = ''; return; }
  var cats = {}; var order = [];
  dbState.queryPresets.forEach(function(p) {
    if (!cats[p.category]) { cats[p.category] = []; order.push(p.category); }
    cats[p.category].push(p);
  });
  var html = '';
  order.forEach(function(cat) {
    html += '<div class="db-query-preset-cat"><div class="db-query-preset-cat-title open" onclick="togglePresetCat(this)">' + esc(cat) + ' <span class="db-query-preset-toggle">▾</span></div><div class="db-query-preset-items" style="display:block">';
    cats[cat].forEach(function(p) {
      html += '<div class="db-query-preset-item" onclick="runPreset(' + p._idx + ')" title="' + esc(p.description || p.label) + '">' + esc(p.label) + '</div>';
    });
    html += '</div></div>';
  });
  el.innerHTML = html;
}

function renderPresetsSelect() {
  var sel = document.getElementById('queryPresetsSelect');
  if (!sel) return;
  if (!dbState.queryPresets.length) { sel.innerHTML = '<option value="">No presets</option>'; return; }
  var cats = {}; var order = [];
  dbState.queryPresets.forEach(function(p) {
    if (!cats[p.category]) { cats[p.category] = []; order.push(p.category); }
    cats[p.category].push(p);
  });
  var html = '<option value="">Select a preset...</option>';
  order.forEach(function(cat) {
    html += '<optgroup label="' + esc(cat) + '">';
    cats[cat].forEach(function(p) {
      html += '<option value="' + p._idx + '">' + esc(p.label) + '</option>';
    });
    html += '</optgroup>';
  });
  sel.innerHTML = html;
}

function runPresetSelect(sel) {
  var idx = parseInt(sel.value);
  if (isNaN(idx)) return;
  runPreset(idx);
  sel.value = '';
}

function togglePresetCat(el) {
  var isOpen = el.classList.toggle('open');
  var items = el.nextElementSibling;
  if (items) items.style.display = isOpen ? 'block' : 'none';
  el.querySelector('.db-query-preset-toggle').textContent = isOpen ? '▾' : '▸';
}

function runPreset(idx) {
  var p = dbState.queryPresets[idx];
  if (!p) return;
  var ta = document.getElementById('queryInput');
  if (!ta) return;
  ta.value = p.sql;
  ta.focus();
  ta.selectionStart = 0;
  ta.selectionEnd = p.sql.length;
  hideAutocomplete();
}

function clearQuery() {
  var ta = document.getElementById('queryInput');
  if (ta) { ta.value = ''; ta.focus(); }
  var ra = document.getElementById('queryResultsArea');
  if (ra) ra.innerHTML = '<div class="db-query-welcome">Run a query to see results here<br><span class="db-meta">Ctrl+Enter or click Run</span></div>';
  document.getElementById('queryError').style.display = 'none';
  hideAutocomplete();
}

/* ── CSV Import ── */
function showCSVImport() {
  var input = document.getElementById('csvFileInput');
  if (!input) {
    input = document.createElement('input');
    input.id = 'csvFileInput';
    input.type = 'file';
    input.accept = '.csv';
    input.style.display = 'none';
    input.addEventListener('change', handleCSVFile);
    document.body.appendChild(input);
  }
  input.value = '';
  input.click();
}

var csvImportPendingContent = '';
async function handleCSVFile(e) {
  var file = e.target.files[0];
  if (!file) return;
  var content = await file.text();
  if (!content.trim()) { dbToast('CSV file is empty', 'warning'); return; }
  csvImportPendingContent = content;
  var tableName = file.name.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  if (!tableName) tableName = 'imported_data';
  if (!isValidIdent(tableName)) tableName = 'imported_data';
  var dbName = dbState.queryDb || (dbState.databases.length ? dbState.databases[0].name : '');
  var html = '<h3>Import CSV</h3>'
    + '<div class="n-form-group"><label>Database</label><select id="csvDbSelect" class="db-form-input">'
    + dbState.databases.map(function(d) { return '<option value="' + esc(d.name) + '" ' + (d.name === dbName ? 'selected' : '') + '>' + esc(d.name) + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="n-form-group"><label>Table Name</label><input id="csvTableName" class="db-form-input" value="' + esc(tableName) + '"></div>'
    + '<div class="n-form-group"><label>Schema</label><input id="csvSchema" class="db-form-input" value="public"></div>'
    + '<div class="n-form-group"><label>Rows detected: <strong>' + (content.trim().split('\n').length - 1) + '</strong></label></div>'
    + '<div class="n-form-group"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="csvCreateTable" checked> Create table automatically (based on column types)</label></div>'
    + '<div class="db-form-error" id="csvImportError"></div>'
    + '<div id="csvImportProgress" style="display:none"><div class="db-loading"></div></div>'
    + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button><button class="fm-btn fm-btn-primary" onclick="runCSVImport()">Import</button></div>';
  showDBModal(html);
}

async function runCSVImport() {
  var dbName = document.getElementById('csvDbSelect').value;
  var tableName = document.getElementById('csvTableName').value.trim();
  var schema = document.getElementById('csvSchema').value.trim() || 'public';
  var createTable = document.getElementById('csvCreateTable').checked;
  var content = csvImportPendingContent;
  var errEl = document.getElementById('csvImportError');
  var progEl = document.getElementById('csvImportProgress');

  if (!tableName) { errEl.textContent = 'Table name is required'; errEl.style.display = 'block'; return; }
  if (!isValidIdent(tableName)) { errEl.textContent = identError(tableName); errEl.style.display = 'block'; return; }

  errEl.style.display = 'none';
  progEl.style.display = 'block';
  progEl.innerHTML = '<div class="db-loading">Importing...</div>';

  try {
    var lines = content.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV must have header and data rows');
    var header = parseCSVLineLocal(lines[0]);
    var dataLines = [];
    for (var i = 1; i < lines.length; i++) {
      var row = parseCSVLineLocal(lines[i]);
      if (row.length === header.length && row.some(function(c) { return c.trim(); })) dataLines.push(row);
    }
    if (!dataLines.length) throw new Error('No data rows found');
    if (createTable) {
      var colError = '';
      var columns = header.map(function(colName) {
        if (!isValidIdent(colName) && !colError) colError = identError(colName);
        var vals = dataLines.map(function(r) { return r[header.indexOf(colName)]; });
        return { name: colName, type: detectCSVType(vals), nullable: true, primaryKey: false };
      });
      if (colError) throw new Error(colError);
      await API.databases.createTable(dbName, { schema, name: tableName, columns });
    }
    progEl.innerHTML = '<div class="db-loading">Importing ' + dataLines.length + ' rows...</div>';
    var result = await API.databases.importTable(dbName, schema, tableName, 'csv', content);
    closeDBModal();
    dbToast('CSV imported into ' + schema + '.' + tableName + ' (' + (result.rowsImported || dataLines.length) + ' rows)', 'success');
    var ta = document.getElementById('queryInput');
    if (ta) {
      ta.value = 'SELECT * FROM ' + quoteIdent(schema) + '.' + quoteIdent(tableName) + ' LIMIT 100;';
      ta.focus();
    }
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
    progEl.style.display = 'none';
  }
}

function parseCSVLineLocal(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function detectCSVType(vals) {
  var hasDecimal = false;
  var allNumeric = true;
  var allBool = true;
  var maxLen = 0;
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i].trim();
    if (v === '' || v === 'NULL' || v === 'null') continue;
    maxLen = Math.max(maxLen, v.length);
    if (v === 'TRUE' || v === 'true' || v === 't' || v === 'FALSE' || v === 'false' || v === 'f') continue;
    allBool = false;
    if (isNaN(parseFloat(v)) || !isFinite(v)) { allNumeric = false; }
    else if (v.indexOf('.') >= 0) hasDecimal = true;
  }
  if (!maxLen) return 'TEXT';
  if (allBool) return 'BOOLEAN';
  if (allNumeric && hasDecimal) return 'NUMERIC';
  if (allNumeric && !hasDecimal) {
    if (maxLen > 9) return 'BIGINT';
    return 'INTEGER';
  }
  if (maxLen > 255) return 'TEXT';
  return 'VARCHAR(255)';
}

/* ── SQL Helpers ── */
function quoteIdent(id) { return '"' + String(id).replace(/"/g, '""') + '"'; }
function quoteLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

/* ── Autocomplete ── */
var acMirror = null;

function getACMirror() {
  if (!acMirror) {
    acMirror = document.createElement('div');
    acMirror.className = 'db-ac-mirror';
    document.body.appendChild(acMirror);
  }
  return acMirror;
}

function queryAutocomplete(e) {
  var ta = e.target;
  var pos = ta.selectionStart;
  var text = ta.value;
  var before = text.substring(0, pos);
  var match = before.match(/(\w+)$/);
  if (!match) { hideAutocomplete(); return; }
  var partial = match[1].toUpperCase();
  if (partial.length < 2) { hideAutocomplete(); return; }

  var lowerPartial = partial.toLowerCase();
  var kwSuggestions = SQL_KEYWORDS.filter(function(kw) { return kw.startsWith(lowerPartial.toUpperCase()) && kw !== lowerPartial.toUpperCase(); });
  var scSuggestions = (dbState.schemaCache || []).filter(function(s) { return s.toLowerCase().indexOf(lowerPartial) === 0 && s.toLowerCase() !== lowerPartial; });
  var suggestions = kwSuggestions.concat(scSuggestions);
  var deduped = suggestions.filter(function(v, i, a) { return a.indexOf(v) === i; }).slice(0, 10);
  if (!deduped.length) { hideAutocomplete(); return; }

  dbState.acIndex = -1;
  var drop = document.getElementById('acDropdown');
  if (!drop) return;
  var html = deduped.map(function(s, i) {
    return '<div class="db-ac-item" data-idx="' + i + '" onmousedown="acSelect(\'' + s.replace(/'/g, '\\\'') + '\')">' + s + '</div>';
  }).join('');
  drop.innerHTML = html;
  drop.style.display = 'block';
  positionACDrop(ta, pos);
}

function hideAutocomplete() {
  var drop = document.getElementById('acDropdown');
  if (drop) drop.style.display = 'none';
  dbState.acIndex = -1;
  if (acMirror && acMirror.parentNode) acMirror.parentNode.removeChild(acMirror);
  acMirror = null;
}

function positionACDrop(ta, pos) {
  var drop = document.getElementById('acDropdown');
  if (!drop || drop.style.display === 'none') return;
  if (!ta) ta = document.getElementById('queryInput');
  if (!ta) return;

  // Measure cursor position using a mirror element
  var mirror = getACMirror();
  var text = ta.value;
  var before = text.substring(0, pos != null ? pos : ta.selectionStart);
  var after = text.substring(pos != null ? pos : ta.selectionStart);

  // Get computed styles from textarea
  var cs = getComputedStyle(ta);
  mirror.style.cssText = 'position:absolute;top:-9999px;left:-9999px;white-space:pre-wrap;word-wrap:break-word;overflow:hidden;visibility:hidden;z-index:-1;';
  mirror.style.fontFamily = cs.fontFamily;
  mirror.style.fontSize = cs.fontSize;
  mirror.style.fontWeight = cs.fontWeight;
  mirror.style.fontStyle = cs.fontStyle;
  mirror.style.letterSpacing = cs.letterSpacing;
  mirror.style.lineHeight = cs.lineHeight;
  mirror.style.padding = cs.padding;
  mirror.style.border = cs.border;
  mirror.style.width = ta.offsetWidth + 'px';

  // Build mirror content: text up to cursor, then a marker span
  var beforeEscaped = before.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  mirror.innerHTML = beforeEscaped + '<span id="acCaret">|</span>';

  var caretSpan = mirror.querySelector('#acCaret');
  var caretLeft = 0, caretTop = 0;
  if (caretSpan) {
    caretLeft = caretSpan.offsetLeft;
    caretTop = caretSpan.offsetTop;
  }

  // Account for textarea scroll and textarea offset within parent
  caretTop -= ta.scrollTop;

  var dropWidth = Math.max(200, Math.min(ta.offsetWidth - 4, 350));
  drop.style.width = dropWidth + 'px';
  drop.style.left = (ta.offsetLeft + Math.min(caretLeft, ta.offsetWidth - dropWidth)) + 'px';
  drop.style.top = (ta.offsetTop + caretTop + 22) + 'px'; // 22px ~ line height
}

function acSelect(word) {
  var ta = document.getElementById('queryInput');
  if (!ta) return;
  var pos = ta.selectionStart;
  var text = ta.value;
  var before = text.substring(0, pos);
  var after = text.substring(pos);
  var match = before.match(/(\w+)$/);
  if (!match) return;
  var start = pos - match[1].length;
  ta.value = before.substring(0, start) + word + after;
  ta.selectionStart = ta.selectionEnd = start + word.length;
  ta.focus();
  hideAutocomplete();
}

function queryInputKeydown(e) {
  // Autocomplete navigation
  var drop = document.getElementById('acDropdown');
  var acVisible = drop && drop.style.display === 'block';
  if (acVisible) {
    var items = drop.querySelectorAll('.db-ac-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      dbState.acIndex = Math.min(dbState.acIndex + 1, items.length - 1);
      items.forEach(function(el, i) { el.classList.toggle('ac-active', i === dbState.acIndex); });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      dbState.acIndex = Math.max(dbState.acIndex - 1, 0);
      items.forEach(function(el, i) { el.classList.toggle('ac-active', i === dbState.acIndex); });
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (dbState.acIndex >= 0 && items[dbState.acIndex]) {
        e.preventDefault();
        items[dbState.acIndex].click();
        return;
      }
    }
    if (e.key === 'Escape') { hideAutocomplete(); e.preventDefault(); return; }
  }

  // Ctrl/Cmd+Enter to run
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); executeQuery(); return; }

  // History navigation (only when autocomplete is hidden)
  if (e.key === 'ArrowUp' && dbState.queryHistory.length && !acVisible) {
    e.preventDefault();
    dbState.queryHistoryIdx = Math.min(dbState.queryHistoryIdx + 1, dbState.queryHistory.length - 1);
    var ta = document.getElementById('queryInput');
    if (ta) ta.value = dbState.queryHistory[dbState.queryHistory.length - 1 - dbState.queryHistoryIdx] || '';
    return;
  }
  if (e.key === 'ArrowDown' && dbState.queryHistoryIdx >= 0 && !acVisible) {
    e.preventDefault();
    dbState.queryHistoryIdx--;
    var ta = document.getElementById('queryInput');
    if (dbState.queryHistoryIdx < 0) { ta.value = ''; dbState.queryHistoryIdx = -1; }
    else { ta.value = dbState.queryHistory[dbState.queryHistory.length - 1 - dbState.queryHistoryIdx] || ''; }
    return;
  }
}

function showQueryHistory() {
  if (!dbState.queryHistory.length) return dbToast('No query history');
  var html = '<h3>Query History</h3><div style="max-height:300px;overflow-y:auto">';
  dbState.queryHistory.slice(-20).reverse().forEach(function(q) {
    html += '<div class="db-query-history-item" onclick="document.getElementById(\'queryInput\').value=this.textContent;closeDBModal();executeQuery()"><code>' + esc(q.length > 120 ? q.substring(0, 120) + '...' : q) + '</code></div>';
  });
  html += '</div><div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Close</button><button class="fm-btn fm-btn-primary" onclick="dbState.queryHistory=[];closeDBModal();dbToast(\'History cleared\')">Clear History</button></div>';
  document.getElementById('dbModalContent').innerHTML = html;
  document.getElementById('dbModal').style.display = 'flex';
}

async function runExplainAnalyze() {
  var ta = document.getElementById('queryInput');
  if (!ta) return;
  var query = ta.value.trim();
  if (!query) return;
  var upper = query.toUpperCase().trimStart();
  if (upper.startsWith('EXPLAIN')) {
    dbToast('Query already starts with EXPLAIN', 'warning');
    return;
  }
  var explainQuery = 'EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON) ' + query;
  var errorEl = document.getElementById('queryError');
  if (errorEl) errorEl.style.display = 'none';
  var ra = document.getElementById('queryResultsArea');
  if (ra) ra.innerHTML = '<div class="db-query-loading">⏳ Explaining...</div>';
  hideAutocomplete();
  try {
    var result = await API.databases.queryRun(dbState.queryDb, explainQuery);
    if (ra) renderExplainPlan(ra, result);
  } catch (e) {
    if (ra) ra.innerHTML = '<div class="db-query-error"><span class="db-query-error-icon">✕</span>' + esc(e.message) + '</div>';
    if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = 'block'; }
  }
}

function renderExplainPlan(container, result) {
  if (!result.rows || !result.rows.length || !result.rows[0]['QUERY PLAN']) {
    container.innerHTML = '<div class="db-query-error">No EXPLAIN plan returned</div>';
    return;
  }
  var plan;
  try {
    plan = JSON.parse(result.rows[0]['QUERY PLAN']);
  } catch (e) {
    container.innerHTML = '<div class="db-query-error">Failed to parse plan JSON</div>';
    return;
  }
  var root = Array.isArray(plan) ? plan[0].Plan : plan.Plan;
  if (!root) { container.innerHTML = '<div class="db-query-error">No plan node found</div>'; return; }
  var totalTime = root['Actual Total Time'] || root['Total Cost'] || 1;
  var html = '<div class="db-query-status">EXPLAIN ANALYZE plan <span class="db-meta">· total time ' + (root['Actual Total Time'] || '—') + 'ms</span></div>';
  html += '<div class="db-explain-tree">' + renderExplainNode(root, 0, totalTime) + '</div>';
  container.innerHTML = html;
  container.querySelectorAll('.db-explain-toggle').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var node = this.closest('.db-explain-node');
      node.classList.toggle('collapsed');
      this.textContent = node.classList.contains('collapsed') ? '▶' : '▼';
    });
  });
}

function renderExplainNode(node, depth, totalTime) {
  var nodeType = node['Node Type'] || 'Node';
  var actualTime = node['Actual Total Time'];
  var actualRows = node['Actual Rows'];
  var estRows = node['Plan Rows'];
  var cost = node['Total Cost'];
  var pct = actualTime != null && totalTime ? (actualTime / totalTime * 100) : null;
  var cls = 'db-explain-node';
  if (pct != null) {
    if (pct > 50) cls += ' db-explain-expensive';
    else if (pct > 20) cls += ' db-explain-moderate';
  }
  var hasChildren = node.Plans && node.Plans.length;
  var html = '<div class="' + cls + '" style="padding-left:' + (depth * 20) + 'px">';
  html += '<div class="db-explain-header">';
  if (hasChildren) html += '<span class="db-explain-toggle">▼</span>';
  html += '<span class="db-explain-type">' + esc(nodeType) + '</span>';
  if (actualTime != null) html += ' <span class="db-explain-metric">' + actualTime.toFixed(2) + 'ms</span>';
  if (pct != null) html += ' <span class="db-explain-pct">' + pct.toFixed(1) + '%</span>';
  if (actualRows != null) html += ' <span class="db-explain-metric">rows: ' + actualRows + '</span>';
  if (estRows != null) html += ' <span class="db-explain-metric">est: ' + estRows + '</span>';
  if (cost != null) html += ' <span class="db-explain-metric">cost: ' + cost.toFixed(2) + '</span>';
  if (node['Index Name']) html += ' <span class="db-explain-metric">idx: ' + esc(node['Index Name']) + '</span>';
  if (node['Relation Name']) html += ' <span class="db-explain-metric">on: ' + esc(node['Relation Name']) + '</span>';
  if (node['Filter']) html += ' <span class="db-explain-metric">filter: ' + esc(node['Filter']) + '</span>';
  html += '</div>';
  if (hasChildren) {
    html += '<div class="db-explain-children">';
    node.Plans.forEach(function(child) { html += renderExplainNode(child, depth + 1, totalTime); });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

async function executeQuery() {
  var ta = document.getElementById('queryInput');
  if (!ta) return;
  var query = ta.value.trim();
  if (!query) return;

  var errorEl = document.getElementById('queryError');
  if (errorEl) errorEl.style.display = 'none';
  var ra = document.getElementById('queryResultsArea');
  if (ra) ra.innerHTML = '<div class="db-query-loading">⏳ Executing...</div>';

  hideAutocomplete();

  // Add to history
  dbState.queryHistory.unshift(ta.value.trim());
  if (dbState.queryHistory.length > 50) dbState.queryHistory.pop();
  dbState.queryHistoryIdx = -1;

  try {
    var result = await API.databases.queryRun(dbState.queryDb, query);
    if (ra) renderQueryResults(ra, result);
  } catch (e) {
    if (ra) ra.innerHTML = '<div class="db-query-error"><span class="db-query-error-icon">✕</span>' + esc(e.message) + '</div>';
    if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = 'block'; }
  }
}

var dbLastQueryResult = null;

function renderQueryResults(container, result) {
  if (result.columns && result.columns.length) {
    dbLastQueryResult = result;
    var timeStr = result.executionTimeMs != null ? ' <span class="db-meta">· ' + result.executionTimeMs + 'ms</span>' : '';
    var html = '<div class="db-query-status">' + result.rowCount + ' row' + (result.rowCount !== 1 ? 's' : '') + ' returned' + timeStr
      + ' <span class="db-query-export-actions"><button class="db-btn db-btn-xs" onclick="dbExportQueryResult(\'csv\')">⬇ CSV</button>'
      + '<button class="db-btn db-btn-xs" onclick="dbExportQueryResult(\'json\')">⬇ JSON</button>'
      + '<button class="db-btn db-btn-xs" onclick="dbExportQueryResult(\'sql\')">⬇ SQL</button></span></div>'
      + '<div class="db-data-table-wrap"><table class="db-data-table"><thead><tr>';
    result.columns.forEach(function(col) { html += '<th>' + esc(col) + '</th>'; });
    html += '</tr></thead><tbody>';
    if (!result.rows || !result.rows.length) {
      html += '<tr><td colspan="' + result.columns.length + '" class="db-empty-row">0 rows</td></tr>';
    } else {
      result.rows.forEach(function(row) {
        html += '<tr>';
        result.columns.forEach(function(col) {
          var val = row[col];
          html += '<td>' + (val === null || val === undefined ? '<span class="db-null">NULL</span>' : esc(String(val))) + '</td>';
        });
        html += '</tr>';
      });
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } else {
    var icon = '✓';
    var cls = result.affectedRows !== undefined ? 'db-query-status db-query-status-mutate' : 'db-query-status db-query-status-success';
    var msg = result.message || result.command + ' completed';
    if (result.affectedRows !== undefined) msg = result.affectedRows + ' row' + (result.affectedRows !== 1 ? 's' : '') + ' affected';
    if (result.executionTimeMs != null) msg += ' <span class="db-meta">· ' + result.executionTimeMs + 'ms</span>';
    container.innerHTML = '<div class="' + cls + '"><span class="db-query-status-icon">' + icon + '</span> ' + esc(msg) + '</div>';
  }
}

async function dbExportQueryResult(format) {
  var result = dbLastQueryResult;
  if (!result || !result.rows || !result.rows.length) { dbToast('No results to export', 'warning'); return; }
  // Build CSV/JSON/SQL client-side from the result
  var cols = result.columns;
  var content, ext, mime;
  if (format === 'csv') {
    var header = cols.map(function(c) { return '"' + c.replace(/"/g, '""') + '"'; }).join(',');
    var data = result.rows.map(function(r) {
      return cols.map(function(c) {
        var v = r[c];
        if (v === null || v === undefined) return '';
        return '"' + String(v).replace(/"/g, '""') + '"';
      }).join(',');
    });
    content = [header].concat(data).join('\n');
    ext = 'csv'; mime = 'text/csv';
  } else if (format === 'json') {
    content = JSON.stringify(result.rows, null, 2);
    ext = 'json'; mime = 'application/json';
  } else {
    var lines = result.rows.map(function(r) {
      var vals = cols.map(function(c) {
        var v = r[c];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return String(v);
        return "'" + String(v).replace(/'/g, "''") + "'";
      }).join(', ');
      return 'INSERT INTO result (' + cols.join(', ') + ') VALUES (' + vals + ');';
    });
    content = '-- Query Result Export\n-- ' + new Date().toISOString() + '\n\n' + lines.join('\n');
    ext = 'sql'; mime = 'text/sql';
  }
  var blob = new Blob([content], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'query-result.' + ext;
  document.body.appendChild(a); a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

/* ═══════════════════════════════════════════════════
   Tier 3 Features
   ═══════════════════════════════════════════════════ */

/* ─── 3.1 FK Relation Designer ─── */
async function showFKRelationsModal() {
  var dbName = dbState.selDb ? dbState.selDb.name : dbState.queryDb;
  if (!dbName) return dbToast('No database selected', 'warning');
  document.getElementById('dbModalContent').innerHTML = '<div class="db-loading">Loading relations...</div>';
  document.getElementById('dbModal').style.display = 'flex';
  try {
    var fks = await API.databases.allForeignKeys(dbName);
    var html = '<h3>🔗 Foreign Key Relations — ' + esc(dbName) + '</h3>';
    if (!fks.length) {
      html += '<div class="db-meta" style="margin:20px 0">No foreign key relationships found in this database.</div>';
    } else {
      html += '<div style="max-height:400px;overflow:auto;margin:12px 0">';
      html += '<table class="db-fk-table"><thead><tr><th>Source Table</th><th>Column</th><th>→</th><th>Target Table</th><th>Target Column</th><th>On Update</th><th>On Delete</th></tr></thead><tbody>';
      fks.forEach(function(fk) {
        html += '<tr><td>' + esc(fk.table_schema + '.' + fk.table_name) + '</td>'
          + '<td>' + esc(fk.column_name) + '</td>'
          + '<td>→</td>'
          + '<td>' + esc(fk.foreign_schema + '.' + fk.foreign_table) + '</td>'
          + '<td>' + esc(fk.foreign_column) + '</td>'
          + '<td>' + esc(fk.update_rule) + '</td>'
          + '<td>' + esc(fk.delete_rule) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Close</button></div>';
    document.getElementById('dbModalContent').innerHTML = html;
  } catch (e) {
    document.getElementById('dbModalContent').innerHTML = '<div class="db-error">Failed to load relations: ' + esc(e.message) + '</div>';
  }
}

/* ─── 3.2 Privilege Editor ─── */
var privState = { currentDb: '', privileges: [] };

async function showPrivilegeEditor() {
  var dbName = dbState.selDb ? dbState.selDb.name : dbState.queryDb;
  if (!dbName) return dbToast('No database selected', 'warning');
  privState.currentDb = dbName;
  document.getElementById('dbModalContent').innerHTML = '<div class="db-loading">Loading privileges...</div>';
  document.getElementById('dbModal').style.display = 'flex';
  try {
    var data = await API.databases.privileges(dbName);
    privState.privileges = data.tables || [];
    renderPrivilegeEditor(data);
  } catch (e) {
    document.getElementById('dbModalContent').innerHTML = '<div class="db-error">Failed to load privileges: ' + esc(e.message) + '</div>';
  }
}

function renderPrivilegeEditor(data) {
  var html = '<h3>🔐 Privileges — ' + esc(privState.currentDb) + '</h3>';
  // Group privileges by table
  var tables = {};
  privState.privileges.forEach(function(p) {
    var key = p.schemaname + '.' + p.tablename;
    if (!tables[key]) tables[key] = [];
    tables[key].push(p);
  });

  html += '<div class="db-query-toolbar" style="margin:8px 0">';
  html += '<input id="privGranteeInput" class="db-form-input" placeholder="Grantee role name" style="width:160px">';
  html += '<select id="privSchemaSelect" class="db-form-input" style="width:auto">'
    + dbState.schemas.map(function(s) { return '<option value="' + esc(s.name) + '" ' + (s.name === 'public' ? 'selected' : '') + '>' + esc(s.name) + '</option>'; }).join('')
    + '</select>';
  html += '<input id="privTableInput" class="db-form-input" placeholder="Table name" style="width:140px">';
  html += '<select id="privTypeSelect" class="db-form-input" style="width:auto"><option>SELECT</option><option>INSERT</option><option>UPDATE</option><option>DELETE</option><option>ALL</option></select>';
  html += '<button class="db-btn db-btn-sm" onclick="doGrantPrivilege()">➕ Grant</button>';
  html += '<button class="db-btn db-btn-sm db-btn-danger" onclick="doRevokePrivilege()">✕ Revoke</button>';
  html += '</div>';

  if (Object.keys(tables).length) {
    html += '<div style="max-height:350px;overflow:auto">';
    Object.keys(tables).sort().forEach(function(key) {
      html += '<div class="db-config-section"><h4>' + esc(key) + '</h4>';
      html += '<table class="db-fk-table"><thead><tr><th>Grantee</th><th>Privilege</th><th>Grantable</th></tr></thead><tbody>';
      tables[key].forEach(function(p) {
        html += '<tr><td>' + esc(p.grantee) + '</td><td>' + esc(p.privilege_type) + '</td><td>' + (p.is_grantable === 'YES' ? '✅' : '—') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    });
    html += '</div>';
  } else {
    html += '<div class="db-meta" style="margin:12px 0">No table-level privileges found.</div>';
  }
  html += '<div class="db-form-error" id="dbModalError"></div>';
  html += '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Close</button></div>';
  document.getElementById('dbModalContent').innerHTML = html;
}

async function doGrantPrivilege() {
  var grantee = document.getElementById('privGranteeInput').value.trim();
  var schema = document.getElementById('privSchemaSelect').value;
  var table = document.getElementById('privTableInput').value.trim();
  var privilege = document.getElementById('privTypeSelect').value;
  if (!grantee || !table) return dbModalError('Grantee and table name required');
  try {
    await API.databases.grantPrivilege(privState.currentDb, { schema, table, privilege, grantee });
    dbToast('Privilege granted');
    var data = await API.databases.privileges(privState.currentDb);
    privState.privileges = data.tables || [];
    renderPrivilegeEditor(data);
  } catch (e) { dbModalError(e.message); }
}

async function doRevokePrivilege() {
  var grantee = document.getElementById('privGranteeInput').value.trim();
  var schema = document.getElementById('privSchemaSelect').value;
  var table = document.getElementById('privTableInput').value.trim();
  var privilege = document.getElementById('privTypeSelect').value;
  if (!grantee || !table) return dbModalError('Grantee and table name required');
  try {
    await API.databases.revokePrivilege(privState.currentDb, { schema, table, privilege, grantee });
    dbToast('Privilege revoked');
    var data = await API.databases.privileges(privState.currentDb);
    privState.privileges = data.tables || [];
    renderPrivilegeEditor(data);
  } catch (e) { dbModalError(e.message); }
}

/* ─── 3.3 Function / Procedure Browser ─── */
async function showFunctionsView() {
  if (!dbState.selDb) return dbToast('No database selected', 'warning');
  dbShowView('dbFunctionsView');
  document.getElementById('dbTitle').textContent = 'Functions — ' + dbState.selDb.name;
  document.getElementById('dbBreadcrumb').innerHTML = '<a href="#" onclick="showManage()">Databases</a> / <a href="#" onclick="showTablesView()">' + esc(dbState.selDb.name) + '</a> / Functions';
  dbNavigate('functions/' + encodeURIComponent(dbState.selDb.name));
  renderFunctionsView();
}

async function renderFunctionsView() {
  var el = document.getElementById('dbFunctionsContent');
  el.innerHTML = '<div class="db-loading">Loading functions...</div>';
  try {
    var funcs = await API.databases.listFunctions(dbState.selDb.name);
    dbState.currentFunctions = funcs || [];
    var filter = (dbState.functionFilter || '').toLowerCase();
    var filtered = funcs.filter(function(f) {
      if (!filter) return true;
      var text = ((f.schema || '') + '.' + (f.name || '') + ' ' + (f.arguments || '')).toLowerCase();
      return text.indexOf(filter) !== -1;
    });
    var html = '<h3>📦 Stored Functions / Procedures</h3>';
    html += '<div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap;align-items:center">'
      + '<button class="db-btn" onclick="showTablesView()">← Back to tables</button>'
      + '<div class="db-search-bar" style="margin-left:auto"><span class="db-data-search-icon">🔍</span>'
      + '<input type="text" class="db-form-input db-search-input" placeholder="Filter functions..." value="' + esc(filter) + '" oninput="dbFilterFunctions(this.value)">'
      + '</div></div>';

    if (!filtered.length) {
      html += '<div class="db-meta">No functions or procedures found in this database.</div>';
    } else {
      html += '<div style="max-height:500px;overflow:auto">';
      html += '<table class="db-fk-table"><thead><tr><th>Schema</th><th>Name</th><th>Kind</th><th>Arguments</th><th>Result</th><th>Language</th><th></th></tr></thead><tbody>';
      filtered.forEach(function(f) {
        html += '<tr>'
          + '<td>' + esc(f.schema) + '</td>'
          + '<td><strong>' + esc(f.name) + '</strong></td>'
          + '<td>' + esc(f.kind) + '</td>'
          + '<td><code style="font-size:11px">' + esc(f.arguments) + '</code></td>'
          + '<td>' + esc(f.result_type) + '</td>'
          + '<td>' + esc(f.language) + '</td>'
          + '<td><button class="db-btn db-btn-xs" onclick="showFunctionDef(\'' + esc(f.schema) + '\',\'' + esc(f.name) + '\',\'' + esc(f.arguments.replace(/'/g, "\\'")) + '\')" title="View definition">📄</button>'
          + '<button class="db-btn db-btn-xs db-btn-danger" onclick="dbDropFunction(\'' + esc(f.schema) + '\',\'' + esc(f.name) + '\',\'' + esc(f.arguments.replace(/'/g, "\\'")) + '\')" title="Drop">✕</button></td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
    }
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="db-error">Failed to load functions: ' + esc(e.message) + '</div>';
  }
}

window.dbFilterFunctions = function(value) {
  dbState.functionFilter = value;
  renderFunctionsView();
};

async function showFunctionDef(schema, name, args) {
  try {
    var def = await API.databases.functionDefinition(dbState.selDb.name, schema, name, args);
    if (!def) return dbToast('Definition not found', 'error');
    var html = '<h3>Definition: ' + esc(schema + '.' + name) + '</h3>'
      + '<pre style="background:var(--bg2);padding:16px;border-radius:6px;overflow:auto;max-height:400px;font-size:12px;line-height:1.5;white-space:pre-wrap">' + esc(def.definition) + '</pre>'
      + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Close</button></div>';
    document.getElementById('dbModalContent').innerHTML = html;
    document.getElementById('dbModal').style.display = 'flex';
  } catch (e) {
    dbToast('Failed to load definition: ' + e.message, 'error');
  }
}

async function dbDropFunction(schema, name, args) {
  showConfirmModal('Drop function ' + esc(schema + '.' + name) + '?', name, async function() {
    try {
      await API.databases.dropFunction(dbState.selDb.name, schema, name, args);
      dbToast('Function dropped');
      await renderFunctionsView();
    } catch (e) { dbToast(e.message, 'error'); }
  });
}

/* ─── 3.4 SQL Dump ─── */
async function dumpDatabase() {
  var name = dbState.selDb ? dbState.selDb.name : dbState.queryDb;
  if (!name) return dbToast('No database selected', 'warning');
  // Ask format via modal
  var html = '<h3>🗄 Download Database Dump — ' + esc(name) + '</h3>'
    + '<p style="margin-bottom:16px;color:var(--text-secondary)">Choose what to include in the export:</p>'
    + '<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">'
    + '<button class="db-btn db-btn-primary" onclick="doDump(\'full\')" style="text-align:left;padding:12px">📦 Full (DDL + Data)<br><span style="font-size:11px;color:var(--text-secondary)">Table definitions, indexes, comments, and all row data</span></button>'
    + '<button class="db-btn" onclick="doDump(\'schema\')" style="text-align:left;padding:12px">📋 Schema Only<br><span style="font-size:11px;color:var(--text-secondary)">Table definitions, indexes, and comments only</span></button>'
    + '<button class="db-btn" onclick="doDump(\'data\')" style="text-align:left;padding:12px">📊 Data Only<br><span style="font-size:11px;color:var(--text-secondary)">INSERT statements for all tables</span></button>'
    + '</div>'
    + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button></div>';
  document.getElementById('dbModalContent').innerHTML = html;
  document.getElementById('dbModal').style.display = 'flex';
  window.doDump = function(format) {
    var url = API.databases.dump(name, format);
    window.open(url, '_blank');
    closeDBModal();
    dbToast('Dump download started');
  };
}

/* ─── 3.5 Search Across All Tables ─── */
async function showSearchAll() {
  dbShowView('dbSearchView');
  document.getElementById('dbTitle').textContent = 'Search All Tables';
  document.getElementById('dbBreadcrumb').innerHTML = '<a href="#" onclick="renderCards()">Home</a> / Search All Tables';
  dbNavigate('search');
  renderSearchAll();
}

function renderSearchAll() {
  var dbOpts = dbState.databases.map(function(d) {
    return '<option value="' + esc(d.name) + '" ' + (d.name === (dbState.selDb ? dbState.selDb.name : dbState.queryDb) ? 'selected' : '') + '>' + esc(d.name) + '</option>';
  }).join('');
  var html = '<div class="db-query-toolbar">'
    + '<div class="db-query-db-select"><label>Database:</label><select id="searchDbSelect" class="db-form-input">' + dbOpts + '</select></div>'
    + '<div style="flex:1;min-width:200px;position:relative"><input id="searchAllInput" class="db-form-input" placeholder="Search term..." style="width:100%" onkeydown="if(event.key===\'Enter\')doSearchAll()"></div>'
    + '<button class="db-btn db-btn-primary" onclick="doSearchAll()">🔍 Search</button>'
    + '</div>'
    + '<div id="searchAllProgress" class="db-query-loading" style="display:none">⏳ Searching...</div>'
    + '<div id="searchAllResultsArea" class="db-query-results"><div class="db-query-welcome">Enter a search term and click Search to find it across all tables<br><span class="db-meta">Searches text columns (text, varchar, char, json, etc.)</span></div></div>';
  document.getElementById('dbSearchContent').innerHTML = html;
}

async function doSearchAll() {
  var dbName = document.getElementById('searchDbSelect').value;
  var term = document.getElementById('searchAllInput').value.trim();
  if (!term) return dbToast('Enter a search term', 'warning');
  document.getElementById('searchAllProgress').style.display = 'flex';
  var ra = document.getElementById('searchAllResultsArea');
  if (ra) ra.innerHTML = '';
  try {
    var results = await API.databases.searchAll(dbName, term);
    document.getElementById('searchAllProgress').style.display = 'none';
    var html = '<div class="db-query-status">' + results.length + ' column match(es) found for "' + esc(term) + '"</div>';
    if (!results.length) {
      html += '<div class="db-query-welcome">No matches found in any text column.</div>';
    } else {
      html += '<div style="max-height:500px;overflow:auto">';
      results.forEach(function(r) {
        html += '<div class="db-config-section" style="margin-bottom:8px">'
          + '<h4>' + esc(r.schema + '.' + r.table + '(' + r.column + ')') + ' <span class="db-meta">(' + r.total_matches + ' match(es))</span></h4>';
        r.rows.forEach(function(row) {
          var vals = Object.keys(row).map(function(k) {
            var v = row[k];
            if (v === null || v === undefined) return '<span class="db-null">NULL</span>';
            var s = String(v);
            // Highlight the search term
            var idx = s.toUpperCase().indexOf(term.toUpperCase());
            if (idx >= 0) {
              s = s.substring(0, idx) + '<strong style="background:rgba(255,200,0,0.3);color:var(--text)">' + s.substring(idx, idx + term.length) + '</strong>' + s.substring(idx + term.length);
            }
            if (s.length > 100) s = s.substring(0, 100) + '...';
            return esc(s);
          });
          html += '<div style="font-size:11px;padding:4px 8px;border-bottom:1px solid var(--border-color, #333);color:var(--text-secondary);word-break:break-all">' + vals.join(' | ') + '</div>';
        });
        html += '</div>';
      });
      html += '</div>';
    }
    ra.innerHTML = html;
  } catch (e) {
    document.getElementById('searchAllProgress').style.display = 'none';
    if (ra) ra.innerHTML = '<div class="db-query-error"><span class="db-query-error-icon">✕</span>' + esc(e.message) + '</div>';
  }
}

/* ─── 3.6 Bookmarkable Queries ─── */
async function saveBookmark() {
  var ta = document.getElementById('queryInput');
  if (!ta || !ta.value.trim()) return dbToast('No query to save', 'warning');
  var html = '<h3>💾 Save Query Bookmark</h3>'
    + '<div class="n-form-group"><label>Label</label><input id="bkLabel" class="db-form-input" placeholder="My Query"></div>'
    + '<div class="n-form-group"><label>SQL</label><textarea id="bkSql" class="db-form-input" rows="6" style="font-family:monospace;font-size:12px">' + esc(ta.value.trim()) + '</textarea></div>'
    + '<div class="db-form-error" id="dbModalError"></div>'
    + '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Cancel</button><button class="fm-btn fm-btn-primary" onclick="doSaveBookmark()">Save Bookmark</button></div>';
  document.getElementById('dbModalContent').innerHTML = html;
  document.getElementById('dbModal').style.display = 'flex';
  window.doSaveBookmark = async function() {
    var label = document.getElementById('bkLabel').value.trim();
    var sql = document.getElementById('bkSql').value.trim();
    if (!label) return dbModalError('Label required');
    if (!sql) return dbModalError('SQL required');
    try {
      var result = await API.databases.createBookmark({ database: dbState.queryDb || 'postgres', label, sql });
      closeDBModal();
      dbToast('Bookmark saved');
    } catch (e) { dbModalError(e.message); }
  };
}

async function loadBookmarks() {
  document.getElementById('dbModalContent').innerHTML = '<div class="db-loading">Loading bookmarks...</div>';
  document.getElementById('dbModal').style.display = 'flex';
  try {
    var bks = await API.databases.listBookmarks(dbState.queryDb || '');
    var html = '<h3>📑 Query Bookmarks</h3>';
    if (!bks.length) {
      html += '<div class="db-meta" style="margin:16px 0">No bookmarks saved yet. Run a query and click 💾 to save it.</div>';
    } else {
      html += '<div style="max-height:400px;overflow:auto">';
      bks.forEach(function(b) {
        html += '<div class="db-config-section" style="cursor:pointer" onclick="document.getElementById(\'queryInput\').value=this.querySelector(\'code\').textContent;closeDBModal();setTimeout(function(){executeQuery()},100)">'
          + '<div style="display:flex;justify-content:space-between;align-items:center">'
          + '<h4 style="margin:0">' + esc(b.label) + ' <span class="db-meta">(' + esc(b.database_name) + ')</span></h4>'
          + '<button class="db-btn db-btn-xs db-btn-danger" onclick="event.stopPropagation();doDeleteBookmark(' + b.id + ')" title="Delete bookmark">✕</button>'
          + '</div>'
          + '<code style="font-size:11px;color:var(--text-secondary);display:block;margin-top:4px">' + esc(b.sql.length > 100 ? b.sql.substring(0, 100) + '...' : b.sql) + '</code>'
          + '<div class="db-meta" style="margin-top:2px">' + new Date(b.created_at).toLocaleString() + '</div>'
          + '</div>';
      });
      html += '</div>';
    }
    html += '<div class="db-form-actions"><button class="fm-btn" onclick="closeDBModal()">Close</button></div>';
    document.getElementById('dbModalContent').innerHTML = html;
  } catch (e) {
    document.getElementById('dbModalContent').innerHTML = '<div class="db-error">Failed to load bookmarks: ' + esc(e.message) + '</div>';
  }
}

async function doDeleteBookmark(id) {
  showConfirmModal('Delete this bookmark?', 'yes', async function() {
    try {
      await API.databases.deleteBookmark(id);
      dbToast('Bookmark deleted');
      loadBookmarks();
    } catch (e) { dbToast(e.message, 'error'); }
  });
}

/* ─── Toast ─── */
var dbToastTimer;
function dbToast(msg, type) {
  var el = document.getElementById('dbToast');
  if (!el) return;
  el.textContent = msg; el.className = 'bk-toast ' + (type || 'success'); el.style.display = 'block';
  clearTimeout(dbToastTimer); dbToastTimer = setTimeout(function() { el.style.display = 'none'; }, 4000);
}

function formatBytes(b) { if(!b||b===0) return '0 B'; var k=1024,s=['B','KB','MB','GB','TB'],i=Math.floor(Math.log(b)/Math.log(k)); return parseFloat((b/Math.pow(k,i)).toFixed(2))+' '+s[i]; }

/* Close export dropdown when clicking outside */
document.addEventListener('click', function(e) {
  var groups = document.querySelectorAll('.db-export-group');
  for (var i = 0; i < groups.length; i++) {
    if (!groups[i].contains(e.target)) {
      var dd = groups[i].querySelector('.db-export-dropdown');
      if (dd) dd.classList.remove('open');
    }
  }
});
