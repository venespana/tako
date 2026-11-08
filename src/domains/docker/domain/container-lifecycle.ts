// container-lifecycle.ts — docker container lifecycle ops + name gate
// (iteration 3 of tui-remote-home-screen)
//
// Pure module: no I/O, no node imports. `ContainerLifecycleOp` is a CLOSED
// union — `stop` and arbitrary verbs are structurally unrepresentable, so
// rejection does not depend on call-site discipline (the PRUNE_SCOPES
// pattern). The name pattern is docker's own container-name grammar:
// names never start with a dash/dot, contain no whitespace and no shell
// metacharacters, so a name that passes the gate can never reshape a remote
// command line. Anything else is refused before it reaches a shell string.

/** One container lifecycle operation the hub screen may run. */
export type ContainerLifecycleOp = 'start' | 'restart';

/** Closed members of {@link ContainerLifecycleOp}, in canonical order. */
export const CONTAINER_LIFECYCLE_OPS: readonly ContainerLifecycleOp[] = ['start', 'restart'];

/** Docker-safe container name: starts alphanumeric, then 1+ of
 * [a-zA-Z0-9_.-] — docker's own grammar (2+ characters total). */
export const CONTAINER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/;

/** Type guard for values arriving across a trust boundary (protocol, JSON). */
export function isContainerLifecycleOp(value: unknown): value is ContainerLifecycleOp {
  return typeof value === 'string' && (CONTAINER_LIFECYCLE_OPS as readonly string[]).includes(value);
}

/** Whether `name` can safely appear in a remote docker command line. */
export function isValidContainerName(name: string): boolean {
  return CONTAINER_NAME_PATTERN.test(name);
}
