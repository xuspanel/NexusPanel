const express = require('express');
const pathMod = require('path');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const logs = require('../services/logs');
const audit = require('../services/audit');
const router = express.Router();
router.use(authMiddleware);
router.use(audit.routeLogger('log'));

function getFilePath(params) {
  const f = params.file;
  return Array.isArray(f) ? f.join('/') : String(f || '');
}

router.get('/', adminOnly, (req, res) => {
  try { res.json(logs.list()); }
  catch (e) { res.status(500).json({ error: 'Failed to list log files' }); }
});

router.get('/categories', adminOnly, (req, res) => {
  try { res.json(logs.categories()); }
  catch (e) { res.status(500).json({ error: 'Failed to load categories' }); }
});

router.get('/read/{*file}', adminOnly, async (req, res) => {
  try {
    const tail = Math.min(parseInt(req.query.tail) || 500, logs.MAX_TAIL_LINES);
    const file = getFilePath(req.params);
    const content = await logs.read(file, tail);
    const isGz = file.endsWith('.gz');
    let lineCount = 0;
    try { lineCount = await logs.lineCount(file); } catch { }
    res.json({ content: content || '', lineCount: lineCount, compressed: isGz });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/tail/{*file}', adminOnly, async (req, res) => {
  try {
    const lines = Math.min(parseInt(req.query.lines) || 100, logs.MAX_TAIL_LINES);
    const file = getFilePath(req.params);
    const content = await logs.read(file, lines);
    res.json({ content: content || '' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/search/{*file}', adminOnly, async (req, res) => {
  try {
    const q = (req.query.q || '').substring(0, 200);
    if (!q) return res.json({ content: '', matches: 0 });
    const regex = req.query.regex === 'true';
    const file = getFilePath(req.params);
    const content = await logs.search(file, q, { regex: regex });
    const matchCount = content ? content.split('\n').filter(Boolean).length : 0;
    res.json({ content: content || '', matches: matchCount });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/search-multi', adminOnly, (req, res) => {
  try {
    const { files, query, limit } = req.body || {};
    if (!files || !Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'files array required' });
    if (!query) return res.status(400).json({ error: 'query required' });
    const results = logs.searchMulti(files, query.substring(0, 200), { limit: limit || 100, regex: req.body.regex });
    res.json({ results: results });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/stream/{*file}', adminOnly, (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const file = getFilePath(req.params);
    logs.stream(file, res);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/download/{*file}', adminOnly, (req, res) => {
  try {
    const file = getFilePath(req.params);
    const filePath = logs.safePath(file);
    const name = pathMod.basename(file);
    const fs = require('fs');
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="' + name + '"',
      'Content-Length': stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/linecount/{*file}', adminOnly, async (req, res) => {
  try {
    const file = getFilePath(req.params);
    const count = await logs.lineCount(file);
    res.json({ lineCount: count });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
