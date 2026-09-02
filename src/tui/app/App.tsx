// App.tsx — Root TUI component: composition root of the router tree.
// App owns only provider wiring: it creates the per-mount data router,
// publishes runtime flags to the route tree, and hands off to RouterProvider
// (the matched route tree renders the app shell and the active screens).
import { useState } from 'react';

import { RouterProvider } from 'react-router';

import { createAppRouter } from './app-router.js';
import { AppRuntimeContext } from './providers/app-runtime.js';

export interface AppProps {
  /** Whether a remote is currently configured. */
  hasActiveRemote?: boolean;
}

export default function App({ hasActiveRemote = false }: AppProps): React.ReactElement {
  // One router per mount (data routers have no reset); the useState
  // initializer keeps the instance stable across re-renders.
  const [router] = useState(createAppRouter);

  return (
    <AppRuntimeContext.Provider value={{ hasActiveRemote }}>
      <RouterProvider router={router} />
    </AppRuntimeContext.Provider>
  );
}
