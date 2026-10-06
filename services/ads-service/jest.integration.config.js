const base = require('./jest.config');

/** Integration suites run against real Postgres + Redis (see docs/testing.md). */
module.exports = {
  ...base,
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  testTimeout: 30000,
};
