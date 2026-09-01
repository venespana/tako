// app-router.ts — The app's router factory, composing the generated route
// tree with a memory history rooted at '/'. A factory, not a singleton:
// data routers cannot be reset, so each App mount owns a fresh instance —
// which also keeps tests isolated by construction.
import { createMemoryRouter } from 'react-router';

import { routeTree } from '../routes.generated.js';

export function createAppRouter(): ReturnType<typeof createMemoryRouter> {
  return createMemoryRouter(routeTree, { initialEntries: ['/'] });
}
