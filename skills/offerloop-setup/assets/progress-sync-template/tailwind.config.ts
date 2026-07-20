import { createTailwindPresetOfSimple } from '@lark-apaas/fullstack-presets';

export default {
  presets: [createTailwindPresetOfSimple()],
  content: [
    './client/src/**/*.{ts,tsx,css}',
  ],
  plugins: [],
}