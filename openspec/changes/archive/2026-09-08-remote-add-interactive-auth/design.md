# Design: remote-add-interactive-auth

## Technical Approach

Type-driven credential dispatch. Widen `SshCredentialType` with `'interactive'`; remove the wizard's save-password branch (`store` now always persists); persist `interactive` remotes with zero secret material; intercept interactive selections in the remotes menu with a masked, SSH-validated prompt; retain the secret only in `AppRuntime` (session memory). Legacy `store`-without-password remotes normalize to `interactive` at the repository read boundary — no migration write.

### Type Changes (`src/domains/remotes/domain/types.ts`)

- `SshCredentialType = 'store' | 'ssh-key' | 'interactive'`
- `Remote`: structure unchanged; doc invariants updated (`obfuscatedPassword` iff `store`; `interactive` carries no secret fields).
- `RemoteDraft`: **remove `savePassword`**. The persisted `Remote` never carried it (only `obfuscatedPassword` presence), so there is no persistence-compatibility impact; legacy no-password entries are handled by read-time normalization, not by the draft. Keeping it preserves dead UI state and a misleading `AddRemote` branch.

### Wizard Changes

- `wizard-store.ts`: delete step `'save-password'`, `WizardData.savePassword`, action `setSavePassword`. `setType` routes `ssh-key → 'key-path'`; `store` and `interactive → 'password'`.
- `use-add-remote-wizard.ts`: `buildDraft` includes `password` for `store` and `interactive`, `keyPath` for `ssh-key`.
- `AddRemoteWizard.tsx`: delete `SavePasswordStep`; `TypeStep` offers exactly three options (`Store password (obfuscated)` / `SSH key` / `Ask every session — never stored`); `PasswordStep` gains a `validateOnly` prop ("used only to validate — never saved").

```
type ─store──────→ password ─┐
    ─ssh-key───→ key-path ──┼─→ validating (ssh2) → hostkey-confirm → save
    ─interactive→ password ──┘        (store: +obfuscatedPassword; interactive: no secret; ssh-key: +keyPath)
```

### Domain / Application Layer Changes

- `AddRemote.execute/save`: auth dispatch — `ssh-key` → key auth; `store`/`interactive` → password auth. Obfuscation gate: `credentialType === 'store' && password !== undefined` (drop the `savePassword` check). `interactive` persists no `obfuscatedPassword`/`keyPath` (falls out of existing spreads).
- New pure module `src/domains/remotes/domain/normalize.ts`:

```ts
export function normalizeRemote(r: Remote): Remote {
  return r.credentialType === 'store' && r.obfuscatedPassword === undefined
    ? { ...r, credentialType: 'interactive' }
    : r;
}
export const requiresConnectPrompt = (r: Remote) => r.credentialType === 'interactive';
```

### Connect-Time Flow

Gate lives in `remotes-selection.ts` (model owns interaction; page renders). New injected deps: `validateConnection: ValidateSshConnection`; `onSelect` becomes `onActivate(name, password?)`.

```
Enter ─→ getByName(name) ─null→ refresh list (remote vanished)
                      └─remote─→ requiresConnectPrompt?
        no → onActivate(name)          yes → masked prompt (@inkjs/ui PasswordInput)
                                            │ submit → validating → ValidateSshConnection
                                            │   ok    → onActivate(name, password)
                                            │   fail  → re-prompt + category message
                                            └ Esc     → cancel → selection list restored
```

- While prompting/validating, `useMenuList` receives an empty `selectable` (keys inert) — the page's existing mode-switching pattern.
- Wrong password: unlimited re-shows (spec sets no cap); each attempt uses only the just-typed password.
- `AppRuntime`: replace `setActiveRemote` with `activateRemote(name, password?)` plus `activeRemotePassword: string | undefined`. Held in context state — never rendered, never persisted, overwritten on re-activation. Route shim `routes/remotes/index.tsx` adapts; all other routes only read `activeRemote`.
- `remotes-stack.ts`: expose `validateConnection` (already constructed for `AddRemote`) in `RemotesStack`.

### Repository Changes

