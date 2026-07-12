let phpfpmState = { pools: [], status: '' };
window.initPhpFPM = async function () {
  var me = await API.me();
  if (me.role !== 'admin') return;
  loadPhpFPM();
};
async function loadPhpFPM() {
  try {
    phpfpmState.pools = await API.phpfpm.list();
    renderPhpFPM();
  } catch {}
}
function esc(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, function(c){ return '&#'+c.charCodeAt(0)+';'; }); }
function renderPhpFPM() {
  var el = document.getElementById('phpfpmList');
  if (!phpfpmState.pools.length) { el.innerHTML = '<div class="db-empty">No PHP-FPM pools found</div>'; return; }
  el.innerHTML = phpfpmState.pools.map(function(p) {
    return '<div class="phpfpm-card">'
      + '<div class="phpfpm-info">'
      + '<span class="phpfpm-name">' + esc(p.name) + '</span>'
      + '<span class="phpfpm-meta">PM: ' + esc(p.pm) + ' · Max children: ' + esc(p.maxChildren) + ' · User: ' + esc(p.user || '-') + '</span>'
      + '<span class="phpfpm-listen">Listen: ' + esc(p.listen || '-') + '</span>'
      + '</div></div>';
  }).join('');
}
async function phpfpmRestart() {
  if (!confirm('Restart PHP-FPM?')) return;
  try { await API.phpfpm.restart(); alert('PHP-FPM restarted'); } catch(e) { alert(e.message); }
}
