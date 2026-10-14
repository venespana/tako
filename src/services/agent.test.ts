// services/agent.test.ts — service-level tests for the agent client API
// (ADR-0019): the 9.17 socket-probe guard, the connect session flow (probe
// BEFORE channel open; refusals as objects, transport failures as throws),
// the in-process install mapping, and the conf-backed reconcile cursor.
// Domains' ports and adapters are mocked — no real SSH, no real conf.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertAgentSocketPresent,
  connectAgentSession,
  installAgent,
  AgentNotInstalledError,
  resolveAgentSocketPath,
  fetchAgentStatus,
  loadReconcileCursor,
  saveReconcileCursor,
  uninstallAgent,
} from './agent.js';
import { resolveRemoteAuth } from './remotes.js';
import type { AgentSession } from '../domains/agent/application/AgentTransport.js';
import type { AgentRequestType, AgentStatusResult } from '../domains/agent/domain/protocol.js';
import type { RemoteCommandResult } from '../domains/remotes/application/RemoteCommandRunner.js';
import { SshConnectionManager } from '../domains/remotes/infrastructure/SshConnectionManager.js';
import { VERSION } from '../shared/lib/version.js';

vi.mock('./remotes.js', () => ({
  decideRemoteAuth: vi.fn(),
  resolveRemoteAuth: vi.fn(),
}));

const confData = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../domains/remotes/infrastructure/createConfStore.js', () => ({
  createConfStore: () => ({
    get: (key: string) => confData.get(key),
    set: (key: string, value: unknown) => {
      confData.set(key, value);
    },
    has: (key: string) => confData.has(key),
  }),
}));

const runMock = vi.hoisted(() => vi.fn<(command: string) => Promise<RemoteCommandResult>>());
vi.mock('../domains/remotes/infrastructure/SshRemoteCommandRunner.js', () => ({
  SshRemoteCommandRunner: vi.fn(function () {
    return { run: runMock };
  }),
}));

const managerEnd = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock('../domains/remotes/infrastructure/SshConnectionManager.js', () => ({
  SshConnectionManager: vi.fn(function () {
    return { end: managerEnd, sftp: vi.fn() };
  }),
}));

vi.mock('../domains/remotes/infrastructure/SftpRemoteFileTransfer.js', () => ({
  SftpRemoteFileTransfer: vi.fn(),
}));

vi.mock('../domains/remotes/infrastructure/StreamLocalAgentChannel.js', () => ({
  StreamLocalAgentChannel: vi.fn(),
}));

const transportConnect = vi.hoisted(() => vi.fn<() => Promise<AgentSession>>());
const transportOptions = vi.hoisted(() => vi.fn());
vi.mock('../domains/agent/infrastructure/StreamLocalAgentTransport.js', () => ({
  StreamLocalAgentTransport: vi.fn(function (options: unknown) {
    transportOptions(options);
    return { connect: transportConnect };
  }),
}));

interface InstallDepsProbe {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  readonly clientVersion: string;
}

const runInstallMock = vi.hoisted(() => vi.fn<(deps: InstallDepsProbe) => Promise<number>>());
vi.mock('../domains/agent/infrastructure/AgentInstallPipeline.js', () => ({
  runAgentInstall: runInstallMock,
}));

const RESOLVED = {
  kind: 'resolved',
  remote: { name: 'nas', type: 'ssh', username: 'ops', host: 'nas.lan', port: 22, credentialType: 'store' },
  auth: { type: 'password', password: 'pw' },
} as const;

const ok = (stdout = ''): RemoteCommandResult => ({ stdout, stderr: '', exitCode: 0 });

function mockResolvedAuth(): void {
  vi.mocked(resolveRemoteAuth).mockResolvedValue(RESOLVED);
}

beforeEach(() => {
  vi.clearAllMocks();
  confData.clear();
  runMock.mockReset();
  transportConnect.mockReset();
  runInstallMock.mockReset();
});

