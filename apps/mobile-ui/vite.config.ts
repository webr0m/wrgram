import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);
const cld3 = require.resolve('cld3-asm');
const wasmLoader = createRequire(cld3).resolve('emscripten-wasm-loader');
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    // The ESM wrapper calls its runtime namespace as a function. Use the CJS entry
    // with the package's browser runtime instead.
    alias: [
      { find: /^cld3-asm$/, replacement: cld3 },
      { find: /^emscripten-wasm-loader$/, replacement: wasmLoader },
    ],
  },
  build: { target: 'chrome100', sourcemap: false },
  server: { strictPort: true, fs: { deny: ['**/.env', '**/.env.*', '**/.private/**', '**/*.jks', '**/*.keystore', '**/upload.properties', '**/tdlib-key.v1'] } },
});
