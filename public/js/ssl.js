let sslState = { certs: [] };
window.initSSL = async function () {
  var me = await API.me();
  if (me.role !== 'admin') return;
  loadSSL();
};
async function loadSSL() {
  try { sslState.certs = await API.ssl.list(); renderSSL(); } catch {}
}
function esc(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, function(c){ return '&#'+c.charCodeAt(0)+';'; }); }
function renderSSL() {
  var el = document.getElementById('sslList');
  if (!sslState.certs.length) { el.innerHTML = '<div class="db-empty">No SSL certificates found</div>'; return; }
  el.innerHTML = sslState.certs.map(function(c) {
    var badge = c.daysLeft <= 0 ? 'danger' : c.daysLeft <= 30 ? 'warning' : 'ok';
    return '<div class="ssl-card">'
      + '<div class="ssl-info"><div class="ssl-domain">🔒 ' + esc(c.domain) + '</div>'
      + '<div class="ssl-issuer">' + esc(c.issuer) + '</div></div>'
      + '<div class="ssl-expiry">'
      + '<span class="ssl-badge ' + badge + '">' + (c.daysLeft <= 0 ? 'EXPIRED' : c.daysLeft + ' days') + '</span>'
      + '</div>'
      + '<button class="fm-btn fm-btn-sm" onclick="sslRenew(\'' + esc(c.domain) + '\')">🔄 Renew</button>'
      + '</div>';
  }).join('');
}
async function sslRenew(domain) {
  if (!confirm('Renew certificate for ' + domain + '?')) return;
  try { await API.ssl.renew(domain); loadSSL(); } catch(e) { alert(e.message); }
}
function sslIssueForm() { document.getElementById('sslModalOverlay').style.display = 'flex'; }
async function sslIssue() {
  var domain = document.getElementById('sslDomain').value.trim();
  var email = document.getElementById('sslEmail').value.trim();
  if (!domain) { alert('Domain required'); return; }
  try {
    var r = await API.ssl.issue(domain, email);
    if (r.error) alert(r.error); else { loadSSL(); document.getElementById('sslModalOverlay').style.display = 'none'; }
  } catch(e) { alert(e.message); }
}
