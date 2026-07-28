const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const settings = require('../services/settings');
const audit = require('../services/audit');

const router = express.Router();
router.use(authMiddleware);
router.use(audit.routeLogger('settings'));

router.get('/', (req, res) => {
  try { res.json(settings.load()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', adminOnly, (req, res) => {
  try {
    const errors = settings.validate(req.body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    const result = settings.save(req.body);
    if (!result) return res.status(500).json({ error: 'Failed to save settings' });
    audit.log('settings.update', req.user?.username || 'unknown', { keys: Object.keys(req.body) });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/system-info', (req, res) => {
  try { res.json(settings.getSystemInfo()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/health', (req, res) => {
  try { res.json(settings.getSystemHealth()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/tokens', adminOnly, (req, res) => {
  try { res.json(settings.getApiTokens()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tokens', adminOnly, (req, res) => {
  try {
    const { name, scope } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 2) return res.status(400).json({ error: 'Token name is required (min 2 chars)' });
    if (name.length > 64) return res.status(400).json({ error: 'Token name too long (max 64 chars)' });
    if (name.includes('..') || name.includes('/') || name.includes('\\')) return res.status(400).json({ error: 'Invalid token name' });
    if (scope && !['read', 'admin'].includes(scope)) return res.status(400).json({ error: 'Scope must be read or admin' });
    const token = settings.createApiToken(name.trim(), scope || 'read');
    audit.log('settings.token.create', req.user?.username || 'unknown', { name: name.trim(), scope: scope || 'read' });
    res.json(token);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/tokens/:id', adminOnly, (req, res) => {
  try {
    const result = settings.revokeApiToken(req.params.id);
    if (!result) return res.status(404).json({ error: 'Token not found' });
    audit.log('settings.token.revoke', req.user?.username || 'unknown', { id: req.params.id });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/maintenance/clear-cache', adminOnly, (req, res) => {
  try {
    const result = settings.clearCache();
    audit.log('settings.maintenance.clear-cache', req.user?.username || 'unknown', result);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/maintenance/rotate-logs', adminOnly, (req, res) => {
  try {
    const result = settings.rotateLogs();
    audit.log('settings.maintenance.rotate-logs', req.user?.username || 'unknown', result);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/maintenance/restart-service', adminOnly, (req, res) => {
  try {
    const result = settings.restartService();
    audit.log('settings.maintenance.restart', req.user?.username || 'unknown', result);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
