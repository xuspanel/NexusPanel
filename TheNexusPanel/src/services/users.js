const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');

// ── Panel user store (users.json) ──────────────────────────────────

function loadAll() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function saveAll(users) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function init() {
  let users = loadAll();
  if (Object.keys(users).length > 0) return users;

  const adminHash = process.env.ADMIN_PASS
    ? bcrypt.hashSync(process.env.ADMIN_PASS, 12)
    : null;

  const oldProfile = (() => {
    try {
      if (fs.existsSync(PROFILE_FILE)) return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
    } catch (_) {}
    return {};
  })();

  const adminUser = {
    passwordHash: adminHash || oldProfile.passwordHash || bcrypt.hashSync('changeme', 12),
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

function findByEmail(email) {
  const users = loadAll();
  for (const [key, u] of Object.entries(users)) {
    if (u.email === email) return { ...u, username: key };
  }
  return null;
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
  Object.assign(users[username], updates);
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

// ── System user management ─────────────────────────────────────────

function safeExec(cmd) {
  try {
    return execSync(cmd, { timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (e) {
    return '';
  }
}

function listSystemUsers() {
  const passwd = safeExec('getent passwd');
  const shadow = safeExec('getent shadow');
  const groups = safeExec('getent group');
  const sudoers = safeExec('getent group sudo wheel admin 2>/dev/null || true');
  const lastlogRaw = safeExec('lastlog --user getent-passwd 2>/dev/null || lastlog 2>/dev/null | tail -n+2 || true');

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
  const sudoOutput = safeExec('getent group sudo wheel admin 2>/dev/null || echo ""');
  sudoOutput.split('\n').filter(Boolean).forEach(line => {
    const parts = line.split(':');
    if (parts.length >= 4 && parts[3]) {
      parts[3].split(',').forEach(u => sudoGroupMembers.add(u.trim()));
    }
  });

  const sudoFiles = (() => {
    try {
      return fs.readdirSync('/etc/sudoers.d');
    } catch (_) { return []; }
  })();
  const sudoDirectUsers = new Set();
  sudoFiles.forEach(f => {
    try {
      const content = fs.readFileSync(path.join('/etc/sudoers.d', f), 'utf8');
      content.split('\n').forEach(line => {
        const m = line.match(/^(\w+)\s+ALL=/);
        if (m) sudoDirectUsers.add(m[1]);
        const m2 = line.match(/^%(\w+)\s+ALL=/);
        if (m2) {
          const g = m2[1];
          const members = groupMap[g] || [];
          members.forEach(u => sudoDirectUsers.add(u));
        }
      });
    } catch (_) {}
  });

  const allUsers = passwd.split('\n').filter(Boolean);
  const result = allUsers.map(line => {
    const parts = line.split(':');
    if (parts.length < 7) return null;
    const [username, , uid, gid, gecos, home, shell] = parts;
    const uidNum = parseInt(uid, 10);
    const isSystem = uidNum < 1000 && uidNum !== 0;

    const userGroups = [];
    Object.entries(groupMap).forEach(([gname, members]) => {
      if (members.includes(username)) userGroups.push(gname);
    });
    if (gid) {
      const primaryGroup = safeExec('getent group ' + gid + " 2>/dev/null | cut -d: -f1");
      if (primaryGroup && !userGroups.includes(primaryGroup)) userGroups.unshift(primaryGroup);
    }

    const shadowPw = shadowMap[username] || '';
    const isLocked = shadowPw === '*' || shadowPw === '!' || shadowPw.startsWith('!') || shadowPw === '!!';

    const hasSudo = sudoGroupMembers.has(username) || sudoDirectUsers.has(username);

    const lastLogin = (() => {
      try {
        const out = execSync('lastlog -u ' + username + ' 2>/dev/null', { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
        const lastLine = out.split('\n').pop() || '';
        if (lastLine.includes('**Never logged in**')) return null;
        const parts2 = lastLine.split(/\s+/);
        if (parts2.length >= 5) return parts2.slice(3).join(' ');
        return null;
      } catch (_) { return null; }
    })();

    const panel = panelUsers[username] || null;

    return {
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
    };
  }).filter(Boolean);

  return result;
}

function getSystemUser(username) {
  const all = listSystemUsers();
  return all.find(u => u.username === username) || null;
}

function createSystemUser(username, password, opts) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    throw new Error('Invalid username. Use letters, numbers, dots, hyphens, underscores.');
  }

  const exists = safeExec('id ' + username + ' 2>/dev/null && echo 1 || echo 0');
  if (exists === '1') throw new Error('System user already exists');

  const shell = opts.shell || '/bin/bash';
  const homeBase = opts.homeBase || '/home';
  const homeDir = homeBase + '/' + username;
  const groups = opts.groups || [];

  let cmd = 'useradd -m -d ' + homeDir + ' -s ' + shell + ' -c "' + (opts.gecos || username) + '"';
  if (groups.length > 0) cmd += ' -G ' + groups.join(',');
  cmd += ' ' + username;

  safeExec(cmd);
  safeExec("echo '" + username + ':' + password + "' | chpasswd");

  if (opts.sudo) {
    try {
      const filePath = '/etc/sudoers.d/' + username;
      const rule = username + ' ALL=(ALL) ALL\n';
      fs.writeFileSync(filePath, rule, { mode: 0o440 });
    } catch (_) {}
  }

  if (opts.createPanel !== false) {
    try {
      if (!panelUserExists(username)) {
        createPanelUser(username, password, opts.email || '', opts.panelRole || 'user');
      }
    } catch (_) {}
  }

  return getSystemUser(username);
}

function updateSystemUser(username, opts) {
  const exists = safeExec('id ' + username + ' 2>/dev/null && echo 1 || echo 0');
  if (exists !== '1') throw new Error('System user not found');

  if (opts.password) {
    safeExec("echo '" + username + ':' + opts.password + "' | chpasswd");
  }

  if (opts.shell) {
    safeExec('chsh -s ' + opts.shell + ' ' + username);
  }

  if (opts.groups !== undefined) {
    safeExec('usermod -G ' + opts.groups.join(',') + ' ' + username);
  }

  if (opts.lock) {
    safeExec('passwd -l ' + username);
  } else if (opts.unlock) {
    safeExec('passwd -u ' + username);
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

  return getSystemUser(username);
}

function deleteSystemUser(username) {
  const adminName = process.env.ADMIN_USER || 'admin';
  if (username === adminName) throw new Error('Cannot delete the primary admin user');

  const exists = safeExec('id ' + username + ' 2>/dev/null && echo 1 || echo 0');
  if (exists === '1') {
    safeExec('/bin/sh -c "pkill -9 -u ' + username + ' 2>/dev/null; sleep 0.5"');
    safeExec('/bin/sh -c "userdel -rf ' + username + ' 2>/dev/null"');
  }

  try {
    const sudoFile = '/etc/sudoers.d/' + username;
    if (fs.existsSync(sudoFile)) fs.unlinkSync(sudoFile);
  } catch (_) {}

  try {
    if (panelUserExists(username)) deletePanelUser(username);
  } catch (_) {}

  return { ok: true };
}

function getAvailableGroups() {
  const out = safeExec("getent group | awk -F: '$3>=1000 || $3==0 || $3==10 {print $1}'");
  const extra = safeExec("getent group sudo wheel admin users 2>/dev/null | cut -d: -f1");
  const set = new Set();
  out.split('\n').filter(Boolean).forEach(g => set.add(g));
  extra.split('\n').filter(Boolean).forEach(g => set.add(g));
  set.add('sudo');
  set.add('wheel');
  set.add('docker');
  return Array.from(set).sort();
}

function getAvailableShells() {
  try {
    const content = fs.readFileSync('/etc/shells', 'utf8');
    return content.split('\n').filter(l => l && !l.startsWith('#')).map(s => s.trim()).filter(Boolean);
  } catch (_) {
    return ['/bin/bash', '/bin/sh', '/usr/sbin/nologin'];
  }
}

module.exports = {
  init,
  getPanelUser,
  findByEmail,
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
