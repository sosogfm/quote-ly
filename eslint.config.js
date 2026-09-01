import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `dist` is build output; the Supabase integration files are auto-generated.
  {
    ignores: [
      "dist",
      "src/integrations/supabase/client.ts",
      "src/integrations/supabase/types.ts",
      "src/integrations/supabase/previewAuthStorage.ts",
    ],
  },

  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Legacy code uses `any` in Supabase row mappings; keep it visible but non-blocking.
      "@typescript-eslint/no-explicit-any": "warn",
      // shadcn/ui generates pass-through interfaces with no extra members.
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    // Tooling configs run in Node and legitimately use require().
    files: ["*.config.{ts,js}", "**/*.config.{ts,js}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);

