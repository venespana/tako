// integration/docker/remote-compose-status.integ.test.ts — `docker compose ls`
// over REAL ssh against a slim sshd container (S3 of mvp-status-command).
//
// Real runtime harness: an alpine sshd image is built on the fly with a stub
// `docker` shell script on PATH (/usr/bin/docker — always on the sshd
// exec-channel PATH) that emits a fixture JSON; no docker-in-docker and no
// systemd needed. The chain under test is the production one end to end:
// SshConnectionManager → SshRemoteCommandRunner → RemoteComposeCliAdapter →
// GetStackStatus. A second scenario disables the stub in-container to verify
// the missing-binary refusal over real ssh.
//
// Skips (never fails) when no docker daemon is available, per repo conventions.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Dockerode } from 'dockerode';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GetStackStatus } from '../../../src/domains/docker/application/GetStackStatus.js';
import { RemoteComposeCliAdapter } from '../../../src/domains/docker/infrastructure/RemoteComposeCliAdapter.js';
import { SshConnectionManager } from '../../../src/domains/remotes/infrastructure/SshConnectionManager.js';
import { SshRemoteCommandRunner } from '../../../src/domains/remotes/infrastructure/SshRemoteCommandRunner.js';

const SSH_USER = 'tako';
const SSH_PASSWORD = 'integ-pass-1';

const FIXTURE_JSON = '[{"Name":"integ-stack","Status":"running(1)","ConfigFiles":"/home/tako/integ/compose.yml"}]\n';

async function probeHostDaemon(): Promise<boolean> {
  try {
    await new Dockerode().ping();

    return true;
  } catch {
    return false;
  }
}

const daemonAvailable = await probeHostDaemon();

describe.skipIf(!daemonAvailable)('remote compose status — slim sshd container', () => {
  let container: StartedTestContainer;
  let manager: SshConnectionManager;
  let contextDir: string;

  beforeAll(async () => {
    contextDir = mkdtempSync(join(tmpdir(), 'tako-sshd-'));
    writeFileSync(join(contextDir, 'fixture.json'), FIXTURE_JSON, 'utf8');
    writeFileSync(
      join(contextDir, 'Dockerfile'),
      [
        'FROM alpine:3.20',
        'RUN apk add --no-cache openssh-server \\',
        ' && ssh-keygen -A \\',
        ` && adduser -D -s /bin/sh ${SSH_USER} \\`,
        ` && echo '${SSH_USER}:${SSH_PASSWORD}' | chpasswd \\`,
        ' && printf "#!/bin/sh\\ncat /opt/fixture.json\\n" > /usr/bin/docker \\',
        ' && chmod +x /usr/bin/docker \\',
        ` && printf '\\nPasswordAuthentication yes\\n' >> /etc/ssh/sshd_config`,
        'COPY fixture.json /opt/fixture.json',
        'CMD ["/usr/sbin/sshd", "-D"]',
        '',
      ].join('\n'),
      'utf8'
    );

    const image = await GenericContainer.fromDockerfile(contextDir).build('tako-remote-compose-status:integ');
    container = await image.withExposedPorts(22).start();

    manager = new SshConnectionManager({
      host: container.getHost(),
      port: container.getMappedPort(22),
      username: SSH_USER,
      auth: { type: 'password', password: SSH_PASSWORD },
    });
  }, 120_000);

  afterAll(async () => {
    await manager?.end();
    await container?.stop();
    rmSync(contextDir, { recursive: true, force: true });
  });

  it('reads the compose stack table through the production chain over real ssh', async () => {
    const adapter = new RemoteComposeCliAdapter(new SshRemoteCommandRunner(manager));
    const result = await new GetStackStatus(adapter).execute();

    expect(result).toEqual({
      kind: 'ok',
      entries: [{ name: 'integ-stack', status: 'running(1)', configFiles: '/home/tako/integ/compose.yml' }],
    });
  });

  it('refuses through the chain when the remote has no docker binary', async () => {
    const disable = await container.exec(['mv', '/usr/bin/docker', '/usr/bin/docker.disabled']);
    expect(disable.exitCode).toBe(0);

    const adapter = new RemoteComposeCliAdapter(new SshRemoteCommandRunner(manager));
    const result = await new GetStackStatus(adapter).execute();

    expect(result.kind).toBe('refusal');

    if (result.kind === 'refusal') {
      expect(result.reason).toContain('not found');
    }
  });
});
