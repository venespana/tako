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
          basePath: tsconfigRootDir,
          zones: [
            // cli ↔ tui isolation. ADR-0014 exception: the add-remote-wizard
            // feature is the one sanctioned tui import reachable from cli/
            // (`tako remote add` launches the wizard).
            {
              target: ['src/tui/**/*'],
              from: ['src/cli/**/*'],
              message: 'Architecture rule: src/tui/ may not import from src/cli/',
            },
            {
              target: ['src/cli/**/*'],
              from: ['src/tui/**/*'],
              except: [`${tsconfigRootDir}src/tui/features/remotes/add-remote-wizard/**`],
              message:
                'Architecture rule: src/cli/ may not import from src/tui/ (ADR-0014 exception: the add-remote-wizard feature is the only sanctioned import)',
            },
            // FSD layer direction (app > pages > widgets > features > entities > shared):
            // each layer may only import from layers strictly below it.
            {
              target: ['src/tui/pages/**/*'],
              from: ['src/tui/app/**/*'],
              message: 'FSD layer rule: pages may not import from app',
            },
            {
              target: ['src/tui/widgets/**/*'],
              from: ['src/tui/app/**/*', 'src/tui/pages/**/*'],
              message: 'FSD layer rule: widgets may import only from features/entities/shared',
            },
            {
              target: ['src/tui/features/**/*'],
              from: ['src/tui/app/**/*', 'src/tui/pages/**/*', 'src/tui/widgets/**/*'],
              message: 'FSD layer rule: features may import only from entities/shared',
            },
            {
              target: ['src/tui/entities/**/*'],
              from: ['src/tui/app/**/*', 'src/tui/pages/**/*', 'src/tui/widgets/**/*', 'src/tui/features/**/*'],
              message: 'FSD layer rule: entities may import only from shared',
            },
            {
              target: ['src/tui/shared/**/*'],
              from: [
                'src/tui/app/**/*',
                'src/tui/pages/**/*',
                'src/tui/widgets/**/*',
                'src/tui/features/**/*',
                'src/tui/entities/**/*',
              ],
              message: 'FSD layer rule: shared may import nothing in src/tui above it',
            },
            // FSD rule 4-2: feature slice internals are reachable only through
            // the slice's index.ts public API. Imports from within the same
            // slice and from tests colocated in the slice are exempt (tests
            // are globally ignored above; same-slice files are not targeted).
            {
              target: [
                'src/tui/app/**/*',
                'src/tui/pages/**/*',
                'src/tui/widgets/**/*',
                'src/tui/entities/**/*',
                'src/tui/shared/**/*',
                'src/tui/features/remotes/**/*',
                'src/cli/**/*',
              ],
              from: ['src/tui/features/menu/**/*'],
              except: [`${tsconfigRootDir}src/tui/features/menu/index.{ts,tsx}`],
              message: 'FSD rule 4-2: import features/menu only through its index.ts public API',
            },
            {
              target: [
                'src/tui/app/**/*',
                'src/tui/pages/**/*',
                'src/tui/widgets/**/*',
                'src/tui/entities/**/*',
                'src/tui/shared/**/*',
                'src/tui/features/menu/**/*',
                'src/cli/**/*',
              ],
              from: ['src/tui/features/remotes/**/*'],
              except: [`${tsconfigRootDir}src/tui/features/remotes/add-remote-wizard/index.{ts,tsx}`],
              message: 'FSD rule 4-2: import the add-remote-wizard feature only through its index.ts public API',
            },
          ],
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
