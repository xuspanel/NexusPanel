const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const { runSafeSync, validators } = require('../utils/shell');

const execFileAsync = promisify(execFile);

const USERLIST_FILE = '/etc/vsftpd/user_list';
const FTPUSERS_FILE = '/etc/vsftpd/ftpusers';
const VSFTPD_LOG = '/var/log/xferlog';
const USER_CONFIG_DIR = '/etc/vsftpd/user_conf';

function userExists(username) {
  try {
    execFile.sync('id', ['-u', username], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function readLines(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
    }
  } catch (_) {}
  return [];
}

function writeLines(filePath, lines) {
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

function ensureUserConfigDir() {
  if (!fs.existsSync(USER_CONFIG_DIR)) {
    fs.mkdirSync(USER_CONFIG_DIR, { recursive: true });
  }
}

function readUserConfig(username) {
  ensureUserConfigDir();
  const cfgPath = path.join(USER_CONFIG_DIR, username);
  const cfg = { local_root: '', max_rate: 0, max_clients: 5, max_per_ip: 2 };
  try {
    if (fs.existsSync(cfgPath)) {
      const lines = fs.readFileSync(cfgPath, 'utf8').split('\n');
      for (const line of lines) {
        const m = line.match(/^(\w+)=(.+)$/);
        if (m) {
          const key = m[1].trim();
          let val = m[2].trim();
          if (key === 'max_rate' || key === 'max_clients' || key === 'max_per_ip') {
            val = parseInt(val) || 0;
          }
          cfg[key] = val;
        }
      }
    }
  } catch (_) {}
  return cfg;
}

function writeUserConfig(username, config) {
  ensureUserConfigDir();
  const cfgPath = path.join(USER_CONFIG_DIR, username);
  const lines = [];
  if (config.local_root && config.local_root !== '/') lines.push('local_root=' + config.local_root);
  if (config.max_rate > 0) lines.push('max_rate=' + config.max_rate);
  if (config.max_clients > 0) lines.push('max_clients=' + (config.max_clients || 5));
  if (config.max_per_ip > 0) lines.push('max_per_ip=' + (config.max_per_ip || 2));
  if (lines.length > 0) {
    fs.writeFileSync(cfgPath, lines.join('\n') + '\n', 'utf8');
  } else if (fs.existsSync(cfgPath)) {
    fs.unlinkSync(cfgPath);
  }
}

async function getAllSystemUsers() {
  try {
    const { stdout } = await execFileAsync('getent', ['passwd']);
    const result = [];
    stdout.split('\n').filter(Boolean).forEach(line => {
      const parts = line.split(':');
      if (parts.length >= 7) {
        const uid = parseInt(parts[2], 10);
        if (uid >= 1000 || uid === 0) {
          result.push({
            username: parts[0],
            uid,
            home: parts[5],
            shell: parts[6],
          });
        }
      }
    });
    return result;
  } catch { return []; }
}

async function listFTPAccounts() {
  const systemUsers = await getAllSystemUsers();
  const allowedSet = new Set(readLines(USERLIST_FILE));
  const deniedSet = new Set(readLines(FTPUSERS_FILE));

  const accounts = systemUsers.map(u => {
    const inUserlist = allowedSet.has(u.username);
    const inFtpusers = deniedSet.has(u.username);
    const enabled = inUserlist && !inFtpusers;
    const quota = getFTPQuota(u.home);
    const uc = readUserConfig(u.username);

    return {
      username: u.username,
      uid: u.uid,
      home: u.home,
      shell: u.shell,
      enabled,
      quotaSize: quota.size,
      quotaUsed: quota.used,
      localRoot: uc.local_root || u.home,
      maxRate: uc.max_rate || 0,
      maxClients: uc.max_clients || 5,
      maxPerIP: uc.max_per_ip || 2,
      isSystemUser: u.uid < 1000 && u.uid !== 0,
    };
  });

  return accounts;
}

function getFTPUserConfig(username) {
  const allowedSet = new Set(readLines(USERLIST_FILE));
  const deniedSet = new Set(readLines(FTPUSERS_FILE));
  const inUserlist = allowedSet.has(username);
  const inFtpusers = deniedSet.has(username);
  const uc = readUserConfig(username);
  const home = '/home/' + username;
  const quota = getFTPQuota(home);

  return {
    username,
    home,
    enabled: inUserlist && !inFtpusers,
    localRoot: uc.local_root || home,
    maxRate: uc.max_rate || 0,
    maxClients: uc.max_clients || 5,
    maxPerIP: uc.max_per_ip || 2,
    quotaUsed: quota.used,
    quotaSize: quota.size,
  };
}

function enableFTP(username) {
  const allowed = readLines(USERLIST_FILE);
  if (!allowed.includes(username)) {
    allowed.push(username);
    writeLines(USERLIST_FILE, allowed);
  }

  const denied = readLines(FTPUSERS_FILE);
  const filtered = denied.filter(u => u !== username);
  if (filtered.length !== denied.length) {
    writeLines(FTPUSERS_FILE, filtered);
  }

  return { username, enabled: true };
}

function disableFTP(username) {
  const allowed = readLines(USERLIST_FILE);
  const filtered = allowed.filter(u => u !== username);
  if (filtered.length !== allowed.length) {
    writeLines(USERLIST_FILE, filtered);
  }

  const denied = readLines(FTPUSERS_FILE);
  if (!denied.includes(username)) {
    denied.push(username);
    writeLines(FTPUSERS_FILE, denied);
  }

  return { username, enabled: false };
}

function createFTPUser(username, password, homeBase, maxRate, maxClients, maxPerIP) {
  if (!username || !password) throw new Error('Username and password required');
  if (!validators.username.test(username)) throw new Error('Invalid username');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');

  if (userExists(username)) throw new Error('System user already exists');

  const home = (homeBase && homeBase !== '/home/' + username) ? homeBase : '/home/' + username;
  runSafeSync('useradd', ['-m', '-d', home, '-s', '/sbin/nologin', '-c', 'FTP User', username]);

  const proc = spawn('chpasswd', [], { timeout: 5000 });
  proc.stdin.write(username + ':' + password + '\n');
  proc.stdin.end();

  enableFTP(username);

  writeUserConfig(username, {
    local_root: home,
    max_rate: maxRate || 0,
    max_clients: maxClients || 5,
    max_per_ip: maxPerIP || 2,
  });

  return getFTPUserConfig(username);
}

function editFTPUser(username, updates) {
  if (!validators.username.test(username)) throw new Error('Invalid username');
  if (!userExists(username)) throw new Error('User not found: ' + username);

  if (updates.password) {
    const proc = spawn('chpasswd', [], { timeout: 5000 });
    proc.stdin.write(username + ':' + updates.password + '\n');
    proc.stdin.end();
  }

  if (updates.home) {
    const oldHome = '/home/' + username;
    if (updates.home !== oldHome && updates.home) {
      runSafeSync('usermod', ['-d', updates.home, '-m', username]);
    }
  }

  const cfg = readUserConfig(username);
  const merged = {
    local_root: updates.localRoot || updates.home || cfg.local_root || '',
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
    try { execFile.sync('pkill', ['-9', '-u', username], { stdio: 'ignore' }); } catch {}
    try { execFile.sync('userdel', ['-rf', username], { timeout: 10000, stdio: 'ignore' }); } catch {}
  }

  const allowed = readLines(USERLIST_FILE).filter(u => u !== username);
  writeLines(USERLIST_FILE, allowed);

  const denied = readLines(FTPUSERS_FILE).filter(u => u !== username);
  writeLines(FTPUSERS_FILE, denied);

  ensureUserConfigDir();
  const cfgPath = path.join(USER_CONFIG_DIR, username);
  try { if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath); } catch (_) {}

  return { ok: true };
}

function getFTPQuota(homePath) {
  if (!homePath || !fs.existsSync(homePath)) return { size: 0, used: 0 };
  try {
    const result = runSafeSync('du', ['-sb', homePath]);
    if (result.status !== 0) return { size: 0, used: 0 };
    const used = parseInt(result.stdout.split('\t')[0]) || 0;
    return { size: 0, used };
  } catch (_) { return { size: 0, used: 0 }; }
}

function getFTPStatus() {
  const result = runSafeSync('systemctl', ['is-active', 'vsftpd']);
  const isActive = result.status === 0 && result.stdout.trim() === 'active';
  const allowedCount = readLines(USERLIST_FILE).length;
  const deniedCount = readLines(FTPUSERS_FILE).length;
  const config = (() => {
    try { return fs.readFileSync('/etc/vsftpd/vsftpd.conf', 'utf8'); } catch (_) { return ''; }
  })();

  const passivePorts = (config.match(/pasv_min_port=(\d+)/) || [])[1] || '30000';
  const passivePortsMax = (config.match(/pasv_max_port=(\d+)/) || [])[1] || '31000';
  const maxClients = (config.match(/max_clients=(\d+)/) || [])[1] || '50';
  const maxPerIP = (config.match(/max_per_ip=(\d+)/) || [])[1] || '10';
  const chrootLocal = config.includes('chroot_local_user=YES');
  const writeableChroot = config.includes('allow_writeable_chroot=YES');

  const verResult = runSafeSync('vsftpd', ['-v']);
  const version = (verResult.stderr || verResult.stdout).replace('vsftpd: version ', '').trim() || 'unknown';

  return {
    isActive, allowedUsers: allowedCount, deniedUsers: deniedCount,
    passiveRange: passivePorts + '-' + passivePortsMax,
    maxClients: parseInt(maxClients), maxPerIP: parseInt(maxPerIP),
    chrootEnabled: chrootLocal, writeableChroot,
    version,
  };
}

function getRecentLogs(limit) {
  limit = limit || 50;
  if (!fs.existsSync(VSFTPD_LOG)) return [];
  try {
    const content = fs.readFileSync(VSFTPD_LOG, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-limit).map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 8) return { raw: line };
      return {
        timestamp: parts.slice(0, 5).join(' '),
        transferType: parts[5] || '',
        fileSize: parseInt(parts[6]) || 0,
        fileName: parts.slice(7).join(' ') || '',
        raw: line,
      };
    });
  } catch (_) { return []; }
}

module.exports = {
  listFTPAccounts, getFTPUserConfig,
  enableFTP, disableFTP,
  createFTPUser, editFTPUser, deleteFTPUser,
  getFTPStatus, getRecentLogs, getFTPQuota,
  readUserConfig, writeUserConfig,
};
