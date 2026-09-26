import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // A React Compiler rule that arrived with eslint-config-next 16, after
    // this code was written. Some hits are deliberate (reading localStorage
    // or rolling a random value after hydration, so server and client HTML
    // match); others are worth refactoring. Warn until they are sorted out
    // rather than fail every lint run on them.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "coverage/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
  ]),
]);
