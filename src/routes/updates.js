const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const updates = require('../services/updates');
const router = express.Router();
router.use(authMiddleware);
router.get('/', (req, res) => { res.json(updates.check()); });
router.post('/apply', adminOnly, (req, res) => { res.json(updates.apply()); });
router.post('/apply/:name', adminOnly, (req, res) => {
  try { res.json(updates.applySingle(req.params.name)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/panel-check', async (req, res) => {
  try { res.json(await updates.checkPanelVersion(req.query.force === 'true')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/panel-apply', adminOnly, (req, res) => {
  try { res.json(updates.applyPanelUpdate()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
