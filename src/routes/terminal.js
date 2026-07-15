const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const terminal = require('../services/terminal');

const router = express.Router();
router.use(authMiddleware);

router.get('/presets', (req, res) => {
  res.json(terminal.getPresets());
});

router.post('/presets', (req, res) => {
  try {
    const { label, cmd } = req.body;
    if (!label || !cmd) return res.status(400).json({ error: 'Label and cmd are required' });
    const preset = terminal.addPreset(label, cmd);
    res.json(preset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/presets/:id', (req, res) => {
  try {
    const { label, cmd } = req.body;
    if (!label || !cmd) return res.status(400).json({ error: 'Label and cmd are required' });
    const preset = terminal.updatePreset(req.params.id, label, cmd);
    res.json(preset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/presets/:id', (req, res) => {
  try {
    const result = terminal.deletePreset(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
