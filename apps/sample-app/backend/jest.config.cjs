/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@branded/schemas$": "<rootDir>/../packages/schemas/src/index.ts",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.json",
        diagnostics: {
          ignoreDiagnostics: [151002],
        },
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],
};
