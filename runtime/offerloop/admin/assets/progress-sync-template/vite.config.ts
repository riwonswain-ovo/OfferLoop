import path from 'path';
import { defineConfig } from '@lark-apaas/fullstack-vite-preset';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
});
