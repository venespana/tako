#!/usr/bin/env bun
// Tako — TUI for managing docker-compose-based homelabs over SSH.

import { Command } from 'commander';

/**
 * Build the CLI program with every command registered LAZILY: command
 * handlers load via dynamic import() inside their actions, so no TUI/Ink
 * module (and no Bun-only agent module) ever enters the graph at
 * registration time (required for the compiled single binary).
 */
export function buildProgram(): Command {
  const program = new Command();

  program.name('tako').description('TUI for managing docker-compose-based homelabs over SSH').version('0.0.0');

  program
    .command('doctor')
    .description('Check host dependencies (ssh, ssl, git, docker, docker-compose)')
    .action(async () => {
      try {
        // Lazy import to defer TUI/Ink loading (required for compile)
        const { runDoctor } = await import('./commands/doctor.js');
        const exitCode = await runDoctor();
        process.exit(exitCode);
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
    });

  // Remote management subcommand
  const remote = program.command('remote').description('Manage remote connections');

  remote
    .command('add')
    .description('Add a new remote connection (interactive wizard)')
    .action(async () => {
      try {
        // Lazy import to defer TUI loading (required for compile)
        const { runRemoteAddDefault } = await import('./commands/remote-add.js');
        const exitCode = await runRemoteAddDefault();
        process.exit(exitCode);
      } catch (err) {
        console.error(err);
        process.exit(2);
      }
    });

  // Agent management family (ADR-0015) — plain console output, never Ink.
  const agent = program
    .command('agent')
    .description(
      'Manage the persistent agent on a remote server (run on the server; install/uninstall/status from the client)'
    );

  agent
    .command('run')
    .description('Run the agent daemon (server-side; started by tako-agent.service)')
    .option('--socket-path <path>', 'override the agent unix socket path (~/.tako/agent.sock by default)')
    .action(async (options: { socketPath?: string }) => {
      try {
        const { runAgentRun } = await import('./commands/agent-run.js');
        process.exit(await runAgentRun(options));
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
    });

  agent
    .command('install')
    .description('Install (or upgrade) the agent on a remote: preflight → binary → unit + linger → probe')
    .argument('<remote>', 'configured remote name')
    .action(async (remoteName: string) => {
      try {
        const { runAgentInstallDefault } = await import('./commands/agent-install.js');
        process.exit(await runAgentInstallDefault(remoteName));
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
    });

  agent
    .command('uninstall')
    .description('Remove the agent from a remote (keeps linger Tako did not enable)')
    .argument('<remote>', 'configured remote name')
    .action(async (remoteName: string) => {
      try {
        const { runAgentUninstallDefault } = await import('./commands/agent-uninstall.js');
        process.exit(await runAgentUninstallDefault(remoteName));
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
    });

  agent
    .command('status')
    .description('Show the agent status on a remote (unit, linger, versions, jobs, handshake)')
    .argument('<remote>', 'configured remote name')
    .action(async (remoteName: string) => {
      try {
        const { runAgentStatusDefault } = await import('./commands/agent-status.js');
        process.exit(await runAgentStatusDefault(remoteName));
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
    });

  return program;
}

export function runCli(argv: string[] = process.argv): void {
  buildProgram().parse(argv);
}
