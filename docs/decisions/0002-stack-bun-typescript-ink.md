# ADR 0002: Stack — Bun + TypeScript + Ink

## Status

Accepted

## Context

The maintainer has solid experience in JavaScript and React. Does not know Go or Rust. Has used Python but is not interested in it for a CLI/TUI project.

Options were evaluated: Go + Bubble Tea (months-long curve learning Go + Elm architecture), Rust + Ratatui (steeper curve), Blessed/neo-blessed (abandonware).

## Decision

**TypeScript + Ink + Bun**.

- TypeScript for type safety.
- Ink (React for terminal, maintained by Vercel) reuses the React mental model.
- Bun as runtime + bundler + compile to a single self-contained binary.

## Consequences

- (+) Reuses existing skills (React + JS/TS).
- (+) Minimal learning curve (hours/days vs months).
- (+) `bun build --compile` produces a single distributable binary without Node.
- (+) Distribution via npm also possible.
- (-) Bun is newer than the Node ecosystem, less battle-tested.
- (-) Requires strict Node 20+ compat (Bun-only APIs forbidden) to support npm distribution.
- (-) Compiled binaries larger than static Go binaries (~50MB vs ~15MB).
