# Design: `tako remote add` — interactive SSH connection wizard

> Change: `add-remote-command` · Store: hybrid · Phase: design · Replicates `system` domain (ADR 0010)

## Technical Approach

Replicate the shipped `system` domain layer split (ADR 0010): `remotes/domain/` (pure types) → `remotes/application/` (ports `RemoteRepository`, `SshConnectionTester`, `SecretVault` + use cases) → `remotes/infrastructure/` (sole `ssh2`/`conf` adapters). The CLI handler composes adapters + use cases and renders the Ink wizard (`@inkjs/ui`). Mandatory hostkey verification is enforced via the `ssh2` `hostVerifier` capture + explicit user accept; no skip flag exists.

## Architecture Decisions

| #   | Decision             | Choice                                                                                                                    | Rejected                                                     | Rationale                                                                                                                                         |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Domain shape         | Replicate `system` (domain→app→infra)                                                                                     | New structure                                                | ADR 0010 names this the replication template; consistency > novelty                                                                               |
| D2  | Error model          | Discriminated-union outcomes in `remotes/domain/types.ts`                                                                 | Shared `Result<T,E>`/`TakoError` kernel (proposal listed it) | `system` ships without Result; introducing it for one domain splits the style. Defer the shared kernel until a 2nd domain crystallizes it (YAGNI) |
| D3  | Hostkey verification | `ssh2` `hostVerifier` captures key → wizard shows SHA256 fingerprint → explicit accept required to save; no flag bypasses | Pre-store known_hosts; TOFU-only                             | Add is always first-seen; capture-from-handshake guarantees the shown print is the real key. MITM risk remains (TOFU) and is documented           |
| D4  | Duplicate detection  | Hard BLOCK (name OR `user@host:port`); no override                                                                        | Proposal's warn-and-override                                 | User decision (prompt 2026-08-10) overrides proposal                                                                                              |
| D5  | Secrets v0           | `SecretVault` port; default `ConfSecretVault` uses `conf` `encryptionKey` (reversible)                                    | OS-keyring/master-passphrase now                             | Isolates the debt; swappable with zero domain changes. MUST NOT say "secure/encrypted"                                                            |
| D6  | Error categories     | Map `ssh2` events → `auth`/`network`/`timeout`/`hostkey`/`unknown`                                                        | Single generic error                                         | Spec requires distinct messages; `readyTimeout:10_000` bounds connects                                                                            |
| D7  | Wizard location      | `tui/features/remotes/add-remote-wizard/`; `cli/commands/remote-add.ts` imports its `runAddRemoteWizard()` entry          | Wizard in `cli/`                                             | Proposal-confirmed. **Flag**: narrow cli→tui import — see Open Questions                                                                          |
| D8  | Exit codes           | save→0; dup/validate-fail/hostkey-decline/abort→1; unexpected throw→2                                                     | —                                                            | Spec requirement #6                                                                                                                               |

## Data Flow

```
tako remote add ──▶ cli/commands/remote-add.ts (compose adapters + use cases)
   │                         │
   │                         ▼
   │              tui/features/.../AddRemoteWizard.tsx (Ink @inkjs/ui state machine)
   │                         │ (collects name,user,host,port,type,cred)
   │              ┌──────────┴──────────┐
   ▼              ▼                     ▼
CheckDuplicateRemote ──▶ ValidateSshConnection ──▶ [hostkey accept prompt]
   │ (RemoteRepository)     │ (SshConnectionTester)        │
   │  block on collision    │  ssh2 connect+auth            │ accept
   │                        │  capture hostkey              ▼
   │                        ▼                          AddRemote.save
   │                 outcome {ok|category}             (SecretVault obfuscate
   │                                              + RemoteRepository persist)
   └────────────────────────────────────────────────────────┘
                          exit code 0/1/2
```

## File Changes

