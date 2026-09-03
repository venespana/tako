// App.tsx — Root TUI component: composition root of the router tree.
// App owns provider wiring: it creates the per-mount data router, owns the
// session-scoped active remote state (every session starts with none), and
// hands off to RouterProvider (the matched route tree renders the app shell
// and the active screens).
import { useState } from 'react';

import { RouterProvider } from 'react-router';

import { createAppRouter } from './app-router.js';
import { AppRuntimeContext } from './providers/app-runtime.js';

export default function App(): React.ReactElement {
  // One router per mount (data routers have no reset); the useState
  // initializer keeps the instance stable across re-renders.
  const [router] = useState(createAppRouter);

  // Session-only: the active remote name lives in React state, never conf.
  const [activeRemote, setActiveRemote] = useState<string | undefined>(undefined);

  return (
    <AppRuntimeContext.Provider value={{ activeRemote, setActiveRemote }}>
      <RouterProvider router={router} />
    </AppRuntimeContext.Provider>
  );
}
