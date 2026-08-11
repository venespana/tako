# Exploration: `tako remotes add` — interactive SSH connection wizard

> Change name: `add-remote-command` · Artifact store: hybrid (Engram + OpenSpec) · Phase: explore

## Current State

`tako` is a TUI for managing docker-compose homelabs over SSH. The repo is scaffolded and exactly **one** command is implemented (`tako doctor` — local host dependency check). Relevant facts:

- **Stack (package.json reality vs docs):** TS 6 strict, Bun runtime, `ink@7.1.1` + `react@19.2.8`, `ssh2@1.17.0`, `conf@15.1.0`, `picocolors@1.1.1`, `commander@15`. `ink-testing-library@4` + `testcontainers@12` in devDeps.
- **Architecture:** FSD (TUI) + Clean Arch (domains) + shared kernel. Strict rules: `shared→none`, `domains→shared`, `cli/tui→domains+shared`. tui↔cli imports forbidden; domains know no presentation.
- **Reference domain:** `src/domains/system/` (`doctor`) is the only fully worked Clean-Arch template: `domain/types.ts` + `domain/required-tools.ts` (constants) → `application/<Port>.ts` + `application/<UseCase>.ts` (port injected via ctor, `Promise.all`, never throws) → `infrastructure/<Adapter>.ts` (sole external-API consumer). `application` never imports `child_process`/`Bun.spawn`.
- **CLI:** `commander.js` in `src/cli/index.ts`; thin handlers in `src/cli/commands/` parse argv, wire adapter→use case→pure formatter, derive exit code.
- **TUI:** scaffolded only — every `src/tui/{app,pages,widgets,features,entities,shared}` dir is a `.gitkeep`. **No Ink component library installed**: `@inkjs/ui`, `ink-text-input`, `ink-select-input`, `ink-spinner` are all absent despite `docs/stack.md` listing them.
- **Shared kernel:** all of `src/shared/{lib,types,errors,ui}` are `.gitkeep` only.
- **SDD:** hybrid persistence (Engram + OpenSpec), strict TDD, `pace=auto`. Prior change `add-doctor-command` is the folder template (`proposal.md`, `design.md`, `tasks.md`, `specs/<capability>/spec.md`).
- **Closed CLI contract (`docs/commands.md`):** `tako remotes <add|list|rm|use|test>`. Three connection types: `local` (no connection), `ssh user@host + password`, `ssh user@host + path to private key`. "Credential storage with a secure format." **`remotes add` wizard UX and the secrets-storage format are explicitly listed under "Deferrable (does not block MVP)".**

### How the pieces fit (technical)

- **Ink forms (Ink 7):** `useInput(input, key)` for keystrokes; `useFocus()`/`useFocusManager()` (`focus(id)`, `focusNext()`, `focusPrevious()`) for field navigation; `useState` for form state. No wizard primitive in core Ink — `ink-stepper` (`/archcorsair/ink-stepper`) exists externally but is not installed. A small `<Wizard step={n}>` switch over `useState` is trivial.
- **ssh2 (1.17):** `new Client()` → `client.connect({host, port, username, password | privateKey, passphrase?, readyTimeout})`. Emit `ready` (auth ok) / `error`. Wrap in a Promise: on `ready` → `client.end()` + resolve success; on `error` → reject with mapped cause. `readyTimeout` default 20 s.
- **conf (15.1):** `new Conf({projectName:'tako', schema})` → writes `~/.config/tako/nodejs/config.json` (XDG), atomic writes, JSON-Schema validation via `ajv`. **`encryptionKey`/`encryptionAlgorithm` exist (aes-256-cbc/gcm/ctr) but the readme states verbatim: "not intended for security purposes … main use is for obscurity."** Real secrets need `crypto + master passphrase` (per `docs/stack.md`).

## Affected Areas

- `src/domains/remotes/{domain,application,infrastructure}/` — **new** domain (replicate `system`). Ports: `RemoteRepository`, `SshConnectionTester`, and (if Approach A/C) `SecretVault`.
- `src/domains/secrets/{domain,application,infrastructure}/` — **new** domain only under Approach A (master-passphrase AES vault). Under C it is a deferred follow-up behind a port.
- `src/cli/index.ts` + `src/cli/commands/remotes-add.ts` — **modify/new**: route `tako remotes add` and render the Ink wizard (CLI presentation hosts the TUI for this subcommand — same Ink `render()` entry as the default TUI).
- `src/tui/features/remotes/add-remote-wizard/` — **new**: multi-step Ink form (uses `useInput`/`useFocus` or `@inkjs/ui` TextInput/Select).
- `src/shared/{lib,types,errors}/` — likely **new**: `Result`/`Maybe` types, `TakoError` subclasses (`RemoteExistsError`, `SshValidationError`, `SecretVaultError`), since these are still empty.
- `package.json` — **modify** if adding `@inkjs/ui` (Approach A/C).
- `docs/commands.md`, `docs/decisions/0014-*.md` — **new ADR** required: un-deferring `remotes add` wizard + secrets posture decision.
- `docs/stack.md` — **tension**: lists Ink 5 / React 18 and `ink-text-input` etc.; reality is Ink 7 / React 19 and no UI lib. Pre-existing inconsistency to note (not necessarily fix here).

## Approaches

### 1. Full Clean Arch — `remotes` + `secrets` domains, master-passphrase crypto, `@inkjs/ui`

New `remotes` domain **and** new `secrets` domain (master-passphrase AES vault via Node `crypto`). Use cases `AddRemote`, `ValidateSshConnection`, `CheckDuplicateRemote`. Ports `RemoteRepository` (conf-backed) + `SecretVault` (crypto-backed) + `SshConnectionTester` (ssh2-backed). Wizard built with `@inkjs/ui` TextInput/Select.

