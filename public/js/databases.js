var dbState = { databases: [], schemas: [], users: [], view: 'cards', selDb: null, selTable: null, tableEditor: { columns: [], original: [], changes: [] }, tableMode: 'data', dataPage: 1, dataPageSize: 25, dataSortBy: '', dataSortDir: '', dataSearch: '', pkColumns: [] };
var dbInit = false;

window.initDatabases = async function () {
  if (!dbInit) { dbInit = true; document.getElementById('dbRefreshBtn')?.addEventListener('click', refreshDB); document.getElementById('dbRetryBtn')?.addEventListener('click', refreshDB); }
  await loadDatabases();
};

async function refreshDB() { await loadDatabases(); }
function esc(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, function(c) { return '&#'+c.charCodeAt(0)+';'; }); }

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
  document.querySelectorAll('#dbCardsView, #dbConfView, #dbTablesView, #dbEditorView, #dbQueryView').forEach(function(el) { if(el) el.style.display = 'none'; });
  document.getElementById('dbCardsView').style.display = 'block';
  document.getElementById('dbSubViews').style.display = 'none';
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

function closeDBModal() { document.getElementById('dbModal').style.display = 'none'; }
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
  document.getElementById('dbCardsView').style.display = 'none';
  document.getElementById('dbSubViews').style.display = 'block';
  document.getElementById('dbConfView').style.display = 'none';
  document.getElementById('dbTablesView').style.display = 'none';
  document.getElementById('dbEditorView').style.display = 'none';
  renderManageList();
}

function renderManageList() {
  document.getElementById('dbManageList').style.display = '';
  document.getElementById('dbConfView').style.display = 'none';
  document.getElementById('dbTablesView').style.display = 'none';
  document.getElementById('dbEditorView').style.display = 'none';
  var el = document.getElementById('dbManageList');
  if (!dbState.databases.length) { el.innerHTML = '<div class="db-empty">No databases found.</div>'; return; }
  el.innerHTML = dbState.databases.map(function(d) {
    return '<div class="db-manage-card" onclick="selectDatabase(\'' + esc(d.name) + '\')">'
      + '<span class="db-manage-icon">🗄</span>'
      + '<div class="db-manage-info"><span class="db-manage-name">' + esc(d.name) + '</span>'
      + '<span class="db-manage-meta">' + (d.table_count||0) + ' tables · ' + (d.size_bytes ? formatBytes(d.size_bytes) : '—') + ' · ' + esc(d.owner||'') + '</span></div>'
      + '<span class="db-manage-arrow">→</span></div>';
  }).join('');
  document.getElementById('dbTitle').textContent = 'Manage Databases';
  document.getElementById('dbBreadcrumb').innerHTML = '<a href="#" onclick="showManage()">' + dbState.databases.length + ' databases</a>';
}

function selectDatabase(name) {
  dbState.selDb = dbState.databases.find(function(d) { return d.name === name; });
  if (!dbState.selDb) return;
  showTablesView();
}

/* ─── Database Config View ─── */
function renderConfView() {
  var d = dbState.selDb;
  document.getElementById('dbManageList').style.display = 'none';
  document.getElementById('dbTablesView').style.display = 'none';
  document.getElementById('dbEditorView').style.display = 'none';
  document.getElementById('dbConfView').style.display = 'block';
  var users = dbState.users.map(function(u) { return '<option value="' + esc(u.name) + '" ' + (u.name === d.owner ? 'selected' : '') + '>' + esc(u.name) + '</option>'; }).join('');
  document.getElementById('dbConfContent').innerHTML =
    '<h3>Configuration: ' + esc(d.name) + '</h3>'
    + '<div class="db-conf-grid">'
    + '<div class="n-form-group"><label>Owner</label><select id="dbConfOwner" class="db-form-input">' + users + '</select></div>'
    + '<div class="n-form-group"><label>Connection Limit</label><input id="dbConfLimit" class="db-form-input" type="number" value="-1"></div>'
    + '<div class="n-form-group"><label>Comment</label><input id="dbConfComment" class="db-form-input" placeholder="Database comment"></div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;margin:16px 0">'
    + '<button class="db-btn db-btn-primary" onclick="saveDBConfig()">💾 Save Configuration</button>'
    + '<button class="db-btn" onclick="showTablesView()">📋 View Tables</button>'
    + '<button class="db-btn db-btn-danger" onclick="dropDatabase()">🗑 Drop Database</button>'
    + '</div>'
    + '<div class="db-form-error" id="dbConfError"></div>'
    + '<div style="text-align:center;margin-top:8px"><a href="#" onclick="showManage()" style="color:var(--text3)">← Back to all databases</a></div>';
  document.getElementById('dbTitle').textContent = 'Database: ' + d.name;
  document.getElementById('dbBreadcrumb').innerHTML = '<a href="#" onclick="showManage()">Databases</a> / ' + esc(d.name);
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
  document.getElementById('dbManageList').style.display = 'none';
  document.getElementById('dbConfView').style.display = 'none';
  document.getElementById('dbEditorView').style.display = 'none';
  document.getElementById('dbTablesView').style.display = 'block';
  document.getElementById('dbTitle').textContent = 'Database: ' + dbState.selDb.name;
  document.getElementById('dbBreadcrumb').innerHTML = '<a href="#" onclick="showManage()">Databases</a> / ' + esc(dbState.selDb.name) + ' <a href="#" onclick="renderConfView()" style="font-size:11px;color:var(--accent-cyan);margin-left:8px">⚙ Config</a>';
  document.getElementById('dbTablesContent').innerHTML = '<div class="db-loading">Loading tables...</div>';
  try {
    var tables = await API.databases.tables(dbState.selDb.name);
    renderTables(tables);
  } catch (e) { document.getElementById('dbTablesContent').innerHTML = '<div class="db-error">Failed to load tables: ' + esc(e.message) + ' <a href="#" onclick="showTablesView()">Retry</a></div>'; }
}

