// domain/types.ts — pure domain types, zero external deps

// ---------------------------------------------------------------------------
// Remote entity
// ---------------------------------------------------------------------------

export type RemoteType = 'ssh';
export type SshCredentialType = 'store' | 'ssh-key';

/** Persisted remote connection */
export interface Remote {
  readonly name: string;
  readonly type: RemoteType;
  readonly username: string;
  readonly host: string;
  readonly port: number;
  readonly credentialType: SshCredentialType;
  /** Present only when credentialType is 'store' and user chose to save */
  readonly obfuscatedPassword?: string;
  /** Present only when credentialType is 'ssh-key' */
  readonly keyPath?: string;
}

// ---------------------------------------------------------------------------
// Draft (in-flight, before persistence)
// ---------------------------------------------------------------------------

export interface RemoteDraft {
  readonly name: string;
  readonly type: RemoteType;
  readonly username: string;
  readonly host: string;
  readonly port: number;
  readonly credentialType: SshCredentialType;
  /** Password as entered by the user (never persisted plain) */
  readonly password?: string;
  /** Path to private key file */
  readonly keyPath?: string;
  /** Whether the user wants the password saved (credentialType 'store' only) */
  readonly savePassword?: boolean;
}

// ---------------------------------------------------------------------------
// SSH endpoint (string form)
// ---------------------------------------------------------------------------

/** user@host:port string */
export type SshEndpoint = string;

// ---------------------------------------------------------------------------
// SSH validation
// ---------------------------------------------------------------------------

export type SshErrorCategory = 'auth' | 'network' | 'timeout' | 'hostkey' | 'unknown';

export type SshValidationOutcome =
  | { readonly ok: true; readonly hostkeyFingerprint: string }
  | { readonly ok: false; readonly category: SshErrorCategory; readonly message: string };

/** Config passed to SshConnectionTester.test() */
export interface SshTestConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth: SshAuthWithPassword | SshAuthWithKey;
}

export interface SshAuthWithPassword {
  readonly type: 'password';
  readonly password: string;
}

export interface SshAuthWithKey {
  readonly type: 'key';
  readonly keyPath: string;
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export type DuplicateKind = 'name' | 'endpoint';

export interface DuplicateResult {
  readonly isDuplicate: boolean;
  readonly kind?: DuplicateKind;
}

// ---------------------------------------------------------------------------
// Add result
// ---------------------------------------------------------------------------

export type AddRemoteReason = 'duplicate' | 'validation' | 'hostkey' | 'abort';

export interface AddRemoteResult {
  readonly saved: boolean;
  readonly reason?: AddRemoteReason;
  readonly message?: string;
  readonly hostkeyFingerprint?: string;
  readonly duplicateKind?: DuplicateKind;
}
