// cli/commands/agent-uninstall.test.ts — STRICT TDD RED phase (tasks 6.4, 6.6)
//
// Uninstall ordering (design §Probe Mechanics): linger-by-tako is read via
// the agent transport BEFORE any teardown; an unreachable transport keeps
// linger enabled with a warning (only-by-tako is never guessed); teardown
// order is stop-unit → remove-unit → daemon-reload → disable-linger-iff-
// by-tako → rm -rf ~/.tako → residue verify on a SECOND connection.
import { Duplex } from 'node:stream';

import { describe, expect, it } from 'vitest';

import type { AgentChannel } from '../../domains/remotes/application/AgentChannel.js';
import type {
  RemoteCommandResult,
  RemoteCommandRunner,
} from '../../domains/remotes/application/RemoteCommandRunner.js';
import { helloAckFrame, responseFrame } from '../../domains/agent/domain/protocol.js';
import type { VerifierConnection } from '../../domains/agent/infrastructure/SurviveDisconnectProber.js';
import { runAgentUninstall, type AgentUninstallDeps } from './agent-uninstall.js';

const CLIENT_VERSION = '0.1.2';

const OK = (stdout = ''): RemoteCommandResult => ({ stdout, stderr: '', exitCode: 0 });
const FAIL = (stderr = 'failed', exitCode = 1): RemoteCommandResult => ({ stdout: '', stderr, exitCode });

class ScriptedRunner implements RemoteCommandRunner {
  readonly calls: string[] = [];

  constructor(
    private readonly respond: (command: string) => RemoteCommandResult,
    private readonly events?: string[]
  ) {}

  async run(command: string): Promise<RemoteCommandResult> {
    this.calls.push(command);
    this.events?.push(`runner:${command}`);
    return this.respond(command);
  }
}

type StatusHandler = () => Record<string, unknown>;

/** Duplex serving hello and one scripted agent.status response. */
class ScriptedAgentChannel extends Duplex implements AgentChannel {
  readonly #version: string;
  readonly #status: StatusHandler | undefined;
  readonly #events?: string[];

  constructor(version: string, status?: StatusHandler, events?: string[]) {
    super({ objectMode: true });
    this.#version = version;
    this.#status = status;
    this.#events = events;
  }

  override _read(): void {}

