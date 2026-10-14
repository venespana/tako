// cli/commands/remote-add.test.ts — the CLI-only surface of `tako remote add`
// under ADR-0020: strict flags/stdin assembly (stdin is read only when required
// fields are missing — never with every field supplied via flags), loud
// refusals for invalid --type/--port, the plain field list + non-zero exit when
// required input is missing, the hostkey confirmation round over a piped y/n
// line, and the exit-code mapping (0 saved · 1 refused/declined · 2
// unexpected). The add flow itself is tested at the service
// (services/remotes.test.ts) and use-case level.
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

import { formatFieldList, runRemoteAdd, type RemoteAddFlags, type RemoteAddIo } from './remote-add.js';
import type { AddRemoteResult, RemoteDraft } from '../../services/remotes.js';
import { addRemote, confirmAddRemote } from '../../services/remotes.js';

vi.mock('../../services/remotes.js', async importOriginal => {
  // Only the transport-bearing add functions are replaced; the re-exported
  // contract types the command consumes stay real.
  const actual = await importOriginal<typeof import('../../services/remotes.js')>();
  return { ...actual, addRemote: vi.fn(), confirmAddRemote: vi.fn() };
});

interface Harness {
  readonly flags: (flags: RemoteAddFlags) => Promise<number>;
  /** vi.fn-wrapped so tests can assert whether stdin was consulted. */
  readonly readLines: ReturnType<typeof vi.fn>;
  readonly lines: string[];
  readonly reads: () => number;
  readonly out: string[];
  readonly errs: string[];
}

function harness(stdinLines: string[] = []): Harness {
  const state = { lines: stdinLines, out: [] as string[], errs: [] as string[], reads: 0 };
  const readLines = vi.fn(async () => {
    state.reads += 1;
    return state.lines;
  });
  const io: RemoteAddIo = {
    readLines,
    log: line => state.out.push(line),
    error: line => state.errs.push(line),
  };
  return {
    readLines,
    lines: state.lines,
    reads: () => state.reads,
    out: state.out,
    errs: state.errs,
    flags: flags => runRemoteAdd(flags, io),
  };
}

const SAVED: AddRemoteResult = { saved: true };

function draftOf(call: number): RemoteDraft {
  return vi.mocked(addRemote).mock.calls[call]?.[0].draft as RemoteDraft;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runRemoteAdd — exit-code mapping (D8, unchanged)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saved → exit 0 with a confirmation line on stdout', async () => {
    vi.mocked(addRemote).mockResolvedValue(SAVED);
    const h = harness();

    vi.stubEnv('TAKO_SSH_PASSWORD', 'pw');
    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5' })).resolves.toBe(0);
    expect(h.out.join('\n')).toContain('saved');
    expect(h.errs).toEqual([]);
    expect(vi.mocked(addRemote)).toHaveBeenCalledWith({
      draft: expect.objectContaining({ name: 'nas', username: 'ops', host: '10.0.0.5', credentialType: 'store' }),
      hostkeyAccepted: false,
    });
  });

  it('duplicate → exit 1 naming the collision kind; validation → exit 1 with the message', async () => {
    vi.mocked(addRemote).mockResolvedValue({ saved: false, reason: 'duplicate', duplicateKind: 'endpoint' });
    const h = harness();
    vi.stubEnv('TAKO_SSH_PASSWORD', 'pw');
    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5' })).resolves.toBe(1);
    expect(h.errs.join('\n')).toContain('already exists');

    vi.mocked(addRemote).mockResolvedValue({ saved: false, reason: 'validation', message: 'auth failed' });
    const h2 = harness();
    vi.stubEnv('TAKO_SSH_PASSWORD', 'pw');
    await expect(h2.flags({ name: 'nas', user: 'ops', host: '10.0.0.5' })).resolves.toBe(1);
    expect(h2.errs.join('\n')).toContain('auth failed');
  });

  it('unexpected service throw → exit 2', async () => {
    vi.mocked(addRemote).mockRejectedValue(new Error('unexpected internal error'));
    const h = harness();
    vi.stubEnv('TAKO_SSH_PASSWORD', 'pw');
    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5' })).resolves.toBe(2);
    expect(h.errs.join('\n')).toContain('unexpected internal error');
  });
});

