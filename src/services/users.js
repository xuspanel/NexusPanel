const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const { runSafeSync, validators } = require('../utils/shell');

const execFileAsync = promisify(execFile);
const ALLOWED_FIELDS = ['passwordHash', 'email', 'twoFactorSecret', 'twoFactorEnabled'];

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');
const VALID_HOME_BASES = ['/home', '/var/www'];

let writeLock = false;
const LOCK_TIMEOUT = 5000;

function acquireLock() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const wait = () => {
      if (!writeLock) { writeLock = true; return resolve(); }
      if (Date.now() - start > LOCK_TIMEOUT) return reject(new Error('Write lock timeout'));
      setTimeout(wait, 10);
    };
    wait();
  });
}

function releaseLock() { writeLock = false; }

function loadAll() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Users] Failed to load users.json:', err.message);
  }
  return {};
}

function saveAll(users) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = USERS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmpFile, USERS_FILE);
}

function sanitizeUserResponse(username, data) {
  const out = { username };
  for (const key of Object.keys(data)) {
    if (key === 'passwordHash' || key === 'twoFactorSecret') continue;
    out[key] = data[key];
  }
  return out;
}

function validatePasswordStrength(password) {
  if (!password || password.length < 6) return 'Password must be at least 6 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit';
  return null;
}

function validateHomeBase(homeBase) {
  if (!homeBase) return '/home';
  const resolved = path.resolve(homeBase);
  if (!VALID_HOME_BASES.some(base => resolved === base || resolved.startsWith(base + '/'))) {
    throw new Error('Invalid home base directory. Allowed: ' + VALID_HOME_BASES.join(', '));
  }
  return resolved;
}

function validateGroupName(name) {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name) && name.length <= 32;
}

function init() {
  let users = loadAll();
  if (Object.keys(users).length > 0) return users;

  const adminPass = process.env.ADMIN_PASS;
  if (!adminPass) {
    throw new Error('ADMIN_PASS must be set in .env — refusing to create admin with default password');
  }
  const adminHash = bcrypt.hashSync(adminPass, 12);

  const oldProfile = (() => {
    try {
      if (fs.existsSync(PROFILE_FILE)) return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
    } catch (_) {}
    return {};
  })();

  const adminUser = {
    passwordHash: adminHash,
    email: oldProfile.email || (process.env.ADMIN_USER || 'admin') + '@meedo51.com',
    twoFactorSecret: oldProfile.twoFactorSecret || null,
    twoFactorEnabled: oldProfile.twoFactorEnabled || false,
    role: 'admin',
    createdAt: new Date().toISOString(),
  };

  users[(process.env.ADMIN_USER || 'admin')] = adminUser;
  saveAll(users);
  return users;
}

function getPanelUser(username) {
  const users = loadAll();
  return users[username] || null;
}

function getPanelUserSafe(username) {
  const user = getPanelUser(username);
  if (!user) return null;
  return sanitizeUserResponse(username, user);
}

function panelUserExists(username) {
  const users = loadAll();
  return !!users[username];
}

function listPanelUsers() {
  const users = loadAll();
  return Object.entries(users).map(([username, data]) => ({
    username,
    email: data.email || '',
    role: data.role || 'user',
    twoFactorEnabled: data.twoFactorEnabled || false,
    createdAt: data.createdAt || '',
  }));
}

async function createPanelUser(username, password, email, role) {
  await acquireLock();
  try {
    const users = loadAll();
    if (users[username]) throw new Error('Panel user already exists');
    users[username] = {
      passwordHash: bcrypt.hashSync(password, 12),
      email: email || username + '@meedo51.com',
      twoFactorSecret: null,
      twoFactorEnabled: false,
      role: role || 'user',
      createdAt: new Date().toISOString(),
    };
    saveAll(users);
  } finally {
    releaseLock();
  }
}

