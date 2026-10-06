/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@foodgrid/types$': '<rootDir>/../types/src/index.ts',
    '^@foodgrid/utils$': '<rootDir>/../utils/src/index.ts',
  },
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }] },
};
