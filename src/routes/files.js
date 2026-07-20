const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const fm = require('../services/filemanager');

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
    const result = await fm.listDirectory(dirPath);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/read', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path required' });
    const result = await fm.readFile(filePath);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/create', async (req, res) => {
  try {
    const { parentPath, name, type, content } = req.body;
    if (!parentPath || !name || !type) return res.status(400).json({ error: 'parentPath, name, type required' });
    const result = await fm.createEntry(parentPath, name, type, content);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/rename', async (req, res) => {
  try {
    const { path: filePath, newName } = req.body;
    if (!filePath || !newName) return res.status(400).json({ error: 'path and newName required' });
    const result = await fm.renameEntry(filePath, newName);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/delete', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Path required' });
    await fm.deleteEntry(filePath);
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
          const targetPath = path.join(fm.safeResolve(destPath), file.originalname);
          await fs.promises.copyFile(file.path, targetPath);
          await fs.promises.unlink(file.path);
          uploaded.push({ name: file.originalname, size: file.size, path: targetPath });
        }
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
    const safePath = fm.safeResolve(filePath);
    if (!fs.existsSync(safePath)) return res.status(404).json({ error: 'File not found' });
    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) return res.status(400).json({ error: 'Cannot download a directory' });
    const name = path.basename(safePath);
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
    const result = await fm.copyEntry(source, destination);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/move', async (req, res) => {
  try {
    const { source, destination } = req.body;
    if (!source || !destination) return res.status(400).json({ error: 'source and destination required' });
    const result = await fm.moveEntry(source, destination);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/copyto', async (req, res) => {
  try {
    const { source, destination, overwrite } = req.body;
    if (!source || !destination) return res.status(400).json({ error: 'source and destination required' });
    const result = await fm.copyEntryWithOverwrite(source, destination, overwrite || false);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/moveto', async (req, res) => {
  try {
    const { source, destination, overwrite } = req.body;
    if (!source || !destination) return res.status(400).json({ error: 'source and destination required' });
    const result = await fm.moveEntryWithOverwrite(source, destination, overwrite || false);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/duplicate', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Path required' });
    const result = await fm.duplicateEntry(filePath);
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
    const results = await fm.searchFiles(rootPath, query, include, exclude);
    res.json({ results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/archive', async (req, res) => {
  try {
    const { paths, destination, format } = req.body;
    if (!paths || !paths.length || !destination) return res.status(400).json({ error: 'paths and destination required' });
    const result = await fm.createArchive(paths, destination, format || 'zip');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/extract', async (req, res) => {
  try {
    const { archive: archivePath, destination } = req.body;
    if (!archivePath || !destination) return res.status(400).json({ error: 'archive and destination required' });
    const result = await fm.extractArchive(archivePath, destination);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/permissions', async (req, res) => {
  try {
    const { path: filePath, mode } = req.body;
    if (!filePath || !mode) return res.status(400).json({ error: 'path and mode required' });
    const result = await fm.changePermissions(filePath, mode);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/details', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path required' });
    const result = await fm.getDetails(filePath);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/preview', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path required' });
    const safePath = fm.safeResolve(filePath);
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


router.get('/git/status', (req, res) => {
  try { const stat = fm.gitStatus(req.query.path || '/'); res.json(stat || { isRepo: false }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/git/stage', (req, res) => {
  try { fm.gitStage(req.body.path, req.body.file); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/git/unstage', (req, res) => {
  try { fm.gitUnstage(req.body.path, req.body.file); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/git/commit', (req, res) => {
  try { const out = fm.gitCommit(req.body.path, req.body.message); res.json({ ok: true, output: out }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/git/push', (req, res) => {
  try { fm.gitPush(req.body.path); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/git/pull', (req, res) => {
  try { fm.gitPull(req.body.path); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/git/log', (req, res) => {
  try { res.json({ log: fm.gitLog(req.query.path || '/', parseInt(req.query.n) || 10) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
module.exports = router;
