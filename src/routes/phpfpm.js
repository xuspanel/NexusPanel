const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const phpfpm = require('../services/phpfpm');
const audit = require('../services/audit');
const router = express.Router();
router.use(authMiddleware);
router.use(audit.routeLogger('phpfpm'));

router.get('/', (req, res) => {
  try { res.json(phpfpm.listPools()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/status', (req, res) => {
  try { res.json(phpfpm.getStatus()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/version', (req, res) => {
  try { res.json(phpfpm.phpVersion()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/global', (req, res) => {
  try { res.json(phpfpm.globalConfig()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/pool-status', (req, res) => {
  try { res.json(phpfpm.poolStatus()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/opcache', (req, res) => {
  try { res.json(phpfpm.opcacheStatus()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/modules', (req, res) => {
  try { res.json(phpfpm.phpModules()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/ini', (req, res) => {
  try { res.json(phpfpm.phpIni()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/config-test', (req, res) => {
  try { res.json(phpfpm.configTest()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:name', (req, res) => {
  try { res.json(phpfpm.poolConfig(req.params.name)); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:name/logs', (req, res) => {
  try { res.json(phpfpm.poolLogs(req.params.name, req.query.lines)); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:name/slow-log', (req, res) => {
  try { res.json(phpfpm.slowLogs(req.params.name, req.query.lines)); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/:name', adminOnly, (req, res) => {
  try {
    const r = phpfpm.editPoolConfig(req.params.name, req.body.directive, req.body.value);
    audit.log('phpfpm.pool.edit', req, { pool: req.params.name, directive: req.body.directive, value: req.body.value });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/restart', adminOnly, (req, res) => {
  try {
    const r = phpfpm.restart();
    audit.log('phpfpm.restart', req, { success: r.success });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/reload', adminOnly, (req, res) => {
  try {
    const r = phpfpm.reload();
    audit.log('phpfpm.reload', req, { success: r.success });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
