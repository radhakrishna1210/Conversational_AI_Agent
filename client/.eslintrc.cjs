// Vite react-ts template config. The `lint` script in package.json has always
// invoked eslint with these flags, but no eslint dependency or config was ever
// committed, so the script exited "'eslint' is not recognized" — the gate was
// never evaluable. This makes it evaluable; it does not make it strict.
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'vite.config.ts'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
};
