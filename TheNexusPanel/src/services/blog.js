const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, '..', '..', 'data', 'blog');

function parseFrontmatter(content) {
  var fm = {};
  if (content.startsWith('---')) {
    var end = content.indexOf('---', 3);
    if (end !== -1) {
      var fmStr = content.substring(3, end);
      fmStr.split('\n').forEach(function (line) {
        var m = line.match(/^(\w+):\s*(.+)$/);
        if (m) {
          var val = m[2].trim();
          if (val.startsWith('[') && val.endsWith(']')) {
            fm[m[1]] = val.slice(1, -1).split(',').map(function(s) { return s.trim().replace(/"/g, ''); });
          } else {
            fm[m[1]] = val.replace(/"/g, '');
          }
        }
      });
      fm.body = content.substring(end + 4).trim();
    }
  }
  return fm;
}

function listPosts() {
  try {
    return fs.readdirSync(BLOG_DIR)
      .filter(function(f) { return f.endsWith('.md'); })
      .map(function(f) {
        var content = fs.readFileSync(path.join(BLOG_DIR, f), 'utf8');
        var fm = parseFrontmatter(content);
        fm.slug = f.replace('.md', '');
        return fm;
      })
      .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  } catch { return []; }
}

function getPost(slug) {
  try {
    var f = fs.readdirSync(BLOG_DIR).find(function(f) { return f === slug + '.md'; });
    if (!f) return null;
    var content = fs.readFileSync(path.join(BLOG_DIR, f), 'utf8');
    var fm = parseFrontmatter(content);
    fm.slug = slug;
    return fm;
  } catch { return null; }
}

function createPost(slug, title, date, body, excerpt, tags) {
  var frontmatter = ['---', 'title: "' + title + '"', 'date: ' + date, 'excerpt: "' + (excerpt || '') + '"', 'author: NexusPanel Team'];
  if (tags) frontmatter.push('tags: [' + tags.split(',').map(function(t) { return '"' + t.trim() + '"'; }).join(',') + ']');
  frontmatter.push('---', '', body);
  fs.writeFileSync(path.join(BLOG_DIR, slug + '.md'), frontmatter.join('\n'));
}

function deletePost(slug) {
  var f = path.join(BLOG_DIR, slug + '.md');
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

module.exports = { listPosts, getPost, createPost, deletePost };
