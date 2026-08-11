// Ssh2ConnectionTester.ts — INFRASTRUCTURE adapter (sole ssh2 consumer)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { Client } from 'ssh2';
import type { Client as Ssh2Client } from 'ssh2';

import type { SshConnectionTester } from '../application/SshConnectionTester.js';
import type { SshTestConfig, SshValidationOutcome, SshErrorCategory } from '../domain/types.js';

const READY_TIMEOUT_MS = 10_000;

function expandPath(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return join(homedir(), path.slice(1));
  }
  return path;
}

function computeFingerprint(key: Buffer): string {
  // SHA256 base64 fingerprint format (standard for modern SSH)
  return createHash('sha256').update(key).digest('base64');
}

function categorizeError(err: Error & { code?: string; level?: string }): SshErrorCategory {
  // ECONNREFUSED, ENOTFOUND, ECONNRESET, etc.
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
    return 'network';
  }
  // ETIMEDOUT is a timeout
  if (err.code === 'ETIMEDOUT') {
    return 'timeout';
  }
  // Authentication failures
  if (err.level === 'client-authentication' || err.message?.toLowerCase().includes('auth')) {
    return 'auth';
  }
  // Hostkey issues
  if (err.level === 'client-verification' || err.message?.toLowerCase().includes('hostkey')) {
    return 'hostkey';
  }
  return 'unknown';
}

export class Ssh2ConnectionTester implements SshConnectionTester {
  constructor(private readonly createClient: () => Ssh2Client = () => new Client()) {}

  async test(config: SshTestConfig): Promise<SshValidationOutcome> {
    return new Promise(resolve => {
      const client = this.createClient();
      let resolved = false;
      let capturedFingerprint: string | undefined;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
        }
        try {
          client.end();
        } catch {
          // ignore cleanup errors
        }
      };

      // Handle successful connection
      client.once('ready', () => {
        cleanup();
        resolve({
          ok: true,
          hostkeyFingerprint: capturedFingerprint ?? 'unknown',
        });
      });

      // Handle errors
      client.once('error', (err: Error & { code?: string; level?: string; desc?: string }) => {
        cleanup();
        const category = categorizeError(err);
        // Build detailed message with all available ssh2 error info
        const details: string[] = [err.message];
        if (err.level) details.push(`[level: ${err.level}]`);
        if (err.code) details.push(`[code: ${err.code}]`);
        if (err.desc) details.push(`[server: ${err.desc}]`);
        resolve({ ok: false, category, message: details.join(' ') });
      });

      // Build connect config
      const connectConfig: {
        host: string;
        port: number;
        username: string;
        readyTimeout: number;
        password?: string;
        privateKey?: string;
        hostVerifier: (key: Buffer, verify: (accept: boolean) => void) => void;
      } = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: READY_TIMEOUT_MS,
        hostVerifier: (key: Buffer, verify: (accept: boolean) => void) => {
          // Capture the fingerprint for display to user
          capturedFingerprint = computeFingerprint(key);
          // For validation, we accept the hostkey
          // The wizard will ask user to confirm
          verify(true);
        },
      };

      // Add auth based on type
      if (config.auth.type === 'password') {
        connectConfig.password = config.auth.password;
      } else if (config.auth.type === 'key') {
        try {
          const keyPath = expandPath(config.auth.keyPath);
          connectConfig.privateKey = readFileSync(keyPath, 'utf8');
        } catch (err) {
          cleanup();
          const error = err as Error & { code?: string };
          resolve({ ok: false, category: 'auth', message: `Cannot read private key: ${error.message}` });
          return;
        }
      }

      try {
        client.connect(connectConfig);
      } catch (err) {
        cleanup();
        const error = err as Error & { code?: string };
        const category = categorizeError(error);
        resolve({ ok: false, category, message: error.message });
      }

      // Timeout safety net
      setTimeout(() => {
        if (!resolved) {
          cleanup();
          resolve({ ok: false, category: 'timeout', message: 'Connection timed out' });
        }
      }, READY_TIMEOUT_MS + 1000);
    });
  }
}
