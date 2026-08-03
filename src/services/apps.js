const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { runSafeSync, validators } = require('../utils/shell');
const domains = require('./domains');
const mysql = require('./mysql');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const APPS_FILE = path.join(DATA_DIR, 'apps.json');
const APP_LOG_DIR = path.join(DATA_DIR, 'apps');
const SCRIPTS_DIR = path.join(__dirname, '..', '..', 'scripts', 'apps');
const PHP_POOL_DIR = '/etc/php-fpm.d';
const PHP_SOCKET_DIR = '/run/php-fpm';
const MAX_CONCURRENT_PER_USER = 2;
const APP_PORT_START = 41000;
const APP_PORT_END = 49999;
const DEFAULT_TIMEOUT = 1800000;

const CATALOG = {
  wordpress: {
    name: 'WordPress',
    icon: '🚀',
    runtime: 'PHP 8.3 · WP-CLI',
    db: 'MariaDB',
    needsDb: true,
    needsPhp: true,
    desc: 'The world\'s most popular CMS, installed via WP-CLI with a dedicated MariaDB database.',
  },
  laravel: {
    name: 'Laravel',
    icon: '🧩',
    runtime: 'PHP 8.3 · Composer',
    db: 'MariaDB',
    needsDb: true,
    needsPhp: true,
    desc: 'Full-stack PHP framework scaffolded with Composer, keyed and connected to MariaDB.',
  },
  node: {
    name: 'Node.js (Express)',
    icon: '🟢',
    runtime: 'Node 20 · PM2',
    db: '—',
    needsDb: false,
    needsPhp: false,
    desc: 'Express server managed by PM2, reverse-proxied through nginx on your domain.',
  },
  nextjs: {
    name: 'Next.js (Static)',
    icon: '▲',
    runtime: 'Next.js · PM2',
    db: '—',
    needsDb: false,
    needsPhp: false,
    desc: 'Static-exported Next.js site, built with npm and served under PM2.',
  },
  static: {
    name: 'Static HTML',
    icon: '📄',
    runtime: 'nginx',
    db: '—',
    needsDb: false,
    needsPhp: false,
    desc: 'A clean branded placeholder page served directly by nginx.',
  },
};

let writeLock = Promise.resolve();

function withLock(fn) {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => {});
  return run;
}

function loadApps() {
  try {
    if (fs.existsSync(APPS_FILE)) {
      return JSON.parse(fs.readFileSync(APPS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Apps] Failed to load apps.json:', err.message);
  }
  return [];
}

function saveApps(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = APPS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, APPS_FILE);
}

function getCatalog() {
  return Object.entries(CATALOG).map(([key, meta]) => Object.assign({ app_type: key }, meta));
}

function genPassword() {
  return crypto.randomBytes(24).toString('base64url');
}

let encKey = null;
function getKey() {
  if (!encKey) {
    const secret = process.env.JWT_SECRET || 'nexuspanel-default-secret';
    encKey = crypto.scryptSync(secret, 'nexuspanel-apps-v1', 32);
  }
  return encKey;
}

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('base64') + ':' + tag.toString('base64') + ':' + enc.toString('base64');
}

