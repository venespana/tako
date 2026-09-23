// cli/commands/agent-run.ts — AGENT-MODE composition root (tasks 6.1 + 7.3)
//
// Entry point for `tako agent run`, the daemon the systemd --user unit
// starts on the server (design §Data Flow). Wires the WU4/WU5/WU7 pieces
// together: bunqueue-backed job store + agent_meta (both under
// ~/.tako/agent.db), the unix-socket protocol server, the watchdog-guarded
// JobHandler mapping job definitions to the docker use cases (D4: the agent
// domain never imports docker — this cli root does the runtime wiring), and
// the RunSchedulerLoop + ExecuteRun engine that makes the queue live
// autonomously (serial drain, missed-once catch-up, crash-guard watermarks).
//
// NEVER IMPORTS INK. Reached only through the lazy-imported CLI path; all
// Bun-only modules (bun:sqlite, bunqueue) load via dynamic import() so
// non-agent paths never touch them (ADR-0016).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { Clock } from '../../domains/agent/application/Clock.js';
import { ExecuteRun } from '../../domains/agent/application/ExecuteRun.js';
import type { JobExecutionOutcome, JobHandler } from '../../domains/agent/application/JobHandler.js';
import { UNSUPPORTED_OUTCOME } from '../../domains/agent/application/JobHandler.js';
import { DEFAULT_TICK_INTERVAL_MS, RunSchedulerLoop } from '../../domains/agent/application/RunSchedulerLoop.js';
import { parseLingerShowUserOutput } from '../../domains/agent/application/use-cases/InstallAgent.js';
import { eventFrame } from '../../domains/agent/domain/protocol.js';
import type { JobDefinition, RunMode } from '../../domains/agent/domain/types.js';
import type {
  UnixSocketAgentServer,
  AgentHostStatus,
} from '../../domains/agent/infrastructure/UnixSocketAgentServer.js';
import type { PruneReport, StackLifecycleReport } from '../../domains/docker/domain/types.js';

const execFileAsync = promisify(execFile);

const SYSTEMD_UNIT = 'tako-agent.service';
const LINGER_SHOW_USER = ['show-user', process.env['USER'] ?? process.env['LOGNAME'] ?? '', '--property=Linger'].filter(
  Boolean
);

/**
 * Task 7.5: a wedged compose call (e.g. an unattended `pull` against a dead
 * daemon) must not hang the serial queue forever. The budget is deliberately
 * generous — real image pulls over slow links can take minutes.
 */
export const DEFAULT_WATCHDOG_TIMEOUT_MS = 10 * 60 * 1000;

/** Bun-only default DB location: ~/.tako/agent.db (design D3/D8). */
export function defaultAgentDataPath(): string {
  return join(homedir(), '.tako', 'agent.db');
}

/** Default unix socket location: ~/.tako/agent.sock. */
export function defaultAgentSocketPath(): string {
  return join(homedir(), '.tako', 'agent.sock');
}

/** Task 7.5 mapping: 'planned' (dry-run) → 'succeeded'; the report stays the run result. */
export function mapLifecycleOutcome(report: StackLifecycleReport): JobExecutionOutcome {
  const status = report.status === 'planned' ? 'succeeded' : report.status;
  return { status, result: report };
}

/** Task 7.5 mapping: ANY per-scope prune error → 'failed' (full report recorded). */
export function mapPruneOutcome(report: PruneReport): JobExecutionOutcome {
  const failed = report.entries.some(entry => entry.error !== undefined);
  return { status: failed ? 'failed' : 'succeeded', result: report };
}

/**
 * JobHandler wired to the docker use cases (task 6.1; terminal-status rules
 * per 7.5). Validation errors (hostile stackDir, bad mode) THROW — the
 * engine layer (WU7) records them as failed runs; protocol-triggered
 * executions surface as error frames via the socket server.
 */
export class DockerJobHandler implements JobHandler {
  async execute(job: JobDefinition, mode: RunMode): Promise<JobExecutionOutcome> {
    switch (job.type) {
      case 'server-config':
        return UNSUPPORTED_OUTCOME;
      case 'stack-lifecycle': {
        const { ComposeCliAdapter } = await import('../../domains/docker/infrastructure/ComposeCliAdapter.js');
        const { RunStackLifecycle } = await import('../../domains/docker/application/RunStackLifecycle.js');
        const report = await new RunStackLifecycle(new ComposeCliAdapter()).execute({
          op: job.op,
          stackDir: job.stackDir,
          mode,
        });
        return mapLifecycleOutcome(report);
      }
      case 'prune': {
        const { DockerodePruneAdapter } = await import('../../domains/docker/infrastructure/DockerodePruneAdapter.js');
        const { RunPrune } = await import('../../domains/docker/application/RunPrune.js');
        const report = await new RunPrune(new DockerodePruneAdapter()).execute({ scopes: job.scopes, mode });
        return mapPruneOutcome(report);
      }
    }
  }
}

/** Thrown when a job execution exceeds the watchdog budget (7.5). */
export class WatchdogTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      `job execution exceeded the ${(timeoutMs / 1000).toFixed(0)}s watchdog timeout — the underlying ` +
        'process may still be running, but the run is recorded as failed so the serial queue keeps draining'
    );
    this.name = 'WatchdogTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Task 7.5: bound one handler execution to a wall-clock budget. The engine
 * (ExecuteRun) records the rejection as a failed run with the watchdog
 * message, so the queue can never wedge on a compose call that will never
 * answer. The underlying process is NOT killed — only the queue unblocks.
 */
export function withWatchdogTimeout(handler: JobHandler, timeoutMs: number): JobHandler {
  return {
    async execute(job: JobDefinition, mode: RunMode): Promise<JobExecutionOutcome> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          handler.execute(job, mode),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new WatchdogTimeoutError(timeoutMs)), timeoutMs);
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}

