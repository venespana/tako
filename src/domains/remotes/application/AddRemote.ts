// AddRemote.ts — use case (GREEN phase)
import type { CheckDuplicateRemote } from './CheckDuplicateRemote.js';
import type { RemoteRepository } from './RemoteRepository.js';
import type { SecretVault } from './SecretVault.js';
import type { ValidateSshConnection } from './ValidateSshConnection.js';
import type { AddRemoteResult, DuplicateResult, Remote, RemoteDraft, SshValidationOutcome } from '../domain/types.js';

export class AddRemote {
  constructor(
    private readonly duplicateChecker: CheckDuplicateRemote,
    private readonly validator: ValidateSshConnection,
    private readonly vault: SecretVault,
    private readonly repo: RemoteRepository
  ) {}

  /**
   * Orchestrate adding a new remote:
   * 1. Check duplicate (block on collision)
   * 2. Validate SSH connection (block on failure)
   * 3. Require explicit hostkey accept (UI gate; use case trusts hostkeyAccepted flag)
   * 4. Obfuscate password if store+savePassword
   * 5. Persist
   *
   * Never throws. Returns AddRemoteResult.
   */
  async execute(draft: RemoteDraft, opts: { hostkeyAccepted: boolean }): Promise<AddRemoteResult> {
    // Step 1: duplicate check
    const dupResult: DuplicateResult = await this.duplicateChecker.check(draft);
    if (dupResult.isDuplicate) {
      return { saved: false, reason: 'duplicate', duplicateKind: dupResult.kind };
    }

    // Step 2: validate SSH connection
    const sshResult: SshValidationOutcome = await this.validator.validate({
      host: draft.host,
      port: draft.port,
      username: draft.username,
      auth:
        draft.credentialType === 'store'
          ? { type: 'password', password: draft.password ?? '' }
          : { type: 'key', keyPath: draft.keyPath ?? '' },
    });

    if (!sshResult.ok) {
      return { saved: false, reason: 'validation', message: sshResult.message };
    }

    // Step 3: hostkey accept gate (UI is responsible for prompting and setting this flag)
    if (!opts.hostkeyAccepted) {
      return { saved: false, reason: 'hostkey', hostkeyFingerprint: sshResult.hostkeyFingerprint };
    }

    // Step 4: build persisted remote
    let obfuscatedPassword: string | undefined;
    if (draft.credentialType === 'store' && draft.savePassword && draft.password !== undefined) {
      obfuscatedPassword = this.vault.obfuscate(draft.password);
    }

    const remote: Remote = {
      name: draft.name,
      type: draft.type,
      username: draft.username,
      host: draft.host,
      port: draft.port,
      credentialType: draft.credentialType,
      ...(obfuscatedPassword !== undefined && { obfuscatedPassword }),
      ...(draft.credentialType === 'ssh-key' &&
        draft.keyPath !== undefined && {
          keyPath: draft.keyPath,
        }),
    };

    // Step 5: persist
    await this.repo.save(remote);

    return { saved: true };
  }

  /**
   * Persist a validated draft WITHOUT re-validating SSH.
   *
   * Called by the wizard after the user accepts the hostkey.
   * Re-checks duplicates (cheap conf read) to guard against races,
   * then obfuscates and persists. Never re-opens an SSH connection.
   *
   * Never throws. Returns AddRemoteResult.
   */
  async save(draft: RemoteDraft): Promise<AddRemoteResult> {
    // Re-check duplicate (cheap, guards against races)
    const dupResult: DuplicateResult = await this.duplicateChecker.check(draft);
    if (dupResult.isDuplicate) {
      return { saved: false, reason: 'duplicate', duplicateKind: dupResult.kind };
    }

    // Obfuscate password if store+savePassword
    let obfuscatedPassword: string | undefined;
    if (draft.credentialType === 'store' && draft.savePassword && draft.password !== undefined) {
      obfuscatedPassword = this.vault.obfuscate(draft.password);
    }

    const remote: Remote = {
      name: draft.name,
      type: draft.type,
      username: draft.username,
      host: draft.host,
      port: draft.port,
      credentialType: draft.credentialType,
      ...(obfuscatedPassword !== undefined && { obfuscatedPassword }),
      ...(draft.credentialType === 'ssh-key' &&
        draft.keyPath !== undefined && {
          keyPath: draft.keyPath,
        }),
    };

    await this.repo.save(remote);

    return { saved: true };
  }
}
