/**
 * Enforces the layering in docs/ARCHITECTURE.md section 3:
 *
 *   app -> features -> services -> domain
 *
 * ESLint's no-restricted-imports covers path-aliased imports; this catches
 * relative ones and cycles. Run with: npm run depcruise
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'src/domain is pure business logic. It must not reach into services, features, app or UI.',
      from: { path: '^src/domain' },
      to: { path: '^src/(services|features|app|components|ui|lib)' },
    },
    {
      name: 'domain-no-io',
      severity: 'error',
      comment: 'src/domain must not import React, React Native, Expo or the Supabase client.',
      from: { path: '^src/domain' },
      to: { dependencyTypes: ['npm'], path: '^(react|react-native|expo|@expo|@supabase|@tanstack)' },
    },
    {
      name: 'services-below-ui',
      severity: 'error',
      comment: 'src/services is the I/O boundary and must not depend on UI layers.',
      from: { path: '^src/services' },
      to: { path: '^src/(features|app|components|ui)' },
    },
    {
      name: 'no-ui-sql',
      severity: 'error',
      comment: 'Components must not talk to Supabase directly. Go through src/services.',
      from: { path: '^src/(app|features|components|ui)' },
      to: { dependencyTypes: ['npm'], path: '^@supabase/supabase-js' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: { orphan: true, pathNot: ['\.d\.ts$', '(^|/)\.[^/]+\.(js|cjs|ts)$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    exclude: { path: '\.test\.(ts|tsx)$' },
  },
};
