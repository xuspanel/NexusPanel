const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const services = require('../services/services');
const router = express.Router();
router.use(authMiddleware);
router.get('/', (req, res) => { res.json(services.list()); });
router.post('/:name/:action', (req, res) => {
  try { services.action(req.params.name, req.params.action); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/:name/status', (req, res) => { res.json({ output: services.status(req.params.name) }); });
module.exports = router;
