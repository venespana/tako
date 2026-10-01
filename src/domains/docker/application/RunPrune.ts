// RunPrune.ts — use case: safe prune dry-run plan / apply (task 5.4)
//
// BOTH modes pass through the same closed-union validator (ADR-0008,
// spec `agent-jobs#Safe-Prune-Jobs`): a forbidden scope — volume prune,
// all-images prune, typos, non-strings — is rejected before the port is
// ever touched. Dry-run returns the would-remove plan and mutates nothing;
// apply executes per scope and reports the same shape.
//
// The DockerPruner port is declared here (application owns its ports);
// infrastructure/DockerodePruneAdapter.ts is its sole production consumer.

import { parsePruneScopes } from '../domain/prune-policy.js';
import { EXECUTION_MODES } from '../domain/types.js';
import type { ExecutionMode, PruneReport, PruneScope, PruneScopeReport } from '../domain/types.js';

/** Validated inputs for one prune invocation (untrusted by design). */
export interface RunPruneInput {
  readonly scopes: unknown;
  readonly mode: unknown;
}

/**
 * Port: plan and apply scoped prunes. Implementations receive ALREADY
 * VALIDATED closed-union scopes — a volume prune or `image prune -af` is
 * structurally unrepresentable at this boundary.
 */
export interface DockerPruner {
  /** Dry-run plan: what WOULD be removed per scope; mutates nothing. */
  plan(scopes: readonly PruneScope[]): Promise<PruneScopeReport[]>;
  /** Apply: execute the prune per scope; never accepts a forbidden scope. */
  apply(scopes: readonly PruneScope[]): Promise<PruneScopeReport[]>;
}

/** Input validation failure for the execution mode. */
export class PruneValidationError extends Error {
  /** Which input field was rejected. */
  readonly field: 'mode';
  /** Why it was rejected. */
  readonly reason: string;

  constructor(field: 'mode', reason: string) {
    super(`invalid prune ${field}: ${reason}`);
    this.name = 'PruneValidationError';
    this.field = field;
    this.reason = reason;
  }
}

function assertExecutionMode(value: unknown): ExecutionMode {
  if (typeof value !== 'string' || !(EXECUTION_MODES as readonly string[]).includes(value)) {
    throw new PruneValidationError('mode', `must be one of ${EXECUTION_MODES.join('|')}`);
  }
  return value as ExecutionMode;
}

/** Use case: plan (dry-run) or execute (apply) a scoped safe prune. */
export class RunPrune {
  private readonly pruner: DockerPruner;

  constructor(pruner: DockerPruner) {
    this.pruner = pruner;
  }

  /**
   * @throws PruneScopeValidationError for any scope outside the closed union.
   * @throws PruneValidationError for a mode outside dry-run|apply.
   */
  async execute(input: RunPruneInput): Promise<PruneReport> {
    const mode = assertExecutionMode(input.mode);
    const scopes = parsePruneScopes(input.scopes);

    const entries = mode === 'dry-run' ? await this.pruner.plan(scopes) : await this.pruner.apply(scopes);
    return { mode, scopes, entries };
  }
}
