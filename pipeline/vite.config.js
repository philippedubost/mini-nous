import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_PORT = Number(process.env.VITE_PORT) || 3400
const API_PORT = Number(process.env.MINI_NOUS_API_PORT) || 3333

export default defineConfig({
  base: '/pipeline/',
  plugins: [react()],
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: DEV_PORT,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true },
    },
  },
})
