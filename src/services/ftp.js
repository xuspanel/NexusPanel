const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const { runSafeSync, validators } = require('../utils/shell');
const audit = require('./audit');

const execFileAsync = promisify(execFile);

const USERLIST_FILE = '/etc/vsftpd/user_list';
const FTPUSERS_FILE = '/etc/vsftpd/ftpusers';
const VSFTPD_LOG = '/var/log/xferlog';
const VSFTPD_SERVICE_LOG = '/var/log/vsftpd.log';
const USER_CONFIG_DIR = '/etc/vsftpd/user_conf';
const VSFTPD_CONF = '/etc/vsftpd/vsftpd.conf';
const SSL_CERT = '/etc/vsftpd/ssl/vsftpd.pem';
const SSL_KEY = '/etc/vsftpd/ssl/vsftpd.pem';

/* ─── File Locking ─── */
const locks = new Map();

function withLock(filePath, fn) {
  return new Promise(function (resolve, reject) {
    const key = filePath;
    function attempt() {
      if (locks.get(key)) {
        setTimeout(attempt, 20);
        return;
      }
      locks.set(key, true);
      try {
        const result = fn();
        if (result && typeof result.then === 'function') {
          result.then(function (r) { locks.delete(key); resolve(r); })
            .catch(function (e) { locks.delete(key); reject(e); });
        } else {
          locks.delete(key);
          resolve(result);
        }
      } catch (e) {
        locks.delete(key);
        reject(e);
      }
    }
    attempt();
  });
}

/* ─── Helpers ─── */
function userExists(username) {
  try {
    execFile.sync('id', ['-u', username], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function readLines(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    }
  } catch (_) {}
  return [];
}

function writeLines(filePath, lines) {
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureUserConfigDir() { ensureDir(USER_CONFIG_DIR); }

function readUserConfig(username) {
  ensureUserConfigDir();
  var cfgPath = path.join(USER_CONFIG_DIR, username);
  var cfg = { local_root: '', max_rate: 0, max_clients: 5, max_per_ip: 2 };
  try {
    if (fs.existsSync(cfgPath)) {
      var lines = fs.readFileSync(cfgPath, 'utf8').split('\n');
      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/^(\w+)=(.+)$/);
        if (m) {
          var key = m[1].trim();
          var val = m[2].trim();
          if (key === 'max_rate' || key === 'max_clients' || key === 'max_per_ip') val = parseInt(val) || 0;
          cfg[key] = val;
        }
      }
    }
  } catch (_) {}
  return cfg;
}

function writeUserConfig(username, config) {
  ensureUserConfigDir();
  var cfgPath = path.join(USER_CONFIG_DIR, username);
  var lines = [];
  if (config.local_root && config.local_root !== '/') lines.push('local_root=' + config.local_root);
  if (config.write_enable !== undefined) lines.push('write_enable=' + (config.write_enable ? 'YES' : 'NO'));
  if (config.download_enable !== undefined) lines.push('download_enable=' + (config.download_enable ? 'YES' : 'NO'));
  if (config.max_rate > 0) lines.push('max_rate=' + config.max_rate);
  if (config.max_clients > 0) lines.push('max_clients=' + (config.max_clients || 5));
  if (config.max_per_ip > 0) lines.push('max_per_ip=' + (config.max_per_ip || 2));
  if (config.file_open_mode) lines.push('file_open_mode=' + config.file_open_mode);
  if (config.chown_username) lines.push('chown_username=' + config.chown_username);
  if (config.chmod_enable !== undefined) lines.push('chmod_enable=' + (config.chmod_enable ? 'YES' : 'NO'));
  if (lines.length > 0) {
    fs.writeFileSync(cfgPath, lines.join('\n') + '\n', 'utf8');
  } else if (fs.existsSync(cfgPath)) {
    fs.unlinkSync(cfgPath);
  }
}

/* ─── System Users ─── */
async function getAllSystemUsers() {
  try {
    var result = await execFileAsync('getent', ['passwd']);
    var users = [];
    result.stdout.split('\n').filter(Boolean).forEach(function (line) {
      var parts = line.split(':');
      if (parts.length >= 7) {
        var uid = parseInt(parts[2], 10);
        if (uid >= 1000 || uid === 0) {
          users.push({ username: parts[0], uid: uid, home: parts[5], shell: parts[6] });
        }
      }
    });
    return users;
  } catch { return []; }
}

