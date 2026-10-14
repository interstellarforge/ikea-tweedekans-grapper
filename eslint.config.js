import eslint from "@eslint/js";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import eslintReact from "@eslint-react/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";
import vitest from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: [".next", "data", "node_modules", "next-env.d.ts", "public"] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  eslintReact.configs["strict-type-checked"],
  jsxA11y.flatConfigs.strict,
  nextPlugin.configs["core-web-vitals"],
  comments.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js"],
        },
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
  {
    // The config file imports untyped plugins; type-aware rules add nothing there.
    files: ["eslint.config.js"],
    extends: [
      tseslint.configs.disableTypeChecked,
      eslintReact.configs["disable-type-checked"],
    ],
  },
  {
    files: ["**/*.test.ts"],
    ...vitest.configs.all,
  },
  {
    // Next.js requires default exports for pages, layouts and config.
    files: ["src/app/**/{page,layout,not-found}.tsx", "next.config.ts"],
    rules: { "import/no-default-export": "off" },
  },
);
