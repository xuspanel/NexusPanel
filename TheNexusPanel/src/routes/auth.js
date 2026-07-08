const express = require('express');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
const users = require('../services/users');
const { execSync } = require('child_process');
const router = express.Router();

function sendWelcomeEmail(email, name) {
  try {
    execSync('sendmail -t -oi', { input: [
      'From: NexusPanel <nxp@s2u.me>',
      'To: ' + email,
      'Subject: Welcome to NexusPanel!',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Welcome' + (name ? ' ' + name : '') + '!',
      '',
      'Thank you for creating a NexusPanel account. You now have access to:',
      '',
      '  • Browse and purchase license plans',
      '  • Manage your license keys',
      '  • Access complete documentation',
      '  • Track your order history',
      '',
      'Get started: https://nxp.xus.me/pricing',
      'Documentation: https://nxp.xus.me/docs',
      '',
      'If you have any questions, reply to this email or contact nxp@s2u.me.',
      '',
      '— The NexusPanel Team',
      '  nxp@s2u.me',
    ].join('\n'), encoding: 'utf8', timeout: 10000 });
  } catch (e) { console.error('[WelcomeEmail] Failed:', e.message); }
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const user = await users.createUser({ name, email, password });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('nxp_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600000 });
    sendWelcomeEmail(email, name);
    res.json({ ok: true, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await users.verifyPassword(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('nxp_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600000 });
    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('nxp_token');
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const profile = users.getProfile(req.user.id);
  if (!profile) return res.json({ user: null });
  res.json({ user: profile });
});

module.exports = router;
