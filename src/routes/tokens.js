const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const tokens = require('../services/tokens');
const router = express.Router();
router.use(authMiddleware);
const audit = require('../services/audit');
router.use(audit.routeLogger('token'));
router.get('/', (req, res) => res.json(tokens.list(req.user?.id || req.user?.username)));
router.post('/', async (req, res) => {
  try {
    const token = await tokens.generate(req.user?.id || req.user?.username, req.body.label, req.body.scope);
    res.status(201).json(token);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/:id', (req, res) => {
  const ok = tokens.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Token not found' });
  res.json({ ok: true });
});
module.exports = router;