function decryptSecret(token) {
  if (!token) return '';
  try {
    const parts = String(token).split(':');
    if (parts.length !== 3) return '';
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const enc = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (_) {
    return '';
  }
}

const logBuffers = new Map();

function initLog(id) {
  logBuffers.set(id, []);
  try {
    if (!fs.existsSync(APP_LOG_DIR)) fs.mkdirSync(APP_LOG_DIR, { recursive: true });
  } catch (_) {}
}

function appendLog(id, text) {
  const lines = String(text).split(/\r?\n/).filter(l => l.length > 0);
  if (!lines.length) return;
  const buf = logBuffers.get(id) || [];
  for (const l of lines) {
    const ts = new Date().toISOString();
    buf.push(ts.slice(11, 19) + '  ' + l);
  }
  while (buf.length > 1000) buf.shift();
  logBuffers.set(id, buf);
  try {
    if (!fs.existsSync(APP_LOG_DIR)) fs.mkdirSync(APP_LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(APP_LOG_DIR, id + '.log'), lines.map(l => new Date().toISOString() + '  ' + l).join('\n') + '\n', 'utf8');
  } catch (_) {}
}

function getLog(id, lines) {
  const n = Math.min(parseInt(lines, 10) || 50, 1000);
  const buf = logBuffers.get(id);
  if (buf) return buf.slice(-n);
  try {
    const file = path.join(APP_LOG_DIR, id + '.log');
    if (!fs.existsSync(file)) return [];
    const content = fs.readFileSync(file, 'utf8');
    const arr = content.split('\n').filter(l => l.length > 0);
    return arr.slice(-n).map(l => l.length > 21 ? l.slice(11, 21) + l.slice(25) : l);
  } catch (_) {
    return [];
  }
}

const activeInstalls = new Map();

function acquireInstallSlot(user) {
  const n = activeInstalls.get(user) || 0;
  if (n >= MAX_CONCURRENT_PER_USER) return false;
  activeInstalls.set(user, n + 1);
  return true;
}

function releaseInstallSlot(user) {
  const n = activeInstalls.get(user) || 0;
  if (n <= 1) activeInstalls.delete(user);
  else activeInstalls.set(user, n - 1);
}

function runRootLogged(id, cmd, args, opts) {
  const options = opts || {};
  const env = Object.assign({}, options.env || {});
  const fullArgs = [...Object.entries(env).map(([k, v]) => k + '=' + v), cmd, ...(args || [])];
  appendLog(id, '$ ' + cmd + ' ' + (args || []).join(' '));
  return spawnLogged(id, 'env', fullArgs, options.cwd, options.timeout);
}

function runAsUserLogged(id, user, cmd, args, opts) {
  const options = opts || {};
  const env = Object.assign({
    HOME: '/home/' + user,
    PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  }, options.env || {});
  const sudoArgs = ['-u', user, '--', 'env', ...Object.entries(env).map(([k, v]) => k + '=' + v), cmd, ...(args || [])];
  appendLog(id, '$ sudo -u ' + user + ' ' + cmd + ' ' + (args || []).join(' '));
  return spawnLogged(id, 'sudo', sudoArgs, options.cwd, options.timeout);
}

function spawnLogged(id, bin, args, cwd, timeout) {
  return new Promise((resolve) => {
    let killed = false;
    const timer = timeout ? setTimeout(() => { killed = true; try { p.kill('SIGKILL'); } catch (_) {} }, timeout) : null;
    let out = '', err = '';
    let p;
    try {
      p = spawn(bin, args, { cwd });
    } catch (e) {
      resolve({ status: 1, stdout: '', stderr: String(e && e.message || e) });
      return;
    }
    p.stdout.on('data', d => { out += d; appendLog(id, d.toString()); });
    p.stderr.on('data', d => { err += d; appendLog(id, d.toString()); });
    p.on('error', e => {
      err += String(e.message || e);
      appendLog(id, String(e.message || e));
      if (timer) clearTimeout(timer);
      resolve({ status: 1, stdout: out, stderr: err, killed });
    });
    p.on('close', code => {
      if (timer) clearTimeout(timer);
      resolve({ status: code, stdout: out, stderr: err, killed });
    });
  });
}

async function step(id, label, fn) {
  appendLog(id, '→ ' + label);
  const started = Date.now();
  try {
    const r = await fn();
    appendLog(id, '✓ ' + label + ' (' + ((Date.now() - started) / 1000).toFixed(1) + 's)');
    return r;
  } catch (e) {
    appendLog(id, '✗ ' + label + ': ' + (e && e.message || e));
    throw e;
  }
}

function tail(text, n) {
  const s = String(text || '');
  const lines = s.split('\n').filter(Boolean);
  return lines.slice(-(n || 8)).join('\n') || s.slice(-400);
}

async function listSystemUsers() {
  const { execFile } = require('child_process');
  const raw = await new Promise((resolve) => {
    execFile('getent', ['passwd'], (err, stdout) => resolve(err ? '' : stdout));
  });
  return String(raw).split('\n').filter(Boolean).map(line => {
    const parts = line.split(':');
    if (parts.length < 7) return null;
    const uid = parseInt(parts[2], 10);
    if (Number.isNaN(uid) || uid < 1000) return null;
    const shell = parts[6];
    if (shell && (shell.includes('nologin') || shell.includes('false'))) return null;
    return { username: parts[0], uid, gid: parts[3], home: parts[5], shell };
  }).filter(Boolean).sort((a, b) => a.username.localeCompare(b.username));
}

function listTargetDomains() {
  const active = new Set(
    loadApps().filter(a => a.status !== 'removed' && a.status !== 'failed').map(a => a.domain)
  );
  const result = domains.listDomains({ limit: 500 });
  return result.domains.filter(d => !active.has(d.domain)).map(d => ({
    domain: d.domain,
    port: d.port,
    ssl: d.sslEnabled,
    url: buildUrl(d.domain, d.port, d.sslEnabled),
  }));
}

function buildUrl(domain, port, sslEnabled) {
  const scheme = sslEnabled ? 'https' : 'http';
  const showPort = sslEnabled ? (port && port !== 443 ? ':' + port : '') : (port && port !== 80 ? ':' + port : '');
  return scheme + '://' + domain + showPort;
}

function makeDbIdent(base) {
  const clean = String(base).replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 12) || 'app';
  return 'nxp_' + clean + '_' + crypto.randomBytes(2).toString('hex');
}

