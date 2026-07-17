var _settings = {};

window.initSettings = async function () {
  await loadSettings();
  renderSettings();
  bindSettingsEvents();
};

async function loadSettings() {
  try {
    _settings = await API.settings.get();
  } catch (e) {
    _settings = { autoUpdate: false, updateChannel: 'stable' };
  }
}

function renderSettings() {
  var container = document.getElementById('viewSettings');
  if (!container) return;

  container.innerHTML =
    '<div class="db-header">' +
      '<div class="db-header-left">' +
        '<span class="db-header-icon">⚙️</span>' +
        '<div class="db-header-info">' +
          '<div class="db-header-title">Settings</div>' +
          '<div class="db-header-subtitle">Panel configuration</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="settings-content">' +
      '<div class="settings-section">' +
        '<div class="settings-section-title">Updates</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-info">' +
            '<div class="settings-row-label">Automatic Updates</div>' +
            '<div class="settings-row-desc">Automatically install NexusPanel updates when available</div>' +
          '</div>' +
          '<label class="settings-toggle">' +
            '<input type="checkbox" id="settingsAutoUpdate" ' + (_settings.autoUpdate ? 'checked' : '') + '>' +
            '<span class="settings-toggle-slider"></span>' +
          '</label>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-info">' +
            '<div class="settings-row-label">Update Channel</div>' +
            '<div class="settings-row-desc">Release channel for updates</div>' +
          '</div>' +
          '<select id="settingsUpdateChannel" class="settings-select">' +
            '<option value="stable" ' + (_settings.updateChannel === 'stable' ? 'selected' : '') + '>Stable</option>' +
            '<option value="beta" ' + (_settings.updateChannel === 'beta' ? 'selected' : '') + '>Beta</option>' +
          '</select>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-info">' +
            '<div class="settings-row-label">Last Update Check</div>' +
            '<div class="settings-row-desc" id="settingsLastCheck">' + (_settings.lastUpdateCheck ? new Date(_settings.lastUpdateCheck).toLocaleString() : 'Never') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="settings-section">' +
        '<div class="settings-section-title">Terminal</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-info">' +
            '<div class="settings-row-label">Default Terminal Version</div>' +
            '<div class="settings-row-desc">Choose which terminal experience opens by default</div>' +
          '</div>' +
          '<select id="settingsTerminalVersion" class="settings-select">' +
            '<option value="classic" ' + (getDefaultTerminalVersion() === 'classic' ? 'selected' : '') + '>Classic Terminal</option>' +
            '<option value="pro" ' + (getDefaultTerminalVersion() === 'pro' ? 'selected' : '') + '>PRO Terminal</option>' +
          '</select>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-info">' +
            '<div class="settings-row-label">Reset Terminal Choice</div>' +
            '<div class="settings-row-desc">Clear saved preference so the chooser appears again</div>' +
          '</div>' +
          '<button class="db-btn" id="settingsResetTerminal">Reset</button>' +
        '</div>' +
      '</div>' +
      '<div class="settings-actions">' +
        '<button class="db-btn db-btn-primary" id="settingsSaveBtn" onclick="saveSettings()">Save Settings</button>' +
        '<span id="settingsSaveMsg" class="settings-save-msg" style="display:none"></span>' +
      '</div>' +
    '</div>';
}

function bindSettingsEvents() {
  var autoChk = document.getElementById('settingsAutoUpdate');
  if (autoChk) autoChk.addEventListener('change', function () {
    _settings.autoUpdate = this.checked;
  });
  var chanSel = document.getElementById('settingsUpdateChannel');
  if (chanSel) chanSel.addEventListener('change', function () {
    _settings.updateChannel = this.value;
  });
  var termVerSel = document.getElementById('settingsTerminalVersion');
  if (termVerSel) termVerSel.addEventListener('change', function () {
    localStorage.setItem('nexus-terminal-version', this.value);
  });
  var resetTermBtn = document.getElementById('settingsResetTerminal');
  if (resetTermBtn) resetTermBtn.addEventListener('click', function () {
    localStorage.removeItem('nexus-terminal-version');
    var sel = document.getElementById('settingsTerminalVersion');
    if (sel) sel.value = 'pro';
    var msg = document.getElementById('settingsSaveMsg');
    if (msg) {
      msg.textContent = '✓ Terminal choice reset. Chooser will appear next time.';
      msg.style.display = 'inline';
      msg.className = 'settings-save-msg settings-save-ok';
      setTimeout(function () { msg.style.display = 'none'; }, 3000);
    }
  });
}

function getDefaultTerminalVersion() {
  return localStorage.getItem('nexus-terminal-version') || 'pro';
}

async function saveSettings() {
  var btn = document.getElementById('settingsSaveBtn');
  var msg = document.getElementById('settingsSaveMsg');
  if (btn) btn.disabled = true;
  if (msg) { msg.style.display = 'none'; }
  try {
    var result = await API.settings.save({
      autoUpdate: document.getElementById('settingsAutoUpdate').checked,
      updateChannel: document.getElementById('settingsUpdateChannel').value,
    });
    _settings = result;
    if (msg) {
      msg.textContent = '✓ Settings saved';
      msg.style.display = 'inline';
      msg.className = 'settings-save-msg settings-save-ok';
      setTimeout(function () { msg.style.display = 'none'; }, 3000);
    }
  } catch (e) {
    if (msg) {
      msg.textContent = '✖ Failed to save: ' + (e.message || 'Unknown error');
      msg.style.display = 'inline';
      msg.className = 'settings-save-msg settings-save-err';
    }
  }
  if (btn) btn.disabled = false;
}
