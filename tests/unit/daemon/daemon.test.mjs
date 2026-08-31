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
    expect(protocol.validateCommand('mkdir').valid).toBe(true);
    expect(protocol.validateCommand('rm').valid).toBe(true);
    expect(protocol.validateCommand('dd').valid).toBe(false);
    expect(protocol.validateCommand('../bin/bash').valid).toBe(false);
  });

  it('executes permitted commands via socket client', async () => {
    const result = await daemonClient.execViaSocket('journalctl', ['--version'], { timeout: 5000 }, TEST_SOCK);
    expect(result).toBeDefined();
    expect(typeof result.status).toBe('number');
  });

  it('rejects unwhitelisted commands with FORBIDDEN_BINARY error code', async () => {
    await expect(
      daemonClient.execViaSocket('dd', ['if=/dev/zero', 'of=/tmp/test'], { timeout: 5000 }, TEST_SOCK)
    ).rejects.toThrow(/Forbidden binary/i);
  });

  it('rejects chown, chmod, and rm commands outside authorized directories', async () => {
    await expect(
      daemonClient.execViaSocket('chmod', ['0777', '/etc/shadow'], { timeout: 5000 }, TEST_SOCK)
    ).rejects.toThrow(/Unauthorized path for chmod/i);

    await expect(
      daemonClient.execViaSocket('chown', ['root:root', '/var/tmp/malicious'], { timeout: 5000 }, TEST_SOCK)
    ).rejects.toThrow(/Unauthorized path for chown/i);

    await expect(
      daemonClient.execViaSocket('rm', ['-rf', '/etc/shadow'], { timeout: 5000 }, TEST_SOCK)
    ).rejects.toThrow(/Unauthorized path for rm/i);
  });

  it('enforces payload limits', () => {
    expect(protocol.MAX_PAYLOAD_SIZE).toBeGreaterThan(1024 * 1024);
  });

  it('detects OS family from /etc/os-release', () => {
    const osFamily = daemonServer.detectOSFamily();
    expect(['debian', 'rhel']).toContain(osFamily);
  });

  it('provides safe OS preset mappings for standard services', () => {
    const presets = daemonServer.PRESET_SERVICE_COMMANDS;
    expect(presets.debian).toBeDefined();
    expect(presets.rhel).toBeDefined();

    expect(presets.debian.vsftpd).toContain('apt');
    expect(presets.debian['php-fpm']).toContain('php-fpm');
    expect(presets.debian.nodejs).toContain('nodejs');

    expect(presets.rhel.vsftpd).toContain('dnf');
    expect(presets.rhel['php-fpm']).toContain('dnf');
    expect(presets.rhel.nodejs).toContain('dnf');
  });

  it('rejects invalid service preset via installService socket IPC', async () => {
    await expect(
      daemonClient.installService('nonexistent_preset_xyz', { sockPath: TEST_SOCK, timeout: 5000 })
    ).rejects.toThrow(/Unknown service preset/i);
  });
});
