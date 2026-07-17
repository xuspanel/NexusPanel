let ws = null;
let termInit = false;
let nanoMode = false;
let currentVersion = 'classic';
let proFontSize = 14;
let activeThemeName = 'catppuccin';
let tabCounter = 0;
let paneCounter = 0;
let tabs = [];
let activeTabId = null;
let searchOpen = false;
let commandPaletteOpen = false;
let presetsCache = [];
let editingPresetId = null;

const VERSION_KEY = 'nexus-terminal-version';
const PRO_FONT_KEY = 'nexus-terminal-pro-font';
const PRO_THEME_KEY = 'nexus-terminal-pro-theme';
const PRO_TABS_KEY = 'nexus-terminal-pro-tabs';

const PRESET_CATEGORIES = ['System', 'Docker', 'Files', 'Network', 'Database', 'Custom'];
const PRESET_ICONS = {
  System: '&#x2699;',
  Docker: '&#x1F433;',
  Files: '&#x1F4C1;',
  Network: '&#x1F310;',
  Database: '&#x1F4BE;',
  Custom: '&#x2726;',
};

const NANO_ACTIONS = [
  { label: 'Save', keys: '^O', ctrl: 'o', desc: 'WriteOut' },
  { label: 'Exit', keys: '^X', ctrl: 'x', desc: 'Exit' },
  { label: 'Cut', keys: '^K', ctrl: 'k', desc: 'Cut Text' },
  { label: 'Uncut', keys: '^U', ctrl: 'u', desc: 'Paste' },
  { label: 'Where', keys: '^W', ctrl: 'w', desc: 'Search' },
  { label: 'Cancel', keys: '^C', ctrl: 'c', desc: 'Cancel' },
  { label: 'Go To', keys: '^_', ctrl: '_', desc: 'Go To Line' },
  { label: 'Speller', keys: '^T', ctrl: 't', desc: 'Spell Check' },
  { label: 'Justify', keys: '^J', ctrl: 'j', desc: 'Justify' },
  { label: 'Read', keys: '^R', ctrl: 'r', desc: 'Read File' },
  { label: 'PrevPg', keys: '^Y', ctrl: 'y', desc: 'Prev Page' },
  { label: 'NextPg', keys: '^V', ctrl: 'v', desc: 'Next Page' },
  { label: 'Help', keys: '^G', ctrl: 'g', desc: 'Help' },
];

const TERM_THEMES = {
  catppuccin: {
    background: '#0c0e17',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#45475a',
    black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
    blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
    brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5', brightWhite: '#a6adc8',
  },
  dracula: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selectionBackground: '#44475a',
    black: '#000000', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#bfbfbf',
    brightBlack: '#4d4d4d', brightRed: '#ff6e67', brightGreen: '#5af78e',
    brightYellow: '#f4f99d', brightBlue: '#caa9fa', brightMagenta: '#ff92d0',
    brightCyan: '#9aedfe', brightWhite: '#e6e6e6',
  },
  solarizedDark: {
    background: '#002b36',
    foreground: '#839496',
    cursor: '#93a1a1',
    selectionBackground: '#073642',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75',
    brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  solarizedLight: {
    background: '#fdf6e3',
    foreground: '#657b83',
    cursor: '#586e75',
    selectionBackground: '#eee8d5',
    black: '#002b36', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#073642', brightRed: '#cb4b16', brightGreen: '#93a1a1',
    brightYellow: '#839496', brightBlue: '#657b83', brightMagenta: '#6c71c4',
    brightCyan: '#586e75', brightWhite: '#fdf6e3',
  },
  oneDark: {
    background: '#282c34',
    foreground: '#abb2bf',
    cursor: '#528bff',
    selectionBackground: '#3e4451',
    black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
    brightBlack: '#545862', brightRed: '#e06c75', brightGreen: '#98c379',
    brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
    brightCyan: '#56b6c2', brightWhite: '#c8ccd4',
  },
  nord: {
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#d8dee9',
    selectionBackground: '#434c5e',
    black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
    blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb', brightWhite: '#eceff4',
  },
};

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getSelectedVersion() {
  return localStorage.getItem(VERSION_KEY);
}

function setSelectedVersion(version, persist) {
  currentVersion = version;
  if (persist !== false) {
    localStorage.setItem(VERSION_KEY, version);
  }
  updateVersionToggle();
}

function updateVersionToggle() {
  document.querySelectorAll('.term-version-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.version === currentVersion);
  });
}

function showTermChooser() {
  const modal = document.getElementById('termChooserModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const remember = document.getElementById('termChooserRemember');
  if (remember) remember.checked = true;
}

function hideTermChooser() {
  const modal = document.getElementById('termChooserModal');
  if (modal) modal.style.display = 'none';
}

function chooseTerminalVersion(version) {
  const remember = document.getElementById('termChooserRemember');
  setSelectedVersion(version, remember ? remember.checked : true);
  hideTermChooser();
  applyTerminalVersion();
}

function initVersionToggle() {
  const toggle = document.getElementById('termVersionToggle');
  if (!toggle) return;
  toggle.querySelectorAll('.term-version-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const version = btn.dataset.version;
      if (version === currentVersion) return;
      setSelectedVersion(version);
      applyTerminalVersion();
    });
  });

  document.querySelectorAll('.term-chooser-card').forEach(card => {
    card.addEventListener('click', () => {
      chooseTerminalVersion(card.dataset.version);
    });
  });
}

async function initTerminal() {
  if (!termInit) {
    termInit = true;
    proFontSize = parseInt(localStorage.getItem(PRO_FONT_KEY), 10) || 14;
    activeThemeName = localStorage.getItem(PRO_THEME_KEY) || 'catppuccin';
    initVersionToggle();
    initClassicEvents();
    initProEvents();
    initCommandPalette();
    initSearchBar();
  }

  const saved = getSelectedVersion();
  if (!saved) {
    showTermChooser();
    return;
  }
  setSelectedVersion(saved);
  applyTerminalVersion();
}

function applyTerminalVersion() {
  cleanupTabs();
  if (currentVersion === 'pro') {
    showProShell();
    createInitialTab();
  } else {
    showClassicShell();
    createClassicTab();
  }
}

function showClassicShell() {
  const classic = document.getElementById('termContent');
  const pro = document.getElementById('termProContent');
  if (classic) classic.style.display = 'flex';
  if (pro) pro.style.display = 'none';
}

