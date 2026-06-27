import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const DEV_PORT = Number(process.env.VITE_PORT) || 3400
const API_PORT = Number(process.env.MINI_NOUS_API_PORT) || 3333

export default defineConfig({
  base: '/',
  plugins: [react()],
  logLevel: 'error',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        server: resolve(__dirname, 'server.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: DEV_PORT,
    strictPort: true,
    hmr: {
      host: 'localhost',
      clientPort: API_PORT,
    },
    proxy: {
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true },
    },
  },
})
