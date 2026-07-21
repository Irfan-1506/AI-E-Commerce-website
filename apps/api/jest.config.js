/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  setupFiles: ['<rootDir>/test/jest-setup.ts'],
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      setupFiles: ['<rootDir>/test/jest-setup.ts'],
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      setupFiles: ['<rootDir>/test/jest-setup.ts'],
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      // Integration tests share a real DB/Redis and hit real HTTP handlers —
      // run them one file at a time to avoid cross-test data races.
      maxWorkers: 1,
    },
  ],
};