/* ─── Quota ─── */
function getFTPQuota(homePath) {
  if (!homePath || !fs.existsSync(homePath)) return { size: 0, used: 0 };
  try {
    var result = runSafeSync('du', ['-sb', homePath]);
    if (result.status !== 0) return { size: 0, used: 0 };
    var used = parseInt(result.stdout.split('\t')[0]) || 0;
    return { size: 0, used: used };
  } catch (_) { return { size: 0, used: 0 }; }
}

function setFTPQuota(username, bytes) {
  if (!validators.username.test(username)) throw new Error('Invalid username');
  if (!bytes || bytes <= 0) return { quota: 0 };
  var result = runSafeSync('setquota', ['-u', username, String(bytes), String(Math.round(bytes * 1.1)), '0', '0'], { timeout: 5000 });
  if (result.status !== 0) throw new Error('setquota failed: ' + (result.stderr || 'unknown error'));
  return { quota: bytes };
}

function getFTPQuotaDetailed(username) {
  if (!validators.username.test(username)) return { quota: 0, used: 0, grace: '' };
  try {
    var result = runSafeSync('repquota', ['-as', '/'], { timeout: 5000 });
    if (result.status !== 0) return { quota: 0, used: 0, grace: '' };
    var lines = result.stdout.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(username + ' ') === 0 || lines[i].indexOf(' ' + username + ' ') >= 0) {
        var parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 4) {
          return {
            quota: parseInt(parts[1]) || 0,
            used: parseInt(parts[2]) || 0,
            grace: parts[3] || ''
          };
        }
      }
    }
  } catch (_) {}
  return { quota: 0, used: 0, grace: '' };
}

/* ─── Accounts CRUD ─── */
async function listFTPAccounts(opts) {
  var systemUsers = await getAllSystemUsers();
  var allowedSet = new Set(readLines(USERLIST_FILE));
  var deniedSet = new Set(readLines(FTPUSERS_FILE));

  var accounts = systemUsers.map(function (u) {
    var inUserlist = allowedSet.has(u.username);
    var inFtpusers = deniedSet.has(u.username);
    var enabled = inUserlist && !inFtpusers;
    var quota = getFTPQuota(u.home);
    var uc = readUserConfig(u.username);

    return {
      username: u.username,
      uid: u.uid,
      home: u.home,
      shell: u.shell,
      enabled: enabled,
      quotaSize: quota.size,
      quotaUsed: quota.used,
      localRoot: uc.local_root || u.home,
      maxRate: uc.max_rate || 0,
      maxClients: uc.max_clients || 5,
      maxPerIP: uc.max_per_ip || 2,
      writeEnable: uc.write_enable !== false,
      downloadEnable: uc.download_enable !== false,
      isSystemUser: u.uid < 1000 && u.uid !== 0,
    };
  });

  /* Search / filter */
  if (opts && opts.search) {
    var q = opts.search.toLowerCase();
    accounts = accounts.filter(function (a) {
      return a.username.toLowerCase().indexOf(q) >= 0 ||
        a.home.toLowerCase().indexOf(q) >= 0 ||
        a.localRoot.toLowerCase().indexOf(q) >= 0;
    });
  }

  /* Sort by username */
  accounts.sort(function (a, b) { return a.username.localeCompare(b.username); });

  /* Pagination */
  var total = accounts.length;
  var offset = (opts && opts.offset) || 0;
  var limit = (opts && opts.limit) || 100;
  accounts = accounts.slice(offset, offset + limit);

  return { accounts: accounts, total: total, offset: offset, limit: limit };
}

function getFTPUserConfig(username) {
  var allowedSet = new Set(readLines(USERLIST_FILE));
  var deniedSet = new Set(readLines(FTPUSERS_FILE));
  var inUserlist = allowedSet.has(username);
  var inFtpusers = deniedSet.has(username);
  var uc = readUserConfig(username);
  var home = '/home/' + username;
  var quota = getFTPQuota(home);

  return {
    username: username,
    home: home,
    enabled: inUserlist && !inFtpusers,
    localRoot: uc.local_root || home,
    maxRate: uc.max_rate || 0,
    maxClients: uc.max_clients || 5,
    maxPerIP: uc.max_per_ip || 2,
    writeEnable: uc.write_enable !== false,
    downloadEnable: uc.download_enable !== false,
    quotaUsed: quota.used,
    quotaSize: quota.size,
  };
}

