const express = require('express');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { authMiddleware } = require('../middleware/auth');
const users = require('../services/users');
const router = express.Router();

router.use(authMiddleware);

router.put('/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    await users.changePassword(req.user.username, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/email', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const result = users.updateEmail(req.user.username, email);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/2fa/setup', (req, res) => {
  const profile = users.getProfile(req.user.username);
  if (profile.twoFactorEnabled) return res.status(400).json({ error: '2FA already enabled' });

  const secret = speakeasy.generateSecret({ name: 'nxLicensing:' + req.user.username });
  users.set2FA(req.user.username, false, secret.base32);

  qrcode.toDataURL(secret.otpauth_url, (err, url) => {
    if (err) return res.status(500).json({ error: 'QR generation failed' });
    res.json({ secret: secret.base32, qrCode: url });
  });
});

router.post('/2fa/verify', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const profile = users.getProfile(req.user.username);
  const user = users.findByUsername(req.user.username);
  if (!user || !user.twoFactorSecret) return res.status(400).json({ error: '2FA not set up' });

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
  });

  if (!verified) return res.status(400).json({ error: 'Invalid token' });

  users.set2FA(req.user.username, true, user.twoFactorSecret);
  res.json({ ok: true, twoFactorEnabled: true });
});

router.post('/2fa/disable', (req, res) => {
  users.set2FA(req.user.username, false, null);
  res.json({ ok: true, twoFactorEnabled: false });
});

module.exports = router;
