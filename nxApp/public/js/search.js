/* search.js — Global NexusPanel search */
var gsTimer = null;
var gsResults = [];
var gsSelIdx = -1;

document.addEventListener('DOMContentLoaded', function () {
  var input = document.getElementById('globalSearchInput');
  if (!input) return;
  input.addEventListener('input', onSearchInput);
  input.addEventListener('keydown', onSearchKey);
  input.addEventListener('focus', function () {
    if (gsResults.length > 0) showResults();
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#globalSearchWrap')) hideResults();
  });
});

function onSearchInput() {
  clearTimeout(gsTimer);
  searchSelIdx = -1;
  var q = this.value.trim();
  if (q.length < 2) { hideResults(); return; }
  gsTimer = setTimeout(function () { doSearch(q); }, 250);
}

async function doSearch(q) {
  try {
    var data = await API.search(q);
    gsResults = data.results || [];
    if (gsResults.length === 0) {
      showEmpty(q);
    } else {
      renderResults();
    }
  } catch (e) {
    gsResults = [];
    hideResults();
  }
}

function renderResults() {
  var el = document.getElementById('globalSearchResults');
  if (!el) return;
  var icons = {
    file: '📄', folder: '📁', user: '👤', service: '⚙️', container: '🐳',
    domain: '🌐', cron: '⏰', firewall: '🛡', database: '🗄️'
  };
  el.innerHTML = gsResults.map(function (r, i) {
    var icon = icons[r.type] || '🔍';
    return '<div class="gsr-item' + (i === searchSelIdx ? ' active' : '') + '" data-idx="' + i + '" onmousedown="searchNavigate(' + i + ')">' +
      '<span class="gsr-icon">' + icon + '</span>' +
      '<div class="gsr-body">' +
      '<span class="gsr-title">' + esc(r.title) + '</span>' +
      '<span class="gsr-desc">' + esc(r.desc || '') + '</span>' +
      '</div>' +
      '<span class="gsr-module">' + esc(r.module) + '</span>' +
      '</div>';
  }).join('');
  el.style.display = 'block';
}

function showEmpty(q) {
  var el = document.getElementById('globalSearchResults');
  if (!el) return;
  el.innerHTML = '<div class="gsr-empty">No results for "' + esc(q) + '"</div>';
  el.style.display = 'block';
}

function showResults() {
  if (gsResults.length > 0) renderResults();
  else {
    var el = document.getElementById('globalSearchResults');
    if (el) el.style.display = 'block';
  }
}

function hideResults() {
  var el = document.getElementById('globalSearchResults');
  if (el) el.style.display = 'none';
  searchSelIdx = -1;
}

function onSearchKey(e) {
  if (e.key === 'Escape') { hideResults(); this.blur(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); return; }
  if (e.key === 'Enter') { navigateSelected(); return; }
}

function moveSel(d) {
  if (!gsResults.length) return;
  searchSelIdx = Math.max(0, Math.min(gsResults.length - 1, searchSelIdx + d));
  renderResults();
}

function navigateSelected() {
  if (searchSelIdx >= 0 && searchSelIdx < gsResults.length) {
    searchNavigate(searchSelIdx);
  }
}

function searchNavigate(idx) {
  var r = gsResults[idx];
  if (!r) return;
  hideResults();
  document.getElementById('globalSearchInput').value = '';
  if (r.path && r.type === 'file') {
    // For files, set file manager path
    sessionStorage.setItem('fm_navigate', r.path);
  }
  navigateTo(r.view);
}

function esc(s) { return String(s || '').replace(/[&<>]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
