const API = {
  base: '/api',
  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(this.base + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async upload(path, files) {
    const form = new FormData();
    form.append('path', path);
    for (const file of files) form.append('files', file);
    const res = await fetch(this.base + '/files/upload', {
      method: 'POST', credentials: 'same-origin', body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
  getDownloadUrl(filePath) {
    return this.base + '/files/download?path=' + encodeURIComponent(filePath);
  },
  login(username, password) {
    return this.request('POST', '/auth/login', { username, password });
  },
  login2FA(tempToken, token) {
    return this.request('POST', '/auth/login/2fa', { tempToken, token });
  },
  logout() {
    return this.request('POST', '/auth/logout');
  },
  me() {
    return this.request('GET', '/auth/me');
  },
  getStats() {
    return this.request('GET', '/system/stats');
  },
  reboot() {
    return this.request('POST', '/system/reboot');
  },
  rebootStatus() {
    return this.request('GET', '/system/reboot-status');
  },
  emails: {
    list: () => API.request('GET', '/emails/list'),
    domains: () => API.request('GET', '/emails/domains'),
    create: (data) => API.request('POST', '/emails/create', data),
    inbox: (username, folder, page, limit) => {
      let p = '/emails/' + encodeURIComponent(username) + '/inbox';
      const params = [];
      if (folder) params.push('folder=' + encodeURIComponent(folder));
      if (page) params.push('page=' + page);
      if (limit) params.push('limit=' + limit);
      if (params.length) p += '?' + params.join('&');
      return API.request('GET', p);
    },
    message: (username, file, folder) => API.request('GET', '/emails/' + encodeURIComponent(username) + '/message/' + encodeURIComponent(file) + (folder ? '?folder=' + encodeURIComponent(folder) : '')),
    folders: (username) => API.request('GET', '/emails/' + encodeURIComponent(username) + '/folders'),
    send: (username, data) => API.request('POST', '/emails/' + encodeURIComponent(username) + '/send', data),
    move: (username, data) => API.request('POST', '/emails/' + encodeURIComponent(username) + '/move', data),
    delete: (username, data) => API.request('POST', '/emails/' + encodeURIComponent(username) + '/delete', data),
    quota: (username) => API.request('GET', '/emails/' + encodeURIComponent(username) + '/quota'),
  },
  databases: {
    users: () => API.request('GET', '/databases/users'),
    createUser: (data) => API.request('POST', '/databases/users', data),
    list: (owner) => API.request('GET', '/databases/list' + (owner ? '?owner=' + encodeURIComponent(owner) : '')),
    tables: (db) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/tables'),
    tableInfo: (db, schema, table) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/info'),
    tableData: (db, schema, table, params) => {
      var qs = '';
      if (params) {
        var parts = [];
        if (params.limit) parts.push('limit=' + params.limit);
        if (params.offset) parts.push('offset=' + params.offset);
        if (params.q) parts.push('q=' + encodeURIComponent(params.q));
        if (params.sortBy) parts.push('sortBy=' + encodeURIComponent(params.sortBy));
        if (params.sortDir) parts.push('sortDir=' + encodeURIComponent(params.sortDir));
        if (parts.length) qs = '?' + parts.join('&');
      }
      return API.request('GET', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/data' + qs);
    },
    insertRow: (db, schema, table, data) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/row', data),
    updateRow: (db, schema, table, pkCol, pkVal, data) => API.request('PUT', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/row/' + encodeURIComponent(pkCol) + '/' + encodeURIComponent(pkVal), data),
    deleteRow: (db, schema, table, pkCol, pkVal) => API.request('DELETE', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/row/' + encodeURIComponent(pkCol) + '/' + encodeURIComponent(pkVal)),
    schemas: (db) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/schemas'),
    extensions: (db) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/extensions'),
    create: (data) => API.request('POST', '/databases/create', data),
    updateConfig: (db, data) => API.request('PUT', '/databases/' + encodeURIComponent(db) + '/config', data),
    del: (db, confirm) => API.request('DELETE', '/databases/' + encodeURIComponent(db), { confirm }),
    createTable: (db, data) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/table', data),
    updateTable: (db, schema, table, data) => API.request('PUT', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table), data),
    dropTable: (db, schema, table, confirm) => API.request('DELETE', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table), { confirm }),
    duplicateTable: (db, schema, table, newName) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/duplicate', { newName }),
    renameTable: (db, schema, table, newName) => API.request('PUT', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/rename', { newName }),
    truncateTable: (db, schema, table) => API.request('DELETE', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/truncate'),
    vacuumTable: (db, schema, table) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/vacuum'),
    analyzeTable: (db, schema, table) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/analyze'),
    tableMetadata: (db, schema, table) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/metadata'),
    setTableComment: (db, schema, table, comment) => API.request('PUT', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/comment', { comment }),
    setColumnComment: (db, schema, table, column, comment) => API.request('PUT', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/column/' + encodeURIComponent(column) + '/comment', { comment }),
    getColumnOrder: (db, schema, table) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/column-order'),
    setColumnOrder: (db, schema, table, order) => API.request('PUT', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/column-order', { order }),
    exportTable: (db, schema, table, format) => '/api/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/export?format=' + encodeURIComponent(format),
    importTable: (db, schema, table, format, content) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/import', { format, content }),
    foreignKeys: (db, schema, table) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/foreign-keys'),
    listIndexes: (db, schema, table) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/indexes'),
    createIndex: (db, schema, table, data) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/index', data),
    dropIndex: (db, schema, indexName) => API.request('DELETE', '/databases/' + encodeURIComponent(db) + '/index/' + encodeURIComponent(schema) + '/' + encodeURIComponent(indexName)),
    deleteRows: (db, schema, table, pkCol, pkVals) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/rows/delete', { pkCol, pkVals }),
    views: (db, schema) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/views' + (schema ? '?schema=' + encodeURIComponent(schema) : '')),
    createView: (db, data) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/view', data),
    dropView: (db, schema, viewName) => API.request('DELETE', '/databases/' + encodeURIComponent(db) + '/view/' + encodeURIComponent(schema) + '/' + encodeURIComponent(viewName)),
    listMatViews: (db, schema) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/matviews' + (schema ? '?schema=' + encodeURIComponent(schema) : '')),
    createMatView: (db, data) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/matview', data),
    dropMatView: (db, schema, name) => API.request('DELETE', '/databases/' + encodeURIComponent(db) + '/matview/' + encodeURIComponent(schema) + '/' + encodeURIComponent(name)),
    refreshMatView: (db, schema, name) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/matview/' + encodeURIComponent(schema) + '/' + encodeURIComponent(name) + '/refresh'),
    connections: (db) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/connections'),
    killConnection: (db, pid) => API.request('DELETE', '/databases/' + encodeURIComponent(db) + '/connections/' + pid),
    exportQuery: (db, query, format) => API.base + '/databases/' + encodeURIComponent(db) + '/export-query?query=' + encodeURIComponent(query) + '&format=' + encodeURIComponent(format),
    query: (db, query) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/query', { query }),
    queryRun: (db, query) => API.request('POST', '/databases/query-run', { db, query }),
    queryPresets: () => API.request('GET', '/databases/query-presets'),
    /* Tier 3 */
    allForeignKeys: (db) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/foreign-keys'),
    privileges: (db) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/privileges'),
    grantPrivilege: (db, data) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/privileges/grant', data),
    revokePrivilege: (db, data) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/privileges/revoke', data),
    listFunctions: (db, schema) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/functions' + (schema ? '?schema=' + encodeURIComponent(schema) : '')),
    functionDefinition: (db, schema, name, args) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/functions/' + encodeURIComponent(schema) + '/' + encodeURIComponent(name) + '/definition' + (args ? '?args=' + encodeURIComponent(args) : '')),
    dropFunction: (db, schema, name, args) => API.request('DELETE', '/databases/' + encodeURIComponent(db) + '/functions/' + encodeURIComponent(schema) + '/' + encodeURIComponent(name) + (args ? '?args=' + encodeURIComponent(args) : '')),
    dump: (db, format) => API.base + '/databases/' + encodeURIComponent(db) + '/dump?format=' + encodeURIComponent(format),
    searchAll: (db, searchTerm, schema) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/search-all', { searchTerm, schema }),
    listBookmarks: (db) => API.request('GET', '/databases/bookmarks' + (db ? '?db=' + encodeURIComponent(db) : '')),
    createBookmark: (data) => API.request('POST', '/databases/bookmarks', data),
    deleteBookmark: (id) => API.request('DELETE', '/databases/bookmarks/' + id),
    listTriggers: (db, schema, table) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/triggers'),
    listAllTriggers: (db) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/triggers'),
    triggerDefinition: (db, schema, triggerName) => API.request('GET', '/databases/' + encodeURIComponent(db) + '/triggers/' + encodeURIComponent(schema) + '/' + encodeURIComponent(triggerName)),
    dropTriggerGlobal: (db, schema, triggerName) => API.request('DELETE', '/databases/' + encodeURIComponent(db) + '/triggers/' + encodeURIComponent(schema) + '/' + encodeURIComponent(triggerName)),
    createTrigger: (db, sql) => API.request('POST', '/databases/' + encodeURIComponent(db) + '/trigger', { sql }),
    dropTrigger: (db, schema, table, triggerName) => API.request('DELETE', '/databases/' + encodeURIComponent(db) + '/table/' + encodeURIComponent(schema) + '/' + encodeURIComponent(table) + '/trigger/' + encodeURIComponent(triggerName)),
  },
  docker: {
    containers: () => API.request('GET', '/docker/containers'),
    images: () => API.request('GET', '/docker/images'),
    info: () => API.request('GET', '/docker/info'),
    start: (id) => API.request('POST', '/docker/containers/' + encodeURIComponent(id) + '/start'),
    stop: (id) => API.request('POST', '/docker/containers/' + encodeURIComponent(id) + '/stop'),
    restart: (id) => API.request('POST', '/docker/containers/' + encodeURIComponent(id) + '/restart'),
    remove: (id) => API.request('DELETE', '/docker/containers/' + encodeURIComponent(id)),
    removeImage: (id) => API.request('DELETE', '/docker/images/' + encodeURIComponent(id)),
    logs: (id) => API.request('GET', '/docker/containers/' + encodeURIComponent(id) + '/logs'),
  },
  terminal: {
    presets: () => API.request('GET', '/terminal/presets'),
    addPreset: (label, cmd, category) => API.request('POST', '/terminal/presets', { label, cmd, category }),
    updatePreset: (id, label, cmd, category) => API.request('PUT', '/terminal/presets/' + encodeURIComponent(id), { label, cmd, category }),
    deletePreset: (id) => API.request('DELETE', '/terminal/presets/' + encodeURIComponent(id)),
  },
  ftp: {
    status: () => API.request('GET', '/ftp/status'),
    accounts: () => API.request('GET', '/ftp/accounts'),
    get: (username) => API.request('GET', '/ftp/accounts/' + encodeURIComponent(username)),
    create: (data) => API.request('POST', '/ftp/accounts/create', data),
    update: (username, data) => API.request('PUT', '/ftp/accounts/' + encodeURIComponent(username), data),
    del: (username) => API.request('DELETE', '/ftp/accounts/' + encodeURIComponent(username)),
    enable: (username) => API.request('POST', '/ftp/enable/' + encodeURIComponent(username)),
    disable: (username) => API.request('POST', '/ftp/disable/' + encodeURIComponent(username)),
    logs: (limit) => API.request('GET', '/ftp/logs?limit=' + (limit || 50)),
  },
  users: {
    list: () => API.request('GET', '/users/list'),
    get: (username) => API.request('GET', '/users/' + encodeURIComponent(username)),
    create: (data) => API.request('POST', '/users/create', data),
    update: (username, data) => API.request('PUT', '/users/' + encodeURIComponent(username), data),
    del: (username) => API.request('DELETE', '/users/' + encodeURIComponent(username)),
    options: () => API.request('GET', '/users/meta/options'),
  },
  file: {
    list: (p) => API.request('GET', '/files/list?path=' + encodeURIComponent(p)),
    read: (p) => API.request('GET', '/files/read?path=' + encodeURIComponent(p)),
    create: (d) => API.request('POST', '/files/create', d),
    rename: (d) => API.request('PUT', '/files/rename', d),
    del: (d) => API.request('DELETE', '/files/delete', d),
    copy: (d) => API.request('POST', '/files/copy', d),
    move: (d) => API.request('POST', '/files/move', d),
    copyto: (d) => API.request('POST', '/files/copyto', d),
    moveto: (d) => API.request('POST', '/files/moveto', d),
    duplicate: (d) => API.request('POST', '/files/duplicate', d),
    search: (q, p) => API.request('GET', '/files/search?query=' + encodeURIComponent(q) + '&path=' + encodeURIComponent(p || '/')),
    archive: (d) => API.request('POST', '/files/archive', d),
    extract: (d) => API.request('POST', '/files/extract', d),
    permissions: (d) => API.request('PUT', '/files/permissions', d),
    details: (p) => API.request('GET', '/files/details?path=' + encodeURIComponent(p)),
    gitStatus: (p) => API.request('GET', '/files/git/status?path=' + encodeURIComponent(p || '/')),
    gitStage: (p, f) => API.request('POST', '/files/git/stage', { path: p, file: f }),
    gitUnstage: (p, f) => API.request('POST', '/files/git/unstage', { path: p, file: f }),
    gitCommit: (p, msg) => API.request('POST', '/files/git/commit', { path: p, message: msg }),
    gitPush: (p) => API.request('POST', '/files/git/push', { path: p }),
    gitPull: (p) => API.request('POST', '/files/git/pull', { path: p }),
    upload: async (path, files) => {
      const form = new FormData();
      form.append('path', path);
      for (const file of files) {
        form.append('files', file);
      }
      const res = await fetch(this.base + '/files/upload', {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    },
  },
  domains: {
    list: () => API.request('GET', '/domains'),
    get: (name) => API.request('GET', '/domains/' + encodeURIComponent(name)),
    create: (data) => API.request('POST', '/domains/create', data),
    update: (name, data) => API.request('PUT', '/domains/' + encodeURIComponent(name), data),
    del: (name) => API.request('DELETE', '/domains/' + encodeURIComponent(name)),
    nginx: (name) => API.request('GET', '/domains/' + encodeURIComponent(name) + '/nginx'),
    saveNginx: (name, content) => API.request('PUT', '/domains/' + encodeURIComponent(name) + '/nginx', { content }),
    ssl: (name) => API.request('POST', '/domains/' + encodeURIComponent(name) + '/ssl'),
    parents: () => API.request('GET', '/domains/parents'),
    availablePort: () => API.request('GET', '/domains/ports/available'),
  },
  backups: {
    defs: () => API.request('GET', '/backups/defs'),
    start: (data) => API.request('POST', '/backups/start', data),
    status: (taskId) => API.request('GET', '/backups/status/' + taskId),
    current: () => API.request('GET', '/backups/current'),
    list: () => API.request('GET', '/backups/list'),
    get: (timestamp) => API.request('GET', '/backups/' + timestamp),
    downloadUrl: (timestamp) => API.base + '/backups/' + timestamp + '/download',
    downloadFileUrl: (timestamp, filename) => API.base + '/backups/' + timestamp + '/download/' + encodeURIComponent(filename),
    del: (timestamp) => API.request('DELETE', '/backups/' + timestamp),
    schedules: () => API.request('GET', '/backups/schedules'),
    createSchedule: (data) => API.request('POST', '/backups/schedules', data),
    toggleSchedule: (id, enabled) => API.request('PUT', '/backups/schedules/' + id + '/toggle', { enabled }),
    deleteSchedule: (id) => API.request('DELETE', '/backups/schedules/' + id),
  },
  virusscanner: {
    defsStatus: () => API.request('GET', '/virusscanner/status'),
    startScan: (target, path) => API.request('POST', '/virusscanner/scan', { target, path }),
    getScanStatus: (scanId) => API.request('GET', '/virusscanner/scan/' + scanId),
    getScanResults: (scanId) => API.request('GET', '/virusscanner/scan/' + scanId + '/results'),
    abortScan: (scanId) => API.request('POST', '/virusscanner/scan/' + scanId + '/abort'),
    quarantine: (scanId) => API.request('POST', '/virusscanner/scan/' + scanId + '/quarantine'),
    listQuarantine: () => API.request('GET', '/virusscanner/quarantine'),
    restoreQuarantine: (quarantineId, filePath) => API.request('POST', '/virusscanner/quarantine/' + quarantineId + '/restore', { filePath }),
    deleteQuarantine: (quarantineId, filePath) => API.request('DELETE', '/virusscanner/quarantine/' + quarantineId + '?path=' + encodeURIComponent(filePath)),
    updateDefs: () => API.request('POST', '/virusscanner/update-defs'),
  },
  mimetypes: {
    getSystem: () => API.request('GET', '/mimetypes/system'),
    list: () => API.request('GET', '/mimetypes'),
    get: (id) => API.request('GET', '/mimetypes/' + id),
    create: (data) => API.request('POST', '/mimetypes', data),
    update: (id, data) => API.request('PUT', '/mimetypes/' + id, data),
    del: (id) => API.request('DELETE', '/mimetypes/' + id),
  },
  audit: {
    list: (opts) => {
      var p = [];
      if (opts && opts.user) p.push('user=' + encodeURIComponent(opts.user));
      if (opts && opts.action) p.push('action=' + encodeURIComponent(opts.action));
      if (opts && opts.search) p.push('search=' + encodeURIComponent(opts.search));
      if (opts && opts.limit) p.push('limit=' + opts.limit);
      if (opts && opts.offset) p.push('offset=' + opts.offset);
      return API.request('GET', '/audit' + (p.length ? '?' + p.join('&') : ''));
    },
    actions: () => API.request('GET', '/audit/actions'),
    clear: () => API.request('DELETE', '/audit/clear'),
  },
  metrics: {
    current: () => API.request('GET', '/metrics/current'),
    history: (period) => API.request('GET', '/metrics/history?period=' + (period || '24h')),
  },
  services: {
    list: () => API.request('GET', '/services'),
    action: (name, act) => API.request('POST', '/services/' + encodeURIComponent(name) + '/' + act),
    status: (name) => API.request('GET', '/services/' + encodeURIComponent(name) + '/status'),
  },
  processes: {
    list: () => API.request('GET', '/processes'),
    kill: (pid) => API.request('POST', '/processes/kill/' + pid, { signal: '-15' }),
  },
  logs: {
    list: () => API.request('GET', '/logs'),
    read: (file, tail) => API.request('GET', '/logs/read/' + encodeURIComponent(file) + '?tail=' + (tail || 500)),
    search: (file, q) => API.request('GET', '/logs/search/' + encodeURIComponent(file) + '?q=' + encodeURIComponent(q)),
  },
  cron: {
    getOwners: () => API.request('GET', '/cron/owners'),
    list: (owner) => API.request('GET', '/cron/' + encodeURIComponent(owner)),
    add: (owner, entry) => API.request('POST', '/cron/' + encodeURIComponent(owner), entry),
    update: (owner, idx, entry) => API.request('PUT', '/cron/' + encodeURIComponent(owner) + '/' + idx, entry),
    del: (owner, idx) => API.request('DELETE', '/cron/' + encodeURIComponent(owner) + '/' + idx),
  },
  firewall: {
    list: () => API.request('GET', '/firewall'),
    addRule: (chain, rule) => API.request('POST', '/firewall/rule', { chain, rule }),
    deleteRule: (chain, num) => API.request('DELETE', '/firewall/rule/' + encodeURIComponent(chain) + '/' + num),
    save: () => API.request('POST', '/firewall/save'),
  },
  ssl: {
    list: () => API.request('GET', '/ssl'),
    issue: (domain, email) => API.request('POST', '/ssl/issue', { domain, email }),
    renew: (domain) => API.request('POST', '/ssl/renew/' + encodeURIComponent(domain)),
  },
  phpfpm: {
    list: () => API.request('GET', '/phpfpm'),
    status: () => API.request('GET', '/phpfpm/status'),
    restart: () => API.request('POST', '/phpfpm/restart'),
  },
  updates: {
    check: () => API.request('GET', '/updates'),
    apply: () => API.request('POST', '/updates/apply'),
    applySingle: (name) => API.request('POST', '/updates/apply/' + encodeURIComponent(name)),
    panelCheck: (force) => API.request('GET', '/updates/panel-check' + (force ? '?force=true' : '')),
    panelApply: () => API.request('POST', '/updates/panel-apply'),
  },
  settings: {
    get: () => API.request('GET', '/settings'),
    save: (data) => API.request('POST', '/settings', data),
  },
  notifications: {
    list: (unread) => API.request('GET', '/notifications' + (unread ? '?unread=1' : '')),
    markRead: (id) => API.request('POST', '/notifications/read/' + id),
    markAllRead: () => API.request('POST', '/notifications/read-all'),
    clear: () => API.request('DELETE', '/notifications'),
  },
  search(q) {
    return this.request('GET', '/search?q=' + encodeURIComponent(q));
  },
};

// For use as standalone: window.API.search = ...
