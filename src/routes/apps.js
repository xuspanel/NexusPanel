const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const apps = require('../services/apps');
const audit = require('../services/audit');

const router = express.Router();
router.use(authMiddleware);

router.get('/catalog', (req, res) => {
  try {
    res.json({ apps: apps.getCatalog() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/system-users', async (req, res) => {
  try {
    res.json({ users: await apps.listSystemUsers() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/targets', (req, res) => {
  try {
    res.json({ domains: apps.listTargetDomains() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/list', (req, res) => {
  try {
    res.json({ apps: apps.listApps() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', (req, res) => {
  try {
    res.json({ app: apps.getApp(req.params.id, req.user) });
  } catch (e) { res.status(404).json({ error: e.message }); }
});

router.get('/:id/log', (req, res) => {
  try {
    const lines = parseInt(req.query.lines, 10) || 50;
    if (!apps.recordExists(req.params.id)) {
      return res.status(404).json({ error: 'Application not found: ' + req.params.id });
    }
    res.json({ id: req.params.id, lines: apps.getLog(req.params.id, lines) });
  } catch (e) { res.status(404).json({ error: e.message }); }
});

router.post('/install', (req, res) => {
  try {
    const result = apps.createInstall(req.body, req.user);
    audit.log('apps.install.start', req, {
      app_type: req.body && req.body.app_type,
      domain: req.body && req.body.domain,
      system_user: req.body && (req.body.system_user || req.body.user),
      id: result.id,
    });
    res.status(202).json(result);
  } catch (e) {
    const code = e.statusCode === 429 ? 429 : 400;
    res.status(code).json({ error: e.message });
  }
});

router.post('/:id/uninstall', (req, res) => {
  try {
    const result = apps.startUninstall(req.params.id, req.user);
    audit.log('apps.uninstall', req, { id: req.params.id });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
