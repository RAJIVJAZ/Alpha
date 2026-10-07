/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: { '^@foodgrid/types$': '<rootDir>/../types/src/index.ts' },
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
};
