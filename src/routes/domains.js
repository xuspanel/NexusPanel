const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const domains = require('../services/domains');
const audit = require('../services/audit');

const router = express.Router();
router.use(authMiddleware);

const ALLOWED_FIELDS = ['port', 'sslEnabled', 'root', 'type'];

function sanitizeUpdates(body) {
  const out = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

router.get('/', (req, res) => {
  try {
    const { search, sort, dir, page, limit } = req.query;
    const result = domains.listDomains({
      search: search || undefined,
      sort: sort || 'domain',
      dir: dir || 'asc',
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 50,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    audit.log('domain.nginx.update', req, { domain: req.params.name });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/create', (req, res) => {
  try {
    const { type, domain, port, ssl, root, location, parentDomain } = req.body;
    if (!domain || !type) return res.status(400).json({ error: 'Domain name and type required' });
    const result = domains.createDomain(type, domain, {
      port,
      ssl,
      root: root || location,
      parentDomain,
    });
    audit.log('domain.create', req, { domain, type, port: result.port, root: result.root, ssl: result.sslEnabled, parentDomain: result.parentDomain });
    res.json({ success: true, domain: result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/:name', (req, res) => {
  try {
    const updates = sanitizeUpdates(req.body);
    const result = domains.editDomain(req.params.name, updates);
    audit.log('domain.update', req, { domain: req.params.name, updates });
    res.json({ success: true, domain: result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:name', (req, res) => {
  try {
    const result = domains.deleteDomain(req.params.name);
    audit.log('domain.delete', req, { domain: req.params.name });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:name/ssl', (req, res) => {
  try {
    const result = domains.installSSL(req.params.name);
    audit.log('domain.ssl.install', req, { domain: req.params.name, success: result.success });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/bulk/delete', (req, res) => {
  try {
    const { domains: names } = req.body;
    if (!Array.isArray(names) || names.length === 0) return res.status(400).json({ error: 'No domains specified' });
    const result = domains.bulkDelete(names);
    audit.log('domain.bulk.delete', req, { domains: names });
    res.json({ results: result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