function showProShell() {
  const classic = document.getElementById('termContent');
  const pro = document.getElementById('termProContent');
  if (classic) classic.style.display = 'none';
  if (pro) pro.style.display = 'flex';
}

function cleanupTabs() {
  tabs.forEach(tab => {
    tab.panes.forEach(pane => {
      try { pane.term.dispose(); } catch (_) {}
    });
    if (tab.element && tab.element.parentNode) tab.element.parentNode.removeChild(tab.element);
  });
  tabs = [];
  activeTabId = null;
  closeCommandPalette();
  closeSearchBar();
  closeAutocomplete();
  updateProTabs();
}

function initClassicEvents() {
  const presetToggle = document.getElementById('termPresetToggle');
  if (presetToggle) {
    presetToggle.addEventListener('click', () => {
      document.getElementById('termPresetPanel').classList.toggle('open');
    });
  }
  const nanoToggle = document.getElementById('termNanoToggle');
  if (nanoToggle) {
    nanoToggle.addEventListener('click', () => {
      nanoMode = !nanoMode;
      document.getElementById('termNanoBar').classList.toggle('open', nanoMode);
      if (nanoMode) document.getElementById('termPresetPanel').classList.remove('open');
    });
  }
  const reconnect = document.getElementById('termReconnectBtn');
  if (reconnect) reconnect.addEventListener('click', reconnectTerminal);
  const reconnect2 = document.getElementById('termReconnectBtn2');
  if (reconnect2) reconnect2.addEventListener('click', reconnectTerminal);
  const clearBtn = document.getElementById('termClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearActiveTerminal);
  const addPreset = document.getElementById('termAddPresetBtn');
  if (addPreset) addPreset.addEventListener('click', () => showAddPreset(''));
  const cancelPreset = document.getElementById('termPresetCancel');
  if (cancelPreset) cancelPreset.addEventListener('click', hidePresetForm);
  const savePresetBtn = document.getElementById('termPresetSave');
  if (savePresetBtn) savePresetBtn.addEventListener('click', savePreset);
  const presetSearch = document.getElementById('termPresetSearch');
  if (presetSearch) presetSearch.addEventListener('input', () => filterPresets(''));
  const nanoClose = document.getElementById('termNanoClose');
  if (nanoClose) {
    nanoClose.addEventListener('click', () => {
      nanoMode = false;
      document.getElementById('termNanoBar').classList.remove('open');
    });
  }

  document.querySelectorAll('.term-nano-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!termReady()) return;
      const ctrl = btn.dataset.ctrl;
      if (!ctrl) return;
      const codes = { o: 15, x: 24, k: 11, u: 21, w: 23, c: 3, _: 31, t: 20, j: 10, r: 18, y: 25, v: 22, g: 7 };
      const code = codes[ctrl];
      if (code !== undefined && ws && ws.readyState === WebSocket.OPEN) {
        const pane = getActivePane();
        ws.send(JSON.stringify({ type: 'input', paneId: pane ? pane.id : null, data: btoa(String.fromCharCode(code)) }));
        focusActiveTerminal();
      }
    });
  });
}

function initProEvents() {
  const clearBtn = document.getElementById('termProClear');
  if (clearBtn) clearBtn.addEventListener('click', clearActiveTerminal);
  const reconnect = document.getElementById('termProReconnect');
  if (reconnect) reconnect.addEventListener('click', reconnectTerminal);
  const downloadBtn = document.getElementById('termProDownload');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadActiveBuffer);
  const splitH = document.getElementById('termProSplitH');
  if (splitH) splitH.addEventListener('click', () => splitActivePane('horizontal'));
  const splitV = document.getElementById('termProSplitV');
  if (splitV) splitV.addEventListener('click', () => splitActivePane('vertical'));
  const closePane = document.getElementById('termProClosePane');
  if (closePane) closePane.addEventListener('click', closeActivePane);
  const presetToggle = document.getElementById('termProPresets');
  if (presetToggle) {
    presetToggle.addEventListener('click', () => {
      document.getElementById('termProPresetPanel').classList.toggle('open');
    });
  }
  const addPreset = document.getElementById('termProAddPresetBtn');
  if (addPreset) addPreset.addEventListener('click', () => showAddPreset('pro'));
  const cancelPreset = document.getElementById('termProPresetCancel');
  if (cancelPreset) cancelPreset.addEventListener('click', hidePresetForm);
  const savePresetBtn = document.getElementById('termProPresetSave');
  if (savePresetBtn) savePresetBtn.addEventListener('click', savePreset);
  const presetSearch = document.getElementById('termProPresetSearch');
  if (presetSearch) presetSearch.addEventListener('input', () => filterPresets('pro'));

  const fontInc = document.getElementById('termProFontInc');
  if (fontInc) fontInc.addEventListener('click', () => adjustProFontSize(1));
  const fontDec = document.getElementById('termProFontDec');
  if (fontDec) fontDec.addEventListener('click', () => adjustProFontSize(-1));

  const palette = document.getElementById('termProPalette');
  if (palette) palette.addEventListener('click', toggleCommandPalette);
  const search = document.getElementById('termProSearch');
  if (search) search.addEventListener('click', toggleSearchBar);
  const theme = document.getElementById('termProTheme');
  if (theme) theme.addEventListener('click', toggleThemePicker);

  const addTab = document.getElementById('termProAddTab');
  if (addTab) addTab.addEventListener('click', () => createProTab());

  const mobileMenu = document.getElementById('termProMobileMenu');
  if (mobileMenu) {
    mobileMenu.addEventListener('click', toggleMobileToolbar);
  }

  window.addEventListener('resize', () => {
    if (currentVersion === 'pro') {
      tabs.forEach(tab => {
        tab.panes.forEach(pane => {
          try { pane.fitAddon && pane.fitAddon.fit(); } catch (_) {}
        });
      });
    } else {
      const tab = tabs[0];
      if (tab && tab.panes[0]) {
        try { tab.panes[0].fitAddon && tab.panes[0].fitAddon.fit(); } catch (_) {}
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      if (currentVersion === 'pro') toggleCommandPalette();
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      if (currentVersion === 'pro' && !isTypingInInput()) {
        e.preventDefault();
        toggleSearchBar();
      }
    }
    if (e.key === 'Escape') {
      closeCommandPalette();
      closeSearchBar();
      closeAutocomplete();
    }
  });

  document.addEventListener('click', (e) => {
    const picker = document.getElementById('termThemePicker');
    const themeBtn = document.getElementById('termProTheme');
    if (picker && picker.style.display === 'block' && !picker.contains(e.target) && e.target !== themeBtn) {
      picker.style.display = 'none';
    }
    const mobileMenu = document.getElementById('termProMobileMenu');
    const toolbar = document.querySelector('.term-pro-toolbar');
    if (toolbar && !toolbar.contains(e.target) && e.target !== mobileMenu) {
      toolbar.classList.remove('mobile-open');
    }
  });
}

