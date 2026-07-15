const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const users = require('../services/users');

const router = express.Router();

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// List all VPS system users
router.get('/list', adminOnly, (req, res) => {
  try {
    const systemUsers = users.listSystemUsers();
    res.json(systemUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single user details
router.get('/:username', adminOnly, (req, res) => {
  try {
    const u = users.getSystemUser(req.params.username);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json(u);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a VPS user
router.post('/create', adminOnly, (req, res) => {
  try {
    const { username, password, shell, groups, sudo, createPanel, panelRole, email, homeBase, gecos } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ error: 'Invalid username. Use letters, numbers, dots, hyphens, underscores.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const result = users.createSystemUser(username, password, {
      shell: shell || '/bin/bash',
      groups: groups || [],
      sudo: sudo === true,
      createPanel: createPanel !== false,
      panelRole: panelRole || 'user',
      email: email || '',
      homeBase,
      gecos,
    });

    if (createPanel !== false && email) {
      const localPart = username;
      try {
        const homeDir = '/home/' + localPart;
        const mailCmds = [
          'mkdir -p ' + homeDir + '/Maildir/cur ' + homeDir + '/Maildir/new ' + homeDir + '/Maildir/tmp',
          'chown -R ' + localPart + ':' + localPart + ' ' + homeDir + '/Maildir',
          'chmod -R 700 ' + homeDir + '/Maildir',
        ];
        require('child_process').execSync(mailCmds.join(' && '), { timeout: 5000, stdio: 'ignore' });
      } catch (_) {}
    }

    res.json({ success: true, user: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update a VPS user
router.put('/:username', adminOnly, (req, res) => {
  try {
    const { password, shell, groups, sudo, lock, unlock, panelRole, email } = req.body;

    const opts = {};
    if (password) opts.password = password;
    if (shell) opts.shell = shell;
    if (groups !== undefined) opts.groups = groups;
    if (sudo === true || sudo === false) opts.sudo = sudo;
    if (lock) opts.lock = true;
    if (unlock) opts.unlock = true;
    if (panelRole !== undefined) opts.panelRole = panelRole;
    if (email !== undefined) opts.email = email;

    const result = users.updateSystemUser(req.params.username, opts);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a VPS user
router.delete('/:username', adminOnly, (req, res) => {
  try {
    const result = users.deleteSystemUser(req.params.username);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get available groups and shells (for form options)
router.get('/meta/options', adminOnly, (req, res) => {
  res.json({
    groups: users.getAvailableGroups(),
    shells: users.getAvailableShells(),
  });
});

module.exports = router;