async function deletePanelUser(username) {
  const adminName = process.env.ADMIN_USER || 'admin';
  if (username === adminName) throw new Error('Cannot delete the primary admin user');
  await acquireLock();
  try {
    const users = loadAll();
    delete users[username];
    saveAll(users);
  } finally {
    releaseLock();
  }
}

function updatePanelUser(username, updates) {
  const users = loadAll();
  if (!users[username]) throw new Error('Panel user not found');
  if (updates.password) {
    updates.passwordHash = bcrypt.hashSync(updates.password, 12);
    delete updates.password;
  }
  for (const key of Object.keys(updates)) {
    if (ALLOWED_FIELDS.includes(key)) {
      users[username][key] = updates[key];
    }
  }
  saveAll(users);
}

function verifyPassword(username, password) {
  const users = loadAll();
  const user = users[username];
  if (!user || !user.passwordHash) return false;
  return bcrypt.compareSync(password, user.passwordHash);
}

function changePassword(username, currentPassword, newPassword) {
  const users = loadAll();
  const user = users[username];
  if (!user) return { error: 'User not found' };
  if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return { error: 'Current password is incorrect' };
  }
  const strengthErr = validatePasswordStrength(newPassword);
  if (strengthErr) return { error: strengthErr };
  user.passwordHash = bcrypt.hashSync(newPassword, 12);
  saveAll(users);
  return { success: true };
}

function updateEmail(username, email) {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email format');
  }
  const users = loadAll();
  const user = users[username];
  if (!user) return false;
  user.email = email;
  saveAll(users);
  return true;
}

function setTwoFactorSecret(username, secret) {
  const users = loadAll();
  const user = users[username];
  if (!user) return false;
  user.twoFactorSecret = secret;
  saveAll(users);
  return true;
}

function enableTwoFactor(username) {
  const users = loadAll();
  const user = users[username];
  if (!user) return false;
  user.twoFactorEnabled = true;
  saveAll(users);
  return true;
}

function disableTwoFactor(username) {
  const users = loadAll();
  const user = users[username];
  if (!user) return false;
  user.twoFactorSecret = null;
  user.twoFactorEnabled = false;
  saveAll(users);
  return true;
}

function isTwoFactorEnabled(username) {
  const user = getPanelUser(username);
  return user ? !!user.twoFactorEnabled : false;
}

function getTwoFactorSecret(username) {
  const user = getPanelUser(username);
  return user ? user.twoFactorSecret : null;
}

async function userExists(username) {
  try {
    await execFileAsync('id', ['-u', username]);
    return true;
  } catch {
    return false;
  }
}

async function changeSystemPassword(username, password) {
  return new Promise((resolve, reject) => {
    const proc = spawn('chpasswd', [], { timeout: 5000 });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || 'chpasswd failed'));
    });
    proc.on('error', reject);
    proc.stdin.write(username.replace(/[\n\r]/g, '') + ':' + password.replace(/[\n\r]/g, '') + '\n');
    proc.stdin.end();
  });
}

function getAvailableShells() {
  try {
    const content = fs.readFileSync('/etc/shells', 'utf8');
    return content.split('\n').filter(l => l && !l.startsWith('#')).map(s => s.trim()).filter(Boolean);
  } catch (_) {
    return ['/bin/bash', '/bin/sh', '/usr/sbin/nologin'];
  }
}

