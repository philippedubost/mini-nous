import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Sous-app React servie sous /pipeline — config et .env à la racine du monorepo.
// En dev complet : npm run dev (racine, vercel dev). Ce script seul = front + proxy /api → :3000.
export default defineConfig({
  base: '/pipeline/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
