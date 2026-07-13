/** @type {import('jest').Config} */
const base = require('./jest.config.js');

/** Integration tests — require PostgreSQL (see docs/architecture-stabilization/TESTING.md). */
module.exports = {
  ...base,
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: false,
  coverageThreshold: undefined,
};
