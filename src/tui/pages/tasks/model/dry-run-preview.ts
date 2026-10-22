// pages/tasks/model/dry-run-preview.ts — dry-run report
// summaries (task 8.9). Pure: turns a dry-run's recorded result into a
// headline + detail lines. The model NEVER applies anything — the explicit
// Apply action is wired separately by the page (spec tui-tasks#Dry-Run-
// Preview: nothing is removed until the user explicitly applies).
import type { RunView } from '../../../../services/agent.js';

export interface DryRunSummary {
  /** One-line take: what WOULD happen (or why no report exists). */
  readonly headline: string;
  readonly lines: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeLifecycle(result: Record<string, unknown>): DryRunSummary | null {
  const command = result['command'];

  if (!isRecord(command) || !Array.isArray(command['argv'])) return null;

  const argv = command['argv'].filter((part): part is string => typeof part === 'string');
  const lines: string[] = [];

  if (typeof result['stackDir'] === 'string') lines.push(`stack: ${result['stackDir']}`);

  if (typeof result['op'] === 'string') lines.push(`operation: ${result['op']}`);

  lines.push('nothing was executed — this is the exact command that WOULD run');
  return { headline: `would run: ${argv.join(' ')}`, lines };
}

function summarizePrune(result: Record<string, unknown>): DryRunSummary | null {
  const entries = result['entries'];

  if (!Array.isArray(entries)) return null;

  const lines: string[] = [];
  let total = 0;

  entries.forEach(entry => {
    if (!isRecord(entry)) return;

    const scope = typeof entry['scope'] === 'string' ? entry['scope'] : 'unknown scope';
    const count = typeof entry['count'] === 'number' ? entry['count'] : 0;
    total += count;
    const descriptions = Array.isArray(entry['items'])
      ? entry['items']
          .filter(isRecord)
          .map(item => (typeof item['description'] === 'string' ? item['description'] : String(item['id'] ?? '?')))
          .slice(0, 5)
      : [];
    const detail = descriptions.length > 0 ? ` — ${descriptions.join(', ')}` : '';
    lines.push(`${scope}: ${count} object(s)${detail}`);

    if (typeof entry['spaceReclaimedBytes'] === 'number' && entry['spaceReclaimedBytes'] > 0) {
      lines.push(`  would reclaim ~${formatBytes(entry['spaceReclaimedBytes'])}`);
    }
  });

  lines.push('nothing was removed yet — apply is a separate, explicit action');
  return { headline: `would remove ${total} object(s)`, lines };
}

/** Summarize a dry-run's recorded report; honest fallback when unusable. */
export function summarizeDryRun(run: RunView): DryRunSummary {
  if (run.mode !== 'dry-run' || !isRecord(run.result)) {
    return { headline: 'dry-run report unavailable', lines: [] };
  }

  const failed = run.result['error'];

  if (typeof failed === 'string') {
    return { headline: `dry-run failed: ${failed}`, lines: [] };
  }

  const summary = summarizeLifecycle(run.result) ?? summarizePrune(run.result);
  return summary ?? { headline: 'dry-run report unavailable', lines: [] };
}