function toggleMobileToolbar() {
  const toolbar = document.querySelector('.term-pro-toolbar');
  if (toolbar) toolbar.classList.toggle('mobile-open');
}

function isTypingInInput() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId);
}

function getActivePane() {
  const tab = getActiveTab();
  if (!tab) return null;
  return tab.panes.find(p => p.id === tab.activePaneId) || tab.panes[tab.panes.length - 1];
}

function termReady() {
  const pane = getActivePane();
  return pane && pane.ready;
}

function getActiveTerm() {
  const pane = getActivePane();
  return pane ? pane.term : null;
}

function focusActiveTerminal() {
  const pane = getActivePane();
  if (pane && pane.term) pane.term.focus();
}

function clearActiveTerminal() {
  const pane = getActivePane();
  if (pane && pane.term) pane.term.clear();
}

function reconnectTerminal() {
  applyTerminalVersion();
}

function adjustProFontSize(delta) {
  proFontSize = Math.max(10, Math.min(24, proFontSize + delta));
  localStorage.setItem(PRO_FONT_KEY, proFontSize);
  tabs.forEach(tab => {
    tab.panes.forEach(pane => {
      if (pane.term) pane.term.options.fontSize = proFontSize;
      try { pane.fitAddon && pane.fitAddon.fit(); } catch (_) {}
    });
  });
  updateProStatusDims();
}