async function listSystemUsers(opts = {}) {
  const { search, sort, order, page, limit } = opts;
  const { stdout: passwd } = await execFileAsync('getent', ['passwd']).catch(() => ({ stdout: '' }));
  const { stdout: shadow } = await execFileAsync('getent', ['shadow']).catch(() => ({ stdout: '' }));
  const { stdout: groups } = await execFileAsync('getent', ['group']).catch(() => ({ stdout: '' }));

  const panelUsers = loadAll();

  const shadowMap = {};
  shadow.split('\n').filter(Boolean).forEach(line => {
    const parts = line.split(':');
    if (parts.length >= 2) shadowMap[parts[0]] = parts[1];
  });

  const groupMap = {};
  groups.split('\n').filter(Boolean).forEach(line => {
    const parts = line.split(':');
    if (parts.length >= 4) groupMap[parts[0]] = parts[3] ? parts[3].split(',') : [];
  });

  const sudoGroupMembers = new Set();
  for (const g of ['sudo', 'wheel', 'admin']) {
    try {
      const { stdout: gOut } = await execFileAsync('getent', ['group', g]).catch(() => ({ stdout: '' }));
      gOut.split('\n').filter(Boolean).forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 4 && parts[3]) {
          parts[3].split(',').forEach(u => sudoGroupMembers.add(u.trim()));
        }
      });
    } catch {}
  }

  const sudoDirectUsers = new Set();
  try {
    const sudoFiles = fs.readdirSync('/etc/sudoers.d');
    sudoFiles.forEach(f => {
      try {
        const content = fs.readFileSync(path.join('/etc/sudoers.d', f), 'utf8');
        content.split('\n').forEach(line => {
          const m = line.match(/^(\w+)\s+ALL=/);
          if (m) sudoDirectUsers.add(m[1]);
          const m2 = line.match(/^%(\w+)\s+ALL=/);
          if (m2) {
            const members = groupMap[m2[1]] || [];
            members.forEach(u => sudoDirectUsers.add(u));
          }
        });
      } catch {}
    });
  } catch {}

  const allUsers = passwd.split('\n').filter(Boolean);
  const result = [];

  for (const line of allUsers) {
    const parts = line.split(':');
    if (parts.length < 7) continue;
    const [username, , uid, gid, gecos, home, shell] = parts;
    const uidNum = parseInt(uid, 10);
    const isSystem = uidNum < 1000 && uidNum !== 0;

    const userGroups = [];
    Object.entries(groupMap).forEach(([gname, members]) => {
      if (members.includes(username)) userGroups.push(gname);
    });
    if (gid) {
      try {
        const { stdout: pgOut } = await execFileAsync('getent', ['group', gid]).catch(() => ({ stdout: '' }));
        const primaryGroup = pgOut.split(':')[0];
        if (primaryGroup && !userGroups.includes(primaryGroup)) userGroups.unshift(primaryGroup);
      } catch {}
    }

    const shadowPw = shadowMap[username] || '';
    const isLocked = shadowPw === '*' || shadowPw === '!' || shadowPw.startsWith('!') || shadowPw === '!!';

    const hasSudo = sudoGroupMembers.has(username) || sudoDirectUsers.has(username);

    let lastLogin = null;
    try {
      const { stdout: llOut } = await execFileAsync('lastlog', ['-u', username]).catch(() => ({ stdout: '' }));
      const lastLine = llOut.split('\n').pop() || '';
      if (!lastLine.includes('**Never logged in**')) {
        const parts2 = lastLine.split(/\s+/);
        if (parts2.length >= 5) lastLogin = parts2.slice(3).join(' ');
      }
    } catch {}

    const panel = panelUsers[username] || null;

    result.push({
      username,
      uid: uidNum,
      gid: parseInt(gid, 10) || 0,
      gecos,
      home,
      shell,
      isSystem,
      isLocked,
      groups: userGroups,
      hasSudo,
      lastLogin,
      panelEnabled: !!panel,
      panelRole: panel ? panel.role : null,
      twoFactorEnabled: panel ? !!panel.twoFactorEnabled : false,
      email: panel ? panel.email : '',
    });
  }

  if (search) {
    const q = search.toLowerCase();
    const filtered = result.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.shell.toLowerCase().includes(q) ||
      u.home.toLowerCase().includes(q) ||
      u.groups.some(g => g.toLowerCase().includes(q))
    );
    return applySortingAndPagination(filtered, sort, order, page, limit);
  }

  return applySortingAndPagination(result, sort, order, page, limit);
}

