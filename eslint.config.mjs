import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    // Generated, vendored or build output is never linted.
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "frontend/bindings/**",
      "build/bin/**",
      "bin/**",
      ".task/**",
      ".husky/_/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  {
    // Node-side config files and tooling scripts.
    files: ["*.config.{js,mjs,cjs,ts}", "**/*.config.{js,mjs,cjs,ts}"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
    },
  },

  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"], reactRefresh.configs.vite],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  {
    // shadcn/ui generated components also export helpers (buttonVariants and
    // friends); fast-refresh-only-component exports don't apply to them.
    files: ["frontend/src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);
