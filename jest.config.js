/** @type {import('jest').Config} */
const config = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/e2e/",
    "<rootDir>/scripts/release-readiness.test.mjs",
    "<rootDir>/scripts/staging-rehearsal.test.mjs",
    "<rootDir>/scripts/go-live-evidence.test.mjs",
    "<rootDir>/scripts/production-verification.test.mjs",
    "<rootDir>/scripts/release-closure-evidence.test.mjs",
    "<rootDir>/scripts/legacy-retirement-evidence.test.mjs",
    "<rootDir>/scripts/reporting-controlled-rollout.test.mjs",
  ],
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.stories.{ts,tsx}",
    "!src/app/**",
  ],
  coverageReporters: ["text-summary", "json-summary"],
  coverageThreshold: {
    global: {
      statements: 30,
      branches: 24,
      functions: 22,
      lines: 30,
    },
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
};

module.exports = config;