async function createFTPUser(username, password, homeBase, opts) {
  if (!username || !password) throw new Error('Username and password required');
  if (!validators.username.test(username)) throw new Error('Invalid username');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  if (userExists(username)) throw new Error('System user already exists');

  var home = (homeBase && homeBase !== '/home/' + username) ? homeBase : '/home/' + username;
  runSafeSync('useradd', ['-m', '-d', home, '-s', '/sbin/nologin', '-c', 'FTP User', username]);

  return new Promise(function (resolve, reject) {
    var proc = spawn('chpasswd', [], { timeout: 5000 });
    proc.stdin.write(username + ':' + password + '\n');
    proc.stdin.end();
    proc.on('close', function () {
      try {
        enableFTP(username);
        writeUserConfig(username, {
          local_root: home,
          write_enable: true,
          download_enable: true,
          max_rate: (opts && opts.maxRate) || 0,
          max_clients: (opts && opts.maxClients) || 5,
          max_per_ip: (opts && opts.maxPerIP) || 2,
        });
        resolve(getFTPUserConfig(username));
      } catch (e) { reject(e); }
    });
    proc.on('error', function (e) { reject(e); });
  });
}

async function editFTPUser(username, updates) {
  if (!validators.username.test(username)) throw new Error('Invalid username');
  if (!userExists(username)) throw new Error('User not found: ' + username);

  if (updates.password) {
    await new Promise(function (resolve, reject) {
      var proc = spawn('chpasswd', [], { timeout: 5000 });
      proc.stdin.write(username + ':' + updates.password + '\n');
      proc.stdin.end();
      proc.on('close', resolve);
      proc.on('error', reject);
    });
  }

  if (updates.home) {
    var oldHome = '/home/' + username;
    if (updates.home !== oldHome && updates.home) {
      runSafeSync('usermod', ['-d', updates.home, '-m', username]);
    }
  }

  var cfg = readUserConfig(username);
  var merged = {
    local_root: updates.localRoot || updates.home || cfg.local_root || '',
    write_enable: updates.writeEnable !== undefined ? updates.writeEnable : cfg.write_enable,
    download_enable: updates.downloadEnable !== undefined ? updates.downloadEnable : cfg.download_enable,
    max_rate: updates.maxRate !== undefined ? updates.maxRate : cfg.max_rate,
    max_clients: updates.maxClients !== undefined ? updates.maxClients : cfg.max_clients,
    max_per_ip: updates.maxPerIP !== undefined ? updates.maxPerIP : cfg.max_per_ip,
  };
  writeUserConfig(username, merged);

  if (updates.enabled === true) enableFTP(username);
  else if (updates.enabled === false) disableFTP(username);

  return getFTPUserConfig(username);
}

function deleteFTPUser(username) {
  if (!validators.username.test(username)) throw new Error('Invalid username');
  if (userExists(username)) {
    /* Kill only vsftpd sessions for this user, not all processes */
    try { execFile.sync('pkill', ['-9', '-f', 'vsftpd.*' + username], { stdio: 'ignore' }); } catch {}
    try { execFile.sync('userdel', ['-r', username], { timeout: 10000, stdio: 'ignore' }); } catch {}
  }

  var allowed = readLines(USERLIST_FILE).filter(function (u) { return u !== username; });
  writeLines(USERLIST_FILE, allowed);

  var denied = readLines(FTPUSERS_FILE).filter(function (u) { return u !== username; });
  writeLines(FTPUSERS_FILE, denied);

  ensureUserConfigDir();
  var cfgPath = path.join(USER_CONFIG_DIR, username);
  try { if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath); } catch (_) {}

  return { ok: true };
}

/* ─── Bulk Operations ─── */
async function bulkEnable(usernames) {
  var results = [];
  for (var i = 0; i < usernames.length; i++) {
    try { enableFTP(usernames[i]); results.push({ username: usernames[i], ok: true }); }
    catch (e) { results.push({ username: usernames[i], ok: false, error: e.message }); }
  }
  return results;
}

async function bulkDisable(usernames) {
  var results = [];
  for (var i = 0; i < usernames.length; i++) {
    try { disableFTP(usernames[i]); results.push({ username: usernames[i], ok: true }); }
    catch (e) { results.push({ username: usernames[i], ok: false, error: e.message }); }
  }
  return results;
}

