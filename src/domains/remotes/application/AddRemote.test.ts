// application/AddRemote.test.ts — STRICT TDD RED phase
import { describe, it, expect, vi } from 'vitest';
import type {
  AddRemoteResult,
  DuplicateResult,
  Remote,
  RemoteDraft,
  SshValidationOutcome,
} from '../domain/types.js';
import type { RemoteRepository } from './RemoteRepository.js';
import type { SecretVault } from './SecretVault.js';
import type { SshConnectionTester } from './SshConnectionTester.js';
import type { CheckDuplicateRemote } from './CheckDuplicateRemote.js';
import type { ValidateSshConnection } from './ValidateSshConnection.js';

// Import the class that doesn't exist yet — this is RED
import { AddRemote } from './AddRemote.js';

// ---------------------------------------------------------------------------
// Fake ports
// ---------------------------------------------------------------------------

type AddRemoteDeps = {
  duplicateResult: DuplicateResult;
  validateOutcome: SshValidationOutcome;
  vaultObfuscate?: string;
};

function buildFakes({
  duplicateResult,
  validateOutcome,
  vaultObfuscate = 'obfuscated',
}: AddRemoteDeps): {
  checkDuplicate: CheckDuplicateRemote;
  validateConnection: ValidateSshConnection;
  vault: SecretVault;
  repo: RemoteRepository;
} {
  const vault: SecretVault = {
    obfuscate: vi.fn((plain: string) => vaultObfuscate),
    reveal: vi.fn((cipher: string) => cipher),
  };

  const repo: RemoteRepository = {
    existsByName: vi.fn(async () => duplicateResult.isDuplicate),
    existsByEndpoint: vi.fn(async () => duplicateResult.isDuplicate),
    save: vi.fn(async () => {}),
  };

  const validateConnection: ValidateSshConnection = {
    validate: vi.fn(async () => validateOutcome),
  } as unknown as ValidateSshConnection;

  const checkDuplicate: CheckDuplicateRemote = {
    check: vi.fn(async () => duplicateResult),
  } as unknown as CheckDuplicateRemote;

  return { checkDuplicate, validateConnection, vault, repo };
}

// ---------------------------------------------------------------------------
// Base drafts
// ---------------------------------------------------------------------------

const storeDraft: RemoteDraft = {
  name: 'nas',
  type: 'ssh',
  username: 'ops',
  host: '10.0.0.5',
  port: 22,
  credentialType: 'store',
  password: 'hunter2',
  savePassword: true,
};

const keyDraft: RemoteDraft = {
  name: 'server1',
  type: 'ssh',
  username: 'admin',
  host: '192.168.1.1',
  port: 2222,
  credentialType: 'ssh-key',
  keyPath: '/home/user/.ssh/id_rsa',
};

