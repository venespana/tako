// pages/tasks/model/use-agent-install.ts — The install pane's state machine
// (9.14b, its model hook since 9.16; IN-PROCESS since 9.19): output-line
// buffer, the idle/running/done phase machine, r-retry (a NOT-running
// install only), autoStart-once per visit, and stale-run guards for late
// progress lines.
// The install itself is the gateway's async install() — composed in-process
// by the route shim over the shared agent pipeline (no child process, no
// watchdog: steps report progress by construction). This hook only
// orchestrates state; install calls happen in actions and effects, never
// inside an Ink render body.
import { useCallback, useEffect, useRef, useState } from 'react';

import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';

/**
 * Terminal outcome of one install attempt (structural match for
 * TasksGateway.install in model/tasks-store.ts).
 */
export type InstallOutcome = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** The gateway-driven install: report progress lines, resolve the outcome. */
export type InstallRunner = (onLine: (line: string) => void) => Promise<InstallOutcome>;

export type InstallPhase = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; outcome: InstallOutcome };

export interface UseAgentInstallOptions {
  /** Auto-run the install once when the panel first appears (first visit). */
  readonly autoStart: boolean;
  /** Called after a successful install: reconnect the workspace. */
  readonly onInstalled: () => void;
  /** Notified on every install start (auto or retry) — page records the attempt. */
  readonly onStart: () => void;
  /** The gateway-driven install (injected by the page from the tasks gateway). */
  readonly install: InstallRunner;
}

export interface AgentInstallModel {
  /** Output lines kept in state (bounded); the pane shows the latest tail. */
  readonly lines: readonly { readonly id: number; readonly text: string }[];
  readonly phase: InstallPhase;
}

/** Lines kept in state (bounded); the pane shows the most recent tail. */
const KEPT_LINES = 200;

export function useAgentInstall({
  autoStart,
  onInstalled,
  onStart,
  install,
}: UseAgentInstallOptions): AgentInstallModel {
  const [lines, setLines] = useState<{ readonly id: number; readonly text: string }[]>([]);
  // A remount WITHOUT autoStart (failed reconnect after a successful install)
  // lands on idle — honest state, r re-runs the install if the user wants.
  const [phase, setPhase] = useState<InstallPhase>(autoStart ? { kind: 'running' } : { kind: 'idle' });

  // Monotonic line ids: the visible window shifts (oldest dropped), so array
  // indexes would re-key every row on each append.
  const nextLineIdRef = useRef(0);

  // Latest callbacks without re-arming the install effect on parent re-renders.
  const onInstalledRef = useRef(onInstalled);
  useEffect(() => {
    onInstalledRef.current = onInstalled;
  }, [onInstalled]);

  // Stale-run guards: only the LATEST attempt may publish lines or the final
  // phase, and nothing publishes after unmount (a retry or remount must not
  // be corrupted by a previous attempt's late progress lines).
  const runIdRef = useRef(0);
  const disposedRef = useRef(false);
  useEffect(() => {
    return () => {
      disposedRef.current = true;
    };
  }, []);

  const start = useCallback(() => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setLines([]);
    setPhase({ kind: 'running' });
    onStart();
    void install(line => {
      if (disposedRef.current || runIdRef.current !== runId) return;

      setLines(previous => [...previous, { id: nextLineIdRef.current++, text: line }].slice(-KEPT_LINES));
    })
      .then(outcome => {
        if (disposedRef.current || runIdRef.current !== runId) return;

        setPhase({ kind: 'done', outcome });

        if (outcome.ok) onInstalledRef.current();
      })
      .catch((error: unknown) => {
        // install() resolves outcomes and should not reject; if it ever does,
        // land in `done` with the reason so the machine cannot wedge on
        // `running`.
        if (disposedRef.current || runIdRef.current !== runId) return;

        setPhase({
          kind: 'done',
          outcome: { ok: false, error: error instanceof Error ? error.message : String(error) },
        });
      });
  }, [install, onStart]);

  // Auto-start once per visit. There is no child to cancel on unmount (the
  // install runs in-process): disposition only stops state publication — the
  // remote-side attempt runs to completion and closes its own connection.
  const startedRef = useRef(false);
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);
  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      startRef.current();
    }
  }, [autoStart]);

  // r runs/restarts a NOT-running install; a running install is left alone.
  useKeyBindings(
    {
      chars: {
        r: () => {
          if (phase.kind === 'idle' || phase.kind === 'done') start();
        },
      },
    },
    { isActive: phase.kind === 'idle' || phase.kind === 'done' }
  );

  return {
    lines,
    phase,
  };
}
