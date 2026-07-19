const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const pools = new Map();

function getPool(database) {
  const db = database || 'postgres';
  if (!pools.has(db)) {
    pools.set(db, new Pool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: db,
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }));
  }
  return pools.get(db);
}

function validateIdent(name) {
  if (typeof name !== 'string' || !name) return false;
  return /^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(name);
}

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function query(database, sql, params) {
  const pool = getPool(database);
  const result = await pool.query(sql, params || []);
  return result;
}

async function queryOne(database, sql, params) {
  const result = await query(database, sql, params);
  return result.rows[0] || null;
}

async function queryRows(database, sql, params) {
  const result = await query(database, sql, params);
  return result.rows;
}

async function exec(database, sql, params) {
  const result = await query(database, sql, params);
  return { rowCount: result.rowCount, rows: result.rows };
}

async function listDatabases() {
  const sql = `SELECT d.datname AS name,
  pg_catalog.pg_get_userbyid(d.datdba) AS owner,
  pg_catalog.pg_encoding_to_char(d.encoding) AS encoding,
  d.datcollate AS collation,
  pg_catalog.pg_database_size(d.datname)::bigint AS size_bytes,
  pg_catalog.pg_get_userbyid(d.datdba) AS owner_name
FROM pg_catalog.pg_database d
WHERE d.datistemplate = false
ORDER BY d.datname`;
  const dbs = await queryRows('postgres', sql);
  for (const db of dbs) {
    try {
      const rows = await queryRows(db.name, `SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')`);
      db.table_count = rows[0]?.cnt || 0;
    } catch { db.table_count = 0; }
    try {
      const rows = await queryRows(db.name, `SELECT COUNT(*)::int AS cnt FROM pg_extension`);
      db.extension_count = rows[0]?.cnt || 0;
    } catch { db.extension_count = 0; }
  }
  return dbs;
}

async function listRoles() {
  return await queryRows('postgres', `SELECT r.rolname AS name,
  r.rolsuper AS is_super,
  r.rolcreatedb AS can_create_db,
  r.rolcanlogin AS can_login,
  r.rolvaliduntil AS valid_until
FROM pg_catalog.pg_roles r
WHERE r.rolname NOT LIKE 'pg_%'
ORDER BY r.rolsuper DESC, r.rolname`);
}

async function createRole(username, password, isSuperuser, canCreateDb, canLogin) {
  if (!validateIdent(username)) throw new Error('Invalid username (alphanumeric/underscore only)');
  let parts = [`CREATE ROLE ${quoteIdent(username)}`];
  if (password) parts.push(`LOGIN PASSWORD ${quoteLiteral(password)}`);
  else if (canLogin !== false) parts.push('LOGIN');
  if (isSuperuser) parts.push('SUPERUSER');
  if (canCreateDb) parts.push('CREATEDB');
  await exec('postgres', parts.join(' '));
  return { ok: true, username };
}

async function listTables(database, schema) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  const schemaFilter = schema && validateIdent(schema) ? `AND table_schema = ${quoteLiteral(schema)}` : `AND table_schema NOT IN ('pg_catalog','information_schema','pg_toast')`;
  return await queryRows(database, `SELECT table_schema, table_name,
  (SELECT COUNT(*)::int FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS column_count,
  (SELECT reltuples::bigint FROM pg_class WHERE oid = (quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass::oid) AS approx_row_count
FROM information_schema.tables t
WHERE table_type = 'BASE TABLE' ${schemaFilter}
ORDER BY table_schema, table_name`);
}

async function listSchemas(database) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  return await queryRows(database, `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast','pg_temp_1','pg_toast_temp_1') ORDER BY schema_name`);
}

async function listExtensions(database) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  return await queryRows(database, `SELECT extname AS name, extversion AS version, nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY extname`);
}

