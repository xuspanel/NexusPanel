const express = require('express');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { authMiddleware } = require('../middleware/auth');
const users = require('../services/users');
const tokens = require('../services/tokens');
const audit = require('../services/audit');

const router = express.Router();
router.use(authMiddleware);
router.use(audit.routeLogger('profile'));

router.get('/', (req, res) => {
  try {
    const summary = users.getProfileSummary(req.user.username);
    if (!summary) return res.status(404).json({ error: 'User not found' });
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/avatar', (req, res) => {
  try {
    const avatarPath = users.getAvatarPath(req.user.username);
    if (!avatarPath) return res.status(404).json({ error: 'No avatar' });
    res.sendFile(avatarPath);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/avatar', (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar || typeof avatar !== 'string') return res.status(400).json({ error: 'Avatar data required (base64)' });
    if (!avatar.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid avatar format' });
    const ok = users.setAvatar(req.user.username, avatar);
    if (!ok) return res.status(400).json({ error: 'Failed to save avatar (max 512KB)' });
    audit.log('profile.avatar.upload', req, { username: req.user.username });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/avatar', (req, res) => {
  try {
    users.removeAvatar(req.user.username);
    audit.log('profile.avatar.remove', req, { username: req.user.username });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/password', (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    const result = users.changePassword(req.user.username, currentPassword, newPassword);
    if (result.error) return res.status(400).json({ error: result.error });
    audit.log('profile.password.change', req, { username: req.user.username });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/email', (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
    users.updateEmail(req.user.username, email);
    audit.log('profile.email.update', req, { email });
    res.json({ success: true, email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/display-name', (req, res) => {
  try {
    const { displayName } = req.body;
    if (!displayName || typeof displayName !== 'string' || displayName.trim().length < 1) return res.status(400).json({ error: 'Display name required' });
    if (displayName.length > 64) return res.status(400).json({ error: 'Display name too long (max 64 chars)' });
    users.setDisplayName(req.user.username, displayName.trim());
    audit.log('profile.displayName.update', req, { displayName: displayName.trim() });
    res.json({ success: true, displayName: displayName.trim() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/2fa/setup', async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: 'NexusPanel (' + req.user.username + ')',
      issuer: 'NexusPanel',
    });
    users.setTwoFactorSecret(req.user.username, secret.base32);
    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qrCode: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

router.post('/2fa/verify', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Verification code required' });
    const secret = users.getTwoFactorSecret(req.user.username);
    if (!secret) return res.status(400).json({ error: '2FA not set up. Generate a secret first.' });
    const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
    if (!verified) return res.status(400).json({ error: 'Invalid code. Try again.' });
    users.enableTwoFactor(req.user.username);
    audit.log('profile.2fa.enable', req, { username: req.user.username });
    res.json({ success: true, message: '2FA enabled successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/2fa/disable', (req, res) => {
  try {
    const { password, token } = req.body;
    if (!password && !token) return res.status(400).json({ error: 'Password or verification code required to disable 2FA' });
    if (password) {
      if (!users.verifyPassword(req.user.username, password)) return res.status(400).json({ error: 'Invalid password' });
    } else {
      const secret = users.getTwoFactorSecret(req.user.username);
      if (!secret) return res.status(400).json({ error: '2FA not configured' });
      const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
      if (!verified) return res.status(400).json({ error: 'Invalid verification code' });
    }
    users.disableTwoFactor(req.user.username);
    audit.log('profile.2fa.disable', req, { username: req.user.username });
    res.json({ success: true, message: '2FA disabled' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/sessions', (req, res) => {
  try {
    const userTokens = tokens.list(req.user.username);
    res.json({ sessions: userTokens });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/sessions/:id', (req, res) => {
  try {
    const removed = tokens.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Session not found' });
    audit.log('profile.session.revoke', req, { tokenId: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/activity', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const activity = users.getActivity(req.user.username, limit);
    res.json({ activity });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
