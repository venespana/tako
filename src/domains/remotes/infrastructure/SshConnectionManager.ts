// SshConnectionManager.ts — INFRASTRUCTURE adapter (sole ssh2 consumer)
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { Client } from 'ssh2';
import type { ClientChannel, SFTPWrapper } from 'ssh2';

const READY_TIMEOUT_MS = 10_000;

/** Connection material for one managed host. */
export interface SshConnectConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth: SshConnectAuth;
}

export type SshConnectAuth =
  { readonly type: 'password'; readonly password: string } | { readonly type: 'key'; readonly keyPath: string };

/**
 * Structural channel surface consumed by the remotes adapters
 * (SshRemoteCommandRunner, SftpRemoteFileTransfer, StreamLocalAgentChannel).
 * SshConnectionManager implements it; tests substitute fakes.
 */
export interface SshChannelSource {
  /** Open an exec channel running `command`. */
  exec(command: string): Promise<ClientChannel>;
  /** Open an SFTP channel. */
  sftp(): Promise<SFTPWrapper>;
  /** Open a forwarded channel to a remote unix socket (OpenSSH direct-streamlocal). */
  streamLocal(socketPath: string): Promise<ClientChannel>;
}

function expandPath(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Holds ONE ssh2 Client per host: connects on first use, multiplexes all
 * concurrent channel requests over that single authenticated connection,
 * and reconnects with a fresh client after the connection drops.
 */
export class SshConnectionManager implements SshChannelSource {
  private client?: Client;
  private connecting?: Promise<Client>;
  private endWhileConnecting = false;

  constructor(
    private readonly config: SshConnectConfig,
    private readonly createClient: () => Client = () => new Client()
  ) {}

  /** Live client, connecting once (single-flight) and reusing the result. */
  async getConnection(): Promise<Client> {
    this.client ??= await this.acquireClient();
    return this.client;
  }

  async exec(command: string): Promise<ClientChannel> {
    const client = await this.getConnection();
    return new Promise((resolve, reject) => {
      client.exec(command, (err: Error | undefined, channel: ClientChannel) => {
        if (err) {
          reject(err);
        } else {
          resolve(channel);
        }
      });
    });
  }

  async sftp(): Promise<SFTPWrapper> {
    const client = await this.getConnection();
    return new Promise((resolve, reject) => {
      client.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
        if (err) {
          reject(err);
        } else {
          resolve(sftp);
        }
      });
    });
  }

  async streamLocal(socketPath: string): Promise<ClientChannel> {
    const client = await this.getConnection();
    return new Promise((resolve, reject) => {
      client.openssh_forwardOutStreamLocal(socketPath, (err: Error | undefined, channel: ClientChannel) => {
        if (err) {
          reject(err);
        } else {
          resolve(channel);
        }
      });
    });
  }

  /** Close the live connection; the next request reconnects with a fresh client. */
  async end(): Promise<void> {
    this.client?.end();
    this.client = undefined;
    if (this.connecting) {
      this.endWhileConnecting = true;
    }
    this.connecting = undefined;
  }

  private acquireClient(): Promise<Client> {
    this.connecting ??= this.establish().then(
      client => {
        if (this.endWhileConnecting) {
          // end() raced the handshake: fail every in-flight waiter cleanly so
          // nobody receives an already-ended client, and allow a fresh reconnect.
          this.endWhileConnecting = false;
          this.connecting = undefined;
          client.end();
          throw new Error('SSH connection closed while connecting');
        }
        this.client = client;
        this.connecting = undefined;
        return client;
      },
      (err: Error) => {
        this.connecting = undefined;
        throw err;
      }
    );
    return this.connecting;
  }

  private establish(): Promise<Client> {
    const client = this.createClient();
    return this.connect(client);
  }

  private connect(client: Client): Promise<Client> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        client.removeListener('ready', onReady);
        client.removeListener('error', onError);
      };
      const onReady = () => {
        cleanup();
        // Lifetime watchers: a dropped connection invalidates the cached client.
        client.on('error', () => this.markDisconnected(client));
        client.on('close', () => this.markDisconnected(client));
        resolve(client);
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      client.once('ready', onReady);
      client.once('error', onError);
      try {
        client.connect(this.buildConnectConfig());
      } catch (err) {
        cleanup();
        reject(err as Error);
      }
    });
  }

  private markDisconnected(client: Client): void {
    if (this.client === client) {
      this.client = undefined;
    }
  }

  private buildConnectConfig(): {
    host: string;
    port: number;
    username: string;
    readyTimeout: number;
    password?: string;
    privateKey?: string;
  } {
    const connectConfig: {
      host: string;
      port: number;
      username: string;
      readyTimeout: number;
      password?: string;
      privateKey?: string;
    } = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      readyTimeout: READY_TIMEOUT_MS,
    };

    if (this.config.auth.type === 'password') {
      connectConfig.password = this.config.auth.password;
    } else {
      connectConfig.privateKey = readFileSync(expandPath(this.config.auth.keyPath), 'utf8');
    }

    return connectConfig;
  }
}
