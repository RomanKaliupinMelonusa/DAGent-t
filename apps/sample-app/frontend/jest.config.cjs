// =============================================================================
// Jest Configuration — Frontend unit tests
// =============================================================================

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: false }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.css$": "<rootDir>/src/__tests__/__mocks__/styleMock.js",
  },
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
};
