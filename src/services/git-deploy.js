const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const config = require('../config/deploy');
const apps = require('./apps');
const domains = require('./domains');
const { runSafeSync } = require('../utils/shell');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DEPLOYS_FILE = path.join(DATA_DIR, config.DEPLOYMENTS_FILE);
const KEYS_FILE = path.join(DATA_DIR, config.DEPLOY_KEYS_FILE);
const ENV_VARS_FILE = path.join(DATA_DIR, config.DEPLOY_ENV_VARS_FILE);
const DEPLOY_LOG_DIR = path.join(DATA_DIR, 'deploy');
const MAX_KEPT = config.MAX_DEPLOYMENTS_KEPT;
const MAX_CONCURRENT = config.MAX_CONCURRENT_PER_USER;

/* ─── Lock & storage ─── */
let writeLock = Promise.resolve();
function withLock(fn) {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => {});
  return run;
}

function loadStore(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { console.error('[Deploy] load failed:', file, e.message); }
  return [];
}

function saveStore(file, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function loadDeployments() { return loadStore(DEPLOYS_FILE); }
function saveDeployments(data) { return saveStore(DEPLOYS_FILE, data); }
function loadKeys() { return loadStore(KEYS_FILE); }
function saveKeys(data) { return saveStore(KEYS_FILE, data); }
function loadEnvVars() { return loadStore(ENV_VARS_FILE); }
function saveEnvVars(data) { return saveStore(ENV_VARS_FILE, data); }

function getRecord(id) { return loadDeployments().find(r => r.id === id) || null; }

function saveRecord(rec) {
  return withLock(() => {
    const arr = loadDeployments();
    const idx = arr.findIndex(r => r.id === rec.id);
    const clone = JSON.parse(JSON.stringify(rec));
    if (idx >= 0) arr[idx] = clone;
    else arr.unshift(clone);
    saveDeployments(arr);
  });
}

/* ─── Crypto (reuse from apps) ─── */
function encrypt(s) { return apps.encryptSecret(s); }
function decrypt(s) { return apps.decryptSecret(s); }

function genToken() { return crypto.randomBytes(32).toString('base64url'); }

/* ─── Logging ─── */
const logBuffers = new Map();
function initLog(id) {
  logBuffers.set(id, []);
  try { if (!fs.existsSync(DEPLOY_LOG_DIR)) fs.mkdirSync(DEPLOY_LOG_DIR, { recursive: true }); } catch (_) {}
}
function appendLog(id, text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  if (!lines.length) return;
  const buf = logBuffers.get(id) || [];
  for (const l of lines) buf.push(new Date().toISOString().slice(11, 19) + '  ' + l);
  while (buf.length > 1000) buf.shift();
  logBuffers.set(id, buf);
  try {
    fs.appendFileSync(path.join(DEPLOY_LOG_DIR, id + '.log'), lines.map(l => new Date().toISOString() + '  ' + l).join('\n') + '\n', 'utf8');
  } catch (_) {}
}
function getLog(id, lines) {
  const n = Math.min(parseInt(lines, 10) || 50, 1000);
  const buf = logBuffers.get(id);
  if (buf) return buf.slice(-n);
  try {
    const f = path.join(DEPLOY_LOG_DIR, id + '.log');
    if (!fs.existsSync(f)) return [];
    return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).slice(-n);
  } catch (_) { return []; }
}

/* ─── Spawn helpers ─── */
function tail(text, n) {
  const s = String(text || '');
  const lines = s.split('\n').filter(Boolean);
  return lines.slice(-(n || 8)).join('\n') || s.slice(-400);
}

const NPM_RETRY_FLAGS = [
  '--fetch-retries=3',
  '--fetch-retry-factor=2',
  '--fetch-retry-mintimeout=20000',
  '--fetch-timeout=300000',
  '--no-audit',
  '--no-fund',
];

function proxyEnv() {
  const out = {};
  ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy']
    .forEach(k => { if (process.env[k]) out[k] = process.env[k]; });
  return out;
}

function spawnLogged(id, bin, args, cwd, timeout) {
  return new Promise((resolve) => {
    let killed = false;
    const timer = timeout ? setTimeout(() => { killed = true; try { p.kill('SIGKILL'); } catch (_) {} }, timeout) : null;
    let out = '', err = '';
    let p;
    try { p = spawn(bin, args, { cwd }); } catch (e) {
      resolve({ status: 1, stdout: '', stderr: String(e && e.message || e) }); return;
    }
    p.stdout.on('data', d => { out += d; appendLog(id, d.toString()); });
    p.stderr.on('data', d => { err += d; appendLog(id, d.toString()); });
    p.on('error', e => { err += String(e.message || e); appendLog(id, String(e.message || e)); if (timer) clearTimeout(timer); resolve({ status: 1, stdout: out, stderr: err, killed }); });
    p.on('close', code => { if (timer) clearTimeout(timer); resolve({ status: code, stdout: out, stderr: err, killed }); });
  });
}

