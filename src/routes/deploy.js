const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const deploy = require('../services/git-deploy');
const audit = require('../services/audit');

const router = express.Router();
router.use(authMiddleware);

router.get('/history', (req, res) => {
  try { res.json({ deployments: deploy.listDeployments(req.user) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/git', (req, res) => {
  try {
    const result = deploy.createDeploy(req.body, req.user);
    audit.log('deploy.start', req, {
      repo_url: req.body && req.body.repo_url,
      domain: req.body && req.body.domain,
      branch: req.body && req.body.branch,
      id: result.id,
    });
    res.status(202).json(result);
  } catch (e) {
    const code = e.statusCode === 429 ? 429 : 400;
    res.status(code).json({ error: e.message });
  }
});

router.get('/ssh', (req, res) => {
  try {
    const key = deploy.getSshKey(req.user.username);
    res.json({ has_key: !!key, stored_at: key ? key.stored_at : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ssh', (req, res) => {
  try {
    if (!req.body.private_key || typeof req.body.private_key !== 'string' || !req.body.private_key.includes('PRIVATE KEY'))
      throw new Error('Invalid SSH private key');
    deploy.storeSshKey(req.user.username, req.body.private_key.trim());
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/ssh', (req, res) => {
  try { deploy.deleteSshKey(req.user.username); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', (req, res) => {
  try { res.json({ deployment: deploy.getDeployment(req.params.id, req.user) }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

router.get('/:id/log', (req, res) => {
  try {
    const lines = parseInt(req.query.lines, 10) || 50;
    res.json({ id: req.params.id, lines: deploy.getLog(req.params.id, lines) });
  } catch (e) { res.status(404).json({ error: e.message }); }
});

router.post('/:id/rollback', (req, res) => {
  try {
    const result = deploy.performRollback(req.params.id, req.user);
    audit.log('deploy.rollback', req, { id: req.params.id });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id/env', (req, res) => {
  try { res.json({ vars: deploy.getEnvVars(req.params.id, req.user) }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

router.put('/:id/env', (req, res) => {
  try {
    deploy.setEnvVars(req.params.id, req.user, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/webhook-url', (req, res) => {
  try {
    deploy.generateWebhookUrl({ id: req.params.id, webhook_token: '', webhook_url: '' });
    const deployment = deploy.getDeployment(req.params.id, req.user);
    res.json({ webhook_url: deployment.webhook_url });
  } catch (e) { res.status(404).json({ error: e.message }); }
});

module.exports = router;
