// domain/normalize.test.ts — STRICT TDD RED phase
import { describe, it, expect } from 'vitest';

import { normalizeRemote, requiresConnectPrompt } from './normalize.js';
import type { Remote } from './types.js';
// RED: import the module that doesn't exist yet

function makeRemote(overrides: Partial<Remote> = {}): Remote {
  return {
    name: 'nas',
    type: 'ssh',
    username: 'ops',
    host: '10.0.0.5',
    port: 22,
    credentialType: 'store',
    ...overrides,
  };
}

describe('normalizeRemote', () => {
  it('1.2 RED: legacy store-without-password normalizes to interactive', () => {
    const legacy = makeRemote({ credentialType: 'store', obfuscatedPassword: undefined });

    const normalized = normalizeRemote(legacy);

    expect(normalized.credentialType).toBe('interactive');
  });

  it('1.2 RED: normalization must not rewrite the persisted entry (returns a copy)', () => {
    const legacy = makeRemote({ credentialType: 'store', obfuscatedPassword: undefined });

    const normalized = normalizeRemote(legacy);

    expect(legacy.credentialType).toBe('store');
    expect(normalized).not.toBe(legacy);
  });

  it('1.2 RED: store-with-password stays store', () => {
    const stored = makeRemote({ credentialType: 'store', obfuscatedPassword: 'encrypted-hunter2' });

    const normalized = normalizeRemote(stored);

    expect(normalized.credentialType).toBe('store');
  });

  it('1.2 RED: ssh-key stays ssh-key', () => {
    const keyed = makeRemote({ credentialType: 'ssh-key', keyPath: '/home/ops/.ssh/id_ed25519' });

    const normalized = normalizeRemote(keyed);

    expect(normalized.credentialType).toBe('ssh-key');
  });

  it('1.2 RED: interactive stays interactive', () => {
    const interactive = makeRemote({ credentialType: 'interactive' });

    const normalized = normalizeRemote(interactive);

    expect(normalized.credentialType).toBe('interactive');
  });

  it('1.2 RED: normalization preserves all other fields', () => {
    const legacy = makeRemote({ credentialType: 'store', obfuscatedPassword: undefined });

    const normalized = normalizeRemote(legacy);

    expect(normalized).toEqual({ ...legacy, credentialType: 'interactive' });
  });
});

describe('requiresConnectPrompt', () => {
  it('1.2 RED: interactive → true', () => {
    const interactive = makeRemote({ credentialType: 'interactive' });

    expect(requiresConnectPrompt(interactive)).toBe(true);
  });

  it('1.2 RED: store-with-password → false', () => {
    const stored = makeRemote({ credentialType: 'store', obfuscatedPassword: 'encrypted-hunter2' });

    expect(requiresConnectPrompt(stored)).toBe(false);
  });

  it('1.2 RED: ssh-key → false', () => {
    const keyed = makeRemote({ credentialType: 'ssh-key', keyPath: '/home/ops/.ssh/id_ed25519' });

    expect(requiresConnectPrompt(keyed)).toBe(false);
  });
});
