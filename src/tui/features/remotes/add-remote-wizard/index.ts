// index.ts — Public API of the add-remote-wizard feature slice (FSD rule 4-2).
// External consumers must import from here, never from slice internals.
// ADR-0014: this slice is the one sanctioned tui→cli boundary exception
// (`tako remote add` launches the wizard from the CLI). The component is
// also embedded by the TUI's remotes-add page, which resets the store on
// mount so each page entry starts a fresh wizard run.

export { runAddRemoteWizard } from './lib/run.js';
export type { RunWizardDeps } from './lib/run.js';
export { AddRemoteWizard } from './ui/AddRemoteWizard.js';
export type { AddRemoteWizardProps } from './ui/AddRemoteWizard.js';
export { useWizardStore } from './model/wizard-store.js';
