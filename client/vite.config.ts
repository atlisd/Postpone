import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' so the new worker waits until the user clicks Update in the
      // toast; the app calls updateSW(true) (see hooks/useVersionCheck.ts),
      // which skipWaitings and reloads once on controllerchange.
      registerType: 'prompt',
      // We register via the virtual module in useVersionCheck, so don't also
      // inject the bare registerSW.js script.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Postpone',
        short_name: 'Postpone',
        description: 'A general purpose task manager',
        theme_color: '#fafafa',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/app/today',
        scope: '/',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/hubs/],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/hubs': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
