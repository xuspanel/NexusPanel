const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const logs = require('../services/logs');
const router = express.Router();
router.use(authMiddleware);
router.get('/', (req, res) => { res.json(logs.list()); });
router.get('/read/:file', adminOnly, (req, res) => {
  try { res.json({ content: logs.read(req.params.file, parseInt(req.query.tail) || 500) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/search/:file', adminOnly, (req, res) => {
  try { res.json({ content: logs.search(req.params.file, req.query.q || '') }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
module.exports = router;
