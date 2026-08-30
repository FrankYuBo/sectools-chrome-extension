module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    browser: true,
    es2022: true,
    webextensions: true,
  },
  rules: {
    // TypeScript 已通过 tsc --strict 校验，ESLint 不重复报 unused
    '@typescript-eslint/no-unused-vars': 'off',
    // 允许 any（Chrome API 类型不完整时需要）
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js'],
};
