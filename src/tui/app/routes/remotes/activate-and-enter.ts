// activate-and-enter.ts — App-layer wiring for the approved pen flow
// ("Screen - Home / Remote"): after the Connect gate succeeds, activating a
// remote lands directly in its hub at /remote-home. The former 9.14b
// stopgap (activate-then-/tasks) is superseded; /tasks remains reachable
// later via the hub's Global actions tab. Pure glue between the app runtime
// and the router — unit-testable without the conf stack.
import type { AppRuntimeState } from '../../providers/app-runtime-store.js';

export function activateAndEnterRemoteHome(
  runtime: Pick<AppRuntimeState, 'activateRemote'>,
  navigate: (path: string) => void
): (name: string, password?: string) => void {
  return (name, password) => {
    runtime.activateRemote(name, password);
    navigate('/remote-home');
  };
}
