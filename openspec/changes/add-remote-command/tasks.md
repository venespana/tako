# Tasks: add-remote-command — `tako remote add` wizard

> Strict TDD (RED test → GREEN impl) per `openspec/config.yaml` `apply.tdd:true`. Co-located `*.test.ts(x)`, `bun run test`.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1550 total (prod ~766, test ~790) |
| 800-line budget risk | **HIGH** — total diff ~2× budget |
| Chained PRs recommended | **Yes** (3 slices) |
| Delivery strategy | ask-on-risk — **FLAGGED** |
| Chain strategy | vertical: contract → I/O → presentation |

Decision needed before apply: **Yes** — D7 cli→tui import (managed exception vs wizard-in-cli).
Chained PRs recommended: Yes
400-line budget risk: High (per-PR fits; total exceeds)

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Domain contracts (types, ports, use cases) | PR 1 | `bun run test` | none (pure logic) | Delete `src/domains/remotes/` |
| 2 | Infrastructure adapters (conf + ssh2) | PR 2 | `bun run test` | none (mocked) | Delete `src/domains/remotes/infrastructure/` |
| 3 | CLI command + TUI wizard + ADR + docs | PR 3 | `bun run test` + manual `tako remote add` | local sshd | Delete `src/cli/commands/remote-add.ts`, wizard dir, revert `cli/index.ts`, `@inkjs/ui` |

## Phase 1: Domain Layer (types + endpoint helper)

- [x] 1.1 Create `src/domains/remotes/domain/types.ts` — pure types: `RemoteType='ssh'`; `SshCredentialType='store'|'ssh-key'`; `Remote` `{name, type, username, host, port, credentialType, obfuscatedPassword?, keyPath?}`; `RemoteDraft`; `SshEndpoint=string`; `SshErrorCategory='auth'|'network'|'timeout'|'hostkey'|'unknown'`; `SshValidationOutcome={ok:true;hostkeyFingerprint:string}|{ok:false;category:SshErrorCategory;message:string}`; `DuplicateKind='name'|'endpoint'`; `DuplicateResult={isDuplicate:boolean;kind?:DuplicateKind}`; `AddRemoteResult={saved:boolean;reason?:'duplicate'|'validation'|'hostkey'|'abort'}`
- [x] 1.2 RED: `src/domains/remotes/domain/endpoint.test.ts` — assert `toEndpoint({username:'ops',host:'10.0.0.5',port:22})` → `'ops@10.0.0.5:22'`; non-22 port included; 22 included (explicit)
- [x] 1.3 GREEN: `src/domains/remotes/domain/endpoint.ts` — `toEndpoint(d): \`${d.username}@${d.host}:${d.port}\``

## Phase 2: Port Interfaces (application — no ssh2/conf imports)

- [x] 2.1 Create `src/domains/remotes/application/RemoteRepository.ts` — `interface RemoteRepository { existsByName(name:string):Promise<boolean>; existsByEndpoint(e:string):Promise<boolean>; save(remote:Remote):Promise<void> }`
- [x] 2.2 Create `src/domains/remotes/application/SshConnectionTester.ts` — `interface SshConnectionTester { test(config:SshTestConfig):Promise<SshValidationOutcome> }`; `SshTestConfig` type in `domain/types.ts`
- [x] 2.3 Create `src/domains/remotes/application/SecretVault.ts` — `interface SecretVault { obfuscate(plain:string):string; reveal(cipher:string):string }`

## Phase 3: Use Cases (RED → GREEN)

