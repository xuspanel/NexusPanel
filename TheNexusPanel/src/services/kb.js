const fs = require('fs');
const path = require('path');

const KB_DIR = path.join(__dirname, '..', '..', 'data', 'kb');

function getCategories() {
  try {
    return fs.readdirSync(KB_DIR, { withFileTypes: true })
      .filter(function(e) { return e.isDirectory(); })
      .map(function(e) {
        var articles = getArticles(e.name);
        return { slug: e.name, name: e.name.replace(/-/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); }), count: articles.length };
      });
  } catch { return []; }
}

function getArticles(category) {
  try {
    return fs.readdirSync(path.join(KB_DIR, category))
      .filter(function(f) { return f.endsWith('.md'); })
      .map(function(f) {
        var content = fs.readFileSync(path.join(KB_DIR, category, f), 'utf8');
        var i = content.indexOf('---', 3);
        var fmStr = content.substring(3, i).trim();
        var fm = {};
        fmStr.split('\n').forEach(function(line) {
          var m = line.match(/^(\w+):\s*(.+)/);
          if (m) fm[m[1]] = m[2].trim().replace(/"/g, '');
        });
        fm.slug = f.replace('.md', '');
        fm.body = content.substring(i + 4).trim();
        return fm;
      })
      .sort(function(a, b) { return (a.order || 99) - (b.order || 99); });
  } catch { return []; }
}

function getArticle(category, slug) {
  try {
    var f = path.join(KB_DIR, category, slug + '.md');
    if (!fs.existsSync(f)) return null;
    var content = fs.readFileSync(f, 'utf8');
    var i = content.indexOf('---', 3);
    var fmStr = content.substring(3, i).trim();
    var fm = {};
    fmStr.split('\n').forEach(function(line) {
      var m = line.match(/^(\w+):\s*(.+)/);
      if (m) fm[m[1]] = m[2].trim().replace(/"/g, '');
    });
    fm.slug = slug;
    fm.category = category;
    fm.body = content.substring(i + 4).trim();
    return fm;
  } catch { return null; }
}

function searchArticles(query) {
  if (!query || query.length < 2) return [];
  var q = query.toLowerCase();
  var results = [];
  var cats = getCategories();
  cats.forEach(function(c) {
    var articles = getArticles(c.slug);
    articles.forEach(function(a) {
      var score = 0;
      var title = (a.title || '').toLowerCase();
      var body = (a.body || '').toLowerCase();
      if (title === q) score = 100;
      else if (title.startsWith(q)) score = 80;
      else if (title.includes(q)) score = 50;
      else if (body.includes(q)) score = 20;
      if (score > 0) {
        results.push({
          title: a.title || c.name,
          slug: a.slug,
          category: c.slug,
          categoryName: c.name,
          excerpt: (body.substring(0, 200) + '...'),
          score: score
        });
      }
    });
  });
  results.sort(function(a, b) { return b.score - a.score; });
  return results;
}

module.exports = { getCategories, getArticles, getArticle, searchArticles };
