// pages/tasks/model/use-tasks-workspace.test.tsx — 9.16: the workspace rules
// are pinned by these regressions, which moved with the logic into the
// page's model segment (ADR-0018 absorption). The harness mounts the rules
// hook with injected deps (the store lives in model/tasks-store.ts) and
// mirrors the page's hidden-while-connecting early return, because that
// hiding is exactly what 9.14e guards against.
import { Text } from 'ink';

import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { useTasksWorkspace, type TasksWorkspaceDeps, type TasksWorkspaceStatus } from './use-tasks-workspace.js';
import type { JobView, RunMode, RunView, Slug } from '../../../../services/agent.js';

/** Poll until predicate() holds (Ink key flush + hook settle). */
async function until(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  let waited = 0;

  while (!predicate() && waited < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 10));
    waited += 10;
  }
}

function jobView(id: string): JobView {
  return {
    job: { id, type: 'prune', scopes: ['dangling-images'], schedule: { kind: 'cron', expr: '0 4 * * *' } },
    enabled: true,
    createdAt: 't',
    updatedAt: 't',
  };
}

/** A completed dry-run in the selected job's history (the reviewed report). */
function dryRunView(): RunView {
  return {
    seq: 5,
    id: 'r5',
    jobId: 'nas-prune',
    mode: 'dry-run',
    status: 'succeeded',
    catchup: false,
    startedAt: 't',
    finishedAt: 't',
    result: { scopes: [], entries: [], mode: 'dry-run' },
  };
}

interface HarnessProps {
  readonly status: TasksWorkspaceStatus;
  readonly selected: JobView | null;
  readonly latestDryRun: RunView | null;
  readonly triggerJob: TasksWorkspaceDeps['triggerJob'];
}

/** Minimal composition of the rules hook, mirroring the page's early returns. */
function WorkspaceHarness({ status, selected, latestDryRun, triggerJob }: HarnessProps): React.ReactElement {
  const workspace = useTasksWorkspace({
    status,
    hasGateway: true,
    selected,
    latestDryRun,
    removeJob: () => Promise.resolve(true),
    triggerJob,
    upsertJob: () => Promise.resolve(null),
  });

  if (status !== 'ready' && status !== 'warning') {
    // The page hides the workspace behind its connecting early return while
    // the rules hook is still mounted (the 9.14e bug shape).
    return <Text>harness: connecting</Text>;
  }

  if (workspace.mode !== 'browse') {
    return <Text>harness: form ({workspace.mode})</Text>;
  }

  return <Text>harness: browse</Text>;
}

describe('useTasksWorkspace create dispatch (9.14e regression: n opens the form)', () => {
  it('9.14e: "n" on a ready workspace opens the create form', async () => {
    const trigger = vi.fn((_jobId: Slug, _mode: RunMode) => Promise.resolve<RunView | null>(null));
    const props: HarnessProps = { status: 'ready', selected: null, latestDryRun: null, triggerJob: trigger };
    const instance = render(<WorkspaceHarness {...props} />);
    expect(instance.lastFrame() ?? '').toContain('harness: browse');

    instance.stdin.write('n');
    await until(() => (instance.lastFrame() ?? '').includes('harness: form (create)'));

    expect(instance.lastFrame() ?? '').toContain('harness: form (create)');
  });

  it('9.14e: "n" against a HIDDEN workspace (handshake in flight) is not swallowed — the ready workspace opens in browse', async () => {
    const trigger = vi.fn((_jobId: Slug, _mode: RunMode) => Promise.resolve<RunView | null>(null));
    const hidden: HarnessProps = { status: 'connecting', selected: null, latestDryRun: null, triggerJob: trigger };
    const instance = render(<WorkspaceHarness {...hidden} />);
    expect(instance.lastFrame() ?? '').toContain('harness: connecting');

    instance.stdin.write('n'); // key pressed with only the connecting line on screen
    await new Promise(resolve => setTimeout(resolve, 50));

    const ready: HarnessProps = { status: 'ready', selected: null, latestDryRun: null, triggerJob: trigger };
    instance.rerender(<WorkspaceHarness {...ready} />); // handshake completes → ready
    await until(() => (instance.lastFrame() ?? '').includes('harness: browse'));

    // The swallowed keypress must NOT have flipped the hidden mode machine:
    // the ready workspace renders (browse), it does not auto-open the form.
    expect(instance.lastFrame() ?? '').toContain('harness: browse');
    expect(instance.lastFrame() ?? '').not.toContain('form');
  });
});

describe('useTasksWorkspace apply gating (9.7 regression: a requires a reviewed dry-run, t applies directly)', () => {
  it('9.7: "a" with NO dry-run in the selected job\'s history triggers NOTHING', async () => {
    const trigger = vi.fn((_jobId: Slug, _mode: RunMode) => Promise.resolve<RunView | null>(null));
    const props: HarnessProps = {
      status: 'ready',
      selected: jobView('nas-prune'),
      latestDryRun: null,
      triggerJob: trigger,
    };
    const instance = render(<WorkspaceHarness {...props} />);

    instance.stdin.write('a');
    await new Promise(resolve => setTimeout(resolve, 120)); // let any (wrongly) fired call land

    expect(trigger).not.toHaveBeenCalled();
    instance.unmount();
  });

  it('9.7: "a" after a dry-run report is in history applies the selected job (mode apply)', async () => {
    const trigger = vi.fn((_jobId: Slug, _mode: RunMode) => Promise.resolve<RunView | null>(null));
    const props: HarnessProps = {
      status: 'ready',
      selected: jobView('nas-prune'),
      latestDryRun: dryRunView(),
      triggerJob: trigger,
    };
    const instance = render(<WorkspaceHarness {...props} />);

    instance.stdin.write('a');
    await until(() => trigger.mock.calls.length > 0);

    expect(trigger).toHaveBeenCalledWith('nas-prune', 'apply');
    instance.unmount();
  });

  it('9.7: "t" applies DIRECTLY without any reviewed dry-run report', async () => {
    const trigger = vi.fn((_jobId: Slug, _mode: RunMode) => Promise.resolve<RunView | null>(null));
    const props: HarnessProps = {
      status: 'ready',
      selected: jobView('nas-prune'),
      latestDryRun: null,
      triggerJob: trigger,
    };
    const instance = render(<WorkspaceHarness {...props} />);

    instance.stdin.write('t');
    await until(() => trigger.mock.calls.length > 0);

    expect(trigger).toHaveBeenCalledWith('nas-prune', 'apply');
    instance.unmount();
  });
});