function downloadActiveBuffer() {
  const pane = getActivePane();
  if (!pane || !pane.term) return;
  const buffer = pane.term.buffer.active;
  const lines = [];
  for (let i = 0; i < buffer.length; i++) {
    lines.push(buffer.getLine(i).translateToString(true));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const tab = getActiveTab();
  a.download = `terminal-${(tab ? tab.name : 'session').replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

async function loadPresets() {
  try {
    presetsCache = await API.terminal.presets();
    renderTermPresets(presetsCache, '');
    renderTermPresets(presetsCache, 'pro');
  } catch (_) {
    presetsCache = [];
  }
}

function renderTermPresets(presets, suffix) {
  const listId = suffix === 'pro' ? 'termProPresetList' : 'termPresetList';
  const list = document.getElementById(listId);
  if (!list) return;

  if (suffix === 'pro') {
    list.innerHTML = PRESET_CATEGORIES.map(cat => {
      const items = presets.filter(p => p.category === cat);
      if (!items.length) return '';
      return `
        <div class="term-preset-group" data-category="${escHtml(cat)}">
          <div class="term-preset-group-header">
            <span class="term-preset-group-icon">${PRESET_ICONS[cat] || '&#x2726;'}</span>
            <span class="term-preset-group-name">${escHtml(cat)}</span>
            <span class="term-preset-group-count">${items.length}</span>
          </div>
          <div class="term-preset-group-items">
            ${items.map(p => renderPresetItem(p)).join('')}
          </div>
        </div>
      `;
    }).join('');
  } else {
    list.innerHTML = presets.map(p => renderPresetItem(p)).join('');
  }

  list.querySelectorAll('.term-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      if (termReady() && ws && ws.readyState === WebSocket.OPEN) {
        const pane = getActivePane();
        ws.send(JSON.stringify({ type: 'input', paneId: pane ? pane.id : null, data: btoa(cmd + '\n') }));
        focusActiveTerminal();
      }
    });
  });

  list.querySelectorAll('.term-preset-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editPreset(btn.dataset.id);
    });
  });

  list.querySelectorAll('.term-preset-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Delete this preset?')) {
        await API.terminal.deletePreset(btn.dataset.id);
        await loadPresets();
      }
    });
  });

  list.querySelectorAll('.term-preset-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.parentElement;
      group.classList.toggle('collapsed');
    });
  });
}

function renderPresetItem(p) {
  return `
    <div class="term-preset-item" data-id="${escHtml(p.id)}">
      <button class="term-preset-btn" data-cmd="${escHtml(p.cmd)}" title="${escHtml(p.cmd)}">${escHtml(p.label)}</button>
      <button class="term-preset-edit" data-id="${escHtml(p.id)}" title="Edit preset">&#x270E;</button>
      <button class="term-preset-del" data-id="${escHtml(p.id)}" title="Delete preset">&times;</button>
    </div>
  `;
}

function filterPresets(suffix) {
  const searchId = suffix === 'pro' ? 'termProPresetSearch' : 'termPresetSearch';
  const input = document.getElementById(searchId);
  const q = input ? input.value.toLowerCase() : '';
  const listId = suffix === 'pro' ? 'termProPresetList' : 'termPresetList';
  const list = document.getElementById(listId);
  if (!list) return;

  if (suffix === 'pro') {
    list.querySelectorAll('.term-preset-group').forEach(group => {
      let visible = 0;
      group.querySelectorAll('.term-preset-item').forEach(el => {
        const btn = el.querySelector('.term-preset-btn');
        const match = !q || (btn && (btn.textContent.toLowerCase().includes(q) || btn.title.toLowerCase().includes(q)));
        el.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      group.style.display = visible ? '' : 'none';
    });
  } else {
    document.querySelectorAll('#' + listId + ' .term-preset-item').forEach(el => {
      const btn = el.querySelector('.term-preset-btn');
      el.style.display = btn && (btn.textContent.toLowerCase().includes(q) || btn.title.toLowerCase().includes(q)) ? '' : 'none';
    });
  }
}

function showAddPreset(suffix) {
  editingPresetId = null;
  const formId = suffix === 'pro' ? 'termProPresetForm' : 'termPresetForm';
  const labelId = suffix === 'pro' ? 'termProPresetLabel' : 'termPresetLabel';
  const cmdId = suffix === 'pro' ? 'termProPresetCmd' : 'termPresetCmd';
  const catId = suffix === 'pro' ? 'termProPresetCategory' : 'termPresetCategory';
  const saveId = suffix === 'pro' ? 'termProPresetSave' : 'termPresetSave';
  document.getElementById(formId).classList.add('open');
  document.getElementById(labelId).value = '';
  document.getElementById(cmdId).value = '';
  document.getElementById(catId).value = 'Custom';
  document.getElementById(saveId).textContent = 'Save';
  document.getElementById(labelId).focus();
}

function editPreset(id) {
  const p = presetsCache.find(x => x.id === id);
  if (!p) return;
  editingPresetId = id;
  const suffix = currentVersion === 'pro' ? 'pro' : '';
  const formId = suffix ? 'termProPresetForm' : 'termPresetForm';
  const labelId = suffix ? 'termProPresetLabel' : 'termPresetLabel';
  const cmdId = suffix ? 'termProPresetCmd' : 'termPresetCmd';
  const catId = suffix ? 'termProPresetCategory' : 'termPresetCategory';
  const saveId = suffix ? 'termProPresetSave' : 'termPresetSave';
  document.getElementById(formId).classList.add('open');
  document.getElementById(labelId).value = p.label;
  document.getElementById(cmdId).value = p.cmd;
  document.getElementById(catId).value = p.category || 'Custom';
  document.getElementById(saveId).textContent = 'Update';
  document.getElementById(labelId).focus();
}

function hidePresetForm() {
  const suffix = currentVersion === 'pro' ? 'pro' : '';
  const formId = suffix ? 'termProPresetForm' : 'termPresetForm';
  const el = document.getElementById(formId);
  if (el) el.classList.remove('open');
  editingPresetId = null;
}

async function savePreset() {
  const suffix = currentVersion === 'pro' ? 'pro' : '';
  const labelId = suffix ? 'termProPresetLabel' : 'termPresetLabel';
  const cmdId = suffix ? 'termProPresetCmd' : 'termPresetCmd';
  const catId = suffix ? 'termProPresetCategory' : 'termPresetCategory';
  const label = document.getElementById(labelId).value.trim();
  const cmd = document.getElementById(cmdId).value.trim();
  const category = document.getElementById(catId).value;
  if (!label || !cmd) { alert('Label and command are required.'); return; }
  try {
    if (editingPresetId) {
      await API.terminal.updatePreset(editingPresetId, label, cmd, category);
    } else {
      await API.terminal.addPreset(label, cmd, category);
    }
    hidePresetForm();
    await loadPresets();
  } catch (err) {
    alert('Failed to save preset: ' + err.message);
  }
}

function saveProTabs() {
  if (currentVersion !== 'pro') return;
  const data = tabs.map(t => ({ name: t.name }));
  localStorage.setItem(PRO_TABS_KEY, JSON.stringify(data));
}

function restoreProTabs() {
  if (currentVersion !== 'pro') return [];
  try {
    const raw = localStorage.getItem(PRO_TABS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length) return data;
  } catch (_) {}
  return [];
}

function connectWebSocket() {
  if (ws) {
    try { ws.close(); } catch (_) {}
    ws = null;
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = protocol + '//' + location.host + '/ws/terminal';

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    showTermError('WebSocket connection failed: ' + err.message);
    updateProStatusConn(false);
    return;
  }

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'ready') {
        tabs.forEach(tab => {
          tab.panes.forEach(pane => createPtyForPane(pane));
        });
      } else if (msg.type === 'created' || msg.type === 'pane-created') {
        const pane = findPaneById(msg.paneId);
        if (pane) {
          pane.ready = true;
          showTermContent();
          if (currentVersion === 'pro') {
            updateProStatusConn(true);
            updateProStatusDims();
          }
          focusActiveTerminal();
        }
      } else if (msg.type === 'data') {
        const pane = findPaneById(msg.paneId);
        if (pane && pane.term) {
          const decoded = atob(msg.data);
          pane.term.writeUtf8 ? pane.term.writeUtf8(decoded) : pane.term.write(decoded);
        }
      } else if (msg.type === 'exit') {
        const pane = findPaneById(msg.paneId);
        if (pane) pane.ready = false;
        if (currentVersion === 'pro') {
          const active = getActivePane();
          if (!active || !active.ready) updateProStatusConn(false);
        }
      } else if (msg.type === 'error') {
        showTermError(msg.error);
        if (currentVersion === 'pro') updateProStatusConn(false);
      } else if (msg.type === 'pane-closed') {
        // pane already closed locally
      }
    } catch (_) {}
  };

  ws.onerror = () => {
    showTermError('WebSocket error. Check server connection.');
    updateProStatusConn(false);
  };

  ws.onclose = (evt) => {
    tabs.forEach(tab => tab.panes.forEach(pane => pane.ready = false));
    updateProStatusConn(false);
    if (evt.code !== 1000 && evt.code !== 4001) {
      showTermError('Connection lost (code ' + evt.code + '). Click Reconnect.');
    } else if (evt.code === 4001) {
      showTermError('Session expired. Please refresh the page.');
    }
  };
}

function findPaneById(paneId) {
  for (const tab of tabs) {
    const pane = tab.panes.find(p => p.id === paneId);
    if (pane) return pane;
  }
  return null;
}

function createClassicTab() {
  showTermLoading();
  const container = document.getElementById('termContainer');
  if (!container) return;
  container.innerHTML = '';
  const tab = createTabObject('default', 'Shell', container, false);
  tabs = [tab];
  activeTabId = tab.id;
  connectWebSocket();
}

function createInitialTab() {
  showTermLoading();
  const panes = document.getElementById('termProPanes');
  if (!panes) return;
  panes.innerHTML = '';

  const restored = restoreProTabs();
  if (restored.length) {
    restored.forEach((data, idx) => createProTab(data.name, idx === 0, true));
  } else {
    createProTab('Session 1', true, true);
  }
  connectWebSocket();
}

function createProTab(name, isInitial, skipConnect) {
  const panes = document.getElementById('termProPanes');
  if (!panes) return null;
  const tabEl = document.createElement('div');
  tabEl.className = 'term-pro-tab-panes';
  panes.appendChild(tabEl);
  const tabName = name || ('Session ' + (tabs.length + 1));
  const tab = createTabObject('t' + (++tabCounter), tabName, tabEl, true);
  tabs.push(tab);
  activeTabId = tab.id;
  updateProTabs();
  saveProTabs();

  if (!skipConnect && ws && ws.readyState === WebSocket.OPEN) {
    createPtyForPane(tab.panes[0]);
  }
  return tab;
}

function createTabObject(id, name, container, isPro) {
  const tab = {
    id, name, element: container,
    panes: [], activePaneId: null,
  };
  const pane = createPaneObject(tab, container, isPro);
  tab.panes.push(pane);
  tab.activePaneId = pane.id;
  return tab;
}

function createPaneObject(tab, container, isPro, direction) {
  const paneWrapper = document.createElement('div');
  paneWrapper.className = 'term-pro-pane' + (direction ? ' term-pro-pane-' + direction : '');
  container.appendChild(paneWrapper);

  const paneEl = document.createElement('div');
  paneEl.className = 'term-pro-pane-inner';
  paneWrapper.appendChild(paneEl);

  const paneId = 'p' + (++paneCounter);
  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontSize: isPro ? proFontSize : 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    theme: TERM_THEMES[activeThemeName],
    allowTransparency: true,
    cols: 80,
    rows: 24,
    scrollback: 10000,
  });

  term.open(paneEl);

  const fitAddon = typeof FitAddon !== 'undefined' ? new FitAddon.FitAddon() : null;
  const searchAddon = typeof SearchAddon !== 'undefined' ? new SearchAddon.SearchAddon() : null;
  const webLinksAddon = typeof WebLinksAddon !== 'undefined' ? new WebLinksAddon.WebLinksAddon() : null;
  const unicode11Addon = typeof Unicode11Addon !== 'undefined' ? new Unicode11Addon.Unicode11Addon() : null;

  if (fitAddon) {
    try {
      term.loadAddon(fitAddon);
      fitAddon.fit();
    } catch (e) { console.warn('fit addon failed', e); }
  }
  if (searchAddon) {
    try { term.loadAddon(searchAddon); } catch (e) { console.warn('search addon failed', e); }
  }
  if (webLinksAddon) {
    try { term.loadAddon(webLinksAddon); } catch (e) { console.warn('web links addon failed', e); }
  }
  if (unicode11Addon) {
    try {
      term.loadAddon(unicode11Addon);
      term.unicode.activeVersion = '11';
    } catch (e) { console.warn('unicode11 addon failed', e); }
  }

  if (isPro && typeof WebglAddon !== 'undefined') {
    try {
      const webgl = new WebglAddon.WebglAddon();
      term.loadAddon(webgl);
    } catch (e) { console.warn('webgl addon failed', e); }
  }

  const pane = {
    id: paneId, tab, wrapper: paneWrapper, element: paneEl, term, fitAddon, searchAddon,
    ready: false, inputBuffer: '', history: [],
  };

  term.onData((data) => {
    handlePaneInput(pane, data);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', paneId: pane.id, data: btoa(data) }));
    }
  });

  term.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', paneId: pane.id, cols, rows }));
    }
    if (pane.id === tab.activePaneId && tab.id === activeTabId) updateProStatusDims();
  });

  paneWrapper.addEventListener('click', () => {
    switchPane(tab, pane.id);
  });

  return pane;
}

function handlePaneInput(pane, data) {
  if (data === '\t' && currentVersion === 'pro') {
    const suggestion = getAutocompleteSuggestion(pane.inputBuffer);
    if (suggestion) {
      pane.term.input(suggestion.suffix, true);
      pane.inputBuffer += suggestion.suffix;
      closeAutocomplete();
      return;
    }
  }

  if (data === '\r' || data === '\n') {
    if (pane.inputBuffer.trim()) {
      pane.history.push(pane.inputBuffer.trim());
      if (pane.history.length > 100) pane.history.shift();
    }
    pane.inputBuffer = '';
    closeAutocomplete();
  } else if (data === '\u007f' || data === '\b') {
    pane.inputBuffer = pane.inputBuffer.slice(0, -1);
  } else if (data === '\u0003' || data === '\u0004') {
    pane.inputBuffer = '';
    closeAutocomplete();
  } else if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) < 127) {
    pane.inputBuffer += data;
  }

  if (currentVersion === 'pro') {
    updateAutocomplete(pane);
  }
}

function getAutocompleteSuggestion(buffer) {
  if (!buffer.trim()) return null;
  const q = buffer.trim().toLowerCase();
  const candidates = [
    ...presetsCache.map(p => p.cmd),
    'ls', 'cd', 'pwd', 'cat', 'grep', 'find', 'docker', 'docker ps', 'docker compose',
    'systemctl', 'journalctl', 'apt', 'dnf', 'yum', 'npm', 'node', 'python3', 'ssh', 'curl', 'wget'
  ];
  const match = candidates.find(c => c.toLowerCase().startsWith(q) && c.length > q.length);
  if (match) return { full: match, suffix: match.slice(q.length) };
  return null;
}

function updateAutocomplete(pane) {
  if (!pane.inputBuffer.trim()) {
    closeAutocomplete();
    return;
  }
  const q = pane.inputBuffer.trim().toLowerCase();
  const suggestions = [];

  presetsCache.forEach(p => {
    if (p.cmd.toLowerCase().startsWith(q) && p.cmd.length > q.length) {
      suggestions.push({ type: 'preset', label: p.cmd, value: p.cmd, icon: PRESET_ICONS[p.category] || '&#x2726;' });
    }
  });

  pane.history.slice().reverse().forEach(cmd => {
    if (cmd.toLowerCase().startsWith(q) && cmd.length > q.length && !suggestions.some(s => s.value === cmd)) {
      suggestions.push({ type: 'history', label: cmd, value: cmd, icon: '&#x25B6;' });
    }
  });

  const common = ['ls', 'cd', 'pwd', 'cat', 'grep', 'find', 'docker', 'docker ps', 'docker compose', 'systemctl', 'journalctl', 'apt', 'dnf', 'npm', 'node', 'python3', 'ssh', 'curl', 'wget'];
  common.forEach(cmd => {
    if (cmd.toLowerCase().startsWith(q) && cmd.length > q.length && !suggestions.some(s => s.value === cmd)) {
      suggestions.push({ type: 'builtin', label: cmd, value: cmd, icon: '&#x25A0;' });
    }
  });

  if (!suggestions.length) {
    closeAutocomplete();
    return;
  }

  showAutocomplete(pane, suggestions.slice(0, 6));
}

let autocompletePane = null;
function showAutocomplete(pane, suggestions) {
  let overlay = document.getElementById('termAutocomplete');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'termAutocomplete';
    overlay.className = 'term-autocomplete';
    document.body.appendChild(overlay);
  }
  autocompletePane = pane;
  overlay.innerHTML = suggestions.map((s, idx) => `
    <div class="term-autocomplete-item${idx === 0 ? ' term-autocomplete-selected' : ''}" data-value="${escHtml(s.value)}">
      <span class="term-autocomplete-icon">${s.icon}</span>
      <span class="term-autocomplete-label">${escHtml(s.label)}</span>
      <span class="term-autocomplete-type">${escHtml(s.type)}</span>
    </div>
  `).join('');

  overlay.querySelectorAll('.term-autocomplete-item').forEach(item => {
    item.addEventListener('click', () => {
      applyAutocomplete(item.dataset.value);
    });
  });

  positionAutocomplete(overlay, pane);
  overlay.style.display = 'block';
}

function positionAutocomplete(overlay, pane) {
  const rect = pane.wrapper.getBoundingClientRect();
  overlay.style.left = rect.left + 12 + 'px';
  overlay.style.top = rect.bottom - 120 + 'px';
  overlay.style.maxWidth = rect.width - 24 + 'px';
}

function closeAutocomplete() {
  const overlay = document.getElementById('termAutocomplete');
  if (overlay) overlay.style.display = 'none';
  autocompletePane = null;
}

function applyAutocomplete(value) {
  if (!autocompletePane || !value) return;
  const pane = autocompletePane;
  const q = pane.inputBuffer.trim().toLowerCase();
  if (value.toLowerCase().startsWith(q)) {
    const suffix = value.slice(q.length);
    pane.term.input(suffix, true);
    pane.inputBuffer += suffix;
  }
  closeAutocomplete();
}

function createPtyForPane(pane) {
  if (!pane || pane.ready || !ws) return;
  const cols = pane.term.cols || 80;
  const rows = pane.term.rows || 24;
  ws.send(JSON.stringify({ type: 'create', paneId: pane.id, cols, rows }));
}

function splitActivePane(direction) {
  const tab = getActiveTab();
  if (!tab) return;
  const activePane = getActivePane();
  if (!activePane) return;

  const parent = activePane.wrapper.parentElement;
  if (tab.panes.length >= 4) {
    alert('Maximum 4 panes per tab');
    return;
  }

  parent.classList.add('term-pro-split-' + direction);
  activePane.wrapper.classList.add('term-pro-pane-split');

  const newPane = createPaneObject(tab, parent, true, direction);
  tab.panes.push(newPane);
  switchPane(tab, newPane.id);
  if (ws && ws.readyState === WebSocket.OPEN) {
    createPtyForPane(newPane);
  }

  tab.panes.forEach(pane => {
    try { pane.fitAddon && pane.fitAddon.fit(); } catch (_) {}
  });
}

function closeActivePane() {
  const tab = getActiveTab();
  if (!tab) return;
  const pane = getActivePane();
  if (!pane) return;
  closePane(tab, pane.id);
}

function closePane(tab, paneId) {
  const idx = tab.panes.findIndex(p => p.id === paneId);
  if (idx === -1) return;
  const pane = tab.panes[idx];

  try { pane.term.dispose(); } catch (_) {}
  if (pane.wrapper && pane.wrapper.parentNode) {
    pane.wrapper.parentNode.removeChild(pane.wrapper);
  }
  tab.panes.splice(idx, 1);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'close-pane', paneId }));
  }

  if (tab.panes.length === 0) {
    closeProTab(tab.id);
    return;
  }

  if (tab.activePaneId === paneId) {
    tab.activePaneId = tab.panes[Math.min(idx, tab.panes.length - 1)].id;
  }

  if (tab.panes.length === 1) {
    tab.panes[0].wrapper.classList.remove('term-pro-pane-split');
    const parent = tab.element;
    parent.classList.remove('term-pro-split-horizontal', 'term-pro-split-vertical');
  }

  updatePaneVisuals(tab);
  switchPane(tab, tab.activePaneId);
  tab.panes.forEach(p => {
    try { p.fitAddon && p.fitAddon.fit(); } catch (_) {}
  });
}

function switchPane(tab, paneId) {
  const pane = tab.panes.find(p => p.id === paneId);
  if (!pane) return;
  tab.activePaneId = paneId;
  if (tab.id === activeTabId) {
    updatePaneVisuals(tab);
    updateProStatusConn(pane.ready);
    updateProStatusDims();
    pane.term.focus();
  }
}

function updatePaneVisuals(tab) {
  tab.panes.forEach(p => {
    p.wrapper.classList.toggle('term-pro-pane-active', p.id === tab.activePaneId);
  });
}

function switchProTab(tabId) {
  if (tabId === activeTabId) return;
  const tab = tabs.find(x => x.id === tabId);
  if (!tab) return;
  activeTabId = tabId;
  tabs.forEach(t => {
    t.element.style.display = t.id === tabId ? 'flex' : 'none';
  });
  updateProTabs();
  updatePaneVisuals(tab);
  const pane = getActivePane();
  if (pane) {
    pane.term.focus();
    updateProStatusConn(pane.ready);
    updateProStatusDims();
    requestAnimationFrame(() => {
      try { pane.fitAddon && pane.fitAddon.fit(); } catch (_) {}
    });
  }
}

function closeProTab(tabId) {
  const idx = tabs.findIndex(x => x.id === tabId);
  if (idx === -1) return;
  const tab = tabs[idx];
  tab.panes.forEach(pane => {
    try { pane.term.dispose(); } catch (_) {}
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'close-pane', paneId: pane.id }));
    }
  });
  if (tab.element && tab.element.parentNode) {
    tab.element.parentNode.removeChild(tab.element);
  }
  tabs.splice(idx, 1);
  if (activeTabId === tabId) {
    activeTabId = tabs.length ? tabs[Math.min(idx, tabs.length - 1)].id : null;
  }
  updateProTabs();
  saveProTabs();
  if (activeTabId) {
    switchProTab(activeTabId);
  } else {
    createProTab();
  }
}

function renameProTab(tabId, newName) {
  const tab = tabs.find(x => x.id === tabId);
  if (!tab || !newName.trim()) return;
  tab.name = newName.trim();
  updateProTabs();
  saveProTabs();
}

function updateProTabs() {
  const bar = document.getElementById('termProTabs');
  if (!bar) return;
  const addBtn = document.getElementById('termProAddTab');
  bar.innerHTML = '';
  tabs.forEach(t => {
    const tabEl = document.createElement('div');
    tabEl.className = 'term-pro-tab' + (t.id === activeTabId ? ' active' : '');
    tabEl.dataset.id = t.id;
    const paneCount = t.panes.length > 1 ? ` <span class="term-pro-tab-panes-count">${t.panes.length}</span>` : '';
    tabEl.innerHTML = `
      <span class="term-pro-tab-dot"></span>
      <span class="term-pro-tab-name">${escHtml(t.name)}</span>${paneCount}
      <button class="term-pro-tab-close" title="Close tab">&#x2715;</button>
    `;
    tabEl.querySelector('.term-pro-tab-name').addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const name = prompt('Rename tab:', t.name);
      if (name !== null) renameProTab(t.id, name);
    });
    tabEl.querySelector('.term-pro-tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeProTab(t.id);
    });
    tabEl.addEventListener('click', () => switchProTab(t.id));
    bar.appendChild(tabEl);
  });
  if (addBtn) bar.appendChild(addBtn);

  tabs.forEach(t => {
    t.element.style.display = t.id === activeTabId ? 'flex' : 'none';
  });
}

function updateProStatusConn(connected) {
  const el = document.getElementById('termProStatusConn');
  if (!el) return;
  if (connected) {
    el.innerHTML = '<span class="term-pro-status-dot term-pro-status-ok"></span>connected';
  } else {
    el.innerHTML = '<span class="term-pro-status-dot term-pro-status-err"></span>disconnected';
  }
}

function updateProStatusDims() {
  const el = document.getElementById('termProStatusDims');
  if (!el) return;
  const pane = getActivePane();
  if (pane && pane.term) {
    el.textContent = pane.term.cols + 'x' + pane.term.rows;
  }
}

function showTermLoading() {
  const loading = document.getElementById('termLoading');
  if (loading) loading.style.display = 'flex';
  const error = document.getElementById('termError');
  if (error) error.style.display = 'none';
}

function showTermContent() {
  const loading = document.getElementById('termLoading');
  if (loading) loading.style.display = 'none';
  const error = document.getElementById('termError');
  if (error) error.style.display = 'none';
}

function showTermError(msg) {
  const loading = document.getElementById('termLoading');
  if (loading) loading.style.display = 'none';
  const error = document.getElementById('termError');
  if (error) error.style.display = 'flex';
  const text = document.getElementById('termErrorText');
  if (text) text.textContent = msg || 'Unknown error';
}

/* ─── Command Palette ─── */
function initCommandPalette() {
  let el = document.getElementById('termCommandPalette');
  if (!el) {
    el = document.createElement('div');
    el.id = 'termCommandPalette';
    el.className = 'term-palette-overlay';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="term-palette">
        <input type="text" class="term-palette-input" placeholder="Type a command, preset, or tab name...">
        <div class="term-palette-list"></div>
        <div class="term-palette-hint"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> to toggle &middot; <kbd>Esc</kbd> to close</div>
      </div>
    `;
    document.body.appendChild(el);
  }
  const input = el.querySelector('.term-palette-input');
  input.addEventListener('input', renderCommandPalette);
  input.addEventListener('keydown', handlePaletteKey);
  el.addEventListener('click', (e) => {
    if (e.target === el) closeCommandPalette();
  });
}