- Port: add `getByName(name: string): Promise<Remote | null>` — `null` is the distinct not-found outcome; never throws.
- `ConfRemoteRepository.getByName`: `conf.get('remotes.<name>')` → `normalizeRemote(...)` ?? `null`. `save()` untouched — persisted bytes never rewritten. `list()` returns summaries without `credentialType`; no normalization needed.

## Architecture Decisions

| Decision | Options | Choice & rationale |
|---|---|---|
| `RemoteDraft.savePassword` | keep vestigial / remove | **Remove** — persisted shape never included it; legacy handled at read boundary |
| Normalization site | adapter read / use case / migration write | **Adapter read (`getByName`)** — the port is the single read boundary, so every consumer sees normalized data; spec forbids rewriting |
| Not-found shape | throw / `null` / Result type | **`null`** — codebase idiom; spec demands distinct outcome without throwing |
| Prompt placement | new route / gate in selection model | **Gate in selection model** — "cancel restores the list" is one screen-state change; no router surgery |
| Session secret home | AppRuntime / new Zustand store / domain port | **AppRuntime** — already the session-scoped runtime; no second consumer justifies a store |
| Password step reuse | shared step / separate step id | **Shared** with `validateOnly` copy — identical `→ validating` transition, one store action |

## File Changes

| File | Action |
|---|---|
| `src/domains/remotes/domain/types.ts` | Modify — widen union, drop `savePassword` |
| `src/domains/remotes/domain/normalize.ts` | Create — `normalizeRemote`, `requiresConnectPrompt` |
| `src/domains/remotes/application/AddRemote.ts` | Modify — auth dispatch, store-only obfuscation |
| `src/domains/remotes/application/RemoteRepository.ts` | Modify — `getByName` port |
| `src/domains/remotes/infrastructure/ConfRemoteRepository.ts` | Modify — implement `getByName` + normalization |
| `src/tui/features/remotes/add-remote-wizard/model/wizard-store.ts` | Modify — remove save-password step |
| `src/tui/features/remotes/add-remote-wizard/model/use-add-remote-wizard.ts` | Modify — draft build |
| `src/tui/features/remotes/add-remote-wizard/ui/AddRemoteWizard.tsx` | Modify — 3 options, delete `SavePasswordStep` |
| `src/tui/pages/remotes-menu/model/remotes-selection.ts` | Modify — connect-time gate + prompt state |
| `src/tui/pages/remotes-menu/ui/RemotesMenuPage.tsx` | Modify — prompt screen, `onActivateRemote` prop |
| `src/tui/app/providers/app-runtime.ts` | Modify — `activateRemote` + session password |
| `src/tui/app/routes/remotes/index.tsx` | Modify — shim wiring |
| `src/tui/app/remotes-stack.ts` | Modify — expose `validateConnection` |

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | wizard transitions (no save-password; store/interactive→password; ssh-key→key-path) | extend `wizard-store.test.ts` |
| Unit | `AddRemote`: interactive validates with password auth, persists no secret, vault never called | extend `AddRemote.test.ts` |
| Unit | `normalizeRemote`, `requiresConnectPrompt` | new co-located test |
| Unit | `getByName`: found / null / legacy→interactive / persisted bytes unchanged | extend `ConfRemoteRepository.test.ts` |
| Unit | selection gate: direct activation (ssh-key, store); prompt→auth-fail→re-prompt; cancel→list; success→`onActivate(name, pw)`; no password in any rendered text | extend `remotes-selection.test.tsx` |
| Component | wizard renders exactly 3 types, no save-password screen; menu prompt flow | `AddRemoteWizard.test.tsx`, `RemotesMenuPage.test.tsx` |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. SSH validation reuses the existing `Ssh2ConnectionTester` port unchanged.

## Migration / Rollout

No migration writes; legacy entries normalize at read time. Rollback: revert the merge and (optionally) delete affected `remotes.<name>` conf entries — persisted `interactive` values are unknown to pre-change readers.

## Open Questions

- [ ] Router tree is not mounted in production yet (bare `tako` renders legacy `App.tsx`; the `/remotes` selection flow and AppRuntime provider live only in the router world). This change targets the router tree — production exposure depends on that migration's tracking.
- [ ] `getByName` race (remote deleted between `list()` and Enter) resolves as "refresh list, stay on selection screen" — confirm acceptable.
- [ ] Final `TypeStep` label wording for `interactive`.