- [x] 3.1 RED: `src/domains/remotes/application/CheckDuplicateRemote.test.ts` — fake `RemoteRepository`: name-exists → `{isDuplicate:true,kind:'name'}`; endpoint-exists → `{isDuplicate:true,kind:'endpoint'}`; neither → `{isDuplicate:false}`. (5 scenarios: name hit, endpoint hit, both, neither, case sensitivity note)
- [x] 3.2 GREEN: `src/domains/remotes/application/CheckDuplicateRemote.ts` — ctor(repo); `check(draft): Promise<DuplicateResult>`; checks name first then endpoint; returns first collision kind
- [x] 3.3 RED: `src/domains/remotes/application/ValidateSshConnection.test.ts` — fake `SshConnectionTester`: passthrough success outcome (carries hostkeyFingerprint); passthrough failure outcome (carries category+message); never throws (tester rejects → outcome, not exception)
- [x] 3.4 GREEN: `src/domains/remotes/application/ValidateSshConnection.ts` — ctor(tester); `validate(config): Promise<SshValidationOutcome>`; thin orchestrator delegating to tester
- [x] 3.5 RED: `src/domains/remotes/application/AddRemote.test.ts` — fake all 3 ports: (a) duplicate → `{saved:false,reason:'duplicate'}`, no save call, no validate call; (b) validation-fail → `{saved:false,reason:'validation'}`, no save call; (c) valid + accepted → `obfuscate` called with password, `save` called with obfuscated value, `{saved:true}`; (d) hostkey declined → `{saved:false,reason:'hostkey'}`; (e) store-transient (no save-password) → password NOT persisted, `obfuscate` NOT called
- [x] 3.6 GREEN: `src/domains/remotes/application/AddRemote.ts` — ctor(duplicateChecker, validator, vault, repo); `execute(draft, opts:{hostkeyAccepted:boolean}): Promise<AddRemoteResult>`; order: check-duplicate → validate → (hostkey decision is UI; use case trusts `hostkeyAccepted` only after valid outcome) → obfuscate-if-saved → save. Never throws.

## Phase 4: Infrastructure Adapters (sole ssh2/conf consumers)

- [x] 4.1 RED: `src/domains/remotes/infrastructure/ConfSecretVault.test.ts` — mock conf `encryptionKey`; assert `obfuscate('hunter2')` ≠ `'hunter2'`; `reveal(obfuscate(x))===x` (proves reversible = NOT secure); deterministic-ish
- [x] 4.2 GREEN: `src/domains/remotes/infrastructure/ConfSecretVault.ts` — `implements SecretVault`; wraps conf's reversible `encryptionKey` obfuscation
- [x] 4.3 RED: `src/domains/remotes/infrastructure/ConfRemoteRepository.test.ts` — fake conf store (Map); `save(remote)` writes under `remotes.<name>`; `existsByName` reads key; `existsByEndpoint` scans stored remotes for matching `username@host:port`; no shadowing of unrelated keys
- [x] 4.4 GREEN: `src/domains/remotes/infrastructure/ConfRemoteRepository.ts` — `implements RemoteRepository`; conf namespace `remotes`
- [x] 4.5 RED: `src/domains/remotes/infrastructure/Ssh2ConnectionTester.test.ts` — mock ssh2 `Client`: (a) `ready` event with hostkey captured via `hostVerifier` → `{ok:true, hostkeyFingerprint}`; (b) `error` w/ auth msg → `{ok:false,category:'auth'}`; (c) `error` w/ ECONNREFUSED/ENOTFOUND → `category:'network'`; (d) `readyTimeout` → `category:'timeout'`; (e) hostkey SHA256 fingerprint format asserted
- [x] 4.6 GREEN: `src/domains/remotes/infrastructure/Ssh2ConnectionTester.ts` — `implements SshConnectionTester`; `new Client()`, `connect({host,user,port,readyTimeout:10_000,password|privateKey,hostVerifier:capture})`; map events → categories; compute SHA256 base64 fingerprint from captured hostkey buffer; dispose on done

## Phase 5: CLI Handler + Wiring

