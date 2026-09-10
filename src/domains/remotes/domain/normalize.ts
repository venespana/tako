// domain/normalize.ts — read-time normalization for legacy remotes
import type { Remote } from './types.js';

/**
 * Normalize a persisted Remote read from storage.
 *
 * Legacy `store` remotes without an `obfuscatedPassword` predate the
 * `interactive` credential type; they are treated as `interactive` at the
 * read boundary. Normalization MUST NOT rewrite the persisted entry —
 * this returns a copy, the stored bytes stay untouched.
 */
export function normalizeRemote(remote: Remote): Remote {
  return remote.credentialType === 'store' && remote.obfuscatedPassword === undefined
    ? { ...remote, credentialType: 'interactive' }
    : remote;
}

/** True when the remote needs a connect-time password prompt (no secret on disk). */
export const requiresConnectPrompt = (remote: Remote): boolean => remote.credentialType === 'interactive';
