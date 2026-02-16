import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Generate build timestamp for cache busting
const buildTimestamp = Date.now().toString();

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    // Make build timestamp available in the app
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
  server: {
    // Only bind to all interfaces when explicitly enabled (for mobile testing)
    // Default to localhost for security
    // Bind to all interfaces to allow LAN access for debugging
    host: '0.0.0.0',
    port: 5173,
    // Only allow tunneling when explicitly enabled
    allowedHosts: true,
    proxy: {
      // Proxy stats API to local backend during development
      '/api/stats': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Proxy Apple Music RSS to avoid CORS issues
      '/api/apple-music': {
        target: 'https://rss.marketingtools.apple.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/apple-music/, ''),
      },
      // Proxy MusicBrainz API to avoid CORS issues
      '/api/musicbrainz': {
        target: 'https://musicbrainz.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/musicbrainz/, ''),
      },
      // Proxy Cover Art Archive
      '/api/coverart': {
        target: 'https://coverartarchive.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/coverart/, ''),
      },
      // Proxy Odesli API
      '/api/odesli': {
        target: 'https://api.song.link',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/odesli/, ''),
      },
      // Proxy Muspy RSS feed
      '/api/muspy-rss': {
        target: 'https://muspy.com',
        changeOrigin: true,
        rewrite: (path) => {
          // Extract the actual Muspy URL from the query parameter
          const url = new URL(path, 'http://localhost')
          const muspyUrl = url.searchParams.get('url')
          if (muspyUrl) {
            const parsed = new URL(muspyUrl)
            return parsed.pathname + parsed.search
          }
          return '/feed'
        },
      },
    },
  },
  plugins: [
    {
      name: 'remote-console-logger',
      configureServer(server) {
        server.middlewares.use('/__debug', (req, res, next) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString() });
            req.on('end', () => {
              try {
                const { type, args } = JSON.parse(body);
                const timestamp = new Date().toLocaleTimeString();
                // Colorize output if possible, or just print
                console.log(`[📱Client ${timestamp}] [${type.toUpperCase()}]`, ...args);
              } catch (e) {
                console.error('Failed to parse client log', e);
              }
              res.statusCode = 200;
              res.end();
            });
          } else {
            next();
          }
        });
      }
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-180x180.png', 'icons/icon-192x192.png', 'icons/icon-512x512.png'],
      manifest: {
        name: 'Tunetuna',
        short_name: 'Tunetuna',
        description: 'A lightweight music client for Jellyfin',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        cacheId: `tunetuna-${buildTimestamp}`,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Audio streams should strictly be NetworkOnly to avoid Service Worker buffering/Range header issues on iOS
            urlPattern: /\/Audio\/.*\/stream/,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'audio-streams',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 1
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutes
              }
            }
          }
        ]
      }
    })
  ],
})