function runRootLogged(id, cmd, args, opts) {
  const options = opts || {};
  appendLog(id, '$ ' + cmd + ' ' + (args || []).join(' '));
  return spawnLogged(id, 'env', [cmd, ...(args || [])], options.cwd, options.timeout);
}

function runAsUserLogged(id, user, cmd, args, opts) {
  const options = opts || {};
  const env = Object.assign({ HOME: '/home/' + user, PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' }, options.env || {});
  const sudoArgs = ['-u', user, '--', 'env', ...Object.entries(env).map(([k, v]) => k + '=' + v), cmd, ...(args || [])];
  appendLog(id, '$ sudo -u ' + user + ' ' + cmd + ' ' + (args || []).join(' '));
  return spawnLogged(id, 'sudo', sudoArgs, options.cwd, options.timeout);
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

/* ─── Concurrency ─── */
const activeDeploys = new Map();
function acquireDeploySlot(user) {
  const n = activeDeploys.get(user) || 0;
  if (n >= MAX_CONCURRENT) return false;
  activeDeploys.set(user, n + 1);
  return true;
}
function releaseDeploySlot(user) {
  const n = activeDeploys.get(user) || 0;
  if (n <= 1) activeDeploys.delete(user);
  else activeDeploys.set(user, n - 1);
}

/* ─── Validators ─── */
const GIT_URL_RE = /^(https:\/\/|git@|ssh:\/\/)[^\s]+$/;
const BRANCH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._\/\-]*$/;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');

function validateGitUrl(url) {
  if (!url || typeof url !== 'string' || !GIT_URL_RE.test(url.trim())) throw new Error('Invalid Git URL: only https://, git@, ssh:// allowed');
  if (url.trim().startsWith('file://')) throw new Error('file:// protocol is not allowed');
  return url.trim();
}

function validateBranch(name) {
  if (!name || typeof name !== 'string' || !BRANCH_RE.test(name)) throw new Error('Invalid branch name');
  return name.trim();
}

function detectAppType(deployDir) {
  if (fs.existsSync(path.join(deployDir, 'package.json'))) return 'node';
  if (fs.existsSync(path.join(deployDir, 'composer.json'))) return 'php';
  return 'static';
}

/* ─── Nginx ─── */
function getDomainSnapshot(name) {
  try { return domains.getDomain(name); } catch (_) { return null; }
}

async function applyDeployNginx(id, rec) {
  const name = rec.domain;
  const snap = getDomainSnapshot(name);
  if (!snap) throw new Error('Domain not found: ' + name);
  rec.port = snap.port;

  if (rec.app_type === 'node') {
    const conf = domains.generateAppNginxConf(name, snap.port, snap.sslEnabled, {
      proxyPass: 'http://127.0.0.1:' + rec.proxy_port + '/',
    });
    domains.writeNginxConf(name, conf);
    domains.nginxTestAndReload();
    appendLog(id, 'nginx: proxy_pass → 127.0.0.1:' + rec.proxy_port);
  } else if (rec.app_type === 'php') {
    const conf = domains.generateAppNginxConf(name, snap.port, snap.sslEnabled, {
      root: rec.install_path,
      phpSocket: '/run/php-fpm/apps-' + rec.user_id + '.sock',
    });
    domains.writeNginxConf(name, conf);
    domains.nginxTestAndReload();
    appendLog(id, 'nginx: root → ' + rec.install_path + ' via php-fpm');
  } else {
    domains.editDomain(name, { root: rec.install_path });
    appendLog(id, 'nginx: root → ' + rec.install_path);
  }
}

async function revertDeployNginx(id, rec) {
  try {
    const snap = getDomainSnapshot(rec.domain);
    if (!snap) return;
    const conf = domains.generateNginxConf(rec.domain, snap.port, snap.sslEnabled, snap.type, { root: snap.root || '/var/www/' + rec.domain });
    domains.writeNginxConf(rec.domain, conf);
    domains.nginxTestAndReload();
    appendLog(id, 'nginx reverted to snapshot');
  } catch (e) { appendLog(id, 'nginx revert partial: ' + (e && e.message || e)); }
}

/* ─── Port allocation ─── */
function findAppPort() {
  const used = new Set(domains.getUsedPorts());
  for (const d of loadDeployments()) {
    if (d.status !== 'removed' && d.status !== 'failed' && d.status !== 'rolled_back' && d.proxy_port) used.add(parseInt(d.proxy_port, 10));
  }
  for (let p = config.APP_PORT_START; p <= config.APP_PORT_END; p++) {
    if (!used.has(p)) return p;
  }
  throw new Error('No free deploy port');
}

/* ─── SSH key management ─── */
function getSshKey(user) {
  return loadKeys().find(k => k.user_id === user) || null;
}

function storeSshKey(user, privateKey) {
  return withLock(() => {
    let arr = loadKeys();
    const idx = arr.findIndex(k => k.user_id === user);
    const entry = { user_id: user, private_key_encrypted: encrypt(privateKey), stored_at: new Date().toISOString() };
    if (idx >= 0) arr[idx] = entry; else arr.push(entry);
    saveKeys(arr);
  });
}

function deleteSshKey(user) {
  return withLock(() => {
    const arr = loadKeys().filter(k => k.user_id !== user);
    saveKeys(arr);
  });
}

async function setupSshKey(id, user) {
  const key = getSshKey(user);
  if (!key) return false;
  const privateKey = decrypt(key.private_key_encrypted);
  if (!privateKey) throw new Error('Invalid SSH key — cannot decrypt');

  const sshDir = '/home/' + user + '/.ssh';
  await runRootLogged(id, 'mkdir', ['-p', sshDir]);
  await runRootLogged(id, 'chown', ['-R', user + ':' + user, sshDir]);
  await runRootLogged(id, 'bash', ['-lc', 'echo ' + JSON.stringify(privateKey) + ' > ' + sshDir + '/id_rsa']);
  await runRootLogged(id, 'chown', [user + ':' + user, sshDir + '/id_rsa']);
  await runRootLogged(id, 'chmod', ['600', sshDir + '/id_rsa']);
  appendLog(id, 'SSH key deployed to ' + sshDir);

  await runAsUserLogged(id, user, 'ssh-keyscan', ['github.com'], { timeout: 30000 });
  await runAsUserLogged(id, user, 'ssh-keyscan', ['gitlab.com'], { timeout: 30000 });
  appendLog(id, 'SSH host keys scanned for github.com, gitlab.com');
  return true;
}

/* ─── Env vars management ─── */
function getEnvVars(deploymentId, reqUser) {
  const all = loadEnvVars().filter(e => e.deployment_id === deploymentId);
  return all.map(e => ({ key: e.key, value: decrypt(e.value_encrypted) || e.value || '' }));
}

function setEnvVars(deploymentId, reqUser, vars) {
  return withLock(() => {
    let arr = loadEnvVars().filter(e => e.deployment_id !== deploymentId);
    for (const [k, v] of Object.entries(vars || {})) {
      arr.push({ deployment_id: deploymentId, key: String(k), value_encrypted: encrypt(String(v)), updated_at: new Date().toISOString() });
    }
    saveEnvVars(arr);
  });
}

function injectEnvVars(deployDir, deploymentId) {
  const all = loadEnvVars().filter(e => e.deployment_id === deploymentId);
  if (!all.length) return;
  let content = '';
  for (const e of all) content += e.key + '=' + (decrypt(e.value_encrypted) || e.value || '') + '\n';
  fs.writeFileSync(path.join(deployDir, '.env'), content, 'utf8');
}

/* ─── PM2 ─── */
function generateEcosystem(rec) {
  return [
    'module.exports = {',
    "  apps: [{",
    "    name: '" + rec.pm2_name + "',",
    "    cwd: '" + rec.install_path + "',",
    "    env: {",
    "      NODE_ENV: 'production',",
    "      PORT: " + rec.proxy_port + ",",
    "    },",
    "    instances: 1,",
    "    exec_mode: 'fork',",
    "    max_memory_restart: '512M',",
    "    watch: false,",
    "  }],",
    "};",
  ].join('\n');
}

async function startPm2(id, rec) {
  const user = rec.user_id;
  const ecosystem = path.join(rec.install_path, 'ecosystem.config.js');
  fs.writeFileSync(ecosystem, generateEcosystem(rec));
  await runRootLogged(id, 'chown', [user + ':' + user, ecosystem]);

  const pm2Env = { PM2_HOME: '/home/' + user + '/.pm2', PORT: String(rec.proxy_port) };
  const r = await runAsUserLogged(id, user, 'pm2', ['start', ecosystem], { env: pm2Env, timeout: 120000 });
  if (r.status !== 0) {
    const out = tail(r.stderr || r.stdout);
    appendLog(id, 'pm2 start failed; output: ' + out);
    throw new Error('pm2 start failed');
  }
  const save = await runAsUserLogged(id, user, 'pm2', ['save'], { env: pm2Env, timeout: 60000 });
  if (save.status !== 0) appendLog(id, 'warning: pm2 save failed');
}

async function stopPm2(id, user, pm2Name) {
  if (!pm2Name) return;
  try {
    await runAsUserLogged(id, user, 'pm2', ['delete', pm2Name], { env: { PM2_HOME: '/home/' + user + '/.pm2' }, timeout: 60000 });
    await runAsUserLogged(id, user, 'pm2', ['save'], { env: { PM2_HOME: '/home/' + user + '/.pm2' }, timeout: 60000 });
  } catch (_) {}
}

async function restartPm2(id, user, pm2Name) {
  if (!pm2Name) return;
  try {
    await runAsUserLogged(id, user, 'pm2', ['restart', pm2Name], { env: { PM2_HOME: '/home/' + user + '/.pm2' }, timeout: 60000 });
  } catch (e) { appendLog(id, 'pm2 restart failed: ' + (e && e.message || e)); }
}

/* ─── Symlink management ─── */
function ensureDeploySymlink(rec) {
  const target = rec.deploy_dir;
  const link = rec.install_path;
  try {
    if (fs.lstatSync(link)) {
      const current = fs.readlinkSync(link);
      if (current !== target) {
        fs.unlinkSync(link);
        fs.symlinkSync(target, link);
        appendLog(rec.id, 'Symlink updated: ' + link + ' → ' + target);
      }
    }
  } catch (_) {
    try { fs.symlinkSync(target, link); } catch (e2) {
      throw new Error('Symlink create failed: ' + (e2 && e2.message || e2));
    }
  }
}

function getPrevDeploymentDir(rec) {
  const dirs = [];
  const base = rec.deploy_base;
  try {
    const entries = fs.readdirSync(base, { withFileTypes: true });
    dirs.push(...entries.filter(e => e.isDirectory() && e.name !== path.basename(rec.deploy_dir)).map(e => path.join(base, e.name)));
  } catch (_) {}
  return dirs.sort().reverse()[0] || null;
}

function cleanupOldDeployments(base, keepCount) {
  try {
    if (!fs.existsSync(base)) return;
    const entries = fs.readdirSync(base, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => ({ name: e.name, path: path.join(base, e.name) })).sort((a, b) => b.name.localeCompare(a.name));
    for (let i = keepCount; i < dirs.length; i++) {
      try { fs.rmSync(dirs[i].path, { recursive: true, force: true }); } catch (_) {}
    }
  } catch (_) {}
}

/* ─── PHP pool ─── */
function ensurePhpPool(user) {
  const PHP_POOL_DIR = '/etc/php-fpm.d';
  const poolFile = path.join(PHP_POOL_DIR, user + '.conf');
  if (fs.existsSync(poolFile)) return false;
  const conf = '[' + user + ']\n' +
    'user = ' + user + '\ngroup = ' + user + '\n' +
    'listen = /run/php-fpm/apps-' + user + '.sock\n' +
    'listen.owner = nginx\nlisten.group = nginx\nlisten.mode = 0660\n' +
    'pm = ondemand\npm.max_children = 12\npm.process_idle_timeout = 15s\npm.max_requests = 500\n' +
    'catch_workers_output = yes\nsecurity.limit_extensions = .php\n' +
    'php_admin_value[open_basedir] = /home/' + user + '/:/tmp/\n';
  fs.writeFileSync(poolFile, conf, 'utf8');
  const test = runSafeSync('php-fpm', ['-t'], { timeout: 10000 });
  if (test.status !== 0) { try { fs.unlinkSync(poolFile); } catch (_) {} throw new Error('php-fpm pool config test failed: ' + tail((test.stdout || '') + (test.stderr || ''))); }
  const rel = runSafeSync('systemctl', ['reload', 'php-fpm'], { timeout: 10000 });
  if (rel.status !== 0) console.warn('[Deploy] php-fpm reload after pool create failed');
  return true;
}

/* ─── Verify ─── */
async function verifyDeploy(id, rec) {
  const snap = getDomainSnapshot(rec.domain);
  if (!snap) { appendLog(id, 'warning: domain not found for verify'); return; }
  const hostPort = (snap.port && snap.port !== 80 && snap.port !== 443) ? ':' + snap.port : '';
  const hostHeader = rec.domain + hostPort;
  const r = await runAsUserLogged(id, rec.user_id, 'bash', ['-lc', 'curl -fsS -o /dev/null -w "%{http_code}" -H "Host: ' + hostHeader + '" http://127.0.0.1:' + snap.port + '/'], { timeout: 60000 });
  const code = (r.stdout || '').trim();
  if (r.status === 0 && code && code.startsWith('2')) {
    appendLog(id, 'Deployment verified (HTTP ' + code + ')');
  } else {
    appendLog(id, 'warning: deploy check returned HTTP ' + (code || 'n/a'));
  }
}

/* ─── Ensure prerequisites ─── */
async function ensurePrereqs(id, appType) {
  await step(id, 'Check git', async () => {
    const r = await runRootLogged(id, 'git', ['--version']);
    if (r.status !== 0) {
      appendLog(id, 'Git missing, installing...');
      const dnf = await runRootLogged(id, 'dnf', ['install', '-y', 'git'], { timeout: 300000 });
      if (dnf.status !== 0) throw new Error('git install failed');
    }
  });

  if (appType === 'php') {
    await step(id, 'Check Composer', async () => {
      const chk = runSafeSync('bash', ['-lc', 'test -x /usr/local/bin/composer && echo ok']);
      if (chk.status !== 0) {
        appendLog(id, 'Installing Composer...');
        const dl = await runRootLogged(id, 'bash', ['-lc', 'curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer'], { timeout: 300000 });
        if (dl.status !== 0) throw new Error('Composer install failed');
      }
    });
  }
}

/* ─── Core deploy flow ─── */
async function performDeploy(rec) {
  const id = rec.id;
  initLog(id);
  const user = rec.user_id;
  appendLog(id, 'Deploying ' + rec.repo_url + ' (' + rec.branch + ') to ' + rec.domain + ' as ' + user);

  let poolCreated = false;
  try {
    await step(id, 'Prepare deploy directory', async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15) + 'Z';
      rec.deploy_base = '/home/' + user + '/deployments/' + rec.domain;
      rec.deploy_dir = path.join(rec.deploy_base, timestamp);
      fs.mkdirSync(rec.deploy_dir, { recursive: true });
      await runRootLogged(id, 'chown', ['-R', user + ':' + user, rec.deploy_base]);
    });

    const sshUsed = await step(id, 'SSH key setup', async () => {
      const key = getSshKey(user);
      if (!key) return false;
      await setupSshKey(id, user);
      return true;
    });

    await step(id, 'Git clone (depth ' + config.GIT_CLONE_DEPTH + ') ' + rec.repo_url + '#' + rec.branch, async () => {
      const gitEnv = sshUsed ? { GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=accept-new -i /home/' + user + '/.ssh/id_rsa' } : {};
      const r = await runAsUserLogged(id, user, 'git', ['clone', '--depth', String(config.GIT_CLONE_DEPTH), '--branch', rec.branch, rec.repo_url, rec.deploy_dir], { env: gitEnv, timeout: 300000 });
      if (r.status !== 0) throw new Error('git clone failed: ' + tail(r.stderr || r.stdout));
    });

    await step(id, 'Resolve commit hash', async () => {
      const r = await runAsUserLogged(id, user, 'git', ['-C', rec.deploy_dir, 'rev-parse', 'HEAD'], { timeout: 15000 });
      if (r.status === 0) rec.commit_hash = (r.stdout || '').trim().slice(0, 12);
    });

    await step(id, 'Detect app type', async () => {
      rec.app_type = rec.app_type === 'auto' ? detectAppType(rec.deploy_dir) : rec.app_type;
      appendLog(id, 'Detected/selected: ' + rec.app_type);
    });

    await step(id, 'Install prerequisites', async () => {
      await ensurePrereqs(id, rec.app_type);
      await runRootLogged(id, 'chmod', ['o+x', '/home/' + user]);
      if (rec.app_type === 'php') {
        poolCreated = ensurePhpPool(user);
        rec.php_pool_created = true;
      }
    });

    await step(id, 'Inject environment variables', async () => {
      injectEnvVars(rec.deploy_dir, id);
    });

    await step(id, 'Run build', async () => {
      const buildCmd = rec.custom_build_cmd;
      if (rec.app_type === 'node') {
        const ci = await runAsUserLogged(id, user, 'npm', ['ci', '--production=false', ...NPM_RETRY_FLAGS], { cwd: rec.deploy_dir, env: proxyEnv(), timeout: 300000 });
        if (ci.status !== 0) throw new Error('npm ci failed: ' + tail(ci.stderr || ci.stdout));
        const build = await runAsUserLogged(id, user, 'bash', ['-lc', buildCmd || 'npm run build'], { cwd: rec.deploy_dir, env: proxyEnv(), timeout: 300000 });
        if (build.status !== 0) throw new Error('build failed: ' + tail(build.stderr || build.stdout));
      } else if (rec.app_type === 'php') {
        const r = await runAsUserLogged(id, user, 'composer', ['install', '--no-dev', '--optimize-autoloader', '--no-interaction'], { cwd: rec.deploy_dir, timeout: 300000 });
        if (r.status !== 0) throw new Error('composer install failed: ' + tail(r.stderr || r.stdout));
      }
    });

    const publicSubdirs = { node: '', php: '', static: '' };
    const artifactPath = rec.deploy_dir + (publicSubdirs[rec.app_type] || '');
    rec.install_path = '/home/' + user + '/domains/' + rec.domain + '/public_html';
    rec.install_parent = path.dirname(rec.install_path);

    await step(id, 'Set up deployment symlink', async () => {
      if (!fs.existsSync(rec.install_parent)) fs.mkdirSync(rec.install_parent, { recursive: true });
      await runRootLogged(id, 'chown', ['-R', user + ':' + user, '/home/' + user + '/domains']);
      try {
        if (fs.lstatSync(rec.install_path)) {
          const oldBase = path.dirname(fs.realpathSync(rec.install_path));
          rec.prev_install_path = oldBase;
          fs.unlinkSync(rec.install_path);
        }
      } catch (_) {}
      fs.symlinkSync(artifactPath, rec.install_path);
      appendLog(id, 'Symlink: ' + rec.install_path + ' → ' + artifactPath);
    });

    if (rec.app_type === 'node') {
      await step(id, 'Start via PM2', async () => {
        await startPm2(id, rec);
      });
    }

    await step(id, 'Configure nginx', async () => {
      await applyDeployNginx(id, rec);
    });

    await step(id, 'Verify deployment', async () => {
      await verifyDeploy(id, rec);
    });

    await step(id, 'Cleanup old deployments (keep ' + MAX_KEPT + ')', async () => {
      cleanupOldDeployments(rec.deploy_base, MAX_KEPT);
    });

    rec.status = 'running';
    rec.finished_at = new Date().toISOString();
    rec.error = '';
    await saveRecord(rec);
    appendLog(id, '✔ Deploy complete — live at ' + rec.url);

  } catch (e) {
    appendLog(id, '✖ Deploy failed: ' + (e && e.message || e));
    try {
      await rollbackDeploy(id, rec, poolCreated);
    } catch (rbErr) {
      appendLog(id, 'Rollback error: ' + (rbErr && rbErr.message || rbErr));
    }
    rec.status = 'failed';
    rec.error = String(e && e.message || e).slice(0, 500);
    rec.finished_at = new Date().toISOString();
    await saveRecord(rec).catch(() => {});
    appendLog(id, 'Deployment marked as failed. Rollback performed.');
  } finally {
    releaseDeploySlot(rec.user_id);
  }
}

async function rollbackDeploy(id, rec, poolCreated) {
  appendLog(id, '→ Rolling back...');
  if (rec.pm2_name && rec.app_type === 'node') await stopPm2(id, rec.user_id, rec.pm2_name);
  await revertDeployNginx(id, rec);
  if (rec.prev_install_path) {
    try {
      if (fs.lstatSync(rec.install_path)) fs.unlinkSync(rec.install_path);
      fs.symlinkSync(rec.prev_install_path, rec.install_path);
      appendLog(id, 'Reverted symlink to ' + rec.prev_install_path);
    } catch (e) { appendLog(id, 'Symlink revert failed: ' + (e && e.message || e)); }
  }
  if (poolCreated) {
    const PHP_POOL_DIR = '/etc/php-fpm.d';
    const poolFile = path.join(PHP_POOL_DIR, rec.user_id + '.conf');
    try { if (fs.existsSync(poolFile)) { fs.unlinkSync(poolFile); runSafeSync('systemctl', ['reload', 'php-fpm'], { timeout: 10000 }); } } catch (_) {}
  }
  appendLog(id, 'Rollback finished.');
}

/* ─── Webhook ─── */
function verifyWebhookToken(deploymentId, token) {
  const rec = getRecord(deploymentId);
  if (!rec) throw new Error('Deployment not found: ' + deploymentId);
  if (rec.webhook_token !== token) throw new Error('Invalid webhook token');
  return rec;
}

function generateWebhookUrl(rec) {
  rec.webhook_token = rec.webhook_token || genToken();
  rec.webhook_url = config.WEBHOOK_BASE_URL + config.WEBHOOK_PATH_PREFIX + '/' + rec.id + '/' + rec.webhook_token;
  return rec.webhook_url;
}

async function handleWebhook(deploymentId, token, signature, body) {
  const rec = verifyWebhookToken(deploymentId, token);

  if (WEBHOOK_SECRET && signature) {
    const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(body || '')).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return { status: 401, body: { error: 'Invalid webhook signature' } };
    }
  }

  const id = rec.id;
  initLog(id);
  appendLog(id, 'Webhook triggered — pulling latest changes...');

  const cloneId = crypto.randomUUID();
  setTimeout(async () => {
    const user = rec.user_id;
    initLog(cloneId);
    try {
      const sshUsed = await step(cloneId, 'SSH key setup', async () => {
        const key = getSshKey(user);
        if (!key) return false;
        await setupSshKey(cloneId, user);
        return true;
      });

      const gitEnv = sshUsed ? { GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=accept-new -i /home/' + user + '/.ssh/id_rsa' } : {};
      await step(cloneId, 'git pull', async () => {
        const r = await runAsUserLogged(cloneId, user, 'git', ['-C', rec.deploy_dir, 'pull', 'origin', rec.branch], { env: gitEnv, timeout: 300000 });
        if (r.status !== 0) throw new Error('git pull failed: ' + tail(r.stderr || r.stdout));
      });

      await step(cloneId, 'Resolve commit', async () => {
        const r = await runAsUserLogged(cloneId, user, 'git', ['-C', rec.deploy_dir, 'rev-parse', 'HEAD'], { timeout: 15000 });
        if (r.status === 0) { rec.commit_hash = (r.stdout || '').trim().slice(0, 12); await saveRecord(rec); }
      });

      injectEnvVars(rec.deploy_dir, id);

      if (rec.app_type === 'node') {
        const buildCmd = rec.custom_build_cmd;
        await step(cloneId, 'npm ci', async () => {
          const r = await runAsUserLogged(cloneId, user, 'npm', ['ci', '--production=false', ...NPM_RETRY_FLAGS], { cwd: rec.deploy_dir, env: proxyEnv(), timeout: 300000 });
          if (r.status !== 0) throw new Error('npm ci failed');
        });
        await step(cloneId, 'npm build', async () => {
          const r = await runAsUserLogged(cloneId, user, 'bash', ['-lc', buildCmd || 'npm run build'], { cwd: rec.deploy_dir, env: proxyEnv(), timeout: 300000 });
          if (r.status !== 0) throw new Error('build failed');
        });
      }

      ensureDeploySymlink(rec);
      if (rec.app_type === 'node') await restartPm2(cloneId, user, rec.pm2_name);

      await step(cloneId, 'Verify', async () => { await verifyDeploy(cloneId, rec); });

      rec.finished_at = new Date().toISOString();
      rec.error = '';
      await saveRecord(rec);
      appendLog(cloneId, '✔ Webhook deploy complete');
    } catch (e) {
      appendLog(cloneId, '✖ Webhook deploy failed: ' + (e && e.message || e));
      rec.error = String(e && e.message || e).slice(0, 500);
      await saveRecord(rec).catch(() => {});
    }
  }, 50);

  return { status: 202, body: { status: 'triggered', id: rec.id } };
}

