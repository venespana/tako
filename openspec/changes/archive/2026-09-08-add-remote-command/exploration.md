# Exploration: Host trust verification & SSH prompt relaying in `tako remote add`

> Change name: `add-remote-command` · Artifact store: openspec · Phase: explore (v2)
> Supersedes the v1 exploration (wizard scope — implemented & merged in PR #2; v1 preserved in git history). This v2 covers the scope evolution: **determine host-verification need before testing, show "do you trust this host?", and relay prompts arriving mid-SSH-process**.

## Topic

After the user enters connection data (username, host, port [optional], credentials), the system must decide whether the host needs user verification **before testing the connection**; for first-seen hosts, show the "do you trust this host?" prompt, and relay any terminal prompts emitted by the in-flight SSH connection process (hostkey confirmation, keyboard-interactive auth).

## Current State

The wizard change is **implemented and merged** (PR #2, `0d5a15f`); all tasks in `tasks.md` are `[x]`. No `verify-report.md`, no `state.yaml`, not archived (`openspec/specs/` has no `remote-connection-management` main spec yet). Current hostkey flow:

1. Wizard steps live in `src/tui/features/remotes/add-remote-wizard/model/wizard-store.ts` (Zustand, not the reducer design.md sketched): `name → user → host → port → type → (save-password→password | key-path) → validating → hostkey-confirm → done`.
2. On `validating`, `use-add-remote-wizard.ts` calls `AddRemote.execute(draft, { hostkeyAccepted: false })` — a **probe pass**.
3. `Ssh2ConnectionTester.test()` (`infrastructure/Ssh2ConnectionTester.ts`) registers `hostVerifier: (key, verify) => { captureFingerprint(key); verify(true); }` — it **auto-accepts the hostkey**, so KEX *and authentication complete* (credentials are transmitted), then `ready` resolves `{ok:true, hostkeyFingerprint}`.
4. `execute` returns `{saved:false, reason:'hostkey', hostkeyFingerprint}`; the hook maps it to `validationSuccess(fp, false)` → step `hostkey-confirm` renders "Unknown host — verify fingerprint / Do you accept this hostkey?" (`ConfirmInput`).
5. Accept → `done` → hook calls `AddRemote.save(draft)` (duplicate re-check + persist, **no re-connection**). Decline → `aborted` → exit 1.

### Gaps against the requested feature

| Requirement clause | Current behavior | Gap |
| --- | --- | --- |
| Decide verification need **before** testing | No known-host store exists at all. `validationSuccess(fp, isKnownHost)` takes an `isKnownHost` flag, but it is wired to the save-result, not to any hostkey database — the `isKnownHost=true` branch is effectively dead code. Every validation ends in the trust prompt; accepted fingerprints are **never persisted** (nothing for a future `remote test` / re-add to verify against). | Need a `HostKeyStore` (TOFU) port + adapter. |
| "Do you trust this host?" **before/while** testing | Prompt exists but fires **after** the connection authenticated. ssh2 guarantees `hostVerifier` runs during KEX **before auth** — deferring `verify()` until the user answers would gate credential transmission on trust (OpenSSH semantics). Today the password/key is sent to an **unverified** host before the question is asked. | Relay the verifier decision into the UI instead of auto-accepting. |
| **Relay prompts from the SSH process** | Nothing is relayed. (a) `keyboard-interactive` auth event is unhandled — servers offering only keyboard-interactive (PAM default) fail as category `auth` despite a correct password; ssh2 needs `tryKeyboard:true` + a `finish(answers)` handler. (b) Encrypted private keys without passphrase error out (spec defers passphrase keys). (c) `change password` event unhandled. | Interactive channel between the in-flight connection and the wizard. |

### Verified ssh2 facts (docs, v1.17)

- `hostVerifier(key, verify)`: connection stalls until `verify(true/false)`; runs **during handshake, before authentication** → safe trust gate for credentials.
- `keyboard-interactive(name, instructions, instructionsLang, prompts, finish)`: `prompts: {prompt, echo}[]`; answers via `finish(string[])`; **server may re-ask** (2FA); `finish` must always be called. `tryKeyboard: true` enables fallback after plain `password` fails.
- `readyTimeout` bounds the whole handshake **including** the stalled verifier — a user reading a fingerprint for >10 s would trip the current 10 s timeout once the verifier becomes interactive (see Risks).
- Adapter is test-friendly: `Ssh2ConnectionTester` takes an injectable `createClient` factory; tests fake `once/connect/end` and can capture `connectConfig.hostVerifier` directly.

## Affected Areas

- `src/domains/remotes/domain/types.ts` — **modify**: hostkey state on `SshValidationOutcome` (e.g. `hostkey: 'first-seen' | 'known'`), `HostKeyRecord`, possibly prompt/relay types.
- `src/domains/remotes/application/SshConnectionTester.ts` — **modify** (port): `test(config, handlers?)` where handlers = `onHostkeyPrompt(fingerprint): Promise<boolean>`, `onKeyboardInteractive(name, instructions, prompts): Promise<string[]>`.
- `src/domains/remotes/application/HostKeyStore.ts` — **new port**: `get(host,port)`, `put(host,port,fingerprint)`.
- `src/domains/remotes/application/{ValidateSshConnection,AddRemote}.ts` — **modify**: thread handlers; with mid-test prompting, the probe-pass/`hostkeyAccepted:false` + `save()` split can collapse into one `execute` pass.
- `src/domains/remotes/infrastructure/Ssh2ConnectionTester.ts` — **modify**: relay `hostVerifier`, wire `tryKeyboard` + `keyboard-interactive`, pause/extend `readyTimeout` while a prompt is pending.
- `src/domains/remotes/infrastructure/ConfHostKeyStore.ts` — **new adapter** (conf `knownHosts` namespace).
- `src/tui/features/remotes/add-remote-wizard/model/{wizard-store.ts,use-add-remote-wizard.ts}` — **modify**: pending-prompt state + resolver plumbing (hostkey confirm AND keyboard-interactive prompts reuse one mechanism); hostkey-**mismatch** becomes a terminal block, not a confirm step.
- `src/tui/features/remotes/add-remote-wizard/ui/AddRemoteWizard.tsx` — **modify**: OpenSSH-style "authenticity … can't be established — do you trust this host?" wording; prompt-relay step (`PasswordInput` when `echo:false`, `TextInput` otherwise); mismatch error screen.
- `src/cli/commands/remote-add.ts` — **modify**: compose `ConfHostKeyStore`.
- `openspec/changes/add-remote-command/specs/remote-connection-management/spec.md` — **modify**: "Mandatory SSH Hostkey Verification" requirement changes semantics (pre-auth prompt + TOFU persistence); remove Out-of-Scope line "Re-verification of a previously stored hostkey"; add prompt-relay requirement; extend Port/Adapter isolation with `HostKeyStore`.
- `design.md` (D3), `tasks.md` — **modify**: new phases; D3 rationale updates (capture-then-confirm → verify-before-auth + TOFU store). ADR 0014 mentions mandatory hostkey — amend or add ADR 0015 note.

## Approaches

### 1. Minimal — pre-connect known-host gate, keep post-auth confirm

Add `HostKeyStore`; before `validating`, check it: known+match → skip prompt; mismatch → block; unknown → existing post-test `hostkey-confirm`; on accept persist fingerprint. Port `test()` stays one-shot.

- **Pros:** Smallest diff; no port redesign; no async bridge; tests stay simple.
- **Cons:** Credentials still transmitted **before** the trust question (MITM window remains — the core security gap); does not relay any prompts (keyboard-interactive still fails); only partially satisfies "before testing".
- **Effort:** Low.

### 2. Interactive relay — handler-based `test()` + TOFU store (recommended)

`test(config, handlers)`; adapter's `hostVerifier` computes the fingerprint, consults `HostKeyStore`: match → `verify(true)` silently; mismatch → `verify(false)` → outcome category `hostkey` with a MITM-specific message; unknown → `await handlers.onHostkeyPrompt(fingerprint)` and `verify(answer)` — **auth only proceeds after acceptance**; on accept, persist to the store. `keyboard-interactive` is relayed through `handlers.onKeyboardInteractive` and answered via `finish`. The wizard store gains a generic pending-prompt state (fingerprint confirm or echo/hidden input) resolved by UI actions. Probe-pass/`save()` split collapses into one `execute`.

- **Pros:** OpenSSH-like semantics (trust gates credential transmission); satisfies all three requirement clauses; single connection (no double KEX, no fail2ban pressure); one mechanism generalizes to future prompts (key passphrase, change-password); kills the `hostkeyAccepted` two-pass wart.
- **Cons:** Port signature ripples through `ValidateSshConnection`/`AddRemote` + their fake-based tests (mechanical); async bridge ssh2-callback ↔ Zustand/Ink needs careful abort/timeout handling; `readyTimeout` must not fire while the user thinks (see Risks).
- **Effort:** Medium.

### 3. Two-phase connect — probe KEX without auth, then full connect

Phase A connects with dummy/`none` auth purely to capture the hostkey (end() after handshake); prompt; Phase B connects with real credentials.

- **Pros:** Keeps one-shot port; no callback bridging.
- **Cons:** Two TCP+KEX round trips (rate limits/fail2ban); fragile auth dance; still cannot relay keyboard-interactive; hostkey shown is from a *different* connection than the authenticated one (re-MITM window between phases).
- **Effort:** Medium.

## Recommendation

**Approach 2** (it necessarily includes Approach 1's `HostKeyStore`). It is the only option that honors the requirement's ordering ("validate … before testing", prompt relay), closes the credential-before-trust window, and removes the probe/save two-pass complexity. Open questions for the user are listed under "Ready for Proposal".

## Risks

- **`readyTimeout` vs pending prompt (discovered):** the current 10 s timeout bounds the handshake *including* a stalled interactive verifier — a user reading a fingerprint can time the connection out. Mitigation: extend `readyTimeout` when interactive (e.g. 120 s), pause/reset it per prompt, or map timeout-during-prompt to cancel-and-retry rather than a hard failure.
- **Abort/cancel hygiene:** wizard abort (Ctrl+C / decline) while `hostVerifier` or `keyboard-interactive` is pending MUST still call `verify(false)`/`finish([])` and `client.end()` — otherwise ssh2 hangs and `runAddRemoteWizard`'s Promise never resolves.
- **Keyboard-interactive multi-round:** server may re-ask (2FA/OOTP); the prompt step must loop, and answers must never be logged (spec password-hygiene rule extends here).
- **TOFU limitation:** first connect can always be MITM'd (inherent to TOFU) — must stay documented (ADR). Mismatch on a stored host = hard block, consistent with D4's no-override philosophy; no bypass flag (spec's "no skip" scenario is preserved and strengthened).
- **HostKeyStore location:** conf `knownHosts` namespace (recommended, self-contained) vs `~/.ssh/known_hosts` interop (hashed entries, markers, `@cert-authority` — real scope; defer).
- **Test churn:** port change breaks existing fake-based tests in `application/` (update is mechanical but touches ~4 suites); `Ssh2ConnectionTester.test.ts` must simulate a stalled verifier + timeout interaction.
- **State-machine edge:** `errorStepForCategory('hostkey')` currently maps to `hostkey-confirm` — with the new flow a hostkey failure means *mismatch* (terminal block), not a confirmation; needs a distinct step/error state.
- **Review budget:** config sets `review_budget_lines: 800`; this delta (port + adapter + store + TUI prompt UI + test updates) plausibly fits one PR but should be forecast in `tasks.md` (delivery_strategy `ask-on-risk`).

## Ready for Proposal

**Yes — conditionally.** Approach 2 is sound and buildable on the existing port/adapter seams. Decisions needed from the user:

1. **Known host on re-add:** skip the prompt silently (recommended — show an info line "known host, fingerprint unchanged") vs. always re-confirm?
2. **Keyboard-interactive depth:** full prompt relay as specified (recommended, per the requirement wording) vs. minimal `tryKeyboard` auto-answer with the stored password only?
3. **HostKeyStore location:** conf `knownHosts` namespace (recommended) vs `~/.ssh/known_hosts` interop (defer)?
4. Confirm **mismatch = hard block, no override** (aligns with existing D4 block philosophy).
