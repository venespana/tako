// application/ValidateSshConnection.test.ts — STRICT TDD RED phase
import { describe, it, expect, vi } from 'vitest';
import type { SshTestConfig, SshValidationOutcome } from '../domain/types.js';
import type { SshConnectionTester } from './SshConnectionTester.js';

// Import the class that doesn't exist yet — this is RED
import { ValidateSshConnection } from './ValidateSshConnection.js';

describe('ValidateSshConnection', () => {
  function fakeTester(outcome: SshValidationOutcome): SshConnectionTester {
    return {
      test: vi.fn(async (config: SshTestConfig) => outcome),
    };
  }

  const passwordConfig: SshTestConfig = {
    host: '10.0.0.5',
    port: 22,
    username: 'ops',
    auth: { type: 'password', password: 'hunter2' },
  };

  const keyConfig: SshTestConfig = {
    host: '10.0.0.5',
    port: 22,
    username: 'ops',
    auth: { type: 'key', keyPath: '/home/user/.ssh/id_rsa' },
  };

  it('3.3 RED: success outcome → returned as-is with hostkeyFingerprint', async () => {
    const fingerprint = 'SHA256:abc123xyz';
    const tester = fakeTester({ ok: true, hostkeyFingerprint: fingerprint });
    const uc = new ValidateSshConnection(tester);
    const result = await uc.validate(passwordConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hostkeyFingerprint).toBe(fingerprint);
    }
  });

  it('3.3 RED: auth failure → returned with category=auth', async () => {
    const tester = fakeTester({
      ok: false,
      category: 'auth',
      message: 'Authentication failed',
    });
    const uc = new ValidateSshConnection(tester);
    const result = await uc.validate(passwordConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('auth');
      expect(result.message).toBe('Authentication failed');
    }
  });

  it('3.3 RED: network failure → returned with category=network', async () => {
    const tester = fakeTester({
      ok: false,
      category: 'network',
      message: 'Connection refused',
    });
    const uc = new ValidateSshConnection(tester);
    const result = await uc.validate(keyConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('network');
    }
  });

  it('3.3 RED: timeout → returned with category=timeout', async () => {
    const tester = fakeTester({
      ok: false,
      category: 'timeout',
      message: 'Connection timed out',
    });
    const uc = new ValidateSshConnection(tester);
    const result = await uc.validate(keyConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('timeout');
    }
  });

  it('3.3 RED: hostkey failure → returned with category=hostkey', async () => {
    const tester = fakeTester({
      ok: false,
      category: 'hostkey',
      message: 'Host key mismatch',
    });
    const uc = new ValidateSshConnection(tester);
    const result = await uc.validate(passwordConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('hostkey');
    }
  });

  it('3.3 RED: tester rejects with unknown category → passthrough unknown', async () => {
    const tester = fakeTester({
      ok: false,
      category: 'unknown',
      message: 'Something went wrong',
    });
    const uc = new ValidateSshConnection(tester);
    const result = await uc.validate(keyConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('unknown');
    }
  });

  it('3.3 RED: key-based auth config is passed through unchanged', async () => {
    const tester = fakeTester({ ok: true, hostkeyFingerprint: 'SHA256:test' });
    const uc = new ValidateSshConnection(tester);
    await uc.validate(keyConfig);
    expect(tester.test).toHaveBeenCalledTimes(1);
    const passedConfig = (tester.test as ReturnType<typeof vi.fn>).mock.calls[0]![0] as SshTestConfig;
    expect(passedConfig.auth.type).toBe('key');
    if (passedConfig.auth.type === 'key') {
      expect(passedConfig.auth.keyPath).toBe('/home/user/.ssh/id_rsa');
    }
  });
});
