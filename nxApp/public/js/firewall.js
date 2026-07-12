let fwState = { chains: {} };
window.initFirewall = async function () {
  var me = await API.me();
  if (me.role !== 'admin') return;
  loadFirewall();
};
async function loadFirewall() {
  try {
    var d = await API.firewall.list();
    fwState.chains = d.chains || {};
    renderFirewall();
  } catch {}
}
function esc(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, function(c){ return '&#'+c.charCodeAt(0)+';'; }); }
function renderFirewall() {
  var el = document.getElementById('fwContent');
  var chains = fwState.chains;
  var html = '';
  for (var chain in chains) {
    html += '<div class="fw-chain"><div class="fw-chain-header">🔗 ' + esc(chain) + ' <span class="fw-chain-count">' + chains[chain].length + '</span></div>';
    if (chains[chain].length === 0) {
      html += '<div class="fw-empty">No rules in this chain</div>';
    } else {
      html += chains[chain].map(function(r) {
        return '<div class="fw-rule">'
          + '<span class="fw-rule-num">' + r.num + '</span>'
          + '<span class="fw-rule-target">' + esc(r.target) + '</span>'
          + '<span class="fw-rule-detail">' + esc(r.prot) + ' ' + esc(r.source) + ' → ' + esc(r.destination) + '</span>'
          + '<button class="fm-btn fm-btn-sm fm-btn-danger" onclick="fwDelete(\'' + esc(chain) + '\',' + r.num + ')">✕</button>'
          + '</div>';
      }).join('');
    }
    html += '</div>';
  }
  el.innerHTML = html || '<div class="db-empty">No firewall rules found</div>';
}
function fwAddForm() {
  document.getElementById('fwModalOverlay').style.display = 'flex';
}
async function fwAddRule() {
  var chain = document.getElementById('fwChain').value.trim();
  var rule = document.getElementById('fwRule').value.trim();
  try {
    await API.firewall.addRule(chain, rule);
    document.getElementById('fwModalOverlay').style.display = 'none';
    loadFirewall();
  } catch(e) { alert(e.message); }
}
async function fwDelete(chain, num) {
  try {
    await API.firewall.deleteRule(chain, num);
    loadFirewall();
  } catch(e) { alert(e.message); }
}
