const express = require('express');
const { requireAuth } = require('../middleware/auth');
const users = require('../services/users');
const { execSync } = require('child_process');
const router = express.Router();

function sendProfileEmail(email, subject, body) {
  try {
    execSync('sendmail -t -oi', { input: [
      'From: NexusPanel Security <nxp@s2u.me>',
      'To: ' + email,
      'Subject: ' + subject,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
      '',
      'If you did not make this change, please contact support immediately.',
      '',
      '— The NexusPanel Team',
      '  nxp@s2u.me',
    ].join('\n'), encoding: 'utf8', timeout: 10000 });
  } catch (e) { console.error('[ProfileEmail] Failed:', e.message); }
}

router.use(requireAuth);

router.put('/password', async (req, res) => {
  try {
    await users.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    const profile = users.getProfile(req.user.id);
    if (profile) {
      sendProfileEmail(profile.email, 'Your Password Has Been Changed',
        'Your NexusPanel account password was changed on ' + new Date().toLocaleString() + '.');
    }
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/email', (req, res) => {
  try {
    const oldProfile = users.getProfile(req.user.id);
    users.updateEmail(req.user.id, req.body.email);
    if (oldProfile) {
      sendProfileEmail(oldProfile.email, 'Your Email Has Been Changed',
        'Your NexusPanel account email was changed from ' + oldProfile.email + ' to ' + req.body.email + ' on ' + new Date().toLocaleString() + '.');
    }
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
