// menu-registry.ts — Declarative action registry for the home menu.
// Only implemented commands appear; unimplemented ones are excluded entirely.
// The registry is a module-level frozen constant so consumers can memoize on
// its identity (a fresh array per call would defeat React memo deps).

import type { ActionGroup } from './menu-items.js';

function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const REGISTRY: ActionGroup[] = deepFreeze([
  {
    id: 'local',
    label: 'Local',
    items: [
      {
        id: 'doctor',
        label: 'doctor',
        command: 'doctor',
        kind: 'action',
        enabledWhen: 'always',
        handlerKey: 'doctor',
        route: '/doctor',
      },
    ],
  },
  {
    id: 'remote',
    label: 'Remote',
    items: [
      {
        id: 'remote-select',
        label: 'Select',
        command: 'select',
        kind: 'action',
        enabledWhen: 'always',
        handlerKey: 'remotes.select',
        route: '/remotes',
      },
      {
        id: 'remote-add',
        label: 'Add',
        command: 'add',
        kind: 'action',
        enabledWhen: 'always',
        handlerKey: 'remotes.add',
        route: '/remotes/add',
      },
      {
        id: 'remote-delete',
        label: 'Delete',
        command: 'delete',
        kind: 'action',
        enabledWhen: 'always',
        handlerKey: 'remotes.delete',
        route: '/remotes/rm',
      },
      {
        id: 'remote-tasks',
        label: 'Tasks',
        command: 'tasks',
        kind: 'action',
        // Scheduled jobs live on the AGENT of the active remote — without a
        // remote selected there is nothing to manage (design §TUI Layout).
        enabledWhen: 'hasActiveRemote',
        handlerKey: 'tasks',
        route: '/tasks',
      },
    ],
  },
  {
    id: 'config',
    label: 'Config',
    items: [],
  },
]);

/** Access the (stable, frozen) action registry. */
export function getRegistry(): ActionGroup[] {
  return REGISTRY;
}
