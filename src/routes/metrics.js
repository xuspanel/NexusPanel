const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const metrics = require('../services/metrics');
const router = express.Router();
router.use(authMiddleware);
router.get('/current', (req, res) => { res.json(metrics.getCurrent()); });
router.get('/history', (req, res) => { res.json(metrics.getHistory(req.query.period || '24h')); });
module.exports = router;
