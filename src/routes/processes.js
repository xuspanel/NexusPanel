const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const processes = require('../services/processes');
const router = express.Router();
router.use(authMiddleware);
const audit = require('../services/audit');
router.use(audit.routeLogger('process'));

router.get('/', (req, res) => {
  try { res.json(processes.list()); }
  catch (e) { res.status(500).json({ error: 'Failed to list processes' }); }
});

router.get('/tree', (req, res) => {
  try { res.json(processes.tree()); }
  catch (e) { res.status(500).json({ error: 'Failed to get process tree' }); }
});

router.get('/signals', adminOnly, (req, res) => {
  try { res.json(processes.listSignals()); }
  catch (e) { res.status(500).json({ error: 'Failed to list signals' }); }
});

router.get('/:pid/details', adminOnly, (req, res) => {
  try {
    const info = processes.details(req.params.pid);
    res.json(info);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/kill/:pid', adminOnly, (req, res) => {
  try {
    const sig = parseInt(req.body && req.body.signal) || 15;
    const result = processes.kill(req.params.pid, sig);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/signal', adminOnly, (req, res) => {
  try {
    const { pid, signal } = req.body || {};
    if (!pid || !signal) return res.status(400).json({ error: 'pid and signal required' });
    const result = processes.sendSignal(pid, signal);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
