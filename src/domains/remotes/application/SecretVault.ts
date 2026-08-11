// SecretVault.ts — PORT interface (application layer owns this)

/** Port: obfuscation/reveal of secrets (v0 = conf reversible obfuscation, NOT secure) */
export interface SecretVault {
  /** Obfuscate a plain-text secret. v0: conf encryptionKey (reversible, NOT secure) */
  obfuscate(plain: string): string;
  /** Reveal an obfuscated secret. Inverse of obfuscate(). */
  reveal(cipher: string): string;
}
