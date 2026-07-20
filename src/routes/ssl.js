const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const ssl = require('../services/ssl');
const router = express.Router();
router.use(authMiddleware);
router.get('/', (req, res) => { res.json(ssl.list()); });
router.post('/issue', adminOnly, (req, res) => {
  const r = ssl.issue(req.body.domain, req.body);
  if (r.error) res.status(400).json(r);
  else res.json(r);
});
router.post('/renew/:domain', adminOnly, (req, res) => {
  const r = ssl.renew(req.params.domain);
  if (r.error) res.status(400).json(r);
  else res.json(r);
});
module.exports = router;
