# Design: tako doctor (MVP) — host dependency check

## Technical Approach

Thin CLI handler routes `tako doctor` to the `CheckHostDependencies` use case in a new `system` domain. The use case depends on a `HostToolChecker` port (constructor-injected), iterates the domain-owned `REQUIRED_HOST_TOOLS` constant, and returns structured results. The `LocalHostToolChecker` adapter is the sole consumer of `Bun.spawn`, probing each tool's version flag. The CLI handler formats results with `picocolors` and derives the exit code.

This maps directly to the proposal's approach: `system` replicates `docker`'s three-layer structure (`domain/application/infrastructure`). Dependency rules respected: `system→shared`, `cli→system+shared`.

## Architecture Decisions

| Decision           | Choice                                                                | Rejected                                    | Rationale                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain name        | `system`                                                              | `host`, `preflight`, `environment`          | `doctor` will later check remote server readiness (docker daemon, compose v2). `system` covers both local + remote iterations. `host` misleading for remote; `preflight` couples to command name. |
| Spawn API          | `Bun.spawn` (spec-mandated)                                           | `child_process`                             | Spec explicitly mandates `Bun.spawn`. Build compiles to Bun binary. Port/adapter means adapter is swappable if Node compat is ever needed. **Tension with `docs/stack.md` — see Open Questions.** |
| stderr quirk       | Capture stdout + stderr; prefer stdout, fall back to stderr           | Per-tool stream config, SSH-specific branch | `ssh -V` writes to stderr; `git`/`docker` write to stdout. `stdout.trim() \|\| stderr.trim()` handles all tools in one code path.                                                                 |
| Testability        | Port injected via constructor; formatting as pure function            | Mock globals only, integration-only         | Use case takes `HostToolChecker` in ctor → fake in unit tests. `formatToolLine` is pure (input→string, zero I/O). Adapter unit-tested via `vi.stubGlobal`.                                        |
| Presence + version | Single `Bun.spawn([tool, flag])`; ENOENT→not-found, exit≠0→found+null | Separate `Bun.which` then spawn             | Fewer syscalls, simpler. Edge case (binary exists but `--version` fails) → found with null version, acceptable for MVP.                                                                           |

## Data Flow

```
  argv: ["doctor"]
       │
       ▼
┌─────────────────────── CLI layer ───────────────────────┐
│ src/cli/index.ts ──switch──► src/cli/commands/doctor.ts  │
│                                  │                       │
│                  ┌───────────────┼───────────────┐       │
│                  │ wires adapter │ calls         │       │
│                  │ into use case │ formatter     │       │
│                  ▼               ▼               │       │
│         CheckHostDependencies  formatToolLine    │       │
│            (use case)        (pure → string)     │       │
│                  │                               │       │
└──────────────────┼───────────────────────────────┘
                   │ depends on PORT (not adapter)
                   ▼
┌──────────── system domain (Clean Arch) ────────────────┐
│                                                         │
│  application/                                           │
│    ├─ HostToolChecker.ts        ← PORT interface        │
│    └─ CheckHostDependencies.ts  ← use case              │
│  domain/                                                │
│    ├─ types.ts                  ← HostTool, Result      │
│    └─ required-tools.ts         ← REQUIRED_HOST_TOOLS   │
│  infrastructure/                                        │
│    └─ LocalHostToolChecker.ts   ← ADAPTER (sole spawn)  │
│         └─ Bun.spawn([tool, flag])                      │
│               └──► ssh -V / git --version / docker -V   │
└─────────────────────────────────────────────────────────┘
```

## File Changes

| File                                                              | Action | Description                                                           |
| ----------------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| `src/domains/system/domain/types.ts`                              | Create | `HostTool`, `CheckStatus`, `ToolCheckResult`, `SystemCheckResult`     |
| `src/domains/system/domain/required-tools.ts`                     | Create | `REQUIRED_HOST_TOOLS` constant: `['ssh','git','docker']`              |
| `src/domains/system/application/HostToolChecker.ts`               | Create | Port: `check(tool: HostTool): Promise<ToolCheckResult>`               |
| `src/domains/system/application/CheckHostDependencies.ts`         | Create | Use case: iterate tools via port, aggregate results + allPresent      |
| `src/domains/system/infrastructure/LocalHostToolChecker.ts`       | Create | Adapter: `Bun.spawn` per tool, capture stdout+stderr, stderr fallback |
| `src/cli/commands/doctor-report.ts`                               | Create | Pure formatter: `formatToolLine(result) → string` via picocolors      |
| `src/cli/commands/doctor.ts`                                      | Create | Handler: wire adapter→use case→format→print→exit code                 |
| `src/cli/index.ts`                                                | Modify | Replace stub with argv switch routing `doctor`                        |
| `src/domains/system/{domain,application,infrastructure}/.gitkeep` | Delete | Remove placeholders as real files land                                |

