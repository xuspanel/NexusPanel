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
    containers: (all) => API.request('GET', '/docker/containers' + (all !== undefined ? '?all=' + all : '')),
    images: () => API.request('GET', '/docker/images'),
    info: () => API.request('GET', '/docker/info'),
    start: (id) => API.request('POST', '/docker/containers/' + encodeURIComponent(id) + '/start'),
    stop: (id) => API.request('POST', '/docker/containers/' + encodeURIComponent(id) + '/stop'),
    restart: (id) => API.request('POST', '/docker/containers/' + encodeURIComponent(id) + '/restart'),
    remove: (id) => API.request('DELETE', '/docker/containers/' + encodeURIComponent(id)),
    removeImage: (id) => API.request('DELETE', '/docker/images/' + encodeURIComponent(id)),
    logs: (id, tail) => API.request('GET', '/docker/containers/' + encodeURIComponent(id) + '/logs' + (tail ? '?tail=' + tail : '')),
    inspect: (id) => API.request('GET', '/docker/containers/' + encodeURIComponent(id) + '/inspect'),
    stats: (id) => API.request('GET', '/docker/containers/' + encodeURIComponent(id) + '/stats'),
    inspectImage: (id) => API.request('GET', '/docker/images/' + encodeURIComponent(id) + '/inspect'),
    imageHistory: (id) => API.request('GET', '/docker/images/' + encodeURIComponent(id) + '/history'),
    pull: (image) => API.request('POST', '/docker/images/pull', { image }),
    prune: (type) => API.request('POST', '/docker/prune', { type: type || 'all' }),
    createContainer: (config) => API.request('POST', '/docker/containers/create', config),
    networks: () => API.request('GET', '/docker/networks'),
    inspectNetwork: (id) => API.request('GET', '/docker/networks/' + encodeURIComponent(id)),
    removeNetwork: (id) => API.request('DELETE', '/docker/networks/' + encodeURIComponent(id)),
    composeProjects: () => API.request('GET', '/docker/compose/projects/list'),
    composeProject: (name) => API.request('GET', '/docker/compose/' + encodeURIComponent(name)),
    composeUp: (name) => API.request('POST', '/docker/compose/' + encodeURIComponent(name) + '/up'),
    composeDown: (name) => API.request('POST', '/docker/compose/' + encodeURIComponent(name) + '/down'),
    containerFs: (id, path) => API.request('GET', '/docker/containers/' + encodeURIComponent(id) + '/fs?path=' + encodeURIComponent(path || '/')),
    containerFsRead: (id, path) => API.request('GET', '/docker/containers/' + encodeURIComponent(id) + '/fs/read?path=' + encodeURIComponent(path || '/')),
  },
  terminal: {
    presets: () => API.request('GET', '/terminal/presets'),
    addPreset: (label, cmd, category) => API.request('POST', '/terminal/presets', { label, cmd, category }),
    updatePreset: (id, label, cmd, category) => API.request('PUT', '/terminal/presets/' + encodeURIComponent(id), { label, cmd, category }),
    deletePreset: (id) => API.request('DELETE', '/terminal/presets/' + encodeURIComponent(id)),
  },
  ftp: {
    status: () => API.request('GET', '/ftp/status'),
    accounts: (opts) => API.request('GET', '/ftp/accounts' + (opts ? '?' + new URLSearchParams(opts).toString() : '')),
    get: (username) => API.request('GET', '/ftp/accounts/' + encodeURIComponent(username)),
    create: (data) => API.request('POST', '/ftp/accounts', data),
    update: (username, data) => API.request('PUT', '/ftp/accounts/' + encodeURIComponent(username), data),
    del: (username) => API.request('DELETE', '/ftp/accounts/' + encodeURIComponent(username)),
    enable: (username) => API.request('POST', '/ftp/enable/' + encodeURIComponent(username)),
    disable: (username) => API.request('POST', '/ftp/disable/' + encodeURIComponent(username)),
    bulkEnable: (usernames) => API.request('POST', '/ftp/bulk/enable', { usernames }),
    bulkDisable: (usernames) => API.request('POST', '/ftp/bulk/disable', { usernames }),
    bulkDelete: (usernames) => API.request('POST', '/ftp/bulk/delete', { usernames }),
    serviceAction: (action) => API.request('POST', '/ftp/service/' + action),
    testConnection: (data) => API.request('POST', '/ftp/test', data),
    setQuota: (username, quota) => API.request('POST', '/ftp/quota/' + encodeURIComponent(username), { quota }),
    getQuota: (username) => API.request('GET', '/ftp/quota/' + encodeURIComponent(username)),
    getConfig: () => API.request('GET', '/ftp/config'),
    saveConfig: (content) => API.request('PUT', '/ftp/config', { content }),
    updateConfigValue: (key, value) => API.request('PUT', '/ftp/config/value', { key, value }),
    setPassivePorts: (minPort, maxPort) => API.request('PUT', '/ftp/passive-ports', { minPort, maxPort }),
    getSSL: () => API.request('GET', '/ftp/ssl'),
    generateSSL: (domain) => API.request('POST', '/ftp/ssl/generate', { domain }),
    logs: (limit) => API.request('GET', '/ftp/logs?limit=' + (limit || 50)),
    activity: (opts) => API.request('GET', '/ftp/activity' + (opts ? '?' + new URLSearchParams(opts).toString() : '')),
    bandwidth: () => API.request('GET', '/ftp/bandwidth'),
  },
  users: {
    list: (params) => API.request('GET', '/users/list' + (params ? '?' + new URLSearchParams(params).toString() : '')),
    get: (username) => API.request('GET', '/users/' + encodeURIComponent(username)),
    create: (data) => API.request('POST', '/users/create', data),
    update: (username, data) => API.request('PUT', '/users/' + encodeURIComponent(username), data),
    del: (username) => API.request('DELETE', '/users/' + encodeURIComponent(username)),
    options: () => API.request('GET', '/users/meta/options'),
    bulk: (action, usernames) => API.request('POST', '/users/bulk', { action, usernames }),
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
    diff: (d) => API.request('POST', '/files/diff', d),
    gitStatus: (p) => API.request('GET', '/files/git/status?path=' + encodeURIComponent(p || '/')),
    gitStage: (p, f) => API.request('POST', '/files/git/stage', { path: p, file: f }),
    gitUnstage: (p, f) => API.request('POST', '/files/git/unstage', { path: p, file: f }),
    gitCommit: (p, msg) => API.request('POST', '/files/git/commit', { path: p, message: msg }),
    gitPush: (p) => API.request('POST', '/files/git/push', { path: p }),
    gitPull: (p) => API.request('POST', '/files/git/pull', { path: p }),
    extractPreview: (d) => API.request('POST', '/files/extract-preview', d),
    checkConflicts: (d) => API.request('POST', '/files/check-conflicts', d),
    checkExtractConflicts: (d) => API.request('POST', '/files/check-extract-conflicts', d),
    getBin: () => API.request('GET', '/files/bin'),
    restoreBin: (d) => API.request('POST', '/files/bin/restore', d),
    permanentDeleteBin: (d) => API.request('DELETE', '/files/bin/permanent', d),
    emptyBin: () => API.request('DELETE', '/files/bin/empty'),
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
    list: (params) => {
      const qs = new URLSearchParams();
      if (params) {
        if (params.search) qs.set('search', params.search);
        if (params.sort) qs.set('sort', params.sort);
        if (params.dir) qs.set('dir', params.dir);
        if (params.page) qs.set('page', params.page);
        if (params.limit) qs.set('limit', params.limit);
      }
      const q = qs.toString();
      return API.request('GET', '/domains' + (q ? '?' + q : ''));
    },
    get: (name) => API.request('GET', '/domains/' + encodeURIComponent(name)),
    create: (data) => API.request('POST', '/domains/create', data),
    update: (name, data) => API.request('PUT', '/domains/' + encodeURIComponent(name), data),
    del: (name) => API.request('DELETE', '/domains/' + encodeURIComponent(name)),
    nginx: (name) => API.request('GET', '/domains/' + encodeURIComponent(name) + '/nginx'),
    saveNginx: (name, content) => API.request('PUT', '/domains/' + encodeURIComponent(name) + '/nginx', { content }),
    ssl: (name) => API.request('POST', '/domains/' + encodeURIComponent(name) + '/ssl'),
    parents: () => API.request('GET', '/domains/parents'),
    availablePort: () => API.request('GET', '/domains/ports/available'),
    bulkDelete: (names) => API.request('POST', '/domains/bulk/delete', { domains: names }),
  },
  backups: {
    defs: () => API.request('GET', '/backups/defs'),
    stats: () => API.request('GET', '/backups/stats'),
    start: (data) => API.request('POST', '/backups/start', data),
    cancel: (taskId) => API.request('POST', '/backups/' + taskId + '/cancel'),
    status: (taskId) => API.request('GET', '/backups/status/' + taskId),
    current: () => API.request('GET', '/backups/current'),
    list: (params) => {
      const qs = new URLSearchParams();
      if (params) {
        if (params.search) qs.set('search', params.search);
        if (params.sort) qs.set('sort', params.sort);
        if (params.dir) qs.set('dir', params.dir);
        if (params.page) qs.set('page', params.page);
        if (params.limit) qs.set('limit', params.limit);
        if (params.type) qs.set('type', params.type);
      }
      const q = qs.toString();
      return API.request('GET', '/backups/list' + (q ? '?' + q : ''));
    },
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
    getScanHistory: (params) => API.request('GET', '/virusscanner/history' + '?' + new URLSearchParams(params)),
  },
  mimetypes: {
    getSystem: () => API.request('GET', '/mimetypes/system'),
    list: () => API.request('GET', '/mimetypes'),
    get: (id) => API.request('GET', '/mimetypes/' + encodeURIComponent(id)),
    create: (data) => API.request('POST', '/mimetypes', data),
    update: (id, data) => API.request('PUT', '/mimetypes/' + encodeURIComponent(id), data),
    del: (id) => API.request('DELETE', '/mimetypes/' + encodeURIComponent(id)),
    lookup: (ext) => API.request('GET', '/mimetypes/lookup/' + encodeURIComponent(ext)),
    bulkDelete: (ids) => API.request('POST', '/mimetypes/bulk/delete', { ids }),
    exportTypes: () => API.request('GET', '/mimetypes/export'),
    importTypes: (types) => API.request('POST', '/mimetypes/import', { types }),
    overlap: (exts) => API.request('POST', '/mimetypes/overlap', { extensions: exts }),
  },
  audit: {
    list: (opts) => {
      var p = [];
      if (opts && opts.user) p.push('user=' + encodeURIComponent(opts.user));
      if (opts && opts.action) p.push('action=' + encodeURIComponent(opts.action));
      if (opts && opts.search) p.push('search=' + encodeURIComponent(opts.search));
      if (opts && opts.startDate) p.push('startDate=' + encodeURIComponent(opts.startDate));
      if (opts && opts.endDate) p.push('endDate=' + encodeURIComponent(opts.endDate));
      if (opts && opts.limit) p.push('limit=' + opts.limit);
      if (opts && opts.offset) p.push('offset=' + opts.offset);
      return API.request('GET', '/audit' + (p.length ? '?' + p.join('&') : ''));
    },
    actions: () => API.request('GET', '/audit/actions'),
    users: () => API.request('GET', '/audit/users'),
    stats: () => API.request('GET', '/audit/stats'),
    exportLog: () => API.request('GET', '/audit/export'),
    clear: () => API.request('DELETE', '/audit/clear'),
  },
  metrics: {
    current: () => API.request('GET', '/metrics/current'),
    history: (period) => API.request('GET', '/metrics/history?period=' + (period || '24h')),
  },
  services: {
    list: () => API.request('GET', '/services'),
    actions: () => API.request('GET', '/services/actions'),
    action: (name, act) => API.request('POST', '/services/' + encodeURIComponent(name) + '/' + encodeURIComponent(act)),
    bulkAction: (names, act) => API.request('POST', '/services/bulk/' + encodeURIComponent(act), { services: names }),
    status: (name) => API.request('GET', '/services/' + encodeURIComponent(name) + '/status'),
  },
  processes: {
    list: () => API.request('GET', '/processes'),
    tree: () => API.request('GET', '/processes/tree'),
    signals: () => API.request('GET', '/processes/signals'),
    details: (pid) => API.request('GET', '/processes/' + pid + '/details'),
    kill: (pid, signal) => API.request('POST', '/processes/kill/' + pid, { signal: parseInt(signal) || 15 }),
    signal: (pid, signal) => API.request('POST', '/processes/signal', { pid: pid, signal: signal }),
  },
  logs: {
    list: () => API.request('GET', '/logs'),
    categories: () => API.request('GET', '/logs/categories'),
    read: (file, tail) => API.request('GET', '/logs/read/' + encodeURIComponent(file) + '?tail=' + (tail || 500)),
    tail: (file, lines) => API.request('GET', '/logs/tail/' + encodeURIComponent(file) + '?lines=' + (lines || 100)),
    search: (file, q, regex) => API.request('GET', '/logs/search/' + encodeURIComponent(file) + '?q=' + encodeURIComponent(q) + (regex ? '&regex=true' : '')),
    searchMulti: (files, query, opts) => API.request('POST', '/logs/search-multi', { files: files, query: query, limit: opts && opts.limit, regex: opts && opts.regex }),
    stream: (file) => '/api/logs/stream/' + encodeURIComponent(file),
    download: (file) => '/api/logs/download/' + encodeURIComponent(file),
    linecount: (file) => API.request('GET', '/logs/linecount/' + encodeURIComponent(file)),
  },
  cron: {
    getOwners: () => API.request('GET', '/cron/owners'),
    list: (owner) => API.request('GET', '/cron/' + encodeURIComponent(owner)),
    add: (owner, entry) => API.request('POST', '/cron/' + encodeURIComponent(owner), entry),
    update: (owner, idx, entry) => API.request('PUT', '/cron/' + encodeURIComponent(owner) + '/' + idx, entry),
    del: (owner, idx) => API.request('DELETE', '/cron/' + encodeURIComponent(owner) + '/' + idx),
    toggle: (owner, idx) => API.request('PUT', '/cron/' + encodeURIComponent(owner) + '/' + idx + '/toggle'),
    describe: (entry) => API.request('GET', '/cron/describe?' + new URLSearchParams(entry).toString()),
    listCronD: () => API.request('GET', '/cron/cron-d'),
    readCronD: (file) => API.request('GET', '/cron/cron-d/' + encodeURIComponent(file)),
    saveCronD: (file, content) => API.request('PUT', '/cron/cron-d/' + encodeURIComponent(file), { content }),
    deleteCronD: (file) => API.request('DELETE', '/cron/cron-d/' + encodeURIComponent(file)),
  },
  firewall: {
    get: () => API.request('GET', '/firewall'),
    backend: () => API.request('GET', '/firewall/backend'),
    services: () => API.request('GET', '/firewall/services'),
    addRule: (chain, rule) => API.request('POST', '/firewall/rule', { chain, rule }),
    insertRule: (chain, num, rule) => API.request('PUT', '/firewall/rule', { chain, num, rule }),
    replaceRule: (chain, num, rule) => API.request('PUT', '/firewall/rule', { chain, num, rule, replace: true }),
    deleteRule: (chain, num) => API.request('DELETE', '/firewall/rule/' + encodeURIComponent(chain) + '/' + num),
    setPolicy: (chain, target) => API.request('PUT', '/firewall/policy', { chain, target }),
    createChain: (chain) => API.request('POST', '/firewall/chain', { chain }),
    deleteChain: (chain) => API.request('DELETE', '/firewall/chain/' + encodeURIComponent(chain)),
    renameChain: (chain, newName) => API.request('PUT', '/firewall/chain/' + encodeURIComponent(chain) + '/rename', { newName }),
    flushChain: (chain) => API.request('POST', '/firewall/flush/' + encodeURIComponent(chain)),
    getRaw: () => API.request('GET', '/firewall/raw'),
    getExport: () => API.request('GET', '/firewall/export'),
    save: () => API.request('POST', '/firewall/save'),
    stats: () => API.request('GET', '/firewall/stats'),
    conntrack: (limit) => API.request('GET', '/firewall/conntrack' + (limit ? '?limit=' + limit : '')),
    topTalkers: (limit) => API.request('GET', '/firewall/top-talkers' + (limit ? '?limit=' + limit : '')),
    log: (lines) => API.request('GET', '/firewall/log' + (lines ? '?lines=' + lines : '')),
    addService: (zone, service) => API.request('POST', '/firewall/zone/service', { zone, service }),
    removeService: (zone, service) => API.request('DELETE', '/firewall/zone/service', { zone, service }),
    addPort: (zone, port) => API.request('POST', '/firewall/zone/port', { zone, port }),
    removePort: (zone, port) => API.request('DELETE', '/firewall/zone/port', { zone, port }),
    addRichRule: (zone, rule) => API.request('POST', '/firewall/zone/rich-rule', { zone, rule }),
    removeRichRule: (zone, rule) => API.request('DELETE', '/firewall/zone/rich-rule', { zone, rule }),
    setDefaultZone: (zone) => API.request('PUT', '/firewall/zone/default', { zone }),
    setMasquerade: (zone, enable) => API.request('PUT', '/firewall/zone/masquerade', { zone, enable }),
    addIcmpBlock: (zone, icmp) => API.request('POST', '/firewall/zone/icmp-block', { zone, icmp }),
    removeIcmpBlock: (zone, icmp) => API.request('DELETE', '/firewall/zone/icmp-block', { zone, icmp }),
  },
  ssl: {
    list: () => API.request('GET', '/ssl'),
    detail: (name) => API.request('GET', '/ssl/' + encodeURIComponent(name)),
    config: (name) => API.request('GET', '/ssl/' + encodeURIComponent(name) + '/config'),
    search: (q) => API.request('GET', '/ssl/search?q=' + encodeURIComponent(q)),
    issue: (domain, opts) => API.request('POST', '/ssl/issue', Object.assign({ domain }, opts || {})),
    renew: (domain) => API.request('POST', '/ssl/renew/' + encodeURIComponent(domain)),
    renewAll: () => API.request('POST', '/ssl/renew-all'),
    revoke: (domain) => API.request('POST', '/ssl/revoke/' + encodeURIComponent(domain)),
    remove: (domain) => API.request('DELETE', '/ssl/' + encodeURIComponent(domain)),
    autoRenewStatus: () => API.request('GET', '/ssl/auto-renew'),
    dryRun: () => API.request('POST', '/ssl/dry-run'),
    nginxOptions: () => API.request('GET', '/ssl/nginx-options'),
  },
  phpfpm: {
    list: () => API.request('GET', '/phpfpm'),
    status: () => API.request('GET', '/phpfpm/status'),
    version: () => API.request('GET', '/phpfpm/version'),
    global: () => API.request('GET', '/phpfpm/global'),
    poolStatus: () => API.request('GET', '/phpfpm/pool-status'),
    opcache: () => API.request('GET', '/phpfpm/opcache'),
    modules: () => API.request('GET', '/phpfpm/modules'),
    ini: () => API.request('GET', '/phpfpm/ini'),
    configTest: () => API.request('GET', '/phpfpm/config-test'),
    pool: (name) => API.request('GET', '/phpfpm/' + encodeURIComponent(name)),
    poolLogs: (name, lines) => API.request('GET', '/phpfpm/' + encodeURIComponent(name) + '/logs?lines=' + (lines || 100)),
    slowLogs: (name, lines) => API.request('GET', '/phpfpm/' + encodeURIComponent(name) + '/slow-log?lines=' + (lines || 100)),
    editPool: (name, directive, value) => API.request('PUT', '/phpfpm/' + encodeURIComponent(name), { directive, value }),
    restart: () => API.request('POST', '/phpfpm/restart'),
    reload: () => API.request('POST', '/phpfpm/reload'),
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
