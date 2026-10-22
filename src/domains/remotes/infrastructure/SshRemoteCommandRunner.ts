// SshRemoteCommandRunner.ts — INFRASTRUCTURE adapter (sole ssh2 consumer)
import { StringDecoder } from 'node:string_decoder';

import type { ClientChannel } from 'ssh2';

import type { SshChannelSource } from './SshConnectionManager.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../application/RemoteCommandRunner.js';

export class SshRemoteCommandRunner implements RemoteCommandRunner {
  constructor(private readonly channels: SshChannelSource) {}

  async run(command: string): Promise<RemoteCommandResult> {
    const channel = await this.channels.exec(command);
    return collectChannelResult(channel, command);
  }
}

function collectChannelResult(channel: ClientChannel, command: string): Promise<RemoteCommandResult> {
  return new Promise((resolve, reject) => {
    // StringDecoder keeps multibyte utf8 characters intact across chunk splits.
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;
    let sawExit = false;

    channel.on('data', (chunk: Buffer) => {
      stdout += stdoutDecoder.write(chunk);
    });
    channel.stderr?.on('data', (chunk: Buffer) => {
      stderr += stderrDecoder.write(chunk);
    });
    channel.on('exit', (code: number | null) => {
      sawExit = true;
      exitCode = typeof code === 'number' ? code : null;
    });
    channel.on('error', (err: Error) => {
      reject(err);
    });
    channel.on('close', () => {
      if (!sawExit) {
        // Connection dropped mid-command: partial stdout has NO defined exit
        // status, which is ambiguous for probes (e.g. `systemctl --user
        // is-active` in the survive-disconnect probe). Reject as a transport
        // failure instead of resolving a result that looks like data.
        reject(new Error(`remote command channel closed without an exit status (transport failure): ${command}`));
        return;
      }

      resolve({
        stdout: stdout + stdoutDecoder.end(),
        stderr: stderr + stderrDecoder.end(),
        exitCode,
      });
    });
  });
}
