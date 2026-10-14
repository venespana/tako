// index.ts — Public API of the action-menu widget slice (FSD rule 4-2).
// Pages import the widget AND its input-contract types from here, never
// from slice internals (ADR-0018 point 6: the widget owns RenderableAction*;
// upper layers map their menu data into these props).
export { ActionMenu } from './ui/ActionMenu.js';
export type { RenderableActionGroup } from './ui/ActionMenu.js';
