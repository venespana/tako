// status.test.ts — pure table formatter (S5) + command wiring (S6) of mvp-status-command
//
// formatStatusTable is the only rendering logic of `tako status`; runStatus
// is the ADR-0019 glue (parse → service → print → exit code) over an
// injected io, with the service mocked — no real SSH in unit tests.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { formatContainersTable, formatStatusTable, runStatus } from './status.js';
import type { StatusIo } from './status.js';
import type { ContainerSnapshot, StackStatusEntry } from '../../services/docker.js';
import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';

const getStackStatusMock = vi.hoisted(() => vi.fn());
const getContainersMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/docker.js', () => ({
  getStackStatus: getStackStatusMock,
  getContainers: getContainersMock,
}));

const entry = (name: string, status: string, configFiles: string): StackStatusEntry => ({ name, status, configFiles });

const container = (name: string, state: string, health: ContainerSnapshot['health']): ContainerSnapshot => ({
  id: `id-${name}`,
  name,
  state,
  composeProject: null,
  health,
});

function createIo(): { io: StatusIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];

  return { io: { log: line => out.push(line), error: line => err.push(line) }, out, err };
}

describe('formatStatusTable', () => {
  it('renders a header and an aligned row (columns at least as wide as their labels)', () => {
    expect(formatStatusTable([entry('nas', 'up', '/a.yml')])).toEqual([
      'NAME  STATUS  CONFIG FILES',
      'nas   up      /a.yml',
    ]);
  });

  it('widens every column to its widest cell across rows', () => {
    const lines = formatStatusTable([
      entry('web', 'running(2)', '/w.yml'),
      entry('reverse-proxy', 'exited(1)', '/r.yml'),
    ]);

    expect(lines).toEqual([
      'NAME           STATUS      CONFIG FILES',
      'web            running(2)  /w.yml',
      'reverse-proxy  exited(1)   /r.yml',
    ]);
  });

  it('renders an explicit empty state for an empty listing', () => {
    expect(formatStatusTable([])).toEqual(['no compose stacks found']);
  });
});

