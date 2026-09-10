// RemotesMenuPage.test.tsx — Unit tests for the remotes menu page. The page
// has two modes: without an active remote it renders the SELECTION screen
// (model/remotes-selection fetching through an injected repository port);
// with one it renders the remotes submenu. A harness component holds the
// session's active-remote state so tests can drive the real transition
// (select with Enter → submenu). Logo and footer are app-shell chrome.
// MemoryRouter supplies the router context.
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { MemoryRouter, useLocation } from 'react-router';

import type { RemoteRepository } from '../../../../domains/remotes/application/RemoteRepository.js';
import type { ValidateSshConnection } from '../../../../domains/remotes/application/ValidateSshConnection.js';
import type { Remote, RemoteSummary, SshTestConfig } from '../../../../domains/remotes/domain/types.js';
import { KEY_FLUSH_MS, pressAndSettle, settle } from '../../../test-utils/ink-interactions.js';
import { RemotesMenuPage } from './RemotesMenuPage.js';

function fakeRepository(summaries: RemoteSummary[], byName: Remote | null = null): RemoteRepository {
  return {
    existsByName: vi.fn(async () => false),
    existsByEndpoint: vi.fn(async () => false),
    save: vi.fn(async () => {}),
    getByName: vi.fn(async () => byName),
    list: vi.fn(async () => summaries),
  };
}

/** Direct-activation remote: a store remote with a password on disk. */
const storeWithPassword: Remote = {
  name: 'nas',
  type: 'ssh',
  username: 'ops',
  host: '10.0.0.5',
  port: 22,
  credentialType: 'store',
  obfuscatedPassword: 'encrypted-hunter2',
};

/** Prompt-required remote: no secret on disk. */
const interactiveRemote: Remote = { ...storeWithPassword, credentialType: 'interactive', obfuscatedPassword: undefined };

/** Type a password into the focused PasswordInput. Writing chars one by one
 * is not enough: a freshly mounted gate's Ink input pipeline (the readable
 * listener and each useInput subscription) attaches in delayed React 19
 * passive effects — the same window pressAndSettle's retry covers — and the
 * mock stdin keeps a single data slot, so a char written before attach is
 * dropped and then silently overwritten by the next write. Each char is
 * therefore only sent after the previous one is ACKNOWLEDGED by the input's
 * echo (PasswordInput renders one '*' per typed char), with one retry per
 * char. The return key goes as its own write once the full echo is visible. */
async function typePassword(
  stdin: ReturnType<typeof render>['stdin'],
  lastFrame: ReturnType<typeof render>['lastFrame'],
  password: string
): Promise<void> {
  const stars = (frame: string): number => frame.split('*').length - 1;
  for (let index = 0; index < password.length; index++) {
    const echoed = (): boolean => stars(lastFrame() ?? '') > index;
    for (let attempt = 0; attempt < 2 && !echoed(); attempt++) {
      stdin.write(password[index]!);
      await settle(lastFrame, echoed, KEY_FLUSH_MS);
    }
  }
  stdin.write('\r');
}

/** SSH validator fake: only 'good-pw' authenticates. */
function fakeValidator(okOn = 'good-pw'): ValidateSshConnection {
  return {
    validate: vi.fn(async (config: SshTestConfig) =>
      config.auth.type === 'password' && config.auth.password === okOn
        ? { ok: true, hostkeyFingerprint: 'SHA256:x' }
        : { ok: false, category: 'auth', message: 'All configured authentication methods failed' }
    ),
  } as unknown as ValidateSshConnection;
}

/** Holds the session's active-remote state, mirroring App's ownership. */
function Harness({
  repository,
  initialActive,
  validateConnection = fakeValidator(),
}: {
  repository: RemoteRepository;
  initialActive?: string;
  validateConnection?: ValidateSshConnection;
}) {
  const [active, setActive] = useState<{ name: string; password?: string } | undefined>(
    initialActive ? { name: initialActive } : undefined
  );
  return (
    <>
      <Text>{`active:${active?.name ?? 'none'}`}</Text>
      <RemotesMenuPage
        repository={repository}
        validateConnection={validateConnection}
        onActivateRemote={(name, password) => setActive({ name, password })}
      />
    </>
  );
}

function LocationEcho() {
  return <Text>at:{useLocation().pathname}</Text>;
}

const REMOTES: RemoteSummary[] = [
  { name: 'nas', endpoint: 'ops@10.0.0.5:22' },
  { name: 'web', endpoint: 'admin@10.0.0.10:2222' },
];

