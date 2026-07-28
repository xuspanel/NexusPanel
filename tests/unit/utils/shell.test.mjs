import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('validators', () => {
  const { validators } = require('../../../src/utils/shell.js');

  describe('containerId', () => {
    it('accepts valid container IDs', () => {
      expect(validators.containerId.test('abc123def456')).toBe(true);
      expect(validators.containerId.test('a'.repeat(64))).toBe(true);
    });
    it('rejects short IDs', () => {
      expect(validators.containerId.test('abc12')).toBe(false);
    });
    it('rejects IDs with special chars', () => {
      expect(validators.containerId.test('abc123!@#def')).toBe(false);
    });
  });

  describe('imageName', () => {
    it('accepts valid image names', () => {
      expect(validators.imageName.test('nginx')).toBe(true);
      expect(validators.imageName.test('registry.example.com/myimage:v2')).toBe(true);
      expect(validators.imageName.test('ubuntu:20.04')).toBe(true);
    });
    it('rejects invalid names', () => {
      expect(validators.imageName.test('')).toBe(false);
      expect(validators.imageName.test('image name')).toBe(false);
    });
  });

  describe('port', () => {
    it('accepts valid ports', () => {
      expect(validators.port.test('80')).toBe(true);
      expect(validators.port.test('3443')).toBe(true);
      expect(validators.port.test('65535')).toBe(true);
    });
    it('rejects invalid ports', () => {
      expect(validators.port.test('abc')).toBe(false);
    });
  });

  describe('username', () => {
    it('accepts valid usernames', () => {
      expect(validators.username.test('admin')).toBe(true);
      expect(validators.username.test('web.user')).toBe(true);
      expect(validators.username.test('test-user')).toBe(true);
    });
    it('rejects invalid usernames', () => {
      expect(validators.username.test('')).toBe(false);
      expect(validators.username.test('1admin')).toBe(false);
      expect(validators.username.test('a'.repeat(33))).toBe(false);
    });
  });

  describe('domain', () => {
    it('accepts valid domains', () => {
      expect(validators.domain.test('example.com')).toBe(true);
      expect(validators.domain.test('sub.domain.co.uk')).toBe(true);
    });
    it('rejects invalid domains', () => {
      expect(validators.domain.test('')).toBe(false);
      expect(validators.domain.test('not_a_domain')).toBe(false);
    });
  });

  describe('ipAddr', () => {
    it('accepts valid IPs', () => {
      expect(validators.ipAddr.test('192.168.1.1')).toBe(true);
      expect(validators.ipAddr.test('0.0.0.0')).toBe(true);
    });
    it('rejects non-IP strings', () => {
      expect(validators.ipAddr.test('abc')).toBe(false);
    });
  });

  describe('chainName', () => {
    it('accepts built-in chains', () => {
      expect(validators.chainName.test('INPUT')).toBe(true);
      expect(validators.chainName.test('OUTPUT')).toBe(true);
      expect(validators.chainName.test('FORWARD')).toBe(true);
    });
    it('rejects invalid chains', () => {
      expect(validators.chainName.test('')).toBe(false);
      expect(validators.chainName.test('1CHAIN')).toBe(false);
    });
  });

  describe('numeric', () => {
    it('accepts digits only', () => {
      expect(validators.numeric.test('123')).toBe(true);
      expect(validators.numeric.test('0')).toBe(true);
    });
    it('rejects non-digits', () => {
      expect(validators.numeric.test('abc')).toBe(false);
      expect(validators.numeric.test('12a')).toBe(false);
    });
  });
});

describe('runSafeSync', () => {
  const { runSafeSync } = require('../../../src/utils/shell.js');

  it('executes a command and returns stdout', () => {
    const result = runSafeSync('echo', ['hello']);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.error).toBeNull();
  });

  it('returns stderr for failing commands', () => {
    const result = runSafeSync('ls', ['/nonexistent_path_xyz_123']);
    expect(result.status).not.toBe(0);
  });

  it('handles timeout', () => {
    const result = runSafeSync('sleep', ['10'], { timeout: 100 });
    expect(result.error).toBeTruthy();
  }, 5000);
});
