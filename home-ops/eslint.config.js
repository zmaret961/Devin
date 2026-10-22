import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const motionRule = {
  name: 'framer-motion',
  importNames: ['motion'],
  message: 'Use `m` (LazyMotion is set up in main.tsx).',
};

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // UI code must stay backend-agnostic: talk to `src/services`, never to Supabase directly.
      'no-restricted-imports': [
        'error',
        {
          paths: [motionRule, { name: '@supabase/supabase-js', message: 'Import data functions from src/services instead.' }],
          patterns: [{ group: ['**/services/supabase/*', '**/services/local/*'], message: 'Import from src/services (the public service layer) instead.' }],
        },
      ],
    },
  },
  {
    files: ['src/services/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: [motionRule] }],
    },
  },
);
