const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const cron = require('../services/cron');
const audit = require('../services/audit');
const router = express.Router();
router.use(authMiddleware);
router.use(audit.routeLogger('cron'));

router.get('/owners', adminOnly, (req, res) => {
  try { res.json(cron.getOwners()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/cron-d', adminOnly, (req, res) => {
  try { res.json(cron.listSystemCronD()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/cron-d/:filename', adminOnly, (req, res) => {
  try { res.json(cron.readSystemCronD(req.params.filename)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/cron-d/:filename', adminOnly, (req, res) => {
  try {
    if (!req.body.content) throw new Error('Content is required');
    cron.saveSystemCronD(req.params.filename, req.body.content);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/cron-d/:filename', adminOnly, (req, res) => {
  try {
    cron.deleteSystemCronD(req.params.filename);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:owner/describe', adminOnly, (req, res) => {
  try {
    const entry = cron.validateEntry(req.query);
    res.json({ description: cron.describeSchedule(entry) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:owner', adminOnly, (req, res) => {
  try {
    const entries = cron.list(req.params.owner);
    const enriched = entries.map((e, i) => ({
      ...e,
      index: i,
      description: cron.describeSchedule(e),
      nextRun: cron.calcNextRun(e),
      nextRunFormatted: cron.calcNextRun(e) ? cron.formatDuration(cron.calcNextRun(e) - new Date()) : null,
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:owner', adminOnly, (req, res) => {
  try {
    const entry = cron.validateEntry(req.body);
    cron.add(req.params.owner, entry);
    const entries = cron.list(req.params.owner);
    const created = entries[entries.length - 1];
    res.json({ ok: true, entry: created, description: cron.describeSchedule(created) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/:owner/:index/toggle', adminOnly, (req, res) => {
  try {
    const idx = parseInt(req.params.index);
    if (isNaN(idx)) throw new Error('Invalid index');
    const updated = cron.toggle(req.params.owner, idx);
    res.json({ ok: true, entry: updated, description: cron.describeSchedule(updated) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/:owner/:index', adminOnly, (req, res) => {
  try {
    const idx = parseInt(req.params.index);
    if (isNaN(idx)) throw new Error('Invalid index');
    const entry = cron.validateEntry(req.body);
    cron.update(req.params.owner, idx, entry);
    const entries = cron.list(req.params.owner);
    const updated = entries[idx];
    res.json({ ok: true, entry: updated, description: cron.describeSchedule(updated) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:owner/:index', adminOnly, (req, res) => {
  try {
    const idx = parseInt(req.params.index);
    if (isNaN(idx)) throw new Error('Invalid index');
    const entries = cron.list(req.params.owner);
    if (idx < 0 || idx >= entries.length) throw new Error('Entry not found');
    cron.remove(req.params.owner, idx);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
