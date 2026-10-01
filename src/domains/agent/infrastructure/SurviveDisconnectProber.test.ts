// infrastructure/SurviveDisconnectProber.test.ts — STRICT TDD RED phase
//
// Empirical survive-disconnect probe (task 4.7, design §Probe Mechanics):
// close connection A → wait → poll over independent connection B (unit active
// + protocol handshake with expected agentVersion); failures NEVER report
// success and collect diagnostics over B.
import { Duplex } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { helloAckFrame } from '../domain/protocol.js';
import type { AgentChannel } from '../../remotes/application/AgentChannel.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';
import { InMemoryJobStore } from '../testing/InMemoryJobStore.js';
import { SurviveDisconnectProber } from './SurviveDisconnectProber.js';
import { UnixSocketAgentServer } from './UnixSocketAgentServer.js';

const AGENT_VERSION = '0.1.2';
const FAST_DELAYS = { afterCloseMs: 1, pollIntervalMs: 1 };
const instantSleep = (): Promise<void> => Promise.resolve();

function ok(stdout = ''): RemoteCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function createRunner(impl: (command: string) => RemoteCommandResult): RemoteCommandRunner {
  return { run: vi.fn(async (command: string) => impl(command)) };
}

/** Channel fake handing out a fresh duplex that speaks the agent handshake. */
class FakeAgentChannel implements AgentChannel {
  constructor(
    private readonly agentVersion: string,
    private readonly opened: FakeAgentStream[] = []
  ) {}

  async open(): Promise<Duplex> {
    const stream = new FakeAgentStream(this.agentVersion);
    this.opened.push(stream);
    return stream;
  }

  async close(): Promise<void> {
    for (const stream of this.opened) stream.destroy();
  }
}

class FakeAgentStream extends Duplex {
  constructor(agentVersion: string) {
    super({ objectMode: true });
    queueMicrotask(() => {
      this.push(JSON.stringify(helloAckFrame(agentVersion, 'start-probe')));
    });
  }

  override _read(): void {}

  override _write(frame: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    // The fake agent only needs to acknowledge handshakes.
    void frame;
    callback();
  }

  override _final(callback: (error?: Error | null) => void): void {
    callback();
  }
}

describe('SurviveDisconnectProber — success path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tako-probe-'));
  const socketPath = join(dir, 'agent.sock');
  let server: UnixSocketAgentServer;

  afterEach(async () => {
    await server?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes when the unit is active AND a handshake over connection B returns the expected agentVersion', async () => {
    server = new UnixSocketAgentServer({
      socketPath,
      agentVersion: AGENT_VERSION,
      store: new InMemoryJobStore(),
      clock: { now: () => new Date() },
      status: async () => ({ unitState: 'active', linger: true, lingerByTako: false }),
      // The prober never triggers runs; an explicit no-op satisfies the 8.0 bridge contract.
      trigger: async () => {
        throw new Error('the survive-disconnect probe must never trigger a run');
      },
    });
    await server.start();

    const events: string[] = [];
    const prober = new SurviveDisconnectProber({
      closeInstaller: async () => {
        events.push('closed-A');
      },
      openVerifier: async () => ({
        runner: createRunner(command =>
          command.includes('is-active') ? ok('active\n') : ok('')
        ),
        channel: new FakeAgentChannel(AGENT_VERSION),
        close: async () => {
          events.push('closed-B');
        },
      }),
      clientVersion: AGENT_VERSION,
      delays: FAST_DELAYS,
      sleep: instantSleep,
    });

    const result = await prober.probe();

    expect(result.ok).toBe(true);
    expect(events[0]).toBe('closed-A');
    expect(events).toContain('closed-B');
  });
});

