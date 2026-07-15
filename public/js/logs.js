let logState = { logs: [], selected: null, content: '' };
window.initLogs = async function () {
  var me = await API.me();
  if (me.role !== 'admin') return;
  loadLogList();
};
async function loadLogList() {
  try { logState.logs = await API.logs.list(); renderLogList(); } catch {}
}
function esc(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, function(c){ return '&#'+c.charCodeAt(0)+';'; }); }
function formatSize(b) { if(b>1073741824) return (b/1073741824).toFixed(1)+'G'; if(b>1048576) return (b/1048576).toFixed(1)+'M'; if(b>1024) return (b/1024).toFixed(0)+'K'; return b+'B'; }
function renderLogList() {
  var el = document.getElementById('logFileList');
  el.innerHTML = logState.logs.map(function(l) {
    return '<div class="log-file-item' + (logState.selected === l.name ? ' active' : '') + '" onclick="logOpen(\'' + esc(l.name) + '\')">'
      + '<span class="log-file-icon">📄</span>'
      + '<span class="log-file-name">' + esc(l.name) + '</span>'
      + '<span class="log-file-size">' + formatSize(l.size) + '</span>'
      + '</div>';
  }).join('');
}
async function logOpen(name) {
  logState.selected = name;
  renderLogList();
  try {
    var d = await API.logs.read(name, 500);
    logState.content = d.content || '';
    document.getElementById('logViewerContent').textContent = logState.content;
  } catch(e) { document.getElementById('logViewerContent').textContent = 'Error: ' + e.message; }
}
async function logSearch() {
  var q = document.getElementById('logSearchInput').value;
  if (!q || !logState.selected) return;
  try {
    var d = await API.logs.search(logState.selected, q);
    document.getElementById('logViewerContent').textContent = d.content || '(no matches)';
  } catch(e) { document.getElementById('logViewerContent').textContent = 'Error: ' + e.message; }
}