function findAppPort() {
  const used = new Set(domains.getUsedPorts());
  for (const a of loadApps()) {
    if (a.status !== 'removed' && a.status !== 'failed' && a.proxy_port) used.add(parseInt(a.proxy_port, 10));
  }
  for (let p = APP_PORT_START; p <= APP_PORT_END; p++) {
    if (!used.has(p)) return p;
  }
  throw new Error('No free application port in range ' + APP_PORT_START + '-' + APP_PORT_END);
}

function resolveInstallPath(user, domain) {
  if (!validators.domain.test(domain)) throw new Error('Invalid domain: ' + domain);
  if (!/^[a-zA-Z][a-zA-Z0-9._-]{0,31}$/.test(user)) throw new Error('Invalid system user: ' + user);
  if (user === 'root') throw new Error('Installing as root is not allowed');
  const base = path.join('/home', user, 'domains', domain, 'public_html');
  const resolved = path.resolve(base);
  if (!resolved.startsWith('/home/' + user + '/')) {
    throw new Error('Install path escapes user home');
  }
  return resolved;
}

function appPublicDir(appType, installPath) {
  if (appType === 'laravel') return path.join(installPath, 'public');
  return installPath;
}

function needsPhp(appType) {
  return appType === 'wordpress' || appType === 'laravel';
}

function needsDb(appType) {
  return appType === 'wordpress' || appType === 'laravel';
}

function appRequiresPrereq(appType) {
  return appType === 'wordpress' || appType === 'laravel';
}

async function ensurePrereqs(id, appType) {
  if (!appRequiresPrereq(appType)) return;

  await step(id, 'Check PHP extensions', async () => {
    const r = await runRootLogged(id, 'php', ['-m']);
    const mods = r.stdout || '';
    if (!mods.includes('pdo_mysql') || !mods.includes('mysqli')) {
      appendLog(id, 'PHP MySQL extensions missing, installing php-mysqlnd...');
      const dnf = await runRootLogged(id, 'dnf', ['install', '-y', 'php-mysqlnd'], { timeout: DEFAULT_TIMEOUT });
      if (dnf.status !== 0) throw new Error('php-mysqlnd install failed: ' + tail(dnf.stderr || dnf.stdout));
      const rel = await runRootLogged(id, 'systemctl', ['reload', 'php-fpm']);
      if (rel.status !== 0) appendLog(id, 'warning: php-fpm reload after extension install failed');
    }
  });

  if (appType === 'wordpress') {
    await step(id, 'Ensure WP-CLI', async () => {
      const chk = runSafeSync('bash', ['-lc', 'test -x /usr/local/bin/wp && echo ok']);
      if (chk.status !== 0) {
        appendLog(id, 'Downloading WP-CLI...');
        const dl = await runRootLogged(id, 'curl', ['-fsSL', '-o', '/usr/local/bin/wp', 'https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar'], { timeout: 300000 });
        if (dl.status !== 0) throw new Error('WP-CLI download failed: ' + tail(dl.stderr || dl.stdout));
        const ch = await runRootLogged(id, 'chmod', ['+x', '/usr/local/bin/wp']);
        if (ch.status !== 0) throw new Error('chmod wp failed');
      }
    });
  }

  if (appType === 'laravel') {
    await step(id, 'Ensure Composer', async () => {
      const chk = runSafeSync('bash', ['-lc', 'test -x /usr/local/bin/composer && echo ok']);
      if (chk.status !== 0) {
        appendLog(id, 'Installing Composer...');
        const dl = await runRootLogged(id, 'bash', ['-lc', 'curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer'], { timeout: 300000 });
        if (dl.status !== 0) throw new Error('Composer install failed: ' + tail(dl.stderr || dl.stdout));
      }
    });
  }
}

