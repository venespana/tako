// infrastructure/ConfSecretVault.test.ts — STRICT TDD RED phase
import { describe, it, expect, vi } from 'vitest';
import type { SecretVault } from '../application/SecretVault.js';

// RED: import the class that doesn't exist yet
import { ConfSecretVault } from './ConfSecretVault.js';

// Minimal mock conf - just enough to verify the adapter pattern
type MockConf = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  has: ReturnType<typeof vi.fn>;
};

function createMockConf(): MockConf {
  return {
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn(),
  };
}

describe('ConfSecretVault', () => {
  // Task 4.1 RED test scenarios:
  // - obfuscate('hunter2') !== 'hunter2' (not plain text)
  // - reveal(obfuscate(x)) === x (proves reversible, NOT secure)
  // - deterministic-ish (proves same input can be recovered, IV makes output differ)

  it('4.1 RED: obfuscate("hunter2") !== "hunter2"', () => {
    const mockConf = createMockConf();
    const vault = new ConfSecretVault(mockConf as unknown as SecretVault);

    const cipher = vault.obfuscate('hunter2');
    expect(cipher).not.toBe('hunter2');
  });

  it('4.1 RED: reveal(obfuscate(x)) === x (proves reversible, NOT secure)', () => {
    const mockConf = createMockConf();
    const vault = new ConfSecretVault(mockConf as unknown as SecretVault);

    const original = 'hunter2';
    const cipher = vault.obfuscate(original);
    const revealed = vault.reveal(cipher);
    expect(revealed).toBe(original);
  });

  it('4.1 RED: deterministic-ish — multiple obfuscates all reveal to same original', () => {
    const mockConf = createMockConf();
    const vault = new ConfSecretVault(mockConf as unknown as SecretVault);

    const original = 'hunter2';
    // Multiple calls produce different cipher texts (due to random IV)
    // But all must reveal back to the same original
    const cipher1 = vault.obfuscate(original);
    const cipher2 = vault.obfuscate(original);
    const cipher3 = vault.obfuscate(original);

    expect(cipher1).not.toBe(cipher2);
    expect(cipher2).not.toBe(cipher3);
    expect(cipher1).not.toBe(cipher3);

    // But all reveal to the same original
    expect(vault.reveal(cipher1)).toBe(original);
    expect(vault.reveal(cipher2)).toBe(original);
    expect(vault.reveal(cipher3)).toBe(original);
  });

  it('4.1 RED: empty string roundtrips correctly', () => {
    const mockConf = createMockConf();
    const vault = new ConfSecretVault(mockConf as unknown as SecretVault);

    const original = '';
    const cipher = vault.obfuscate(original);
    const revealed = vault.reveal(cipher);
    expect(revealed).toBe(original);
  });

  it('4.1 RED: unicode roundtrips correctly', () => {
    const mockConf = createMockConf();
    const vault = new ConfSecretVault(mockConf as unknown as SecretVault);

    const original = '密码は秘密です';
    const cipher = vault.obfuscate(original);
    const revealed = vault.reveal(cipher);
    expect(revealed).toBe(original);
  });
});
