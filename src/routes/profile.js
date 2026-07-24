const express = require('express');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { authMiddleware } = require('../middleware/auth');
const users = require('../services/users');

const router = express.Router();
router.use(authMiddleware);
const audit = require('../services/audit');
router.use(audit.routeLogger('profile'));

router.get('/', (req, res) => {
  const user = users.getPanelUser(req.user.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    email: user.email || '',
    twoFactorEnabled: !!user.twoFactorEnabled,
  });
});

router.put('/password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const result = users.changePassword(req.user.username, currentPassword, newPassword);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

router.put('/email', (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  users.updateEmail(req.user.username, email);
  res.json({ success: true, email });
});

router.post('/2fa/setup', async (req, res) => {
  const secret = speakeasy.generateSecret({
    name: `NexusPanel (${req.user.username})`,
    issuer: 'NexusPanel',
  });
  users.setTwoFactorSecret(req.user.username, secret.base32);
  try {
    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qrCode: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

router.post('/2fa/verify', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Verification code required' });
  const secret = users.getTwoFactorSecret(req.user.username);
  if (!secret) return res.status(400).json({ error: '2FA not set up. Generate a secret first.' });
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1,
  });
  if (!verified) return res.status(400).json({ error: 'Invalid code. Try again.' });
  users.enableTwoFactor(req.user.username);
  res.json({ success: true, message: '2FA enabled successfully' });
});

router.post('/2fa/disable', (req, res) => {
  const { password, token } = req.body;
  if (!password && !token) return res.status(400).json({ error: 'Password or verification code required to disable 2FA' });

  if (password) {
    if (!users.verifyPassword(req.user.username, password)) {
      return res.status(400).json({ error: 'Invalid password' });
    }
  } else {
    const secret = users.getTwoFactorSecret(req.user.username);
    if (!secret) return res.status(400).json({ error: '2FA not configured' });
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!verified) return res.status(400).json({ error: 'Invalid verification code' });
  }

  users.disableTwoFactor(req.user.username);
  res.json({ success: true, message: '2FA disabled' });
});

module.exports = router;
