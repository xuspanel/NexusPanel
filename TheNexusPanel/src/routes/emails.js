const crypto = require('crypto');
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { simpleParser } = require('mailparser');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const FOLDER_MAP = {
  INBOX: '',
  Sent: '.Sent',
  Spam: '.Junk',
  Junk: '.Junk',
  Trash: '.Trash',
  Drafts: '.Drafts',
};

function folderToMaildir(folder) {
  const mapped = FOLDER_MAP[folder];
  if (mapped !== undefined) return mapped;
  return folder.startsWith('.') ? folder : '.' + folder;
}
function maildirToFolder(dir) {
  for (const [k, v] of Object.entries(FOLDER_MAP)) {
    if (v === dir) return k;
  }
  return dir.replace(/^\./, '');
}
const KNOWN_FOLDERS = [
  { name: 'INBOX', display: 'Inbox', specialUse: '\\Inbox', maildir: '' },
  { name: 'Sent', display: 'Sent', specialUse: '\\Sent', maildir: '.Sent' },
  { name: 'Spam', display: 'Spam', specialUse: '\\Junk', maildir: '.Junk' },
  { name: 'Trash', display: 'Trash', specialUse: '\\Trash', maildir: '.Trash' },
];

function execCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(stdout.trim() || err.message));
      resolve(stdout.trim());
    });
  });
}

function parsePasswd(text) {
  return text.split('\n').filter(l => l.trim()).map(line => {
    const parts = line.split(':');
    return {
      username: parts[0],
      uid: parseInt(parts[2], 10),
      gid: parseInt(parts[3], 10),
      gecos: parts[4],
      home: parts[5],
      shell: parts[6],
    };
  });
}