const renderRemotes = (repository: RemoteRepository, initialActive?: string) =>
  render(
    <MemoryRouter initialEntries={['/remotes']}>
      <Harness repository={repository} initialActive={initialActive} />
    </MemoryRouter>
  );describe('RemotesMenuPage (selection screen)', () => {
  it('lists the configured remotes with name and endpoint', async () => {
    const { lastFrame } = renderRemotes(fakeRepository(REMOTES));
    const frame = await settle(lastFrame, f => f.includes('Select a remote'), 1000);

    expect(frame).toContain('Select a remote');
    expect(frame).toContain('nas (ops@10.0.0.5:22)');
    expect(frame).toContain('web (admin@10.0.0.10:2222)');
  });

  it('starts the cursor on the first remote', async () => {
    const { lastFrame } = renderRemotes(fakeRepository(REMOTES));
    const frame = await settle(lastFrame, f => f.includes('Select a remote'), 1000);

    expect(frame).toContain('❯ nas');
    expect(frame).not.toContain('❯ web');
  });

  it('moves the cursor with j', async () => {
    const { stdin, lastFrame } = renderRemotes(fakeRepository(REMOTES));
    await settle(lastFrame, f => f.includes('❯ nas'), 1000);

    const frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ web'));
    expect(frame).toContain('❯ web');
  });

  it('Enter activates the remote and keeps showing the selection list', async () => {
    const { stdin, lastFrame } = renderRemotes(fakeRepository(REMOTES, storeWithPassword));
    await settle(lastFrame, f => f.includes('❯ nas'), 1000);

    await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('❯ nas'));
    // After activation, selection list is still visible
    expect(lastFrame()).toContain('nas (ops@10.0.0.5:22)');
  });

  it('redirects to /remotes/add when no remotes are configured', async () => {
    const { lastFrame } = render(
      <MemoryRouter initialEntries={['/remotes']}>
        <LocationEcho />
        <Harness repository={fakeRepository([])} />
      </MemoryRouter>
    );

    const frame = await settle(lastFrame, f => f.includes('at:/remotes/add'), 1000);
    expect(frame).toContain('at:/remotes/add');
  });

  it('shows an error state when the configured list cannot be read', async () => {
    const repository: RemoteRepository = {
      existsByName: vi.fn(async () => false),
      existsByEndpoint: vi.fn(async () => false),
      save: vi.fn(async () => {}),
      getByName: vi.fn(async () => null),
      list: vi.fn(async () => {
        throw new Error('conf unreadable');
      }),
    };

    const { lastFrame } = renderRemotes(repository);
    const frame = await settle(lastFrame, f => f.includes('Could not read'), 1000);

    expect(frame).toContain('Could not read configured remotes.');
    expect(frame).not.toContain('Select a remote');
  });
});

describe('RemotesMenuPage (connect-time prompt for interactive remotes)', () => {
  const SECRET = 'S3cret!pw-xyz';

  it('4.8 RED: prompt screen renders for an interactive selection', async () => {
    const { stdin, lastFrame } = renderRemotes(fakeRepository(REMOTES, interactiveRemote));
    await settle(lastFrame, f => f.includes('❯ nas'), 1000);

    const frame = await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('Connect to nas'));

    expect(frame).toContain('Connect to nas');
    expect(frame).toContain('Password');
    expect(frame).not.toContain('Select a remote');
  });

  it('4.8 RED: correct password activates the remote, selection list remains visible', async () => {
    const { lastFrame, stdin } = render(
      <MemoryRouter initialEntries={['/remotes']}>
        <Harness repository={fakeRepository(REMOTES, interactiveRemote)} validateConnection={fakeValidator(SECRET)} />
      </MemoryRouter>
    );
    await settle(lastFrame, f => f.includes('❯ nas'), 1000);
    await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('Connect to nas'));

    await typePassword(stdin, lastFrame, SECRET);

    // After activation, selection list is still shown (no submenu)
    const frame = await settle(lastFrame, f => f.includes('nas (ops@10.0.0.5:22)'), 2000);
    expect(frame).toContain('nas (ops@10.0.0.5:22)');
    expect(frame).not.toContain(SECRET);
  });

  it('4.8 RED: wrong password re-prompts with an auth message, remote stays inactive', async () => {
    const { stdin, lastFrame } = renderRemotes(fakeRepository(REMOTES, interactiveRemote));
    await settle(lastFrame, f => f.includes('❯ nas'), 1000);
    await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('Connect to nas'));

    await typePassword(stdin, lastFrame, 'wrong-pw');

    const frame = await settle(lastFrame, f => f.includes('Authentication failed'), 2000);
    expect(frame).toContain('Connect to nas');
    expect(frame).not.toContain('active:nas');
    expect(frame).not.toContain('wrong-pw');
  });

  it('4.8 RED: Esc cancels the prompt and restores the selection list', async () => {
    const { stdin, lastFrame } = renderRemotes(fakeRepository(REMOTES, interactiveRemote));
    await settle(lastFrame, f => f.includes('❯ nas'), 1000);
    await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('Connect to nas'));

    stdin.write('\x1b');

    const frame = await settle(lastFrame, f => f.includes('Select a remote'), 2000);
    expect(frame).toContain('Select a remote');
    expect(frame).not.toContain('Connect to nas');
  });
});
