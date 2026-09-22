// cli/commands/agent-run.ts — AGENT-MODE composition root (task 6.1)
//
// Entry point for `tako agent run`, the daemon the systemd --user unit
// starts on the server (design §Data Flow). Wires the WU4/WU5 adapters
// together: bunqueue-backed job store + agent_meta (both under
// ~/.tako/agent.db), the unix-socket protocol server, and the JobHandler
// that maps job definitions to the docker use cases (D4: the agent domain
// never imports docker — this cli root does the runtime wiring).
//
// NEVER IMPORTS INK. Reached only through the lazy-imported CLI path; all
// Bun-only modules (bun:sqlite, bunqueue) load via dynamic import() so
// non-agent paths never touch them (ADR-0016).
//
// WU7 SEAM: the scheduler loop + serial run execution (RunSchedulerLoop +
// ExecuteRun, tasks 7.1-7.5) plug in right after `server.start()` below —
// the store, clock, and handler are already wired for it.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { Clock } from '../../domains/agent/application/Clock.js';
import type { JobExecutionOutcome, JobHandler } from '../../domains/agent/application/JobHandler.js';
import { UNSUPPORTED_OUTCOME } from '../../domains/agent/application/JobHandler.js';
import { parseLingerShowUserOutput } from '../../domains/agent/application/use-cases/InstallAgent.js';
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

  const server: UnixSocketAgentServer = new Server({
    socketPath,
    agentVersion: VERSION,
    store,
    clock,
    status: readHostStatus,
  });

  await server.start();
  log(`tako agent listening on ${socketPath}`);
  log(`job store: ${dataPath}`);
  log('scheduler loop: not started (lands with the WU7 job engine)');

  const shutdown = async (): Promise<void> => {
    await server.stop();
    await store.close();
    meta.close();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  // WU7 SEAM: RunSchedulerLoop + ExecuteRun (serial, one run at a time)
  // attach here with `store`, `clock`, and DockerJobHandler already wired.

  if (options.waitForSignals === false) {
    await shutdown();
    return 0;
  }
  // The listening socket keeps the event loop alive; shutdown happens via
  // the signal handlers above.
  await new Promise<never>(() => {});
  return 0; // unreachable — the promise above never resolves
}
