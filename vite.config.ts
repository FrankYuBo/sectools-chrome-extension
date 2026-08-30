import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@': import.meta.dirname + '/src',
    },
  },
  build: {
    target: 'es2022',
    // Chrome 扩展 MV3 中，同一 chunk 可能被 popup (extension world) 与 content script (isolated world)
    // 共享，Vite 默认注入的 <link rel="modulepreload"> 会触发 "cross-world extension resource mismatch"
    // 警告（虽然只是警告，不影响功能，但不美观）。这里关闭自动注入 modulepreload。
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: import.meta.dirname + '/src/popup/index.html',
        settings: import.meta.dirname + '/src/settings-page/index.html',
      },
    },
  },
  test: {
    // 编码解码需要 DOMParser，使用 jsdom 环境；crypto.subtle 缺失则在 crypto-hash.test.ts 里手动 polyfill
    environment: 'jsdom',
    globals: true,
  },
});
