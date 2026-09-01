// registry.tsx — Declarative route registry.
// Maps each route to its Screen component and showLogo flag.

import type { ReactNode } from 'react';

import { HomePage } from '../../pages/HomePage.js';
import { RemotesAddPage } from '../../pages/RemotesAddPage.js';
import { RemotesListPage } from '../../pages/RemotesListPage.js';
import { RemotesRmPage } from '../../pages/RemotesRmPage.js';
import { RemotesUsePage } from '../../pages/RemotesUsePage.js';
import { RemotesTestPage } from '../../pages/RemotesTestPage.js';
import { DoctorPage } from '../../pages/DoctorPage.js';
import { LogsPage } from '../../pages/LogsPage.js';
import { StatusPage } from '../../pages/StatusPage.js';
import { CleanupPage } from '../../pages/CleanupPage.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ScreenComponent = (props?: any) => ReactNode;

export interface RouteEntry {
  Screen: ScreenComponent;
  showLogo: boolean;
}

export const ROUTE_REGISTRY: Record<string, RouteEntry> = {
  home:           { Screen: HomePage,            showLogo: true },
  remotes:        { Screen: HomePage,                 showLogo: true },
  'remotes.add':  { Screen: RemotesAddPage,      showLogo: true },
  'remotes.list': { Screen: RemotesListPage,     showLogo: true },
  'remotes.rm':   { Screen: RemotesRmPage,       showLogo: true },
  'remotes.use':  { Screen: RemotesUsePage,      showLogo: true },
  'remotes.test': { Screen: RemotesTestPage,     showLogo: true },
  doctor:         { Screen: DoctorPage,          showLogo: false },
  logs:           { Screen: LogsPage,            showLogo: false },
  status:         { Screen: StatusPage,          showLogo: false },
  cleanup:        { Screen: CleanupPage,         showLogo: false },
};