function renderTables(tables) {
  var el = document.getElementById('dbTablesContent');
  if (!tables.length) {
    el.innerHTML = '<div class="db-empty">No tables yet. <a href="#" onclick="showCreateTable()">Create your first table</a></div>'
      + '<div style="text-align:center;margin-top:8px"><a href="#" onclick="showManage()" style="color:var(--text3)">← Back to databases</a></div>';
    return;
  }
  el.innerHTML = '<div style="margin-bottom:12px"><button class="db-btn db-btn-primary" onclick="showCreateTable()">+ Create Table</button></div>'
    + '<div class="db-manage-grid">' + tables.map(function(t) {
      return '<div class="db-manage-card" onclick="openTableEditor(\'' + esc(t.schemaname) + '\',\'' + esc(t.tablename) + '\')">'
        + '<span class="db-manage-icon">📄</span>'
        + '<div class="db-manage-info"><span class="db-manage-name">' + esc(t.schemaname) + '.' + esc(t.tablename) + '</span>'
        + '<span class="db-manage-meta">' + (t.row_count||0) + ' rows · ' + (t.size_formatted||'—') + '</span></div>'
        + '<span class="db-manage-arrow">→</span></div>';
    }).join('') + '</div>'
    + '<div style="text-align:center;margin-top:8px"><a href="#" onclick="showManage()" style="color:var(--text3)">← Back to databases</a></div>';
}

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
  var cols = [];
  document.querySelectorAll('.ct-col-row').forEach(function(r) {
    var cn = r.querySelector('.ct-col-name').value.trim();
    var ct = r.querySelector('.ct-col-type').value;
    var ck = r.querySelector('.ct-col-check').checked;
    var pk = r.querySelector('.ct-col-pk-check').checked;
    var def = r.querySelector('.ct-col-default').value.trim();
    if (cn) {
      var col = { name: cn, type: ct, nullable: ck, primaryKey: pk };
      if (def) col.default = def;
      cols.push(col);
    }
  });
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
  } catch (e) { dbToast(e.message, 'error'); }
}

