const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const audit = require('../services/audit');
const router = express.Router();

router.use(authMiddleware);

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.get('/', adminOnly, (req, res) => {
  const result = audit.query({
    user: req.query.user,
    action: req.query.action,
    search: req.query.search,
    limit: parseInt(req.query.limit) || 100,
    offset: parseInt(req.query.offset) || 0,
  });
  res.json(result);
});

router.get('/actions', adminOnly, (req, res) => {
  res.json(audit.getActions());
});

router.delete('/clear', adminOnly, (req, res) => {
  audit.clear();
  res.json({ cleared: true });
});

module.exports = router;
