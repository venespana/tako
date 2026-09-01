// app-router.ts — The app's router instance, built from the shared headless router.
// App-level singleton: App.tsx, hooks, and tests all consume this instance
// so route state is shared across the tree. The type-only import keeps this
// module free of page-component side effects at runtime.

import type { RouteName } from './routes.js';
import { createRouter } from '../shared/router/index.js';

export const appRouter = createRouter<RouteName>({ initialRoute: 'home' });
