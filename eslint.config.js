import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import importPlugin from 'eslint-plugin-import-x';
import prettier from 'eslint-plugin-prettier/recommended';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const tsconfigRootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(
  // Test files are NOT ignored (F4): the boundary zones and import rules
  // below apply to them too — a test importing a layer it must not touch is
  // the same architecture break as production code. Noise-specific
  // relaxations live in the dedicated test block further down.
  globalIgnores([
    '**/node_modules',
    '**/dist',
    '**/build',
    '**/coverage',
    '**/.env.*',
    '**/*.tsbuildinfo',
    'docs/**',
    'templates/**',
    'scripts/**/*.{sh}',
  ]),
  js.configs.recommended,
  // eslint-disable-next-line import-x/no-named-as-default-member -- tseslint.configs is the documented pattern
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        tsconfigRootDir: tsconfigRootDir,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: 'tsconfig.json',
          tsconfigRootDir,
          alwaysTryTypes: true,
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    // eslint-disable-next-line import-x/no-named-as-default-member -- importPlugin.flatConfigs is the documented pattern
    extends: [importPlugin.flatConfigs.recommended, importPlugin.flatConfigs.typescript],
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      'no-unused-vars': 'off',
      'import-x/namespace': 'off',
      'import-x/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'object', 'unknown'],
          // React/Ink ordering: react/react-dom/ink sort as builtins, before everything.
          pathGroups: [
            {
              pattern: 'react{,-dom{/**,}}',
              group: 'builtin',
              position: 'before',
            },
            {
              pattern: 'ink{,-*/**}',
              group: 'builtin',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['react', 'react-dom', 'react-dom/**', 'ink', 'ink-*'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import-x/default': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'import-x/prefer-default-export': 'off',
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            // --- Presentation isolation (ADR-0020: one interactive client, one non-interactive) ---
            {
              target: ['src/tui/**/*'],
              from: ['src/cli/**/*'],
              message: 'Architecture rule: src/tui/ may not import from src/cli/',
            },
            {
              target: ['src/cli/**/*'],
              from: ['src/tui/**/*'],
              message:
                'Architecture rule: src/cli/ may not import from src/tui/ (ADR-0020: the CLI is strictly non-interactive — one interactive client, one non-interactive client)',
            },
            // --- ADR-0019 §4 dependency directions (server/clients model) ---
            {
              target: ['src/shared/**/*'],
              from: ['src/domains/**/*', 'src/cli/**/*', 'src/tui/**/*', 'src/services/**/*'],
              message: 'Architecture rule: src/shared/ is the shared kernel — it imports from nothing',
            },
            {
              target: ['src/domains/**/*'],
              from: ['src/cli/**/*', 'src/tui/**/*', 'src/services/**/*'],
              message:
                'Architecture rule: domains may import only src/shared/ — presentation and services never enter a domain (ADR-0019 §4)',
            },
            {
              target: ['src/services/**/*'],
              from: ['src/cli/**/*', 'src/tui/**/*'],
              message:
                'Architecture rule: services must not import presentation — clients import services, never the reverse (ADR-0019 §4)',
            },
            {
              target: ['src/tui/**/*'],
              from: ['src/domains/**/*'],
              message:
                'Architecture rule: src/tui/ must not import domains directly — contract types are re-exported through src/services/ (ADR-0019 §4)',
            },
            // The mirrored cli→domains direction is enforced below with
            // no-restricted-imports: this rule's `except` filters import
            // paths, so it cannot exempt the one documented target-file
            // exception (the agent-run composition root).
            // --- Clean Architecture inside each domain ---
            {
              target: ['src/domains/*/application/**/*'],
              from: ['src/domains/*/infrastructure/**/*'],
              message:
                'Clean Architecture rule: application declares ports, infrastructure implements adapters — application never imports infrastructure',
            },
            {
              target: ['src/domains/agent/**/*'],
              from: ['src/domains/remotes/**/*'],
              except: ['**/src/domains/remotes/application/**'],
              message:
                'ADR-0015/D4: agent may import only remotes/application ports (type-only); runtime wiring lives in cli/tui composition roots',
            },
            // --- FSD layer direction inside the TUI (ADR-0018). Same-layer
            // sibling cross-imports are Steiger's granularity, not a zone
            // per pair — see ADR-0018 §4 division of labor. ---
            {
              target: ['src/tui/shared/**/*'],
              from: [
                'src/tui/entities/**/*',
                'src/tui/features/**/*',
                'src/tui/widgets/**/*',
                'src/tui/pages/**/*',
                'src/tui/app/**/*',
              ],
              message: 'FSD rule: shared is the lowest TUI layer — upward imports are banned (ADR-0018)',
            },
            {
              target: ['src/tui/entities/**/*'],
              from: ['src/tui/features/**/*', 'src/tui/widgets/**/*', 'src/tui/pages/**/*', 'src/tui/app/**/*'],
              message: 'FSD rule: entities may not import features, widgets, pages, or app (ADR-0018 layer direction)',
            },
            {
              target: ['src/tui/features/**/*'],
              from: ['src/tui/widgets/**/*', 'src/tui/pages/**/*', 'src/tui/app/**/*'],
              message: 'FSD rule: features may not import widgets, pages, or app (ADR-0018 layer direction)',
            },
            {
              target: ['src/tui/widgets/**/*'],
              from: ['src/tui/pages/**/*', 'src/tui/app/**/*'],
              message: 'FSD rule: widgets may not import pages or app (ADR-0018 layer direction)',
            },
            {
              target: ['src/tui/pages/**/*'],
              from: ['src/tui/app/**/*'],
              message: 'FSD rule: pages may not import app — composition flows downward (ADR-0018 layer direction)',
            },
          ],
        },
      ],
    },
  },
  {
    // The zone above restricts agent to remotes/application paths; this rule enforces
    // the second half of the D4 contract: those imports must be `import type` so the
    // compiled agent carries zero runtime coupling to the remotes domain.
    files: ['src/domains/agent/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration[importKind='value'][source.value=/remotes\\/application/]",
          message:
            'ADR-0015/D4: agent imports remotes/application ports type-only (`import type`); runtime wiring lives in cli/tui composition roots',
        },
      ],
    },
  },
  {
    // ADR-0019 §4: the CLI consumes the services layer, never domains
    // directly. `import-x/no-restricted-paths` cannot exempt a target file
    // (its `except` filters import paths, and targets take no negation), so
    // this direction uses the core no-restricted-imports rule (the import-x
    // plugin no longer re-exports it) with an explicit off-override
    // for the one documented exception below.
    files: ['src/cli/**/*.ts', 'src/cli/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/domains/**'],
              message:
                'Architecture rule: src/cli/ must not import domains directly — contract types flow through src/services/ (ADR-0019 §4)',
            },
          ],
        },
      ],
    },
  },
  {
    // The documented exception (ADR-0015 `run` + ADR-0016): `agent-run` is the
    // agent-mode SERVER composition root — it wires the domain (application
    // use cases, the unix-socket server, persistence), it is not a client of
    // the services layer. Only the domains ban is lifted here; every other
    // rule, including the cli→tui zone, still applies to these files.
    files: ['src/cli/commands/agent-run.ts', 'src/cli/commands/agent-run.test.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-shadow': ['error'],
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['PascalCase', 'camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
      ],
      'no-shadow': 'off',
      'no-undef': 'off',
    },
  },
  {
    // `bun:sqlite` is a Bun built-in that Node-based resolvers cannot resolve.
    // Scoped to the ADR-0016 persistence zone, the agent-mode composition
    // root, and the Bun-run integration fixtures; nowhere else may import
    // Bun-only modules.
    files: [
      'src/domains/agent/infrastructure/persistence/**/*.ts',
      'src/cli/commands/agent-run.ts',
      'tests/integration/agent/**/*.ts',
    ],
    rules: {
      'import-x/no-unresolved': ['error', { ignore: ['bun:.*'] }],
    },
  },
  {
    // Test files (un-blinded in F4): the boundary zones and import rules in
    // the blocks above apply to them in full. Relax ONLY what is noise for
    // tests — fixture indexing relies on non-null assertions, and the
    // ordering rule stays at its global `warn` so a misplaced test import is
    // visible without failing the suite.
    files: ['**/*.test.{ts,tsx,js,jsx}', '**/*.spec.{ts,tsx,js,jsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Tests build elements manually (React.createElement) — the named-member
      // caution is production-idiom noise here.
      'import-x/no-named-as-default-member': 'off',
    },
  },

  // React (Ink 5 is React) — adapted from playvion packages/client.
  // react-refresh dropped (Vite-only, Ink has no HMR). globals: node (TUI runs in Node/Bun).
  reactHooks.configs.flat.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    rules: {
      // React-specific
      'react/display-name': 'off',
      'react/no-children-prop': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  prettier
);
