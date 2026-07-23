const express = require('express');
const { adminOnly } = require('../middleware/auth');
const users = require('../services/users');
const audit = require('../services/audit');

const router = express.Router();

router.get('/meta/options', adminOnly, async (req, res) => {
  try {
    res.json({
      groups: await users.getAvailableGroups(),
      shells: users.getAvailableShells(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/list', adminOnly, async (req, res) => {
  try {
    const { search, sort, order, page, limit } = req.query;
    const result = await users.listSystemUsers({ search, sort, order, page, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:username', adminOnly, async (req, res) => {
  try {
    const u = await users.getSystemUser(req.params.username);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const panel = users.getPanelUserSafe(req.params.username);
    res.json({ ...u, panelUser: panel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/create', adminOnly, async (req, res) => {
  try {
    const { username, password, shell, groups, sudo, createPanel, panelRole, email, homeBase, gecos } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (!/^[a-zA-Z][a-zA-Z0-9._-]{0,31}$/.test(username)) {
      return res.status(400).json({ error: 'Invalid username. Must start with a letter, use only letters, numbers, dots, hyphens, underscores (max 32 chars).' });
    }
    const strengthErr = users.validatePasswordStrength(password);
    if (strengthErr) return res.status(400).json({ error: strengthErr });
    if (homeBase && !/^[a-zA-Z0-9_\-\/.]+$/.test(homeBase)) {
      return res.status(400).json({ error: 'Invalid home base path' });
    }

    const result = await users.createSystemUser(username, password, {
      shell: shell || '/bin/bash',
      groups: groups || [],
      sudo: sudo === true,
      createPanel: createPanel !== false,
      panelRole: panelRole || 'user',
      email: email || '',
      homeBase,
      gecos,
    });

    audit.log('user:create', req, { username, shell: result.shell, sudo: !!sudo });

    res.json({ success: true, user: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:username', adminOnly, async (req, res) => {
  try {
    const { password, shell, groups, sudo, lock, unlock, panelRole, email } = req.body;

    if (password) {
      const strengthErr = users.validatePasswordStrength(password);
      if (strengthErr) return res.status(400).json({ error: strengthErr });
    }

    const opts = {};
    if (password) opts.password = password;
    if (shell) opts.shell = shell;
    if (groups !== undefined) opts.groups = groups;
    if (sudo === true || sudo === false) opts.sudo = sudo;
    if (lock) opts.lock = true;
    if (unlock) opts.unlock = true;
    if (panelRole !== undefined) opts.panelRole = panelRole;
    if (email !== undefined) opts.email = email;

    const result = await users.updateSystemUser(req.params.username, opts, req.user?.username);

    const actions = [];
    if (password) actions.push('password');
    if (shell) actions.push('shell');
    if (groups !== undefined) actions.push('groups');
    if (sudo !== undefined) actions.push('sudo:' + (sudo ? 'grant' : 'revoke'));
    if (lock) actions.push('locked');
    if (unlock) actions.push('unlocked');
    audit.log('user:update', req, { username: req.params.username, changes: actions });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:username', adminOnly, async (req, res) => {
  try {
    const result = await users.deleteSystemUser(req.params.username, req.user?.username);
    audit.log('user:delete', req, { username: req.params.username });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bulk', adminOnly, async (req, res) => {
  try {
    const { action, usernames } = req.body;
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'No users selected' });
    }
    if (usernames.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 users per bulk operation' });
    }

    const results = [];
    const errors = [];

    for (const username of usernames) {
      try {
        if (action === 'delete') {
          await users.deleteSystemUser(username, req.user?.username);
          results.push({ username, ok: true });
        } else if (action === 'lock') {
          await users.updateSystemUser(username, { lock: true }, req.user?.username);
          results.push({ username, ok: true });
        } else if (action === 'unlock') {
          await users.updateSystemUser(username, { unlock: true }, req.user?.username);
          results.push({ username, ok: true });
        } else {
          return res.status(400).json({ error: 'Invalid bulk action: ' + action });
        }
      } catch (err) {
        errors.push({ username, error: err.message });
      }
    }

    audit.log('user:bulk:' + action, req, { usernames, succeeded: results.length, failed: errors.length });

    res.json({ success: true, results, errors, total: usernames.length, succeeded: results.length, failed: errors.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
