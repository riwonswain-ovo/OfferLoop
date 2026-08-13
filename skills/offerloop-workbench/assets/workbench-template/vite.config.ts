import path from 'path';
import type { OutputAsset, OutputBundle } from 'rollup';
import type { Plugin } from 'vite';
import { defineConfig } from '@lark-apaas/fullstack-vite-preset';

const nonBlockingStylesPlugin = (): Plugin => ({
  name: 'offerloop-non-blocking-styles',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle: OutputBundle): void {
    for (const [fileName, output] of Object.entries(bundle)) {
      if (!fileName.endsWith('.html') || output.type !== 'asset') {
        continue;
      }
      const asset: OutputAsset = output;
      const source: string =
        typeof asset.source === 'string'
          ? asset.source
          : Buffer.from(asset.source).toString('utf8');
      asset.source = source.replace(
        "document.write('<link rel=\"stylesheet\" href=\"' + finalUrl + '\">');",
        "var link=document.createElement('link');"
        + "link.rel='stylesheet';"
        + 'link.href=finalUrl;'
        + 'document.head.appendChild(link);',
      );
    }
  },
});

export default defineConfig({
  plugins: [nonBlockingStylesPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
});
