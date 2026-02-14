module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**'
  ],
  transform: {
    '^.+\\.[tj]sx?$': 'ts-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(inquirer)/)'
  ],
  moduleNameMapper: {
    // server.ts imports with .js extensions (for Node16/ESM resolution at runtime).
    // ts-jest resolves .ts files, so strip .js → .ts for local imports.
    '^(\\.\\.?/.*)\\.js$': '$1'
  },
  coverageThreshold: {
    './src/providers/': {
      statements: 80,
      branches: 70,
    },
    './src/mcp/': {
      statements: 60,
      branches: 50,
    },
  },
};
