const express = require('express');
const deploy = require('../services/git-deploy');

const router = express.Router();

router.post('/:deploymentId/:token', async (req, res) => {
  try {
    const result = await deploy.handleWebhook(
      req.params.deploymentId,
      req.params.token,
      req.headers['x-hub-signature-256'] || '',
      req.body
    );
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
