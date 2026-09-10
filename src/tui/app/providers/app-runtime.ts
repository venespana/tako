// app-runtime.ts — Session-scoped state the route tree needs that routing
// state cannot carry: the active remote selection and its connect-time
// password. Both are deliberately NOT persisted — every TUI session starts
// with none. The password lives in this context state ONLY: it is never
// rendered, never logged, never written to disk, and is overwritten on each
// re-activation. App owns the state and provides the context above the
// RouterProvider; route shims adapt it into page props (pages never import
// app/, per FSD).
import { createContext, useContext } from 'react';

export interface AppRuntime {
  /** Name of the remote selected this session (undefined until selected). */
  activeRemote: string | undefined;
  /**
   * Connect-time password for the active interactive remote. SESSION-ONLY
   * memory: never rendered, never persisted, overwritten on re-activation.
   */
  activeRemotePassword: string | undefined;
  /**
   * Activate a remote for this session. Pass `password` only for
   * interactive remotes (validated by the caller at the connect-time gate).
   */
  activateRemote: (name: string, password?: string) => void;
}

export const AppRuntimeContext = createContext<AppRuntime>({
  activeRemote: undefined,
  activeRemotePassword: undefined,
  activateRemote: () => {},
});

/** Read the app runtime state from anywhere inside the route tree. */
export function useAppRuntime(): AppRuntime {
  return useContext(AppRuntimeContext);
}
