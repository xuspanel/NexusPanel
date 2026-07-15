const express = require('express');
const fs = require('fs');
const path = require('path');
const { authMiddleware } = require('../middleware/auth');
const backups = require('../services/backups');
const scheduler = require('../services/backup-scheduler');

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

const router = express.Router();
router.use(authMiddleware);

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.use(adminOnly);

router.get('/defs', (req, res) => {
  res.json(backups.ITEM_DEFS.map(d => ({ id: d.id, label: d.label, icon: d.icon })));
});

router.post('/start', (req, res) => {
  try {
    const { items, type } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }
    const result = backups.startBackup(items, type || 'selected');
    res.json(result);
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

router.get('/current', (req, res) => {
  try {
    const task = backups.getCurrentTask();
    if (task) return res.json(task);
    res.json(null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/list', (req, res) => {
  try {
    res.json(backups.listBackups());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:timestamp', (req, res) => {
  try {
    res.json(backups.getBackupInfo(req.params.timestamp));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.get('/:timestamp/download', (req, res) => {
  try {
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
    const { path: filePath, size } = backups.resolveDownload(req.params.timestamp, req.params.filename);
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + req.params.filename + '"');
    res.setHeader('Content-Length', stat.size);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'Stream error' }); });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.delete('/:timestamp', (req, res) => {
  try {
    res.json(backups.deleteBackup(req.params.timestamp));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Backup Schedule routes
router.get('/schedules', adminOnly, (req, res) => {
  res.json(scheduler.list());
});

router.post('/schedules', adminOnly, (req, res) => {
  try {
    const schedule = scheduler.create(req.body);
    res.status(201).json(schedule);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/schedules/:id/toggle', adminOnly, (req, res) => {
  const s = scheduler.toggle(req.params.id, req.body.enabled);
  if (!s) return res.status(404).json({ error: 'Schedule not found' });
  res.json(s);
});

router.delete('/schedules/:id', adminOnly, (req, res) => {
  const ok = scheduler.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Schedule not found' });
  res.json({ ok: true });
});

module.exports = router;
