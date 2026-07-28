(function () {
  var state = {
    profile: null,
    sessions: [],
    activity: [],
    activeTab: 'overview',
    loading: true,
    _toastTimer: null,
    _pendingQr: null,
    _pendingSecret: null,
  };

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $(id) { return document.getElementById(id); }

  function showToast(msg, type) {
    var el = $('prfToast');
    if (!el) return;
    if (state._toastTimer) clearTimeout(state._toastTimer);
    el.textContent = msg;
    el.className = 'prf-toast ' + (type || 'ok');
    el.style.display = 'block';
    state._toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function showLoading() {
    var el = $('profileContent');
    if (el) el.innerHTML = '<div class="db-loading">Loading profile...</div>';
  }

  function timeAgo(ts) {
    if (!ts) return 'Never';
    var diff = Date.now() - new Date(ts).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  function formatDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
  }

  function passwordStrength(pw) {
    if (!pw) return { score: 0, label: '', cls: '' };
    var score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 2) return { score: 1, label: 'Weak', cls: 'prf-strength-weak' };
    if (score <= 3) return { score: 2, label: 'Fair', cls: 'prf-strength-fair' };
    return { score: 3, label: 'Strong', cls: 'prf-strength-strong' };
  }

  function activityIcon(action) {
    if (action.indexOf('login') !== -1) return '🔑';
    if (action.indexOf('password') !== -1) return '🔒';
    if (action.indexOf('2fa') !== -1) return '🔐';
    if (action.indexOf('email') !== -1) return '📧';
    if (action.indexOf('avatar') !== -1) return '🖼️';
    if (action.indexOf('displayName') !== -1) return '👤';
    if (action.indexOf('session') !== -1) return '📱';
    if (action.indexOf('create') !== -1) return '➕';
    if (action.indexOf('delete') !== -1) return '🗑️';
    return '📋';
  }

  function activityLabel(action) {
    var map = {
      'profile.password.change': 'Password changed',
      'profile.email.update': 'Email updated',
      'profile.2fa.enable': 'Two-factor authentication enabled',
      'profile.2fa.disable': 'Two-factor authentication disabled',
      'profile.avatar.upload': 'Avatar uploaded',
      'profile.avatar.remove': 'Avatar removed',
      'profile.displayName.update': 'Display name updated',
      'profile.session.revoke': 'Session revoked',
    };
    return map[action] || action;
  }

  var TABS = [
    { id: 'overview', label: 'Overview', icon: '👤' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'sessions', label: 'Sessions', icon: '📱' },
    { id: 'activity', label: 'Activity', icon: '📋' },
  ];

  function renderTabBar() {
    var h = '<div class="prf-tab-bar">';
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      h += '<div class="prf-tab-item' + (state.activeTab === t.id ? ' active' : '') + '" data-action="switchTab" data-tab="' + t.id + '">' + esc(t.icon) + ' ' + esc(t.label) + '</div>';
    }
    h += '</div>';
    return h;
  }

  function renderOverview() {
    var p = state.profile;
    if (!p) return '<div class="prf-empty">Profile not loaded</div>';
    var h = '';
    h += '<div class="prf-section">';
    h += '<div class="prf-avatar-section">';
    h += '<div class="prf-avatar">';
    if (p.hasAvatar) {
      h += '<img src="/api/profile/avatar?t=' + Date.now() + '" alt="Avatar">';
    } else {
      h += esc((p.displayName || p.username || '?').charAt(0).toUpperCase());
    }
    h += '<div class="prf-avatar-overlay" data-action="uploadAvatar"><span>Change</span></div>';
    h += '</div>';
    h += '<div>';
    h += '<div class="prf-name-display">' + esc(p.displayName || p.username) + '</div>';
    h += '<div class="prf-name-username">@' + esc(p.username) + '</div>';
    h += '<div style="display:flex;gap:8px;margin-top:8px">';
    h += '<button class="prf-edit-btn" data-action="editDisplayName">Edit Name</button>';
    if (p.hasAvatar) h += '<button class="prf-edit-btn" data-action="removeAvatar">Remove Photo</button>';
    h += '</div>';
    h += '</div>';
    h += '</div>';
    h += '</div>';

    h += '<div class="prf-section"><div class="prf-section-title">Account Details</div>';
    h += '<div class="prf-info-grid">';
    h += '<div class="prf-info-card"><div class="prf-info-label">Email</div><div class="prf-info-value">' + esc(p.email || 'Not set') + '</div></div>';
    h += '<div class="prf-info-card"><div class="prf-info-label">Role</div><div class="prf-info-value"><span class="prf-badge prf-badge-' + esc(p.role) + '">' + esc(p.role) + '</span></div></div>';
    h += '<div class="prf-info-card"><div class="prf-info-label">Created</div><div class="prf-info-value">' + formatDate(p.createdAt) + '</div></div>';
    h += '<div class="prf-info-card"><div class="prf-info-label">Last Login</div><div class="prf-info-value">' + timeAgo(p.lastLoginAt) + '</div></div>';
    h += '<div class="prf-info-card"><div class="prf-info-label">2FA</div><div class="prf-info-value">' + (p.twoFactorEnabled ? '<span style="color:var(--accent-green)">Enabled</span>' : '<span style="color:var(--text-tertiary)">Disabled</span>') + '</div></div>';
    h += '<div class="prf-info-card"><div class="prf-info-label">Username</div><div class="prf-info-value" style="font-family:var(--font-mono)">@' + esc(p.username) + '</div></div>';
    h += '</div></div>';

    h += '<div class="prf-section"><div class="prf-section-title">Email Address</div><div class="prf-section-desc">Update the email associated with your account</div>';
    h += '<div class="prf-row"><div class="prf-row-info"><div class="prf-row-label">' + esc(p.email || 'No email set') + '</div></div>';
    h += '<div style="display:flex;gap:8px;align-items:center">';
    h += '<input type="email" class="prf-input" id="prfEmailInput" placeholder="New email address" style="max-width:240px">';
    h += '<button class="db-btn db-btn-primary" data-action="updateEmail">Update</button>';
    h += '</div></div></div>';

    return h;
  }

  function renderSecurity() {
    var p = state.profile;
    if (!p) return '';
    var h = '';

    h += '<div class="prf-section"><div class="prf-section-title">Change Password</div><div class="prf-section-desc">Ensure your password is strong and unique</div>';
    h += '<div class="prf-row"><div class="prf-row-info"><div class="prf-row-label">Current Password</div></div>';
    h += '<input type="password" class="prf-input" id="prfCurrentPass" placeholder="Current password" autocomplete="current-password"></div>';
    h += '<div class="prf-row"><div class="prf-row-info"><div class="prf-row-label">New Password</div><div class="prf-row-desc" id="prfStrengthLabel"></div></div>';
    h += '<div style="flex-shrink:0;width:280px"><input type="password" class="prf-input" id="prfNewPass" placeholder="New password (min 8 chars)" style="width:100%;max-width:none" autocomplete="new-password"><div class="prf-strength-bar"><div class="prf-strength-fill" id="prfStrengthBar"></div></div></div></div>';
    h += '<div class="prf-row"><div class="prf-row-info"><div class="prf-row-label">Confirm Password</div></div>';
    h += '<input type="password" class="prf-input" id="prfConfirmPass" placeholder="Confirm new password" autocomplete="new-password"></div>';
    h += '<div class="prf-actions"><button class="db-btn db-btn-primary" data-action="changePassword">Change Password</button></div>';
    h += '</div>';

    h += '<div class="prf-section"><div class="prf-section-title">Two-Factor Authentication</div><div class="prf-section-desc">Add an extra layer of security with TOTP (Google Authenticator, Authy, etc.)</div>';

    if (p.twoFactorEnabled) {
      h += '<div class="prf-2fa-status active"><span class="set-health-dot running"></span><span style="font-weight:600;color:var(--accent-green)">Two-factor authentication is active</span></div>';
      h += '<div class="prf-row"><div class="prf-row-info"><div class="prf-row-label">Disable 2FA</div><div class="prf-row-desc">Enter your password or 6-digit code to disable</div></div>';
      h += '<div style="display:flex;gap:8px;align-items:center">';
      h += '<input type="password" class="prf-2fa-input" id="prfDisable2FA" placeholder="Password or code" style="width:180px;letter-spacing:normal;font-size:13px;text-align:left">';
      h += '<button class="db-btn" data-action="disable2FA" style="color:var(--accent-red);border-color:rgba(239,68,68,0.3)">Disable</button>';
      h += '</div></div>';
    } else if (state._pendingQr) {
      h += '<div class="prf-2fa-layout">';
      h += '<div class="prf-2fa-qr"><img src="' + esc(state._pendingQr) + '" alt="2FA QR Code"></div>';
      h += '<div class="prf-2fa-area">';
      h += '<div class="prf-row-desc" style="margin-bottom:8px">Or enter this secret key manually:</div>';
      h += '<code class="prf-2fa-secret">' + esc(state._pendingSecret) + '</code>';
      h += '<div class="prf-row-desc" style="margin:12px 0 8px">Enter the 6-digit code from your app to verify:</div>';
      h += '<div style="display:flex;gap:10px;align-items:center">';
      h += '<input type="text" class="prf-2fa-input" id="prfVerifyCode" placeholder="000000" maxlength="6" inputmode="numeric" pattern="[0-9]*">';
      h += '<button class="db-btn db-btn-primary" data-action="verify2FA">Verify & Enable</button>';
      h += '</div></div></div>';
    } else {
      h += '<div class="prf-2fa-status inactive"><span style="color:var(--text-tertiary)">Two-factor authentication is not enabled</span></div>';
      h += '<div class="prf-actions"><button class="db-btn db-btn-primary" data-action="setup2FA">Enable 2FA</button></div>';
    }
    h += '</div>';

    return h;
  }

  function renderSessions() {
    var h = '';
    h += '<div class="prf-section"><div class="prf-section-title">API Tokens</div><div class="prf-section-desc">Manage API access tokens for integrations</div>';
    if (state.sessions.length === 0) {
      h += '<div class="prf-empty">No active API tokens</div>';
    } else {
      h += '<table class="prf-session-table"><thead><tr><th>Label</th><th>Scope</th><th>Created</th><th>Last Used</th><th></th></tr></thead><tbody>';
      for (var i = 0; i < state.sessions.length; i++) {
        var s = state.sessions[i];
        h += '<tr>';
        h += '<td><div class="prf-session-label">' + esc(s.label || 'Token') + '</div><div class="prf-session-meta">' + esc(s.prefix || '') + '</div></td>';
        h += '<td><span class="prf-badge prf-badge-' + esc(s.scope) + '">' + esc(s.scope) + '</span></td>';
        h += '<td style="font-size:12px;color:var(--text-tertiary)">' + formatDate(s.createdAt) + '</td>';
        h += '<td style="font-size:12px;color:var(--text-tertiary)">' + (s.lastUsed ? timeAgo(s.lastUsed) : 'Never') + '</td>';
        h += '<td><button class="db-btn db-btn-sm" data-action="revokeSession" data-token-id="' + esc(s.id) + '">Revoke</button></td>';
        h += '</tr>';
      }
      h += '</tbody></table>';
    }
    h += '</div>';
    return h;
  }

  function renderActivity() {
    var h = '';
    h += '<div class="prf-section"><div class="prf-section-title">Recent Activity</div><div class="prf-section-desc">Your recent account actions</div>';
    if (state.activity.length === 0) {
      h += '<div class="prf-empty">No recent activity</div>';
    } else {
      h += '<div class="prf-activity-list">';
      for (var i = 0; i < state.activity.length; i++) {
        var a = state.activity[i];
        h += '<div class="prf-activity-item">';
        h += '<div class="prf-activity-icon">' + activityIcon(a.action) + '</div>';
        h += '<div class="prf-activity-text">' + activityLabel(a.action) + '</div>';
        h += '<div class="prf-activity-time">' + timeAgo(a.timestamp) + '</div>';
        h += '</div>';
      }
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function renderActiveTab() {
    var el = $('profileContent');
    if (!el) return;
    var h = renderTabBar();
    h += '<div class="prf-tab-content">';
    switch (state.activeTab) {
      case 'overview': h += renderOverview(); break;
      case 'security': h += renderSecurity(); break;
      case 'sessions': h += renderSessions(); break;
      case 'activity': h += renderActivity(); break;
    }
    h += '</div>';
    el.innerHTML = h;
    bindTabEvents();
  }

  function bindTabEvents() {
    var newPass = $('prfNewPass');
    if (newPass) {
      newPass.addEventListener('input', function () {
        var str = passwordStrength(this.value);
        var bar = $('prfStrengthBar');
        var label = $('prfStrengthLabel');
        if (bar) {
          bar.className = 'prf-strength-fill' + (str.score ? ' ' + str.cls : '');
        }
        if (label) {
          label.textContent = str.label;
          label.style.color = str.score === 1 ? 'var(--accent-red)' : str.score === 2 ? 'var(--accent-gold)' : str.score === 3 ? 'var(--accent-green)' : '';
        }
      });
    }
  }

  async function loadInitial() {
    state.loading = true;
    showLoading();
    try {
      var results = await Promise.all([
        API.profile.get(),
        API.profile.sessions(),
        API.profile.activity(20),
      ]);
      state.profile = results[0];
      state.sessions = results[1].sessions || [];
      state.activity = results[2].activity || [];
      var sub = $('prfHeaderSub');
      if (sub) sub.textContent = state.profile.displayName || state.profile.username;
    } catch (e) {
      state.profile = { username: 'unknown', displayName: 'Unknown', email: '', role: 'user', twoFactorEnabled: false };
      state.sessions = [];
      state.activity = [];
      showToast('Failed to load profile: ' + (e.message || 'Unknown error'), 'err');
    }
    state.loading = false;
    renderActiveTab();
  }

  function handleClick(action, el) {
    switch (action) {
      case 'switchTab':
        state.activeTab = el.getAttribute('data-tab');
        renderActiveTab();
        break;
      case 'editDisplayName':
        var overlay = $('prfNameOverlay');
        var input = $('prfNameInput');
        if (overlay) {
          overlay.style.display = 'flex';
          if (input) { input.value = state.profile.displayName || ''; input.focus(); }
        }
        break;
      case 'closeNameModal':
        var overlay = $('prfNameOverlay');
        if (overlay) overlay.style.display = 'none';
        break;
      case 'saveDisplayName':
        saveDisplayName();
        break;
      case 'uploadAvatar':
        var fileInput = $('prfAvatarInput');
        if (fileInput) fileInput.click();
        break;
      case 'removeAvatar':
        removeAvatar();
        break;
      case 'updateEmail':
        updateEmail();
        break;
      case 'changePassword':
        changePassword();
        break;
      case 'setup2FA':
        setup2FA();
        break;
      case 'verify2FA':
        verify2FA();
        break;
      case 'disable2FA':
        disable2FA();
        break;
      case 'revokeSession':
        var tokenId = el.getAttribute('data-token-id');
        if (tokenId) revokeSession(tokenId);
        break;
    }
  }

  async function saveDisplayName() {
    var input = $('prfNameInput');
    var name = input ? input.value.trim() : '';
    if (!name || name.length < 1) { showToast('Display name required', 'err'); return; }
    if (name.length > 64) { showToast('Display name too long (max 64 chars)', 'err'); return; }
    try {
      await API.profile.updateDisplayName(name);
      state.profile.displayName = name;
      var overlay = $('prfNameOverlay');
      if (overlay) overlay.style.display = 'none';
      renderActiveTab();
      showToast('Display name updated', 'ok');
    } catch (e) {
      showToast('Failed: ' + (e.message || 'Unknown error'), 'err');
    }
  }

  function handleAvatarUpload(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 512 * 1024) { showToast('Image too large (max 512KB)', 'err'); return; }
    if (!file.type.startsWith('image/')) { showToast('Invalid file type', 'err'); return; }
    var reader = new FileReader();
    reader.onload = async function (ev) {
      try {
        await API.profile.uploadAvatar(ev.target.result);
        state.profile.hasAvatar = true;
        renderActiveTab();
        showToast('Avatar uploaded', 'ok');
      } catch (err) {
        showToast('Failed: ' + (err.message || 'Unknown error'), 'err');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function removeAvatar() {
    try {
      await API.profile.removeAvatar();
      state.profile.hasAvatar = false;
      renderActiveTab();
      showToast('Avatar removed', 'ok');
    } catch (e) {
      showToast('Failed: ' + (e.message || 'Unknown error'), 'err');
    }
  }

  async function updateEmail() {
    var input = $('prfEmailInput');
    var email = input ? input.value.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Valid email required', 'err'); return; }
    try {
      await API.profile.updateEmail(email);
      state.profile.email = email;
      renderActiveTab();
      showToast('Email updated', 'ok');
    } catch (e) {
      showToast('Failed: ' + (e.message || 'Unknown error'), 'err');
    }
  }

  async function changePassword() {
    var current = $('prfCurrentPass');
    var newPass = $('prfNewPass');
    var confirm = $('prfConfirmPass');
    var cur = current ? current.value : '';
    var np = newPass ? newPass.value : '';
    var cp = confirm ? confirm.value : '';
    if (!cur || !np) { showToast('Fill in all password fields', 'err'); return; }
    if (np.length < 8) { showToast('New password must be at least 8 characters', 'err'); return; }
    if (np !== cp) { showToast('Passwords do not match', 'err'); return; }
    try {
      await API.profile.updatePassword({ currentPassword: cur, newPassword: np });
      showToast('Password changed successfully', 'ok');
      if (current) current.value = '';
      if (newPass) newPass.value = '';
      if (confirm) confirm.value = '';
      var bar = $('prfStrengthBar');
      var label = $('prfStrengthLabel');
      if (bar) bar.className = 'prf-strength-fill';
      if (label) label.textContent = '';
    } catch (e) {
      showToast('Failed: ' + (e.message || 'Unknown error'), 'err');
    }
  }

  async function setup2FA() {
    try {
      var res = await API.profile.setup2FA();
      state._pendingQr = res.qrCode;
      state._pendingSecret = res.secret;
      renderActiveTab();
    } catch (e) {
      showToast('Failed: ' + (e.message || 'Unknown error'), 'err');
    }
  }

  async function verify2FA() {
    var input = $('prfVerifyCode');
    var code = input ? input.value.trim() : '';
    if (!code || code.length !== 6) { showToast('Enter a valid 6-digit code', 'err'); return; }
    try {
      await API.profile.verify2FA(code);
      state.profile.twoFactorEnabled = true;
      state._pendingQr = null;
      state._pendingSecret = null;
      renderActiveTab();
      showToast('2FA enabled successfully', 'ok');
    } catch (e) {
      showToast('Failed: ' + (e.message || 'Unknown error'), 'err');
    }
  }

  async function disable2FA() {
    var input = $('prfDisable2FA');
    var value = input ? input.value.trim() : '';
    if (!value) { showToast('Enter your password or 6-digit code', 'err'); return; }
    var body = /^\d{6}$/.test(value) ? { token: value } : { password: value };
    try {
      await API.profile.disable2FA(body);
      state.profile.twoFactorEnabled = false;
      renderActiveTab();
      showToast('2FA disabled', 'ok');
    } catch (e) {
      showToast('Failed: ' + (e.message || 'Unknown error'), 'err');
    }
  }

  async function revokeSession(tokenId) {
    if (!confirm('Revoke this token? This cannot be undone.')) return;
    try {
      await API.profile.revokeSession(tokenId);
      state.sessions = state.sessions.filter(function (s) { return s.id !== tokenId; });
      renderActiveTab();
      showToast('Token revoked', 'ok');
    } catch (e) {
      showToast('Failed: ' + (e.message || 'Unknown error'), 'err');
    }
  }

  window.initProfile = async function () {
    var container = $('profileContent');
    if (container && !container._prfBound) {
      container._prfBound = true;
      container.addEventListener('click', function (e) {
        var el = e.target.closest('[data-action]');
        if (el) {
          e.preventDefault();
          handleClick(el.getAttribute('data-action'), el);
        }
      });
    }
    var fileInput = $('prfAvatarInput');
    if (fileInput && !fileInput._prfBound) {
      fileInput._prfBound = true;
      fileInput.addEventListener('change', handleAvatarUpload);
    }
    await loadInitial();
  };
})();
