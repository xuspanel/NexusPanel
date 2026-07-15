const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const phpfpm = require('../services/phpfpm');
const router = express.Router();
router.use(authMiddleware);
router.get('/', (req, res) => { res.json(phpfpm.listPools()); });
router.get('/status', (req, res) => { res.json({ output: phpfpm.getStatus() }); });
router.post('/restart', (req, res) => { res.json(phpfpm.restart()); });
module.exports = router;
