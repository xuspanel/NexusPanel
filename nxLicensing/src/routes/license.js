const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const license = require('../services/license');
const router = express.Router();

router.post('/validate', (req, res) => {
  const { key, domain } = req.body;
  if (!key) return res.status(400).json({ error: 'key is required' });
  const result = license.validateKey(key, domain || null);
  res.json(license.signPayload(result));
});

router.get('/licenses', authMiddleware, (req, res) => {
  res.json(license.listLicenses());
});

router.get('/licenses/:key', authMiddleware, (req, res) => {
  const lic = license.getLicense(req.params.key);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  res.json(lic);
});

router.post('/licenses/generate', authMiddleware, (req, res) => {
  const keys = license.generateKeys(req.body);
  res.status(201).json(keys);
});

router.put('/licenses/:key', authMiddleware, (req, res) => {
  const lic = license.updateLicense(req.params.key, req.body);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  res.json(lic);
});

router.delete('/licenses/:key', authMiddleware, (req, res) => {
  const ok = license.deleteLicense(req.params.key);
  if (!ok) return res.status(404).json({ error: 'License not found' });
  res.json({ deleted: true });
});

router.get('/stats', authMiddleware, (req, res) => {
  res.json(license.getStats());
});

module.exports = router;

router.post('/licenses/bulk', authMiddleware, (req, res) => {
  const { keys, action } = req.body;
  if (!keys || !Array.isArray(keys) || !keys.length) return res.status(400).json({ error: 'keys array required' });
  if (!['activate','suspend','revoke','delete'].includes(action)) return res.status(400).json({ error: 'invalid action' });

  const results = [];
  for (const key of keys) {
    try {
      if (action === 'delete') {
        const ok = license.deleteLicense(key);
        results.push({ key, action: 'deleted', ok });
      } else {
        const statusMap = { activate: 'active', suspend: 'suspended', revoke: 'revoked' };
        const lic = license.updateLicense(key, { status: statusMap[action] });
        results.push({ key, action, ok: !!lic });
      }
    } catch (e) {
      results.push({ key, action, ok: false, error: e.message });
    }
  }
  res.json({ results, total: keys.length, succeeded: results.filter(r => r.ok).length });
});

router.post('/checkout/generate', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== process.env.CHECKOUT_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const keys = license.generateKeys(req.body);
  res.status(201).json({ keys });
});

router.get('/analytics', authMiddleware, (req, res) => {
  res.json(license.getAnalytics());
});
