import { defineConfig } from "eslint/config"
import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default defineConfig(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "packages/demo/dist/**",
      "commitlint.config.cjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowRegExp: true,
        },
      ],
    },
  },
  {
    files: ["src/**/*.test.ts", "scripts/**/*.ts", "*.config.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowRegExp: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: ["packages/demo/**/*.ts", "packages/demo/**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "./packages/demo/tsconfig.json",
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowRegExp: true,
        },
      ],
    },
  },
)
