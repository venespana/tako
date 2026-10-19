// status.test.ts — pure table formatter (S5) + command wiring (S6) of mvp-status-command
//
// formatStatusTable is the only rendering logic of `tako status`; runStatus
// is the ADR-0019 glue (parse → service → print → exit code) over an
// injected io, with the service mocked — no real SSH in unit tests.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { formatStatusTable, runStatus } from './status.js';
import type { StatusIo } from './status.js';
import type { StackStatusEntry } from '../../services/docker.js';
import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';

const getStackStatusMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/docker.js', () => ({
  getStackStatus: getStackStatusMock,
}));

const entry = (name: string, status: string, configFiles: string): StackStatusEntry => ({ name, status, configFiles });

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
