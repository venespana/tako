#!/usr/bin/env bun
// Tako — TUI for managing docker-compose-based homelabs over SSH.

import { Command } from 'commander';
import { runDoctor } from './commands/doctor.js';

const program = new Command();

program
  .name('tako')
  .description('TUI for managing docker-compose-based homelabs over SSH')
  .version('0.0.0');

program
  .command('doctor')
  .description('Check host dependencies (ssh, ssl, git, docker, docker-compose)')
  .action(async () => {
    try {
      const exitCode = await runDoctor();
      process.exit(exitCode);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  });

program.parse();
