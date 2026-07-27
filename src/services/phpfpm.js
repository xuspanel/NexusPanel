const fs = require('fs');
const path = require('path');
const { runSafeSync } = require('../utils/shell');

const POOL_SEARCH_DIRS = ['/etc/php-fpm.d', '/etc/php'];
const GLOBAL_CONF = '/etc/php-fpm.conf';
const PID_FILE = '/run/php-fpm/php-fpm.pid';
const ERROR_LOG = '/var/log/php-fpm/error.log';

const POOL_DIRECTIVES = [
  'pm', 'pm.max_children', 'pm.start_servers', 'pm.min_spare_servers', 'pm.max_spare_servers',
  'pm.max_requests', 'pm.process_idle_timeout', 'pm.status_path', 'pm.ping.path',
  'user', 'group', 'listen', 'listen.backlog', 'listen.allowed_clients', 'listen.acl_users',
  'slowlog', 'request_slowlog_timeout', 'request_terminate_timeout',
  'access.log', 'access.format',
  'rlimit_files', 'rlimit_core',
  'catch_workers_output', 'decorate_workers_output',
  'chroot', 'chdir', 'security.limit_extensions',
  'php_admin_value', 'php_admin_flag', 'php_value', 'php_flag',
];

function detectPoolDirs() {
  const dirs = [];
  for (const base of POOL_SEARCH_DIRS) {
    if (!fs.existsSync(base)) continue;
    if (base === '/etc/php-fpm.d') {
      dirs.push(base);
      continue;
    }
    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const m = e.name.match(/^(\d+\.\d+)/);
        if (m) {
          const poolPath = path.join(base, e.name, 'fpm', 'pool.d');
          if (fs.existsSync(poolPath)) dirs.push(poolPath);
        }
      }
    } catch {}
  }
  return dirs;
}

function parsePoolFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const config = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('[')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    if (key.startsWith('php_admin_value[') || key.startsWith('php_value[') ||
        key.startsWith('php_admin_flag[') || key.startsWith('php_flag[')) {
      const inner = key.match(/\[(.+)\]/);
      if (inner) config[key] = val;
    } else {
      config[key] = val;
    }
  }
  return config;
}

function listPools() {
  const pools = [];
  const dirs = detectPoolDirs();
  for (const dir of dirs) {
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.conf'));
      for (const f of files) {
        try {
          const config = parsePoolFile(path.join(dir, f));
          const name = f.replace('.conf', '');
          pools.push({
            name,
            file: f,
            dir,
            pm: config.pm || 'dynamic',
            maxChildren: parseInt(config['pm.max_children']) || 50,
            startServers: parseInt(config['pm.start_servers']) || 5,
            minSpareServers: parseInt(config['pm.min_spare_servers']) || 5,
            maxSpareServers: parseInt(config['pm.max_spare_servers']) || 35,
            maxRequests: parseInt(config['pm.max_requests']) || 0,
            processIdleTimeout: config['pm.process_idle_timeout'] || '10s',
            user: config.user || '',
            group: config.group || '',
            listen: config.listen || '',
            listenBacklog: config['listen.backlog'] || '',
            slowlog: config.slowlog || '',
            requestSlowlogTimeout: config['request_slowlog_timeout'] || '',
            requestTerminateTimeout: config['request_terminate_timeout'] || '',
            rlimitFiles: config['rlimit_files'] || '',
            rlimitCore: config['rlimit_core'] || '',
            catchWorkersOutput: config.catch_workers_output || 'no',
            statusPath: config['pm.status_path'] || '',
            rawConfig: config,
          });
        } catch {}
      }
    } catch {}
  }
  return pools;
}

