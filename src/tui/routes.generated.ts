// routes.generated.ts — GENERATED FILE, DO NOT EDIT.
// Regenerate with: bun run generate:routes
// Source of truth: the file convention in src/tui/routes/ (layout.tsx wraps its
// siblings, index.tsx is the index route, other name.tsx are child routes).
// Handles are read at runtime from each module's `routeMeta` export.
import type { RouteObject } from 'react-router';

import * as route_cleanup from './routes/cleanup.js';
import * as route_doctor from './routes/doctor.js';
import * as route_index from './routes/index.js';
import * as route_layout from './routes/layout.js';
import * as route_logs from './routes/logs.js';
import * as route_remotes_add from './routes/remotes/add.js';
import * as route_remotes_layout from './routes/remotes/layout.js';
import * as route_remotes_list from './routes/remotes/list.js';
import * as route_remotes_rm from './routes/remotes/rm.js';
import * as route_remotes_test from './routes/remotes/test.js';
import * as route_remotes_use from './routes/remotes/use.js';
import * as route_status from './routes/status.js';
import { defineRoute } from './shared/lib/route-tree.js';

export const routeTree: RouteObject[] = [
  defineRoute({
    path: '/',
    module: route_layout,
    children: [
      defineRoute({ index: true, module: route_index }),
      defineRoute({ path: 'cleanup', module: route_cleanup }),
      defineRoute({ path: 'doctor', module: route_doctor }),
      defineRoute({ path: 'logs', module: route_logs }),
      defineRoute({ path: 'status', module: route_status }),
      defineRoute({
        path: 'remotes',
        module: route_remotes_layout,
        children: [
          defineRoute({ path: 'add', module: route_remotes_add }),
          defineRoute({ path: 'list', module: route_remotes_list }),
          defineRoute({ path: 'rm', module: route_remotes_rm }),
          defineRoute({ path: 'test', module: route_remotes_test }),
          defineRoute({ path: 'use', module: route_remotes_use }),
        ],
      }),
    ],
  }),
];
