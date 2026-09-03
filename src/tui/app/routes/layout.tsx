// routes/layout.tsx — Root layout shim: the file convention maps this file to
// the route-tree root wrapping every screen. The shell itself is a widget
// (FSD: reusable root-layout composition, imported via the app-shell slice's
// public API); route shims stay one-liners. No routeMeta: the shell owns
// chrome; menu flags belong to menu pages.
import { AppShell } from '../../widgets/app-shell/index.js';

export default AppShell;
