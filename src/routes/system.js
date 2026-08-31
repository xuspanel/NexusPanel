const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const daemonClient = require('../utils/daemon-client');
const audit = require('../services/audit');

const router = express.Router();
router.use(authMiddleware);

router.post('/services/install', adminOnly, async (req, res) => {
  try {
    const service = (req.body && (req.body.service || req.body.name)) ? String(req.body.service || req.body.name).trim() : '';
    if (!service) {
      return res.status(400).json({ error: 'Service preset name is required' });
    }

    const result = await daemonClient.installService(service);
    audit.log('service.install', req, { service, success: result.success });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
