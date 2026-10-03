import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The app must never touch the network at runtime (see CLAUDE.md / docs/DECISIONS.md).
const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Request'].map(
  (name) => ({ name, message: 'HSE Quest is fully offline: network APIs are forbidden.' }),
);

export default defineConfig([
  globalIgnores(['dist', 'android', 'node_modules']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat.recommended],
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS],
      'no-restricted-properties': [
        'error',
        {
          object: 'navigator',
          property: 'sendBeacon',
          message: 'HSE Quest is fully offline: network APIs are forbidden.',
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'vite.config.ts', 'capacitor.config.ts', 'tests/**/*.ts', 'tests/**/*.test.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // The E2E script runs in Node but passes functions into the page (document/window).
    files: ['tests/e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
]);
