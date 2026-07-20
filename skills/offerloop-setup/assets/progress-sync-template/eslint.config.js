const tseslint = require('typescript-eslint');
const { eslintPresetsOfSimple } = require('@lark-apaas/fullstack-presets');

module.exports = tseslint.config(
  { ignores: ['dist', 'dist-server', 'node_modules', 'client/src/api/gen', '**/*.d.ts', '**/*.js.map'] },
  // Client configuration
  {
    files: ['client/**/*.{ts,tsx}', 'shared/**/*.{ts,tsx}'],
    extends: [
      ...eslintPresetsOfSimple.client,
    ],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.app.json',
      },
    },
    settings: {
      'import/resolver': {
        alias: {
          map: [
            ['@', './client/src'],
            ['@client', './client'],
            ['@shared', './shared'],
          ],
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
  },
  // Server configuration
  {
    files: ['server/**/*.{ts,tsx}', 'shared/**/*.{ts,tsx}'],
    extends: [
      ...eslintPresetsOfSimple.server,
    ],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.node.json',
      }
    },
    settings: {
      'import/resolver': {
        alias: {
          map: [['@server', './server'], ['@shared', './shared']],
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      }
    }
  },
);
