// services/remotes.test.ts — service-level tests for the remotes API
// (ADR-0019): the unified remote → connection-auth decision (refusal-object
// style, shared by the TUI and the CLI) and the conf-backed resolution, with
// the conf store mocked to an in-memory map (no real user conf is touched).
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckDuplicateRemote } from '../domains/remotes/application/CheckDuplicateRemote.js';
import { ValidateSshConnection } from '../domains/remotes/application/ValidateSshConnection.js';
import type { Remote } from '../domains/remotes/domain/types.js';
import { ConfRemoteRepository } from '../domains/remotes/infrastructure/ConfRemoteRepository.js';
import { ConfSecretVault } from '../domains/remotes/infrastructure/ConfSecretVault.js';
import { composeAddRemoteComponents, decideRemoteAuth, resolveRemoteAuth } from './remotes.js';

const confData = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../domains/remotes/infrastructure/createConfStore.js', () => ({
  createConfStore: () => ({
    get: (key: string) => confData.get(key),
    set: (key: string, value: unknown) => {
      confData.set(key, value);
    },
    has: (key: string) => confData.has(key),
  }),
}));

const SECRET = 'sescret-pw';

function seedRemote(remote: Remote): void {
  confData.set(`remotes.${remote.name}`, remote);
}

describe('decideRemoteAuth — session-password contract', () => {
  const interactive = { credentialType: 'interactive' as const };

  it('accepts the session password for an interactive remote (TUI captures it at activation; CLI reads the env)', () => {
    const decision = decideRemoteAuth('nas', interactive, SECRET, cipher => cipher);
    expect(decision).toEqual({ kind: 'resolved', auth: { type: 'password', password: SECRET } });
  });

  it('refuses an interactive remote WITHOUT a session password — one message for both clients', () => {
    const decision = decideRemoteAuth('nas', interactive, undefined, cipher => cipher);
    expect(decision).toEqual({
      kind: 'refusal',
      reason:
        'remote "nas" uses interactive credentials — this run has no session password; ' +
        're-select it in the TUI to enter the password, or supply TAKO_SSH_PASSWORD for terminal runs',
    });
  });

  it('an empty session password counts as absent', () => {
    const decision = decideRemoteAuth('nas', interactive, '', cipher => cipher);
    expect(decision.kind).toBe('refusal');
  });

  it('the session password never leaks into refusals or other remotes’ auth', () => {
    const refusal = decideRemoteAuth('nas', interactive, undefined, cipher => cipher);
    expect(JSON.stringify(refusal)).not.toContain(SECRET);

    const keyDecision = decideRemoteAuth('nas', { credentialType: 'ssh-key', keyPath: '/keys/id_ed25519' }, SECRET, cipher =>
      cipher
    );
    expect(keyDecision).toEqual({ kind: 'resolved', auth: { type: 'key', keyPath: '/keys/id_ed25519' } });

    const storeDecision = decideRemoteAuth('nas', { credentialType: 'store', obfuscatedPassword: 'obf' }, SECRET, cipher =>
      `revealed:${cipher}`
    );
    expect(storeDecision).toEqual({ kind: 'resolved', auth: { type: 'password', password: 'revealed:obf' } });
  });
});

describe('resolveRemoteAuth — conf-backed resolution (fresh per call)', () => {
  beforeEach(() => {
    confData.clear();
  });

  it('resolves a store-credential remote through the vault reveal', async () => {
    const cipher = new ConfSecretVault(undefined).obfuscate('store-pw');
    seedRemote({ name: 'nas', type: 'ssh', username: 'ops', host: 'nas.lan', port: 22, credentialType: 'store', obfuscatedPassword: cipher });

    const resolution = await resolveRemoteAuth('nas', undefined);

    expect(resolution).toEqual({
      kind: 'resolved',
      remote: expect.objectContaining({ name: 'nas', host: 'nas.lan', port: 22 }),
      auth: { type: 'password', password: 'store-pw' },
    });
  });

  it('resolves a key remote without touching any secret', async () => {
    seedRemote({ name: 'nas', type: 'ssh', username: 'ops', host: 'nas.lan', port: 22, credentialType: 'ssh-key', keyPath: '/keys/id_ed25519' });

    const resolution = await resolveRemoteAuth('nas', undefined);

    expect(resolution).toMatchObject({ kind: 'resolved', auth: { type: 'key', keyPath: '/keys/id_ed25519' } });
  });

  it('unknown remote → the named refusal object (never a throw)', async () => {
    const resolution = await resolveRemoteAuth('ghost', undefined);

    expect(resolution).toEqual({
      kind: 'unknown-remote',
      reason: 'unknown remote "ghost" — add it first with "tako remote add"',
    });
  });

  it('interactive remote without session password → refusal carrying the remedy', async () => {
    seedRemote({ name: 'nas', type: 'ssh', username: 'ops', host: 'nas.lan', port: 22, credentialType: 'interactive' });

    const resolution = await resolveRemoteAuth('nas', undefined);

    expect(resolution.kind).toBe('refusal');
    expect((resolution as { readonly reason: string }).reason).toContain('interactive credentials');
  });
});

describe('composeAddRemoteComponents — the add-remote wiring, written once', () => {
  it('wires the remotes use cases over the conf-backed adapters', async () => {
    const components = await composeAddRemoteComponents();

    expect(components.checkDuplicate).toBeInstanceOf(CheckDuplicateRemote);
    expect(components.validateConnection).toBeInstanceOf(ValidateSshConnection);
    expect(components.vault).toBeInstanceOf(ConfSecretVault);
    expect(components.repo).toBeInstanceOf(ConfRemoteRepository);
  });
});