async function bulkDelete(usernames) {
  var results = [];
  for (var i = 0; i < usernames.length; i++) {
    try { deleteFTPUser(usernames[i]); results.push({ username: usernames[i], ok: true }); }
    catch (e) { results.push({ username: usernames[i], ok: false, error: e.message }); }
  }
  return results;
}

/* ─── Enable / Disable ─── */
function enableFTP(username) {
  var allowed = readLines(USERLIST_FILE);
  if (!allowed.includes(username)) {
    allowed.push(username);
    writeLines(USERLIST_FILE, allowed);
  }

  var denied = readLines(FTPUSERS_FILE);
  var filtered = denied.filter(function (u) { return u !== username; });
  if (filtered.length !== denied.length) {
    writeLines(FTPUSERS_FILE, filtered);
  }

  return { username: username, enabled: true };
}

function disableFTP(username) {
  var allowed = readLines(USERLIST_FILE);
  var filtered = allowed.filter(function (u) { return u !== username; });
  if (filtered.length !== allowed.length) {
    writeLines(USERLIST_FILE, filtered);
  }

  var denied = readLines(FTPUSERS_FILE);
  if (!denied.includes(username)) {
    denied.push(username);
    writeLines(FTPUSERS_FILE, denied);
  }

  return { username: username, enabled: false };
}

/* ─── Service Control ─── */
function getFTPStatus() {
  var result = runSafeSync('systemctl', ['is-active', 'vsftpd']);
  var isActive = result.status === 0 && result.stdout.trim() === 'active';
  var allowedCount = readLines(USERLIST_FILE).length;
  var deniedCount = readLines(FTPUSERS_FILE).length;
  var config = '';
  try { config = fs.readFileSync(VSFTPD_CONF, 'utf8'); } catch (_) {}

  var passivePorts = (config.match(/pasv_min_port=(\d+)/) || [])[1] || '30000';
  var passivePortsMax = (config.match(/pasv_max_port=(\d+)/) || [])[1] || '31000';
  var maxClients = (config.match(/max_clients=(\d+)/) || [])[1] || '50';
  var maxPerIP = (config.match(/max_per_ip=(\d+)/) || [])[1] || '10';
  var chrootLocal = config.indexOf('chroot_local_user=YES') >= 0;
  var writeableChroot = config.indexOf('allow_writeable_chroot=YES') >= 0;
  var sslEnabled = config.indexOf('ssl_enable=YES') >= 0;

  var verResult = runSafeSync('vsftpd', ['-v']);
  var version = (verResult.stderr || verResult.stdout).replace('vsftpd: version ', '').trim() || 'unknown';

  /* Connection count from active sessions */
  var sessionCount = 0;
  try {
    var ss = runSafeSync('ss', ['-tlnp', 'state established', '( sport = :21 )']);
    if (ss.status === 0) {
      sessionCount = ss.stdout.split('\n').filter(function (l) { return l.trim() && l.indexOf('ESTAB') >= 0; }).length;
    }
  } catch (_) {}

  return {
    isActive: isActive,
    allowedUsers: allowedCount,
    deniedUsers: deniedCount,
    passiveRange: passivePorts + '-' + passivePortsMax,
    passiveMin: parseInt(passivePorts),
    passiveMax: parseInt(passivePortsMax),
    maxClients: parseInt(maxClients),
    maxPerIP: parseInt(maxPerIP),
    chrootEnabled: chrootLocal,
    writeableChroot: writeableChroot,
    sslEnabled: sslEnabled,
    version: version,
    activeSessions: sessionCount,
  };
}

function controlService(action) {
  if (!['start', 'stop', 'restart', 'reload'].includes(action)) throw new Error('Invalid action: ' + action);
  var result = runSafeSync('systemctl', [action, 'vsftpd'], { timeout: 15000 });
  if (result.status !== 0) throw new Error('Service ' + action + ' failed: ' + (result.stderr || 'unknown'));
  return { action: action, ok: true };
}

