// services/remotes.ts — in-process API over the remotes domain (ADR-0019).
//
// The server side of the server/clients model for remote connections: the
// conf triple (createConfStore + ConfRemoteRepository + ConfSecretVault) and
// the unified remote→connection-auth resolution are written ONCE here as
// private wiring. Frontends (cli, tui) import these functions; they never
// compose the adapters themselves, and the public surface carries zero
// infrastructure types.
import { AddRemote } from '../domains/remotes/application/AddRemote.js';
import { CheckDuplicateRemote } from '../domains/remotes/application/CheckDuplicateRemote.js';
import type { RemoteRepository } from '../domains/remotes/application/RemoteRepository.js';
import type { SecretVault } from '../domains/remotes/application/SecretVault.js';
import type { SshConnectionTester } from '../domains/remotes/application/SshConnectionTester.js';
import { ValidateSshConnection } from '../domains/remotes/application/ValidateSshConnection.js';
import type {
  AddRemoteResult,
  Remote,
  RemoteDraft,
  RemoteSummary,
  SshTestConfig,
  SshValidationOutcome,
} from '../domains/remotes/domain/types.js';
import { ConfRemoteRepository } from '../domains/remotes/infrastructure/ConfRemoteRepository.js';
import { ConfSecretVault } from '../domains/remotes/infrastructure/ConfSecretVault.js';
import { createConfStore } from '../domains/remotes/infrastructure/createConfStore.js';
import { Ssh2ConnectionTester } from '../domains/remotes/infrastructure/Ssh2ConnectionTester.js';

// ---------------------------------------------------------------------------
// Contract types re-exported for the frontends (they stop importing domains)
// ---------------------------------------------------------------------------

export type {
  AddRemoteResult,
  Remote,
  RemoteDraft,
  RemoteSummary,
  SshCredentialType,
  SshTestConfig,
  SshValidationOutcome,
} from '../domains/remotes/domain/types.js';
export { requiresConnectPrompt } from '../domains/remotes/domain/normalize.js';

// ---------------------------------------------------------------------------
// Connection auth (the unified remote → connection-material resolution)
// ---------------------------------------------------------------------------

/** Connection material for one managed host (client-agnostic shape). */
export type AgentConnectionAuth =
  { readonly type: 'password'; readonly password: string } | { readonly type: 'key'; readonly keyPath: string };

/** Outcome of mapping a configured remote to connection auth (refusal-object style: expected outcomes never throw). */
export type RemoteAuthDecision =
  | { readonly kind: 'resolved'; readonly auth: AgentConnectionAuth }
  | { readonly kind: 'refusal'; readonly reason: string };

/**
 * Map a configured remote to connection auth. Interactive remotes resolve
 * ONLY with a session password: the TUI captures it at remote activation,
 * terminal runs supply it via `TAKO_SSH_PASSWORD` (env only, never argv);
 * without one the remote is REFUSED, because a password-less run cannot
 * prompt. This is the single auth decision for both clients (ADR-0019 §2).
 */
export function decideRemoteAuth(
  remoteName: string,
  remote: Pick<Remote, 'credentialType' | 'keyPath' | 'obfuscatedPassword'>,
  sessionPassword: string | undefined,
  revealSecret: (obfuscated: string) => string
): RemoteAuthDecision {
  switch (remote.credentialType) {
    case 'ssh-key':
      return { kind: 'resolved', auth: { type: 'key', keyPath: remote.keyPath ?? '' } };
    case 'interactive':
      if (sessionPassword === undefined || sessionPassword === '') {
        return {
          kind: 'refusal',
          reason:
            `remote "${remoteName}" uses interactive credentials — this run has no session password; ` +
            're-select it in the TUI to enter the password, or supply TAKO_SSH_PASSWORD for terminal runs',
        };
      }
      return { kind: 'resolved', auth: { type: 'password', password: sessionPassword } };
    case 'store':
      return {
        kind: 'resolved',
        auth: { type: 'password', password: revealSecret(remote.obfuscatedPassword ?? '') },
      };
  }
}