function applySortingAndPagination(arr, sort, order, page, limit) {
  if (sort) {
    const dir = order === 'desc' ? -1 : 1;
    arr.sort((a, b) => {
      const va = a[sort] ?? '';
      const vb = b[sort] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  const total = arr.length;
  if (page && limit) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const start = (p - 1) * l;
    return { users: arr.slice(start, start + l), total, page: p, limit: l, pages: Math.ceil(total / l) };
  }

  return { users: arr, total, page: 1, limit: total, pages: 1 };
}

async function getSystemUser(username) {
  if (!validators.username.test(username)) throw new Error('Invalid username');
  try {
    const { stdout } = await execFileAsync('getent', ['passwd', username]);
    const line = stdout.split('\n')[0];
    if (!line) return null;
    const parts = line.split(':');
    if (parts.length < 7) return null;
    const [user, , uid, gid, gecos, home, shell] = parts;

    let lastLogin = null;
    try {
      const { stdout: llOut } = await execFileAsync('lastlog', ['-u', user]).catch(() => ({ stdout: '' }));
      const lastLine = llOut.split('\n').pop() || '';
      if (!lastLine.includes('**Never logged in**')) {
        const p2 = lastLine.split(/\s+/);
        if (p2.length >= 5) lastLogin = p2.slice(3).join(' ');
      }
    } catch {}

    const panelUsers = loadAll();
    const panel = panelUsers[user] || null;

    return {
      username: user,
      uid: parseInt(uid, 10),
      gid: parseInt(gid, 10),
      gecos,
      home,
      shell,
      lastLogin,
      panelEnabled: !!panel,
      panelRole: panel ? panel.role : null,
      email: panel ? panel.email : '',
    };
  } catch {
    return null;
  }
}

async function createSystemUser(username, password, opts) {
  if (!validators.username.test(username)) {
    throw new Error('Invalid username. Use letters, numbers, dots, hyphens, underscores.');
  }

  const exists = await userExists(username);
  if (exists) throw new Error('System user already exists');

  const strengthErr = validatePasswordStrength(password);
  if (strengthErr) throw new Error(strengthErr);

  const validShells = getAvailableShells();
  const shell = opts.shell || '/bin/bash';
  if (!validShells.includes(shell)) throw new Error('Invalid shell: ' + shell);

  const homeBase = validateHomeBase(opts.homeBase);
  const homeDir = homeBase + '/' + username;
  const groups = (opts.groups || []).filter(validateGroupName);

  const addArgs = ['-m', '-d', homeDir, '-s', shell, '-c', (opts.gecos || username).substring(0, 128)];
  if (groups.length > 0) addArgs.push('-G', groups.join(','));
  addArgs.push(username);

  await execFileAsync('useradd', addArgs, { timeout: 10000 });
  await changeSystemPassword(username, password);

  if (opts.sudo) {
    try {
      const filePath = '/etc/sudoers.d/' + username;
      fs.writeFileSync(filePath, username + ' ALL=(ALL) ALL\n', { mode: 0o440 });
    } catch (err) {
      console.error('[Users] Failed to write sudoers file:', err.message);
    }
  }

  if (opts.createPanel !== false) {
    try {
      await createPanelUser(username, password, opts.email || '', opts.panelRole || 'user');
    } catch (err) {
      console.error('[Users] Failed to create panel user:', err.message);
    }
  }

  return { username, home: homeDir, shell };
}

async function updateSystemUser(username, opts, adminUsername) {
  if (!validators.username.test(username)) throw new Error('Invalid username');

  const exists = await userExists(username);
  if (!exists) throw new Error('System user not found');

  if (opts.panelRole !== undefined && adminUsername && username === adminUsername) {
    throw new Error('Cannot change your own admin role');
  }

  const validShells = getAvailableShells();

  if (opts.password) {
    const strengthErr = validatePasswordStrength(opts.password);
    if (strengthErr) throw new Error(strengthErr);
    await changeSystemPassword(username, opts.password);
  }

  if (opts.shell) {
    if (!validShells.includes(opts.shell)) throw new Error('Invalid shell: ' + opts.shell);
    await execFileAsync('chsh', ['-s', opts.shell, username], { timeout: 5000 });
  }

  if (opts.groups !== undefined) {
    const validGroups = Array.isArray(opts.groups) ? opts.groups.filter(validateGroupName) : [];
    await execFileAsync('usermod', ['-G', validGroups.join(',') || 'users', username], { timeout: 5000 });
  }

  if (opts.lock) {
    await execFileAsync('passwd', ['-l', username], { timeout: 5000 });
  } else if (opts.unlock) {
    await execFileAsync('passwd', ['-u', username], { timeout: 5000 });
  }

  if (opts.sudo === true) {
    try {
      const filePath = '/etc/sudoers.d/' + username;
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, username + ' ALL=(ALL) ALL\n', { mode: 0o440 });
      }
    } catch (err) {
      console.error('[Users] Failed to write sudoers file:', err.message);
    }
  } else if (opts.sudo === false) {
    try {
      const filePath = '/etc/sudoers.d/' + username;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      console.error('[Users] Failed to remove sudoers file:', err.message);
    }
  }

  if (opts.panelRole !== undefined || opts.email !== undefined) {
    await acquireLock();
    try {
      const pu = loadAll();
      if (pu[username]) {
        if (opts.panelRole !== undefined) pu[username].role = opts.panelRole || 'user';
        if (opts.email !== undefined) pu[username].email = opts.email;
        saveAll(pu);
      }
    } finally {
      releaseLock();
    }
  }

  return { ok: true, username };
}