describe('runRemoteAdd — flags/stdin contract (ADR-0020 §2-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('missing required fields → the plain field list on stderr, exit 1, no service call', async () => {
    const h = harness();

    await expect(h.flags({})).resolves.toBe(1);

    const printed = h.errs.join('\n');
    expect(printed).toContain('--name');
    expect(printed).toContain('--user');
    expect(printed).toContain('--host');
    expect(printed).toContain('stdin');
    expect(vi.mocked(addRemote)).not.toHaveBeenCalled();
  });

  it('password becomes required for the store/interactive default (and after a piped type)', async () => {
    const h = harness();
    await expect(h.flags({ type: 'store', name: 'nas', user: 'ops', host: '10.0.0.5' })).resolves.toBe(1);
    expect(h.errs.join('\n')).toContain('--password');
  });

  it('a fully-flagged invocation never reads stdin (no non-TTY hang — R4-001)', async () => {
    vi.mocked(addRemote).mockResolvedValue(SAVED);
    vi.stubEnv('TAKO_SSH_PASSWORD', 'pw');
    const h = harness();

    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5', acceptHostkey: true })).resolves.toBe(0);
    expect(h.reads()).toBe(0);
  });

  it('piped stdin lines fill the missing fields in field order (xargs-style)', async () => {
    vi.mocked(addRemote).mockResolvedValue(SAVED);
    const h = harness(['nas', 'ops', '10.0.0.5', 'secret']);

    await expect(h.flags({})).resolves.toBe(0);

    // Stdin is consumed because required fields were missing.
    expect(h.readLines).toHaveBeenCalledTimes(1);
    expect(draftOf(0)).toMatchObject({
      name: 'nas',
      username: 'ops',
      host: '10.0.0.5',
      port: 22,
      credentialType: 'store',
      password: 'secret',
    });
  });

  it('with every field supplied via flags, stdin is never read (a non-TTY stdin must not block)', async () => {
    vi.mocked(addRemote).mockResolvedValue(SAVED);
    const h = harness(['ignored-piped-line']);

    vi.stubEnv('TAKO_SSH_PASSWORD', 'pw');
    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5' })).resolves.toBe(0);

    expect(h.readLines).not.toHaveBeenCalled();
    expect(draftOf(0)).toMatchObject({
      name: 'nas',
      username: 'ops',
      host: '10.0.0.5',
      port: 22,
      credentialType: 'store',
      password: 'pw',
    });
  });

  it('optional fields keep their defaults (port 22, key path ~/.ssh/id_rsa for ssh-key)', async () => {
    vi.mocked(addRemote).mockResolvedValue(SAVED);
    const h = harness(['nas', 'ops', '10.0.0.5']);

    await expect(h.flags({ type: 'ssh-key' })).resolves.toBe(0);
    expect(draftOf(0)).toMatchObject({ credentialType: 'ssh-key', keyPath: '~/.ssh/id_rsa', port: 22 });
  });

  it('an invalid --type is refused with the expected values (never silently defaulted)', async () => {
    const h = harness();

    await expect(h.flags({ name: 'nas', user: 'ops', host: 'h', type: 'ftp' })).resolves.toBe(1);
    expect(h.errs.join('\n')).toContain('store, ssh-key, interactive');
    expect(vi.mocked(addRemote)).not.toHaveBeenCalled();
  });

  it('an invalid --port is refused with the expected shape (never silently defaulted)', async () => {
    for (const bad of ['abc', '0', '-22', '22.5', '99999']) {
      const h = harness();

      await expect(h.flags({ name: 'nas', user: 'ops', host: 'h', port: bad })).resolves.toBe(1);
      expect(h.errs.join('\n')).toContain(`invalid --port "${bad}"`);
      expect(h.errs.join('\n')).toContain('1 and 65535');
      expect(vi.mocked(addRemote)).not.toHaveBeenCalled();
    }
  });

  it('an absent --port defaults to 22; a valid --port passes through', async () => {
    vi.mocked(addRemote).mockResolvedValue(SAVED);

    const h = harness();
    vi.stubEnv('TAKO_SSH_PASSWORD', 'pw');
    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5' })).resolves.toBe(0);
    expect(draftOf(0).port).toBe(22);

    const h2 = harness();
    vi.stubEnv('TAKO_SSH_PASSWORD', 'pw');
    await expect(h2.flags({ name: 'nas', user: 'ops', host: '10.0.0.5', port: '2222' })).resolves.toBe(0);
    expect(draftOf(1).port).toBe(2222);
  });
});

