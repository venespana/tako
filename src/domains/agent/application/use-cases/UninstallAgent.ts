// UninstallAgent.ts — use case: uninstall ordering + only-by-tako linger rule (task 3.10)
//
// Pure uninstall policy (design §Probe Mechanics, uninstall): linger is
// disabled ONLY when `agent_meta` proves Tako enabled it (D8). When the
// transport is unreachable, `linger_by_tako` is never guessed — linger stays
// enabled and the operator gets a warning. Step execution lands in the WU6
// CLI command; the order below is the contract it must follow.
import type { AgentStatusResult } from '../../domain/protocol.js';

/** Ordered uninstall steps — `read-linger-by-tako` MUST precede any deletion. */
export const UNINSTALL_STEPS = [
  'read-linger-by-tako',
  'stop-unit',
  'remove-unit',
  'daemon-reload',
  'disable-linger-if-by-tako',
  'remove-agent-dir',
  'verify-residue',
] as const;

/** True only when Tako itself enabled linger — the value is never guessed. */
export function shouldDisableLinger(lingerByTako: boolean | undefined): boolean {
  return lingerByTako === true;
}

export interface UninstallLingerGuard {
  readonly disableLinger: boolean;
  /** Present when the by-tako flag could not be read (transport unreachable). */
  readonly warning?: string;
}

/** Decide the linger action from the status read in step 1 (or its absence). */
export function uninstallLingerGuard(
  status: Readonly<Pick<AgentStatusResult, 'lingerByTako'>> | undefined
): UninstallLingerGuard {
  if (status === undefined) {
    return {
      disableLinger: false,
      warning:
        'agent transport unreachable — could not read linger_by_tako; keeping linger ENABLED (only-by-tako rule is never guessed)',
    };
  }

  return { disableLinger: shouldDisableLinger(status.lingerByTako) };
}
