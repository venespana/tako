// route-tree.ts — Route-tree infrastructure for the file-based route
// convention: the route handle contract, the route module contract, and the
// helper the generated tree uses to attach components + handles. The pure
// build-time generator functions live in scripts/generate-routes.ts.
import type { ComponentType } from 'react';

import type { RouteObject } from 'react-router';

/** Metadata a route module may export as `routeMeta`. The generator attaches
 * it to the RouteObject `handle`, where hooks read it at runtime via
 * useMatches(). Absent routeMeta means an empty handle. */
export interface RouteHandle {
  /** Declares that this route drives a menu screen: full movement/select
   * footer hints are shown; other screens get back/quit hints. */
  menu?: true;
}

/** Structural subset of a react-router match used by handle-driven helpers
 * (keeps consumers free of react-router types). */
export interface RouteMatchLike {
  handle?: unknown;
}

/** What every route module in src/tui/app/routes/ exports: the component
 * (the generated tree mounts it) plus optional metadata. The generated file
 * uses namespace imports so both exports are reachable at runtime. */
export interface RouteModule {
  default: ComponentType<unknown>;
  routeMeta?: RouteHandle;
}

export interface DefineRouteOptions {
  /** Path segment relative to the parent layout ('remotes', 'list', '/'). */
  path?: string;
  /** Index route: renders at the parent layout's exact path. */
  index?: true;
  /** Route module. Absent for module-less path-prefix parents
   * (subdirectories without a layout.tsx): the route gets no Component —
   * react-router renders an implicit Outlet for element-less parents —
   * and no handle. */
  module?: RouteModule;
  children?: RouteObject[];
}

/** Build one RouteObject from a route module: eager component, runtime
 * handle from the module's routeMeta ({} when absent), optional children.
 * With module absent, the route is a bare path prefix: children only, no
 * Component (react-router renders an implicit Outlet for element-less
 * parents) and no handle. */
export function defineRoute({ path, index, module, children }: DefineRouteOptions): RouteObject {
  const route: RouteObject = index ? { index: true } : { path };
  if (module !== undefined) {
    route.Component = module.default;
    route.handle = module.routeMeta ?? {};
  }
  if (children !== undefined) route.children = children;
  return route;
}

/** Menu policy: any match in the chain declaring a menu handle marks the
 * screen as a menu page (full movement/select footer hints); the deepest
 * declaration wins by virtue of being present in the chain. */
export function hasMenuHandle(matches: readonly RouteMatchLike[]): boolean {
  return matches.some(match => (match.handle as RouteHandle | undefined)?.menu !== undefined);
}
