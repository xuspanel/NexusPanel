let ws = null;
let termInit = false;
let nanoMode = false;
let currentVersion = 'classic';
let proFontSize = 14;
let activeThemeName = 'catppuccin';
let tabCounter = 0;
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
  tabs.forEach(t => {
    try { t.term.dispose(); } catch (_) {}
    if (t.element && t.element.parentNode) t.element.parentNode.removeChild(t.element);
  });
  tabs = [];
  activeTabId = null;
  closeCommandPalette();
  closeSearchBar();
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
        ws.send(JSON.stringify({ type: 'input', tabId: activeTabId, data: btoa(String.fromCharCode(code)) }));
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

  window.addEventListener('resize', () => {
    if (currentVersion === 'pro') {
      tabs.forEach(t => {
        try { t.fitAddon && t.fitAddon.fit(); } catch (_) {}
      });
    } else {
      const t = tabs[0];
      try { t && t.fitAddon && t.fitAddon.fit(); } catch (_) {}
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
    }
  });

  document.addEventListener('click', (e) => {
    const picker = document.getElementById('termThemePicker');
    const themeBtn = document.getElementById('termProTheme');
    if (picker && picker.style.display === 'block' && !picker.contains(e.target) && e.target !== themeBtn) {
      picker.style.display = 'none';
    }
  });
}

function isTypingInInput() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function termReady() {
  const t = tabs.find(x => x.id === activeTabId);
  return t && t.ready;
}

function getActiveTerm() {
  const t = tabs.find(x => x.id === activeTabId);
  return t ? t.term : null;
}

function focusActiveTerminal() {
  const t = tabs.find(x => x.id === activeTabId);
  if (t && t.term) t.term.focus();
}

function clearActiveTerminal() {
  const t = tabs.find(x => x.id === activeTabId);
  if (t && t.term) t.term.clear();
}

function reconnectTerminal() {
  applyTerminalVersion();
}

function adjustProFontSize(delta) {
  proFontSize = Math.max(10, Math.min(24, proFontSize + delta));
  localStorage.setItem(PRO_FONT_KEY, proFontSize);
  tabs.forEach(t => {
    if (t.term) t.term.options.fontSize = proFontSize;
    try { t.fitAddon && t.fitAddon.fit(); } catch (_) {}
  });
  updateProStatusDims();
}

