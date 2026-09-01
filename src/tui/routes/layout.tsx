// routes/layout.tsx — Root layout shim: the file convention maps this file to
// the route-tree root wrapping every screen. The shell itself lives in the
// app layer (FSD: app owns app-wide layout); route shims stay one-liners.
// No routeMeta: logo/menu decisions belong to the leaf routes and layouts.
import { AppShell } from '../app/AppShell.js';

export default AppShell;
