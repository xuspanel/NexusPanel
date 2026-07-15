const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const domains = require('../services/domains');

const router = express.Router();
router.use(authMiddleware);

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.use(adminOnly);

router.get('/', (req, res) => {
  try { res.json(domains.listDomains()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/parents', (req, res) => {
  try { res.json(domains.getParentCandidates()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/ports/available', (req, res) => {
  try { res.json(domains.getSuggestedPort()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:name', (req, res) => {
  try { res.json(domains.getDomain(req.params.name)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

router.get('/:name/nginx', (req, res) => {
  try {
    const content = domains.getNginxPreview(req.params.name);
    res.json({ domain: req.params.name, content });
  } catch (e) { res.status(404).json({ error: e.message }); }
});

router.put('/:name/nginx', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    domains.saveNginxPreview(req.params.name, content);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/create', (req, res) => {
  try {
    const { type, domain, port, ssl } = req.body;
    if (!domain || !type) return res.status(400).json({ error: 'Domain name and type required' });
    const result = domains.createDomain(type, domain, port, ssl !== false);
    res.json({ success: true, domain: result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/:name', (req, res) => {
  try {
    const result = domains.editDomain(req.params.name, req.body);
    res.json({ success: true, domain: result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:name', (req, res) => {
  try {
    const result = domains.deleteDomain(req.params.name);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:name/ssl', (req, res) => {
  try {
    const result = domains.installSSL(req.params.name);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
