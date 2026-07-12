const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'users.json');

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function save(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

function findByUsername(username) {
  return load().find(u => u.username === username) || null;
}

async function verifyPassword(username, password) {
  const user = findByUsername(username);
  if (!user) return null;
  const match = await bcrypt.compare(password, user.passwordHash);
  return match ? user : null;
}

function initDefaultUser(username, password, email) {
  const users = load();
  if (users.length > 0) return;
  const hash = bcrypt.hashSync(password, 10);
  users.push({
    id: 'u_1',
    username,
    email: email || 'admin@xus.me',
    passwordHash: hash,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    role: 'admin',
    createdAt: new Date().toISOString(),
  });
  save(users);
}

async function changePassword(username, currentPassword, newPassword) {
  const users = load();
  const user = users.find(u => u.username === username);
  if (!user) throw new Error('User not found');
  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) throw new Error('Current password is incorrect');
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  save(users);
  return { ok: true };
}

function updateEmail(username, email) {
  const users = load();
  const user = users.find(u => u.username === username);
  if (!user) throw new Error('User not found');
  user.email = email;
  save(users);
  return { ok: true, email };
}

function set2FA(username, enabled, secret) {
  const users = load();
  const user = users.find(u => u.username === username);
  if (!user) throw new Error('User not found');
  user.twoFactorEnabled = enabled;
  user.twoFactorSecret = enabled ? secret : null;
  save(users);
  return { ok: true, twoFactorEnabled: enabled };
}

function getProfile(username) {
  const user = findByUsername(username);
  if (!user) return null;
  return {
    username: user.username,
    email: user.email,
    role: user.role,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
  };
}

module.exports = { initDefaultUser, findByUsername, verifyPassword, changePassword, updateEmail, set2FA, getProfile };
