const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const audit = require('../services/audit');
const mimeService = require('../services/mimetypes');
const router = express.Router();

router.use(authMiddleware);

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.get('/system', (req, res) => {
  res.json(mimeService.getSystemTypes());
});

router.get('/', (req, res) => {
  res.json(mimeService.getUserTypes());
});

router.get('/lookup/:ext', (req, res) => {
  const results = mimeService.lookupByExtension(req.params.ext);
  res.json(results);
});

router.get('/export', adminOnly, (req, res) => {
  const types = mimeService.exportUserTypes();
  res.setHeader('Content-Disposition', 'attachment; filename="mime-types-export.json"');
  res.json(types);
});

router.get('/:id', (req, res) => {
  const type = mimeService.getUserType(req.params.id);
  if (!type) return res.status(404).json({ error: 'MIME type not found' });
  res.json(type);
});

router.post('/', adminOnly, async (req, res) => {
  try {
    const { mimeType, extensions, description } = req.body;
    const entry = mimeService.createUserType({ mimeType, extensions, description });
    audit.log('mime.create', req, { mimeType: entry.mimeType, extensions: entry.extensions });
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bulk/delete', adminOnly, async (req, res) => {
  try {
    const result = mimeService.bulkDeleteUserTypes(req.body.ids);
    audit.log('mime.bulk.delete', req, { count: result.deleted });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/import', adminOnly, async (req, res) => {
  try {
    const result = mimeService.importUserTypes(req.body.types);
    audit.log('mime.import', req, { imported: result.imported, skipped: result.skipped });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  if (!mimeService.ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid MIME type ID' });
  try {
    const entry = mimeService.updateUserType(req.params.id, req.body);
    audit.log('mime.update', req, { id: req.params.id, mimeType: entry.mimeType });
    res.json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  if (!mimeService.ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid MIME type ID' });
  try {
    const result = mimeService.deleteUserType(req.params.id);
    audit.log('mime.delete', req, { id: req.params.id });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
