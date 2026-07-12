const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const mimeService = require('../services/mimetypes');
const router = express.Router();

router.use(authMiddleware);

router.get('/system', (req, res) => {
  const data = mimeService.getSystemTypes();
  res.json(data);
});

router.get('/', (req, res) => {
  const types = mimeService.getUserTypes();
  res.json(types);
});

router.get('/:id', (req, res) => {
  const type = mimeService.getUserType(req.params.id);
  if (!type) return res.status(404).json({ error: 'MIME type not found' });
  res.json(type);
});

router.post('/', (req, res) => {
  try {
    const { mimeType, extensions, description } = req.body;
    const entry = mimeService.createUserType({ mimeType, extensions, description });
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const entry = mimeService.updateUserType(req.params.id, req.body);
    res.json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const result = mimeService.deleteUserType(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
