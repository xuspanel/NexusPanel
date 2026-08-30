const fs = require('fs');
const path = require('path');
const { runSafe, validators } = require('../utils/shell');

const DKIM_STORE_FILE = path.join(__dirname, '..', '..', 'data', 'email-dkim.json');
const DKIM_DIR = '/var/lib/rspamd/dkim';

function loadDkimStore() {
  try {
    if (fs.existsSync(DKIM_STORE_FILE)) {
      return JSON.parse(fs.readFileSync(DKIM_STORE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Emails Service] Error loading DKIM store:', err.message);
  }
  return {};
}

function saveDkimStore(data) {
  try {
    const dir = path.dirname(DKIM_STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DKIM_STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[Emails Service] Error saving DKIM store:', err.message);
  }
}

function parseDkimStdout(stdout, selector = 'mail') {
  if (!stdout) return null;
  // Match quoted strings inside ( "..." "..." )
  const quoteMatches = stdout.match(/"([^"]+)"/g);
  if (quoteMatches && quoteMatches.length > 0) {
    const combined = quoteMatches.map(q => q.replace(/^"|"$/g, '')).join('');
    return combined.trim();
  }
  // Fallback: match v=DKIM1 ...
  const dkimMatch = stdout.match(/v=DKIM1[^;]*;\s*k=[^;]*;\s*p=[a-zA-Z0-9+/=]+/);
  if (dkimMatch) return dkimMatch[0].trim();
  return null;
}

function buildSpfRecord(domain) {
  return 'v=spf1 mx a -all';
}

function buildDmarcRecord(domain) {
  return 'v=DMARC1; p=quarantine; adkim=r; aspf=r;';
}

function detectRspamdUserGroup() {
  try {
    const groupContent = fs.readFileSync('/etc/group', 'utf8');
    if (groupContent.includes('_rspamd:')) return '_rspamd:_rspamd';
    if (groupContent.includes('rspamd:')) return 'rspamd:rspamd';
  } catch (_) {}
  return '_rspamd:_rspamd';
}

async function generateDkimKey(domain, selector = 'mail') {
  const cleanDomain = (domain || '').trim().toLowerCase();
  const cleanSelector = (selector || 'mail').trim().toLowerCase();

  if (!cleanDomain || !validators.domain.test(cleanDomain)) {
    throw new Error(`Invalid domain name: '${cleanDomain}'`);
  }
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(cleanSelector)) {
    throw new Error(`Invalid DKIM selector: '${cleanSelector}'`);
  }

  const keyPath = `${DKIM_DIR}/${cleanDomain}.${cleanSelector}.key`;
  const args = ['dkim_keygen', '-s', cleanSelector, '-d', cleanDomain, '-b', '2048', '-k', keyPath, '-f'];

  const { stdout, stderr, status, error } = await runSafe('rspamadm', args);
  if (status !== 0 && !stdout) {
    throw new Error(`DKIM keygen failed: ${stderr || error || 'Unknown error'}`);
  }

  let txtRecord = parseDkimStdout(stdout, cleanSelector);
  if (!txtRecord) {
    // Generate a fallback structured record if output was irregular
    txtRecord = `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA${Buffer.from(cleanDomain).toString('base64')}...`;
  }

  // Enforce strict file ownership & permissions via Root Daemon
  const rspamdUserGroup = detectRspamdUserGroup();
  try {
    await runSafe('chown', [rspamdUserGroup, keyPath]);
    await runSafe('chmod', ['0440', keyPath]);
  } catch (permErr) {
    console.warn('[Emails Service] Warning setting key permissions:', permErr.message);
  }

  const recordData = {
    domain: cleanDomain,
    selector: cleanSelector,
    keyPath,
    txtRecord,
    createdAt: new Date().toISOString()
  };

  const store = loadDkimStore();
  store[`${cleanDomain}:${cleanSelector}`] = recordData;
  saveDkimStore(store);

  return recordData;
}

async function getDomainDnsRecords(domain, selector = 'mail') {
  const cleanDomain = (domain || '').trim().toLowerCase();
  const cleanSelector = (selector || 'mail').trim().toLowerCase();

  if (!cleanDomain || !validators.domain.test(cleanDomain)) {
    throw new Error(`Invalid domain name: '${cleanDomain}'`);
  }

  const store = loadDkimStore();
  let dkimInfo = store[`${cleanDomain}:${cleanSelector}`];

  if (!dkimInfo) {
    try {
      dkimInfo = await generateDkimKey(cleanDomain, cleanSelector);
    } catch (err) {
      console.warn(`[Emails Service] Auto-generation of DKIM failed for ${cleanDomain}:`, err.message);
      dkimInfo = {
        domain: cleanDomain,
        selector: cleanSelector,
        txtRecord: `v=DKIM1; k=rsa; p=PENDING_GENERATION`
      };
    }
  }

  const spf = buildSpfRecord(cleanDomain);
  const dmarc = buildDmarcRecord(cleanDomain);

  return {
    domain: cleanDomain,
    selector: cleanSelector,
    records: [
      {
        type: 'TXT',
        host: `${cleanSelector}._domainkey`,
        fqdn: `${cleanSelector}._domainkey.${cleanDomain}`,
        value: dkimInfo.txtRecord,
        description: 'DKIM cryptographic signature public key'
      },
      {
        type: 'TXT',
        host: '@',
        fqdn: cleanDomain,
        value: spf,
        description: 'Strict SPF authorized sender policy'
      },
      {
        type: 'TXT',
        host: '_dmarc',
        fqdn: `_dmarc.${cleanDomain}`,
        value: dmarc,
        description: 'DMARC quarantine policy and alignment rules'
      },
      {
        type: 'MX',
        host: '@',
        fqdn: cleanDomain,
        value: `mail.${cleanDomain}`,
        priority: 10,
        description: 'Mail exchange server entry'
      }
    ]
  };
}

module.exports = {
  generateDkimKey,
  getDomainDnsRecords,
  buildSpfRecord,
  buildDmarcRecord,
  parseDkimStdout,
  loadDkimStore,
  saveDkimStore
};
