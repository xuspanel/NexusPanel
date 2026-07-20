const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const db = require('../services/databases');

const router = express.Router();
router.use(authMiddleware);
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) return adminOnly(req, res, next);
  next();
});

router.get('/users', async (req, res) => {
  try {
    const roles = await db.listRoles();
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { username, password, isSuperuser, canCreateDb, canLogin } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    const result = await db.createRole(username, password, isSuperuser, canCreateDb, canLogin);
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/list', async (req, res) => {
  try {
    const dbs = await db.listDatabases();
    if (req.query.owner) {
      const ownerFilter = String(req.query.owner);
      res.json(dbs.filter(d => d.owner_name === ownerFilter));
    } else {
      res.json(dbs);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/query-presets', (req, res) => {
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

router.post('/create', async (req, res) => {
  try {
    const { name, owner, encoding, template, connLimit, comment } = req.body;
    if (!name) return res.status(400).json({ error: 'Database name required' });
    const result = await db.createDatabase(name, owner, encoding, template, connLimit);
    if (comment) {
      await db.exec('postgres', `COMMENT ON DATABASE ${db.quoteIdent(name)} IS ${db.quoteLiteral(comment)}`);
    }
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/query-run', async (req, res) => {
  try {
    const { db: database, query } = req.body;
    if (!database || !query) return res.status(400).json({ error: 'Database and query are required' });
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const start = Date.now();
    const result = await db.runQuery(database, query);
    const executionTimeMs = Date.now() - start;
    const firstWord = query.trim().split(/\s+/)[0].toUpperCase();
    if (result.rows !== undefined) {
      res.json({ command: result.command || firstWord, columns: result.fields?.map(f => f.name) || [], rows: result.rows, rowCount: result.rowCount, executionTimeMs });
    } else {
      res.json({ command: result.command || firstWord, affectedRows: result.rowCount || 0, message: `${result.command || firstWord} ${result.rowCount || 0}`, executionTimeMs });
    }
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/bookmarks', async (req, res) => {
  try {
    const database = req.query.db || '';
    const bookmarks = await db.listBookmarks(database);
    res.json(bookmarks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bookmarks', async (req, res) => {
  try {
    const { database, label, sql } = req.body;
    if (!label || !sql) return res.status(400).json({ error: 'Label and SQL required' });
    const result = await db.createBookmark(database || 'postgres', label, sql);
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/bookmarks/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const result = await db.deleteBookmark(id);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:db/tables', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const rows = await db.listTables(database);
    const result = rows.map(r => ({
      schemaname: r.table_schema,
      tablename: r.table_name,
      column_count: r.column_count,
      row_count: r.approx_row_count || 0,
      size_formatted: r.size_formatted || '—',
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:db/table/:schema/:table/info', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid database/schema/table name' });
    }
    const columns = await db.getTableInfo(database, schema, table);
    columns.forEach(c => {
      if (c.column_default && c.column_default.startsWith('nextval')) {
        c.is_serial = true;
        c.column_default = 'auto_increment';
      }
    });
    const idxRows = await db.queryRows(database,
      `SELECT indexname, indexdef FROM pg_catalog.pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname`,
      [schema, table]
    );
    const data = await db.getTableData(database, schema, table, 1, 0);
    const rowCount = data.total;
    res.json({ columns, indexes: idxRows, row_count: rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:db/table/:schema/:table/data', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid database/schema/table name' });
    }
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.q || '';
    const sortBy = req.query.sortBy || '';
    const sortDir = req.query.sortDir || '';
    const result = await db.getTableData(database, schema, table, limit, offset, search, sortBy, sortDir);
    const headers = result.rows.length ? Object.keys(result.rows[0]) : [];
    res.json({ columns: headers, rows: result.rows, total: result.total, limit: result.limit, offset: result.offset, search, sortBy, sortDir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:db/table/:schema/:table/row', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid database/schema/table name' });
    }
    const result = await db.insertRow(database, schema, table, req.body.data || {});
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:db/table/:schema/:table/row/:pkCol/:pkVal', async (req, res) => {
  try {
    const { db: database, schema, table, pkCol, pkVal } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table) || !db.validateIdent(pkCol)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    const result = await db.updateRow(database, schema, table, pkCol, pkVal, req.body.data || {});
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:db/table/:schema/:table/row/:pkCol/:pkVal', async (req, res) => {
  try {
    const { db: database, schema, table, pkCol, pkVal } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table) || !db.validateIdent(pkCol)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    const result = await db.deleteRow(database, schema, table, pkCol, pkVal);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:db/table/:schema/:table/duplicate', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    const { newName } = req.body;
    if (!newName) return res.status(400).json({ error: 'New table name required' });
    const result = await db.duplicateTable(database, schema, table, newName);
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:db/table/:schema/:table/rename', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    const { newName } = req.body;
    if (!newName) return res.status(400).json({ error: 'New table name required' });
    if (!db.validateIdent(newName)) return res.status(400).json({ error: 'Invalid table name' });
    const result = await db.renameTable(database, schema, table, newName);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:db/table/:schema/:table/truncate', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    const result = await db.truncateTable(database, schema, table);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:db/table/:schema/:table/vacuum', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    const result = await db.vacuumTable(database, schema, table);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:db/table/:schema/:table/analyze', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    const result = await db.analyzeTable(database, schema, table);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:db/table/:schema/:table/metadata', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid database/schema/table name' });
    }
    const meta = await db.getTableMetadata(database, schema, table);
    const comments = await db.getColumnComments(database, schema, table);
    const commentMap = {};
    comments.forEach(c => { commentMap[c.column_name] = c.comment; });
    res.json({ ...meta, column_comments: commentMap });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:db/table/:schema/:table/comment', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    const { comment } = req.body;
    const result = await db.setTableComment(database, schema, table, comment);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:db/table/:schema/:table/column/:column/comment', async (req, res) => {
  try {
    const { db: database, schema, table, column } = req.params;
    if (!db.validateIdent(column)) return res.status(400).json({ error: 'Invalid column name' });
    const { comment } = req.body;
    const result = await db.setColumnComment(database, schema, table, column, comment);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:db/table/:schema/:table/column-order', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid database/schema/table name' });
    }
    const result = await db.getColumnOrder(database, schema, table);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:db/table/:schema/:table/column-order', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid database/schema/table name' });
    }
    const { order } = req.body;
    if (!order || typeof order !== 'object') return res.status(400).json({ error: 'order object required' });
    const result = await db.setColumnOrder(database, schema, table, order);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:db/table/:schema/:table/export', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid database/schema/table name' });
    }
    const format = req.query.format || 'sql';
    if (!['csv', 'json', 'sql'].includes(format)) return res.status(400).json({ error: 'Invalid format (csv/json/sql)' });
    const result = await db.exportTableData(database, schema, table, format);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${schema}.${table}.${result.ext}"`);
    res.send(result.content);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── Import CSV/SQL ─── */
router.post('/:db/table/:schema/:table/import', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid database/schema/table name' });
    }
    const { format, content } = req.body;
    if (!format || !content) return res.status(400).json({ error: 'Format and content required' });
    if (!['csv', 'sql'].includes(format)) return res.status(400).json({ error: 'Invalid format (csv or sql)' });
    const result = await db.importTableData(database, schema, table, format, content);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Triggers ─── */
router.get('/:db/triggers', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const triggers = await db.listAllTriggers(database);
    res.json(triggers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:db/triggers/:schema/:triggerName', async (req, res) => {
  try {
    const { db: database, schema, triggerName } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(triggerName)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const def = await db.getTriggerDefinition(database, schema, triggerName);
    res.json(def);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:db/triggers/:schema/:triggerName', async (req, res) => {
  try {
    const { db: database, schema, triggerName } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(triggerName)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const result = await db.dropTrigger(database, schema, null, triggerName);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:db/table/:schema/:table/triggers', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const triggers = await db.listTriggers(database, schema, table);
    res.json(triggers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:db/trigger', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'SQL is required' });
    const result = await db.createTrigger(database, sql);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:db/table/:schema/:table/trigger/:triggerName', async (req, res) => {
  try {
    const { db: database, schema, table, triggerName } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table) || !db.validateIdent(triggerName)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const result = await db.dropTrigger(database, schema, table, triggerName);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Foreign Keys ─── */
router.get('/:db/table/:schema/:table/foreign-keys', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const fks = await db.getForeignKeys(database, schema, table);
    res.json(fks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── Index Management ─── */
router.get('/:db/table/:schema/:table/indexes', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const idxs = await db.listIndexes(database, schema, table);
    res.json(idxs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:db/table/:schema/:table/index', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const { indexName, column, unique, method } = req.body;
    if (!column) return res.status(400).json({ error: 'Column name required' });
    const result = await db.createIndex(database, schema, table, indexName, column, unique, method);
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:db/index/:schema/:indexName', async (req, res) => {
  try {
    const { db: database, schema, indexName } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(indexName)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const result = await db.dropIndex(database, schema, indexName);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Batch Delete ─── */
router.post('/:db/table/:schema/:table/rows/delete', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const { pkCol, pkVals } = req.body;
    if (!pkCol || !Array.isArray(pkVals) || !pkVals.length) return res.status(400).json({ error: 'pkCol and pkVals array required' });
    const result = await db.deleteRows(database, schema, table, pkCol, pkVals);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── View Management ─── */
router.get('/:db/views', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const schema = req.query.schema || '';
    const views = await db.listViews(database, schema);
    res.json(views);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:db/view', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const { schema, viewName, query } = req.body;
    if (!viewName || !query) return res.status(400).json({ error: 'View name and query required' });
    const result = await db.createView(database, schema || 'public', viewName, query);
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:db/view/:schema/:viewName', async (req, res) => {
  try {
    const { db: database, schema, viewName } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(viewName)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const result = await db.dropView(database, schema, viewName);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Materialized Views ─── */
router.get('/:db/matviews', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const schema = req.query.schema || '';
    const views = await db.listMatViews(database, schema);
    res.json(views);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:db/matview', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const { schema, name, query, withData } = req.body;
    if (!name || !query) return res.status(400).json({ error: 'Name and query required' });
    const result = await db.createMatView(database, schema || 'public', name, query, withData);
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:db/matview/:schema/:name', async (req, res) => {
  try {
    const { db: database, schema, name } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(name)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const result = await db.dropMatView(database, schema, name);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:db/matview/:schema/:name/refresh', async (req, res) => {
  try {
    const { db: database, schema, name } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(name)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const result = await db.refreshMatView(database, schema, name);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Connection/Activity Monitor ─── */
router.get('/:db/connections', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const connections = await db.getActiveConnections(database);
    res.json(connections);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:db/connections/:pid', async (req, res) => {
  try {
    const { db: database, pid } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const result = await db.killConnection(database, parseInt(pid));
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Query Result Export ─── */
router.post('/:db/export-query', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const { query, format } = req.body;
    if (!query || !format) return res.status(400).json({ error: 'Query and format required' });
    if (!['csv', 'json', 'sql'].includes(format)) return res.status(400).json({ error: 'Invalid format' });
    const result = await db.runQuery(database, query);
    if (!result.rows.length) return res.status(400).json({ error: 'No rows to export' });
    const exported = await db.exportQueryResult(result.rows, format);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="query-result.${exported.ext}"`);
    res.send(exported.content);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:db/schemas', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const schemas = await db.listSchemas(database);
    res.json(schemas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:db/extensions', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const extensions = await db.listExtensions(database);
    res.json(extensions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:db/config', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const config = await db.getDbConfig(database);
    if (!config) return res.status(404).json({ error: 'Database not found' });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:db/config', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const { owner, connLimit, allowConnections, isTemplate, comment } = req.body;
    if (owner && !db.validateIdent(owner)) return res.status(400).json({ error: 'Invalid owner name' });
    const stmts = [];
    if (owner) stmts.push(`ALTER DATABASE ${db.quoteIdent(database)} OWNER TO ${db.quoteIdent(owner)}`);
    if (typeof connLimit === 'number' && connLimit >= -1) stmts.push(`ALTER DATABASE ${db.quoteIdent(database)} CONNECTION LIMIT ${connLimit}`);
    if (typeof allowConnections === 'boolean') stmts.push(`ALTER DATABASE ${db.quoteIdent(database)} WITH ${allowConnections ? '' : 'NO '}ALLOW_CONNECTIONS`);
    if (typeof isTemplate === 'boolean') stmts.push(`ALTER DATABASE ${db.quoteIdent(database)} WITH ${isTemplate ? '' : 'NO '}IS_TEMPLATE`);
    if (comment !== undefined) stmts.push(`COMMENT ON DATABASE ${db.quoteIdent(database)} IS ${comment ? db.quoteLiteral(comment) : 'NULL'}`);
    if (stmts.length) {
      for (const stmt of stmts) await db.exec('postgres', stmt);
    }
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:db', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    if (req.body.confirm !== database) return res.status(400).json({ error: 'Type the database name to confirm deletion' });
    const result = await db.dropDatabase(database);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:db/table', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const { schema, name, columns } = req.body;
    if (!name || !columns || !columns.length) return res.status(400).json({ error: 'Table name and columns required' });
    const result = await db.createTable(database, schema || 'public', name, columns);
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:db/table/:schema/:table', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid database/schema/table name' });
    }
    const { changes } = req.body;
    if (!changes || !changes.length) return res.status(400).json({ error: 'No changes to apply' });
    const actions = changes.map(c => {
      if (c.action === 'add') return { op: 'add', name: c.name, type: c.type, nullable: c.nullable, default: c.default, primaryKey: c.primaryKey };
      if (c.action === 'drop') return { op: 'drop', name: c.name };
      if (c.action === 'alter') return { op: 'alter', name: c.oldName, type: c.type, nullable: c.nullable, default: c.default };
      if (c.action === 'rename') return { op: 'rename', name: c.oldName, newName: c.newName };
      return null;
    }).filter(Boolean);
    const result = await db.alterTable(database, schema, table, actions);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:db/table/:schema/:table', async (req, res) => {
  try {
    const { db: database, schema, table } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(table)) {
      return res.status(400).json({ error: 'Invalid database/schema/table name' });
    }
    const confirmName = schema + '.' + table;
    if (req.body.confirm !== confirmName) return res.status(400).json({ error: 'Type the table name to confirm deletion' });
    const result = await db.dropTable(database, schema, table);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:db/query', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const upper = query.trim().toUpperCase();
    if (/^(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|VACUUM|REINDEX|COPY)\b/.test(upper))
      return res.status(400).json({ error: 'DDL queries not allowed via this endpoint. Use table editor instead.' });
    await db.exec(database, query);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Tier 3: FK Relations (all tables) ─── */
router.get('/:db/foreign-keys', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const fks = await db.getAllForeignKeys(database);
    res.json(fks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── Tier 3: Privileges ─── */
router.get('/:db/privileges', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const privs = await db.getPrivileges(database);
    res.json(privs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:db/privileges/grant', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const { schema, table, privilege, grantee } = req.body;
    if (!schema || !table || !privilege || !grantee) return res.status(400).json({ error: 'schema, table, privilege, grantee required' });
    const result = await db.grantPrivilege(database, schema, table, privilege, grantee);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:db/privileges/revoke', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const { schema, table, privilege, grantee } = req.body;
    if (!schema || !table || !privilege || !grantee) return res.status(400).json({ error: 'schema, table, privilege, grantee required' });
    const result = await db.revokePrivilege(database, schema, table, privilege, grantee);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Tier 3: Functions / Procedures ─── */
router.get('/:db/functions', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const schema = req.query.schema || '';
    const funcs = await db.listFunctions(database, schema);
    res.json(funcs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:db/functions/:schema/:name/definition', async (req, res) => {
  try {
    const { db: database, schema, name } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(name)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const def = await db.getFunctionDefinition(database, schema, name, req.query.args);
    res.json(def);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:db/functions/:schema/:name', async (req, res) => {
  try {
    const { db: database, schema, name } = req.params;
    if (!db.validateIdent(database) || !db.validateIdent(schema) || !db.validateIdent(name)) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const result = await db.dropFunction(database, schema, name, req.query.args);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ─── Tier 3: SQL Dump ─── */
router.get('/:db/dump', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const format = req.query.format || 'full';
    if (!['schema', 'data', 'full'].includes(format)) return res.status(400).json({ error: 'Invalid format (schema/data/full)' });
    const result = await db.dumpDatabase(database, format);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${database}-dump.${result.ext}"`);
    res.send(result.content);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── Tier 3: Search Across All Tables ─── */
router.post('/:db/search-all', async (req, res) => {
  try {
    const { db: database } = req.params;
    if (!db.validateIdent(database)) return res.status(400).json({ error: 'Invalid database name' });
    const { searchTerm, schema } = req.body;
    if (!searchTerm) return res.status(400).json({ error: 'searchTerm required' });
    const results = await db.searchAllTables(database, searchTerm, schema || '');
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;