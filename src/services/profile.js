const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');

const defaults = {
  email: 'admin@meedo51.com',
  passwordHash: null,
  twoFactorSecret: null,
  twoFactorEnabled: false,
};

function load() {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
      return { ...defaults, ...data };
    }
  } catch (err) {
    console.error('Failed to load profile:', err.message);
  }
  return { ...defaults };
}

function save(profile) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save profile:', err.message);
    return false;
  }
}

function init() {
  const profile = load();
  if (!profile.passwordHash) {
    profile.passwordHash = bcrypt.hashSync(process.env.ADMIN_PASS || 'changeme', 12);
    save(profile);
  }
  return profile;
}

function getProfile() {
  const p = load();
  return {
    email: p.email,
    twoFactorEnabled: p.twoFactorEnabled,
  };
}

function updateEmail(email) {
  const p = load();
  p.email = email;
  return save(p);
}

function changePassword(currentPassword, newPassword) {
  const p = load();
  if (!bcrypt.compareSync(currentPassword, p.passwordHash)) {
    return { error: 'Current password is incorrect' };
  }
  p.passwordHash = bcrypt.hashSync(newPassword, 12);
  save(p);
  process.env.ADMIN_PASS = newPassword;
  return { success: true };
}

function verifyCurrentPassword(password) {
  const p = load();
  return bcrypt.compareSync(password, p.passwordHash);
}

function setTwoFactorSecret(secret) {
  const p = load();
  p.twoFactorSecret = secret;
  return save(p);
}

function enableTwoFactor() {
  const p = load();
  p.twoFactorEnabled = true;
  return save(p);
}

function disableTwoFactor() {
  const p = load();
  p.twoFactorSecret = null;
  p.twoFactorEnabled = false;
  return save(p);
}

function isTwoFactorEnabled() {
  const p = load();
  return p.twoFactorEnabled;
}

function getTwoFactorSecret() {
  const p = load();
  return p.twoFactorSecret;
}

module.exports = {
  init, getProfile, updateEmail, changePassword,
  verifyCurrentPassword,
  setTwoFactorSecret, enableTwoFactor, disableTwoFactor,
  isTwoFactorEnabled, getTwoFactorSecret,
};
