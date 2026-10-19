// status.ts — CLI endpoint for `tako status --host <remote>` (S5/S6 of mvp-status-command)
//
// ADR-0019: parse → call the service → print → exit code. The SSH read
// lives in services/docker; this command owns only the text table and the
// exit-code mapping (0 ok · 1 refusal/invalid · 2 unexpected).
import type { StackStatusEntry } from '../../services/docker.js';

const EMPTY_STATE = 'no compose stacks found';

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
