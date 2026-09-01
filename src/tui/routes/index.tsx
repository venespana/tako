// routes/index.tsx — Route shim for '/': adapts the root layout's outlet
// context to HomePage's props, keeping the page router-agnostic (and
// unit-testable with plain props).
import { useOutletContext } from 'react-router';

import type { ScreenProps } from '../features/menu/index.js';
import { HomePage } from '../pages/HomePage.js';
import type { RouteHandle } from '../shared/lib/route-tree.js';

function HomeRoute(): React.ReactElement {
  const screen = useOutletContext<ScreenProps>();
  return <HomePage {...screen} />;
}

export default HomeRoute;

/** Home shows the logo and drives the home registry menu. */
export const routeMeta = { showLogo: true, menu: 'home' } satisfies RouteHandle;
