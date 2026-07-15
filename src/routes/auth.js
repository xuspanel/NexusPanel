const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { authMiddleware } = require('../middleware/auth');
const users = require('../services/users');

const router = express.Router();

router.post('/login', (req, res) => {
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
  const secure = req.protocol === 'https' && req.secure;
  res.cookie('token', token, {
    httpOnly: true, secure, sameSite: 'strict', maxAge: 2 * 60 * 60 * 1000,
  });
  res.json({ success: true, username });
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
    const secure = req.protocol === 'https' && req.secure;
    res.cookie('token', token, {
      httpOnly: true, secure, sameSite: 'strict', maxAge: 2 * 60 * 60 * 1000,
    });
    res.json({ success: true, username: decoded.username });
  } catch {
    return res.status(401).json({ error: 'Temp token expired or invalid' });
  }
});

router.post('/logout', (req, res) => {
  const secure = req.protocol === 'https' && req.secure;
  res.clearCookie('token', { httpOnly: true, secure, sameSite: 'strict' });
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

module.exports = router;
