const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const cron = require('../services/cron');
const router = express.Router();
router.use(authMiddleware);
router.get('/owners', (req, res) => { res.json(cron.getOwners()); });
router.get('/:owner', (req, res) => { res.json(cron.list(req.params.owner)); });
router.post('/:owner', adminOnly, (req, res) => {
  try { cron.add(req.params.owner, req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/:owner/:index', adminOnly, (req, res) => {
  try { cron.update(req.params.owner, parseInt(req.params.index), req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/:owner/:index', adminOnly, (req, res) => {
  try { cron.remove(req.params.owner, parseInt(req.params.index)); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
module.exports = router;
