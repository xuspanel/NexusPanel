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
  createTable, alterTable, dropTable,
  getDbConfig, updateDbConfig,
  createDatabase, dropDatabase, runQuery,
  insertRow, updateRow, deleteRow,
  checkConnection, validateIdent, quoteIdent, quoteLiteral,
};