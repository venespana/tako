// remotes-selection.ts — The remotes menu page's selection-screen model:
// fetches the configured remotes through the repository port (async, with
// loading/error states) and owns the list interaction (cursor + Enter via
// the menu feature's useMenuList). Carries the redirect decision (empty
// list → add wizard) and the CONNECT-TIME GATE: interactive remotes (no
// secret on disk) open a masked password prompt, validate over a real SSH
// connection, re-prompt on auth failure, and cancel restores the list.
// The hook must stay callable in both page modes (hooks rules): when the
// selection screen is inactive (`enabled: false`) it skips fetching and
// keys go inert, so the page can render the submenu instead.
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { RemoteRepository } from '../../../../domains/remotes/application/RemoteRepository.js';
import type { ValidateSshConnection } from '../../../../domains/remotes/application/ValidateSshConnection.js';
import { requiresConnectPrompt } from '../../../../domains/remotes/domain/normalize.js';
import type { Remote, RemoteSummary } from '../../../../domains/remotes/domain/types.js';
import type { ActionItem } from '../../../features/menu/index.js';
import { useMenuList } from '../../../features/menu/index.js';

export type RemotesSelectionStatus = 'loading' | 'ready' | 'error';

/** Connect-time password gate for interactive remotes (render-ready view). */
export interface ConnectGateState {
  name: string;
  phase: 'prompt' | 'validating';
  error: { category: string; message: string } | null;
}

/** Internal gate state: keeps the full remote for validation config. */
interface GateState {
  remote: Remote;
  phase: 'prompt' | 'validating';
  error: { category: string; message: string } | null;
}

export interface UseRemotesSelectionOptions {
  /** Persistence port — the page receives it as a prop from the route shim. */
  repository: RemoteRepository;
  /** SSH validation port — used by the connect-time gate. */
  validateConnection: ValidateSshConnection;
  /** Whether the selection screen is the active page mode. */
  enabled: boolean;
  /**
   * Called once the remote may activate. `password` is passed ONLY for
   * interactive remotes (validated just before this call).
   */
  onActivate: (name: string, password?: string) => void;
  /** Called once when the configured list resolves empty (redirect to add). */
  onEmpty: () => void;
}

export interface RemotesSelection {
  /** loading until the port resolves; error when the read fails. */
  status: RemotesSelectionStatus;
  /** Selection list rows (label carries name + endpoint), stable per fetch. */
  selectable: ActionItem[];
  /** Id of the focused row, undefined while loading, inactive, or gated. */
  focusedId: string | undefined;
  /** Active connect-time password gate, null when the list is interactive. */
  gate: ConnectGateState | null;
  /** Submit the prompted password: SSH-validate → activate or re-prompt. */
  submitPassword: (password: string) => void;
  /** Abort the prompt; restores the selection list. */
  cancelPrompt: () => void;
}

/** Human-facing failure message for a failed connect-time validation. */
function connectErrorMessage(category: string, message: string): string {
  switch (category) {
    case 'auth':
      return 'Authentication failed — check the password and try again.';
    case 'timeout':
      return 'Connection timed out — try again.';
    case 'network':
      return `Network error — ${message}`;
    case 'hostkey':
      return `Hostkey verification failed — ${message}`;
    default:
      return message;
  }
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
  validateConnection,
  enabled,
  onActivate,
  onEmpty,
}: UseRemotesSelectionOptions): RemotesSelection {
  const [remotes, setRemotes] = useState<RemoteSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [gate, setGate] = useState<GateState | null>(null);

  // One fetch pass; returns a cancel flag so late resolutions after
  // deactivation/unmount (or a superseded refresh) are ignored.
  const fetchList = useCallback(() => {
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
  }, [repository]);

  // Fetch once per activation.
  useEffect(() => {
    if (!enabled) return;
    return fetchList();
  }, [enabled, fetchList]);

  // Redirect decision: zero remotes configured → the add wizard is the only
  // sensible next screen (a failed read must NOT redirect — it shows the
  // error state instead).
  useEffect(() => {
    if (enabled && !failed && gate === null && remotes !== null && remotes.length === 0) onEmpty();
  }, [enabled, failed, gate, remotes, onEmpty]);

  // Enter over a row: resolve the FULL remote through the port. A null
  // outcome means it vanished between list and Enter → refresh and stay.
  // Non-interactive remotes activate directly; interactive ones open the
  // connect-time password gate.
  const handleSelect = useCallback(
    (name: string) => {
      void repository.getByName(name).then(remote => {
        if (remote === null) {
          setRemotes(null);
          fetchList();
          return;
        }
        if (!requiresConnectPrompt(remote)) {
          onActivate(name, undefined);
          return;
        }
        setGate({ remote, phase: 'prompt', error: null });
      });
    },
    [repository, fetchList, onActivate]
  );

  // Validate the just-typed password over a real SSH connection. Each
  // attempt uses only the password from THIS prompt (never a stored one).
  const submitPassword = useCallback(
    (password: string) => {
      if (gate === null || gate.phase !== 'prompt') return;
      const { remote } = gate;
      setGate({ remote, phase: 'validating', error: null });
      void validateConnection
        .validate({
          host: remote.host,
          port: remote.port,
          username: remote.username,
          auth: { type: 'password', password },
        })
        .then(outcome => {
          if (outcome.ok) {
            setGate(null);
            onActivate(remote.name, password);
          } else {
            setGate({
              remote,
              phase: 'prompt',
              error: { category: outcome.category, message: connectErrorMessage(outcome.category, outcome.message) },
            });
          }
        });
    },
    [gate, validateConnection, onActivate]
  );

  const cancelPrompt = useCallback(() => setGate(null), []);

  const selectable = useMemo(() => (remotes ?? []).map(toSelectionItem), [remotes]);

  // Keys stay mounted in both modes (hooks rules): pass an empty list when
  // inactive or gated so movement is a no-op and Enter finds no focused item.
  const { cursor } = useMenuList({
    selectable: enabled && gate === null ? selectable : [],
    onSelect: item => handleSelect(item.id),
  });

  return {
    status: failed ? 'error' : remotes === null ? 'loading' : 'ready',
    selectable,
    focusedId: enabled && gate === null ? selectable[cursor]?.id : undefined,
    gate: gate === null ? null : { name: gate.remote.name, phase: gate.phase, error: gate.error },
    submitPassword,
    cancelPrompt,
  };
}
