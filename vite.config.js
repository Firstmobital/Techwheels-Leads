import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  // Keep standard dev output so the Local/Network URLs are shown.
  logLevel: 'info',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
  ]
});
