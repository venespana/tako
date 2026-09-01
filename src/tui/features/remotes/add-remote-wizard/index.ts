// index.ts — Public API of the add-remote-wizard feature slice (FSD rule 4-2).
// External consumers must import from here, never from slice internals.
// ADR-0014: this slice is the one sanctioned tui→cli boundary exception
// (`tako remote add` launches the wizard from the CLI).

export { runAddRemoteWizard } from './lib/run.js';
export type { RunWizardDeps } from './lib/run.js';
