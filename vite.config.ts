import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// import { VitePWA } from 'vite-plugin-pwa' // DISABLED - causing auto-reload issues

// Generate a build timestamp to force cache invalidation
const buildTimestamp = new Date().getTime();

// https://vite.dev/config/
export default defineConfig({
  // Add build timestamp as global variable
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
  build: {
    // Enable code splitting and optimization
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libraries
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'mui-core': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
          'crypto': ['@noble/ciphers', '@noble/hashes', '@noble/post-quantum'],
        },
      },
    },
    // Increase chunk size warning limit since we're splitting chunks
    chunkSizeWarningLimit: 1000,
    // Enable minification with terser
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console methods for error debugging
        drop_debugger: true, // Remove debugger statements
        passes: 2, // Multiple passes for better compression
        pure_funcs: [], // TEMPORARILY KEEP ALL CONSOLE LOGS FOR DEBUGGING
      },
      mangle: {
        safari10: true, // Fix Safari 10 bugs
      },
      format: {
        comments: false, // Remove all comments
      },
    },
    // Source maps for production debugging (optional, can be disabled)
    sourcemap: false,
  },
  plugins: [
    react(),
    // VitePWA plugin disabled - was causing constant page reloads
    // Issues: skipWaiting: true + 60s update checks + auto-reload on controller change
    // To re-enable: uncomment import above and VitePWA() config below
  ],
})
