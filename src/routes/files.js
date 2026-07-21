const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const fm = require('../services/filemanager');
const audit = require('../services/audit');

const router = express.Router();
router.use(authMiddleware);
router.use(adminOnly);

const upload = multer({
  dest: '/tmp/nexus-uploads',
  limits: { fileSize: 500 * 1024 * 1024 },
});

fs.mkdirSync('/tmp/nexus-uploads', { recursive: true });

router.get('/list', async (req, res) => {
  try {
    const dirPath = req.query.path || '/';
    const result = await fm.listDirectory(dirPath, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/read', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path required' });
    const result = await fm.readFile(filePath, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/create', async (req, res) => {
  try {
    const { parentPath, name, type, content } = req.body;
    if (!parentPath || !name || !type) return res.status(400).json({ error: 'parentPath, name, type required' });
    const result = await fm.createEntry(parentPath, name, type, content, req.user);
    audit.log('file.create', req, { parentPath, name, type });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/rename', async (req, res) => {
  try {
    const { path: filePath, newName } = req.body;
    if (!filePath || !newName) return res.status(400).json({ error: 'path and newName required' });
    const result = await fm.renameEntry(filePath, newName, req.user);
    audit.log('file.rename', req, { from: filePath, to: newName });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/delete', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Path required' });
    await fm.deleteEntry(filePath, req.user);
    audit.log('file.delete', req, { path: filePath });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/upload', (req, res) => {
  upload.array('files', 50)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'File too large',
          message: 'Maximum file size is 500MB per file.',
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(413).json({
          error: 'Too many files',
          message: 'Maximum 50 files per upload.',
        });
      }
      return res.status(400).json({ error: err.message });
    }

    (async () => {
      try {
        const destPath = req.body.path || '/';
        const uploaded = [];
        for (const file of req.files) {
          const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
          const targetPath = path.join(fm.safeResolve(destPath, req.user), safeName);
          await fs.promises.copyFile(file.path, targetPath);
          await fs.promises.unlink(file.path);
          uploaded.push({ name: safeName, size: file.size, path: targetPath });
        }
        audit.log('file.upload', req, { path: destPath, count: req.files.length });
        res.json({ uploaded });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    })();
  });
});