| File                                                                                                         | Action | Purpose                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `src/domains/remotes/domain/types.ts`                                                                        | Create | `Remote`, `RemoteType`, `SshCredentialType`, `RemoteDraft`, `SshValidationOutcome`, `DuplicateResult`, `SshErrorCategory` |
| `src/domains/remotes/domain/endpoint.ts` (+test)                                                             | Create | `toEndpoint(draft): "user@host:port"` helper                                                                              |
| `src/domains/remotes/application/{RemoteRepository,SshConnectionTester,SecretVault}.ts`                      | Create | Port interfaces                                                                                                           |
| `src/domains/remotes/application/{CheckDuplicateRemote,ValidateSshConnection,AddRemote}.ts` (+tests)         | Create | Use cases                                                                                                                 |
| `src/domains/remotes/infrastructure/{ConfSecretVault,ConfRemoteRepository,Ssh2ConnectionTester}.ts` (+tests) | Create | Sole `conf`/`ssh2` consumers                                                                                              |
| `src/cli/commands/remote-add.ts` (+test)                                                                     | Create | Compose, render wizard, map exit codes                                                                                    |
| `src/cli/index.ts`                                                                                           | Modify | Register `remote`→`add` commander subcommand                                                                              |
| `src/tui/features/remotes/add-remote-wizard/{wizard-state.ts,AddRemoteWizard.tsx,run.ts}` (+tests)           | Create | Ink wizard state machine + render entry                                                                                   |
| `package.json`                                                                                               | Modify | Add `@inkjs/ui`                                                                                                           |
| `docs/decisions/0014-remote-add-singular-and-v0-secrets.md`                                                  | Create | ADR: singular name + obfuscation posture + mandatory hostkey + cli→tui exception                                          |
| `docs/commands.md`                                                                                           | Modify | Un-defer wizard; note singular `remote add`                                                                               |

## Interfaces / Contracts

```ts
// ports (application) — application+CLI never import ssh2/conf
interface RemoteRepository {
  existsByName(n: string): Promise<boolean>;
  existsByEndpoint(e: string): Promise<boolean>;
  save(r: Remote): Promise<void>;
}
interface SshConnectionTester {
  test(c: SshTestConfig): Promise<SshValidationOutcome>;
}
interface SecretVault {
  obfuscate(plain: string): string;
  reveal(cipher: string): string;
}
// outcome — discriminated union (no Result<T,E> wrapper)
type SshValidationOutcome =
  | { ok: true; hostkeyFingerprint: string }
  | { ok: false; category: SshErrorCategory; message: string };
type SshErrorCategory = 'auth' | 'network' | 'timeout' | 'hostkey' | 'unknown';
```

## Testing Strategy

| Layer       | What                                                                             | How                                                                                    |
| ----------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Unit        | Use cases (dup-check, validate, add orchestration)                               | vitest + fake ports (existing `CheckHostDependencies.test.ts` pattern)                 |
| Unit        | Adapters (`Conf*`, `Ssh2*`)                                                      | mock `conf`/`ssh2` Client; category mapping + reversible obfuscation proves NOT secure |
| TUI         | Wizard (store/ssh-key branches, fail re-show, hostkey accept/decline, dup block) | `ink-testing-library` + injected fake use cases                                        |
| Integration | Real sshd                                                                        | Deferred to e2e (no ready testcontainers ssh image); manual smoke                      |

## Threat Matrix

N/A — no shell/subprocess/VCS/PR/executable boundary. ssh2 is a pure-JS network client (no `exec`); commander does in-process dispatch. The security boundary (obfuscation weakness + mandatory hostkey) is covered by Security Posture + dedicated RED tests.

## Migration / Rollout

No migration. Additive only — revert deletes `remotes/`, `remote-add.ts`, wizard dir, `@inkjs/ui`, restores `cli/index.ts`. Conf-written remotes stay inert until a future `remote list/use` reads them.

## Open Questions

- [ ] **D7 cli→tui import**: `architecture.md` forbids `cli/*`→`tui/*`; interactive commands need to render a TUI feature. Accept a narrow managed exception (ADR 0014), or move the one-shot wizard into `cli/`? **Recommendation: managed exception.** Flagged for apply-time.
