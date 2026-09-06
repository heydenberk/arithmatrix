import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  // Project page served at /arithmatrix/
  base: '/arithmatrix/',
  esbuild: {
    /*
     * Strip debug logging from production. console.error survives so genuine
     * failures still reach the console (and the local error log); the ~48
     * console.log calls are development narration and should not ship.
     */
    drop: ['debugger'],
    pure: ['console.log', 'console.debug', 'console.info'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon-180x180.png',
        'icon.svg',
        'pwa-64x64.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon-512x512.png',
        'screenshot-narrow.png',
        'screenshot-wide.png',
      ],
      manifest: {
        id: '/arithmatrix/',
        name: 'Arithmatrix',
        short_name: 'Arithmatrix',
        description: 'A challenging mathematical puzzle game with cage-based operations',
        theme_color: '#667eea',
        background_color: '#667eea',
        display: 'standalone',
        orientation: 'any',
        scope: '/arithmatrix/',
        start_url: '/arithmatrix/',
        icons: [
          {
            src: '/arithmatrix/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/arithmatrix/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/arithmatrix/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/arithmatrix/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: '/arithmatrix/screenshot-narrow.png',
            sizes: '540x960',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Arithmatrix puzzle game on mobile',
          },
          {
            src: '/arithmatrix/screenshot-wide.png',
            sizes: '1024x576',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Arithmatrix puzzle game on desktop',
          },
        ],
      },
      workbox: {
        // Exclude large puzzle data from precache
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Cache puzzle data at runtime
        runtimeCaching: [
          {
            urlPattern: /\.jsonl$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'puzzle-data-cache',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
    host: true,
  },
});