router.get('/download', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path required' });
    const safePath = fm.safeResolve(filePath, req.user);
    if (!fs.existsSync(safePath)) return res.status(404).json({ error: 'File not found' });
    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) return res.status(400).json({ error: 'Cannot download a directory' });
    const name = path.basename(safePath).replace(/["\r\n]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Length', stat.size);
    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/copy', async (req, res) => {
  try {
    const { source, destination } = req.body;
    if (!source || !destination) return res.status(400).json({ error: 'source and destination required' });
    const result = await fm.copyEntry(source, destination, req.user);
    audit.log('file.copy', req, { source, destination });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/move', async (req, res) => {
  try {
    const { source, destination } = req.body;
    if (!source || !destination) return res.status(400).json({ error: 'source and destination required' });
    const result = await fm.moveEntry(source, destination, req.user);
    audit.log('file.move', req, { source, destination });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/copyto', async (req, res) => {
  try {
    const { source, destination, overwrite } = req.body;
    if (!source || !destination) return res.status(400).json({ error: 'source and destination required' });
    const result = await fm.copyEntryWithOverwrite(source, destination, overwrite || false, req.user);
    audit.log('file.copyto', req, { source, destination, overwrite });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/moveto', async (req, res) => {
  try {
    const { source, destination, overwrite } = req.body;
    if (!source || !destination) return res.status(400).json({ error: 'source and destination required' });
    const result = await fm.moveEntryWithOverwrite(source, destination, overwrite || false, req.user);
    audit.log('file.moveto', req, { source, destination, overwrite });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/duplicate', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Path required' });
    const result = await fm.duplicateEntry(filePath, req.user);
    audit.log('file.duplicate', req, { path: filePath });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const query = req.query.query;
    const rootPath = req.query.path || '/';
    if (!query) return res.json({ results: [] });
    const include = req.query.include ? req.query.include.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : null;
    const exclude = req.query.exclude ? req.query.exclude.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : null;
    const results = await fm.searchFiles(rootPath, query, include, exclude, req.user);
    res.json({ results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/archive', async (req, res) => {
  try {
    const { paths, destination, format } = req.body;
    if (!paths || !paths.length || !destination) return res.status(400).json({ error: 'paths and destination required' });
    const result = await fm.createArchive(paths, destination, format || 'zip', req.user);
    audit.log('file.archive', req, { paths, destination, format });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/extract', async (req, res) => {
  try {
    const { archive: archivePath, destination } = req.body;
    if (!archivePath || !destination) return res.status(400).json({ error: 'archive and destination required' });
    const result = await fm.extractArchive(archivePath, destination, req.user);
    audit.log('file.extract', req, { archive: archivePath, destination });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/permissions', async (req, res) => {
  try {
    const { path: filePath, mode } = req.body;
    if (!filePath || !mode) return res.status(400).json({ error: 'path and mode required' });
    const result = await fm.changePermissions(filePath, mode, req.user);
    audit.log('file.permissions', req, { path: filePath, mode });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/details', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path required' });
    const result = await fm.getDetails(filePath, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/preview', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path required' });
    const safePath = fm.safeResolve(filePath, req.user);
    if (!fs.existsSync(safePath)) return res.status(404).json({ error: 'File not found' });
    const ext = path.extname(safePath).toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];
    if (imageExts.includes(ext)) {
      const stat = fs.statSync(safePath);
      res.setHeader('Content-Type', `image/${ext.slice(1)}`);
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(safePath).pipe(res);
      return;
    }
    if (ext === '.pdf') {
      const stat = fs.statSync(safePath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(safePath).pipe(res);
      return;
    }
    const textContent = await fsp.readFile(safePath, 'utf-8');
    res.json({ content: textContent, type: 'text' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const fsp = require('fs/promises');

router.post('/diff', async (req, res) => {
  try {
    const { source, target } = req.body;
    if (!source || !target) return res.status(400).json({ error: 'source and target paths required' });
    const safeSource = fm.safeResolve(source, req.user);
    const safeTarget = fm.safeResolve(target, req.user);
    if (!fs.existsSync(safeSource)) return res.status(404).json({ error: 'Source file not found' });
    if (!fs.statSync(safeSource).isFile()) return res.status(400).json({ error: 'Source is not a file' });
    if (!fs.existsSync(safeTarget)) return res.status(404).json({ error: 'Target file not found' });
    if (!fs.statSync(safeTarget).isFile()) return res.status(400).json({ error: 'Target is not a file' });
    const MAX_DIFF_SIZE = 10 * 1024 * 1024;
    if (fs.statSync(safeSource).size > MAX_DIFF_SIZE || fs.statSync(safeTarget).size > MAX_DIFF_SIZE) {
      return res.status(400).json({ error: 'Files too large for diff (max 10MB each)' });
    }
    const [sourceContent, targetContent] = await Promise.all([
      fsp.readFile(safeSource, 'utf-8'),
      fsp.readFile(safeTarget, 'utf-8'),
    ]);
    audit.log('file.diff', req, { source, target });
    const sourceLines = sourceContent.split('\n');
    const targetLines = targetContent.split('\n');

    /* Basic LCS-based diff */
    const lcs = longestCommonSubsequence(sourceLines, targetLines);
    const hunks = buildHunks(sourceLines, targetLines, lcs);
    const name1 = path.basename(safeSource);
    const name2 = path.basename(safeTarget);

    res.json({ source: name1, target: name2, hunks });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function longestCommonSubsequence(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { result.unshift({ si: i - 1, ti: j - 1 }); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return result;
}

function buildHunks(sourceLines, targetLines, lcs) {
  const hunks = [];
  let si = 0, ti = 0, li = 0;
  while (si < sourceLines.length || ti < targetLines.length) {
    if (li < lcs.length && si === lcs[li].si && ti === lcs[li].ti) {
      /* add trailing equal lines */
      const block = { type: 'equal', lines: [] };
      while (li < lcs.length && si === lcs[li].si && ti === lcs[li].ti) {
        block.lines.push(sourceLines[si]);
        si++; ti++; li++;
      }
      if (block.lines.length) hunks.push(block);
    } else {
      /* collect removed and added lines */
      const removed = [];
      const added = [];
      while (li >= lcs.length || si < lcs[li].si) { removed.push(sourceLines[si]); si++; }
      while (li >= lcs.length || ti < lcs[li].ti) { added.push(targetLines[ti]); ti++; }
      if (removed.length && added.length) {
        hunks.push({ type: 'replace', removed, added });
      } else if (removed.length) {
        hunks.push({ type: 'remove', lines: removed });
      } else if (added.length) {
        hunks.push({ type: 'add', lines: added });
      }
    }
  }
  return hunks;
}

router.get('/git/status', (req, res) => {
  try { const stat = fm.gitStatus(req.query.path || '/', req.user); res.json(stat || { isRepo: false }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/git/stage', (req, res) => {
  try { fm.gitStage(req.body.path, req.body.file, req.user); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/git/unstage', (req, res) => {
  try { fm.gitUnstage(req.body.path, req.body.file, req.user); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/git/commit', (req, res) => {
  try { const out = fm.gitCommit(req.body.path, req.body.message, req.user); res.json({ ok: true, output: out }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/git/push', (req, res) => {
  try { fm.gitPush(req.body.path, req.user); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/git/pull', (req, res) => {
  try { fm.gitPull(req.body.path, req.user); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/git/log', (req, res) => {
  try { res.json({ log: fm.gitLog(req.query.path || '/', parseInt(req.query.n) || 10, req.user) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
module.exports = router;
