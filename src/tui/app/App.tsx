// App.tsx — Root TUI shell: mounts the memory router. All session-scoped
// state — the editing flag, the footer hints, the active remote — lives in
// zustand stores at module scope (9.20): App owns no state and provides no
// context, so there is no provider value to memoize and no re-render
// amplifier (the 9.10 class is gone by construction).
import { RouterProvider, createMemoryRouter } from 'react-router';

import { routeTree } from './routes.generated.js';

const router = createMemoryRouter(routeTree, { initialEntries: ['/'] });

export function App(): React.ReactElement {
  return <RouterProvider router={router} />;
}