async function getTableInfo(database, schema, table) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid schema/table name');
  const columns = await queryRows(database, `SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
  c.character_maximum_length, c.numeric_precision, c.numeric_scale,
  CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
FROM information_schema.columns c
LEFT JOIN (SELECT ku.column_name FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2) pk
  ON pk.column_name = c.column_name
WHERE c.table_schema = $1 AND c.table_name = $2
ORDER BY c.ordinal_position`, [schema, table]);
  return columns;
}

async function getTableData(database, schema, table, limit, offset, search, sortBy, sortDir) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid schema/table name');
  const full = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const where = search ? ` WHERE (SELECT string_agg(COALESCE(CAST(${quoteIdent(schema)}.${quoteIdent(table)}.* AS text),''),' ') FROM ${full}) ILIKE $3` : '';
  const params = [limit || 50, offset || 0];
  if (search) params.push(`%${search}%`);
  const countSql = `SELECT COUNT(*)::int AS total FROM ${full}${where}`;
  const countParams = search ? [`%${search}%`] : [];
  const countResult = await queryOne(database, countSql, countParams);
  const total = countResult?.total || 0;
  let order = '';
  if (sortBy && validateIdent(sortBy)) {
    const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
    order = ` ORDER BY ${quoteIdent(sortBy)} ${dir}`;
  }
  const rows = await queryRows(database, `SELECT * FROM ${full}${where}${order} LIMIT $1 OFFSET $2`, params);
  return { total, rows, limit: limit || 50, offset: offset || 0 };
}

async function insertRow(database, schema, table, data) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid schema/table name');
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const colList = cols.map(c => quoteIdent(c)).join(', ');
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${colList}) VALUES (${placeholders}) RETURNING *`;
  const result = await query(database, sql, vals);
  return { rows: result.rows, rowCount: result.rowCount };
}

async function updateRow(database, schema, table, pkCol, pkVal, data) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table) || !validateIdent(pkCol)) throw new Error('Invalid name');
  const sets = Object.keys(data).map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(', ');
  const vals = Object.values(data);
  const pkIdx = vals.length + 1;
  const sql = `UPDATE ${quoteIdent(schema)}.${quoteIdent(table)} SET ${sets} WHERE ${quoteIdent(pkCol)} = $${pkIdx} RETURNING *`;
  const result = await query(database, sql, [...vals, pkVal]);
  return { rows: result.rows, rowCount: result.rowCount };
}

async function deleteRow(database, schema, table, pkCol, pkVal) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table) || !validateIdent(pkCol)) throw new Error('Invalid name');
  const sql = `DELETE FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${quoteIdent(pkCol)} = $1 RETURNING *`;
  const result = await query(database, sql, [pkVal]);
  return { rows: result.rows, rowCount: result.rowCount };
}

async function createTable(database, schema, tableName, columns) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(tableName)) throw new Error('Invalid schema/table name');
  if (!Array.isArray(columns) || columns.length === 0) throw new Error('At least one column required');
  const defs = columns.map(col => {
    if (!validateIdent(col.name)) throw new Error(`Invalid column name: ${col.name}`);
    let def = `${quoteIdent(col.name)} ${col.type || 'text'}`;
    if (col.primaryKey) def += ' PRIMARY KEY';
    if (col.nullable === false) def += ' NOT NULL';
    if (col.default !== undefined && col.default !== null && col.default !== '') def += ` DEFAULT ${quoteLiteral(col.default)}`;
    return def;
  });
  const sql = `CREATE TABLE ${quoteIdent(schema)}.${quoteIdent(tableName)} (${defs.join(', ')})`;
  await exec(database, sql);
  return { ok: true, schema, table: tableName };
}

async function alterTable(database, schema, table, actions) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid schema/table name');
  const full = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const parts = [];
  for (const action of actions) {
    if (action.op === 'add' && action.name && action.type) {
      if (!validateIdent(action.name)) throw new Error(`Invalid column name: ${action.name}`);
      let def = `ADD COLUMN ${quoteIdent(action.name)} ${action.type}`;
      if (action.primaryKey) def += ' PRIMARY KEY';
      if (action.nullable === false) def += ' NOT NULL';
      if (action.default !== undefined && action.default !== null) def += ` DEFAULT ${quoteLiteral(action.default)}`;
      parts.push(def);
    } else if (action.op === 'drop' && action.name) {
      if (!validateIdent(action.name)) throw new Error(`Invalid column name: ${action.name}`);
      parts.push(`DROP COLUMN ${quoteIdent(action.name)}`);
    } else if (action.op === 'alter' && action.name && action.type) {
      if (!validateIdent(action.name)) throw new Error(`Invalid column name: ${action.name}`);
      parts.push(`ALTER COLUMN ${quoteIdent(action.name)} TYPE ${action.type}`);
      if (action.nullable === true) parts.push(`ALTER COLUMN ${quoteIdent(action.name)} DROP NOT NULL`);
      else if (action.nullable === false) parts.push(`ALTER COLUMN ${quoteIdent(action.name)} SET NOT NULL`);
      if (action.default !== undefined) {
        if (action.default === null || action.default === '') parts.push(`ALTER COLUMN ${quoteIdent(action.name)} DROP DEFAULT`);
        else parts.push(`ALTER COLUMN ${quoteIdent(action.name)} SET DEFAULT ${quoteLiteral(action.default)}`);
      }
    } else if (action.op === 'rename' && action.name && action.newName) {
      if (!validateIdent(action.newName)) throw new Error(`Invalid new column name: ${action.newName}`);
      parts.push(`RENAME COLUMN ${quoteIdent(action.name)} TO ${quoteIdent(action.newName)}`);
    }
  }
  if (!parts.length) throw new Error('No valid alter actions');
  await exec(database, `ALTER TABLE ${full} ${parts.join(', ')}`);
  return { ok: true };
}

async function dropTable(database, schema, table) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid schema/table name');
  await exec(database, `DROP TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`);
  return { ok: true };
}

async function getDbConfig(database) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  const sql = `SELECT d.datname, pg_catalog.pg_get_userbyid(d.datdba) AS owner,
  d.datconnlimit AS connection_limit,
  pg_catalog.shobj_description(d.oid, 'pg_database') AS description,
  pg_catalog.pg_encoding_to_char(d.encoding) AS encoding,
  d.datcollate AS collation,
  pg_catalog.pg_database_size(d.datname)::bigint AS size_bytes