## Interfaces / Contracts

```typescript
// domain/types.ts — pure types, zero deps
type HostTool = 'ssh' | 'git' | 'docker';
type CheckStatus = 'found' | 'not-found';

interface ToolCheckResult {
  readonly tool: HostTool;
  readonly status: CheckStatus;
  readonly version: string | null; // null when not found or version capture failed
}

interface SystemCheckResult {
  readonly results: readonly ToolCheckResult[];
  readonly allPresent: boolean;
}

// application/HostToolChecker.ts — PORT (application owns this interface)
interface HostToolChecker {
  check(tool: HostTool): Promise<ToolCheckResult>;
}

// infrastructure/LocalHostToolChecker.ts — ADAPTER (sole Bun.spawn consumer)
// Non-obvious pattern: stderr fallback for ssh -V
//   const version = stdout.trim() || stderr.trim() || null;
// ENOENT catch → not-found; exit≠0 → found + version null
```

## Testing Strategy

| Layer       | What to test                                        | Approach                                                         |
| ----------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Use case: all-present, partial-missing, all-missing | Fake `HostToolChecker` injected; assert results + `allPresent`   |
| Unit        | Report formatting: found line, missing line         | Pure `formatToolLine()` — direct input→output, no I/O mocking    |
| Unit        | Domain constant: exactly 3 tools, correct order     | Direct assertion on `REQUIRED_HOST_TOOLS`                        |
| Unit        | Adapter: stderr fallback (ssh), ENOENT handling     | `vi.stubGlobal('Bun', { spawn: ... })` mock; assert stream merge |
| Integration | Adapter against real `git` on PATH                  | `tests/integration/` — spawns actual `git --version`             |

Strict TDD: RED tests written first for every unit above (use case, formatter, constant, adapter mock). Implementation follows GREEN→REFACTOR.

## Error Handling

| Condition                                               | Detection                          | Result                                         |
| ------------------------------------------------------- | ---------------------------------- | ---------------------------------------------- |
| Binary not on PATH                                      | `Bun.spawn` throws (ENOENT)        | `status: 'not-found'`, `version: null`         |
| Binary present, `--version` exits non-zero              | `proc.exited !== 0`                | `status: 'found'`, `version: null`             |
| Binary present, stdout empty + stderr has content (ssh) | `stdout.trim() \|\| stderr.trim()` | `status: 'found'`, `version: <stderr content>` |
| Spawn succeeds, both streams empty                      | Exit 0 + empty output              | `status: 'found'`, `version: null`             |

All failures are caught and returned as structured results — the use case never throws. The CLI handler reads `allPresent` to derive exit code (0 or 1).

## Threat Matrix

N/A — subprocess spawning uses a **hard-coded tool list** (`ssh`, `git`, `docker`) with **hard-coded flags** (`-V`, `--version`). No user input reaches spawn arguments. Zero command-injection surface. No routing of external input, no git/VCS/PR operations, no executable-file classification. The `doctor` subcommand string is matched against a fixed literal in a switch statement — no dynamic dispatch.

## Migration / Rollout

No migration required. All changes are additive (new domain + CLI routing). Rollback: delete `src/domains/system/`, `src/cli/commands/doctor.ts`, restore `src/cli/index.ts` to the stub `console.log`. No host state, compose files, or embedded templates touched.

## Open Questions

- [ ] **Bun.spawn vs Node compat**: Spec mandates `Bun.spawn`; `docs/stack.md` forbids Bun-only APIs (Node 20+ compat for npm distribution). Build already compiles to Bun binary (`bun build --compile`). Recommend updating `stack.md` to reflect Bun-first reality; port/adapter makes future adapter swap (`child_process`) trivial if Node compat is ever needed.
- [ ] **Binary exists but `--version` fails**: Spec doesn't cover this edge. MVP treats as `found` + `version: null`. Confirm acceptable or adjust to `not-found` if stricter semantics preferred.
