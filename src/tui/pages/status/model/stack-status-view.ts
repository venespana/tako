// stack-status-view.ts — Pure view model for the status dashboard (no React,
// no I/O): classifies one stack's human status text into a 3-bucket health
// (running/stopped/paused), reduces entries to the design's 2-bucket stat
// strip (paused counts as stopped), and maps health → Ink color (pen rows:
// running green, exited red, paused yellow).
import type { StackStatusEntry } from '../../../../services/docker.js';

/** Three-bucket health of one stack, derived from its human status text. */
export type StackHealth = 'running' | 'stopped' | 'paused';

/** Ink color for a health bucket, by pen design. */
export type StackHealthColor = 'green' | 'red' | 'yellow';

/**
 * Classify one stack's status text: contains `exited` → stopped, contains
 * `paused` → paused, everything else (running, restarting, unknown) →
 * running. Mixed text like `running(2) exited(1)` is stopped — any exited
 * container means the stack is not fully up.
 */
export function classifyStackHealth(status: string): StackHealth {
  if (status.includes('exited')) return 'stopped';

  if (status.includes('paused')) return 'paused';

  return 'running';
}

/** The dashboard's stat strip buckets (paused counts as stopped). */
export interface StackStatusStats {
  total: number;
  running: number;
  stopped: number;
}

/** Reduce entries to the stat strip: 2 health buckets plus the total. */
export function computeStatusStats(entries: readonly StackStatusEntry[]): StackStatusStats {
  return entries.reduce<StackStatusStats>(
    (acc, entry) =>
      classifyStackHealth(entry.status) === 'running'
        ? { ...acc, running: acc.running + 1 }
        : { ...acc, stopped: acc.stopped + 1 },
    { total: entries.length, running: 0, stopped: 0 }
  );
}

const HEALTH_COLORS = {
  running: 'green',
  stopped: 'red',
  paused: 'yellow',
} as const satisfies Record<StackHealth, StackHealthColor>;

/** Ink color for a health bucket: running green, stopped red, paused yellow. */
export function healthColor(health: StackHealth): StackHealthColor {
  return HEALTH_COLORS[health];
}
