// services/docker.ts — in-process API over the docker domain (ADR-0019).
//
// Complete domain functions for stack lifecycle and prune: minimal request
// in, typed report out. The adapter choice stays PRIVATE wiring — and stays
// LAZY (dynamic import inside each function) so agent-mode paths that only
// run lifecycle jobs never load dockerode, and vice versa (ADR-0016
// discipline, now owned by the service instead of the CLI handler).
import { RunPrune } from '../domains/docker/application/RunPrune.js';
import { RunStackLifecycle } from '../domains/docker/application/RunStackLifecycle.js';
import type {
  ExecutionMode,
  LifecycleOp,
  PruneReport,
  PruneScope,
  StackLifecycleReport,
} from '../domains/docker/domain/types.js';

export type {
  ExecutionMode,
  LifecycleOp,
  PruneReport,
  PruneScope,
  StackLifecycleReport,
} from '../domains/docker/domain/types.js';

/** One compose stack lifecycle operation (validated in-domain before anything runs). */
export function runStackLifecycle(request: {
  readonly op: LifecycleOp;
  readonly stackDir: string;
  readonly mode: ExecutionMode;
}): Promise<StackLifecycleReport> {
  return (async () => {
    const { ComposeCliAdapter } = await import('../domains/docker/infrastructure/ComposeCliAdapter.js');
    return new RunStackLifecycle(new ComposeCliAdapter()).execute(request);
  })();
}

/** One scoped safe prune (the closed ADR-0008 scope union; never accepts forbidden scopes). */
export function runPrune(request: {
  readonly scopes: PruneScope[];
  readonly mode: ExecutionMode;
}): Promise<PruneReport> {
  return (async () => {
    const { DockerodePruneAdapter } = await import('../domains/docker/infrastructure/DockerodePruneAdapter.js');
    return new RunPrune(new DockerodePruneAdapter()).execute(request);
  })();
}
