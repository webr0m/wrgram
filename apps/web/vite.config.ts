import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { parseTelegramAppCredentials } from '../../packages/telegram/src/credentials.ts';

const envDir = fileURLToPath(new URL('../../', import.meta.url));

function localTelegramConfiguration(mode: string): Plugin {
  return {
    name: 'wrgram-local-telegram-configuration',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__wrgram/telegram/config', (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        const host = request.headers.host;
        const origin = request.headers.origin;
        if (request.method !== 'GET' || !['127.0.0.1:5173', 'localhost:5173'].includes(host ?? '') ||
          (origin && origin !== `http://${host}`)) {
          response.statusCode = 403;
          response.end(JSON.stringify({ message: 'Solo disponible en el servidor local de desarrollo.' }));
          return;
        }
        try {
          const env = loadEnv(mode, envDir, 'TELEGRAM_');
          const credentials = parseTelegramAppCredentials(env.TELEGRAM_API_ID, env.TELEGRAM_API_HASH);
          response.end(JSON.stringify(credentials));
        } catch {
          response.statusCode = 503;
          response.end(JSON.stringify({ message: 'Configura TELEGRAM_API_ID y TELEGRAM_API_HASH en el .env de la raíz.' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  envDir,
  plugins: [react(), localTelegramConfiguration(mode)],
  optimizeDeps: { exclude: ['@mtcute/wasm'] },
  server: {
    port: 5173, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3001', rewrite: (path) => path.replace(/^\/api/, '') } },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
    },
  },
}));
