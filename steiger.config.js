// steiger.config.js — FSD structural arbiter (ADR-0018 §4): slice
// significance and FSD conventions. Layer DIRECTION is ESLint's job
// (eslint.config.js zones); dead code is knip's. The FSD root is src/tui —
// src/ as a whole is not an FSD tree (cli/, services/, domains/ live there).
import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([...fsd.configs.recommended]);
