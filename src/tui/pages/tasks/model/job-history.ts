// pages/tasks/model/job-history.ts — history presentation
// model (task 8.7). Pure: rows newest-first, status glyph/color pairs, and
// one-line result summaries for the three result shapes the protocol can
// deliver ({ error } / lifecycle report / prune report).
import type { RunMode, RunStatus, RunView } from '../../../../domains/agent/domain/types.js';

export interface RunStatusStyle {
  readonly glyph: string;
  readonly color: 'green' | 'red' | 'yellow' | 'cyan' | 'gray';
}

export function formatRunStatus(status: RunStatus): RunStatusStyle {
  switch (status) {
    case 'pending':
      return { glyph: '·', color: 'gray' };
    case 'running':
      return { glyph: '…', color: 'cyan' };
    case 'succeeded':
      return { glyph: '✓', color: 'green' };
    case 'failed':
      return { glyph: '✗', color: 'red' };
    case 'unsupported':
      return { glyph: '×', color: 'yellow' };
  }
}

/** One render-ready history row (newest-first list of these). */
export interface HistoryRow {
  readonly seq: number;
  readonly id: string;
  readonly mode: RunMode;
  readonly status: RunStatus;
  readonly style: RunStatusStyle;
  readonly catchup: boolean;
  readonly startedAt: string;
  readonly outcome: string;
}

export function toHistoryRows(runs: readonly RunView[]): HistoryRow[] {
  return [...runs]
    .sort((a, b) => b.seq - a.seq)
    .map(run => ({
      seq: run.seq,
      id: run.id,
      mode: run.mode,
      status: run.status,
      style: formatRunStatus(run.status),
      catchup: run.catchup,
      startedAt: run.startedAt,
      outcome: summarizeRunResult(run.result),
    }));
}

// ---------------------------------------------------------------------------
// Result summarization — structural narrowing over the wire-shaped payloads
// ({ error } from failures, StackLifecycleReport / PruneReport from docker).
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function summarizeRunResult(result: unknown): string {
  if (!isRecord(result)) return '—';

  const error = result['error'];
  if (typeof error === 'string') return error;

  const command = result['command'];
  if (isRecord(command) && Array.isArray(command['argv'])) {
    return command['argv'].filter(part => typeof part === 'string').join(' ');
  }

  const entries = result['entries'];
  if (Array.isArray(entries)) {
    const count = entries.reduce((total, entry) => {
      return isRecord(entry) && typeof entry['count'] === 'number' ? total + entry['count'] : total;
    }, 0);
    const scopes = entries.length;
    const partial = entries.some(entry => isRecord(entry) && entry['error'] !== undefined);
    const base = `${count} object(s) across ${scopes} scope(s)`;
    return partial ? `${base} — partial failure` : base;
  }

  return '—';
}
