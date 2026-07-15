const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const scanner = require('../services/virusscanner');
const router = express.Router();

router.use(authMiddleware);

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.get('/status', adminOnly, (req, res) => {
  res.json(scanner.getClamStatus());
});

router.post('/scan', adminOnly, async (req, res) => {
  try {
    const { target, path: customPath } = req.body;
    if (!target) return res.status(400).json({ error: 'target is required' });
    const scanId = await scanner.runScan(target, customPath);
    res.json({ scanId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/scan/:scanId', adminOnly, (req, res) => {
  const status = scanner.getScanStatus(req.params.scanId);
  if (!status) return res.status(404).json({ error: 'Scan not found' });
  res.json(status);
});

router.post('/scan/:scanId/abort', adminOnly, (req, res) => {
  const ok = scanner.abortScan(req.params.scanId);
  res.json({ aborted: ok });
});

router.get('/scan/:scanId/results', adminOnly, (req, res) => {
  const results = scanner.getScanResults(req.params.scanId);
  if (!results) return res.status(404).json({ error: 'Scan not found' });
  res.json(results);
});

router.post('/scan/:scanId/quarantine', adminOnly, async (req, res) => {
  try {
    const quarantined = await scanner.quarantineFiles(req.params.scanId);
    res.json({ quarantined });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/quarantine', adminOnly, async (req, res) => {
  const items = await scanner.listQuarantine();
  res.json({ items });
});

router.post('/quarantine/:quarantineId/restore', adminOnly, async (req, res) => {
  try {
    const result = await scanner.restoreFromQuarantine(req.params.quarantineId, req.body.filePath);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/quarantine/:quarantineId', adminOnly, async (req, res) => {
  try {
    const result = await scanner.deleteFromQuarantine(req.params.quarantineId, req.query.path);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/update-defs', adminOnly, async (req, res) => {
  const result = await scanner.updateDefs();
  res.json(result);
});

module.exports = router;
