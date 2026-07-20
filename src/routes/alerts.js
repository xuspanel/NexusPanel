const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const alerts = require('../services/alerts');
const router = express.Router();
router.use(authMiddleware);
router.get('/config', (req, res) => res.json(alerts.getConfig()));
router.put('/config', adminOnly, (req, res) => res.json(alerts.updateConfig(req.body)));
router.get('/history', (req, res) => res.json(alerts.getHistory()));
router.post('/test', adminOnly, (req, res) => {
  try { alerts.addAlert('test', 0, 0); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
