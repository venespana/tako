// helpers/arm64-systemd.ts — shared harness for the gated arm64 e2e suites
// (RA-002 + RA-003). Lives beside the gated suites it serves; not a slice.
//
// Both gated suites need a NATIVE arm64 systemd container with sshd and a
// ready `tako` user. `jrei/systemd-ubuntu` is amd64-only (its manifest lists
// no linux/arm64 — first real arm64 run found this), so the harness builds
// its own image on the fly from the multi-arch ubuntu:24.04 base — the same
// build-on-the-fly doctrine as the integration sshd harness. systemd runs
// as PID 1 under privileged mode; ssh is enabled at build time as a plain
// service (ubuntu 24.04 defaults to ssh.socket activation — disabled here so
// `systemctl is-active ssh` is a truthful readiness signal), and `tako`
// gets passwordless sudo because the install pipeline's linger step may
// call loginctl through sudo.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GenericContainer, type StartedTestContainer } from 'testcontainers';

/** Builds the arm64 systemd+sshd image and starts it privileged. Resolves
 * only once sshd reports active (condition-based, VEN-1 doctrine), so the
 * caller's install pipeline never races a half-booted container. */
export async function startArm64SystemdContainer(password: string): Promise<StartedTestContainer> {
  const contextDir = mkdtempSync(join(tmpdir(), 'arm64-systemd-e2e-'));
  const dockerfile = `
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \\
      systemd libpam-systemd openssh-server sudo curl ca-certificates iproute2 \\
      docker.io docker-compose-v2 \\
    && rm -rf /var/lib/apt/lists/* \\
    && useradd -m -s /bin/bash tako \\
    && echo 'tako:${password}' | chpasswd \\
    && echo 'tako ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/tako \\
    && mkdir -p /run/sshd \\
    && systemctl disable ssh.socket \\
    && systemctl enable ssh docker \\
    && printf '[Unit]\\nDescription=Enable linger for the e2e user (root: polkit denies self-linger in containers)\\n[Service]\\nType=oneshot\\nExecStart=/usr/bin/loginctl enable-linger tako\\n[Install]\\nWantedBy=multi-user.target\\n' > /etc/systemd/system/e2e-linger.service \\
    && systemctl enable e2e-linger.service
EXPOSE 22
CMD ["/lib/systemd/systemd"]
`;
  writeFileSync(join(contextDir, 'Dockerfile'), dockerfile);

  try {
    const image = await GenericContainer.fromDockerfile(contextDir).build('tako-arm64-systemd:e2e');
    const container = await image.withPrivilegedMode().withExposedPorts(22).start();
    const mappedPort = container.getMappedPort(22);

    let waited = 0;

    while (waited < 60_000) {
      const state = (await container.exec(['systemctl', 'is-active', 'ssh'])).output.trim();

      if (state === 'active' && (await realSshReady(mappedPort, password))) return container;

      await new Promise(resolve => setTimeout(resolve, 1_000));
      waited += 1_000;
    }

    throw new Error('sshd did not report active (or accept a real session) within 60s');
  } finally {
    rmSync(contextDir, { recursive: true, force: true });
  }
}

/** REAL session proof: systemd reporting active is not enough — this probes
 * password auth + exec over an actual ssh2 connection, exactly what the
 * install pipeline will do (VEN-1: waiting budgets, never assumptions). */
async function realSshReady(mappedPort: number, password: string): Promise<boolean> {
  const { Client } = await import('ssh2');

  return new Promise(resolve => {
    const connection = new Client()
      .on('ready', () => {
        connection.exec('true', error => {
          connection.end();
          resolve(error === undefined);
        });
      })
      .on('error', () => {
        connection.end();
        resolve(false);
      })
      .connect({
        host: '127.0.0.1',
        port: mappedPort,
        username: 'tako',
        password,
        readyTimeout: 5_000,
      });
  });
}
