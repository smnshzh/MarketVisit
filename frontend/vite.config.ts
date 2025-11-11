import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // Allow external connections
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'survey.dbaraka.shop',
      '.dbaraka.shop', // Allow all subdomains
    ],
    proxy: {
      '/api': {
        // در production روی Cloudflare اجرا می‌شود
        target: 'https://survey-backend.dbaraka.shop',
        changeOrigin: true,
        secure: true,
        ws: true, // برای WebSocket support
      },
    },
  },
})

