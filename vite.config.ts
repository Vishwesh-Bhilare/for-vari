import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] },
      manifest: {
        name: 'Pandharpur Vari Companion',
        short_name: 'Vari',
        description: 'Offline-first crowd, lending, lost-found, and SOS companion for Pandharpur Vari.',
        theme_color: '#f97316',
        background_color: '#fff7ed',
        display: 'standalone',
        icons: [{ src: '/vite.svg', sizes: '192x192', type: 'image/svg+xml' }]
      }
    })
  ]
});
