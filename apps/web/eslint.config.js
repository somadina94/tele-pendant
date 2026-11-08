import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Keep classic hooks rules only; Compiler rules (purity/refs/set-state-in-effect)
      // need a dedicated pass and currently fail across the existing Operator UI.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'useTour',
            'readTourEnabled',
            'writeTourEnabled',
            'useSidebar',
            'buttonVariants',
            'badgeVariants',
            'screenFromPath',
            'useControlLease',
            'mergeControlLease',
          ],
        },
      ],
    },
  },
);
