/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@foodgrid/types$': '<rootDir>/../types/src/index.ts',
    '^@foodgrid/auth$': '<rootDir>/../auth/src/index.ts',
    '^@foodgrid/auth/nest$': '<rootDir>/../auth/src/nest/index.ts',
    '^@foodgrid/database$': '<rootDir>/../database/src/index.ts',
    '^@foodgrid/database/nest$': '<rootDir>/../database/src/nest/index.ts',
  },
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
};