/* ─── Public API ─── */

function createDeploy(body, reqUser) {
  const user = String(body.system_user || body.user || '').trim();
  if (!/^[a-zA-Z][a-zA-Z0-9._-]{0,31}$/.test(user)) throw new Error('Invalid system user');
  const domain = String(body.domain || '').trim();
  if (!/^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain)) throw new Error('Invalid domain name');
  const snap = getDomainSnapshot(domain);
  if (!snap) throw new Error('Domain not found: ' + domain);
  const installPath = '/home/' + user + '/domains/' + domain + '/public_html';

  const existing = loadDeployments().find(d => d.domain === domain && d.status !== 'removed' && d.status !== 'failed' && d.status !== 'rolled_back');
  if (existing && !body.force) throw new Error('Domain "' + domain + '" already has a deployment. Use force=true to overwrite.');

  const repoUrl = validateGitUrl(body.repo_url);
  const branch = validateBranch(body.branch || 'main');

  const deployType = String(body.app_type || 'auto').trim().toLowerCase();
  if (!['auto', 'node', 'php', 'static'].includes(deployType)) throw new Error('Invalid deployment type: ' + deployType);

  const buildCmd = String(body.build_cmd || '').trim().slice(0, 500);
  const envVarsText = String(body.env_vars || '').trim().slice(0, 10000);

  if (!acquireDeploySlot(user)) {
    const err = new Error('Too many simultaneous deployments for user ' + user + ' (max ' + MAX_CONCURRENT + ')');
    err.statusCode = 429;
    throw err;
  }

  const rec = {
    id: crypto.randomUUID(),
    user_id: user,
    domain,
    repo_url: repoUrl,
    branch,
    app_type: deployType,
    custom_build_cmd: buildCmd || '',
    status: 'deploying',
    pm2_name: domain,
    install_path: installPath,
    proxy_port: null,
    webhook_token: '',
    webhook_url: '',
    env_vars_stored: false,
    error: '',
    created_by: reqUser ? reqUser.username : 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  generateWebhookUrl(rec);
  rec.url = apps._internals.buildUrl(domain, snap.port, snap.sslEnabled);

  if (deployType === 'node') {
    rec.proxy_port = findAppPort();
  }

  if (envVarsText) {
    const vars = {};
    for (const line of envVarsText.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    if (Object.keys(vars).length) {
      setEnvVars(rec.id, reqUser, vars);
      rec.env_vars_stored = true;
    }
  }

  saveRecord(rec);
  setTimeout(() => { performDeploy(rec).catch(() => {}); }, 50);
  return { ok: true, id: rec.id, status: rec.status, deployment: toSafeView(rec) };
}

function performRollback(id, reqUser) {
  const rec = getRecord(id);
  if (!rec) throw new Error('Deployment not found: ' + id);
  if (rec.status === 'deploying') throw new Error('Cannot rollback while deployment is in progress');

  const prevDir = getPrevDeploymentDir(rec);
  if (!prevDir) throw new Error('No previous deployment to rollback to');

  initLog(id);
  appendLog(id, '→ Rolling back to ' + prevDir);
  try {
    try { if (fs.lstatSync(rec.install_path)) fs.unlinkSync(rec.install_path); } catch (_) {}
    fs.symlinkSync(prevDir, rec.install_path);
    appendLog(id, 'Symlink switched to ' + prevDir);

    nginxReloadIfNeeded(rec);
    rec.status = 'running';
    rec.finished_at = new Date().toISOString();
    rec.error = '';
    saveRecord(rec);
    appendLog(id, '✔ Rollback complete');
    return { ok: true, id: rec.id };
  } catch (e) {
    rec.error = String(e && e.message || e).slice(0, 500);
    saveRecord(rec);
    throw e;
  }
}

function nginxReloadIfNeeded(rec) {
  try {
    domains.nginxTestAndReload();
  } catch (_) {
    appendLog(rec.id, 'warning: nginx reload after rollback failed');
  }
}

function toSafeView(rec) {
  return {
    id: rec.id,
    user_id: rec.user_id,
    domain: rec.domain,
    repo_url: rec.repo_url,
    branch: rec.branch,
    commit_hash: rec.commit_hash || '',
    app_type: rec.app_type,
    install_path: rec.install_path,
    deploy_base: rec.deploy_base || '',
    deploy_dir: rec.deploy_dir || '',
    build_cmd: rec.custom_build_cmd || '',
    pm2_name: rec.pm2_name || '',
    proxy_port: rec.proxy_port || null,
    status: rec.status,
    url: rec.url || '',
    webhook_url: rec.webhook_url || '',
    env_vars_stored: rec.env_vars_stored || false,
    error: rec.error || '',
    created_at: rec.created_at,
    finished_at: rec.finished_at || null,
    updated_at: rec.updated_at,
  };
}

function listDeployments(reqUser) {
  return loadDeployments().map(toSafeView);
}

function getDeployment(id, reqUser) {
  const rec = getRecord(id);
  if (!rec) throw new Error('Deployment not found: ' + id);
  return toSafeView(rec);
}

module.exports = {
  createDeploy,
  performRollback,
  listDeployments,
  getDeployment,
  getLog,
  getEnvVars,
  setEnvVars,
  storeSshKey,
  deleteSshKey,
  getSshKey,
  handleWebhook,
  verifyWebhookToken,
  generateWebhookUrl,
};
