const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const fw = require('../services/firewall');
const router = express.Router();
router.use(authMiddleware);
router.get('/', (req, res) => { res.json(fw.listRules()); });
router.post('/rule', (req, res) => {
  try { res.json(fw.addRule(req.body.chain, req.body.rule)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/rule/:chain/:num', (req, res) => {
  try { res.json(fw.deleteRule(req.params.chain, parseInt(req.params.num))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/save', (req, res) => { fw.saveRules(); res.json({ ok: true }); });
module.exports = router;
