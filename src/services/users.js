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

function loadAll() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}

let writeLock = false;

function saveAll(users) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
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

function createPanelUser(username, password, email, role) {
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
}

function deletePanelUser(username) {
  const adminName = process.env.ADMIN_USER || 'admin';
  if (username === adminName) throw new Error('Cannot delete the primary admin user');
  const users = loadAll();
  delete users[username];
  saveAll(users);
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
  user.passwordHash = bcrypt.hashSync(newPassword, 12);
  saveAll(users);
  return { success: true };
}

function updateEmail(username, email) {
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
    proc.stdin.write(username + ':' + password + '\n');
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

async function listSystemUsers() {
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

  return result;
}

function getSystemUser(username) {
  return null;
}

async function createSystemUser(username, password, opts) {
  if (!validators.username.test(username)) {
    throw new Error('Invalid username. Use letters, numbers, dots, hyphens, underscores.');
  }

  const exists = await userExists(username);
  if (exists) throw new Error('System user already exists');

  const validShells = getAvailableShells();
  const shell = opts.shell || '/bin/bash';
  if (!validShells.includes(shell)) throw new Error('Invalid shell: ' + shell);

  const homeBase = opts.homeBase || '/home';
  const homeDir = homeBase + '/' + username;
  const groups = opts.groups || [];

  const addArgs = ['-m', '-d', homeDir, '-s', shell, '-c', opts.gecos || username];
  if (groups.length > 0) addArgs.push('-G', groups.join(','));
  addArgs.push(username);

  await execFileAsync('useradd', addArgs, { timeout: 10000 });

  await changeSystemPassword(username, password);

  if (opts.sudo) {
    try {
      const filePath = '/etc/sudoers.d/' + username;
      const rule = username + ' ALL=(ALL) ALL\n';
      fs.writeFileSync(filePath, rule, { mode: 0o440 });
    } catch (_) {}
  }

  return { username, home: homeDir, shell };
}

async function updateSystemUser(username, opts) {
  if (!validators.username.test(username)) throw new Error('Invalid username');

  const exists = await userExists(username);
  if (!exists) throw new Error('System user not found');

  const validShells = getAvailableShells();

  if (opts.password) {
    await changeSystemPassword(username, opts.password);
  }

  if (opts.shell) {
    if (!validShells.includes(opts.shell)) throw new Error('Invalid shell: ' + opts.shell);
    await execFileAsync('chsh', ['-s', opts.shell, username], { timeout: 5000 });
  }

  if (opts.groups !== undefined) {
    await execFileAsync('usermod', ['-G', opts.groups.join(','), username], { timeout: 5000 });
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
        const rule = username + ' ALL=(ALL) ALL\n';
        fs.writeFileSync(filePath, rule, { mode: 0o440 });
      }
    } catch (_) {}
  } else if (opts.sudo === false) {
    try {
      const filePath = '/etc/sudoers.d/' + username;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}
  }

  if (opts.panelRole !== undefined) {
    try {
      const pu = loadAll();
      if (pu[username]) {
        pu[username].role = opts.panelRole || 'user';
        saveAll(pu);
      }
    } catch (_) {}
  }

  if (opts.email !== undefined) {
    try {
      const pu = loadAll();
      if (pu[username]) {
        pu[username].email = opts.email;
        saveAll(pu);
      }
    } catch (_) {}
  }

  return true;
}

async function deleteSystemUser(username) {
  if (!validators.username.test(username)) throw new Error('Invalid username');

  const adminName = process.env.ADMIN_USER || 'admin';
  if (username === adminName) throw new Error('Cannot delete the primary admin user');

  try {
    await execFileAsync('pkill', ['-9', '-u', username], { timeout: 5000 });
  } catch {}
  await new Promise(r => setTimeout(r, 500));

  try {
    await execFileAsync('userdel', ['-rf', username], { timeout: 10000 });
  } catch {}

  try {
    const sudoFile = '/etc/sudoers.d/' + username;
    if (fs.existsSync(sudoFile)) fs.unlinkSync(sudoFile);
  } catch (_) {}

  return { ok: true };
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
    groups.add('sudo');
    groups.add('wheel');
    groups.add('docker');
    groups.add('users');
    groups.add('admin');
    return Array.from(groups).sort();
  } catch (_) {
    return ['sudo', 'wheel', 'docker', 'users', 'admin'];
  }
}

module.exports = {
  init,
  getPanelUser,
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
};
