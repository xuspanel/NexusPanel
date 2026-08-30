import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const protocol = require('../../../src/daemon/protocol');
const daemonServer = require('../../../src/daemon/server');
const daemonClient = require('../../../src/utils/daemon-client');

const TEST_SOCK = path.join(__dirname, 'test-daemon.sock');

describe('Daemon & Two-Tier IPC Architecture', () => {
  beforeAll(async () => {
    if (fs.existsSync(TEST_SOCK)) {
      try { fs.unlinkSync(TEST_SOCK); } catch (_) {}
    }
    await daemonServer.startDaemon(TEST_SOCK);
  });

  afterAll(async () => {
    await daemonServer.stopDaemon();
    if (fs.existsSync(TEST_SOCK)) {
      try { fs.unlinkSync(TEST_SOCK); } catch (_) {}
    }
  });

  it('validates commands against privileged whitelist', () => {
    expect(protocol.validateCommand('systemctl').valid).toBe(true);
    expect(protocol.validateCommand('iptables').valid).toBe(true);
    expect(protocol.validateCommand('certbot').valid).toBe(true);
    expect(protocol.validateCommand('rm').valid).toBe(false);
    expect(protocol.validateCommand('../bin/bash').valid).toBe(false);
  });

  it('executes permitted commands via socket client', async () => {
    const result = await daemonClient.execViaSocket('journalctl', ['--version'], { timeout: 5000 }, TEST_SOCK);
    expect(result).toBeDefined();
    expect(typeof result.status).toBe('number');
  });

  it('rejects unwhitelisted commands with FORBIDDEN_BINARY error code', async () => {
    await expect(
      daemonClient.execViaSocket('rm', ['-rf', '/tmp/fake'], { timeout: 5000 }, TEST_SOCK)
    ).rejects.toThrow(/Forbidden binary/i);
  });

  it('rejects chown or chmod commands outside /var/lib/rspamd/dkim/', async () => {
    await expect(
      daemonClient.execViaSocket('chmod', ['0777', '/etc/shadow'], { timeout: 5000 }, TEST_SOCK)
    ).rejects.toThrow(/Unauthorized path for chmod/i);

    await expect(
      daemonClient.execViaSocket('chown', ['root:root', '/tmp/malicious'], { timeout: 5000 }, TEST_SOCK)
    ).rejects.toThrow(/Unauthorized path for chown/i);
  });

  it('enforces payload limits', () => {
    expect(protocol.MAX_PAYLOAD_SIZE).toBeGreaterThan(1024 * 1024);
  });
});
