import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const webRoot = fileURLToPath(new URL('.', import.meta.url));

const apiProxyTarget =
  process.env.VITE_DEV_API_PROXY ?? 'http://127.0.0.1:3010';

/** Match apps/web/nginx.conf so dev (Vite) has the same clickjacking protection. */
const webSecurityHeaders = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(webRoot, './src'),
      '@tele-pendant/shared': path.resolve(
        webRoot,
        '../../packages/shared/src/index.ts',
      ),
    },
  },
  server: {
    host: process.env.VITE_DEV_API_PROXY ? '0.0.0.0' : '127.0.0.1',
    port: 5173,
    headers: webSecurityHeaders,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/hmi-assets': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    headers: webSecurityHeaders,
  },
  test: {
    env: {
      NODE_ENV: 'test',
    },
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
    testTimeout: 30_000,
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/test/**',
        'src/**/*.d.ts',
        'src/**/*.{test,spec}.{ts,tsx}',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
