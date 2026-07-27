const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const fw = require('../services/firewall');
const audit = require('../services/audit');
const router = express.Router();
router.use(authMiddleware);
router.use(audit.routeLogger('firewall'));

router.get('/', adminOnly, (req, res) => {
  try { res.json(fw.getOverallInfo()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/backend', adminOnly, (req, res) => {
  try { res.json({ backend: fw.detectBackend() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/services', adminOnly, (req, res) => {
  try { res.json(fw.getFirewalldServices()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/zone/service', adminOnly, (req, res) => {
  try { fw.addFirewalldService(req.body.zone, req.body.service); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/zone/service', adminOnly, (req, res) => {
  try { fw.removeFirewalldService(req.body.zone, req.body.service); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/zone/port', adminOnly, (req, res) => {
  try { fw.addFirewalldPort(req.body.zone, req.body.port); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/zone/port', adminOnly, (req, res) => {
  try { fw.removeFirewalldPort(req.body.zone, req.body.port); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/zone/rich-rule', adminOnly, (req, res) => {
  try { fw.addFirewalldRichRule(req.body.zone, req.body.rule); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/zone/rich-rule', adminOnly, (req, res) => {
  try { fw.removeFirewalldRichRule(req.body.zone, req.body.rule); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/zone/default', adminOnly, (req, res) => {
  try { fw.setFirewalldDefaultZone(req.body.zone); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/zone/masquerade', adminOnly, (req, res) => {
  try { fw.toggleFirewalldMasquerade(req.body.zone, req.body.enable); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/zone/icmp-block', adminOnly, (req, res) => {
  try { fw.addFirewalldIcmpBlock(req.body.zone, req.body.icmp); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/zone/icmp-block', adminOnly, (req, res) => {
  try { fw.removeFirewalldIcmpBlock(req.body.zone, req.body.icmp); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/rule', adminOnly, (req, res) => {
  try { res.json(fw.addIptablesRule(req.body.chain, req.body.rule)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/rule', adminOnly, (req, res) => {
  try {
    if (req.body.replace) res.json(fw.replaceIptablesRule(req.body.chain, req.body.num, req.body.rule));
    else res.json(fw.insertIptablesRule(req.body.chain, req.body.num, req.body.rule));
  }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/policy', adminOnly, (req, res) => {
  try { res.json(fw.setIptablesPolicy(req.body.chain, req.body.target)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/rule/:chain/:num', adminOnly, (req, res) => {
  try { res.json(fw.deleteIptablesRule(req.params.chain, parseInt(req.params.num))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/chain', adminOnly, (req, res) => {
  try { res.json(fw.createIptablesChain(req.body.chain)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/chain/:chain', adminOnly, (req, res) => {
  try { res.json(fw.deleteIptablesChain(req.params.chain)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/chain/:chain/rename', adminOnly, (req, res) => {
  try { res.json(fw.renameIptablesChain(req.params.chain, req.body.newName)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/flush/:chain', adminOnly, (req, res) => {
  try { res.json(fw.flushIptablesChain(req.params.chain)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/raw', adminOnly, (req, res) => {
  try { res.type('text').send(fw.getIptablesRaw()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/export', adminOnly, (req, res) => {
  try { res.type('text').send(fw.getFirewalldExport()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/save', adminOnly, (req, res) => {
  try { res.json(fw.saveIptablesRules()); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