async function ensureMysqlReady(id) {
  if (!fs.existsSync('/etc/my.cnf.d')) fs.mkdirSync('/etc/my.cnf.d', { recursive: true });
  const dropIn = '/etc/my.cnf.d/zz-nexuspanel-apps.cnf';
  const conf = '[mysqld]\nport = ' + mysql.getPort() + '\nbind-address = 127.0.0.1\n';
  if (!fs.existsSync(dropIn) || fs.readFileSync(dropIn, 'utf8') !== conf) {
    fs.writeFileSync(dropIn, conf, 'utf8');
    appendLog(id, 'Configured MariaDB to listen on 127.0.0.1:' + mysql.getPort());
  }
  if (mysql.isUp()) return;
  appendLog(id, 'MariaDB not active — installing...');
  const dnf = await runRootLogged(id, 'dnf', ['install', '-y', 'mariadb-server', 'php-mysqlnd'], { timeout: DEFAULT_TIMEOUT });
  if (dnf.status !== 0) throw new Error('MariaDB install failed: ' + tail(dnf.stderr || dnf.stdout));
  const en = await runRootLogged(id, 'systemctl', ['enable', '--now', 'mariadb']);
  if (en.status !== 0) throw new Error('MariaDB enable/start failed: ' + tail(en.stderr || en.stdout));
  if (!mysql.isUp()) throw new Error('MariaDB failed to start');
}

function ensurePhpPool(user) {
  const poolFile = path.join(PHP_POOL_DIR, user + '.conf');
  if (fs.existsSync(poolFile)) return false;
  const conf = '[' + user + ']\n' +
    'user = ' + user + '\n' +
    'group = ' + user + '\n' +
    'listen = ' + PHP_SOCKET_DIR + '/apps-' + user + '.sock\n' +
    'listen.owner = nginx\n' +
    'listen.group = nginx\n' +
    'listen.mode = 0660\n' +
    'pm = ondemand\n' +
    'pm.max_children = 12\n' +
    'pm.process_idle_timeout = 15s\n' +
    'pm.max_requests = 500\n' +
    'catch_workers_output = yes\n' +
    'security.limit_extensions = .php\n' +
    'php_admin_value[open_basedir] = /home/' + user + '/:/tmp/\n';
  fs.writeFileSync(poolFile, conf, 'utf8');
  const test = runSafeSync('php-fpm', ['-t'], { timeout: 10000 });
  if (test.status !== 0) {
    try { fs.unlinkSync(poolFile); } catch (_) {}
    throw new Error('php-fpm pool config test failed: ' + tail((test.stdout || '') + (test.stderr || '')));
  }
  const rel = runSafeSync('systemctl', ['reload', 'php-fpm'], { timeout: 10000 });
  if (rel.status !== 0) {
    appendLog(String(id || ''), 'warning: php-fpm reload after pool create failed');
  }
  return true;
}

function removePhpPool(user) {
  const poolFile = path.join(PHP_POOL_DIR, user + '.conf');
  if (!fs.existsSync(poolFile)) return;
  try {
    fs.unlinkSync(poolFile);
    runSafeSync('systemctl', ['reload', 'php-fpm'], { timeout: 10000 });
  } catch (_) {}
}

function appStillNeedsPhp(user, excludeId) {
  return loadApps().some(a =>
    a.user_id === user && a.id !== excludeId && a.status !== 'removed' && a.status !== 'failed' && needsPhp(a.app_type)
  );
}

function appStillNeedsPm2(user, pm2Name) {
  return loadApps().some(a =>
    a.user_id === user && a.status !== 'removed' && a.status !== 'failed' && a.pm2_name && a.pm2_name === pm2Name
  );
}

async function removePm2App(id, user, pm2Name) {
  if (!pm2Name) return;
  try {
    await runAsUserLogged(id, user, 'pm2', ['delete', pm2Name], {
      env: { PM2_HOME: '/home/' + user + '/.pm2' },
      timeout: 60000,
    });
    await runAsUserLogged(id, user, 'pm2', ['save'], {
      env: { PM2_HOME: '/home/' + user + '/.pm2' },
      timeout: 60000,
    });
  } catch (_) {}
}

async function provisionDb(id, rec) {
  await step(id, 'Provision MariaDB database', async () => {
    rec.db_name = makeDbIdent(rec.domain);
    rec.db_user = rec.db_name.slice(0, 16);
    rec.db_password = genPassword();
    rec.db_password_encrypted = encryptSecret(rec.db_password);
    mysql.createDatabase(rec.db_name);
    mysql.createUser(rec.db_user, rec.db_password);
    mysql.grantAll(rec.db_name, rec.db_user);
    appendLog(id, 'Created database ' + rec.db_name + ' and user ' + rec.db_user);
  });
}

async function rollbackDb(id, rec) {
  try {
    if (rec.db_name) mysql.dropDatabase(rec.db_name);
    if (rec.db_user) mysql.dropUser(rec.db_user);
  } catch (e) {
    appendLog(id, 'DB rollback partial: ' + (e && e.message || e));
  }
}

