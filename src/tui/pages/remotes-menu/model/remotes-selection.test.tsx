// remotes-selection.test.tsx — Unit tests for the selection-screen model:
// async fetch through services/remotes (loading → ready / error), the
// zero-remotes redirect decision, and the connect-time gate (interactive
// remotes prompt for a password, validate over SSH, re-prompt on auth
// failure, cancel restores the list). A probe component renders the hook's
// state as text; the mocked service resolves on a timer so the loading
// window is real.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';

import type { Remote, RemoteSummary, SshValidationOutcome } from '../../../../services/remotes.js';
import { getRemote, listRemotes, testSshConnection } from '../../../../services/remotes.js';
import { settle, pressAndSettle } from '../../../test-utils/ink-interactions.js';
import { useRemotesSelection } from './remotes-selection.js';

vi.mock('../../../../services/remotes.js', async importOriginal => {
  // Spread the REAL module so the re-exported contract types and pure
  // helpers keep working; only the storage/transport-bearing functions are
  // replaced.
  const actual = await importOriginal<typeof import('../../../../services/remotes.js')>();
  return {
    ...actual,
    listRemotes: vi.fn(),
    getRemote: vi.fn(),
    testSshConnection: vi.fn(),
  };
});

const REMOTES: RemoteSummary[] = [
  { name: 'nas', endpoint: 'ops@10.0.0.5:22' },
  { name: 'web', endpoint: 'admin@10.0.0.10:2222' },
];

const sshKeyRemote: Remote = {
  name: 'nas',
  type: 'ssh',
  username: 'ops',
  host: '10.0.0.5',
  port: 22,
  credentialType: 'ssh-key',
  keyPath: '/home/ops/.ssh/id_ed25519',
};

const storeRemote: Remote = {
  name: 'nas',
  type: 'ssh',
  username: 'ops',
  host: '10.0.0.5',
  port: 22,
  credentialType: 'store',
  obfuscatedPassword: 'encrypted-hunter2',
};

const interactiveRemote: Remote = {
  name: 'nas',
  type: 'ssh',
  username: 'ops',
  host: '10.0.0.5',
  port: 22,
  credentialType: 'interactive',
};

/** Delayed list service (keeps the loading window real). */
function stubList(outcome: { list?: RemoteSummary[]; error?: Error }): ReturnType<typeof vi.fn> {
  const list = vi.fn(
    () =>
      new Promise<RemoteSummary[]>((resolve, reject) => {
        setTimeout(() => {
          if (outcome.error) reject(outcome.error);
          else resolve(outcome.list ?? []);
        }, 20);
      })
  );
  vi.mocked(listRemotes).mockImplementation(list);
  return list;
}

/** SSH service fake: only 'good-pw' authenticates. */
function stubValidator(okOn = 'good-pw'): ReturnType<typeof vi.fn> {
  const validate = vi.fn(async (config: Parameters<typeof testSshConnection>[0]): Promise<SshValidationOutcome> =>
    config.auth.type === 'password' && config.auth.password === okOn
      ? { ok: true, hostkeyFingerprint: 'SHA256:x' }
      : { ok: false, category: 'auth', message: 'All configured authentication methods failed' }
  );
  vi.mocked(testSshConnection).mockImplementation(validate);
  return validate;
}

interface ProbeApi {
  submit: (password: string) => void;
  cancel: () => void;
}

function Probe({
  enabled = true,
  onActivate,
  onEmpty,
  apiRef,
}: {
  enabled?: boolean;
  onActivate: (name: string, password?: string) => void;
  onEmpty: () => void;
  apiRef?: { current: ProbeApi | null };
}) {
  const selection = useRemotesSelection({ enabled, onActivate, onEmpty });
  if (apiRef) apiRef.current = { submit: selection.submitPassword, cancel: selection.cancelPrompt };
  return (
    <Text>
      {`status:${selection.status} focused:${selection.focusedId ?? 'none'} rows:${selection.selectable
        .map(item => item.id)
        .join(',')} gate:${
        selection.gate
          ? `${selection.gate.name}:${selection.gate.phase}${
              selection.gate.error ? `:${selection.gate.error.category}` : ''
            }`
          : 'none'
      }`}
    </Text>
  );
}