describe('SurviveDisconnectProber — failure paths (never report success)', () => {
  it('fails after the poll budget when the unit is inactive, collecting diagnostics over connection B', async () => {
    const closedVerifier: boolean[] = [];
    const prober = new SurviveDisconnectProber({
      closeInstaller: async () => undefined,
      openVerifier: async () => ({
        runner: createRunner(command => {
          if (command.includes('is-active')) return ok('inactive\n');
          if (command.includes('journalctl')) return ok('journal-line-1\njournal-line-2');
          if (command.includes('--property=Linger')) return ok('Linger=no');
          if (command.includes('busctl')) return ok('b false');
          if (command.includes('status tako-agent')) return ok('unit status output');
          return ok('');
        }),
        channel: new FakeAgentChannel(AGENT_VERSION),
        close: async () => {
          closedVerifier.push(true);
        },
      }),
      clientVersion: AGENT_VERSION,
      delays: FAST_DELAYS,
      maxPollAttempts: 3,
      sleep: instantSleep,
    });

    const result = await prober.probe();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.attempts).toBe(3);
    expect(result.diagnostics).toContain('journal-line-1');
    expect(result.diagnostics).toContain('Linger=no');
    expect(result.diagnostics).toContain('b false');
    expect(result.diagnostics).toContain('unit status output');
    expect(closedVerifier.length).toBeGreaterThan(0);
  });

  it('fails when the unit is active but the handshake reports a different agentVersion', async () => {
    const prober = new SurviveDisconnectProber({
      closeInstaller: async () => undefined,
      openVerifier: async () => ({
        runner: createRunner(command => (command.includes('is-active') ? ok('active\n') : ok(''))),
        channel: new FakeAgentChannel('9.9.8'),
        close: async () => undefined,
      }),
      clientVersion: AGENT_VERSION,
      delays: FAST_DELAYS,
      maxPollAttempts: 2,
      sleep: instantSleep,
    });

    const result = await prober.probe();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/version|handshake/i);
  });

  it('fails when the handshake cannot connect at all (agent socket gone)', async () => {
    const prober = new SurviveDisconnectProber({
      closeInstaller: async () => undefined,
      openVerifier: async () => ({
        runner: createRunner(command => (command.includes('is-active') ? ok('active\n') : ok(''))),
        channel: {
          open: async () => {
            throw new Error('connect ECONNREFUSED');
          },
          close: async () => undefined,
        },
        close: async () => undefined,
      }),
      clientVersion: AGENT_VERSION,
      delays: FAST_DELAYS,
      maxPollAttempts: 2,
      sleep: instantSleep,
    });

    const result = await prober.probe();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/handshake|connect/i);
  });

  it('9.13: diagnostics include the ~/.tako listing so a missing socket is NAMED in the failure report', async () => {
    const prober = new SurviveDisconnectProber({
      closeInstaller: async () => undefined,
      openVerifier: async () => ({
        runner: createRunner(command => {
          if (command.includes('is-active')) return ok('active\n');
          if (command.startsWith('ls -la')) {
            return ok('total 20\ndrwx------ 3 ops ops 4096 Sep 28 22:10 .\n-rw-r--r-- 1 ops ops 65 Sep 28 22:10 installed.sha256');
          }
          return ok('');
        }),
        // The real-world failure shape: the unit is active but the channel
        // cannot open because the socket file is gone (deleted ~/.tako).
        channel: {
          open: async () => {
            throw new Error('(SSH) Channel open failure: open failed');
          },
          close: async () => undefined,
        },
        close: async () => undefined,
      }),
      clientVersion: AGENT_VERSION,
      delays: FAST_DELAYS,
      maxPollAttempts: 1,
      sleep: instantSleep,
    });

    const result = await prober.probe();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/handshake|Channel open/i);
    // The listing command AND its output are in the report — the ABSENT
    // agent.sock is visible by comparison (the fake dir has no socket).
    expect(result.diagnostics).toContain('ls -la "$HOME/.tako/"');
    expect(result.diagnostics).toContain('installed.sha256');
    expect(result.diagnostics).not.toContain('agent.sock');
  });

  it('waits after closing connection A before polling (delays honored)', async () => {
    const waited: number[] = [];
    const prober = new SurviveDisconnectProber({
      closeInstaller: async () => undefined,
      openVerifier: async () => ({
        runner: createRunner(command => (command.includes('is-active') ? ok('active\n') : ok(''))),
        channel: new FakeAgentChannel(AGENT_VERSION),
        close: async () => undefined,
      }),
      clientVersion: AGENT_VERSION,
      delays: { afterCloseMs: 2000, pollIntervalMs: 1000 },
      sleep: async ms => {
        waited.push(ms);
      },
    });

    const result = await prober.probe();

    expect(result.ok).toBe(true);
    expect(waited).toContain(2000);
  });
});
