import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// './' → chạy được trên GitHub Pages (project site) và preview local
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
})
