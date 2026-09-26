import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // A leading underscore marks a binding that is unused on purpose, e.g.
      // `const { search: _search, ...rest }` to drop a key.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "blob-report/**",
      "playwright/.cache/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
