// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/**
 * Layering rules.
 *
 * docs/ARCHITECTURE.md section 3 defines a one-directional dependency graph:
 *
 *   app -> features -> services -> domain
 *
 * A layering rule that CI does not enforce is a comment, not an architecture.
 * These zones are that enforcement. dependency-cruiser (npm run depcruise)
 * catches the same violations through relative imports.
 */
const DOMAIN_FORBIDDEN = [
  {
    group: ['@/services/*', '@/features/*', '@/app/*', '@/components/*', '@/ui/*', '@/lib/*'],
    message:
      'src/domain must not depend on outer layers. It is pure business logic: no I/O, no React, no app wiring.',
  },
  {
    group: ['react', 'react-native', 'react-native/*', 'expo', 'expo-*', '@supabase/*', '@tanstack/*'],
    message:
      'src/domain must stay a pure TypeScript module. If you need React or I/O here, the logic belongs in features/ or services/.',
  },
];

const SERVICES_FORBIDDEN = [
  {
    group: ['@/features/*', '@/app/*', '@/components/*', '@/ui/*'],
    message:
      'src/services is the I/O boundary and must not depend on UI layers. Move shared types to src/domain or src/schemas.',
  },
  {
    group: ['react-native', 'react-native/*'],
    message: 'src/services must not import React Native. Keep it transport-only and testable in node.',
  },
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'supabase/functions/*'],
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: DOMAIN_FORBIDDEN }],
    },
  },
  {
    files: ['src/services/**/*.ts', 'src/services/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', { patterns: SERVICES_FORBIDDEN }],
    },
  },
  {
    // Secrets must never be readable from the client bundle. EXPO_PUBLIC_* is
    // shipped to users by definition, so an AI key placed there is a public key.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration from src/config/env.ts, which validates it with zod at startup.',
        },
      ],
    },
  },
  {
    files: ['src/config/env.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
]);
