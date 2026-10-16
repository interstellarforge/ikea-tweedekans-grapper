import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import eslint from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import { defineConfig } from "eslint/config";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["node_modules", ".expo", "dist", "*.config.js", "app.config.ts"],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  eslintReact.configs["strict-type-checked"],
  comments.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",
      "@eslint-community/eslint-comments/no-use": [
        "warn",
        {
          allow: [
            "eslint-disable-next-line",
            "eslint-disable",
            "eslint-enable",
          ],
        },
      ],
      "@eslint-community/eslint-comments/require-description": "warn",
    },
  },
);
