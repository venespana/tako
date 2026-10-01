// routes/index.test.tsx — 9.14c: arriving at the HOME menu leaves the remote
// context — the runtime selection clears and any open agent session closes.
// 9.20: the runtime is a zustand module-scope store — tests seed it with
// setState (no provider) and assert on its state after mount.
import { beforeEach, describe, expect, it } from 'vitest';

import { render } from 'ink-testing-library';
import { MemoryRouter } from 'react-router';

import { resetTasksStoreForTests, useTasksStore } from '../../features/tasks/job-list/index.js';
import { FakeTasksGateway } from '../../test-utils/fake-agent-session.js';
import { initialAppRuntimeState, useAppRuntimeStore } from '../providers/app-runtime-store.js';
import HomeRoute from './index.js';

async function until(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  for (let waited = 0; !predicate() && waited < timeoutMs; waited += 10) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!predicate()) throw new Error('until: condition not met within timeout');
}

describe('HomeRoute leaves the remote context (9.14c)', () => {
  beforeEach(() => {
    resetTasksStoreForTests();
    useAppRuntimeStore.setState({ ...initialAppRuntimeState });
  });

  it('clears the runtime selection and closes a connected agent session', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([]);
    await useTasksStore.getState().connect(gateway);
    expect(gateway.session.closed).toBe(false);

    useAppRuntimeStore.setState({ activeRemote: 'nas', activeRemotePassword: undefined, agentVersion: '0.1.2' });

    const instance = render(
      <MemoryRouter initialEntries={['/']}>
        <HomeRoute />
      </MemoryRouter>
    );

    // Poll for the SETTLED outcome — session closed AND the store reset —
    // because disconnect() resets the store one microtask after close().
    await until(() => gateway.session.closed && useTasksStore.getState().status === 'idle');
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