/** Local host facts for agent.status (systemd, linger, recorded by-tako flag). */
export async function readHostStatus(): Promise<AgentHostStatus> {
  const lingerByTako = existsSync(join(homedir(), '.tako', 'linger.by-tako'));
  return {
    unitState: await readUnitState(),
    linger: await readLinger(),
    lingerByTako,
  };
}

async function readUnitState(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('systemctl', ['--user', 'is-active', SYSTEMD_UNIT]);
    return stdout.trim();
  } catch (error) {
    // `is-active` exits non-zero for inactive/failed — stdout still names the state.
    const shellError = error as { stdout?: string };
    const state = shellError.stdout?.trim();
    return state !== undefined && state !== '' ? state : 'unknown';
  }
}

async function readLinger(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('loginctl', LINGER_SHOW_USER);
    return parseLingerShowUserOutput(stdout) ?? false;
  } catch {
    return false;
  }
}

export interface AgentRunOptions {
  /** Override the agent unix socket path (~/.tako/agent.sock by default). */
  readonly socketPath?: string;
  readonly log?: (line: string) => void;
  readonly error?: (line: string) => void;
  /** Test seam: skip the blocking wait after start(). */
  readonly waitForSignals?: boolean;
  /** Scheduler tick cadence (design: 30 s). */
  readonly schedulerIntervalMs?: number;
  /** Per-run watchdog budget for wedged compose calls (default 10 min). */
  readonly watchdogTimeoutMs?: number;
}

/**
 * Teardown contract of the agent process, in THIS order (9.7 — unit-tested):
 * the scheduler tick + in-flight run settle and queued firings roll back
 * BEFORE the socket closes and the stores shut down. The structural types
 * let unit tests pin the sequence with fakes.
 */
export interface AgentProcessComponents {
  readonly scheduler: { stop(): Promise<void> };
  readonly server: { stop(): Promise<void> };
  readonly store: { close(): Promise<void> };
  readonly meta: { close(): void };
}

export async function shutdownAgentProcess(components: AgentProcessComponents): Promise<void> {
  await components.scheduler.stop();
  await components.server.stop();
  await components.store.close();
  components.meta.close();
}

export async function runAgentRun(options: AgentRunOptions = {}): Promise<number> {
  const log = options.log ?? (line => console.log(line));
  const error = options.error ?? (line => console.error(line));

  // ADR-0016: agent mode REQUIRES Bun (bun:sqlite + bunqueue).
  if (typeof Bun === 'undefined') {
    error(
      'tako agent run requires the Bun runtime — the compiled binary or `bun run` provides it; npm/Node is not supported for agent mode'
    );
    return 1;
  }

  const dataPath = defaultAgentDataPath();
  const socketPath = options.socketPath ?? defaultAgentSocketPath();

  const { BunqueueJobStore } = await import('../../domains/agent/infrastructure/persistence/BunqueueJobStore.js');
  const { openAgentMeta } = await import('../../domains/agent/infrastructure/persistence/agent-meta.js');
  const { UnixSocketAgentServer: Server } = await import('../../domains/agent/infrastructure/UnixSocketAgentServer.js');
  const { VERSION } = await import('../../shared/lib/version.js');

  const store = new BunqueueJobStore({ dataPath });
  await store.open();
  const meta = openAgentMeta(dataPath);
  const clock: Clock = { now: () => new Date() };

  // The running agent IS the installed agent — record the install facts.
  meta.setInstalledVersion(VERSION);
  meta.setInstalledAt(new Date().toISOString());

  // Tasks 7.3 + 8.0: the job engine is built BEFORE the server so the socket
  // handler can delegate jobs.trigger to the scheduler's serial queue —
  // triggered runs never execute inline in the connection handler. Watchdog-
  // guarded handler, serial run execution, and the 30 s catch-up tick; run
  // state changes broadcast to connected clients as protocol push events
  // (job.state_changed / run.completed).
  const schedulerIntervalMs = options.schedulerIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  const watchdogTimeoutMs = options.watchdogTimeoutMs ?? DEFAULT_WATCHDOG_TIMEOUT_MS;
  const engine = new ExecuteRun({
    store,
    clock,
    handler: withWatchdogTimeout(new DockerJobHandler(), watchdogTimeoutMs),
    onEvent: event => server.broadcastEvent(eventFrame(event.type, event.payload)),
  });
  const scheduler = new RunSchedulerLoop({
    store,
    clock,
    executeRun: engine,
    intervalMs: schedulerIntervalMs,
    log,
    error,
  });
  const server: UnixSocketAgentServer = new Server({
    socketPath,
    agentVersion: VERSION,
    store,
    clock,
    status: readHostStatus,
    // Task 8.0: triggers drain through the SAME serial queue as cron fires.
    trigger: (jobId, mode) => scheduler.enqueueTriggered(jobId, mode),
  });

  await server.start();
  log(`tako agent listening on ${socketPath}`);
  log(`job store: ${dataPath}`);
  await scheduler.start();
  log(`scheduler loop: ticking every ${schedulerIntervalMs} ms (serial run queue, ${watchdogTimeoutMs} ms watchdog)`);

  const shutdown = (): Promise<void> =>
    // Order matters (see shutdownAgentProcess): stop the tick + finish the
    // in-flight run (rolling back queued firings for the next start) BEFORE
    // tearing down the store.
    shutdownAgentProcess({ scheduler, server, store, meta });
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  if (options.waitForSignals === false) {
    await shutdown();
    return 0;
  }
  // The listening socket keeps the event loop alive; shutdown happens via
  // the signal handlers above.
  await new Promise<never>(() => {});
  return 0; // unreachable — the promise above never resolves
}
