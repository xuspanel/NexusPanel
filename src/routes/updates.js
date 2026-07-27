const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const audit = require('../services/audit');
const updates = require('../services/updates');
const router = express.Router();
router.use(authMiddleware);
router.use(audit.routeLogger('update'));

router.get('/', (req, res) => {
  try { res.json(updates.check()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/search', (req, res) => {
  try { res.json(updates.searchPackages(req.query.q || '')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/info/:name', (req, res) => {
  try { res.json(updates.getPackageInfo(req.params.name)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/security', (req, res) => {
  try { res.json(updates.getSecurityAdvisories()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/history', (req, res) => {
  try { res.json(updates.getUpdateHistory()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/changelog', (req, res) => {
  try { res.json({ entries: updates.getChangelog() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/apply', adminOnly, (req, res) => {
  try {
    const result = updates.apply();
    if (result.ok) {
      audit.log('update:apply-all', req, { success: true });
      updates.recordUpdate({ type: 'all', success: true, output: (result.output || '').substring(0, 500) });
    } else {
      audit.log('update:apply-all', req, { success: false, error: result.error });
      updates.recordUpdate({ type: 'all', success: false, error: result.error });
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/apply/:name', adminOnly, (req, res) => {
  try {
    const name = req.params.name;
    const result = updates.applySingle(name);
    if (result.ok) {
      audit.log('update:apply-single', req, { package: name, success: true });
      updates.recordUpdate({ type: 'single', package: name, success: true, output: (result.output || '').substring(0, 500) });
    } else {
      audit.log('update:apply-single', req, { package: name, success: false, error: result.error });
      updates.recordUpdate({ type: 'single', package: name, success: false, error: result.error });
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/panel-check', async (req, res) => {
  try { res.json(await updates.checkPanelVersion(req.query.force === 'true')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/panel-apply', adminOnly, (req, res) => {
  try {
    audit.log('update:panel', req, { action: 'apply' });
    res.json({ ok: true, message: 'Update started' });
    updates.applyPanelUpdate().then(() => {
      updates.recordUpdate({ type: 'panel', success: true });
    }).catch((e) => {
      updates.recordUpdate({ type: 'panel', success: false, error: e.message });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/panel-update-stream', adminOnly, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('data: {"type":"started"}\n\n');

  const child = updates.spawnPanelUpdateStream();
  let output = '';

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    res.write('data: ' + JSON.stringify({ type: 'progress', output: text }) + '\n\n');
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    res.write('data: ' + JSON.stringify({ type: 'progress', output: text }) + '\n\n');
  });

  child.on('exit', (code) => {
    const success = code === 0;
    audit.log('update:panel', req, { action: 'stream-finish', success, exitCode: code });
    updates.recordUpdate({ type: 'panel', success, exitCode: code, output: output.substring(output.length > 2000 ? output.length - 2000 : 0) });
    res.write('data: ' + JSON.stringify({ type: 'done', success, exitCode: code }) + '\n\n');
    res.end();
  });

  child.on('error', (err) => {
    res.write('data: ' + JSON.stringify({ type: 'done', success: false, error: err.message }) + '\n\n');
    res.end();
  });

  req.on('close', () => {
    try { child.kill('SIGTERM'); } catch {}
  });
});

module.exports = router;