function toggleCommandPalette() {
  if (commandPaletteOpen) {
    closeCommandPalette();
  } else {
    openCommandPalette();
  }
}

function openCommandPalette() {
  const el = document.getElementById('termCommandPalette');
  if (!el || currentVersion !== 'pro') return;
  commandPaletteOpen = true;
  el.style.display = 'flex';
  const input = el.querySelector('.term-palette-input');
  input.value = '';
  input.focus();
  paletteSelIdx = -1;
  renderCommandPalette();
}

function closeCommandPalette() {
  const el = document.getElementById('termCommandPalette');
  if (el) el.style.display = 'none';
  commandPaletteOpen = false;
}

function getPaletteItems() {
  const items = [];
  items.push({ type: 'action', id: 'new-tab', icon: '+', title: 'New tab', subtitle: 'Open a new terminal session', action: () => createProTab() });
  items.push({ type: 'action', id: 'close-tab', icon: 'x', title: 'Close active tab', subtitle: 'Close ' + (tabs.find(t => t.id === activeTabId)?.name || 'current tab'), action: () => closeProTab(activeTabId) });
  items.push({ type: 'action', id: 'split-h', icon: '&#x25E0;', title: 'Split horizontal', subtitle: 'Split active pane side by side', action: () => splitActivePane('horizontal') });
  items.push({ type: 'action', id: 'split-v', icon: '&#x25E1;', title: 'Split vertical', subtitle: 'Split active pane stacked', action: () => splitActivePane('vertical') });
  items.push({ type: 'action', id: 'close-pane', icon: '&#x2715;', title: 'Close active pane', subtitle: 'Close the focused pane in this tab', action: closeActivePane });
  items.push({ type: 'action', id: 'clear', icon: 'C', title: 'Clear terminal', subtitle: 'Clear active terminal screen', action: clearActiveTerminal });
  items.push({ type: 'action', id: 'reconnect', icon: 'R', title: 'Reconnect', subtitle: 'Restart terminal connection', action: reconnectTerminal });
  items.push({ type: 'action', id: 'download', icon: '&#x1F4BE;', title: 'Download buffer', subtitle: 'Save terminal output to file', action: downloadActiveBuffer });
  items.push({ type: 'action', id: 'toggle-search', icon: 'S', title: 'Search terminal', subtitle: 'Find text in terminal output', action: toggleSearchBar });

  PRESET_CATEGORIES.forEach(cat => {
    const catPresets = presetsCache.filter(p => p.category === cat);
    if (catPresets.length) {
      items.push({ type: 'category', id: 'cat-' + cat, icon: PRESET_ICONS[cat] || '&#x2726;', title: cat, subtitle: catPresets.length + ' preset' + (catPresets.length === 1 ? '' : 's'), action: null });
      catPresets.forEach(p => {
        items.push({ type: 'preset', id: 'preset-' + p.id, icon: '&#x25B8;', title: p.label, subtitle: p.cmd, indent: true, action: () => {
          if (termReady() && ws && ws.readyState === WebSocket.OPEN) {
            const pane = getActivePane();
            ws.send(JSON.stringify({ type: 'input', paneId: pane ? pane.id : null, data: btoa(p.cmd + '\n') }));
            focusActiveTerminal();
          }
        }});
      });
    }
  });

  tabs.forEach(t => {
    items.push({ type: 'tab', id: 'tab-' + t.id, icon: '&#x25CF;', title: t.name, subtitle: t.id === activeTabId ? 'Active' : 'Switch to tab', action: () => switchProTab(t.id) });
  });

  return items;
}

