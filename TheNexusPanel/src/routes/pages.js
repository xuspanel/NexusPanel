const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const router = express.Router();

router.get('/admin', (req, res) => { res.render('admin', { user: req.user, title: 'Admin — NexusPanel', page: 'admin' }); });

router.get('/', (req, res) => res.render('home', { user: req.user, title: 'NexusPanel — VPS Control Center', page: 'home' }));
router.get('/login', (req, res) => res.render('login', { user: req.user, title: 'Login — NexusPanel', page: 'login' }));
router.get('/register', (req, res) => res.render('register', { user: req.user, title: 'Register — NexusPanel', page: 'register' }));
router.get('/profile', (req, res) => res.render('profile', { user: req.user, title: 'Profile — NexusPanel', page: 'profile' }));
router.get('/orders', (req, res) => res.render('orders', { user: req.user, title: 'Orders — NexusPanel', page: 'orders' }));
router.get('/licenses', (req, res) => res.render('licenses', { user: req.user, title: 'My Licenses — NexusPanel', page: 'licenses' }));
router.get('/pricing', (req, res) => res.render('pricing', { user: req.user, title: 'Pricing — NexusPanel', page: 'pricing' }));
router.get('/cart', (req, res) => res.render('cart', { user: req.user, title: 'Cart — NexusPanel', page: 'cart' }));
router.get('/checkout', (req, res) => res.render('checkout', { user: req.user, title: 'Checkout — NexusPanel', page: 'checkout' }));
router.get('/contact', (req, res) => res.render('contact', { user: req.user, title: 'Contact — NexusPanel', page: 'contact' }));
router.get('/docs', (req, res) => res.render('docs/index', { user: req.user, title: 'Documentation — NexusPanel', page: 'docs' }));
router.get('/docs/:section', (req, res) => {
  const section = req.params.section;
  const titles = {
    installation: 'Installation Guide', dashboard: 'Dashboard', 'file-manager': 'File Manager',
    terminal: 'Terminal', databases: 'Databases', emails: 'Emails', docker: 'Docker',
    ftp: 'FTP', domains: 'Domains', backups: 'Backups', 'virus-scanner': 'Virus Scanner',
    'mime-types': 'MIME Types', 'service-manager': 'Service Manager', 'process-manager': 'Process Manager',
    'log-viewer': 'Log Viewer', 'cron-jobs': 'Cron Jobs', firewall: 'Firewall',
    'ssl-certificates': 'SSL Certificates', 'php-fpm': 'PHP-FPM', updates: 'System Updates',
    'api-reference': 'API Reference', 'maintenance': 'Maintenance Scripts',
  };
  res.render('docs/' + section, { user: req.user, title: (titles[section] || section) + ' — Docs', page: 'docs' });
});
router.get('/policies/:policy', (req, res) => {
  res.render('policies/' + req.params.policy, { user: req.user, title: req.params.policy.charAt(0).toUpperCase() + req.params.policy.slice(1) + ' — NexusPanel', page: 'policies' });
});

module.exports = router;

router.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!email || !message) return res.status(400).json({ error: 'Email and message required' });

  const contactSubject = subject || 'New Contact Form Submission';
  const namePart = name || email;

  const body = [
    'From: ' + namePart + ' <' + email + '>',
    'Reply-To: ' + email,
    'Subject: [NexusPanel Contact] ' + contactSubject,
    'To: nxp@s2u.me',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Name: ' + (name || 'Not provided'),
    'Email: ' + email,
    'Subject: ' + contactSubject,
    '',
    'Message:',
    message,
    '',
    '---',
    'Sent from NexusPanel website contact form',
    'IP: ' + (req.ip || req.connection?.remoteAddress || 'unknown'),
    'Date: ' + new Date().toISOString(),
  ].join('\n');

  try {
    execSync('sendmail -t -oi', { input: body, encoding: 'utf8', timeout: 10000 });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Contact] sendmail error:', err.message);
    // Fallback: log to file so no message is lost
    try {
      const logDir = path.join(__dirname, '..', '..', 'data');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, 'contacts.log'), body + '\n\n=====\n\n');
    } catch {}
    res.status(500).json({ error: 'Failed to send message. It has been logged and will be reviewed.' });
  }
});

router.post('/api/validate-key', async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'key is required' });
  try {
    const apiUrl = process.env.NXL_LICENSE_API || 'http://127.0.0.1:3444';
    const resp = await fetch(apiUrl + '/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ valid: false, reason: 'server_error', error: 'Could not reach license server' });
  }
});

