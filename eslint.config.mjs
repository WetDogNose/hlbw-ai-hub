import js from "@eslint/js";
import ts from "typescript-eslint";

export default ts.config(
  {
    // Global ignores
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "tmp/**",
      "logs/**",
      ".venv/**",
      "coverage/**",
      "**/*.js", // Ignore all JS files for now to reduce noise from generated/legacy code
      "**/*.mjs",
      "**/*.cjs"
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "off", // Many scripts use require
      "no-undef": "off", // TypeScript handles this
      "prefer-const": "warn",
      "no-control-regex": "off", // Needed for docker log cleaning
      "no-empty": "off", // Many catch-and-ignore blocks in the swarm logic
    },
  }
);