/* ─── Connection Test ─── */
function testConnection(host, port, username, password) {
  host = host || '127.0.0.1';
  port = port || 21;
  return new Promise(function (resolve) {
    var net = require('net');
    var sock = new net.Socket();
    var response = '';
    var done = false;

    function finish(result) {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch (_) {}
      resolve(result);
    }

    sock.setTimeout(5000);
    sock.on('connect', function () {
      response = '';
    });
    sock.on('data', function (data) {
      response += data.toString();
      /* FTP greeting */
      if (response.indexOf('220') === 0 && response.indexOf('\n') >= 0) {
        if (!username) { finish({ ok: true, greeting: response.split('\n')[0].trim() }); return; }
        sock.write('USER ' + username + '\r\n');
        response = '';
      }
      if (response.indexOf('331') >= 0) {
        sock.write('PASS ' + password + '\r\n');
        response = '';
      }
      if (response.indexOf('230') >= 0) {
        sock.write('QUIT\r\n');
        finish({ ok: true, greeting: 'Login successful' });
      }
      if (response.indexOf('530') >= 0) {
        finish({ ok: false, error: 'Authentication failed' });
      }
    });
    sock.on('timeout', function () { finish({ ok: false, error: 'Connection timed out' }); });
    sock.on('error', function (err) { finish({ ok: false, error: err.message }); });
    sock.connect(port, host);
  });
}

/* ─── Config Editor ─── */
function readConfig() {
  try { return fs.readFileSync(VSFTPD_CONF, 'utf8'); } catch (_) { return ''; }
}

function writeConfig(content) {
  if (!content || typeof content !== 'string') throw new Error('Config content required');
  /* Backup current config */
  var backupPath = VSFTPD_CONF + '.bak.' + Date.now();
  try {
    if (fs.existsSync(VSFTPD_CONF)) fs.copyFileSync(VSFTPD_CONF, backupPath);
  } catch (_) {}
  fs.writeFileSync(VSFTPD_CONF, content, 'utf8');
  return { ok: true, backup: backupPath };
}

function updateConfigValue(key, value) {
  if (!key || typeof key !== 'string') throw new Error('Key required');
  var config = readConfig();
  var regex = new RegExp('^(' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=).*$');
  var found = false;
  var lines = config.split('\n').map(function (line) {
    if (line.match(regex)) { found = true; return key + '=' + value; }
    return line;
  });
  if (!found) lines.push(key + '=' + value);
  return writeConfig(lines.join('\n'));
}

/* ─── Passive Ports ─── */
function setPassivePorts(minPort, maxPort) {
  minPort = parseInt(minPort) || 40000;
  maxPort = parseInt(maxPort) || 40010;
  if (minPort < 1024 || maxPort > 65535 || minPort >= maxPort) {
    throw new Error('Port range must be 1024-65535 with min < max');
  }
  updateConfigValue('pasv_min_port', String(minPort));
  updateConfigValue('pasv_max_port', String(maxPort));
  return { minPort: minPort, maxPort: maxPort };
}

/* ─── SSL Certificate ─── */
function getSSLCertInfo() {
  if (!fs.existsSync(SSL_CERT)) return null;
  try {
    var result = runSafeSync('openssl', ['x509', '-in', SSL_CERT, '-noout', '-subject', '-dates', '-issuer'], { timeout: 5000 });
    if (result.status !== 0) return null;
    var info = {};
    var lines = result.stdout.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('subject=') === 0) info.subject = lines[i].substring(8).trim();
      if (lines[i].indexOf('notBefore=') === 0) info.notBefore = lines[i].substring(10).trim();
      if (lines[i].indexOf('notAfter=') === 0) info.notAfter = lines[i].substring(9).trim();
      if (lines[i].indexOf('issuer=') === 0) info.issuer = lines[i].substring(7).trim();
    }
    info.exists = true;
    return info;
  } catch (_) { return null; }
}

function generateSelfSignedSSL(domain) {
  domain = domain || 'localhost';
  ensureDir('/etc/vsftpd/ssl');
  var result = runSafeSync('openssl', [
    'req', '-x509', '-nodes', '-days', '365',
    '-newkey', 'rsa:2048',
    '-keyout', SSL_KEY,
    '-out', SSL_CERT,
    '-subj', '/CN=' + domain + '/O=NexusPanel/C=US'
  ], { timeout: 15000 });
  if (result.status !== 0) throw new Error('SSL generation failed: ' + (result.stderr || 'unknown'));
  return { ok: true, cert: SSL_CERT, key: SSL_KEY };
}

