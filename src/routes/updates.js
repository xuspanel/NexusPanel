const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const updates = require('../services/updates');
const router = express.Router();
router.use(authMiddleware);
router.get('/', (req, res) => { res.json(updates.check()); });
router.post('/apply', (req, res) => { res.json(updates.apply()); });
module.exports = router;
