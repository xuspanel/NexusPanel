const express = require('express');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middleware/auth');
const users = require('../services/users');
const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = await users.verifyPassword(username, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        { username: user.username, role: user.role, step: '2fa' },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ twoFactorRequired: true, tempToken });
    }

    const token = jwt.sign(
      { username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('nxlicensing_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 3600000,
    });

    res.json({ ok: true, user: users.getProfile(user.username) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('nxlicensing_token');
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req, res) => {
  const profile = users.getProfile(req.user.username);
  if (!profile) return res.status(404).json({ error: 'User not found' });
  res.json(profile);
});

module.exports = router;