function renderTableEditor() {
  document.getElementById('dbTablesView').style.display = 'none';
  document.getElementById('dbEditorView').style.display = 'block';
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
    renderTableEditor();
  }
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

  var exportUrl = API.databases.exportTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, 'sql');
  var html = '<div class="db-data-toolbar">'
    + '<div class="db-data-search"><span class="db-data-search-icon">🔍</span><input id="dbDataSearch" class="db-form-input db-data-search-input" placeholder="Search data..." value="' + esc(dbState.dataSearch) + '" oninput="dbSearchInput()"></div>'
    + '<div class="db-data-toolbar-actions">'
    + '<span class="db-export-group"><button class="db-btn db-btn-sm" onclick="this.parentElement.querySelector(\'.db-export-dropdown\').classList.toggle(\'open\')" title="Export">⬇ Export</button>'
    + '<div class="db-export-dropdown"><a href="' + API.databases.exportTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, 'csv') + '" class="db-export-option">CSV</a>'
    + '<a href="' + API.databases.exportTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, 'json') + '" class="db-export-option">JSON</a>'
    + '<a href="' + API.databases.exportTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, 'sql') + '" class="db-export-option">SQL</a></div></span>'
    + '<button class="db-btn db-btn-sm" onclick="dbAddRow()" title="Add Row">+ Row</button>'
    + '<button class="db-btn db-btn-sm" onclick="switchTableMode(\'config\')">⚙ Config</button>'
    + '<button class="db-btn" onclick="showTablesView()">← Tables</button></div></div>';

  html += '<div class="db-data-table-wrap"><table class="db-data-table" id="dbDataTable"><thead><tr>';
  data.columns.forEach(function(col) {
    var sortArrow = '';
    if (dbState.dataSortBy === col) sortArrow = dbState.dataSortDir === 'asc' ? ' ▲' : ' ▼';
    html += '<th class="db-data-th" onclick="dbSortBy(\'' + esc(col) + '\')" title="Sort by ' + esc(col) + '">' + esc(col) + sortArrow + '</th>';
  });
  html += '<th class="db-data-th-actions" style="width:60px">Actions</th>';
  html += '</tr></thead><tbody>';
  if (!data.rows.length) {
    html += '<tr><td colspan="' + (data.columns.length + 1) + '" class="db-empty-row">' + (dbState.dataSearch ? 'No matching rows' : '0 rows') + '</td></tr>';
  } else {
    data.rows.forEach(function(row, ri) {
      html += '<tr class="db-data-row" data-idx="' + ri + '">';
      data.columns.forEach(function(col) {
        var val = row[col];
        html += '<td class="db-data-cell" onclick="dbStartEdit(' + ri + ',\'' + esc(col) + '\',this)" title="Click to edit">'
          + (val === null || val === undefined ? '<span class="db-null">NULL</span>' : esc(String(val))) + '</td>';
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

function dbStartEdit(rowIdx, colName, td) {
  if (td.querySelector('input')) return;
  var row = dbState.tableEditor.data.rows[rowIdx];
  if (!row) return;
  var val = row[colName];
  var isNull = val === null || val === undefined;
  td.innerHTML = '<input class="db-inline-edit" type="text" value="' + esc(isNull ? '' : String(val)) + '" autocomplete="off">'
    + '<button class="db-btn db-btn-xs db-inline-save" onclick="dbSaveEdit(' + rowIdx + ',\'' + esc(colName) + '\',this.parentElement)">✔</button>'
    + '<button class="db-btn db-btn-xs db-inline-cancel" onclick="dbCancelEdit(' + rowIdx + ',\'' + esc(colName) + '\',this.parentElement)">✕</button>';
  var input = td.querySelector('input');
  input.focus();
  input.select();
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
  var input = td.querySelector('input');
  if (!input) return;
  var newVal = input.value;
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
    td.innerHTML = esc(String(newVal));
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
  var html = '';

  // Table comment & table-level actions
  html += '<div class="db-editor-table-actions">';
  html += '<div class="n-form-group" style="flex:1;min-width:200px"><label>Table Comment</label><input id="dbTableCommentInput" class="db-form-input" value="' + esc((meta && meta.table_comment) || '') + '" placeholder="Optional description"></div>';
  html += '<div class="db-editor-toolbar"><button class="db-btn db-btn-sm" onclick="saveTableComment()">💬 Set Comment</button>';
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
  return html;
}

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
  try {
    await API.databases.duplicateTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, name.trim());
    dbToast('Table duplicated as "' + name.trim() + '"');
    await showTablesView();
  } catch (e) { dbToast(e.message, 'error'); }
}

async function dbRenameTable() {
  var name = prompt('New table name (without schema):', dbState.selTable.name + '_new');
  if (!name || !name.trim()) return;
  try {
    await API.databases.renameTable(dbState.selDb.name, dbState.selTable.schema, dbState.selTable.name, name.trim());
    dbToast('Table renamed to "' + name.trim() + '"');
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

/* ─── SQL Query Terminal ─── */
dbState.queryHistory = [];
dbState.queryHistoryIdx = -1;
dbState.queryPresets = [];
dbState.queryDb = '';
dbState.acIndex = -1;
var queryRunTimer;

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
  document.getElementById('dbCardsView').style.display = 'none';
  document.getElementById('dbSubViews').style.display = 'block';
  document.getElementById('dbManageList').style.display = 'none';
  document.getElementById('dbConfView').style.display = 'none';
  document.getElementById('dbTablesView').style.display = 'none';
  document.getElementById('dbEditorView').style.display = 'none';
  document.getElementById('dbQueryView').style.display = 'block';
  document.getElementById('dbTitle').textContent = 'SQL Query Terminal';
  document.getElementById('dbBreadcrumb').innerHTML = 'Write & execute SQL queries';
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
    + '<div class="db-query-db-select"><label>Database:</label><select id="queryDbSelect" class="db-form-input" onchange="dbState.queryDb=this.value">' + dbOpts + '</select></div>'
    + '<div class="db-query-actions"><button class="db-btn db-btn-primary" id="queryRunBtn" onclick="executeQuery()">▶ Run</button><button class="db-btn" onclick="clearQuery()">Clear</button><button class="db-btn db-btn-icon" onclick="showQueryHistory()" title="History">📋</button></div>'
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

  var suggestions = SQL_KEYWORDS.filter(function(kw) { return kw.startsWith(partial) && kw !== partial; });
  if (!suggestions.length) { hideAutocomplete(); return; }

  dbState.acIndex = -1;
  var drop = document.getElementById('acDropdown');
  if (!drop) return;
  var html = suggestions.slice(0, 10).map(function(s, i) {
    return '<div class="db-ac-item" data-idx="' + i + '" onmousedown="acSelect(\'' + s + '\')">' + s + '</div>';
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
  dbState.queryHistory.unshift(query);
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

function renderQueryResults(container, result) {
  if (result.columns && result.columns.length) {
    var html = '<div class="db-query-status">' + result.rowCount + ' row' + (result.rowCount !== 1 ? 's' : '') + ' returned</div>'
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
    container.innerHTML = '<div class="' + cls + '"><span class="db-query-status-icon">' + icon + '</span> ' + esc(msg) + '</div>';
  }
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
