// routes/layout.tsx — Root layout shim: the file convention maps this file to
// the route-tree root wrapping every screen. The shell itself is a widget
// (FSD: reusable root-layout composition); route shims stay one-liners.
// No routeMeta: the shell owns chrome; menu flags belong to menu pages.
import { AppShell } from '../../widgets/AppShell.js';

export default AppShell;