function getDomainSnapshot(name) {
  const d = domains.getDomain(name);
  return { type: d.type, port: d.port, sslEnabled: d.sslEnabled, root: d.root };
}

async function applyAppNginx(id, rec) {
  const name = rec.domain;
  const snap = getDomainSnapshot(name);
  rec.nginx_prev_root = snap.root;

  if (rec.web_mode === 'proxy') {
    const conf = domains.generateAppNginxConf(name, snap.port, snap.sslEnabled, {
      proxyPass: 'http://127.0.0.1:' + rec.proxy_port + '/',
    });
    domains.writeNginxConf(name, conf);
    domains.nginxTestAndReload();
    appendLog(id, 'nginx: proxy_pass → 127.0.0.1:' + rec.proxy_port);
  } else if (needsPhp(rec.app_type)) {
    const conf = domains.generateAppNginxConf(name, snap.port, snap.sslEnabled, {
      root: rec.web_root,
      phpSocket: PHP_SOCKET_DIR + '/apps-' + rec.user_id + '.sock',
    });
    domains.writeNginxConf(name, conf);
    domains.nginxTestAndReload();
    appendLog(id, 'nginx: root → ' + rec.web_root + ' via php-fpm ' + PHP_SOCKET_DIR + '/apps-' + rec.user_id + '.sock');
  } else {
    domains.editDomain(name, { root: rec.web_root });
    appendLog(id, 'nginx: root → ' + rec.web_root);
  }
}

async function revertAppNginx(id, rec) {
  try {
    const name = rec.domain;
    const snap = getDomainSnapshot(name);
    if (rec.web_mode === 'proxy') {
      const conf = domains.generateNginxConf(name, snap.port, snap.sslEnabled, snap.type, { root: rec.nginx_prev_root || snap.root });
      domains.writeNginxConf(name, conf);
      domains.nginxTestAndReload();
      appendLog(id, 'nginx reverted to static root');
    } else {
      domains.editDomain(name, { root: rec.nginx_prev_root || snap.root });
      appendLog(id, 'nginx root reverted to ' + (rec.nginx_prev_root || snap.root));
    }
  } catch (e) {
    appendLog(id, 'nginx revert partial: ' + (e && e.message || e));
  }
}

