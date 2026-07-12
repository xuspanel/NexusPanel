const { execSync } = require('child_process');

function check() {
  try {
    const raw = execSync('dnf check-update 2>/dev/null', { encoding: 'utf8', timeout: 60000 });
    const lines = raw.trim().split('\n');
    const updates = [];
    let inList = false;
    for (const line of lines) {
      if (line === '' || line.includes('Last metadata')) continue;
      if (!inList) { inList = true; continue; }
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        updates.push({ name: parts[0], version: parts[1], repo: parts[2] });
      }
    }
    return { count: updates.length, updates };
  } catch (e) {
    if (e.status === 100) {
      const lines = (e.stdout || '').trim().split('\n');
      const updates = [];
      let inList = false;
      for (const line of lines) {
        if (line === '' || line.includes('Last metadata')) continue;
        if (!inList) { inList = true; continue; }
        const parts = line.split(/\s+/);
        if (parts.length >= 3) updates.push({ name: parts[0], version: parts[1], repo: parts[2] });
      }
      return { count: updates.length, updates };
    }
    return { count: 0, updates: [], error: e.message };
  }
}

function apply() {
  try {
    const raw = execSync('dnf update -y 2>&1', { encoding: 'utf8', timeout: 300000 });
    return { ok: true, output: raw.substring(raw.length - 500) };
  } catch (e) {
    return { error: e.stderr || e.message };
  }
}

module.exports = { check, apply };
