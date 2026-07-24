const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const processes = require('../services/processes');
const router = express.Router();
router.use(authMiddleware);
const audit = require('../services/audit');
router.use(audit.routeLogger('process'));
router.get('/', (req, res) => { res.json(processes.list()); });
router.post('/kill/:pid', adminOnly, (req, res) => {
  try { processes.kill(req.params.pid, req.body.signal); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/tree', (req, res) => { res.json({ tree: processes.tree() }); });
module.exports = router;