async function performInstall(rec) {
  const id = rec.id;
  initLog(id);
  const user = rec.user_id;
  const appType = rec.app_type;
  appendLog(id, 'Starting ' + CATALOG[appType].name + ' install for ' + rec.domain + ' as ' + user);
  rec.status = 'installing';
  await saveRecord(rec);

  let poolCreated = false;
  try {
    await step(id, 'Install prerequisites', async () => {
      if (needsDb(appType)) await ensureMysqlReady(id);
      await ensurePrereqs(id, appType);
    });

    await step(id, 'Prepare system user home', async () => {
      const hm = await runRootLogged(id, 'chmod', ['o+x', '/home/' + user]);
      if (hm.status !== 0) appendLog(id, 'warning: could not make home traversable');
      if (needsPhp(appType)) {
        poolCreated = ensurePhpPool(user);
        rec.php_pool_created = true;
      }
    });

    if (needsDb(appType)) {
      await provisionDb(id, rec);
    }

    await step(id, 'Create install directory', async () => {
      if (appType === 'laravel') {
        try { if (fs.existsSync(rec.install_path)) fs.rmSync(rec.install_path, { recursive: true, force: true }); } catch (_) {}
        const parentDir = path.dirname(rec.install_path);
        if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
        const chown = await runRootLogged(id, 'chown', ['-R', user + ':' + user, parentDir]);
        if (chown.status !== 0) throw new Error('chown failed: ' + tail(chown.stderr || chown.stdout));
      } else {
        if (fs.existsSync(rec.install_path)) {
          const entries = fs.readdirSync(rec.install_path);
          if (entries.length > 0) throw new Error('Install path is not empty: ' + rec.install_path);
        } else {
          fs.mkdirSync(rec.install_path, { recursive: true });
        }
        const chown = await runRootLogged(id, 'chown', ['-R', user + ':' + user, rec.install_path]);
        if (chown.status !== 0) throw new Error('chown failed: ' + tail(chown.stderr || chown.stdout));
      }
    });

    const script = {
      wordpress: 'wordpress.sh',
      laravel: 'laravel.sh',
      node: 'node-express.sh',
      nextjs: 'nextjs.sh',
      static: 'static.sh',
    }[appType];

    const scriptEnv = {
      INSTALL_PATH: rec.install_path,
      DOMAIN: rec.domain,
      APP_URL: rec.url,
      SITE_TITLE: rec.options && rec.options.title || rec.domain,
      ADMIN_USER: rec.admin_username,
      ADMIN_PASSWORD: rec.admin_password_plain,
    };
    if (needsDb(appType)) {
      scriptEnv.DB_NAME = rec.db_name;
      scriptEnv.DB_USER = rec.db_user;
      scriptEnv.DB_PASSWORD = rec.db_password;
      scriptEnv.DB_PORT = String(mysql.getPort());
    }
    if (appType === 'wordpress') {
      scriptEnv.ADMIN_EMAIL = rec.options && rec.options.admin_email || 'admin@' + rec.domain;
    }
    if (appType === 'node' || appType === 'nextjs') {
      scriptEnv.PORT = String(rec.proxy_port);
      scriptEnv.APP_NAME = rec.options && rec.options.title || rec.domain;
    }

    await step(id, 'Run installer script: ' + script, async () => {
      const r = await runAsUserLogged(id, user, 'bash', [path.join(SCRIPTS_DIR, script)], { env: scriptEnv, timeout: DEFAULT_TIMEOUT });
      if (r.status !== 0) {
        throw new Error('Installer script failed (exit ' + r.status + ')' + (r.killed ? ' — timed out' : ''));
      }
    });

    await step(id, 'Fix permissions', async () => {
      const chown = await runRootLogged(id, 'chown', ['-R', user + ':' + user, rec.install_path]);
      const chmod = await runRootLogged(id, 'chmod', ['-R', '755', rec.install_path]);
      const configFiles = ['wp-config.php', '.env'];
      for (const f of configFiles) {
        const p = path.join(rec.install_path, f);
        if (fs.existsSync(p)) await runRootLogged(id, 'chmod', ['600', p]);
      }
      if (chown.status !== 0 || chmod.status !== 0) throw new Error('permission fix failed');
    });

    if (appType === 'node' || appType === 'nextjs') {
      await step(id, 'Start app under PM2', async () => {
        const pm2Env = { PM2_HOME: '/home/' + user + '/.pm2', PORT: String(rec.proxy_port) };
        let r;
        if (appType === 'node') {
          r = await runAsUserLogged(id, user, 'pm2', ['start', 'server.js', '--name', rec.pm2_name, '--cwd', rec.install_path], { env: pm2Env, cwd: rec.install_path, timeout: 120000 });
        } else {
          const launcher = path.join(rec.install_path, 'run.sh');
          const launcherContent = '#!/usr/bin/env bash\ncd "' + rec.install_path + '"\nexec npx --yes serve -l tcp://127.0.0.1:' + rec.proxy_port + ' out\n';
          fs.writeFileSync(launcher, launcherContent);
          fs.chmodSync(launcher, 0o755);
          r = await runAsUserLogged(id, user, 'pm2', ['start', launcher, '--name', rec.pm2_name], { env: pm2Env, timeout: 120000 });
        }
        if (r.status !== 0) {
          const out = tail(r.stderr || r.stdout);
          appendLog(id, 'pm2 start failed; output: ' + out);
          throw new Error('pm2 start failed');
        }
        const save = await runAsUserLogged(id, user, 'pm2', ['save'], { env: pm2Env, timeout: 60000 });
        if (save.status !== 0) appendLog(id, 'warning: pm2 save failed');
      });
    }

    await step(id, 'Configure nginx', async () => {
      await applyAppNginx(id, rec);
    });

    await step(id, 'Verify deployment', async () => {
      const snapPort = getDomainSnapshot(rec.domain).port;
      const hostPort = (snapPort && snapPort !== 80 && snapPort !== 443) ? ':' + snapPort : '';
      const hostHeader = rec.domain + hostPort;
      const verify = await runAsUserLogged(id, user, 'bash', ['-lc', 'curl -fsS -o /dev/null -w "%{http_code}" -H "Host: ' + hostHeader + '" http://127.0.0.1:' + snapPort + '/'], { timeout: 60000 });
      const code = (verify.stdout || '').trim();
      if (verify.status === 0 && code && code.startsWith('2')) {
        appendLog(id, 'Deployment verified (HTTP ' + code + ')');
      } else {
        appendLog(id, 'warning: deployment check returned HTTP ' + (code || 'n/a'));
      }
    });

    rec.status = 'running';
    rec.finished_at = new Date().toISOString();
    rec.error = '';
    await saveRecord(rec);
    appendLog(id, '✔ Install complete — ' + CATALOG[appType].name + ' is live at ' + rec.url);
  } catch (e) {
    appendLog(id, '✖ Install failed: ' + (e && e.message || e));
    try {
      await rollback(id, rec, poolCreated);
    } catch (rbErr) {
      appendLog(id, 'Rollback error: ' + (rbErr && rbErr.message || rbErr));
    }
    rec.status = 'failed';
    rec.error = String(e && e.message || e).slice(0, 500);
    rec.finished_at = new Date().toISOString();
    await saveRecord(rec).catch(() => {});
    appendLog(id, 'Install marked as failed. Rollback performed.');
  } finally {
    releaseInstallSlot(rec.user_id);
  }
}