function getStatus() {
  const result = runSafeSync('systemctl', ['status', 'php-fpm', '--no-pager'], { timeout: 5000 });
  const raw = result.stdout || '';
  const lines = raw.split('\n');
  let active = false, sub = '', pid = 0, mem = '', uptime = '';
  for (const line of lines) {
    if (line.includes('Active:')) {
      active = line.includes('active (running)');
      const m = line.match(/active\s+\((\w+)\)/);
      if (m) sub = m[1];
      const sinceM = line.match(/since\s+(.+?);/);
      if (sinceM) uptime = sinceM[1].trim();
    }
    if (line.includes('Main PID:')) {
      const m = line.match(/Main PID:\s*(\d+)/);
      if (m) pid = parseInt(m[1]);
    }
    if (line.includes('Memory:')) {
      const m = line.match(/Memory:\s*(.+)/);
      if (m) mem = m[1].trim();
    }
    if (line.includes('Processes active:')) {
      const m = line.match(/Processes active:\s*(\d+),\s*idle:\s*(\d+),\s*Requests:\s*(\d+),\s*slow:\s*(\d+),\s*Traffic:\s*([\d.]+)/);
      if (m) {
        return {
          active, sub, pid, mem, uptime,
          processesActive: parseInt(m[1]),
          processesIdle: parseInt(m[2]),
          requests: parseInt(m[3]),
          slowRequests: parseInt(m[4]),
          traffic: m[5],
        };
      }
    }
  }
  return { active, sub, pid, mem, uptime, processesActive: 0, processesIdle: 0, requests: 0, slowRequests: 0, traffic: '0' };
}

function poolStatus() {
  const result = runSafeSync('php-fpm', ['--dump-config', '--ini-path', '/etc'], { timeout: 5000 });
  let statusPath = '/status';
  const pools = listPools();
  for (const p of pools) {
    if (p.statusPath) { statusPath = p.statusPath; break; }
  }
  const curl = runSafeSync('curl', ['-s', '--unix-socket', '/run/php-fpm/www.sock', 'http://localhost' + statusPath], { timeout: 5000 });
  if (curl.status !== 0 || !curl.stdout.trim()) return null;
  const out = curl.stdout;
  const parsed = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^(\S+):\s*(.+)$/);
    if (m) parsed[m[1]] = m[2].trim();
  }
  return parsed;
}

function phpVersion() {
  const result = runSafeSync('php-fpm', ['--version'], { timeout: 5000 });
  if (result.status !== 0) return null;
  const line = result.stdout.split('\n')[0] || '';
  const m = line.match(/PHP\s+([\d.]+)/);
  return {
    version: m ? m[1] : line.trim(),
    raw: line.trim(),
    iniPath: '/etc/php.ini',
  };
}

function opcacheStatus() {
  const result = runSafeSync('php', ['-r', 'echo json_encode(@opcache_get_status(false));'], { timeout: 5000 });
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch { return null; }
}

function globalConfig() {
  if (!fs.existsSync(GLOBAL_CONF)) return null;
  const content = fs.readFileSync(GLOBAL_CONF, 'utf8');
  const config = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('[')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    config[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
  }
  return { config, raw: content };
}

function poolConfig(poolName) {
  if (!poolName || /[^a-zA-Z0-9._-]/.test(poolName)) throw new Error('Invalid pool name');
  const dirs = detectPoolDirs();
  for (const dir of dirs) {
    const confPath = path.join(dir, poolName + '.conf');
    if (fs.existsSync(confPath)) {
      const content = fs.readFileSync(confPath, 'utf8');
      const config = parsePoolFile(confPath);
      return { poolName, config, raw: content, path: confPath };
    }
  }
  throw new Error('Pool not found: ' + poolName);
}

