// use-live-logs.ts — The logs screen's data hook (tui-live-logs T2, batching
// in T5): acquires one live log stream through services/docker
// (streamContainerLogs, ADR-0019 §7 — pages may import services) and consumes
// it as a small state machine: connecting → streaming → ended, or error with
// the reason verbatim (unknown-remote, refusal, transport failure — never
// fake data). Lines append into a 500-line ring, oldest dropped — parked in a
// plain buffer and flushed into state in ONE append per ~100ms window, so a
// flood re-renders once per tick, not once per line; the buffer always
// flushes before the ended/error transition so the status line never hides
// the tail. The dashboard (T7) renders a viewport-bounded window of the
// ring's tail, so the hook's job is only to keep that tail fresh. Cleanup
// ALWAYS stops the handle — unmount therefore ends the channel AND the SSH
// connection (the service's handle contract) — and a handle that only exists
// after cleanup is stopped by its late acquisition instead of leaking. Each
// acquisition pass is its own component mount: the page remounts its session
// per reconnect (key={attempt}, T8 C1), so fresh state is structural — no
// in-hook reset here, and deliberately no effect-body reset either (that
// would paint one commit of the superseded pass's stale ring and add a
// render) and no render-phase setState (the review-flagged anti-pattern).
import { useEffect, useState } from 'react';

import type { ContainerLogStreamHandle } from '../../../../services/docker.js';
import { streamContainerLogs } from '../../../../services/docker.js';

/** The screen's full view state; `connecting` until the service settles. */
export type LiveLogsState =
  { phase: 'connecting' } | { phase: 'streaming' } | { phase: 'error'; reason: string } | { phase: 'ended' };

export interface UseLiveLogsOptions {
  readonly remote: string;
  readonly sessionPassword: string | undefined;
  readonly container: string;
  /** false acquires nothing (the page renders its guard instead). */
  readonly enabled: boolean;
}

export interface LiveLogsModel {
  readonly state: LiveLogsState;
  readonly lines: readonly string[];
}

/** Ring capacity: bounds the buffer of a long-lived stream. The dashboard
 * (T7) renders only the viewport-bounded tail, so this cap is memory
 * hygiene, not visible history. */
const LINE_CAP = 500;

const EMPTY_RING: readonly string[] = [];

/** Append a whole flush batch with oldest-drop; never grows past LINE_CAP. */
const appendBatch = (previous: readonly string[], batch: readonly string[]): readonly string[] => {
  if (batch.length === 0) return previous;

  const combined = [...previous, ...batch];
  const lines = combined.length > LINE_CAP ? combined.slice(combined.length - LINE_CAP) : combined;

  return lines;
};

/** Flush cadence: a flood appends once per tick instead of once per line
 * (~140 lines/s measured during an attack burst — per-line setState
 * re-rendered the whole list at that rate). */
export const FLUSH_INTERVAL_MS = 100;

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function useLiveLogs({ remote, sessionPassword, container, enabled }: UseLiveLogsOptions): LiveLogsModel {
  const [state, setState] = useState<LiveLogsState>({ phase: 'connecting' });
  const [ring, setRing] = useState<readonly string[]>(EMPTY_RING);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let handle: ContainerLogStreamHandle | undefined;

    // T5 batching: incoming lines park in `pending` — a plain array, NOT
    // state — and land in React state in ONE setRing per flush window, so
    // a flood re-renders once per tick instead of once per line. The timer
    // starts when the first line arrives; never-flushed lines are discarded
    // at cleanup (the state dies with the component anyway). The buffer and
    // timer live in this pass's closure — each remount gets a fresh one —
    // and the cleanup clears the pending timer.
    let pending: string[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    const flushPending = (): void => {
      if (pending.length === 0) return;

      const batch = pending;

      pending = [];
      setRing(previous => appendBatch(previous, batch));
    };

    const scheduleFlush = (): void => {
      if (flushTimer !== undefined) return;

      flushTimer = setTimeout(() => {
        flushTimer = undefined;
        flushPending();
      }, FLUSH_INTERVAL_MS);
    };

    // One acquisition + consumption pass. `cancelled` is the single cancel
    // flag: everything past it is ignored, and cleanup stops whatever the
    // pass acquired (see the return below and the late-acquisition branch).
    // All state writes happen in the async callbacks — never synchronously
    // in the effect body. Every pass is its own component mount (the route
    // shim keys by container, the page's reconnect keys by attempt), so
    // each pass starts from initial state structurally, and the setRing
    // below re-asserts the empty ring when the fresh handle attaches.
    streamContainerLogs({ remote, sessionPassword, container }).then(
      outcome => {
        if (outcome.kind !== 'ok') {
          if (!cancelled) setState({ phase: 'error', reason: outcome.reason });

          return;
        }

        if (cancelled) {
          // Unmount (or a dependency change) won the race: the handle exists
          // now, so THIS branch is its cleanup.
          void outcome.stream.stop();

          return;
        }

        const stream = outcome.stream;
        handle = stream;
        setRing(EMPTY_RING);
        setState({ phase: 'streaming' });

        void (async () => {
          try {
            // Manual iterator protocol: the repo bans for-of statements, and
            // async consumption has no iterable-operation equivalent.
            const iterator = stream.lines[Symbol.asyncIterator]();

            while (true) {
              if (cancelled) break;

              const result = await iterator.next();

              if (result.done) break;

              pending.push(result.value);
              scheduleFlush();
            }

            // The loop exits when stop() ended it or the remote process
            // exited. Flush BEFORE the phase change: a timer-only flush
            // could leave the ended status line sitting over an incomplete
            // tail (or over none of the last lines at all).
            if (!cancelled) flushPending();

            // Only the remote process exiting is a state the screen renders.
            const how = await stream.done;

            if (!cancelled && how === 'ended') setState({ phase: 'ended' });
          } catch (error) {
            // Same ordering as the ended path: the tail completes before the
            // error status lands.
            if (!cancelled) {
              flushPending();
              setState({ phase: 'error', reason: reasonOf(error) });
            }
          }
        })();
      },
      error => {
        if (!cancelled) setState({ phase: 'error', reason: reasonOf(error) });
      }
    );

    return () => {
      cancelled = true;

      if (flushTimer !== undefined) clearTimeout(flushTimer);

      void handle?.stop();
    };
  }, [enabled, remote, sessionPassword, container]);

  return { state, lines: ring };
}
