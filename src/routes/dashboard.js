const express = require('express');
const { exec } = require('child_process');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { getStats, isRebooting, getServiceHealth, getQuickStats } = require('../services/system');

const router = express.Router();

router.use(authMiddleware);

router.get('/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
});

router.get('/service-health', async (req, res) => {
  try {
    res.json(getServiceHealth());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch service health' });
  }
});

router.get('/quick-stats', async (req, res) => {
  try {
    res.json(getQuickStats());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quick stats' });
  }
});

router.post('/reboot', adminOnly, (req, res) => {
  try {
    res.json({ message: 'Reboot initiated', rebooting: true });
    exec('sudo /sbin/shutdown -r +1 "NexusPanel initiated reboot"', {
      timeout: 5000,
    }, (err) => {
      if (err) {
        console.error('Reboot command failed:', err.message);
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to initiate reboot' });
  }
});

router.get('/reboot-status', (req, res) => {
  res.json({ rebooting: isRebooting() });
});

router.post('/services/install', adminOnly, async (req, res) => {
  try {
    const service = (req.body && (req.body.service || req.body.name)) ? String(req.body.service || req.body.name).trim() : '';
    if (!service) {
      return res.status(400).json({ error: 'Service preset name is required' });
    }
    const daemonClient = require('../utils/daemon-client');
    const audit = require('../services/audit');
    const result = await daemonClient.installService(service);
    audit.log('service.install', req, { service, success: result.success });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