async function deleteSystemUser(username, adminUsername) {
  if (!validators.username.test(username)) throw new Error('Invalid username');

  const adminName = adminUsername || process.env.ADMIN_USER || 'admin';
  if (username === adminName) throw new Error('Cannot delete the primary admin user');

  try {
    await execFileAsync('pkill', ['-9', '-u', username], { timeout: 5000 });
  } catch {}
  await new Promise(r => setTimeout(r, 500));

  try {
    await execFileAsync('userdel', ['-r', username], { timeout: 10000 });
  } catch (err) {
    throw new Error('Failed to delete system user: ' + (err.stderr || err.message));
  }

  try {
    const sudoFile = '/etc/sudoers.d/' + username;
    if (fs.existsSync(sudoFile)) fs.unlinkSync(sudoFile);
  } catch (err) {
    console.error('[Users] Failed to remove sudoers file:', err.message);
  }

  try {
    await deletePanelUser(username);
  } catch (err) {
    console.error('[Users] Failed to delete panel user:', err.message);
  }

  return { ok: true, username };
}

async function getAvailableGroups() {
  try {
    const groupContent = fs.readFileSync('/etc/group', 'utf8');
    const groups = new Set();
    groupContent.split('\n').filter(Boolean).forEach(line => {
      const parts = line.split(':');
      if (parts.length >= 3) {
        const gid = parseInt(parts[2], 10);
        if (gid >= 1000 || gid === 0 || gid === 10) {
          groups.add(parts[0]);
        }
      }
    });
    for (const g of ['sudo', 'wheel', 'docker', 'www-data', 'users', 'admin']) groups.add(g);
    return Array.from(groups).sort();
  } catch (_) {
    return ['sudo', 'wheel', 'docker', 'users', 'admin'];
  }
}

module.exports = {
  init,
  getPanelUser,
  getPanelUserSafe,
  panelUserExists,
  listPanelUsers,
  createPanelUser,
  deletePanelUser,
  updatePanelUser,
  verifyPassword,
  changePassword,
  updateEmail,
  setTwoFactorSecret,
  enableTwoFactor,
  disableTwoFactor,
  isTwoFactorEnabled,
  getTwoFactorSecret,
  listSystemUsers,
  getSystemUser,
  createSystemUser,
  updateSystemUser,
  deleteSystemUser,
  getAvailableGroups,
  getAvailableShells,
  validatePasswordStrength,
};
