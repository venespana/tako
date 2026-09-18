// infrastructure/SystemdRemoteController.test.ts — STRICT TDD RED phase
//
// Command sequences over the RemoteCommandRunner port (task 4.8) plus the
// deferred threat-matrix RED test 3.14 (polkit linger denial actionable error).
import { describe, expect, it, vi, type Mock } from 'vitest';

import type { RemoteCommandResult, RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';
import { SystemdRemoteController } from './SystemdRemoteController.js';

const UNIT_PATH = '$HOME/.config/systemd/user/tako-agent.service';

function createRunner(
  impl: (command: string) => RemoteCommandResult | Promise<RemoteCommandResult>
): { runner: RemoteCommandRunner; run: Mock<(command: string) => Promise<RemoteCommandResult>> } {
  const run = vi.fn(async (command: string) => impl(command));
  return { runner: { run }, run };
}

function ok(stdout = ''): RemoteCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function fail(stderr: string, exitCode = 1): RemoteCommandResult {
  return { stdout: '', stderr, exitCode };
}

/** In-memory linger meta store standing in for the agent_meta adapter (sync — bun:sqlite). */
function createFakeMeta(): {
  getLingerEnabledByTako: () => boolean | undefined;
  setLingerEnabledByTako: (value: boolean) => void;
  written: boolean[];
} {
  const written: boolean[] = [];
  return {
    written,
    getLingerEnabledByTako: () => undefined,
    setLingerEnabledByTako: (value: boolean) => {
      written.push(value);
    },
  };
}

describe('SystemdRemoteController — unit file (fixed template, foreign-unit guard)', () => {
  it('writes the fixed unit template with ExecStart=%h/.tako/tako, Restart=on-failure, RestartSec=3, TAKO_AGENT=1', async () => {
    const { run } = createRunner(() => ok());
    const controller = new SystemdRemoteController({ runner: { run } });

    await controller.writeUnitFile();

    const write = run.mock.calls.map(([command]) => command as string).find(command => command.includes('cat >'));
    expect(write).toBeDefined();
    expect(write).toContain('ExecStart=%h/.tako/tako agent run');
    expect(write).toContain('Restart=on-failure');
    expect(write).toContain('RestartSec=3');
    expect(write).toContain('Environment=TAKO_AGENT=1');
    expect(write).toContain(`'${UNIT_PATH}'`);
  });

  it('overwrites a foreign unit file only when its ExecStart references %h/.tako/tako', async () => {
    const { run } = createRunner(command => {
      if (command.includes('cat ')) {
        return ok('[Service]\nExecStart=%h/.tako/tako agent run\nRestart=on-failure\n');
      }
      return ok();
    });
    const controller = new SystemdRemoteController({ runner: { run } });

    await expect(controller.writeUnitFile()).resolves.toBeUndefined();
    expect(run.mock.calls.some(([command]) => (command as string).includes('cat >'))).toBe(true);
  });

  it('refuses to overwrite a unit file whose ExecStart points elsewhere (foreign unit, threat matrix row 3)', async () => {
    const { run } = createRunner(command => {
      if (command.includes('cat ') && !command.includes('cat >')) {
        return ok('[Service]\nExecStart=/usr/bin/something-else --serve\n');
      }
      return ok();
    });
    const controller = new SystemdRemoteController({ runner: { run } });

    await expect(controller.writeUnitFile()).rejects.toThrow(/tako-agent\.service/);
    expect(run.mock.calls.some(([command]) => (command as string).includes('cat >'))).toBe(false);
  });

  it('surfaces stderr when the write itself fails', async () => {
    const { run } = createRunner(command => {
      if (command.includes('cat >')) return fail('mkdir: permission denied');
      return ok();
    });
    const controller = new SystemdRemoteController({ runner: { run } });

    await expect(controller.writeUnitFile()).rejects.toThrow(/permission denied/);
  });
});

describe('SystemdRemoteController — systemd commands', () => {
  it('daemonReload / enableUnit / disableUnit / removeUnitFile run the documented systemctl commands', async () => {
    const { run } = createRunner(() => ok());
    const controller = new SystemdRemoteController({ runner: { run } });

    await controller.daemonReload();
    await controller.enableUnit();
    await controller.disableUnit();
    await controller.removeUnitFile();

    const commands = run.mock.calls.map(([command]) => command as string);
    expect(commands).toContain('systemctl --user daemon-reload');
    expect(commands).toContain('systemctl --user enable --now tako-agent.service');
    expect(commands).toContain('systemctl --user disable --now tako-agent.service');
    expect(commands.some(command => command.startsWith('rm -f'))).toBe(true);
  });

  it('surfaces systemctl failures with stderr and the remedy hint', async () => {
    const { run } = createRunner(command =>
      command.includes('enable') ? fail('Failed to connect to bus: $XDG_RUNTIME_DIR not set') : ok()
    );
    const controller = new SystemdRemoteController({ runner: { run } });

    await expect(controller.enableUnit()).rejects.toThrow(/Failed to connect to bus/);
  });
});

describe('SystemdRemoteController — linger (D8 by-tako recording)', () => {
  it('showLinger parses loginctl output into true/false/unknown', async () => {
    const { run } = createRunner(() => ok('Linger=no'));
    const controller = new SystemdRemoteController({ runner: { run } });

    await expect(controller.showLinger()).resolves.toBe(false);

    const yesRunner = createRunner(() => ok('Linger=yes'));
    const yesController = new SystemdRemoteController({ runner: yesRunner.runner });
    await expect(yesController.showLinger()).resolves.toBe(true);

    const unknownRunner = createRunner(() => fail('user not found'));
    const unknownController = new SystemdRemoteController({ runner: unknownRunner.runner });
    await expect(unknownController.showLinger()).resolves.toBe('unknown');
    expect(run.mock.calls.some(([command]) => (command as string).includes('--property=Linger'))).toBe(true);
  });

  it('enableLinger records linger_enabled_by_tako=true in the meta store on success', async () => {
    const { run } = createRunner(() => ok());
    const meta = createFakeMeta();
    const controller = new SystemdRemoteController({ runner: { run }, meta });

    await controller.enableLinger();

    expect(meta.written).toEqual([true]);
  });

  it('disableLinger records linger_enabled_by_tako=false in the meta store on success', async () => {
    const { run } = createRunner(() => ok());
    const meta = createFakeMeta();
    const controller = new SystemdRemoteController({ runner: { run }, meta });

    await controller.disableLinger();

    expect(meta.written).toEqual([false]);
  });

  it('3.14 RED: polkit linger denial surfaces an actionable error naming the polkit action and the sudo remedy', async () => {
    const { run } = createRunner(() =>
      fail('You are not authorized to perform this operation.\npolkit: org.freedesktop.login1.set-self-linger')
    );
    const meta = createFakeMeta();
    const controller = new SystemdRemoteController({ runner: { run }, meta });

    const failure = controller.enableLinger();

    await expect(failure).rejects.toThrow(/org\.freedesktop\.login1\.set-self-linger/);
    await expect(failure).rejects.toThrow(/sudo loginctl enable-linger/);
    expect(meta.written).toEqual([]);
  });
});

describe('SystemdRemoteController — KillUserProcesses detection', () => {
  it('reads the value from busctl first', async () => {
    const { run } = createRunner(() => ok('b true'));
    const controller = new SystemdRemoteController({ runner: { run } });

    await expect(controller.detectKillUserProcesses()).resolves.toBe(true);
  });

  it('falls back to /etc/systemd/logind.conf when busctl fails', async () => {
    const { run } = createRunner(command => {
      if (command.includes('busctl')) return fail('busctl: no such file');
      if (command.includes('logind.conf')) return ok('#KillUserProcesses=no\nKillUserProcesses=yes\n');
      return ok();
    });
    const controller = new SystemdRemoteController({ runner: { run } });

    await expect(controller.detectKillUserProcesses()).resolves.toBe(true);
  });

  it('reports unknown when neither source yields a value (warning-only per spec)', async () => {
    const { run } = createRunner(() => fail('nope'));
    const controller = new SystemdRemoteController({ runner: { run } });

    await expect(controller.detectKillUserProcesses()).resolves.toBe('unknown');
  });
});
