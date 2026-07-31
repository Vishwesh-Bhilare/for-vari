import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { 
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'] 
      },
      manifest: {
        name: 'Pandharpur Vari Companion',
        short_name: 'Vari',
        description: 'Offline-first crowd, lending, lost-found, and SOS companion for Pandharpur Vari.',
        theme_color: '#E8832D',
        background_color: '#FDF8F3',
        display: 'standalone',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  css: {
    postcss: './postcss.config.js',
  },
});
