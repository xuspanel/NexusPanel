const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', '..', 'data', 'settings.json');

const DEFAULTS = {
  autoUpdate: false,
  updateChannel: 'stable',
  lastUpdateCheck: null,
  lastUpdateResult: null,
};

function load() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      return { ...DEFAULTS, ...data };
    }
  } catch (e) {
    console.error('Failed to load settings:', e.message);
  }
  return { ...DEFAULTS };
}

function save(settings) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = load();
    const merged = { ...current, ...settings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  } catch (e) {
    console.error('Failed to save settings:', e.message);
    return null;
  }
}

module.exports = { load, save };
