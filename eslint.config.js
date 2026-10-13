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
  globalIgnores([
    '**/node_modules',
    '**/dist',
    '**/build',
    '**/coverage',
    '**/*.test.{ts,tsx,js,jsx}',
    '**/*.spec.{ts,tsx,js,jsx}',
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
            {
              target: ['src/domains/agent/**/*'],
              from: ['src/domains/remotes/**/*'],
              except: ['**/src/domains/remotes/application/**'],
              message:
                'ADR-0015/D4: agent may import only remotes/application ports (type-only); runtime wiring lives in cli/tui composition roots',
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
    // Scoped to the ADR-0016 persistence zone and the Bun-run integration
    // fixtures; nowhere else may import Bun-only modules.
    files: ['src/domains/agent/infrastructure/persistence/**/*.ts', 'tests/integration/agent/**/*.ts'],
    rules: {
      'import-x/no-unresolved': ['error', { ignore: ['bun:.*'] }],
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
      // Override import ordering for React/Ink: react/react-dom/ink as builtin, before everything.
      'import-x/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'object', 'unknown'],
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
