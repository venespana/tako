// cli/commands/remote-add.test.ts — the CLI-only surface of `tako remote add`
// under ADR-0020: strict flags/stdin assembly (xargs-style fill), the plain
// field list + non-zero exit when required input is missing, the hostkey
// confirmation round over a piped y/n line, and the exit-code mapping
// (0 saved · 1 refused/declined · 2 unexpected). The add flow itself is
// tested at the service (services/remotes.test.ts) and use-case level.
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { AddRemoteResult, RemoteDraft } from '../../services/remotes.js';
import { addRemote, confirmAddRemote } from '../../services/remotes.js';
import { formatFieldList, runRemoteAdd, type RemoteAddFlags, type RemoteAddIo } from './remote-add.js';

vi.mock('../../services/remotes.js', async importOriginal => {
  // Only the transport-bearing add functions are replaced; the re-exported
  // contract types the command consumes stay real.
  const actual = await importOriginal<typeof import('../../services/remotes.js')>();
  return { ...actual, addRemote: vi.fn(), confirmAddRemote: vi.fn() };
});

interface Harness {
  readonly flags: (flags: RemoteAddFlags) => Promise<number>;
  readonly lines: string[];
  readonly out: string[];
  readonly errs: string[];
}

function harness(stdinLines: string[] = []): Harness {
  const state = { lines: stdinLines, out: [] as string[], errs: [] as string[] };
  const io: RemoteAddIo = {
    readLines: async () => state.lines,
    log: line => state.out.push(line),
    error: line => state.errs.push(line),
  };
  return {
    lines: state.lines,
    out: state.out,
    errs: state.errs,
    flags: flags => runRemoteAdd(flags, io),
  };
}

const SAVED: AddRemoteResult = { saved: true };

function draftOf(call: number): RemoteDraft {
  return vi.mocked(addRemote).mock.calls[call]?.[0].draft as RemoteDraft;
}

describe('runRemoteAdd — exit-code mapping (D8, unchanged)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saved → exit 0 with a confirmation line on stdout', async () => {
    vi.mocked(addRemote).mockResolvedValue(SAVED);
    const h = harness();

    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5', password: 'pw' })).resolves.toBe(0);
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
    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5', password: 'pw' })).resolves.toBe(1);
    expect(h.errs.join('\n')).toContain('already exists');

    vi.mocked(addRemote).mockResolvedValue({ saved: false, reason: 'validation', message: 'auth failed' });
    const h2 = harness();
    await expect(h2.flags({ name: 'nas', user: 'ops', host: '10.0.0.5', password: 'pw' })).resolves.toBe(1);
    expect(h2.errs.join('\n')).toContain('auth failed');
  });

  it('unexpected service throw → exit 2', async () => {
    vi.mocked(addRemote).mockRejectedValue(new Error('unexpected internal error'));
    const h = harness();
    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5', password: 'pw' })).resolves.toBe(2);
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

  it('piped stdin lines fill the missing fields in field order (xargs-style)', async () => {
    vi.mocked(addRemote).mockResolvedValue(SAVED);
    const h = harness(['nas', 'ops', '10.0.0.5', 'secret']);

    await expect(h.flags({})).resolves.toBe(0);

    expect(draftOf(0)).toMatchObject({
      name: 'nas',
      username: 'ops',
      host: '10.0.0.5',
      port: 22,
      credentialType: 'store',
      password: 'secret',
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
});

describe('runRemoteAdd — hostkey confirmation round (ADR-0020 §3)', () => {
  const HOSTKEY_REFUSAL: AddRemoteResult = { saved: false, reason: 'hostkey', hostkeyFingerprint: 'SHA256:abc' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('--accept-hostkey pre-accepts: single addRemote call, saved → 0', async () => {
    vi.mocked(addRemote).mockResolvedValue(SAVED);
    const h = harness();

    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5', password: 'pw', acceptHostkey: true })).resolves.toBe(0);
    expect(vi.mocked(addRemote)).toHaveBeenCalledWith({ draft: expect.anything(), hostkeyAccepted: true });
    expect(vi.mocked(confirmAddRemote)).not.toHaveBeenCalled();
  });

  it('without --accept-hostkey and no piped line → the hostkey field list + fingerprint, exit 1', async () => {
    vi.mocked(addRemote).mockResolvedValue(HOSTKEY_REFUSAL);
    const h = harness();

    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5', password: 'pw' })).resolves.toBe(1);

    const printed = h.errs.join('\n');
    expect(printed).toContain('--accept-hostkey');
    expect(printed).toContain('SHA256:abc');
    expect(vi.mocked(confirmAddRemote)).not.toHaveBeenCalled();
  });

  it('a piped y line accepts the hostkey → confirmAddRemote persists without re-validating', async () => {
    vi.mocked(addRemote).mockResolvedValue(HOSTKEY_REFUSAL);
    vi.mocked(confirmAddRemote).mockResolvedValue(SAVED);
    const h = harness(['y']);

    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5', password: 'pw' })).resolves.toBe(0);

    expect(vi.mocked(confirmAddRemote)).toHaveBeenCalledTimes(1);
    expect(h.out.join('\n')).toContain('saved');
  });

  it('a piped n line declines → exit 1 and nothing persisted', async () => {
    vi.mocked(addRemote).mockResolvedValue(HOSTKEY_REFUSAL);
    const h = harness(['n']);

    await expect(h.flags({ name: 'nas', user: 'ops', host: '10.0.0.5', password: 'pw' })).resolves.toBe(1);

    expect(h.errs.join('\n')).toContain('declined');
    expect(vi.mocked(confirmAddRemote)).not.toHaveBeenCalled();
  });
});

describe('formatFieldList — plain field list shape', () => {
  it('renders name + expected shape per missing field and the stdin remedy', () => {
    const text = formatFieldList(['name', 'password']);

    expect(text).toContain('--name');
    expect(text).toContain('connection name');
    expect(text).toContain('--password');
    expect(text).toContain('store or interactive');
    expect(text).toContain('stdin');
  });
});