FROM pg_catalog.pg_database d WHERE d.datname = $1`;
  return await queryOne('postgres', sql, [database]);
}

async function updateDbConfig(database, owner, connLimit, comment) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (owner && validateIdent(owner)) {
    await exec('postgres', `ALTER DATABASE ${quoteIdent(database)} OWNER TO ${quoteIdent(owner)}`);
  }
  if (typeof connLimit === 'number' && connLimit >= -1) {
    await exec('postgres', `ALTER DATABASE ${quoteIdent(database)} CONNECTION LIMIT ${connLimit}`);
  }
  if (comment !== undefined && comment !== null) {
    await exec('postgres', `COMMENT ON DATABASE ${quoteIdent(database)} IS ${quoteLiteral(comment)}`);
  }
  return { ok: true };
}

async function createDatabase(name, owner, encoding, template, connLimit) {
  if (!validateIdent(name)) throw new Error('Invalid database name');
  let sql = `CREATE DATABASE ${quoteIdent(name)}`;
  if (owner && validateIdent(owner)) sql += ` OWNER ${quoteIdent(owner)}`;
  if (encoding) sql += ` ENCODING ${quoteLiteral(encoding)}`;
  if (template && validateIdent(template)) sql += ` TEMPLATE ${quoteIdent(template)}`;
  if (typeof connLimit === 'number' && connLimit >= -1) sql += ` CONNECTION LIMIT ${connLimit}`;
  await exec('postgres', sql);
  return { ok: true, name };
}

async function dropDatabase(name) {
  if (!validateIdent(name)) throw new Error('Invalid database name');
  await exec('postgres', `DROP DATABASE IF EXISTS ${quoteIdent(name)}`);
  return { ok: true };
}

async function duplicateTable(database, schema, table, newName) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid schema/table name');
  let newSchema = schema, newTable = newName;
  if (typeof newName === 'string' && newName.includes('.')) {
    const parts = newName.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('Invalid new name format (use "schema.table" or "tablename")');
    if (!validateIdent(parts[0])) throw new Error('Invalid new schema name');
    if (!validateIdent(parts[1])) throw new Error('Invalid new table name');
    newSchema = parts[0];
    newTable = parts[1];
  } else {
    if (!validateIdent(newName)) throw new Error('Invalid new table name');
  }
  await exec(database, `CREATE TABLE ${quoteIdent(newSchema)}.${quoteIdent(newTable)} AS SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)}`);
  return { ok: true, schema: newSchema, table: newTable };
}

async function renameTable(database, schema, table, newName) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table) || !validateIdent(newName)) throw new Error('Invalid schema/table name');
  await exec(database, `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(table)} RENAME TO ${quoteIdent(newName)}`);
  return { ok: true, schema, table: newName };
}

async function truncateTable(database, schema, table) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid schema/table name');
  await exec(database, `TRUNCATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`);
  return { ok: true };
}

async function vacuumTable(database, schema, table) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid schema/table name');
  await exec(database, `VACUUM ANALYZE ${quoteIdent(schema)}.${quoteIdent(table)}`);
  return { ok: true };
}

async function analyzeTable(database, schema, table) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  if (!validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid schema/table name');
  await exec(database, `ANALYZE ${quoteIdent(schema)}.${quoteIdent(table)}`);
  return { ok: true };
}

async function getTableMetadata(database, schema, table) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid name');
  const full = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const sql = `SELECT
    pg_catalog.pg_get_userbyid(c.relowner) AS owner,
    pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) AS total_size,
    pg_catalog.pg_size_pretty(pg_catalog.pg_table_size(c.oid)) AS table_size,
    pg_catalog.pg_size_pretty(pg_catalog.pg_indexes_size(c.oid)) AS index_size,
    c.reltuples::bigint AS estimated_rows,
    pg_catalog.obj_description(c.oid, 'pg_class') AS table_comment,
    (SELECT collname FROM pg_collation WHERE oid = c.relcollation) AS collation,
    (SELECT COUNT(*)::int FROM pg_catalog.pg_index WHERE indrelid = c.oid) AS index_count,
    (SELECT COUNT(*)::int FROM pg_catalog.pg_trigger WHERE tgrelid = c.oid AND tgisinternal = false) AS trigger_count
  FROM pg_catalog.pg_class c
  WHERE c.relname = $1 AND c.relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = $2)`;
  const row = await queryOne(database, sql, [table, schema]);
  if (!row) throw new Error('Table not found');
  return row;
}

async function setTableComment(database, schema, table, comment) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid name');
  const val = (comment !== null && comment !== undefined && comment !== '') ? quoteLiteral(comment) : 'NULL';
  await exec(database, `COMMENT ON TABLE ${quoteIdent(schema)}.${quoteIdent(table)} IS ${val}`);
  return { ok: true };
}

async function getColumnComments(database, schema, table) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid name');
  const sql = `SELECT a.attname AS column_name,
    pg_catalog.col_description(a.attrelid, a.attnum) AS comment
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
  WHERE c.relname = $1
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND c.relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = $2)
  ORDER BY a.attnum`;
  return await queryRows(database, sql, [table, schema]);
}

async function setColumnComment(database, schema, table, column, comment) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(table) || !validateIdent(column)) throw new Error('Invalid name');
  const val = (comment !== null && comment !== undefined && comment !== '') ? quoteLiteral(comment) : 'NULL';
  await exec(database, `COMMENT ON COLUMN ${quoteIdent(schema)}.${quoteIdent(table)}.${quoteIdent(column)} IS ${val}`);
  return { ok: true };
}

async function exportTableData(database, schema, table, format) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid name');
  const full = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const rows = await queryRows(database, `SELECT * FROM ${full} ORDER BY (SELECT NULL)`);
  const cols = rows.length ? Object.keys(rows[0]) : [];

  if (format === 'csv') {
    const header = cols.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
    const data = rows.map(r => cols.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return '';
      const s = String(v);
      return `"${s.replace(/"/g, '""')}"`;
    }).join(','));
    return { content: [header, ...data].join('\n'), contentType: 'text/csv', ext: 'csv' };
  }

  if (format === 'json') {
    return { content: JSON.stringify(rows, null, 2), contentType: 'application/json', ext: 'json' };
  }

  // Default: SQL INSERT statements
  const tableFull = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const colList = cols.map(c => quoteIdent(c)).join(', ');
  const lines = rows.map(r => {
    const vals = cols.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return String(v);
      return quoteLiteral(v);
    }).join(', ');
    return `INSERT INTO ${tableFull} (${colList}) VALUES (${vals});`;
  });
  const header_ = `-- Export of ${schema}.${table}\n-- ${new Date().toISOString()}\n\n`;
  return { content: header_ + lines.join('\n'), contentType: 'text/sql', ext: 'sql' };
}

