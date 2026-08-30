/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  collectCoverageFrom: ['src/domain/**/*.ts', 'src/services/**/*.ts'],
  // The domain layer is where correctness lives, so it carries a hard gate.
  coverageThreshold: {
    'src/domain/nutrition/': { statements: 95, branches: 90, functions: 95, lines: 95 },
  },
};
