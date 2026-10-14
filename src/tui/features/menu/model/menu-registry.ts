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
        route: '/remotes',
      },
      {
        id: 'remote-add',
        label: 'Add',
        command: 'add',
        kind: 'action',
        enabledWhen: 'always',
        route: '/remotes/add',
      },
      {
        id: 'remote-delete',
        label: 'Delete',
        command: 'delete',
        kind: 'action',
        enabledWhen: 'always',
        route: '/remotes/rm',
      },
      // 9.14d: no home Tasks entry — the tasks workspace is the REMOTE's menu,
      // reached by selecting a remote (Select → /tasks), never from home.
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
