const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const updates = require('../services/updates');
const router = express.Router();
router.use(authMiddleware);
router.get('/', (req, res) => { res.json(updates.check()); });
router.post('/apply', (req, res) => { res.json(updates.apply()); });
router.post('/apply/:name', (req, res) => { res.json(updates.applySingle(req.params.name)); });
router.get('/panel-check', async (req, res) => {
  const force = req.query.force === 'true';
  try {
    const result = await updates.checkPanelVersion(force);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router.post('/panel-apply', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    const child = updates.applyPanelUpdate((err, output) => {
      if (err) {
        if (!res.headersSent) res.json({ error: err.message, output });
      }
    });
    res.json({ ok: true, message: 'Update started' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
module.exports = router;
