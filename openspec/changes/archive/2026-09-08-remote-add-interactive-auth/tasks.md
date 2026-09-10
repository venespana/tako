# Tasks: remote-add-interactive-auth

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 350–500 |
| 400-line budget risk | Low (800-line budget per config) |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Full feature | PR 1 | `bun run test -- --run src/domains/remotes` | `tako remote add` + `tako` menu | Revert merge — no persistent migration |

## Phase 1: Domain Foundation

- [x] 1.1 In `src/domains/remotes/domain/types.ts`: widen `SshCredentialType` to `'store' | 'ssh-key' | 'interactive'`; remove `savePassword` from `RemoteDraft`; update `Remote` doc invariants (obfuscatedPassword iff store; interactive carries no secret fields) *(savePassword removed from RemoteDraft during 2.7 GREEN — last consumers updated in same stroke)*
- [x] 1.2 RED: Write `normalize.test.ts` for `normalizeRemote` (store+no-password → interactive) and `requiresConnectPrompt` (interactive → true)
- [x] 1.3 GREEN: Create `src/domains/remotes/domain/normalize.ts` exporting `normalizeRemote` and `requiresConnectPrompt`
- [x] 1.4 REFACTOR: Move `normalize.ts` test alongside implementation (co-located *.test.ts)

## Phase 2: Application & Infrastructure

- [x] 2.1 In `src/domains/remotes/application/RemoteRepository.ts`: add `getByName(name: string): Promise<Remote | null>` port — null is distinct not-found; document no throws
- [x] 2.2 In `src/domains/remotes/infrastructure/ConfRemoteRepository.ts`: implement `getByName` — `conf.get('remotes.<name>')` → `normalizeRemote(...) ?? null`; no changes to `save()` or `list()`
- [x] 2.3 RED: Extend `ConfRemoteRepository.test.ts` — getByName found, getByName not-found, legacy store-without-password normalizes to interactive, persisted bytes unchanged
- [x] 2.4 GREEN: Implement `getByName` in ConfRemoteRepository
- [x] 2.5 In `src/domains/remotes/application/AddRemote.ts`: update auth dispatch — `ssh-key → key auth`; `store`/`interactive → password auth`; gate obfuscation `credentialType === 'store' && password !== undefined`; `interactive` persists no obfuscatedPassword/keyPath
- [x] 2.6 RED: Extend `AddRemote.test.ts` — interactive validates with password auth, persists no secret, vault never called for interactive
- [x] 2.7 GREEN: Apply auth dispatch changes in AddRemote

## Phase 3: Wizard

- [x] 3.1 In `src/tui/features/remotes/add-remote-wizard/model/wizard-store.ts`: delete step `'save-password'`, `WizardData.savePassword`, action `setSavePassword`; update `setType` routing — `ssh-key → 'key-path'`; `store`/`interactive → 'password'`
- [x] 3.2 In `src/tui/features/remotes/add-remote-wizard/model/use-add-remote-wizard.ts`: update `buildDraft` — include `password` for `store` and `interactive`; include `keyPath` for `ssh-key`; remove `savePassword` from draft
- [x] 3.3 In `src/tui/features/remotes/add-remote-wizard/ui/AddRemoteWizard.tsx`: delete `SavePasswordStep`; update `TypeStep` to exactly three options (Store password (obfuscated) / SSH key / Ask every session — never stored); `PasswordStep` gains `validateOnly` prop for interactive copy
- [x] 3.4 RED: Extend `wizard-store.test.ts` — no save-password step; store+interactive route to password step; ssh-key routes to key-path
- [x] 3.5 GREEN: Apply wizard-store changes
- [x] 3.6 RED: Extend `AddRemoteWizard.test.tsx` — renders exactly 3 type options, no save-password screen, PasswordStep shows validateOnly copy for interactive
- [x] 3.7 GREEN: Apply AddRemoteWizard changes

## Phase 4: Connect-Time Gate & Runtime

- [x] 4.1 In `src/tui/app/remotes-stack.ts`: expose `validateConnection` (already constructed for AddRemote) in RemotesStack
- [x] 4.2 In `src/tui/app/providers/app-runtime.ts`: replace `setActiveRemote` with `activateRemote(name, password?)`; add `activeRemotePassword: string | undefined` in context state; document session-only, never rendered/persisted
- [x] 4.3 In `src/tui/app/routes/remotes/index.tsx`: adapt shim to route through `activateRemote`
- [x] 4.4 In `src/tui/pages/remotes-menu/model/remotes-selection.ts`: add connect-time gate — `getByName(name)` → null triggers list refresh; else `requiresConnectPrompt?` → masked prompt (ink PasswordInput) → ValidateSshConnection → ok: `onActivate(name, password)` / fail: re-prompt / Esc: cancel restore list; inject `validateConnection: ValidateSshConnection` and `getByName`; during prompt/validation `selectable` is empty (mode-switching pattern)
- [x] 4.5 In `src/tui/pages/remotes-menu/ui/RemotesMenuPage.tsx`: add prompt screen; wire `onActivateRemote` prop (name, password?) to call `activateRemote`
- [x] 4.6 RED: Extend `remotes-selection.test.tsx` — direct activation (ssh-key, store-with-password) skips prompt; prompt→auth-fail→re-prompt; cancel→list restored; success→`onActivate(name, pw)`; no password in rendered text
- [x] 4.7 GREEN: Apply connect-time model and page changes
- [x] 4.8 RED: Extend `RemotesMenuPage.test.tsx` — prompt screen renders for interactive selection; cancel returns to list

## Phase 5: Typecheck & Lint

- [x] 5.1 Run `bun run typecheck`; fix any type errors across all modified files
- [x] 5.2 Run `bun run lint:changed`; fix any lint errors
- [x] 5.3 Run `bun run test -- --run`; all tests pass *(282/283; the 1 failure is the pre-existing environmental doctor test, fails on clean tree too — "Bun is not defined")*

## Open Decisions (resolve in implementation)

1. **Router tree not mounted** — design targets router tree; production bare `tako` renders legacy `App.tsx`. Track separately; this PR is correct regardless.
2. **`getByName` race** — null result (remote deleted between list/Enter) → refresh list, stay on selection screen. Implement as specified.
3. **TypeStep label** — final wording for `interactive` option TBD; use "Ask every session — never stored" as placeholder and refine during Phase 3.
