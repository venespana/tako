// App.tsx — Root TUI shell: provides context and mounts the router.
// All state machine logic lives in the components rendered by the router (e.g. HomePage).
// Context values are MEMOIZED: a fresh object per render would re-render every
// context consumer on every App render (render-loop amplifier — task 9.10).
import { useMemo, useState } from 'react';

import { RouterProvider, createMemoryRouter } from 'react-router';

import { AppRuntimeContext } from './providers/app-runtime.js';
import { routeTree } from './routes.generated.js';
import { EditingContext } from '../shared/lib/editing-context.js';

const router = createMemoryRouter(routeTree, { initialEntries: ['/'] });

export function App(): React.ReactElement {
  const [activeRemote, setActiveRemote] = useState<string | undefined>(undefined);
  const [activeRemotePassword, setActiveRemotePassword] = useState<string | undefined>(undefined);
  const [isEditing, setIsEditing] = useState(false);

  const appRuntime = useMemo(
    () => ({
      activeRemote,
      activeRemotePassword,
      activateRemote: (name: string, password?: string) => {
        setActiveRemote(name);
        setActiveRemotePassword(password);
      },
    }),
    [activeRemote, activeRemotePassword]
  );

  const editingContextValue = useMemo(() => ({ isEditing, setEditing: setIsEditing }), [isEditing]);

  return (
    <AppRuntimeContext.Provider value={appRuntime}>
      <EditingContext.Provider value={editingContextValue}>
        <RouterProvider router={router} />
      </EditingContext.Provider>
    </AppRuntimeContext.Provider>
  );
}
