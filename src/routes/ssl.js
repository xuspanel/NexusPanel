const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const ssl = require('../services/ssl');
const audit = require('../services/audit');
const router = express.Router();
router.use(authMiddleware);
router.use(audit.routeLogger('ssl'));

router.get('/', (req, res) => {
  try { res.json(ssl.list()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/search', (req, res) => {
  try { res.json(ssl.search(req.query.q || '')); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/auto-renew', (req, res) => {
  try { res.json(ssl.autoRenewStatus()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/nginx-options', (req, res) => {
  try { res.json(ssl.nginxOptions()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:name', (req, res) => {
  try { res.json(ssl.detail(req.params.name)); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:name/config', (req, res) => {
  try { res.json(ssl.getConfig(req.params.name)); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/issue', adminOnly, (req, res) => {
  try {
    const r = ssl.issue(req.body.domain, req.body);
    audit.log('ssl.issue', req, { domain: req.body.domain, success: r.success });
    if (r.success) res.json(r); else res.status(400).json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/renew/:domain', adminOnly, (req, res) => {
  try {
    const r = ssl.renew(req.params.domain);
    audit.log('ssl.renew', req, { domain: req.params.domain, success: r.success });
    if (r.success) res.json(r); else res.status(400).json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/renew-all', adminOnly, (req, res) => {
  try {
    const r = ssl.renewAll();
    audit.log('ssl.renewAll', req, { renewed: r.renewed, failed: r.failed });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/revoke/:domain', adminOnly, (req, res) => {
  try {
    const r = ssl.revoke(req.params.domain);
    audit.log('ssl.revoke', req, { domain: req.params.domain, success: r.success });
    if (r.success) res.json(r); else res.status(400).json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/dry-run', adminOnly, (req, res) => {
  try {
    const r = ssl.dryRun();
    audit.log('ssl.dryRun', req, { results: r.results.length });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:domain', adminOnly, (req, res) => {
  try {
    const r = ssl.remove(req.params.domain);
    audit.log('ssl.delete', req, { domain: req.params.domain, success: r.success });
    if (r.success) res.json(r); else res.status(400).json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
