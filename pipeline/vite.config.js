import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_PORT = Number(process.env.MINI_NOUS_API_PORT) || 3335

export default defineConfig({
  base: '/pipeline/',
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT) || 3400,
    strictPort: false,
    proxy: {
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true },
    },
  },
})
