/* search.js — Global NexusPanel search */
var gsTimer = null;
var gsResults = [];
var gsSelIdx = -1;
var gsSearching = false;

var MODULE_ORDER = ['Users', 'Services', 'Docker', 'Domains', 'Cron Jobs', 'Firewall', 'Databases'];

var RESULT_ICONS = {
  user: '👤', service: '⚙️', container: '🐳',
  domain: '🌐', cron: '⏰', firewall: '🛡', database: '🗄️'
};

document.addEventListener('DOMContentLoaded', function () {
  var input = document.getElementById('globalSearchInput');
  if (!input) return;
  input.addEventListener('input', onSearchInput);
  input.addEventListener('keydown', onSearchKey);
  input.addEventListener('focus', function () {
    if (gsResults.length > 0) renderResults();
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#globalSearchWrap')) hideResults();
  });

  document.addEventListener('keydown', function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    var inTerminalSearch = document.body.classList.contains('term-search-active');
    var inTerminal = document.activeElement && document.activeElement.closest && document.activeElement.closest('#termProPanes');

    if (inTerminalSearch) return;

    if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !inTerminal) {
      e.preventDefault();
      input.focus();
      input.select();
    }
    if (e.key === 'Escape' && document.activeElement === input) {
      input.blur();
      hideResults();
    }
  });
});

function onSearchInput() {
  clearTimeout(gsTimer);
  gsSelIdx = -1;
  var q = this.value.trim();
  if (q.length < 2) { if (!q) hideResults(); showHint(); return; }
  showSearching();
  gsTimer = setTimeout(function () { doSearch(q); }, 250);
}

function showHint() {
  var el = document.getElementById('globalSearchResults');
  if (!el) return;
  el.innerHTML = '<div class="gsr-loading">Type at least 2 characters to search…</div>';
  el.style.display = 'block';
}

function showSearching() {
  gsSearching = true;
  var el = document.getElementById('globalSearchResults');
  if (!el) return;
  el.innerHTML = '<div class="gsr-searching"><span class="gsr-spinner"></span> Searching…</div>';
  el.style.display = 'block';
}

async function doSearch(q) {
  try {
    var data = await API.search(q);
    gsSearching = false;
    gsResults = data.results || [];
    if (gsResults.length === 0) {
      showEmpty(q);
    } else {
      renderResults();
    }
  } catch (e) {
    gsSearching = false;
    gsResults = [];
    hideResults();
  }
}

function renderResults() {
  var el = document.getElementById('globalSearchResults');
  if (!el) return;

  // Group results by module in canonical order
  var groups = {};
  gsResults.forEach(function (r) {
    if (!groups[r.module]) groups[r.module] = [];
    groups[r.module].push(r);
  });

  var reordered = [];
  MODULE_ORDER.forEach(function (mod) {
    if (groups[mod]) {
      reordered = reordered.concat(groups[mod]);
      delete groups[mod];
    }
  });
  for (var mod in groups) {
    reordered = reordered.concat(groups[mod]);
  }
  gsResults = reordered;

  // Render with group headers
  var html = '';
  var currentModule = '';
  gsResults.forEach(function (r, i) {
    if (r.module !== currentModule) {
      if (currentModule) html += '</div>';
      html += '<div class="gsr-group"><div class="gsr-group-header">' + esc(r.module) + '</div>';
      currentModule = r.module;
    }
    var icon = RESULT_ICONS[r.type] || '🔍';
    html += '<div class="gsr-item' + (i === gsSelIdx ? ' active' : '') + '" data-idx="' + i + '" onmousedown="searchNavigate(' + i + ')">' +
      '<span class="gsr-icon">' + icon + '</span>' +
      '<div class="gsr-body">' +
      '<span class="gsr-title">' + esc(r.title) + '</span>' +
      '<span class="gsr-desc">' + esc(r.desc || '') + '</span>' +
      '</div>' +
      '</div>';
  });
  if (currentModule) html += '</div>';

  el.innerHTML = html;
  el.style.display = 'block';
}

function showEmpty(q) {
  var el = document.getElementById('globalSearchResults');
  if (!el) return;
  el.innerHTML = '<div class="gsr-empty"><div class="gsr-empty-icon">🔍</div>No results for <strong>' + esc(q) + '</strong><div class="gsr-empty-hint">Try a different search term</div></div>';
  el.style.display = 'block';
}

function hideResults() {
  var el = document.getElementById('globalSearchResults');
  if (el) el.style.display = 'none';
  gsSelIdx = -1;
}

function onSearchKey(e) {
  if (e.key === 'Escape') { hideResults(); this.blur(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); return; }
  if (e.key === 'Enter') { navigateSelected(); return; }
}

function moveSel(d) {
  if (!gsResults.length) return;
  gsSelIdx = Math.max(0, Math.min(gsResults.length - 1, gsSelIdx + d));
  renderResults();
}

function navigateSelected() {
  if (gsSelIdx >= 0 && gsSelIdx < gsResults.length) {
    searchNavigate(gsSelIdx);
  }
}

function searchNavigate(idx) {
  var r = gsResults[idx];
  if (!r) return;
  hideResults();
  document.getElementById('globalSearchInput').value = '';
  gsResults = [];
  gsSelIdx = -1;
  navigateTo(r.view);
}

function esc(s) { return String(s || '').replace(/[&<>]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
