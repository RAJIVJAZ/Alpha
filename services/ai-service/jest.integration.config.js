const base = require('./jest.config');

/** Integration suites run against real Postgres + Redis (see docs/testing.md). */
module.exports = {
  ...base,
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  testTimeout: 30000,
  passWithNoTests: true,
  // env (test DB, keys, disabled workers) must be set before AppModule is imported
  setupFiles: require('node:fs').existsSync(`${__dirname}/test/setup-env.ts`) ? ['<rootDir>/test/setup-env.ts'] : [],
};
