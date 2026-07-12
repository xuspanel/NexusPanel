const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { authMiddleware } = require('../middleware/auth');
const users = require('../services/users');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password, email } = req.body;
  const loginName = username || email;
  const loginPass = password;
  if (!loginName || !loginPass) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const user = users.getPanelUser(loginName);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!users.verifyPassword(loginName, loginPass)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.twoFactorEnabled) {
    const tempToken = jwt.sign(
      { username: loginName, role: user.role, step: '2fa' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    return res.json({ twoFactorRequired: true, tempToken });
  }
  const token = jwt.sign(
    { username: loginName, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
  const secure = req.protocol === 'https' && req.secure;
  res.cookie('token', token, {
    httpOnly: true, secure, sameSite: 'strict', maxAge: 2 * 60 * 60 * 1000,
  });
  res.json({ success: true, username: loginName });
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
  const user = users.getPanelUser(req.user.username);
  res.json({ username: req.user.username, role: req.user.role, email: user?.email || req.user.username, name: user?.email || '' });
});

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const user = users.createPanelUser(email, email, password, 'user');
    const token = jwt.sign({ username: email, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '2h' });
    const secure = req.protocol === 'https' && req.secure;
    res.cookie('token', token, { httpOnly: true, secure, sameSite: 'strict', maxAge: 2 * 60 * 60 * 1000 });
    res.json({ success: true, username: email });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/profile', authMiddleware, (req, res) => {
  const { email, name } = req.body;
  try { users.updatePanelUser(req.user.username, { email, displayName: name }); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
