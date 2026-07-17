import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5190,
    proxy: { '/api': 'http://localhost:3006' }
  }
})
