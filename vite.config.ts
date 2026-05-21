import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import netlify from '@netlify/vite-plugin-tanstack-start'

export default defineConfig({
  plugins: [
    tanstackStart(),
    netlify(),
    react(),
  ],
})