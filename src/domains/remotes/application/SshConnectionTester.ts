// SshConnectionTester.ts — PORT interface (application layer owns this)
import type { SshTestConfig, SshValidationOutcome } from '../domain/types.js';

/** Port: SSH connection testing + hostkey capture */
export interface SshConnectionTester {
  /**
   * Open an SSH connection and verify it succeeds.
   * Returns SshValidationOutcome (never throws).
   * On success, outcome.ok=true and hostkeyFingerprint is populated.
   * On failure, outcome.ok=false and category+message describe the failure.
   */
  test(config: SshTestConfig): Promise<SshValidationOutcome>;
}
