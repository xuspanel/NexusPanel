const { runSafeSync } = require('../utils/shell');

const MYSQL_PORT = parseInt(process.env.NEXUSPANEL_MYSQL_PORT || '3307', 10);

function getPort() {
  return MYSQL_PORT;
}

const IDENT_RE = /^[a-zA-Z0-9_]{1,32}$/;

function validateIdent(name) {
  if (typeof name !== 'string' || !IDENT_RE.test(name)) {
    throw new Error('Invalid MariaDB identifier: ' + String(name).slice(0, 32));
  }
  return name;
}

function quoteIdent(name) {
  return '`' + validateIdent(name).replace(/`/g, '``') + '`';
}

function quoteString(value) {
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function runSql(sql, timeout) {
  const r = runSafeSync('mysql', ['--no-defaults', '-N', '-e', sql], { timeout: timeout || 30000 });
  if (r.status !== 0) {
    const msg = ((r.stderr || '') + (r.stdout || '') + (r.error || '')).trim();
    throw new Error('MariaDB error: ' + (msg || 'unknown error'));
  }
  return r.stdout || '';
}

function isUp() {
  const svc = runSafeSync('systemctl', ['is-active', 'mariadb'], { timeout: 5000 });
  if (svc.status === 0 && (svc.stdout || '').trim() === 'active') return true;
  const alt = runSafeSync('systemctl', ['is-active', 'mysqld'], { timeout: 5000 });
  if (alt.status === 0 && (alt.stdout || '').trim() === 'active') return true;
  try {
    runSql('SELECT 1;', 5000);
    return true;
  } catch (_) {}
  return false;
}

function checkRootAccess() {
  runSql('SELECT 1;', 8000);
  return true;
}

function databaseExists(name) {
  try {
    const out = runSql("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = " + quoteString(validateIdent(name)) + ';');
    return out.trim() !== '';
  } catch (_) {
    return false;
  }
}

function userExists(name) {
  try {
    const out = runSql("SELECT User FROM mysql.user WHERE User = " + quoteString(validateIdent(name)) + " AND Host = 'localhost';");
    return out.trim() !== '';
  } catch (_) {
    return false;
  }
}

function createDatabase(name) {
  validateIdent(name);
  runSql('CREATE DATABASE IF NOT EXISTS ' + quoteIdent(name) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
  return { ok: true, name };
}

function createUser(name, password) {
  validateIdent(name);
  runSql("CREATE USER IF NOT EXISTS " + quoteIdent(name) + "@'localhost' IDENTIFIED BY " + quoteString(password) + ';');
  return { ok: true, name };
}

function grantAll(database, user) {
  validateIdent(database);
  validateIdent(user);
  runSql('GRANT ALL PRIVILEGES ON ' + quoteIdent(database) + '.* TO ' + quoteIdent(user) + "@'localhost'; FLUSH PRIVILEGES;");
  return { ok: true, database, user };
}

function dropDatabase(name) {
  validateIdent(name);
  runSql('DROP DATABASE IF EXISTS ' + quoteIdent(name) + ';');
  return { ok: true, name };
}

function dropUser(name) {
  validateIdent(name);
  runSql("DROP USER IF EXISTS " + quoteIdent(name) + "@'localhost'; FLUSH PRIVILEGES;");
  return { ok: true, name };
}

module.exports = {
  MYSQL_PORT,
  getPort,
  validateIdent,
  isUp,
  checkRootAccess,
  databaseExists,
  userExists,
  createDatabase,
  createUser,
  grantAll,
  dropDatabase,
  dropUser,
};
