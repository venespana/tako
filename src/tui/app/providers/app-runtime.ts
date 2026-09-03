// app-runtime.ts — Session-scoped state the route tree needs that routing
// state cannot carry: the active remote selection. It is deliberately NOT
// persisted — every TUI session starts with none. App owns the state and
// provides the context above the RouterProvider; route shims adapt it into
// page props (pages never import app/, per FSD).
import { createContext, useContext } from 'react';

export interface AppRuntime {
  /** Name of the remote selected this session (undefined until selected). */
  activeRemote: string | undefined;
  /** Select the active remote for this session. */
  setActiveRemote: (name: string) => void;
}

export const AppRuntimeContext = createContext<AppRuntime>({
  activeRemote: undefined,
  setActiveRemote: () => {},
});

/** Read the app runtime state from anywhere inside the route tree. */
export function useAppRuntime(): AppRuntime {
  return useContext(AppRuntimeContext);
}