describe('runRemoteAdd — hostkey confirmation round (ADR-0020 §3)', () => {
  const HOSTKEY_REFUSAL: AddRemoteResult = { saved: false, reason: 'hostkey', hostkeyFingerprint: 'SHA256:abc' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('--accept-hostkey pre-accepts: single addRemote call, saved → 0', async () => {
    vi.mocked(addRemote).mockResolvedValue(SAVED);
    const h = harness();

    vi.stubEnv('TAKO_SSH_PASSWORD', 'pw');
    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5', acceptHostkey: true })).resolves.toBe(0);
    expect(vi.mocked(addRemote)).toHaveBeenCalledWith({ draft: expect.anything(), hostkeyAccepted: true });
    expect(vi.mocked(confirmAddRemote)).not.toHaveBeenCalled();
  });

  it('without --accept-hostkey and no piped line → the hostkey field list + fingerprint, exit 1', async () => {
    vi.mocked(addRemote).mockResolvedValue(HOSTKEY_REFUSAL);
    const h = harness();

    vi.stubEnv('TAKO_SSH_PASSWORD', 'pw');
    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5' })).resolves.toBe(1);

    const printed = h.errs.join('\n');
    expect(printed).toContain('--accept-hostkey');
    expect(printed).toContain('SHA256:abc');
    expect(vi.mocked(confirmAddRemote)).not.toHaveBeenCalled();
  });

  it('a piped y line accepts the hostkey → confirmAddRemote persists without re-validating (host piped: a required field unlocks stdin)', async () => {
    vi.mocked(addRemote).mockResolvedValue(HOSTKEY_REFUSAL);
    vi.mocked(confirmAddRemote).mockResolvedValue(SAVED);
    // A missing password makes the command read stdin: 'secret' fills it and
    // the leftover 'y' lands in the hostkey answer queue.
    const h = harness(['secret', 'y']);

    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5' })).resolves.toBe(0);

    expect(draftOf(0).password).toBe('secret');
    expect(vi.mocked(confirmAddRemote)).toHaveBeenCalledTimes(1);
    expect(h.out.join('\n')).toContain('saved');
  });

  it('a piped n line declines → exit 1 and nothing persisted (host piped: a required field unlocks stdin)', async () => {
    vi.mocked(addRemote).mockResolvedValue(HOSTKEY_REFUSAL);
    const h = harness(['secret', 'n']);

    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5' })).resolves.toBe(1);

    expect(h.errs.join('\n')).toContain('declined');
    expect(vi.mocked(confirmAddRemote)).not.toHaveBeenCalled();
  });

  it('all fields via flags + a piped y without --accept-hostkey → stdin never consulted, hostkey list, exit 1', async () => {
    vi.mocked(addRemote).mockResolvedValue(HOSTKEY_REFUSAL);
    const h = harness(['y']);
    vi.stubEnv('TAKO_SSH_PASSWORD', 'pw');

    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5' })).resolves.toBe(1);

    expect(h.readLines).not.toHaveBeenCalled();
    expect(h.errs.join('\n')).toContain('--accept-hostkey');
    expect(vi.mocked(confirmAddRemote)).not.toHaveBeenCalled();
  });
});

describe('formatFieldList — plain field list shape', () => {
  it('renders name + expected shape per missing field and the stdin remedy', () => {
    const text = formatFieldList(['name', 'password']);

    expect(text).toContain('--name');
    expect(text).toContain('connection name');
    expect(text).toContain('--password');
    expect(text).toContain('TAKO_SSH_PASSWORD env or a piped stdin line');
    expect(text).toContain('stdin');
  });
});