async function rollback(id, rec, poolCreated) {
  appendLog(id, '→ Rolling back...');
  if (rec.pm2_name && (rec.app_type === 'node' || rec.app_type === 'nextjs')) {
    await removePm2App(id, rec.user_id, rec.pm2_name);
  }
  await rollbackDb(id, rec);
  try {
    if (fs.existsSync(rec.install_path)) {
      fs.rmSync(rec.install_path, { recursive: true, force: true });
      appendLog(id, 'Removed ' + rec.install_path);
    }
  } catch (e) {
    appendLog(id, 'rm failed: ' + (e && e.message || e));
  }
  await revertAppNginx(id, rec);
  if (poolCreated && !appStillNeedsPhp(rec.user_id, rec.id)) {
    removePhpPool(rec.user_id);
    appendLog(id, 'Removed php-fpm pool for ' + rec.user_id);
  }
  appendLog(id, 'Rollback finished.');
}

function validateInstall(body) {
  if (!body) throw new Error('Missing request body');
  const appType = String(body.app_type || '').trim();
  if (!CATALOG[appType]) throw new Error('Unsupported app type: ' + appType);
  const user = String(body.system_user || body.user || '').trim();
  if (!/^[a-zA-Z][a-zA-Z0-9._-]{0,31}$/.test(user)) throw new Error('Invalid system user');
  const domain = String(body.domain || '').trim();
  if (!validators.domain.test(domain)) throw new Error('Invalid domain name');

  const store = loadApps();
  const existing = store.find(a => a.domain === domain && a.status !== 'removed' && a.status !== 'failed');
  if (existing) throw new Error('Domain "' + domain + '" already has an installation (' + existing.app_type + ')');

  const snap = getDomainSnapshot(domain);
  if (!snap || !snap.port) throw new Error('Domain not found: ' + domain);

  const installPath = resolveInstallPath(user, domain);
  if (fs.existsSync(installPath)) {
    const entries = fs.readdirSync(installPath);
    if (entries.length > 0 && appType !== 'laravel') throw new Error('Install path already exists and is not empty: ' + installPath);
  }

  const title = String(body.title || '').trim().slice(0, 120) || domain;
  let adminEmail = String(body.admin_email || '').trim();
  if (appType === 'wordpress') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('A valid admin email is required for WordPress');
  }

  return {
    appType,
    user,
    domain,
    title,
    adminEmail,
    snap,
    installPath,
  };
}

