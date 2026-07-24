const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { authMiddleware } = require('../middleware/auth');
const users = require('../services/users');

const router = express.Router();
const audit = require('../services/audit');
router.use(audit.routeLogger('auth'));

const loginAttempts = new Map();

function loginRateLimiter(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 10;

  let record = loginAttempts.get(ip);
  if (!record || (now - record.windowStart) > windowMs) {
    record = { count: 0, windowStart: now };
    loginAttempts.set(ip, record);
  }

  record.count++;
  if (record.count > maxAttempts) {
    return false;
  }
  return true;
}

setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [ip, record] of loginAttempts) {
    if (record.windowStart < cutoff) loginAttempts.delete(ip);
  }
}, 60 * 1000);

const COOKIE_OPTIONS = { httpOnly: true, secure: false, sameSite: 'strict', path: '/' };

router.post('/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!loginRateLimiter(ip)) {
    console.warn('[AUTH] Rate limit exceeded for', ip);
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = users.getPanelUser(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!users.verifyPassword(username, password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.twoFactorEnabled) {
    const tempToken = jwt.sign(
      { username, role: user.role, step: '2fa' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    return res.json({ twoFactorRequired: true, tempToken });
  }
  const token = jwt.sign(
    { username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
  const cookieOpts = { ...COOKIE_OPTIONS, secure: req.protocol === 'https' && req.secure, maxAge: 2 * 60 * 60 * 1000 };
  res.cookie('token', token, cookieOpts);
  res.json({ success: true, username, role: user.role });
});

router.post('/login/2fa', (req, res) => {
  const { tempToken, token: totpToken } = req.body;
  if (!tempToken || !totpToken) {
    return res.status(400).json({ error: 'Temp token and verification code required' });
  }
  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (decoded.step !== '2fa') {
      return res.status(400).json({ error: 'Invalid temp token' });
    }
    const secret = users.getTwoFactorSecret(decoded.username);
    if (!secret) {
      return res.status(400).json({ error: '2FA not configured' });
    }
    const verified = speakeasy.totp.verify({
      secret, encoding: 'base32', token: totpToken, window: 1,
    });
    if (!verified) {
      return res.status(401).json({ error: 'Invalid verification code' });
    }
    const token = jwt.sign(
      { username: decoded.username, role: decoded.role },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );
    const cookieOpts = { ...COOKIE_OPTIONS, secure: req.protocol === 'https' && req.secure, maxAge: 2 * 60 * 60 * 1000 };
    res.cookie('token', token, cookieOpts);
    res.json({ success: true, username: decoded.username, role: decoded.role });
  } catch {
    return res.status(401).json({ error: 'Temp token expired or invalid' });
  }
});

router.post('/logout', (req, res) => {
  const cookieOpts = { ...COOKIE_OPTIONS, secure: req.protocol === 'https' && req.secure };
  res.clearCookie('token', cookieOpts);
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

module.exports = router;
