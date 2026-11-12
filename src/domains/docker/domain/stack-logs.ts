// stack-logs.ts — compose stack-log name gate + command builder (T1-cli-logs)
//
// Pure module: no I/O, no node imports — same discipline as
// container-lifecycle.ts. The stack name is the one piece of caller input
// in the remote `docker compose -p <name> logs` command, and unlike the
// status path (which lists every stack), `logs` targets ONE project by
// name — so the name passes a closed grammar gate BEFORE any shell string
// is built. The grammar is compose's own project-name shape: starts
// alphanumeric, then 1+ of [a-zA-Z0-9_.-] — no whitespace, no shell
// metacharacters, no leading dash, so a name that passes the gate can
// never reshape a remote command line.

/** Compose-safe project name: starts alphanumeric, then [a-zA-Z0-9_.-] */
export const STACK_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** Whether `name` can safely appear in a remote `docker compose -p` command line. */
export function isValidStackName(name: string): boolean {
  return STACK_NAME_PATTERN.test(name);
}

/** POSIX single-quote: ' → '\'' — defense in depth; gated names have no quotes. */
function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * The one remote command shape this feature ever runs: `docker compose -p
 * <stack> logs`, appending ` -f` exactly when follow is requested. `-p`
 * targets a project from any cwd over SSH. No --tail: the command contract
 * (`docs/commands.md`) declares none.
 */
export const composeLogsCommand = (stack: string, follow: boolean): string =>
  `docker compose -p ${shellSingleQuote(stack)} logs${follow ? ' -f' : ''}`;
