const { stylelintPresetsOfSimple } = require('@lark-apaas/fullstack-presets');

module.exports = {
  extends: [ stylelintPresetsOfSimple ],
  ignoreFiles: [
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '*.min.css',
  ],
};
