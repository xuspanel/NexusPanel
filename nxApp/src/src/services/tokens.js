const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'tokens.json');

function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; } }
function save(tokens) { fs.writeFileSync(DATA_FILE, JSON.stringify(tokens, null, 2)); }

async function generate(userId, label, scope) {
  const tokens = load();
  const raw = 'npt_' + crypto.randomBytes(24).toString('hex');
  const hash = await bcrypt.hash(raw, 8);
  const token = {
    id: 'tk_' + Date.now(), userId, label: label || 'API Token', scope: scope || 'read',
    hash, prefix: raw.substring(0, 8) + '...',
    createdAt: new Date().toISOString(), lastUsed: null,
  };
  tokens.push(token); save(tokens);
  return { ...token, token: raw };
}

async function validate(raw) {
  const tokens = load();
  for (const t of tokens) {
    if (await bcrypt.compare(raw, t.hash)) {
      t.lastUsed = new Date().toISOString(); save(tokens);
      return { userId: t.userId, scope: t.scope, tokenId: t.id };
    }
  }
  return null;
}

function list(userId) { return load().filter(t => t.userId === userId).map(t => ({ ...t, hash: undefined })); }
function remove(id) {
  const tokens = load(); const idx = tokens.findIndex(t => t.id === id);
  if (idx === -1) return false; tokens.splice(idx, 1); save(tokens); return true;
}

module.exports = { generate, validate, list, remove };