describe('runStatus — flag parsing (loud refusals)', () => {
  beforeEach(() => {
    getStackStatusMock.mockReset();
  });

  it('refuses a missing --host loudly without touching the service', async () => {
    const { io, out, err } = createIo();
    const exit = await runStatus({}, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('--host');
    expect(getStackStatusMock).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });

  it('refuses an empty --host the same way', async () => {
    const { io, err } = createIo();
    const exit = await runStatus({ host: '' }, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('--host');
    expect(getStackStatusMock).not.toHaveBeenCalled();
  });
});

describe('runStatus — outcome mapping (0 ok · 1 refusal · 2 unexpected)', () => {
  beforeEach(() => {
    getStackStatusMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prints the table and exits 0 on a happy read, passing the session password from the env', async () => {
    vi.stubEnv(SESSION_PASSWORD_ENV, 'session-pw');
    getStackStatusMock.mockResolvedValue({ kind: 'ok', entries: [entry('nas', 'up', '/a.yml')] });
    const { io, out, err } = createIo();

    const exit = await runStatus({ host: 'nas' }, io);

    expect(exit).toBe(0);
    expect(getStackStatusMock).toHaveBeenCalledWith({ remote: 'nas', sessionPassword: 'session-pw' });
    expect(out).toEqual(['NAME  STATUS  CONFIG FILES', 'nas   up      /a.yml']);
    expect(err).toEqual([]);
  });

  it('prints the empty state and exits 0 when the remote has no stacks', async () => {
    getStackStatusMock.mockResolvedValue({ kind: 'ok', entries: [] });
    const { io, out } = createIo();

    const exit = await runStatus({ host: 'nas' }, io);

    expect(exit).toBe(0);
    expect(out).toEqual(['no compose stacks found']);
  });

  it('maps an unknown remote to exit 1 with the reason on stderr', async () => {
    getStackStatusMock.mockResolvedValue({ kind: 'unknown-remote', reason: 'unknown remote "nope"' });
    const { io, out, err } = createIo();

    const exit = await runStatus({ host: 'nope' }, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('unknown remote "nope"');
    expect(out).toEqual([]);
  });

  it('maps an ssh/compose refusal to exit 1 with the reason on stderr', async () => {
    getStackStatusMock.mockResolvedValue({ kind: 'refusal', reason: 'sh: docker: not found' });
    const { io, err } = createIo();

    const exit = await runStatus({ host: 'nas' }, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('sh: docker: not found');
  });

  it('maps an unexpected throw to exit 2', async () => {
    getStackStatusMock.mockRejectedValue(new Error('transport exploded'));
    const { io, err } = createIo();

    const exit = await runStatus({ host: 'nas' }, io);

    expect(exit).toBe(2);
    expect(err.join('\n')).toContain('transport exploded');
  });
});

describe('runStatus — DEFAULT mode pin (T3-health-status: byte-identical to pre-flag behavior)', () => {
  beforeEach(() => {
    getStackStatusMock.mockReset();
    getContainersMock.mockReset();
  });

  it('prints the EXACT pre-flag table bytes and never touches the containers service', async () => {
    getStackStatusMock.mockResolvedValue({
      kind: 'ok',
      entries: [entry('media', 'up', '/srv/media/compose.yml'), entry('proxy', 'up', '/srv/proxy/compose.yml')],
    });
    const { io, out, err } = createIo();

    const exit = await runStatus({ host: 'nas' }, io);

    expect(exit).toBe(0);
    expect(out).toEqual([
      'NAME   STATUS  CONFIG FILES',
      'media  up      /srv/media/compose.yml',
      'proxy  up      /srv/proxy/compose.yml',
    ]);
    expect(err).toEqual([]);
    expect(getContainersMock).not.toHaveBeenCalled();
  });
});

describe('formatContainersTable — `--containers` rendering (T3-health-status)', () => {
  it('renders aligned NAME/STATE/HEALTH columns with a count line', () => {
    expect(
      formatContainersTable([
        container('media-web-1', 'running', 'healthy'),
        container('proxy-caddy-1', 'running', 'unhealthy'),
      ])
    ).toEqual([
      'NAME           STATE    HEALTH',
      'media-web-1    running  healthy',
      'proxy-caddy-1  running  unhealthy',
      '2 containers',
    ]);
  });

  it('shows `-` for a container without a healthcheck (health null)', () => {
    const lines = formatContainersTable([container('portainer', 'running', null)]);

    expect(lines).toEqual(['NAME       STATE    HEALTH', 'portainer  running  -', '1 container']);
  });

  it('renders the explicit empty state for a remote with no containers', () => {
    expect(formatContainersTable([])).toEqual(['no containers found']);
  });
});

describe('runStatus — `--containers` mode (T3-health-status)', () => {
  beforeEach(() => {
    getStackStatusMock.mockReset();
    getContainersMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('calls getContainers with the host + session password and prints the table, exit 0', async () => {
    vi.stubEnv(SESSION_PASSWORD_ENV, 'session-pw');
    getContainersMock.mockResolvedValue({ kind: 'ok', containers: [container('web', 'running', 'healthy')] });
    const { io, out, err } = createIo();

    const exit = await runStatus({ host: 'nas', containers: true }, io);

    expect(exit).toBe(0);
    expect(getContainersMock).toHaveBeenCalledWith({ remote: 'nas', sessionPassword: 'session-pw' });
    expect(getStackStatusMock).not.toHaveBeenCalled();
    expect(out).toEqual(['NAME  STATE    HEALTH', 'web   running  healthy', '1 container']);
    expect(err).toEqual([]);
  });

  it('still refuses a missing --host loudly in --containers mode', async () => {
    const { io, err } = createIo();

    const exit = await runStatus({ containers: true }, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('--host');
    expect(getContainersMock).not.toHaveBeenCalled();
  });

  it('maps an unknown remote to exit 1 with the reason on stderr', async () => {
    getContainersMock.mockResolvedValue({ kind: 'unknown-remote', reason: 'unknown remote "nope"' });
    const { io, out, err } = createIo();

    const exit = await runStatus({ host: 'nope', containers: true }, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('unknown remote "nope"');
    expect(out).toEqual([]);
  });

  it('maps an ssh/docker refusal to exit 1 with the reason on stderr', async () => {
    getContainersMock.mockResolvedValue({ kind: 'refusal', reason: 'sh: docker: not found' });
    const { io, err } = createIo();

    const exit = await runStatus({ host: 'nas', containers: true }, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('sh: docker: not found');
  });

  it('maps an unexpected throw to exit 2', async () => {
    getContainersMock.mockRejectedValue(new Error('transport exploded'));
    const { io, err } = createIo();

    const exit = await runStatus({ host: 'nas', containers: true }, io);

    expect(exit).toBe(2);
    expect(err.join('\n')).toContain('transport exploded');
  });
});
