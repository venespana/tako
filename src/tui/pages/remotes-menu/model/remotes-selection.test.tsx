// remotes-selection.test.tsx — Unit tests for the selection-screen model:
// async fetch through the repository port (loading → ready / error) and the
// zero-remotes redirect decision. A probe component renders the hook's state
// as text; the fake port resolves on a timer so the loading window is real.
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';

import type { RemoteRepository } from '../../../../domains/remotes/application/RemoteRepository.js';
import type { RemoteSummary } from '../../../../domains/remotes/domain/types.js';
import { settle } from '../../../test-utils/ink-interactions.js';
import { useRemotesSelection } from './remotes-selection.js';

const REMOTES: RemoteSummary[] = [
  { name: 'nas', endpoint: 'ops@10.0.0.5:22' },
  { name: 'web', endpoint: 'admin@10.0.0.10:2222' },
];

function delayedRepository(outcome: { list?: RemoteSummary[]; error?: Error }): {
  repository: RemoteRepository;
  list: ReturnType<typeof vi.fn>;
} {
  const list = vi.fn(
    () =>
      new Promise<RemoteSummary[]>((resolve, reject) => {
        setTimeout(() => {
          if (outcome.error) reject(outcome.error);
          else resolve(outcome.list ?? []);
        }, 20);
      })
  );
  const repository: RemoteRepository = {
    existsByName: vi.fn(async () => false),
    existsByEndpoint: vi.fn(async () => false),
    save: vi.fn(async () => {}),
    list: list as unknown as RemoteRepository['list'],
  };
  return { repository, list };
}

function Probe({
  repository,
  enabled = true,
  onSelect,
  onEmpty,
}: {
  repository: RemoteRepository;
  enabled?: boolean;
  onSelect: (name: string) => void;
  onEmpty: () => void;
}) {
  const selection = useRemotesSelection({ repository, enabled, onSelect, onEmpty });
  return (
    <Text>
      {`status:${selection.status} focused:${selection.focusedId ?? 'none'} rows:${selection.selectable
        .map(item => item.id)
        .join(',')}`}
    </Text>
  );
}

describe('useRemotesSelection', () => {
  it('fetches through the port: loading until resolve, then ready with rows', async () => {
    const { repository, list } = delayedRepository({ list: REMOTES });

    const { lastFrame } = render(<Probe repository={repository} onSelect={vi.fn()} onEmpty={vi.fn()} />);

    // The fetch is in flight on first paint (Ink renders while pending).
    const loading = await settle(lastFrame, f => f.includes('status:loading'), 200);
    expect(loading).toContain('status:loading');

    const ready = await settle(lastFrame, f => f.includes('status:ready'), 1000);
    expect(list).toHaveBeenCalledTimes(1);
    expect(ready).toContain('rows:nas,web');
    expect(ready).toContain('focused:nas');
  });

  it('calls onEmpty exactly once when the configured list resolves empty', async () => {
    const { repository } = delayedRepository({ list: [] });
    const onEmpty = vi.fn();

    const { lastFrame, unmount } = render(<Probe repository={repository} onSelect={vi.fn()} onEmpty={onEmpty} />);

    await settle(lastFrame, f => f.includes('status:ready'), 1000);
    // The redirect decision runs in a passive effect — it can fire a tick
    // after the frame already shows ready.
    await vi.waitFor(() => expect(onEmpty).toHaveBeenCalledTimes(1));
    expect(onEmpty).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('reports an error (and does NOT redirect) when the port rejects', async () => {
    const { repository } = delayedRepository({ error: new Error('conf unreadable') });
    const onEmpty = vi.fn();

    const { lastFrame } = render(<Probe repository={repository} onSelect={vi.fn()} onEmpty={onEmpty} />);

    const frame = await settle(lastFrame, f => f.includes('status:error'), 1000);
    expect(frame).toContain('status:error');
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it('stays inert when disabled (no fetch, no focused row)', async () => {
    const { repository, list } = delayedRepository({ list: REMOTES });

    const { lastFrame } = render(
      <Probe repository={repository} enabled={false} onSelect={vi.fn()} onEmpty={vi.fn()} />
    );

    const frame = await settle(lastFrame, f => f.includes('status:loading'), 200);
    expect(list).not.toHaveBeenCalled();
    expect(frame).toContain('focused:none');
  });
});
