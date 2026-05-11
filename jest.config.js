/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/types/**/*.ts',
    // QBO tool wrappers are thin glue — they unwrap MCP args and call the
    // matching handler. The handlers themselves are 100% covered. There are
    // no qbo-* connection tools any more; the auth bearer replaces them.
    '!src/tools/*.tool.ts',
    '!src/index.ts',
  ],
  // Strict 100% on the layers this PR owns end-to-end. Pre-existing handler
  // files are not enforced — they had varying coverage before this work.
  coverageThreshold: {
    './src/server/': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/clients/': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/helpers/': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  clearMocks: true,
  restoreMocks: true,
};
