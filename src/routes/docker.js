const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const docker = require('../services/docker');

const router = express.Router();
router.use(authMiddleware);
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) return adminOnly(req, res, next);
  next();
});

router.get('/containers', async (req, res) => {
  console.log('Docker containers endpoint hit, user:', req.user?.username);
  try {
    const list = await docker.getContainers(true);
    res.json(list);
  } catch (err) {
    if (err.message.includes('command not found') || err.message.includes('Cannot connect')) {
      return res.status(503).json({ error: 'Docker not available', detail: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

router.get('/images', async (req, res) => {
  try {
    const list = await docker.getImages();
    res.json(list);
  } catch (err) {
    if (err.message.includes('command not found') || err.message.includes('Cannot connect')) {
      return res.status(503).json({ error: 'Docker not available', detail: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

router.get('/info', async (req, res) => {
  try {
    const info = await docker.getInfo();
    res.json(info);
  } catch (err) {
    if (err.message.includes('command not found') || err.message.includes('Cannot connect')) {
      return res.status(503).json({ error: 'Docker not available', detail: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/containers/:id/start', async (req, res) => {
  try {
    const result = await docker.startContainer(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/containers/:id/stop', async (req, res) => {
  try {
    const result = await docker.stopContainer(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/containers/:id/restart', async (req, res) => {
  try {
    const result = await docker.restartContainer(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/containers/:id', async (req, res) => {
  try {
    const result = await docker.removeContainer(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/images/:id', async (req, res) => {
  try {
    const result = await docker.removeImage(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/containers/:id/logs', async (req, res) => {
  try {
    const logs = await docker.getContainerLogs(req.params.id);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