function renderCommandPalette() {
  const el = document.getElementById('termCommandPalette');
  if (!el) return;
  const input = el.querySelector('.term-palette-input');
  const list = el.querySelector('.term-palette-list');
  const q = input.value.toLowerCase().trim();
  const allItems = getPaletteItems();
  const items = allItems.filter(it => {
    if (it.type === 'category') return false;
    return !q || it.title.toLowerCase().includes(q) || it.subtitle.toLowerCase().includes(q);
  });

  if (!items.length) {
    list.innerHTML = '<div class="term-palette-empty">No matching commands</div>';
    return;
  }

  list.innerHTML = items.map((it, idx) => `
    <div class="term-palette-item${it.indent ? ' term-palette-indent' : ''}" data-idx="${idx}">
      <span class="term-palette-icon">${it.icon}</span>
      <div class="term-palette-info">
        <div class="term-palette-title">${escHtml(it.title)}</div>
        <div class="term-palette-subtitle">${escHtml(it.subtitle)}</div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.term-palette-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx, 10);
      const selected = items[idx];
      if (selected && selected.action) {
        closeCommandPalette();
        selected.action();
      }
    });
  });
}

let paletteSelIdx = -1;
function handlePaletteKey(e) {
  const el = document.getElementById('termCommandPalette');
  const items = el ? el.querySelectorAll('.term-palette-item') : [];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    paletteSelIdx = Math.min(paletteSelIdx + 1, items.length - 1);
    updatePaletteSelection(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    paletteSelIdx = Math.max(paletteSelIdx - 1, -1);
    updatePaletteSelection(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const selected = items[paletteSelIdx];
    if (selected) selected.click();
  } else if (e.key === 'Escape') {
    closeCommandPalette();
  } else {
    paletteSelIdx = -1;
  }
}

function updatePaletteSelection(items) {
  items.forEach((item, idx) => {
    item.classList.toggle('term-palette-selected', idx === paletteSelIdx);
  });
}

/* ─── Search Bar ─── */
function initSearchBar() {
  let el = document.getElementById('termSearchBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'termSearchBar';
    el.className = 'term-search-bar';
    el.style.display = 'none';
    el.innerHTML = `
      <input type="text" class="term-search-input" placeholder="Find in terminal...">
      <button class="term-search-btn" data-dir="next">&#x25BC;</button>
      <button class="term-search-btn" data-dir="prev">&#x25B2;</button>
      <button class="term-search-close" title="Close">&#x2715;</button>
    `;
    const proPane = document.getElementById('termProContainer');
    if (proPane) proPane.appendChild(el);
  }
  const input = el.querySelector('.term-search-input');
  input.addEventListener('input', doSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearchBar();
    if (e.key === 'Enter') findNext();
  });
  el.querySelectorAll('.term-search-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.dir === 'prev') findPrevious();
      else findNext();
    });
  });
  el.querySelector('.term-search-close').addEventListener('click', closeSearchBar);
}

function toggleSearchBar() {
  if (searchOpen) {
    closeSearchBar();
  } else {
    openSearchBar();
  }
}

function openSearchBar() {
  const el = document.getElementById('termSearchBar');
  if (!el || currentVersion !== 'pro') return;
  searchOpen = true;
  el.style.display = 'flex';
  el.querySelector('.term-search-input').focus();
  doSearch();
}

function closeSearchBar() {
  const el = document.getElementById('termSearchBar');
  if (el) el.style.display = 'none';
  searchOpen = false;
  const pane = getActivePane();
  if (pane && pane.searchAddon) pane.searchAddon.clearDecorations();
}

function doSearch() {
  const el = document.getElementById('termSearchBar');
  if (!el) return;
  const q = el.querySelector('.term-search-input').value;
  const pane = getActivePane();
  if (!pane || !pane.searchAddon) return;
  if (!q) {
    pane.searchAddon.clearDecorations();
    return;
  }
  pane.searchAddon.findNext(q, { caseSensitive: false });
}

function findNext() {
  const el = document.getElementById('termSearchBar');
  if (!el) return;
  const q = el.querySelector('.term-search-input').value;
  const pane = getActivePane();
  if (pane && pane.searchAddon && q) pane.searchAddon.findNext(q, { caseSensitive: false });
}

function findPrevious() {
  const el = document.getElementById('termSearchBar');
  if (!el) return;
  const q = el.querySelector('.term-search-input').value;
  const pane = getActivePane();
  if (pane && pane.searchAddon && q) pane.searchAddon.findPrevious(q, { caseSensitive: false });
}

/* ─── Theme Picker ─── */
function toggleThemePicker() {
  let el = document.getElementById('termThemePicker');
  if (!el) {
    el = document.createElement('div');
    el.id = 'termThemePicker';
    el.className = 'term-theme-picker';
    el.innerHTML = Object.keys(TERM_THEMES).map(name => `
      <button class="term-theme-option${name === activeThemeName ? ' active' : ''}" data-theme="${name}">
        <span class="term-theme-swatch" style="background:${TERM_THEMES[name].background};border-color:${TERM_THEMES[name].foreground}"></span>
        <span class="term-theme-name">${name.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</span>
      </button>
    `).join('');
    const toolbar = document.querySelector('.term-pro-toolbar');
    if (toolbar) toolbar.appendChild(el);
    el.querySelectorAll('.term-theme-option').forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });
  }
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

function applyTheme(name) {
  if (!TERM_THEMES[name]) return;
  activeThemeName = name;
  localStorage.setItem(PRO_THEME_KEY, name);
  tabs.forEach(tab => {
    tab.panes.forEach(pane => {
      if (pane.term) pane.term.options.theme = TERM_THEMES[name];
    });
  });
  const picker = document.getElementById('termThemePicker');
  if (picker) picker.style.display = 'none';
}

window.initTerminal = initTerminal;
