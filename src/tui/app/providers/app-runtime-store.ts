// app-runtime-store.ts — Session-scoped state the route tree needs that
// routing state cannot carry: the active remote selection, its connect-time
// password, and the agent version the workspace's handshake reported (9.14a —
// the shell header shows it under the logo). Zustand module-scope store
// (9.20 — zero React contexts in the TUI): App renders RouterProvider only,
// and route shims subscribe with selectors (pages never import app/, per
// FSD).
//
// None of it is persisted — every TUI session starts with none. The password
// lives in this store ONLY: it is never rendered, never logged, never written
// to disk, and is overwritten on each re-activation.
import { create } from 'zustand';

export interface AppRuntimeState {
  /** Name of the remote selected this session (undefined until selected). */
  readonly activeRemote: string | undefined;
  /**
   * Connect-time password for the active interactive remote. SESSION-ONLY
   * memory: never rendered, never persisted, overwritten on re-activation.
   */
  readonly activeRemotePassword: string | undefined;
  /**
   * Agent version the active remote's handshake reported (undefined until a
   * workspace handshake succeeds). Cached here so the shell header can show
   * it on every screen (9.14a), not just inside the workspace.
   */
  readonly agentVersion: string | undefined;
  /**
   * Activate a remote for this session. Pass `password` only for interactive
   * remotes (validated by the caller at the connect-time gate). Resets the
   * cached agent version: a new remote's agent status is unknown until its
   * own handshake — never show the previous remote's version (9.14 verifier).
   */
  activateRemote: (name: string, password?: string) => void;
  /** Record/clear the active remote's handshake agent version (9.14a). */
  setAgentVersion: (version: string | undefined) => void;
  /**
   * Leave the remote context (9.14c): clears the selection, its password and
   * the cached agent version. Closing the agent session itself is the
   * caller's job (the home route shim drives the tasks store's disconnect).
   */
  clearActiveRemote: () => void;
}

/** Initial (no remote selected) session state — the test-reset baseline. */
export const initialAppRuntimeState: Pick<AppRuntimeState, 'activeRemote' | 'activeRemotePassword' | 'agentVersion'> = {
  activeRemote: undefined,
  activeRemotePassword: undefined,
  agentVersion: undefined,
};

export const useAppRuntimeStore = create<AppRuntimeState>(set => ({
  ...initialAppRuntimeState,
  activateRemote: (name, password) =>
    set({ activeRemote: name, activeRemotePassword: password, agentVersion: undefined }),
  setAgentVersion: version => {
    set({ agentVersion: version });
  },
  clearActiveRemote: () => set({ ...initialAppRuntimeState }),
}));
