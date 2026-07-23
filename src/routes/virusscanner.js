const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const audit = require('../services/audit');
const scanner = require('../services/virusscanner');
const router = express.Router();

router.use(authMiddleware);

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

const SCAN_ID_RE = /^scan_\d+_\d+$/;
const QUARANTINE_ID_RE = /^[a-zA-Z0-9_-]+$/;

router.get('/status', adminOnly, (req, res) => {
  res.json(scanner.getClamStatus());
});

router.post('/scan', adminOnly, async (req, res) => {
  try {
    const { target, path: customPath } = req.body;
    if (!target) return res.status(400).json({ error: 'target is required' });
    if (!['home', 'mail', 'ftp', 'web', 'custom'].includes(target)) {
      return res.status(400).json({ error: 'Invalid target' });
    }
    if (target === 'custom') {
      if (!customPath || typeof customPath !== 'string') {
        return res.status(400).json({ error: 'Custom path is required' });
      }
      if (!scanner.isValidScanPath(customPath)) {
        return res.status(400).json({ error: 'Invalid scan path. Must be within /home, /var/www, or /etc/vsftpd' });
      }
    }
    const scanId = await scanner.runScan(target, customPath);
    audit.log('scanner.scan.start', req, { scanId, target, path: customPath || null });
    res.json({ scanId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/history', adminOnly, async (req, res) => {
  try {
    const result = await scanner.getScanHistory(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/scan/:scanId', adminOnly, (req, res) => {
  if (!SCAN_ID_RE.test(req.params.scanId)) return res.status(400).json({ error: 'Invalid scan ID' });
  const status = scanner.getScanStatus(req.params.scanId);
  if (!status) return res.status(404).json({ error: 'Scan not found' });
  res.json(status);
});

router.post('/scan/:scanId/abort', adminOnly, (req, res) => {
  if (!SCAN_ID_RE.test(req.params.scanId)) return res.status(400).json({ error: 'Invalid scan ID' });
  const ok = scanner.abortScan(req.params.scanId);
  if (ok) audit.log('scanner.scan.abort', req, { scanId: req.params.scanId });
  res.json({ aborted: ok });
});

router.get('/scan/:scanId/results', adminOnly, (req, res) => {
  if (!SCAN_ID_RE.test(req.params.scanId)) return res.status(400).json({ error: 'Invalid scan ID' });
  const results = scanner.getScanResults(req.params.scanId);
  if (!results) return res.status(404).json({ error: 'Scan not found' });
  res.json(results);
});

router.post('/scan/:scanId/quarantine', adminOnly, async (req, res) => {
  if (!SCAN_ID_RE.test(req.params.scanId)) return res.status(400).json({ error: 'Invalid scan ID' });
  try {
    const quarantined = await scanner.quarantineFiles(req.params.scanId);
    audit.log('scanner.quarantine.create', req, { scanId: req.params.scanId, count: quarantined.length });
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
  if (!QUARANTINE_ID_RE.test(req.params.quarantineId)) return res.status(400).json({ error: 'Invalid quarantine ID' });
  try {
    const result = await scanner.restoreFromQuarantine(req.params.quarantineId, req.body.filePath);
    audit.log('scanner.quarantine.restore', req, { quarantineId: req.params.quarantineId, filePath: req.body.filePath });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/quarantine/:quarantineId', adminOnly, async (req, res) => {
  if (!QUARANTINE_ID_RE.test(req.params.quarantineId)) return res.status(400).json({ error: 'Invalid quarantine ID' });
  try {
    const result = await scanner.deleteFromQuarantine(req.params.quarantineId, req.query.path);
    audit.log('scanner.quarantine.delete', req, { quarantineId: req.params.quarantineId, filePath: req.query.path });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/update-defs', adminOnly, async (req, res) => {
  const result = await scanner.updateDefs();
  audit.log('scanner.defs.update', req, { success: result.success });
  res.json(result);
});

module.exports = router;