describe('useRemotesSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubList({ list: [] });
    stubValidator();
  });

  it('fetches through the service: loading until resolve, then ready with rows', async () => {
    const list = stubList({ list: REMOTES });

    const { lastFrame } = render(<Probe onActivate={vi.fn()} onEmpty={vi.fn()} />);

    // The fetch is in flight on first paint (Ink renders while pending).
    const loading = await settle(lastFrame, f => f.includes('status:loading'), 200);
    expect(loading).toContain('status:loading');

    const ready = await settle(lastFrame, f => f.includes('status:ready'), 1000);
    expect(list).toHaveBeenCalledTimes(1);
    expect(ready).toContain('rows:nas,web');
    expect(ready).toContain('focused:nas');
  });

  it('calls onEmpty exactly once when the configured list resolves empty', async () => {
    stubList({ list: [] });
    const onEmpty = vi.fn();

    const { lastFrame, unmount } = render(<Probe onActivate={vi.fn()} onEmpty={onEmpty} />);

    await settle(lastFrame, f => f.includes('status:ready'), 1000);
    // The redirect decision runs in a passive effect — it can fire a tick
    // after the frame already shows ready.
    await vi.waitFor(() => expect(onEmpty).toHaveBeenCalledTimes(1));
    expect(onEmpty).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('reports an error (and does NOT redirect) when the service rejects', async () => {
    stubList({ error: new Error('conf unreadable') });
    const onEmpty = vi.fn();

    const { lastFrame } = render(<Probe onActivate={vi.fn()} onEmpty={onEmpty} />);

    const frame = await settle(lastFrame, f => f.includes('status:error'), 1000);
    expect(frame).toContain('status:error');
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it('stays inert when disabled (no fetch, no focused row)', async () => {
    const list = stubList({ list: REMOTES });

    const { lastFrame } = render(<Probe enabled={false} onActivate={vi.fn()} onEmpty={vi.fn()} />);

    const frame = await settle(lastFrame, f => f.includes('status:loading'), 200);
    expect(list).not.toHaveBeenCalled();
    expect(frame).toContain('focused:none');
  });
});

// ---------------------------------------------------------------------------
// Connect-time gate (task 4.6)
// ---------------------------------------------------------------------------

describe('useRemotesSelection connect-time gate', () => {
  const onEmpty = vi.fn();
  const apiRef: { current: ProbeApi | null } = { current: null };

  function renderGateTest(byName: Remote | null) {
    const list = stubList({ list: REMOTES });
    vi.mocked(getRemote).mockResolvedValue(byName);
    const onActivate = vi.fn();
    const validator = stubValidator();
    const rendered = render(<Probe onActivate={onActivate} onEmpty={onEmpty} apiRef={apiRef} />);
    return { ...rendered, list, getRemoteMock: getRemote, onActivate, validator };
  }

  it('4.6: ssh-key remote activates directly — no prompt, no password', async () => {
    const { stdin, lastFrame, unmount, onActivate } = renderGateTest(sshKeyRemote);
    await settle(lastFrame, f => f.includes('status:ready'), 1000);

    await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('gate:'));
    await vi.waitFor(() => expect(onActivate).toHaveBeenCalledTimes(1));

    expect(onActivate).toHaveBeenCalledWith('nas', undefined);
    unmount();
  });

  it('4.6: store-with-password remote activates directly — no prompt', async () => {
    const { stdin, lastFrame, unmount, onActivate } = renderGateTest(storeRemote);
    await settle(lastFrame, f => f.includes('status:ready'), 1000);

    await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('gate:'));
    await vi.waitFor(() => expect(onActivate).toHaveBeenCalledTimes(1));

    expect(onActivate).toHaveBeenCalledWith('nas', undefined);
    unmount();
  });

  it('4.6: interactive remote opens a prompt gate instead of activating', async () => {
    const { stdin, lastFrame, unmount, onActivate } = renderGateTest(interactiveRemote);
    await settle(lastFrame, f => f.includes('status:ready'), 1000);

    const frame = await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('gate:nas:prompt'));

    expect(frame).toContain('gate:nas:prompt');
    expect(onActivate).not.toHaveBeenCalled();
    unmount();
  });

  it('4.6: wrong password → auth-failure message, re-prompt, remote stays inactive', async () => {
    const { stdin, lastFrame, unmount, onActivate } = renderGateTest(interactiveRemote);
    await settle(lastFrame, f => f.includes('status:ready'), 1000);
    await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('gate:nas:prompt'));

    apiRef.current!.submit('wrong-pw');

    const frame = await settle(lastFrame, f => f.includes('gate:nas:prompt:auth'), 1000);
    expect(frame).toContain('gate:nas:prompt:auth');
    expect(onActivate).not.toHaveBeenCalled();
    unmount();
  });

  it('4.6: correct password → onActivate(name, password), gate cleared', async () => {
    const { stdin, lastFrame, unmount, onActivate } = renderGateTest(interactiveRemote);
    await settle(lastFrame, f => f.includes('status:ready'), 1000);
    await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('gate:nas:prompt'));

    apiRef.current!.submit('good-pw');

    await vi.waitFor(() => expect(onActivate).toHaveBeenCalledTimes(1));
    expect(onActivate).toHaveBeenCalledWith('nas', 'good-pw');
    await settle(lastFrame, f => f.includes('gate:none'), 500);
    unmount();
  });

  it('4.6: cancel closes the gate and restores the selection list', async () => {
    const { stdin, lastFrame, unmount, onActivate } = renderGateTest(interactiveRemote);
    await settle(lastFrame, f => f.includes('status:ready'), 1000);
    await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('gate:nas:prompt'));

    apiRef.current!.cancel();

    const frame = await settle(lastFrame, f => f.includes('gate:none') && f.includes('rows:nas,web'), 1000);
    expect(frame).toContain('gate:none');
    expect(frame).toContain('rows:nas,web');
    expect(onActivate).not.toHaveBeenCalled();
    unmount();
  });

  it('4.6: getRemote null (remote vanished) → list refreshes, stays on selection', async () => {
    const { stdin, lastFrame, unmount, list, onActivate } = renderGateTest(null);
    await settle(lastFrame, f => f.includes('status:ready'), 1000);

    await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('status:ready'));
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));

    await settle(lastFrame, f => f.includes('gate:none') && f.includes('rows:nas,web'), 500);
    expect(onActivate).not.toHaveBeenCalled();
    unmount();
  });

  it('4.6: no password material ever appears in the rendered frame', async () => {
    const secret = 'S3cret!pw-xyz';
    const { stdin, lastFrame, unmount } = renderGateTest(interactiveRemote);
    await settle(lastFrame, f => f.includes('status:ready'), 1000);
    await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('gate:nas:prompt'));
    expect(lastFrame()).not.toContain(secret);

    apiRef.current!.submit(secret);
    await settle(lastFrame, f => f.includes('gate:none'), 1000);

    expect(lastFrame()).not.toContain(secret);
    unmount();
  });
});
