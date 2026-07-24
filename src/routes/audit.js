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
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    limit: parseInt(req.query.limit) || 50,
    offset: parseInt(req.query.offset) || 0,
  });
  res.json(result);
});

router.get('/actions', adminOnly, (req, res) => {
  res.json(audit.getActions());
});

router.get('/users', adminOnly, (req, res) => {
  res.json(audit.getUsers());
});

router.get('/stats', adminOnly, (req, res) => {
  res.json(audit.getStats());
});

router.get('/export', adminOnly, (req, res) => {
  const entries = audit.exportAll();
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.json"');
  res.json(entries);
});

router.delete('/clear', adminOnly, (req, res) => {
  const result = audit.clear();
  audit.log('audit.clear', req, { backup: result.backup });
  setTimeout(() => flushAudit(), 100);
  res.json(result);
});

function flushAudit() {
  try { require('../services/audit').init(); } catch {}
}

module.exports = router;
