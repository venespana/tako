// cli/commands/remote-add.ts — CLI handler for `tako remote add`
// Composes adapters + use cases, renders TUI wizard, maps exit codes
import Conf from 'conf';

import { AddRemote } from '../../domains/remotes/application/AddRemote.js';
import { CheckDuplicateRemote } from '../../domains/remotes/application/CheckDuplicateRemote.js';
import type { RemoteRepository } from '../../domains/remotes/application/RemoteRepository.js';
import type { SecretVault } from '../../domains/remotes/application/SecretVault.js';
import { ValidateSshConnection } from '../../domains/remotes/application/ValidateSshConnection.js';
import { runAddRemoteWizard } from '../../tui/features/remotes/add-remote-wizard/index.js';

export type RemoteAddDeps = {
  checkDuplicate: CheckDuplicateRemote;
  validateConnection: ValidateSshConnection;
  vault: SecretVault;
  repo: RemoteRepository;
};

/**
 * Run the `tako remote add` command.
 *
 * Architecture (D7):
 * - CLI handler composes adapters + use cases (thin orchestration)
 * - Delegates UI to TUI wizard (managed cli→tui exception per ADR 0014)
 * - Maps AddRemoteResult → exit code per spec
 *
 * Exit codes (D8):
 * - 0: saved successfully
 * - 1: duplicate | validation | hostkey | abort
 * - 2: unexpected internal error
 */
export async function runRemoteAdd(deps: RemoteAddDeps): Promise<number> {
  // Compose use case with injected dependencies
  const addRemoteUc = new AddRemote(deps.checkDuplicate, deps.validateConnection, deps.vault, deps.repo);

  try {
    // Delegate to TUI wizard (collects name, user, host, port, creds, hostkey accept)
    const result = await runAddRemoteWizard({ addRemoteUc });

    if (result.saved) {
      return 0;
    }

    // Any reason (duplicate/validation/hostkey/abort) → exit code 1
    return 1;
  } catch (err) {
    // Unexpected internal error → exit code 2
    console.error(String(err));
    return 2;
  }
}

/**
 * Default entry point — wires real conf + infrastructure adapters
 */
export async function runRemoteAddDefault(): Promise<number> {
  const confStore = new Conf({ projectName: 'tako' });

  // Infrastructure adapters
  const vault: SecretVault = new (
    await import('../../domains/remotes/infrastructure/ConfSecretVault.js')
  ).ConfSecretVault(confStore);
  const repo: RemoteRepository = new (
    await import('../../domains/remotes/infrastructure/ConfRemoteRepository.js')
  ).ConfRemoteRepository(confStore);
  const tester = new (
    await import('../../domains/remotes/infrastructure/Ssh2ConnectionTester.js')
  ).Ssh2ConnectionTester();

  // Use case ports
  const checkDuplicate: CheckDuplicateRemote = new CheckDuplicateRemote(repo);
  const validateConnection: ValidateSshConnection = new ValidateSshConnection(tester);

  return runRemoteAdd({
    checkDuplicate,
    validateConnection,
    vault,
    repo,
  });
}
