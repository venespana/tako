// index.ts — Public API of the shared headless router library.
// Everything else in this directory is internal; consumers import only here.
// The directory is extraction-ready: no imports outside react/zustand.
// The pure transition functions (router-logic.ts) are internal — reached
// only through a router instance, and tested directly from inside the directory.

export { createRouter } from './create-router.js';
export type { RouteParams, HistoryEntry, RouterState, RouterOptions, TakoRouter } from './types.js';
