const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const docker = require('../services/docker');

const router = express.Router();
router.use(authMiddleware);
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) return adminOnly(req, res, next);
  next();
});

function handleError(res, err) {
  var msg = err.message || String(err);
  if (msg.includes('command not found') || msg.includes('Cannot connect') || msg.includes('connect ECONNREFUSED')) {
    return res.status(503).json({ error: 'Docker not available', detail: msg });
  }
  res.status(500).json({ error: msg });
}

router.get('/containers', async (req, res) => {
  try {
    var list = await docker.getContainers(req.query.all !== 'false');
    res.json(list);
  } catch (err) { handleError(res, err); }
});

router.get('/images', async (req, res) => {
  try {
    var list = await docker.getImages();
    res.json(list);
  } catch (err) { handleError(res, err); }
});

router.get('/info', async (req, res) => {
  try {
    var info = await docker.getInfo();
    res.json(info);
  } catch (err) { handleError(res, err); }
});

router.post('/containers/:id/start', async (req, res) => {
  try { res.json(await docker.startContainer(req.params.id)); }
  catch (err) { handleError(res, err); }
});

router.post('/containers/:id/stop', async (req, res) => {
  try { res.json(await docker.stopContainer(req.params.id)); }
  catch (err) { handleError(res, err); }
});

router.post('/containers/:id/restart', async (req, res) => {
  try { res.json(await docker.restartContainer(req.params.id)); }
  catch (err) { handleError(res, err); }
});

router.delete('/containers/:id', async (req, res) => {
  try { res.json(await docker.removeContainer(req.params.id)); }
  catch (err) { handleError(res, err); }
});

router.delete('/images/:id', async (req, res) => {
  try { res.json(await docker.removeImage(req.params.id)); }
  catch (err) { handleError(res, err); }
});

router.get('/containers/:id/logs', async (req, res) => {
  try {
    var logs = await docker.getContainerLogs(req.params.id, req.query.tail);
    res.json({ logs });
  } catch (err) { handleError(res, err); }
});

router.get('/containers/:id/inspect', async (req, res) => {
  try { res.json(await docker.inspectContainer(req.params.id)); }
  catch (err) { handleError(res, err); }
});

router.get('/containers/:id/stats', async (req, res) => {
  try { res.json(await docker.containerStats(req.params.id)); }
  catch (err) { handleError(res, err); }
});

router.get('/images/:id/inspect', async (req, res) => {
  try { res.json(await docker.inspectImage(req.params.id)); }
  catch (err) { handleError(res, err); }
});

router.get('/images/:id/history', async (req, res) => {
  try { res.json(await docker.imageHistory(req.params.id)); }
  catch (err) { handleError(res, err); }
});

router.post('/images/pull', async (req, res) => {
  try {
    var image = req.body.image;
    if (!image || typeof image !== 'string') return res.status(400).json({ error: 'Image name required' });
    var result = await docker.pullImage(image);
    res.json({ success: true, result: result });
  } catch (err) { handleError(res, err); }
});

router.post('/prune', async (req, res) => {
  try {
    var type = req.body.type || 'all';
    var result = {};
    if (type === 'all' || type === 'containers') result.containers = await docker.pruneContainers();
    if (type === 'all' || type === 'images') result.images = await docker.pruneImages();
    if (type === 'all' || type === 'volumes') result.volumes = await docker.pruneVolumes();
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/containers/create', async (req, res) => {
  try {
    var config = req.body;
    if (!config.Image) return res.status(400).json({ error: 'Image is required' });
    var result = await docker.createContainer(config);
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.get('/networks', async (req, res) => {
  try { res.json(await docker.listNetworks()); }
  catch (err) { handleError(res, err); }
});

router.get('/networks/:id', async (req, res) => {
  try { res.json(await docker.inspectNetwork(req.params.id)); }
  catch (err) { handleError(res, err); }
});

router.delete('/networks/:id', async (req, res) => {
  try { res.json(await docker.removeNetwork(req.params.id)); }
  catch (err) { handleError(res, err); }
});

router.get('/compose/projects/list', async (req, res) => {
  try { res.json(await docker.listComposeProjects()); }
  catch (err) { handleError(res, err); }
});

router.get('/compose/:project', async (req, res) => {
  try { res.json(await docker.composeProjectContainers(req.params.project)); }
  catch (err) { handleError(res, err); }
});

router.post('/compose/:project/up', async (req, res) => {
  try {
    var project = req.params.project;
    if (!/^[a-zA-Z0-9_-]+$/.test(project)) return res.status(400).json({ error: 'Invalid project name' });
    var { runSafe } = require('../utils/shell');
    var { stdout } = await runSafe('docker', ['compose', '-p', project, 'up', '-d'], { timeout: 120000 });
    res.json({ success: true, output: (stdout || '').substring(0, 1000) });
  } catch (err) { handleError(res, err); }
});

router.post('/compose/:project/down', async (req, res) => {
  try {
    var project = req.params.project;
    if (!/^[a-zA-Z0-9_-]+$/.test(project)) return res.status(400).json({ error: 'Invalid project name' });
    var { runSafe } = require('../utils/shell');
    var { stdout } = await runSafe('docker', ['compose', '-p', project, 'down'], { timeout: 60000 });
    res.json({ success: true, output: (stdout || '').substring(0, 1000) });
  } catch (err) { handleError(res, err); }
});

router.get('/containers/:id/fs', async (req, res) => {
  try {
    var entries = await docker.containerArchive(req.params.id, req.query.path);
    res.json({ entries: entries });
  } catch (err) { handleError(res, err); }
});

router.get('/containers/:id/fs/read', async (req, res) => {
  try {
    var content = await docker.readContainerFile(req.params.id, req.query.path);
    res.json({ content: content });
  } catch (err) { handleError(res, err); }
});

module.exports = router;
