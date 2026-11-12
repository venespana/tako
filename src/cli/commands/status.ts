// status.ts — CLI endpoint for `tako status --host <remote>` (S5/S6 of
// mvp-status-command; --containers per ADR-0021 / T3-health-status)
//
// ADR-0019: parse → call the service → print → exit code. The SSH read
// lives in services/docker; this command owns only the text tables and the
// exit-code mapping (0 ok · 1 refusal/invalid · 2 unexpected).
import { getContainers, getStackStatus } from '../../services/docker.js';
import type { ContainerSnapshot, StackStatusEntry } from '../../services/docker.js';
import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';

const EMPTY_STATE = 'no compose stacks found';
const EMPTY_CONTAINERS = 'no containers found';

/** Render the status table lines (pure — exported for tests). */
export function formatStatusTable(entries: readonly StackStatusEntry[]): string[] {
  if (entries.length === 0) return [EMPTY_STATE];

  // Two-space column separation; the trailing column is never padded.
  const nameWidth = Math.max('NAME'.length, ...entries.map(e => e.name.length));
  const statusWidth = Math.max('STATUS'.length, ...entries.map(e => e.status.length));
  const header = `${'NAME'.padEnd(nameWidth)}  ${'STATUS'.padEnd(statusWidth)}  CONFIG FILES`;
  const rows = entries.map(e => `${e.name.padEnd(nameWidth)}  ${e.status.padEnd(statusWidth)}  ${e.configFiles}`);

  return [header, ...rows];
}

/** `-` marks a container without a healthcheck (health null). */
const HEALTH_PLACEHOLDER = '-';

/** Render the per-container table lines (pure — exported for tests): one
 * `name  state  health` row per container, aligned, plus a count line. */
export function formatContainersTable(containers: readonly ContainerSnapshot[]): string[] {
  if (containers.length === 0) return [EMPTY_CONTAINERS];

  const nameWidth = Math.max('NAME'.length, ...containers.map(c => c.name.length));
  const stateWidth = Math.max('STATE'.length, ...containers.map(c => c.state.length));
  const header = `${'NAME'.padEnd(nameWidth)}  ${'STATE'.padEnd(stateWidth)}  HEALTH`;
  const rows = containers.map(
    c => `${c.name.padEnd(nameWidth)}  ${c.state.padEnd(stateWidth)}  ${c.health ?? HEALTH_PLACEHOLDER}`
  );
  const count = containers.length === 1 ? '1 container' : `${containers.length} containers`;

  return [header, ...rows, count];
}

/** Sinks the command talks to (injected so tests never touch a real console). */
export interface StatusIo {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

/** `tako status` flags (ADR-0020 shape; --containers per ADR-0021). */
export interface StatusFlags {
  /** Configured remote name. REQUIRED for this slice — the default-remote
   * fallback (`remotes use`) does not exist yet; it becomes optional there. */
  readonly host?: string;
  /** Per-container table (state + health) instead of the compose stack
   * listing (ADR-0021). */
  readonly containers?: boolean;
}

/**
 * Run `tako status [--containers] --host <remote>`: flags → service →
 * print → exit code. Never renders a view; expected outcomes print and map
 * to codes. Without `--containers` the behavior is EXACTLY the pre-flag
 * compose listing (ADR-0021 keeps the contract extension flag-shaped).
 */
export async function runStatus(flags: StatusFlags, io: StatusIo): Promise<number> {
  try {
    // Loud refusal first (ADR-0020 §3): a missing required host prints and
    // exits — it never silently falls back to a default that does not exist.
    if (flags.host === undefined || flags.host === '') {
      io.error('tako status: missing required --host <remote> (no default-remote fallback yet)');
      return 1;
    }

    const sessionPassword = process.env[SESSION_PASSWORD_ENV];

    if (flags.containers === true) {
      const outcome = await getContainers({ remote: flags.host, sessionPassword });

      switch (outcome.kind) {
        case 'ok': {
          formatContainersTable(outcome.containers).forEach(line => io.log(line));
          return 0;
        }
        case 'unknown-remote':
        case 'refusal': {
          io.error(`tako status: ${outcome.reason}`);
          return 1;
        }
      }
    }

    const outcome = await getStackStatus({ remote: flags.host, sessionPassword });

    switch (outcome.kind) {
      case 'ok': {
        formatStatusTable(outcome.entries).forEach(line => io.log(line));
        return 0;
      }
      case 'unknown-remote':
      case 'refusal': {
        io.error(`tako status: ${outcome.reason}`);
        return 1;
      }
    }
  } catch (err) {
    io.error(String(err));
    return 2;
  }
}
