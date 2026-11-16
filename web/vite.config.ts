/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const proxy = {
  '/api': 'http://localhost:8000',
  '/media': 'http://localhost:8000',
}

// `--mode tablet` serves over HTTPS to the whole Wi-Fi network, so a real tablet can use the microphone,
// work offline and be installed (browsers allow those only on HTTPS or on the machine itself).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'tablet' ? [basicSsl({ name: 'milh-tablet', domains: ['*'] })] : []),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Milh',
        short_name: 'Milh',
        description: 'Desert farm operations',
        theme_color: '#1F5C45',
        background_color: '#EAD9B5',
        display: 'standalone',
        orientation: 'landscape',
        icons: [{ src: '/milh.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webp,mp3,wav,json,csv}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/media/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 31536000 } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy,
    host: mode === 'tablet' ? true : undefined,
  },
  preview: {
    proxy,
    host: mode === 'tablet' ? true : undefined,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}))
