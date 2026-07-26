(function () {
  var SEARCH_DEBOUNCE = 300;

  var state = {
    files: [],
    categories: [],
    selected: null,
    content: '',
    lineCount: 0,
    compressed: false,
    filter: '',
    tailLines: 500,
    lineNumbers: false,
    wordWrap: true,
    followMode: false,
    regexMode: false,
    searchQuery: '',
    searchMatches: [],
    currentMatch: -1,
    viewMode: 'text',
    positions: {},
    _loading: false,
    _toastTimer: null,
    _eventSource: null,
  };

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '0B';
    if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + 'G';
    if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + 'M';
    if (bytes > 1024) return (bytes / 1024).toFixed(0) + 'K';
    return bytes + 'B';
  }

  function formatTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function showLoading() {
    var el = document.getElementById('logViewerContent');
    if (el) el.innerHTML = '<div class="log-loading"><div class="log-loading-row"></div><div class="log-loading-row short"></div><div class="log-loading-row"></div><div class="log-loading-row short"></div><div class="log-loading-row"></div></div>';
  }

  function showError(msg) {
    var el = document.getElementById('logViewerContent');
    if (el) el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(msg) + '</span><button class="db-btn db-btn-sm" data-action="retry" style="margin-left:12px">Retry</button></div>';
  }

  function showToast(msg, type) {
    var el = document.getElementById('logToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'log-toast ' + (type || 'info');
    el.style.display = 'block';
    if (state._toastTimer) clearTimeout(state._toastTimer);
    state._toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function renderStats() {
    var el = document.getElementById('logStats');
    if (!el) return;
    var totalSize = 0;
    state.files.forEach(function (f) { totalSize += f.size || 0; });
    var cats = {};
    state.files.forEach(function (f) { cats[f.category] = (cats[f.category] || 0) + 1; });
    el.innerHTML = '<span class="log-stat"><strong>' + state.files.length + '</strong> files</span>'
      + '<span class="log-stat-sep">|</span>'
      + '<span class="log-stat"><strong>' + formatSize(totalSize) + '</strong> total</span>'
      + (state.categories.length > 0 ? '<span class="log-stat-sep">|</span>'
        + state.categories.map(function (c) {
          return '<span class="log-stat">' + esc(c.icon) + ' <strong>' + c.count + '</strong></span>';
        }).join('<span class="log-stat-sep">|</span>') : '');
  }

  function renderSidebar() {
    var el = document.getElementById('logFileList');
    if (!el) return;
    var f = state.filter.toLowerCase();
    var cats = state.categories;
    if (f) {
      cats = cats.map(function (c) {
        var filtered = c.files.filter(function (file) {
          return file.name.toLowerCase().indexOf(f) !== -1 || file.path.toLowerCase().indexOf(f) !== -1;
        });
        return { id: c.id, label: c.label, icon: c.icon, count: filtered.length, files: filtered };
      }).filter(function (c) { return c.count > 0; });
    }
    el.innerHTML = cats.map(function (c) {
      var html = '<div class="log-category" data-category="' + c.id + '">'
        + '<div class="log-category-header" data-action="toggle-category" data-cat="' + c.id + '">'
        + '<span class="log-category-chevron">▼</span> '
        + esc(c.icon) + ' ' + esc(c.label)
        + ' <span class="log-category-badge">' + c.count + '</span>'
        + '</div>'
        + '<div class="log-category-body">';
      c.files.forEach(function (file) {
        var active = state.selected === file.path ? ' active' : '';
        html += '<div class="log-file-item' + active + '" data-action="open-file" data-file="' + esc(file.path) + '">'
          + '<span class="log-file-name">' + esc(file.name) + '</span>'
          + '<span class="log-file-meta">' + formatSize(file.size) + (file.isGzipped ? ' 📦' : '') + '</span>'
          + '</div>';
      });
      html += '</div></div>';
      return html;
    }).join('');
    if (cats.length === 0) {
      el.innerHTML = '<div class="log-empty">No files found' + (f ? ' matching "' + esc(f) + '"' : '') + '</div>';
    }
  }

  function renderInfoBar() {
    var el = document.getElementById('logInfoBar');
    if (!el) return;
    if (!state.selected) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    var f = state.files.find(function (f) { return f.path === state.selected; });
    var name = state.selected;
    var size = f ? formatSize(f.size) : '';
    var mod = f ? formatTime(f.modified) : '';
    var lc = state.lineCount || '?';
    var gz = state.compressed ? ' 📦 (compressed)' : '';
    el.innerHTML = '<span class="log-info-name" title="' + esc(state.selected) + '">' + esc(name) + gz + '</span>'
      + '<span class="log-info-sep">|</span>'
      + '<span class="log-info-detail">' + size + '</span>'
      + '<span class="log-info-sep">|</span>'
      + '<span class="log-info-detail">' + lc + ' lines</span>'
      + (mod ? '<span class="log-info-sep">|</span><span class="log-info-detail">' + esc(mod) + '</span>' : '');
  }

  function renderToolbar() {
    var tailEl = document.getElementById('logTailSelect');
    if (tailEl) tailEl.value = state.tailLines;
    var wrapBtn = document.getElementById('logWrapBtn');
    if (wrapBtn) wrapBtn.classList.toggle('active', state.wordWrap);
    var linesBtn = document.getElementById('logLinesBtn');
    if (linesBtn) linesBtn.classList.toggle('active', state.lineNumbers);
    var followBtn = document.getElementById('logFollowBtn');
    if (followBtn) followBtn.classList.toggle('active', state.followMode);
    var regexBtn = document.getElementById('logRegexBtn');
    if (regexBtn) regexBtn.classList.toggle('active', state.regexMode);
  }

  function renderSearchCount() {
    var el = document.getElementById('logSearchCount');
    if (!el) return;
    if (state.searchMatches.length > 0) {
      el.textContent = (state.currentMatch + 1) + '/' + state.searchMatches.length;
      el.style.display = 'inline';
    } else if (state.searchQuery) {
      el.textContent = '0 matches';
      el.style.display = 'inline';
    } else {
      el.style.display = 'none';
    }
  }

  function escapeRegexForHighlight(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightContent(content, query) {
    if (!query || !content) return esc(content);
    var escaped = esc(content);
    try {
      var pattern = state.regexMode ? query : escapeRegexForHighlight(query);
      var re = new RegExp('(' + pattern + ')', 'gi');
      var matchIndex = 0;
      var result = escaped.replace(re, function (match) {
        var cls = matchIndex === state.currentMatch ? 'log-highlight current' : 'log-highlight';
        matchIndex++;
        return '<mark class="' + cls + '" data-match="' + (matchIndex - 1) + '">' + match + '</mark>';
      });
      return result;
    } catch { return escaped; }
  }

  function renderContent() {
    var el = document.getElementById('logViewerContent');
    if (!el) return;
    if (!state.content && state.content !== '') { showLoading(); return; }
    if (!state.selected) { el.innerHTML = '<div class="log-placeholder">Select a log file from the sidebar to view its contents</div>'; return; }
    if (state.viewMode === 'table' && state.selected.indexOf('access.log') !== -1) {
      renderTableView(el);
      return;
    }
    var lines = state.content.split('\n');
    var hasHighlight = state.searchQuery && state.searchMatches.length > 0;
    if (state.lineNumbers) {
      var html = '<div class="log-content-wrap">';
      html += '<div class="log-gutter">';
      for (var i = 0; i < lines.length; i++) {
        html += '<div class="log-line-num">' + (i + 1) + '</div>';
      }
      html += '</div><div class="log-content">';
      if (hasHighlight) {
        html += highlightContent(state.content, state.searchQuery).split('\n').map(function (l) {
          return '<div class="log-content-line">' + l + '</div>';
        }).join('');
      } else {
        for (var j = 0; j < lines.length; j++) {
          html += '<div class="log-content-line">' + colorLine(esc(lines[j])) + '</div>';
        }
      }
      html += '</div></div>';
      el.innerHTML = html;
    } else {
      if (hasHighlight) {
        el.innerHTML = highlightContent(state.content, state.searchQuery).split('\n').map(function (l) {
          return '<div class="log-content-line">' + colorLine(l) + '</div>';
        }).join('');
      } else {
        el.innerHTML = lines.map(function (l) {
          return '<div class="log-content-line">' + colorLine(esc(l)) + '</div>';
        }).join('');
      }
    }
    if (state.followMode) {
      el.scrollTop = el.scrollHeight;
    }
  }

  function colorLine(line) {
    if (!line) return line;
    if (line.indexOf('[error]') !== -1 || line.indexOf(' ERROR ') !== -1 || line.indexOf(' Failed ') !== -1 || line.indexOf('failed') !== -1) {
      return '<span class="log-level-error">' + line + '</span>';
    }
    if (line.indexOf('[warn]') !== -1 || line.indexOf(' WARNING ') !== -1 || line.indexOf('warning') !== -1) {
      return '<span class="log-level-warn">' + line + '</span>';
    }
    if (line.indexOf('[notice]') !== -1 || line.indexOf(' OK ') !== -1 || line.indexOf('started') !== -1 || line.indexOf('loaded') !== -1 || line.indexOf('success') !== -1) {
      return '<span class="log-level-notice">' + line + '</span>';
    }
    return line;
  }

  function renderTableView(el) {
    var lines = state.content.split('\n').filter(Boolean);
    var re = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"/;
    var html = '<div class="log-table-view"><table class="log-table"><thead><tr>'
      + '<th>IP</th><th>Time</th><th>Method</th><th>URL</th><th>Status</th><th>Size</th><th>Referer</th>'
      + '</tr></thead><tbody>';
    lines.forEach(function (line) {
      var m = line.match(re);
      if (m) {
        var statusClass = 'log-status-' + m[5].charAt(0) + 'xx';
        html += '<tr>'
          + '<td class="log-table-ip">' + esc(m[1]) + '</td>'
          + '<td class="log-table-time">' + esc(m[2].replace(/\+\d+$/, '')) + '</td>'
          + '<td class="log-table-method">' + esc(m[3]) + '</td>'
          + '<td class="log-table-url" title="' + esc(line) + '">' + esc(m[4].substring(0, 60)) + '</td>'
          + '<td><span class="log-status-badge ' + statusClass + '">' + esc(m[5]) + '</span></td>'
          + '<td class="log-table-size">' + formatSize(parseInt(m[6]) || 0) + '</td>'
          + '<td class="log-table-ref" title="' + esc(m[7]) + '">' + esc(m[7].substring(0, 30)) + '</td>'
          + '</tr>';
      } else {
        html += '<tr><td colspan="7" class="log-table-raw">' + esc(line.substring(0, 120)) + '</td></tr>';
      }
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }

  function computeMatches() {
    state.searchMatches = [];
    state.currentMatch = -1;
    if (!state.searchQuery || !state.content) return;
    var lines = state.content.split('\n');
    var query = state.searchQuery;
    var isRegex = state.regexMode;
    var matcher;
    if (isRegex) {
      try { matcher = new RegExp(query, 'gi'); }
      catch { return; }
    }
    for (var i = 0; i < lines.length; i++) {
      if (isRegex) {
        matcher.lastIndex = 0;
        if (matcher.test(lines[i])) state.searchMatches.push(i);
      } else {
        if (lines[i].toLowerCase().indexOf(query.toLowerCase()) !== -1) state.searchMatches.push(i);
      }
    }
    if (state.searchMatches.length > 0) state.currentMatch = 0;
  }

  function scrollToMatch(idx) {
    var el = document.getElementById('logViewerContent');
    if (!el || state.searchMatches.length === 0) return;
    var lineEls = el.querySelectorAll('.log-highlight');
    if (lineEls.length === 0) return;
    var target = el.querySelector('.log-highlight[data-match="' + idx + '"]');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function startFollow() {
    stopFollow();
    if (!state.selected) return;
    var url = API.logs.stream(state.selected);
    state._eventSource = new EventSource(url);
    state._eventSource.onmessage = function (e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'init') {
          state.content = data.content;
          state.lineCount = (state.content.split('\n').length);
        } else if (data.type === 'data') {
          state.content += data.content;
          var newLines = data.content.split('\n').length;
          state.lineCount += newLines;
        }
        renderContent();
        renderInfoBar();
      } catch { }
    };
    state._eventSource.onerror = function () {
      stopFollow();
      showToast('Live tail connection lost', 'error');
    };
  }

  function stopFollow() {
    if (state._eventSource) {
      state._eventSource.close();
      state._eventSource = null;
    }
  }

  function restorePosition() {
    if (state.positions[state.selected] !== undefined) {
      var el = document.getElementById('logViewerContent');
      if (el) el.scrollTop = state.positions[state.selected];
    }
  }

  function savePosition() {
    var el = document.getElementById('logViewerContent');
    if (el && state.selected) {
      state.positions[state.selected] = el.scrollTop;
    }
  }

  function persistPositions() {
    try { sessionStorage.setItem('logPositions', JSON.stringify(state.positions)); } catch { }
  }

  function loadPositions() {
    try {
      var saved = sessionStorage.getItem('logPositions');
      if (saved) state.positions = JSON.parse(saved);
    } catch { }
  }

  async function loadCategories() {
    try {
      state.categories = await API.logs.categories();
      var allFiles = [];
      state.categories.forEach(function (c) { allFiles = allFiles.concat(c.files); });
      state.files = allFiles;
      renderStats();
      renderSidebar();
    } catch (e) {
      showToast('Failed to load log files: ' + (e.message || 'Unknown error'), 'error');
    }
  }

  async function openFile(filePath) {
    if (state.selected) savePosition();
    state.selected = filePath;
    state.content = '';
    state.lineCount = 0;
    state.compressed = false;
    state.searchQuery = '';
    state.searchMatches = [];
    state.currentMatch = -1;
    state.viewMode = 'text';
    var searchEl = document.getElementById('logSearchInput');
    if (searchEl) searchEl.value = '';
    renderSidebar();
    renderInfoBar();
    renderSearchCount();
    showLoading();
    try {
      var d = await API.logs.read(filePath, state.tailLines);
      state.content = d.content || '';
      state.lineCount = d.lineCount || state.content.split('\n').length;
      state.compressed = d.compressed || false;
      renderContent();
      renderInfoBar();
      renderToolbar();
      restorePosition();
    } catch (e) {
      showError(e.message || 'Failed to read log file');
    }
  }

  async function doSearch() {
    var q = document.getElementById('logSearchInput');
    var query = q ? q.value.trim() : '';
    state.searchQuery = query;
    state.searchMatches = [];
    state.currentMatch = -1;
    if (!query || !state.selected) {
      renderContent();
      renderSearchCount();
      return;
    }
    try {
      var d = await API.logs.search(state.selected, query, state.regexMode);
      state.content = d.content || '';
      state.lineCount = d.matches || 0;
      computeMatches();
      renderContent();
      renderSearchCount();
      renderInfoBar();
      if (d.matches === 0) showToast('No matches found', 'info');
    } catch (e) {
      showToast('Search failed: ' + (e.message || 'Invalid query'), 'error');
    }
  }

  function initView() {
    state.selected = null;
    state.content = '';
    state.filter = '';
    state.searchQuery = '';
    state.searchMatches = [];
    state.currentMatch = -1;
    state.viewMode = 'text';
    stopFollow();
    loadPositions();
    var searchEl = document.getElementById('logSearchInput');
    if (searchEl) searchEl.value = '';
    var filterEl = document.getElementById('logSidebarSearch');
    if (filterEl) filterEl.value = '';
    var el = document.getElementById('logViewerContent');
    if (el) el.innerHTML = '<div class="log-placeholder">Select a log file from the sidebar to view its contents</div>';
    var infoEl = document.getElementById('logInfoBar');
    if (infoEl) infoEl.style.display = 'none';
    renderSearchCount();
  }

  window.initLogs = async function () {
    initView();
    await loadCategories();
    renderToolbar();

    var filterEl = document.getElementById('logSidebarSearch');
    if (filterEl) {
      filterEl.addEventListener('input', function () {
        state.filter = this.value;
        renderSidebar();
      });
    }

    var searchInput = document.getElementById('logSearchInput');
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            if (state.searchMatches.length > 0) {
              state.currentMatch = (state.currentMatch - 1 + state.searchMatches.length) % state.searchMatches.length;
              renderSearchCount();
              scrollToMatch(state.currentMatch);
            }
          } else {
            doSearch();
          }
        }
      });
    }

    var viewerEl = document.getElementById('logViewerContent');
    if (viewerEl) {
      viewerEl.addEventListener('scroll', function () {
        if (state.selected) {
          state.positions[state.selected] = this.scrollTop;
        }
      });
    }
  };

  window.logCleanup = function () {
    stopFollow();
    persistPositions();
  };

  document.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var action = target.dataset.action;

    if (action === 'retry') {
      if (state.selected) openFile(state.selected);
      return;
    }

    if (action === 'open-file') {
      var file = target.dataset.file;
      if (file) openFile(file);
      return;
    }

    if (action === 'toggle-category') {
      var cat = target.closest('.log-category');
      if (cat) cat.classList.toggle('collapsed');
      return;
    }

    if (action === 'search') {
      doSearch();
      return;
    }

    if (action === 'toggle-regex') {
      state.regexMode = !state.regexMode;
      renderToolbar();
      if (state.searchQuery) doSearch();
      return;
    }

    if (action === 'prev-match') {
      if (state.searchMatches.length > 0) {
        state.currentMatch = (state.currentMatch - 1 + state.searchMatches.length) % state.searchMatches.length;
        renderSearchCount();
        scrollToMatch(state.currentMatch);
      }
      return;
    }

    if (action === 'next-match') {
      if (state.searchMatches.length > 0) {
        state.currentMatch = (state.currentMatch + 1) % state.searchMatches.length;
        renderSearchCount();
        scrollToMatch(state.currentMatch);
      }
      return;
    }

    if (action === 'toggle-wrap') {
      state.wordWrap = !state.wordWrap;
      var el = document.getElementById('logViewerContent');
      if (el) el.style.whiteSpace = state.wordWrap ? 'pre-wrap' : 'nowrap';
      renderToolbar();
      return;
    }

    if (action === 'toggle-lines') {
      state.lineNumbers = !state.lineNumbers;
      renderContent();
      renderToolbar();
      return;
    }

    if (action === 'toggle-follow') {
      state.followMode = !state.followMode;
      if (state.followMode) startFollow();
      else stopFollow();
      renderToolbar();
      return;
    }

    if (action === 'download') {
      if (state.selected) {
        var a = document.createElement('a');
        a.href = API.logs.download(state.selected);
        a.download = state.selected.split('/').pop();
        a.click();
      }
      return;
    }

    if (action === 'toggle-view') {
      state.viewMode = state.viewMode === 'text' ? 'table' : 'text';
      renderContent();
      renderToolbar();
      return;
    }

    if (action === 'compare') {
      var modal = document.getElementById('logCompareModal');
      if (modal) {
        var sel1 = document.getElementById('logCompareFile1');
        var sel2 = document.getElementById('logCompareFile2');
        if (sel1 && sel2) {
          sel1.innerHTML = state.files.map(function (f) {
            return '<option value="' + esc(f.path) + '"' + (f.path === state.selected ? ' selected' : '') + '>' + esc(f.path) + '</option>';
          }).join('');
          sel2.innerHTML = sel1.innerHTML;
        }
        modal.style.display = 'flex';
      }
      return;
    }

    if (action === 'do-compare') {
      var m = document.getElementById('logCompareModal');
      var f1 = document.getElementById('logCompareFile1');
      var f2 = document.getElementById('logCompareFile2');
      var out = document.getElementById('logCompareOutput');
      if (!f1 || !f2 || !out) return;
      var file1 = f1.value, file2 = f2.value;
      if (file1 === file2) { showToast('Select two different files', 'error'); return; }
      out.textContent = 'Loading...';
      var content1 = '', content2 = '';
      Promise.all([
        API.logs.read(file1, 2000).then(function (d) { content1 = d.content || ''; }),
        API.logs.read(file2, 2000).then(function (d) { content2 = d.content || ''; }),
      ]).then(function () {
        var lines1 = content1.split('\n');
        var lines2 = content2.split('\n');
        var diff = computeDiff(lines1, lines2);
        out.innerHTML = diff;
      }).catch(function (e) {
        out.textContent = 'Error: ' + e.message;
      });
      return;
    }

    if (action === 'close-compare') {
      var modal = document.getElementById('logCompareModal');
      if (modal) modal.style.display = 'none';
      return;
    }

    if (action === 'close-multi') {
      var panel = document.getElementById('logResults');
      if (panel) panel.style.display = 'none';
      return;
    }
  });

  function computeDiff(a, b) {
    var maxLen = Math.max(a.length, b.length);
    var html = '';
    for (var i = 0; i < maxLen; i++) {
      var lineA = i < a.length ? a[i] : undefined;
      var lineB = i < b.length ? b[i] : undefined;
      if (lineA === lineB) {
        html += '<div class="log-compare-line">' + esc(lineA || '') + '</div>';
      } else {
        if (lineA !== undefined) html += '<div class="log-compare-line log-compare-del">' + esc(lineA) + '</div>';
        if (lineB !== undefined) html += '<div class="log-compare-line log-compare-add">' + esc(lineB) + '</div>';
      }
    }
    return html;
  }

  document.addEventListener('change', function (e) {
    if (e.target.id === 'logTailSelect') {
      state.tailLines = parseInt(e.target.value) || 500;
      if (state.selected) openFile(state.selected);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var m = document.getElementById('logCompareModal');
      if (m && m.style.display !== 'none') m.style.display = 'none';
    }
  });

})();