function createInstall(body, reqUser) {
  const v = validateInstall(body);
  if (!acquireInstallSlot(v.user)) {
    const err = new Error('Too many simultaneous installations for user ' + v.user + ' (max ' + MAX_CONCURRENT_PER_USER + ')');
    err.statusCode = 429;
    throw err;
  }

  const rec = {
    id: crypto.randomUUID(),
    user_id: v.user,
    domain: v.domain,
    app_type: v.appType,
    install_path: v.installPath,
    web_mode: (v.appType === 'node' || v.appType === 'nextjs') ? 'proxy' : 'root',
    admin_username: 'admin',
    admin_password_encrypted: encryptSecret(genPassword()),
    status: 'installing',
    options: { title: v.title, admin_email: v.adminEmail },
    created_by: reqUser ? reqUser.username : 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  rec.admin_password_plain = decryptSecret(rec.admin_password_encrypted);
  rec.url = buildUrl(v.domain, v.snap.port, v.snap.sslEnabled);
  if (v.appType === 'node' || v.appType === 'nextjs') {
    rec.proxy_port = findAppPort();
    rec.pm2_name = v.domain;
  }
  if (v.appType === 'laravel') rec.web_root = path.join(v.installPath, 'public');
  else rec.web_root = v.installPath;

  saveRecord(rec);

  setTimeout(() => { performInstall(rec).catch(() => {}); }, 50);
  return { ok: true, id: rec.id, status: rec.status, app: toSafeView(rec) };
}

async function performUninstall(rec) {
  const id = rec.id;
  initLog(id);
  appendLog(id, 'Uninstalling ' + CATALOG[rec.app_type].name + ' from ' + rec.domain + '...');
  if (rec.pm2_name && (rec.app_type === 'node' || rec.app_type === 'nextjs')) {
    await removePm2App(id, rec.user_id, rec.pm2_name);
  }
  await rollbackDb(id, rec);
  try {
    if (fs.existsSync(rec.install_path)) {
      fs.rmSync(rec.install_path, { recursive: true, force: true });
      appendLog(id, 'Removed ' + rec.install_path);
    }
  } catch (e) {
    appendLog(id, 'rm failed: ' + (e && e.message || e));
  }
  await revertAppNginx(id, rec);
  if (rec.php_pool_created && !appStillNeedsPhp(rec.user_id, rec.id)) {
    removePhpPool(rec.user_id);
    appendLog(id, 'Removed php-fpm pool for ' + rec.user_id);
  }
  rec.status = 'removed';
  rec.finished_at = new Date().toISOString();
  await saveRecord(rec);
  appendLog(id, 'Uninstall complete.');
}

function startUninstall(id, reqUser) {
  const rec = getRecord(id);
  if (!rec) throw new Error('Application not found: ' + id);
  if (rec.status === 'pending' || rec.status === 'installing') throw new Error('Cannot uninstall while installation is in progress');
  setTimeout(() => { performUninstall(rec).catch(() => {}); }, 50);
  return { ok: true, id: rec.id };
}

function saveRecord(rec) {
  return withLock(() => {
    const store = loadApps();
    const idx = store.findIndex(a => a.id === rec.id);
    const clone = JSON.parse(JSON.stringify(rec));
    delete clone.admin_password_plain;
    delete clone.db_password;
    if (idx >= 0) store[idx] = clone;
    else store.unshift(clone);
    saveApps(store);
  });
}

function getRecord(id) {
  return loadApps().find(a => a.id === id) || null;
}

function recordExists(id) {
  return !!getRecord(id);
}

function toSafeView(rec) {
  return {
    id: rec.id,
    user_id: rec.user_id,
    domain: rec.domain,
    app_type: rec.app_type,
    install_path: rec.install_path,
    web_root: rec.web_root || null,
    proxy_port: rec.proxy_port || null,
    status: rec.status,
    url: rec.url || null,
    error: rec.error || '',
    options: rec.options || {},
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    finished_at: rec.finished_at || null,
  };
}

function listApps() {
  sweepStale();
  return loadApps().map(toSafeView);
}

function getApp(id, reqUser) {
  const rec = getRecord(id);
  if (!rec) throw new Error('Application not found: ' + id);
  const view = toSafeView(rec);
  const canSeeSecrets = reqUser && (reqUser.role === 'admin' || reqUser.username === rec.user_id);
  if (canSeeSecrets) {
    view.admin_username = rec.admin_username || 'admin';
    view.admin_password = decryptSecret(rec.admin_password_encrypted) || '';
    if (rec.db_name) {
      view.db_name = rec.db_name;
      view.db_user = rec.db_user;
      view.db_password = decryptSecret(rec.db_password_encrypted) || '';
    }
    view.login_url = rec.app_type === 'wordpress' ? (rec.url + '/wp-admin/') : rec.url;
  }
  return view;
}

function sweepStale() {
  try {
    const store = loadApps();
    let changed = false;
    for (const rec of store) {
      if (rec.status === 'pending' || rec.status === 'installing') {
        if (rec.status === 'pending') {
          rec.status = 'failed';
          rec.error = 'Install did not start (panel restarted). Reinstall to try again.';
          rec.finished_at = new Date().toISOString();
          changed = true;
        } else {
          rec.status = 'failed';
          rec.error = 'Install interrupted by panel restart. Reinstall to try again.';
          rec.finished_at = new Date().toISOString();
          changed = true;
        }
      }
    }
    if (changed) saveApps(store);
  } catch (_) {}
}

module.exports = {
  CATALOG,
  getCatalog,
  createInstall,
  startUninstall,
  listApps,
  getApp,
  getLog,
  recordExists,
  listSystemUsers,
  listTargetDomains,
  encryptSecret,
  decryptSecret,
  validateInstall,
  performInstall,
  performUninstall,
  _internals: {
    acquireInstallSlot,
    releaseInstallSlot,
    activeInstalls,
    genPassword,
    buildUrl,
    makeDbIdent,
    findAppPort,
    resolveInstallPath,
    sweepStale,
  },
};