function downloadActiveBuffer() {
  const t = tabs.find(x => x.id === activeTabId);
  if (!t || !t.term) return;
  const buffer = t.term.buffer.active;
  const lines = [];
  for (let i = 0; i < buffer.length; i++) {
    lines.push(buffer.getLine(i).translateToString(true));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `terminal-${t.name.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
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
        ws.send(JSON.stringify({ type: 'input', tabId: activeTabId, data: btoa(cmd + '\n') }));
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
        if (currentVersion === 'pro') {
          tabs.forEach(t => createPtyForTab(t));
        } else {
          const t = tabs[0];
          if (t) createPtyForTab(t);
        }
      } else if (msg.type === 'created' || msg.type === 'tab-created') {
        const t = tabs.find(x => x.id === msg.tabId);
        if (t) {
          t.ready = true;
          showTermContent();
          if (currentVersion === 'pro') {
            updateProStatusConn(true);
            updateProStatusDims();
          }
          focusActiveTerminal();
        }
      } else if (msg.type === 'data') {
        const t = tabs.find(x => x.id === msg.tabId);
        if (t && t.term) {
          const decoded = atob(msg.data);
          t.term.writeUtf8 ? t.term.writeUtf8(decoded) : t.term.write(decoded);
        }
      } else if (msg.type === 'exit') {
        const t = tabs.find(x => x.id === msg.tabId);
        if (t) t.ready = false;
        if (currentVersion === 'pro') updateProStatusConn(false);
      } else if (msg.type === 'error') {
        showTermError(msg.error);
        if (currentVersion === 'pro') updateProStatusConn(false);
      } else if (msg.type === 'tab-switched') {
        activeTabId = msg.tabId;
        updateProTabs();
        focusActiveTerminal();
      } else if (msg.type === 'tab-closed') {
        activeTabId = msg.activeTabId;
        updateProTabs();
        focusActiveTerminal();
      } else if (msg.type === 'tab-renamed') {
        const t = tabs.find(x => x.id === msg.tabId);
        if (t) {
          t.name = msg.name;
          updateProTabs();
          saveProTabs();
        }
      }
    } catch (_) {}
  };

  ws.onerror = () => {
    showTermError('WebSocket error. Check server connection.');
    updateProStatusConn(false);
  };

  ws.onclose = (evt) => {
    tabs.forEach(t => t.ready = false);
    updateProStatusConn(false);
    if (evt.code !== 1000 && evt.code !== 4001) {
      showTermError('Connection lost (code ' + evt.code + '). Click Reconnect.');
    } else if (evt.code === 4001) {
      showTermError('Session expired. Please refresh the page.');
    }
  };
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
  const container = document.createElement('div');
  container.className = 'term-pro-pane';
  panes.appendChild(container);
  const tabName = name || ('Session ' + (tabs.length + 1));
  const tab = createTabObject('t' + (++tabCounter), tabName, container, true);
  tabs.push(tab);
  activeTabId = tab.id;
  updateProTabs();
  saveProTabs();

  if (!skipConnect && ws && ws.readyState === WebSocket.OPEN) {
    createPtyForTab(tab);
  }
  return tab;
}

function createTabObject(id, name, container, isPro) {
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

  term.open(container);

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

  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', tabId: id, data: btoa(data) }));
    }
  });

  term.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', tabId: id, cols, rows }));
    }
    if (id === activeTabId) updateProStatusDims();
  });

  return {
    id, name, container, term, fitAddon, searchAddon,
    ready: false, cols: term.cols, rows: term.rows,
  };
}

function createPtyForTab(tab) {
  if (!tab || tab.ready || !ws) return;
  const cols = tab.term.cols || 80;
  const rows = tab.term.rows || 24;
  ws.send(JSON.stringify({ type: 'create', tabId: tab.id, cols, rows }));
}

function switchProTab(tabId) {
  if (tabId === activeTabId) return;
  const t = tabs.find(x => x.id === tabId);
  if (!t) return;
  activeTabId = tabId;
  tabs.forEach(x => {
    x.container.style.display = x.id === tabId ? 'block' : 'none';
  });
  updateProTabs();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'switch-tab', tabId }));
  }
  focusActiveTerminal();
  updateProStatusConn(t.ready);
  updateProStatusDims();
  requestAnimationFrame(() => {
    try { t.fitAddon && t.fitAddon.fit(); } catch (_) {}
  });
}

function closeProTab(tabId) {
  const idx = tabs.findIndex(x => x.id === tabId);
  if (idx === -1) return;
  const t = tabs[idx];
  try { t.term.dispose(); } catch (_) {}
  if (t.container && t.container.parentNode) {
    t.container.parentNode.removeChild(t.container);
  }
  tabs.splice(idx, 1);
  if (activeTabId === tabId) {
    activeTabId = tabs.length ? tabs[Math.min(idx, tabs.length - 1)].id : null;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'close-tab', tabId }));
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
  const t = tabs.find(x => x.id === tabId);
  if (!t || !newName.trim()) return;
  t.name = newName.trim();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'rename-tab', tabId, name: t.name }));
  }
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
    tabEl.innerHTML = `
      <span class="term-pro-tab-dot"></span>
      <span class="term-pro-tab-name">${escHtml(t.name)}</span>
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
    t.container.style.display = t.id === activeTabId ? 'block' : 'none';
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
  const t = tabs.find(x => x.id === activeTabId);
  if (t && t.term) {
    el.textContent = t.term.cols + 'x' + t.term.rows;
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
            ws.send(JSON.stringify({ type: 'input', tabId: activeTabId, data: btoa(p.cmd + '\n') }));
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
  const t = tabs.find(x => x.id === activeTabId);
  if (t && t.searchAddon) t.searchAddon.clearDecorations();
}

function doSearch() {
  const el = document.getElementById('termSearchBar');
  if (!el) return;
  const q = el.querySelector('.term-search-input').value;
  const t = tabs.find(x => x.id === activeTabId);
  if (!t || !t.searchAddon) return;
  if (!q) {
    t.searchAddon.clearDecorations();
    return;
  }
  t.searchAddon.findNext(q, { caseSensitive: false });
}

function findNext() {
  const el = document.getElementById('termSearchBar');
  if (!el) return;
  const q = el.querySelector('.term-search-input').value;
  const t = tabs.find(x => x.id === activeTabId);
  if (t && t.searchAddon && q) t.searchAddon.findNext(q, { caseSensitive: false });
}

function findPrevious() {
  const el = document.getElementById('termSearchBar');
  if (!el) return;
  const q = el.querySelector('.term-search-input').value;
  const t = tabs.find(x => x.id === activeTabId);
  if (t && t.searchAddon && q) t.searchAddon.findPrevious(q, { caseSensitive: false });
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
  tabs.forEach(t => {
    if (t.term) t.term.options.theme = TERM_THEMES[name];
  });
  const picker = document.getElementById('termThemePicker');
  if (picker) picker.style.display = 'none';
}

window.initTerminal = initTerminal;
