// cli/commands/remote-add.ts — CLI endpoint for `tako remote add`
//
// ADR-0019: the adapter + use case wiring lives in services/remotes
// (composeAddRemoteComponents). The INTERACTIVE flow still delegates to the
// TUI wizard — a transitional, managed cli→tui exception (ADR-0014, pending
// its ADR-0019 follow-up decision); this command maps the result to exit codes.
import { AddRemote } from '../../domains/remotes/application/AddRemote.js';
import type { AddRemoteComponents } from '../../services/remotes.js';
import { composeAddRemoteComponents } from '../../services/remotes.js';
import { runAddRemoteWizard } from '../../tui/features/remotes/add-remote-wizard/index.js';

/** Dependencies of the add flow (the services-layer composition shape). */
export type RemoteAddDeps = AddRemoteComponents;

/**
 * Run the `tako remote add` command.
 *
 * Architecture (D7):
 * - CLI handler maps the wizard result to exit codes (thin orchestration)
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
 * Default entry point — the wiring comes from the services layer.
 */
export async function runRemoteAddDefault(): Promise<number> {
  return runRemoteAdd(await composeAddRemoteComponents());
}
