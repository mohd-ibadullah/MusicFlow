import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5000,
    host: '0.0.0.0',
    allowedHosts: true,
    open: false,
    proxy: {
      // Use 127.0.0.1 so the dev proxy does not depend on localhost → ::1 vs IPv4 resolution (common on Windows).
      '/api': {
        target: 'http://127.0.0.1:4002',
        changeOrigin: true,
        secure: false
      },
      '/socket.io': {
        target: 'http://127.0.0.1:4002',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router-dom/')
            ) {
              return 'react-vendor'
            }

            if (id.includes('/axios/')) {
              return 'utils'
            }
          }

          return undefined
        }
      }
    }
  }
})