async function runQuery(database, sql, params) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  const result = await query(database, sql, params || []);
  return { rows: result.rows, rowCount: result.rowCount, fields: result.fields?.map(f => ({ name: f.name, dataType: f.dataTypeID })) };
}

async function checkConnection() {
  try {
    await queryOne('postgres', 'SELECT 1 AS test');
    return true;
  } catch { return false; }
}

function quoteLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  const s = String(val);
  return `'${s.replace(/'/g, "''")}'`;
}

/* ─── Import CSV / SQL ─── */

async function importTableData(database, schema, table, format, content) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid name');
  if (!content || !content.trim()) throw new Error('No content to import');

  if (format === 'csv') {
    const lines = content.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');
    const header = parseCSVLine(lines[0]);
    const cols = header.map(c => {
      if (!validateIdent(c)) throw new Error(`Invalid column name in CSV header: ${c}`);
      return c;
    });
    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      if (vals.length !== cols.length) continue;
      const row = {};
      cols.forEach((c, idx) => { row[c] = vals[idx]; });
      await insertRow(database, schema, table, row);
      imported++;
    }
    return { ok: true, rowsImported: imported };
  }

  if (format === 'sql') {
    // Execute each SQL statement separated by semicolons
    const stmts = content.split(';').map(s => s.trim()).filter(s => s.length > 0);
    let executed = 0;
    for (const stmt of stmts) {
      await exec(database, stmt);
      executed++;
    }
    return { ok: true, statementsExecuted: executed };
  }

  throw new Error('Unsupported import format (csv or sql)');
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