describe('assertAgentSocketPresent — 9.17 connect guard', () => {
  function scriptRunner(respond: (command: string) => RemoteCommandResult): void {
    runMock.mockImplementation(async command => respond(command));
  }

  it('missing socket → the TYPED friendly error naming the remote and the install panel', async () => {
    scriptRunner(command =>
      command.startsWith('test -S') ? { stdout: '', stderr: '', exitCode: 1 } : ok('/home/ops')
    );

    const error = await assertAgentSocketPresent({ run: runMock }, 'nas').then(
      () => {
        throw new Error('expected assertAgentSocketPresent to reject');
      },
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AgentNotInstalledError);
    expect((error as Error).message).toBe('agent not installed on nas — the install panel will set it up');
  });

  it('probes the RESOLVED absolute socket path (home via exec — no tilde assumptions)', async () => {
    scriptRunner(command => (command.startsWith('test -S') ? ok() : ok('/home/ops')));

    await expect(assertAgentSocketPresent({ run: runMock }, 'nas')).resolves.toBeUndefined();

    expect(runMock).toHaveBeenCalledWith('printf %s "$HOME"');
    expect(runMock).toHaveBeenCalledWith("test -S '/home/ops/.tako/agent.sock'");
  });

  it('OTHER transport failures keep their own message (never relabeled as not-installed)', async () => {
    scriptRunner(() => {
      throw new Error('(SSH) Channel open failure: open failed');
    });

    const error = await assertAgentSocketPresent({ run: runMock }, 'nas').then(
      () => {
        throw new Error('expected assertAgentSocketPresent to reject');
      },
      (e: unknown) => e
    );

    expect(error).not.toBeInstanceOf(AgentNotInstalledError);
    expect((error as Error).message).toBe('(SSH) Channel open failure: open failed');
  });

  it('an unresolvable remote home fails explicitly (never misread as not-installed)', async () => {
    scriptRunner(() => ok(''));

    const error = await assertAgentSocketPresent({ run: runMock }, 'nas').then(
      () => {
        throw new Error('expected assertAgentSocketPresent to reject');
      },
      (e: unknown) => e
    );

    expect(error).not.toBeInstanceOf(AgentNotInstalledError);
    expect((error as Error).message).toMatch(/cannot resolve the remote home directory/);
  });

  it('resolveAgentSocketPath joins the remote home with the default agent socket path', () => {
    expect(resolveAgentSocketPath('/home/ops')).toBe('/home/ops/.tako/agent.sock');
  });
});

describe('connectAgentSession', () => {
  it('unknown remote / refused credentials → the refusal object, zero SSH wiring', async () => {
    vi.mocked(resolveRemoteAuth).mockResolvedValue({
      kind: 'unknown-remote',
      reason: 'unknown remote "ghost" — add it first with "tako remote add"',
    });

    const result = await connectAgentSession({ remote: 'ghost' });

    expect(result).toEqual({ kind: 'refused', reason: 'unknown remote "ghost" — add it first with "tako remote add"' });
    expect(SshConnectionManager).not.toHaveBeenCalled();
  });

  it('probes the socket BEFORE opening the transport channel; a probe failure closes the connection', async () => {
    mockResolvedAuth();
    runMock.mockImplementation(async command =>
      command.startsWith('test -S') ? { stdout: '', stderr: '', exitCode: 1 } : ok('/home/ops')
    );

    const error = await connectAgentSession({ remote: 'nas' }).then(
      () => {
        throw new Error('expected connectAgentSession to reject');
      },
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AgentNotInstalledError);
    // R3-004: the typed contract survives the pushdown — same message, and
    // the SSH manager is closed on this failure path (no leaked connection).
    expect((error as Error).message).toBe('agent not installed on nas — the install panel will set it up');
    expect(managerEnd).toHaveBeenCalledTimes(1); // no leaked connection on the expected pre-install state
    expect(transportConnect).not.toHaveBeenCalled();
  });

  it('happy path: handshake-complete session out over a stack bound to the client version', async () => {
    mockResolvedAuth();
    runMock.mockResolvedValue(ok('/home/ops'));
    const session = { handshake: { ack: { agentVersion: '0.1.2', protocol: 1, agentStartId: 's' } } } as AgentSession;
    transportConnect.mockResolvedValue(session);

    const result = await connectAgentSession({ remote: 'nas', sessionPassword: 'pw' });

    expect(result).toEqual({ kind: 'connected', session });
    expect(transportOptions).toHaveBeenCalledWith({ channel: expect.anything(), clientVersion: VERSION });
    expect(managerEnd).not.toHaveBeenCalled();
  });

  it('transport failures AFTER the probe keep their own message (real connection problems)', async () => {
    mockResolvedAuth();
    runMock.mockResolvedValue(ok('/home/ops'));
    transportConnect.mockRejectedValue(new Error('handshake timeout'));

    await expect(connectAgentSession({ remote: 'nas' })).rejects.toThrow('handshake timeout');
  });
});

