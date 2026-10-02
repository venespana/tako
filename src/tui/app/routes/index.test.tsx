// routes/index.test.tsx — 9.14c: arriving at the HOME menu leaves the remote
// context — the runtime selection clears and any open agent session closes.
// 9.20: the runtime is a zustand module-scope store — tests seed it with
// setState (no provider) and assert on its state after mount. Per ADR-0019
// §7 the store consumes services/agent — mocked here.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from 'ink-testing-library';
import { MemoryRouter } from 'react-router';

import { connectAgentSession } from '../../../services/agent.js';
import { resetTasksStoreForTests, useTasksStore } from '../../pages/tasks/index.js';
import { FakeAgentSession } from '../../test-utils/fake-agent-session.js';
import { initialAppRuntimeState, useAppRuntimeStore } from '../providers/app-runtime-store.js';
import HomeRoute from './index.js';

vi.mock('../../../services/agent.js', async importOriginal => {
  // Spread the REAL module so the pure re-exports keep working; the store
  // only consumes the three transport/cursor functions replaced below.
  const actual = await importOriginal<typeof import('../../../services/agent.js')>();
  return {
    ...actual,
    connectAgentSession: vi.fn(),
    installAgent: vi.fn(),
    loadReconcileCursor: vi.fn(() => 0),
    saveReconcileCursor: vi.fn(),
  };
});

async function until(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  for (let waited = 0; !predicate() && waited < timeoutMs; waited += 10) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!predicate()) throw new Error('until: condition not met within timeout');
}

describe('HomeRoute leaves the remote context (9.14c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTasksStoreForTests();
    useAppRuntimeStore.setState({ ...initialAppRuntimeState });
  });

  it('clears the runtime selection and closes a connected agent session', async () => {
    const session = new FakeAgentSession();
    session.seedAgent([]);
    vi.mocked(connectAgentSession).mockResolvedValue({ kind: 'connected', session });
    await useTasksStore.getState().connect({ remote: 'nas' });
    expect(session.closed).toBe(false);

    useAppRuntimeStore.setState({ activeRemote: 'nas', activeRemotePassword: undefined, agentVersion: '0.1.2' });

    const instance = render(
      <MemoryRouter initialEntries={['/']}>
        <HomeRoute />
      </MemoryRouter>
    );

    // Poll for the SETTLED outcome — session closed AND the store reset —
    // because disconnect() resets the store one microtask after close().
    await until(() => session.closed && useTasksStore.getState().status === 'idle');
    expect(useAppRuntimeStore.getState().activeRemote).toBeUndefined();
    expect(useTasksStore.getState().status).toBe('idle');
    instance.unmount();
  });

  it('is a no-op when no remote is active (fresh session on home)', async () => {
    const instance = render(
      <MemoryRouter initialEntries={['/']}>
        <HomeRoute />
      </MemoryRouter>
    );
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(useAppRuntimeStore.getState().activeRemote).toBeUndefined();
    expect(useAppRuntimeStore.getState().agentVersion).toBeUndefined();
    instance.unmount();
  });
});
