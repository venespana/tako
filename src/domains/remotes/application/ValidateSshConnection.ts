// ValidateSshConnection.ts — use case (GREEN phase)
import type { SshConnectionTester } from './SshConnectionTester.js';
import type { SshTestConfig, SshValidationOutcome } from '../domain/types.js';

/** Thin orchestrator that delegates SSH validation to the injected port */
export class ValidateSshConnection {
  constructor(private readonly tester: SshConnectionTester) {}

  /**
   * Validate an SSH connection config.
   * Returns the outcome from the tester (never throws).
   * On success the caller MUST show hostkeyFingerprint and require explicit accept.
   */
  validate(config: SshTestConfig): Promise<SshValidationOutcome> {
    return this.tester.test(config);
  }
}
