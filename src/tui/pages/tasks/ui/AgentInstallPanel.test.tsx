// AgentInstallPanel.test.tsx — 9.14b: the in-TUI install pane (live output,
// reconnect on success, retry on failure); 9.19: the IN-PROCESS model — the
// pane drives a gateway-shaped install() (no child process, no watchdog) and
// late/stale progress after unmount or retry is dropped.
import { describe, expect, it, vi } from 'vitest';

import { render } from 'ink-testing-library';

import type { InstallOutcome, InstallRunner } from '../model/use-agent-install.js';
import { AgentInstallPanel } from './AgentInstallPanel.js';

async function until(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  for (let waited = 0; !predicate() && waited < timeoutMs; waited += 10) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

interface InstallCall {
  onLine: (line: string) => void;
}

/** Scripted install: records calls, plays the script on a later tick. */
function scriptedInstall(play: (call: InstallCall) => Promise<InstallOutcome> | InstallOutcome) {
  const calls: InstallCall[] = [];
  const install = vi.fn((onLine: (line: string) => void): Promise<InstallOutcome> => {
    const call: InstallCall = { onLine };
    calls.push(call);
    return new Promise<InstallOutcome>(resolve => {
      setTimeout(async () => resolve(await play(call)), 10);
    });
  });
  return { install, calls };
}

function setup(install: InstallRunner, overrides: Partial<Parameters<typeof AgentInstallPanel>[0]> = {}) {
  const onInstalled = vi.fn();
  const onStart = vi.fn();
  const instance = render(
    <AgentInstallPanel
      remote='nas'
      error='channel open failed'
      autoStart={true}
      onInstalled={onInstalled}
      onStart={onStart}
      install={install}
      {...overrides}
    />
  );
  return { instance, onInstalled, onStart };
}

describe('AgentInstallPanel (9.14b, in-process since 9.19)', () => {
  it('streams install progress lines live into the pane', async () => {
    const { install } = scriptedInstall(({ onLine }) => {
      onLine('target arch: x64');
      onLine('unit written');
      return { ok: true };
    });
    const { instance, onInstalled } = setup(install);

    await until(() => (instance.lastFrame() ?? '').includes('unit written'));
    expect(instance.lastFrame() ?? '').toContain('target arch: x64');
    expect(instance.lastFrame() ?? '').toContain('install finished');
    await until(() => onInstalled.mock.calls.length > 0);
  });

  it('a successful install notifies the workspace to reconnect exactly once', async () => {
    const { install } = scriptedInstall(() => ({ ok: true }));
    const { onInstalled } = setup(install);

    await until(() => onInstalled.mock.calls.length > 0);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(onInstalled).toHaveBeenCalledTimes(1);
  });

  it('failure shows the outcome error and the retry hint; r re-runs the install', async () => {
    const { install, calls } = scriptedInstall(({ onLine }) => {
      onLine('ssh: connect refused');
      return { ok: false, error: 'ssh: connect refused' };
    });
    const { instance, onStart } = setup(install);

    await until(() => (instance.lastFrame() ?? '').includes('install failed (ssh: connect refused)'), 2000);
    // 9.15a: the retry hint lives in the FOOTER (page-hints context) — the
    // body carries the failure status only, no inline key instructions.
    expect(instance.lastFrame() ?? '').not.toContain('press r');
    expect(instance.lastFrame() ?? '').not.toContain('retry ·');
    expect(calls).toHaveLength(1);
    expect(onStart).toHaveBeenCalledTimes(1);

    instance.stdin.write('r');
    // Poll the START signal first (onStart fires synchronously with the
    // restart inside one start() call), then the second attempt + its outcome.
    await until(() => onStart.mock.calls.length === 2, 2000);
    await until(() => calls.length === 2, 2000);
    await until(() => (instance.lastFrame() ?? '').includes('install failed (ssh: connect refused)'), 2000);
  });

  it('autoStart=false never runs on its own — the first run is explicit', async () => {
    const { install, calls } = scriptedInstall(() => ({ ok: true }));
    const { instance } = setup(install, { autoStart: false });

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(calls).toHaveLength(0);
    instance.unmount();
  });

  it('9.19: unmount drops late progress lines and the outcome (no child to cancel)', async () => {
    const calls: InstallCall[] = [];
    const install = vi.fn((onLine: (line: string) => void): Promise<InstallOutcome> => {
      calls.push({ onLine });
      return new Promise<InstallOutcome>(resolve => setTimeout(() => resolve({ ok: true }), 30));
    });
    const { instance, onInstalled } = setup(install);

    await until(() => calls.length > 0);
    instance.unmount();
    // The in-flight attempt settles AFTER unmount: its lines and outcome must
    // not be published (no setState-after-unmount, no reconnect).
    calls[0]?.onLine('late line after unmount');
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(onInstalled).not.toHaveBeenCalled();
  });

  it('9.19: a rejected install() lands in `done` with the reason (the phase machine never wedges)', async () => {
    const install = vi.fn((): Promise<InstallOutcome> => Promise.reject(new Error('ssh stack blew up')));
    const { instance, onInstalled } = setup(install);

    await until(() => (instance.lastFrame() ?? '').includes('install failed (ssh stack blew up)'), 2000);
    expect(onInstalled).not.toHaveBeenCalled();
  });
});