- [x] 5.1 Create `src/cli/commands/remote-add.ts` — compose `ConfSecretVault`, `ConfRemoteRepository`, `Ssh2ConnectionTester` → use cases → inject into wizard `runAddRemoteWizard()`; map result → exit code (saved→0; duplicate/validation/hostkey/abort→1; caught unexpected→2)
- [x] 5.2 RED+GREEN: `src/cli/commands/remote-add.test.ts` — assert exit-code mapping for each `AddRemoteResult.reason`; unexpected throw → 2
- [x] 5.3 Modify `src/cli/index.ts` — register `program.command('remote').command('add').description('...').action(...)` (commander nesting); keep `doctor` intact

## Phase 6: TUI Wizard (`@inkjs/ui`)

- [x] 6.1 RED: `src/tui/features/remotes/add-remote-wizard/wizard-state.test.ts` — reducer: name→user→host→port(default 22)→type→(store:save-password | ssh-key:keyPath)→validating→hostkey-confirm→done; error re-shows current step with message; abort flag
- [x] 6.2 GREEN: `src/tui/features/remotes/add-remote-wizard/wizard-state.ts` — step union + reducer (pure, testable)
- [x] 6.3 RED: `src/tui/features/remotes/add-remote-wizard/AddRemoteWizard.test.tsx` — `ink-testing-library`: (a) render shows name prompt; (b) store+save-password flow → calls `AddRemote.execute` with obfuscatable password; (c) ssh-key flow → passes keyPath; (d) validation-fail → form re-shown with category message, no save; (e) hostkey → fingerprint shown, accept→save / decline→abort; (f) duplicate → block message, stays in form; (g) password never in rendered output
- [x] 6.4 GREEN: `src/tui/features/remotes/add-remote-wizard/AddRemoteWizard.tsx` — Ink component using `@inkjs/ui` (TextInput, SelectInput, Spinner, StatusMessage); injected use cases (DI); state from reducer
- [x] 6.5 Create `src/tui/features/remotes/add-remote-wizard/run.ts` — `runAddRemoteWizard(deps): Promise<AddRemoteResult>`; `render(<AddRemoteWizard .../>)`, await completion, `unmount()`

## Phase 7: Dependency + Docs

- [x] 7.1 `package.json` — add `@inkjs/ui` (latest compatible w/ ink 7); `bun install`
- [x] 7.2 Create `docs/decisions/0014-remote-add-singular-and-v0-secrets.md` — ADR (Status: Accepted): (1) singular `remote add` vs closed-contract plural `remotes` + name in-form; (2) conf obfuscation = v0, NOT encryption, debt behind `SecretVault`; (3) mandatory hostkey verification (TOFU-on-add); (4) cli→tui managed exception for interactive commands
- [x] 7.3 Modify `docs/commands.md` — un-defer "Wizard UX of `remotes add`"; note singular `tako remote add` with in-form name; cross-ref ADR 0014
- [x] 7.4 Update `docs/decisions/README.md` — append ADR 0014 to list
- [x] 7.5 Gate: `bun run test && bun run typecheck && bun run lint && bun run build` all green; confirm no `ssh2`/`conf` imports outside `remotes/infrastructure/`

## Coverage Map (spec requirement → task)

| Spec requirement | Tasks |
|------------------|-------|
| Wizard invocation | 5.1, 5.3, 6.3, 6.4 |
| Field & credential collection | 6.1–6.4 |
| Pre-save SSH validation + error recovery | 3.3–3.4, 4.5–4.6, 6.3 (fail re-show) |
| Mandatory hostkey verification | 4.5–4.6 (capture), 3.5–3.6 (accept gate), 6.3 (fingerprint UI) |
| Duplicate detection (block) | 1.2–1.3, 3.1–3.2, 3.5–3.6, 6.3 |
| Exit codes | 5.1–5.2 |
| Password hygiene & persistence | 1.1, 2.3, 3.5–3.6, 4.1–4.2, 6.3 (never logged) |
| Port/adapter isolation | 2.1–2.3, 4.x, 7.5 (gate) |