router.get('/blog', (req, res) => {
  var blog = require('../services/blog');
  var posts = blog.listPosts();
  var tagFilter = (req.query.tag || '').toLowerCase();
  var filtered = tagFilter ? posts.filter(function(p) { return (p.tags || []).some(function(t) { return t.toLowerCase() === tagFilter; }); }) : posts;
  res.render('blog/index', { user: req.user, title: 'Blog — NexusPanel', page: 'blog', posts: filtered, tag: req.query.tag });
});
router.get('/blog/new', (req, res) => res.render('blog/new', { user: req.user, title: 'New Post — NexusPanel', page: 'blog' }));
router.get('/blog/:slug', (req, res) => {
  var blog = require('../services/blog');
  var post = blog.getPost(req.params.slug);
  if (!post) return res.redirect('/blog');
  res.render('blog/post', { user: req.user, title: post.title + ' — Blog', page: 'blog', post: post, slug: req.params.slug });
});
router.post('/api/blog', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    var blog = require('../services/blog');
    var { slug, title, date, body, excerpt, tags } = req.body;
    if (!slug || !title || !date) return res.status(400).json({ error: 'Slug, title and date required' });
    blog.createPost(slug, title, date, body || '', excerpt || '', tags || '');
    res.json({ ok: true, slug: slug });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/blog/:slug/delete', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  var blog = require('../services/blog');
  blog.deletePost(req.params.slug);
  res.redirect('/blog');
});

router.get('/api/kb-search', (req, res) => {
  var kb = require('../services/kb');
  var q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ results: [] });
  var results = kb.searchArticles(q);
  res.json({ results: results });
});

router.get('/kb', (req, res) => {
  var kb = require('../services/kb');
  var cats = kb.getCategories();
  var search = req.query.search || '';
  var results = search ? kb.searchArticles(search) : [];
  res.render('kb/index', { user: req.user, title: 'Knowledge Base — NexusPanel', page: 'kb', kbCategories: cats, kbSearch: search, kbResults: results });
});
router.get('/kb/:category', (req, res) => {
  var kb = require('../services/kb');
  var cats = kb.getCategories();
  var articles = kb.getArticles(req.params.category);
  res.render('kb/index', { user: req.user, title: 'Knowledge Base — NexusPanel', page: 'kb', kbCategories: cats, kbCategory: req.params.category, kbArticles: articles });
});
router.get('/kb/:category/:slug', (req, res) => {
  var kb = require('../services/kb');
  var article = kb.getArticle(req.params.category, req.params.slug);
  if (!article) return res.redirect('/kb');
  res.render('kb/index', { user: req.user, title: article.title + ' — Knowledge Base', page: 'kb', kbArticle: article });
});

/* ─── Admin API ─── */

router.get('/api/admin/blog', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  var blog = require('../services/blog');
  res.json({ posts: blog.listPosts() });
});

router.delete('/api/admin/blog/:slug', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  var blog = require('../services/blog');
  blog.deletePost(req.params.slug);
  res.json({ ok: true });
});

router.get('/api/admin/kb', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  var kb = require('../services/kb');
  var cats = kb.getCategories().map(function(c) {
    var articles = kb.getArticles(c.slug).map(function(a) { return { slug: a.slug, title: a.title || a.slug, body: a.body }; });
    return { slug: c.slug, name: c.name, articles: articles };
  });
  res.json({ categories: cats });
});

router.post('/api/admin/kb/category', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  var kb = require('../services/kb');
  var slug = (req.body.name || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!slug) return res.status(400).json({ error: 'Invalid category name' });
  var catDir = path.join(kb.KB_DIR, slug);
  try {
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
    res.json({ ok: true, slug: slug });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/admin/kb', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  var { category, slug, title, body } = req.body;
  if (!category || !slug || !title) return res.status(400).json({ error: 'Category, slug and title required' });
  var catDir = path.join(require('../services/kb').KB_DIR || path.join(__dirname, '..', '..', 'data', 'kb'), category);
  try {
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
    var content = '---\ntitle: "' + title + '"\norder: 99\n---\n\n' + (body || '');
    fs.writeFileSync(path.join(catDir, slug + '.md'), content);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/api/admin/kb', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  var { slug, newSlug, category, title, body } = req.body;
  if (!slug || !category) return res.status(400).json({ error: 'Missing parameters' });
  var kb = require('../services/kb');
  var catDir = path.join(kb.KB_DIR || path.join(__dirname, '..', '..', 'data', 'kb'), category);
  var filePath = path.join(catDir, slug + '.md');
  try {
    var existing = '';
    if (fs.existsSync(filePath)) existing = fs.readFileSync(filePath, 'utf8');
    var i = existing.indexOf('---', 3); var fmBody = (i !== -1) ? existing.substring(i + 4).trim() : (body || '');
    var content = '---\ntitle: "' + (title || slug) + '"\norder: 99\n---\n\n' + (body || fmBody);
    if (newSlug && newSlug !== slug) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      fs.writeFileSync(path.join(catDir, newSlug + '.md'), content);
    } else {
      fs.writeFileSync(filePath, content);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/admin/kb/:category/:slug', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  var kb = require('../services/kb');
  var catDir = path.join(kb.KB_DIR || path.join(__dirname, '..', '..', 'data', 'kb'), req.params.category);
  var filePath = path.join(catDir, req.params.slug + '.md');
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
