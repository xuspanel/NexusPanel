const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const router = express.Router();

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
    blog.createPost(req.body.slug, req.body.title, req.body.date, req.body.body, req.body.excerpt, req.body.tags);
    res.redirect('/blog/' + req.body.slug);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/blog/:slug/delete', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  var blog = require('../services/blog');
  blog.deletePost(req.params.slug);
  res.redirect('/blog');
});

router.get('/kb', (req, res) => {
  var kb = require('../services/kb');
  var cats = kb.getCategories();
  res.render('kb/index', { user: req.user, title: 'Knowledge Base — NexusPanel', page: 'kb', kbCategories: cats, kbSearch: req.query.search || '' });
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
