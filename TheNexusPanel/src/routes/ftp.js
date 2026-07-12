const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const ftp = require('../services/ftp');

const router = express.Router();
router.use(authMiddleware);

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.get('/status', adminOnly, (req, res) => {
  try { res.json(ftp.getFTPStatus()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/accounts', adminOnly, (req, res) => {
  try { res.json(ftp.listFTPAccounts()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/accounts/:username', adminOnly, (req, res) => {
  try {
    const cfg = ftp.getFTPUserConfig(req.params.username);
    res.json(cfg);
  } catch (e) { res.status(404).json({ error: e.message }); }
});

router.post('/accounts/create', adminOnly, (req, res) => {
  try {
    const { username, password, home, maxRate, maxClients, maxPerIP } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const result = ftp.createFTPUser(username, password, home, maxRate || 0, maxClients || 5, maxPerIP || 2);
    res.json({ success: true, user: result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/accounts/:username', adminOnly, (req, res) => {
  try {
    const result = ftp.editFTPUser(req.params.username, req.body);
    res.json({ success: true, user: result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/accounts/:username', adminOnly, (req, res) => {
  try {
    const result = ftp.deleteFTPUser(req.params.username);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/enable/:username', adminOnly, (req, res) => {
  try { res.json(ftp.enableFTP(req.params.username)); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/disable/:username', adminOnly, (req, res) => {
  try { res.json(ftp.disableFTP(req.params.username)); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/logs', adminOnly, (req, res) => {
  try { res.json(ftp.getRecentLogs(parseInt(req.query.limit) || 50)); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
