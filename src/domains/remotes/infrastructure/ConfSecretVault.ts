// ConfSecretVault.ts — INFRASTRUCTURE adapter (sole conf consumer for secrets)
// v0: uses Node.js crypto (same algorithm as conf) for reversible obfuscation
// NOT secure — isolation layer, swappable with OS keyring later
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

import type { SecretVault } from '../application/SecretVault.js';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// Derive a fixed key from a seed (mimics conf's encryptionKey approach)
// In production, this could come from conf's encryptionKey config
function deriveKey(seed: string): Buffer {
  // Use a fixed salt for deterministic key derivation (v0 only — NOT secure)
  return createHash('sha256')
    .update(seed + '-tako-secret-v0')
    .digest();
}

const FIXED_KEY = deriveKey('tako-remotes');

export class ConfSecretVault implements SecretVault {
  constructor(_conf: unknown) {
    // conf instance is accepted but not used directly in v0
    // (conf encryption is store-level, not string-level)
    // In v1+, could use conf's encryptionKey for the store
  }

  obfuscate(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, FIXED_KEY, iv);
    let encrypted = cipher.update(plain, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Prepend IV so it can be used for decryption (IV is not secret)
    return iv.toString('hex') + ':' + encrypted;
  }

  reveal(cipher: string): string {
    const parts = cipher.split(':');

    if (parts.length !== 2) {
      throw new Error('Invalid cipher format');
    }

    const ivHex: string = parts[0]!;
    const encrypted: string = parts[1]!;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, FIXED_KEY, iv);
    const decrypted = decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
    return decrypted;
  }
}
