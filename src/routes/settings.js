const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const settings = require('../services/settings');

const router = express.Router();
router.use(authMiddleware);
const audit = require('../services/audit');
router.use(audit.routeLogger('settings'));

router.get('/', (req, res) => {
  res.json(settings.load());
});

router.post('/', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const { autoUpdate, updateChannel } = req.body;
  const updates = {};
  if (typeof autoUpdate === 'boolean') updates.autoUpdate = autoUpdate;
  if (typeof updateChannel === 'string') updates.updateChannel = updateChannel;
  const result = settings.save(updates);
  if (result) res.json(result);
  else res.status(500).json({ error: 'Failed to save settings' });
});

module.exports = router;
