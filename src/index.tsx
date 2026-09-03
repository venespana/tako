#!/usr/bin/env bun
// index.tsx — Composition root: bare `tako` → TUI, args → commander CLI.
// This file sits above both layers and may import `cli/` and `tui/` freely.
// The one sanctioned cli→tui exception is the add-remote-wizard feature
// (ADR-0014, enforced with a carve-out in eslint.config.js); every other
// cli↔tui import remains forbidden.

import { runCli } from './cli/index.js';

// Bare `tako` with no arguments → launch TUI
// Any subcommand (e.g. `tako doctor`) → delegate to CLI
if (process.argv.length <= 2) {
  // Dynamic import to avoid pulling Ink/React into CLI-only invocations
  const { render } = await import('ink');
  const { default: App } = await import('./tui/app/App.js');
  // alternateScreen: render on a separate screen buffer (like vim/htop).
  // No scrollback pollution while running; original terminal content restored on exit.
  const instance = render(<App />, {
    alternateScreen: true,
  });
  await instance.waitUntilExit();
} else {
  runCli();
}