function sanitizeUser(username) {
  return username.replace(/[^a-zA-Z0-9_.-]/g, '').toLowerCase();
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function getHomeDir(username) {
  const out = await execCmd("getent passwd " + username + " | cut -d: -f6");
  if (!out) throw new Error('User not found');
  return out.trim();
}

function ensureFolders(homeDir) {
  for (const f of KNOWN_FOLDERS) {
    if (!f.maildir) continue;
    const base = homeDir + '/Maildir' + f.maildir;
    for (const sub of ['cur', 'new', 'tmp']) {
      const p = base + '/' + sub;
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }
    try { fs.chmodSync(base, '0700'); } catch (e) {}
  }
}

function getMaildirPath(homeDir, folder) {
  const suffix = folderToMaildir(folder);
  return suffix ? homeDir + '/Maildir/' + suffix : homeDir + '/Maildir';
}

function listMessageFiles(basePath) {
  const files = [];
  for (const dir of ['new', 'cur']) {
    const dirPath = basePath + '/' + dir;
    try {
      for (const f of fs.readdirSync(dirPath)) {
        const fp = path.join(dirPath, f);
        const stat = fs.statSync(fp);
        if (stat.isFile()) files.push({ filename: f, dir, path: fp, mtime: stat.mtimeMs });
      }
    } catch (e) {}
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}

function parseFlags(filename) {
  const match = filename.match(/:2,([a-zA-Z]+)$/);
  if (!match) return { seen: false, flagged: false, replied: false, trashed: false };
  const flags = match[1];
  return {
    seen: flags.includes('S'),
    flagged: flags.includes('F'),
    replied: flags.includes('R'),
    trashed: flags.includes('T'),
  };
}

function countFolder(basePath) {
  let total = 0, unread = 0;
  try { unread = fs.readdirSync(basePath + '/new').filter(f => !f.startsWith('.')).length; } catch (e) {}
  try { total = unread + fs.readdirSync(basePath + '/cur').filter(f => !f.startsWith('.')).length; } catch (e) {}
  return { total, unread };
}

/* ─── Existing Endpoints ─── */

router.get('/domains', async (req, res) => {
  try {
    const domain = await execCmd("postconf -h mydomain 2>/dev/null | head -1 || hostname -f 2>/dev/null || echo 'localhost'");
    res.json([domain.trim()]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/create', async (req, res) => {
  try {
    const { username, domain, password, quota } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    const sanitized = username.replace(/[^a-zA-Z0-9_.-]/g, '').toLowerCase();
    if (!sanitized || sanitized.length < 2 || sanitized.length > 64) return res.status(400).json({ error: 'Invalid username (2-64 chars)' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const domainClean = (domain || '').trim().toLowerCase();
    if (!domainClean) return res.status(400).json({ error: 'Domain is required' });
    const existing = await execCmd('id ' + sanitized + ' 2>/dev/null && echo exists || echo notfound');
    if (existing === 'exists') return res.status(409).json({ error: 'User "' + sanitized + '" already exists' });

    const quotaMB = parseInt(quota, 10);
    const hasCustomQuota = quota && quota !== 'unlimited' && !isNaN(quotaMB) && quotaMB > 0;
    const homeDir = '/home/' + sanitized;
    const cmds = [
      'useradd -m -s /sbin/nologin -c "' + sanitized + ' email" ' + sanitized,
      "echo '" + sanitized + ':' + password.replace(/'/g, "'\\''") + "' | chpasswd",
      'mkdir -p ' + homeDir + '/Maildir/cur ' + homeDir + '/Maildir/new ' + homeDir + '/Maildir/tmp',
      'chown -R ' + sanitized + ':' + sanitized + ' ' + homeDir + '/Maildir',
      'chmod -R 700 ' + homeDir + '/Maildir',
    ];
    if (hasCustomQuota) {
      const quotaBytes = quotaMB * 1024 * 1024;
      cmds.push('echo "' + quotaBytes + 'S" > ' + homeDir + '/Maildir/maildirsize');
      cmds.push('chown ' + sanitized + ':' + sanitized + ' ' + homeDir + '/Maildir/maildirsize');
    }
    for (const cmd of cmds) await execCmd(cmd);
    ensureDovecotQuota();
    res.json({ success: true, email: sanitized + '@' + domainClean, username: sanitized, domain: domainClean, home: homeDir, quota: hasCustomQuota ? quotaMB : 'unlimited' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function ensureDovecotQuota() {
  const config = `# Auto-generated by NexusPanel - enables maildir quota
protocol imap { mail_plugins = $mail_plugins quota }
protocol pop3 { mail_plugins = $mail_plugins quota }
protocol lda { mail_plugins = $mail_plugins quota }
plugin { quota = maildir:User quota; quota_rule = *:storage=0S }
`;
  try {
    if (!fs.existsSync('/etc/dovecot/local.conf') || !fs.readFileSync('/etc/dovecot/local.conf', 'utf-8').includes('quota')) {
      fs.writeFileSync('/etc/dovecot/local.conf', config, 'utf-8');
      exec('dovecot reload 2>/dev/null || systemctl reload dovecot 2>/dev/null', () => {});
    }
  } catch (e) { console.error('Failed to configure Dovecot quota:', e.message); }
}

/* ─── Folders ─── */

router.get('/:username/folders', async (req, res) => {
  try {
    const username = sanitizeUser(req.params.username);
    if (!username) return res.status(400).json({ error: 'Invalid username' });
    const homeDir = await getHomeDir(username);
    ensureFolders(homeDir);
    const result = KNOWN_FOLDERS.map(f => {
      const base = getMaildirPath(homeDir, f.name);
      const { total, unread } = countFolder(base);
      return { name: f.name, display: f.display, specialUse: f.specialUse, total, unread };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Inbox / Folder Messages ─── */

router.get('/:username/inbox', async (req, res) => {
  try {
    const username = sanitizeUser(req.params.username);
    if (!username) return res.status(400).json({ error: 'Invalid username' });
    const homeDir = await getHomeDir(username);
    const folder = req.query.folder || 'INBOX';
    const basePath = getMaildirPath(homeDir, folder);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));
    if (!fs.existsSync(basePath)) return res.json({ messages: [], total: 0, page, limit, totalPages: 0 });

    const files = listMessageFiles(basePath);
    const total = files.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const pageFiles = files.slice(start, start + limit);

    const domain = await execCmd("postconf -h mydomain 2>/dev/null | head -1 || hostname -f 2>/dev/null || echo 'localhost'");
    const messages = [];

    for (const f of pageFiles) {
      try {
        const raw = fs.readFileSync(f.path, 'utf-8');
        const parsed = await simpleParser(raw);
        const textBody = parsed.text || (parsed.html ? parsed.html.replace(/<style[^>]*>[^<]*<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ') : '') || '';
        messages.push({
          id: f.filename,
          dir: f.dir,
          unread: f.dir === 'new',
          subject: parsed.subject || '(No Subject)',
          from: parsed.from ? { name: parsed.from.value?.[0]?.name || '', address: parsed.from.value?.[0]?.address || '' } : { name: '', address: '' },
          to: parsed.to ? { name: parsed.to.value?.[0]?.name || '', address: parsed.to.value?.[0]?.address || '' } : { name: '', address: '' },
          date: parsed.date ? parsed.date.toISOString() : null,
          snippet: textBody.replace(/\s+/g, ' ').trim().substring(0, 150),
          hasAttachments: !!(parsed.attachments && parsed.attachments.length > 0),
          attachmentCount: parsed.attachments ? parsed.attachments.length : 0,
          messageId: parsed.messageId || null,
        });
      } catch (parseErr) {
        messages.push({
          id: f.filename,
          dir: f.dir,
          unread: f.dir === 'new',
          subject: '(Parse Error)', from: { name: '', address: '' }, to: { name: '', address: '' },
          date: new Date(f.mtime).toISOString(), snippet: '', hasAttachments: false, attachmentCount: 0, messageId: null,
        });
      }
    }
    res.json({ messages, total, page, limit, totalPages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Single Message ─── */

router.get('/:username/message/:file', async (req, res) => {
  try {
    const username = sanitizeUser(req.params.username);
    const filename = (req.params.file || '').replace(/\.\./g, '').replace(/\//g, '');
    if (!username || !filename) return res.status(400).json({ error: 'Invalid params' });
    const homeDir = await getHomeDir(username);
    const folder = req.query.folder || 'INBOX';
    const basePath = getMaildirPath(homeDir, folder);

    let filePath = null;
    for (const dir of ['new', 'cur']) {
      const candidate = path.join(basePath, dir, filename);
      if (fs.existsSync(candidate)) { filePath = candidate; break; }
    }
    if (!filePath) return res.status(404).json({ error: 'Message not found' });

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = await simpleParser(raw);
    const result = {
      id: filename,
      dir: path.basename(path.dirname(filePath)),
      unread: path.basename(path.dirname(filePath)) === 'new',
      subject: parsed.subject || '(No Subject)',
      from: parsed.from ? { name: parsed.from.value?.[0]?.name || '', address: parsed.from.value?.[0]?.address || '' } : { name: '', address: '' },
      to: parsed.to ? { name: parsed.to.value?.[0]?.name || '', address: parsed.to.value?.[0]?.address || '' } : { name: '', address: '' },
      cc: parsed.cc ? { name: parsed.cc.value?.[0]?.name || '', address: parsed.cc.value?.[0]?.address || '' } : null,
      replyTo: parsed.replyTo ? { name: parsed.replyTo.value?.[0]?.name || '', address: parsed.replyTo.value?.[0]?.address || '' } : null,
      date: parsed.date ? parsed.date.toISOString() : null,
      messageId: parsed.messageId || null,
      inReplyTo: parsed.inReplyTo || null,
      references: parsed.references || null,
      textBody: parsed.text || null,
      htmlBody: parsed.html || null,
      attachments: (parsed.attachments || []).map(a => ({
        filename: a.filename || 'unnamed',
        contentType: a.contentType || 'application/octet-stream',
        size: a.size || a.content?.length || 0,
        contentId: a.contentId || null,
        content: a.content ? a.content.toString('base64') : null,
      })),
      headers: parsed.headers instanceof Map ? Object.fromEntries(parsed.headers) : {},
    };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Send Mail ─── */

router.post('/:username/send', async (req, res) => {
  try {
    const username = sanitizeUser(req.params.username);
    if (!username) return res.status(400).json({ error: 'Invalid username' });
    const homeDir = await getHomeDir(username);
    const domain = await execCmd("postconf -h mydomain 2>/dev/null | head -1 || hostname -f 2>/dev/null || echo 'localhost'");

    const { to, cc, bcc, subject, body, attachments } = req.body;
    if (!to || !subject) return res.status(400).json({ error: 'To and Subject are required' });

    const fromAddr = username + '@' + domain.trim();
    const messageId = '<' + Date.now() + '.' + crypto.randomBytes(8).toString('hex') + '@' + domain.trim() + '>';
    const dateStr = new Date().toUTCString();

    const boundary = '=' + crypto.randomBytes(16).toString('hex');
    const hasAttachments = attachments && attachments.length > 0;

    let mimeBody = '';
    if (hasAttachments) {
      mimeBody = '--' + boundary + '\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n' + (body || '') + '\r\n';
      for (const att of attachments) {
        const attFilename = att.filename || 'unnamed';
        const attType = att.contentType || 'application/octet-stream';
        mimeBody += '--' + boundary + '\r\nContent-Type: ' + attType + '; name="' + attFilename.replace(/"/g, '\\"') + '"\r\nContent-Disposition: attachment; filename="' + attFilename.replace(/"/g, '\\"') + '"\r\nContent-Transfer-Encoding: base64\r\n\r\n';
        const content = att.content || '';
        for (let i = 0; i < content.length; i += 76) mimeBody += content.substring(i, i + 76) + '\r\n';
        mimeBody += '\r\n';
      }
      mimeBody += '--' + boundary + '--\r\n';
    }

    let headers = 'From: ' + fromAddr + '\r\nTo: ' + to + '\r\n';
    if (cc) headers += 'CC: ' + cc + '\r\n';
    if (bcc) headers += 'BCC: ' + bcc + '\r\n';
    headers += 'Subject: ' + subject + '\r\nDate: ' + dateStr + '\r\nMessage-ID: ' + messageId + '\r\nMIME-Version: 1.0\r\n';
    if (hasAttachments) {
      headers += 'Content-Type: multipart/mixed; boundary="' + boundary + '"\r\n';
    } else {
      headers += 'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n';
    }
    headers += '\r\n';

    const fullMessage = headers + (hasAttachments ? mimeBody : (body || ''));

    await new Promise((resolve, reject) => {
      const proc = require('child_process').spawn('/usr/sbin/sendmail', ['-t', '-i'], { stdio: ['pipe', 'ignore', 'ignore'] });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('sendmail exited with code ' + code));
      });
      proc.stdin.write(fullMessage);
      proc.stdin.end();
    });

    const sentDir = homeDir + '/Maildir/.Sent';
    for (const sub of ['cur', 'new', 'tmp']) {
      const p = sentDir + '/' + sub;
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }
    try { fs.chmodSync(sentDir, '0700'); } catch (e) {}
    const sentFilename = Date.now() + '.V' + process.pid + 'I' + Math.random().toString(36).substring(2, 8) + '.' + domain.trim() + ':2,S';
    fs.writeFileSync(sentDir + '/cur/' + sentFilename, fullMessage, 'utf-8');

    res.json({ success: true, messageId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Move Message ─── */

router.post('/:username/move', async (req, res) => {
  try {
    const username = sanitizeUser(req.params.username);
    if (!username) return res.status(400).json({ error: 'Invalid username' });
    const homeDir = await getHomeDir(username);
    const { messageId, fromFolder, toFolder } = req.body;
    if (!messageId || !toFolder) return res.status(400).json({ error: 'messageId and toFolder are required' });

    const fromBase = getMaildirPath(homeDir, fromFolder || 'INBOX');
    const toBase = getMaildirPath(homeDir, toFolder);

    let sourcePath = null;
    let sourceDir = '';
    for (const dir of ['new', 'cur']) {
      const candidate = path.join(fromBase, dir, messageId);
      if (fs.existsSync(candidate)) { sourcePath = candidate; sourceDir = dir; break; }
    }
    if (!sourcePath) return res.status(404).json({ error: 'Message not found' });

    for (const sub of ['cur', 'new', 'tmp']) {
      const p = toBase + '/' + sub;
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }
    try { fs.chmodSync(toBase, '0700'); } catch (e) {}

    let destName = messageId;
    if (!destName.includes(':2,')) destName += ':2,S';
    const destPath = path.join(toBase, 'cur', destName);
    fs.renameSync(sourcePath, destPath);

    res.json({ success: true, movedTo: toFolder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Delete Message ─── */

router.post('/:username/delete', async (req, res) => {
  try {
    const username = sanitizeUser(req.params.username);
    if (!username) return res.status(400).json({ error: 'Invalid username' });
    const homeDir = await getHomeDir(username);
    const { messageId, folder } = req.body;
    if (!messageId) return res.status(400).json({ error: 'messageId is required' });

    const fromBase = getMaildirPath(homeDir, folder || 'INBOX');
    let sourcePath = null;
    for (const dir of ['new', 'cur']) {
      const candidate = path.join(fromBase, dir, messageId);
      if (fs.existsSync(candidate)) { sourcePath = candidate; break; }
    }
    if (!sourcePath) return res.status(404).json({ error: 'Message not found' });

    const trashBase = homeDir + '/Maildir/.Trash';
    for (const sub of ['cur', 'new', 'tmp']) {
      const p = trashBase + '/' + sub;
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }
    try { fs.chmodSync(trashBase, '0700'); } catch (e) {}

    let destName = path.basename(sourcePath);
    if (!destName.includes(':2,')) destName += ':2,ST';
    fs.renameSync(sourcePath, path.join(trashBase, 'cur', destName));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Quota ─── */

router.get('/:username/quota', async (req, res) => {
  try {
    const username = sanitizeUser(req.params.username);
    if (!username) return res.status(400).json({ error: 'Invalid username' });
    const homeDir = await getHomeDir(username);
    const maildir = homeDir + '/Maildir';

    let usedBytes = 0;
    try {
      const raw = await execCmd('du -sb ' + maildir + ' 2>/dev/null | cut -f1');
      usedBytes = parseInt(raw, 10) || 0;
    } catch (e) { usedBytes = 0; }

    let limitBytes = null;
    const qf = maildir + '/maildirsize';
    if (fs.existsSync(qf)) {
      try {
        const firstLine = fs.readFileSync(qf, 'utf-8').split('\n')[0].trim();
        const match = firstLine.match(/^(\d+)S/);
        if (match) limitBytes = parseInt(match[1], 10);
      } catch (e) {}
    }

    res.json({
      used: usedBytes,
      usedFormatted: formatBytes(usedBytes),
      limit: limitBytes,
      limitFormatted: limitBytes ? formatBytes(limitBytes) : null,
      percentage: limitBytes && limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── List Accounts ─── */

router.get('/list', async (req, res) => {
  try {
    const domain = await execCmd("postconf -h mydomain 2>/dev/null | head -1 || hostname -f 2>/dev/null || echo 'localhost'");
    const passwdRaw = await execCmd("getent passwd");
    const allUsers = parsePasswd(passwdRaw);
    const emailUsers = allUsers.filter(u => u.uid >= 1000 && u.username !== 'nobody');
    const accounts = [];

    for (const u of emailUsers) {
      const email = u.username + '@' + domain.trim();
      let hasMaildir = false, messageCount = 0, folderCount = 0, diskUsage = null, diskUsageBytes = 0;
      const maildirPath = u.home + '/Maildir';
      try {
        const statRaw = await execCmd('test -d ' + maildirPath.replace(/ /g, '\\ ') + ' && echo exists || echo no');
        hasMaildir = statRaw === 'exists';
      } catch { hasMaildir = false; }
      if (hasMaildir) {
        try { messageCount = parseInt(await execCmd("find " + maildirPath + " -type f 2>/dev/null | wc -l"), 10) || 0; } catch { messageCount = 0; }
        try { folderCount = parseInt(await execCmd("find " + maildirPath + " -type d 2>/dev/null | wc -l"), 10) || 0; } catch { folderCount = 0; }
        try { diskUsageBytes = parseInt(await execCmd("du -sb " + maildirPath + " 2>/dev/null | cut -f1"), 10) || 0; diskUsage = formatBytes(diskUsageBytes); } catch { diskUsage = '0 B'; }
      }
      const canLogin = !u.shell || (!u.shell.includes('/sbin/nologin') && !u.shell.includes('/bin/false'));
      accounts.push({
        username: u.username, email, domain: domain.trim(), home: u.home, hasMaildir,
        messageCount, folderCount, diskUsage, diskUsageBytes, canLogin, shell: u.shell, name: u.gecos || u.username,
      });
    }
    accounts.sort((a, b) => {
      if (a.hasMaildir !== b.hasMaildir) return a.hasMaildir ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