describe('installAgent — in-process pipeline mapping', () => {
  it('refusal short-circuits before any wiring or pipeline run', async () => {
    vi.mocked(resolveRemoteAuth).mockResolvedValue({ kind: 'refusal', reason: 'no session password' });

    const result = await installAgent({ remote: 'nas' });

    expect(result).toEqual({ kind: 'refused', reason: 'no session password' });
    expect(runInstallMock).not.toHaveBeenCalled();
    expect(SshConnectionManager).not.toHaveBeenCalled();
  });

  it('progress lines stream through onLine; exit 0 → installed', async () => {
    mockResolvedAuth();
    runInstallMock.mockResolvedValue(0);
    const lines: string[] = [];

    const result = await installAgent({ remote: 'nas', onLine: line => lines.push(line) });

    expect(result).toEqual({ kind: 'installed' });
    const deps = runInstallMock.mock.calls[0]?.[0];
    expect(deps?.clientVersion).toBe(VERSION);
    deps?.log('target arch: x64');
    expect(lines).toEqual(['target arch: x64']);
  });

  it('pipeline failure → failed with the streamed error line (never a throw)', async () => {
    mockResolvedAuth();
    runInstallMock.mockImplementation(async deps => {
      deps.error('probe FAILED after 3 attempt(s)');
      return 1;
    });
    const lines: string[] = [];

    const result = await installAgent({ remote: 'nas', onLine: line => lines.push(line) });

    expect(result).toEqual({ kind: 'failed', error: 'probe FAILED after 3 attempt(s)' });
    expect(lines).toContain('probe FAILED after 3 attempt(s)'); // the TUI pane still sees the error line
  });

  it('pipeline failure WITHOUT an error line still names the exit code', async () => {
    mockResolvedAuth();
    runInstallMock.mockResolvedValue(3);

    const result = await installAgent({ remote: 'nas' });

    expect(result).toEqual({ kind: 'failed', error: 'installer exited with code 3' });
  });
});

describe('uninstallAgent — service entry mapping', () => {
  it('refusal short-circuits before any wiring (the flow never runs)', async () => {
    vi.mocked(resolveRemoteAuth).mockResolvedValue({ kind: 'refusal', reason: 'no session password' });

    const result = await uninstallAgent({ remote: 'nas' });

    expect(result).toEqual({ kind: 'refused', reason: 'no session password' });
    expect(runMock).not.toHaveBeenCalled();
  });

  it('a resolved remote runs the flow over the toolstack and returns its exit code', async () => {
    mockResolvedAuth();
    runMock.mockResolvedValue(ok(''));
    const log = vi.fn<() => void>();

    const result = await uninstallAgent({ remote: 'nas', log });

    expect(result).toEqual({ kind: 'uninstalled', exitCode: 1 }); // scripted runner answers 0 only to the probe
    expect(runMock).toHaveBeenCalled();
  });
});

describe('fetchAgentStatus — service entry mapping', () => {
  const STATUS: AgentStatusResult = {
    agentVersion: '0.1.2',
    protocol: 1,
    uptimeSec: 1,
    jobCount: 0,
    unitState: 'active',
    linger: true,
    lingerByTako: false,
  };

  /** Minimal session answering one request type. */
  function fakeSession(handshake: AgentSession['handshake'], status: AgentStatusResult): AgentSession {
    return {
      handshake,
      request: async (type: AgentRequestType, _payload: unknown) => {
        if (type !== 'agent.status') throw new Error(`unexpected ${String(type)}`);
        return structuredClone(status);
      },
      onEvent: () => () => {},
      close: async () => {},
    } as unknown as AgentSession;
  }

  it('refused credentials → the refusal object (no transport is opened)', async () => {
    vi.mocked(resolveRemoteAuth).mockResolvedValue({ kind: 'unknown-remote', reason: 'unknown remote "ghost"' });

    const outcome = await fetchAgentStatus({ remote: 'ghost' });

    expect(outcome).toEqual({ kind: 'refused', reason: 'unknown remote "ghost"' });
    expect(transportConnect).not.toHaveBeenCalled();
  });

  it('ok → the handshake + status ride in the outcome', async () => {
    mockResolvedAuth();
    const handshake = { ack: { agentVersion: '0.1.2', protocol: 1, agentStartId: 's' } };
    transportConnect.mockResolvedValue(fakeSession(handshake, STATUS));

    const outcome = await fetchAgentStatus({ remote: 'nas' });

    expect(outcome).toEqual({ kind: 'ok', handshake, status: STATUS });
    expect(transportOptions).toHaveBeenCalledWith({ channel: expect.anything(), clientVersion: VERSION });
  });

  it('a dead channel → the unreachable outcome with the failure detail', async () => {
    mockResolvedAuth();
    transportConnect.mockRejectedValue(new Error('channel open failure'));

    const outcome = await fetchAgentStatus({ remote: 'nas' });

    expect(outcome).toEqual({ kind: 'unreachable', detail: 'channel open failure' });
  });
});

describe('reconcile cursor — conf-backed per-remote', () => {
  it('save then load round-trips the seq; an absent key loads 0', () => {
    expect(loadReconcileCursor('nas')).toBe(0);

    saveReconcileCursor('nas', 7);

    expect(loadReconcileCursor('nas')).toBe(7);
  });

  it('a non-number stored value loads as 0 (full resync)', () => {
    confData.set('agentTasks.lastSeq.broken', 'not-a-number');

    expect(loadReconcileCursor('broken')).toBe(0);
  });
});
