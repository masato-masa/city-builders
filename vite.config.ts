import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
// vite の defineConfig は test フィールドを知らないので、vitest 側から取る。
import { defineConfig } from 'vitest/config';

// GitHub Pages はリポジトリ名のサブパスで配信される。ここを変えるとビルド後の
// アセット参照が全部壊れるので、リポジトリ名と必ず一致させること。
export default defineConfig({
  base: '/city-builders/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['__tests__/**/*.test.ts'],
    // CPU の強さを測るテストは数十試合を回すので、既定の 5 秒では足りない。
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
