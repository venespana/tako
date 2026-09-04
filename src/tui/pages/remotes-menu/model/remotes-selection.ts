// remotes-selection.ts — The remotes menu page's selection-screen model:
// fetches the configured remotes through the repository port (async, with
// loading/error states) and owns the list interaction (cursor + Enter via
// the menu feature's useMenuList). Also carries the redirect decision: an
// empty configured list routes the user to the add wizard. The hook must
// stay callable in both page modes (hooks rules): when the selection screen
// is inactive (`enabled: false`) it skips fetching and keys go inert, so the
// page can render the submenu instead.
import { useEffect, useMemo, useState } from 'react';

import type { RemoteRepository } from '../../../../domains/remotes/application/RemoteRepository.js';
import type { RemoteSummary } from '../../../../domains/remotes/domain/types.js';
import type { ActionItem } from '../../../features/menu/index.js';
import { useMenuList } from '../../../features/menu/index.js';

export type RemotesSelectionStatus = 'loading' | 'ready' | 'error';

export interface UseRemotesSelectionOptions {
  /** Persistence port — the page receives it as a prop from the route shim. */
  repository: RemoteRepository;
  /** Whether the selection screen is the active page mode. */
  enabled: boolean;
  /** Called with the remote's name when Enter selects it. */
  onSelect: (name: string) => void;
  /** Called once when the configured list resolves empty (redirect to add). */
  onEmpty: () => void;
}

export interface RemotesSelection {
  /** loading until the port resolves; error when the read fails. */
  status: RemotesSelectionStatus;
  /** Selection list rows (label carries name + endpoint), stable per fetch. */
  selectable: ActionItem[];
  /** Id of the focused row, undefined while loading or inactive. */
  focusedId: string | undefined;
}

function toSelectionItem(remote: RemoteSummary): ActionItem {
  return {
    id: remote.name,
    label: `${remote.name} (${remote.endpoint})`,
    command: remote.name,
    kind: 'action',
    enabledWhen: 'always',
  };
}

export function useRemotesSelection({
  repository,
  enabled,
  onSelect,
  onEmpty,
}: UseRemotesSelectionOptions): RemotesSelection {
  const [remotes, setRemotes] = useState<RemoteSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Fetch once per activation; the cancel flag ignores a late resolution
  // after the screen went inactive or unmounted.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    repository.list().then(
      list => {
        if (!cancelled) setRemotes(list);
      },
      () => {
        if (!cancelled) {
          setFailed(true);
          setRemotes([]);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, repository]);

  // Redirect decision: zero remotes configured → the add wizard is the only
  // sensible next screen (a failed read must NOT redirect — it shows the
  // error state instead).
  useEffect(() => {
    if (enabled && !failed && remotes !== null && remotes.length === 0) onEmpty();
  }, [enabled, failed, remotes, onEmpty]);

  const selectable = useMemo(() => (remotes ?? []).map(toSelectionItem), [remotes]);

  // Keys stay mounted in both modes (hooks rules): pass an empty list when
  // inactive so movement is a no-op and Enter finds no focused item.
  const { cursor } = useMenuList({
    selectable: enabled ? selectable : [],
    onSelect: item => onSelect(item.id),
  });

  return {
    status: failed ? 'error' : remotes === null ? 'loading' : 'ready',
    selectable,
    focusedId: enabled ? selectable[cursor]?.id : undefined,
  };
}
