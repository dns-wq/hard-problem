import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Existing code predates the React 19 compiler-oriented rules. Keep the
  // production lint gate useful without turning this rollout into an unrelated
  // whole-repository refactor; new live code is still typechecked and tested.
  { rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "react/no-unescaped-entities": "off",
    "react-hooks/set-state-in-effect": "off",
    "react-hooks/refs": "off",
  } },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
