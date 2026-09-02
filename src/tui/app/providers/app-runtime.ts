// app-runtime.ts — Runtime flags the route tree needs that routing state
// cannot carry. App provides the context above the RouterProvider; the app
// shell reads it inside the route tree.
import { createContext, useContext } from 'react';

export interface AppRuntime {
  /** Whether a remote is currently configured (gates hasActiveRemote menu items). */
  hasActiveRemote: boolean;
}

export const AppRuntimeContext = createContext<AppRuntime>({ hasActiveRemote: false });

/** Read the app runtime flags from anywhere inside the route tree. */
export function useAppRuntime(): AppRuntime {
  return useContext(AppRuntimeContext);
}
