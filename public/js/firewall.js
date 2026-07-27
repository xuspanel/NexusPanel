(function () {
  var fwData = { backend: 'none', zones: [], chains: { builtin: [], custom: {} }, policies: {} };
  var fwView = 'zones';
  var fwFilter = '';
  var _toastTimer = null;

  var RULE_TEMPLATES = [
    { label: 'Allow HTTP', rule: '-p tcp --dport 80 -j ACCEPT' },
    { label: 'Allow HTTPS', rule: '-p tcp --dport 443 -j ACCEPT' },
    { label: 'Allow SSH', rule: '-p tcp --dport 22 -j ACCEPT' },
    { label: 'Allow FTP', rule: '-p tcp --dport 21 -j ACCEPT' },
    { label: 'Allow MySQL', rule: '-p tcp --dport 3306 -j ACCEPT' },
    { label: 'Allow PostgreSQL', rule: '-p tcp --dport 5432 -j ACCEPT' },
    { label: 'Allow Redis', rule: '-p tcp --dport 6379 -j ACCEPT' },
    { label: 'Allow DNS (UDP)', rule: '-p udp --dport 53 -j ACCEPT' },
    { label: 'Allow ICMP (ping)', rule: '-p icmp --icmp-type echo-request -j ACCEPT' },
    { label: 'Block IP', rule: '-s 0.0.0.0/0 -j DROP' },
    { label: 'Rate limit SSH', rule: '-p tcp --dport 22 -m connlimit --connlimit-above 5 -j REJECT' },
    { label: 'Allow loopback', rule: '-i lo -j ACCEPT' },
    { label: 'Log dropped', rule: '-j LOG --log-prefix "DROP: " --log-level 4' },
  ];

  function esc(s) { if (!s) return ''; return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

  function showLoading() {
    var el = document.getElementById('fwContent');
    if (el) el.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div><div class="db-loading-text">Loading firewall rules...</div></div>';
  }

  function showError(msg) {
    var el = document.getElementById('fwContent');
    if (el) el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(msg) + '</span></div>';
  }

  function showToast(msg, type) {
    var el = document.getElementById('fwToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'fw-toast ' + (type || 'info');
    el.style.display = 'block';
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function showConfirm(msg, onConfirm) {
    var overlay = document.getElementById('fwConfirmOverlay');
    var msgEl = document.getElementById('fwConfirmMsg');
    if (!overlay || !msgEl) { onConfirm(); return; }
    msgEl.textContent = msg;
    overlay.style.display = 'flex';
    var yesBtn = document.getElementById('fwConfirmYes');
    var noBtn = document.getElementById('fwConfirmNo');
    function close() { overlay.style.display = 'none'; yesBtn.onclick = null; noBtn.onclick = null; }
    yesBtn.onclick = function () { close(); onConfirm(); };
    noBtn.onclick = close;
  }

  function updateHeader() {
    var badge = document.getElementById('fwBackendBadge');
    var zoneSel = document.getElementById('fwZoneSelect');
    var addBtn = document.getElementById('fwAddBtn');
    var saveBtn = document.getElementById('fwSaveBtn');
    var addSvcBtn = document.getElementById('fwAddSvcBtn');
    var createChainBtn = document.getElementById('fwCreateChainBtn');
    var exportBtn = document.getElementById('fwExportBtn');
    var searchBox = document.getElementById('fwSearchBox');
    if (badge) {
      var b = fwData.backend;
      var label = b === 'firewalld' ? 'firewalld' : b === 'ufw' ? 'ufw' : b === 'iptables' ? 'iptables' : b === 'nftables' ? 'nftables' : 'none';
      badge.textContent = label;
      badge.className = 'fw-backend-badge fw-backend-' + b;
    }
    if (zoneSel) {
      if (fwData.backend === 'firewalld' && fwData.zones && fwData.zones.length) {
        zoneSel.innerHTML = fwData.zones.map(function (z) {
          return '<option value="' + esc(z.name) + '"' + (z.isDefault ? ' selected' : '') + '>' + esc(z.name) + (z.isDefault ? ' (default)' : '') + (z.isActive ? ' *' : '') + '</option>';
        }).join('');
        zoneSel.style.display = '';
      } else {
        zoneSel.style.display = 'none';
      }
    }
    if (addBtn) addBtn.style.display = fwData.backend === 'iptables' ? '' : 'none';
    if (addSvcBtn) addSvcBtn.style.display = fwData.backend === 'firewalld' ? '' : 'none';
    if (saveBtn) saveBtn.style.display = fwData.backend === 'iptables' ? '' : 'none';
    if (createChainBtn) createChainBtn.style.display = fwData.backend === 'iptables' ? '' : 'none';
    if (exportBtn) exportBtn.style.display = (fwData.backend === 'firewalld' || fwData.backend === 'iptables') ? '' : 'none';
    if (searchBox) searchBox.style.display = fwData.backend === 'iptables' ? '' : 'none';
    var tabsEl = document.getElementById('fwTabs');
    if (tabsEl) {
      if (fwData.backend === 'firewalld') {
        tabsEl.innerHTML = '<button class="fw-tab' + (fwView === 'zones' ? ' active' : '') + '" data-fw-tab="zones">Zones</button><button class="fw-tab' + (fwView === 'services' ? ' active' : '') + '" data-fw-tab="services">Services</button>';
        tabsEl.style.display = '';
      } else if (fwData.backend === 'iptables') {
        tabsEl.innerHTML = '<button class="fw-tab' + (fwView === 'chains' ? ' active' : '') + '" data-fw-tab="chains">Chains & Rules</button>';
        tabsEl.style.display = '';
      } else {
        tabsEl.style.display = 'none';
      }
    }
  }

  function renderZones() {
    var el = document.getElementById('fwContent');
    var zones = fwData.zones || [];
    if (!zones.length) { el.innerHTML = '<div class="db-empty">No firewall zones found</div>'; return; }
    var html = '';
    zones.forEach(function (zone) {
      var isDefault = zone.isDefault;
      html += '<div class="fw-zone" data-fw-zone="' + esc(zone.name) + '">';
      html += '<div class="fw-zone-header">';
      html += '<span class="fw-zone-name">' + esc(zone.name) + '</span>';
      if (isDefault) html += '<span class="fw-badge fw-badge-default">default</span>';
      if (zone.isActive) html += '<span class="fw-badge fw-badge-active">active</span>';
      if (zone.target !== 'default') html += '<span class="fw-badge fw-badge-target">' + esc(zone.target) + '</span>';
      if (zone.interfaces.length) html += '<span class="fw-badge fw-badge-iface">' + esc(zone.interfaces.join(', ')) + '</span>';
      if (zone.masquerade) html += '<span class="fw-badge fw-badge-masq">masquerade</span>';
      html += '<div class="fw-zone-actions">';
      if (!isDefault) html += '<button class="fm-btn fm-btn-sm" data-fw-action="set-default-zone" data-fw-zone="' + esc(zone.name) + '" title="Set as default">Set Default</button>';
      html += '<button class="fm-btn fm-btn-sm" data-fw-action="toggle-masquerade" data-fw-zone="' + esc(zone.name) + '" data-fw-enable="' + (zone.masquerade ? 'false' : 'true') + '">' + (zone.masquerade ? 'Disable Masq.' : 'Enable Masq.') + '</button>';
      html += '</div>';
      html += '</div>';
      html += '<div class="fw-zone-body">';
      html += '<div class="fw-zone-section">';
      html += '<div class="fw-zone-section-header"><span class="fw-zone-section-title">Services</span><button class="fm-btn fm-btn-sm fm-btn-primary" data-fw-action="add-service" data-fw-zone="' + esc(zone.name) + '">+ Add</button></div>';
      if (zone.services.length) {
        html += '<div class="fw-chips">';
        zone.services.forEach(function (s) {
          html += '<span class="fw-chip fw-chip-service">' + esc(s) + '<button class="fw-chip-remove" data-fw-action="remove-service" data-fw-zone="' + esc(zone.name) + '" data-fw-value="' + esc(s) + '">&times;</button></span>';
        });
        html += '</div>';
      } else {
        html += '<div class="fw-zone-empty">No services</div>';
      }
      html += '</div>';
      html += '<div class="fw-zone-section">';
      html += '<div class="fw-zone-section-header"><span class="fw-zone-section-title">Ports</span><button class="fm-btn fm-btn-sm fm-btn-primary" data-fw-action="add-port" data-fw-zone="' + esc(zone.name) + '">+ Add</button></div>';
      if (zone.ports.length) {
        html += '<div class="fw-chips">';
        zone.ports.forEach(function (p) {
          html += '<span class="fw-chip fw-chip-port">' + esc(p) + '<button class="fw-chip-remove" data-fw-action="remove-port" data-fw-zone="' + esc(zone.name) + '" data-fw-value="' + esc(p) + '">&times;</button></span>';
        });
        html += '</div>';
      } else {
        html += '<div class="fw-zone-empty">No ports</div>';
      }
      html += '</div>';
      if (zone.richRules && zone.richRules.length) {
        html += '<div class="fw-zone-section">';
        html += '<div class="fw-zone-section-header"><span class="fw-zone-section-title">Rich Rules</span><button class="fm-btn fm-btn-sm fm-btn-primary" data-fw-action="add-rich-rule" data-fw-zone="' + esc(zone.name) + '">+ Add</button></div>';
        html += '<div class="fw-rich-rules">';
        zone.richRules.forEach(function (r) {
          html += '<div class="fw-rich-rule"><code class="fw-rich-rule-text">' + esc(r) + '</code><button class="fm-btn fm-btn-sm fm-btn-danger" data-fw-action="remove-rich-rule" data-fw-zone="' + esc(zone.name) + '" data-fw-rule="' + esc(r) + '">&#128465;</button></div>';
        });
        html += '</div></div>';
      }
      if (zone.protocols && zone.protocols.length) {
        html += '<div class="fw-zone-section"><div class="fw-zone-section-header"><span class="fw-zone-section-title">Protocols</span></div>';
        html += '<div class="fw-chips">';
        zone.protocols.forEach(function (p) { html += '<span class="fw-chip fw-chip-proto">' + esc(p) + '</span>'; });
        html += '</div></div>';
      }
      html += '</div></div>';
    });
    el.innerHTML = html || '<div class="db-empty">No firewall zones found</div>';
  }

  function renderServices() {
    var el = document.getElementById('fwContent');
    var services = [];
    try {
      var allSvc = [];
      (fwData.zones || []).forEach(function (z) { (z.services || []).forEach(function (s) { if (allSvc.indexOf(s) === -1) allSvc.push(s); }); });
      services = allSvc.sort();
    } catch (e) {}
    if (!services.length) { el.innerHTML = '<div class="db-empty">No firewall services in use</div>'; return; }
    var html = '<div class="fw-services-grid">';
    services.forEach(function (s) {
      var inZones = (fwData.zones || []).filter(function (z) { return z.services.indexOf(s) !== -1; }).map(function (z) { return z.name; });
      html += '<div class="fw-service-card">';
      html += '<div class="fw-service-name">' + esc(s) + '</div>';
      html += '<div class="fw-service-zones">' + inZones.map(function (z) { return '<span class="fw-badge">' + esc(z) + '</span>'; }).join(' ') + '</div>';
      html += '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
  }

  function renderChains() {
    var el = document.getElementById('fwContent');
    var allChains = [];
    if (fwData.chains.builtin) allChains = allChains.concat(fwData.chains.builtin);
    if (fwData.chains.custom) {
      for (var name in fwData.chains.custom) {
        allChains.push(fwData.chains.custom[name]);
      }
    }
    if (!allChains.length) { el.innerHTML = '<div class="db-empty">No firewall chains found</div>'; return; }
    var f = fwFilter.toLowerCase();
    var html = '';
    allChains.forEach(function (chain) {
      var visibleRules = chain.rules || [];
      if (f) {
        visibleRules = visibleRules.filter(function (r) {
          return (r.target + ' ' + r.prot + ' ' + r.source + ' ' + r.destination + ' ' + r.extra).toLowerCase().indexOf(f) !== -1;
        });
        if (!visibleRules.length && chain.name.toLowerCase().indexOf(f) === -1) return;
      }
      html += '<div class="fw-chain">';
      html += '<div class="fw-chain-header">';
      html += '<span class="fw-chain-name">' + esc(chain.name) + '</span>';
      html += '<span class="fw-chain-count">' + visibleRules.length + (f ? ' / ' + chain.ruleCount : '') + ' rules</span>';
      html += '<span class="fw-chain-policy fw-policy-' + esc(chain.policy).toLowerCase() + '">policy: ' + esc(chain.policy) + '</span>';
      if (chain.isDocker) html += '<span class="fw-badge fw-badge-docker">Docker</span>';
      html += '<div class="fw-chain-actions">';
      if (!chain.isDocker && ['INPUT', 'OUTPUT', 'FORWARD'].indexOf(chain.name) !== -1) {
        html += '<select class="fw-policy-select" data-fw-action="set-policy" data-fw-chain="' + esc(chain.name) + '">';
        ['ACCEPT', 'DROP', 'REJECT'].forEach(function (t) {
          html += '<option value="' + t + '"' + (chain.policy === t ? ' selected' : '') + '>' + t + '</option>';
        });
        html += '</select>';
      }
      if (!chain.isDocker && !['INPUT', 'OUTPUT', 'FORWARD', 'PREROUTING', 'POSTROUTING'].includes(chain.name)) {
        html += '<button class="fm-btn fm-btn-sm" data-fw-action="delete-chain" data-fw-chain="' + esc(chain.name) + '" title="Delete chain">&#128465;</button>';
      }
      if (!chain.isDocker && chain.ruleCount > 0) {
        html += '<button class="fm-btn fm-btn-sm fm-btn-danger" data-fw-action="flush-chain" data-fw-chain="' + esc(chain.name) + '" title="Flush all rules">Flush</button>';
      }
      html += '</div>';
      html += '</div>';
      if (visibleRules.length) {
        visibleRules.forEach(function (r) {
          html += '<div class="fw-rule">';
          html += '<span class="fw-rule-num">' + r.num + '</span>';
          html += '<span class="fw-rule-target fw-target-' + esc(r.target).toLowerCase() + '">' + esc(r.target) + '</span>';
          html += '<span class="fw-rule-proto">' + esc(r.prot) + '</span>';
          html += '<span class="fw-rule-io">' + esc(r.inIf || '*') + ' → ' + esc(r.outIf || '*') + '</span>';
          html += '<span class="fw-rule-src">' + esc(r.source) + '</span>';
          html += '<span class="fw-rule-dst">' + esc(r.destination) + '</span>';
          html += '<span class="fw-rule-extra">' + esc(r.extra) + '</span>';
          html += '<span class="fw-rule-stats">' + r.pktsFmt + ' / ' + r.bytesFmt + '</span>';
          if (!chain.isDocker) {
            html += '<button class="fm-btn fm-btn-sm" data-fw-action="edit-rule" data-fw-chain="' + esc(chain.name) + '" data-fw-num="' + r.num + '" data-fw-extra="' + esc(r.extra) + '" title="Edit rule">&#9998;</button>';
            html += '<button class="fm-btn fm-btn-sm fm-btn-danger" data-fw-action="delete-rule" data-fw-chain="' + esc(chain.name) + '" data-fw-num="' + r.num + '" title="Delete rule">&#128465;</button>';
          }
          html += '</div>';
        });
      } else {
        html += '<div class="fw-empty">No rules in this chain</div>';
      }
      html += '</div>';
    });
    el.innerHTML = html || '<div class="db-empty">No firewall chains found</div>';
  }

  function renderContent() {
    updateHeader();
    if (fwData.backend === 'firewalld') {
      if (fwView === 'services') renderServices();
      else renderZones();
    } else if (fwData.backend === 'iptables') {
      renderChains();
    } else if (fwData.backend === 'ufw') {
      renderUfw();
    } else {
      document.getElementById('fwContent').innerHTML = '<div class="db-empty">No firewall backend detected</div>';
    }
  }

  function renderUfw() {
    var el = document.getElementById('fwContent');
    if (!fwData.active) { el.innerHTML = '<div class="db-empty">UFW is not active</div>'; return; }
    var html = '<div class="fw-ufw-status">';
    html += '<div class="fw-ufw-badge">' + (fwData.active ? 'Active' : 'Inactive') + '</div>';
    html += '<div class="fw-ufw-policies">Default: INBOUND ' + esc((fwData.policies || {}).INPUT || '?') + ' / OUTBOUND ' + esc((fwData.policies || {}).OUTPUT || '?') + '</div>';
    html += '</div>';
    el.innerHTML = html;
  }

  async function loadFirewall() {
    showLoading();
    try {
      fwData = await API.firewall.get();
      if (!fwView || fwView === 'zones' || fwView === 'chains') fwView = fwData.backend === 'firewalld' ? 'zones' : 'chains';
      renderContent();
    } catch (e) {
      showError('Failed to load firewall: ' + (e.message || e));
    }
  }

  function getZone() {
    var sel = document.getElementById('fwZoneSelect');
    return sel ? sel.value : (fwData.zones && fwData.zones.length ? fwData.zones[0].name : 'public');
  }

  function openAddServiceModal() {
    var zone = getZone();
    var overlay = document.getElementById('fwAddServiceOverlay');
    var zoneEl = document.getElementById('fwSvcZone');
    if (zoneEl) zoneEl.value = zone;
    document.getElementById('fwSvcName').value = '';
    if (overlay) overlay.style.display = 'flex';
  }

  function openAddPortModal() {
    var zone = getZone();
    var overlay = document.getElementById('fwAddPortOverlay');
    var zoneEl = document.getElementById('fwPortZone');
    if (zoneEl) zoneEl.value = zone;
    document.getElementById('fwPortValue').value = '';
    if (overlay) overlay.style.display = 'flex';
  }

  function openAddRichRuleModal() {
    var zone = getZone();
    var overlay = document.getElementById('fwAddRichRuleOverlay');
    var zoneEl = document.getElementById('fwRichZone');
    if (zoneEl) zoneEl.value = zone;
    document.getElementById('fwRichRule').value = '';
    if (overlay) overlay.style.display = 'flex';
  }

  function openAddIptablesRuleModal(chainName) {
    var overlay = document.getElementById('fwAddIptablesOverlay');
    document.getElementById('fwIptChain').value = chainName || 'INPUT';
    document.getElementById('fwIptRule').value = '';
    var sel = document.getElementById('fwTemplateSelect');
    if (sel) sel.value = '';
    if (overlay) overlay.style.display = 'flex';
  }

  function openEditIptablesRuleModal(chain, num, existingRule) {
    var overlay = document.getElementById('fwEditRuleOverlay');
    document.getElementById('fwEditChain').textContent = chain;
    document.getElementById('fwEditNum').textContent = '#' + num;
    document.getElementById('fwEditRule').value = existingRule;
    document.getElementById('fwEditRule').dataset.fwChain = chain;
    document.getElementById('fwEditRule').dataset.fwNum = num;
    if (overlay) overlay.style.display = 'flex';
  }

  function openCreateChainModal() {
    document.getElementById('fwNewChainName').value = '';
    document.getElementById('fwCreateChainOverlay').style.display = 'flex';
  }

  window.initFirewall = async function () {
    var me = await API.me();
    if (me.role !== 'admin') return;
    loadFirewall();
  };

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-fw-action]');
    if (!btn) return;
    var action = btn.dataset.fwAction;
    var zone = btn.dataset.fwZone;
    var chain = btn.dataset.fwChain;
    var num = btn.dataset.fwNum;
    var value = btn.dataset.fwValue;
    var rule = btn.dataset.fwRule;
    var enable = btn.dataset.fwEnable;

    switch (action) {
      case 'add-service': openAddServiceModal(); break;
      case 'add-port': openAddPortModal(); break;
      case 'add-rich-rule': openAddRichRuleModal(); break;
      case 'add-iptables-rule': openAddIptablesRuleModal(); break;
      case 'edit-rule':
        var extra = btn.dataset.fwExtra || '';
        openEditIptablesRuleModal(chain, num, extra);
        break;
      case 'create-chain': openCreateChainModal(); break;
      case 'remove-service':
        showConfirm('Remove service "' + value + '" from zone ' + zone + '?', async function () {
          try { await API.firewall.removeService(zone, value); showToast('Service removed', 'success'); loadFirewall(); } catch (e) { showToast(e.message || 'Failed', 'error'); }
        });
        break;
      case 'remove-port':
        showConfirm('Remove port "' + value + '" from zone ' + zone + '?', async function () {
          try { await API.firewall.removePort(zone, value); showToast('Port removed', 'success'); loadFirewall(); } catch (e) { showToast(e.message || 'Failed', 'error'); }
        });
        break;
      case 'remove-rich-rule':
        showConfirm('Remove this rich rule from zone ' + zone + '?', async function () {
          try { await API.firewall.removeRichRule(zone, rule); showToast('Rich rule removed', 'success'); loadFirewall(); } catch (e) { showToast(e.message || 'Failed', 'error'); }
        });
        break;
      case 'set-default-zone':
        showConfirm('Set "' + zone + '" as the default zone?', async function () {
          try { await API.firewall.setDefaultZone(zone); showToast('Default zone changed', 'success'); loadFirewall(); } catch (e) { showToast(e.message || 'Failed', 'error'); }
        });
        break;
      case 'toggle-masquerade':
        showConfirm((enable === 'true' ? 'Enable' : 'Disable') + ' masquerade on zone ' + zone + '?', async function () {
          try { await API.firewall.setMasquerade(zone, enable === 'true'); showToast('Masquerade updated', 'success'); loadFirewall(); } catch (e) { showToast(e.message || 'Failed', 'error'); }
        });
        break;
      case 'delete-rule':
        showConfirm('Delete rule #' + num + ' from chain ' + chain + '?', async function () {
          try { await API.firewall.deleteRule(chain, num); showToast('Rule deleted', 'success'); loadFirewall(); } catch (e) { showToast(e.message || 'Failed', 'error'); }
        });
        break;
      case 'delete-chain':
        showConfirm('Delete custom chain "' + chain + '"? Must be empty first.', async function () {
          try { await API.firewall.deleteChain(chain); showToast('Chain deleted', 'success'); loadFirewall(); } catch (e) { showToast(e.message || 'Failed', 'error'); }
        });
        break;
      case 'flush-chain':
        showConfirm('Flush ALL rules from chain "' + chain + '"? This cannot be undone.', async function () {
          try { await API.firewall.flushChain(chain); showToast('Chain flushed', 'success'); loadFirewall(); } catch (e) { showToast(e.message || 'Failed', 'error'); }
        });
        break;
      case 'export':
        fwExportRules();
        break;
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset.fwAction === 'set-policy') {
      var chain = el.dataset.fwChain;
      var target = el.value;
      showConfirm('Change ' + chain + ' policy to ' + target + '?', async function () {
        try { await API.firewall.setPolicy(chain, target); showToast('Policy changed', 'success'); loadFirewall(); } catch (e) { showToast(e.message || 'Failed', 'error'); el.value = fwData.policies[chain] || 'ACCEPT'; }
      });
    }
  });

  document.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-fw-tab]');
    if (!tab) return;
    fwView = tab.dataset.fwTab;
    renderContent();
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'fwSearchInput') {
      fwFilter = e.target.value;
      renderChains();
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'fwTemplateSelect') {
      var val = e.target.value;
      if (val) {
        document.getElementById('fwIptRule').value = val;
      }
    }
  });

  if (typeof window.fwGlobalHandlers !== 'undefined') return;
  window.fwGlobalHandlers = true;

  async function fwExportRules() {
    try {
      var text = await API.firewall.getExport();
      var blob = new Blob([text], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'firewall-export-' + new Date().toISOString().slice(0, 10) + '.txt';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Exported firewall rules', 'success');
    } catch (e) { showToast('Export failed: ' + (e.message || e), 'error'); }
  }

  window.fwSaveRules = async function () {
    try {
      var res = await API.firewall.save();
      if (res && res.ok) showToast('Rules saved to ' + (res.path || 'disk'), 'success');
      else showToast('Failed to save: ' + (res.error || 'unknown'), 'error');
    } catch (e) { showToast(e.message || 'Failed to save', 'error'); }
  };

  window.fwSubmitAddService = async function () {
    var zone = document.getElementById('fwSvcZone').value;
    var service = document.getElementById('fwSvcName').value.trim();
    if (!service) { showToast('Enter a service name', 'error'); return; }
    try {
      await API.firewall.addService(zone, service);
      document.getElementById('fwAddServiceOverlay').style.display = 'none';
      showToast('Service added', 'success');
      loadFirewall();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  window.fwSubmitAddPort = async function () {
    var zone = document.getElementById('fwPortZone').value;
    var port = document.getElementById('fwPortValue').value.trim();
    if (!port) { showToast('Enter a port (e.g. 8080/tcp)', 'error'); return; }
    try {
      await API.firewall.addPort(zone, port);
      document.getElementById('fwAddPortOverlay').style.display = 'none';
      showToast('Port added', 'success');
      loadFirewall();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  window.fwSubmitAddRichRule = async function () {
    var zone = document.getElementById('fwRichZone').value;
    var rule = document.getElementById('fwRichRule').value.trim();
    if (!rule) { showToast('Enter a rich rule', 'error'); return; }
    try {
      await API.firewall.addRichRule(zone, rule);
      document.getElementById('fwAddRichRuleOverlay').style.display = 'none';
      showToast('Rich rule added', 'success');
      loadFirewall();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  window.fwSubmitAddIptablesRule = async function () {
    var chain = document.getElementById('fwIptChain').value;
    var rule = document.getElementById('fwIptRule').value.trim();
    if (!rule) { showToast('Enter a rule', 'error'); return; }
    try {
      await API.firewall.addRule(chain, rule);
      document.getElementById('fwAddIptablesOverlay').style.display = 'none';
      showToast('Rule added', 'success');
      loadFirewall();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  window.fwSubmitEditRule = async function () {
    var chain = document.getElementById('fwEditRule').dataset.fwChain;
    var num = document.getElementById('fwEditRule').dataset.fwNum;
    var rule = document.getElementById('fwEditRule').value.trim();
    if (!rule) { showToast('Enter a rule', 'error'); return; }
    try {
      await API.firewall.replaceRule(chain, parseInt(num), rule);
      document.getElementById('fwEditRuleOverlay').style.display = 'none';
      showToast('Rule updated', 'success');
      loadFirewall();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  window.fwSubmitCreateChain = async function () {
    var chain = document.getElementById('fwNewChainName').value.trim();
    if (!chain) { showToast('Enter a chain name', 'error'); return; }
    try {
      await API.firewall.createChain(chain);
      document.getElementById('fwCreateChainOverlay').style.display = 'none';
      showToast('Chain created', 'success');
      loadFirewall();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  window.fwSubmitPolicy = async function () {
    var chain = document.getElementById('fwPolicyChain').textContent;
    var target = document.getElementById('fwPolicyTarget').value;
    try {
      await API.firewall.setPolicy(chain, target);
      document.getElementById('fwPolicyOverlay').style.display = 'none';
      showToast('Policy updated', 'success');
      loadFirewall();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  window.loadFirewall = loadFirewall;
})();
