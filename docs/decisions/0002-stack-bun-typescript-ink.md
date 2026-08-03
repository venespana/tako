# ADR 0002: Stack — Bun + TypeScript + Ink

## Status
Accepted

## Context
El maintainer tiene experiencia sólida en JavaScript y React. No conoce Go ni Rust. Python lo ha usado pero no le interesa para un proyecto de CLI/TUI.

Se evaluaron opciones: Go + Bubble Tea (curva de meses aprendiendo Go + Elm architecture), Rust + Ratatui (curva mayor), Blessed/neo-blessed (abandonware).

## Decision
**TypeScript + Ink + Bun**.
- TypeScript para type safety.
- Ink (React para terminal, mantenido por Vercel) reutiliza el mental model React.
- Bun como runtime + bundler + compile a binario único self-contained.

## Consequences
- (+) Reutiliza skills existentes (React + JS/TS).
- (+) Curva de aprendizaje mínima (horas/días vs meses).
- (+) `bun build --compile` produce binario único distribuíble sin Node.
- (+) Distribución via npm también posible.
- (-) Bun es más nuevo que Node ecosystem, menos battle-tested.
- (-) Requiere Node 20+ compat estricta (prohibido APIs Bun-only) para soportar distribución npm.
- (-) Binarios compilados más grandes que Go estáticos (~50MB vs ~15MB).
