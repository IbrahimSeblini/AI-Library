import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/judge-api': {
        target: 'http://localhost:8140',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/judge-api/, ''),
      },
    },
  },
})
