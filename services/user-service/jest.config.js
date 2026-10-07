/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    '^@foodgrid/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@foodgrid/auth$': '<rootDir>/../../packages/auth/src/index.ts',
    '^@foodgrid/auth/nest$': '<rootDir>/../../packages/auth/src/nest/index.ts',
    '^@foodgrid/auth/permissions$': '<rootDir>/../../packages/auth/src/permissions.ts',
    '^@foodgrid/database$': '<rootDir>/../../packages/database/src/index.ts',
    '^@foodgrid/database/nest$': '<rootDir>/../../packages/database/src/nest/index.ts',
    '^@foodgrid/utils$': '<rootDir>/../../packages/utils/src/index.ts',
    '^@foodgrid/utils/server$': '<rootDir>/../../packages/utils/src/server/index.ts',
    '^@foodgrid/utils/testing$': '<rootDir>/../../packages/utils/src/server/testing/index.ts',
  },
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
};
