/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/integration/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  collectCoverageFrom: [
    'lib/**/*.ts',
    '!lib/**/*.d.ts',
    '!lib/test/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
  coverageThreshold: {
    global: {
      // Verified project baseline after CI gained a real PostgreSQL test service.
      // Keep this gate at or below the measured baseline so future regressions fail.
      lines: 66,
      statements: 63,
      branches: 46,
      functions: 62,
    },
    './lib/auth/index.ts': {
      lines: 90,
      statements: 90,
    },
    './lib/permissions/boutiqueAccess.ts': {
      lines: 80,
      statements: 75,
    },
    './lib/permissions/resourceAccess.ts': {
      lines: 85,
      statements: 75,
    },
    './lib/imports/confirm.ts': {
      lines: 85,
      statements: 80,
    },
    './lib/imports/fileHash.ts': {
      lines: 90,
      statements: 90,
    },
    './lib/validation/schemas/targetsImport.ts': {
      lines: 95,
      statements: 95,
    },
  },
};

module.exports = config;
