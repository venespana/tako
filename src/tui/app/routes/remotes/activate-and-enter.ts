// activate-and-enter.ts — App-layer wiring for the 9.14b Select flow: the
// remote's workspace IS the remote's menu, so activating a remote also enters
// /tasks directly (no separate stop at the selection list). Pure glue between
// the app runtime and the router — unit-testable without the conf stack.
import type { AppRuntimeState } from '../../providers/app-runtime-store.js';

export function activateAndEnterTasks(
  runtime: Pick<AppRuntimeState, 'activateRemote'>,
  navigate: (path: string) => void
): (name: string, password?: string) => void {
  return (name, password) => {
    runtime.activateRemote(name, password);
    navigate('/tasks');
  };
}