/* ─── Foreign Keys ─── */

async function getForeignKeys(database, schema, table) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid name');
  const sql = `SELECT
    tc.constraint_name,
    kcu.column_name,
    ccu.table_schema AS foreign_schema,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column,
    rc.update_rule,
    rc.delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
  JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2
  ORDER BY kcu.ordinal_position`;
  return await queryRows(database, sql, [schema, table]);
}

/* ─── Index Management ─── */

async function listIndexes(database, schema, table) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid name');
  return await queryRows(database,
    `SELECT indexname, indexdef, tablename, schemaname FROM pg_catalog.pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname`,
    [schema, table]
  );
}

async function createIndex(database, schema, table, indexName, column, unique, method) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(table)) throw new Error('Invalid name');
  if (!validateIdent(column)) throw new Error('Invalid column name');
  const name = indexName || `${table}_${column}_idx`;
  if (!validateIdent(name)) throw new Error('Invalid index name');
  const uniqueStr = unique ? 'UNIQUE ' : '';
  const methodStr = method && ['btree','hash','gist','gin','brin'].includes(method) ? ` USING ${method}` : '';
  await exec(database, `CREATE ${uniqueStr}INDEX ${quoteIdent(name)} ON ${quoteIdent(schema)}.${quoteIdent(table)}${methodStr} (${quoteIdent(column)})`);
  return { ok: true, indexName: name };
}

