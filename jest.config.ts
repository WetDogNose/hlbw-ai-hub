import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/scripts/swarm/__tests__/",
    "<rootDir>/scripts/swarm/runner/__tests__/",
  ],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
};

export default config;
