// steiger.config.js — FSD structural arbiter (ADR-0018 §4): slice
// significance and FSD conventions. Layer DIRECTION is ESLint's job
// (eslint.config.js zones); dead code is knip's. The FSD root is src/tui —
// src/ as a whole is not an FSD tree (cli/, services/, domains/ live there).
import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // Team decision (2026-10-21): keep `app/providers` despite
    // segments-by-purpose. The FSD doc (fsd.how v2.1) names providers as a
    // first-class app-layer concern ("App initialization, providers,
    // routing"), and the segment holds the app-global runtime store
    // (app-runtime-store) consumed across the route tree. Renaming it to a
    // purpose name (e.g. `runtime`) was tried and deliberately reverted —
    // keeping the standard concept beats introducing an extra vocabulary
    // word. Documented intentional exception per FSD "breaking rules" rule.
    files: ['./src/tui/app/providers/**'],
    rules: {
      'fsd/segments-by-purpose': 'off',
    },
  },
]);