async function dropIndex(database, schema, indexName) {
  if (!validateIdent(database) || !validateIdent(indexName)) throw new Error('Invalid name');
  await exec(database, `DROP INDEX ${quoteIdent(schema)}.${quoteIdent(indexName)}`);
  return { ok: true };
}

/* ─── Batch Delete ─── */

async function deleteRows(database, schema, table, pkCol, pkVals) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(table) || !validateIdent(pkCol)) throw new Error('Invalid name');
  if (!Array.isArray(pkVals) || !pkVals.length) throw new Error('No values provided');
  const placeholders = pkVals.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `DELETE FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${quoteIdent(pkCol)} IN (${placeholders}) RETURNING *`;
  const result = await query(database, sql, pkVals);
  return { rows: result.rows, rowCount: result.rowCount };
}

/* ─── View Management ─── */

async function listViews(database, schema) {
  if (!validateIdent(database)) throw new Error('Invalid database name');
  const schemaFilter = schema && validateIdent(schema) ? `AND table_schema = ${quoteLiteral(schema)}` : `AND table_schema NOT IN ('pg_catalog','information_schema','pg_toast')`;
  return await queryRows(database, `SELECT table_schema, table_name AS view_name, view_definition FROM information_schema.views WHERE 1=1 ${schemaFilter} ORDER BY table_schema, table_name`);
}

async function createView(database, schema, viewName, query) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(viewName)) throw new Error('Invalid name');
  if (!query || !query.trim()) throw new Error('View query required');
  await exec(database, `CREATE VIEW ${quoteIdent(schema)}.${quoteIdent(viewName)} AS ${query}`);
  return { ok: true, schema, viewName };
}

async function dropView(database, schema, viewName) {
  if (!validateIdent(database) || !validateIdent(schema) || !validateIdent(viewName)) throw new Error('Invalid name');
  await exec(database, `DROP VIEW IF EXISTS ${quoteIdent(schema)}.${quoteIdent(viewName)}`);
  return { ok: true };
}

/* ─── Export Query Results ─── */

async function exportQueryResult(rows, format) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('No rows to export');
  const cols = Object.keys(rows[0]);

  if (format === 'csv') {
    const header = cols.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
    const data = rows.map(r => cols.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return '';
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(','));
    return { content: [header, ...data].join('\n'), contentType: 'text/csv', ext: 'csv' };
  }

  if (format === 'json') {
    return { content: JSON.stringify(rows, null, 2), contentType: 'application/json', ext: 'json' };
  }

  // SQL INSERT
  const colList = cols.map(c => quoteIdent(c)).join(', ');
  const lines = rows.map(r => {
    const vals = cols.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return String(v);
      return quoteLiteral(v);
    }).join(', ');
    return `INSERT INTO result (${colList}) VALUES (${vals});`;
  });
  const h = `-- Query Result Export\n-- ${new Date().toISOString()}\n\n`;
  return { content: h + lines.join('\n'), contentType: 'text/sql', ext: 'sql' };
}

async function close() {
  for (const [key, pool] of pools) {
    try { await pool.end(); } catch {}
  }
  pools.clear();
}

module.exports = {
  query, queryOne, queryRows, exec, close,
  listDatabases, listRoles, createRole,
  listTables, listSchemas, listExtensions,
  getTableInfo, getTableData,
  createTable, alterTable, dropTable, duplicateTable, renameTable, truncateTable,
  vacuumTable, analyzeTable, getTableMetadata, setTableComment,
  getColumnComments, setColumnComment, exportTableData,
  importTableData,
  getForeignKeys,
  listIndexes, createIndex, dropIndex,
  deleteRows,
  listViews, createView, dropView,
  exportQueryResult,
  getDbConfig, updateDbConfig,
  createDatabase, dropDatabase, runQuery,
  insertRow, updateRow, deleteRow,
  checkConnection, validateIdent, quoteIdent, quoteLiteral,
};