/** Configuration ESLint racine — s'applique à tout le monorepo. */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: false,
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/dist-main/**",
    "**/.next/**",
    "**/build/**",
    "**/*.sqlite",
  ],
  rules: {
    // Autorise les exports de type "namespace" utilisés par domain/src/index.ts.
    "@typescript-eslint/no-namespace": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      env: { node: true },
    },
  ],
};