  override _write(frame: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const parsed = JSON.parse(String(frame)) as { kind: string; id?: string; type?: string };
    if (parsed.kind === 'hello') {
      this.#events?.push('channel:hello');
      this.push(JSON.stringify(helloAckFrame(this.#version, 'start-1')));
    } else if (parsed.kind === 'request' && parsed.id !== undefined) {
      this.#events?.push(`channel:request:${parsed.type ?? 'unknown'}`);
      const payload = this.#status?.() ?? {};
      this.push(JSON.stringify(responseFrame(parsed.id, 'agent.status', payload)));
    }
    callback();
  }

  async open(): Promise<Duplex> {
    return this;
  }

  async close(): Promise<void> {}
}

class UnreachableChannel implements AgentChannel {
  async open(): Promise<Duplex> {
    throw new Error('connect failed: channel open error');
  }

  async close(): Promise<void> {}
}

interface Harness {
  readonly deps: AgentUninstallDeps;
  readonly runner: ScriptedRunner;
  readonly verifierRunner: ScriptedRunner;
  readonly verifierCloses: () => number;
  readonly out: { lines: string[] };
  readonly errs: { lines: string[] };
  /** Shared cross-fake event log: `channel:*` and `runner:*` entries in real-time order. */
  readonly events: string[];
}

function createHarness(
  options: {
    lingerByTako?: boolean | undefined;
    reachable?: boolean;
    teardownFailures?: Record<string, RemoteCommandResult>;
    residue?: Record<string, RemoteCommandResult>;
  } = {}
): Harness {
  const { lingerByTako = false, reachable = true, teardownFailures = {}, residue = {} } = options;
  // One clock for both fakes: teardown-before-read regressions show up as a
  // `runner:*` event preceding the `channel:request:agent.status` read.
  const events: string[] = [];
  const runner = new ScriptedRunner(command => {
    if (command === 'printf %s "$HOME"') return OK('/home/ops');
    for (const [needle, result] of Object.entries(teardownFailures)) {
      if (command.includes(needle)) return result;
    }
    return OK();
  }, events);

  const verifierRunner = new ScriptedRunner(command => {
    for (const [needle, result] of Object.entries(residue)) {
      if (command.includes(needle)) return result;
    }
    if (command.includes('test -e')) return FAIL('exists', 1); // absent = no residue
    if (command.includes('loginctl show-user')) return OK('Linger=no\n');
    return OK();
  });
  let verifierCloseCount = 0;

  const out = { lines: [] as string[] };
  const errs = { lines: [] as string[] };

  const deps: AgentUninstallDeps = {
    runner,
    channel: reachable
      ? new ScriptedAgentChannel(CLIENT_VERSION, () => ({ lingerByTako }), events)
      : new UnreachableChannel(),
    clientVersion: CLIENT_VERSION,
    openVerifier: async (): Promise<VerifierConnection> => ({
      runner: verifierRunner,
      channel: new ScriptedAgentChannel(CLIENT_VERSION),
      close: async () => {
        verifierCloseCount += 1;
      },
    }),
    log: line => {
      out.lines.push(line);
    },
    error: line => {
      errs.lines.push(line);
    },
  };

  return { deps, runner, verifierRunner, verifierCloses: () => verifierCloseCount, out, errs, events };
}

describe('runAgentUninstall — ordering', () => {
  it('9.7: reads linger-by-tako over the transport BEFORE any teardown command (shared event log)', async () => {
    const harness = createHarness({ lingerByTako: true });

    const exitCode = await runAgentUninstall(harness.deps);

    expect(exitCode).toBe(0);
    // The shared event log gives BOTH fakes one clock: the transport read
    // (channel handshake + agent.status request) must appear before the FIRST
    // runner event of any kind, and teardown must have happened at all.
    const statusRead = harness.events.indexOf('channel:request:agent.status');
    const firstRunnerEvent = harness.events.findIndex(event => event.startsWith('runner:'));
    expect(statusRead).toBeGreaterThan(-1);
    expect(firstRunnerEvent).toBeGreaterThan(statusRead);
    expect(harness.events.some(event => event.includes('systemctl --user disable --now'))).toBe(true);
    expect(harness.runner.calls.some(call => call.includes('loginctl disable-linger'))).toBe(true);
  });

  it('6.4 RED: teardown command order is stop → remove unit → daemon-reload → disable linger → rm -rf', async () => {
    const harness = createHarness({ lingerByTako: true });

    await runAgentUninstall(harness.deps);

    const indexOf = (needle: string): number =>
      harness.runner.calls.findIndex(call => call.includes(needle));
    const stop = indexOf('systemctl --user disable --now');
    const removeUnit = indexOf('rm -f');
    const reload = indexOf('daemon-reload');
    const linger = indexOf('loginctl disable-linger');
    const removeDir = indexOf("rm -rf '/home/ops/.tako'");
    expect(stop).toBeGreaterThan(-1);
    expect(removeUnit).toBeGreaterThan(stop);
    expect(reload).toBeGreaterThan(removeUnit);
    expect(linger).toBeGreaterThan(reload);
    expect(removeDir).toBeGreaterThan(linger);
  });

  it('6.4 RED: pre-existing linger (by-tako=false) is preserved — no disable-linger command', async () => {
    const harness = createHarness({ lingerByTako: false });

    const exitCode = await runAgentUninstall(harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.runner.calls.some(call => call.includes('loginctl disable-linger'))).toBe(false);
    expect(harness.out.lines.some(line => line.includes('linger kept'))).toBe(true);
  });
});

describe('runAgentUninstall — unreachable transport keeps linger', () => {
  it('6.6 RED: transport unreachable → warning printed, linger NOT disabled, uninstall completes', async () => {
    const harness = createHarness({ reachable: false });

    const exitCode = await runAgentUninstall(harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.errs.lines.join('\n')).toContain('agent transport unreachable');
    expect(harness.runner.calls.some(call => call.includes('loginctl disable-linger'))).toBe(false);
    expect(harness.out.lines.some(line => line.includes('linger kept'))).toBe(true);
  });
});

describe('runAgentUninstall — failures', () => {
  it('6.6 RED: polkit denial while disabling linger → exit 1 with the polkit remedy', async () => {
    const harness = createHarness({
      lingerByTako: true,
      teardownFailures: { 'loginctl disable-linger': FAIL('Not authorized', 1) },
    });

    const exitCode = await runAgentUninstall(harness.deps);

    expect(exitCode).toBe(1);
    expect(harness.errs.lines.join('\n')).toContain('org.freedesktop.login1.set-self-linger');
  });

  it('6.6 RED: residue found on the second connection → exit 1 naming what stayed behind', async () => {
    const harness = createHarness({
      residue: { 'test -e': OK() }, // everything "exists" → residue
    });

    const exitCode = await runAgentUninstall(harness.deps);

    expect(exitCode).toBe(1);
    expect(harness.out.lines.join('\n')).toContain('residue');
    expect(harness.verifierCloses()).toBe(1);
  });

  it('6.6 RED: teardown step failure surfaces stderr and aborts with exit 1', async () => {
    const harness = createHarness({
      teardownFailures: { 'systemctl --user disable --now': FAIL('Failed to connect to bus', 1) },
    });

    const exitCode = await runAgentUninstall(harness.deps);

    expect(exitCode).toBe(1);
    expect(harness.errs.lines.join('\n')).toContain('Failed to connect to bus');
  });
});