function editPoolConfig(poolName, directive, value) {
  if (!poolName || /[^a-zA-Z0-9._-]/.test(poolName)) throw new Error('Invalid pool name');
  if (!POOL_DIRECTIVES.some(d => directive.startsWith(d))) throw new Error('Directive not allowed: ' + directive);
  const dirs = detectPoolDirs();
  for (const dir of dirs) {
    const confPath = path.join(dir, poolName + '.conf');
    if (fs.existsSync(confPath)) {
      let content = fs.readFileSync(confPath, 'utf8');
      const regex = new RegExp('^(' + directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=.*)$', 'm');
      const newLine = directive + ' = ' + value;
      if (regex.test(content)) {
        content = content.replace(regex, newLine);
      } else {
        const lines = content.split('\n');
        let insertIdx = lines.length;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].trim()) { insertIdx = i + 1; break; }
        }
        lines.splice(insertIdx, 0, newLine);
        content = lines.join('\n');
      }
      const tmpFile = confPath + '.tmp';
      fs.writeFileSync(tmpFile, content, 'utf8');
      fs.renameSync(tmpFile, confPath);
      return { success: true, directive, value, path: confPath };
    }
  }
  throw new Error('Pool not found: ' + poolName);
}

function configTest() {
  const result = runSafeSync('php-fpm', ['-t'], { timeout: 10000 });
  return {
    success: result.status === 0,
    output: ((result.stdout || '') + (result.stderr || '')).trim(),
  };
}

function restart() {
  const test = configTest();
  if (!test.success) return { success: false, error: 'Config test failed', output: test.output };
  const result = runSafeSync('systemctl', ['restart', 'php-fpm'], { timeout: 15000 });
  return { success: result.status === 0, output: ((result.stdout || '') + (result.stderr || '')).trim() };
}

function reload() {
  const result = runSafeSync('systemctl', ['reload', 'php-fpm'], { timeout: 10000 });
  return { success: result.status === 0, output: ((result.stdout || '') + (result.stderr || '')).trim() };
}

function phpModules() {
  const result = runSafeSync('php', ['-m'], { timeout: 5000 });
  if (result.status !== 0) return [];
  return result.stdout.split('\n').filter(l => l.trim() && !l.startsWith('[PHP Modules]') && !l.startsWith('[Zend Modules]')).map(l => l.trim()).sort();
}

function phpIni() {
  const result = runSafeSync('php', ['-i'], { timeout: 5000 });
  if (result.status !== 0) return null;
  const ini = {};
  for (const line of result.stdout.split('\n')) {
    const m = line.match(/^(\S[\w.()]+)\s+=>\s*(.+)$/);
    if (m) ini[m[1]] = m[2].trim();
  }
  return ini;
}

function poolLogs(poolName, lines) {
  if (!poolName || /[^a-zA-Z0-9._-]/.test(poolName)) throw new Error('Invalid pool name');
  const n = Math.min(parseInt(lines) || 100, 500);
  const logFile = '/var/log/php-fpm/' + poolName + '-error.log';
  const fallback = '/var/log/php-fpm/error.log';
  const file = fs.existsSync(logFile) ? logFile : (fs.existsSync(fallback) ? fallback : null);
  if (!file) return { lines: [], file: null };
  const result = runSafeSync('tail', ['-n', String(n), file], { timeout: 5000 });
  return { lines: (result.stdout || '').split('\n').filter(Boolean), file };
}

function slowLogs(poolName, lines) {
  if (!poolName || /[^a-zA-Z0-9._-]/.test(poolName)) throw new Error('Invalid pool name');
  const n = Math.min(parseInt(lines) || 100, 500);
  const logFile = '/var/log/php-fpm/' + poolName + '-slow.log';
  const fallback = '/var/log/php-fpm/www-slow.log';
  const file = fs.existsSync(logFile) ? logFile : (fs.existsSync(fallback) ? fallback : null);
  if (!file) return { lines: [], file: null };
  const result = runSafeSync('tail', ['-n', String(n), file], { timeout: 5000 });
  return { lines: (result.stdout || '').split('\n').filter(Boolean), file };
}

module.exports = { listPools, getStatus, poolStatus, phpVersion, opcacheStatus, globalConfig, poolConfig, editPoolConfig, configTest, restart, reload, phpModules, phpIni, poolLogs, slowLogs };
