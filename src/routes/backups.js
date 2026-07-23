const express = require('express');
const fs = require('fs');
const path = require('path');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const backups = require('../services/backups');
const audit = require('../services/audit');
const scheduler = require('../services/backup-scheduler');

const router = express.Router();
router.use(authMiddleware);
router.use(adminOnly);

const TIMESTAMP_RE = /^\d{13}$/;

router.get('/defs', (req, res) => {
  res.json(backups.ITEM_DEFS.map(d => ({ id: d.id, label: d.label, icon: d.icon })));
});

router.get('/stats', (req, res) => {
  try { res.json(backups.getBackupStats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/list', (req, res) => {
  try {
    const { search, sort, dir, page, limit, type } = req.query;
    const result = backups.listBackups({
      search: search || undefined,
      sort: sort || 'createdAt',
      dir: dir || 'desc',
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 50,
      type: type || undefined,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/current', (req, res) => {
  try {
    const task = backups.getCurrentTask();
    if (task) return res.json(task);
    res.json(null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/start', (req, res) => {
  try {
    const { items, type } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }
    const result = backups.startBackup(items, type || 'selected');
    audit.log('backup.start', req, { taskId: result.taskId, timestamp: result.timestamp, items: result.items, type: type || 'selected' });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:taskId/cancel', (req, res) => {
  try {
    const ok = backups.cancelBackup(req.params.taskId);
    if (!ok) return res.status(404).json({ error: 'Task not found or not running' });
    audit.log('backup.cancel', req, { taskId: req.params.taskId });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/status/:taskId', (req, res) => {
  try {
    res.json(backups.getTaskStatus(req.params.taskId));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/schedules', (req, res) => {
  res.json(scheduler.list());
});

router.post('/schedules', (req, res) => {
  try {
    const schedule = scheduler.create(req.body);
    audit.log('backup.schedule.create', req, { scheduleId: schedule.id, target: schedule.target, frequency: schedule.frequency });
    res.status(201).json(schedule);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/schedules/:id/toggle', (req, res) => {
  const s = scheduler.toggle(req.params.id, req.body.enabled);
  if (!s) return res.status(404).json({ error: 'Schedule not found' });
  audit.log('backup.schedule.toggle', req, { scheduleId: req.params.id, enabled: req.body.enabled });
  res.json(s);
});

router.delete('/schedules/:id', (req, res) => {
  const ok = scheduler.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Schedule not found' });
  audit.log('backup.schedule.delete', req, { scheduleId: req.params.id });
  res.json({ ok: true });
});

router.get('/:timestamp/download', (req, res) => {
  try {
    if (!TIMESTAMP_RE.test(req.params.timestamp)) return res.status(400).json({ error: 'Invalid timestamp' });
    const info = backups.getBackupInfo(req.params.timestamp);
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    const base = path.join('/var/backups/nexuspanel', 'backup_' + req.params.timestamp);
    for (const item of info.items) {
      const f = path.join(base, item.file);
      if (fs.existsSync(f)) zip.addLocalFile(f, '', item.file);
    }
    const infoFile = path.join(base, 'info.json');
    if (fs.existsSync(infoFile)) zip.addLocalFile(infoFile, '', 'info.json');
    const buf = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="backup_' + req.params.timestamp + '.zip"');
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.get('/:timestamp/download/:filename', (req, res) => {
  try {
    if (!TIMESTAMP_RE.test(req.params.timestamp)) return res.status(400).json({ error: 'Invalid timestamp' });
    const { path: filePath, size } = backups.resolveDownload(req.params.timestamp, req.params.filename);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + path.basename(req.params.filename) + '"');
    res.setHeader('Content-Length', size);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'Stream error' }); });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.get('/:timestamp', (req, res) => {
  try { res.json(backups.getBackupInfo(req.params.timestamp)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

router.delete('/:timestamp', (req, res) => {
  try {
    if (!TIMESTAMP_RE.test(req.params.timestamp)) return res.status(400).json({ error: 'Invalid timestamp' });
    backups.deleteBackup(req.params.timestamp);
    audit.log('backup.delete', req, { timestamp: req.params.timestamp });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
