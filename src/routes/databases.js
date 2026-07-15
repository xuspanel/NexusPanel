const express = require('express');
const { exec } = require('child_process');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function psql(database, query) {
  return new Promise((resolve, reject) => {
    const escaped = query.replace(/'/g, "'\\''");
    const cmd = `sudo -u postgres psql -d '${database}' -A -F'|' -c '${escaped}' 2>&1`;
    exec(cmd, (err, stdout) => {
      if (err) return reject(new Error(stdout.trim() || err.message));
      resolve(stdout.trim());
    });
  });
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim()).filter(l => !/^\((\d+|\d+ rows?)\)$/.test(l.trim()));
  if (lines.length < 2) return [];
  const headers = lines[0].split('|');
  return lines.slice(1).map(line => {
    const vals = line.split('|');
    const row = {};
    headers.forEach((h, i) => {
      let v = vals[i] || '';
      if (v === '' || v === 'NULL') v = null;
      if (/^\d+$/.test(v)) v = parseInt(v, 10);
      else if (/^\d+\.\d+$/.test(v)) v = parseFloat(v);
      row[h.trim()] = v;
    });
    return row;
  });
}

router.get('/users', async (req, res) => {
  try {
    const raw = await psql('postgres',
      "SELECT r.rolname AS name, r.rolsuper AS is_super, r.rolcreatedb AS can_create_db, r.rolcanlogin AS can_login, (SELECT COUNT(*) FROM pg_catalog.pg_database d WHERE pg_catalog.pg_get_userbyid(d.datdba) = r.rolname AND d.datistemplate = false) AS db_count, r.rolvaliduntil AS valid_until FROM pg_catalog.pg_roles r WHERE r.rolname NOT LIKE 'pg_%' ORDER BY r.rolsuper DESC, r.rolname"
    );
    res.json(parseCSV(raw));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { username, password, isSuperuser, canCreateDb, canLogin } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    var sql = 'CREATE ROLE "' + username.replace(/"/g, '""') + '"';
    if (password) sql += " LOGIN PASSWORD '" + password.replace(/'/g, "''") + "'";
    else if (canLogin !== false) sql += ' LOGIN';
    if (isSuperuser) sql += ' SUPERUSER';
    if (canCreateDb) sql += ' CREATEDB';
    await psql('postgres', sql);
    res.status(201).json({ ok: true, username });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/list', async (req, res) => {
  try {
    const ownerFilter = req.query.owner ? " AND pg_catalog.pg_get_userbyid(d.datdba) = '" + req.query.owner.replace(/'/g, "''") + "'" : '';
    const raw = await psql('postgres',
      "SELECT d.datname AS name, pg_catalog.pg_get_userbyid(d.datdba) AS owner, pg_catalog.pg_encoding_to_char(d.encoding) AS encoding, d.datcollate AS collation, pg_catalog.pg_database_size(d.datname)::bigint AS size_bytes FROM pg_catalog.pg_database d WHERE d.datistemplate = false" + ownerFilter + " ORDER BY d.datname"
    );
    const dbList = parseCSV(raw);

    for (const db of dbList) {
      try {
        const tc = await psql(db.name,
          "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')"
        );
        const parsed = parseCSV(tc);
        db.table_count = parsed[0]?.cnt || 0;
      } catch {
        db.table_count = 0;
      }
      try {
        const ec = await psql(db.name,
          "SELECT COUNT(*) AS cnt FROM pg_extension"
        );
        const parsed = parseCSV(ec);
        db.extension_count = parsed[0]?.cnt || 0;
      } catch {
        db.extension_count = 0;
      }
    }
    res.json(dbList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:db/tables', async (req, res) => {
  try {
    const { db } = req.params;
    const escaped = db.replace(/[^a-zA-Z0-9_$]/g, '');
    const raw = await psql(db,
      "SELECT t.schemaname, t.tablename, t.tableowner, s.n_live_tup AS row_estimate, pg_total_relation_size(t.schemaname||'.'||t.tablename)::bigint AS total_bytes FROM pg_catalog.pg_tables t LEFT JOIN pg_catalog.pg_stat_user_tables s ON t.schemaname = s.schemaname AND t.tablename = s.relname WHERE t.schemaname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY t.schemaname, t.tablename"
    );
    const tables = parseCSV(raw);
    for (const t of tables) {
      try {
        const rc = await psql(db,
          'SELECT COUNT(*)::bigint AS cnt FROM "' + t.schemaname + '"."' + t.tablename + '"'
        );
        const parsed = parseCSV(rc);
        t.row_count = parsed[0]?.cnt || 0;
      } catch {
        t.row_count = t.row_estimate || 0;
      }
      if (t.total_bytes != null) {
        t.size_formatted = formatBytes(t.total_bytes);
      } else {
        t.size_formatted = '—';
      }
    }
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:db/table/:schema/:table/info', async (req, res) => {
  try {
    const { db, schema, table } = req.params;
    const colRaw = await psql(db,
      "SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, c.character_maximum_length, c.numeric_precision, c.numeric_scale, c.ordinal_position FROM information_schema.columns c WHERE c.table_schema = '" + schema + "' AND c.table_name = '" + table + "' ORDER BY c.ordinal_position"
    );
    const columns = parseCSV(colRaw);

    const pkRaw = await psql(db,
      "SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = '" + schema + "' AND tc.table_name = '" + table + "'"
    );
    const pkCols = parseCSV(pkRaw).map(r => r.column_name);

    const idxRaw = await psql(db,
      "SELECT indexname, indexdef FROM pg_catalog.pg_indexes WHERE schemaname = '" + schema + "' AND tablename = '" + table + "' ORDER BY indexname"
    );
    const indexes = parseCSV(idxRaw);

    columns.forEach(c => {
      c.is_pk = pkCols.includes(c.column_name);
      if (c.column_default && c.column_default.startsWith('nextval')) {
        c.is_serial = true;
        c.column_default = 'auto_increment';
      }
    });

    const countRaw = await psql(db,
      'SELECT COUNT(*)::bigint AS cnt FROM "' + schema + '"."' + table + '"'
    );
    const countParsed = parseCSV(countRaw);
    const rowCount = countParsed[0]?.cnt || 0;

    res.json({ columns, indexes, row_count: rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:db/table/:schema/:table/data', async (req, res) => {
  try {
    const { db, schema, table } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const raw = await psql(db,
      'SELECT * FROM "' + schema + '"."' + table + '" LIMIT ' + limit
    );
    const lines = raw.split('\n').filter(l => l.trim()).filter(l => !/^\((\d+|\d+ rows?)\)$/.test(l.trim()));
    if (lines.length < 2) return res.json({ columns: [], rows: [] });
    const headers = lines[0].split('|');
    const rows = lines.slice(1).map(line => {
      const vals = line.split('|');
      const row = {};
      headers.forEach((h, i) => {
        let v = vals[i] || '';
        if (v === '' || v === 'NULL') v = null;
        if (/^\d+$/.test(v)) v = parseInt(v, 10);
        else if (/^\d+\.\d+$/.test(v)) v = parseFloat(v);
        else if (v === 't') v = true;
        else if (v === 'f') v = false;
        row[h.trim()] = v;
      });
      return row;
    });
    res.json({ columns: headers.map(h => h.trim()), rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:db/schemas', async (req, res) => {
  try {
    const { db } = req.params;
    const raw = await psql(db,
      "SELECT nspname AS name, pg_catalog.pg_get_userbyid(nspowner) AS owner FROM pg_catalog.pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%' ORDER BY nspname"
    );
    res.json(parseCSV(raw));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:db/extensions', async (req, res) => {
  try {
    const { db } = req.params;
    const raw = await psql(db,
      "SELECT extname AS name, extversion AS version, pg_catalog.pg_get_userbyid(extowner) AS owner FROM pg_catalog.pg_extension ORDER BY extname"
    );
    res.json(parseCSV(raw));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;

/* ─── Create / Drop / Config Database ─── */
router.post('/create', async (req, res) => {
  try {
    const { name, owner, encoding, template, connLimit, comment } = req.body;
    if (!name || !owner) return res.status(400).json({ error: 'Database name and owner required' });
    var sql = 'CREATE DATABASE "' + name.replace(/"/g, '""') + '"';
    sql += ' OWNER "' + owner.replace(/"/g, '""') + '"';
    if (encoding) sql += " ENCODING '" + encoding.replace(/'/g, "''") + "'";
    if (template) sql += " TEMPLATE " + template.replace(/[^a-zA-Z0-9_]/g, '');
    if (connLimit != null) sql += " CONNECTION LIMIT " + parseInt(connLimit);
    if (comment) sql = "COMMENT ON DATABASE \"" + name.replace(/"/g, '""') + "\" IS '" + comment.replace(/'/g, "''") + "'; " + sql;
    await psql('postgres', sql);
    res.status(201).json({ ok: true, name });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:db/config', async (req, res) => {
  try {
    var db = req.params.db.replace(/[^a-zA-Z0-9_$]/g, '');
    var { owner, connLimit, allowConnections, isTemplate, comment } = req.body;
    var stmts = [];
    if (owner) stmts.push('ALTER DATABASE "' + db + '" OWNER TO "' + owner.replace(/"/g, '""') + '"');
    if (connLimit != null) stmts.push('ALTER DATABASE "' + db + '" CONNECTION LIMIT ' + parseInt(connLimit));
    if (typeof allowConnections === 'boolean') stmts.push('ALTER DATABASE "' + db + '" WITH ' + (allowConnections ? '' : 'NO ') + 'ALLOW_CONNECTIONS');
    if (typeof isTemplate === 'boolean') stmts.push('ALTER DATABASE "' + db + '" WITH ' + (isTemplate ? '' : 'NO ') + 'IS_TEMPLATE');
    if (comment !== undefined) stmts.push('COMMENT ON DATABASE "' + db + '" IS ' + (comment ? "'" + comment.replace(/'/g, "''") + "'" : 'NULL'));
    await psql('postgres', 'BEGIN; ' + stmts.join('; ') + '; COMMIT');
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:db', async (req, res) => {
  try {
    var db = req.params.db.replace(/[^a-zA-Z0-9_$]/g, '');
    if (req.body.confirm !== db) return res.status(400).json({ error: 'Type the database name to confirm deletion' });
    await psql('postgres', 'DROP DATABASE "' + db + '"');
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Create / Alter / Drop Table ─── */
router.post('/:db/table', async (req, res) => {
  try {
    var db = req.params.db.replace(/[^a-zA-Z0-9_$]/g, '');
    var { schema, name, columns } = req.body;
    if (!name || !columns || !columns.length) return res.status(400).json({ error: 'Table name and columns required' });
    var s = (schema || 'public').replace(/[^a-zA-Z0-9_]/g, '');
    var colDefs = columns.map(function(c) {
      var def = '"' + c.name.replace(/"/g, '""') + '" ' + c.type;
      if (!c.nullable) def += ' NOT NULL';
      if (c.default) def += " DEFAULT " + c.default;
      return def;
    });
    var pks = columns.filter(function(c) { return c.primaryKey; }).map(function(c) { return '"' + c.name.replace(/"/g, '""') + '"'; });
    var sql = 'CREATE TABLE ' + s + '."' + name.replace(/"/g, '""') + '" (' + colDefs.join(', ');
    if (pks.length) sql += ', PRIMARY KEY (' + pks.join(', ') + ')';
    sql += ')';
    await psql(db, sql);
    res.status(201).json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:db/table/:schema/:table', async (req, res) => {
  try {
    var db = req.params.db.replace(/[^a-zA-Z0-9_$]/g, '');
    var s = req.params.schema.replace(/[^a-zA-Z0-9_]/g, '');
    var t = req.params.table.replace(/[^a-zA-Z0-9_$]/g, '');
    var { changes } = req.body;
    if (!changes || !changes.length) return res.status(400).json({ error: 'No changes to apply' });
    var stmts = [];
    changes.forEach(function(c) {
      if (c.action === 'add') {
        var def = 'ADD COLUMN "' + c.name.replace(/"/g, '""') + '" ' + c.type;
        if (!c.nullable) def += ' NOT NULL';
        if (c.default) def += ' DEFAULT ' + c.default;
        stmts.push('ALTER TABLE ' + s + '."' + t + '" ' + def);
      } else if (c.action === 'drop') {
        stmts.push('ALTER TABLE ' + s + '."' + t + '" DROP COLUMN "' + c.name.replace(/"/g, '""') + '"');
      } else if (c.action === 'alter') {
        var def = 'ALTER COLUMN "' + c.oldName.replace(/"/g, '""') + '" TYPE ' + c.type;
        stmts.push('ALTER TABLE ' + s + '."' + t + '" ' + def);
        if (c.nullable !== undefined) {
          stmts.push('ALTER TABLE ' + s + '."' + t + '" ALTER COLUMN "' + c.oldName.replace(/"/g, '""') + '" ' + (c.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'));
        }
      } else if (c.action === 'rename') {
        stmts.push('ALTER TABLE ' + s + '."' + t + '" RENAME COLUMN "' + c.oldName.replace(/"/g, '""') + '" TO "' + c.newName.replace(/"/g, '""') + '"');
      }
    });
    await psql(db, 'BEGIN; ' + stmts.join('; ') + '; COMMIT');
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:db/table/:schema/:table', async (req, res) => {
  try {
    var db = req.params.db.replace(/[^a-zA-Z0-9_$]/g, '');
    var s = req.params.schema.replace(/[^a-zA-Z0-9_]/g, '');
    var t = req.params.table.replace(/[^a-zA-Z0-9_$]/g, '');
    if (req.body.confirm !== (s + '.' + t)) return res.status(400).json({ error: 'Type the table name to confirm deletion' });
    await psql(db, 'DROP TABLE ' + s + '."' + t + '" CASCADE');
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Run DML Query (for inline data editing) ─── */
router.post('/:db/query', async (req, res) => {
  try {
    var db = req.params.db.replace(/[^a-zA-Z0-9_$]/g, '');
    var { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });
    var upper = query.trim().toUpperCase();
    if (/^(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|VACUUM|REINDEX|COPY)\b/.test(upper))
      return res.status(400).json({ error: 'DDL queries not allowed via this endpoint. Use table editor instead.' });
    await psql(db, query);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── SQL Query Terminal ─── */
router.post('/query-run', async (req, res) => {
  try {
    var db = String(req.body.db || '').replace(/[^a-zA-Z0-9_$]/g, '');
    var query = req.body.query || '';
    if (!db || !query.trim()) return res.status(400).json({ error: 'Database and query are required' });

    var escaped = query.trim().replace(/'/g, "'\\''");
    var cmd = "sudo -u postgres psql -d '" + db + "' -A -F'|' -c '" + escaped + "' 2>&1";

    exec(cmd, function(err, stdout) {
      var output = (stdout || '').trim();
      if (err) return res.status(400).json({ error: output || err.message });

      if (!output) return res.json({ command: 'OK', message: 'Query executed' });

      // Detect tabular output: contains | OR has (N rows) footer (handles single-column queries)
      var hasRowsFooter = /\(\d+ rows?\)\s*$/.test(output.trim());
      if (output.indexOf('|') !== -1 || hasRowsFooter) {
        var lines = output.split('\n').filter(function(l) { return l.trim(); }).filter(function(l) { return !/^\(\d+ rows?\)$/.test(l.trim()); });
        if (!lines.length) return res.json({ command: 'SELECT', columns: [], rows: [], rowCount: 0 });

        var headers;
        if (lines[0].indexOf('|') !== -1) {
          headers = lines[0].split('|').map(function(h) { return h.trim(); });
        } else {
          headers = [lines[0].trim()];
        }

        if (lines.length < 2) return res.json({ command: 'SELECT', columns: headers, rows: [], rowCount: 0 });

        var rows = lines.slice(1).map(function(line) {
          var vals = line.split('|');
          var row = {};
          headers.forEach(function(h, i) {
            var v = vals[i] || '';
            if (v === '' || v === 'NULL') v = null;
            else if (/^\d+$/.test(v)) v = parseInt(v, 10);
            else if (/^\d+\.\d+$/.test(v)) v = parseFloat(v);
            else if (v === 't') v = true;
            else if (v === 'f') v = false;
            row[h] = v;
          });
          return row;
        });
        return res.json({ command: 'SELECT', columns: headers, rows: rows, rowCount: rows.length });
      }

      // Command tag output
      var upper = query.trim().toUpperCase();
      var command = upper.split(/\s+/)[0];

      var im = output.match(/^INSERT\s+\d+\s+(\d+)/i);
      var um = output.match(/^UPDATE\s+(\d+)/i);
      var dm = output.match(/^DELETE\s+(\d+)/i);

      if (im) return res.json({ command: 'INSERT', affectedRows: parseInt(im[1], 10), message: output });
      if (um) return res.json({ command: 'UPDATE', affectedRows: parseInt(um[1], 10), message: output });
      if (dm) return res.json({ command: 'DELETE', affectedRows: parseInt(dm[1], 10), message: output });

      return res.json({ command: command, message: output });
    });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Query Presets ─── */
router.get('/query-presets', function(req, res) {
  res.json([
    { category: 'Explore', label: 'All rows (50 limit)', sql: 'SELECT * FROM <table> LIMIT 50' },
    { category: 'Explore', label: 'Count rows', sql: 'SELECT COUNT(*) AS total FROM <table>' },
    { category: 'Explore', label: 'List columns (INFORMATION_SCHEMA)', sql: "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '<table>' ORDER BY ordinal_position" },
    { category: 'Explore', label: 'Distinct values in column', sql: 'SELECT DISTINCT <column> FROM <table> ORDER BY 1' },
    { category: 'Explore', label: 'Browse schemas', sql: "SELECT nspname AS schema, pg_catalog.pg_get_userbyid(nspowner) AS owner FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname" },
    { category: 'Analyze', label: 'Table sizes', sql: "SELECT schemaname, tablename, pg_total_relation_size(schemaname||'.'||tablename) AS total_bytes, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS pretty_size FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY total_bytes DESC" },
    { category: 'Analyze', label: 'Row estimates per table', sql: "SELECT schemaname, tablename, n_live_tup AS estimated_rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC" },
    { category: 'Analyze', label: 'Active connections', sql: "SELECT pid, usename, application_name, client_addr, state, query_start, LEFT(query, 80) AS query_preview FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start DESC" },
    { category: 'Analyze', label: 'Database size', sql: "SELECT pg_database_size(current_database()) AS bytes, pg_size_pretty(pg_database_size(current_database())) AS pretty" },
    { category: 'Analyze', label: 'Slow queries (>1s)', sql: "SELECT pid, usename, query, state, NOW() - query_start AS duration FROM pg_stat_activity WHERE state = 'active' AND NOW() - query_start > interval '1 second' ORDER BY duration DESC" },
    { category: 'Schema', label: 'List all tables', sql: "SELECT schemaname, tablename, tableowner FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY schemaname, tablename" },
    { category: 'Schema', label: 'List indexes', sql: "SELECT schemaname, tablename, indexname, indexdef FROM pg_catalog.pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY schemaname, tablename, indexname" },
    { category: 'Schema', label: 'Create table', sql: 'CREATE TABLE <table> (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(255) NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);' },
    { category: 'Schema', label: 'Add column', sql: 'ALTER TABLE <table> ADD COLUMN <column> <type>;' },
    { category: 'Schema', label: 'Create index', sql: 'CREATE INDEX idx_<table>_<column> ON <table> (<column>);' },
    { category: 'Schema', label: 'Drop table (CASCADE)', sql: 'DROP TABLE <table> CASCADE;' },
    { category: 'System', label: 'PostgreSQL version', sql: 'SELECT version();' },
    { category: 'System', label: 'Current time', sql: 'SELECT NOW();' },
    { category: 'System', label: 'Active locks', sql: "SELECT l.locktype, l.database, l.relation, l.page, l.tuple, l.virtualtransaction, l.pid, l.mode, l.granted, a.query FROM pg_locks l LEFT JOIN pg_stat_activity a ON l.pid = a.pid WHERE NOT l.database IS NULL ORDER BY l.pid" },
    { category: 'System', label: 'Vacuum info', sql: "SELECT schemaname, tablename, last_vacuum, last_autovacuum, last_analyze, last_autoanalyze, vacuum_count, autovacuum_count FROM pg_stat_user_tables ORDER BY last_autovacuum NULLS LAST" },
  ]);
});

module.exports = router;