describe('AddRemote', () => {
  // (a) duplicate → {saved:false,reason:'duplicate'}, no save call, no validate call
  it('3.5 RED: (a) duplicate name → saved=false reason=duplicate, no save, no validate', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: true, kind: 'name' },
      validateOutcome: { ok: true, hostkeyFingerprint: 'SHA256:anything' },
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.execute(storeDraft, { hostkeyAccepted: true });

    expect(result.saved).toBe(false);
    expect(result.reason).toBe('duplicate');
    expect(repo.save).not.toHaveBeenCalled();
    expect(validateConnection.validate).not.toHaveBeenCalled();
  });

  // (b) validation-fail → {saved:false,reason:'validation'}, no save call
  it('3.5 RED: (b) validation fails → saved=false reason=validation, no save', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: false },
      validateOutcome: { ok: false, category: 'auth', message: 'Bad password' },
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.execute(storeDraft, { hostkeyAccepted: true });

    expect(result.saved).toBe(false);
    expect(result.reason).toBe('validation');
    expect(repo.save).not.toHaveBeenCalled();
  });

  // (c) valid + accepted + store + savePassword → obfuscate called, save called
  it('3.5 RED: (c) valid + accepted + store + save → obfuscate+pw, save with Remote', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: false },
      validateOutcome: { ok: true, hostkeyFingerprint: 'SHA256:fingerprint' },
      vaultObfuscate: 'OBFUSCATED',
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.execute(storeDraft, { hostkeyAccepted: true });

    expect(result.saved).toBe(true);
    expect(vault.obfuscate).toHaveBeenCalledWith('hunter2');
    expect(repo.save).toHaveBeenCalledTimes(1);
    const savedRemote = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Remote;
    expect(savedRemote.name).toBe('nas');
    expect(savedRemote.obfuscatedPassword).toBe('OBFUSCATED');
    expect(savedRemote.credentialType).toBe('store');
  });

  // (d) hostkey declined → {saved:false,reason:'hostkey'}, no save
  it('3.5 RED: (d) hostkey declined → saved=false reason=hostkey, no save', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: false },
      validateOutcome: { ok: true, hostkeyFingerprint: 'SHA256:fingerprint' },
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.execute(storeDraft, { hostkeyAccepted: false });

    expect(result.saved).toBe(false);
    expect(result.reason).toBe('hostkey');
    expect(repo.save).not.toHaveBeenCalled();
  });

  // (e) store-transient (no save-password) → password NOT persisted, obfuscate NOT called
  it('3.5 RED: (e) store + savePassword=false → obfuscate NOT called, no obfuscatedPassword in saved remote', async () => {
    const transientDraft: RemoteDraft = {
      ...storeDraft,
      savePassword: false,
    };

    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: false },
      validateOutcome: { ok: true, hostkeyFingerprint: 'SHA256:fingerprint' },
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.execute(transientDraft, { hostkeyAccepted: true });

    expect(result.saved).toBe(true);
    expect(vault.obfuscate).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
    const savedRemote = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Remote;
    expect(savedRemote.obfuscatedPassword).toBeUndefined();
  });

  // ssh-key path is preserved in saved remote
  it('3.5 RED: ssh-key credential → keyPath preserved in saved remote', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: false },
      validateOutcome: { ok: true, hostkeyFingerprint: 'SHA256:fingerprint' },
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.execute(keyDraft, { hostkeyAccepted: true });

    expect(result.saved).toBe(true);
    expect(vault.obfuscate).not.toHaveBeenCalled(); // no password for ssh-key
    expect(repo.save).toHaveBeenCalledTimes(1);
    const savedRemote = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Remote;
    expect(savedRemote.keyPath).toBe('/home/user/.ssh/id_rsa');
    expect(savedRemote.credentialType).toBe('ssh-key');
  });

  // validate is called after duplicate check passes
  it('3.5 RED: validate is only called after duplicate check passes', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: false },
      validateOutcome: { ok: true, hostkeyFingerprint: 'SHA256:fingerprint' },
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    await uc.execute(storeDraft, { hostkeyAccepted: true });

    expect(checkDuplicate.check).toHaveBeenCalledTimes(1);
    expect(validateConnection.validate).toHaveBeenCalledTimes(1);
  });

  // --- New: field propagation tests ---

  it('execute hostkey result carries fingerprint from SSH outcome', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: false },
      validateOutcome: { ok: true, hostkeyFingerprint: 'SHA256:real-fingerprint' },
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.execute(storeDraft, { hostkeyAccepted: false });

    expect(result.reason).toBe('hostkey');
    expect(result.hostkeyFingerprint).toBe('SHA256:real-fingerprint');
  });

  it('execute duplicate result carries kind=name', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: true, kind: 'name' },
      validateOutcome: { ok: true, hostkeyFingerprint: 'SHA256:x' },
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.execute(storeDraft, { hostkeyAccepted: true });

    expect(result.reason).toBe('duplicate');
    expect(result.duplicateKind).toBe('name');
  });

  it('execute duplicate result carries kind=endpoint', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: true, kind: 'endpoint' },
      validateOutcome: { ok: true, hostkeyFingerprint: 'SHA256:x' },
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.execute(storeDraft, { hostkeyAccepted: true });

    expect(result.reason).toBe('duplicate');
    expect(result.duplicateKind).toBe('endpoint');
  });

  it('execute validation-fail result carries message from SSH outcome', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: false },
      validateOutcome: { ok: false, category: 'auth', message: 'All configured authentication methods failed' },
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.execute(storeDraft, { hostkeyAccepted: true });

    expect(result.reason).toBe('validation');
    expect(result.message).toBe('All configured authentication methods failed');
  });

  // --- save() method tests (GAP 3: no double SSH) ---

  it('save() persists without calling SSH validator', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: false },
      validateOutcome: { ok: true, hostkeyFingerprint: 'SHA256:x' },
      vaultObfuscate: 'OBF',
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.save(storeDraft);

    expect(result.saved).toBe(true);
    expect(validateConnection.validate).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
    const savedRemote = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Remote;
    expect(savedRemote.obfuscatedPassword).toBe('OBF');
  });

  it('save() blocks on duplicate without SSH validation', async () => {
    const { checkDuplicate, validateConnection, vault, repo } = buildFakes({
      duplicateResult: { isDuplicate: true, kind: 'name' },
      validateOutcome: { ok: true, hostkeyFingerprint: 'SHA256:x' },
    });

    const uc = new AddRemote(checkDuplicate, validateConnection, vault, repo);
    const result = await uc.save(storeDraft);

    expect(result.saved).toBe(false);
    expect(result.reason).toBe('duplicate');
    expect(result.duplicateKind).toBe('name');
    expect(validateConnection.validate).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