- **Pros:** Architecturally complete; secrets genuinely secure (matches `docs/stack.md`); honors closed command contract; the `remotes` + `secrets` domains are reusable for the remaining `remotes <list|rm|use|test>` subcommands and for future `secrets` consumers.
- **Cons:** Largest scope (2 domains + new dep + master-passphrase UX: prompt-on-first-use, change-passphrase, re-encrypt on rotation); un-defers **two** explicitly-deferred items; wizard UX itself was deferred.
- **Effort:** **High.** Likely >800 review-line budget → would need chaining.

### 2. Minimal — single `remotes` domain, conf-obfuscated secrets for v0, raw Ink hooks

One `remotes` domain. `RemoteRepository` port backed by conf with `encryptionKey` (obfuscation). Ink forms built with raw `useInput`/`useFocus` (no new deps). No `secrets` domain.

- **Pros:** Smallest scope; ships fastest; zero new deps; no master-passphrase UX.
- **Cons:** Secrets are **obfuscation-only** — conf readme explicitly says "not for security"; must be called out to the user and tracked as debt; raw Ink form code is verbose (text input, select, validation rendering all hand-rolled); defers the real secrets decision.
- **Effort:** **Medium.**

### 3. Hybrid (recommended) — `remotes` domain now, `SecretVault` port abstracted, conf-obfuscated default adapter, master-passphrase adapter later

`remotes` domain defines `RemoteRepository`, `SshConnectionTester`, **and** `SecretVault` ports. Default infrastructure adapter for `SecretVault` = conf `encryptionKey` (obfuscated), explicitly documented as a placeholder. A follow-up `secrets`-domain change swaps the adapter for master-passphrase AES (per `docs/stack.md`) **with zero domain/use-case changes**. Wizard uses `@inkjs/ui` (TextInput/Select/Spinner).

- **Pros:** Architecturally honest — the deferred "master passphrase vs OS keyring" decision stays isolated behind a port interface; ships the wizard now; secrets debt is bounded and explicit; honors Clean-Arch "application declares ports, infrastructure implements adapters"; reuses the pattern for `list/rm/use/test`.
- **Cons:** Still adds `@inkjs/ui`; still un-defers the wizard-UX decision; secrets are obfuscation-only until the follow-up lands (must be communicated honestly to the user and in the UI).
- **Effort:** **Medium-High.** Likely within the 800-line budget as a single PR.

## Recommendation

**Approach 3 (Hybrid).** It respects the closed `remotes add` contract, uses the existing port/adapter pattern so the genuinely-hard secrets decision (master passphrase vs OS keyring) is deferred cleanly behind `SecretVault`, ships the interactive wizard the user wants, and is honest about the v0 security posture. **Before the proposal is written, three decisions must be confirmed with the user** (see "Ready for Proposal").

Suggested capability for `sdd-spec`: `remote-connection-management` (delta spec; requirements: interactive collection, SSH pre-save validation, duplicate detection, conditional password storage, atomic persistence).

## Risks

- **OpenSpec rule:** "do not invent new commands without a decision record" — `remotes add` is in the closed contract but its **wizard UX** and **secrets format** are explicitly deferred; un-defering needs an ADR (`docs/decisions/0014-*.md`) noting the pull-forward.
- **Security theatre:** conf `encryptionKey` is obfuscation, not encryption. Secrets at rest are recoverable by anyone who reads the compiled binary. **Must not be advertised as secure** in UI or docs until the master-passphrase adapter lands.
- **hostkey verification:** ssh2 does **not** verify host keys by default. TOFU policy decision required (store on first connect? prompt user? warn-only?). Not in the user's requirements — needs a decision.
- **ssh2 failure modes:** auth-fail vs network-unreachable vs hostkey-mismatch vs `readyTimeout` must be mapped to distinct, actionable wizard messages; otherwise the "show form again on failure" loop is hostile. Recommend `readyTimeout: 10_000` (shorter than the 20 s default) for an interactive form.
- **Bun vs Node 20+ compat:** `docs/stack.md` forbids Bun-only APIs, but `LocalHostToolChecker` already uses `Bun.spawn` (pre-existing tension documented in `add-doctor-command/design.md`). ssh2/conf/Ink are all Node-native so `remotes add` itself is clean, but the broader stack.md reconciliation is overdue.
- **In-memory secret lifetime:** the password field lives in React state during the form; ensure it is never logged and the wizard unmount clears state. Low risk but worth a rule.
- **Duplicate-detection policy:** "same name OR same user@host → warn." Edge case: two connections to the same host as different users (legitimate). Policy should be warn-and-allow-override, not hard block.
- **Scope creep into `list/rm/use/test`:** this change is `add` only. Resist wiring the other subcommands beyond shared-domain reuse.

## Ready for Proposal

**Yes — conditionally.** Approach 3 is sound and the closed contract permits it. Three closed decisions are needed from the user first:

1. **Command name:** closed contract is `tako remotes add` (plural). User wrote `tako remote add`. Confirm plural.
2. **`local` connection type:** contract lists three types (`local`, `ssh+password`, `ssh+key`); user requirements cover only the two SSH types. Include `local` now or SSH-only this iteration?
3. **Secrets posture:** accept conf-obfuscation for v0 (Approach 3, recommended) **or** block on master-passphrase crypto now (Approach 1)?

Plus one lower-stakes call: add `@inkjs/ui` (recommended) vs build primitives from raw Ink hooks.
