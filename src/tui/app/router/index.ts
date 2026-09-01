// index.ts — Router module barrel export.

export type { RouteName, RouteParams, HistoryEntry, RouterState } from './types.js';
export { navigate, goBack } from './router-logic.js';
export type { RouterStore } from './router-store.js';
export { useRouterStore, setExitHandler } from './router-store.js';
export { ROUTE_REGISTRY } from './registry.js';
export type { RouteEntry } from './registry.js';
