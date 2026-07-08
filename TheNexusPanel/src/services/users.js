const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'users.json');

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function save(users) { fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2)); }

function findByEmail(email) { return load().find(u => u.email === email) || null; }
function findById(id) { return load().find(u => u.id === id) || null; }

async function createUser(userData) {
  const users = load();
  if (users.find(u => u.email === userData.email)) throw new Error('Email already registered');
  const user = {
    id: 'u_' + Date.now(),
    name: userData.name || '',
    email: userData.email,
    passwordHash: await bcrypt.hash(userData.password, 10),
    role: 'user',
    twoFactorEnabled: false,
    twoFactorSecret: null,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  save(users);
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

async function verifyPassword(email, password) {
  const user = findByEmail(email);
  if (!user) return null;
  const match = await bcrypt.compare(password, user.passwordHash);
  return match ? user : null;
}

async function changePassword(id, currentPassword, newPassword) {
  const users = load();
  const user = users.find(u => u.id === id);
  if (!user) throw new Error('User not found');
  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) throw new Error('Current password is incorrect');
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  save(users);
  return true;
}

function updateEmail(id, email) {
  const users = load();
  if (users.find(u => u.email === email && u.id !== id)) throw new Error('Email already in use');
  const user = users.find(u => u.id === id);
  if (!user) throw new Error('User not found');
  user.email = email;
  save(users);
  return user;
}

function getProfile(id) {
  const user = findById(id);
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, twoFactorEnabled: user.twoFactorEnabled, createdAt: user.createdAt };
}

module.exports = { createUser, findByEmail, findById, verifyPassword, changePassword, updateEmail, getProfile };