/** Resolution of one configured remote into connection material (refusal-object style). */
export type RemoteAuthResolution =
  | { readonly kind: 'resolved'; readonly remote: Remote; readonly auth: AgentConnectionAuth }
  | { readonly kind: 'unknown-remote'; readonly reason: string }
  | { readonly kind: 'refusal'; readonly reason: string };

/**
 * Resolve a configured remote FRESH on every call (credentials may change
 * mid-session) into connection material, through the single conf triple.
 * Interactive remotes need a session password (see decideRemoteAuth); the
 * password is consumed for this run only and never printed.
 */
export async function resolveRemoteAuth(
  remoteName: string,
  sessionPassword: string | undefined
): Promise<RemoteAuthResolution> {
  const remote = await getRemoteByName(remoteName);
  if (remote === null) {
    return { kind: 'unknown-remote', reason: `unknown remote "${remoteName}" — add it first with "tako remote add"` };
  }
  const { vault } = openRemotesStorage();
  const decision = decideRemoteAuth(remoteName, remote, sessionPassword, cipher => vault.reveal(cipher));
  if (decision.kind === 'refusal') {
    return { kind: 'refusal', reason: decision.reason };
  }
  return { kind: 'resolved', remote, auth: decision.auth };
}

// ---------------------------------------------------------------------------
// Private wiring (written once — the conf triple)
// ---------------------------------------------------------------------------

/** The conf-backed remotes storage, built in ONE place (ADR-0019 §2). */
function openRemotesStorage(): { readonly repository: RemoteRepository; readonly vault: SecretVault } {
  const confStore = createConfStore();
  return { repository: new ConfRemoteRepository(confStore), vault: new ConfSecretVault(confStore) };
}

async function getRemoteByName(name: string): Promise<Remote | null> {
  const { repository } = openRemotesStorage();
  return repository.getByName(name);
}

// ---------------------------------------------------------------------------
// Read model + connection validation (both clients)
// ---------------------------------------------------------------------------

/** The configured remotes, ready for listing UIs (no credentials leak). */
export async function listRemotes(): Promise<RemoteSummary[]> {
  const { repository } = openRemotesStorage();
  return repository.list();
}

/** One configured remote by name, or null when unknown (fresh per call). */
export async function getRemote(name: string): Promise<Remote | null> {
  return getRemoteByName(name);
}

/** Validate one SSH connect attempt with candidate credentials (never throws an outcome). */
export async function testSshConnection(config: SshTestConfig): Promise<SshValidationOutcome> {
  const tester: SshConnectionTester = new Ssh2ConnectionTester();
  return tester.test(config);
}

// ---------------------------------------------------------------------------
// Add flow (ADR-0020: the CLI drives it flags/stdin; the TUI renders it)
// ---------------------------------------------------------------------------

/** Request to add one remote: the collected draft plus the hostkey gate. */
export interface AddRemoteRequest {
  readonly draft: RemoteDraft;
  /** The hostkey gate: false → an unknown host returns a `hostkey` refusal carrying the fingerprint. */
  readonly hostkeyAccepted: boolean;
}

/**
 * Validate and (when the hostkey is accepted) persist a new remote over the
 * real conf-backed adapters — wiring written once. Never throws; the
 * `hostkey` refusal is an expected round-trip: the client collects the
 * confirmation (TUI widget or CLI flag/stdin line) and finishes with
 * `confirmAddRemote`, which persists WITHOUT re-validating SSH.
 */
export async function addRemote(request: AddRemoteRequest): Promise<AddRemoteResult> {
  return addRemoteUseCase().execute(request.draft, { hostkeyAccepted: request.hostkeyAccepted });
}

/** Persist a VALIDATED draft after an explicit hostkey acceptance (duplicate re-check only). */
export async function confirmAddRemote(draft: RemoteDraft): Promise<AddRemoteResult> {
  return addRemoteUseCase().save(draft);
}

/** The add-remote use cases over the real adapters — the wiring, written once (ADR-0019 §2). */
function addRemoteUseCase(): AddRemote {
  const tester: SshConnectionTester = new Ssh2ConnectionTester();
  const { repository: repo, vault } = openRemotesStorage();
  return new AddRemote(new CheckDuplicateRemote(repo), new ValidateSshConnection(tester), vault, repo);
}