/* ─── Activity Logs ─── */
function getRecentLogs(limit) {
  limit = limit || 50;
  var lines = [];
  /* Try vsftpd.log first (more detailed), fall back to xferlog */
  if (fs.existsSync(VSFTPD_SERVICE_LOG)) {
    try {
      var content = fs.readFileSync(VSFTPD_SERVICE_LOG, 'utf8');
      lines = content.split('\n').filter(Boolean);
    } catch (_) {}
  }
  if (lines.length === 0 && fs.existsSync(VSFTPD_LOG)) {
    try {
      var content = fs.readFileSync(VSFTPD_LOG, 'utf8');
      lines = content.split('\n').filter(Boolean);
    } catch (_) {}
  }

  return lines.slice(-limit).map(function (line) {
    var trimmed = line.trim();
    /* vsftpd.log format: "date time [pid] username (ip) [note] message" */
    var vsftpdMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\d+)\]\s+(\S+)?\s*(?:\(([^)]*)\))?\s*\[?\w*\]?\s*(.*)$/);
    if (vsftpdMatch) {
      return {
        timestamp: vsftpdMatch[1],
        pid: parseInt(vsftpdMatch[2]) || 0,
        username: vsftpdMatch[3] || '',
        ip: vsftpdMatch[4] || '',
        message: vsftpdMatch[5] || '',
        raw: trimmed,
      };
    }
    /* xferlog format */
    var parts = trimmed.split(/\s+/);
    if (parts.length >= 8) {
      return {
        timestamp: parts.slice(0, 5).join(' '),
        transferType: parts[5] || '',
        fileSize: parseInt(parts[6]) || 0,
        fileName: parts.slice(7).join(' ') || '',
        raw: trimmed,
      };
    }
    return { raw: trimmed };
  });
}

function getActivityLogs(opts) {
  opts = opts || {};
  var limit = opts.limit || 100;
  var search = opts.search || '';
  var logs = getRecentLogs(limit * 3);
  if (search) {
    var q = search.toLowerCase();
    logs = logs.filter(function (l) {
      return (l.raw || '').toLowerCase().indexOf(q) >= 0 ||
        (l.username || '').toLowerCase().indexOf(q) >= 0 ||
        (l.ip || '').toLowerCase().indexOf(q) >= 0;
    });
  }
  return { logs: logs.slice(0, limit), total: logs.length };
}

/* ─── Bandwidth Monitoring ─── */
function getBandwidthStats() {
  var logs = getRecentLogs(500);
  var totalIn = 0;
  var totalOut = 0;
  var recentTransfers = [];
  for (var i = 0; i < logs.length; i++) {
    var log = logs[i];
    if (log.fileSize) {
      if (log.transferType === 'i' || log.transferType === 'o') {
        totalOut += log.fileSize;
      } else {
        totalIn += log.fileSize;
      }
      recentTransfers.push({
        fileName: log.fileName,
        size: log.fileSize,
        type: log.transferType,
        timestamp: log.timestamp,
      });
    }
  }
  return {
    totalIn: totalIn,
    totalOut: totalOut,
    transferCount: logs.filter(function (l) { return l.fileSize; }).length,
    recentTransfers: recentTransfers.slice(0, 20),
  };
}

module.exports = {
  listFTPAccounts: listFTPAccounts,
  getFTPUserConfig: getFTPUserConfig,
  enableFTP: enableFTP,
  disableFTP: disableFTP,
  createFTPUser: createFTPUser,
  editFTPUser: editFTPUser,
  deleteFTPUser: deleteFTPUser,
  bulkEnable: bulkEnable,
  bulkDisable: bulkDisable,
  bulkDelete: bulkDelete,
  getFTPStatus: getFTPStatus,
  controlService: controlService,
  testConnection: testConnection,
  readConfig: readConfig,
  writeConfig: writeConfig,
  updateConfigValue: updateConfigValue,
  setPassivePorts: setPassivePorts,
  getSSLCertInfo: getSSLCertInfo,
  generateSelfSignedSSL: generateSelfSignedSSL,
  getRecentLogs: getRecentLogs,
  getActivityLogs: getActivityLogs,
  getBandwidthStats: getBandwidthStats,
  getFTPQuota: getFTPQuota,
  setFTPQuota: setFTPQuota,
  getFTPQuotaDetailed: getFTPQuotaDetailed,
  readUserConfig: readUserConfig,
  writeUserConfig: writeUserConfig,
};
