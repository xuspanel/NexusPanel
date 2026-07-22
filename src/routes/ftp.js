const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const ftp = require('../services/ftp');
const audit = require('../services/audit');

const router = express.Router();
router.use(authMiddleware);

/* ─── Service Control ─── */
router.get('/status', adminOnly, async (req, res) => {
  try { res.json(ftp.getFTPStatus()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/service/:action', adminOnly, async (req, res) => {
  try {
    const result = ftp.controlService(req.params.action);
    audit.log('ftp.service.' + req.params.action, req, { action: req.params.action });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ─── Connection Test ─── */
router.post('/test', adminOnly, async (req, res) => {
  try {
    const { host, port, username, password } = req.body || {};
    const result = await ftp.testConnection(host, port, username, password);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── Accounts CRUD ─── */
router.get('/accounts', adminOnly, async (req, res) => {
  try {
    const opts = {
      search: req.query.search || '',
      offset: parseInt(req.query.offset) || 0,
      limit: parseInt(req.query.limit) || 100,
    };
    res.json(await ftp.listFTPAccounts(opts));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/accounts/:username', adminOnly, (req, res) => {
  try { res.json(ftp.getFTPUserConfig(req.params.username)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

router.post('/accounts', adminOnly, async (req, res) => {
  try {
    const { username, password, home, maxRate, maxClients, maxPerIP } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const result = await ftp.createFTPUser(username, password, home, { maxRate, maxClients, maxPerIP });
    audit.log('ftp.user.create', req, { username });
    res.json({ success: true, user: result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/accounts/:username', adminOnly, async (req, res) => {
  try {
    const result = await ftp.editFTPUser(req.params.username, req.body);
    audit.log('ftp.user.edit', req, { username: req.params.username, fields: Object.keys(req.body) });
    res.json({ success: true, user: result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/accounts/:username', adminOnly, (req, res) => {
  try {
    const result = ftp.deleteFTPUser(req.params.username);
    audit.log('ftp.user.delete', req, { username: req.params.username });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ─── Enable / Disable ─── */
router.post('/enable/:username', adminOnly, (req, res) => {
  try {
    const result = ftp.enableFTP(req.params.username);
    audit.log('ftp.user.enable', req, { username: req.params.username });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/disable/:username', adminOnly, (req, res) => {
  try {
    const result = ftp.disableFTP(req.params.username);
    audit.log('ftp.user.disable', req, { username: req.params.username });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ─── Bulk Operations ─── */
router.post('/bulk/enable', adminOnly, async (req, res) => {
  try {
    const { usernames } = req.body;
    if (!Array.isArray(usernames) || usernames.length === 0) return res.status(400).json({ error: 'usernames array required' });
    const result = await ftp.bulkEnable(usernames);
    audit.log('ftp.bulk.enable', req, { usernames });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/bulk/disable', adminOnly, async (req, res) => {
  try {
    const { usernames } = req.body;
    if (!Array.isArray(usernames) || usernames.length === 0) return res.status(400).json({ error: 'usernames array required' });
    const result = await ftp.bulkDisable(usernames);
    audit.log('ftp.bulk.disable', req, { usernames });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/bulk/delete', adminOnly, async (req, res) => {
  try {
    const { usernames } = req.body;
    if (!Array.isArray(usernames) || usernames.length === 0) return res.status(400).json({ error: 'usernames array required' });
    const result = await ftp.bulkDelete(usernames);
    audit.log('ftp.bulk.delete', req, { usernames });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ─── Quota ─── */
router.post('/quota/:username', adminOnly, (req, res) => {
  try {
    const bytes = parseInt(req.body.quota) || 0;
    const result = ftp.setFTPQuota(req.params.username, bytes);
    audit.log('ftp.quota.set', req, { username: req.params.username, quota: bytes });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/quota/:username', adminOnly, (req, res) => {
  try { res.json(ftp.getFTPQuotaDetailed(req.params.username)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── Config Editor ─── */
router.get('/config', adminOnly, (req, res) => {
  try { res.json({ content: ftp.readConfig() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/config', adminOnly, (req, res) => {
  try {
    const result = ftp.writeConfig(req.body.content);
    audit.log('ftp.config.write', req, { backup: result.backup });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/config/value', adminOnly, (req, res) => {
  try {
    const { key, value } = req.body;
    const result = ftp.updateConfigValue(key, value);
    audit.log('ftp.config.update', req, { key, value });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ─── Passive Ports ─── */
router.put('/passive-ports', adminOnly, (req, res) => {
  try {
    const { minPort, maxPort } = req.body;
    const result = ftp.setPassivePorts(minPort, maxPort);
    audit.log('ftp.passive.update', req, result);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ─── SSL Certificate ─── */
router.get('/ssl', adminOnly, (req, res) => {
  try { res.json(ftp.getSSLCertInfo() || { exists: false }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ssl/generate', adminOnly, (req, res) => {
  try {
    const domain = req.body.domain || 'localhost';
    const result = ftp.generateSelfSignedSSL(domain);
    audit.log('ftp.ssl.generate', req, { domain });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ─── Logs ─── */
router.get('/logs', adminOnly, (req, res) => {
  try { res.json(ftp.getRecentLogs(parseInt(req.query.limit) || 50)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/activity', adminOnly, (req, res) => {
  try {
    res.json(ftp.getActivityLogs({
      limit: parseInt(req.query.limit) || 100,
      search: req.query.search || '',
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── Bandwidth ─── */
router.get('/bandwidth', adminOnly, (req, res) => {
  try { res.json(ftp.getBandwidthStats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
