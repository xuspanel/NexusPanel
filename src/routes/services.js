const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const services = require('../services/services');
const audit = require('../services/audit');
const router = express.Router();
router.use(authMiddleware);
router.use(audit.routeLogger('service'));

router.get('/', adminOnly, (req, res) => {
  try { res.json(services.list()); }
  catch (e) { res.status(500).json({ error: 'Failed to list services' }); }
});

router.get('/actions', adminOnly, (req, res) => {
  res.json(services.VALID_ACTIONS);
});

router.post('/:name/:action', adminOnly, (req, res) => {
  try {
    const result = services.action(req.params.name, req.params.action);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/bulk/:action', adminOnly, (req, res) => {
  try {
    const results = services.bulkAction(req.body.services, req.params.action);
    res.json({ results: results });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:name/status', adminOnly, (req, res) => {
  try { res.json(services.status(req.params.name)); }
  catch (e) { res.status(400).json({ error: 'Failed to get status' }); }
});

module.exports = router;
