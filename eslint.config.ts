import { defineConfig } from "eslint/config"
import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default defineConfig(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
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
    files: ["tests/**/*.ts", "scripts/**/*.ts", "*.config.ts"],
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
    },
  },
)
