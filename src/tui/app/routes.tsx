// routes.tsx — App route table: route-name union, Screen components, showLogo metadata.
// This is the app-layer replacement for the old app/router/registry.tsx;
// the headless navigation machine lives in shared/router.

import type { ReactNode } from 'react';

import { CleanupPage } from '../pages/CleanupPage.js';
import { DoctorPage } from '../pages/DoctorPage.js';
import { HomePage } from '../pages/HomePage.js';
import { LogsPage } from '../pages/LogsPage.js';
import { RemotesAddPage } from '../pages/RemotesAddPage.js';
import { RemotesListPage } from '../pages/RemotesListPage.js';
import { RemotesRmPage } from '../pages/RemotesRmPage.js';
import { RemotesTestPage } from '../pages/RemotesTestPage.js';
import { RemotesUsePage } from '../pages/RemotesUsePage.js';
import { StatusPage } from '../pages/StatusPage.js';

/**
 * Canonical route set for the TUI (app layer — the shared router is route-agnostic).
 * Note: 'remotes' is the parent submenu route; 'remotes.*' are the child routes.
 */
export type RouteName =
  | 'home'
  | 'remotes'
  | 'remotes.add'
  | 'remotes.list'
  | 'remotes.rm'
  | 'remotes.use'
  | 'remotes.test'
  | 'doctor'
  | 'logs'
  | 'status'
  | 'cleanup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ScreenComponent = (props?: any) => ReactNode;

export interface RouteEntry {
  Screen: ScreenComponent;
  showLogo: boolean;
}

export const ROUTE_TABLE: Record<RouteName, RouteEntry> = {
  home: { Screen: HomePage, showLogo: true },
  remotes: { Screen: HomePage, showLogo: true },
  'remotes.add': { Screen: RemotesAddPage, showLogo: true },
  'remotes.list': { Screen: RemotesListPage, showLogo: true },
  'remotes.rm': { Screen: RemotesRmPage, showLogo: true },
  'remotes.use': { Screen: RemotesUsePage, showLogo: true },
  'remotes.test': { Screen: RemotesTestPage, showLogo: true },
  doctor: { Screen: DoctorPage, showLogo: false },
  logs: { Screen: LogsPage, showLogo: false },
  status: { Screen: StatusPage, showLogo: false },
  cleanup: { Screen: CleanupPage, showLogo: false },
};

/** Narrow an untyped route string (e.g. from menu items) to the app route union. */
export function isAppRoute(route: string): route is RouteName {
  return Object.hasOwn(ROUTE_TABLE, route);
}
